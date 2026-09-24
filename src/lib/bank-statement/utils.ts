import { BankCurrency } from "./types";
import { sanitizeFormulaInjection } from "@/lib/security";

export { sanitizeFormulaInjection };

/**
 * Парсить дату/час з виписки банку.
 *
 * Підтримані формати:
 *   • Date-об'єкти від SheetJS (cellDates: true) — з UTC-нормалізацією
 *   • Excel serial-числа (30000–100000)
 *   • "DD.MM.YYYY HH:mm:ss" / "DD.MM.YYYY HH:mm" / "DD.MM.YYYY"
 *   • "YYYY-MM-DD" / "YYYY-MM-DDTHH:mm:ssZ"
 *   • 2-значний рік: YY < 70 → 20YY, YY >= 70 → 19YY
 */
export function parseBankDate(rawVal: any): string {
  if (!rawVal) return new Date().toISOString();

  // Date-об'єкт від SheetJS (cellDates: true)
  if (rawVal instanceof Date) {
    if (isNaN(rawVal.getTime())) return new Date().toISOString();
    return rawVal.toISOString();
  }

  // Excel serial number (30000–100000 покриває 1982–2173)
  const numVal =
    typeof rawVal === "number"
      ? rawVal
      : typeof rawVal === "string" && /^\d+(\.\d+)?$/.test(rawVal.trim())
        ? parseFloat(rawVal.trim())
        : null;

  if (numVal !== null && numVal >= 30000 && numVal <= 100000) {
    const ms = Math.round((numVal - 25569) * 86400 * 1000);
    const d = new Date(ms);
    if (!isNaN(d.getTime())) return d.toISOString();
  }

  const str = String(rawVal).trim();

  // DD.MM.YYYY HH:mm:ss або DD.MM.YYYY HH:mm або DD.MM.YYYY
  const matchDmyTime = str.match(
    /^(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{2,4})(?:[\sT](\d{1,2}):(\d{2})(?::(\d{2}))?)?/
  );
  if (matchDmyTime) {
    const day = parseInt(matchDmyTime[1], 10);
    const month = parseInt(matchDmyTime[2], 10);
    let year = parseInt(matchDmyTime[3], 10);
    if (year < 100) year = year > 70 ? 1900 + year : 2000 + year;
    const h = matchDmyTime[4] ? parseInt(matchDmyTime[4], 10) : 12;
    const min = matchDmyTime[5] ? parseInt(matchDmyTime[5], 10) : 0;
    const sec = matchDmyTime[6] ? parseInt(matchDmyTime[6], 10) : 0;
    const d = new Date(Date.UTC(year, month - 1, day, h, min, sec));
    if (!isNaN(d.getTime())) return d.toISOString();
  }

  // YYYY-MM-DD або ISO
  const matchYmd = str.match(
    /^(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})(?:[\sT](\d{1,2}):(\d{2})(?::(\d{2}))?)?/
  );
  if (matchYmd) {
    const year = parseInt(matchYmd[1], 10);
    const month = parseInt(matchYmd[2], 10);
    const day = parseInt(matchYmd[3], 10);
    const h = matchYmd[4] ? parseInt(matchYmd[4], 10) : 12;
    const min = matchYmd[5] ? parseInt(matchYmd[5], 10) : 0;
    const sec = matchYmd[6] ? parseInt(matchYmd[6], 10) : 0;
    const d = new Date(Date.UTC(year, month - 1, day, h, min, sec));
    if (!isNaN(d.getTime())) return d.toISOString();
  }

  // JS Date fallback
  const d = new Date(str);
  if (!isNaN(d.getTime())) return d.toISOString();

  return new Date().toISOString();
}

export const parsePrivatDate = parseBankDate;

/**
 * Надійно конвертує суму з виписки банку:
 *   • Нативне число (від SheetJS raw:true): -79.98 → 79.98, зберігає знак
 *   • Рядок з пробілами/символами: "-1 234,56 UAH" → 1234.56
 *   • Європейський формат: "-9.956,76" → 9956.76
 *   • США-формат: "-9,956.76" → 9956.76
 *
 * Повертає { abs: number, isNegative: boolean }.
 */
export function parseBankAmount(val: any): {
  abs: number;
  isNegative: boolean;
} {
  if (val == null) return { abs: 0, isNegative: false };

  // Число — найточніше представлення (SheetJS raw:true)
  if (typeof val === "number") {
    if (isNaN(val)) return { abs: 0, isNegative: false };
    return { abs: Math.abs(val), isNegative: val < 0 };
  }

  let s = String(val)
    .trim()
    .replace(/[\s\u00A0₴$€]/g, "") // пробіли, NBSP, символи валют
    .replace(/\bUAH\b|\bUSD\b|\bEUR\b|\bPLN\b/gi, ""); // текстові валюти

  if (!s) return { abs: 0, isNegative: false };

  const isNegative = s.startsWith("-");
  s = s.replace(/^[+-]/, ""); // прибираємо знак для парсингу

  // Європейський формат: 9.956,76 або 1.000.000,00
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) {
    s = s.replace(/\./g, "").replace(",", ".");
  }
  // США-формат: 9,956.76
  else if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) {
    s = s.replace(/,/g, "");
  }
  // Кома без крапки: "190,37" → "190.37"
  else if (s.includes(",") && !s.includes(".")) {
    s = s.replace(",", ".");
  }
  // Кілька крапок (1.000.000) — остання десяткова
  else if ((s.match(/\./g) || []).length > 1) {
    const lastDot = s.lastIndexOf(".");
    s =
      s.substring(0, lastDot).replace(/\./g, "") +
      "." +
      s.substring(lastDot + 1);
  }

  const num = parseFloat(s);
  return { abs: isNaN(num) ? 0 : num, isNegative };
}

export const parsePrivatAmount = parseBankAmount;

export function normalizeBankCategory(raw: string, rawDesc?: string): string {
  const combined = `${raw || ""} ${rawDesc || ""}`.toLowerCase().trim();
  if (
    combined.includes("подушка") ||
    combined.includes("подушк") ||
    combined.includes("решта від округлення") ||
    combined.includes("округлення залишку") ||
    combined.includes("округлення витрат")
  ) {
    return "Внутрішні перекази / Подушка";
  }

  const cat = String(raw || "")
    .toLowerCase()
    .trim();
  if (cat.includes("продукт") || cat.includes("супермаркет")) return "Продукти";
  if (cat.includes("ресторан") || cat.includes("кафе") || cat.includes("бар"))
    return "Кафе та ресторани";
  if (
    cat.includes("транспорт") ||
    cat.includes("таксі") ||
    cat.includes("пальне")
  )
    return "Транспорт";
  if (
    cat.includes("доставк") ||
    cat.includes("пошт") ||
    combined.includes("нова пошта") ||
    combined.includes("укрпошта") ||
    combined.includes("meest")
  )
    return "Доставка";
  if (cat.includes("здоров") || cat.includes("аптек") || cat.includes("догляд"))
    return "Здоров'я та догляд";
  if (
    cat.includes("підписк") ||
    cat.includes("комунал") ||
    cat.includes("зв'язок")
  )
    return "Підписки та сервіси";
  if (cat.includes("розваг") || cat.includes("кіно")) return "Розваги та хобі";
  if (cat.includes("переказ")) return "Перекази";
  if (cat.includes("фонд") || cat.includes("організац")) return "Благодійність";
  return raw.trim() || "Інше";
}

export const normalizePrivatCategory = normalizeBankCategory;

const ALLOWED_CURRENCIES: BankCurrency[] = ["UAH", "USD", "EUR", "PLN"];

export function parseCurrency(raw: any): BankCurrency {
  const s = String(raw || "")
    .trim()
    .toUpperCase() as BankCurrency;
  return ALLOWED_CURRENCIES.includes(s) ? s : "UAH";
}
