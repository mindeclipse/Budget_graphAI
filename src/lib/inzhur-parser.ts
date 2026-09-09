import { z } from "zod";

export interface ParsedInzhurTransaction {
  external_id: string;
  amount: number;
  currency: "UAH";
  merchant_raw: string;
  category_name: string;
  source: "inzhur_statement";
  type: "investment";
  exclude_from_budget: boolean;
  tags: string[];
  created_at: string;
}

export const inzhurTransactionSchema = z.object({
  external_id: z.string().min(1).max(255),
  amount: z.number().positive().max(100_000_000),
  currency: z.literal("UAH"),
  merchant_raw: z.string().min(1).max(255),
  category_name: z.string().min(1).max(100),
  source: z.literal("inzhur_statement"),
  type: z.literal("investment"),
  exclude_from_budget: z.literal(false),
  tags: z.array(z.string().min(1).max(50)),
  created_at: z.string().datetime(),
});

/**
 * Захист від Formula Injection (CSV / Excel Injection)
 * Екранує небезпечні керівні символи (=, +, -, @, табуляція)
 */
export function sanitizeFormulaInjection(text: string): string {
  const str = String(text || "");
  const trimmed = str.trim();
  if (/^[=+\-@\t\r]/.test(str) || /^[=+\-@\t\r]/.test(trimmed)) {
    return `'${trimmed}`;
  }
  return trimmed;
}

/**
 * Парсить дату з виписки Inzhur:
 * - Об'єкти Date (від SheetJS при cellDates: true)
 * - Серійні номери Excel (наприклад, 46034 для 12.01.2026, 46275 для 10.09.2026)
 * - Рядкові дати: DD.MM.YYYY, DD.MM.YY, YYYY-MM-DD, M/D/YY, текстові місяці українською
 * Встановлює 12:00:00 UTC для уникнення зсувів часових поясів через північ
 */
export function parseInzhurDate(rawVal: any): string {
  if (!rawVal) return new Date().toISOString();

  if (rawVal instanceof Date) {
    if (isNaN(rawVal.getTime())) return new Date().toISOString();
    const y = rawVal.getUTCFullYear();
    const m = rawVal.getUTCMonth();
    const d = rawVal.getUTCDate();
    return new Date(Date.UTC(y, m, d, 12, 0, 0)).toISOString();
  }

  // Перевірка серійного номера Excel (число або числовий рядок 30000..100000)
  const numVal =
    typeof rawVal === "number"
      ? rawVal
      : typeof rawVal === "string" && /^\d+(\.\d+)?$/.test(rawVal.trim())
        ? parseFloat(rawVal.trim())
        : null;

  if (numVal !== null && numVal >= 30000 && numVal <= 100000) {
    // В Excel епоха починається з 1899-12-30 UTC (25569 днів до Unix-епохи)
    const ms = Math.round((numVal - 25569) * 86400 * 1000);
    const d = new Date(ms);
    if (!isNaN(d.getTime())) {
      const y = d.getUTCFullYear();
      const m = d.getUTCMonth();
      const day = d.getUTCDate();
      return new Date(Date.UTC(y, m, day, 12, 0, 0)).toISOString();
    }
  }

  const str = String(rawVal).trim();

  // 1. Формат DD.MM.YYYY або DD.MM.YY (або з дефісами / слешами)
  const matchDmy = str.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/);
  if (matchDmy) {
    const day = parseInt(matchDmy[1], 10);
    const month = parseInt(matchDmy[2], 10);
    let year = parseInt(matchDmy[3], 10);
    if (year < 100) year = year > 70 ? 1900 + year : 2000 + year;
    const d = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
    if (!isNaN(d.getTime())) return d.toISOString();
  }

  // 2. Формат YYYY-MM-DD або YYYY.MM.DD
  const matchYmd = str.match(/^(\d{4})[./-](\d{1,2})[./-](\d{1,2})/);
  if (matchYmd) {
    const year = parseInt(matchYmd[1], 10);
    const month = parseInt(matchYmd[2], 10);
    const day = parseInt(matchYmd[3], 10);
    const d = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
    if (!isNaN(d.getTime())) return d.toISOString();
  }

  // 3. Формат з українськими назвами місяців (наприклад "10 вер. 2026" або "10 вересня 2026")
  const ukMonths: Record<string, number> = {
    січ: 1,
    лют: 2,
    бер: 3,
    кві: 4,
    тра: 5,
    чер: 6,
    лип: 7,
    сер: 8,
    вер: 9,
    жов: 10,
    лис: 11,
    гру: 12,
  };
  const matchUk = str
    .toLowerCase()
    .match(/^(\d{1,2})\s+([а-яіїєґ]+)\.?\s+(\d{2,4})/);
  if (matchUk) {
    const day = parseInt(matchUk[1], 10);
    const month = ukMonths[matchUk[2].slice(0, 3)];
    let year = parseInt(matchUk[3], 10);
    if (year < 100) year = year > 70 ? 1900 + year : 2000 + year;
    if (month) {
      const d = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
      if (!isNaN(d.getTime())) return d.toISOString();
    }
  }

  // 4. Стандартний JS Date fallback
  const d = new Date(str);
  if (!isNaN(d.getTime())) {
    const y = d.getUTCFullYear();
    const m = d.getUTCMonth();
    const day = d.getUTCDate();
    return new Date(Date.UTC(y, m, day, 12, 0, 0)).toISOString();
  }

  return new Date().toISOString();
}

/**
 * Очищує та надійно конвертує числові рядки або числа Inzhur:
 * - Числа: 9956.76, 35097.15
 * - Рядки з пробілами / символами валют: "35 097,15₴", "190,37 ₴"
 * - Європейський формат з крапкою як роздільником тисяч: "9.956,76₴" -> 9956.76
 * - Формат США з комою як роздільником тисяч: "9,956.76" -> 9956.76
 */
export function parseInzhurAmount(val: any): number {
  if (val == null) return 0;
  if (typeof val === "number") return isNaN(val) ? 0 : Math.abs(val);

  let s = String(val)
    .trim()
    .replace(/[\s\u00A0₴$€]/g, "");
  if (!s) return 0;

  // Європейський формат: 9.956,76 або 1.000.000,00 (крапка - тисячі, кома - десяткові)
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) {
    s = s.replace(/\./g, "").replace(",", ".");
  }
  // Формат США: 9,956.76 (кома - тисячі, крапка - десяткові)
  else if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) {
    s = s.replace(/,/g, "");
  }
  // Якщо є кома і немає крапки: "190,37" -> "190.37"
  else if (s.includes(",") && !s.includes(".")) {
    s = s.replace(",", ".");
  }
  // Якщо кілька крапок (наприклад 1.000.000): залишаємо лише останню як десяткову
  else if ((s.match(/\./g) || []).length > 1) {
    const lastDot = s.lastIndexOf(".");
    s =
      s.substring(0, lastDot).replace(/\./g, "") +
      "." +
      s.substring(lastDot + 1);
  }

  const num = parseFloat(s);
  return isNaN(num) ? 0 : Math.abs(num);
}

export interface InzhurParseResult {
  transactions: ParsedInzhurTransaction[];
  totalRows: number;
  skippedRows: number;
}

/**
 * Розбирає двовимірний масив комірок Excel (Sheet to JSON)
 */
export function parseInzhurStatementRows(rows: any[][]): InzhurParseResult {
  if (!rows || rows.length < 2) {
    return { transactions: [], totalRows: 0, skippedRows: 0 };
  }

  // 1. Пошук рядка колонок
  let headerRowIdx = -1;
  let headers: string[] = [];

  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const candidateCells = (rows[i] || []).map((c) =>
      String(c || "")
        .trim()
        .toLowerCase()
    );

    const hasDate = candidateCells.some(
      (c) =>
        (c === "дата" || c.includes("дата") || c.includes("date")) &&
        c.length < 30
    );
    const hasOp = candidateCells.some(
      (c) =>
        (c.includes("тип операції") ||
          c.includes("операці") ||
          c.includes("вид цінного") ||
          c.includes("папер") ||
          c === "тип") &&
        c.length < 50
    );
    const hasMoney = candidateCells.some(
      (c) =>
        (c.includes("дебет") || c.includes("кредит") || c.includes("сума")) &&
        c.length < 30
    );

    if (hasDate && (hasOp || hasMoney)) {
      headerRowIdx = i;
      headers = candidateCells;
      break;
    }
  }

  if (headerRowIdx === -1) {
    throw new Error(
      "Не вдалося знайти рядок заголовків (Дата, Тип операції, Дебет/Кредит) у файлі Inzhur"
    );
  }

  // 2. Визначення індексів
  const dateIdx = headers.findIndex(
    (h) =>
      (h === "дата" || h.includes("дата") || h.includes("date")) &&
      h.length < 30
  );
  const opTypeIdx = headers.findIndex(
    (h) => h.includes("тип операції") || h.includes("операці") || h === "тип"
  );
  const assetIdx = headers.findIndex(
    (h) =>
      h.includes("вид цінного") ||
      h.includes("цінн") ||
      h.includes("папер") ||
      h.includes("актив")
  );
  const debitIdx = headers.findIndex(
    (h) => h.includes("дебет") || h.includes("debit")
  );
  const creditIdx = headers.findIndex(
    (h) => h.includes("кредит") || h.includes("credit")
  );

  const transactions: ParsedInzhurTransaction[] = [];
  const occurrenceMap = new Map<string, number>();
  let skippedRows = 0;

  for (let i = headerRowIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0) continue;

    const rawDate = dateIdx !== -1 ? row[dateIdx] : null;
    const rawOpType =
      opTypeIdx !== -1 ? String(row[opTypeIdx] || "").trim() : "";
    const rawAsset = assetIdx !== -1 ? String(row[assetIdx] || "").trim() : "";
    const rawDebit = debitIdx !== -1 ? row[debitIdx] : null;
    const rawCredit = creditIdx !== -1 ? row[creditIdx] : null;

    const debitAmount = parseInzhurAmount(rawDebit);
    const creditAmount = parseInzhurAmount(rawCredit);

    // Якщо обидві суми нульові, пропускаємо рядок
    if (debitAmount <= 0 && creditAmount <= 0) {
      skippedRows++;
      continue;
    }

    const isDebit = debitAmount > 0;
    const finalAmount = isDebit ? debitAmount : creditAmount;
    const direction = isDebit ? "debit" : "credit";

    const createdAt = parseInzhurDate(rawDate);

    // Формуємо читабельну назву: наприклад "Inzhur REIT • Нарахування дивідендів" або "Купівля 33 облігацій"
    let merchantRaw = "";
    if (rawAsset && rawAsset !== "-" && rawAsset !== "—") {
      merchantRaw = rawOpType ? `${rawAsset} • ${rawOpType}` : rawAsset;
    } else {
      merchantRaw = rawOpType || "Inzhur операція";
    }
    merchantRaw = sanitizeFormulaInjection(merchantRaw);

    // Теги для зручної фільтрації
    const tags: string[] = ["inzhur", "капітал"];
    if (isDebit) {
      tags.push("дебет");
    } else {
      tags.push("кредит");
    }

    const lowerText = (rawAsset + " " + rawOpType).toLowerCase();
    if (lowerText.includes("reit")) tags.push("reit");
    if (lowerText.includes("овдп")) tags.push("овдп");
    if (lowerText.includes("дивіденд")) tags.push("дивіденди");
    if (lowerText.includes("купон")) tags.push("купони");
    if (lowerText.includes("подат")) tags.push("податки");

    // Формуємо детермінований external_id для дедуплікації
    const dateKey = createdAt.split("T")[0];
    const slug = merchantRaw
      .slice(0, 32)
      .replace(/[^a-zA-Z0-9а-яА-Яіїєґ]/gi, "");
    const baseKey = `inzhur_${dateKey}_${finalAmount}_${direction}_${slug}`;

    const occurrence = occurrenceMap.get(baseKey) || 0;
    occurrenceMap.set(baseKey, occurrence + 1);

    const externalId = occurrence > 0 ? `${baseKey}_${occurrence}` : baseKey;

    const parsedItem: ParsedInzhurTransaction = {
      external_id: externalId,
      amount: finalAmount,
      currency: "UAH",
      merchant_raw: merchantRaw,
      category_name: "Інвестиції",
      source: "inzhur_statement",
      type: "investment",
      exclude_from_budget: false,
      tags,
      created_at: createdAt,
    };

    const validated = inzhurTransactionSchema.safeParse(parsedItem);
    if (validated.success) {
      transactions.push(validated.data);
    } else {
      skippedRows++;
    }
  }

  return {
    transactions,
    totalRows: rows.length - (headerRowIdx + 1),
    skippedRows,
  };
}
