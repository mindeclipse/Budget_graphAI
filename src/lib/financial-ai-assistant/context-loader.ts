import { SupabaseClient } from "@supabase/supabase-js";
import { loadCyclePacing } from "@/lib/telegram-bot";
import { ROUNDUP_GOAL_NAME } from "@/lib/roundup-utils";
import { buildUpcomingSchedule } from "@/lib/subscription-radar";
import { getUsdRate } from "@/lib/currency";
import { Transaction } from "@/types/finance";
import { FinancialAssistantContext } from "./types";

/**
 * Завантажує та структурує повний фінансовий контекст користувача із Supabase
 */
export async function loadFinancialAssistantContext(
  supabaseAdmin: SupabaseClient | any,
  now: Date = new Date()
): Promise<FinancialAssistantContext> {
  const kyivNowStr = new Intl.DateTimeFormat("uk-UA", {
    timeZone: "Europe/Kyiv",
    dateStyle: "full",
    timeStyle: "medium",
  }).format(now);

  // 1. Поточний темп та бюджетний цикл
  const { pacing, startDate, endDate, totalBudgetLimit } =
    await loadCyclePacing(supabaseAdmin, now);

  // 2. Транзакції за останні 45 днів (для глибокого пошуку та аналізу)
  const past45Days = new Date(now.getTime() - 45 * 24 * 60 * 60 * 1000);
  const { data: rawTxs } = await supabaseAdmin
    .from("transactions")
    .select(
      "id, amount, currency, merchant_raw, category_name, source, type, created_at, exclude_from_budget, metadata, deleted_at"
    )
    .is("deleted_at", null)
    .gte("created_at", past45Days.toISOString())
    .lte("created_at", endDate.toISOString())
    .order("created_at", { ascending: false });

  const allTxs = (rawTxs || []) as Transaction[];

  // Транзакції суто поточного активного циклу
  const cycleTxs = allTxs.filter((t) => {
    const d = new Date(t.created_at);
    return d >= startDate && d <= endDate;
  });

  // Агрегація витрат за категоріями у поточному циклі
  const categoryStats: Record<string, { total: number; count: number }> = {};
  for (const t of cycleTxs) {
    if (t.type !== "expense" || t.exclude_from_budget) continue;
    const cat = t.category_name || "Інше";
    if (!categoryStats[cat]) {
      categoryStats[cat] = { total: 0, count: 0 };
    }
    categoryStats[cat].total =
      Math.round((categoryStats[cat].total + Number(t.amount || 0)) * 100) /
      100;
    categoryStats[cat].count += 1;
  }

  // Топ-10 найбільших покупок поточного циклу
  const topPurchases = cycleTxs
    .filter((t) => t.type === "expense" && !t.exclude_from_budget)
    .sort((a, b) => Number(b.amount || 0) - Number(a.amount || 0))
    .slice(0, 10)
    .map((t) => ({
      date: t.created_at.slice(0, 10),
      amount: Number(t.amount || 0),
      merchant: t.merchant_raw,
      category: t.category_name || "Інше",
    }));

  // Компактний список останніх транзакцій (до 150 шт.)
  const recentTransactions = allTxs.slice(0, 150).map((t) => ({
    date: t.created_at.slice(0, 10),
    amount: Number(t.amount || 0),
    merchant: t.merchant_raw,
    category: t.category_name || "Інше",
    type: t.type,
    note: (t as any).metadata?.note || undefined,
    amortization: (t as any).metadata?.amortization || undefined,
    is_emergency:
      Boolean((t as any).metadata?.is_emergency) ||
      (Array.isArray((t as any).tags) &&
        (t as any).tags.includes("форсмажор")) ||
      undefined,
  }));

  // 3. Цілі накопичення та подушка безпеки
  const { data: goals } = await supabaseAdmin
    .from("savings_goals")
    .select("id, name, target_amount, current_amount, currency")
    .order("id", { ascending: true });

  const cushionGoal = (goals || []).find(
    (g: any) =>
      g.name?.toLowerCase().includes("подушка") ||
      g.name?.toLowerCase() === ROUNDUP_GOAL_NAME.toLowerCase()
  );
  const otherGoals = (goals || [])
    .filter((g: any) => g.id !== cushionGoal?.id)
    .map((g: any) => ({
      name: g.name,
      amount: Number(g.current_amount || 0),
      currency: g.currency || "UAH",
    }));

  // Автоокруглення (скарбничка)
  const currentMonthStart = new Date(
    now.getFullYear(),
    now.getMonth(),
    1
  ).toISOString();
  const { data: rawRoundupTxs } = await supabaseAdmin
    .from("transactions")
    .select("amount, created_at, merchant_raw, category_name, source")
    .or(
      "category_name.ilike.%подушка%,merchant_raw.ilike.%округлення%,source.eq.roundup"
    )
    .is("deleted_at", null);

  const roundupTxs = (rawRoundupTxs || []).filter((t: any) => {
    const m = (t.merchant_raw || "").toLowerCase();
    return (
      m.includes("округлення") || m.includes("решта") || t.source === "roundup"
    );
  });

  const totalRoundupAmount =
    Math.round(
      roundupTxs.reduce(
        (sum: number, t: any) => sum + Number(t.amount || 0),
        0
      ) * 100
    ) / 100;

  const monthRoundupTxs = roundupTxs.filter(
    (t: any) => t.created_at && t.created_at >= currentMonthStart
  );
  const monthRoundupAmount =
    Math.round(
      monthRoundupTxs.reduce(
        (sum: number, t: any) => sum + Number(t.amount || 0),
        0
      ) * 100
    ) / 100;

  // 4. Підписки та регулярні платежі
  const { data: recurring } = await supabaseAdmin
    .from("recurring_templates")
    .select(
      "id, title, amount, currency, day_of_month, is_active, category_name"
    )
    .eq("is_active", true);

  const usdRate = await getUsdRate();
  const schedule = buildUpcomingSchedule(
    recurring || [],
    cycleTxs,
    usdRate,
    now
  );

  const subscriptions = schedule.upcoming.map((u) => ({
    title: u.title,
    amount: Number(u.amount),
    currency: u.currency,
    day_of_month: u.day_of_month,
    status: u.status,
  }));

  return {
    cycle: {
      name: "Поточний цикл",
      startDate: startDate.toISOString().slice(0, 10),
      endDate: endDate.toISOString().slice(0, 10),
      daysTotal: pacing.cycle.daysTotal,
      daysPassed: pacing.cycle.daysPassed,
      daysRemaining: pacing.cycle.daysRemaining,
    },
    budget: {
      totalBudgetLimit,
      currentExpenseTotal: pacing.budget.currentExpenseTotal,
      discretionaryRemaining: pacing.budget.discretionaryRemaining,
      reservedObligationsTotal: pacing.budget.reservedObligationsTotal,
    },
    pacing: {
      safeWeekdaySpend: pacing.pacing.safeWeekdaySpend,
      safeWeekendSpend: pacing.pacing.safeWeekendSpend,
      flatDailySpend: pacing.pacing.flatDailySpend,
      statusLabel: pacing.pacing.statusLabel,
      advice: pacing.pacing.advice,
    },
    surplusProjection: pacing.surplusProjection,
    cushion: {
      currentAmount: Number(cushionGoal?.current_amount || 0),
      targetAmount: cushionGoal?.target_amount
        ? Number(cushionGoal.target_amount)
        : null,
      monthRoundupAmount,
      totalRoundupAmount,
    },
    otherGoals,
    subscriptions,
    categoryStats,
    topPurchases,
    recentTransactions,
    kyivNowStr,
  };
}
