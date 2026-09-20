import { BudgetCycle, Transaction } from "@/types/finance";

export const DEFAULT_CYCLE_DURATION_DAYS = 30;
export const FALLBACK_BUDGET_LIMIT = 35000;
export const DEFAULT_BUDGET_LIMIT = FALLBACK_BUDGET_LIMIT;

export interface CycleDateRange {
  startDate: Date;
  endDate: Date;
  startMs: number;
  endMs: number;
}

/**
 * Отримує YYYY-MM-DD для поточної дати за київським часом
 */
export function getKyivDateIso(d: Date = new Date()): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Kyiv",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(d);
  } catch {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }
}

export interface EstimatedCycleEndResult {
  startDateIso: string;
  nominalEndDateIso: string;
  effectiveEndDateIso: string;
  isCompleted: boolean;
  isExtended: boolean;
}

/**
 * Розраховує орієнтовну або актуальну дату закінчення циклу:
 * 1. Якщо цикл завершено (є end_date), повертає збережену дату end_date.
 * 2. Якщо цикл активний (end_date немає):
 *    - За замовчуванням: орієнтовно рівно 1 місяць після start_date (наприклад 08.09 -> 08.10).
 *    - Якщо 1 місяць уже минув (сьогодні > номінального кінця), а новий цикл ще не розпочато,
 *      продовжує цикл далі і щодня оновлює дату кінця на поточну дату (todayIso).
 */
export function calculateEstimatedCycleEnd(
  startDateStr: string,
  endDateStr?: string | null,
  todayIso: string = getKyivDateIso()
): EstimatedCycleEndResult {
  const startDateIso = startDateStr.slice(0, 10);

  if (endDateStr) {
    const closedEndIso = endDateStr.slice(0, 10);
    return {
      startDateIso,
      nominalEndDateIso: closedEndIso,
      effectiveEndDateIso: closedEndIso,
      isCompleted: true,
      isExtended: false,
    };
  }

  // Розрахунок 1 місяця після дати початку:
  const [y, m, d] = startDateIso.split("-").map(Number);
  let targetYear = y;
  let targetMonth = m + 1; // 1-indexed: наступний місяць
  if (targetMonth > 12) {
    targetMonth = 1;
    targetYear += 1;
  }
  const daysInTargetMonth = new Date(targetYear, targetMonth, 0).getDate();
  const clampedDay = Math.min(d, daysInTargetMonth);
  const nominalEndDateIso = `${targetYear}-${String(targetMonth).padStart(2, "0")}-${String(clampedDay).padStart(2, "0")}`;

  const isExtended = todayIso > nominalEndDateIso;
  const effectiveEndDateIso = isExtended ? todayIso : nominalEndDateIso;

  return {
    startDateIso,
    nominalEndDateIso,
    effectiveEndDateIso,
    isCompleted: false,
    isExtended,
  };
}

/**
 * Отримує точні межі періоду для активного циклу або календарного місяця (якщо цикл відсутній).
 */
export function getCycleDateRange(
  cycle?: Partial<BudgetCycle> | null,
  fallbackDate: Date = new Date()
): CycleDateRange {
  if (cycle && cycle.start_date) {
    const startDate = new Date(cycle.start_date);
    const endDate = cycle.end_date
      ? new Date(cycle.end_date)
      : new Date(
          startDate.getTime() +
            DEFAULT_CYCLE_DURATION_DAYS * 24 * 60 * 60 * 1000
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
  cycle?: Partial<BudgetCycle> | null,
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
  activeCycle: Partial<BudgetCycle> | null | undefined,
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
