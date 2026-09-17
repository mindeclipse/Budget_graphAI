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
