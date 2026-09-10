import { z } from "zod";

// ─────────────────────────────────────────────────────────────
// Типи та Zod-схема
// ─────────────────────────────────────────────────────────────

export type BankCurrency = "UAH" | "USD" | "EUR" | "PLN";
export type PrivatCurrency = BankCurrency;

export interface ParsedBankTransaction {
  external_id: string;
  amount: number;
  currency: BankCurrency;
  merchant_raw: string;
  category_name: string;
  source: "privatbank_statement" | "bank_statement";
  type: "expense" | "income";
  exclude_from_budget: false;
  created_at: string;
}
export type ParsedPrivatTransaction = ParsedBankTransaction;

export const bankTransactionSchema = z.object({
  external_id: z.string().min(1).max(255),
  amount: z.number().positive().max(10_000_000),
  currency: z.enum(["UAH", "USD", "EUR", "PLN"]),
  merchant_raw: z.string().min(1).max(255),
  category_name: z.string().min(1).max(100),
  source: z.enum(["privatbank_statement", "bank_statement"]),
  type: z.enum(["expense", "income"]),
  exclude_from_budget: z.literal(false),
  created_at: z.string().datetime(),
});
export const privatTransactionSchema = bankTransactionSchema;

export interface BankParseResult {
  transactions: ParsedBankTransaction[];
  totalRows: number;
  skippedRows: number;
}
export type PrivatParseResult = BankParseResult;

// ─────────────────────────────────────────────────────────────
// sanitizeFormulaInjection
// ─────────────────────────────────────────────────────────────

/**
 * Захист від Formula Injection (CSV/Excel Injection).
 * Екранує небезпечні керівні символи (=, +, -, @, Tab, CR).
 */
export function sanitizeFormulaInjection(text: string): string {
  const str = String(text || "");
  const trimmed = str.trim();
  if (/^[=+\-@\t\r]/.test(str) || /^[=+\-@\t\r]/.test(trimmed)) {
    return `'${trimmed}`;
  }
  return trimmed;
}

// ─────────────────────────────────────────────────────────────
// parsePrivatDate
// ─────────────────────────────────────────────────────────────

/**
 * Парсить дату/час з виписки ПриватБанку.
 *
 * Підтримані формати:
 *   • Date-об'єкти від SheetJS (cellDates: true) — з UTC-нормалізацією
 *   • Excel serial-числа (30000–100000)
 *   • "DD.MM.YYYY HH:mm:ss" / "DD.MM.YYYY HH:mm" / "DD.MM.YYYY"
 *   • "YYYY-MM-DD" / "YYYY-MM-DDTHH:mm:ssZ"
 *   • 2-значний рік: YY < 70 → 20YY, YY >= 70 → 19YY
 *
 * Час з виписки зберігається точно як UTC (Приват записує Kyiv-час,
 * зберігаємо його без конверсії, бо точний TZ-офсет у файлі невідомий).
 */
export function parsePrivatDate(rawVal: any): string {
  if (!rawVal) return new Date().toISOString();

  // Date-об'єкт від SheetJS (cellDates: true)
  if (rawVal instanceof Date) {
    if (isNaN(rawVal.getTime())) return new Date().toISOString();
    // Зберігаємо точний час як UTC — виписка Приват містить час операції
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

// ─────────────────────────────────────────────────────────────
// parsePrivatAmount
// ─────────────────────────────────────────────────────────────

/**
 * Надійно конвертує суму з виписки Приват:
 *   • Нативне число (від SheetJS raw:true): -79.98 → 79.98, зберігає знак
 *   • Рядок з пробілами/символами: "-1 234,56 UAH" → 1234.56
 *   • Європейський формат: "-9.956,76" → 9956.76
 *   • США-формат: "-9,956.76" → 9956.76
 *
 * Повертає { abs: number, isNegative: boolean }.
 */
export function parsePrivatAmount(val: any): {
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

// ─────────────────────────────────────────────────────────────
// normalizePrivatCategory
// ─────────────────────────────────────────────────────────────

export function normalizePrivatCategory(raw: string): string {
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
  if (cat.includes("здоров") || cat.includes("аптек") || cat.includes("догляд"))
    return "Здоров'я";
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

// ─────────────────────────────────────────────────────────────
// parseCurrency
// ─────────────────────────────────────────────────────────────

const ALLOWED_CURRENCIES: PrivatCurrency[] = ["UAH", "USD", "EUR", "PLN"];

function parseCurrency(raw: any): PrivatCurrency {
  const s = String(raw || "")
    .trim()
    .toUpperCase() as PrivatCurrency;
  return ALLOWED_CURRENCIES.includes(s) ? s : "UAH";
}

// ─────────────────────────────────────────────────────────────
// parsePrivatStatementRows  — головна функція парсингу
// ─────────────────────────────────────────────────────────────

/**
 * Заголовки колонок виписки Приват24 (UA/EN, нечутливо до регістру):
 *   Дата | Категорія | Картка | Опис операції
 *   Сума в валюті картки | Валюта картки
 *   Сума в валюті транзакції | Валюта транзакції
 *   Залишок на кінець | Валюта залишку
 */
export function parsePrivatStatementRows(rows: any[][]): PrivatParseResult {
  if (!rows || rows.length < 2) {
    return { transactions: [], totalRows: 0, skippedRows: 0 };
  }

  // ── 1. Пошук рядка заголовків ─────────────────────────────
  let headerRowIdx = -1;
  let headers: string[] = [];

  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const candidate = (rows[i] || []).map((c) =>
      String(c ?? "")
        .trim()
        .toLowerCase()
        .slice(0, 60)
    );
    const hasDate = candidate.some((c) => c.includes("дата") || c === "date");
    const hasAmount = candidate.some(
      (c) => c.includes("сума") || c.includes("amount") || c.includes("sum")
    );
    if (hasDate && hasAmount) {
      headerRowIdx = i;
      headers = candidate;
      break;
    }
  }

  if (headerRowIdx === -1) {
    return { transactions: [], totalRows: 0, skippedRows: 0 };
  }

  // ── 2. Маппінг індексів колонок ───────────────────────────
  const idx = {
    date: headers.findIndex((h) => h.includes("дата") || h === "date"),
    category: headers.findIndex(
      (h) => h.includes("категорія") || h.includes("category")
    ),
    card: headers.findIndex(
      (h) => h.includes("картка") && !h.includes("валюта")
    ),
    desc: headers.findIndex(
      (h) =>
        h.includes("опис") ||
        h.includes("деталі") ||
        h.includes("контрагент") ||
        h.includes("description") ||
        h.includes("details")
    ),
    // "Сума в валюті картки" — пріоритет над просто "сума"
    amount: (() => {
      let i = headers.findIndex((h) => h.includes("сума в валюті картки"));
      if (i === -1)
        i = headers.findIndex(
          (h) =>
            (h.includes("сума") || h.includes("amount")) &&
            !h.includes("транзак") &&
            !h.includes("залишок")
        );
      return i;
    })(),
    currency: (() => {
      // "Валюта картки" (перша колонка валюти — не транзакції, не залишку)
      let i = headers.findIndex((h) => h === "валюта картки");
      if (i === -1)
        i = headers.findIndex(
          (h) =>
            (h.includes("валюта") || h.includes("currency")) &&
            !h.includes("транзак") &&
            !h.includes("залишок") &&
            !h.includes("balance")
        );
      return i;
    })(),
  };

  if (idx.date === -1 || idx.amount === -1) {
    return { transactions: [], totalRows: 0, skippedRows: 0 };
  }

  // ── 3. Обробка рядків ─────────────────────────────────────
  const transactions: ParsedPrivatTransaction[] = [];
  let skippedRows = 0;
  const dataRows = rows.slice(headerRowIdx + 1);

  for (const row of dataRows) {
    if (!row || row.length <= idx.amount) {
      skippedRows++;
      continue;
    }

    // Пропускаємо порожні рядки та підсумки
    const rawAmountCell = row[idx.amount];
    if (rawAmountCell == null || rawAmountCell === "") {
      skippedRows++;
      continue;
    }

    const { abs: amount, isNegative } = parsePrivatAmount(rawAmountCell);
    if (amount === 0 || isNaN(amount)) {
      skippedRows++;
      continue;
    }

    const createdAt = parsePrivatDate(
      idx.date !== -1 ? row[idx.date] : undefined
    );

    const rawDesc =
      idx.desc !== -1 && row[idx.desc] != null
        ? sanitizeFormulaInjection(String(row[idx.desc]))
        : "ПриватБанк операція";

    const rawCategory =
      idx.category !== -1 && row[idx.category] != null
        ? sanitizeFormulaInjection(String(row[idx.category]))
        : "Інше";

    const currency =
      idx.currency !== -1 ? parseCurrency(row[idx.currency]) : "UAH";
    const type: "expense" | "income" = isNegative ? "expense" : "income";

    // ── external_id: детермінований та стабільний ─────────
    // Формат: pb_{ISO-дата-без-мс}_{сума}_{первые16символів-опису}
    const isoDatePart = createdAt.slice(0, 19).replace(/[T:]/g, "-");
    const descSlug = rawDesc
      .slice(0, 20)
      .toLowerCase()
      .replace(/[^a-zа-яіїєґ0-9]/gi, "");
    const externalId = `pb_${isoDatePart}_${amount.toFixed(2)}_${currency}_${descSlug}`;

    const parseResult = privatTransactionSchema.safeParse({
      external_id: externalId.slice(0, 255),
      amount,
      currency,
      merchant_raw: rawDesc.slice(0, 255),
      category_name: normalizePrivatCategory(rawCategory).slice(0, 100),
      source: "privatbank_statement" as const,
      type,
      exclude_from_budget: false as const,
      created_at: createdAt,
    });

    if (parseResult.success) {
      transactions.push(parseResult.data);
    } else {
      skippedRows++;
    }
  }

  return {
    transactions,
    totalRows: dataRows.length,
    skippedRows,
  };
}

export const parseBankStatementRows = parsePrivatStatementRows;
export const parseBankDate = parsePrivatDate;
export const normalizeBankCategory = normalizePrivatCategory;
