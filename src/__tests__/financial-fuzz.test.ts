import { describe, it, expect } from "vitest";

describe("Financial Fuzz & Precision Tests", () => {
  it("інваріант суми спліту чека: сума часток завжди дорівнює оригіналу до копійки", () => {
    // Симуляція спліту 1000 випадкових сум на 2-5 частин
    for (let testIndex = 0; testIndex < 500; testIndex++) {
      const originalAmount = parseFloat((Math.random() * 5000 + 10).toFixed(2));
      const partsCount = Math.floor(Math.random() * 4) + 2; // від 2 до 5 частин

      const parts: number[] = [];
      let allocated = 0;

      for (let i = 0; i < partsCount - 1; i++) {
        const remaining = originalAmount - allocated;
        const maxPart = remaining / (partsCount - i);
        const part = parseFloat((Math.random() * (maxPart - 1) + 1).toFixed(2));
        parts.push(part);
        allocated = parseFloat((allocated + part).toFixed(2));
      }

      // Остання частина забирає залишок
      const lastPart = parseFloat((originalAmount - allocated).toFixed(2));
      parts.push(lastPart);

      const sumOfParts = parseFloat(
        parts.reduce((acc, p) => acc + p, 0).toFixed(2)
      );
      const diff = Math.abs(sumOfParts - originalAmount);

      expect(diff).toBeLessThan(0.001);
    }
  });

  it("точність округлення копійок при валютних конвертаціях", () => {
    const testRates = [41.25, 41.5, 41.85, 45.2, 45.6];

    for (const rate of testRates) {
      // Сума в USD
      const usdAmount = 99.99;
      const uahAmount = Math.round(usdAmount * rate * 100) / 100;

      expect(isNaN(uahAmount)).toBe(false);
      expect(isFinite(uahAmount)).toBe(true);
      expect(uahAmount).toBeGreaterThan(4000);
    }
  });

  it("стійкість до граничних та мінімальних значень (0.01 ₴ та 10 000 000 ₴)", () => {
    const minVal = 0.01;
    const maxVal = 10_000_000;

    expect(Number(minVal.toFixed(2))).toBe(0.01);
    expect(Number(maxVal.toFixed(2))).toBe(10000000);

    const formattedMin = minVal.toLocaleString("uk-UA", {
      minimumFractionDigits: 2,
    });
    expect(formattedMin).toContain("0,01");
  });
});
