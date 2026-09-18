import { describe, it, expect } from "vitest";
import { timingSafeEqual } from "@/lib/security";
import { buildUpcomingSchedule } from "@/lib/subscription-radar";
import { Transaction, RecurringItem } from "@/types/finance";

describe("iOS Scriptable Widget Summary Logic", () => {
  describe("Розрахунок статусу денного темпу (Pace Status)", () => {
    const calculatePaceStatus = (
      todaySpent: number,
      safeDailySpend: number
    ): "on_track" | "warning" | "exceeded" => {
      if (safeDailySpend > 0) {
        if (todaySpent > safeDailySpend) {
          return "exceeded";
        } else if (todaySpent >= safeDailySpend * 0.85) {
          return "warning";
        }
        return "on_track";
      }
      return todaySpent > 0 ? "exceeded" : "on_track";
    };

    it("визначає статус 'on_track' (зелений), коли витрати в межах норми (<85%)", () => {
      const safeDailySpend = 600;
      const todaySpent = 350; // ~58%
      expect(calculatePaceStatus(todaySpent, safeDailySpend)).toBe("on_track");
    });

    it("визначає статус 'warning' (жовтий), коли витрати наближаються до ліміту (85-100%)", () => {
      const safeDailySpend = 600;
      const todaySpent = 520; // 86.6%
      expect(calculatePaceStatus(todaySpent, safeDailySpend)).toBe("warning");
    });

    it("визначає статус 'exceeded' (червоний), коли денну норму перевищено (>100%)", () => {
      const safeDailySpend = 600;
      const todaySpent = 750; // 125%
      expect(calculatePaceStatus(todaySpent, safeDailySpend)).toBe("exceeded");
    });

    it("коректно обробляє нульовий ліміт", () => {
      expect(calculatePaceStatus(0, 0)).toBe("on_track");
      expect(calculatePaceStatus(50, 0)).toBe("exceeded");
    });
  });

  describe("Розрахунок залишку на день та безпечного темпу", () => {
    it("розраховує сьогоднішній залишок і не опускає його нижче 0", () => {
      const safeDaily = 500;
      const spent1 = 200;
      const remaining1 = Math.max(0, safeDaily - spent1);
      expect(remaining1).toBe(300);

      const spentOver = 650;
      const remainingOver = Math.max(0, safeDaily - spentOver);
      expect(remainingOver).toBe(0);
    });

    it("розраховує безпечний щоденний темп із залишку циклу", () => {
      const cycleRemainingBudget = 6500;
      const daysRemaining = 10;
      const safeDaily = Math.max(
        0,
        Math.round(cycleRemainingBudget / Math.max(1, daysRemaining))
      );
      expect(safeDaily).toBe(650);
    });
  });

  describe("Безпека авторизації Bearer токена", () => {
    it("успішно підтверджує коректний Bearer токен через timingSafeEqual", () => {
      const secret = "super_secret_widget_key_999";
      const header = `Bearer ${secret}`;

      expect(timingSafeEqual(header, `Bearer ${secret}`)).toBe(true);
    });

    it("відхиляє некоректний або підроблений токен", () => {
      const secret = "super_secret_widget_key_999";
      const fakeHeader = "Bearer wrong_secret_key";

      expect(timingSafeEqual(fakeHeader, `Bearer ${secret}`)).toBe(false);
    });
  });

  describe("Виключення регулярних підписок з щоденних витрат (todaySpent)", () => {
    it("виключає транзакції з source='recurring' та зіставлені підписки з todaySpent", () => {
      const recurringItems: RecurringItem[] = [
        {
          id: 42,
          title: "Spotify",
          amount: 199,
          currency: "UAH",
          day_of_month: 18,
          is_active: true,
          category_name: "Підписки та сервіси",
        },
      ];

      const now = new Date("2026-09-18T10:00:00Z");

      const cycleTransactions: Transaction[] = [
        // Регулярне списання за підписку Spotify сьогодні
        {
          id: 1001,
          amount: 199,
          currency: "UAH",
          type: "expense",
          source: "recurring",
          merchant_raw: "Spotify AB",
          category_name: "Підписки та сервіси",
          exclude_from_budget: false,
          created_at: "2026-09-18T08:00:00Z",
        },
        // Звичайна покупка сьогодні (кава)
        {
          id: 1002,
          amount: 85,
          currency: "UAH",
          type: "expense",
          source: "monobank",
          merchant_raw: "Coffee Spot",
          category_name: "Кафе",
          exclude_from_budget: false,
          created_at: "2026-09-18T09:30:00Z",
        },
      ];

      const upcomingSchedule = buildUpcomingSchedule(
        recurringItems,
        cycleTransactions,
        41.5,
        now
      );

      const paidRecurringTxIds = new Set(
        upcomingSchedule.upcoming
          .filter(
            (u) => u.status === "paid" && u.matched_transaction_id != null
          )
          .map((u) => u.matched_transaction_id!)
      );

      const isRecurringTx = (t: Transaction) =>
        t.source === "recurring" ||
        (t.id != null && paidRecurringTxIds.has(t.id)) ||
        Boolean((t.metadata as any)?.recurring_id);

      const todayAllTx = cycleTransactions;
      const todayDiscretionaryTx = todayAllTx.filter((t) => !isRecurringTx(t));
      const todayRecurringTx = todayAllTx.filter((t) => isRecurringTx(t));

      const todaySpent = Math.round(
        todayDiscretionaryTx.reduce((sum, t) => sum + Number(t.amount || 0), 0)
      );
      const todayRecurringSpent = Math.round(
        todayRecurringTx.reduce((sum, t) => sum + Number(t.amount || 0), 0)
      );

      expect(todaySpent).toBe(85); // Тільки кава, БЕЗ Spotify!
      expect(todayRecurringSpent).toBe(199); // Spotify зафіксовано як підписка
    });

    it("також виключає звичайні транзакції за карткою, що збіглися з активною підпискою", () => {
      const recurringItems: RecurringItem[] = [
        {
          id: 50,
          title: "Netflix",
          amount: 390,
          currency: "UAH",
          day_of_month: 18,
          is_active: true,
          category_name: "Підписки та сервіси",
        },
      ];

      const now = new Date("2026-09-18T10:00:00Z");

      // Транзакція прийшла з monobank (не cron, а карткове списання)
      const cycleTransactions: Transaction[] = [
        {
          id: 2001,
          amount: 390,
          currency: "UAH",
          type: "expense",
          source: "monobank",
          merchant_raw: "Netflix.com Amsterdam NL",
          category_name: "Підписки та сервіси",
          exclude_from_budget: false,
          created_at: "2026-09-18T06:00:00Z",
        },
      ];

      const upcomingSchedule = buildUpcomingSchedule(
        recurringItems,
        cycleTransactions,
        41.5,
        now
      );

      const paidRecurringTxIds = new Set(
        upcomingSchedule.upcoming
          .filter(
            (u) => u.status === "paid" && u.matched_transaction_id != null
          )
          .map((u) => u.matched_transaction_id!)
      );

      expect(paidRecurringTxIds.has(2001)).toBe(true);

      const isRecurringTx = (t: Transaction) =>
        t.source === "recurring" ||
        (t.id != null && paidRecurringTxIds.has(t.id)) ||
        Boolean((t.metadata as any)?.recurring_id);

      const todayDiscretionaryTx = cycleTransactions.filter(
        (t) => !isRecurringTx(t)
      );
      const todaySpent = Math.round(
        todayDiscretionaryTx.reduce((sum, t) => sum + Number(t.amount || 0), 0)
      );

      expect(todaySpent).toBe(0); // Netflix не зменшує денний ліміт!
    });
  });
});
