import { describe, it, expect } from "vitest";
import { formatQuickSummary } from "@/lib/classify-formatter";

describe("Classify API & QuickSummary Formatting", () => {
  it("формує коректний quickSummary з позитивним залишком на день", () => {
    const summary = formatQuickSummary("Сільпо", 450, "Продукти", 820);
    expect(summary).toBe("Сільпо: 450 ₴ (Продукти) • На день: 820 ₴");
  });

  it("формує коректний quickSummary, якщо денний ліміт вичерпано (0 грн)", () => {
    const summary = formatQuickSummary("OKKO АЗС", 2500, "Авто", 0);
    expect(summary).toBe("OKKO АЗС: 2 500 ₴ (Авто) • Денний бюджет вичерпано");
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
    const summary = formatQuickSummary("Аптека АНЦ", 185.5, "Здоров'я", 540);
    expect(summary).toContain("Аптека АНЦ");
    expect(summary).toContain("Здоров'я");
    expect(summary).toContain("На день: 540 ₴");
  });
});
