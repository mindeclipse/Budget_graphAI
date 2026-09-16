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
  weekendToWeekdayRatio: number; // базовий лінійний коефіцієнт
  emaWeekdayDailyAvg: number; // експоненційно зважений середньоденний чек буднів
  emaWeekendDailyAvg: number; // експоненційно зважений середньоденний чек вихідних
  emaWeekendToWeekdayRatio: number; // адаптивний коефіцієнт alpha (EMA)
  isSufficientData: boolean;
}

export interface UpcomingObligation {
  title: string;
  amount: number;
  day_of_month?: number;
  is_paid?: boolean;
}

export interface SurplusProjection {
  projectedSurplusAmount: number;
  projectedDeficitAmount?: number;
  savingsPotentialPercent: number;
  status?: "surplus" | "on_track" | "deficit";
  summaryText: string;
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
  surplusProjection: SurplusProjection;
}

export interface PurchaseSimulationResult {
  purchaseAmount: number;
  itemDescription?: string;
  currentDiscretionary: number;
  newDiscretionary: number;
  currentSafeWeekday: number;
  newSafeWeekday: number;
  currentSafeWeekend: number;
  newSafeWeekend: number;
  weekdayDropPercent: number;
  weekendDropPercent: number;
  verdict: "safe" | "caution" | "danger";
  verdictTitle: string;
  adviceHtml: string;
}

/**
 * Повертає ефективну суму витрати для розрахунку темпу (з урахуванням амортизації)
 */
export function getEffectiveTransactionExpense(tx: Transaction): number {
  if (tx.exclude_from_budget || tx.type !== "expense" || tx.deleted_at) {
    return 0;
  }
  const amt = Number(tx.amount || 0);
  if (isNaN(amt) || amt <= 0) return 0;

  // Реальний рух коштів (Cash Flow): вся сума списується з балансу в повному обсязі.
  // Гроші фізично пішли з картки і не повертаються віртуально в баланс.
  return amt;
}

/**
 * Розраховує нормалізовану щомісячну частку для аналітики та ШІ (без спотворення кеш-балансу)
 */
export function getAmortizedMonthlyExpense(tx: Transaction): number {
  if (tx.exclude_from_budget || tx.type !== "expense" || tx.deleted_at) {
    return 0;
  }
  const amt = Number(tx.amount || 0);
  if (isNaN(amt) || amt <= 0) return 0;

  const amortization = tx.metadata?.amortization;
  if (amortization && typeof amortization === "object") {
    const months = Number(amortization.months);
    if (months > 1 && !isNaN(months)) {
      const monthly =
        Number(amortization.monthly_amount) || Math.round(amt / months);
      return Math.min(amt, Math.max(0, monthly));
    }
  }

  return amt;
}

/**
 * Знаходить активні амортизовані витрати з попередніх місяців та формує список зобов'язань для поточного циклу
 */
export function calculateActivePastAmortizations(
  pastTransactions: Transaction[],
  currentCycleDate: Date = new Date()
): UpcomingObligation[] {
  const obligations: UpcomingObligation[] = [];

  for (const tx of pastTransactions) {
    if (tx.deleted_at || tx.exclude_from_budget) continue;
    const amortization = tx.metadata?.amortization;
    if (!amortization || typeof amortization !== "object") continue;

    const totalMonths = Number(amortization.months);
    if (isNaN(totalMonths) || totalMonths <= 1) continue;

    const rawDate = tx.created_at || (tx as any).date;
    if (!rawDate) continue;
    const txDate = new Date(rawDate);
    if (isNaN(txDate.getTime())) continue;

    // Розраховуємо різницю в місяцях між поточною датою та датою покупки
    const monthDiff =
      (currentCycleDate.getFullYear() - txDate.getFullYear()) * 12 +
      (currentCycleDate.getMonth() - txDate.getMonth());

    // Якщо поточний місяць пізніший за місяць покупки, але в межах періоду амортизації
    if (monthDiff > 0 && monthDiff < totalMonths) {
      const monthlyAmt =
        Number(amortization.monthly_amount) ||
        Math.round(Number(tx.amount || 0) / totalMonths);

      obligations.push({
        title: `🗓️ Амортизація (${monthDiff + 1}/${totalMonths}): ${tx.merchant_raw}`,
        amount: monthlyAmt,
        is_paid: false,
      });
    }
  }

  return obligations;
}

/**
 * За правилом чистого кеш-флоу (Cash Flow): гроші списано на 100% у місяці покупки,
 * тому в наступних місяцях фіктивні зобов'язання не стягуються, щоб уникнути подвійного списання грошей.
 */
export async function loadPastAmortizationObligations(
  _supabaseAdmin: any,
  _startDate: Date,
  _now: Date = new Date()
): Promise<UpcomingObligation[]> {
  return [];
}

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
  const validTx = transactions.filter((t) => {
    if (t.type !== "expense" || t.exclude_from_budget || t.deleted_at) {
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

/**
 * Симулятор покупок «What-If Purchase Advisor»:
 * Оцінює наслідки планованої покупки для темпу бюджету
 */
export function simulatePurchaseImpact(
  purchaseAmount: number,
  transactions: Transaction[],
  options: WeightedPacingOptions = {},
  itemDescription?: string
): PurchaseSimulationResult {
  const currentPacing = calculateWeightedCalendarPacing(transactions, options);
  const currentDiscretionary = currentPacing.budget.discretionaryRemaining;
  const currentSafeWeekday = currentPacing.pacing.safeWeekdaySpend;
  const currentSafeWeekend = currentPacing.pacing.safeWeekendSpend;

  const newDiscretionary = Math.max(0, currentDiscretionary - purchaseAmount);

  // Розраховуємо новий темп після цієї покупки
  const remainingWeekdays = currentPacing.cycle.remainingWeekdays;
  const remainingWeekends = currentPacing.cycle.remainingWeekends;
  const alpha = currentPacing.pacing.weekendMultiplierUsed;
  const weightedDays = remainingWeekdays + alpha * remainingWeekends;

  let newSafeWeekday = 0;
  let newSafeWeekend = 0;

  if (weightedDays > 0 && newDiscretionary > 0) {
    newSafeWeekday = Math.round(newDiscretionary / weightedDays);
    newSafeWeekend = Math.round(newSafeWeekday * alpha);
  }

  const weekdayDropPercent =
    currentSafeWeekday > 0
      ? Math.round(
          ((currentSafeWeekday - newSafeWeekday) / currentSafeWeekday) * 100
        )
      : 100;
  const weekendDropPercent =
    currentSafeWeekend > 0
      ? Math.round(
          ((currentSafeWeekend - newSafeWeekend) / currentSafeWeekend) * 100
        )
      : 100;

  let verdict: "safe" | "caution" | "danger" = "safe";
  let verdictTitle = "✅ Безпечна покупка";
  let adviceHtml = "";

  const itemNameStr = itemDescription
    ? `покупки «<b>${itemDescription}</b>» (${purchaseAmount.toLocaleString("uk-UA")} ₴)`
    : `покупки на суму <b>${purchaseAmount.toLocaleString("uk-UA")} ₴</b>`;

  if (purchaseAmount > currentDiscretionary) {
    verdict = "danger";
    verdictTitle = "🚨 Перевищення бюджету";
    const deficit = purchaseAmount - currentDiscretionary;
    adviceHtml = `У разі здійснення ${itemNameStr} вільний бюджет буде перевищено на <b>${deficit.toLocaleString("uk-UA")} ₴</b>. До кінця місяця денний ліміт стане <b>0 ₴</b>. Рекомендовано перенести покупку або використати накопичення зі скарбнички.`;
  } else if (newSafeWeekday < 250 || weekdayDropPercent > 35) {
    verdict = "danger";
    verdictTitle = "⚠️ Критичне навантаження на темп";
    adviceHtml = `Після ${itemNameStr} денний ліміт у будні впаде з <b>${currentSafeWeekday} ₴</b> до <b>${newSafeWeekday} ₴/день</b> (-${weekdayDropPercent}%), а вікенд-буфер зменшиться до <b>${newSafeWeekend} ₴/день</b>. Бюджет увійде в зону підвищеного ризику.`;
  } else if (newSafeWeekday < 500 || weekdayDropPercent > 15) {
    verdict = "caution";
    verdictTitle = "⚡️ Потрібна дисципліна";
    adviceHtml = `Після ${itemNameStr} денний ліміт знизиться на <b>${weekdayDropPercent}%</b>: до <b>${newSafeWeekday} ₴/будень</b> та <b>${newSafeWeekend} ₴/вихідний</b>. Покупка допустима, якщо утриматись від інших непередбачених витрат.`;
  } else {
    verdict = "safe";
    verdictTitle = "✅ Безпечна покупка";
    adviceHtml = `Після ${itemNameStr} залишається комфортний запас: <b>${newSafeWeekday} ₴/будень</b> та <b>${newSafeWeekend} ₴/вихідний</b> (зниження лише на ${weekdayDropPercent}%). Витрата не порушить плановий ритм.`;
  }

  return {
    purchaseAmount,
    itemDescription,
    currentDiscretionary,
    newDiscretionary,
    currentSafeWeekday,
    newSafeWeekday,
    currentSafeWeekend,
    newSafeWeekend,
    weekdayDropPercent,
    weekendDropPercent,
    verdict,
    verdictTitle,
    adviceHtml,
  };
}
