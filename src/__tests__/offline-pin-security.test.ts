import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  derivePinHash,
  bytesToHex,
  hexToBytes,
  setupOfflinePinVerifier,
  hasOfflinePinVerifier,
  verifyOfflinePin,
  clearOfflinePinVerifier,
  resetOfflinePinAttempts,
} from "@/lib/offline-pin";

describe("Offline PIN Cryptographic Verification & Security", () => {
  // Локальний мок сховища localStorage
  let mockStorage: Record<string, string> = {};

  beforeEach(() => {
    mockStorage = {};
    vi.stubGlobal("localStorage", {
      getItem: vi.fn((key: string) => mockStorage[key] || null),
      setItem: vi.fn((key: string, value: string) => {
        mockStorage[key] = value;
      }),
      removeItem: vi.fn((key: string) => {
        delete mockStorage[key];
      }),
      clear: vi.fn(() => {
        mockStorage = {};
      }),
    });
    vi.clearAllMocks();
  });

  describe("Hex and Byte Utilities", () => {
    it("успішно конвертує байти в hex і назад без спотворення", () => {
      const original = new Uint8Array([0, 15, 16, 255, 128, 42]);
      const hex = bytesToHex(original);
      expect(hex).toBe("000f10ff802a");

      const converted = hexToBytes(hex);
      expect(Array.from(converted)).toEqual(Array.from(original));
    });

    it("викидає помилку при некоректній непарній довжині hex-рядка", () => {
      expect(() => hexToBytes("abc")).toThrow("Invalid hex string length");
    });
  });

  describe("PBKDF2 Web Crypto Derivation", () => {
    it("детерміновано обчислює однаковий 256-бітний хеш для однакового PIN та солі", async () => {
      const salt = new Uint8Array([
        1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16,
      ]);
      const hash1 = await derivePinHash("1234", salt, 1000);
      const hash2 = await derivePinHash("1234", salt, 1000);

      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64); // 32 байти * 2 символи = 64 hex символи
    });

    it("генерує кардинально різні хеші при зміні хоча б однієї цифри PIN", async () => {
      const salt = new Uint8Array(16).fill(42);
      const hashA = await derivePinHash("1234", salt, 1000);
      const hashB = await derivePinHash("1235", salt, 1000);

      expect(hashA).not.toBe(hashB);
    });

    it("генерує різні хеші для однакового PIN за рахунок унікальної криптографічної солі", async () => {
      const saltA = new Uint8Array(16).fill(1);
      const saltB = new Uint8Array(16).fill(2);
      const hashA = await derivePinHash("0000", saltA, 1000);
      const hashB = await derivePinHash("0000", saltB, 1000);

      expect(hashA).not.toBe(hashB);
    });
  });

  describe("Setup & Storage Lifecycle", () => {
    it("hasOfflinePinVerifier повертає false, коли верифікатор ще не створено", () => {
      expect(hasOfflinePinVerifier()).toBe(false);
    });

    it("setupOfflinePinVerifier створює стійкий запис верифікатора в localStorage", async () => {
      await setupOfflinePinVerifier("9876");

      expect(hasOfflinePinVerifier()).toBe(true);
      const raw = mockStorage["budget_offline_pin_verifier"];
      expect(raw).toBeDefined();

      const parsed = JSON.parse(raw);
      expect(parsed.saltHex).toHaveLength(32); // 16 байт = 32 hex символи
      expect(parsed.hashHex).toHaveLength(64); // 32 байти = 64 hex символи
      expect(parsed.iterations).toBe(100000);
      expect(parsed.updatedAt).toBeGreaterThan(0);
    });

    it("clearOfflinePinVerifier повністю видаляє верифікатор та історію спроб при logout", async () => {
      await setupOfflinePinVerifier("1111");
      expect(hasOfflinePinVerifier()).toBe(true);

      mockStorage["budget_offline_pin_attempts"] = JSON.stringify({
        count: 2,
        lockedUntil: 0,
      });

      clearOfflinePinVerifier();

      expect(hasOfflinePinVerifier()).toBe(false);
      expect(mockStorage["budget_offline_pin_verifier"]).toBeUndefined();
      expect(mockStorage["budget_offline_pin_attempts"]).toBeUndefined();
    });
  });

  describe("Offline Verification & Brute-Force Rate Limiting", () => {
    beforeEach(async () => {
      await setupOfflinePinVerifier("5555");
    });

    it("повертає помилку, якщо верифікатор відсутній у сховищі", async () => {
      clearOfflinePinVerifier();
      const res = await verifyOfflinePin("5555");
      expect(res.success).toBe(false);
      expect(res.error).toContain("Офлайн-вхід ще не налаштовано");
    });

    it("успішно валідує правильний PIN-код", async () => {
      const res = await verifyOfflinePin("5555");
      expect(res.success).toBe(true);
      expect(res.error).toBeUndefined();
    });

    it("відхиляє невірний PIN-код та фіксує спробу", async () => {
      const res = await verifyOfflinePin("9999");
      expect(res.success).toBe(false);
      expect(res.error).toContain("Невірний PIN-код. Залишилось спроб: 4");

      const attempts = JSON.parse(mockStorage["budget_offline_pin_attempts"]);
      expect(attempts.count).toBe(1);
    });

    it("скидає лічильник невдалих спроб після успішного входу", async () => {
      // 1 невдала спроба
      await verifyOfflinePin("1234");
      expect(mockStorage["budget_offline_pin_attempts"]).toBeDefined();

      // Успішний вхід
      const successRes = await verifyOfflinePin("5555");
      expect(successRes.success).toBe(true);
      expect(mockStorage["budget_offline_pin_attempts"]).toBeUndefined();
    });

    it("блокує вхід (Lockout) на 5 хвилин після 5 невдалих спроб підряд", async () => {
      for (let i = 1; i <= 4; i++) {
        const res = await verifyOfflinePin("wrong");
        expect(res.success).toBe(false);
        expect(res.error).toContain(`Залишилось спроб: ${5 - i}`);
      }

      // 5-та невдала спроба
      const finalRes = await verifyOfflinePin("wrong");
      expect(finalRes.success).toBe(false);
      expect(finalRes.error).toContain("Вхід заблоковано на 5 хвилин");

      // Наступна спроба навіть із ПРАВИЛЬНИМ PIN блокується до завершення таймауту
      const blockedRes = await verifyOfflinePin("5555");
      expect(blockedRes.success).toBe(false);
      expect(blockedRes.error).toContain(
        "Забагато невірних спроб. Спробуйте через"
      );
    }, 10000);

    it("дозволяє вхід після закінчення таймауту блокування", async () => {
      // Імітуємо пройдений таймаут блокування
      mockStorage["budget_offline_pin_attempts"] = JSON.stringify({
        count: 5,
        lockedUntil: Date.now() - 1000, // блокування закінчилось 1 секунду тому
      });

      const res = await verifyOfflinePin("5555");
      expect(res.success).toBe(true);
    });
  });
});
