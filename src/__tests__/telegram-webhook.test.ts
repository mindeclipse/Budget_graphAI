import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  normalizeCategory,
  cleanJsonOutput,
  buildCategoryKeyboard,
  formatTransactionConfirmation,
  handleTelegramCallbackQuery,
  applyMerchantRules,
  parseNaturalLanguageExpense,
  parseMultimodalReceipt,
  CATEGORY_EMOJIS,
  validateTelegramWebhookSecret,
  isPaceInquiry,
  parseWhatIfPurchaseQuery,
  formatPaceResponse,
  formatWhatIfResponse,
} from "@/lib/telegram-bot";
import { CATEGORIES } from "@/constants/categories";

// Mock @/lib/telegram
vi.mock("@/lib/telegram", () => ({
  sendTelegramMessage: vi.fn().mockResolvedValue(true),
  editTelegramMessageText: vi.fn().mockResolvedValue(true),
  answerTelegramCallbackQuery: vi.fn().mockResolvedValue(true),
  getTelegramFile: vi.fn().mockResolvedValue({
    buffer: Buffer.from("fake-file-data"),
    filePath: "photos/file_1.jpg",
    fileName: "file_1.jpg",
  }),
  escapeHtml: (str: string) =>
    str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;"),
}));

// Mock @/lib/gemini
const mockGenerateContent = vi.fn();
vi.mock("@/lib/gemini", () => ({
  getGeminiClient: () => ({
    models: {
      generateContent: mockGenerateContent,
    },
  }),
  GEMINI_FALLBACK_CHAIN: [
    "gemini-3.5-flash",
    "gemini-3.7-flash",
    "gemini-3.5-flash-lite",
  ],
}));

// Mock classify-formatter
vi.mock("@/lib/classify-formatter", () => ({
  computeSafeDailyBudget: vi.fn().mockResolvedValue({
    todayRemaining: 1200,
    todayTarget: 1500,
    todaySpent: 300,
    cycleRemaining: 15000,
    daysRemaining: 15,
  }),
}));

describe("Telegram Bot Utilities & Logic", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("normalizeCategory", () => {
    it("нормалізує точну назву категорії", () => {
      expect(normalizeCategory("Продукти")).toBe("Продукти");
      expect(normalizeCategory("кафе та ресторани")).toBe("Кафе та ресторани");
      expect(normalizeCategory("ТРАНСПОРТ")).toBe("Транспорт");
    });

    it("повертає 'Інше' для невідомих або порожніх категорій", () => {
      expect(normalizeCategory("Невідомо")).toBe("Інше");
      expect(normalizeCategory("")).toBe("Інше");
      expect(normalizeCategory(undefined)).toBe("Інше");
    });
  });

  describe("cleanJsonOutput", () => {
    it("видаляє блоки ```json та ``` із сирої відповіді AI", () => {
      const raw = '```json\n{"amount": 250, "merchant": "Сільпо"}\n```';
      const cleaned = cleanJsonOutput(raw);
      expect(cleaned).toBe('{"amount": 250, "merchant": "Сільпо"}');
    });

    it("працює зі звичайним текстом без markdown", () => {
      const raw = '  {"amount": 100}  ';
      expect(cleanJsonOutput(raw)).toBe('{"amount": 100}');
    });
  });

  describe("buildCategoryKeyboard", () => {
    it("будує 2-колонкову клавіатуру з усіма 15 категоріями", () => {
      const keyboard = buildCategoryKeyboard(42, "Продукти");
      expect(keyboard.inline_keyboard).toBeDefined();

      // Має містити рядки з категоріями + 1 рядок з кнопкою "Назад"
      const totalRows = keyboard.inline_keyboard!.length;
      expect(totalRows).toBeGreaterThanOrEqual(8);

      // Перевіряємо наявність кнопки з позначкою поточної категорії
      const flattened = keyboard.inline_keyboard!.flat();
      const currentCatButton = flattened.find((b) => b.text.startsWith("✓"));
      expect(currentCatButton).toBeDefined();
      expect(currentCatButton?.text).toContain("Продукти");

      // Кнопка Назад
      const backButton = flattened.find(
        (b) => b.callback_data === "tg_back:42"
      );
      expect(backButton).toBeDefined();
      expect(backButton?.text).toContain("Назад");
    });
  });

  describe("formatTransactionConfirmation", () => {
    it("форматує текст та кнопки для звичайної витрати", () => {
      const result = formatTransactionConfirmation({
        transaction: {
          id: 101,
          merchant_raw: "АТБ-Маркет",
          amount: 350.5,
          category_name: "Продукти",
          created_at: "2026-09-14T14:30:00.000Z",
        },
        dailyBudget: {
          todayRemaining: 850,
          todayTarget: 1200,
          todaySpent: 350,
          cycleRemaining: 10000,
          daysRemaining: 12,
        },
      });

      expect(result.text).toContain("Витрату записано!");
      expect(result.text).toContain("АТБ-Маркет");
      expect(result.text).toMatch(/350[.,]50 ₴/);
      expect(result.text).toContain("Продукти");
      expect(result.text).toContain("850 ₴");

      // Має кнопки Змінити категорію та Скасувати
      const buttons = result.replyMarkup.inline_keyboard!.flat();
      expect(buttons.some((b) => b.callback_data === "tg_cat:101")).toBe(true);
      expect(buttons.some((b) => b.callback_data === "tg_cancel:101")).toBe(
        true
      );
      // Без кнопки спліту, бо itemsCount = 0
      expect(
        buttons.some((b) => b.callback_data?.startsWith("tg_split:"))
      ).toBe(false);
    });

    it("додає кнопку розбиття чеку 'Split', якщо itemsCount > 1", () => {
      const result = formatTransactionConfirmation({
        transaction: {
          id: 102,
          merchant_raw: "Сільпо",
          amount: 600,
          category_name: "Продукти",
          created_at: "2026-09-14T15:00:00.000Z",
          type: "expense",
        },
        itemsCount: 3,
      });

      const buttons = result.replyMarkup.inline_keyboard!.flat();
      const splitBtn = buttons.find((b) => b.callback_data === "tg_split:102");
      expect(splitBtn).toBeDefined();
      expect(splitBtn?.text).toBe("✂️ Split (3)");
    });

    it("форматує надходження доходів з міткою 'Дохід зараховано' та плюсом до суми", () => {
      const result = formatTransactionConfirmation({
        transaction: {
          id: 103,
          merchant_raw: "Зарплата",
          amount: 45000,
          category_name: "Зарплата/ФОП",
          created_at: "2026-09-14T15:00:00.000Z",
          type: "income",
        },
      });

      expect(result.text).toContain("Дохід зараховано!");
      expect(result.text).toContain("Зарплата");
      expect(result.text).toMatch(/\+45\s?000[.,]00 ₴/);
      expect(result.text).toContain("Зарплата/ФОП");
      // Для доходів не показуємо денний ліміт споживчих витрат
      expect(result.text).not.toContain("На день залишилось");
    });
  });

  describe("handleTelegramCallbackQuery", () => {
    it("обробляє tg_cat:<txId> і показує вибір категорій", async () => {
      const mockSupabase = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          is: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({
            data: {
              id: 10,
              merchant_raw: "Сільпо",
              amount: 200,
              category_name: "Продукти",
            },
            error: null,
          }),
        }),
      };

      const { editTelegramMessageText, answerTelegramCallbackQuery } =
        await import("@/lib/telegram");

      const success = await handleTelegramCallbackQuery(
        {
          id: "query_123",
          data: "tg_cat:10",
          message: { chat: { id: 999 }, message_id: 888 },
        },
        mockSupabase
      );

      expect(success).toBe(true);
      expect(editTelegramMessageText).toHaveBeenCalledWith(
        999,
        888,
        expect.stringContaining("Оберіть категорію"),
        expect.any(Object)
      );
      expect(answerTelegramCallbackQuery).toHaveBeenCalledWith("query_123");
    });

    it("обробляє tg_setcat:<txId>:<idx> та оновлює категорію в БД", async () => {
      const updateMock = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({
          data: {
            id: 10,
            merchant_raw: "Uklon",
            amount: 220,
            category_name: "Транспорт",
            created_at: "2026-09-14T10:00:00Z",
          },
          error: null,
        }),
      });

      const mockSupabase = {
        from: vi.fn().mockReturnValue({
          update: updateMock,
        }),
      };

      const { editTelegramMessageText, answerTelegramCallbackQuery } =
        await import("@/lib/telegram");

      // Індекс 3 у CATEGORIES = "Транспорт"
      const catIndex = CATEGORIES.indexOf("Транспорт");
      const success = await handleTelegramCallbackQuery(
        {
          id: "query_124",
          data: `tg_setcat:10:${catIndex}`,
          message: { chat: { id: 999 }, message_id: 888 },
        },
        mockSupabase
      );

      expect(success).toBe(true);
      expect(updateMock).toHaveBeenCalledWith({ category_name: "Транспорт" });
      expect(editTelegramMessageText).toHaveBeenCalledWith(
        999,
        888,
        expect.stringContaining("Категорію успішно змінено"),
        expect.any(Object)
      );
      expect(answerTelegramCallbackQuery).toHaveBeenCalledWith(
        "query_124",
        "Категорію змінено: Транспорт"
      );
    });

    it("обробляє tg_cancel:<txId> і здійснює м'яке видалення", async () => {
      const updateMock = vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      });

      const mockSupabase = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          is: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({
            data: {
              id: 15,
              merchant_raw: "Кафе",
              amount: 150,
              category_name: "Кафе та ресторани",
            },
            error: null,
          }),
          update: updateMock,
        }),
      };

      const { editTelegramMessageText, answerTelegramCallbackQuery } =
        await import("@/lib/telegram");

      const success = await handleTelegramCallbackQuery(
        {
          id: "query_125",
          data: "tg_cancel:15",
          message: { chat: { id: 999 }, message_id: 888 },
        },
        mockSupabase
      );

      expect(success).toBe(true);
      expect(updateMock).toHaveBeenCalledWith(
        expect.objectContaining({ deleted_at: expect.any(String) })
      );
      expect(editTelegramMessageText).toHaveBeenCalledWith(
        999,
        888,
        expect.stringContaining("Транзакцію скасовано!"),
        { inline_keyboard: [] }
      );
      expect(answerTelegramCallbackQuery).toHaveBeenCalledWith(
        "query_125",
        "Транзакцію скасовано"
      );
    });

    it("обробляє tg_refresh_pace і надсилає оновлений темп", async () => {
      const mockSupabase = {
        from: vi.fn().mockImplementation((table: string) => {
          if (table === "budget_cycles") {
            return {
              select: vi.fn().mockReturnThis(),
              order: vi.fn().mockReturnThis(),
              limit: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({
                data: {
                  id: "cycle-1",
                  monthly_limit: 30000,
                  start_date: "2026-09-01T00:00:00Z",
                  end_date: "2026-09-30T23:59:59Z",
                },
              }),
            };
          }
          if (table === "transactions") {
            return {
              select: vi.fn().mockReturnThis(),
              is: vi.fn().mockReturnThis(),
              gte: vi.fn().mockReturnThis(),
              lte: vi.fn().mockResolvedValue({
                data: [],
              }),
            };
          }
          if (table === "recurring_templates") {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockResolvedValue({
                data: [],
              }),
            };
          }
          return {
            select: vi.fn().mockReturnThis(),
          };
        }),
      };

      const { editTelegramMessageText, answerTelegramCallbackQuery } =
        await import("@/lib/telegram");

      const success = await handleTelegramCallbackQuery(
        {
          id: "query_pace_1",
          data: "tg_refresh_pace",
          message: { chat: { id: 999 }, message_id: 888 },
        },
        mockSupabase
      );

      expect(success).toBe(true);
      expect(editTelegramMessageText).toHaveBeenCalledWith(
        999,
        888,
        expect.stringContaining("Безпечно на день"),
        expect.any(Object)
      );
      expect(answerTelegramCallbackQuery).toHaveBeenCalledWith(
        "query_pace_1",
        "Темп оновлено!"
      );
    });
  });

  describe("parseNaturalLanguageExpense with Gemini Fallback", () => {
    it("коректно парсить природний текст 'таксі 240'", async () => {
      mockGenerateContent.mockResolvedValueOnce({
        text: JSON.stringify({
          amount: 240,
          merchant: "Таксі",
          category: "Транспорт",
          type: "expense",
        }),
      });

      const result = await parseNaturalLanguageExpense("таксі 240");
      expect(result).toBeDefined();
      expect(result?.amount).toBe(240);
      expect(result?.merchant).toBe("Таксі");
      expect(result?.category).toBe("Транспорт");
      expect(result?.type).toBe("expense");
    });

    it("використовує fallback модель gemini-3.7-flash, якщо первинна впала з помилкою", async () => {
      // Перша модель падає (429 Rate Limit)
      mockGenerateContent.mockRejectedValueOnce(
        new Error("Resource exhausted 429")
      );
      // Резервна модель відповідає успішно
      mockGenerateContent.mockResolvedValueOnce({
        text: JSON.stringify({
          amount: 480,
          merchant: "Аптека Подорожник",
          category: "Здоров'я",
          type: "expense",
          note: "вітаміни",
        }),
      });

      const result = await parseNaturalLanguageExpense(
        "вчора аптека 480 вітаміни"
      );
      expect(result).toBeDefined();
      expect(result?.amount).toBe(480);
      expect(result?.merchant).toBe("Аптека Подорожник");
      expect(result?.category).toBe("Здоров'я");
      expect(result?.note).toBe("вітаміни");
      expect(mockGenerateContent).toHaveBeenCalledTimes(2);
    });
  });

  describe("parseMultimodalReceipt", () => {
    it("парсить структуру чека з кількома позиціями через мультимодальний Gemini", async () => {
      mockGenerateContent.mockResolvedValueOnce({
        text: JSON.stringify({
          amount: 540.25,
          currency: "UAH",
          merchant: "Сільпо",
          type: "expense",
          suggested_category: "Продукти",
          hasMultipleCategories: true,
          items: [
            {
              name: "Сир Моцарела",
              price: 120.5,
              quantity: 1,
              suggested_category: "Продукти",
            },
            {
              name: "Вино сухе",
              price: 300,
              quantity: 1,
              suggested_category: "Продукти",
            },
            {
              name: "Стіки Heets",
              price: 119.75,
              quantity: 1,
              suggested_category: "Куріння",
            },
          ],
        }),
      });

      const fakeBuffer = Buffer.from("fake-image-bytes");
      const receipt = await parseMultimodalReceipt(fakeBuffer, "image/jpeg");

      expect(receipt).toBeDefined();
      expect(receipt?.amount).toBe(540.25);
      expect(receipt?.merchant).toBe("Сільпо");
      expect(receipt?.suggested_category).toBe("Продукти");
      expect(receipt?.hasMultipleCategories).toBe(true);
      expect(receipt?.items).toHaveLength(3);
      expect(receipt?.items?.[2].suggested_category).toBe("Куріння");
    });
  });

  describe("applyMerchantRules", () => {
    it("застосовує збережене правило з таблиці merchant_rules", async () => {
      const mockSupabase = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockResolvedValue({
            data: [
              {
                pattern: "сільпо",
                clean_merchant: "Сільпо",
                category_name: "Продукти",
              },
              {
                pattern: "uklon",
                clean_merchant: "Таксі Uklon",
                category_name: "Транспорт",
              },
            ],
          }),
        }),
      };

      const res = await applyMerchantRules("ТОВ Сільпо Фуд", mockSupabase);
      expect(res.merchant).toBe("Сільпо");
      expect(res.category).toBe("Продукти");
    });
  });

  describe("validateTelegramWebhookSecret", () => {
    it("пропускає запит, якщо секрет не налаштовано в оточенні", () => {
      expect(validateTelegramWebhookSecret("any-header", undefined)).toBe(true);
      expect(validateTelegramWebhookSecret(null, undefined)).toBe(true);
    });

    it("валідує точний збіг секрету через timingSafeEqual", () => {
      const secret = "correct-secret-123456";
      expect(
        validateTelegramWebhookSecret("correct-secret-123456", secret)
      ).toBe(true);
      expect(validateTelegramWebhookSecret("wrong-secret", secret)).toBe(false);
      expect(validateTelegramWebhookSecret(null, secret)).toBe(false);
    });
  });

  describe("isPaceInquiry", () => {
    it("розпізнає команди /pace, /today, /budget", () => {
      expect(isPaceInquiry("/pace")).toBe(true);
      expect(isPaceInquiry("/today")).toBe(true);
      expect(isPaceInquiry("/budget")).toBe(true);
    });

    it("розпізнає запити природною мовою про темп і ліміти", () => {
      expect(isPaceInquiry("темп")).toBe(true);
      expect(isPaceInquiry("який темп?")).toBe(true);
      expect(isPaceInquiry("який мій темп")).toBe(true);
      expect(isPaceInquiry("скільки можу витратити сьогодні?")).toBe(true);
      expect(isPaceInquiry("скільки на день?")).toBe(true);
      expect(isPaceInquiry("ліміт на вихідні?")).toBe(true);
      expect(isPaceInquiry("який залишок?")).toBe(true);
    });

    it("не реагує на звичайні витрати або інші команди", () => {
      expect(isPaceInquiry("таксі 240")).toBe(false);
      expect(isPaceInquiry("Сільпо 1200 продукти")).toBe(false);
      expect(isPaceInquiry("/start")).toBe(false);
    });
  });

  describe("parseWhatIfPurchaseQuery", () => {
    it("розпізнає патерн 'чи можу купити [річ] за [сума]'", () => {
      const q = parseWhatIfPurchaseQuery("чи можу я купити кросівки за 3200?");
      expect(q).not.toBeNull();
      expect(q?.amount).toBe(3200);
      expect(q?.item).toBe("кросівки");
    });

    it("розпізнає патерн 'можу витратити [сума]?'", () => {
      const q = parseWhatIfPurchaseQuery("чи можу витратити 1500 грн?");
      expect(q).not.toBeNull();
      expect(q?.amount).toBe(1500);
      expect(q?.item).toBe("покупка");
    });

    it("розпізнає патерн 'хочу купити [річ] [сума]'", () => {
      const q = parseWhatIfPurchaseQuery("хочу купити навушники 4500 грн");
      expect(q).not.toBeNull();
      expect(q?.amount).toBe(4500);
      expect(q?.item).toBe("навушники");
    });

    it("не спрацьовує на звичайні записи витрат", () => {
      expect(parseWhatIfPurchaseQuery("таксі 240")).toBeNull();
      expect(parseWhatIfPurchaseQuery("кава 85")).toBeNull();
      expect(parseWhatIfPurchaseQuery("Сільпо 500")).toBeNull();
    });
  });

  describe("formatWhatIfResponse", () => {
    it("форматує результат симуляції у читабельний вигляд із відсотками та порадою", () => {
      const sim = {
        purchaseAmount: 3000,
        itemDescription: "навушники",
        currentDiscretionary: 15000,
        newDiscretionary: 12000,
        currentSafeWeekday: 800,
        newSafeWeekday: 640,
        currentSafeWeekend: 1200,
        newSafeWeekend: 960,
        weekdayDropPercent: 20,
        weekendDropPercent: 20,
        verdict: "caution" as const,
        verdictTitle: "⚡️ Потрібна дисципліна",
        adviceHtml: "Після покупки ліміт знизиться на 20%.",
      };

      const text = formatWhatIfResponse(sim);
      expect(text).toContain("⚡️ Потрібна дисципліна");
      expect(text).toContain("Будні: 800 ₴ ➔ <b>640 ₴/день</b> (-20%)");
      expect(text).toMatch(/12[\s\u00A0]000 ₴/);
    });
  });
});
