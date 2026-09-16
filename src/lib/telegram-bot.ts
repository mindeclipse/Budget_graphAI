import { CATEGORIES, CategoryType } from "@/constants/categories";
import { escapeHtml, timingSafeEqual } from "@/lib/security";
import {
  sendTelegramMessage,
  sendTelegramPhoto,
  editTelegramMessageText,
  answerTelegramCallbackQuery,
  getTelegramFile,
  TelegramReplyMarkup,
  TelegramInlineKeyboardButton,
} from "@/lib/telegram";
import { generateBudgetDashboardImage } from "@/lib/dashboard-image";
import {
  computeSafeDailyBudget,
  DailyBudgetInfo,
} from "@/lib/classify-formatter";
import {
  processExpenseRoundup,
  ROUNDUP_GOAL_NAME,
  isRoundupTransaction,
} from "@/lib/roundup-utils";
import { checkDailyBudgetThreshold } from "@/lib/budget-alerts";
import { SupportedGeminiModel } from "@/types/ai";
import {
  calculateWeightedCalendarPacing,
  simulatePurchaseImpact,
  isWeekendOrLeisureDay,
  WeightedPacingResult,
  PurchaseSimulationResult,
  getEffectiveTransactionExpense,
  loadPastAmortizationObligations,
  UpcomingObligation,
} from "@/lib/weighted-pacing";
import { getKyivDayOfWeek } from "@/lib/behavioral-metrics";
import { getCycleDateRange, FALLBACK_BUDGET_LIMIT } from "@/lib/cycle-utils";
import { getUsdRate } from "@/lib/currency";
import { buildUpcomingSchedule } from "@/lib/subscription-radar";
import { Transaction } from "@/types/finance";

export interface ParsedTelegramExpense {
  amount: number;
  merchant: string;
  category: CategoryType;
  type: "expense" | "income" | "investment";
  date: string;
  note?: string;
  exclude_from_budget?: boolean;
  is_emergency?: boolean;
  amortization_months?: number;
  tags?: string[];
  metadata?: Record<string, any>;
}

export interface ParsedTelegramReceiptItem {
  name: string;
  price: number;
  quantity?: number;
  suggested_category: CategoryType;
}

export interface ParsedTelegramReceipt {
  amount: number;
  currency: string;
  merchant: string;
  date: string;
  type: "expense" | "income" | "investment";
  suggested_category: CategoryType;
  items?: ParsedTelegramReceiptItem[];
  hasMultipleCategories?: boolean;
}

export const CATEGORY_EMOJIS: Record<string, string> = {
  Продукти: "🛒",
  "Кафе та ресторани": "🍽",
  Куріння: "🚬",
  Транспорт: "🚕",
  Авто: "⛽️",
  "Одяг та взуття": "👕",
  "Здоров'я та догляд": "💊",
  Доставка: "📦",
  "Оренда та комуналка": "🏠",
  "Підписки та сервіси": "📱",
  "Освіта та книги": "📚",
  "Розваги та хобі": "🎉",
  Покупки: "🛍",
  Інвестиції: "📈",
  "Зарплата/ФОП": "💼",
  Інше: "🌀",

  // Сумісність
  "Здоров'я": "💊",
};

/**
 * Перевірка валідності секретного токена вебхука Telegram із захистом від Timing Attacks
 */
export function validateTelegramWebhookSecret(
  secretHeader: string | null,
  configuredSecret?: string
): boolean {
  if (configuredSecret) {
    if (!secretHeader) return false;
    return timingSafeEqual(secretHeader, configuredSecret);
  }
  return true;
}

export function getCategoryEmoji(category: string): string {
  return (CATEGORY_EMOJIS as Record<string, string>)[category] || "📦";
}

export function formatKyivDateTime(dateStr: string | Date): string {
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return String(dateStr);
    return new Intl.DateTimeFormat("uk-UA", {
      timeZone: "Europe/Kyiv",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(d);
  } catch {
    return String(dateStr);
  }
}

export function formatKyivDate(dateStr: string | Date): string {
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return String(dateStr);
    return new Intl.DateTimeFormat("uk-UA", {
      timeZone: "Europe/Kyiv",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(d);
  } catch {
    return String(dateStr);
  }
}

/**
 * Рендерить текстовий прогрес-бар для повідомлень Telegram
 */
export function renderProgressBar(percent: number, totalBlocks = 10): string {
  const safePercent = Math.max(0, Math.min(100, Math.round(percent)));
  const filledBlocks = Math.round((safePercent / 100) * totalBlocks);
  const emptyBlocks = Math.max(0, totalBlocks - filledBlocks);
  return `${"█".repeat(filledBlocks)}${"░".repeat(emptyBlocks)}`;
}

/**
 * Очищує JSON текст від блоків markdown ```json ... ```
 */
export function cleanJsonOutput(raw: string): string {
  return raw
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

/**
 * Нормалізує категорію за списком категорій
 */
export function normalizeCategory(categoryInput?: string): CategoryType {
  if (!categoryInput) return "Інше";
  const trimmed = categoryInput.trim();
  if (
    trimmed.toLowerCase() === "здоров'я" ||
    trimmed.toLowerCase() === "здоров’я"
  ) {
    return "Здоров'я та догляд";
  }
  const found = CATEGORIES.find(
    (c) => c.toLowerCase() === trimmed.toLowerCase()
  );
  return found || "Інше";
}

/**
 * Швидкий детермінований парсинг для типових фінансових повідомлень
 * (миттєва відповідь без затримок та залежності від мережевих збоїв AI)
 */
export function tryFastNaturalLanguageParse(
  text: string,
  referenceDate: Date = new Date()
): ParsedTelegramExpense | null {
  const trimmed = text.trim();
  const isoNow = referenceDate.toISOString();

  // 1. Повернення коштів: "повернення коштів від Кохана 250", "повернення 250", "повернення від Олі 300 грн"
  const refundMatch = trimmed.match(
    /^повернення(?:\s+коштів)?(?:\s+від\s+([a-zA-Zа-яА-ЯіїєґІЇЄҐ'\s]+?))?\s+(\d+(?:[.,]\d+)?)\s*(?:грн|uah)?$/i
  );
  if (refundMatch) {
    const fromPerson = refundMatch[1]?.trim();
    const amount = parseFloat(refundMatch[2].replace(",", "."));
    if (!isNaN(amount) && amount > 0) {
      return {
        amount,
        merchant: fromPerson ? fromPerson : "Повернення коштів",
        category: "Зарплата/ФОП",
        type: "income",
        date: isoNow,
        note: fromPerson
          ? `повернення коштів від ${fromPerson}`
          : "повернення коштів",
      };
    }
  }

  // 2. Зарахування / Дохід / Поповнення: "зарахування 250", "дохід 5000", "поповнення 1000"
  const incomeMatch = trimmed.match(
    /^(?:зарахування|дохід|поповнення|надходження)(?:\s+(?:на\s+картку|на\s+рахунок))?\s+(\d+(?:[.,]\d+)?)\s*(?:грн|uah)?$/i
  );
  if (incomeMatch) {
    const amount = parseFloat(incomeMatch[1].replace(",", "."));
    if (!isNaN(amount) && amount > 0) {
      return {
        amount,
        merchant: "Зарахування коштів",
        category: "Зарплата/ФОП",
        type: "income",
        date: isoNow,
        note: "зарахування",
      };
    }
  }

  // 3. Зарплата / Аванс: "зарплата 45000", "аванс 15000"
  const salaryMatch = trimmed.match(
    /^(?:зарплата|зп|аванс)(?:\s+від\s+([a-zA-Zа-яА-ЯіїєґІЇЄҐ'\s]+?))?\s+(\d+(?:[.,]\d+)?)\s*(?:грн|uah)?$/i
  );
  if (salaryMatch) {
    const fromCompany = salaryMatch[1]?.trim();
    const amount = parseFloat(salaryMatch[2].replace(",", "."));
    if (!isNaN(amount) && amount > 0) {
      return {
        amount,
        merchant: fromCompany || "Зарплата",
        category: "Зарплата/ФОП",
        type: "income",
        date: isoNow,
        note: "зарплата",
      };
    }
  }

  return null;
}

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

/**
 * Мультимодальний парсинг фото електронного чека (PNG/JPEG/WEBP) або PDF квитанції
 */
export async function parseMultimodalReceipt(
  fileBuffer: Buffer,
  mimeType: string,
  referenceDate: Date = new Date()
): Promise<ParsedTelegramReceipt | null> {
  const base64Data = fileBuffer.toString("base64");
  const isoNow = referenceDate.toISOString();

  const systemInstruction = `
Ти — високоточний аналізатор електронних фіскальних чеків (Сільпо, Monobank, Checkbox, Вчасно тощо) та платіжних PDF-квитанцій в Україні.
Проаналізуй надане зображення або документ і витягни структуру транзакції.
Поверни ВИКЛЮЧНО валідний JSON-об'єкт із наступними полями:
- amount: загальна фінальна сума до сплати (число, наприклад 1240.50).
- currency: валюта (зазвичай "UAH").
- merchant: назва магазину, продавця або отримувача коштів (наприклад "Сільпо", "АТБ-Маркет", "Uklon", "ТОВ Інжур").
- date: рядок ISO 8601 дати та часу чеку/платежу. Якщо точний час не вказано, використовуй поточну дату: ${isoNow}.
- type: "expense" | "income" | "investment" (якщо цінні папери, ОВДП, Inzhur — "investment", інакше "expense").
- suggested_category: головна категорія зі списку: ${CATEGORIES.join(", ")}.
- items: масив куплених позицій, якщо це деталізований чек супермаркету/магазину:
  [
    {
      "name": "Назва товару",
      "price": число (загальна вартість позиції),
      "quantity": число,
      "suggested_category": одна з дозволених категорій
    }
  ]
- hasMultipleCategories: boolean (true, якщо товари відносяться до різних категорій, наприклад "Продукти" та "Куріння" чи "Покупки").
`;

  const prompt = `Витягни дані з цього чеку / квитанції для фінансового обліку.`;
  const { getGeminiClient } = await import("@/lib/gemini");
  const ai = getGeminiClient();

  const candidateModels: SupportedGeminiModel[] = [
    "gemini-3.5-flash",
    "gemini-3.7-flash",
    "gemini-3.5-flash-lite",
  ];

  let rawAiText = "";
  for (const model of candidateModels) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: [
          {
            role: "user",
            parts: [
              {
                inlineData: {
                  mimeType,
                  data: base64Data,
                },
              },
              { text: prompt },
            ],
          },
        ],
        config: {
          systemInstruction,
          temperature: 0.1,
          maxOutputTokens: 1024,
        },
      });

      if (response.text) {
        rawAiText = response.text;
        break;
      }
    } catch (err: any) {
      console.warn(
        `[Telegram Bot Vision] Model ${model} failed for multimodal receipt:`,
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

    const items: ParsedTelegramReceiptItem[] = Array.isArray(parsed.items)
      ? parsed.items.map((it: any) => ({
          name: String(it.name || "Товар").trim(),
          price: Number(it.price) || 0,
          quantity: Number(it.quantity) || 1,
          suggested_category: normalizeCategory(it.suggested_category),
        }))
      : [];

    return {
      amount,
      currency: parsed.currency || "UAH",
      merchant: String(parsed.merchant || "Чек").trim(),
      date: parsed.date || isoNow,
      type: ["expense", "income", "investment"].includes(parsed.type)
        ? parsed.type
        : "expense",
      suggested_category: normalizeCategory(parsed.suggested_category),
      items: items.length > 0 ? items : undefined,
      hasMultipleCategories: Boolean(parsed.hasMultipleCategories),
    };
  } catch (parseErr) {
    console.error(
      "[Telegram Bot Vision] JSON parse error:",
      rawAiText,
      parseErr
    );
    return null;
  }
}

/**
 * Застосовує правила користувача з таблиці merchant_rules
 */
export async function applyMerchantRules(
  merchantRaw: string,
  supabaseAdmin: any
): Promise<{ merchant: string; category?: CategoryType }> {
  try {
    const { data: rules } = await supabaseAdmin
      .from("merchant_rules")
      .select("pattern, clean_merchant, category_name");

    if (rules && rules.length > 0) {
      const lowerRaw = merchantRaw.toLowerCase();
      // Сортуємо від довших до коротших патернів
      const sortedRules = [...rules].sort(
        (a: any, b: any) => (b.pattern?.length || 0) - (a.pattern?.length || 0)
      );

      const matched = sortedRules.find((r: any) => {
        const p = (r.pattern || "").trim().toLowerCase();
        return p && lowerRaw.includes(p);
      });

      if (matched) {
        return {
          merchant: matched.clean_merchant || merchantRaw,
          category: normalizeCategory(matched.category_name),
        };
      }
    }
  } catch (err) {
    console.error("[Telegram Bot] Merchant rules query error:", err);
  }

  return { merchant: merchantRaw };
}

/**
 * Записує транзакцію в Supabase та обробляє автоокруглення й сповіщення
 */
export async function recordTelegramTransaction(
  supabaseAdmin: any,
  params: {
    amount: number;
    currency?: string;
    merchant: string;
    category: CategoryType;
    type: "expense" | "income" | "investment";
    date?: string;
    exclude_from_budget?: boolean;
    tags?: string[];
    metadata?: Record<string, any>;
  }
): Promise<{
  transaction: any;
  dailyBudget: DailyBudgetInfo | null;
  roundupResult: any;
}> {
  const currency = params.currency || "UAH";
  const createdAt = params.date || new Date().toISOString();
  const excludeFromBudget = Boolean(params.exclude_from_budget);

  // 1. Вставка в transactions
  const { data: transaction, error } = await supabaseAdmin
    .from("transactions")
    .insert({
      amount: params.amount,
      currency,
      merchant_raw: params.merchant,
      category_name: params.category,
      source: "telegram_bot",
      type: params.type,
      created_at: createdAt,
      exclude_from_budget: excludeFromBudget,
      tags: params.tags || [],
      metadata: params.metadata || {},
    })
    .select()
    .single();

  if (error || !transaction) {
    console.error("[Telegram Bot] Supabase insert transaction error:", error);
    throw new Error("Не вдалося зберегти транзакцію в базі даних");
  }

  // 2. Автоокруглення витрати на Фінансову подушку (тільки для звичайних витрат з бюджету)
  let roundupResult = null;
  if (params.type === "expense" && currency === "UAH" && !excludeFromBudget) {
    try {
      roundupResult = await processExpenseRoundup(supabaseAdmin, {
        parentTxId: transaction.id,
        amount: params.amount,
        currency,
        source: "telegram_bot",
      });
    } catch (roundupErr) {
      console.error("[Telegram Bot] Auto-roundup error:", roundupErr);
    }
  }

  // 3. Розрахунок щоденного бюджету
  let dailyBudget: DailyBudgetInfo | null = null;
  try {
    dailyBudget = await computeSafeDailyBudget(supabaseAdmin);
  } catch (budgetErr) {
    console.error("[Telegram Bot] Safe daily budget error:", budgetErr);
  }

  // 4. Перевірка перевищення денного ліміту (тільки якщо витрата враховується в бюджеті)
  if (params.type === "expense" && !excludeFromBudget) {
    checkDailyBudgetThreshold(undefined, undefined, dailyBudget).catch(
      (err) => {
        console.error("[Telegram Bot] Daily budget threshold error:", err);
      }
    );
  }

  return {
    transaction,
    dailyBudget,
    roundupResult,
  };
}

/**
 * Генерує inline клавіатуру для вибору категорії
 */
export function buildCategoryKeyboard(
  txId: number,
  currentCategory?: string
): TelegramReplyMarkup {
  const keyboard: TelegramInlineKeyboardButton[][] = [];
  const chunkSize = 2;

  for (let i = 0; i < CATEGORIES.length; i += chunkSize) {
    const row = CATEGORIES.slice(i, i + chunkSize).map((cat) => {
      const idx = CATEGORIES.indexOf(cat);
      const isCurrent = cat === currentCategory;
      return {
        text: `${isCurrent ? "✓ " : ""}${getCategoryEmoji(cat)} ${cat}`,
        callback_data: `tg_setcat:${txId}:${idx}`,
      };
    });
    keyboard.push(row);
  }

  keyboard.push([
    {
      text: "⬅️ Назад",
      callback_data: `tg_back:${txId}`,
    },
  ]);

  return { inline_keyboard: keyboard };
}

/**
 * Форматує підтвердження створеної транзакції
 */
export function formatTransactionConfirmation(params: {
  transaction: any;
  dailyBudget?: DailyBudgetInfo | null;
  roundupResult?: any;
  itemsCount?: number;
}): { text: string; replyMarkup: TelegramReplyMarkup } {
  const { transaction, dailyBudget, roundupResult, itemsCount } = params;

  const emoji = getCategoryEmoji(transaction.category_name);
  const amountFormatted = `${Number(transaction.amount).toLocaleString(
    "uk-UA",
    {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }
  )} ₴`;

  const isIncome = transaction.type === "income";
  const isInvestment = transaction.type === "investment";
  const isExpense = !isIncome && !isInvestment;

  const isEmergency =
    Boolean(transaction.metadata?.is_emergency) ||
    (Array.isArray(transaction.tags) && transaction.tags.includes("форсмажор"));

  const amort = transaction.metadata?.amortization;

  let title = `✅ <b>Витрату записано!</b>`;
  let sign = "";
  if (isIncome) {
    title = `💵 <b>Дохід зараховано!</b>`;
    sign = "+";
  } else if (isInvestment) {
    title = `📈 <b>Інвестицію зафіксовано!</b>`;
  }

  const lines = [
    title,
    ``,
    `💳 <b>${escapeHtml(transaction.merchant_raw)}</b>: <b>${sign}${amountFormatted}</b>`,
    `🏷 Категорія: ${emoji} <b>${escapeHtml(transaction.category_name)}</b>`,
    `📅 ${formatKyivDateTime(transaction.created_at)}`,
  ];

  if (isEmergency) {
    lines.push(
      ``,
      `🛡️ <b>Форс-мажор (екстрена витрата)</b>`,
      `💡 <i>Враховано в бюджеті. ШІ та аналітика зафіксують це як вимушену потребу, а не споживче марнотратство.</i>`
    );
  } else if (amort && typeof amort === "object" && Number(amort.months) > 1) {
    const totalMonths = Number(amort.months);
    const monthlyAmt =
      Number(amort.monthly_amount) ||
      Math.round(Number(transaction.amount || 0) / totalMonths);
    lines.push(
      ``,
      `🗓 <b>Амортизація на ${totalMonths} міс</b> (по <b>~${monthlyAmt.toLocaleString("uk-UA")} ₴/міс</b>)`,
      `💡 <i>З балансу списано всю суму. ШІ та аналітика зафіксують це як планову інвестицію на ${totalMonths} міс, а не разове марнотратство.</i>`
    );
  }

  if (isExpense && !isEmergency) {
    if (roundupResult?.roundupAmount) {
      lines.push(
        `🐷 Подушка: +<b>${Number(roundupResult.roundupAmount).toFixed(2)} ₴</b>`
      );
    }

    if (dailyBudget) {
      if (dailyBudget.todayRemaining > 0) {
        lines.push(
          `🎯 На день залишилось: <b>${dailyBudget.todayRemaining.toLocaleString("uk-UA").replace(/\u00A0/g, " ")} ₴</b>`
        );
      } else if (dailyBudget.todayRemaining === 0) {
        lines.push(`⚠️ <b>Денний бюджет на сьогодні вичерпано!</b>`);
      } else {
        const over = Math.abs(dailyBudget.todayRemaining)
          .toLocaleString("uk-UA")
          .replace(/\u00A0/g, " ");
        lines.push(`⚠️ <b>Переліміт за сьогодні: -${over} ₴</b>`);
      }
    }
  }

  const buttons: TelegramInlineKeyboardButton[][] = [
    [
      {
        text: "🏷 Змінити категорію",
        callback_data: `tg_cat:${transaction.id}`,
      },
      {
        text: "❌ Скасувати",
        callback_data: `tg_cancel:${transaction.id}`,
      },
    ],
  ];

  if (itemsCount && itemsCount > 1) {
    buttons.push([
      {
        text: `✂️ Split (${itemsCount})`,
        callback_data: `tg_split:${transaction.id}`,
      },
    ]);
  }

  return {
    text: lines.join("\n"),
    replyMarkup: { inline_keyboard: buttons },
  };
}

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

/**
 * Перевіряє, чи є текст запитом про стан/темп бюджету
 */
export function isPaceInquiry(text: string): boolean {
  const t = text.trim().toLowerCase();
  if (/^\/(pace|today|budget)$/i.test(t)) return true;
  if (
    /^(🎯\s*)?(темп|мій темп|який темп|який мій темп|який темп бюджету)\s*(\?+)?$/i.test(
      t
    )
  ) {
    return true;
  }
  if (/^скільки (можу|можна) витратити( сьогодні)?\s*(\?+)?$/i.test(t)) {
    return true;
  }
  if (
    /^скільки на день\s*(\?+)?$|^безпечно на день\s*(\?+)?$|^ліміт на день\s*(\?+)?$/i.test(
      t
    )
  ) {
    return true;
  }
  if (
    /^(чи є гроші|який залишок|скільки залишилось( грошей)?)\s*(\?+)?$/i.test(t)
  ) {
    return true;
  }
  if (/^(ліміт на вихідні|скільки на вихідні)\s*(\?+)?$/i.test(t)) return true;
  return false;
}

/**
 * Перевіряє, чи є текст запитом про підсумок/залишок циклу
 */
export function isCycleSummaryInquiry(text: string): boolean {
  const t = text.trim().toLowerCase();
  if (/^\/(cycle|period|summary)$/i.test(t)) return true;
  if (
    /^(📊\s*)?(залишок циклу|підсумок циклу|баланс циклу|стан циклу|мій цикл)\s*(\?+)?$/i.test(
      t
    )
  ) {
    return true;
  }
  if (
    /^(скільки (залишилось|лишилось) до кінця циклу|скільки (залишилось|лишилось) до кінця місяця)\s*(\?+)?$/i.test(
      t
    )
  ) {
    return true;
  }
  return false;
}

/**
 * Перевіряє, чи є текст запитом про графічну картку / дашборд / діаграму
 */
export function isChartInquiry(text: string): boolean {
  const t = text.trim().toLowerCase();
  if (/^\/(chart|graph|dashboard|stats|image)$/i.test(t)) return true;
  if (
    /^(📈\s*|📊\s*)?(графік|графіки|дашборд|діаграма|інфографіка|покажи графік|покажи дашборд|візуалізація|прогрес-бар)\s*(\?+)?$/i.test(
      t
    )
  ) {
    return true;
  }
  return false;
}

/**
 * Перевіряє, чи є текст запитом про стан фінансової подушки безпеки
 */
export function isEmergencyFundInquiry(text: string): boolean {
  const t = text.trim().toLowerCase();
  if (/^\/(cushion|fund|pillow|roundup|savings)$/i.test(t)) return true;
  if (
    /^(🛡️?\s*|🏦\s*)?(подушка|фінансова подушка|скарбничка|накопичення|заощадження|решта|округлення)\s*(\?+)?$/i.test(
      t
    )
  ) {
    return true;
  }
  if (
    /^(скільки в подушці|скільки на подушці|стан подушки)\s*(\?+)?$/i.test(t)
  ) {
    return true;
  }
  return false;
}

/**
 * Перевіряє, чи є текст запитом про інструкцію/довідку щодо симулятора покупок What-If
 */
export function isWhatIfGuideInquiry(text: string): boolean {
  const t = text.trim().toLowerCase();
  if (/^\/(whatif|simulator|calc)$/i.test(t)) return true;
  if (
    /^(💡\s*)?що якщо(\.{1,3})?(\?+)?$/i.test(t) ||
    /^(💡\s*)?(симулятор|симулятор покупок|як працює що якщо)\s*(\?+)?$/i.test(
      t
    )
  ) {
    return true;
  }
  return false;
}

/**
 * Парсить запит «What-If»: чи можу я дозволити покупку на певну суму
 */
export function parseWhatIfPurchaseQuery(
  text: string
): { amount: number; item?: string } | null {
  const t = text.trim().toLowerCase();

  const hasWhatIfMarker =
    /^(чи\s+)?(можу|хочу|планую|чи\s+норм|чи\s+варто|чи\s+можна)\s+(купити|дозволити|взяти|витратити|замовити)/i.test(
      t
    ) ||
    /^(чи\s+можу\s+я|чи\s+можу\s+собі\s+дозволити)/i.test(t) ||
    /^(можу\s+дозволити|можу\s+собі\s+дозволити)/i.test(t) ||
    /(чи\s+норм\??|чи\s+ок\??|чи\s+вистачить\??)$/i.test(t);

  if (!hasWhatIfMarker) return null;

  // 1. Патерн: "хочу купити [річ] за [сума]" / "чи можу купити [річ] за [сума] грн"
  const match1 = t.match(
    /(?:купити|дозволити|взяти|замовити)\s+(.+?)\s+(?:за|на)\s+(\d+(?:[.,]\d+)?)\s*(?:грн|₴)?/i
  );
  if (match1) {
    const item = match1[1].replace(/^(собі|ще|зараз)\s+/i, "").trim();
    const amount = parseFloat(match1[2].replace(",", "."));
    if (!isNaN(amount) && amount > 0) {
      return { amount, item };
    }
  }

  // 2. Патерн: "чи можу витратити [сума] на [річ]"
  const match2 = t.match(
    /(?:витратити)\s+(\d+(?:[.,]\d+)?)\s*(?:грн|₴)?(?:\s+(?:на|для)\s+(.+))?/i
  );
  if (match2) {
    const amount = parseFloat(match2[1].replace(",", "."));
    const item = match2[2]?.trim();
    if (!isNaN(amount) && amount > 0) {
      return { amount, item: item || "покупка" };
    }
  }

  // 3. Патерн: "хочу купити [річ] [сума]"
  const match3 = t.match(
    /(?:купити|дозволити|взяти|замовити)\s+(.+?)\s+(\d+(?:[.,]\d+)?)\s*(?:грн|₴)?(?:\s*,\s*чи\s+норм|\s*\?)?$/i
  );
  if (match3) {
    const item = match3[1].trim();
    const amount = parseFloat(match3[2].replace(",", "."));
    if (!isNaN(amount) && amount > 0) {
      return { amount, item };
    }
  }

  // 4. Патерн: "планую покупку [сума]"
  const match4 = t.match(
    /(?:покупк[ау]|витрат[ау])\s+(?:на\s+)?(\d+(?:[.,]\d+)?)\s*(?:грн|₴)?/i
  );
  if (match4) {
    const amount = parseFloat(match4[1].replace(",", "."));
    if (!isNaN(amount) && amount > 0) {
      return { amount, item: "планова покупка" };
    }
  }

  return null;
}

/**
 * Форматує відповідь на запит про зважений календарний темп
 */
export function formatPaceResponse(
  pacing: WeightedPacingResult,
  now: Date = new Date()
): string {
  const dayOfWeek = getKyivDayOfWeek(now);
  const isWeekend = isWeekendOrLeisureDay(dayOfWeek);
  const dayNames = [
    "Неділя",
    "Понеділок",
    "Вівторок",
    "Середа",
    "Четвер",
    "П'ятниця",
    "Субота",
  ];
  const dayName = dayNames[dayOfWeek] || "Сьогодні";

  const todayAllowance = isWeekend
    ? pacing.pacing.safeWeekendSpend
    : pacing.pacing.safeWeekdaySpend;

  const lines = [
    `🗓 <b>Сьогодні ${dayName} (${isWeekend ? "вихідний/дозвілля" : "робочий день"})</b>`,
    ``,
    `💰 <b>Безпечно на день:</b> <code>${todayAllowance.toLocaleString("uk-UA")} ₴</code>`,
    `💼 <b>Будні (Пн–Чт):</b> ${pacing.pacing.safeWeekdaySpend.toLocaleString("uk-UA")} ₴/день`,
    `🍻 <b>Вікенд-буфер (Пт–Нд):</b> ~${pacing.pacing.safeWeekendSpend.toLocaleString("uk-UA")} ₴/день`,
    ``,
    `🔒 <b>Зарезервовано під підписки:</b> ${pacing.budget.reservedObligationsTotal.toLocaleString("uk-UA")} ₴`,
    `📊 <b>Вільний залишок:</b> ${pacing.budget.discretionaryRemaining.toLocaleString("uk-UA")} ₴ (залишилось ${pacing.cycle.daysRemaining} дн.)`,
  ];

  if (pacing.surplusProjection.projectedSurplusAmount > 0) {
    lines.push(
      ``,
      `🎯 <b>Очікуваний профіцит на кінець циклу:</b> +${pacing.surplusProjection.projectedSurplusAmount.toLocaleString("uk-UA")} ₴ (${pacing.surplusProjection.savingsPotentialPercent}% бюджету)`
    );
  }

  lines.push(``, `💡 <i>${escapeHtml(pacing.pacing.advice)}</i>`);

  return lines.join("\n");
}

/**
 * Форматує результат симуляції покупки What-If
 */
export function formatWhatIfResponse(sim: PurchaseSimulationResult): string {
  const lines = [
    `${sim.verdictTitle}`,
    ``,
    sim.adviceHtml,
    ``,
    `📉 <b>Вплив на щоденний ліміт:</b>`,
    `• Будні: ${sim.currentSafeWeekday} ₴ ➔ <b>${sim.newSafeWeekday} ₴/день</b> (-${sim.weekdayDropPercent}%)`,
    `• Вихідні: ${sim.currentSafeWeekend} ₴ ➔ <b>${sim.newSafeWeekend} ₴/день</b> (-${sim.weekendDropPercent}%)`,
    `• Вільний залишок після покупки: <b>${sim.newDiscretionary.toLocaleString("uk-UA")} ₴</b>`,
  ];

  return lines.join("\n");
}

/**
 * Допоміжна функція завантаження та розрахунку темпу поточного бюджетного циклу
 */
export async function loadCyclePacing(
  supabaseAdmin: any,
  now: Date = new Date()
): Promise<{
  pacing: WeightedPacingResult;
  startDate: Date;
  endDate: Date;
  totalBudgetLimit: number;
}> {
  const currentMonthStart = new Date(
    now.getFullYear(),
    now.getMonth(),
    1
  ).toISOString();
  const currentMonthEnd = new Date(
    now.getFullYear(),
    now.getMonth() + 1,
    0,
    23,
    59,
    59,
    999
  ).toISOString();

  // Отримуємо активний або останній цикл
  const { data: activeCycle } = await supabaseAdmin
    .from("budget_cycles")
    .select("id, name, budget_limit, start_date, end_date, is_active")
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const cycleConfig =
    activeCycle ||
    (
      await supabaseAdmin
        .from("budget_cycles")
        .select("id, name, budget_limit, start_date, end_date, is_active")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle()
    ).data;

  const { startDate, endDate } = getCycleDateRange(cycleConfig, now);
  const totalBudgetLimit = Number(
    cycleConfig?.budget_limit || FALLBACK_BUDGET_LIMIT
  );

  const habitBaselineIso = "2026-08-15T00:00:00.000Z";
  const fetchStart =
    startDate.toISOString() < habitBaselineIso
      ? startDate.toISOString()
      : habitBaselineIso;

  const { data: txs } = await supabaseAdmin
    .from("transactions")
    .select(
      "id, amount, currency, merchant_raw, category_name, source, type, created_at, exclude_from_budget, metadata, deleted_at"
    )
    .is("deleted_at", null)
    .gte("created_at", fetchStart)
    .lte("created_at", endDate.toISOString());

  const allValidTransactions = (txs || []) as Transaction[];

  const cycleTransactions = allValidTransactions.filter((t) => {
    const d = new Date(t.created_at);
    return d >= startDate && d <= endDate;
  });

  const { data: recurring } = await supabaseAdmin
    .from("recurring_templates")
    .select(
      "id, title, amount, currency, day_of_month, is_active, category_name"
    )
    .eq("is_active", true);

  const usdRate = await getUsdRate();

  const schedule = buildUpcomingSchedule(
    recurring || [],
    cycleTransactions,
    usdRate,
    now
  );

  const upcomingObligations: UpcomingObligation[] = schedule.upcoming.map(
    (u) => ({
      title: u.title,
      amount:
        u.currency === "USD"
          ? Math.round(u.amount * usdRate)
          : Number(u.amount),
      day_of_month: u.day_of_month,
      is_paid: u.status === "paid",
    })
  );

  // Завантажуємо активні амортизовані витрати з попередніх місяців
  const pastObligations = await loadPastAmortizationObligations(
    supabaseAdmin,
    startDate,
    now
  );
  if (pastObligations.length > 0) {
    upcomingObligations.push(...pastObligations);
  }

  const currentExpenseTotal = cycleTransactions
    .filter((t) => !t.exclude_from_budget && t.type === "expense")
    .reduce((sum, t) => sum + getEffectiveTransactionExpense(t), 0);

  const pacing = calculateWeightedCalendarPacing(allValidTransactions, {
    now,
    startDate,
    endDate,
    totalBudgetLimit,
    currentExpenseTotal,
    upcomingObligations,
  });

  return { pacing, startDate, endDate, totalBudgetLimit };
}

/**
 * Обробник команди або запиту про темп бюджету
 */
export async function handleTelegramPaceCommand(
  supabaseAdmin: any,
  now: Date = new Date()
): Promise<string> {
  const { pacing } = await loadCyclePacing(supabaseAdmin, now);
  return formatPaceResponse(pacing, now);
}

/**
 * Обробник запиту про розгорнутий залишок та підсумок циклу
 */
export async function handleTelegramCycleSummaryCommand(
  supabaseAdmin: any,
  now: Date = new Date()
): Promise<string> {
  const { pacing, startDate, endDate, totalBudgetLimit } =
    await loadCyclePacing(supabaseAdmin, now);

  const spentPercent = Math.min(
    999,
    Math.round(
      (pacing.budget.currentExpenseTotal / (totalBudgetLimit || 1)) * 100
    )
  );

  const statusEmojis: Record<string, string> = {
    healthy: "🟢",
    tight: "🟡",
    critical: "🟠",
    depleted: "🔴",
  };
  const statusEmoji = statusEmojis[pacing.pacing.status] || "ℹ️";

  const actualDailyAverage =
    pacing.cycle.daysPassed > 0
      ? Math.round(pacing.budget.currentExpenseTotal / pacing.cycle.daysPassed)
      : 0;

  const lines = [
    `📊 <b>Підсумок бюджетного циклу</b>`,
    ``,
    `🗓 <b>Період:</b> ${formatKyivDate(startDate)} — ${formatKyivDate(endDate)}`,
    `⏳ <b>Прогрес часу:</b> ${pacing.cycle.daysPassed} з ${pacing.cycle.daysTotal} дн. (залишилось ${pacing.cycle.daysRemaining} дн.)`,
    ``,
    `💰 <b>Загальний ліміт:</b> <code>${totalBudgetLimit.toLocaleString("uk-UA")} ₴</code>`,
    `💸 <b>Витрачено:</b> <code>${pacing.budget.currentExpenseTotal.toLocaleString("uk-UA")} ₴</code> (${spentPercent}%)`,
    `<code>[${renderProgressBar(spentPercent)}]</code>`,
    ``,
    `💵 <b>Вільний залишок:</b> <b>${pacing.budget.discretionaryRemaining.toLocaleString("uk-UA")} ₴</b>`,
    `🔒 <b>Зарезервовано під підписки:</b> ${pacing.budget.reservedObligationsTotal.toLocaleString("uk-UA")} ₴`,
    ``,
    `📈 <b>Середні витрати:</b>`,
    `• Фактично: ~${actualDailyAverage.toLocaleString("uk-UA")} ₴/день`,
    `• Базовий орієнтир: ~${pacing.pacing.flatDailySpend.toLocaleString("uk-UA")} ₴/день`,
    `• Рекомендовано будні: ~${pacing.pacing.safeWeekdaySpend.toLocaleString("uk-UA")} ₴/день`,
    `• Рекомендовано вихідні: ~${pacing.pacing.safeWeekendSpend.toLocaleString("uk-UA")} ₴/день`,
  ];

  if (pacing.surplusProjection.projectedSurplusAmount > 0) {
    lines.push(
      ``,
      `🎯 <b>Очікуваний профіцит:</b> +${pacing.surplusProjection.projectedSurplusAmount.toLocaleString("uk-UA")} ₴ (${pacing.surplusProjection.savingsPotentialPercent}%)`
    );
  }

  lines.push(
    ``,
    `${statusEmoji} <b>Статус:</b> ${pacing.pacing.statusLabel}`,
    `💡 <i>${escapeHtml(pacing.pacing.advice)}</i>`
  );

  return lines.join("\n");
}

/**
 * Обробник запиту на генерацію графічної картки / дашборду бюджету
 */
export async function handleTelegramChartCommand(
  supabaseAdmin: any,
  now: Date = new Date()
): Promise<{
  photoBuffer: Buffer;
  caption: string;
  replyMarkup: TelegramReplyMarkup;
}> {
  const { pacing } = await loadCyclePacing(supabaseAdmin, now);

  const { data: goals } = await supabaseAdmin
    .from("savings_goals")
    .select("id, name, current_amount")
    .order("id", { ascending: true });

  const cushionGoal = (goals || []).find(
    (g: any) =>
      g.name?.toLowerCase().includes("подушка") ||
      g.name?.toLowerCase() === ROUNDUP_GOAL_NAME.toLowerCase()
  );
  const cushionCurrent = Number(cushionGoal?.current_amount || 0);

  const currentMonthStart = new Date(
    now.getFullYear(),
    now.getMonth(),
    1
  ).toISOString();

  const { data: rawRoundupTxs } = await supabaseAdmin
    .from("transactions")
    .select("amount, created_at, merchant_raw, category_name, source")
    .gte("created_at", currentMonthStart)
    .or(
      "category_name.ilike.%подушка%,merchant_raw.ilike.%округлення%,source.eq.roundup"
    )
    .is("deleted_at", null);

  const monthRoundupTxs = (rawRoundupTxs || []).filter((t: any) => {
    const m = (t.merchant_raw || "").toLowerCase();
    return (
      m.includes("округлення") || m.includes("решта") || t.source === "roundup"
    );
  });

  const monthRoundupAmount =
    Math.round(
      monthRoundupTxs.reduce(
        (sum: number, t: any) => sum + Number(t.amount || 0),
        0
      ) * 100
    ) / 100;

  const photoBuffer = await generateBudgetDashboardImage(pacing, {
    cushionCurrent,
    monthRoundupAmount,
  });

  const statusEmojis: Record<string, string> = {
    healthy: "🟢",
    tight: "🟡",
    critical: "🟠",
    depleted: "🔴",
  };
  const statusEmoji = statusEmojis[pacing.pacing.status] || "ℹ️";

  const dayOfWeek = getKyivDayOfWeek(now);
  const isWeekend = isWeekendOrLeisureDay(dayOfWeek);
  const safeToday = isWeekend
    ? pacing.pacing.safeWeekendSpend
    : pacing.pacing.safeWeekdaySpend;

  const caption = [
    `📈 <b>Графічний дашборд бюджетного циклу</b>`,
    ``,
    `Статус: ${statusEmoji} <b>${pacing.pacing.statusLabel}</b>`,
    `Вільний залишок: <b>${pacing.budget.discretionaryRemaining.toLocaleString("uk-UA")} ₴</b>`,
    `Ліміт на сьогодні (${isWeekend ? "вихідні" : "будні"}): <b>~${safeToday.toLocaleString("uk-UA")} ₴</b>`,
  ].join("\n");

  const appUrl =
    process.env.APP_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "https://budget-pwa.vercel.app";

  const replyMarkup: TelegramReplyMarkup = {
    inline_keyboard: [
      [
        { text: "🔄 Оновити графік", callback_data: "tg_send_chart" },
        { text: "🎯 Мій темп", callback_data: "tg_refresh_pace" },
      ],
      [{ text: "📊 Відкрити BudgetGraph", url: appUrl }],
    ],
  };

  return { photoBuffer, caption, replyMarkup };
}

/**
 * Обробник запиту про стан подушки безпеки та скарбнички автоокруглення
 */
export async function handleTelegramEmergencyFundCommand(
  supabaseAdmin: any,
  now: Date = new Date()
): Promise<string> {
  const { data: goals } = await supabaseAdmin
    .from("savings_goals")
    .select("id, name, target_amount, current_amount, currency")
    .order("id", { ascending: true });

  const cushionGoal = (goals || []).find(
    (g: any) =>
      g.name?.toLowerCase().includes("подушка") ||
      g.name?.toLowerCase() === ROUNDUP_GOAL_NAME.toLowerCase()
  );

  const otherGoals = (goals || []).filter((g: any) => g.id !== cushionGoal?.id);

  const { data: rawRoundupTxs } = await supabaseAdmin
    .from("transactions")
    .select("amount, created_at, merchant_raw, category_name, source")
    .or(
      "category_name.ilike.%подушка%,merchant_raw.ilike.%округлення%,source.eq.roundup"
    )
    .is("deleted_at", null);

  const roundupTxs: any[] = [];
  const directTransfers: any[] = [];

  for (const t of rawRoundupTxs || []) {
    const m = (t.merchant_raw || "").toLowerCase();
    if (
      m.includes("округлення") ||
      m.includes("решта") ||
      t.source === "roundup"
    ) {
      roundupTxs.push(t);
    } else {
      directTransfers.push(t);
    }
  }

  const totalRoundupAmount =
    Math.round(
      roundupTxs.reduce(
        (sum: number, t: any) => sum + Number(t.amount || 0),
        0
      ) * 100
    ) / 100;
  const totalRoundupsCount = roundupTxs.length;

  const directTransferTotal =
    Math.round(
      directTransfers.reduce(
        (sum: number, t: any) => sum + Number(t.amount || 0),
        0
      ) * 100
    ) / 100;
  const directTransfersCount = directTransfers.length;

  const currentMonthStart = new Date(
    now.getFullYear(),
    now.getMonth(),
    1
  ).toISOString();

  const monthRoundupTxs = roundupTxs.filter(
    (t: any) => t.created_at && t.created_at >= currentMonthStart
  );
  const monthRoundupAmount =
    Math.round(
      monthRoundupTxs.reduce(
        (sum: number, t: any) => sum + Number(t.amount || 0),
        0
      ) * 100
    ) / 100;
  const monthRoundupCount = monthRoundupTxs.length;

  const cushionCurrent = Number(cushionGoal?.current_amount || 0);
  const cushionTarget = cushionGoal?.target_amount
    ? Number(cushionGoal.target_amount)
    : null;

  const lines = [
    `🛡️ <b>Фінансова подушка безпеки</b>`,
    ``,
    `🪙 <b>Скарбничка автоокруглення («${escapeHtml(cushionGoal?.name || ROUNDUP_GOAL_NAME)}»):</b>`,
    `• Доступний баланс: <b>${cushionCurrent.toLocaleString("uk-UA")} ₴</b>`,
  ];

  if (cushionTarget && cushionTarget > 0) {
    const progressPercent = Math.min(
      100,
      Math.round((cushionCurrent / cushionTarget) * 100)
    );
    lines.push(
      `• Ціль: <b>${cushionTarget.toLocaleString("uk-UA")} ₴</b> (${progressPercent}%)`,
      `<code>[${renderProgressBar(progressPercent)}]</code>`
    );
  }

  lines.push(
    `• Заощаджено рештою за цей місяць: <b>+${monthRoundupAmount.toLocaleString("uk-UA")} ₴</b> (${monthRoundupCount} оп.)`,
    `• Всього накопичено чистою рештою: <b>+${totalRoundupAmount.toLocaleString("uk-UA")} ₴</b> (${totalRoundupsCount} оп.)`
  );

  if (directTransfersCount > 0) {
    lines.push(
      `• Прямі поповнення подушки: <b>+${directTransferTotal.toLocaleString("uk-UA")} ₴</b> (${directTransfersCount} оп.)`
    );
  }

  if (otherGoals.length > 0) {
    lines.push(``, `💵 <b>Інші активи та резерви:</b>`);
    for (const g of otherGoals) {
      const currSymbol =
        g.currency === "USD"
          ? "$"
          : g.currency === "EUR"
            ? "€"
            : g.currency === "UAH"
              ? "₴"
              : g.currency;
      const amount = Number(g.current_amount || 0).toLocaleString("uk-UA");
      lines.push(`• ${escapeHtml(g.name)}: <b>${amount} ${currSymbol}</b>`);
    }
  }

  lines.push(
    ``,
    `💡 <i>Кожна безготівкова витрата округлюється до 10 ₴, непомітно формуючи вашу фінансову безпеку.</i>`
  );

  return lines.join("\n");
}

/**
 * Обробник довідки щодо симулятора What-If
 */
export function handleTelegramWhatIfGuideCommand(): string {
  return [
    `💡 <b>Симулятор покупок (What-If аналіз)</b>`,
    ``,
    `Симулятор дозволяє перед покупкою дізнатися, чи не порушить вона баланс бюджету та як змінить ваш щоденний темп витрат.`,
    ``,
    `🤖 <b>Як зробити запит? Напишіть у чат будь-яку з фраз:</b>`,
    `• <code>чи можу купити кросівки за 3200?</code>`,
    `• <code>хочу купити навушники 2500 грн</code>`,
    `• <code>чи норм витратити 800 на ресторан?</code>`,
    `• <code>планую покупку 4500</code>`,
    ``,
    `📊 <b>Що порахує бот:</b>`,
    `1. ✅ <b>Вердикт:</b> <i>Безпечно</i>, <i>Обережно</i> або <i>Не рекомендовано</i>.`,
    `2. 📉 <b>Зміну лімітів:</b> перерахує новий ліміт на будні (Пн-Чт) та вихідні (Пт-Нд).`,
    `3. 🔒 <b>Захист зобов'язань:</b> врахує всі майбутні підписки та обов'язкові платежі до кінця циклу.`,
  ].join("\n");
}

/**
 * Обробник симуляції What-If для Telegram
 */
export async function handleTelegramWhatIfCommand(
  amount: number,
  itemDescription: string | undefined,
  supabaseAdmin: any,
  now: Date = new Date()
): Promise<string> {
  const currentMonthStart = new Date(
    now.getFullYear(),
    now.getMonth(),
    1
  ).toISOString();
  const currentMonthEnd = new Date(
    now.getFullYear(),
    now.getMonth() + 1,
    0,
    23,
    59,
    59,
    999
  ).toISOString();

  // Отримуємо активний або останній цикл
  const { data: activeCycle } = await supabaseAdmin
    .from("budget_cycles")
    .select("id, name, budget_limit, start_date, end_date, is_active")
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const cycleConfig =
    activeCycle ||
    (
      await supabaseAdmin
        .from("budget_cycles")
        .select("id, name, budget_limit, start_date, end_date, is_active")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle()
    ).data;

  const { startDate, endDate } = getCycleDateRange(cycleConfig, now);
  const totalBudgetLimit = Number(
    cycleConfig?.budget_limit || FALLBACK_BUDGET_LIMIT
  );

  const habitBaselineIso = "2026-08-15T00:00:00.000Z";
  const fetchStart =
    startDate.toISOString() < habitBaselineIso
      ? startDate.toISOString()
      : habitBaselineIso;

  const { data: txs } = await supabaseAdmin
    .from("transactions")
    .select(
      "id, amount, currency, merchant_raw, category_name, source, type, created_at, exclude_from_budget, metadata, deleted_at"
    )
    .is("deleted_at", null)
    .gte("created_at", fetchStart)
    .lte("created_at", endDate.toISOString());

  const allValidTransactions = (txs || []) as Transaction[];

  const cycleTransactions = allValidTransactions.filter((t) => {
    const d = new Date(t.created_at);
    return d >= startDate && d <= endDate;
  });

  const { data: recurring } = await supabaseAdmin
    .from("recurring_templates")
    .select(
      "id, title, amount, currency, day_of_month, is_active, category_name"
    )
    .eq("is_active", true);

  const usdRate = await getUsdRate();

  const schedule = buildUpcomingSchedule(
    recurring || [],
    cycleTransactions,
    usdRate,
    now
  );

  const upcomingObligations: UpcomingObligation[] = schedule.upcoming.map(
    (u) => ({
      title: u.title,
      amount:
        u.currency === "USD"
          ? Math.round(u.amount * usdRate)
          : Number(u.amount),
      day_of_month: u.day_of_month,
      is_paid: u.status === "paid",
    })
  );

  // Завантажуємо активні амортизовані витрати з попередніх місяців
  const pastWhatIfObligations = await loadPastAmortizationObligations(
    supabaseAdmin,
    startDate,
    now
  );
  if (pastWhatIfObligations.length > 0) {
    upcomingObligations.push(...pastWhatIfObligations);
  }

  const currentExpenseTotal = cycleTransactions
    .filter((t) => !t.exclude_from_budget && t.type === "expense")
    .reduce((sum, t) => sum + getEffectiveTransactionExpense(t), 0);

  const simulation = simulatePurchaseImpact(
    amount,
    allValidTransactions,
    {
      now,
      startDate,
      endDate,
      totalBudgetLimit,
      currentExpenseTotal,
      upcomingObligations,
    },
    itemDescription
  );

  return formatWhatIfResponse(simulation);
}
