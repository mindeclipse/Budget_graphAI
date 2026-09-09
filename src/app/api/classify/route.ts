// src/app/api/classify/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { Type, Schema } from "@google/genai";
import { cleanMerchantRaw } from "@/lib/normalize";
import { getGeminiClient, GEMINI_MODELS } from "@/lib/gemini";

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

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // Підтримуємо обидва формати назви поля
    const rawMerchant = body.merchant_raw || body.rawMerchant;

    // Парсимо суму (якщо надійшов рядок з комою чи крапкою)
    const rawAmount = body.amount;
    const amount =
      typeof rawAmount === "number"
        ? rawAmount
        : parseFloat(String(rawAmount || "0").replace(",", "."));

    const currency = body.currency || "UAH";
    const source = body.source || "apple_pay";
    const type = body.type || "expense";

    if (!rawMerchant) {
      return NextResponse.json(
        { error: "merchant_raw або rawMerchant обов'язковий" },
        { status: 400 }
      );
    }

    const cleaned = cleanMerchantRaw(rawMerchant);
    let cleanTitle = cleaned;
    let categoryName = "Інше";
    let classificationSource = "fallback";

    // --- ЕШЕЛОН 1: Пошук у таблиці правил merchant_rules ---
    const { data: rules } = await supabase
      .from("merchant_rules")
      .select("pattern, normalized_name, category_name");

    if (rules && rules.length > 0) {
      const lowerCleaned = cleaned.toLowerCase();
      const lowerRaw = rawMerchant.toLowerCase();

      const matchedRule = rules.find((r) => {
        const p = r.pattern.toLowerCase();
        return lowerCleaned.includes(p) || lowerRaw.includes(p);
      });

      if (matchedRule) {
        cleanTitle = matchedRule.normalized_name || cleaned;
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
- Продукти (супермаркети, мінімаркети: Близенько, Сім23, Simi, Рукавичка, АТБ, Сільпо)
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
- Покупки (побутова техніка, електроніка: Comfy, Rozetka, Moyo; товари для дому: Епіцентр, Jysk)
- Інвестиції (ОВДП, Inzhur, Інжур, цінні папери, поповнення брокерських рахунків, криптобіржі)
- Інше (усе, що не відповідає переліченим категоріям вище)

Правила:
- Очищай транслітерацію (наприклад: "Ovatsiya" -> "Овація").
- "Dk Shevchenka" — це кебабна / донер ("Кафе та ресторани").
- Відповідай суворо за наданою JSON-схемою.
`;

      const prompt = `Мерчант: "${rawMerchant}". Очищений вигляд: "${cleaned}". Сума: ${amount || 0} ₴`;

      try {
        const ai = getGeminiClient();
        const response = await ai.models.generateContent({
          model: GEMINI_MODELS.CLASSIFICATION,
          contents: prompt,
          config: {
            systemInstruction,
            responseMimeType: "application/json",
            responseSchema: classifySchema,
            temperature: 0.1,
          },
        });

        const parsed = JSON.parse(response.text || "{}");
        cleanTitle = parsed.cleanTitle || cleaned;
        categoryName = parsed.categoryName || "Інше";
        classificationSource = "gemini_ai";

        // Кешуємо нове правило в базу, щоб наступного разу спрацював Ешелон 1
        await supabase.from("merchant_rules").upsert(
          {
            pattern: cleaned,
            normalized_name: cleanTitle,
            category_name: categoryName,
          },
          { onConflict: "pattern" }
        );
      } catch (aiErr) {
        console.error("Gemini classification failed, using fallbacks:", aiErr);
      }
    }

    // --- ЕШЕЛОН 3: Фіксація транзакції в таблиці transactions ---
    const { data: insertedTx, error: insertError } = await supabase
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
      throw new Error(`Помилка запису транзакції: ${insertError.message}`);
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
    });
  } catch (error: any) {
    console.error("Classify & Ingest API error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Помилка обробки транзакції",
      },
      { status: 500 }
    );
  }
}
