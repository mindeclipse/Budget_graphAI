import { CATEGORIES } from "@/constants/categories";
import { SupportedGeminiModel } from "@/types/ai";
import { ParsedTelegramExpense } from "@/lib/bot/types";
import { normalizeCategory, cleanJsonOutput } from "@/lib/bot/formatters";
import { tryFastNaturalLanguageParse } from "./fast-heuristics";

/**
 * Парсить текстовий запит природною мовою (наприклад, "таксі 240", "вчора аптека 480 вітаміни")
 */
export async function parseNaturalLanguageExpense(
  text: string,
  referenceDate: Date = new Date()
): Promise<ParsedTelegramExpense | null> {
  // Спочатку перевіряємо миттєвий Fast-Path
  const fastParsed = tryFastNaturalLanguageParse(text, referenceDate);
  if (fastParsed) {
    return fastParsed;
  }

  const kyivNowStr = new Intl.DateTimeFormat("uk-UA", {
    timeZone: "Europe/Kyiv",
    dateStyle: "full",
    timeStyle: "medium",
  }).format(referenceDate);

  const isoNow = referenceDate.toISOString();

  const systemInstruction = `
Ти — інтелектуальний помічник для фінансового обліку в Україні.
Користувач надсилає повідомлення про витрату або дохід природною українською мовою.
Твоє завдання — розпізнати:
1. amount: додатнє число (наприклад 240, 1500, 480.50).
2. merchant: чиста назва закладу або послуги (наприклад "Таксі Uklon", "Аптека Подорожник", "Сільпо", "Кафе", "АЗС OKKO").
3. category: суворо одна з наступних категорій (якщо це дохід, зарахування чи повернення коштів, обери "Зарплата/ФОП", а не "Інше"):
${CATEGORIES.map((c) => `  - "${c}"`).join("\n")}
4. type: "expense" (витрата), "income" (дохід/зарплата/повернення коштів), або "investment" (інвестиції, ОВДП, Inzhur). За замовчуванням "expense".
5. date: рядок ISO 8601 у часовому поясі України. Якщо користувач каже "вчора", "позавчора" чи вказує дату, розрахуй відносно поточного часу: ${kyivNowStr}. Якщо дата не вказана, поверни ${isoNow}.
6. note: необов'язковий коментар або уточнення (наприклад "вітаміни", "лате з круасаном").
7. is_emergency: boolean (true, якщо це термінова витрата на здоров'я, ліки, форс-мажор, або витрата "з подушки" чи "хвороба").
8. amortization_months: число місяців (від 2 до 36) або null (якщо витрата розрахована на декілька місяців, наприклад "на 3 місяці", "курс вітамінів на 6 міс", "страховка на рік").

Повертай ВИКЛЮЧНО валідний JSON-об'єкт із цими полями без markdown чи лапок.
`;

  const prompt = `Повідомлення користувача: "${text}"`;
  const { getGeminiClient } = await import("@/lib/gemini");
  const ai = getGeminiClient();

  const candidateModels: SupportedGeminiModel[] = [
    "gemini-3.5-flash-lite",
    "gemini-3.5-flash",
    "gemini-3.7-flash",
  ];

  let rawAiText = "";
  for (const model of candidateModels) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: prompt,
        config: {
          systemInstruction,
          temperature: 0.1,
          maxOutputTokens: 512,
          responseMimeType: "application/json",
        },
      });
      if (response.text) {
        rawAiText = response.text;
        break;
      }
    } catch (err: any) {
      console.warn(
        `[Telegram Bot AI] Model ${model} failed for text:`,
        err?.message || err
      );
    }
  }

  if (!rawAiText) return null;

  try {
    const cleaned = cleanJsonOutput(rawAiText);
    const parsed = JSON.parse(cleaned);
    const amount = Number(parsed.amount);

    if (isNaN(amount) || amount <= 0) return null;

    // Евристика та AI-детекція для форс-мажорів та подушки безпеки
    const emergencyPattern =
      /(?:з\s+подушки|подушк[аи]|форс-?мажор|хвороб[аи]|термінов(?:о|а|і)|лікарня|госпітал)/i;
    const isEmergency =
      Boolean(parsed.is_emergency) || emergencyPattern.test(text);

    // Евристика та AI-детекція для розподілу витрати на кілька місяців (амортизація)
    let amortizationMonths =
      typeof parsed.amortization_months === "number"
        ? parsed.amortization_months
        : null;

    if (
      !amortizationMonths ||
      isNaN(amortizationMonths) ||
      amortizationMonths < 2
    ) {
      const matchAmort = text.match(
        /(?:на|курс(?:ом)?|термін(?:ом)?)\s+(\d+)\s*(?:міс|місяц|місяців|місяці)/i
      );
      if (matchAmort) {
        amortizationMonths = parseInt(matchAmort[1], 10);
      } else if (/(?:на\s+рік|на\s+12\s+міс)/i.test(text)) {
        amortizationMonths = 12;
      } else if (/(?:на\s+півроку|на\s+6\s+міс)/i.test(text)) {
        amortizationMonths = 6;
      }
    }
    if (
      amortizationMonths &&
      (amortizationMonths < 2 || amortizationMonths > 36)
    ) {
      amortizationMonths = null;
    }

    let category = normalizeCategory(parsed.category);
    // Якщо форс-мажор зі здоров'ям і категорія не визначилась точніше, встановлюємо Здоров'я
    if (
      isEmergency &&
      (category === "Інше" ||
        /хвороб|ліки|аптек|лікар/i.test(text) ||
        /хвороб|ліки|аптек|лікар/i.test(parsed.merchant || ""))
    ) {
      category = "Здоров'я та догляд";
    }

    const txDate = parsed.date || isoNow;
    const tags: string[] = [];
    const metadata: Record<string, any> = {};

    if (isEmergency) {
      tags.push("форсмажор");
      metadata.is_emergency = true;
    }

    if (amortizationMonths) {
      const monthlyAmount = Math.round(amount / amortizationMonths);
      metadata.amortization = {
        months: amortizationMonths,
        monthly_amount: monthlyAmount,
        start_date: txDate,
      };
    }

    const txType = ["expense", "income", "investment"].includes(parsed.type)
      ? (parsed.type as "expense" | "income" | "investment")
      : "expense";

    // Якщо це дохід і категорія не визначилась або визначилась як Інше, за замовчуванням встановлюємо Зарплата/ФОП
    if (txType === "income" && (category === "Інше" || !category)) {
      category = "Зарплата/ФОП";
    }

    return {
      amount,
      merchant: String(parsed.merchant || "Витрата").trim(),
      category,
      type: txType,
      date: txDate,
      note: parsed.note ? String(parsed.note).trim() : undefined,
      exclude_from_budget: undefined,
      is_emergency: isEmergency ? true : undefined,
      amortization_months: amortizationMonths || undefined,
      tags: tags.length > 0 ? tags : undefined,
      metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
    };
  } catch (parseErr) {
    console.error(
      "[Telegram Bot] JSON parse error from AI:",
      rawAiText,
      parseErr
    );
    return null;
  }
}
