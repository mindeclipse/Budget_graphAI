import { describe, it, expect } from "vitest";
import {
  isPiggyBank,
  convertToUah,
  calculateCapitalYieldMetrics,
} from "@/lib/portfolio-analytics";
import { InvestmentAsset, SavingsGoal } from "@/types/finance";

describe("Portfolio & Capital Analytics (Yield & Annual Profit)", () => {
  describe("isPiggyBank - Класифікація Скарбнички vs Ціль", () => {
    it("визначає як вільну Скарбничку, якщо цільова сума та дедлайн відсутні (кеш, сейф)", () => {
      const piggy: SavingsGoal = {
        id: 1,
        name: "Збереження $ Кеш",
        target_amount: null,
        current_amount: 2470,
        currency: "USD",
        target_date: null,
        created_at: "2026-09-09T00:00:00Z",
      };
      expect(isPiggyBank(piggy)).toBe(true);
    });

    it("визначає як вільну Скарбничку, якщо є ціль, але немає дедлайну", () => {
      const piggy: SavingsGoal = {
        id: 2,
        name: "Сейф",
        target_amount: 50000,
        current_amount: 10000,
        currency: "UAH",
        target_date: null,
        created_at: "2026-09-09T00:00:00Z",
      };
      expect(isPiggyBank(piggy)).toBe(true);
    });

    it("визначає як вільну Скарбничку, якщо є дата, але немає цільової суми", () => {
      const piggy: SavingsGoal = {
        id: 3,
        name: "Відпустка",
        target_amount: null,
        current_amount: 15000,
        currency: "UAH",
        target_date: "2026-12-31",
        created_at: "2026-09-09T00:00:00Z",
      };
      expect(isPiggyBank(piggy)).toBe(true);
    });

    it("НЕ вважає Скарбничкою повноцінну Ціль (наявна і цільова сума, і дедлайн)", () => {
      const goal: SavingsGoal = {
        id: 4,
        name: "Купівля авто",
        target_amount: 400000,
        current_amount: 50000,
        currency: "UAH",
        target_date: "2027-06-30",
        created_at: "2026-09-09T00:00:00Z",
      };
      expect(isPiggyBank(goal)).toBe(false);
    });
  });

  describe("convertToUah - Мультивалютна конвертація", () => {
    const rates = { USD: 41.5, EUR: 45.3, PLN: 10.6 };

    it("конвертує UAH без змін", () => {
      expect(convertToUah(1000, "UAH", rates)).toBe(1000);
      expect(convertToUah(500, "", rates)).toBe(500);
    });

    it("конвертує іноземні валюти за комерційним курсом", () => {
      expect(convertToUah(100, "USD", rates)).toBe(4150);
      expect(convertToUah(100, "EUR", rates)).toBe(4530);
      expect(convertToUah(100, "PLN", rates)).toBe(1060);
    });
  });

  describe("calculateCapitalYieldMetrics - Повний розрахунок дохідності", () => {
    // Реалістичні тестові дані активів користувача з бази Supabase
    const mockInvestments: InvestmentAsset[] = [
      {
        id: 1,
        asset_name: "ОВДП UA4000237416",
        asset_type: "bonds",
        invested_amount: 49597.8,
        current_value: 51577.4,
        currency: "UAH",
        yield_percent: 14.3,
        created_at: "2026-09-09T00:00:00Z",
      },
      {
        id: 2,
        asset_name: "ОВДП UA4000238281",
        asset_type: "bonds",
        invested_amount: 30472.2,
        current_value: 31200.6,
        currency: "UAH",
        yield_percent: 15.1,
        created_at: "2026-09-09T00:00:00Z",
      },
      {
        id: 3,
        asset_name: "ОВДП UA4000238976",
        asset_type: "bonds",
        invested_amount: 112391.41,
        current_value: 114083.56,
        currency: "UAH",
        yield_percent: 15.55,
        created_at: "2026-09-09T00:00:00Z",
      },
      {
        id: 4,
        asset_name: "Inzhur REIT",
        asset_type: "reit",
        invested_amount: 21059.29,
        current_value: 23530.88,
        currency: "UAH",
        yield_percent: 19.32,
        created_at: "2026-09-09T00:00:00Z",
      },
      {
        id: 5,
        asset_name: "Криптодепозит Whitebit",
        asset_type: "crypto",
        invested_amount: 19640,
        current_value: 22557.6,
        currency: "UAH",
        yield_percent: 18.64,
        created_at: "2026-09-09T00:00:00Z",
      },
    ];

    const mockSavingsGoals: SavingsGoal[] = [
      {
        id: 3,
        name: "Збереження $ Кеш",
        target_amount: null,
        current_amount: 2470,
        currency: "USD",
        target_date: null,
        created_at: "2026-09-09T00:00:00Z",
      },
      {
        id: 5,
        name: "Збереження € Кеш",
        target_amount: null,
        current_amount: 410,
        currency: "EUR",
        target_date: null,
        created_at: "2026-09-09T00:00:00Z",
      },
      {
        id: 6,
        name: "Збереження ₴ Кеш",
        target_amount: null,
        current_amount: 14500,
        currency: "UAH",
        target_date: null,
        created_at: "2026-09-09T00:00:00Z",
      },
      {
        id: 10,
        name: "Ціль: Ремонт (не вільна скарбничка)",
        target_amount: 100000,
        current_amount: 20000,
        currency: "UAH",
        target_date: "2027-01-01",
        created_at: "2026-09-09T00:00:00Z",
      },
    ];

    const rates = { USD: 42.1, EUR: 46.5, PLN: 10.6 };

    it("розраховує річний прибуток та середньозважену ставку (~10.18% та ~38 874 ₴)", () => {
      const result = calculateCapitalYieldMetrics({
        investments: mockInvestments,
        savingsGoals: mockSavingsGoals,
        rates,
      });

      // Інвестиційний портфель окремо:
      expect(result.investmentsCount).toBe(5);
      expect(result.investmentsValueUah).toBeCloseTo(242950.04, 0);

      // Прогнозований річний прибуток від активів:
      // ~38 577 - 38 874 ₴ / рік
      expect(result.projectedAnnualProfitUah).toBeGreaterThan(38000);
      expect(result.projectedAnnualProfitUah).toBeLessThan(39500);

      // Місячний прибуток:
      expect(result.projectedMonthlyProfitUah).toBeCloseTo(
        result.projectedAnnualProfitUah / 12,
        2
      );

      // Лише інвестиції дають ~15.9% річних:
      expect(result.investmentsOnlyYieldPercent).toBeCloseTo(15.88, 1);

      // Вільні скарбнички враховані (3 шт), а ціль на ремонт (id 10) окремо:
      expect(result.savingsCount).toBe(3);
      expect(result.goalsCount).toBe(1);

      // Загальна база капіталу:
      expect(result.totalCapitalBaseUah).toBeCloseTo(380500, -2);

      // Середньозважена доходність з урахуванням скарбничок становить ~10.1% - 10.2%:
      expect(result.weightedYieldPercent).toBeGreaterThan(10.0);
      expect(result.weightedYieldPercent).toBeLessThan(10.3);
    });

    it("коректно обробляє порожній портфель без помилок ділення на нуль", () => {
      const result = calculateCapitalYieldMetrics({
        investments: [],
        savingsGoals: [],
      });

      expect(result.totalCapitalBaseUah).toBe(0);
      expect(result.projectedAnnualProfitUah).toBe(0);
      expect(result.projectedMonthlyProfitUah).toBe(0);
      expect(result.weightedYieldPercent).toBe(0);
      expect(result.investmentsOnlyYieldPercent).toBe(0);
      expect(result.investmentsCount).toBe(0);
      expect(result.savingsCount).toBe(0);
    });
  });
});
