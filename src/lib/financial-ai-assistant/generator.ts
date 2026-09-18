import { getGeminiClient } from "@/lib/gemini";
import { SupportedGeminiModel } from "@/types/ai";
import { TelegramReplyMarkup } from "@/lib/telegram";
import { FinancialAssistantContext } from "./types";
import { buildFinancialAssistantSystemInstruction } from "./prompt";
import { formatTelegramAiHtml } from "./html-formatter";

function getAppUrl(): string {
  return (
    process.env.APP_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "https://budget-pwa.vercel.app"
  );
}

/**
 * Генерує інтелектуальну фінансову відповідь через каскад моделей Gemini
 */
export async function generateFinancialAssistantResponse(
  userQuery: string,
  context: FinancialAssistantContext
): Promise<{ replyHtml: string; replyMarkup: TelegramReplyMarkup }> {
  const systemInstruction = buildFinancialAssistantSystemInstruction(context);
  const prompt = `Запитання користувача: "${userQuery}"`;
  const ai = getGeminiClient();

  const candidateModels: SupportedGeminiModel[] = [
    "gemini-3.5-flash", // Первинна: багата мова та якісні фінансові поради
    "gemini-3.5-flash-lite", // Безвідмовна страховка (500 RPD), якщо вичерпано 20 RPD
    "gemini-3.7-flash", // Резерв
  ];

  let rawAiText = "";
  for (const model of candidateModels) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: prompt,
        config: {
          systemInstruction,
          temperature: 0.3,
          maxOutputTokens: 1024,
        },
      });
      if (response.text) {
        rawAiText = response.text;
        break;
      }
    } catch (err: any) {
      console.warn(
        `[Financial Assistant] Model ${model} failed for query "${userQuery}":`,
        err?.message || err
      );
    }
  }

  const appUrl = getAppUrl();
  const replyMarkup: TelegramReplyMarkup = {
    inline_keyboard: [
      [
        { text: "🎯 Мій темп", callback_data: "tg_refresh_pace" },
        { text: "📈 Графік", callback_data: "tg_send_chart" },
      ],
      [{ text: "📊 Відкрити BudgetGraph", url: appUrl }],
    ],
  };

  if (!rawAiText) {
    return {
      replyHtml: [
        `⚠️ <b>Не вдалося отримати відповідь аналітика</b>`,
        ``,
        `Сервіс тимчасово перевантажений. Спробуйте повторити запит за мить або скористайтеся швидкими кнопками меню.`,
      ].join("\n"),
      replyMarkup,
    };
  }

  const cleanHtml = formatTelegramAiHtml(rawAiText);
  return { replyHtml: cleanHtml, replyMarkup };
}
