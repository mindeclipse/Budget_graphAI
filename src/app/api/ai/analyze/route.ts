import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifySessionToken } from "@/lib/session";
import { Type, Schema } from "@google/genai";
import {
  getGeminiClient,
  GEMINI_MODELS,
  MODEL_FALLBACK_MAP,
} from "@/lib/gemini";
import {
  AIAnalysisRequest,
  AIAnalysisResponse,
  SupportedGeminiModel,
} from "@/types/ai";

const analysisSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    status: {
      type: Type.STRING,
      enum: ["on_track", "warning", "critical"],
      description:
        "on_track: у межах норми, warning: темп підвищений, critical: ризик вичерпання бюджету",
    },
    summary: {
      type: Type.STRING,
      description: "Місткий висновок в 1-2 речення щодо фінансової ситуації",
    },
    paceAnalysis: {
      type: Type.OBJECT,
      properties: {
        burnRateEvaluation: {
          type: Type.STRING,
          description:
            "Оцінка швидкості спалювання бюджету відносно днів, що залишилися",
        },
        projectedEndBalance: {
          type: Type.NUMBER,
          description: "Прогнозований залишок або дефіцит наприкінці циклу",
        },
        adjustedDailyBudget: {
          type: Type.NUMBER,
          description: "Рекомендований скоригований ліміт витрат на один день",
        },
      },
      required: [
        "burnRateEvaluation",
        "projectedEndBalance",
        "adjustedDailyBudget",
      ],
    },
    keyFindings: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "2-3 конкретні факти щодо категорій або динаміки витрат",
    },
    actionableSteps: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "2-3 практичні кроки для стабілізації або оптимізації",
    },
  },
  required: [
    "status",
    "summary",
    "paceAnalysis",
    "keyFindings",
    "actionableSteps",
  ],
};

import { checkAiRateLimit } from "@/lib/rate-limiter";
import { getClientIp } from "@/lib/security";

export async function POST(req: NextRequest) {
  try {
    // 1. Захист сесії (Zero Trust)
    const cookieStore = await cookies();
    const session = cookieStore.get("finance_session")?.value;
    const { valid } = await verifySessionToken(session);

    if (!valid) {
      return NextResponse.json(
        { error: "Доступ заборонено: відсутня активна сесія" },
        { status: 401 }
      );
    }

    // 2. Захист квоти Gemini API від надмірних викликів (Rate Limiting: макс. 10 / хв)
    const ip = getClientIp(req.headers);
    const rateLimit = checkAiRateLimit(`ai_analyze_${ip}`, 10, 60 * 1000);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          error: `Забагато запитів фінансового аналізу. Зачекайте ${rateLimit.retryAfterSeconds} с.`,
        },
        {
          status: 429,
          headers: {
            "Retry-After": String(rateLimit.retryAfterSeconds),
          },
        }
      );
    }

    const ai = getGeminiClient();

    const payload: AIAnalysisRequest = await req.json();
    const targetModel: SupportedGeminiModel =
      payload.preferredModel || GEMINI_MODELS.BALANCED;
    const fallbackModel: SupportedGeminiModel =
      MODEL_FALLBACK_MAP[targetModel] || GEMINI_MODELS.FAST;

    const systemInstruction = `
Ти — фінансовий аналітик. Аналізуй поточні витрати раціонально, спираючись на цифри.
Використовуй валюту ₴ (гривня). Відповідай ділово, українською мовою.
Враховуй, що великі покупки, розраховані на кілька місяців (наприклад, курси вітамінів або річна страховка) — це планова інвестиція, а НЕ імпульсивне марнотратство чи перевищення щоденного темпу.
Користувач у будні дні працює віддалено з дому до 17:00. Будь-які вечірні покупки після 17:00 (продукти, вечеря, аптека, побут) є природними плановими потребами забезпечення життя, а НЕ емоційною «сліпою зоною».
`;

    const userPrompt = `
Дані активного циклу:
- Назва періоду: ${payload.cycleName || "Поточний цикл"}
- Загальний ліміт: ${payload.budgetLimit} ₴
- Фіксовані обов'язкові платежі: ${payload.recurringTotal} ₴
- Чистий змінний бюджет: ${payload.variableBudget} ₴
- Фактично витрачено: ${payload.totalSpent} ₴ (${payload.spentPercent.toFixed(1)}%)
- Фактичний залишок: ${payload.remaining} ₴
- Залишилося днів: ${payload.daysRemaining}
- Поточний безпечний ліміт на день: ${payload.safeDailySpend.toFixed(0)} ₴/день

Топ категорій:
${payload.topCategories.map((c) => `- ${c.name}: ${c.amount} ₴ (${c.percentage}%)`).join("\n")}
`;

    const runGeneration = async (modelName: SupportedGeminiModel) => {
      return await ai.models.generateContent({
        model: modelName,
        contents: userPrompt,
        config: {
          systemInstruction,
          responseMimeType: "application/json",
          responseSchema: analysisSchema,
          temperature: 0.2,
        },
      });
    };

    let response;
    let finalModel = targetModel;

    try {
      response = await runGeneration(targetModel);
    } catch (primaryError) {
      console.warn(
        `Помилка генерації через ${targetModel}, перемикання на ${fallbackModel}:`,
        primaryError
      );
      finalModel = fallbackModel;
      response = await runGeneration(fallbackModel);
    }

    const responseText = response.text;
    if (!responseText) {
      throw new Error("Порожня відповідь від моделі");
    }

    const parsedResult: AIAnalysisResponse = {
      ...JSON.parse(responseText),
      usedModel: finalModel,
    };

    return NextResponse.json(parsedResult);
  } catch (error: any) {
    console.error("AI Analysis API Error:", error);
    return NextResponse.json(
      { error: error?.message || "Помилка при генерації фінансового аналізу" },
      { status: 500 }
    );
  }
}
