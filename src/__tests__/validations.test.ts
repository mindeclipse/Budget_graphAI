import { describe, it, expect } from "vitest";
import {
  transactionCreateSchema,
  transactionSplitSchema,
  savingsGoalSchema,
  investmentAssetSchema,
  categoryBudgetSchema,
} from "@/lib/validations";

describe("Validations - Zod Schemas", () => {
  describe("transactionCreateSchema", () => {
    it("успішно валідує коректні витрати", () => {
      const validTx = {
        amount: 250.5,
        currency: "UAH",
        merchant_raw: "Сільпо",
        category_name: "Продукти",
        source: "manual",
        type: "expense",
      };
      const result = transactionCreateSchema.safeParse(validTx);
      expect(result.success).toBe(true);
    });

    it("успішно валідує інвестиційний тип транзакції", () => {
      const investTx = {
        amount: 50000,
        currency: "USD",
        merchant_raw: "Купівля ОВДП",
        category_name: "Інвестиції",
        source: "manual",
        type: "investment",
      };
      const result = transactionCreateSchema.safeParse(investTx);
      expect(result.success).toBe(true);
    });

    it("відхиляє від'ємні та нульові суми", () => {
      expect(
        transactionCreateSchema.safeParse({
          amount: -50,
          merchant_raw: "Тест",
        }).success
      ).toBe(false);

      expect(
        transactionCreateSchema.safeParse({
          amount: 0,
          merchant_raw: "Тест",
        }).success
      ).toBe(false);
    });

    it("відхиляє суму, що перевищує допустимий ліміт 10 000 000", () => {
      const result = transactionCreateSchema.safeParse({
        amount: 15_000_000,
        merchant_raw: "Занадто багато",
      });
      expect(result.success).toBe(false);
    });

    it("відхиляє порожню назву торговця", () => {
      const result = transactionCreateSchema.safeParse({
        amount: 100,
        merchant_raw: "   ",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("transactionSplitSchema", () => {
    it("успішно валідує коректний поділ на 2 або більше частин", () => {
      const validSplit = {
        parent_transaction_id: 42,
        items: [
          { amount: 300, category_name: "Продукти", merchant_raw: "Їжа" },
          { amount: 150, category_name: "Інше", merchant_raw: "Хімія" },
        ],
      };
      const result = transactionSplitSchema.safeParse(validSplit);
      expect(result.success).toBe(true);
    });

    it("відхиляє поділ, якщо передано менше 2 частин", () => {
      const invalidSplit = {
        parent_transaction_id: 42,
        items: [{ amount: 450, category_name: "Продукти" }],
      };
      const result = transactionSplitSchema.safeParse(invalidSplit);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain(
          "щонайменше 2 частини"
        );
      }
    });

    it("відхиляє частини з нульовими або від'ємними сумами", () => {
      const invalidSplit = {
        parent_transaction_id: 42,
        items: [
          { amount: 500, category_name: "Продукти" },
          { amount: 0, category_name: "Інше" },
        ],
      };
      expect(transactionSplitSchema.safeParse(invalidSplit).success).toBe(
        false
      );
    });
  });

  describe("savingsGoalSchema", () => {
    it("валідує ціль заощаджень", () => {
      const goal = {
        name: "Подушка безпеки",
        target_amount: 100000,
        current_amount: 25000,
        currency: "UAH",
        target_date: "2026-12-31",
      };
      const result = savingsGoalSchema.safeParse(goal);
      expect(result.success).toBe(true);
    });

    it("відхиляє ціль без назви або з нульовою цільовою сумою", () => {
      expect(
        savingsGoalSchema.safeParse({ name: "", target_amount: 50000 }).success
      ).toBe(false);
      expect(
        savingsGoalSchema.safeParse({
          name: "Ціль",
          target_amount: 0,
        }).success
      ).toBe(false);
    });
  });

  describe("investmentAssetSchema", () => {
    it("валідує актив (ОВДП, ETF, Crypto)", () => {
      const asset = {
        asset_name: "ОВДП UA4000226286",
        asset_type: "bonds",
        invested_amount: 50000,
        current_value: 54200,
        currency: "UAH",
        yield_percent: 16.5,
        maturity_date: "2027-05-15",
      };
      const result = investmentAssetSchema.safeParse(asset);
      expect(result.success).toBe(true);
    });

    it("відхиляє невідомий тип активу або від'ємні оцінки", () => {
      expect(
        investmentAssetSchema.safeParse({
          asset_name: "Золото",
          asset_type: "invalid_type",
          invested_amount: 1000,
          current_value: 1000,
        }).success
      ).toBe(false);

      expect(
        investmentAssetSchema.safeParse({
          asset_name: "Акції",
          asset_type: "stocks",
          invested_amount: -100,
          current_value: 100,
        }).success
      ).toBe(false);
    });
  });

  describe("categoryBudgetSchema", () => {
    it("валідує категорійний ліміт", () => {
      const limit = {
        category_name: "Кафе та ресторани",
        monthly_limit: 5000,
      };
      const result = categoryBudgetSchema.safeParse(limit);
      expect(result.success).toBe(true);
    });

    it("відхиляє недійсний ліміт", () => {
      expect(
        categoryBudgetSchema.safeParse({
          category_name: "",
          monthly_limit: 5000,
        }).success
      ).toBe(false);
      expect(
        categoryBudgetSchema.safeParse({
          category_name: "Кафе",
          monthly_limit: -500,
        }).success
      ).toBe(false);
    });
  });
});
