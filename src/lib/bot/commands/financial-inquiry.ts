import { TelegramReplyMarkup } from "@/lib/telegram";
import {
  loadFinancialAssistantContext,
  generateFinancialAssistantResponse,
} from "@/lib/financial-ai-assistant";

/**
 * Обробник фінансового запиту природною мовою через AI
 */
export async function handleTelegramFinancialInquiry(
  query: string,
  supabaseAdmin: any,
  now: Date = new Date()
): Promise<{ replyHtml: string; replyMarkup: TelegramReplyMarkup }> {
  const context = await loadFinancialAssistantContext(supabaseAdmin, now);
  return generateFinancialAssistantResponse(query, context);
}
