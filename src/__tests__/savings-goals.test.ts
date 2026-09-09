import { describe, it, expect } from "vitest";
import {
  calculateSavingsMetrics,
  convertToUah,
} from "@/components/dashboard/SavingsGoalsCard";
import { savingsGoalUpdateSchema } from "@/lib/validations";
import { SavingsGoal } from "@/types/finance";

describe("SavingsGoalsCard - calculateSavingsMetrics", () => {
  const mockRates = {
    USD: 41.5,
    EUR: 45.3,
    PLN: 10.6,
  };

  it("коректно розраховує збереження для єдиної валюти USD (випадок користувача 2 470 USD)", () => {
    const goals: SavingsGoal[] = [
      {
        id: 1,
        name: "Збереження",
        current_amount: 2470,
        target_amount: 5000,
        currency: "USD",
        created_at: "2026-09-01T00:00:00Z",
      },
    ];

    const metrics = calculateSavingsMetrics(goals, 294, mockRates);

    // Валюта має бути USD, а не UAH
    expect(metrics.activeCurrencies).toEqual(["USD"]);
    expect(metrics.currencyTotals.USD.current).toBe(2470);
    expect(metrics.currencyTotals.USD.target).toBe(5000);
    expect(metrics.currencyTotals.USD.hasTarget).toBe(true);

    // Еквівалент у гривні: 2 470 * 41.5 = 102 505 грн
    expect(metrics.totalSavedUahEquivalent).toBe(102505);

    // Runway: 102 505 / 294 = ~348.7 міс. (а не 8.4 міс., як було при помилковому діленні без курсу)
    expect(parseFloat(metrics.runwayMonths)).toBeGreaterThan(340);
  });

  it("коректно групує мультивалютні заощадження (UAH, USD, EUR)", () => {
    const goals: SavingsGoal[] = [
      {
        id: 1,
        name: "Гривнева подушка",
        current_amount: 50000,
        target_amount: 100000,
        currency: "UAH",
        created_at: "2026-09-01T00:00:00Z",
      },
      {
        id: 2,
        name: "Доларовий резерв",
        current_amount: 2000,
        target_amount: 5000,
        currency: "USD",
        created_at: "2026-09-01T00:00:00Z",
      },
      {
        id: 3,
        name: "Євро на відпустку",
        current_amount: 1000,
        target_amount: null,
        currency: "EUR",
        created_at: "2026-09-01T00:00:00Z",
      },
    ];

    const metrics = calculateSavingsMetrics(goals, 30000, mockRates);

    expect(metrics.activeCurrencies).toContain("UAH");
    expect(metrics.activeCurrencies).toContain("USD");
    expect(metrics.activeCurrencies).toContain("EUR");

    expect(metrics.currencyTotals.UAH.current).toBe(50000);
    expect(metrics.currencyTotals.USD.current).toBe(2000);
    expect(metrics.currencyTotals.EUR.current).toBe(1000);

    // Перевірка прапорця hasTarget
    expect(metrics.currencyTotals.UAH.hasTarget).toBe(true);
    expect(metrics.currencyTotals.USD.hasTarget).toBe(true);
    expect(metrics.currencyTotals.EUR.hasTarget).toBe(false);

    // Загальний еквівалент: 50000 + (2000 * 41.5) + (1000 * 45.3) = 50000 + 83000 + 45300 = 178300 грн
    expect(metrics.totalSavedUahEquivalent).toBe(178300);
    // Runway: 178300 / 30000 = ~5.9 міс.
    expect(metrics.runwayMonths).toBe("5.9");
  });

  it("підтримує безцільові скарбнички (target_amount: null або 0)", () => {
    const goals: SavingsGoal[] = [
      {
        id: 1,
        name: "Скарбничка без мети",
        current_amount: 15000,
        target_amount: null,
        currency: "UAH",
        created_at: "2026-09-01T00:00:00Z",
      },
      {
        id: 2,
        name: "Скарбничка 0",
        current_amount: 5000,
        target_amount: 0,
        currency: "UAH",
        created_at: "2026-09-01T00:00:00Z",
      },
    ];

    const metrics = calculateSavingsMetrics(goals, 20000, mockRates);

    expect(metrics.currencyTotals.UAH.current).toBe(20000);
    expect(metrics.currencyTotals.UAH.target).toBe(0);
    expect(metrics.currencyTotals.UAH.hasTarget).toBe(false);
    expect(metrics.totalSavedUahEquivalent).toBe(20000);
    expect(metrics.runwayMonths).toBe("1.0");
  });

  it("безпечно обробляє порожній список цілей", () => {
    const metrics = calculateSavingsMetrics([], 25000, mockRates);

    expect(metrics.activeCurrencies).toEqual([]);
    expect(metrics.totalSavedUahEquivalent).toBe(0);
    expect(metrics.runwayMonths).toBe("0.0");
  });

  describe("convertToUah helper", () => {
    it("правильно конвертує суми за курсом або повертає UAH", () => {
      expect(convertToUah(100, "USD", mockRates)).toBe(4150);
      expect(convertToUah(100, "EUR", mockRates)).toBe(4530);
      expect(convertToUah(100, "PLN", mockRates)).toBe(1060);
      expect(convertToUah(100, "UAH", mockRates)).toBe(100);
      expect(convertToUah(0, "USD", mockRates)).toBe(0);
    });
  });

  describe("savingsGoalUpdateSchema - редагування суми заощаджень", () => {
    it("дозволяє оновлення поточної суми збережень (current_amount)", () => {
      const updateData = {
        id: 1,
        name: "Збереження ₴ кеш",
        current_amount: 15000,
        target_amount: null,
        currency: "UAH",
      };

      const result = savingsGoalUpdateSchema.safeParse(updateData);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.current_amount).toBe(15000);
        expect(result.data.target_amount).toBeNull();
      }
    });

    it("підтримує числове приведення рядкових сум при редагуванні", () => {
      const updateStringData = {
        id: 2,
        current_amount: "2470.50",
      };

      const result = savingsGoalUpdateSchema.safeParse(updateStringData);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.current_amount).toBe(2470.5);
      }
    });

    it("відхиляє від'ємні значення суми збережень", () => {
      const invalidData = {
        id: 3,
        current_amount: -500,
      };

      const result = savingsGoalUpdateSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });
  });
});
