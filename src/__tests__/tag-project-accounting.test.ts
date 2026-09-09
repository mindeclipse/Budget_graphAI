import { describe, it, expect } from "vitest";
import { calculateProjectMetrics } from "@/components/TagProjectModal";
import { Transaction } from "@/types/finance";

describe("Tag Project Accounting (Cross-Period)", () => {
  const mockTransactions: Transaction[] = [
    {
      id: 1,
      amount: 1500,
      currency: "UAH",
      created_at: "2025-11-15T10:00:00.000Z",
      category_name: "Дім та затишок",
      merchant_raw: "Епіцентр (будівельні матеріали)",
      source: "manual",
      type: "expense",
      tags: ["ремонт", "епіцентр"],
    },
    {
      id: 2,
      amount: 3200,
      currency: "UAH",
      created_at: "2026-01-20T14:30:00.000Z",
      category_name: "Послуги",
      merchant_raw: "Майстер сантехнік",
      source: "manual",
      type: "expense",
      tags: ["Ремонт", "сантехніка"], // Case-insensitive test
    },
    {
      id: 3,
      amount: 800,
      currency: "UAH",
      created_at: "2026-03-05T09:15:00.000Z",
      category_name: "Дім та затишок",
      merchant_raw: "Леруа Мерлен",
      source: "manual",
      type: "expense",
      tags: ["#ремонт"], // Leading hash test
    },
    {
      id: 4,
      amount: 5000,
      currency: "UAH",
      created_at: "2025-11-10T12:00:00.000Z",
      category_name: "Зарплата",
      merchant_raw: "Бюджет на ремонт від батьків",
      source: "manual",
      type: "income",
      tags: ["ремонт"],
    },
    {
      id: 5,
      amount: 450,
      currency: "UAH",
      created_at: "2026-02-14T18:00:00.000Z",
      category_name: "Кафе",
      merchant_raw: "Кав'ярня",
      source: "manual",
      type: "expense",
      tags: ["відпочинок"], // Unrelated tag
    },
    {
      id: 6,
      amount: 1000,
      currency: "UAH",
      created_at: "2026-02-01T12:00:00.000Z",
      category_name: "Дім та затишок",
      merchant_raw: "Тестовий платіж (не враховувати)",
      source: "manual",
      type: "expense",
      tags: ["ремонт"],
      exclude_from_budget: true, // Should be excluded from expenseTxs & totalSpent
    },
  ];

  it("aggregates transactions across multiple distinct months correctly", () => {
    const result = calculateProjectMetrics("ремонт", mockTransactions);

    // Total matched transactions: 1, 2, 3, 4, 6 (5 total)
    expect(result.txCount).toBe(5);

    // Expenses: 1, 2, 3 (tx 6 is excluded_from_budget, tx 4 is income)
    expect(result.expenseTxs.length).toBe(3);
    // Total spent: 1500 + 3200 + 800 = 5500
    expect(result.totalSpent).toBe(5500);

    // Income: tx 4
    expect(result.incomeTxs.length).toBe(1);
    expect(result.totalIncome).toBe(5000);
    expect(result.netBalance).toBe(-500); // 5000 - 5500

    // Average check: 5500 / 3
    expect(Math.round(result.avgCheck)).toBe(Math.round(5500 / 3));
  });

  it("calculates accurate cross-period timeline spanning from 2025 to 2026", () => {
    const result = calculateProjectMetrics("ремонт", mockTransactions);

    expect(result.firstDate).not.toBeNull();
    expect(result.lastDate).not.toBeNull();

    expect(result.firstDate?.toISOString()).toBe("2025-11-10T12:00:00.000Z");
    expect(result.lastDate?.toISOString()).toBe("2026-03-05T09:15:00.000Z");
  });

  it("calculates category breakdown and percentages within the project", () => {
    const result = calculateProjectMetrics("#ремонт", mockTransactions);

    // Total spent: 5500
    // "Послуги": 3200 (58.18%)
    // "Дім та затишок": 1500 + 800 = 2300 (41.82%)
    expect(result.categories.length).toBe(2);

    expect(result.categories[0].name).toBe("Послуги");
    expect(result.categories[0].amount).toBe(3200);
    expect(Math.round(result.categories[0].percentage)).toBe(58);

    expect(result.categories[1].name).toBe("Дім та затишок");
    expect(result.categories[1].amount).toBe(2300);
    expect(Math.round(result.categories[1].percentage)).toBe(42);
  });

  it("breaks down monthly distribution across periods", () => {
    const result = calculateProjectMetrics("ремонт", mockTransactions);

    // Expenses exist in: 2025-11 (1500), 2026-01 (3200), 2026-03 (800)
    expect(result.monthlyDistribution.length).toBe(3);

    expect(result.monthlyDistribution[0].key).toBe("2025-11");
    expect(result.monthlyDistribution[0].amount).toBe(1500);
    expect(result.monthlyDistribution[0].count).toBe(1);

    expect(result.monthlyDistribution[1].key).toBe("2026-01");
    expect(result.monthlyDistribution[1].amount).toBe(3200);
    expect(result.monthlyDistribution[1].count).toBe(1);

    expect(result.monthlyDistribution[2].key).toBe("2026-03");
    expect(result.monthlyDistribution[2].amount).toBe(800);
    expect(result.monthlyDistribution[2].count).toBe(1);
  });

  it("handles edge cases: null tag, non-existent tag, and malformed tags safely", () => {
    const nullResult = calculateProjectMetrics(null, mockTransactions);
    expect(nullResult.txCount).toBe(0);
    expect(nullResult.totalSpent).toBe(0);

    const emptyResult = calculateProjectMetrics("", mockTransactions);
    expect(emptyResult.txCount).toBe(0);

    const nonExistent = calculateProjectMetrics("космос", mockTransactions);
    expect(nonExistent.txCount).toBe(0);
    expect(nonExistent.totalSpent).toBe(0);
    expect(nonExistent.categories).toEqual([]);

    const malformedTxs: any[] = [
      {
        id: 99,
        amount: 100,
        created_at: "2026-01-01",
        source: "manual",
        type: "expense",
        category_name: "Інше",
        currency: "UAH",
        merchant_raw: "Тест",
      }, // missing tags
      {
        id: 100,
        amount: 200,
        tags: "not-an-array",
        created_at: "2026-01-01",
        source: "manual",
        type: "expense",
        category_name: "Інше",
        currency: "UAH",
        merchant_raw: "Тест",
      },
      {
        id: 101,
        amount: 300,
        tags: [null, undefined, 42],
        created_at: "2026-01-01",
        source: "manual",
        type: "expense",
        category_name: "Інше",
        currency: "UAH",
        merchant_raw: "Тест",
      },
    ];
    const safeResult = calculateProjectMetrics("тест", malformedTxs);
    expect(safeResult.txCount).toBe(0);
    expect(safeResult.totalSpent).toBe(0);
  });
});
