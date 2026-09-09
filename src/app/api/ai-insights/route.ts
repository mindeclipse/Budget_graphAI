import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifySessionToken } from "@/lib/session";
import { Type, Schema } from "@google/genai";
import { getGeminiClient, GEMINI_MODELS } from "@/lib/gemini";
import { AIInsightData } from "@/types/finance";

const insightSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    status: {
      type: Type.STRING,
      enum: ["safe", "warning", "danger"],
      description:
        "safe: у межах норми, warning: підвищений темп, danger: високий ризик вичерпання",
    },
    summary: {
      type: Type.STRING,
      description: "Короткий висновок (1-2 речення) щодо темпу витрат",
    },
    anomalies: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "Список помічених аномалій або нетипових витрат",
    },
    saving_tactics: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "Конкретні дієві поради для оптимізації бюджету",
    },
    forecast: {
      type: Type.STRING,
      description: "Сценарний розрахунок до кінця періоду при збереженні темпу",
    },
  },
  required: ["status", "summary", "anomalies", "saving_tactics", "forecast"],
};

export async function POST(req: Request) {
  try {
    // 1. Перевірка сесії перед викликом Gemini (Zero Trust)
    const cookieStore = await cookies();
    const session = cookieStore.get("finance_session")?.value;
    const { valid } = await verifySessionToken(session);

    if (!valid) {
      return NextResponse.json(
        { error: "Доступ заборонено: відсутня активна сесія" },
        { status: 401 }
      );
    }

    // 2. Отримання даних запиту
    const body = await req.json();
    const {
      month,
      budgetLimit,
      totalSpent,
      remaining,
      daysRemaining,
      safeDailySpend,
      categories,
      recurringTotal,
      topTransactions,
    } = body;

    const systemInstruction = `
Ти — персональний аналітичний фінансовий асистент. Твоя мета — оцінити поточну структуру витрат користувача, розрахувати ризик виходу за межі бюджету та дати конкретні, раціональні поради щодо заощадження.
Використовуй валюту ₴ (гривня). Відповідай українською мовою.
`;

    const userPrompt = `
Контекст за період (${month || "Поточний"}):
- Встановлений місячний ліміт: ${budgetLimit} ₴
- Фактично витрачено: ${totalSpent} ₴
- Залишок бюджету: ${remaining} ₴
- Днів до кінця місяця: ${daysRemaining}
- Поточний безпечний темп на день: ${Number(safeDailySpend).toFixed(0)} ₴/день
- Заплановані постійні витрати на місяць: ${recurringTotal} ₴
- Розподіл за категоріями: ${JSON.stringify(categories || [])}
- Найбільші транзакції: ${JSON.stringify(topTransactions || [])}
`;

    const ai = getGeminiClient();

    const response = await ai.models.generateContent({
      model: GEMINI_MODELS.FAST,
      contents: userPrompt,
      config: {
        systemInstruction,
        temperature: 0.2,
        responseMimeType: "application/json",
        responseSchema: insightSchema,
      },
    });

    const rawText = response.text;
    if (!rawText) {
      throw new Error("Порожня відповідь від Gemini API");
    }

    const parsedInsight: AIInsightData = JSON.parse(rawText);

    return NextResponse.json(parsedInsight);
  } catch (error: any) {
    console.error("AI Insights API error:", error);
    return NextResponse.json(
      { error: "Помилка обробки", message: error?.message },
      { status: 500 }
    );
  }
}
