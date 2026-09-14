import { describe, it, expect } from "vitest";
import {
  formatQuickSummary,
  getKyivDateString,
  DailyBudgetInfo,
} from "@/lib/classify-formatter";

describe("Classify API & QuickSummary Formatting", () => {
  it("формує коректний quickSummary з позитивним залишком на день", () => {
    const summary = formatQuickSummary("Сільпо", 450, "Продукти", 820);
    expect(summary).toBe("Сільпо: 450 ₴ (Продукти) • На день: 820 ₴");
  });

  it("формує коректний quickSummary, якщо денний ліміт вичерпано (0 грн)", () => {
    const summary = formatQuickSummary("OKKO АЗС", 2500, "Авто", 0);
    expect(summary).toBe("OKKO АЗС: 2 500 ₴ (Авто) • Денний бюджет вичерпано");
  });

  it("формує коректний quickSummary, якщо денний бюджет перевищено (від'ємний залишок)", () => {
    const summary = formatQuickSummary("АТБ", 304.27, "Продукти", -405);
    expect(summary).toBe(
      "АТБ: 304,27 ₴ (Продукти) • На день: -405 ₴ (переліміт)"
    );
  });

  it("підтримує об'єкт DailyBudgetInfo", () => {
    const info: DailyBudgetInfo = {
      todayRemaining: 122,
      todayTarget: 495,
      todaySpent: 373,
      cycleRemaining: 13485,
      daysRemaining: 28,
    };
    const summary = formatQuickSummary("Овація", 318.8, "Куріння", info, 1.2);
    expect(summary).toBe(
      "Овація: 318,8 ₴ (Куріння) • Подушка: +1,2 ₴ • На день: 122 ₴"
    );
  });

  it("підтримує об'єкт DailyBudgetInfo при переліміті", () => {
    const info: DailyBudgetInfo = {
      todayRemaining: -101,
      todayTarget: 495,
      todaySpent: 596,
      cycleRemaining: 13262,
      daysRemaining: 28,
    };
    const summary = formatQuickSummary("АЗС", 223.02, "Авто", info, 6.98);
    expect(summary).toBe(
      "АЗС: 223,02 ₴ (Авто) • Подушка: +6,98 ₴ • На день: -101 ₴ (переліміт)"
    );
  });

  it("формує базовий quickSummary, якщо розрахунок залишку недоступний (null)", () => {
    const summary = formatQuickSummary(
      "Netflix",
      390,
      "Підписки та сервіси",
      null
    );
    expect(summary).toBe("Netflix: 390 ₴ (Підписки та сервіси)");
  });

  it("коректно форматує дробові суми копійок", () => {
    const summary = formatQuickSummary(
      "Аптека АНЦ",
      185.5,
      "Здоров'я та догляд",
      540
    );
    expect(summary).toContain("Аптека АНЦ");
    expect(summary).toContain("Здоров'я та догляд");
    expect(summary).toContain("На день: 540 ₴");
  });

  describe("getKyivDateString", () => {
    it("повертає коректну дату в поясі Києва (YYYY-MM-DD)", () => {
      // 21:30 UTC on 2026-09-09 is 00:30 on 2026-09-10 in Kyiv (UTC+3)
      const dateUtc = new Date("2026-09-09T21:30:00Z");
      expect(getKyivDateString(dateUtc)).toBe("2026-09-10");

      // 20:30 UTC on 2026-09-09 is 23:30 on 2026-09-09 in Kyiv
      const datePrev = new Date("2026-09-09T20:30:00Z");
      expect(getKyivDateString(datePrev)).toBe("2026-09-09");
    });
  });
});
