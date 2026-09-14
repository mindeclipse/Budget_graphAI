import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  generateFridayRadarAlert,
  generateMondayResetAlert,
  validateCronAuthorization,
} from "@/lib/pacing-alerts";

// Mock @/lib/telegram
vi.mock("@/lib/telegram", () => ({
  sendTelegramMessage: vi.fn().mockResolvedValue(true),
  escapeHtml: (str: string) => str,
}));

describe("Proactive Pacing Scheduled Alerts (Step 4)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("generateFridayRadarAlert", () => {
    it("формує та надсилає п'ятничний вікенд-радар із 3-денним буфером і скарбничками", async () => {
      // 18 вересня 2026 (П'ятниця)
      const fridayDate = new Date("2026-09-18T09:30:00.000Z");

      const mockSupabase = {
        from: vi.fn().mockImplementation((table: string) => {
          if (table === "budget_alerts") {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              maybeSingle: vi
                .fn()
                .mockResolvedValue({ data: null, error: null }),
              insert: vi.fn().mockResolvedValue({ error: null }),
            };
          }
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
                error: null,
              }),
            };
          }
          if (table === "transactions") {
            return {
              select: vi.fn().mockReturnThis(),
              is: vi.fn().mockReturnThis(),
              gte: vi.fn().mockReturnThis(),
              lte: vi.fn().mockResolvedValue({
                data: [
                  {
                    id: 1,
                    amount: 4000,
                    type: "expense",
                    created_at: "2026-09-10T12:00:00Z",
                  },
                ],
                error: null,
              }),
            };
          }
          if (table === "recurring_templates") {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockResolvedValue({
                data: [{ name: "Netflix", amount: 400, day_of_month: 25 }],
                error: null,
              }),
            };
          }
          return {
            select: vi.fn().mockReturnThis(),
          };
        }),
      };

      const { sendTelegramMessage } = await import("@/lib/telegram");

      const result = await generateFridayRadarAlert({
        now: fridayDate,
        supabaseInstance: mockSupabase,
      });

      expect(result.success).toBe(true);
      expect(result.sent).toBe(true);
      expect(result.alertType).toBe("pacing_friday_radar");
      expect(result.data.weekendThreeDayTotal).toBeGreaterThan(0);
      expect(sendTelegramMessage).toHaveBeenCalledWith(
        expect.stringContaining("П'ятничний радар вихідних"),
        expect.any(Object)
      );
    });

    it("запобігає дублюванню сповіщення, якщо воно вже надсилалось сьогодні", async () => {
      const fridayDate = new Date("2026-09-18T10:00:00.000Z");

      const mockSupabase = {
        from: vi.fn().mockImplementation((table: string) => {
          if (table === "budget_alerts") {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              // Вже є запис за сьогодні
              maybeSingle: vi.fn().mockResolvedValue({
                data: { id: 99, alert_type: "pacing_friday_radar" },
                error: null,
              }),
            };
          }
          return { select: vi.fn().mockReturnThis() };
        }),
      };

      const { sendTelegramMessage } = await import("@/lib/telegram");

      const result = await generateFridayRadarAlert({
        now: fridayDate,
        supabaseInstance: mockSupabase,
      });

      expect(result.success).toBe(true);
      expect(result.sent).toBe(false);
      expect(result.reason).toBe("already_sent_today");
      expect(sendTelegramMessage).not.toHaveBeenCalled();
    });

    it("ігнорує дедуплікацію та відправляє при force: true", async () => {
      const fridayDate = new Date("2026-09-18T10:00:00.000Z");

      const mockSupabase = {
        from: vi.fn().mockImplementation((table: string) => {
          if (table === "budget_alerts") {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({
                data: { id: 99, alert_type: "pacing_friday_radar" },
                error: null,
              }),
              insert: vi.fn().mockResolvedValue({ error: null }),
            };
          }
          if (table === "budget_cycles") {
            return {
              select: vi.fn().mockReturnThis(),
              order: vi.fn().mockReturnThis(),
              limit: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({
                data: { monthly_limit: 25000 },
                error: null,
              }),
            };
          }
          if (table === "transactions") {
            return {
              select: vi.fn().mockReturnThis(),
              is: vi.fn().mockReturnThis(),
              gte: vi.fn().mockReturnThis(),
              lte: vi.fn().mockResolvedValue({ data: [] }),
            };
          }
          if (table === "recurring_templates") {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockResolvedValue({ data: [] }),
            };
          }
          return { select: vi.fn().mockReturnThis() };
        }),
      };

      const { sendTelegramMessage } = await import("@/lib/telegram");

      const result = await generateFridayRadarAlert({
        force: true,
        now: fridayDate,
        supabaseInstance: mockSupabase,
      });

      expect(result.success).toBe(true);
      expect(result.sent).toBe(true);
      expect(sendTelegramMessage).toHaveBeenCalled();
    });
  });

  describe("generateMondayResetAlert", () => {
    it("аналізує витрати за минулі вихідні та розраховує свіжий темп на робочий тиждень", async () => {
      // 21 вересня 2026 (Понеділок)
      const mondayDate = new Date("2026-09-21T09:00:00.000Z");

      const mockSupabase = {
        from: vi.fn().mockImplementation((table: string) => {
          if (table === "budget_alerts") {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              maybeSingle: vi
                .fn()
                .mockResolvedValue({ data: null, error: null }),
              insert: vi.fn().mockResolvedValue({ error: null }),
            };
          }
          if (table === "budget_cycles") {
            return {
              select: vi.fn().mockReturnThis(),
              order: vi.fn().mockReturnThis(),
              limit: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({
                data: {
                  monthly_limit: 30000,
                  start_date: "2026-09-01T00:00:00Z",
                  end_date: "2026-09-30T23:59:59Z",
                },
                error: null,
              }),
            };
          }
          if (table === "transactions") {
            return {
              select: vi.fn().mockReturnThis(),
              is: vi.fn().mockReturnThis(),
              gte: vi.fn().mockReturnThis(),
              lte: vi.fn().mockResolvedValue({
                data: [
                  // Витрати в п'ятницю 18 вересня (вихідні)
                  {
                    id: 1,
                    amount: 600,
                    type: "expense",
                    created_at: "2026-09-18T19:00:00Z",
                  },
                  // Витрати в суботу 19 вересня (вихідні)
                  {
                    id: 2,
                    amount: 400,
                    type: "expense",
                    created_at: "2026-09-19T14:00:00Z",
                  },
                ],
                error: null,
              }),
            };
          }
          if (table === "recurring_templates") {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockResolvedValue({ data: [] }),
            };
          }
          return { select: vi.fn().mockReturnThis() };
        }),
      };

      const { sendTelegramMessage } = await import("@/lib/telegram");

      const result = await generateMondayResetAlert({
        now: mondayDate,
        supabaseInstance: mockSupabase,
      });

      expect(result.success).toBe(true);
      expect(result.sent).toBe(true);
      expect(result.alertType).toBe("pacing_monday_reset");
      expect(result.data.weekendSpent).toBe(1000); // 600 + 400
      expect(result.data.weekendTxsCount).toBe(2);
      expect(sendTelegramMessage).toHaveBeenCalledWith(
        expect.stringContaining("Понеділковий Runway Reset"),
        expect.any(Object)
      );
    });
  });

  describe("CRON Authorization Security (timingSafeEqual)", () => {
    it("відхиляє запит при недійсному Bearer токені", () => {
      const valid = validateCronAuthorization(
        "Bearer wrong-token",
        "super-secret-cron-token"
      );
      expect(valid).toBe(false);
    });

    it("відхиляє запит без заголовка authorization", () => {
      const valid = validateCronAuthorization(null, "super-secret-cron-token");
      expect(valid).toBe(false);
    });

    it("успішно валідує правильний Bearer токен через timingSafeEqual", () => {
      const valid = validateCronAuthorization(
        "Bearer super-secret-cron-token",
        "super-secret-cron-token"
      );
      expect(valid).toBe(true);
    });

    it("у dev режимі без налаштованого CRON_SECRET дозволяє запуск", () => {
      const origNodeEnv = process.env.NODE_ENV;
      (process.env as any).NODE_ENV = "development";
      const valid = validateCronAuthorization(null, undefined);
      expect(valid).toBe(true);
      (process.env as any).NODE_ENV = origNodeEnv;
    });
  });
});
