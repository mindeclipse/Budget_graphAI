import { escapeHtml } from "@/lib/security";
import {
  formatKyivDate,
  renderProgressBar,
  formatPaceResponse,
} from "@/lib/bot/formatters";
import { loadCyclePacing } from "./loader";

/**
 * Обробник команди або запиту про темп бюджету
 */
export async function handleTelegramPaceCommand(
  supabaseAdmin: any,
  now: Date = new Date()
): Promise<string> {
  const { pacing } = await loadCyclePacing(supabaseAdmin, now);
  return formatPaceResponse(pacing, now);
}

/**
 * Обробник запиту про розгорнутий залишок та підсумок циклу
 */
export async function handleTelegramCycleSummaryCommand(
  supabaseAdmin: any,
  now: Date = new Date()
): Promise<string> {
  const { pacing, startDate, endDate, totalBudgetLimit } =
    await loadCyclePacing(supabaseAdmin, now);

  const spentPercent = Math.min(
    999,
    Math.round(
      (pacing.budget.currentExpenseTotal / (totalBudgetLimit || 1)) * 100
    )
  );

  const statusEmojis: Record<string, string> = {
    healthy: "🟢",
    tight: "🟡",
    critical: "🟠",
    depleted: "🔴",
  };
  const statusEmoji = statusEmojis[pacing.pacing.status] || "ℹ️";

  const actualDailyAverage =
    pacing.cycle.daysPassed > 0
      ? Math.round(pacing.budget.currentExpenseTotal / pacing.cycle.daysPassed)
      : 0;

  const lines = [
    `📊 <b>Підсумок бюджетного циклу</b>`,
    ``,
    `🗓 <b>Період:</b> ${formatKyivDate(startDate)} — ${formatKyivDate(endDate)}`,
    `⏳ <b>Прогрес часу:</b> ${pacing.cycle.daysPassed} з ${pacing.cycle.daysTotal} дн. (залишилось ${pacing.cycle.daysRemaining} дн.)`,
    ``,
    `💰 <b>Загальний ліміт:</b> <code>${totalBudgetLimit.toLocaleString("uk-UA")} ₴</code>`,
    `💸 <b>Витрачено:</b> <code>${pacing.budget.currentExpenseTotal.toLocaleString("uk-UA")} ₴</code> (${spentPercent}%)`,
    `<code>[${renderProgressBar(spentPercent)}]</code>`,
    ``,
    `💵 <b>Вільний залишок:</b> <b>${pacing.budget.discretionaryRemaining.toLocaleString("uk-UA")} ₴</b>`,
    `🔒 <b>Зарезервовано під підписки:</b> ${pacing.budget.reservedObligationsTotal.toLocaleString("uk-UA")} ₴`,
    ``,
    `📈 <b>Середні витрати:</b>`,
    `• Фактично: ~${actualDailyAverage.toLocaleString("uk-UA")} ₴/день`,
    `• Базовий орієнтир: ~${pacing.pacing.flatDailySpend.toLocaleString("uk-UA")} ₴/день`,
    `• Рекомендовано будні: ~${pacing.pacing.safeWeekdaySpend.toLocaleString("uk-UA")} ₴/день`,
    `• Рекомендовано вихідні: ~${pacing.pacing.safeWeekendSpend.toLocaleString("uk-UA")} ₴/день`,
  ];

  if (pacing.surplusProjection.projectedSurplusAmount > 0) {
    lines.push(
      ``,
      `🎯 <b>Очікуваний профіцит:</b> +${pacing.surplusProjection.projectedSurplusAmount.toLocaleString("uk-UA")} ₴ (${pacing.surplusProjection.savingsPotentialPercent}%)`
    );
  }

  lines.push(
    ``,
    `${statusEmoji} <b>Статус:</b> ${pacing.pacing.statusLabel}`,
    `💡 <i>${escapeHtml(pacing.pacing.advice)}</i>`
  );

  return lines.join("\n");
}
