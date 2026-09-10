import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { sendTelegramMessage } from "@/lib/telegram";
import {
  computeSafeDailyBudget,
  getKyivDateString,
  DailyBudgetInfo,
} from "@/lib/classify-formatter";

export function formatBudgetAlertMessage(params: {
  alertType: "daily_warning" | "daily_exceeded";
  totalSpentToday: number;
  safeDailySpend: number;
  daysRemaining: number;
  cycleRemaining: number;
  recurringTotal: number;
}): string {
  const percentSpent =
    params.safeDailySpend > 0
      ? Math.round((params.totalSpentToday / params.safeDailySpend) * 100)
      : 100;

  const title =
    params.alertType === "daily_exceeded"
      ? `⚠️ <b>Увага: денний ліміт перевищено!</b>`
      : `⚠️ <b>Увага: наближення до денного ліміту!</b>`;

  return [
    title,
    ``,
    `💸 Витрачено за сьогодні: <b>${params.totalSpentToday.toFixed(2)} ₴</b> (${percentSpent}% від норми)`,
    `🎯 Безпечний ліміт на день: <b>${params.safeDailySpend.toFixed(2)} ₴</b>`,
    ``,
    `📉 Вільний залишок на <b>${params.daysRemaining} дн.</b>: <b>${params.cycleRemaining.toFixed(2)} ₴</b>`,
    `🔒 Зарезервовано на постійні витрати: <b>${params.recurringTotal.toLocaleString("uk-UA").replace(/\u00A0/g, " ")} ₴</b>`,
  ].join("\n");
}

export async function checkDailyBudgetThreshold(
  customBudgetLimit?: number,
  testNow: Date = new Date(),
  precomputedDailyBudget?: DailyBudgetInfo | null,
  supabaseInstance?: any
): Promise<{
  alerted: boolean;
  alertType?: "daily_warning" | "daily_exceeded";
  totalSpentToday?: number;
  safeDailySpend?: number;
  reason?: string;
  error?: any;
}> {
  try {
    const now = testNow;
    const kyivTodayStr = getKyivDateString(now);

    const dailyInfo =
      precomputedDailyBudget !== undefined
        ? precomputedDailyBudget
        : await computeSafeDailyBudget(
            supabaseInstance || getSupabaseAdmin(),
            now,
            customBudgetLimit
          );

    if (!dailyInfo) {
      return { alerted: false, reason: "no_daily_info" };
    }

    const safeDailySpend = dailyInfo.todayTarget;
    const totalSpentToday = dailyInfo.todaySpent;
    const threshold85 = safeDailySpend * 0.85;

    // Визначаємо необхідний рівень сповіщення
    let targetAlertType: "daily_warning" | "daily_exceeded" | null = null;
    if (
      totalSpentToday > 0 &&
      (safeDailySpend <= 0 || totalSpentToday >= safeDailySpend)
    ) {
      targetAlertType = "daily_exceeded";
    } else if (
      safeDailySpend > 0 &&
      totalSpentToday >= threshold85 &&
      totalSpentToday > 0
    ) {
      targetAlertType = "daily_warning";
    }

    if (!targetAlertType) {
      return {
        alerted: false,
        reason: "below_threshold",
        totalSpentToday,
        safeDailySpend,
      };
    }

    const supabase = supabaseInstance || getSupabaseAdmin();

    // Перевірка дедуплікації в базі даних (уникаємо спаму в Telegram)
    const { data: existingAlerts, error: alertFetchErr } = await supabase
      .from("budget_alerts")
      .select("alert_type")
      .eq("alert_date", kyivTodayStr);

    if (alertFetchErr) {
      console.error("[BudgetAlert] Error fetching alerts:", alertFetchErr);
    }

    const recordedTypes = (existingAlerts || []).map((a: any) => a.alert_type);

    if (targetAlertType === "daily_exceeded") {
      if (recordedTypes.includes("daily_exceeded")) {
        return {
          alerted: false,
          reason: "already_exceeded_notified_today",
          totalSpentToday,
          safeDailySpend,
        };
      }
    } else if (targetAlertType === "daily_warning") {
      if (
        recordedTypes.includes("daily_warning") ||
        recordedTypes.includes("daily_85_percent") ||
        recordedTypes.includes("daily_exceeded")
      ) {
        return {
          alerted: false,
          reason: "already_warning_or_exceeded_notified_today",
          totalSpentToday,
          safeDailySpend,
        };
      }
    }

    const message = formatBudgetAlertMessage({
      alertType: targetAlertType,
      totalSpentToday,
      safeDailySpend,
      daysRemaining: dailyInfo.daysRemaining,
      cycleRemaining: dailyInfo.cycleRemaining,
      recurringTotal: dailyInfo.recurringTotal || 0,
    });

    const sent = await sendTelegramMessage(message);

    if (sent) {
      await supabase.from("budget_alerts").insert({
        alert_date: kyivTodayStr,
        alert_type: targetAlertType,
      });
      console.log(
        `[BudgetAlert] Telegram notification (${targetAlertType}) successfully sent.`
      );
      return {
        alerted: true,
        alertType: targetAlertType,
        totalSpentToday,
        safeDailySpend,
      };
    }

    return {
      alerted: false,
      reason: "telegram_send_failed",
      totalSpentToday,
      safeDailySpend,
    };
  } catch (err: any) {
    console.error("[BudgetAlert] Unexpected error:", err);
    return { alerted: false, error: err };
  }
}
