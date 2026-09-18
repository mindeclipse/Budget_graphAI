import {
  handleCategoryKeyboardCallback,
  handleSetCategoryCallback,
  handleBackCategoryCallback,
  handleCancelTransactionCallback,
  handleSplitTransactionCallback,
} from "./category";
import { handleActionCallbacks } from "./actions";

export * from "./category";
export * from "./actions";

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
    return handleCategoryKeyboardCallback(
      queryId,
      chatId,
      messageId,
      data,
      supabaseAdmin
    );
  }

  // 2. Зміна категорії: tg_setcat:<txId>:<categoryIndex>
  if (data.startsWith("tg_setcat:")) {
    return handleSetCategoryCallback(
      queryId,
      chatId,
      messageId,
      data,
      supabaseAdmin
    );
  }

  // 3. Повернення назад із вибору категорії: tg_back:<txId>
  if (data.startsWith("tg_back:")) {
    return handleBackCategoryCallback(
      queryId,
      chatId,
      messageId,
      data,
      supabaseAdmin
    );
  }

  // 4. Скасування (м'яке видалення): tg_cancel:<txId>
  if (data.startsWith("tg_cancel:")) {
    return handleCancelTransactionCallback(
      queryId,
      chatId,
      messageId,
      data,
      supabaseAdmin
    );
  }

  // 5. Розбиття чеку на позиції: tg_split:<txId>
  if (data.startsWith("tg_split:")) {
    return handleSplitTransactionCallback(
      queryId,
      chatId,
      messageId,
      data,
      supabaseAdmin
    );
  }

  // 6. Інші дії: оновлення темпу, графік, підсумок циклу, подушка
  return handleActionCallbacks(queryId, chatId, messageId, data, supabaseAdmin);
}
