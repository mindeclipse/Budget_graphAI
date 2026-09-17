import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { sendTelegramMessage, TelegramReplyMarkup } from "@/lib/telegram";
import { sendBackupToTelegram } from "@/lib/backup-service";
import { getUsdRate } from "@/lib/currency";
import {
  getCycleDateRange,
  calculateCycleDaysRemaining,
  DEFAULT_BUDGET_LIMIT,
} from "@/lib/cycle-utils";
import { buildUpcomingSchedule } from "@/lib/subscription-radar";
import {
  calculateWeightedCalendarPacing,
  isWeekendOrLeisureDay,
  UpcomingObligation,
} from "@/lib/weighted-pacing";
import { Transaction } from "@/types/finance";
import {
  getKyivDateString,
  calculateBehavioralMetrics,
} from "@/lib/behavioral-metrics";
import {
  DigestResult,
  WeeklyDigestOptions,
  WeeklyDigestData,
  WeeklyCategoryBreakdown,
} from "./types";
import {
  getAppUrl,
  getKyivWeekKey,
  formatWeeklyDigestHtml,
} from "./formatters";
import { generateBehavioralCoachAdvice } from "./ai";

/**
 * Генерує та надсилає Щотижневий AI-дайджест у Telegram
 */
export async function generateWeeklyDigest(
  options?: WeeklyDigestOptions
): Promise<DigestResult<WeeklyDigestData>> {
  const supabase = getSupabaseAdmin();
  const now = new Date();
  const kyivTodayStr = getKyivDateString(now);
  const weekKey = getKyivWeekKey(now);

  // 1. Перевірка дедуплікації
  if (!options?.force) {
    const { data: existingAlert } = await supabase
      .from("budget_alerts")
      .select("id")
      .eq("alert_type", weekKey)
      .maybeSingle();

    if (existingAlert) {
      console.log("[WeeklyDigest] Already sent for week:", weekKey);
      return { success: true, sent: false, reason: "already_sent_this_week" };
    }
  }

  // 2. Межі дат: поточні 7 днів та попередні 7 днів (для WoW динаміки)
  const msInDay = 24 * 60 * 60 * 1000;
  const currentWeekStart = new Date(now.getTime() - 7 * msInDay);
  const prevWeekStart = new Date(now.getTime() - 14 * msInDay);

  const { data: rawTransactions, error: txError } = await supabase
    .from("transactions")
    .select(
      "id, amount, created_at, type, merchant_raw, category_name, exclude_from_budget, metadata, tags"
    )
    .is("deleted_at", null)
    .gte("created_at", prevWeekStart.toISOString())
    .order("created_at", { ascending: false });

  if (txError) {
    console.error("[WeeklyDigest] Error fetching transactions:", txError);
    return { success: false, sent: false, reason: txError.message };
  }

  const expenseTransactions = (rawTransactions || []).filter(
    (t) => t.type === "expense" && !t.exclude_from_budget
  );

  const currentWeekTx = expenseTransactions.filter(
    (t) => new Date(t.created_at) >= currentWeekStart
  ) as unknown as Transaction[];

  const prevWeekTx = expenseTransactions.filter(
    (t) =>
      new Date(t.created_at) >= prevWeekStart &&
      new Date(t.created_at) < currentWeekStart
  );

  const thisWeekSpent = currentWeekTx.reduce(
    (sum, t) => sum + Number(t.amount || 0),
    0
  );
  const prevWeekSpent = prevWeekTx.reduce(
    (sum, t) => sum + Number(t.amount || 0),
    0
  );

  // 3b. Інвестиції та заощадження за 7 днів (відокремлені від споживчих витрат)
  const currentWeekInvestments = (rawTransactions || []).filter(
    (t) =>
      t.type === "investment" &&
      !t.exclude_from_budget &&
      new Date(t.created_at) >= currentWeekStart
  );

  // Сума придбання інвестиційних активів (ОВДП, REIT тощо), без технічних записів податків чи дивідендів
  const totalInvestedThisWeek = currentWeekInvestments
    .filter(
      (t) =>
        !t.merchant_raw?.toLowerCase().includes("дивіденд") &&
        !t.merchant_raw?.toLowerCase().includes("подат")
    )
    .reduce((sum, t) => sum + Number(t.amount || 0), 0);

  // Заощадження (перекази у фінансову подушку/скарбничку, за винятком переказів брокеру)
  const currentWeekSavings = (rawTransactions || []).filter(
    (t) =>
      t.type === "transfer" &&
      !t.exclude_from_budget &&
      new Date(t.created_at) >= currentWeekStart &&
      !t.merchant_raw?.toLowerCase().includes("інжур") &&
      !t.merchant_raw?.toLowerCase().includes("inzhur")
  );

  const totalSavedThisWeek = currentWeekSavings.reduce(
    (sum, t) => sum + Number(t.amount || 0),
    0
  );

  // 3c. Лист охолодження (Wishlist) за останні 7 днів
  const { data: wishlistData } = await supabase
    .from("wishlist_items")
    .select(
      "id, name, estimated_price, status, cooling_end_date, resolved_at, created_at"
    );

  const recentWishlist = wishlistData || [];
  // Успішно скасовані імпульсивні бажання за 7 днів (saved)
  const savedWishlistItems = recentWishlist.filter(
    (item) =>
      item.status === "saved" &&
      item.resolved_at &&
      new Date(item.resolved_at) >= currentWeekStart
  );
  const savedWishlistAmount = savedWishlistItems.reduce(
    (sum, item) => sum + Number(item.estimated_price || 0),
    0
  );

  // Товари, які зараз перебувають у стані охолодження (cooling)
  const coolingWishlistItems = recentWishlist.filter(
    (item) =>
      item.status === "cooling" &&
      item.cooling_end_date &&
      new Date(item.cooling_end_date) > now
  );
  const coolingWishlistAmount = coolingWishlistItems.reduce(
    (sum, item) => sum + Number(item.estimated_price || 0),
    0
  );

  const behavioralMetrics = calculateBehavioralMetrics(currentWeekTx, {
    savedAmount: savedWishlistAmount,
    savedCount: savedWishlistItems.length,
    coolingAmount: coolingWishlistAmount,
    coolingCount: coolingWishlistItems.length,
  });

  // 3. Динаміка порівняння з минулим тижнем (Week-over-Week)
  let wowText = "даних за попередній тиждень недостатньо";
  if (prevWeekSpent > 0) {
    const diffPercent = Math.round(
      ((thisWeekSpent - prevWeekSpent) / prevWeekSpent) * 100
    );
    if (diffPercent > 0) {
      wowText = `+${diffPercent}% до минулого тижня ↗️`;
    } else if (diffPercent < 0) {
      wowText = `${diffPercent}% до минулого тижня 📉`;
    } else {
      wowText = `на рівні минулого тижня ➡️`;
    }
  }

  // 4. Топ категорії за 7 днів
  const categoryMap = new Map<string, number>();
  for (const t of currentWeekTx) {
    const cat = t.category_name || "Інше";
    categoryMap.set(cat, (categoryMap.get(cat) || 0) + Number(t.amount || 0));
  }

  const sortedCategories: WeeklyCategoryBreakdown[] = Array.from(
    categoryMap.entries()
  )
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([name, amount]) => ({
      name,
      amount,
      percent:
        thisWeekSpent > 0 ? Math.round((amount / thisWeekSpent) * 100) : 0,
    }));

  // 5. Виявлення найбільшої разової покупки (Spike / Outlier)
  const largestTx = [...currentWeekTx].sort(
    (a, b) => Number(b.amount || 0) - Number(a.amount || 0)
  )[0];

  // 6. Стан активного циклу
  const { data: activeCycle } = await supabase
    .from("budget_cycles")
    .select("id, name, start_date, end_date, budget_limit, is_active")
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let daysRemaining = 0;
  let remainingBudget = 0;
  let safeDailySpend = 0;
  let safeWeekdaySpend = 0;
  let safeWeekendSpend = 0;
  let cycleInfo: {
    remainingBudget: number;
    daysRemaining: number;
    safeWeekdaySpend: number;
    safeWeekendSpend: number;
  } | null = null;

  if (activeCycle) {
    const cycleRange = getCycleDateRange(activeCycle, now);
    daysRemaining = calculateCycleDaysRemaining(activeCycle, now, now);

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
    remainingBudget = Math.max(
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

    safeWeekdaySpend = weightedPacing.pacing.safeWeekdaySpend;
    safeWeekendSpend = weightedPacing.pacing.safeWeekendSpend;
    const isTodayWeekend = isWeekendOrLeisureDay(now.getDay());
    safeDailySpend = isTodayWeekend ? safeWeekendSpend : safeWeekdaySpend;

    cycleInfo = {
      remainingBudget,
      daysRemaining,
      safeWeekdaySpend,
      safeWeekendSpend,
    };
  }

  // 7. Поведінковий AI-коуч від Gemini
  const coachAdvice = await generateBehavioralCoachAdvice({
    currentWeekTx,
    thisWeekSpent,
    wowText,
    sortedCategories,
    largestTx,
    totalInvestedThisWeek,
    totalSavedThisWeek,
    behavioralMetrics,
    cycleInfo,
  });

  // 8. Форматування Telegram повідомлення
  const htmlMessage = formatWeeklyDigestHtml({
    currentWeekStart,
    now,
    thisWeekSpent,
    wowText,
    sortedCategories,
    largestTx,
    totalInvestedThisWeek,
    totalSavedThisWeek,
    cycleInfo,
    coachAdvice,
  });

  const appUrl = getAppUrl();
  const replyMarkup: TelegramReplyMarkup = {
    inline_keyboard: [[{ text: "📊 Відкрити BudgetGraph", url: appUrl }]],
  };

  const sent = await sendTelegramMessage(htmlMessage, replyMarkup);

  if (sent) {
    await supabase.from("budget_alerts").insert({
      alert_date: kyivTodayStr,
      alert_type: weekKey,
    });
    console.log("[WeeklyDigest] Telegram message sent successfully.");

    // Автоматичний щотижневий бекап бази даних у Telegram
    try {
      const backupRes = await sendBackupToTelegram();
      if (backupRes.success) {
        console.log("[WeeklyDigest] Weekly backup file sent to Telegram.");
      } else {
        console.warn(
          "[WeeklyDigest] Failed to send weekly backup:",
          backupRes.error
        );
      }
    } catch (backupErr) {
      console.error(
        "[WeeklyDigest] Error sending weekly backup to Telegram:",
        backupErr
      );
    }
  }

  return {
    success: true,
    sent,
    data: {
      weekKey,
      thisWeekSpent,
      prevWeekSpent,
      totalInvestedThisWeek,
      totalSavedThisWeek,
      sortedCategories,
      largestTx,
      remainingBudget,
      behavioralMetrics,
      coachAdvice,
    },
  };
}
