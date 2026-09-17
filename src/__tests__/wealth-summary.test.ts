import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock cookies
const mockCookieGet = vi.fn();
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: mockCookieGet,
  }),
}));

// Mock verifySessionToken
const mockVerifySessionToken = vi.fn();
vi.mock("@/lib/session", () => ({
  verifySessionToken: (token?: string) => mockVerifySessionToken(token),
}));

// Mock currency
vi.mock("@/lib/currency", () => ({
  getCommercialRates: vi.fn().mockResolvedValue({
    USD: 41.5,
    EUR: 45.3,
    PLN: 10.6,
    updatedAt: 1726000000000,
    source: "monobank",
  }),
}));

// Mock supabase-admin
const mockFrom = vi.fn();
vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdmin: () => ({
    from: mockFrom,
  }),
}));

import { GET } from "@/app/api/wealth/summary/route";

describe("GET /api/wealth/summary - Batched Wealth Data API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("повертає 401 Unauthorized, якщо сесія відсутня або невалідна", async () => {
    mockCookieGet.mockReturnValue(undefined);
    mockVerifySessionToken.mockResolvedValue({ valid: false });

    const res = await GET();
    expect(res.status).toBe(401);

    const json = await res.json();
    expect(json.error).toBe("Unauthorized");
  });

  it("успішно агрегує всі вторинні вибірки та повертає коректний Cache-Control", async () => {
    mockCookieGet.mockReturnValue({ value: "valid_session" });
    mockVerifySessionToken.mockResolvedValue({ valid: true });

    mockFrom.mockImplementation((tableName: string) => {
      if (tableName === "savings_goals") {
        return {
          select: () => ({
            order: () =>
              Promise.resolve({
                data: [
                  {
                    id: 1,
                    name: "Резерв",
                    current_amount: 1000,
                    target_amount: 5000,
                    currency: "USD",
                  },
                ],
                error: null,
              }),
          }),
        };
      }
      if (tableName === "investments") {
        return {
          select: () => ({
            order: () =>
              Promise.resolve({
                data: [
                  {
                    id: 10,
                    asset_name: "ОВДП",
                    current_value: 50000,
                    currency: "UAH",
                  },
                ],
                error: null,
              }),
          }),
        };
      }
      if (tableName === "category_budgets") {
        return {
          select: () => ({
            order: () =>
              Promise.resolve({
                data: [
                  { id: 1, category_name: "Продукти", monthly_limit: 12000 },
                  { id: 2, category_name: "Кафе", monthly_limit: 4000 },
                ],
                error: null,
              }),
          }),
        };
      }
      if (tableName === "wishlist_items") {
        return {
          select: () => ({
            order: () =>
              Promise.resolve({
                data: [
                  {
                    id: 101,
                    item_name: "Навушники",
                    estimated_price: 3500,
                    status: "cooling",
                    cooling_end_date: new Date(
                      Date.now() - 10000
                    ).toISOString(), // минула дата -> ready
                  },
                ],
                error: null,
              }),
          }),
        };
      }
      if (tableName === "cost_per_use_items") {
        return {
          select: () => ({
            order: () =>
              Promise.resolve({
                data: [
                  {
                    id: 201,
                    item_name: "Рюкзак",
                    purchase_price: 2400,
                    total_uses: 24,
                    benchmark_cost_per_use: 150,
                  },
                ],
                error: null,
              }),
          }),
        };
      }
      return {
        select: () => ({
          order: () => Promise.resolve({ data: [], error: null }),
        }),
      };
    });

    const res = await GET();
    expect(res.status).toBe(200);

    // Перевірка захисного заголовка приватного кешу
    const cacheControl = res.headers.get("Cache-Control");
    expect(cacheControl).toContain("private");
    expect(cacheControl).toContain("max-age=60");

    const json = await res.json();
    expect(json.success).toBe(true);

    // Перевірка скарбничок та інвестицій
    expect(json.goals).toHaveLength(1);
    expect(json.goals[0].name).toBe("Резерв");
    expect(json.investments).toHaveLength(1);
    expect(json.investments[0].asset_name).toBe("ОВДП");

    // Перевірка мапи лімітів категорій
    expect(json.categoryBudgets).toEqual({
      Продукти: 12000,
      Кафе: 4000,
    });

    // Перевірка курсів
    expect(json.rates.USD).toBe(41.5);

    // Перевірка вішліста (cooling_end_date минула -> статус ready)
    expect(json.wishlist.items[0].status).toBe("ready");
    expect(json.wishlist.metrics.ready_count).toBe(1);

    // Перевірка вартості за використання: 2400 / 24 = 100 грн/використання
    expect(json.costPerUse.items[0].current_cost_per_use).toBe(100);
    // Економія: (150 * 24) - 2400 = 3600 - 2400 = 1200 грн
    expect(json.costPerUse.items[0].money_saved).toBe(1200);
  });
});
