import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI, Type, Schema } from "@google/genai";
import {
  AIAnalysisRequest,
  AIAnalysisResponse,
  SupportedGeminiModel,
} from "@/types/ai";

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

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

export async function POST(req: NextRequest) {
  try {
    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json(
        { error: "GEMINI_API_KEY не налаштовано на сервері" },
        { status: 500 }
      );
    }

    const payload: AIAnalysisRequest = await req.json();
    const targetModel: SupportedGeminiModel =
      payload.preferredModel || "gemini-3.5-flash-lite";
    const fallbackModel: SupportedGeminiModel =
      targetModel === "gemini-3.5-flash-lite"
        ? "gemini-3.5-flash"
        : "gemini-3.7-flash";

    const systemInstruction = `
Ти — фінансовий аналітик. Аналізуй поточні витрати раціонально, спираючись на цифри.
Використовуй валюту ₴ (гривня). Відповідай ділово, українською мовою.
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
