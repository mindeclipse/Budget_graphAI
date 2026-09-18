import { formatWhatIfResponse } from "@/lib/bot/formatters";
import { simulatePurchaseImpact } from "@/lib/weighted-pacing";
import { loadCycleContext } from "./loader";

/**
 * Обробник довідки щодо симулятора What-If
 */
export function handleTelegramWhatIfGuideCommand(): string {
  return [
    `💡 <b>Симулятор покупок (What-If аналіз)</b>`,
    ``,
    `Симулятор дозволяє перед покупкою дізнатися, чи не порушить вона баланс бюджету та як змінить ваш щоденний темп витрат.`,
    ``,
    `🤖 <b>Як зробити запит? Напишіть у чат будь-яку з фраз:</b>`,
    `• <code>/whatif 1500</code> або <code>/whatif 2500 кросівки</code>`,
    `• <code>чи можу купити кросівки за 3200?</code>`,
    `• <code>хочу купити навушники 2500 грн</code>`,
    `• <code>чи норм витратити 800 на ресторан?</code>`,
    `• <code>планую покупку 4500</code>`,
    ``,
    `📊 <b>Що порахує бот:</b>`,
    `1. ✅ <b>Вердикт:</b> <i>Безпечно</i>, <i>Обережно</i> або <i>Не рекомендовано</i>.`,
    `2. 📉 <b>Зміну лімітів:</b> перерахує новий ліміт на будні (Пн-Чт) та вихідні (Пт-Нд).`,
    `3. 🔒 <b>Захист зобов'язань:</b> врахує всі майбутні підписки та обов'язкові платежі до кінця циклу.`,
  ].join("\n");
}

/**
 * Обробник симуляції What-If для Telegram
 */
export async function handleTelegramWhatIfCommand(
  amount: number,
  itemDescription: string | undefined,
  supabaseAdmin: any,
  now: Date = new Date()
): Promise<string> {
  const context = await loadCycleContext(supabaseAdmin, now);
  const {
    startDate,
    endDate,
    totalBudgetLimit,
    allValidTransactions,
    currentExpenseTotal,
    upcomingObligations,
  } = context;

  const simulation = simulatePurchaseImpact(
    amount,
    allValidTransactions,
    {
      now,
      startDate,
      endDate,
      totalBudgetLimit,
      currentExpenseTotal,
      upcomingObligations,
    },
    itemDescription
  );

  return formatWhatIfResponse(simulation);
}
