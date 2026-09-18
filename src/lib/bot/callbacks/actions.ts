import {
  sendTelegramPhoto,
  editTelegramMessageText,
  answerTelegramCallbackQuery,
} from "@/lib/telegram";
import {
  handleTelegramPaceCommand,
  handleTelegramCycleSummaryCommand,
  handleTelegramEmergencyFundCommand,
  handleTelegramChartCommand,
} from "@/lib/bot/commands";

export async function handleActionCallbacks(
  queryId: string,
  chatId: number,
  messageId: number,
  data: string,
  supabaseAdmin: any
): Promise<boolean> {
  const appUrl =
    process.env.APP_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "https://budget-pwa.vercel.app";

  // 6. Оновлення темпу: tg_refresh_pace
  if (data === "tg_refresh_pace") {
    const paceText = await handleTelegramPaceCommand(supabaseAdmin);

    await editTelegramMessageText(chatId, messageId, paceText, {
      inline_keyboard: [
        [
          { text: "🔄 Оновити темп", callback_data: "tg_refresh_pace" },
          { text: "📊 Залишок циклу", callback_data: "tg_cycle_summary" },
        ],
        [
          { text: "📈 Графік", callback_data: "tg_send_chart" },
          { text: "📊 Відкрити BudgetGraph", url: appUrl },
        ],
      ],
    });
    await answerTelegramCallbackQuery(queryId, "Темп оновлено!");
    return true;
  }

  // 7. Оновлення залишку циклу: tg_cycle_summary
  if (data === "tg_cycle_summary") {
    const cycleText = await handleTelegramCycleSummaryCommand(supabaseAdmin);

    await editTelegramMessageText(chatId, messageId, cycleText, {
      inline_keyboard: [
        [
          { text: "🔄 Оновити", callback_data: "tg_cycle_summary" },
          { text: "🎯 Мій темп", callback_data: "tg_refresh_pace" },
        ],
        [
          { text: "📈 Графік", callback_data: "tg_send_chart" },
          { text: "📊 Відкрити BudgetGraph", url: appUrl },
        ],
      ],
    });
    await answerTelegramCallbackQuery(queryId, "Залишок циклу оновлено!");
    return true;
  }

  // 8. Оновлення подушки: tg_cushion_summary
  if (data === "tg_cushion_summary") {
    const cushionText = await handleTelegramEmergencyFundCommand(supabaseAdmin);

    await editTelegramMessageText(chatId, messageId, cushionText, {
      inline_keyboard: [
        [
          { text: "🔄 Оновити", callback_data: "tg_cushion_summary" },
          { text: "📊 Залишок циклу", callback_data: "tg_cycle_summary" },
        ],
        [
          { text: "📈 Графік", callback_data: "tg_send_chart" },
          { text: "📊 Відкрити BudgetGraph", url: appUrl },
        ],
      ],
    });
    await answerTelegramCallbackQuery(queryId, "Подушку оновлено!");
    return true;
  }

  // 9. Відправка графіку дашборду: tg_send_chart
  if (data === "tg_send_chart") {
    await answerTelegramCallbackQuery(queryId, "Генерую графік...");
    const { photoBuffer, caption, replyMarkup } =
      await handleTelegramChartCommand(supabaseAdmin);
    await sendTelegramPhoto(photoBuffer, caption, replyMarkup);
    return true;
  }

  return false;
}
