import { SupabaseClient } from "@supabase/supabase-js";
import { getUsdRate } from "@/lib/currency";
import {
  getCycleDateRange,
  calculateCycleDaysRemaining,
  DEFAULT_BUDGET_LIMIT,
} from "@/lib/cycle-utils";
import { buildUpcomingSchedule } from "@/lib/subscription-radar";
import {
  calculateWeightedCalendarPacing,
  UpcomingObligation,
} from "@/lib/weighted-pacing";
import { Transaction } from "@/types/finance";

export interface WeeklyCycleInfo {
  remainingBudget: number;
  daysRemaining: number;
  safeWeekdaySpend: number;
  safeWeekendSpend: number;
}

export interface WeeklyCycleResult {
  cycleInfo: WeeklyCycleInfo | null;
  remainingBudget: number;
}

/**
 * Отримує активний бюджетний цикл, враховує заплановані підписки та розраховує зважений денний темп витрат.
 */
export async function fetchWeeklyCyclePacing(
  supabase: SupabaseClient,
  now: Date
): Promise<WeeklyCycleResult> {
  const { data: activeCycle } = await supabase
    .from("budget_cycles")
    .select("id, name, start_date, end_date, budget_limit, is_active")
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!activeCycle) {
    return { cycleInfo: null, remainingBudget: 0 };
  }

  const cycleRange = getCycleDateRange(activeCycle, now);
  const daysRemaining = calculateCycleDaysRemaining(activeCycle, now, now);

  const habitBaselineIso = "2026-08-15T00:00:00.000Z";
  const fetchStart =
    cycleRange.startDate.toISOString() < habitBaselineIso
      ? cycleRange.startDate.toISOString()
      : habitBaselineIso;

  const { data: allTxs } = await supabase
    .from("transactions")
    .select(
      "id, amount, currency, merchant_raw, category_name, source, type, created_at, exclude_from_budget, metadata"
    )
    .is("deleted_at", null)
    .gte("created_at", fetchStart);

  const validTxs = ((allTxs || []) as unknown as Transaction[]).filter(
    (t) => t.type === "expense" && !t.exclude_from_budget
  );

  const cycleExpenseTx = validTxs.filter((t) => {
    const time = new Date(t.created_at).getTime();
    return time >= cycleRange.startMs && time <= cycleRange.endMs;
  });

  const totalCycleSpent = cycleExpenseTx.reduce(
    (s, t) => s + Number(t.amount || 0),
    0
  );

  const { data: recurringItems } = await supabase
    .from("recurring_templates")
    .select(
      "id, title, amount, currency, day_of_month, is_active, category_name"
    )
    .eq("is_active", true);

  const usdRate = await getUsdRate();

  const upcomingSchedule = buildUpcomingSchedule(
    recurringItems || [],
    cycleExpenseTx,
    usdRate,
    now
  );
  const unpaidRecurringTotal = upcomingSchedule.metrics.remaining_this_month;

  const upcomingObligations: UpcomingObligation[] =
    upcomingSchedule.upcoming.map((u) => ({
      title: u.title,
      amount:
        u.currency === "USD"
          ? Math.round(u.amount * usdRate)
          : Number(u.amount),
      day_of_month: u.day_of_month,
      is_paid: u.status === "paid",
    }));

  const limit = Number(activeCycle.budget_limit) || DEFAULT_BUDGET_LIMIT;
  const remainingBudget = Math.max(
    0,
    Math.round(limit - unpaidRecurringTotal - totalCycleSpent)
  );

  const weightedPacing = calculateWeightedCalendarPacing(validTxs, {
    startDate: cycleRange.startDate,
    endDate: cycleRange.endDate,
    totalBudgetLimit: limit,
    currentExpenseTotal: totalCycleSpent,
    upcomingObligations,
    now,
  });

  const safeWeekdaySpend = weightedPacing.pacing.safeWeekdaySpend;
  const safeWeekendSpend = weightedPacing.pacing.safeWeekendSpend;

  return {
    remainingBudget,
    cycleInfo: {
      remainingBudget,
      daysRemaining,
      safeWeekdaySpend,
      safeWeekendSpend,
    },
  };
}
