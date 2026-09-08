import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

const CATEGORIES = [
  "Продукти",
  "Кафе та ресторани",
  "Транспорт",
  "Підписки та сервіси",
  "Здоров'я та догляд",
  "Дім та побут",
  "Одяг та взуття",
  "Книги",
  "Благодійність",
  "Інше",
];

const FALLBACK_MODELS = [
  "gemini-3.5-flash-lite", 
  "gemini-3.6-flash",      
  "gemini-2.5-flash-lite", 
];

async function classifyWithGemini(
  merchantRaw: string,
  amount: number
): Promise<{ cleanMerchant: string; category: string }> {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    console.error("ПОМИЛКА: GEMINI_API_KEY відсутній у змінних оточення!");
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

  for (const model of FALLBACK_MODELS) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { responseMimeType: "application/json" },
          }),
        }
      );

      if (res.ok) {
        const data = await res.json();
        const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (rawText) {
          const parsed = JSON.parse(rawText);
          return {
            cleanMerchant: parsed.cleanMerchant || merchantRaw,
            category: CATEGORIES.includes(parsed.category) ? parsed.category : "Інше",
          };
        }
      }

      // Якщо перевантаження (503), рейтліміт (429) або збій сервера (500) — миттєво перемикаємо модель
      if ([503, 429, 500].includes(res.status)) {
        console.warn(`[Failover] Модель ${model} недоступна (HTTP ${res.status}). Пробуємо наступну...`);
        continue;
      }

      const errText = await res.text();
      console.error(`Помилка запиту до ${model} [HTTP ${res.status}]:`, errText);
      break;
    } catch (err) {
      console.error(`Мережевий збій на ${model}:`, err);
    }
  }

  return { cleanMerchant: merchantRaw, category: "Інше" };
}

export async function POST(req: NextRequest) {
  try {
    // 1. Перевірка Bearer токена
    const authHeader = req.headers.get("authorization");
    const secret = process.env.APP_API_SECRET;

    if (!secret || authHeader !== `Bearer ${secret}`) {
      return NextResponse.json(
        { error: "Unauthorized: Invalid or missing API secret" },
        { status: 401 }
      );
    }

    const body = await req.json();
    const { amount, currency = "UAH", merchant_raw, source = "apple_pay", type = "expense" } = body;

    const numericAmount = parseFloat(String(amount).replace(",", "."));
    if (isNaN(numericAmount) || numericAmount <= 0) {
      return NextResponse.json({ error: "Invalid or missing amount" }, { status: 400 });
    }

    const rawName = (merchant_raw || "Невідомий мерчант").trim();
    const normalizedPattern = rawName.toLowerCase();
    const supabaseAdmin = getSupabaseAdmin();

    let cleanMerchant = rawName;
    let category = "Інше";
    let isCacheHit = false;

    // 2. Перевірка наявності в кеші
    const { data: cachedRule } = await supabaseAdmin
      .from("merchant_rules")
      .select("clean_merchant, category_name")
      .eq("pattern", normalizedPattern)
      .maybeSingle();

    if (cachedRule) {
      cleanMerchant = cachedRule.clean_merchant;
      category = cachedRule.category_name;
      isCacheHit = true;
    } else {
      // 3. Cache Miss: Звернення до Gemini AI
      const aiResult = await classifyWithGemini(rawName, numericAmount);
      cleanMerchant = aiResult.cleanMerchant;
      category = aiResult.category;

      // 4. Запис нового правила в кеш (upsert запобігає race conditions)
      if (category !== "Інше" || cleanMerchant !== rawName) {
        await supabaseAdmin.from("merchant_rules").upsert(
          {
            pattern: normalizedPattern,
            clean_merchant: cleanMerchant,
            category_name: category,
          },
          { onConflict: "pattern" }
        );
      }
    }

    // 5. Збереження операції в transactions
    const { data, error } = await supabaseAdmin
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

    return NextResponse.json({
      success: true,
      cache_hit: isCacheHit,
      transaction: data,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}