import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  getCommercialRates,
  getCurrencyRate,
  getUsdRate,
  _resetCurrencyCacheForTesting,
} from "@/lib/currency";
import * as supabaseAdminModule from "@/lib/supabase-admin";

describe("Commercial Currency Service", () => {
  const mockMonoData = [
    {
      currencyCodeA: 840, // USD
      currencyCodeB: 980, // UAH
      date: 1700000000,
      rateSell: 41.85,
      rateBuy: 41.25,
    },
    {
      currencyCodeA: 978, // EUR
      currencyCodeB: 980, // UAH
      date: 1700000000,
      rateSell: 45.6,
      rateBuy: 44.9,
    },
    {
      currencyCodeA: 985, // PLN
      currencyCodeB: 980, // UAH
      date: 1700000000,
      rateCross: 10.75,
    },
  ];

  beforeEach(() => {
    vi.restoreAllMocks();
    _resetCurrencyCacheForTesting();
  });

  it("повертає курс 1 для UAH", async () => {
    const rate = await getCurrencyRate("UAH");
    expect(rate).toBe(1);
  });

  it("повертає числові комерційні курси для USD, EUR, PLN", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => mockMonoData,
    } as any);

    const rates = await getCommercialRates();
    expect(rates).toBeDefined();
    expect(typeof rates.USD).toBe("number");
    expect(rates.USD).toBe(41.85);
    expect(typeof rates.EUR).toBe("number");
    expect(rates.EUR).toBe(45.6);
    expect(typeof rates.PLN).toBe("number");
    expect(rates.PLN).toBe(10.75);
  });

  it("getUsdRate повертає курс USD", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => mockMonoData,
    } as any);

    const usd = await getUsdRate();
    expect(usd).toBe(41.85);
  });

  it("успішно перемикається на fallback константи якщо обидва банки недоступні", async () => {
    vi.spyOn(global, "fetch").mockRejectedValue(new Error("Network offline"));
    const consoleWarnSpy = vi
      .spyOn(console, "warn")
      .mockImplementation(() => {});

    const rates = await getCommercialRates();
    expect(rates).toBeDefined();
    expect(rates.USD).toBeGreaterThan(30);
    expect(rates.EUR).toBeGreaterThan(35);
    expect(rates.PLN).toBeGreaterThan(8);

    consoleWarnSpy.mockRestore();
  });

  it("використовує свіжий кеш із Supabase без звернення до Monobank API", async () => {
    const fetchSpy = vi.spyOn(global, "fetch");

    const mockDbData = [
      {
        currency: "USD",
        rate: 41.9,
        source: "monobank",
        updated_at: new Date(Date.now() - 5 * 60 * 1000).toISOString(), // 5 хв тому
      },
      {
        currency: "EUR",
        rate: 45.8,
        source: "monobank",
        updated_at: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
      },
      {
        currency: "PLN",
        rate: 10.8,
        source: "monobank",
        updated_at: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
      },
    ];

    const mockSupabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockResolvedValue({
          data: mockDbData,
          error: null,
        }),
      }),
    };

    vi.spyOn(supabaseAdminModule, "getSupabaseAdmin").mockReturnValue(
      mockSupabase as any
    );

    const rates = await getCommercialRates();
    expect(rates.USD).toBe(41.9);
    expect(rates.EUR).toBe(45.8);
    expect(rates.PLN).toBe(10.8);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("при 429 Too Many Requests від банків використовує збережений курс із БД замість констант", async () => {
    // Monobank повертає 429
    vi.spyOn(global, "fetch").mockResolvedValue({
      ok: false,
      status: 429,
      statusText: "Too Many Requests",
    } as any);

    // Курс у базі 45 хв тому (старший за 30 хв)
    const mockDbData = [
      {
        currency: "USD",
        rate: 42.1,
        source: "monobank",
        updated_at: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
      },
      {
        currency: "EUR",
        rate: 46.0,
        source: "monobank",
        updated_at: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
      },
      {
        currency: "PLN",
        rate: 10.9,
        source: "monobank",
        updated_at: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
      },
    ];

    const mockSupabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockResolvedValue({
          data: mockDbData,
          error: null,
        }),
      }),
    };

    vi.spyOn(supabaseAdminModule, "getSupabaseAdmin").mockReturnValue(
      mockSupabase as any
    );

    const consoleWarnSpy = vi
      .spyOn(console, "warn")
      .mockImplementation(() => {});

    const rates = await getCommercialRates();
    expect(rates.USD).toBe(42.1);
    expect(rates.EUR).toBe(46.0);
    expect(rates.PLN).toBe(10.9);

    consoleWarnSpy.mockRestore();
  });
});
