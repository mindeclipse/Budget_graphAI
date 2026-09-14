// src/app/api/classify/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { Type, Schema } from "@google/genai";
import { cleanMerchantRaw } from "@/lib/normalize";
import { getGeminiClient, GEMINI_MODELS } from "@/lib/gemini";
import { getClientIp, timingSafeEqual } from "@/lib/security";
import { checkAiRateLimit } from "@/lib/rate-limiter";
import { z } from "zod";

const classifySchema: Schema = {
  type: Type.OBJECT,
  properties: {
    cleanTitle: {
      type: Type.STRING,
      description:
        "Зрозуміла, коротка назва закладу або мережі (наприклад: 'Кебаб на Шевченка', 'Овація', 'Близенько', 'Сільпо')",
    },
    categoryName: {
      type: Type.STRING,
      description: "Точна назва категорії зі списку дозволених",
    },
  },
  required: ["cleanTitle", "categoryName"],
};

const inputSchema = z.object({
  rawMerchant: z.string().trim().min(1, "Назва мерчанта обов'язкова").max(255),
  amount: z
    .number()
    .positive("Сума повинна бути більшою за нуль")
    .max(10_000_000, "Сума перевищує допустимий ліміт"),
  currency: z.enum(["UAH", "USD", "EUR"]).default("UAH"),
  source: z.string().trim().max(50).default("apple_pay"),
  type: z.enum(["expense", "income"]).default("expense"),
});

import {
  formatQuickSummary,
  computeSafeDailyBudget,
} from "@/lib/classify-formatter";
import { checkDailyBudgetThreshold } from "@/lib/budget-alerts";
import { processExpenseRoundup } from "@/lib/roundup-utils";

interface FastMatchResult {
  cleanTitle: string;
  categoryName: string;
}

/**
 * Ешелон 0: Миттєве евристичне розпізнавання популярних українських мерчантів (0 мс).
 * Повністю усуває таймаути Apple Shortcuts ("Час на запит сплив") при слабкому покритті зв'язку.
 */
function getFastMerchantMatch(
  rawMerchant: string,
  cleaned: string
): FastMatchResult | null {
  const text = `${rawMerchant} ${cleaned}`.toLowerCase();

  // 1. Доставка та пошта
  if (/укрпошт|ukrposht/i.test(text)) {
    return { cleanTitle: "Укрпошта", categoryName: "Доставка" };
  }
  if (
    /нова.?пошт|nova.?posht|poshtomat|поштомат|np.?lviv|np.?kyiv/i.test(text)
  ) {
    return { cleanTitle: "Нова Пошта", categoryName: "Доставка" };
  }
  if (/meest|міст.?пошт/i.test(text)) {
    return { cleanTitle: "Meest Пошта", categoryName: "Доставка" };
  }

  // 2. Здоров'я та догляд (аптеки, косметика, клініки)
  if (/подорожник|podorozhnyk/i.test(text)) {
    return {
      cleanTitle: "Аптека Подорожник",
      categoryName: "Здоров'я та догляд",
    };
  }
  if (/аптек|apteka|знахар|бажаємо здоров|анц|anc|farm|фарм/i.test(text)) {
    return { cleanTitle: "Аптека", categoryName: "Здоров'я та догляд" };
  }
  if (/eva|єва|watsons|ватсонс|prostor|простор/i.test(text)) {
    return { cleanTitle: "EVA", categoryName: "Здоров'я та догляд" };
  }

  // 3. Супермаркети та їжа
  if (/атб|atb/i.test(text)) {
    return { cleanTitle: "АТБ", categoryName: "Продукти" };
  }
  if (/сільпо|silpo/i.test(text)) {
    return { cleanTitle: "Сільпо", categoryName: "Продукти" };
  }
  if (/близенько|blyzenko/i.test(text)) {
    return { cleanTitle: "Близенько", categoryName: "Продукти" };
  }
  if (/рукавичка|rukavychka/i.test(text)) {
    return { cleanTitle: "Рукавичка", categoryName: "Продукти" };
  }
  if (/сім.?23|simi/i.test(text)) {
    return { cleanTitle: "Сім23", categoryName: "Продукти" };
  }
  if (/ашан|auchan|metro|метро|варус|varus|фора|fora/i.test(text)) {
    return { cleanTitle: cleaned || "Супермаркет", categoryName: "Продукти" };
  }

  // 4. Тютюн
  if (/овація|ovatsiya|ovaciya/i.test(text)) {
    return { cleanTitle: "Овація", categoryName: "Куріння" };
  }
  if (/табакерка|tabakerka|сигарний дім/i.test(text)) {
    return { cleanTitle: "Табакерка", categoryName: "Куріння" };
  }

  // 5. Транспорт та таксі
  if (/uklon|уклон/i.test(text)) {
    return { cleanTitle: "Таксі Uklon", categoryName: "Транспорт" };
  }
  if (/bolt/i.test(text) && !/food/i.test(text)) {
    return { cleanTitle: "Таксі Bolt", categoryName: "Транспорт" };
  }

  // 6. АЗС
  if (/okko|окко/i.test(text)) {
    return { cleanTitle: "АЗС OKKO", categoryName: "Авто" };
  }
  if (/wog|вог/i.test(text)) {
    return { cleanTitle: "АЗС WOG", categoryName: "Авто" };
  }
  if (/socar|сокар/i.test(text)) {
    return { cleanTitle: "АЗС Socar", categoryName: "Авто" };
  }

  // 7. Кафе та ресторани
  if (/dk shevchenka|dk.?kebab/i.test(text)) {
    return { cleanTitle: "Кебаб", categoryName: "Кафе та ресторани" };
  }
  if (/mcdonald|макдональд/i.test(text)) {
    return { cleanTitle: "McDonald's", categoryName: "Кафе та ресторани" };
  }
  if (/kfc|кфс/i.test(text)) {
    return { cleanTitle: "KFC", categoryName: "Кафе та ресторани" };
  }

  return null;
}

export async function POST(req: NextRequest) {
  try {
    // 1. Внутрішня перевірка Bearer-токена (Defense-in-Depth)
    const authHeader = req.headers.get("authorization");
    const secretKey = process.env.APP_API_SECRET;

    if (
      !secretKey ||
      !authHeader ||
      !timingSafeEqual(authHeader, `Bearer ${secretKey}`)
    ) {
      return NextResponse.json(
        { error: "Unauthorized: Invalid or missing Bearer token" },
        { status: 401 }
      );
    }

    // 2. Захист квоти Gemini від зациклених викликів (макс. 60 / хв)
    const ip = getClientIp(req.headers);
    const rateLimit = checkAiRateLimit(`ai_classify_${ip}`, 60, 60 * 1000);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          error: `Забагато запитів класифікації. Зачекайте ${rateLimit.retryAfterSeconds} с.`,
        },
        {
          status: 429,
          headers: {
            "Retry-After": String(rateLimit.retryAfterSeconds || 60),
          },
        }
      );
    }

    const body = await req.json();

    // Підтримуємо обидва формати назви поля
    const rawMerchant = body.merchant_raw || body.rawMerchant;
    const rawAmount = body.amount;
    const parsedAmount =
      typeof rawAmount === "number"
        ? rawAmount
        : parseFloat(String(rawAmount || "0").replace(",", "."));

    const validationResult = inputSchema.safeParse({
      rawMerchant,
      amount: parsedAmount,
      currency: body.currency || "UAH",
      source: body.source || "apple_pay",
      type: body.type || "expense",
    });

    if (!validationResult.success) {
      return NextResponse.json(
        {
          error: "Помилка валідації даних",
          details: validationResult.error.format(),
        },
        { status: 400 }
      );
    }

    const {
      rawMerchant: validMerchant,
      amount,
      currency,
      source,
      type,
    } = validationResult.data;

    const supabaseAdmin = getSupabaseAdmin();
    const cleaned = cleanMerchantRaw(validMerchant);
    let cleanTitle = cleaned;
    let categoryName = "Інше";
    let classificationSource = "fallback";

    // --- ЕШЕЛОН 0: Миттєве евристичне розпізнавання популярних українських мерчантів (0 мс) ---
    // Усуває таймаути Apple Shortcuts ("Час на запит сплив") при слабкому інтернет-покритті
    const fastMatched = getFastMerchantMatch(validMerchant, cleaned);
    if (fastMatched) {
      cleanTitle = fastMatched.cleanTitle;
      categoryName = fastMatched.categoryName;
      classificationSource = "fast_heuristics";
    }

    // --- ЕШЕЛОН 1: Пошук у таблиці правил merchant_rules (якщо не знайдено в Ешелоні 0) ---
    if (classificationSource === "fallback") {
      const { data: rules } = await supabaseAdmin
        .from("merchant_rules")
        .select("pattern, clean_merchant, category_name");

      if (rules && rules.length > 0) {
        const lowerCleaned = cleaned.toLowerCase();
        const lowerRaw = validMerchant.toLowerCase();

        // Сортуємо правила від довших до коротших патернів, щоб специфічні правила мали вищий пріоритет
        const sortedRules = [...rules].sort(
          (a, b) => (b.pattern?.length || 0) - (a.pattern?.length || 0)
        );

        const matchedRule = sortedRules.find((r) => {
          const p = (r.pattern || "").toLowerCase();
          return lowerCleaned.includes(p) || lowerRaw.includes(p);
        });

        if (matchedRule) {
          cleanTitle = matchedRule.clean_merchant || cleaned;
          categoryName = matchedRule.category_name;
          classificationSource = "rule_engine";
        }
      }
    }

    // --- ЕШЕЛОН 2: Gemini API, якщо правило не спрацювало ---
    if (classificationSource === "fallback") {
      const systemInstruction = `
Ти — класифікатор фінансових транзакцій в Україні (зокрема Львів / Київ).
Твоє завдання: прийняти сиру банківську назву мерчанта і повернути зрозумілу назву (cleanTitle) та точну категорію (categoryName).

СПИСОК ДОЗВОЛЕНИХ КАТЕГОРІЙ (повертай categoryName строго з цього списку):
- Продукти (супермаркети, мінімаркети, продуктові магазини, гастрономи, пекарні: Близенько, Сім23, Simi, Рукавичка, АТБ, Сільпо, Княжий / Shop Knyazhyy, локальні магазини їжі)
- Кафе та ресторани (фастфуд, донери, кебаби: DK / Dk Shevchenka -> Кебаб, кав'ярні, бари, ресторани)
- Куріння (тютюнові кіоски, вейпи: Овація / Ovatsiya, Табакерка, Сигарний Дім)
- Транспорт (таксі Uklon, Bolt, громадський транспорт, міські квитки, паркінг)
- Авто (АЗС: OKKO, WOG, Socar, Укрнафта; автомийки, автозапчастини, СТО, шиномонтаж)
- Одяг та взуття (магазини одягу, взуття, білизни, аксесуарів: Zara, Massimo Dutti, Intertop тощо)
- Здоров'я та догляд (аптеки: Подорожник, АНЦ, Бажаємо Здоров'я, Аптека оптових цін, Знахар; стоматології, лабораторії, клініки, оптика, догляд, косметика)
- Доставка (поштові та кур'єрські служби: Нова Пошта / Nova Poshta, Укрпошта / Ukrposhta, Meest Express, кур'єри, поштомати)
- Оренда та комуналка (комунальні послуги: Львівобленерго, Львівгаз, квартплата; інтернет, оренда)
- Підписки та сервіси (Apple, Google, Spotify, Netflix, YouTube, GitHub, OpenAI, хмарний хостинг, VPN)
- Освіта та книги (книгарні: Є, КСД, Yakaboo, Vivat; навчальні курси, література)
- Розваги та хобі (кінотеатри, концерти, квитки, боулінг, ігри: Steam, PlayStation)
- Покупки (непродуктові товари, побутова техніка, електроніка: Comfy, Rozetka, Moyo; товари для дому: Епіцентр, Jysk)
- Інвестиції (ОВДП, Inzhur, Інжур, цінні папери, поповнення брокерських рахунків, криптобіржі)
- Інше (усе, що не відповідає переліченим категоріям вище)

Правила:
- Очищай транслітерацію (наприклад: "Ovatsiya" -> "Овація", "Shop Knyazhyy" -> "Магазин Княжий").
- "Dk Shevchenka" — це кебабна / донер ("Кафе та ресторани").
- Дрібні суми (< 500 ₴) у локальних магазинах («Shop ...», «Маркет ...», «Гастроном») майже завжди є «Продукти».
- Відповідай суворо за наданою JSON-схемою.
`;

      const prompt = `Мерчант: "${validMerchant}". Очищений вигляд: "${cleaned}". Сума: ${amount || 0} ₴`;

      try {
        const ai = getGeminiClient();
        let response;
        try {
          response = await ai.models.generateContent({
            model: GEMINI_MODELS.CLASSIFICATION,
            contents: prompt,
            config: {
              systemInstruction,
              responseMimeType: "application/json",
              responseSchema: classifySchema,
              temperature: 0.1,
            },
          });
        } catch (primaryErr) {
          console.warn(
            `Primary classification model ${GEMINI_MODELS.CLASSIFICATION} failed, falling back to ${GEMINI_MODELS.FAST}:`,
            primaryErr
          );
          response = await ai.models.generateContent({
            model: GEMINI_MODELS.FAST,
            contents: prompt,
            config: {
              systemInstruction,
              responseMimeType: "application/json",
              responseSchema: classifySchema,
              temperature: 0.1,
            },
          });
        }

        const parsed = JSON.parse(response.text || "{}");
        cleanTitle = parsed.cleanTitle || cleaned;
        categoryName = parsed.categoryName || "Інше";
        classificationSource = "gemini_ai";

        // Кешуємо нове правило в базу (у нижньому регістрі), щоб наступного разу спрацював Ешелон 1
        const patternToSave = cleanMerchantRaw(rawMerchant || cleaned)
          .trim()
          .toLowerCase();

        if (patternToSave) {
          const { data: existingRule } = await supabaseAdmin
            .from("merchant_rules")
            .select("id")
            .ilike("pattern", patternToSave)
            .maybeSingle();

          if (existingRule) {
            await supabaseAdmin
              .from("merchant_rules")
              .update({
                pattern: patternToSave,
                clean_merchant: cleanTitle,
                category_name: categoryName,
              })
              .eq("id", existingRule.id);
          } else {
            await supabaseAdmin.from("merchant_rules").insert({
              pattern: patternToSave,
              clean_merchant: cleanTitle,
              category_name: categoryName,
            });
          }
        }
      } catch (aiErr) {
        console.error("Gemini classification failed, using fallbacks:", aiErr);
      }
    }

    // --- ЕШЕЛОН 3: Фіксація транзакції в таблиці transactions ---
    const { data: insertedTx, error: insertError } = await supabaseAdmin
      .from("transactions")
      .insert({
        amount,
        currency,
        merchant_raw: cleanTitle || cleaned || rawMerchant,
        category_name: categoryName,
        source,
        type,
        created_at: new Date().toISOString(),
        exclude_from_budget: false,
        metadata: {
          raw_merchant: rawMerchant,
          classification_source: classificationSource,
        },
      })
      .select()
      .single();

    if (insertError) {
      console.error("Supabase insert error:", insertError);
      throw new Error(`Помилка запису транзакції`);
    }

    // 3.5 & 4. Паралельний розрахунок автоокруглення та щоденного ліміту (прискорює відповідь на 60-80%)
    const [roundupResult, dailyBudget] = await Promise.all([
      type === "expense" && currency === "UAH"
        ? processExpenseRoundup(supabaseAdmin, {
            parentTxId: insertedTx.id,
            amount,
            currency,
            source,
          }).catch((roundupErr) => {
            console.error("Auto-roundup failed gracefully:", roundupErr);
            return null;
          })
        : Promise.resolve(null),
      computeSafeDailyBudget(supabaseAdmin).catch((budgetErr) => {
        console.error("computeSafeDailyBudget failed gracefully:", budgetErr);
        return null;
      }),
    ]);

    const quickSummary = formatQuickSummary(
      cleanTitle,
      amount,
      categoryName,
      dailyBudget,
      roundupResult?.roundupAmount
    );

    // 4.5. Асинхронна перевірка денного ліміту для Telegram без блокування Apple Shortcuts
    if (type === "expense" && dailyBudget) {
      void checkDailyBudgetThreshold(undefined, undefined, dailyBudget).catch(
        (alertErr) => {
          console.error("[Classify API] Daily budget alert error:", alertErr);
        }
      );
    }

    // Повертаємо розширену відповідь для Apple Shortcuts
    return NextResponse.json({
      success: true,
      id: insertedTx.id,
      cleanTitle,
      categoryName,
      amount,
      currency,
      source: classificationSource,
      safeDailyRemaining: dailyBudget?.todayRemaining ?? null,
      todayRemaining: dailyBudget?.todayRemaining ?? null,
      todayTarget: dailyBudget?.todayTarget ?? null,
      todaySpent: dailyBudget?.todaySpent ?? null,
      cycleRemaining: dailyBudget?.cycleRemaining ?? null,
      daysRemaining: dailyBudget?.daysRemaining ?? null,
      quickSummary,
      roundup: roundupResult
        ? {
            amount: roundupResult.roundupAmount,
            currency: "UAH",
            goalName: roundupResult.goalName,
            transactionId: roundupResult.roundupTxId,
            newGoalBalance: roundupResult.newGoalBalance,
          }
        : null,
    });
  } catch (error: any) {
    console.error("Classify & Ingest API error:", error);
    return NextResponse.json(
      {
        success: false,
        error:
          process.env.NODE_ENV === "production"
            ? "Помилка обробки транзакції"
            : error.message || "Помилка обробки транзакції",
      },
      { status: 500 }
    );
  }
}
