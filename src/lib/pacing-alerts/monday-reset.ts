import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { sendTelegramMessage } from "@/lib/telegram";
import { getKyivDateString } from "@/lib/behavioral-metrics";
import { getEffectiveTransactionExpense } from "@/lib/weighted-pacing";
import { PacingAlertOptions, PacingAlertResult } from "./types";
import { loadCyclePacingContext } from "./context-loader";
import {
  buildPacingAlertKeyboard,
  formatMondayResetMessage,
} from "./formatters";

/**
 * Понеділковий перезапуск злітної смуги (Monday Runway Reset):
 * Аналізує фактичні витрати за минулі вихідні (Пт-Сб-Нд),
 * калібрує новий щоденний ліміт на робочі дні тижня та оновлює прогноз профіциту.
 */
export async function generateMondayResetAlert(
  options?: PacingAlertOptions
): Promise<PacingAlertResult> {
  const supabase = options?.supabaseInstance || getSupabaseAdmin();
  const now = options?.now || new Date();
  const kyivTodayStr = getKyivDateString(now);

  // 1. Дедуплікація: не надсилати повторно у той самий понеділок
  if (!options?.force) {
    const { data: existingAlert } = await supabase
      .from("budget_alerts")
      .select("id")
      .eq("alert_date", kyivTodayStr)
      .eq("alert_type", "pacing_monday_reset")
      .maybeSingle();

    if (existingAlert) {
      return {
        success: true,
        sent: false,
        alertType: "pacing_monday_reset",
        reason: "already_sent_today",
      };
    }
  }

  // 2. Завантаження контексту циклу
  const { cycleTransactions, pacing } = await loadCyclePacingContext(
    supabase,
    now
  );

  // 3. Аналіз минулих вихідних (Пт, Сб, Нд перед цим понеділком)
  const fridayDate = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
  const sundayDate = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000);
  const fridayKyivStr = getKyivDateString(fridayDate);
  const sundayKyivStr = getKyivDateString(sundayDate);

  const pastWeekendTxs = cycleTransactions.filter((t) => {
    if (t.exclude_from_budget || t.type !== "expense" || t.deleted_at) {
      return false;
    }
    const tKyiv = getKyivDateString(t.created_at);
    return tKyiv >= fridayKyivStr && tKyiv <= sundayKyivStr;
  });

  const weekendSpent = pastWeekendTxs.reduce(
    (sum, t) => sum + getEffectiveTransactionExpense(t),
    0
  );

  const messageText = formatMondayResetMessage(
    pacing,
    weekendSpent,
    pastWeekendTxs.length
  );
  const replyMarkup = buildPacingAlertKeyboard();

  const sent = await sendTelegramMessage(messageText, replyMarkup);

  if (sent) {
    await supabase.from("budget_alerts").insert({
      alert_date: kyivTodayStr,
      alert_type: "pacing_monday_reset",
    });
  }

  return {
    success: true,
    sent,
    alertType: "pacing_monday_reset",
    data: {
      kyivTodayStr,
      weekendSpent,
      weekendTxsCount: pastWeekendTxs.length,
      safeWeekdaySpend: pacing.pacing.safeWeekdaySpend,
      safeWeekendSpend: pacing.pacing.safeWeekendSpend,
      discretionaryRemaining: pacing.budget.discretionaryRemaining,
      projectedSurplus: pacing.surplusProjection.projectedSurplusAmount,
    },
  };
}
