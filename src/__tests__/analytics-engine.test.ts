import { describe, it, expect } from "vitest";
import { calculateBudgetPacing } from "@/lib/analytics-engine";
import { Transaction } from "@/types/finance";

describe("Analytics Engine - calculateBudgetPacing", () => {
  const mockStartDate = new Date("2026-09-01T00:00:00.000Z");
  const mockEndDate = new Date("2026-09-30T23:59:59.999Z");

  it("коректно обчислює дні, загальні витрати та доходи", () => {
    const transactions: Transaction[] = [
      {
        id: 1,
        created_at: "2026-09-05T12:00:00Z",
        amount: 1500,
        currency: "UAH",
        merchant_raw: "Сільпо",
        category_name: "Продукти",
        source: "manual",
        type: "expense",
      },
      {
        id: 2,
        created_at: "2026-09-08T15:30:00Z",
        amount: 500,
        currency: "UAH",
        merchant_raw: "Аптека",
        category_name: "Здоров'я",
        source: "manual",
        type: "expense",
      },
      {
        id: 3,
        created_at: "2026-09-01T10:00:00Z",
        amount: 40000,
        currency: "UAH",
        merchant_raw: "Зарплата",
        category_name: "Зарплата",
        source: "manual",
        type: "income",
      },
    ];

    const result = calculateBudgetPacing(
      transactions,
      mockStartDate,
      mockEndDate,
      [],
      30000
    );

    expect(result.totalExpense).toBe(2000);
    expect(result.totalIncome).toBe(40000);
    expect(result.netSavings).toBe(38000);
    expect(result.daysTotal).toBeGreaterThanOrEqual(28);
    expect(result.daysRemaining).toBeGreaterThanOrEqual(0);
  });

  it("коректно розраховує безпечні щоденні витрати (Safe Daily Spend)", () => {
    const transactions: Transaction[] = [
      {
        id: 1,
        created_at: "2026-09-02T10:00:00Z",
        amount: 6000,
        currency: "UAH",
        merchant_raw: "Оренда",
        category_name: "Оренда та комуналка",
        source: "manual",
        type: "expense",
      },
    ];

    const result = calculateBudgetPacing(
      transactions,
      mockStartDate,
      mockEndDate,
      [],
      30000 // Загальний ліміт 30 000 ₴
    );

    expect(result.safeDailySpendRemaining).toBeGreaterThan(0);
    // Залишок бюджету = 30000 - 6000 = 24000.
    // Якщо днів залишилось N, то safeDailySpendRemaining приблизно 24000 / N
    if (result.daysRemaining > 0) {
      expect(result.safeDailySpendRemaining).toBe(
        Math.round((30000 - 6000) / result.daysRemaining)
      );
    }
  });

  it("визначає статус ліміту категорії: ok, warning, exceeded", () => {
    const transactions: Transaction[] = [
      {
        id: 1,
        created_at: "2026-09-05T10:00:00Z",
        amount: 4500,
        currency: "UAH",
        merchant_raw: "Ресторан",
        category_name: "Кафе та ресторани",
        source: "manual",
        type: "expense",
      },
    ];

    // Ліміт 4000 ₴ при витратах 4500 ₴ -> статус 'exceeded'
    const result = calculateBudgetPacing(
      transactions,
      mockStartDate,
      mockEndDate,
      [{ category: "Кафе та ресторани", limitAmount: 4000 }]
    );

    const cafePacing = result.categoryPacing.find(
      (c) => c.category === "Кафе та ресторани"
    );
    expect(cafePacing).toBeDefined();
    expect(cafePacing?.spent).toBe(4500);
    expect(cafePacing?.limit).toBe(4000);
    expect(cafePacing?.status).toBe("exceeded");
    expect(cafePacing?.spentPercent).toBeGreaterThan(100);
  });

  it("безпечно виправляє переплутані дати початку та кінця (start > end)", () => {
    const result = calculateBudgetPacing(
      [],
      mockEndDate, // передано навпаки
      mockStartDate
    );

    expect(new Date(result.cycleStart).getTime()).toBeLessThanOrEqual(
      new Date(result.cycleEnd).getTime()
    );
  });
});
