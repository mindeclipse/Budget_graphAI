import { CATEGORIES, CategoryType } from "@/constants/categories";
import { SupportedGeminiModel } from "@/types/ai";
import {
  ParsedTelegramExpense,
  ParsedTelegramReceipt,
  ParsedTelegramReceiptItem,
} from "@/lib/bot/types";
import {
  normalizeCategory,
  cleanJsonOutput,
  normalizeKyivReceiptDate,
} from "@/lib/bot/formatters";

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
  referenceDate: Date = new Date(),
  caption?: string
): Promise<ParsedTelegramReceipt | null> {
  const base64Data = fileBuffer.toString("base64");
  const isoNow = referenceDate.toISOString();

  const systemInstruction = `
Ти — високоточний аналізатор електронних фіскальних чеків (Сільпо, Monobank, Checkbox, Вчасно тощо) та банківських PDF-квитанцій / платіжних інструкцій в Україні.
Проаналізуй надане зображення або документ і витягни структуру транзакції.
Поверни ВИКЛЮЧНО валідний JSON-об'єкт із наступними полями:
- amount: загальна фінальна сума до сплати (число, наприклад 1240.50 або 2200.00).
- currency: валюта (зазвичай "UAH").
- merchant: назва магазину, продавця або кінцевого отримувача коштів.
  • Для банківських квитанцій та платіжних інструкцій (ПриватБанк, Monobank, Ощадбанк тощо):
    Вкажи кінцевого Отримувача коштів або торговельний сервіс.
    Якщо в полі "Отримувач" стоїть прочерк "-", витягни справжнього отримувача або зміст операції з полів "Призначення платежу" чи "Надавач платіжних послуг отримувача" (наприклад "Банк Альянс / Переказ", "Хваль Юрій Віталійович", тощо).
    НЕ вказуй банк платника (наприклад "АТ КБ ПРИВАТБАНК") як мерчанта, якщо це не плата банківської комісії.
- date: рядок дати та точного часу чеку/платежу за місцевим часом (Europe/Kyiv), наприклад "2026-09-17T14:55:00" або "17/09/2026 14:55". Важливо: збережи саме той місцевий час, який надруковано на квитанції (години та хвилини), без часових зсувів. Якщо точний час не вказано, використовуй: ${isoNow}.
- bankName: назва банку платника/емітента (наприклад "ПриватБанк", "Monobank", "Ощадбанк", "А-Банк", "Sense Bank" тощо), якщо це банківська квитанція чи чек, або null.
- purpose: повне призначення платежу або зміст операції (якщо зазначено в квитанції), або null.
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

  const userPrompt = caption?.trim()
    ? `Витягни дані з цього чеку / квитанції для фінансового обліку. Користувач надав супровідний коментар: "${caption.trim()}". Враховуй цей коментар при визначенні категорії, опису чи призначення.`
    : `Витягни дані з цього чеку / квитанції для фінансового обліку.`;

  const { getGeminiClient } = await import("@/lib/gemini");
  const ai = getGeminiClient();

  const candidateModels: SupportedGeminiModel[] = [
    "gemini-3.5-flash-lite",
    "gemini-3.5-flash",
    "gemini-3.7-flash",
  ];

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
              { text: userPrompt },
            ],
          },
        ],
        config: {
          systemInstruction,
          temperature: 0.1,
          maxOutputTokens: 1024,
          responseMimeType: "application/json",
        },
      });

      if (!response.text) continue;

      const cleaned = cleanJsonOutput(response.text);
      const parsed = JSON.parse(cleaned);
      const amount = Number(parsed.amount);

      if (isNaN(amount) || amount <= 0) {
        console.warn(
          `[Telegram Bot Vision] Model ${model} returned invalid amount:`,
          parsed.amount
        );
        continue;
      }

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
        date: normalizeKyivReceiptDate(parsed.date, referenceDate),
        type: ["expense", "income", "investment"].includes(parsed.type)
          ? parsed.type
          : "expense",
        suggested_category: normalizeCategory(parsed.suggested_category),
        items: items.length > 0 ? items : undefined,
        hasMultipleCategories: Boolean(parsed.hasMultipleCategories),
        bankName: parsed.bankName ? String(parsed.bankName).trim() : undefined,
        purpose: parsed.purpose ? String(parsed.purpose).trim() : undefined,
      };
    } catch (err: any) {
      console.warn(
        `[Telegram Bot Vision] Model ${model} failed for multimodal receipt:`,
        err?.message || err
      );
      // Продовжуємо до наступної резервної моделі
    }
  }

  return null;
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
  const t = text.trim();

  // 0. Пряма команда або префікс: /whatif 1500, /whatif кросівки 2500, /whatif 2500 кросівки
  const cmdMatch = t.match(
    /^(?:\/(?:whatif|simulator|calc)|(?:💡\s*)?що якщо)\s+(.+)$/i
  );
  if (cmdMatch) {
    const rest = cmdMatch[1].trim();

    // Шаблон А: Число першим — "/whatif 2500" або "/whatif 2500 кросівки"
    const numFirst = rest.match(
      /^(\d+(?:[.,]\d+)?)\s*(?:грн|₴)?(?:\s+(?:на|для)?\s*(.+))?$/i
    );
    if (numFirst) {
      const amount = parseFloat(numFirst[1].replace(",", "."));
      if (!isNaN(amount) && amount > 0) {
        return { amount, item: numFirst[2]?.trim() || "планова покупка" };
      }
    }

    // Шаблон Б: Назва першою — "/whatif кросівки 2500" або "/whatif на кросівки 2500 грн"
    const textFirst = rest.match(
      /^(?:на|для)?\s*(.+?)\s+(\d+(?:[.,]\d+)?)\s*(?:грн|₴)?$/i
    );
    if (textFirst) {
      const amount = parseFloat(textFirst[2].replace(",", "."));
      if (!isNaN(amount) && amount > 0) {
        return { amount, item: textFirst[1].trim() };
      }
    }
  }

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
 * Перевіряє, чи є текст аналітичним запитом природною мовою до фінансового асистента
 */
export function isFinancialInquiry(text: string): boolean {
  const t = text.trim();
  if (!t) return false;

  // 1. Ігноруємо системні команди
  if (
    /^\/(start|help|menu|pace|cycle|chart|cushion|fund|roundup|savings|whatif|simulator|calc)/i.test(
      t
    )
  ) {
    return false;
  }

  // 2. Ігноруємо прямі кнопки швидких дій (мають власні швидкі обробники)
  if (
    isPaceInquiry(t) ||
    isCycleSummaryInquiry(t) ||
    isChartInquiry(t) ||
    isEmergencyFundInquiry(t) ||
    isWhatIfGuideInquiry(t) ||
    parseWhatIfPurchaseQuery(t) !== null
  ) {
    return false;
  }

  // 3. Ігноруємо явні записи витрат через Fast-Path (наприклад "кава 85", "таксі 240")
  if (tryFastNaturalLanguageParse(t) !== null) {
    return false;
  }

  // 4. Якщо повідомлення починається з мерчанта і суми ("Сільпо 500", "АЗС 1500 паливо"), це витрата
  if (
    /^[a-zа-яіїєґ0-9\s#№.'"-]{2,30}\s+\d+(?:[.,]\d+)?(?:\s+(?:грн|₴))?/i.test(t)
  ) {
    const words = t.split(/\s+/);
    const hasQuestionWords =
      /^(скільки|як|чи|які|яка|який|де|коли|чому|що|на що|покажи|підкажи|проаналізуй|статистика|звіт|топ|порадь|допоможи|розкажи)/i.test(
        t
      );
    if (!hasQuestionWords && !t.includes("?")) {
      const hasNumber = words.some((w) =>
        /^\d+(?:[.,]\d+)?(?:грн|₴)?$/i.test(w)
      );
      if (hasNumber && words.length <= 4) {
        return false;
      }
    }
  }

  // 5. Маркери аналітичного запитання:
  // А. Наявність знака питання
  if (t.includes("?")) {
    return true;
  }

  // Б. Питальні слова або прохання аналітики на початку
  const startsWithInquiry =
    /^(скільки|як|чи|які|яка|який|де|коли|чому|що\s+по|на\s+що|покажи|підкажи|проаналізуй|статистика|звіт|топ|порадь|допоможи|розкажи|порівняй|перевір|на\s+скільки|яка\s+сума)/i.test(
      t
    );
  if (startsWithInquiry) {
    return true;
  }

  // В. Аналітичні фінансові патерни
  const hasAnalyticalPattern =
    /(?:витрат(?:и|а|ів|ами)?\s+(?:на|за|цього|минулого|останн)|найбільш(?:і|а|их|у|е)|покуп(?:ок|ки|ками)|в\s+подуш(?:ку|ці|ка)|скарбнич(?:к|ц)[а-яіїєґ]*|підписк(?:и|ок|ами)|бюджет(?:у|ом)?|вистач(?:ить|ає)|оптиміз(?:увати|ація)|економі(?:я|ти)|заощад(?:ити|ження)|грош(?:і|ей|ами))/i.test(
      t
    );

  return hasAnalyticalPattern;
}
