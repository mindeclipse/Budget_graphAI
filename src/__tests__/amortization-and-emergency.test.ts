import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  getEffectiveTransactionExpense,
  getAmortizedMonthlyExpense,
  calculateActivePastAmortizations,
  loadPastAmortizationObligations,
} from "@/lib/weighted-pacing";
import {
  parseNaturalLanguageExpense,
  formatTransactionConfirmation,
} from "@/lib/telegram-bot";
import { Transaction } from "@/types/finance";

// Mock Gemini AI client
const mockGenerateContent = vi.fn();
vi.mock("@/lib/gemini", () => ({
  getGeminiClient: vi.fn(() => ({
    models: {
      generateContent: mockGenerateContent,
    },
  })),
}));

describe("Intelligent Accounting: Amortization & Emergency Shock Expenses", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getEffectiveTransactionExpense", () => {
    it("повертає повну суму для звичайної щоденної витрати", () => {
      const tx: Transaction = {
        id: 1,
        amount: 850,
        currency: "UAH",
        merchant_raw: "Сільпо",
        category_name: "Продукти",
        source: "manual",
        type: "expense",
        created_at: "2026-09-10T10:00:00Z",
      };
      expect(getEffectiveTransactionExpense(tx)).toBe(850);
    });

    it("повертає 0 для доходів", () => {
      const tx: Transaction = {
        id: 2,
        amount: 50000,
        currency: "UAH",
        merchant_raw: "Зарплата",
        category_name: "Зарплата/ФОП",
        source: "manual",
        type: "income",
        created_at: "2026-09-01T10:00:00Z",
      };
      expect(getEffectiveTransactionExpense(tx)).toBe(0);
    });

    it("повертає 0 для видалених транзакцій (deleted_at)", () => {
      const tx: Transaction = {
        id: 3,
        amount: 1500,
        currency: "UAH",
        merchant_raw: "Кафе",
        category_name: "Кафе та ресторани",
        source: "manual",
        type: "expense",
        deleted_at: "2026-09-11T10:00:00Z",
        created_at: "2026-09-10T10:00:00Z",
      };
      expect(getEffectiveTransactionExpense(tx)).toBe(0);
    });

    it("повертає 0 для форс-мажорних витрат, покритих з подушки (exclude_from_budget: true)", () => {
      const tx: Transaction = {
        id: 4,
        amount: 4500,
        currency: "UAH",
        merchant_raw: "Аптека (термінові ліки)",
        category_name: "Здоров'я",
        source: "telegram_bot",
        type: "expense",
        exclude_from_budget: true,
        tags: ["форсмажор"],
        metadata: { is_emergency: true },
        created_at: "2026-09-12T10:00:00Z",
      };
      expect(getEffectiveTransactionExpense(tx)).toBe(0);
    });

    it("повертає повну суму (100% Cash Flow) для амортизованих витрат, щоб гроші не поверталися віртуально на баланс", () => {
      const tx: Transaction = {
        id: 5,
        amount: 3000,
        currency: "UAH",
        merchant_raw: "Вітаміни Orthomol на 3 місяці",
        category_name: "Здоров'я",
        source: "telegram_bot",
        type: "expense",
        exclude_from_budget: false,
        metadata: {
          amortization: {
            months: 3,
            monthly_amount: 1000,
            start_date: "2026-09-05T10:00:00Z",
          },
        },
        created_at: "2026-09-05T10:00:00Z",
      };
      // Реальний кеш-флоу: з балансу списується вся сума 3000 ₴ одразу
      expect(getEffectiveTransactionExpense(tx)).toBe(3000);
      // Для ШІ та аналітики нормалізована частка становить 1000 ₴
      expect(getAmortizedMonthlyExpense(tx)).toBe(1000);
    });

    it("розраховує щомісячну частку автоматично для ШІ та аналітики, якщо monthly_amount не задано", () => {
      const tx: Transaction = {
        id: 6,
        amount: 6000,
        currency: "UAH",
        merchant_raw: "Курс процедур",
        category_name: "Здоров'я",
        source: "manual",
        type: "expense",
        metadata: {
          amortization: {
            months: 6,
          },
        },
        created_at: "2026-09-01T10:00:00Z",
      };
      expect(getEffectiveTransactionExpense(tx)).toBe(6000);
      expect(getAmortizedMonthlyExpense(tx)).toBe(1000);
    });
  });

  describe("calculateActivePastAmortizations", () => {
    it("формує зобов'язання для витрати з минулого місяця (2-й місяць із 3)", () => {
      const pastTxs: Transaction[] = [
        {
          id: 10,
          amount: 3000,
          currency: "UAH",
          merchant_raw: "Курс вітамінів",
          category_name: "Здоров'я",
          source: "telegram_bot",
          type: "expense",
          created_at: "2026-08-10T12:00:00Z",
          metadata: {
            amortization: {
              months: 3,
              monthly_amount: 1000,
              start_date: "2026-08-10T12:00:00Z",
            },
          },
        },
      ];

      const currentCycleDate = new Date("2026-09-14T12:00:00Z");
      const obligations = calculateActivePastAmortizations(
        pastTxs,
        currentCycleDate
      );

      expect(obligations).toHaveLength(1);
      expect(obligations[0].amount).toBe(1000);
      expect(obligations[0].title).toContain("Амортизація (2/3)");
      expect(obligations[0].title).toContain("Курс вітамінів");
      expect(obligations[0].is_paid).toBe(false);
    });

    it("формує зобов'язання для фінального місяця (3-й місяць із 3)", () => {
      const pastTxs: Transaction[] = [
        {
          id: 11,
          amount: 3000,
          currency: "UAH",
          merchant_raw: "Страховка",
          category_name: "Здоров'я",
          source: "manual",
          type: "expense",
          created_at: "2026-07-05T12:00:00Z",
          metadata: {
            amortization: {
              months: 3,
              monthly_amount: 1000,
              start_date: "2026-07-05T12:00:00Z",
            },
          },
        },
      ];

      const currentCycleDate = new Date("2026-09-14T12:00:00Z");
      const obligations = calculateActivePastAmortizations(
        pastTxs,
        currentCycleDate
      );

      expect(obligations).toHaveLength(1);
      expect(obligations[0].amount).toBe(1000);
      expect(obligations[0].title).toContain("Амортизація (3/3)");
    });

    it("не включає витрати, період амортизації яких вже повністю завершився", () => {
      const pastTxs: Transaction[] = [
        {
          id: 12,
          amount: 3000,
          currency: "UAH",
          merchant_raw: "Вітаміни минулого року",
          category_name: "Здоров'я",
          source: "manual",
          type: "expense",
          created_at: "2026-05-01T12:00:00Z",
          metadata: {
            amortization: {
              months: 3,
              monthly_amount: 1000,
            },
          },
        },
      ];

      const currentCycleDate = new Date("2026-09-14T12:00:00Z");
      const obligations = calculateActivePastAmortizations(
        pastTxs,
        currentCycleDate
      );

      expect(obligations).toHaveLength(0);
    });

    it("не створює зобов'язання для покупки того самого місяця (місяць 0)", () => {
      const currentMonthTxs: Transaction[] = [
        {
          id: 13,
          amount: 6000,
          currency: "UAH",
          merchant_raw: "Покупка поточного місяця",
          category_name: "Покупки",
          source: "manual",
          type: "expense",
          created_at: "2026-09-02T12:00:00Z",
          metadata: {
            amortization: {
              months: 6,
              monthly_amount: 1000,
            },
          },
        },
      ];

      const currentCycleDate = new Date("2026-09-14T12:00:00Z");
      const obligations = calculateActivePastAmortizations(
        currentMonthTxs,
        currentCycleDate
      );

      expect(obligations).toHaveLength(0);
    });
  });

  describe("loadPastAmortizationObligations Resiliency", () => {
    it("безпечно повертає порожній масив, якщо база повертає помилку чи відсутній метод", async () => {
      const brokenSupabase = {
        from: vi.fn().mockReturnValue({}),
      };
      const result = await loadPastAmortizationObligations(
        brokenSupabase,
        new Date("2026-09-01"),
        new Date("2026-09-14")
      );
      expect(result).toEqual([]);
    });
  });

  describe("parseNaturalLanguageExpense for Emergency and Amortization", () => {
    it("розпізнає термінову витрату з подушки як форс-мажор", async () => {
      mockGenerateContent.mockResolvedValueOnce({
        text: JSON.stringify({
          amount: 2800,
          merchant: "Аптека Доброго Дня",
          category: "Здоров'я та догляд",
          type: "expense",
          note: "ліки від грипу",
          is_emergency: true,
        }),
      });

      const res = await parseNaturalLanguageExpense(
        "хвороба ліки 2800 грн терміново з подушки"
      );

      expect(res).toBeDefined();
      expect(res?.amount).toBe(2800);
      expect(res?.category).toBe("Здоров'я та догляд");
      expect(res?.exclude_from_budget).toBe(true);
      expect(res?.is_emergency).toBe(true);
      expect(res?.tags).toContain("форсмажор");
      expect(res?.metadata?.is_emergency).toBe(true);
    });

    it("евристично детектує форс-мажор навіть якщо AI забув прапорець", async () => {
      mockGenerateContent.mockResolvedValueOnce({
        text: JSON.stringify({
          amount: 1500,
          merchant: "Клініка",
          category: "Здоров'я та догляд",
          type: "expense",
          note: "крапельниця",
        }),
      });

      const res = await parseNaturalLanguageExpense(
        "1500 клініка форс-мажор з подушки"
      );

      expect(res).toBeDefined();
      expect(res?.exclude_from_budget).toBe(true);
      expect(res?.is_emergency).toBe(true);
      expect(res?.tags).toContain("форсмажор");
    });

    it("розпізнає амортизацію на 3 місяці", async () => {
      mockGenerateContent.mockResolvedValueOnce({
        text: JSON.stringify({
          amount: 4500,
          merchant: "Вітаміни",
          category: "Здоров'я та догляд",
          type: "expense",
          amortization_months: 3,
        }),
      });

      const res = await parseNaturalLanguageExpense(
        "вітаміни на 3 місяці 4500"
      );

      expect(res).toBeDefined();
      expect(res?.amount).toBe(4500);
      expect(res?.amortization_months).toBe(3);
      expect(res?.metadata?.amortization).toEqual({
        months: 3,
        monthly_amount: 1500,
        start_date: expect.any(String),
      });
    });

    it("розпізнає амортизацію на рік (12 місяців) за текстом", async () => {
      mockGenerateContent.mockResolvedValueOnce({
        text: JSON.stringify({
          amount: 12000,
          merchant: "Медична страховка",
          category: "Здоров'я та догляд",
          type: "expense",
        }),
      });

      const res = await parseNaturalLanguageExpense(
        "медична страховка на рік 12000"
      );

      expect(res).toBeDefined();
      expect(res?.amortization_months).toBe(12);
      expect(res?.metadata?.amortization?.months).toBe(12);
      expect(res?.metadata?.amortization?.monthly_amount).toBe(1000);
    });
  });

  describe("formatTransactionConfirmation formatting", () => {
    it("додає щит і пояснення збереження темпу для форс-мажорів", () => {
      const tx = {
        id: 99,
        merchant_raw: "Лікарня",
        amount: 3200,
        category_name: "Здоров'я",
        created_at: "2026-09-14T12:00:00Z",
        exclude_from_budget: true,
        metadata: { is_emergency: true },
      };

      const result = formatTransactionConfirmation({ transaction: tx });
      expect(result.text).toContain(
        "Покрито з Фінансової подушки (форс-мажор)"
      );
      expect(result.text).toContain("ваш щоденний темп збережено");
    });

    it("додає календарик і деталі щомісячного списання для амортизованих витрат", () => {
      const tx = {
        id: 100,
        merchant_raw: "Вітаміни Orthomol",
        amount: 3600,
        category_name: "Здоров'я",
        created_at: "2026-09-14T12:00:00Z",
        exclude_from_budget: false,
        metadata: {
          amortization: {
            months: 3,
            monthly_amount: 1200,
          },
        },
      };

      const result = formatTransactionConfirmation({ transaction: tx });
      expect(result.text).toContain("Амортизація на 3 міс");
      expect(result.text.replace(/\u00A0/g, " ")).toContain("1 200 ₴/міс");
      expect(result.text).toContain("З балансу списано всю суму");
      expect(result.text).toContain(
        "ШІ та аналітика зафіксують це як планову інвестицію"
      );
    });
  });
});
