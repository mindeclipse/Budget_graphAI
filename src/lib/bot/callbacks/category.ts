import { CATEGORIES } from "@/constants/categories";
import { escapeHtml } from "@/lib/security";
import {
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

export async function handleCategoryKeyboardCallback(
  queryId: string,
  chatId: number,
  messageId: number,
  data: string,
  supabaseAdmin: any
): Promise<boolean> {
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

export async function handleSetCategoryCallback(
  queryId: string,
  chatId: number,
  messageId: number,
  data: string,
  supabaseAdmin: any
): Promise<boolean> {
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

export async function handleBackCategoryCallback(
  queryId: string,
  chatId: number,
  messageId: number,
  data: string,
  supabaseAdmin: any
): Promise<boolean> {
  const txId = parseInt(data.split(":")[1], 10);
  if (!txId) return false;

  const { data: tx } = await supabaseAdmin
    .from("transactions")
    .select("*")
    .eq("id", txId)
    .is("deleted_at", null)
    .maybeSingle();

  if (!tx) {
    await answerTelegramCallbackQuery(queryId, "Транзакцію не знайдено", true);
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

export async function handleCancelTransactionCallback(
  queryId: string,
  chatId: number,
  messageId: number,
  data: string,
  supabaseAdmin: any
): Promise<boolean> {
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

export async function handleSplitTransactionCallback(
  queryId: string,
  chatId: number,
  messageId: number,
  data: string,
  supabaseAdmin: any
): Promise<boolean> {
  const txId = parseInt(data.split(":")[1], 10);
  if (!txId) return false;

  const { data: parentTx } = await supabaseAdmin
    .from("transactions")
    .select("*")
    .eq("id", txId)
    .is("deleted_at", null)
    .maybeSingle();

  if (!parentTx) {
    await answerTelegramCallbackQuery(queryId, "Транзакцію не знайдено", true);
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
  await answerTelegramCallbackQuery(queryId, `Розбито на ${items.length} поз.`);
  return true;
}
