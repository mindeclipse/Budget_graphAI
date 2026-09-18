import { escapeHtml } from "@/lib/security";
import {
  TelegramReplyMarkup,
  TelegramInlineKeyboardButton,
} from "@/lib/telegram";
import { DailyBudgetInfo } from "@/lib/classify-formatter";
import {
  WeightedPacingResult,
  PurchaseSimulationResult,
  isWeekendOrLeisureDay,
} from "@/lib/weighted-pacing";
import { getKyivDayOfWeek } from "@/lib/behavioral-metrics";
import { getCategoryEmoji } from "./emojis";
import { formatKyivDateTime } from "./date";

/**
 * Форматує підтвердження створеної транзакції
 */
export function formatTransactionConfirmation(params: {
  transaction: any;
  dailyBudget?: DailyBudgetInfo | null;
  roundupResult?: any;
  itemsCount?: number;
}): { text: string; replyMarkup: TelegramReplyMarkup } {
  const { transaction, dailyBudget, roundupResult, itemsCount } = params;

  const emoji = getCategoryEmoji(transaction.category_name);
  const amountFormatted = `${Number(transaction.amount).toLocaleString(
    "uk-UA",
    {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }
  )} ₴`;

  const isIncome = transaction.type === "income";
  const isInvestment = transaction.type === "investment";
  const isExpense = !isIncome && !isInvestment;

  const isEmergency =
    Boolean(transaction.metadata?.is_emergency) ||
    (Array.isArray(transaction.tags) && transaction.tags.includes("форсмажор"));

  const amort = transaction.metadata?.amortization;

  let title = `✅ <b>Витрату записано!</b>`;
  let sign = "";
  if (isIncome) {
    title = `💵 <b>Дохід зараховано!</b>`;
    sign = "+";
  } else if (isInvestment) {
    title = `📈 <b>Інвестицію зафіксовано!</b>`;
  }

  const lines = [
    title,
    ``,
    `💳 <b>${escapeHtml(transaction.merchant_raw)}</b>: <b>${sign}${amountFormatted}</b>`,
    `🏷 Категорія: ${emoji} <b>${escapeHtml(transaction.category_name)}</b>`,
    `📅 ${formatKyivDateTime(transaction.created_at)}`,
  ];

  if (isEmergency) {
    lines.push(
      ``,
      `🛡️ <b>Форс-мажор (екстрена витрата)</b>`,
      `💡 <i>Враховано в бюджеті. ШІ та аналітика зафіксують це як вимушену потребу, а не споживче марнотратство.</i>`
    );
  } else if (amort && typeof amort === "object" && Number(amort.months) > 1) {
    const totalMonths = Number(amort.months);
    const monthlyAmt =
      Number(amort.monthly_amount) ||
      Math.round(Number(transaction.amount || 0) / totalMonths);
    lines.push(
      ``,
      `🗓 <b>Амортизація на ${totalMonths} міс</b> (по <b>~${monthlyAmt.toLocaleString("uk-UA")} ₴/міс</b>)`,
      `💡 <i>З балансу списано всю суму. ШІ та аналітика зафіксують це як планову інвестицію на ${totalMonths} міс, а не разове марнотратство.</i>`
    );
  }

  if (isExpense && !isEmergency) {
    if (roundupResult?.roundupAmount) {
      lines.push(
        `🐷 Подушка: +<b>${Number(roundupResult.roundupAmount).toFixed(2)} ₴</b>`
      );
    }

    if (dailyBudget) {
      if (dailyBudget.todayRemaining > 0) {
        lines.push(
          `🎯 На день залишилось: <b>${dailyBudget.todayRemaining.toLocaleString("uk-UA").replace(/\u00A0/g, " ")} ₴</b>`
        );
      } else if (dailyBudget.todayRemaining === 0) {
        lines.push(`⚠️ <b>Денний бюджет на сьогодні вичерпано!</b>`);
      } else {
        const over = Math.abs(dailyBudget.todayRemaining)
          .toLocaleString("uk-UA")
          .replace(/\u00A0/g, " ");
        lines.push(`⚠️ <b>Переліміт за сьогодні: -${over} ₴</b>`);
      }
    }
  }

  const buttons: TelegramInlineKeyboardButton[][] = [
    [
      {
        text: "🏷 Змінити категорію",
        callback_data: `tg_cat:${transaction.id}`,
      },
      {
        text: "❌ Скасувати",
        callback_data: `tg_cancel:${transaction.id}`,
      },
    ],
  ];

  if (itemsCount && itemsCount > 1) {
    buttons.push([
      {
        text: `✂️ Split (${itemsCount})`,
        callback_data: `tg_split:${transaction.id}`,
      },
    ]);
  }

  return {
    text: lines.join("\n"),
    replyMarkup: { inline_keyboard: buttons },
  };
}

/**
 * Форматує відповідь на запит про зважений календарний темп
 */
export function formatPaceResponse(
  pacing: WeightedPacingResult,
  now: Date = new Date()
): string {
  const dayOfWeek = getKyivDayOfWeek(now);
  const isWeekend = isWeekendOrLeisureDay(dayOfWeek);
  const dayNames = [
    "Неділя",
    "Понеділок",
    "Вівторок",
    "Середа",
    "Четвер",
    "П'ятниця",
    "Субота",
  ];
  const dayName = dayNames[dayOfWeek] || "Сьогодні";

  const todayAllowance = isWeekend
    ? pacing.pacing.safeWeekendSpend
    : pacing.pacing.safeWeekdaySpend;

  const lines = [
    `🗓 <b>Сьогодні ${dayName} (${isWeekend ? "вихідний/дозвілля" : "робочий день"})</b>`,
    ``,
    `💰 <b>Безпечно на день:</b> <code>${todayAllowance.toLocaleString("uk-UA")} ₴</code> (лінійний: ~${pacing.pacing.flatDailySpend.toLocaleString("uk-UA")} ₴/д)`,
    `💼 <b>Будні (Пн–Чт):</b> ${pacing.pacing.safeWeekdaySpend.toLocaleString("uk-UA")} ₴/день`,
    `🍻 <b>Вікенд-буфер (Пт–Нд):</b> ~${pacing.pacing.safeWeekendSpend.toLocaleString("uk-UA")} ₴/день`,
    ``,
    `🔒 <b>Зарезервовано під підписки:</b> ${pacing.budget.reservedObligationsTotal.toLocaleString("uk-UA")} ₴`,
    `📊 <b>Вільний залишок:</b> ${pacing.budget.discretionaryRemaining.toLocaleString("uk-UA")} ₴ (залишилось ${pacing.cycle.daysRemaining} дн.)`,
  ];

  if (pacing.surplusProjection.projectedSurplusAmount > 0) {
    lines.push(
      ``,
      `🎯 <b>Очікуваний профіцит на кінець циклу:</b> +${pacing.surplusProjection.projectedSurplusAmount.toLocaleString("uk-UA")} ₴ (${pacing.surplusProjection.savingsPotentialPercent}% бюджету)`
    );
  } else if ((pacing.surplusProjection.projectedDeficitAmount || 0) > 100) {
    lines.push(
      ``,
      `⚠️ <b>Ризик дефіциту на кінець циклу:</b> -${(pacing.surplusProjection.projectedDeficitAmount || 0).toLocaleString("uk-UA")} ₴`
    );
  }

  lines.push(``, `💡 <i>${escapeHtml(pacing.pacing.advice)}</i>`);

  return lines.join("\n");
}

/**
 * Форматує результат симуляції покупки What-If
 */
export function formatWhatIfResponse(sim: PurchaseSimulationResult): string {
  const lines = [
    `${sim.verdictTitle}`,
    ``,
    sim.adviceHtml,
    ``,
    `📉 <b>Вплив на щоденний ліміт:</b>`,
    `• Будні: ${sim.currentSafeWeekday} ₴ ➔ <b>${sim.newSafeWeekday} ₴/день</b> (-${sim.weekdayDropPercent}%)`,
    `• Вихідні: ${sim.currentSafeWeekend} ₴ ➔ <b>${sim.newSafeWeekend} ₴/день</b> (-${sim.weekendDropPercent}%)`,
    `• Вільний залишок після покупки: <b>${sim.newDiscretionary.toLocaleString("uk-UA")} ₴</b>`,
  ];

  return lines.join("\n");
}
