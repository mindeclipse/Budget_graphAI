import { Transaction } from "@/types/finance";
import { getKyivDateString } from "@/lib/behavioral-metrics";
import {
  NEW_HABITS_BASELINE,
  WeightedPacingOptions,
  WeightedPacingResult,
} from "./types";
import { getEffectiveTransactionExpense } from "./amortization";
import { calibrateHabitsFromBaseline, isWeekendOrLeisureDay } from "./habits";

/**
 * Перевіряє, чи припадає число регулярного платежу на залишок активного циклу
 */
export function isObligationDueInRemainingCycle(
  dayOfMonth: number,
  startKyivStr: string,
  endKyivStr: string
): boolean {
  if (dayOfMonth < 1 || dayOfMonth > 31) return false;
  const [sYear, sMonth, sDay] = startKyivStr.split("-").map(Number);
  const [eYear, eMonth, eDay] = endKyivStr.split("-").map(Number);
  const cur = new Date(Date.UTC(sYear, sMonth - 1, sDay));
  const end = new Date(Date.UTC(eYear, eMonth - 1, eDay));
  while (cur <= end) {
    if (cur.getUTCDate() === dayOfMonth) {
      return true;
    }
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return false;
}

/**
 * Розраховує зважений календарний темп на залишок циклу та прогноз профіциту
 */
export function calculateWeightedCalendarPacing(
  transactions: Transaction[],
  options: WeightedPacingOptions = {}
): WeightedPacingResult {
  const now = options.now instanceof Date ? options.now : new Date();
  const habits = calibrateHabitsFromBaseline(transactions, now);

  // Визначаємо часові межі циклу
  const safeStart =
    options.startDate instanceof Date && !isNaN(options.startDate.getTime())
      ? options.startDate
      : new Date(now.getFullYear(), now.getMonth(), 1);

  const safeEnd =
    options.endDate instanceof Date && !isNaN(options.endDate.getTime())
      ? options.endDate
      : new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

  const msPerDay = 1000 * 60 * 60 * 24;
  const daysTotal = Math.max(
    1,
    Math.round((safeEnd.getTime() - safeStart.getTime()) / msPerDay)
  );

  const effectiveNow =
    now > safeEnd ? safeEnd : now < safeStart ? safeStart : now;

  const daysPassed = Math.max(
    1,
    Math.min(
      daysTotal,
      Math.ceil((effectiveNow.getTime() - safeStart.getTime()) / msPerDay)
    )
  );
  const daysRemaining = Math.max(0, daysTotal - daysPassed);

  // Розраховуємо структуру днів, що залишилися (Будні vs Вихідні)
  let remainingWeekdays = 0;
  let remainingWeekends = 0;

  const currentKyivDateStr = getKyivDateString(effectiveNow);
  const endKyivDateStr = getKyivDateString(safeEnd);

  const [cYear, cMonth, cDay] = currentKyivDateStr.split("-").map(Number);
  const [eYear, eMonth, eDay] = endKyivDateStr.split("-").map(Number);

  const iterDate = new Date(Date.UTC(cYear, cMonth - 1, cDay));
  const finishDate = new Date(Date.UTC(eYear, eMonth - 1, eDay));

  while (iterDate <= finishDate) {
    const dayOfWeek = iterDate.getUTCDay();
    if (isWeekendOrLeisureDay(dayOfWeek)) {
      remainingWeekends++;
    } else {
      remainingWeekdays++;
    }
    iterDate.setUTCDate(iterDate.getUTCDate() + 1);
  }

  // Розрахунок бюджетних показників
  const totalLimit = options.totalBudgetLimit || 0;
  const currentExpense =
    options.currentExpenseTotal !== undefined
      ? options.currentExpenseTotal
      : transactions
          .filter((t) => !t.exclude_from_budget && t.type === "expense")
          .reduce((sum, t) => sum + getEffectiveTransactionExpense(t), 0);
  const remainingTotal = Math.max(0, totalLimit - currentExpense);

  // Резервування майбутніх постійних платежів / підписок до кінця циклу
  const upcomingObligations = options.upcomingObligations || [];

  let reservedObligationsTotal = 0;
  for (const obl of upcomingObligations) {
    if (obl.is_paid) continue;
    if (obl.day_of_month !== undefined) {
      if (
        isObligationDueInRemainingCycle(
          obl.day_of_month,
          currentKyivDateStr,
          endKyivDateStr
        )
      ) {
        reservedObligationsTotal += Number(obl.amount || 0);
      }
    } else {
      reservedObligationsTotal += Number(obl.amount || 0);
    }
  }

  const discretionaryRemaining = Math.max(
    0,
    remainingTotal - reservedObligationsTotal
  );

  // Використовуємо адаптивний EMA коефіцієнт
  const alpha = habits.emaWeekendToWeekdayRatio;
  const weightedDays = remainingWeekdays + alpha * remainingWeekends;

  let safeWeekdaySpend = 0;
  let safeWeekendSpend = 0;

  if (weightedDays > 0 && discretionaryRemaining > 0) {
    safeWeekdaySpend = Math.round(discretionaryRemaining / weightedDays);
    safeWeekendSpend = Math.round(safeWeekdaySpend * alpha);
  }

  const flatDailySpend =
    daysRemaining > 0
      ? Math.round(discretionaryRemaining / Math.max(1, daysRemaining))
      : 0;

  // Визначення статусу та рекомендації
  let status: "healthy" | "tight" | "critical" | "depleted" = "healthy";
  let statusLabel = "Збалансований темп";
  let advice =
    "Витрати у межах норми. Зважений денний ліміт враховує вікенд-буфер та постійні платежі.";

  if (discretionaryRemaining <= 0) {
    status = "depleted";
    statusLabel = "Бюджет вичерпано";
    advice =
      "Вільний ліміт на цей цикл вичерпано або зарезервовано під обов'язкові платежі.";
  } else if (safeWeekdaySpend < 250) {
    status = "critical";
    statusLabel = "Критичний залишок";
    advice = `Безпечний ліміт знизився до ${safeWeekdaySpend} ₴/будень (${safeWeekendSpend} ₴/вихідний). Рекомендовано обмежити несуттєві покупки.`;
  } else if (safeWeekdaySpend < 500) {
    status = "tight";
    statusLabel = "Напружений бюджет";
    advice = `Рекомендовано дотримуватись ліміту ${safeWeekdaySpend} ₴ у будні, щоб зберегти резерв ${safeWeekendSpend} ₴ на вихідні.`;
  }

  // Розрахунок очікуваного профіциту на кінець циклу (Surplus Projection):
  // Порівнює вільний залишок із прогнозованими витратами за поточним темпом
  let projectedRemainingSpend = 0;

  if (habits.isSufficientData && habits.emaWeekdayDailyAvg > 0) {
    projectedRemainingSpend =
      remainingWeekdays * habits.emaWeekdayDailyAvg +
      remainingWeekends * habits.emaWeekendDailyAvg;
  } else if (daysPassed > 0 && currentExpense > 0) {
    const avgDailySoFar = currentExpense / daysPassed;
    projectedRemainingSpend = avgDailySoFar * daysRemaining;
  }

  const projectedDiff = discretionaryRemaining - projectedRemainingSpend;
  const projectedSurplusAmount =
    projectedDiff > 0 ? Math.round(projectedDiff) : 0;
  const projectedDeficitAmount =
    projectedDiff < 0 ? Math.round(Math.abs(projectedDiff)) : 0;

  const savingsPotentialPercent =
    totalLimit > 0
      ? Math.round((projectedSurplusAmount / totalLimit) * 100)
      : 0;

  let surplusStatus: "surplus" | "on_track" | "deficit" = "on_track";
  if (projectedSurplusAmount > 0) {
    surplusStatus = "surplus";
  } else if (projectedDeficitAmount > 100) {
    surplusStatus = "deficit";
  }

  const surplusSummary =
    surplusStatus === "surplus"
      ? `При збереженні поточного темпу очікуваний профіцит у кінці циклу: +${projectedSurplusAmount.toLocaleString("uk-UA")} ₴ (${savingsPotentialPercent}% бюджету).`
      : surplusStatus === "deficit"
        ? `При поточному темпі є ризик перевитрати на ~${projectedDeficitAmount.toLocaleString("uk-UA")} ₴. Дотримуйтесь рекомендованого ліміту.`
        : "При повному використанні рекомендованого ліміту бюджет буде закрито в нуль без дефіциту.";

  return {
    baselineDate: NEW_HABITS_BASELINE,
    habits,
    cycle: {
      startDate: safeStart.toISOString(),
      endDate: safeEnd.toISOString(),
      daysTotal,
      daysPassed,
      daysRemaining,
      remainingWeekdays,
      remainingWeekends,
    },
    budget: {
      totalBudgetLimit: Math.round(totalLimit),
      currentExpenseTotal: Math.round(currentExpense),
      remainingTotal: Math.round(remainingTotal),
      reservedObligationsTotal: Math.round(reservedObligationsTotal),
      discretionaryRemaining: Math.round(discretionaryRemaining),
    },
    pacing: {
      safeWeekdaySpend,
      safeWeekendSpend,
      flatDailySpend,
      weekendMultiplierUsed: alpha,
      status,
      statusLabel,
      advice,
    },
    surplusProjection: {
      projectedSurplusAmount,
      projectedDeficitAmount,
      savingsPotentialPercent,
      status: surplusStatus,
      summaryText: surplusSummary,
    },
  };
}
