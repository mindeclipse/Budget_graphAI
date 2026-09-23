import { describe, it, expect } from "vitest";
import { Transaction } from "@/types/finance";
import {
  INCOME_CATEGORIES,
  CATEGORY_ICONS,
  CATEGORY_COLORS,
} from "@/constants/categories";

describe("Capital Transactions & Inflows / Coupon Payouts", () => {
  it("перевіряє наявність категорій зарахувань та їх іконок і кольорів", () => {
    expect(INCOME_CATEGORIES).toContain("Інвестиції");
    expect(INCOME_CATEGORIES).toContain("Зарплата/ФОП");
    expect(INCOME_CATEGORIES).toContain("Заощадження");

    INCOME_CATEGORIES.forEach((cat) => {
      expect(CATEGORY_ICONS[cat]).toBeDefined();
      expect(CATEGORY_COLORS[cat]).toBeDefined();
    });
  });

  describe("Логіка фільтрації операцій капіталу (useCapitalTransactions)", () => {
    // Емулюємо логіку з useCapitalTransactions
    function filterCapitalTransactions(
      investmentTransactions: Transaction[],
      rawTransactions: Transaction[]
    ): Transaction[] {
      const txMap = new Map<number, Transaction>();

      for (const t of investmentTransactions) {
        if (!t.deleted_at) {
          txMap.set(t.id, t);
        }
      }

      const hasInzhurStatement = investmentTransactions.some(
        (t) => t.source === "inzhur_statement"
      );

      for (const t of rawTransactions) {
        if (t.deleted_at) continue;

        const isCapital =
          t.type === "investment" ||
          t.category_name?.toLowerCase().includes("інвест") ||
          t.category_name?.toLowerCase().includes("заощадж") ||
          t.tags?.some(
            (tag: string) =>
              tag.toLowerCase().includes("капітал") ||
              tag.toLowerCase().includes("інвест") ||
              tag.toLowerCase().includes("купон") ||
              tag.toLowerCase().includes("овдп") ||
              tag.toLowerCase().includes("reit")
          );

        if (!isCapital) continue;

        const isInzhurBankTransfer =
          t.source !== "inzhur_statement" &&
          (t.merchant_raw?.toLowerCase().includes("інжур") ||
            t.merchant_raw?.toLowerCase().includes("inzhur") ||
            t.category_name?.toLowerCase().includes("inzhur"));

        if (isInzhurBankTransfer && hasInzhurStatement) {
          const hasMatchingInzhurDeposit = investmentTransactions.some(
            (inv) =>
              inv.source === "inzhur_statement" &&
              Math.abs(Number(inv.amount) - Number(t.amount)) < 0.01 &&
              Math.abs(
                new Date(inv.created_at).getTime() -
                  new Date(t.created_at).getTime()
              ) <
                3 * 24 * 60 * 60 * 1000
          );

          if (hasMatchingInzhurDeposit) {
            continue;
          }
        }

        txMap.set(t.id, t);
      }

      return Array.from(txMap.values()).sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
    }

    it("включає ручні нарахування купонів ОВДП навіть з exclude_from_budget = true", () => {
      const couponTx: Transaction = {
        id: 701,
        amount: 8310.4,
        currency: "UAH",
        merchant_raw: "Нарахування купону ОВДП UA4000238976",
        category_name: "Інвестиції",
        type: "investment",
        source: "manual",
        exclude_from_budget: true, // Спеціально виключено з щоденного споживчого бюджету
        tags: ["капітал", "інвестиції", "купон", "овдп"],
        created_at: "2026-09-23T12:00:00Z",
      };

      const purchaseTx: Transaction = {
        id: 702,
        amount: 8219.92,
        currency: "UAH",
        merchant_raw: "Купівля 8 облігацій ОВДП UA4000239016",
        category_name: "Інвестиції",
        type: "investment",
        source: "manual",
        exclude_from_budget: true,
        tags: ["капітал", "інвестиції", "овдп"],
        created_at: "2026-09-23T10:00:00Z",
      };

      const regularExpense: Transaction = {
        id: 703,
        amount: 450,
        currency: "UAH",
        merchant_raw: "Сільпо",
        category_name: "Продукти",
        type: "expense",
        source: "manual",
        exclude_from_budget: false,
        created_at: "2026-09-23T14:00:00Z",
      };

      const result = filterCapitalTransactions(
        [],
        [couponTx, purchaseTx, regularExpense]
      );

      expect(result.length).toBe(2);
      expect(result.find((t) => t.id === 701)).toBeDefined();
      expect(result.find((t) => t.id === 702)).toBeDefined();
      expect(result.find((t) => t.id === 703)).toBeUndefined();
    });

    it("ігнорує видалені транзакції (deleted_at)", () => {
      const activeTx: Transaction = {
        id: 801,
        amount: 1000,
        currency: "UAH",
        merchant_raw: "Скарбничка",
        category_name: "Заощадження",
        type: "transfer",
        source: "manual",
        tags: ["капітал"],
        created_at: "2026-09-23T10:00:00Z",
      };

      const deletedTx: Transaction = {
        id: 802,
        amount: 5000,
        currency: "UAH",
        merchant_raw: "Купон ОВДП",
        category_name: "Інвестиції",
        type: "investment",
        source: "manual",
        tags: ["капітал", "купон"],
        created_at: "2026-09-23T11:00:00Z",
        deleted_at: "2026-09-23T12:00:00Z",
      };

      const result = filterCapitalTransactions([], [activeTx, deletedTx]);
      expect(result.length).toBe(1);
      expect(result[0].id).toBe(801);
    });
  });

  describe("Розпізнавання знака (+/-) та напрямку коштів (CapitalHistoryItemRow & SwipeableCard)", () => {
    function determineSignAndInflow(tx: Transaction): {
      isPositive: boolean;
      isIncome: boolean;
    } {
      const isOutflow =
        tx.type === "expense" ||
        tx.tags?.includes("кредит") ||
        tx.tags?.includes("витрата") ||
        tx.tags?.includes("списання") ||
        tx.merchant_raw?.toLowerCase().includes("купівля") ||
        tx.merchant_raw?.toLowerCase().includes("сплата");

      const isInflow =
        tx.type === "income" ||
        tx.tags?.includes("дебет") ||
        tx.tags?.includes("купон") ||
        tx.tags?.includes("дохід") ||
        tx.tags?.includes("дивіденди") ||
        tx.tags?.includes("зарахування") ||
        tx.merchant_raw?.toLowerCase().includes("нарахування") ||
        tx.merchant_raw?.toLowerCase().includes("поповнення") ||
        tx.merchant_raw?.toLowerCase().includes("купон") ||
        tx.merchant_raw?.toLowerCase().includes("дивіденд") ||
        tx.merchant_raw?.toLowerCase().includes("виплата");

      const isPositive = isInflow || !isOutflow;

      const isIncome =
        tx.type === "income" ||
        (tx.type === "investment" &&
          (tx.tags?.includes("дебет") ||
            tx.tags?.includes("купон") ||
            tx.tags?.includes("дохід") ||
            tx.tags?.includes("дивіденди") ||
            tx.tags?.includes("зарахування") ||
            tx.merchant_raw?.toLowerCase().includes("нарахування") ||
            tx.merchant_raw?.toLowerCase().includes("поповнення") ||
            tx.merchant_raw?.toLowerCase().includes("купон") ||
            tx.merchant_raw?.toLowerCase().includes("дивіденд") ||
            tx.merchant_raw?.toLowerCase().includes("виплата")));

      return { isPositive, isIncome };
    }

    it("розпізнає нарахування купона ОВДП як додатну операцію (+)", () => {
      const couponTx: Transaction = {
        id: 901,
        amount: 8310.4,
        currency: "UAH",
        merchant_raw: "Нарахування купону ОВДП UA4000238976",
        category_name: "Інвестиції",
        type: "investment",
        source: "manual",
        tags: ["капітал", "купон", "овдп"],
        created_at: "2026-09-23T12:00:00Z",
      };

      const result = determineSignAndInflow(couponTx);
      expect(result.isPositive).toBe(true);
      expect(result.isIncome).toBe(true);
    });

    it("розпізнає купівлю облігацій ОВДП як списання (-)", () => {
      const buyBondsTx: Transaction = {
        id: 902,
        amount: 8219.92,
        currency: "UAH",
        merchant_raw: "Купівля 8 облігацій ОВДП UA4000239016",
        category_name: "Інвестиції",
        type: "investment",
        source: "manual",
        tags: ["капітал", "овдп", "кредит"],
        created_at: "2026-09-23T10:00:00Z",
      };

      const result = determineSignAndInflow(buyBondsTx);
      expect(result.isPositive).toBe(false);
      expect(result.isIncome).toBe(false);
    });

    it("розпізнає звичайний дохід / зарплату як додатну операцію (+)", () => {
      const salaryTx: Transaction = {
        id: 903,
        amount: 50000,
        currency: "UAH",
        merchant_raw: "Надходження коштів",
        category_name: "Зарплата/ФОП",
        type: "income",
        source: "manual",
        created_at: "2026-09-23T09:00:00Z",
      };

      const result = determineSignAndInflow(salaryTx);
      expect(result.isPositive).toBe(true);
      expect(result.isIncome).toBe(true);
    });
  });
});
