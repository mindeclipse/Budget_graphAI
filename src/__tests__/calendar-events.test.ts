import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET, POST, PATCH, DELETE } from "@/app/api/calendar/events/route";
import { NextRequest } from "next/server";

vi.mock("@/lib/session", () => ({
  verifySessionToken: vi.fn().mockResolvedValue({ valid: true }),
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn().mockResolvedValue({
    get: vi.fn().mockReturnValue({ value: "test-token" }),
  }),
}));

const mockFrom = vi.fn();
vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdmin: () => ({
    from: mockFrom,
  }),
}));

describe("Calendar Events API (/api/calendar/events)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("GET", () => {
    it("агрегує межі циклу, регулярні платежі, інвестиційні виплати та кастомні події", async () => {
      mockFrom.mockImplementation((table: string) => {
        if (table === "budget_cycles") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
              data: {
                id: "cycle-sept-2026",
                name: "Вересень 2026",
                start_date: "2026-09-01",
                end_date: "2026-09-30",
                budget_limit: 45000,
                is_active: true,
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
                  title: "Netflix Premium",
                  amount: 400,
                  currency: "UAH",
                  category_name: "Підписки",
                  day_of_month: 15,
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
                  id: 10,
                  asset_name: "ОВДП UA400022",
                  asset_type: "bonds",
                  invested_amount: 50000,
                  current_value: 52000,
                  currency: "UAH",
                  yield_percent: 16.5,
                  maturity_date: "2026-09-24",
                  notes: null,
                },
                {
                  id: 11,
                  asset_name: "Inzhur Supermarket",
                  asset_type: "reit",
                  invested_amount: 100000,
                  current_value: 100000,
                  currency: "UAH",
                  yield_percent: 10,
                  maturity_date: null,
                  notes: "щомісячні виплати 20 числа",
                },
              ],
              error: null,
            }),
          };
        }
        if (table === "financial_events") {
          return {
            select: vi.fn().mockReturnThis(),
            order: vi.fn().mockResolvedValue({
              data: [
                {
                  id: 101,
                  title: "Сплата ЄП ФОП 3 група",
                  amount: 1500,
                  currency: "UAH",
                  event_date: "2026-09-20",
                  is_recurring: false,
                  category: "Податки",
                  event_type: "expense",
                  notify_days_before: [7, 3, 1],
                  is_completed: false,
                },
              ],
              error: null,
            }),
          };
        }
        return {
          select: vi.fn().mockReturnThis(),
        };
      });

      const req = new NextRequest(
        "http://localhost:3000/api/calendar/events?month=2026-09"
      );
      const res = await GET(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.month).toBe("2026-09");

      // Перевірка агрегованих подій
      const eventIds = json.events.map((e: any) => e.id);
      expect(eventIds).toContain("cycle-start-cycle-sept-2026");
      expect(eventIds).toContain("cycle-end-cycle-sept-2026");
      expect(eventIds).toContain("recurring-1");
      expect(eventIds).toContain("investment-maturity-10");
      expect(eventIds).toContain("custom-101");
    });
  });

  describe("POST", () => {
    it("створює нову кастомну подію з валідацією", async () => {
      const mockInsert = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: { id: 102, title: "Страховка авто", amount: 2500 },
            error: null,
          }),
        }),
      });

      mockFrom.mockReturnValue({
        insert: mockInsert,
      });

      const req = new Request("http://localhost:3000/api/calendar/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Страховка авто",
          amount: 2500,
          currency: "UAH",
          event_date: "2026-09-28",
          event_type: "expense",
          notify_days_before: [7, 3],
        }),
      });

      const res = await POST(req);
      const json = await res.json();

      expect(res.status).toBe(201);
      expect(json.success).toBe(true);
      expect(json.event.title).toBe("Страховка авто");
    });
  });

  describe("DELETE", () => {
    it("видаляє кастомну подію за id", async () => {
      mockFrom.mockReturnValue({
        delete: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
      });

      const req = new Request(
        "http://localhost:3000/api/calendar/events?id=102",
        {
          method: "DELETE",
        }
      );

      const res = await DELETE(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.deletedId).toBe(102);
    });
  });
});
