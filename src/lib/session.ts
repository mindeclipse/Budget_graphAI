import { timingSafeEqual } from "./security";

const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 днів

function getSecretKey(): string {
  const secret = process.env.APP_API_SECRET || process.env.APP_ACCESS_PIN;
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "[Critical Security Error] APP_API_SECRET or APP_ACCESS_PIN must be configured in production environment."
      );
    }
    return "dev_fallback_key_for_testing_purposes_only_32_bytes_min";
  }
  return secret;
}

function base64UrlEncode(str: string): string {
  const utf8Bytes = new TextEncoder().encode(str);
  let binary = "";
  for (let i = 0; i < utf8Bytes.length; i++) {
    binary += String.fromCharCode(utf8Bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function base64UrlDecode(str: string): string {
  let base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  while (base64.length % 4) {
    base64 += "=";
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function getCryptoKey(): Promise<CryptoKey> {
  const secret = getSecretKey();
  const enc = new TextEncoder();
  return await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

export interface SessionPayload {
  uid: string;
  iat: number;
  exp: number;
}

/**
 * Створює криптографічно підписаний HMAC-SHA256 токен сесії.
 * Формат токена: <payload_base64url>.<signature_base64url>
 */
export async function createSessionToken(
  userId: string = "owner"
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const payload: SessionPayload = {
    uid: userId,
    iat: now,
    exp: now + SESSION_TTL_SECONDS,
  };

  const payloadStr = JSON.stringify(payload);
  const encodedPayload = base64UrlEncode(payloadStr);

  const key = await getCryptoKey();
  const signatureBytes = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(encodedPayload)
  );

  const encodedSignature = bytesToBase64Url(new Uint8Array(signatureBytes));
  return `${encodedPayload}.${encodedSignature}`;
}

/**
 * Перевіряє валідність HMAC-SHA256 токена сесії.
 * Використовує постійне за часом порівняння для захисту від Timing Attacks.
 */
export async function verifySessionToken(
  token?: string | null
): Promise<{ valid: boolean; userId?: string }> {
  if (!token || typeof token !== "string") {
    return { valid: false };
  }

  const parts = token.split(".");
  if (parts.length !== 2) {
    return { valid: false };
  }

  const [encodedPayload, signature] = parts;

  try {
    const payloadStr = base64UrlDecode(encodedPayload);
    const payload: SessionPayload = JSON.parse(payloadStr);

    if (!payload.exp || typeof payload.exp !== "number") {
      return { valid: false };
    }

    const now = Math.floor(Date.now() / 1000);
    if (payload.exp < now) {
      // Сесія застаріла
      return { valid: false };
    }

    // Перевірка підпису через HMAC
    const key = await getCryptoKey();
    const expectedSigBytes = await crypto.subtle.sign(
      "HMAC",
      key,
      new TextEncoder().encode(encodedPayload)
    );
    const expectedSig = bytesToBase64Url(new Uint8Array(expectedSigBytes));

    if (!timingSafeEqual(signature, expectedSig)) {
      return { valid: false };
    }

    return { valid: true, userId: payload.uid };
  } catch {
    return { valid: false };
  }
}
