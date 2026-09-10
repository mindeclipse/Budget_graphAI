import { BudgetCycle, Transaction } from "@/types/finance";

export const DEFAULT_CYCLE_DURATION_DAYS = 30;
export const DEFAULT_BUDGET_LIMIT = 30000;

export interface CycleDateRange {
  startDate: Date;
  endDate: Date;
  startMs: number;
  endMs: number;
}

/**
 * Отримує точні межі періоду для активного циклу або календарного місяця (якщо цикл відсутній).
 */
export function getCycleDateRange(
  cycle?: BudgetCycle | null,
  fallbackDate: Date = new Date()
): CycleDateRange {
  if (cycle && cycle.start_date) {
    const startDate = new Date(cycle.start_date);
    const endDate = cycle.end_date
      ? new Date(cycle.end_date)
      : new Date(
          startDate.getTime() + DEFAULT_CYCLE_DURATION_DAYS * 24 * 60 * 60 * 1000
        );

    return {
      startDate,
      endDate,
      startMs: startDate.getTime(),
      endMs: endDate.getTime(),
    };
  }

  const year = fallbackDate.getFullYear();
  const month = fallbackDate.getMonth();
  const startDate = new Date(year, month, 1, 0, 0, 0, 0);
  const endDate = new Date(year, month + 1, 0, 23, 59, 59, 999);

  return {
    startDate,
    endDate,
    startMs: startDate.getTime(),
    endMs: endDate.getTime(),
  };
}

/**
 * Розраховує кількість днів, що залишилися до кінця активного циклу або поточного місяця.
 */
export function calculateCycleDaysRemaining(
  cycle?: BudgetCycle | null,
  fallbackDate: Date = new Date(),
  now: Date = new Date()
): number {
  const isCurrentMonth =
    now.getFullYear() === fallbackDate.getFullYear() &&
    now.getMonth() === fallbackDate.getMonth();

  if (cycle && cycle.start_date && isCurrentMonth) {
    const range = getCycleDateRange(cycle, fallbackDate);
    const diffMs = range.endDate.getTime() - now.getTime();
    const msPerDay = 1000 * 60 * 60 * 24;
    return Math.max(0, Math.ceil(diffMs / msPerDay));
  }

  if (isCurrentMonth) {
    const totalDaysInMonth = new Date(
      fallbackDate.getFullYear(),
      fallbackDate.getMonth() + 1,
      0
    ).getDate();
    return Math.max(1, totalDaysInMonth - now.getDate() + 1);
  }

  return 0;
}

/**
 * Фільтрує список сутностей (транзакцій) за часовим вікном [startMs, endMs].
 */
export function filterTransactionsByDateRange<T extends { created_at: string }>(
  items: T[],
  startMs: number,
  endMs: number
): T[] {
  return items.filter((item) => {
    const time = new Date(item.created_at).getTime();
    return time >= startMs && time <= endMs;
  });
}

/**
 * Фільтрує транзакції, що входять у ліміт витрат активного циклу (витрати, що не виключені з бюджету).
 */
export function filterBudgetTransactions(
  transactions: Transaction[],
  activeCycle: BudgetCycle | null | undefined,
  isCurrentMonth: boolean,
  monthTransactions: Transaction[]
): Transaction[] {
  if (!isCurrentMonth || !activeCycle || !activeCycle.start_date) {
    return monthTransactions;
  }

  const cycleStart = new Date(activeCycle.start_date).getTime();
  const cycleEnd = activeCycle.end_date
    ? new Date(activeCycle.end_date).getTime()
    : Infinity;

  return transactions.filter((t) => {
    if (t.exclude_from_budget || t.type !== "expense") return false;
    const txTime = new Date(t.created_at).getTime();
    return txTime >= cycleStart && txTime <= cycleEnd;
  });
}
