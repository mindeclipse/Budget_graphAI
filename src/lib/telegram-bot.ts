import { CATEGORIES, CategoryType } from "@/constants/categories";
import { escapeHtml, timingSafeEqual } from "@/lib/security";
import {
  sendTelegramMessage,
  editTelegramMessageText,
  answerTelegramCallbackQuery,
  getTelegramFile,
  TelegramReplyMarkup,
  TelegramInlineKeyboardButton,
} from "@/lib/telegram";
import {
  computeSafeDailyBudget,
  DailyBudgetInfo,
} from "@/lib/classify-formatter";
import { processExpenseRoundup } from "@/lib/roundup-utils";
import { checkDailyBudgetThreshold } from "@/lib/budget-alerts";
import { SupportedGeminiModel } from "@/types/ai";
import {
  calculateWeightedCalendarPacing,
  simulatePurchaseImpact,
  isWeekendOrLeisureDay,
  WeightedPacingResult,
  PurchaseSimulationResult,
} from "@/lib/weighted-pacing";
import { getKyivDayOfWeek } from "@/lib/behavioral-metrics";

export interface ParsedTelegramExpense {
  amount: number;
  merchant: string;
  category: CategoryType;
  type: "expense" | "income" | "investment";
  date: string;
  note?: string;
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

export const CATEGORY_EMOJIS: Record<CategoryType, string> = {
  Продукти: "🛒",
  "Кафе та ресторани": "🍽",
  Куріння: "🚬",
  Транспорт: "🚕",
  Авто: "⛽️",
  "Одяг та взуття": "👕",
  "Здоров'я": "💊",
  "Оренда та комуналка": "🏠",
  "Підписки та сервіси": "📱",
  "Освіта та книги": "📚",
  "Розваги та хобі": "🎉",
  Покупки: "🛍",
  Інвестиції: "📈",
  "Зарплата/ФОП": "💼",
  Інше: "📦",
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
  const found = CATEGORIES.find(
    (c) => c.toLowerCase() === trimmed.toLowerCase()
  );
  return found || "Інше";
}

/**
 * Парсить текстовий запит природною мовою (наприклад, "таксі 240", "вчора аптека 480 вітаміни")
 */
export async function parseNaturalLanguageExpense(
  text: string,
  referenceDate: Date = new Date()
): Promise<ParsedTelegramExpense | null> {
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
3. category: суворо одна з наступних категорій:
${CATEGORIES.map((c) => `  - "${c}"`).join("\n")}
4. type: "expense" (витрата), "income" (дохід/зарплата), або "investment" (інвестиції, ОВДП, Inzhur). За замовчуванням "expense".
5. date: рядок ISO 8601 у часовому поясі України. Якщо користувач каже "вчора", "позавчора" чи вказує дату, розрахуй відносно поточного часу: ${kyivNowStr}. Якщо дата не вказана, поверни ${isoNow}.
6. note: необов'язковий коментар або уточнення (наприклад "вітаміни", "лате з круасаном").

Повертай ВИКЛЮЧНО валідний JSON-об'єкт із цими полями без markdown чи лапок.
`;

  const prompt = `Повідомлення користувача: "${text}"`;
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
        contents: prompt,
        config: {
          systemInstruction,
          temperature: 0.1,
          maxOutputTokens: 512,
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

    return {
      amount,
      merchant: String(parsed.merchant || "Витрата").trim(),
      category: normalizeCategory(parsed.category),
      type: ["expense", "income", "investment"].includes(parsed.type)
        ? parsed.type
        : "expense",
      date: parsed.date || isoNow,
      note: parsed.note ? String(parsed.note).trim() : undefined,
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
    metadata?: Record<string, any>;
  }
): Promise<{
  transaction: any;
  dailyBudget: DailyBudgetInfo | null;
  roundupResult: any;
}> {
  const currency = params.currency || "UAH";
  const createdAt = params.date || new Date().toISOString();

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
      exclude_from_budget: false,
      metadata: params.metadata || {},
    })
    .select()
    .single();

  if (error || !transaction) {
    console.error("[Telegram Bot] Supabase insert transaction error:", error);
    throw new Error("Не вдалося зберегти транзакцію в базі даних");
  }

  // 2. Автоокруглення витрати на Фінансову подушку
  let roundupResult = null;
  if (params.type === "expense" && currency === "UAH") {
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

  // 4. Перевірка перевищення денного ліміту
  if (params.type === "expense") {
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

  if (isExpense) {
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
          { text: "📊 Відкрити BudgetGraph", url: appUrl },
        ],
      ],
    });
    await answerTelegramCallbackQuery(queryId, "Темп оновлено!");
    return true;
  }

  return false;
}

/**
 * Перевіряє, чи є текст запитом про стан/темп бюджету
 */
export function isPaceInquiry(text: string): boolean {
  const t = text.trim().toLowerCase();
  if (/^\/(pace|today|budget)/i.test(t)) return true;
  if (/^(темп|який темп\??|який мій темп\??|який темп бюджету\??)/i.test(t))
    return true;
  if (/^(скільки (можу|можна) витратити( сьогодні)?\??)/i.test(t)) return true;
  if (/^(скільки на день\??|безпечно на день\??|ліміт на день\??)/i.test(t))
    return true;
  if (
    /^(чи є гроші\??|який залишок\??|скільки залишилось( грошей)?\??)/i.test(t)
  )
    return true;
  if (/^(ліміт на вихідні\??|скільки на вихідні\??)/i.test(t)) return true;
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
      `🎯 <b>Очікуваний профіцит у скарбнички:</b> +${pacing.surplusProjection.projectedSurplusAmount.toLocaleString("uk-UA")} ₴`
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
 * Обробник команди або запиту про темп бюджету
 */
export async function handleTelegramPaceCommand(
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

  const { data: cycleConfig } = await supabaseAdmin
    .from("budget_cycles")
    .select("id, monthly_limit, start_date, end_date")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const startDate = cycleConfig?.start_date
    ? new Date(cycleConfig.start_date)
    : new Date(currentMonthStart);
  const endDate = cycleConfig?.end_date
    ? new Date(cycleConfig.end_date)
    : new Date(currentMonthEnd);

  const { data: txs } = await supabaseAdmin
    .from("transactions")
    .select(
      "id, amount, currency, merchant_raw, category_name, source, type, created_at, exclude_from_budget, deleted_at"
    )
    .is("deleted_at", null)
    .gte("created_at", startDate.toISOString())
    .lte("created_at", endDate.toISOString());

  const validTransactions = (txs || []) as any[];

  const { data: recurring } = await supabaseAdmin
    .from("recurring_templates")
    .select("id, name, amount, day_of_month, is_active")
    .eq("is_active", true);

  const upcomingObligations = (recurring || []).map((r: any) => ({
    title: r.name,
    amount: Number(r.amount || 0),
    day_of_month: r.day_of_month ? Number(r.day_of_month) : undefined,
  }));

  const currentExpenseTotal = validTransactions
    .filter((t) => !t.exclude_from_budget && t.type !== "income")
    .reduce((sum, t) => sum + Number(t.amount || 0), 0);

  const pacing = calculateWeightedCalendarPacing(validTransactions, {
    now,
    startDate,
    endDate,
    totalBudgetLimit: Number(cycleConfig?.monthly_limit || 30000),
    currentExpenseTotal,
    upcomingObligations,
  });

  return formatPaceResponse(pacing, now);
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

  const { data: cycleConfig } = await supabaseAdmin
    .from("budget_cycles")
    .select("id, monthly_limit, start_date, end_date")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const startDate = cycleConfig?.start_date
    ? new Date(cycleConfig.start_date)
    : new Date(currentMonthStart);
  const endDate = cycleConfig?.end_date
    ? new Date(cycleConfig.end_date)
    : new Date(currentMonthEnd);

  const { data: txs } = await supabaseAdmin
    .from("transactions")
    .select(
      "id, amount, currency, merchant_raw, category_name, source, type, created_at, exclude_from_budget, deleted_at"
    )
    .is("deleted_at", null)
    .gte("created_at", startDate.toISOString())
    .lte("created_at", endDate.toISOString());

  const validTransactions = (txs || []) as any[];

  const { data: recurring } = await supabaseAdmin
    .from("recurring_templates")
    .select("id, name, amount, day_of_month, is_active")
    .eq("is_active", true);

  const upcomingObligations = (recurring || []).map((r: any) => ({
    title: r.name,
    amount: Number(r.amount || 0),
    day_of_month: r.day_of_month ? Number(r.day_of_month) : undefined,
  }));

  const currentExpenseTotal = validTransactions
    .filter((t) => !t.exclude_from_budget && t.type !== "income")
    .reduce((sum, t) => sum + Number(t.amount || 0), 0);

  const simulation = simulatePurchaseImpact(
    amount,
    validTransactions,
    {
      now,
      startDate,
      endDate,
      totalBudgetLimit: Number(cycleConfig?.monthly_limit || 30000),
      currentExpenseTotal,
      upcomingObligations,
    },
    itemDescription
  );

  return formatWhatIfResponse(simulation);
}
