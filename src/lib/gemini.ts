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
  FAST: "gemini-3.5-flash-lite" as const, // 500 RPD, 15 RPM - миттєвий JSON
  CLASSIFICATION: "gemini-3.5-flash-lite" as const, // 500 RPD - високочастотна категоризація витрат
  BALANCED: "gemini-3.5-flash" as const, // 20 RPD - багата мова та фінансові поради для асистента
  REASONING: "gemini-3.7-flash" as const, // 20 RPD - глибокий щотижневий коучинг та поведінковий аналіз
};

/**
 * Карта резервних моделей: якщо якісна модель (20 RPD) досягає ліміту,
 * запит миттєво підхоплює Flash Lite (500 RPD) без помилки для користувача.
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
 * Пріоритетний каскад моделей для консультацій та чату:
 * 1. gemini-3.5-flash (максимальна глибина та природна мова)
 * 2. gemini-3.5-flash-lite (страховка на 500 RPD, якщо денний ліміт 20 RPD вичерпається)
 * 3. gemini-3.7-flash (глибокий резерв)
 */
export const GEMINI_FALLBACK_CHAIN: SupportedGeminiModel[] = [
  "gemini-3.5-flash",
  "gemini-3.5-flash-lite",
  "gemini-3.7-flash",
];
