import { Transaction } from "@/types/finance";
import { getKyivDateString, getKyivDayOfWeek } from "./behavioral-metrics";

/**
 * Сувора базова лінія для навчання звичок та калібрування темпу.
 * Будь-які транзакції, здійснені раніше цієї дати, ПОВНІСТЮ ІГНОРУЮТЬСЯ
 * через хаотичний характер попередніх витрат користувача.
 */
export const NEW_HABITS_BASELINE = "2026-08-15T00:00:00.000Z";
export const NEW_HABITS_BASELINE_MS = new Date(NEW_HABITS_BASELINE).getTime();

export interface CalibratedHabits {
  baselineDate: string;
  totalCalibratedTx: number;
  totalCalibratedSpend: number;
  weekdayDaysCount: number;
  weekendDaysCount: number;
  weekdayTotalSpend: number;
  weekendTotalSpend: number;
  weekdayDailyAvg: number;
  weekendDailyAvg: number;
  weekendToWeekdayRatio: number; // alpha: відношення середньоденних витрат вихідного до буднього
  isSufficientData: boolean;
}

export interface UpcomingObligation {
  title: string;
  amount: number;
  day_of_month?: number;
  is_paid?: boolean;
}

export interface WeightedPacingOptions {
  now?: Date;
  startDate?: Date;
  endDate?: Date;
  totalBudgetLimit?: number;
  currentExpenseTotal?: number;
  upcomingObligations?: UpcomingObligation[];
}

export interface WeightedPacingResult {
  baselineDate: string;
  habits: CalibratedHabits;
  cycle: {
    startDate: string;
    endDate: string;
    daysTotal: number;
    daysPassed: number;
    daysRemaining: number;
    remainingWeekdays: number;
    remainingWeekends: number;
  };
  budget: {
    totalBudgetLimit: number;
    currentExpenseTotal: number;
    remainingTotal: number;
    reservedObligationsTotal: number;
    discretionaryRemaining: number;
  };
  pacing: {
    safeWeekdaySpend: number;
    safeWeekendSpend: number;
    flatDailySpend: number; // просте лінійне ділення на залишок днів
    weekendMultiplierUsed: number;
    status: "healthy" | "tight" | "critical" | "depleted";
    statusLabel: string;
    advice: string;
  };
}

/**
 * Перевіряє, чи день відноситься до вихідних / leisure днів (П'ятниця = 5, Субота = 6, Неділя = 0)
 */
export function isWeekendOrLeisureDay(dayOfWeek: number): boolean {
  return dayOfWeek === 0 || dayOfWeek === 5 || dayOfWeek === 6;
}

/**
 * Калібрує патерни витрат за транзакціями суворо від 15 серпня 2026 року
 */
export function calibrateHabitsFromBaseline(
  transactions: Transaction[]
): CalibratedHabits {
  // 1. Фільтрація: тільки валідні витрати від базової лінії
  const validTx = transactions.filter((t) => {
    if (t.type === "income" || t.exclude_from_budget || t.deleted_at) {
      return false;
    }
    const rawDate = t.created_at || (t as any).date;
    if (!rawDate) return false;
    const tMs = new Date(rawDate).getTime();
    if (isNaN(tMs)) return false;
    return tMs >= NEW_HABITS_BASELINE_MS;
  });

  // 2. Групування за унікальними календарними днями Києва
  const dailySpendMap = new Map<string, { spend: number; dayOfWeek: number }>();
  let totalCalibratedSpend = 0;

  for (const tx of validTx) {
    const rawDate = tx.created_at || (tx as any).date;
    const kyivDay = getKyivDateString(rawDate);
    const dayOfWeek = getKyivDayOfWeek(rawDate);
    const amt = Number(tx.amount || 0);

    totalCalibratedSpend += amt;

    const existing = dailySpendMap.get(kyivDay);
    if (existing) {
      existing.spend += amt;
    } else {
      dailySpendMap.set(kyivDay, { spend: amt, dayOfWeek });
    }
  }

  let weekdayDaysCount = 0;
  let weekendDaysCount = 0;
  let weekdayTotalSpend = 0;
  let weekendTotalSpend = 0;

  for (const [, dayData] of dailySpendMap.entries()) {
    if (isWeekendOrLeisureDay(dayData.dayOfWeek)) {
      weekendDaysCount++;
      weekendTotalSpend += dayData.spend;
    } else {
      weekdayDaysCount++;
      weekdayTotalSpend += dayData.spend;
    }
  }

  const weekdayDailyAvg =
    weekdayDaysCount > 0 ? Math.round(weekdayTotalSpend / weekdayDaysCount) : 0;
  const weekendDailyAvg =
    weekendDaysCount > 0 ? Math.round(weekendTotalSpend / weekendDaysCount) : 0;

  // Визначення коефіцієнта alpha
  const isSufficientData = weekdayDaysCount >= 2 && weekendDaysCount >= 2;
  let weekendToWeekdayRatio = 1.35; // стандартний дефолтний коефіцієнт (вихідні на 35% дорожчі за будні)

  if (isSufficientData && weekdayDailyAvg > 0) {
    const rawRatio = weekendDailyAvg / weekdayDailyAvg;
    // Обмежуємо коефіцієнт безпечними межами [0.75, 2.5] для захисту від екстремальних сплесків
    weekendToWeekdayRatio = Number(
      Math.max(0.75, Math.min(2.5, rawRatio)).toFixed(2)
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
    isSufficientData,
  };
}

/**
 * Розраховує зважений календарний темп на залишок циклу
 */
export function calculateWeightedCalendarPacing(
  transactions: Transaction[],
  options: WeightedPacingOptions = {}
): WeightedPacingResult {
  const habits = calibrateHabitsFromBaseline(transactions);

  const now = options.now instanceof Date ? options.now : new Date();

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

  // Рахуємо дні вперед від поточного
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
  const currentExpense = options.currentExpenseTotal ?? 0;
  const remainingTotal = Math.max(0, totalLimit - currentExpense);

  // Резервування майбутніх постійних платежів / підписок до кінця циклу
  const currentDayOfMonth = parseInt(currentKyivDateStr.split("-")[2], 10);
  const upcomingObligations = options.upcomingObligations || [];

  let reservedObligationsTotal = 0;
  for (const obl of upcomingObligations) {
    if (obl.is_paid) continue;
    if (obl.day_of_month !== undefined) {
      if (obl.day_of_month >= currentDayOfMonth) {
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

  // Зважений щоденний ліміт
  const alpha = habits.weekendToWeekdayRatio;
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
  };
}
