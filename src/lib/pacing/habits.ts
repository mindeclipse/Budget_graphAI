import { Transaction } from "@/types/finance";
import { getKyivDateString, getKyivDayOfWeek } from "@/lib/behavioral-metrics";
import {
  NEW_HABITS_BASELINE,
  NEW_HABITS_BASELINE_MS,
  CalibratedHabits,
} from "./types";
import { getEffectiveTransactionExpense } from "./amortization";

/**
 * Перевіряє, чи день відноситься до вихідних / leisure днів (П'ятниця = 5, Субота = 6, Неділя = 0)
 */
export function isWeekendOrLeisureDay(dayOfWeek: number): boolean {
  return dayOfWeek === 0 || dayOfWeek === 5 || dayOfWeek === 6;
}

/**
 * Калібрує патерни витрат за транзакціями суворо від 15 серпня 2026 року
 * із застосуванням експоненційного зважування (EMA Rolling Habit Learning, період напіврозпаду 14 днів)
 */
export function calibrateHabitsFromBaseline(
  transactions: Transaction[],
  referenceDate: Date = new Date()
): CalibratedHabits {
  // 1. Фільтрація: тільки валідні витрати від базової лінії
  // Форс-мажори та екстрені витрати виключаються з калібрування звичок,
  // щоб випадкова аварійна подія не спотворювала коефіцієнт стилю життя (alpha).
  const validTx = transactions.filter((t) => {
    if (t.type !== "expense" || t.exclude_from_budget || t.deleted_at) {
      return false;
    }
    const isEmergency =
      Boolean(t.metadata?.is_emergency) ||
      (Array.isArray(t.tags) && t.tags.includes("форсмажор"));
    if (isEmergency) {
      return false;
    }
    const rawDate = t.created_at || (t as any).date;
    if (!rawDate) return false;
    const tMs = new Date(rawDate).getTime();
    if (isNaN(tMs)) return false;
    return tMs >= NEW_HABITS_BASELINE_MS;
  });

  // 2. Групування за унікальними календарними днями Києва
  const dailySpendMap = new Map<
    string,
    { spend: number; dayOfWeek: number; dateMs: number }
  >();
  let totalCalibratedSpend = 0;

  for (const tx of validTx) {
    const rawDate = tx.created_at || (tx as any).date;
    const kyivDay = getKyivDateString(rawDate);
    const dayOfWeek = getKyivDayOfWeek(rawDate);
    const dateMs = new Date(rawDate).getTime();
    const amt = getEffectiveTransactionExpense(tx);

    totalCalibratedSpend += amt;

    const existing = dailySpendMap.get(kyivDay);
    if (existing) {
      existing.spend += amt;
    } else {
      dailySpendMap.set(kyivDay, { spend: amt, dayOfWeek, dateMs });
    }
  }

  let weekdayDaysCount = 0;
  let weekendDaysCount = 0;
  let weekdayTotalSpend = 0;
  let weekendTotalSpend = 0;

  // Для EMA розрахунку: період напіврозпаду 14 днів (lambda = ln(2) / 14 ~ 0.0495)
  const msPerDay = 1000 * 60 * 60 * 24;
  const refTime = referenceDate.getTime();
  const HALF_LIFE_DAYS = 14;
  const DECAY_LAMBDA = Math.log(2) / HALF_LIFE_DAYS;

  let emaWeekdayWeightedSpend = 0;
  let emaWeekdayWeightSum = 0;
  let emaWeekendWeightedSpend = 0;
  let emaWeekendWeightSum = 0;

  for (const [, dayData] of dailySpendMap.entries()) {
    const deltaDays = Math.max(0, (refTime - dayData.dateMs) / msPerDay);
    const weight = Math.exp(-DECAY_LAMBDA * deltaDays);

    if (isWeekendOrLeisureDay(dayData.dayOfWeek)) {
      weekendDaysCount++;
      weekendTotalSpend += dayData.spend;
      emaWeekendWeightedSpend += dayData.spend * weight;
      emaWeekendWeightSum += weight;
    } else {
      weekdayDaysCount++;
      weekdayTotalSpend += dayData.spend;
      emaWeekdayWeightedSpend += dayData.spend * weight;
      emaWeekdayWeightSum += weight;
    }
  }

  const weekdayDailyAvg =
    weekdayDaysCount > 0 ? Math.round(weekdayTotalSpend / weekdayDaysCount) : 0;
  const weekendDailyAvg =
    weekendDaysCount > 0 ? Math.round(weekendTotalSpend / weekendDaysCount) : 0;

  const emaWeekdayDailyAvg =
    emaWeekdayWeightSum > 0
      ? Math.round(emaWeekdayWeightedSpend / emaWeekdayWeightSum)
      : weekdayDailyAvg;
  const emaWeekendDailyAvg =
    emaWeekendWeightSum > 0
      ? Math.round(emaWeekendWeightedSpend / emaWeekendWeightSum)
      : weekendDailyAvg;

  // Визначення коефіцієнтів alpha
  const isSufficientData = weekdayDaysCount >= 2 && weekendDaysCount >= 2;
  let weekendToWeekdayRatio = 1.35;
  let emaWeekendToWeekdayRatio = 1.35;

  if (isSufficientData && weekdayDailyAvg > 0) {
    const rawRatio = weekendDailyAvg / weekdayDailyAvg;
    weekendToWeekdayRatio = Number(
      Math.max(0.75, Math.min(2.5, rawRatio)).toFixed(2)
    );
  }

  if (isSufficientData && emaWeekdayDailyAvg > 0) {
    const rawEmaRatio = emaWeekendDailyAvg / emaWeekdayDailyAvg;
    emaWeekendToWeekdayRatio = Number(
      Math.max(0.75, Math.min(2.5, rawEmaRatio)).toFixed(2)
    );
  }

  return {
    baselineDate: NEW_HABITS_BASELINE,
    totalCalibratedTx: validTx.length,
    totalCalibratedSpend: Math.round(totalCalibratedSpend),
    weekdayDaysCount,
    weekendDaysCount,
    weekdayTotalSpend: Math.round(weekdayTotalSpend),
    weekendTotalSpend: Math.round(weekendTotalSpend),
    weekdayDailyAvg,
    weekendDailyAvg,
    weekendToWeekdayRatio,
    emaWeekdayDailyAvg,
    emaWeekendDailyAvg,
    emaWeekendToWeekdayRatio,
    isSufficientData,
  };
}
