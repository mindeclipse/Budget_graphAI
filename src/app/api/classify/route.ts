import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";


// Примусово вказуємо Next.js не оцінювати роут під час статичної збірки
export const dynamic = "force-dynamic";

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

// Безпечна ініціалізація клієнта
function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error("Supabase environment variables are missing");
  }
  return createClient(url, key);
}

async function classifyWithGemini(merchantRaw: string, amount: number) {
  const apiKey = process.env.GEMINI_API_KEY;
  
  if (!apiKey) {
    console.error("ПОМИЛКА: GEMINI_API_KEY відсутній у змінних оточення Vercel!");
    return { cleanMerchant: merchantRaw, category: "Інше" };
  }

  const prompt = `Проаналізуй транзакцію витрат:
Мерчант: "${merchantRaw}"
Сума: ${amount} UAH

Завдання:
1. Очисти назву мерчанта від технічних кодів, транслітерації (наприклад: Blyzenko -> Близенько, Silpo -> Сільпо, Uklon -> Uklon, Ресторан -> Ресторан).
2. Обери одну категорію виключно з цього списку: ${CATEGORIES.join(", ")}.

Відповідь надай виключно у валідному JSON без markdown-форматування:
{"cleanMerchant": "Назва", "category": "Категорія"}`;

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: "application/json" },
        }),
      }
    );

    if (!res.ok) {
      const errorBody = await res.text();
      console.error(`ПОМИЛКА Gemini API [HTTP ${res.status}]:`, errorBody);
      return { cleanMerchant: merchantRaw, category: "Інше" };
    }

    const data = await res.json();
    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    
    if (rawText) {
      const parsed = JSON.parse(rawText);
      console.log("УСПІШНА КЛАСИФІКАЦІЯ:", parsed);
      return {
        cleanMerchant: parsed.cleanMerchant || merchantRaw,
        category: CATEGORIES.includes(parsed.category) ? parsed.category : "Інше",
      };
    }
  } catch (err) {
    console.error("Збій обробки Gemini:", err);
  }

  return { cleanMerchant: merchantRaw, category: "Інше" };
}

export async function POST(req: NextRequest) {
  try {
    // --- ПЕРЕВІРКА БЕЗПЕКИ: АВТОРИЗАЦІЯ ЗА СЕКРЕТНИМ ТОКЕНОМ ---
    const authHeader = req.headers.get("authorization");
    const secret = process.env.APP_API_SECRET;

    if (!secret || authHeader !== `Bearer ${secret}`) {
      return NextResponse.json(
        { error: "Unauthorized: Invalid or missing API secret" },
        { status: 401 }
      );
    }
    // -------------------------------------------------------------
    const body = await req.json();
    const { amount, currency = "UAH", merchant_raw, source = "apple_pay", type = "expense" } = body;

    const numericAmount = parseFloat(String(amount).replace(",", "."));
    if (isNaN(numericAmount) || numericAmount <= 0) {
      return NextResponse.json({ error: "Invalid or missing amount" }, { status: 400 });
    }

    const rawName = merchant_raw || "Невідомий мерчант";

    // AI-нормалізація
    const { cleanMerchant, category } = await classifyWithGemini(rawName, numericAmount);

    // Збереження в Supabase
    const supabase = getSupabase();
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