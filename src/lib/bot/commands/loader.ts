import {
  calculateWeightedCalendarPacing,
  WeightedPacingResult,
  getEffectiveTransactionExpense,
  loadPastAmortizationObligations,
  UpcomingObligation,
} from "@/lib/weighted-pacing";
import { getCycleDateRange, FALLBACK_BUDGET_LIMIT } from "@/lib/cycle-utils";
import { getUsdRate } from "@/lib/currency";
import { buildUpcomingSchedule } from "@/lib/subscription-radar";
import { Transaction } from "@/types/finance";

export interface CycleContext {
  startDate: Date;
  endDate: Date;
  totalBudgetLimit: number;
  allValidTransactions: Transaction[];
  cycleTransactions: Transaction[];
  currentExpenseTotal: number;
  upcomingObligations: UpcomingObligation[];
}

/**
 * Завантажує повний контекст поточного бюджетного циклу, транзакцій та зобов'язань
 */
export async function loadCycleContext(
  supabaseAdmin: any,
  now: Date = new Date()
): Promise<CycleContext> {
  const { data: activeCycle } = await supabaseAdmin
    .from("budget_cycles")
    .select("id, name, budget_limit, start_date, end_date, is_active")
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const cycleConfig =
    activeCycle ||
    (
      await supabaseAdmin
        .from("budget_cycles")
        .select("id, name, budget_limit, start_date, end_date, is_active")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle()
    ).data;

  const { startDate, endDate } = getCycleDateRange(cycleConfig, now);
  const totalBudgetLimit = Number(
    cycleConfig?.budget_limit || FALLBACK_BUDGET_LIMIT
  );

  const habitBaselineIso = "2026-08-15T00:00:00.000Z";
  const fetchStart =
    startDate.toISOString() < habitBaselineIso
      ? startDate.toISOString()
      : habitBaselineIso;

  const { data: txs } = await supabaseAdmin
    .from("transactions")
    .select(
      "id, amount, currency, merchant_raw, category_name, source, type, created_at, exclude_from_budget, metadata, deleted_at"
    )
    .is("deleted_at", null)
    .gte("created_at", fetchStart)
    .lte("created_at", endDate.toISOString());

  const allValidTransactions = (txs || []) as Transaction[];

  const cycleTransactions = allValidTransactions.filter((t) => {
    const d = new Date(t.created_at);
    return d >= startDate && d <= endDate;
  });

  const { data: recurring } = await supabaseAdmin
    .from("recurring_templates")
    .select(
      "id, title, amount, currency, day_of_month, is_active, category_name"
    )
    .eq("is_active", true);

  const usdRate = await getUsdRate();

  const schedule = buildUpcomingSchedule(
    recurring || [],
    cycleTransactions,
    usdRate,
    now
  );

  const upcomingObligations: UpcomingObligation[] = schedule.upcoming.map(
    (u) => ({
      title: u.title,
      amount:
        u.currency === "USD"
          ? Math.round(u.amount * usdRate)
          : Number(u.amount),
      day_of_month: u.day_of_month,
      is_paid: u.status === "paid",
    })
  );

  // Завантажуємо активні амортизовані витрати з попередніх місяців
  const pastObligations = await loadPastAmortizationObligations(
    supabaseAdmin,
    startDate,
    now
  );
  if (pastObligations.length > 0) {
    upcomingObligations.push(...pastObligations);
  }

  const currentExpenseTotal = cycleTransactions
    .filter((t) => !t.exclude_from_budget && t.type === "expense")
    .reduce((sum, t) => sum + getEffectiveTransactionExpense(t), 0);

  return {
    startDate,
    endDate,
    totalBudgetLimit,
    allValidTransactions,
    cycleTransactions,
    currentExpenseTotal,
    upcomingObligations,
  };
}

/**
 * Допоміжна функція завантаження та розрахунку темпу поточного бюджетного циклу
 */
export async function loadCyclePacing(
  supabaseAdmin: any,
  now: Date = new Date()
): Promise<{
  pacing: WeightedPacingResult;
  startDate: Date;
  endDate: Date;
  totalBudgetLimit: number;
}> {
  const context = await loadCycleContext(supabaseAdmin, now);
  const {
    startDate,
    endDate,
    totalBudgetLimit,
    allValidTransactions,
    currentExpenseTotal,
    upcomingObligations,
  } = context;

  const pacing = calculateWeightedCalendarPacing(allValidTransactions, {
    now,
    startDate,
    endDate,
    totalBudgetLimit,
    currentExpenseTotal,
    upcomingObligations,
  });

  return { pacing, startDate, endDate, totalBudgetLimit };
}
