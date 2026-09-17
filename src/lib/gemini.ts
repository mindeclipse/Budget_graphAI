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
  BALANCED: "gemini-3.5-flash-lite" as const, // 500 RPD & 15 RPM to protect 20 RPD tier
  REASONING: "gemini-3.7-flash" as const,
  CLASSIFICATION: "gemini-3.5-flash-lite" as const,
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
  "gemini-3.7-flash": "gemini-3.5-flash-lite",
};

/**
 * Повний пріоритетний каскад моделей для безвідмовної роботи чату (High-Availability Failover)
 * gemini-3.5-flash-lite має 500 RPD та 15 RPM, захищаючи вузькі ліміти (20 RPD) 3.5 Flash та 3.7 Flash
 */
export const GEMINI_FALLBACK_CHAIN: SupportedGeminiModel[] = [
  "gemini-3.5-flash-lite",
  "gemini-3.5-flash",
  "gemini-3.7-flash",
];
