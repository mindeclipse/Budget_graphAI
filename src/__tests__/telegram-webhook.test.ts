import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
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
  isCycleSummaryInquiry,
  isEmergencyFundInquiry,
  isWhatIfGuideInquiry,
  parseWhatIfPurchaseQuery,
  formatPaceResponse,
  formatWhatIfResponse,
  tryFastNaturalLanguageParse,
  formatKyivDate,
  renderProgressBar,
  handleTelegramCycleSummaryCommand,
  handleTelegramEmergencyFundCommand,
  handleTelegramWhatIfGuideCommand,
  isChartInquiry,
  handleTelegramChartCommand,
} from "@/lib/telegram-bot";
import { getPersistentReplyKeyboard, sendTelegramPhoto } from "@/lib/telegram";
import { generateBudgetDashboardImage } from "@/lib/dashboard-image";
import { CATEGORIES } from "@/constants/categories";

// Mock @/lib/telegram
vi.mock("@/lib/telegram", () => ({
  sendTelegramMessage: vi.fn().mockResolvedValue(true),
  sendTelegramPhoto: vi.fn().mockResolvedValue(true),
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
  getPersistentReplyKeyboard: () => ({
    keyboard: [
      [{ text: "🎯 Мій темп" }, { text: "📊 Залишок циклу" }],
      [{ text: "🛡️ Подушка" }, { text: "💡 Що якщо...?" }],
    ],
    resize_keyboard: true,
    is_persistent: true,
  }),
}));

// Mock @/lib/supabase-admin
vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdmin: () => ({
    from: vi.fn((table: string) => {
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
      if (table === "savings_goals") {
        return {
          select: vi.fn().mockReturnThis(),
          order: vi.fn().mockResolvedValue({
            data: [
              {
                id: 1,
                name: "Фінансова подушка",
                current_amount: 1500,
                target_amount: 50000,
                currency: "UAH",
              },
            ],
          }),
        };
      }
      if (table === "transactions") {
        return {
          select: vi.fn().mockReturnThis(),
          is: vi.fn().mockReturnThis(),
          gte: vi.fn().mockReturnThis(),
          lte: vi.fn().mockResolvedValue({ data: [] }),
          eq: vi.fn().mockReturnThis(),
          or: vi.fn().mockReturnThis(),
          insert: vi.fn().mockResolvedValue({ data: [], error: null }),
        };
      }
      if (table === "recurring_templates") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({ data: [] }),
        };
      }
      if (table === "merchant_rules") {
        return {
          select: vi.fn().mockResolvedValue({ data: [] }),
        };
      }
      return {
        select: vi.fn().mockReturnThis(),
        insert: vi.fn().mockResolvedValue({ data: [], error: null }),
        update: vi.fn().mockReturnThis(),
        delete: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        is: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        gte: vi.fn().mockReturnThis(),
        lte: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: null }),
      };
    }),
  }),
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

    it("обробляє tg_cycle_summary і надсилає оновлений залишок циклу", async () => {
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
          id: "query_cycle_1",
          data: "tg_cycle_summary",
          message: { chat: { id: 999 }, message_id: 888 },
        },
        mockSupabase
      );

      expect(success).toBe(true);
      expect(editTelegramMessageText).toHaveBeenCalledWith(
        999,
        888,
        expect.stringContaining("Підсумок бюджетного циклу"),
        expect.any(Object)
      );
      expect(answerTelegramCallbackQuery).toHaveBeenCalledWith(
        "query_cycle_1",
        "Залишок циклу оновлено!"
      );
    });

    it("обробляє tg_cushion_summary і надсилає оновлені дані подушки", async () => {
      const mockSupabase = {
        from: vi.fn().mockImplementation((table: string) => {
          if (table === "savings_goals") {
            return {
              select: vi.fn().mockReturnThis(),
              order: vi.fn().mockResolvedValue({
                data: [
                  {
                    id: 1,
                    name: "Фінансова подушка",
                    current_amount: 1200,
                    target_amount: 20000,
                    currency: "UAH",
                  },
                ],
              }),
            };
          }
          if (table === "transactions") {
            return {
              select: vi.fn().mockReturnThis(),
              or: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              is: vi.fn().mockResolvedValue({
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
          id: "query_cushion_1",
          data: "tg_cushion_summary",
          message: { chat: { id: 999 }, message_id: 888 },
        },
        mockSupabase
      );

      expect(success).toBe(true);
      expect(editTelegramMessageText).toHaveBeenCalledWith(
        999,
        888,
        expect.stringContaining("Фінансова подушка безпеки"),
        expect.any(Object)
      );
      expect(answerTelegramCallbackQuery).toHaveBeenCalledWith(
        "query_cushion_1",
        "Подушку оновлено!"
      );
    });

    it("обробляє tg_send_chart і генерує та надсилає фото картки дашборду", async () => {
      const mockSupabase = {
        from: vi.fn((table: string) => {
          if (table === "budget_cycles") {
            return {
              select: vi.fn().mockReturnThis(),
              order: vi.fn().mockReturnThis(),
              limit: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({
                data: {
                  monthly_limit: 30000,
                  start_date: "2026-09-01T00:00:00.000Z",
                  end_date: "2026-09-30T23:59:59.999Z",
                },
              }),
            };
          }
          if (table === "transactions") {
            return {
              select: vi.fn().mockReturnThis(),
              is: vi.fn().mockReturnThis(),
              gte: vi.fn().mockReturnThis(),
              lte: vi.fn().mockReturnThis(),
              or: vi.fn().mockReturnThis(),
              order: vi.fn().mockReturnThis(),
              limit: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({ data: null }),
              csv: vi.fn().mockResolvedValue(""),
              then: (resolve: any) => resolve({ data: [] }),
            };
          }
          if (table === "savings_goals") {
            return {
              select: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({
                  data: [
                    {
                      id: 1,
                      name: "Фінансова подушка",
                      current_amount: 5000,
                    },
                  ],
                }),
              }),
            };
          }
          if (table === "recurring_templates") {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({ data: [] }),
              }),
            };
          }
          return {
            select: vi.fn().mockReturnThis(),
          };
        }),
      };

      const { answerTelegramCallbackQuery, sendTelegramPhoto } =
        await import("@/lib/telegram");

      const success = await handleTelegramCallbackQuery(
        {
          id: "query_chart_1",
          data: "tg_send_chart",
          message: { chat: { id: 999 }, message_id: 888 },
        },
        mockSupabase
      );

      expect(success).toBe(true);
      expect(answerTelegramCallbackQuery).toHaveBeenCalledWith(
        "query_chart_1",
        "Генерую графік..."
      );
      expect(sendTelegramPhoto).toHaveBeenCalledWith(
        expect.any(Buffer),
        expect.stringContaining("Графічний дашборд"),
        expect.any(Object)
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
          category: "Здоров'я та догляд",
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
      expect(result?.category).toBe("Здоров'я та догляд");
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

  describe("getPersistentReplyKeyboard", () => {
    it("повертає структуру персистентної клавіатури з 4 швидкими діями", () => {
      const kb = getPersistentReplyKeyboard();
      expect(kb.resize_keyboard).toBe(true);
      expect(kb.is_persistent).toBe(true);
      expect(kb.keyboard).toBeDefined();
      expect(kb.keyboard?.length).toBe(2);
      expect(kb.keyboard?.[0]).toEqual([
        { text: "🎯 Мій темп" },
        { text: "📊 Залишок циклу" },
      ]);
      expect(kb.keyboard?.[1]).toEqual([
        { text: "🛡️ Подушка" },
        { text: "💡 Що якщо...?" },
      ]);
    });
  });

  describe("renderProgressBar", () => {
    it("коректно генерує заповнені та порожні блоки", () => {
      expect(renderProgressBar(0, 10)).toBe("░░░░░░░░░░");
      expect(renderProgressBar(50, 10)).toBe("█████░░░░░");
      expect(renderProgressBar(100, 10)).toBe("██████████");
      expect(renderProgressBar(70, 10)).toBe("███████░░░");
    });

    it("обмежує значення від 0 до 100", () => {
      expect(renderProgressBar(-20, 10)).toBe("░░░░░░░░░░");
      expect(renderProgressBar(150, 10)).toBe("██████████");
    });
  });

  describe("formatKyivDate", () => {
    it("форматує дату за київським часом у форматі DD.MM.YYYY", () => {
      const formatted = formatKyivDate("2026-09-17T12:00:00.000Z");
      expect(formatted).toMatch(/17\.09\.2026/);
    });

    it("повертає вихідний рядок у разі некоректної дати", () => {
      expect(formatKyivDate("invalid-date")).toBe("invalid-date");
    });
  });

  describe("isPaceInquiry", () => {
    it("розпізнає команди /pace, /today, /budget", () => {
      expect(isPaceInquiry("/pace")).toBe(true);
      expect(isPaceInquiry("/today")).toBe(true);
      expect(isPaceInquiry("/budget")).toBe(true);
    });

    it("розпізнає кнопку '🎯 Мій темп' та запити природною мовою", () => {
      expect(isPaceInquiry("🎯 Мій темп")).toBe(true);
      expect(isPaceInquiry("мій темп")).toBe(true);
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

  describe("isCycleSummaryInquiry", () => {
    it("розпізнає кнопку '📊 Залишок циклу', /cycle та запити про баланс циклу", () => {
      expect(isCycleSummaryInquiry("📊 Залишок циклу")).toBe(true);
      expect(isCycleSummaryInquiry("залишок циклу")).toBe(true);
      expect(isCycleSummaryInquiry("/cycle")).toBe(true);
      expect(isCycleSummaryInquiry("підсумок циклу")).toBe(true);
      expect(isCycleSummaryInquiry("баланс циклу?")).toBe(true);
      expect(isCycleSummaryInquiry("стан циклу")).toBe(true);
      expect(isCycleSummaryInquiry("скільки залишилось до кінця місяця?")).toBe(
        true
      );
    });

    it("не спрацьовує на звичайні витрати або команди темпу", () => {
      expect(isCycleSummaryInquiry("таксі 240")).toBe(false);
      expect(isCycleSummaryInquiry("🎯 Мій темп")).toBe(false);
      expect(isCycleSummaryInquiry("/pace")).toBe(false);
    });
  });

  describe("isChartInquiry", () => {
    it("розпізнає команди /chart, /graph, /dashboard, /stats", () => {
      expect(isChartInquiry("/chart")).toBe(true);
      expect(isChartInquiry("/graph")).toBe(true);
      expect(isChartInquiry("/dashboard")).toBe(true);
      expect(isChartInquiry("/stats")).toBe(true);
    });

    it("розпізнає кнопку '📈 Графік' та запити природною мовою", () => {
      expect(isChartInquiry("📈 Графік")).toBe(true);
      expect(isChartInquiry("графік")).toBe(true);
      expect(isChartInquiry("графіки")).toBe(true);
      expect(isChartInquiry("дашборд")).toBe(true);
      expect(isChartInquiry("покажи графік?")).toBe(true);
      expect(isChartInquiry("інфографіка")).toBe(true);
      expect(isChartInquiry("діаграма")).toBe(true);
    });

    it("НЕ спрацьовує на звичайні витрати або інші запити", () => {
      expect(isChartInquiry("графічний планшет 3000")).toBe(false);
      expect(isChartInquiry("кава 85")).toBe(false);
      expect(isChartInquiry("🎯 Мій темп")).toBe(false);
    });
  });

  describe("isEmergencyFundInquiry", () => {
    it("розпізнає кнопку '🛡️ Подушка', /cushion та запити про подушку/скарбничку", () => {
      expect(isEmergencyFundInquiry("🛡️ Подушка")).toBe(true);
      expect(isEmergencyFundInquiry("подушка")).toBe(true);
      expect(isEmergencyFundInquiry("подушка?")).toBe(true);
      expect(isEmergencyFundInquiry("/cushion")).toBe(true);
      expect(isEmergencyFundInquiry("фінансова подушка")).toBe(true);
      expect(isEmergencyFundInquiry("скарбничка")).toBe(true);
      expect(isEmergencyFundInquiry("скільки в подушці?")).toBe(true);
    });

    it("НЕ спрацьовує на звичайні покупки предметів зі словом подушка (наприклад 'подушка 500')", () => {
      expect(isEmergencyFundInquiry("подушка 500")).toBe(false);
      expect(isEmergencyFundInquiry("купив подушку 800")).toBe(false);
      expect(isEmergencyFundInquiry("кава 85")).toBe(false);
    });
  });

  describe("isWhatIfGuideInquiry", () => {
    it("розпізнає кнопку '💡 Що якщо...?', /whatif та загальні запити про симулятор", () => {
      expect(isWhatIfGuideInquiry("💡 Що якщо...?")).toBe(true);
      expect(isWhatIfGuideInquiry("що якщо")).toBe(true);
      expect(isWhatIfGuideInquiry("що якщо?")).toBe(true);
      expect(isWhatIfGuideInquiry("/whatif")).toBe(true);
      expect(isWhatIfGuideInquiry("симулятор")).toBe(true);
      expect(isWhatIfGuideInquiry("симулятор покупок")).toBe(true);
    });

    it("НЕ перехоплює конкретні симуляції покупок з сумами (чи можу купити ...)", () => {
      expect(isWhatIfGuideInquiry("чи можу купити кросівки за 3200?")).toBe(
        false
      );
      expect(isWhatIfGuideInquiry("хочу купити навушники 2500 грн")).toBe(
        false
      );
    });
  });

  describe("handleTelegramWhatIfGuideCommand", () => {
    it("повертає зрозумілу інструкцію з прикладами використання симулятора", () => {
      const guide = handleTelegramWhatIfGuideCommand();
      expect(guide).toContain("Симулятор покупок (What-If аналіз)");
      expect(guide).toContain("чи можу купити кросівки за 3200?");
      expect(guide).toContain("Вердикт");
    });
  });

  describe("handleTelegramEmergencyFundCommand", () => {
    it("формує детальний звіт про баланс подушки, ціль та автоокруглення", async () => {
      const mockSupabase = {
        from: vi.fn((table: string) => {
          if (table === "savings_goals") {
            return {
              select: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({
                  data: [
                    {
                      id: 1,
                      name: "Фінансова подушка",
                      current_amount: 1500,
                      target_amount: 50000,
                      currency: "UAH",
                    },
                    {
                      id: 2,
                      name: "Готівка USD",
                      current_amount: 2000,
                      target_amount: null,
                      currency: "USD",
                    },
                  ],
                }),
              }),
            };
          }
          if (table === "transactions") {
            return {
              select: vi.fn().mockReturnValue({
                or: vi.fn().mockReturnValue({
                  is: vi.fn().mockResolvedValue({
                    data: [
                      {
                        amount: 5.4,
                        created_at: new Date().toISOString(),
                        merchant_raw:
                          "Решта від округлення витрат на Фінансова подушка",
                        category_name: "Внутрішні перекази / Подушка",
                      },
                      {
                        amount: 8.0,
                        created_at: new Date().toISOString(),
                        merchant_raw:
                          "Решта від округлення витрат на Фінансова подушка",
                        category_name: "Внутрішні перекази / Подушка",
                      },
                    ],
                  }),
                }),
              }),
            };
          }
          return { select: vi.fn().mockResolvedValue({ data: [] }) };
        }),
      };

      const reply = await handleTelegramEmergencyFundCommand(mockSupabase);
      expect(reply).toContain("Фінансова подушка безпеки");
      expect(reply).toMatch(/1[\s\u00A0]500 ₴/);
      expect(reply).toMatch(/50[\s\u00A0]000 ₴/);
      expect(reply).toContain("Готівка USD");
      expect(reply).toMatch(/2[\s\u00A0]000 \$/);
    });
  });

  describe("handleTelegramCycleSummaryCommand", () => {
    it("формує зведений підсумок циклу з прогрес-баром та лімітами", async () => {
      const mockSupabase = {
        from: vi.fn((table: string) => {
          if (table === "budget_cycles") {
            return {
              select: vi.fn().mockReturnValue({
                order: vi.fn().mockReturnValue({
                  limit: vi.fn().mockReturnValue({
                    maybeSingle: vi.fn().mockResolvedValue({
                      data: {
                        id: 1,
                        monthly_limit: 30000,
                        start_date: "2026-09-01T00:00:00.000Z",
                        end_date: "2026-09-30T23:59:59.999Z",
                      },
                    }),
                  }),
                }),
              }),
            };
          }
          if (table === "transactions") {
            return {
              select: vi.fn().mockReturnValue({
                is: vi.fn().mockReturnValue({
                  gte: vi.fn().mockReturnValue({
                    lte: vi.fn().mockResolvedValue({
                      data: [
                        {
                          id: 1,
                          amount: 500,
                          type: "expense",
                          category_name: "Продукти",
                          exclude_from_budget: false,
                        },
                      ],
                    }),
                  }),
                }),
              }),
            };
          }
          if (table === "recurring_templates") {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({
                  data: [{ id: 1, name: "Netflix", amount: 400 }],
                }),
              }),
            };
          }
          return { select: vi.fn().mockResolvedValue({ data: [] }) };
        }),
      };

      const now = new Date("2026-09-15T12:00:00.000Z");
      const summary = await handleTelegramCycleSummaryCommand(
        mockSupabase,
        now
      );
      expect(summary).toContain("Підсумок бюджетного циклу");
      expect(summary).toContain("Загальний ліміт:");
      expect(summary).toMatch(/30[\s\u00A0]000 ₴/);
      expect(summary).toContain("Витрачено:");
      expect(summary).toContain("Вільний залишок:");
      expect(summary).toContain("Зарезервовано під підписки:");
    });
  });

  describe("handleTelegramChartCommand", () => {
    it("генерує валідне PNG зображення та метадані з підписом", async () => {
      const mockSupabase = {
        from: vi.fn((table: string) => {
          if (table === "budget_cycles") {
            return {
              select: vi.fn().mockReturnThis(),
              order: vi.fn().mockReturnThis(),
              limit: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({
                data: {
                  monthly_limit: 30000,
                  start_date: "2026-09-01T00:00:00.000Z",
                  end_date: "2026-09-30T23:59:59.999Z",
                },
              }),
            };
          }
          if (table === "transactions") {
            return {
              select: vi.fn().mockReturnThis(),
              is: vi.fn().mockReturnThis(),
              gte: vi.fn().mockReturnThis(),
              lte: vi.fn().mockReturnThis(),
              or: vi.fn().mockReturnThis(),
              order: vi.fn().mockReturnThis(),
              limit: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({ data: null }),
              csv: vi.fn().mockResolvedValue(""),
              then: (resolve: any) =>
                resolve({
                  data: [
                    {
                      id: 1,
                      amount: 15000,
                      currency: "UAH",
                      merchant_raw: "Сільпо",
                      category_name: "Продукти",
                      source: "manual",
                      type: "expense",
                      created_at: "2026-09-10T12:00:00.000Z",
                      exclude_from_budget: false,
                    },
                  ],
                }),
            };
          }
          if (table === "savings_goals") {
            return {
              select: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({
                  data: [
                    {
                      id: 1,
                      name: "Фінансова подушка",
                      current_amount: 12000,
                    },
                  ],
                }),
              }),
            };
          }
          if (table === "recurring_templates") {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({ data: [] }),
              }),
            };
          }
          return {
            select: vi.fn().mockReturnThis(),
          };
        }),
      };

      const result = await handleTelegramChartCommand(
        mockSupabase,
        new Date("2026-09-15T12:00:00.000Z")
      );

      expect(result.photoBuffer).toBeDefined();
      expect(result.photoBuffer.length).toBeGreaterThan(1000);
      expect(result.photoBuffer.slice(0, 4).toString("hex")).toBe("89504e47");
      expect(result.caption).toContain("Графічний дашборд");
      expect(result.caption).toContain("Вільний залишок:");
      expect(result.replyMarkup.inline_keyboard).toBeDefined();
    });
  });

  describe("generateBudgetDashboardImage", () => {
    it("генерує валідний PNG буфер розміром 1000x560", async () => {
      const mockPacing: any = {
        cycle: {
          startDate: "2026-09-01T00:00:00.000Z",
          endDate: "2026-09-30T23:59:59.999Z",
          daysTotal: 30,
          daysPassed: 15,
          daysRemaining: 15,
          remainingWeekdays: 10,
          remainingWeekends: 5,
        },
        budget: {
          totalBudgetLimit: 35000,
          currentExpenseTotal: 18000,
          remainingTotal: 17000,
          reservedObligationsTotal: 2500,
          discretionaryRemaining: 14500,
        },
        pacing: {
          safeWeekdaySpend: 800,
          safeWeekendSpend: 1300,
          flatDailySpend: 966,
          weekendMultiplierUsed: 1.6,
          status: "healthy",
          statusLabel: "Впевнений темп",
          advice: "Темп ідеальний. Можна дозволити собі приємні плани.",
        },
        surplusProjection: {
          projectedSurplusAmount: 3200,
          savingsPotentialPercent: 9,
          summaryText: "Очікуваний профіцит",
        },
      };

      const buf = await generateBudgetDashboardImage(mockPacing, {
        cushionCurrent: 75000,
        monthRoundupAmount: 350,
      });

      expect(buf).toBeInstanceOf(Buffer);
      expect(buf.length).toBeGreaterThan(1000);
      expect(buf.slice(0, 4).toString("hex")).toBe("89504e47");
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

  describe("tryFastNaturalLanguageParse", () => {
    it("миттєво розпізнає повернення коштів з вказанням імені 'повернення коштів від Кохана 250'", () => {
      const parsed = tryFastNaturalLanguageParse(
        "повернення коштів від Кохана 250"
      );
      expect(parsed).toBeDefined();
      expect(parsed?.type).toBe("income");
      expect(parsed?.amount).toBe(250);
      expect(parsed?.merchant).toBe("Кохана");
      expect(parsed?.category).toBe("Зарплата/ФОП");
      expect(parsed?.note).toBe("повернення коштів від Кохана");
    });

    it("розпізнає просте повернення коштів без імені 'повернення 300 грн'", () => {
      const parsed = tryFastNaturalLanguageParse("повернення 300 грн");
      expect(parsed).toBeDefined();
      expect(parsed?.type).toBe("income");
      expect(parsed?.amount).toBe(300);
      expect(parsed?.merchant).toBe("Повернення коштів");
      expect(parsed?.category).toBe("Зарплата/ФОП");
    });

    it("розпізнає зарахування на картку 'зарахування 250'", () => {
      const parsed = tryFastNaturalLanguageParse("зарахування 250");
      expect(parsed).toBeDefined();
      expect(parsed?.type).toBe("income");
      expect(parsed?.amount).toBe(250);
      expect(parsed?.merchant).toBe("Зарахування коштів");
      expect(parsed?.category).toBe("Зарплата/ФОП");
    });

    it("розпізнає зарплату 'зарплата 45000'", () => {
      const parsed = tryFastNaturalLanguageParse("зарплата 45000");
      expect(parsed).toBeDefined();
      expect(parsed?.type).toBe("income");
      expect(parsed?.amount).toBe(45000);
      expect(parsed?.category).toBe("Зарплата/ФОП");
    });

    it("повертає null для складних повідомлень з витратами, які потребують AI", () => {
      expect(
        tryFastNaturalLanguageParse("чи можу купити навушники за 3000")
      ).toBeNull();
      expect(
        tryFastNaturalLanguageParse("вчора ввечері аптека 480")
      ).toBeNull();
    });
  });

  describe("Telegram Webhook Route Handler (POST /api/webhooks/telegram)", () => {
    const origEnv = { ...process.env };

    beforeEach(() => {
      process.env = { ...origEnv };
      process.env.TELEGRAM_CHAT_ID = "280769950";
      process.env.NEXT_PUBLIC_SUPABASE_URL = "https://mock.supabase.co";
      process.env.SUPABASE_SERVICE_ROLE_KEY = "mock_service_role_key";
    });

    afterEach(() => {
      process.env = origEnv;
    });

    it("відхиляє 401 Unauthorized, якщо налаштовано TELEGRAM_WEBHOOK_SECRET і заголовок не збігається", async () => {
      const { POST } = await import("@/app/api/webhooks/telegram/route");
      const { NextRequest } = await import("next/server");
      process.env.TELEGRAM_WEBHOOK_SECRET = "super_secret_webhook_token_123";

      const req = new NextRequest("http://localhost/api/webhooks/telegram", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-telegram-bot-api-secret-token": "wrong_token",
        },
        body: JSON.stringify({
          message: { chat: { id: 280769950 }, text: "кава 85" },
        }),
      });

      const res = await POST(req);
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.error).toBe("Unauthorized");
    });

    it("НЕ відхиляє 401 через APP_API_SECRET, якщо TELEGRAM_WEBHOOK_SECRET не встановлено (усунено регресію)", async () => {
      const { POST } = await import("@/app/api/webhooks/telegram/route");
      const { NextRequest } = await import("next/server");
      delete process.env.TELEGRAM_WEBHOOK_SECRET;
      process.env.APP_API_SECRET = "apple_shortcut_secret_key";

      const req = new NextRequest("http://localhost/api/webhooks/telegram", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          message: { chat: { id: 280769950 }, text: "/start" },
        }),
      });

      const res = await POST(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.ok).toBe(true);
    });

    it("ігнорує запити від неавторизованого chatId без падіння з помилкою", async () => {
      const { POST } = await import("@/app/api/webhooks/telegram/route");
      const { NextRequest } = await import("next/server");
      delete process.env.TELEGRAM_WEBHOOK_SECRET;

      const req = new NextRequest("http://localhost/api/webhooks/telegram", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          message: { chat: { id: 999999999 }, text: "хакерська спроба 500" },
        }),
      });

      const res = await POST(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.ok).toBe(true);
    });

    it("надсилає вітальне повідомлення разом із персистентною клавіатурою на /start", async () => {
      const { POST } = await import("@/app/api/webhooks/telegram/route");
      const { NextRequest } = await import("next/server");
      const { sendTelegramMessage, getPersistentReplyKeyboard } =
        await import("@/lib/telegram");
      delete process.env.TELEGRAM_WEBHOOK_SECRET;
      process.env.TELEGRAM_CHAT_ID = "280769950";

      const req = new NextRequest("http://localhost/api/webhooks/telegram", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          message: { chat: { id: 280769950 }, text: "/start" },
        }),
      });

      const res = await POST(req);
      expect(res.status).toBe(200);
      expect(sendTelegramMessage).toHaveBeenCalledWith(
        expect.stringContaining("Вітаю у BudgetGraph Bot!"),
        getPersistentReplyKeyboard()
      );
    });

    it("обробляє натискання кнопки '🎯 Мій темп' у вебхуку", async () => {
      const { POST } = await import("@/app/api/webhooks/telegram/route");
      const { NextRequest } = await import("next/server");
      const { sendTelegramMessage } = await import("@/lib/telegram");
      delete process.env.TELEGRAM_WEBHOOK_SECRET;
      process.env.TELEGRAM_CHAT_ID = "280769950";

      const req = new NextRequest("http://localhost/api/webhooks/telegram", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          message: { chat: { id: 280769950 }, text: "🎯 Мій темп" },
        }),
      });

      const res = await POST(req);
      expect(res.status).toBe(200);
      expect(sendTelegramMessage).toHaveBeenCalledWith(
        expect.stringContaining("Безпечно на день"),
        expect.objectContaining({
          inline_keyboard: expect.arrayContaining([
            expect.arrayContaining([
              expect.objectContaining({ callback_data: "tg_refresh_pace" }),
              expect.objectContaining({ callback_data: "tg_cycle_summary" }),
            ]),
          ]),
        })
      );
    });

    it("обробляє натискання кнопки '📊 Залишок циклу' у вебхуку", async () => {
      const { POST } = await import("@/app/api/webhooks/telegram/route");
      const { NextRequest } = await import("next/server");
      const { sendTelegramMessage } = await import("@/lib/telegram");
      delete process.env.TELEGRAM_WEBHOOK_SECRET;
      process.env.TELEGRAM_CHAT_ID = "280769950";

      const req = new NextRequest("http://localhost/api/webhooks/telegram", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          message: { chat: { id: 280769950 }, text: "📊 Залишок циклу" },
        }),
      });

      const res = await POST(req);
      expect(res.status).toBe(200);
      expect(sendTelegramMessage).toHaveBeenCalledWith(
        expect.stringContaining("Підсумок бюджетного циклу"),
        expect.objectContaining({
          inline_keyboard: expect.any(Array),
        })
      );
    });

    it("обробляє натискання кнопки '🛡️ Подушка' у вебхуку", async () => {
      const { POST } = await import("@/app/api/webhooks/telegram/route");
      const { NextRequest } = await import("next/server");
      const { sendTelegramMessage } = await import("@/lib/telegram");
      delete process.env.TELEGRAM_WEBHOOK_SECRET;
      process.env.TELEGRAM_CHAT_ID = "280769950";

      const req = new NextRequest("http://localhost/api/webhooks/telegram", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          message: { chat: { id: 280769950 }, text: "🛡️ Подушка" },
        }),
      });

      const res = await POST(req);
      expect(res.status).toBe(200);
      expect(sendTelegramMessage).toHaveBeenCalledWith(
        expect.stringContaining("Фінансова подушка безпеки"),
        expect.objectContaining({
          inline_keyboard: expect.any(Array),
        })
      );
    });

    it("обробляє натискання кнопки '💡 Що якщо...?' у вебхуку", async () => {
      const { POST } = await import("@/app/api/webhooks/telegram/route");
      const { NextRequest } = await import("next/server");
      const { sendTelegramMessage } = await import("@/lib/telegram");
      delete process.env.TELEGRAM_WEBHOOK_SECRET;
      process.env.TELEGRAM_CHAT_ID = "280769950";

      const req = new NextRequest("http://localhost/api/webhooks/telegram", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          message: { chat: { id: 280769950 }, text: "💡 Що якщо...?" },
        }),
      });

      const res = await POST(req);
      expect(res.status).toBe(200);
      expect(sendTelegramMessage).toHaveBeenCalledWith(
        expect.stringContaining("Симулятор покупок (What-If аналіз)"),
        expect.objectContaining({
          inline_keyboard: expect.any(Array),
        })
      );
    });

    it("обробляє запит '📈 Графік' у вебхуку та надсилає фото через sendTelegramPhoto", async () => {
      const { POST } = await import("@/app/api/webhooks/telegram/route");
      const { NextRequest } = await import("next/server");
      const { sendTelegramPhoto } = await import("@/lib/telegram");
      delete process.env.TELEGRAM_WEBHOOK_SECRET;
      process.env.TELEGRAM_CHAT_ID = "280769950";

      const req = new NextRequest("http://localhost/api/webhooks/telegram", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          message: { chat: { id: 280769950 }, text: "📈 Графік" },
        }),
      });

      const res = await POST(req);
      expect(res.status).toBe(200);
      expect(sendTelegramPhoto).toHaveBeenCalledWith(
        expect.any(Buffer),
        expect.stringContaining("Графічний дашборд"),
        expect.objectContaining({
          inline_keyboard: expect.any(Array),
        })
      );
    });
  });
});
