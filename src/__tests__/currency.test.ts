import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  getCommercialRates,
  getCurrencyRate,
  getUsdRate,
} from "@/lib/currency";

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
});
