import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  isFinancialInquiry,
  handleTelegramFinancialInquiry,
} from "@/lib/telegram-bot";
import {
  loadFinancialAssistantContext,
  generateFinancialAssistantResponse,
  formatTelegramAiHtml,
} from "@/lib/financial-ai-assistant";

// Mock @/lib/gemini
const mockGenerateContent = vi.fn();
vi.mock("@/lib/gemini", () => ({
  getGeminiClient: () => ({
    models: {
      generateContent: (...args: any[]) => mockGenerateContent(...args),
    },
  }),
}));

// Mock @/lib/currency
vi.mock("@/lib/currency", () => ({
  getUsdRate: vi.fn().mockResolvedValue(41.5),
}));

describe("Financial AI Assistant (Step 3)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("isFinancialInquiry intent classification", () => {
    it("should identify question mark queries as financial inquiries", () => {
      expect(isFinancialInquiry("Скільки я витратив на таксі?")).toBe(true);
      expect(isFinancialInquiry("Чи вистачить мені до кінця місяця?")).toBe(
        true
      );
      expect(isFinancialInquiry("Що по категоріях?")).toBe(true);
      expect(isFinancialInquiry("Скільки в скарбничці?")).toBe(true);
    });

    it("should identify queries starting with inquiry words as financial inquiries", () => {
      expect(isFinancialInquiry("скільки пішло на їжу")).toBe(true);
      expect(isFinancialInquiry("покажи найбільші покупки")).toBe(true);
      expect(isFinancialInquiry("проаналізуй мої витрати")).toBe(true);
      expect(isFinancialInquiry("топ витрат за місяць")).toBe(true);
      expect(isFinancialInquiry("підкажи скільки збережено")).toBe(true);
      expect(isFinancialInquiry("звіт по підписках")).toBe(true);
    });

    it("should identify analytical patterns without question mark", () => {
      expect(isFinancialInquiry("витрати на авто")).toBe(true);
      expect(isFinancialInquiry("найбільші витрати за тиждень")).toBe(true);
      expect(isFinancialInquiry("гроші в скарбничці")).toBe(true);
    });

    it("should NOT identify system commands as financial inquiries", () => {
      expect(isFinancialInquiry("/start")).toBe(false);
      expect(isFinancialInquiry("/pace")).toBe(false);
      expect(isFinancialInquiry("/cycle")).toBe(false);
      expect(isFinancialInquiry("/chart")).toBe(false);
      expect(isFinancialInquiry("/cushion")).toBe(false);
      expect(isFinancialInquiry("/whatif")).toBe(false);
    });

    it("should NOT identify quick menu buttons as financial inquiries", () => {
      expect(isFinancialInquiry("🎯 Мій темп")).toBe(false);
      expect(isFinancialInquiry("📊 Залишок циклу")).toBe(false);
      expect(isFinancialInquiry("🛡️ Подушка")).toBe(false);
      expect(isFinancialInquiry("💡 Що якщо...?")).toBe(false);
      expect(isFinancialInquiry("📈 Графік")).toBe(false);
    });

    it("should NOT identify fast-path expense recordings as financial inquiries", () => {
      expect(isFinancialInquiry("кава 85")).toBe(false);
      expect(isFinancialInquiry("таксі 240")).toBe(false);
      expect(isFinancialInquiry("Сільпо 480 продукти")).toBe(false);
      expect(isFinancialInquiry("АЗС 1500")).toBe(false);
    });

    it("should NOT identify What-If purchase queries handled by the simulator", () => {
      expect(isFinancialInquiry("чи можу купити ps5 за 20000")).toBe(false);
      expect(isFinancialInquiry("хочу купити куртку 3500")).toBe(false);
      expect(isFinancialInquiry("чи можу дозволити ноутбук за 45000")).toBe(
        false
      );
    });
  });

  describe("formatTelegramAiHtml", () => {
    it("converts markdown headings to Telegram HTML bold", () => {
      const input = "### Фінансовий звіт\nОсь деталі:";
      const output = formatTelegramAiHtml(input);
      expect(output).toContain("<b>Фінансовий звіт</b>");
      expect(output).not.toContain("###");
    });

    it("converts double asterisks to <b> tags", () => {
      const input = "Ви витратили **4 500 ₴** на продукти.";
      const output = formatTelegramAiHtml(input);
      expect(output).toContain("<b>4 500 ₴</b>");
      expect(output).not.toContain("**");
    });

    it("converts single asterisks to <i> tags", () => {
      const input = "Зверніть увагу: *рекомендовано зменшити темп*.";
      const output = formatTelegramAiHtml(input);
      expect(output).toContain("<i>рекомендовано зменшити темп</i>");
      expect(output).not.toContain("*рекомендовано");
    });

    it("converts backticks to <code> tags", () => {
      const input = "Використовуйте `таксі 240` для швидкого запису.";
      const output = formatTelegramAiHtml(input);
      expect(output).toContain("<code>таксі 240</code>");
    });

    it("compacts multiple line breaks", () => {
      const input = "Перший рядок\n\n\n\n\nДругий рядок";
      const output = formatTelegramAiHtml(input);
      expect(output).toBe("Перший рядок\n\nДругий рядок");
    });
  });

  describe("loadFinancialAssistantContext", () => {
    it("loads structured financial context from Supabase", async () => {
      const fakeSupabase = {
        from: vi.fn((table: string) => {
          if (table === "budget_cycles") {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              order: vi.fn().mockReturnThis(),
              limit: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({
                data: {
                  id: "c1",
                  budget_limit: 30000,
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
                    current_amount: 15000,
                    target_amount: 60000,
                    currency: "UAH",
                  },
                  {
                    id: 2,
                    name: "Відпустка",
                    current_amount: 5000,
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
              is: vi.fn().mockReturnThis(),
              gte: vi.fn().mockReturnThis(),
              lte: vi.fn().mockReturnThis(),
              order: vi.fn().mockResolvedValue({
                data: [
                  {
                    id: "tx-1",
                    amount: 450,
                    currency: "UAH",
                    merchant_raw: "Сільпо",
                    category_name: "Продукти",
                    type: "expense",
                    created_at: "2026-09-10T12:00:00Z",
                    exclude_from_budget: false,
                  },
                  {
                    id: "tx-2",
                    amount: 240,
                    currency: "UAH",
                    merchant_raw: "Uklon",
                    category_name: "Транспорт",
                    type: "expense",
                    created_at: "2026-09-12T15:00:00Z",
                    exclude_from_budget: false,
                  },
                ],
              }),
              or: vi.fn().mockReturnThis(),
            };
          }
          if (table === "recurring_templates") {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockResolvedValue({
                data: [
                  {
                    id: "rec-1",
                    title: "Netflix",
                    amount: 400,
                    currency: "UAH",
                    day_of_month: 25,
                    is_active: true,
                    category_name: "Підписки",
                  },
                ],
              }),
            };
          }
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            order: vi.fn().mockResolvedValue({ data: [] }),
          };
        }),
      };

      const context = await loadFinancialAssistantContext(
        fakeSupabase,
        new Date("2026-09-15T12:00:00Z")
      );

      expect(context).toBeDefined();
      expect(context.cycle.daysTotal).toBe(30);
      expect(context.budget.totalBudgetLimit).toBe(30000);
      expect(context.cushion.currentAmount).toBe(15000);
      expect(context.otherGoals.length).toBe(1);
      expect(context.otherGoals[0].name).toBe("Відпустка");
      expect(context.recentTransactions.length).toBeGreaterThan(0);
      expect(context.categoryStats["Продукти"]?.total).toBe(450);
      expect(context.categoryStats["Транспорт"]?.total).toBe(240);
    });
  });

  describe("generateFinancialAssistantResponse", () => {
    it("generates response using Gemini client with fallback", async () => {
      mockGenerateContent.mockResolvedValueOnce({
        text: "Загалом на транспорт та таксі пішло <b>240 ₴</b> (1 поїздка на Uklon).",
      });

      const fakeContext: any = {
        cycle: {
          name: "Поточний",
          startDate: "2026-09-01",
          endDate: "2026-09-30",
          daysTotal: 30,
          daysPassed: 15,
          daysRemaining: 15,
        },
        budget: {
          totalBudgetLimit: 30000,
          currentExpenseTotal: 5000,
          discretionaryRemaining: 20000,
          reservedObligationsTotal: 5000,
        },
        pacing: {
          safeWeekdaySpend: 1000,
          safeWeekendSpend: 1500,
          flatDailySpend: 1333,
          statusLabel: "В межах норми 🟢",
          advice: "Темп відмінний",
        },
        surplusProjection: {
          projectedSurplusAmount: 2000,
          summaryText: "Профіцит",
        },
        cushion: {
          currentAmount: 15000,
          targetAmount: 50000,
          monthRoundupAmount: 120,
          totalRoundupAmount: 850,
        },
        otherGoals: [],
        subscriptions: [],
        categoryStats: { Транспорт: { total: 240, count: 1 } },
        topPurchases: [
          {
            date: "2026-09-12",
            amount: 240,
            merchant: "Uklon",
            category: "Транспорт",
          },
        ],
        recentTransactions: [
          {
            date: "2026-09-12",
            amount: 240,
            merchant: "Uklon",
            category: "Транспорт",
            type: "expense",
          },
        ],
        kyivNowStr: "15 вересня 2026 р., 15:00:00",
      };

      const result = await generateFinancialAssistantResponse(
        "Скільки я витратив на таксі?",
        fakeContext
      );

      expect(mockGenerateContent).toHaveBeenCalled();
      expect(result.replyHtml).toContain("240 ₴");
      expect(result.replyMarkup.inline_keyboard).toBeDefined();
    });

    it("falls back gracefully when model throws an error", async () => {
      // First two calls fail, third succeeds
      mockGenerateContent
        .mockRejectedValueOnce(new Error("Rate limit 3.5"))
        .mockRejectedValueOnce(new Error("Rate limit lite"))
        .mockResolvedValueOnce({
          text: "Ви витратили **1 200 ₴** на кафе.",
        });

      const fakeContext: any = {
        cycle: {
          startDate: "2026-09-01",
          endDate: "2026-09-30",
          daysTotal: 30,
          daysPassed: 15,
          daysRemaining: 15,
        },
        budget: {
          totalBudgetLimit: 30000,
          currentExpenseTotal: 5000,
          discretionaryRemaining: 20000,
          reservedObligationsTotal: 5000,
        },
        pacing: {
          safeWeekdaySpend: 1000,
          safeWeekendSpend: 1500,
          flatDailySpend: 1333,
          statusLabel: "В нормі",
          advice: "Добре",
        },
        surplusProjection: { projectedSurplusAmount: 0 },
        cushion: {
          currentAmount: 0,
          monthRoundupAmount: 0,
          totalRoundupAmount: 0,
        },
        otherGoals: [],
        subscriptions: [],
        categoryStats: {},
        topPurchases: [],
        recentTransactions: [],
        kyivNowStr: "15.09.2026",
      };

      const result = await generateFinancialAssistantResponse(
        "Скільки на кафе?",
        fakeContext
      );

      expect(mockGenerateContent).toHaveBeenCalledTimes(3);
      expect(result.replyHtml).toContain("<b>1 200 ₴</b>");
    });

    it("returns polite fallback message if all models fail", async () => {
      mockGenerateContent.mockRejectedValue(new Error("All models down"));

      const fakeContext: any = {
        cycle: {
          startDate: "2026-09-01",
          endDate: "2026-09-30",
          daysTotal: 30,
          daysPassed: 15,
          daysRemaining: 15,
        },
        budget: {
          totalBudgetLimit: 30000,
          currentExpenseTotal: 5000,
          discretionaryRemaining: 20000,
          reservedObligationsTotal: 5000,
        },
        pacing: {
          safeWeekdaySpend: 1000,
          safeWeekendSpend: 1500,
          flatDailySpend: 1333,
          statusLabel: "В нормі",
          advice: "Добре",
        },
        surplusProjection: { projectedSurplusAmount: 0 },
        cushion: {
          currentAmount: 0,
          monthRoundupAmount: 0,
          totalRoundupAmount: 0,
        },
        otherGoals: [],
        subscriptions: [],
        categoryStats: {},
        topPurchases: [],
        recentTransactions: [],
        kyivNowStr: "15.09.2026",
      };

      const result = await generateFinancialAssistantResponse(
        "Яка ситуація?",
        fakeContext
      );

      expect(result.replyHtml).toContain(
        "Не вдалося отримати відповідь аналітика"
      );
    });
  });
});
