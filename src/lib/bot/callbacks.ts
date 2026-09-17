import { CATEGORIES } from "@/constants/categories";
import { escapeHtml } from "@/lib/security";
import {
  sendTelegramPhoto,
  editTelegramMessageText,
  answerTelegramCallbackQuery,
} from "@/lib/telegram";
import { computeSafeDailyBudget } from "@/lib/classify-formatter";
import { ParsedTelegramReceiptItem } from "@/lib/bot/types";
import {
  getCategoryEmoji,
  buildCategoryKeyboard,
  formatTransactionConfirmation,
} from "@/lib/bot/formatters";
import {
  handleTelegramPaceCommand,
  handleTelegramCycleSummaryCommand,
  handleTelegramEmergencyFundCommand,
  handleTelegramChartCommand,
} from "@/lib/bot/commands";

/**
 * Обробник callback_query від користувача в Telegram
 */
export async function handleTelegramCallbackQuery(
  callbackQuery: any,
  supabaseAdmin: any
): Promise<boolean> {
  const queryId = callbackQuery.id;
  const data = String(callbackQuery.data || "").trim();
  const chatId = callbackQuery.message?.chat?.id;
  const messageId = callbackQuery.message?.message_id;

  if (!queryId || !chatId || !messageId) return false;

  // 1. Відкриття клавіатури вибору категорії: tg_cat:<txId>
  if (data.startsWith("tg_cat:")) {
    const txId = parseInt(data.split(":")[1], 10);
    if (!txId) return false;

    const { data: tx } = await supabaseAdmin
      .from("transactions")
      .select("id, merchant_raw, amount, category_name")
      .eq("id", txId)
      .is("deleted_at", null)
      .maybeSingle();

    if (!tx) {
      await answerTelegramCallbackQuery(
        queryId,
        "Транзакцію не знайдено або вже видалено",
        true
      );
      return false;
    }

    const keyboard = buildCategoryKeyboard(txId, tx.category_name);
    const amountStr = `${Number(tx.amount).toFixed(2)} ₴`;
    const promptText = `Оберіть категорію для <b>${escapeHtml(tx.merchant_raw)}</b> (${amountStr}):`;

    await editTelegramMessageText(chatId, messageId, promptText, keyboard);
    await answerTelegramCallbackQuery(queryId);
    return true;
  }

  // 2. Зміна категорії: tg_setcat:<txId>:<categoryIndex>
  if (data.startsWith("tg_setcat:")) {
    const parts = data.split(":");
    const txId = parseInt(parts[1], 10);
    const catIdx = parseInt(parts[2], 10);

    if (!txId || isNaN(catIdx) || catIdx < 0 || catIdx >= CATEGORIES.length) {
      await answerTelegramCallbackQuery(queryId, "Некоректна категорія", true);
      return false;
    }

    const newCategory = CATEGORIES[catIdx];

    // Оновлюємо транзакцію в Supabase
    const { data: updatedTx, error: updateErr } = await supabaseAdmin
      .from("transactions")
      .update({ category_name: newCategory })
      .eq("id", txId)
      .select()
      .maybeSingle();

    if (updateErr || !updatedTx) {
      await answerTelegramCallbackQuery(
        queryId,
        "Помилка оновлення категорії",
        true
      );
      return false;
    }

    // Розраховуємо актуальний щоденний бюджет
    const dailyBudget = await computeSafeDailyBudget(supabaseAdmin);
    const confirmation = formatTransactionConfirmation({
      transaction: updatedTx,
      dailyBudget,
      itemsCount: Array.isArray(updatedTx.metadata?.receipt_items)
        ? updatedTx.metadata.receipt_items.length
        : 0,
    });

    const updatedText = `✅ <b>Категорію успішно змінено на ${getCategoryEmoji(newCategory)} ${escapeHtml(newCategory)}!</b>\n\n${confirmation.text}`;

    await editTelegramMessageText(
      chatId,
      messageId,
      updatedText,
      confirmation.replyMarkup
    );
    await answerTelegramCallbackQuery(
      queryId,
      `Категорію змінено: ${newCategory}`
    );
    return true;
  }

  // 3. Повернення назад із вибору категорії: tg_back:<txId>
  if (data.startsWith("tg_back:")) {
    const txId = parseInt(data.split(":")[1], 10);
    if (!txId) return false;

    const { data: tx } = await supabaseAdmin
      .from("transactions")
      .select("*")
      .eq("id", txId)
      .is("deleted_at", null)
      .maybeSingle();

    if (!tx) {
      await answerTelegramCallbackQuery(
        queryId,
        "Транзакцію не знайдено",
        true
      );
      return false;
    }

    const dailyBudget = await computeSafeDailyBudget(supabaseAdmin);
    const confirmation = formatTransactionConfirmation({
      transaction: tx,
      dailyBudget,
      itemsCount: Array.isArray(tx.metadata?.receipt_items)
        ? tx.metadata.receipt_items.length
        : 0,
    });

    await editTelegramMessageText(
      chatId,
      messageId,
      confirmation.text,
      confirmation.replyMarkup
    );
    await answerTelegramCallbackQuery(queryId);
    return true;
  }

  // 4. Скасування (м'яке видалення): tg_cancel:<txId>
  if (data.startsWith("tg_cancel:")) {
    const txId = parseInt(data.split(":")[1], 10);
    if (!txId) return false;

    const { data: tx } = await supabaseAdmin
      .from("transactions")
      .select("id, merchant_raw, amount, category_name")
      .eq("id", txId)
      .is("deleted_at", null)
      .maybeSingle();

    if (!tx) {
      await answerTelegramCallbackQuery(
        queryId,
        "Транзакцію вже скасовано",
        true
      );
      return false;
    }

    // М'яке видалення з фіксацією дати
    await supabaseAdmin
      .from("transactions")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", txId);

    const cancelledText = `❌ <b>Транзакцію скасовано!</b>\n💳 <b>${escapeHtml(tx.merchant_raw)}</b> на <b>${Number(tx.amount).toFixed(2)} ₴</b> переміщено в кошик.`;

    await editTelegramMessageText(chatId, messageId, cancelledText, {
      inline_keyboard: [],
    });
    await answerTelegramCallbackQuery(queryId, "Транзакцію скасовано");
    return true;
  }

  // 5. Розбиття чеку на позиції: tg_split:<txId>
  if (data.startsWith("tg_split:")) {
    const txId = parseInt(data.split(":")[1], 10);
    if (!txId) return false;

    const { data: parentTx } = await supabaseAdmin
      .from("transactions")
      .select("*")
      .eq("id", txId)
      .is("deleted_at", null)
      .maybeSingle();

    if (!parentTx) {
      await answerTelegramCallbackQuery(
        queryId,
        "Транзакцію не знайдено",
        true
      );
      return false;
    }

    const items: ParsedTelegramReceiptItem[] =
      parentTx.metadata?.receipt_items || [];

    if (!Array.isArray(items) || items.length === 0) {
      await answerTelegramCallbackQuery(
        queryId,
        "У чеку немає деталізованих позицій для розбиття",
        true
      );
      return false;
    }

    // Виключаємо батьківську транзакцію з бюджету
    const existingTags = Array.isArray(parentTx.tags) ? parentTx.tags : [];
    const updatedTags = Array.from(new Set([...existingTags, "розділена"]));

    await supabaseAdmin
      .from("transactions")
      .update({
        exclude_from_budget: true,
        tags: updatedTags,
      })
      .eq("id", txId);

    // Додаємо дочірні транзакції
    const childRecords = items.map((it) => ({
      amount: it.price,
      currency: parentTx.currency || "UAH",
      merchant_raw: `${parentTx.merchant_raw}: ${it.name}`,
      category_name: it.suggested_category || parentTx.category_name,
      source: "telegram_bot",
      type: parentTx.type || "expense",
      created_at: parentTx.created_at,
      parent_transaction_id: txId,
      exclude_from_budget: false,
      tags: ["спліт"],
    }));

    await supabaseAdmin.from("transactions").insert(childRecords);

    const splitLines = [
      `✂️ <b>Чек успішно розбито на ${items.length} позицій:</b>`,
      ``,
      ...items.map(
        (it) =>
          `• <b>${escapeHtml(it.name)}</b>: ${Number(it.price).toFixed(2)} ₴ (${getCategoryEmoji(it.suggested_category)} ${escapeHtml(it.suggested_category)})`
      ),
    ];

    await editTelegramMessageText(chatId, messageId, splitLines.join("\n"), {
      inline_keyboard: [],
    });
    await answerTelegramCallbackQuery(
      queryId,
      `Розбито на ${items.length} поз.`
    );
    return true;
  }

  // 6. Оновлення темпу: tg_refresh_pace
  if (data === "tg_refresh_pace") {
    const paceText = await handleTelegramPaceCommand(supabaseAdmin);
    const appUrl =
      process.env.APP_URL ||
      process.env.NEXT_PUBLIC_APP_URL ||
      "https://budget-pwa.vercel.app";

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
    const appUrl =
      process.env.APP_URL ||
      process.env.NEXT_PUBLIC_APP_URL ||
      "https://budget-pwa.vercel.app";

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
    const appUrl =
      process.env.APP_URL ||
      process.env.NEXT_PUBLIC_APP_URL ||
      "https://budget-pwa.vercel.app";

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
