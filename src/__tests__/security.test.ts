import { describe, it, expect } from "vitest";
import { createSessionToken, verifySessionToken } from "@/lib/session";
import { timingSafeEqual, getClientIp, escapeHtml } from "@/lib/security";

describe("Security & Authentication", () => {
  describe("HMAC-SHA256 Session Tokens", () => {
    it("успішно створює та верифікує валідний токен сесії", async () => {
      const token = await createSessionToken("owner");
      expect(typeof token).toBe("string");
      expect(token).toContain(".");

      const { valid, userId } = await verifySessionToken(token);
      expect(valid).toBe(true);
      expect(userId).toBe("owner");
    });

    it("відхиляє токен із підробленим підписом", async () => {
      const token = await createSessionToken("owner");
      const [payload, sig] = token.split(".");
      // Змінюємо один символ у підписі
      const tamperedSig = sig.endsWith("a")
        ? sig.slice(0, -1) + "b"
        : sig.slice(0, -1) + "a";
      const tamperedToken = `${payload}.${tamperedSig}`;

      const { valid } = await verifySessionToken(tamperedToken);
      expect(valid).toBe(false);
    });

    it("відхиляє токен із підробленим пейлоадом", async () => {
      const token = await createSessionToken("owner");
      const [, sig] = token.split(".");
      // Підробляємо пейлоад на іншого користувача
      const fakePayload = btoa(
        JSON.stringify({ uid: "attacker", exp: 9999999999 })
      );
      const tamperedToken = `${fakePayload}.${sig}`;

      const { valid } = await verifySessionToken(tamperedToken);
      expect(valid).toBe(false);
    });

    it("відхиляє порожні або некоректні рядки токенів", async () => {
      expect((await verifySessionToken("")).valid).toBe(false);
      expect((await verifySessionToken(null)).valid).toBe(false);
      expect(
        (await verifySessionToken("random_string_without_dot")).valid
      ).toBe(false);
      expect((await verifySessionToken("foo.bar.baz")).valid).toBe(false);
    });

    it("викидає виключення у production якщо секретні ключі відсутні (Fail-Closed)", async () => {
      const origEnv = process.env.NODE_ENV;
      const origSecret = process.env.APP_API_SECRET;
      const origPin = process.env.APP_ACCESS_PIN;

      try {
        (process.env as any).NODE_ENV = "production";
        delete process.env.APP_API_SECRET;
        delete process.env.APP_ACCESS_PIN;

        await expect(createSessionToken("owner")).rejects.toThrow(
          "Critical Security Error"
        );
      } finally {
        (process.env as any).NODE_ENV = origEnv;
        if (origSecret) process.env.APP_API_SECRET = origSecret;
        if (origPin) process.env.APP_ACCESS_PIN = origPin;
      }
    });
  });

  describe("timingSafeEqual", () => {
    it("повертає true для ідентичних рядків", () => {
      expect(timingSafeEqual("hello_world_123", "hello_world_123")).toBe(true);
      expect(timingSafeEqual("", "")).toBe(true);
    });

    it("повертає false для рядків різної довжини або різних символів", () => {
      expect(timingSafeEqual("password123", "password124")).toBe(false);
      expect(timingSafeEqual("short", "longer_string")).toBe(false);
    });

    it("безпечно обробляє нерядкові аргументи", () => {
      expect(timingSafeEqual(null as any, "test")).toBe(false);
      expect(timingSafeEqual("test", undefined as any)).toBe(false);
    });
  });

  describe("escapeHtml", () => {
    it("екранує небезпечні HTML символи для Telegram Bot API", () => {
      const input = `<script>alert("XSS & danger")</script> 'hello'`;
      const escaped = escapeHtml(input);
      expect(escaped).toBe(
        `&lt;script&gt;alert(&quot;XSS &amp; danger&quot;)&lt;/script&gt; &#039;hello&#039;`
      );
    });

    it("повертає порожній рядок для falsy значень", () => {
      expect(escapeHtml("")).toBe("");
    });
  });

  describe("getClientIp", () => {
    it("витягує перший IP з x-forwarded-for", () => {
      const headers = new Headers({
        "x-forwarded-for": "203.0.113.195, 70.41.3.18, 150.172.238.178",
      });
      expect(getClientIp(headers)).toBe("203.0.113.195");
    });

    it("витягує IP з x-real-ip якщо x-forwarded-for відсутній", () => {
      const headers = new Headers({ "x-real-ip": "198.51.100.42" });
      expect(getClientIp(headers)).toBe("198.51.100.42");
    });

    it("повертає 127.0.0.1 якщо заголовки відсутні", () => {
      expect(getClientIp(new Headers())).toBe("127.0.0.1");
    });
  });
});
