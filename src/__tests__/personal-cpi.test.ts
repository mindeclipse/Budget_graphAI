import { describe, it, expect } from "vitest";
import {
  calculatePersonalCpi,
  DEFAULT_STAPLE_CATEGORIES,
  CpiTransaction,
} from "@/lib/personal-cpi";

describe("Personal CPI Analytics Engine", () => {
  describe("Staple Categories Matching", () => {
    it("правильно визначає продукти і супермаркети", () => {
      const groceries = DEFAULT_STAPLE_CATEGORIES.find(
        (c) => c.key === "groceries"
      );
      expect(groceries?.matches("Продукти")).toBe(true);
      expect(groceries?.matches("продукти")).toBe(true);
      expect(groceries?.matches("Супермаркети")).toBe(true);
      expect(groceries?.matches("Продукти харчування")).toBe(true);
      expect(groceries?.matches("Кафе")).toBe(false);
    });

    it("правильно визначає категорію Куріння", () => {
      const smoking = DEFAULT_STAPLE_CATEGORIES.find(
        (c) => c.key === "smoking"
      );
      expect(smoking?.matches("Куріння")).toBe(true);
      expect(smoking?.matches("куріння")).toBe(true);
      expect(smoking?.matches("Тютюн")).toBe(true);
      expect(smoking?.matches("Сигарети")).toBe(true);
      expect(smoking?.matches("Одяг")).toBe(false);
    });

    it("правильно визначає аптеки і здоров'я", () => {
      const health = DEFAULT_STAPLE_CATEGORIES.find((c) => c.key === "health");
      expect(health?.matches("Здоров'я та догляд")).toBe(true);
      expect(health?.matches("Аптека")).toBe(true);
      expect(health?.matches("Ліки")).toBe(true);
      expect(health?.matches("Шопінг")).toBe(false);
    });
  });

  describe("Розрахунок середнього чека та інфляції (AOV & Inflation)", () => {
    it("коректно розраховує зростання середнього чека між періодами", () => {
      const prevTransactions: CpiTransaction[] = [
        {
          amount: 400,
          category_name: "Продукти",
          created_at: "2026-01-10",
          type: "expense",
        },
        {
          amount: 600,
          category_name: "Продукти",
          created_at: "2026-01-15",
          type: "expense",
        },
        // Середній чек супермаркету = (400 + 600) / 2 = 500
      ];

      const currentTransactions: CpiTransaction[] = [
        {
          amount: 550,
          category_name: "Продукти",
          created_at: "2026-08-10",
          type: "expense",
        },
        {
          amount: 650,
          category_name: "Продукти",
          created_at: "2026-08-15",
          type: "expense",
        },
        // Середній чек супермаркету = (550 + 650) / 2 = 600
        // Інфляція = (600 - 500) / 500 = +20.0%
      ];

      const report = calculatePersonalCpi(
        currentTransactions,
        prevTransactions
      );
      const groceryStat = report.basketStats.find(
        (s) => s.categoryKey === "groceries"
      );

      expect(groceryStat?.previousAvgCheck).toBe(500);
      expect(groceryStat?.currentAvgCheck).toBe(600);
      expect(groceryStat?.inflationRate).toBe(20.0);
      expect(report.overallInflationRate).toBe(20.0);
    });

    it("відсікає мікро-транзакції (шум < 20 грн)", () => {
      const prevTransactions: CpiTransaction[] = [
        {
          amount: 10,
          category_name: "Продукти",
          created_at: "2026-01-05",
          type: "expense",
        }, // пакет -> ігнорується
        {
          amount: 500,
          category_name: "Продукти",
          created_at: "2026-01-10",
          type: "expense",
        },
      ];

      const currentTransactions: CpiTransaction[] = [
        {
          amount: 15,
          category_name: "Продукти",
          created_at: "2026-08-05",
          type: "expense",
        }, // жуйка -> ігнорується
        {
          amount: 500,
          category_name: "Продукти",
          created_at: "2026-08-10",
          type: "expense",
        },
      ];

      const report = calculatePersonalCpi(
        currentTransactions,
        prevTransactions
      );
      const groceryStat = report.basketStats.find(
        (s) => s.categoryKey === "groceries"
      );

      expect(groceryStat?.previousAvgCheck).toBe(500);
      expect(groceryStat?.currentAvgCheck).toBe(500);
      expect(groceryStat?.currentTxCount).toBe(1);
      expect(groceryStat?.previousTxCount).toBe(1);
      expect(groceryStat?.inflationRate).toBe(0.0);
    });

    it("ігнорує доходи та інвестиції, враховує лише витрати (type === expense)", () => {
      const prevTransactions: CpiTransaction[] = [
        {
          amount: 5000,
          category_name: "Продукти",
          created_at: "2026-01-05",
          type: "income",
        },
        {
          amount: 200,
          category_name: "Продукти",
          created_at: "2026-01-10",
          type: "expense",
        },
      ];

      const currentTransactions: CpiTransaction[] = [
        {
          amount: 10000,
          category_name: "Продукти",
          created_at: "2026-08-05",
          type: "investment",
        },
        {
          amount: 250,
          category_name: "Продукти",
          created_at: "2026-08-10",
          type: "expense",
        },
      ];

      const report = calculatePersonalCpi(
        currentTransactions,
        prevTransactions
      );
      const groceryStat = report.basketStats.find(
        (s) => s.categoryKey === "groceries"
      );

      expect(groceryStat?.previousAvgCheck).toBe(200);
      expect(groceryStat?.currentAvgCheck).toBe(250);
      expect(groceryStat?.inflationRate).toBe(25.0);
    });

    it("коректно розраховує зважену інфляцію для кількох категорій кошика", () => {
      const prevTransactions: CpiTransaction[] = [
        // Продукти: 1 чек на 500
        {
          amount: 500,
          category_name: "Продукти",
          created_at: "2026-01-10",
          type: "expense",
        },
        // Куріння: 1 чек на 150
        {
          amount: 150,
          category_name: "Куріння",
          created_at: "2026-01-12",
          type: "expense",
        },
        // Загальний попередній середній чек кошика = (500 + 150) / 2 = 325
      ];

      const currentTransactions: CpiTransaction[] = [
        // Продукти: 1 чек на 600 (+20%)
        {
          amount: 600,
          category_name: "Продукти",
          created_at: "2026-08-10",
          type: "expense",
        },
        // Куріння: 1 чек на 160 (+6.7%)
        {
          amount: 160,
          category_name: "Куріння",
          created_at: "2026-08-12",
          type: "expense",
        },
        // Загальний поточний середній чек кошика = (600 + 160) / 2 = 380
        // Загальна інфляція = (380 - 325) / 325 = +16.9%
      ];

      const report = calculatePersonalCpi(
        currentTransactions,
        prevTransactions
      );

      expect(
        report.basketStats.find((s) => s.categoryKey === "groceries")
          ?.inflationRate
      ).toBe(20.0);
      expect(
        report.basketStats.find((s) => s.categoryKey === "smoking")
          ?.inflationRate
      ).toBe(6.7);
      expect(report.overallInflationRate).toBe(16.9);
      expect(report.totalCurrentBasketSpend).toBe(760);
      expect(report.totalPreviousBasketSpend).toBe(650);
    });

    it("безпечно обробляє порожні списки транзакцій без ділення на нуль", () => {
      const report = calculatePersonalCpi([], []);
      expect(report.overallInflationRate).toBeNull();
      expect(report.basketStats.every((s) => s.inflationRate === null)).toBe(
        true
      );
      expect(report.totalCurrentBasketSpend).toBe(0);
      expect(report.totalPreviousBasketSpend).toBe(0);
    });

    it("повертає null для категорії, якщо в одному з періодів 0 покупок", () => {
      const prevTransactions: CpiTransaction[] = [
        {
          amount: 400,
          category_name: "Продукти",
          created_at: "2026-01-10",
          type: "expense",
        },
      ];
      // У поточному періоді немає купівель в аптеках
      const currentTransactions: CpiTransaction[] = [
        {
          amount: 400,
          category_name: "Продукти",
          created_at: "2026-08-10",
          type: "expense",
        },
        {
          amount: 300,
          category_name: "Здоров'я та догляд",
          created_at: "2026-08-12",
          type: "expense",
        },
      ];

      const report = calculatePersonalCpi(
        currentTransactions,
        prevTransactions
      );
      const healthStat = report.basketStats.find(
        (s) => s.categoryKey === "health"
      );

      expect(healthStat?.previousTxCount).toBe(0);
      expect(healthStat?.currentTxCount).toBe(1);
      expect(healthStat?.inflationRate).toBeNull();
    });

    it("підтримує налаштування режимів періоду (yoy, baseline, mom)", () => {
      const report = calculatePersonalCpi([], [], {
        periodMode: "yoy",
        currentPeriodLabel: "Серпень 2026",
        previousPeriodLabel: "Серпень 2025",
      });

      expect(report.periodMode).toBe("yoy");
      expect(report.periodLabel).toBe("Серпень 2026");
      expect(report.previousPeriodLabel).toBe("Серпень 2025");
    });
  });
});
