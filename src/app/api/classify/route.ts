import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { GoogleGenAI, Type } from "@google/genai";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

const CATEGORIES = [
  "Продукти",
  "Кафе та ресторани",
  "Транспорт",
  "Підписки та сервіси",
  "Здоров'я та догляд",
  "Дім та побут",
  "Одяг та взуття",
  "Благодійність",
  "Інше"
] as const;

export async function POST(req: NextRequest) {
  try {
    const payload = await req.json();
    
    // Supabase Webhook передає новий рядок у payload.record
    const record = payload.record || payload;
    const { id, merchant_raw, amount } = record;

    if (!id || !merchant_raw) {
      return NextResponse.json({ message: "No data to classify" }, { status: 400 });
    }

    // Запит до Gemini для категоризації та очищення
    const prompt = `Проаналізуй транзакцію витрат:
- Сира назва мерчанта: "${merchant_raw}"
- Сума: ${amount} UAH

Твоє завдання:
1. Очисти назву мерчанта від технічних кодів, адрес, систем транслітерації (наприклад: "Liqpay*biplan_charity" -> "БФ Біплан", "Blyzenko" -> "Близенько", "send.monobank.ua" -> "Monobank").
2. Обери найбільш точну категорію зі списку: ${CATEGORIES.join(", ")}.`;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            clean_merchant: { type: Type.STRING, description: "Нормалізована назва українською або брендовою назвою" },
            category: { type: Type.STRING, enum: CATEGORIES as unknown as string[] }
          },
          required: ["clean_merchant", "category"]
        }
      }
    });

    const result = JSON.parse(response.text || "{}");

    // Оновлення запису в Supabase
    const { error: updateError } = await supabase
      .from("transactions")
      .update({
        merchant_raw: result.clean_merchant || merchant_raw,
        category_name: result.category || "Інше"
      })
      .eq("id", id);

    if (updateError) {
      throw updateError;
    }

    return NextResponse.json({ success: true, updated: result });
  } catch (error: any) {
    console.error("Classification error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}