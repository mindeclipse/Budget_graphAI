import {
  sendTelegramMessage,
  sendTelegramPhoto,
  getPersistentReplyKeyboard,
} from "@/lib/telegram";
import {
  isPaceInquiry,
  isCycleSummaryInquiry,
  isChartInquiry,
  isEmergencyFundInquiry,
  isWhatIfGuideInquiry,
  parseWhatIfPurchaseQuery,
  handleTelegramPaceCommand,
  handleTelegramCycleSummaryCommand,
  handleTelegramChartCommand,
  handleTelegramEmergencyFundCommand,
  handleTelegramWhatIfGuideCommand,
  handleTelegramWhatIfCommand,
} from "@/lib/telegram-bot";

function getAppUrl(): string {
  return (
    process.env.APP_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "https://budget-pwa.vercel.app"
  );
}

export async function handleStartHelpCommand(): Promise<void> {
  const welcomeText = [
    `👋 <b>Вітаю у BudgetGraph Bot!</b>`,
    ``,
    `Я допоможу вам зручно фіксувати фінанси та тримати здоровий ритм витрат:`,
    ``,
    `💬 <b>Запис витрат і доходів:</b>`,
    `• <code>таксі 240</code>`,
    `• <code>вчора аптека 480 вітаміни</code>`,
    `• <code>Сільпо 1250 продукти</code>`,
    `• <code>кава 85</code>`,
    `• <code>зарплата 45000</code>`,
    ``,
    `🎯 <b>Швидкі дії на клавіатурі внизу:</b>`,
    `• 🎯 <b>Мій темп</b> — актуальний ліміт на день (будні vs вихідні) та прогноз`,
    `• 📊 <b>Залишок циклу</b> — загальний ліміт, витрати, прогрес і залишок`,
    `• 📈 <b>Графік</b> (/chart) — графічна картка темпу зі спідометром витрат`,
    `• 🛡️ <b>Подушка</b> — баланс скарбнички автоокруглення та резерви`,
    `• 💡 <b>Що якщо...?</b> — симулятор покупок перед здійсненням витрат`,
    ``,
    `🧾 <b>Електронні чеки та PDF:</b>`,
    `• Надішліть скріншот чека (Сільпо, Monobank, Checkbox тощо).`,
    `• Надішліть PDF-квитанцію або платіжну інструкцію.`,
    ``,
    `🏷 <b>Керування категоріями:</b>`,
    `Під кожним повідомленням доступні кнопки швидкої зміни категорії, скасування або розбиття чеку на окремі позиції.`,
  ].join("\n");

  await sendTelegramMessage(welcomeText, getPersistentReplyKeyboard());
}

export async function handleBotInquiry(
  text: string,
  supabaseAdmin: any
): Promise<boolean> {
  const appUrl = getAppUrl();

  // 1. Запит про стан та зважений темп бюджету
  if (isPaceInquiry(text)) {
    const paceReply = await handleTelegramPaceCommand(supabaseAdmin);
    await sendTelegramMessage(paceReply, {
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
    return true;
  }

  // 2. Запит про підсумок та залишок циклу
  if (isCycleSummaryInquiry(text)) {
    const cycleReply = await handleTelegramCycleSummaryCommand(supabaseAdmin);
    await sendTelegramMessage(cycleReply, {
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
    return true;
  }

  // 3. Запит про графік / візуальний дашборд
  if (isChartInquiry(text)) {
    const { photoBuffer, caption, replyMarkup } =
      await handleTelegramChartCommand(supabaseAdmin);
    await sendTelegramPhoto(photoBuffer, caption, replyMarkup);
    return true;
  }

  // 4. Запит про фінансову подушку безпеки
  if (isEmergencyFundInquiry(text)) {
    const cushionReply =
      await handleTelegramEmergencyFundCommand(supabaseAdmin);
    await sendTelegramMessage(cushionReply, {
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
    return true;
  }

  // 5. Інструкція щодо симулятора What-If
  if (isWhatIfGuideInquiry(text)) {
    const guideReply = handleTelegramWhatIfGuideCommand();
    await sendTelegramMessage(guideReply, {
      inline_keyboard: [
        [
          { text: "🎯 Мій темп", callback_data: "tg_refresh_pace" },
          { text: "📊 Залишок циклу", callback_data: "tg_cycle_summary" },
        ],
        [{ text: "📊 Відкрити BudgetGraph", url: appUrl }],
      ],
    });
    return true;
  }

  // 6. Симулятор покупок What-If
  const whatIf = parseWhatIfPurchaseQuery(text);
  if (whatIf) {
    const whatIfReply = await handleTelegramWhatIfCommand(
      whatIf.amount,
      whatIf.item,
      supabaseAdmin
    );
    await sendTelegramMessage(whatIfReply, {
      inline_keyboard: [
        [
          { text: "📊 Переглянути бюджет", url: appUrl },
          { text: "🎯 Мій темп", callback_data: "tg_refresh_pace" },
        ],
      ],
    });
    return true;
  }

  return false;
}
