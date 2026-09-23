import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "@/app/api/cron/calendar-alerts/route";
import { NextRequest } from "next/server";

vi.mock("@/lib/telegram", () => ({
  sendTelegramMessage: vi.fn().mockResolvedValue(true),
}));

const mockFrom = vi.fn();
vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdmin: () => ({
    from: mockFrom,
  }),
}));

describe("Calendar Alerts Cron (/api/cron/calendar-alerts)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("знаходить події на найближчі дні та відправляє радар у Telegram", async () => {
    const now = new Date();
    const kyivIso = now.toLocaleDateString("en-CA", {
      timeZone: "Europe/Kyiv",
    });
    const [kyivYear, kyivMonth, kyivDay] = kyivIso.split("-").map(Number);
    const today = new Date(kyivYear, kyivMonth - 1, kyivDay);
    const todayDay = today.getDate();

    // Дата через 3 дні
    const in3Days = new Date(today);
    in3Days.setDate(today.getDate() + 3);
    const dy = in3Days.getFullYear();
    const dm = String(in3Days.getMonth() + 1).padStart(2, "0");
    const dd = String(in3Days.getDate()).padStart(2, "0");
    const in3DaysIso = `${dy}-${dm}-${dd}`;

    mockFrom.mockImplementation((table: string) => {
      if (table === "budget_cycles") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({
            data: {
              id: "cycle-test",
              name: "Тестовий цикл",
              end_date: in3DaysIso,
            },
            error: null,
          }),
        };
      }
      if (table === "recurring_templates") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({
            data: [
              {
                id: 1,
                title: "Spotify Family",
                amount: 199,
                currency: "UAH",
                day_of_month: todayDay, // сьогодні!
                is_active: true,
              },
            ],
            error: null,
          }),
        };
      }
      if (table === "investments") {
        return {
          select: vi.fn().mockResolvedValue({
            data: [
              {
                id: 5,
                asset_name: "ОВДП UA4000",
                asset_type: "bonds",
                invested_amount: 20000,
                current_value: 23000,
                currency: "UAH",
                maturity_date: in3DaysIso, // через 3 дні!
              },
            ],
            error: null,
          }),
        };
      }
      if (table === "financial_events") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({
            data: [
              {
                id: 201,
                title: "Податок ФОП",
                amount: 1600,
                currency: "UAH",
                event_date: in3DaysIso,
                notify_days_before: [7, 3, 1],
                is_completed: false,
                event_type: "expense",
              },
            ],
            error: null,
          }),
          update: vi.fn().mockReturnValue({
            in: vi.fn().mockResolvedValue({ error: null }),
          }),
        };
      }
      return {
        select: vi.fn().mockReturnThis(),
      };
    });

    const { sendTelegramMessage } = await import("@/lib/telegram");

    const req = new NextRequest(
      "http://localhost:3000/api/cron/calendar-alerts?force=true"
    );
    const res = await GET(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.sent).toBe(true);
    expect(json.alertsCount).toBeGreaterThanOrEqual(2);

    expect(sendTelegramMessage).toHaveBeenCalled();
    const sentMessage = vi.mocked(sendTelegramMessage).mock.calls[0][0];
    expect(sentMessage).toContain("Фінансовий радар");
    expect(sentMessage).toContain("Spotify Family");
    expect(sentMessage).toContain("ОВДП UA4000");
  });

  it("надсилає сповіщення за 30 днів про погашення ОВДП та купонну виплату", async () => {
    const now = new Date();
    const kyivIso = now.toLocaleDateString("en-CA", {
      timeZone: "Europe/Kyiv",
    });
    const [kyivYear, kyivMonth, kyivDay] = kyivIso.split("-").map(Number);
    const today = new Date(kyivYear, kyivMonth - 1, kyivDay);

    // Дата через 30 днів
    const in30Days = new Date(today);
    in30Days.setDate(today.getDate() + 30);
    const dy = in30Days.getFullYear();
    const dm = String(in30Days.getMonth() + 1).padStart(2, "0");
    const dd = String(in30Days.getDate()).padStart(2, "0");
    const in30DaysIso = `${dy}-${dm}-${dd}`;

    mockFrom.mockImplementation((table: string) => {
      if (table === "budget_cycles") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        };
      }
      if (table === "recurring_templates") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({ data: [], error: null }),
        };
      }
      if (table === "investments") {
        return {
          select: vi.fn().mockResolvedValue({
            data: [
              {
                id: 101,
                asset_name: "ОВДП Погашення-30",
                asset_type: "bonds",
                invested_amount: 50000,
                current_value: 50000,
                currency: "UAH",
                maturity_date: in30DaysIso,
                coupons: [
                  {
                    id: "c-30",
                    amount: 4200,
                    date: in30DaysIso,
                  },
                ],
              },
            ],
            error: null,
          }),
        };
      }
      if (table === "financial_events") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({ data: [], error: null }),
          update: vi.fn().mockReturnValue({
            in: vi.fn().mockResolvedValue({ error: null }),
          }),
        };
      }
      return {
        select: vi.fn().mockReturnThis(),
      };
    });

    const { sendTelegramMessage } = await import("@/lib/telegram");

    const req = new NextRequest(
      "http://localhost:3000/api/cron/calendar-alerts?force=true"
    );
    const res = await GET(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.alertsCount).toBe(2); // 1 погашення + 1 купон

    expect(sendTelegramMessage).toHaveBeenCalled();
    const sentMessage = vi.mocked(sendTelegramMessage).mock.calls[0][0];
    expect(sentMessage).toContain("Через 30 днів (місяць)");
    expect(sentMessage).toContain("Погашення ОВДП: ОВДП Погашення-30");
    expect(sentMessage).toContain("Купонна виплата ОВДП: ОВДП Погашення-30");
    expect(sentMessage).toMatch(/4[\s\u00a0]200/);
  });
});
