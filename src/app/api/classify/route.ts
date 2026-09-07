import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const CATEGORIES = [
  "Продукти",
  "Кафе та ресторани",
  "Транспорт",
  "Підписки та сервіси",
  "Здоров'я та догляд",
  "Дім та побут",
  "Одяг та взуття",
  "Благодійність",
  "Інше",
];

async function classifyWithGemini(merchantRaw: string, amount: number) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return { cleanMerchant: merchantRaw, category: "Інше" };
  }

  const prompt = `Проаналізуй транзакцію витрат:
Мерчант: "${merchantRaw}"
Сума: ${amount} UAH

Завдання:
1. Очисти назву мерчанта від технічних префіксів, адрес шлюзів (send.monobank.ua -> Monobank, Liqpay*biplan_charity -> БФ Біплан, Blyzenko -> Близенько, Silpo -> Сільпо, Uklon -> Uklon).
2. Обери рівно одну категорію виключно з цього списку: ${CATEGORIES.join(", ")}.

Формат відповіді (чистий JSON без блоків коду):
{"cleanMerchant": "Назва", "category": "Категорія"}`;

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: "application/json" },
        }),
      }
    );

    const data = await res.json();
    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (rawText) {
      const parsed = JSON.parse(rawText);
      return {
        cleanMerchant: parsed.cleanMerchant || merchantRaw,
        category: CATEGORIES.includes(parsed.category) ? parsed.category : "Інше",
      };
    }
  } catch (err) {
    console.error("Gemini classification failed:", err);
  }

  return { cleanMerchant: merchantRaw, category: "Інше" };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { amount, currency = "UAH", merchant_raw, source = "apple_pay", type = "expense" } = body;

    if (!amount) {
      return NextResponse.json({ error: "Amount is required" }, { status: 400 });
    }

    const rawName = merchant_raw || "Невідомий мерчант";
    const numericAmount = parseFloat(amount);

    // AI-нормалізація
    const { cleanMerchant, category } = await classifyWithGemini(rawName, numericAmount);

    // Збереження в Supabase
    const { data, error } = await supabase
      .from("transactions")
      .insert([
        {
          amount: numericAmount,
          currency,
          merchant_raw: cleanMerchant,
          category_name: category,
          source,
          type,
        },
      ])
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ success: true, transaction: data });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}