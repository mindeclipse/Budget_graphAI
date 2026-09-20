import { describe, it, expect } from "vitest";
import {
  getCycleDateRange,
  calculateCycleDaysRemaining,
  filterTransactionsByDateRange,
  filterBudgetTransactions,
  DEFAULT_CYCLE_DURATION_DAYS,
  DEFAULT_BUDGET_LIMIT,
  calculateEstimatedCycleEnd,
  getKyivDateIso,
} from "@/lib/cycle-utils";
import { BudgetCycle, Transaction } from "@/types/finance";

describe("Cycle Utils Unit Tests", () => {
  it("експортує коректні стандартні константи", () => {
    expect(DEFAULT_CYCLE_DURATION_DAYS).toBe(30);
    expect(DEFAULT_BUDGET_LIMIT).toBe(35000);
  });

  it("розраховує межі циклу, коли задано і start_date, і end_date", () => {
    const cycle: BudgetCycle = {
      id: "c-1",
      name: "Тестовий цикл",
      start_date: "2026-08-25T00:00:00.000Z",
      end_date: "2026-09-24T00:00:00.000Z",
      budget_limit: 35000,
      is_active: true,
    };

    const range = getCycleDateRange(cycle);
    expect(range.startDate.toISOString()).toBe("2026-08-25T00:00:00.000Z");
    expect(range.endDate.toISOString()).toBe("2026-09-24T00:00:00.000Z");
    expect(range.endMs).toBeGreaterThan(range.startMs);
  });

  it("автоматично додає 30 днів, коли end_date відсутній", () => {
    const cycle: BudgetCycle = {
      id: "c-2",
      name: "Цикл без кінця",
      start_date: "2026-08-01T00:00:00.000Z",
      budget_limit: 30000,
      is_active: true,
    };

    const range = getCycleDateRange(cycle);
    const expectedEndMs =
      new Date("2026-08-01T00:00:00.000Z").getTime() + 30 * 86400000;
    expect(range.endMs).toBe(expectedEndMs);
  });

  it("повертає межі календарного місяця, якщо цикл відсутній", () => {
    const fallbackDate = new Date(2026, 2, 15); // Березень 2026
    const range = getCycleDateRange(null, fallbackDate);

    expect(range.startDate.getFullYear()).toBe(2026);
    expect(range.startDate.getMonth()).toBe(2);
    expect(range.startDate.getDate()).toBe(1);

    expect(range.endDate.getFullYear()).toBe(2026);
    expect(range.endDate.getMonth()).toBe(2);
    expect(range.endDate.getDate()).toBe(31);
  });

  it("розраховує дні до кінця активного циклу", () => {
    const cycle: BudgetCycle = {
      id: "c-3",
      name: "Поточний цикл",
      start_date: "2026-09-01T00:00:00.000Z",
      end_date: "2026-09-20T00:00:00.000Z",
      budget_limit: 30000,
      is_active: true,
    };

    const fallbackDate = new Date(2026, 8, 10); // Вересень
    const now = new Date("2026-09-10T12:00:00.000Z");

    const daysLeft = calculateCycleDaysRemaining(cycle, fallbackDate, now);
    expect(daysLeft).toBe(10);
  });

  it("фільтрує транзакції за діапазоном timestamp", () => {
    const items = [
      { id: 1, created_at: "2026-09-01T10:00:00.000Z" },
      { id: 2, created_at: "2026-09-05T10:00:00.000Z" },
      { id: 3, created_at: "2026-09-15T10:00:00.000Z" },
    ];

    const start = new Date("2026-09-03T00:00:00.000Z").getTime();
    const end = new Date("2026-09-10T00:00:00.000Z").getTime();

    const filtered = filterTransactionsByDateRange(items, start, end);
    expect(filtered.length).toBe(1);
    expect(filtered[0].id).toBe(2);
  });

  it("коректно фільтрує budget transactions за циклом", () => {
    const cycle: BudgetCycle = {
      id: "c-budget",
      name: "Цикл",
      start_date: "2026-09-01T00:00:00.000Z",
      end_date: "2026-09-30T00:00:00.000Z",
      budget_limit: 30000,
      is_active: true,
    };

    const mockTxs: Transaction[] = [
      {
        id: 1,
        amount: 100,
        currency: "UAH",
        merchant_raw: "M1",
        category_name: "Продукти",
        source: "manual",
        type: "expense",
        created_at: "2026-09-05T10:00:00.000Z",
      },
      {
        id: 2,
        amount: 200,
        currency: "UAH",
        merchant_raw: "M2",
        category_name: "Продукти",
        source: "manual",
        type: "expense",
        exclude_from_budget: true, // Повинно відсіятися
        created_at: "2026-09-06T10:00:00.000Z",
      },
      {
        id: 3,
        amount: 500,
        currency: "UAH",
        merchant_raw: "M3",
        category_name: "Зарплата",
        source: "manual",
        type: "income", // Повинно відсіятися
        created_at: "2026-09-07T10:00:00.000Z",
      },
    ];

    const res = filterBudgetTransactions(mockTxs, cycle, true, mockTxs);
    expect(res.length).toBe(1);
    expect(res[0].id).toBe(1);
  });

  describe("calculateEstimatedCycleEnd", () => {
    it("визначає орієнтовний кінець рівно через 1 місяць, якщо цикл активний", () => {
      // Старт 08.09.2026, сьогодні 21.09.2026
      const res = calculateEstimatedCycleEnd(
        "2026-09-08T00:00:00.000Z",
        null,
        "2026-09-21"
      );

      expect(res.startDateIso).toBe("2026-09-08");
      expect(res.nominalEndDateIso).toBe("2026-10-08");
      expect(res.effectiveEndDateIso).toBe("2026-10-08");
      expect(res.isCompleted).toBe(false);
      expect(res.isExtended).toBe(false);
    });

    it("повертає зафіксовану дату завершення, якщо кнопку Новий цикл натиснуто раніше за 1 місяць", () => {
      // Старт 08.09.2026, Новий цикл натиснуто 25.09.2026
      const res = calculateEstimatedCycleEnd(
        "2026-09-08T00:00:00.000Z",
        "2026-09-25T14:30:00.000Z",
        "2026-09-25"
      );

      expect(res.startDateIso).toBe("2026-09-08");
      expect(res.nominalEndDateIso).toBe("2026-09-25");
      expect(res.effectiveEndDateIso).toBe("2026-09-25");
      expect(res.isCompleted).toBe(true);
      expect(res.isExtended).toBe(false);
    });

    it("продовжує цикл щодня до сьогодні, якщо місяць минув, а Новий цикл не розпочато", () => {
      // Старт 08.09.2026, номінальний кінець мав бути 08.10.2026, але сьогодні 15.10.2026
      const res = calculateEstimatedCycleEnd(
        "2026-09-08T00:00:00.000Z",
        null,
        "2026-10-15"
      );

      expect(res.startDateIso).toBe("2026-09-08");
      expect(res.nominalEndDateIso).toBe("2026-10-08");
      expect(res.effectiveEndDateIso).toBe("2026-10-15");
      expect(res.isCompleted).toBe(false);
      expect(res.isExtended).toBe(true);
    });

    it("коректно обмежує кінець циклу довжиною наступного місяця (наприклад 31 січня -> 28 лютого)", () => {
      const res = calculateEstimatedCycleEnd("2026-01-31", null, "2026-02-05");

      expect(res.startDateIso).toBe("2026-01-31");
      expect(res.nominalEndDateIso).toBe("2026-02-28");
      expect(res.effectiveEndDateIso).toBe("2026-02-28");
    });
  });
});
