import { TelegramReplyMarkup, escapeHtml } from "@/lib/telegram";
import { formatAmount } from "@/lib/behavioral-metrics";
import { getAppUrl } from "./context-loader";

export function buildPacingAlertKeyboard(): TelegramReplyMarkup {
  const appUrl = getAppUrl();
  return {
    inline_keyboard: [
      [
        { text: "🔄 Оновити темп", callback_data: "tg_refresh_pace" },
        { text: "📊 Відкрити BudgetGraph", url: appUrl },
      ],
    ],
  };
}

export function formatFridayRadarMessage(
  pacing: any,
  weekendDaily: number,
  weekendThreeDayTotal: number
): string {
  const lines = [
    `🍻 <b>П'ятничний радар вихідних (Пт–Нд)</b>`,
    `🗓 <i>Ритм на 3 дні відпочинку та дозвілля</i>`,
    ``,
    `🎉 <b>Загальний вікенд-буфер (3 дні):</b> <code>${formatAmount(weekendThreeDayTotal)} ₴</code>`,
    `🍺 <b>Денний ліміт на вихідні:</b> ${formatAmount(weekendDaily)} ₴/день`,
    `💼 <b>Збережений ліміт на будні далі:</b> ${formatAmount(pacing.pacing.safeWeekdaySpend)} ₴/день (лінійний: ~${formatAmount(pacing.pacing.flatDailySpend)} ₴)`,
    ``,
    `📊 <b>Вільний залишок циклу:</b> ${formatAmount(pacing.budget.discretionaryRemaining)} ₴ (залишилось ${pacing.cycle.daysRemaining} дн.)`,
    `🔒 <b>Зарезервовано на підписки/оплати:</b> ${formatAmount(pacing.budget.reservedObligationsTotal)} ₴`,
  ];

  if (pacing.surplusProjection.projectedSurplusAmount > 0) {
    lines.push(
      ``,
      `🎯 <b>Очікуваний профіцит на кінець циклу:</b> +${formatAmount(pacing.surplusProjection.projectedSurplusAmount)} ₴ (${pacing.surplusProjection.savingsPotentialPercent}% бюджету)`
    );
  } else if ((pacing.surplusProjection.projectedDeficitAmount || 0) > 100) {
    lines.push(
      ``,
      `⚠️ <b>Ризик дефіциту на кінець циклу:</b> -${formatAmount(pacing.surplusProjection.projectedDeficitAmount || 0)} ₴`
    );
  }

  lines.push(``, `💡 <i>${escapeHtml(pacing.pacing.advice)}</i>`);
  return lines.join("\n");
}

export function formatMondayResetMessage(
  pacing: any,
  weekendSpent: number,
  pastWeekendTxsCount: number
): string {
  let weekendFeedback = "";
  if (weekendSpent === 0) {
    weekendFeedback = `✨ <b>Минулі вихідні пройшли без споживчих витрат (0 ₴)!</b> Чудовий резерв збережено.`;
  } else {
    weekendFeedback = `💸 <b>Витрачено за вікенд (Пт–Нд):</b> ${formatAmount(weekendSpent)} ₴ (${pastWeekendTxsCount} операцій)`;
  }

  const lines = [
    `🌅 <b>Понеділковий Runway Reset: новий робочий тиждень</b>`,
    `🗓 <i>Свіже калібрування злітної смуги бюджету</i>`,
    ``,
    weekendFeedback,
    ``,
    `💼 <b>Денна норма на будні (Пн–Чт):</b> <code>${formatAmount(pacing.pacing.safeWeekdaySpend)} ₴/день</code> (лінійний: ~${formatAmount(pacing.pacing.flatDailySpend)} ₴)`,
    `🍻 <b>Плановий вікенд-буфер:</b> ~${formatAmount(pacing.pacing.safeWeekendSpend)} ₴/день`,
    ``,
    `📊 <b>Вільний залишок:</b> ${formatAmount(pacing.budget.discretionaryRemaining)} ₴ (залишилось ${pacing.cycle.daysRemaining} дн.)`,
    `🔒 <b>Зарезервовано під обов'язкові платежі:</b> ${formatAmount(pacing.budget.reservedObligationsTotal)} ₴`,
  ];

  if (pacing.surplusProjection.projectedSurplusAmount > 0) {
    lines.push(
      ``,
      `🎯 <b>Прогноз профіциту на кінець циклу:</b> +${formatAmount(pacing.surplusProjection.projectedSurplusAmount)} ₴ (${pacing.surplusProjection.savingsPotentialPercent}% бюджету)`
    );
  } else if ((pacing.surplusProjection.projectedDeficitAmount || 0) > 100) {
    lines.push(
      ``,
      `⚠️ <b>Ризик дефіциту на кінець циклу:</b> -${formatAmount(pacing.surplusProjection.projectedDeficitAmount || 0)} ₴`
    );
  }

  lines.push(``, `💡 <i>${escapeHtml(pacing.pacing.advice)}</i>`);
  return lines.join("\n");
}
