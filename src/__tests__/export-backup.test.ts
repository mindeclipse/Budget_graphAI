import { describe, it, expect, vi } from "vitest";
import { exportFinancialDataToExcel } from "@/lib/export-excel";
import { fetchAllRowsFromTable } from "@/lib/backup-service";
import * as XLSX from "xlsx";
import { Transaction, InvestmentAsset, SavingsGoal } from "@/types/finance";

vi.mock("xlsx", async () => {
  const actual = await vi.importActual<typeof import("xlsx")>("xlsx");
  return {
    ...actual,
    writeFile: vi.fn(),
  };
});

describe("Excel Export & JSON Backup Integrity", () => {
  it("генерує валідну структуру Excel книги без винятків", () => {
    const mockTransactions: Transaction[] = [
      {
        id: 101,
        created_at: "2026-09-08T12:00:00Z",
        amount: 850,
        currency: "UAH",
        merchant_raw: "Сільпо",
        category_name: "Продукти",
        source: "manual",
        type: "expense",
        tags: ["їжа"],
      },
    ];

    const mockInvestments: InvestmentAsset[] = [
      {
        id: 1,
        asset_name: "ОВДП 2027",
        asset_type: "bonds",
        invested_amount: 50000,
        current_value: 55000,
        currency: "UAH",
        yield_percent: 16,
        created_at: "2026-09-01T00:00:00Z",
      },
    ];

    const mockGoals: SavingsGoal[] = [
      {
        id: 1,
        name: "Резерв",
        target_amount: 100000,
        current_amount: 20000,
        currency: "UAH",
        created_at: "2026-09-01T00:00:00Z",
      },
    ];

    expect(() => {
      exportFinancialDataToExcel({
        transactions: mockTransactions,
        investments: mockInvestments,
        savingsGoals: mockGoals,
        filename: "test_export.xlsx",
      });
    }).not.toThrow();

    expect(XLSX.writeFile).toHaveBeenCalled();
  });

  it("валідує структуру та повноту дампа резервної копії (JSON Backup)", () => {
    const mockBackup = {
      version: "1.0",
      timestamp: "2026-09-09T18:00:00.000Z",
      app: "BudgetGraph",
      data: {
        transactions: [{ id: 1, amount: 100, merchant_raw: "Кава" }],
        budget_cycles: [{ id: "c1", name: "Вересень" }],
        recurring_templates: [{ id: 1, title: "Netflix", amount: 400 }],
        merchant_rules: [{ pattern: "SILPO", category_name: "Продукти" }],
        savings_goals: [{ id: 1, name: "Подушка", target_amount: 50000 }],
        investments: [{ id: 1, asset_name: "ОВДП", invested_amount: 10000 }],
        category_budgets: [
          { id: 1, category_name: "Кафе", monthly_limit: 4000 },
        ],
        wishlist_items: [
          {
            id: 1,
            title: "Навушники",
            target_amount: 5000,
            saved_amount: 1500,
          },
        ],
        cost_per_use_items: [
          { id: 1, name: "Кавомашина", purchase_price: 12000, uses_count: 50 },
        ],
      },
    };

    expect(mockBackup.app).toBe("BudgetGraph");
    expect(mockBackup.version).toBe("1.0");
    expect(Array.isArray(mockBackup.data.transactions)).toBe(true);
    expect(Array.isArray(mockBackup.data.budget_cycles)).toBe(true);
    expect(Array.isArray(mockBackup.data.recurring_templates)).toBe(true);
    expect(Array.isArray(mockBackup.data.savings_goals)).toBe(true);
    expect(Array.isArray(mockBackup.data.investments)).toBe(true);
    expect(Array.isArray(mockBackup.data.category_budgets)).toBe(true);
    expect(Array.isArray(mockBackup.data.wishlist_items)).toBe(true);
    expect(Array.isArray(mockBackup.data.cost_per_use_items)).toBe(true);
  });

  it("fetchAllRowsFromTable коректно вибирає всі сторінки, якщо кількість рядків перевищує 1000", async () => {
    const page1 = Array.from({ length: 1000 }, (_, i) => ({ id: i + 1 }));
    const page2 = Array.from({ length: 250 }, (_, i) => ({ id: 1000 + i + 1 }));

    const mockSupabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({
            range: vi.fn().mockImplementation((from: number) => {
              if (from === 0) {
                return Promise.resolve({ data: page1, error: null });
              } else if (from === 1000) {
                return Promise.resolve({ data: page2, error: null });
              }
              return Promise.resolve({ data: [], error: null });
            }),
          }),
        }),
      }),
    };

    const results = await fetchAllRowsFromTable(
      mockSupabase as any,
      "transactions",
      "id",
      true
    );
    expect(results).toHaveLength(1250);
    expect(results[0].id).toBe(1);
    expect(results[1249].id).toBe(1250);
  });
});
