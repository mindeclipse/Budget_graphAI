import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { verifySessionToken } from "@/lib/session";
import { getGeminiClient, GEMINI_MODELS } from "@/lib/gemini";
import { z } from "zod";

export const dynamic = "force-dynamic";

// Обмеження розміру PDF: максимум 5 МБ
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;

const receiptResultSchema = z.object({
  amount: z.number().positive(),
  currency: z.string().default("UAH"),
  recipient: z.string().min(1),
  purpose: z.string().default(""),
  date: z.string(),
  type: z.enum(["expense", "investment"]).default("expense"),
  suggested_category: z.string().default("Інше"),
  payer: z.string().optional(),
  bank_name: z.string().optional(),
});

function getSafeErrorMessage(err: any): string {
  return process.env.NODE_ENV === "production"
    ? "Помилка обробки квитанції"
    : err?.message || "Помилка сервера";
}

async function checkAuth(req: Request): Promise<boolean> {
  let sessionValue: string | undefined;
  try {
    const cookieStore = await cookies();
    sessionValue = cookieStore.get("finance_session")?.value;
  } catch {
    // Резервний витяг cookie з заголовків для стійкості
  }

  if (!sessionValue) {
    const cookieHeader = req.headers.get("cookie") || "";
    const match = cookieHeader.match(/finance_session=([^;]+)/);
    if (match) sessionValue = match[1];
  }

  const { valid } = await verifySessionToken(sessionValue);
  return valid;
}

export async function POST(req: Request) {
  try {
    // 1. Перевірка авторизованої сесії користувача
    if (!(await checkAuth(req))) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2. Валідація завантаженого файлу
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "Файл не надано" }, { status: 400 });
    }

    const lowerName = file.name.toLowerCase();
    if (!lowerName.endsWith(".pdf")) {
      return NextResponse.json(
        { error: "Дозволені лише файли квитанцій у форматі .pdf" },
        { status: 400 }
      );
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      return NextResponse.json(
        { error: "Розмір файлу перевищує ліміт (максимум 5 МБ)" },
        { status: 400 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // 3. Перевірка magic bytes PDF: %PDF- (0x25 0x50 0x44 0x46)
    const isPdf =
      buffer.length >= 4 &&
      buffer[0] === 0x25 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x44 &&
      buffer[3] === 0x46;

    if (!isPdf) {
      return NextResponse.json(
        { error: "Вміст файлу не відповідає дійсному формату PDF" },
        { status: 400 }
      );
    }

    // 4. Виклик Gemini для інтелектуального парсингу платіжки
    const ai = getGeminiClient();
    const base64Pdf = buffer.toString("base64");

    const prompt = `Проаналізуй цю банківську квитанцію / платіжну інструкцію та витягни дані для фінансового обліку.
Поверни ВИКЛЮЧНО валідний JSON-об'єкт без будь-якого форматування markdown, лапок чи пояснень, із такими полями:
- amount: число (сума операції, наприклад 35758.74)
- currency: рядок (валюта, наприклад UAH, USD, EUR)
- recipient: рядок (назва отримувача або торговця)
- purpose: рядок (призначення платежу або опис)
- date: рядок ISO 8601 (дата і точний час виконання або валютування, наприклад 2026-09-10T13:57:00)
- type: 'expense' або 'investment' (якщо платіж пов'язаний з інвестиціями, купівлею цінних паперів, ОВДП, фондів, брокерським рахунком, Inzhur, криптовалютою тощо — ОБОВ'ЯЗКОВО вкажи 'investment', інакше 'expense')
- suggested_category: рядок українською (категорія, наприклад 'Інвестиції', 'Комуналка', 'Послуги', 'Оренда', 'Зв'язок' тощо)
- payer: рядок (ім'я або код платника, якщо вказано)
- bank_name: рядок (банк платника/надавач послуг, наприклад ПриватБанк, Monobank тощо)`;

    let rawAiText = "";
    try {
      const aiResponse = await ai.models.generateContent({
        model: GEMINI_MODELS.BALANCED,
        contents: [
          {
            role: "user",
            parts: [
              {
                inlineData: {
                  mimeType: "application/pdf",
                  data: base64Pdf,
                },
              },
              { text: prompt },
            ],
          },
        ],
        config: {
          responseMimeType: "application/json",
        },
      });
      rawAiText = aiResponse.text || "";
    } catch (aiErr: any) {
      console.warn(
        "[parse-receipt] Error with primary model, trying fallback:",
        aiErr
      );
      const fallbackResponse = await ai.models.generateContent({
        model: GEMINI_MODELS.FAST,
        contents: [
          {
            role: "user",
            parts: [
              {
                inlineData: {
                  mimeType: "application/pdf",
                  data: base64Pdf,
                },
              },
              { text: prompt },
            ],
          },
        ],
        config: {
          responseMimeType: "application/json",
        },
      });
      rawAiText = fallbackResponse.text || "";
    }

    // Очищення відповіді від можливих markdown-блоків \`\`\`json ... \`\`\`
    const cleanedJson = rawAiText
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();

    let parsedData: any;
    try {
      parsedData = JSON.parse(cleanedJson);
    } catch {
      console.error("[parse-receipt] Failed to parse AI JSON:", rawAiText);
      return NextResponse.json(
        {
          error:
            "Не вдалося автоматично розпізнати квитанцію. Перевірте читабельність документа.",
        },
        { status: 422 }
      );
    }

    const validated = receiptResultSchema.safeParse(parsedData);
    if (!validated.success) {
      console.error(
        "[parse-receipt] Validation failed:",
        validated.error.format()
      );
      return NextResponse.json(
        { error: "Некоректна структура розпізнаних даних квитанції" },
        { status: 422 }
      );
    }

    const receipt = validated.data;
    const supabase = getSupabaseAdmin();

    // 5. Застосування правил мерчантів користувача
    const { data: rules } = await supabase
      .from("merchant_rules")
      .select("id, pattern, clean_merchant, normalized_name, category_name");
    if (rules && rules.length > 0) {
      const lowerRecipient = receipt.recipient.toLowerCase();
      const lowerPurpose = receipt.purpose.toLowerCase();

      for (const rule of rules) {
        const pattern = String(rule.pattern || "")
          .trim()
          .toLowerCase();
        if (
          pattern &&
          (lowerRecipient.includes(pattern) || lowerPurpose.includes(pattern))
        ) {
          receipt.recipient = rule.clean_merchant || receipt.recipient;
          receipt.suggested_category =
            rule.category_name || receipt.suggested_category;
          break;
        }
      }
    }

    // 6. Перевірка на потенційний дублікат в БД (у межах 3 днів для клірингу)
    const txDate = new Date(receipt.date);
    let isPotentialDuplicate = false;
    let duplicateTxId: number | null = null;

    if (!isNaN(txDate.getTime())) {
      const windowStart = new Date(txDate.getTime() - 3 * 24 * 60 * 60 * 1000);
      const windowEnd = new Date(txDate.getTime() + 3 * 24 * 60 * 60 * 1000);

      const { data: existingMatches } = await supabase
        .from("transactions")
        .select("id, amount, merchant_raw, created_at")
        .gte("created_at", windowStart.toISOString())
        .lte("created_at", windowEnd.toISOString())
        .eq("amount", receipt.amount)
        .is("deleted_at", null);

      if (existingMatches && existingMatches.length > 0) {
        isPotentialDuplicate = true;
        duplicateTxId = existingMatches[0].id;
      }
    }

    return NextResponse.json({
      success: true,
      receipt: {
        amount: receipt.amount,
        currency: receipt.currency || "UAH",
        recipient: receipt.recipient,
        purpose: receipt.purpose,
        date: receipt.date,
        type: receipt.type,
        category: receipt.suggested_category,
        payer: receipt.payer,
        bankName: receipt.bank_name,
        isPotentialDuplicate,
        duplicateTxId,
      },
      fileMeta: {
        fileName: file.name,
        fileSize: file.size,
        base64: base64Pdf,
        mimeType: "application/pdf",
      },
    });
  } catch (err: any) {
    console.error("[API transactions/parse-receipt error]:", err);
    return NextResponse.json(
      { error: getSafeErrorMessage(err) },
      { status: 500 }
    );
  }
}
