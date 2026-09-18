import { sendTelegramMessage, sendTelegramChatAction } from "@/lib/telegram";
import {
  parseNaturalLanguageExpense,
  applyMerchantRules,
  recordTelegramTransaction,
  formatTransactionConfirmation,
  isFinancialInquiry,
  handleTelegramFinancialInquiry,
} from "@/lib/telegram-bot";

export async function handleTextMessage(
  text: string,
  supabaseAdmin: any
): Promise<void> {
  // 1. Розумні фінансові запити природною мовою через AI
  if (isFinancialInquiry(text)) {
    await sendTelegramChatAction("typing");
    const { replyHtml, replyMarkup } = await handleTelegramFinancialInquiry(
      text,
      supabaseAdmin
    );
    await sendTelegramMessage(replyHtml, replyMarkup);
    return;
  }

  // 2. Спроба розпізнати як запис витрати/доходу
  const parsed = await parseNaturalLanguageExpense(text);

  if (!parsed) {
    // Якщо це розгорнуте речення (від 8 символів), можливо це незвичне фінансове запитання
    if (text.trim().length >= 8) {
      await sendTelegramChatAction("typing");
      const { replyHtml, replyMarkup } = await handleTelegramFinancialInquiry(
        text,
        supabaseAdmin
      );
      await sendTelegramMessage(replyHtml, replyMarkup);
      return;
    }

    await sendTelegramMessage(
      "⚠️ Не вдалося розпізнати суму або назву. Спробуйте, наприклад:\n• <code>таксі 240</code>\n• <code>Сільпо 480 продукти</code>\n• <code>вчора кафе 350</code>\n\nАбо запитайте асистента: <i>«Скільки пішло на продукти?»</i> чи <i>«Чи вистачить грошей до кінця місяця?»</i>"
    );
    return;
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
}
