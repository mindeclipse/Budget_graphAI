// Сервіс комерційних курсів валют (Monobank API з fallback на ПриватБанк)

export interface CommercialRates {
  USD: number;
  EUR: number;
  PLN: number;
  updatedAt: number;
  source: "monobank" | "privatbank" | "fallback";
}

interface MonoCurrencyItem {
  currencyCodeA: number;
  currencyCodeB: number;
  date: number;
  rateBuy?: number;
  rateSell?: number;
  rateCross?: number;
}

interface PrivatExchangeRate {
  ccy: string;
  base_ccy: string;
  buy: string;
  sale: string;
}

// ISO коди валют
const ISO_CODES = {
  USD: 840,
  EUR: 978,
  PLN: 985,
  UAH: 980,
};

// Безпечні орієнтири за замовчуванням
const DEFAULT_FALLBACK_RATES: CommercialRates = {
  USD: 41.5,
  EUR: 45.3,
  PLN: 10.6,
  updatedAt: 0,
  source: "fallback",
};

let cachedRates: CommercialRates | null = null;
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 хвилин

/**
 * Отримує комерційні курси Monobank
 */
async function fetchMonobankRates(): Promise<CommercialRates | null> {
  try {
    const res = await fetch("https://api.monobank.ua/bank/currency", {
      headers: { "User-Agent": "BudgetGraphAI/1.0" },
      next: { revalidate: 600 },
    });

    if (!res.ok) return null;

    const data: MonoCurrencyItem[] = await res.json();
    if (!Array.isArray(data)) return null;

    const findRate = (codeA: number): number | null => {
      const item = data.find(
        (i) => i.currencyCodeA === codeA && i.currencyCodeB === ISO_CODES.UAH
      );
      if (!item) return null;
      return item.rateSell || item.rateCross || item.rateBuy || null;
    };

    const usd = findRate(ISO_CODES.USD);
    const eur = findRate(ISO_CODES.EUR);
    const pln = findRate(ISO_CODES.PLN);

    if (usd && eur) {
      return {
        USD: Number(usd.toFixed(2)),
        EUR: Number(eur.toFixed(2)),
        PLN: pln ? Number(pln.toFixed(2)) : 10.6,
        updatedAt: Date.now(),
        source: "monobank",
      };
    }

    return null;
  } catch (error) {
    console.warn("[Currency] Monobank rate fetch failed:", error);
    return null;
  }
}

/**
 * Отримує комерційний картковий курс ПриватБанку (coursid=11)
 */
async function fetchPrivatBankRates(): Promise<CommercialRates | null> {
  try {
    const res = await fetch(
      "https://api.privatbank.ua/p24api/pubinfo?json&exchange&coursid=11",
      { next: { revalidate: 600 } }
    );

    if (!res.ok) return null;

    const data: PrivatExchangeRate[] = await res.json();
    if (!Array.isArray(data)) return null;

    const usdItem = data.find((i) => i.ccy === "USD");
    const eurItem = data.find((i) => i.ccy === "EUR");

    if (usdItem?.sale && eurItem?.sale) {
      return {
        USD: parseFloat(usdItem.sale),
        EUR: parseFloat(eurItem.sale),
        PLN: 10.6,
        updatedAt: Date.now(),
        source: "privatbank",
      };
    }

    return null;
  } catch (error) {
    console.warn("[Currency] PrivatBank rate fetch failed:", error);
    return null;
  }
}

/**
 * Головний метод отримання комерційних курсів валют (Monobank -> PrivatBank -> Fallback)
 */
export async function getCommercialRates(): Promise<CommercialRates> {
  const now = Date.now();

  // Повертаємо свіжий кеш
  if (cachedRates && now - cachedRates.updatedAt < CACHE_TTL_MS) {
    return cachedRates;
  }

  // 1. Спроба Monobank
  const monoRates = await fetchMonobankRates();
  if (monoRates) {
    cachedRates = monoRates;
    return monoRates;
  }

  // 2. Спроба PrivatBank
  const privatRates = await fetchPrivatBankRates();
  if (privatRates) {
    cachedRates = privatRates;
    return privatRates;
  }

  // 3. Якщо був старий кеш — повертаємо його
  if (cachedRates) {
    return cachedRates;
  }

  // 4. Безпечний fallback
  return DEFAULT_FALLBACK_RATES;
}

/**
 * Отримує курс конкретної валюти до UAH
 */
export async function getCurrencyRate(
  currency: "UAH" | "USD" | "EUR" | "PLN" | string
): Promise<number> {
  const clean = currency.toUpperCase();
  if (clean === "UAH") return 1;

  const rates = await getCommercialRates();
  if (clean === "USD") return rates.USD;
  if (clean === "EUR") return rates.EUR;
  if (clean === "PLN") return rates.PLN;

  return 1;
}

/**
 * Зворотна сумісність для існуючих викликів USD
 */
export async function getUsdRate(): Promise<number> {
  return getCurrencyRate("USD");
}
