// src/app/api/classify/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { GoogleGenAI, Type, Schema } from "@google/genai";
import { cleanMerchantRaw } from "@/lib/normalize";

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

const classifySchema: Schema = {
  type: Type.OBJECT,
  properties: {
    cleanTitle: {
      type: Type.STRING,
      description:
        "Зрозуміла, коротка назва закладу або мережі (наприклад: 'Кебаб на Шевченка', 'Овація', 'Близенько')",
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
    const { rawMerchant, amount } = await req.json();

    if (!rawMerchant) {
      return NextResponse.json(
        { error: "rawMerchant обов'язковий" },
        { status: 400 }
      );
    }

    const cleaned = cleanMerchantRaw(rawMerchant);

    // --- ЕШЕЛОН 1: Пошук у таблиці правил merchant_rules ---
    const { data: rules } = await supabase
      .from("merchant_rules")
      .select("pattern, normalized_name, category_name");

    if (rules && rules.length > 0) {
      const lowerCleaned = cleaned.toLowerCase();
      const lowerRaw = rawMerchant.toLowerCase();

      // Шукаємо правило, патерн якого входить у сиру або очищену назву
      const matchedRule = rules.find((r) => {
        const p = r.pattern.toLowerCase();
        return lowerCleaned.includes(p) || lowerRaw.includes(p);
      });

      if (matchedRule) {
        return NextResponse.json({
          cleanTitle: matchedRule.normalized_name || cleaned,
          categoryName: matchedRule.category_name,
          source: "rule_engine",
        });
      }
    }

    // --- ЕШЕЛОН 2: Gemini API з українським ритейл-контекстом ---
    const systemInstruction = `
Ти — класифікатор фінансових транзакцій в Україні (зокрема Львів / Київ).
Твоє завдання: прийняти сиру банківську назву мерчанта і повернути зрозумілу назву (cleanTitle) та точну категорію (categoryName).

СПИСОК КАТЕГОРІЙ:
- Продукти (супермаркети, мінімаркети: Близенько, Сім23, Simi, Рукавичка, АТБ, Сільпо)
- Кафе та ресторани (фастфуд, донери, кебаби: DK / Dk Shevchenka -> Кебаб, кав'ярні, бари)
- Куріння (тютюнові кіоски, вейпи: Овація / Ovatsiya, Табакерка, Сигарний Дім)
- Транспорт (таксі Uklon, Bolt, громадський транспорт, паркінг)
- Здоров'я (аптеки, клініки)
- Розваги
- Покупки
- Інше

Правила:
- Очищай транслітерацію (наприклад: "Ovatsiya" -> "Овація").
- "Dk Shevchenka" — це кебабна / донер ("Кафе та ресторани").
- Відповідай суворо за наданою JSON-схемою.
`;

    const prompt = `Мерчант: "${rawMerchant}". Очищений вигляд: "${cleaned}". Сума: ${amount || 0} ₴`;

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash-lite",
      contents: prompt,
      config: {
        systemInstruction,
        responseMimeType: "application/json",
        responseSchema: classifySchema,
        temperature: 0.1,
      },
    });

    const parsed = JSON.parse(response.text || "{}");
    const cleanTitle = parsed.cleanTitle || cleaned;
    const categoryName = parsed.categoryName || "Інше";

    // --- ЕШЕЛОН 3: Кешування в merchant_rules для майбутніх покупок ---
    // Якщо правило з'явилося вперше, закріплюємо його автоматично
    await supabase.from("merchant_rules").upsert(
      {
        pattern: cleaned,
        normalized_name: cleanTitle,
        category_name: categoryName,
      },
      { onConflict: "pattern" }
    );

    return NextResponse.json({
      cleanTitle,
      categoryName,
      source: "gemini_ai",
    });
  } catch (error: any) {
    console.error("Classify API error:", error);
    return NextResponse.json(
      {
        cleanTitle: req.headers.get("rawMerchant") || "Невідомо",
        categoryName: "Інше",
      },
      { status: 200 } // Повертаємо 200 із дефолтом, щоб Shortcuts не падав
    );
  }
}
