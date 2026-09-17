import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { timingSafeEqual } from "@/lib/security";
import {
  sendTelegramMessage,
  sendTelegramPhoto,
  sendTelegramChatAction,
  getTelegramFile,
  escapeHtml,
  getPersistentReplyKeyboard,
} from "@/lib/telegram";
import {
  parseNaturalLanguageExpense,
  parseMultimodalReceipt,
  applyMerchantRules,
  recordTelegramTransaction,
  formatTransactionConfirmation,
  handleTelegramCallbackQuery,
  isPaceInquiry,
  isCycleSummaryInquiry,
  isChartInquiry,
  isEmergencyFundInquiry,
  isWhatIfGuideInquiry,
  parseWhatIfPurchaseQuery,
  isFinancialInquiry,
  handleTelegramPaceCommand,
  handleTelegramCycleSummaryCommand,
  handleTelegramChartCommand,
  handleTelegramEmergencyFundCommand,
  handleTelegramWhatIfGuideCommand,
  handleTelegramWhatIfCommand,
  handleTelegramFinancialInquiry,
} from "@/lib/telegram-bot";

export const dynamic = "force-dynamic";

// Валідація секретного токена вебхука від Telegram
function validateTelegramSecret(req: NextRequest): boolean {
  const secretHeader = req.headers.get("x-telegram-bot-api-secret-token");
  const configuredSecret = process.env.TELEGRAM_WEBHOOK_SECRET;

  // Якщо секрет налаштовано в оточенні — суворо перевіряємо через timingSafeEqual
  if (configuredSecret) {
    if (!secretHeader) return false;
    return timingSafeEqual(secretHeader, configuredSecret);
  }

  // Якщо специфічний секрет вебхука не задано, дозволяємо (авторизація суворо відбудеться за TELEGRAM_CHAT_ID)
  return true;
}

export async function GET(req: NextRequest) {
  return NextResponse.json({ status: "Telegram Webhook Active" });
}

export async function POST(req: NextRequest) {
  if (!validateTelegramSecret(req)) {
    console.warn(
      "[Telegram Webhook] Unauthorized request: invalid secret token"
    );
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const supabaseAdmin = getSupabaseAdmin();
    const authorizedChatId = process.env.TELEGRAM_CHAT_ID;

    // 1. Обробка inline кнопок (callback_query)
    if (body.callback_query) {
      const incomingChatId =
        body.callback_query.message?.chat?.id || body.callback_query.from?.id;

      if (
        !authorizedChatId ||
        String(incomingChatId) !== String(authorizedChatId)
      ) {
        console.warn(
          `[Telegram Webhook] Unauthorized callback_query from chatId: ${incomingChatId}`
        );
        return NextResponse.json({ ok: true });
      }

      await handleTelegramCallbackQuery(body.callback_query, supabaseAdmin);
      return NextResponse.json({ ok: true });
    }

    // 2. Обробка вхідних повідомлень
    const message = body.message;
    if (!message) {
      return NextResponse.json({ ok: true });
    }

    const chatId = message.chat?.id;
    if (!authorizedChatId || String(chatId) !== String(authorizedChatId)) {
      console.warn(
        `[Telegram Webhook] Unauthorized message from chatId: ${chatId}`
      );
      return NextResponse.json({ ok: true });
    }

    const text = message.text?.trim() || "";

    // А. Команди початку роботи / допомоги
    if (text === "/start" || text === "/help" || text === "/menu") {
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
      return NextResponse.json({ ok: true });
    }

    // Б. Обробка фотографій (скріншоти електронних фіскальних чеків)
    if (Array.isArray(message.photo) && message.photo.length > 0) {
      const bestPhoto = message.photo[message.photo.length - 1];
      const downloaded = await getTelegramFile(bestPhoto.file_id);

      if (!downloaded) {
        await sendTelegramMessage(
          "⚠️ Не вдалося завантажити зображення з серверів Telegram. Спробуйте ще раз."
        );
        return NextResponse.json({ ok: true });
      }

      const receipt = await parseMultimodalReceipt(
        downloaded.buffer,
        "image/jpeg"
      );

      if (!receipt) {
        await sendTelegramMessage(
          "⚠️ Не вдалося розпізнати чек на зображенні. Переконайтеся, що скріншот чіткий, або запишіть витрату текстом (наприклад: <i>«Сільпо 450»</i>)."
        );
        return NextResponse.json({ ok: true });
      }

      // Застосовуємо правила користувача з бази
      const { merchant, category } = await applyMerchantRules(
        receipt.merchant,
        supabaseAdmin
      );

      const finalCategory = category || receipt.suggested_category;

      const { transaction, dailyBudget, roundupResult } =
        await recordTelegramTransaction(supabaseAdmin, {
          amount: receipt.amount,
          currency: receipt.currency,
          merchant,
          category: finalCategory,
          type: receipt.type,
          date: receipt.date,
          metadata: {
            source_type: "photo_receipt",
            file_name: downloaded.fileName,
            receipt_items: receipt.items || [],
          },
        });

      const confirmation = formatTransactionConfirmation({
        transaction,
        dailyBudget,
        roundupResult,
        itemsCount: receipt.items?.length || 0,
      });

      await sendTelegramMessage(confirmation.text, confirmation.replyMarkup);
      return NextResponse.json({ ok: true });
    }

    // В. Обробка документів (PDF-квитанції або зображення без стиснення)
    if (message.document) {
      const doc = message.document;
      const mimeType = (doc.mime_type || "").toLowerCase();
      const fileName = (doc.file_name || "").toLowerCase();

      const isPdf = mimeType.includes("pdf") || fileName.endsWith(".pdf");
      const isImage =
        mimeType.startsWith("image/") || fileName.match(/\.(png|jpe?g|webp)$/i);

      if (!isPdf && !isImage) {
        await sendTelegramMessage(
          "⚠️ Підтримуються лише PDF-квитанції або зображення чеків (PNG, JPEG, WEBP)."
        );
        return NextResponse.json({ ok: true });
      }

      const downloaded = await getTelegramFile(doc.file_id);
      if (!downloaded) {
        await sendTelegramMessage(
          "⚠️ Не вдалося завантажити документ. Спробуйте надіслати ще раз."
        );
        return NextResponse.json({ ok: true });
      }

      const actualMime = isPdf ? "application/pdf" : mimeType || "image/jpeg";
      const receipt = await parseMultimodalReceipt(
        downloaded.buffer,
        actualMime
      );

      if (!receipt) {
        await sendTelegramMessage(
          "⚠️ Не вдалося автоматично витягти дані з документа. Перевірте читабельність квитанції."
        );
        return NextResponse.json({ ok: true });
      }

      const { merchant, category } = await applyMerchantRules(
        receipt.merchant,
        supabaseAdmin
      );

      const finalCategory = category || receipt.suggested_category;

      const { transaction, dailyBudget, roundupResult } =
        await recordTelegramTransaction(supabaseAdmin, {
          amount: receipt.amount,
          currency: receipt.currency,
          merchant,
          category: finalCategory,
          type: receipt.type,
          date: receipt.date,
          metadata: {
            source_type: "document_receipt",
            file_name: doc.file_name,
            receipt_items: receipt.items || [],
          },
        });

      const confirmation = formatTransactionConfirmation({
        transaction,
        dailyBudget,
        roundupResult,
        itemsCount: receipt.items?.length || 0,
      });

      await sendTelegramMessage(confirmation.text, confirmation.replyMarkup);
      return NextResponse.json({ ok: true });
    }

    // Г. Обробка тексту природною мовою
    if (text) {
      // 1. Запит про стан та зважений темп бюджету (/pace, "🎯 Мій темп", "який темп?", "скільки на день?")
      if (isPaceInquiry(text)) {
        const paceReply = await handleTelegramPaceCommand(supabaseAdmin);
        const appUrl =
          process.env.APP_URL ||
          process.env.NEXT_PUBLIC_APP_URL ||
          "https://budget-pwa.vercel.app";

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
        return NextResponse.json({ ok: true });
      }

      // 2. Запит про підсумок та залишок циклу ("📊 Залишок циклу", /cycle, "залишок циклу")
      if (isCycleSummaryInquiry(text)) {
        const cycleReply =
          await handleTelegramCycleSummaryCommand(supabaseAdmin);
        const appUrl =
          process.env.APP_URL ||
          process.env.NEXT_PUBLIC_APP_URL ||
          "https://budget-pwa.vercel.app";

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
        return NextResponse.json({ ok: true });
      }

      // 2.5. Запит про графік / візуальний дашборд ("📈 Графік", /chart, "дашборд")
      if (isChartInquiry(text)) {
        const { photoBuffer, caption, replyMarkup } =
          await handleTelegramChartCommand(supabaseAdmin);
        await sendTelegramPhoto(photoBuffer, caption, replyMarkup);
        return NextResponse.json({ ok: true });
      }

      // 3. Запит про фінансову подушку безпеки ("🛡️ Подушка", /cushion, "подушка")
      if (isEmergencyFundInquiry(text)) {
        const cushionReply =
          await handleTelegramEmergencyFundCommand(supabaseAdmin);
        const appUrl =
          process.env.APP_URL ||
          process.env.NEXT_PUBLIC_APP_URL ||
          "https://budget-pwa.vercel.app";

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
        return NextResponse.json({ ok: true });
      }

      // 4. Інструкція щодо симулятора What-If ("💡 Що якщо...?", /whatif, "що якщо")
      if (isWhatIfGuideInquiry(text)) {
        const guideReply = handleTelegramWhatIfGuideCommand();
        const appUrl =
          process.env.APP_URL ||
          process.env.NEXT_PUBLIC_APP_URL ||
          "https://budget-pwa.vercel.app";

        await sendTelegramMessage(guideReply, {
          inline_keyboard: [
            [
              { text: "🎯 Мій темп", callback_data: "tg_refresh_pace" },
              { text: "📊 Залишок циклу", callback_data: "tg_cycle_summary" },
            ],
            [{ text: "📊 Відкрити BudgetGraph", url: appUrl }],
          ],
        });
        return NextResponse.json({ ok: true });
      }

      // 5. Симулятор покупок What-If ("чи можу купити ... за ...?", "хочу купити куртку 3500")
      const whatIf = parseWhatIfPurchaseQuery(text);
      if (whatIf) {
        const whatIfReply = await handleTelegramWhatIfCommand(
          whatIf.amount,
          whatIf.item,
          supabaseAdmin
        );
        const appUrl =
          process.env.APP_URL ||
          process.env.NEXT_PUBLIC_APP_URL ||
          "https://budget-pwa.vercel.app";

        await sendTelegramMessage(whatIfReply, {
          inline_keyboard: [
            [
              { text: "📊 Переглянути бюджет", url: appUrl },
              { text: "🎯 Мій темп", callback_data: "tg_refresh_pace" },
            ],
          ],
        });
        return NextResponse.json({ ok: true });
      }

      // 6. Розумні фінансові запити природною мовою через AI
      if (isFinancialInquiry(text)) {
        await sendTelegramChatAction("typing");
        const { replyHtml, replyMarkup } = await handleTelegramFinancialInquiry(
          text,
          supabaseAdmin
        );
        await sendTelegramMessage(replyHtml, replyMarkup);
        return NextResponse.json({ ok: true });
      }

      const parsed = await parseNaturalLanguageExpense(text);

      if (!parsed) {
        // Якщо це розгорнуте речення (від 8 символів), можливо це незвичне фінансове запитання
        if (text.trim().length >= 8) {
          await sendTelegramChatAction("typing");
          const { replyHtml, replyMarkup } =
            await handleTelegramFinancialInquiry(text, supabaseAdmin);
          await sendTelegramMessage(replyHtml, replyMarkup);
          return NextResponse.json({ ok: true });
        }

        await sendTelegramMessage(
          "⚠️ Не вдалося розпізнати суму або назву. Спробуйте, наприклад:\n• <code>таксі 240</code>\n• <code>Сільпо 480 продукти</code>\n• <code>вчора кафе 350</code>\n\nАбо запитайте асистента: <i>«Скільки пішло на продукти?»</i> чи <i>«Чи вистачить грошей до кінця місяця?»</i>"
        );
        return NextResponse.json({ ok: true });
      }

      const { merchant, category } = await applyMerchantRules(
        parsed.merchant,
        supabaseAdmin
      );

      const finalCategory = category || parsed.category;

      const { transaction, dailyBudget, roundupResult } =
        await recordTelegramTransaction(supabaseAdmin, {
          amount: parsed.amount,
          currency: "UAH",
          merchant,
          category: finalCategory,
          type: parsed.type,
          date: parsed.date,
          exclude_from_budget: parsed.exclude_from_budget,
          tags: parsed.tags,
          metadata: {
            source_type: "natural_language_text",
            raw_text: text,
            note: parsed.note,
            ...(parsed.metadata || {}),
          },
        });

      const confirmation = formatTransactionConfirmation({
        transaction,
        dailyBudget,
        roundupResult,
      });

      await sendTelegramMessage(confirmation.text, confirmation.replyMarkup);
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error("[Telegram Webhook Error]:", error);
    // Завжди повертаємо 200 Telegram, щоб запобігти шторму повторних запитів
    return NextResponse.json({ ok: true });
  }
}
