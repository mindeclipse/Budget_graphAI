import { getSupabaseAdmin } from "@/lib/supabase-admin";

// Сервіс комерційних курсів валют (Monobank API з fallback на ПриватБанк та Supabase кеш)

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
const IN_MEMORY_CACHE_TTL_MS = 5 * 60 * 1000; // 5 хвилин для поточного лямбда-інстансу
const DB_CACHE_TTL_MS = 30 * 60 * 1000; // 30 хвилин для збереження між викликами Serverless

/**
 * Отримує збережені курси з таблиці exchange_rates_cache в Supabase
 */
async function getRatesFromDb(): Promise<CommercialRates | null> {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("exchange_rates_cache")
      .select("currency, rate, source, updated_at");

    if (error || !data || data.length === 0) return null;

    const usd = data.find((r) => r.currency === "USD");
    const eur = data.find((r) => r.currency === "EUR");
    const pln = data.find((r) => r.currency === "PLN");

    if (!usd?.rate || !eur?.rate) return null;

    const timestamps = data
      .map((r) => new Date(r.updated_at).getTime())
      .filter((t) => !isNaN(t));

    const updatedAt = timestamps.length > 0 ? Math.min(...timestamps) : 0;

    return {
      USD: Number(usd.rate),
      EUR: Number(eur.rate),
      PLN: pln?.rate ? Number(pln.rate) : 10.6,
      updatedAt,
      source: (usd.source as any) || "monobank",
    };
  } catch {
    return null;
  }
}

/**
 * Зберігає свіжі курси валют у Supabase exchange_rates_cache
 */
async function saveRatesToDb(rates: CommercialRates): Promise<void> {
  try {
    const supabase = getSupabaseAdmin();
    const nowIso = new Date(rates.updatedAt || Date.now()).toISOString();
    const rows = [
      {
        currency: "USD",
        rate: rates.USD,
        source: rates.source,
        updated_at: nowIso,
      },
      {
        currency: "EUR",
        rate: rates.EUR,
        source: rates.source,
        updated_at: nowIso,
      },
      {
        currency: "PLN",
        rate: rates.PLN,
        source: rates.source,
        updated_at: nowIso,
      },
    ];
    await supabase
      .from("exchange_rates_cache")
      .upsert(rows, { onConflict: "currency" });
  } catch (err: any) {
    if (process.env.NODE_ENV !== "test") {
      console.warn("[Currency] Failed to save rates to DB cache:", err);
    }
  }
}

/**
 * Отримує комерційні курси Monobank
 */
async function fetchMonobankRates(): Promise<CommercialRates | null> {
  try {
    const res = await fetch("https://api.monobank.ua/bank/currency", {
      headers: { "User-Agent": "BudgetGraph/1.0" },
      next: { revalidate: 600 },
      signal: AbortSignal.timeout(5000),
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
      {
        next: { revalidate: 600 },
        signal: AbortSignal.timeout(5000),
      }
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
 * Головний метод отримання комерційних курсів валют:
 * In-Memory (5m) -> Supabase Cache (30m) -> Monobank -> PrivatBank -> DB Historical Fallback -> Default Fallback
 */
export async function getCommercialRates(): Promise<CommercialRates> {
  const now = Date.now();

  // 1. Повертаємо свіжий in-memory кеш поточної лямбди
  if (cachedRates && now - cachedRates.updatedAt < IN_MEMORY_CACHE_TTL_MS) {
    return cachedRates;
  }

  // 2. Перевіряємо персистентний кеш у Supabase (захист від 429 при нових інстансах)
  const dbRates = await getRatesFromDb();
  if (dbRates && now - dbRates.updatedAt < DB_CACHE_TTL_MS) {
    cachedRates = dbRates;
    return dbRates;
  }

  // 3. Якщо кеш протермінований або відсутній — запитуємо Monobank
  const monoRates = await fetchMonobankRates();
  if (monoRates) {
    cachedRates = monoRates;
    await saveRatesToDb(monoRates);
    return monoRates;
  }

  // 4. Спроба PrivatBank при недоступності Monobank
  const privatRates = await fetchPrivatBankRates();
  if (privatRates) {
    cachedRates = privatRates;
    await saveRatesToDb(privatRates);
    return privatRates;
  }

  // 5. Якщо обидва банки недоступні або повернули 429 — використовуємо історичний курс із БД (навіть старший за 30 хв)
  if (dbRates) {
    console.warn(
      "[Currency] Bank APIs failed/rate-limited, using stale DB cache from:",
      new Date(dbRates.updatedAt).toISOString()
    );
    cachedRates = dbRates;
    return dbRates;
  }

  // 6. Якщо був старий in-memory кеш
  if (cachedRates) {
    return cachedRates;
  }

  // 7. Безпечний fallback константами
  return DEFAULT_FALLBACK_RATES;
}

/**
 * Скидає in-memory кеш для ізольованого модульного тестування
 */
export function _resetCurrencyCacheForTesting() {
  cachedRates = null;
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

/**
 * Перетворює числовий код валюти ISO 4217 у літерний код
 */
export function isoCodeToCurrency(code: number): string {
  switch (code) {
    case 840:
      return "USD";
    case 978:
      return "EUR";
    case 985:
      return "PLN";
    case 980:
      return "UAH";
    default:
      return "UAH";
  }
}
