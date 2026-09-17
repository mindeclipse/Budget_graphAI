import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { sendTelegramMessage } from "@/lib/telegram";
import { getKyivDateString } from "@/lib/behavioral-metrics";
import { PacingAlertOptions, PacingAlertResult } from "./types";
import { loadCyclePacingContext } from "./context-loader";
import {
  buildPacingAlertKeyboard,
  formatFridayRadarMessage,
} from "./formatters";

/**
 * П'ятничний радар вихідних (Friday Weekend Radar):
 * Розраховує та надсилає зважений вікенд-буфер на 3 дні (Пт-Сб-Нд),
 * показує збережений ліміт на наступний тиждень та прогноз профіциту.
 */
export async function generateFridayRadarAlert(
  options?: PacingAlertOptions
): Promise<PacingAlertResult> {
  const supabase = options?.supabaseInstance || getSupabaseAdmin();
  const now = options?.now || new Date();
  const kyivTodayStr = getKyivDateString(now);

  // 1. Дедуплікація: не надсилати повторно у ту саму п'ятницю
  if (!options?.force) {
    const { data: existingAlert } = await supabase
      .from("budget_alerts")
      .select("id")
      .eq("alert_date", kyivTodayStr)
      .eq("alert_type", "pacing_friday_radar")
      .maybeSingle();

    if (existingAlert) {
      return {
        success: true,
        sent: false,
        alertType: "pacing_friday_radar",
        reason: "already_sent_today",
      };
    }
  }

  // 2. Отримання контексту циклу та розрахунок зваженого темпу
  const { pacing } = await loadCyclePacingContext(supabase, now);

  const weekendDaily = pacing.pacing.safeWeekendSpend;
  const weekendThreeDayTotal = weekendDaily * 3;

  const messageText = formatFridayRadarMessage(
    pacing,
    weekendDaily,
    weekendThreeDayTotal
  );
  const replyMarkup = buildPacingAlertKeyboard();

  const sent = await sendTelegramMessage(messageText, replyMarkup);

  if (sent) {
    await supabase.from("budget_alerts").insert({
      alert_date: kyivTodayStr,
      alert_type: "pacing_friday_radar",
    });
  }

  return {
    success: true,
    sent,
    alertType: "pacing_friday_radar",
    data: {
      kyivTodayStr,
      weekendThreeDayTotal,
      weekendDaily,
      safeWeekdaySpend: pacing.pacing.safeWeekdaySpend,
      discretionaryRemaining: pacing.budget.discretionaryRemaining,
      projectedSurplus: pacing.surplusProjection.projectedSurplusAmount,
    },
  };
}
