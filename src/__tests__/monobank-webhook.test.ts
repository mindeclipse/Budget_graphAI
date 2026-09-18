import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// Мокаємо залежності до імпорту роута
const mockUpsert = vi.fn();
const mockFrom = vi.fn();
const mockCheckDailyBudgetThreshold = vi.fn();

vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdmin: () => ({
    from: mockFrom,
  }),
}));

vi.mock("@/lib/budget-alerts", () => ({
  checkDailyBudgetThreshold: () => mockCheckDailyBudgetThreshold(),
}));

vi.mock("@/lib/currency", () => ({
  getUsdRate: vi.fn(async () => 41.5),
  getCurrencyRate: vi.fn(async (currency: string) => {
    if (currency === "USD") return 41.5;
    if (currency === "EUR") return 45.0;
    return 1;
  }),
  isoCodeToCurrency: (code: number) => {
    switch (code) {
      case 840:
        return "USD";
      case 978:
        return "EUR";
      case 985:
        return "PLN";
      default:
        return "UAH";
    }
  },
}));

describe("Monobank Webhook Handler (POST /api/webhooks/monobank)", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = {
      ...originalEnv,
      MONOBANK_WEBHOOK_SECRET: "test_secret_key_123",
    };

    mockUpsert.mockReturnValue({
      select: () => ({
        maybeSingle: async () => ({ data: { id: 101 } }),
      }),
    });

    mockFrom.mockImplementation((table: string) => {
      if (table === "merchant_rules") {
        return {
          select: () => ({
            data: [
              {
                pattern: "wog",
                clean_merchant: "АЗС WOG",
                category_name: "Авто",
              },
              {
                pattern: "silpo",
                clean_merchant: "Сільпо",
                category_name: "Продукти",
              },
            ],
          }),
        };
      }
      if (table === "transactions") {
        return {
          upsert: mockUpsert,
        };
      }
      return { select: () => ({ data: [] }) };
    });
  });

  it("відхиляє 401 Unauthorized, якщо секрет не передано або він невірний", async () => {
    const { POST, GET } = await import("@/app/api/webhooks/monobank/route");

    const reqGet = new NextRequest(
      "https://example.com/api/webhooks/monobank?secret=wrong_secret"
    );
    const resGet = await GET(reqGet);
    expect(resGet.status).toBe(401);

    const reqPost = new NextRequest(
      "https://example.com/api/webhooks/monobank?secret=wrong_secret",
      {
        method: "POST",
        body: JSON.stringify({ type: "StatementItem" }),
      }
    );
    const resPost = await POST(reqPost);
    expect(resPost.status).toBe(401);
  });

  it("успішно підтверджує валідацію вебхука GET 200 OK при вірному секреті", async () => {
    const { GET } = await import("@/app/api/webhooks/monobank/route");

    const req = new NextRequest(
      "https://example.com/api/webhooks/monobank?secret=test_secret_key_123"
    );
    const res = await GET(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe("ok");
  });

  it("застосовує правило з merchant_rules замість стандартного MCC", async () => {
    const { POST } = await import("@/app/api/webhooks/monobank/route");

    // Monobank надсилає WOG (mcc: 5411 Продукти або 5541 АЗС)
    const payload = {
      type: "StatementItem",
      data: {
        account: "test_acc",
        statementItem: {
          id: "mono_tx_001",
          time: 1726650000,
          description: "WOG AZS #42 Kyiv",
          mcc: 5411, // Зазвичай Продукти
          amount: -120000, // -1200.00 грн
          operationAmount: -120000,
          currencyCode: 980,
        },
      },
    };

    const req = new NextRequest(
      "https://example.com/api/webhooks/monobank?secret=test_secret_key_123",
      {
        method: "POST",
        body: JSON.stringify(payload),
      }
    );

    const res = await POST(req);
    expect(res.status).toBe(200);

    // Перевіряємо параметри upsert
    expect(mockUpsert).toHaveBeenCalledTimes(1);
    const insertedTx = mockUpsert.mock.calls[0][0];

    // Правило перекриває назву та категорію
    expect(insertedTx.merchant_raw).toBe("АЗС WOG");
    expect(insertedTx.category_name).toBe("Авто");
    expect(insertedTx.amount).toBe(1200);
    expect(insertedTx.currency).toBe("UAH");
    expect(insertedTx.source).toBe("monobank");
    expect(insertedTx.type).toBe("expense");
  });

  it("коректно конвертує операції з валютних карток Monobank (USD/EUR)", async () => {
    const { POST } = await import("@/app/api/webhooks/monobank/route");

    const payload = {
      type: "StatementItem",
      data: {
        account: "test_acc_usd",
        statementItem: {
          id: "mono_tx_usd_99",
          time: 1726651000,
          description: "DigitalOcean Cloud",
          mcc: 7372,
          amount: -2000, // -20.00 USD
          operationAmount: -2000,
          currencyCode: 840, // USD
        },
      },
    };

    const req = new NextRequest(
      "https://example.com/api/webhooks/monobank?secret=test_secret_key_123",
      {
        method: "POST",
        body: JSON.stringify(payload),
      }
    );

    const res = await POST(req);
    expect(res.status).toBe(200);

    expect(mockUpsert).toHaveBeenCalledTimes(1);
    const insertedTx = mockUpsert.mock.calls[0][0];

    // 20 USD * 41.5 = 830 грн
    expect(insertedTx.amount).toBe(830);
    expect(insertedTx.currency).toBe("UAH");
    expect(insertedTx.original_amount).toBe(20);
    expect(insertedTx.original_currency).toBe("USD");
  });

  it("зберігає original_amount для крос-бордер платежів з гривневої картки", async () => {
    const { POST } = await import("@/app/api/webhooks/monobank/route");

    const payload = {
      type: "StatementItem",
      data: {
        account: "test_acc_uah",
        statementItem: {
          id: "mono_tx_crossborder",
          time: 1726652000,
          description: "Airbnb Ireland",
          mcc: 7011,
          amount: -415000, // Списано 4 150.00 UAH
          operationAmount: -10000, // Оригінальна ціна 100.00 USD
          currencyCode: 980, // Рахунок UAH
        },
      },
    };

    const req = new NextRequest(
      "https://example.com/api/webhooks/monobank?secret=test_secret_key_123",
      {
        method: "POST",
        body: JSON.stringify(payload),
      }
    );

    const res = await POST(req);
    expect(res.status).toBe(200);

    const insertedTx = mockUpsert.mock.calls[0][0];
    expect(insertedTx.amount).toBe(4150);
    expect(insertedTx.currency).toBe("UAH");
    expect(insertedTx.original_amount).toBe(100);
  });
});
