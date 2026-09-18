import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { sendTelegramMessage, TelegramReplyMarkup } from "@/lib/telegram";
import { sendBackupToTelegram } from "@/lib/backup-service";
import {
  getKyivDateString,
  calculateBehavioralMetrics,
} from "@/lib/behavioral-metrics";
import { DigestResult, WeeklyDigestOptions, WeeklyDigestData } from "./types";
import {
  getAppUrl,
  getKyivWeekKey,
  formatWeeklyDigestHtml,
} from "./formatters";
import { generateBehavioralCoachAdvice } from "./ai";
import {
  calculateWeeklySpendingStats,
  fetchWeeklyWishlistStats,
} from "./weekly-stats";
import { fetchWeeklyCyclePacing } from "./weekly-cycle";

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

  // 2. Отримання транзакцій за поточні 7 днів та попередні 7 днів (для WoW)
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

  // 3. Розрахунок витрат, WoW динаміки, інвестицій та заощаджень
  const spendingStats = calculateWeeklySpendingStats(
    rawTransactions || [],
    currentWeekStart,
    prevWeekStart
  );

  // 4. Статистика Wishlist (Лист охолодження) та поведінкові метрики
  const wishlistStats = await fetchWeeklyWishlistStats(
    supabase,
    currentWeekStart,
    now
  );

  const behavioralMetrics = calculateBehavioralMetrics(
    spendingStats.currentWeekTx,
    {
      savedAmount: wishlistStats.savedWishlistAmount,
      savedCount: wishlistStats.savedWishlistItems.length,
      coolingAmount: wishlistStats.coolingWishlistAmount,
      coolingCount: wishlistStats.coolingWishlistItems.length,
    }
  );

  // 5. Стан бюджетного циклу та зважений темп витрат
  const { cycleInfo, remainingBudget } = await fetchWeeklyCyclePacing(
    supabase,
    now
  );

  // 6. Поведінковий AI-коуч від Gemini
  const coachAdvice = await generateBehavioralCoachAdvice({
    currentWeekTx: spendingStats.currentWeekTx,
    thisWeekSpent: spendingStats.thisWeekSpent,
    wowText: spendingStats.wowText,
    sortedCategories: spendingStats.sortedCategories,
    largestTx: spendingStats.largestTx,
    totalInvestedThisWeek: spendingStats.totalInvestedThisWeek,
    totalSavedThisWeek: spendingStats.totalSavedThisWeek,
    behavioralMetrics,
    cycleInfo,
  });

  // 7. Форматування Telegram повідомлення
  const htmlMessage = formatWeeklyDigestHtml({
    currentWeekStart,
    now,
    thisWeekSpent: spendingStats.thisWeekSpent,
    wowText: spendingStats.wowText,
    sortedCategories: spendingStats.sortedCategories,
    largestTx: spendingStats.largestTx,
    totalInvestedThisWeek: spendingStats.totalInvestedThisWeek,
    totalSavedThisWeek: spendingStats.totalSavedThisWeek,
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
      thisWeekSpent: spendingStats.thisWeekSpent,
      prevWeekSpent: spendingStats.prevWeekSpent,
      totalInvestedThisWeek: spendingStats.totalInvestedThisWeek,
      totalSavedThisWeek: spendingStats.totalSavedThisWeek,
      sortedCategories: spendingStats.sortedCategories,
      largestTx: spendingStats.largestTx,
      remainingBudget,
      behavioralMetrics,
      coachAdvice,
    },
  };
}
