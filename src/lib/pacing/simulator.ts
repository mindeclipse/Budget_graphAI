import { Transaction } from "@/types/finance";
import { WeightedPacingOptions, PurchaseSimulationResult } from "./types";
import { calculateWeightedCalendarPacing } from "./calculator";

/**
 * Симулятор покупок «What-If Purchase Advisor»:
 * Оцінює наслідки планованої покупки для темпу бюджету
 */
export function simulatePurchaseImpact(
  purchaseAmount: number,
  transactions: Transaction[],
  options: WeightedPacingOptions = {},
  itemDescription?: string
): PurchaseSimulationResult {
  const currentPacing = calculateWeightedCalendarPacing(transactions, options);
  const currentDiscretionary = currentPacing.budget.discretionaryRemaining;
  const currentSafeWeekday = currentPacing.pacing.safeWeekdaySpend;
  const currentSafeWeekend = currentPacing.pacing.safeWeekendSpend;

  const newDiscretionary = Math.max(0, currentDiscretionary - purchaseAmount);

  // Розраховуємо новий темп після цієї покупки
  const remainingWeekdays = currentPacing.cycle.remainingWeekdays;
  const remainingWeekends = currentPacing.cycle.remainingWeekends;
  const alpha = currentPacing.pacing.weekendMultiplierUsed;
  const weightedDays = remainingWeekdays + alpha * remainingWeekends;

  let newSafeWeekday = 0;
  let newSafeWeekend = 0;

  if (weightedDays > 0 && newDiscretionary > 0) {
    newSafeWeekday = Math.round(newDiscretionary / weightedDays);
    newSafeWeekend = Math.round(newSafeWeekday * alpha);
  }

  const weekdayDropPercent =
    currentSafeWeekday > 0
      ? Math.round(
          ((currentSafeWeekday - newSafeWeekday) / currentSafeWeekday) * 100
        )
      : 100;
  const weekendDropPercent =
    currentSafeWeekend > 0
      ? Math.round(
          ((currentSafeWeekend - newSafeWeekend) / currentSafeWeekend) * 100
        )
      : 100;

  let verdict: "safe" | "caution" | "danger" = "safe";
  let verdictTitle = "✅ Безпечна покупка";
  let adviceHtml = "";

  const itemNameStr = itemDescription
    ? `покупки «<b>${itemDescription}</b>» (${purchaseAmount.toLocaleString("uk-UA")} ₴)`
    : `покупки на суму <b>${purchaseAmount.toLocaleString("uk-UA")} ₴</b>`;

  if (purchaseAmount > currentDiscretionary) {
    verdict = "danger";
    verdictTitle = "🚨 Перевищення бюджету";
    const deficit = purchaseAmount - currentDiscretionary;
    adviceHtml = `У разі здійснення ${itemNameStr} вільний бюджет буде перевищено на <b>${deficit.toLocaleString("uk-UA")} ₴</b>. До кінця місяця денний ліміт стане <b>0 ₴</b>. Рекомендовано перенести покупку або використати накопичення зі скарбнички.`;
  } else if (newSafeWeekday < 250 || weekdayDropPercent > 35) {
    verdict = "danger";
    verdictTitle = "⚠️ Критичне навантаження на темп";
    adviceHtml = `Після ${itemNameStr} денний ліміт у будні впаде з <b>${currentSafeWeekday} ₴</b> до <b>${newSafeWeekday} ₴/день</b> (-${weekdayDropPercent}%), а вікенд-буфер зменшиться до <b>${newSafeWeekend} ₴/день</b>. Бюджет увійде в зону підвищеного ризику.`;
  } else if (newSafeWeekday < 500 || weekdayDropPercent > 15) {
    verdict = "caution";
    verdictTitle = "⚡️ Потрібна дисципліна";
    adviceHtml = `Після ${itemNameStr} денний ліміт знизиться на <b>${weekdayDropPercent}%</b>: до <b>${newSafeWeekday} ₴/будень</b> та <b>${newSafeWeekend} ₴/вихідний</b>. Покупка допустима, якщо утриматись від інших непередбачених витрат.`;
  } else {
    verdict = "safe";
    verdictTitle = "✅ Безпечна покупка";
    adviceHtml = `Після ${itemNameStr} залишається комфортний запас: <b>${newSafeWeekday} ₴/будень</b> та <b>${newSafeWeekend} ₴/вихідний</b> (зниження лише на ${weekdayDropPercent}%). Витрата не порушить плановий ритм.`;
  }

  return {
    purchaseAmount,
    itemDescription,
    currentDiscretionary,
    newDiscretionary,
    currentSafeWeekday,
    newSafeWeekday,
    currentSafeWeekend,
    newSafeWeekend,
    weekdayDropPercent,
    weekendDropPercent,
    verdict,
    verdictTitle,
    adviceHtml,
  };
}
