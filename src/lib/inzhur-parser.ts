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
 * Парсить дату з виписки Inzhur (формати DD.MM.YYYY, YYYY-MM-DD тощо)
 * Встановлює 12:00:00 UTC для уникнення зсувів часових поясів через північ
 */
export function parseInzhurDate(rawVal: any): string {
  if (!rawVal) return new Date().toISOString();
  if (rawVal instanceof Date) return rawVal.toISOString();

  const str = String(rawVal).trim();

  // Формат DD.MM.YYYY або DD/MM/YYYY або DD-MM-YYYY
  const matchDmy = str.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})/);
  if (matchDmy) {
    const day = parseInt(matchDmy[1], 10);
    const month = parseInt(matchDmy[2], 10);
    const year = parseInt(matchDmy[3], 10);
    const d = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
    if (!isNaN(d.getTime())) return d.toISOString();
  }

  // Формат YYYY-MM-DD
  const matchYmd = str.match(/^(\d{4})[./-](\d{1,2})[./-](\d{1,2})/);
  if (matchYmd) {
    const year = parseInt(matchYmd[1], 10);
    const month = parseInt(matchYmd[2], 10);
    const day = parseInt(matchYmd[3], 10);
    const d = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
    if (!isNaN(d.getTime())) return d.toISOString();
  }

  const d = new Date(str);
  return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

/**
 * Очищує числові рядки Inzhur (наприклад, "35 097,15₴", "190,37₴")
 */
export function parseInzhurAmount(val: any): number {
  if (val == null) return 0;
  if (typeof val === "number") return isNaN(val) ? 0 : Math.abs(val);

  const clean = String(val)
    .replace(/[\s\u00A0₴$€]/g, "")
    .replace(",", ".");
  const num = parseFloat(clean);
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
      (c) => c.includes("дата") || c.includes("date")
    );
    const hasOp = candidateCells.some(
      (c) =>
        c.includes("тип операції") ||
        c.includes("тип") ||
        c.includes("вид цінного") ||
        c.includes("папер")
    );
    const hasMoney = candidateCells.some(
      (c) => c.includes("дебет") || c.includes("кредит")
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
    (h) => h.includes("дата") || h.includes("date")
  );
  const opTypeIdx = headers.findIndex(
    (h) =>
      h.includes("тип операції") || h.includes("операці") || h.includes("тип")
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
