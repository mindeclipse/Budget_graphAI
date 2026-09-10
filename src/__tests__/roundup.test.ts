import { describe, it, expect, vi } from "vitest";
import {
  calculateExpenseRoundup,
  calculateBalanceRounddown,
  isRoundupTransaction,
  processExpenseRoundup,
  ROUNDUP_GOAL_NAME,
  ROUNDUP_CATEGORY_NAME,
} from "@/lib/roundup-utils";
import { formatQuickSummary } from "@/lib/classify-formatter";
import {
  parseBankStatementRows,
  bankTransactionSchema,
} from "@/lib/bank-statement-parser";

describe("Roundup Utilities & Business Logic", () => {
  describe("calculateExpenseRoundup (Від витрат до 10 ₴)", () => {
    it("точно розраховує решту з реальних скріншотів Приват24 користувача", () => {
      // 08.09: Ovatsiya #376: 66.60 ₴ -> решта 3.40 ₴
      expect(calculateExpenseRoundup(66.6)).toBe(3.4);

      // 08.09: Dk Shevchenka: 180.00 ₴ -> 0.00 ₴ (вже кругле)
      expect(calculateExpenseRoundup(180)).toBe(0);

      // 08.09: Simi: 17.00 ₴ -> решта 3.00 ₴
      expect(calculateExpenseRoundup(17)).toBe(3);

      // 08.09: Blyzenko: 29.99 ₴ -> решта 0.01 ₴
      expect(calculateExpenseRoundup(29.99)).toBe(0.01);

      // 10.09: Inzhur: 35 758.74 ₴ -> решта 1.26 ₴ (до 35 760.00 ₴)
      expect(calculateExpenseRoundup(35758.74)).toBe(1.26);

      // 10.09: Shop Knyazhyy: 42.00 ₴ -> решта 8.00 ₴
      expect(calculateExpenseRoundup(42)).toBe(8);
    });

    it("коректно обробляє граничні значення та захист від плаваючої крапки", () => {
      expect(calculateExpenseRoundup(0.01)).toBe(9.99);
      expect(calculateExpenseRoundup(9.99)).toBe(0.01);
      expect(calculateExpenseRoundup(10)).toBe(0);
      expect(calculateExpenseRoundup(100)).toBe(0);
      expect(calculateExpenseRoundup(1000)).toBe(0);
      expect(calculateExpenseRoundup(0)).toBe(0);
      expect(calculateExpenseRoundup(-50)).toBe(0);
      expect(calculateExpenseRoundup(NaN)).toBe(0);
      expect(calculateExpenseRoundup(Infinity)).toBe(0);
    });

    it("підтримує кастомний крок округлення", () => {
      // Крок 50 ₴
      expect(calculateExpenseRoundup(42, 50)).toBe(8);
      expect(calculateExpenseRoundup(50, 50)).toBe(0);
      expect(calculateExpenseRoundup(51, 50)).toBe(49);

      // Крок 100 ₴
      expect(calculateExpenseRoundup(66.6, 100)).toBe(33.4);
    });
  });

  describe("calculateBalanceRounddown (Округлення залишку картки до 10 ₴)", () => {
    it("розраховує суму 'зрізання' залишку з карти на подушку", () => {
      // Баланс з скріншоту картки: 57 994.93 ₴ -> залишок 4.93 ₴ (на карті стане 57 990.00 ₴)
      expect(calculateBalanceRounddown(57994.93)).toBe(4.93);

      // Якщо вже рівно 57 990.00 ₴ -> 0 ₴
      expect(calculateBalanceRounddown(57990)).toBe(0);

      // 123.45 ₴ -> 3.45 ₴ (на карті стане 120.00 ₴)
      expect(calculateBalanceRounddown(123.45)).toBe(3.45);
    });

    it("коректно обробляє некоректні дані балансу", () => {
      expect(calculateBalanceRounddown(0)).toBe(0);
      expect(calculateBalanceRounddown(-100)).toBe(0);
      expect(calculateBalanceRounddown(NaN)).toBe(0);
    });
  });

  describe("isRoundupTransaction", () => {
    it("визначає транзакції автоокруглення за назвою та категорією", () => {
      expect(
        isRoundupTransaction("Решта від округлення витрат на Фінансова подушка")
      ).toBe(true);
      expect(
        isRoundupTransaction("Округлення залишку на Фінансова подушка")
      ).toBe(true);
      expect(
        isRoundupTransaction("Переказ", "Внутрішні перекази / Подушка")
      ).toBe(true);
      expect(isRoundupTransaction("Округлення витрат")).toBe(true);
    });

    it("не позначає звичайні транзакції як округлення", () => {
      expect(isRoundupTransaction("Сільпо", "Продукти")).toBe(false);
      expect(isRoundupTransaction("Uklon", "Транспорт")).toBe(false);
      expect(isRoundupTransaction("Київстар", "Підписки та сервіси")).toBe(
        false
      );
    });
  });

  describe("formatQuickSummary з рештою", () => {
    it("додає інформацію про поповнення подушки, якщо є решта", () => {
      const summary = formatQuickSummary(
        "Магазин Княжий",
        42,
        "Продукти",
        1500,
        8
      );
      expect(summary).toContain("Магазин Княжий: 42 ₴ (Продукти)");
      expect(summary).toContain("• Подушка: +8 ₴");
      expect(summary).toContain("• На день: 1 500 ₴");
    });

    it("не показує подушку, якщо решта відсутня або нульова", () => {
      const summary = formatQuickSummary(
        "Кебаб на Шевченка",
        180,
        "Кафе та ресторани",
        1320,
        0
      );
      expect(summary).toContain("Кебаб на Шевченка: 180 ₴ (Кафе та ресторани)");
      expect(summary).not.toContain("Подушка");
      expect(summary).toContain("• На день: 1 320 ₴");
    });
  });

  describe("Bank Statement Parser для транзакцій округлення", () => {
    it("парсить рядки виписки ПриватБанку з рештою як type=transfer та категорією Внутрішні перекази / Подушка", () => {
      const headers = [
        "Дата",
        "Категорія",
        "Картка",
        "Опис операції",
        "Сума в валюті картки",
        "Валюта картки",
      ];
      const rows = [
        headers,
        [
          "08.09.2026 20:38:00",
          "Перекази",
          "4114****2001",
          "Решта від округлення витрат на Фінансова подушка",
          "-3.40",
          "UAH",
        ],
        [
          "05.09.2026 02:36:23",
          "Перекази",
          "4114****2001",
          "Округлення залишку на Фінансова подушка",
          "-4.93",
          "UAH",
        ],
      ];

      const { transactions } = parseBankStatementRows(rows);
      expect(transactions).toHaveLength(2);

      const tx1 = transactions[0];
      expect(tx1.amount).toBe(3.4);
      expect(tx1.type).toBe("transfer");
      expect(tx1.category_name).toBe(ROUNDUP_CATEGORY_NAME);

      const tx2 = transactions[1];
      expect(tx2.amount).toBe(4.93);
      expect(tx2.type).toBe("transfer");
      expect(tx2.category_name).toBe(ROUNDUP_CATEGORY_NAME);
    });
  });

  describe("processExpenseRoundup Integration Logic", () => {
    it("ігнорує операції не в UAH або з нульовою сумою", async () => {
      const mockSupabase: any = { from: vi.fn() };
      const resUsd = await processExpenseRoundup(mockSupabase, {
        amount: 25.5,
        currency: "USD",
        source: "apple_pay",
      });
      expect(resUsd).toBeNull();
      expect(mockSupabase.from).not.toHaveBeenCalled();
    });

    it("ігнорує операції, які вже кратні 10 ₴", async () => {
      const mockSupabase: any = { from: vi.fn() };
      const res = await processExpenseRoundup(mockSupabase, {
        amount: 180,
        currency: "UAH",
        source: "apple_pay",
      });
      expect(res).toBeNull();
      expect(mockSupabase.from).not.toHaveBeenCalled();
    });

    it("створює транзакцію решти та оновлює ціль для некруглої суми", async () => {
      const insertedRows: any[] = [];
      const mockSupabase: any = {
        from: (table: string) => {
          if (table === "transactions") {
            return {
              insert: (payload: any) => {
                insertedRows.push(payload);
                return {
                  select: () => ({
                    single: async () => ({
                      data: { id: 9999, ...payload },
                      error: null,
                    }),
                  }),
                };
              },
            };
          }
          if (table === "savings_goals") {
            return {
              select: () => ({
                ilike: () => ({
                  maybeSingle: async () => ({
                    data: { id: 8, current_amount: 830.81 },
                    error: null,
                  }),
                }),
              }),
              update: (updatePayload: any) => ({
                eq: async () => ({ error: null }),
              }),
            };
          }
          return {};
        },
      };

      const result = await processExpenseRoundup(mockSupabase, {
        parentTxId: 2142,
        amount: 66.6,
        currency: "UAH",
        source: "apple_pay",
      });

      expect(result).toBeDefined();
      expect(result?.roundupAmount).toBe(3.4);
      expect(result?.roundupTxId).toBe(9999);
      expect(result?.goalUpdated).toBe(true);
      expect(result?.newGoalBalance).toBe(834.21); // 830.81 + 3.40

      expect(insertedRows).toHaveLength(1);
      expect(insertedRows[0]).toMatchObject({
        amount: 3.4,
        currency: "UAH",
        merchant_raw: "Решта від округлення витрат на Фінансова подушка",
        category_name: "Внутрішні перекази / Подушка",
        type: "transfer",
        source: "apple_pay",
        parent_transaction_id: 2142,
      });
    });
  });
});
