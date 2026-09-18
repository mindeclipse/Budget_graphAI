import {
  ParsedInzhurTransaction,
  InzhurParseResult,
  inzhurTransactionSchema,
} from "./types";
import {
  sanitizeFormulaInjection,
  parseInzhurDate,
  parseInzhurAmount,
} from "./utils";

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
