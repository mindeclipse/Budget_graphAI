import { timingSafeEqual } from "./security";

const VERIFIER_STORAGE_KEY = "budget_offline_pin_verifier";
const ATTEMPTS_STORAGE_KEY = "budget_offline_pin_attempts";

const PBKDF2_ITERATIONS = 100000;
const KEY_LENGTH_BITS = 256; // 32 байти
const MAX_OFFLINE_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 5 * 60 * 1000; // 5 хвилин

export interface OfflinePinVerifier {
  saltHex: string;
  hashHex: string;
  iterations: number;
  updatedAt: number;
}

export interface OfflinePinAttempts {
  count: number;
  lockedUntil: number;
}

/**
 * Конвертація Uint8Array у hex-рядок
 */
export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Конвертація hex-рядка у Uint8Array
 */
export function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) {
    throw new Error("Invalid hex string length");
  }
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/**
 * Обчислення криптографічного хешу PBKDF2 (SHA-256) за допомогою Web Crypto API
 */
export async function derivePinHash(
  pin: string,
  saltBytes: Uint8Array,
  iterations = PBKDF2_ITERATIONS
): Promise<string> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(pin),
    { name: "PBKDF2" },
    false,
    ["deriveBits"]
  );

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: saltBytes as unknown as BufferSource,
      iterations,
      hash: "SHA-256",
    },
    keyMaterial,
    KEY_LENGTH_BITS
  );

  return bytesToHex(new Uint8Array(derivedBits));
}

function getStorage(): Storage | null {
  if (typeof window !== "undefined" && window.localStorage) {
    return window.localStorage;
  }
  if (typeof localStorage !== "undefined") {
    return localStorage;
  }
  return null;
}

/**
 * Перевірка наявності збереженого офлайн-верифікатора
 */
export function hasOfflinePinVerifier(): boolean {
  const storage = getStorage();
  if (!storage) return false;
  try {
    const raw = storage.getItem(VERIFIER_STORAGE_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as OfflinePinVerifier;
    return Boolean(parsed.saltHex && parsed.hashHex);
  } catch {
    return false;
  }
}

/**
 * Збереження або оновлення локального криптографічного верифікатора PIN-коду.
 * Викликається автоматично після успішної онлайн-автентифікації.
 */
export async function setupOfflinePinVerifier(pin: string): Promise<void> {
  const storage = getStorage();
  if (!storage || !pin) return;

  try {
    // Генерація 16 випадкових криптографічних байтів солі
    const saltBytes = crypto.getRandomValues(new Uint8Array(16));
    const saltHex = bytesToHex(saltBytes);

    // Обчислення PBKDF2 хешу
    const hashHex = await derivePinHash(pin, saltBytes, PBKDF2_ITERATIONS);

    const verifier: OfflinePinVerifier = {
      saltHex,
      hashHex,
      iterations: PBKDF2_ITERATIONS,
      updatedAt: Date.now(),
    };

    storage.setItem(VERIFIER_STORAGE_KEY, JSON.stringify(verifier));
  } catch (err) {
    console.error("[OfflinePin] Failed to save offline PIN verifier:", err);
  }
}

/**
 * Отримання поточного стану спроб входу та блокування
 */
function getAttemptsState(): OfflinePinAttempts {
  const storage = getStorage();
  if (!storage) {
    return { count: 0, lockedUntil: 0 };
  }
  try {
    const raw = storage.getItem(ATTEMPTS_STORAGE_KEY);
    if (!raw) return { count: 0, lockedUntil: 0 };
    return JSON.parse(raw);
  } catch {
    return { count: 0, lockedUntil: 0 };
  }
}

/**
 * Збереження стану спроб
 */
function saveAttemptsState(state: OfflinePinAttempts): void {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.setItem(ATTEMPTS_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ігноруємо помилки квоти сховища
  }
}

/**
 * Скидання лічильника спроб (після успішного входу)
 */
export function resetOfflinePinAttempts(): void {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.removeItem(ATTEMPTS_STORAGE_KEY);
  } catch {
    // ignore
  }
}

/**
 * Повне очищення офлайн-верифікатора (при явному виході з акаунта)
 */
export function clearOfflinePinVerifier(): void {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.removeItem(VERIFIER_STORAGE_KEY);
    storage.removeItem(ATTEMPTS_STORAGE_KEY);
  } catch {
    // ignore
  }
}

/**
 * Верифікація PIN-коду в офлайн-режимі.
 * Включає перевірку блокування від перебору (lockout),
 * прогресивну затримку та константне за часом порівняння.
 */
export async function verifyOfflinePin(
  pin: string
): Promise<{ success: boolean; error?: string }> {
  const storage = getStorage();
  if (!storage) {
    return {
      success: false,
      error: "Офлайн-вхід недоступний у цьому середовищі",
    };
  }

  // 1. Перевірка наявності налаштованого офлайн-верифікатора
  let verifier: OfflinePinVerifier | null = null;
  try {
    const raw = storage.getItem(VERIFIER_STORAGE_KEY);
    if (raw) verifier = JSON.parse(raw);
  } catch {
    verifier = null;
  }

  if (!verifier || !verifier.saltHex || !verifier.hashHex) {
    return {
      success: false,
      error:
        "Офлайн-вхід ще не налаштовано. Будь ласка, увійдіть один раз із доступом до мережі.",
    };
  }

  // 2. Перевірка блокування від перебору (Brute-Force Lockout)
  const now = Date.now();
  const attempts = getAttemptsState();

  if (attempts.lockedUntil > now) {
    const remainingSec = Math.ceil((attempts.lockedUntil - now) / 1000);
    const remainingMin = Math.ceil(remainingSec / 60);
    return {
      success: false,
      error: `Забагато невірних спроб. Спробуйте через ${remainingMin} хв.`,
    };
  }

  // Якщо термін блокування минув, скидаємо лічильник
  if (attempts.lockedUntil > 0 && attempts.lockedUntil <= now) {
    attempts.count = 0;
    attempts.lockedUntil = 0;
    saveAttemptsState(attempts);
  }

  try {
    // 3. Обчислення хешу введеного PIN
    const saltBytes = hexToBytes(verifier.saltHex);
    const calculatedHash = await derivePinHash(
      pin,
      saltBytes,
      verifier.iterations || PBKDF2_ITERATIONS
    );

    // 4. Константне за часом порівняння (захист від Timing Attacks)
    const isValid = timingSafeEqual(calculatedHash, verifier.hashHex);

    if (isValid) {
      // Успішний вхід: скидаємо лічильник помилок
      resetOfflinePinAttempts();
      return { success: true };
    }

    // 5. Невірний PIN: збільшуємо лічильник спроб та додаємо штучну затримку
    attempts.count += 1;

    // Прогресивна затримка для сповільнення автоматизованих атак (400мс, 800мс...)
    await new Promise((resolve) =>
      setTimeout(resolve, Math.min(attempts.count * 400, 1500))
    );

    if (attempts.count >= MAX_OFFLINE_ATTEMPTS) {
      attempts.lockedUntil = now + LOCKOUT_DURATION_MS;
      saveAttemptsState(attempts);
      return {
        success: false,
        error: "Забагато невірних спроб. Вхід заблоковано на 5 хвилин.",
      };
    }

    saveAttemptsState(attempts);
    const left = MAX_OFFLINE_ATTEMPTS - attempts.count;
    return {
      success: false,
      error: `Невірний PIN-код. Залишилось спроб: ${left}`,
    };
  } catch (err) {
    console.error("[OfflinePin] Verification error:", err);
    return { success: false, error: "Помилка перевірки PIN-коду" };
  }
}
