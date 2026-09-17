import { Transaction } from "@/types/finance";
import { getCycleDateRange, FALLBACK_BUDGET_LIMIT } from "@/lib/cycle-utils";
import { getUsdRate } from "@/lib/currency";
import { buildUpcomingSchedule } from "@/lib/subscription-radar";
import {
  calculateWeightedCalendarPacing,
  getEffectiveTransactionExpense,
  loadPastAmortizationObligations,
  UpcomingObligation,
} from "@/lib/weighted-pacing";

export function getAppUrl(): string {
  return (
    process.env.APP_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "https://budget-pwa.vercel.app"
  );
}

export async function loadCyclePacingContext(supabase: any, now: Date) {
  // Отримуємо активний або останній цикл
  const { data: activeCycle } = await supabase
    .from("budget_cycles")
    .select("id, name, budget_limit, start_date, end_date, is_active")
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const cycleConfig =
    activeCycle ||
    (
      await supabase
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

  // Завантаження валідних транзакцій циклу та історії звички
  const habitBaselineIso = "2026-08-15T00:00:00.000Z";
  const fetchStart =
    startDate.toISOString() < habitBaselineIso
      ? startDate.toISOString()
      : habitBaselineIso;

  const { data: txs } = await supabase
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

  // Завантаження шаблонів постійних платежів
  const { data: recurring } = await supabase
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
    supabase,
    startDate,
    now
  );
  if (pastObligations.length > 0) {
    upcomingObligations.push(...pastObligations);
  }

  const currentExpenseTotal = cycleTransactions
    .filter((t) => !t.exclude_from_budget && t.type === "expense")
    .reduce((sum, t) => sum + getEffectiveTransactionExpense(t), 0);

  // Розрахунок зваженого темпу
  const pacing = calculateWeightedCalendarPacing(allValidTransactions, {
    now,
    startDate,
    endDate,
    totalBudgetLimit,
    currentExpenseTotal,
    upcomingObligations,
  });

  return {
    cycleConfig,
    startDate,
    endDate,
    totalBudgetLimit,
    allValidTransactions,
    cycleTransactions,
    upcomingObligations,
    pacing,
  };
}
