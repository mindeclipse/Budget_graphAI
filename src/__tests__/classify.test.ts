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

  describe("computeSafeDailyBudget (Математична узгодженість & Запобігання подвійному списанню)", () => {
    it("не списує повторно вже оплачені підписки та адаптує денний ліміт під день тижня", async () => {
      const { computeSafeDailyBudget } =
        await import("@/lib/classify-formatter");

      const fakeSupabase = {
        from: (table: string) => {
          if (table === "budget_cycles") {
            return {
              select: () => ({
                eq: () => ({
                  order: () => ({
                    limit: () => ({
                      maybeSingle: async () => ({
                        data: {
                          budget_limit: 35000,
                          is_active: true,
                          start_date: "2026-09-08T00:00:00.000Z",
                          end_date: "2026-10-08T00:00:00.000Z",
                        },
                      }),
                    }),
                  }),
                }),
              }),
            };
          }
          if (table === "recurring_templates") {
            return {
              select: () => ({
                eq: async () => ({
                  data: [
                    {
                      id: 1,
                      title: "Оренда",
                      amount: 20000,
                      currency: "UAH",
                      day_of_month: 25,
                      is_active: true,
                      category_name: "Житло",
                    },
                    {
                      id: 2,
                      title: "Київстар",
                      amount: 250,
                      currency: "UAH",
                      day_of_month: 10,
                      is_active: true,
                      category_name: "Зв'язок",
                    },
                    {
                      id: 3,
                      title: "iCloud",
                      amount: 275,
                      currency: "UAH",
                      day_of_month: 20,
                      is_active: true,
                      category_name: "Підписки",
                    },
                  ],
                }),
              }),
            };
          }
          if (table === "transactions") {
            return {
              select: () => ({
                gte: () => ({
                  is: () => ({
                    order: async () => ({
                      data: [
                        // Оплачений Київстар у цьому циклі (10 вересня)
                        {
                          id: 101,
                          amount: 250,
                          currency: "UAH",
                          type: "expense",
                          merchant_raw: "Київстар",
                          category_name: "Зв'язок",
                          exclude_from_budget: false,
                          created_at: "2026-09-10T10:00:00.000Z",
                        },
                        // Інші витрати до сьогодні (17 вересня)
                        {
                          id: 102,
                          amount: 5017.09,
                          currency: "UAH",
                          type: "expense",
                          merchant_raw: "Супермаркет",
                          category_name: "Продукти",
                          exclude_from_budget: false,
                          created_at: "2026-09-12T14:00:00.000Z",
                        },
                      ],
                    }),
                  }),
                }),
              }),
            };
          }
          return { select: () => ({ eq: async () => ({ data: [] }) }) };
        },
      };

      // 17 вересня 2026 року — четвер (будній день)
      const testNow = new Date("2026-09-17T12:00:00.000Z");
      const result = await computeSafeDailyBudget(fakeSupabase, testNow);

      expect(result).not.toBeNull();
      // Вільний залишок = 35 000 - 5 267.09 (витрачено) - 20 275 (неоплачені зобов'язання) = 9 457.91 -> 9 458 ₴
      expect(result?.cycleRemaining).toBe(9458);
      // Неоплачені зобов'язання (Оренда 20 000 + iCloud 275) = 20 275 (Київстар 250 НЕ списується двічі)
      expect(result?.recurringTotal).toBe(20275);
      expect(result?.todaySpent).toBe(0);
      expect(result?.isTodayWeekend).toBe(false);
      expect(result?.todayTarget).toBeGreaterThan(0);
      expect(result?.todayRemaining).toBe(result?.todayTarget);
    });
  });
});
