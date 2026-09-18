import { CATEGORIES } from "@/constants/categories";
import { SupportedGeminiModel } from "@/types/ai";
import {
  ParsedTelegramReceipt,
  ParsedTelegramReceiptItem,
} from "@/lib/bot/types";
import {
  normalizeCategory,
  cleanJsonOutput,
  normalizeKyivReceiptDate,
} from "@/lib/bot/formatters";

/**
 * Мультимодальний парсинг фото електронного чека (PNG/JPEG/WEBP) або PDF квитанції
 */
export async function parseMultimodalReceipt(
  fileBuffer: Buffer,
  mimeType: string,
  referenceDate: Date = new Date(),
  caption?: string
): Promise<ParsedTelegramReceipt | null> {
  const base64Data = fileBuffer.toString("base64");
  const isoNow = referenceDate.toISOString();

  const systemInstruction = `
Ти — високоточний аналізатор електронних фіскальних чеків (Сільпо, Monobank, Checkbox, Вчасно тощо) та банківських PDF-квитанцій / платіжних інструкцій в Україні.
Проаналізуй надане зображення або документ і витягни структуру транзакції.
Поверни ВИКЛЮЧНО валідний JSON-об'єкт із наступними полями:
- amount: загальна фінальна сума до сплати (число, наприклад 1240.50 або 2200.00).
- currency: валюта (зазвичай "UAH").
- merchant: назва магазину, продавця або кінцевого отримувача коштів.
  • Для банківських квитанцій та платіжних інструкцій (ПриватБанк, Monobank, Ощадбанк тощо):
    Вкажи кінцевого Отримувача коштів або торговельний сервіс.
    Якщо в полі "Отримувач" стоїть прочерк "-", витягни справжнього отримувача або зміст операції з полів "Призначення платежу" чи "Надавач платіжних послуг отримувача" (наприклад "Банк Альянс / Переказ", "Хваль Юрій Віталійович", тощо).
    НЕ вказуй банк платника (наприклад "АТ КБ ПРИВАТБАНК") як мерчанта, якщо це не плата банківської комісії.
- date: рядок дати та точного часу чеку/платежу за місцевим часом (Europe/Kyiv), наприклад "2026-09-17T14:55:00" або "17/09/2026 14:55". Важливо: збережи саме той місцевий час, який надруковано на квитанції (години та хвилини), без часових зсувів. Якщо точний час не вказано, використовуй: ${isoNow}.
- bankName: назва банку платника/емітента (наприклад "ПриватБанк", "Monobank", "Ощадбанк", "А-Банк", "Sense Bank" тощо), якщо це банківська квитанція чи чек, або null.
- purpose: повне призначення платежу або зміст операції (якщо зазначено в квитанції), або null.
- type: "expense" | "income" | "investment" (якщо цінні папери, ОВДП, Inzhur — "investment", інакше "expense").
- suggested_category: головна категорія зі списку: ${CATEGORIES.join(", ")}.
- items: масив куплених позицій, якщо це деталізований чек супермаркету/магазину:
  [
    {
      "name": "Назва товару",
      "price": число (загальна вартість позиції),
      "quantity": число,
      "suggested_category": одна з дозволених категорій
    }
  ]
- hasMultipleCategories: boolean (true, якщо товари відносяться до різних категорій, наприклад "Продукти" та "Куріння" чи "Покупки").
`;

  const userPrompt = caption?.trim()
    ? `Витягни дані з цього чеку / квитанції для фінансового обліку. Користувач надав супровідний коментар: "${caption.trim()}". Враховуй цей коментар при визначенні категорії, опису чи призначення.`
    : `Витягни дані з цього чеку / квитанції для фінансового обліку.`;

  const { getGeminiClient } = await import("@/lib/gemini");
  const ai = getGeminiClient();

  const candidateModels: SupportedGeminiModel[] = [
    "gemini-3.5-flash-lite",
    "gemini-3.5-flash",
    "gemini-3.7-flash",
  ];

  for (const model of candidateModels) {
    try {
      const config: Record<string, any> = {
        systemInstruction,
        temperature: 0.1,
        maxOutputTokens: 4096,
        responseMimeType: "application/json",
      };

      if (!model.includes("lite")) {
        config.thinkingConfig = {
          thinkingBudget: 0,
        };
      }

      const response = await ai.models.generateContent({
        model,
        contents: [
          {
            role: "user",
            parts: [
              {
                inlineData: {
                  mimeType,
                  data: base64Data,
                },
              },
              { text: userPrompt },
            ],
          },
        ],
        config,
      });

      if (!response.text) continue;

      const cleaned = cleanJsonOutput(response.text);
      const parsed = JSON.parse(cleaned);
      const amount = Number(parsed.amount);

      if (isNaN(amount) || amount <= 0) {
        console.warn(
          `[Telegram Bot Vision] Model ${model} returned invalid amount:`,
          parsed.amount
        );
        continue;
      }

      const items: ParsedTelegramReceiptItem[] = Array.isArray(parsed.items)
        ? parsed.items.map((it: any) => ({
            name: String(it.name || "Товар").trim(),
            price: Number(it.price) || 0,
            quantity: Number(it.quantity) || 1,
            suggested_category: normalizeCategory(it.suggested_category),
          }))
        : [];

      return {
        amount,
        currency: parsed.currency || "UAH",
        merchant: String(parsed.merchant || "Чек").trim(),
        date: normalizeKyivReceiptDate(parsed.date, referenceDate),
        type: ["expense", "income", "investment"].includes(parsed.type)
          ? parsed.type
          : "expense",
        suggested_category: normalizeCategory(parsed.suggested_category),
        items: items.length > 0 ? items : undefined,
        hasMultipleCategories: Boolean(parsed.hasMultipleCategories),
        bankName: parsed.bankName ? String(parsed.bankName).trim() : undefined,
        purpose: parsed.purpose ? String(parsed.purpose).trim() : undefined,
      };
    } catch (err: any) {
      console.warn(
        `[Telegram Bot Vision] Model ${model} failed for multimodal receipt:`,
        err?.message || err
      );
      // Продовжуємо до наступної резервної моделі
    }
  }

  return null;
}
