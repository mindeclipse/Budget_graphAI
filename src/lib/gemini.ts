import { GoogleGenAI } from "@google/genai";
import { SupportedGeminiModel } from "@/types/ai";

let geminiClientInstance: GoogleGenAI | null = null;

/**
 * Отримує або ініціалізує синглтон клієнта GoogleGenAI
 */
export function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY не налаштовано в змінних оточення");
  }

  if (!geminiClientInstance) {
    geminiClientInstance = new GoogleGenAI({ apiKey });
  }

  return geminiClientInstance;
}

/**
 * Стандартизовані версії моделей Gemini, рекомендовані для проєкту
 */
export const GEMINI_MODELS = {
  FAST: "gemini-3.5-flash-lite" as const,
  BALANCED: "gemini-3.5-flash" as const,
  REASONING: "gemini-3.7-flash" as const,
  CLASSIFICATION: "gemini-2.5-flash" as const,
};

/**
 * Карта резервних моделей на випадок перевантаження або недоступності основної
 */
export const MODEL_FALLBACK_MAP: Record<
  SupportedGeminiModel,
  SupportedGeminiModel
> = {
  "gemini-3.5-flash-lite": "gemini-3.5-flash",
  "gemini-3.5-flash": "gemini-3.7-flash",
  "gemini-3.7-flash": "gemini-3.5-flash",
};
