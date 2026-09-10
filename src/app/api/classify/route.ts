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
import { processExpenseRoundup } from "@/lib/roundup-utils";

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

    // --- ЕШЕЛОН 1: Пошук у таблиці правил merchant_rules ---
    const { data: rules } = await supabaseAdmin
      .from("merchant_rules")
      .select("pattern, clean_merchant, category_name");

    if (rules && rules.length > 0) {
      const lowerCleaned = cleaned.toLowerCase();
      const lowerRaw = validMerchant.toLowerCase();

      const matchedRule = rules.find((r) => {
        const p = r.pattern.toLowerCase();
        return lowerCleaned.includes(p) || lowerRaw.includes(p);
      });

      if (matchedRule) {
        cleanTitle = matchedRule.clean_merchant || cleaned;
        categoryName = matchedRule.category_name;
        classificationSource = "rule_engine";
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
- Здоров'я (аптеки: Подорожник, АНЦ, Бажаємо Здоров'я; стоматології, лабораторії, клініки)
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

        // Кешуємо нове правило в базу, щоб наступного разу спрацював Ешелон 1
        await supabaseAdmin.from("merchant_rules").upsert(
          {
            pattern: cleaned,
            clean_merchant: cleanTitle,
            category_name: categoryName,
          },
          { onConflict: "pattern" }
        );
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
        merchant_raw: cleanTitle, // зберігаємо зрозумілу назву для інтерфейсу
        category_name: categoryName,
        source,
        type,
        created_at: new Date().toISOString(),
        exclude_from_budget: false,
      })
      .select()
      .single();

    if (insertError) {
      console.error("Supabase insert error:", insertError);
      throw new Error(`Помилка запису транзакції`);
    }

    // 3.5. Автоокруглення витрат на Фінансову подушку ("Від витрат" до 10 ₴)
    let roundupResult = null;
    if (type === "expense" && currency === "UAH") {
      try {
        roundupResult = await processExpenseRoundup(supabaseAdmin, {
          parentTxId: insertedTx.id,
          amount,
          currency,
          source,
        });
      } catch (roundupErr) {
        console.error("Auto-roundup failed gracefully:", roundupErr);
      }
    }

    // 4. Розрахунок безпечного щоденного залишку та тексту для сповіщення Apple Shortcuts
    const safeDailyRemaining = await computeSafeDailyBudget(supabaseAdmin);
    const quickSummary = formatQuickSummary(
      cleanTitle,
      amount,
      categoryName,
      safeDailyRemaining,
      roundupResult?.roundupAmount
    );

    // Повертаємо розширену відповідь для Apple Shortcuts
    return NextResponse.json({
      success: true,
      id: insertedTx.id,
      cleanTitle,
      categoryName,
      amount,
      currency,
      source: classificationSource,
      safeDailyRemaining,
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
