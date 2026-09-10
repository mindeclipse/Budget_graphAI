import { describe, it, expect } from "vitest";
import { checkAiRateLimit } from "@/lib/rate-limiter";

describe("AI In-Memory Rate Limiter Tests", () => {
  it("дозволяє запити в межах встановленого ліміту", () => {
    const key = `test_user_allow_${Date.now()}`;
    const result1 = checkAiRateLimit(key, 3, 10000);
    expect(result1.allowed).toBe(true);
    expect(result1.remaining).toBe(2);

    const result2 = checkAiRateLimit(key, 3, 10000);
    expect(result2.allowed).toBe(true);
    expect(result2.remaining).toBe(1);

    const result3 = checkAiRateLimit(key, 3, 10000);
    expect(result3.allowed).toBe(true);
    expect(result3.remaining).toBe(0);
  });

  it("блокує надмірні запити та повертає retryAfterSeconds", () => {
    const key = `test_user_block_${Date.now()}`;
    checkAiRateLimit(key, 2, 5000);
    checkAiRateLimit(key, 2, 5000);

    const blocked = checkAiRateLimit(key, 2, 5000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
    expect(blocked.retryAfterSeconds).toBeLessThanOrEqual(5);
  });

  it("скидає лічильник після завершення вікна windowMs", async () => {
    const key = `test_user_reset_${Date.now()}`;
    checkAiRateLimit(key, 1, 50); // 50ms вікно
    const blocked = checkAiRateLimit(key, 1, 50);
    expect(blocked.allowed).toBe(false);

    // Очікуємо 60ms
    await new Promise((resolve) => setTimeout(resolve, 60));

    const fresh = checkAiRateLimit(key, 1, 50);
    expect(fresh.allowed).toBe(true);
  });
});
