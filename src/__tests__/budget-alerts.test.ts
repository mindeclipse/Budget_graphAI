import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  formatBudgetAlertMessage,
  checkDailyBudgetThreshold,
} from "@/lib/budget-alerts";
import * as telegramModule from "@/lib/telegram";

describe("Budget Alerts Service", () => {
  describe("formatBudgetAlertMessage", () => {
    it("форматує попередження при наближенні до ліміту (85-99%)", () => {
      const message = formatBudgetAlertMessage({
        alertType: "daily_warning",
        totalSpentToday: 410,
        safeDailySpend: 478,
        daysRemaining: 29,
        cycleRemaining: 13448,
        recurringTotal: 20875,
      });

      expect(message).toContain(
        "⚠️ <b>Увага: наближення до денного ліміту!</b>"
      );
      expect(message).toContain(
        "💸 Витрачено за сьогодні: <b>410.00 ₴</b> (86% від норми)"
      );
      expect(message).toContain("🎯 Безпечний ліміт на день: <b>478.00 ₴</b>");
      expect(message).toContain(
        "📉 Вільний залишок на <b>29 дн.</b>: <b>13448.00 ₴</b>"
      );
      expect(message).toContain(
        "🔒 Зарезервовано на постійні витрати: <b>20 875 ₴</b>"
      );
    });

    it("форматує повідомлення при перевищенні денного ліміту (>=100%)", () => {
      const message = formatBudgetAlertMessage({
        alertType: "daily_exceeded",
        totalSpentToday: 900.09,
        safeDailySpend: 478,
        daysRemaining: 29,
        cycleRemaining: 12958.16,
        recurringTotal: 20875,
      });

      expect(message).toContain("⚠️ <b>Увага: денний ліміт перевищено!</b>");
      expect(message).toContain(
        "💸 Витрачено за сьогодні: <b>900.09 ₴</b> (188% від норми)"
      );
      expect(message).toContain("🎯 Безпечний ліміт на день: <b>478.00 ₴</b>");
      expect(message).toContain(
        "📉 Вільний залишок на <b>29 дн.</b>: <b>12958.16 ₴</b>"
      );
      expect(message).toContain(
        "🔒 Зарезервовано на постійні витрати: <b>20 875 ₴</b>"
      );
    });
  });

  describe("checkDailyBudgetThreshold with precomputed dailyBudget", () => {
    beforeEach(() => {
      vi.restoreAllMocks();
    });

    it("не надсилає сповіщення, якщо витрати менші за 85% від норми", async () => {
      const precomputed = {
        todayRemaining: 300,
        todayTarget: 478,
        todaySpent: 178, // ~37%
        cycleRemaining: 13500,
        daysRemaining: 29,
        recurringTotal: 20875,
      };

      const result = await checkDailyBudgetThreshold(
        undefined,
        new Date("2026-09-10T12:00:00Z"),
        precomputed
      );

      expect(result.alerted).toBe(false);
      expect(result.reason).toBe("below_threshold");
    });

    it("надсилає попередження (daily_warning) при досягненні 85% від норми", async () => {
      const precomputed = {
        todayRemaining: 68,
        todayTarget: 478,
        todaySpent: 410, // ~86%
        cycleRemaining: 13448,
        daysRemaining: 29,
        recurringTotal: 20875,
      };

      const sendTelegramMock = vi
        .spyOn(telegramModule, "sendTelegramMessage")
        .mockResolvedValue(true);

      const insertedAlerts: any[] = [];
      const fakeSupabase = {
        from: vi.fn().mockImplementation((table: string) => {
          if (table === "budget_alerts") {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({ data: [], error: null }),
              }),
              insert: vi.fn().mockImplementation((val) => {
                insertedAlerts.push(val);
                return Promise.resolve({ error: null });
              }),
            };
          }
          return {};
        }),
      };

      const result = await checkDailyBudgetThreshold(
        undefined,
        new Date("2026-09-10T16:48:00Z"),
        precomputed,
        fakeSupabase
      );

      expect(result.alerted).toBe(true);
      expect(result.alertType).toBe("daily_warning");
      expect(sendTelegramMock).toHaveBeenCalledTimes(1);
      expect(insertedAlerts.length).toBe(1);
      expect(insertedAlerts[0].alert_type).toBe("daily_warning");
    });

    it("надсилає сповіщення про перевищення (daily_exceeded) при витратах >= 100%", async () => {
      const precomputed = {
        todayRemaining: -422,
        todayTarget: 478,
        todaySpent: 900.09, // 188%
        cycleRemaining: 12958.16,
        daysRemaining: 29,
        recurringTotal: 20875,
      };

      const sendTelegramMock = vi
        .spyOn(telegramModule, "sendTelegramMessage")
        .mockResolvedValue(true);

      const insertedAlerts: any[] = [];
      const fakeSupabase = {
        from: vi.fn().mockImplementation((table: string) => {
          if (table === "budget_alerts") {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({
                  data: [{ alert_type: "daily_warning" }],
                  error: null,
                }),
              }),
              insert: vi.fn().mockImplementation((val) => {
                insertedAlerts.push(val);
                return Promise.resolve({ error: null });
              }),
            };
          }
          return {};
        }),
      };

      const result = await checkDailyBudgetThreshold(
        undefined,
        new Date("2026-09-10T20:36:00Z"),
        precomputed,
        fakeSupabase
      );

      expect(result.alerted).toBe(true);
      expect(result.alertType).toBe("daily_exceeded");
      expect(sendTelegramMock).toHaveBeenCalledTimes(1);
      expect(insertedAlerts[0].alert_type).toBe("daily_exceeded");
    });

    it("не дублює daily_exceeded, якщо воно вже було надіслано сьогодні", async () => {
      const precomputed = {
        todayRemaining: -450,
        todayTarget: 478,
        todaySpent: 928,
        cycleRemaining: 12930,
        daysRemaining: 29,
        recurringTotal: 20875,
      };

      const sendTelegramMock = vi
        .spyOn(telegramModule, "sendTelegramMessage")
        .mockResolvedValue(true);

      const fakeSupabase = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({
              data: [{ alert_type: "daily_exceeded" }],
              error: null,
            }),
          }),
        }),
      };

      const result = await checkDailyBudgetThreshold(
        undefined,
        new Date("2026-09-10T21:00:00Z"),
        precomputed,
        fakeSupabase
      );

      expect(result.alerted).toBe(false);
      expect(result.reason).toBe("already_exceeded_notified_today");
      expect(sendTelegramMock).not.toHaveBeenCalled();
    });
  });
});
