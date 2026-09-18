import {
  BankParseResult,
  ParsedBankTransaction,
  bankTransactionSchema,
} from "./types";
import {
  parseBankDate,
  parseBankAmount,
  sanitizeFormulaInjection,
  normalizeBankCategory,
  parseCurrency,
} from "./utils";

/**
 * Заголовки колонок виписки банків (UA/EN, нечутливо до регістру):
 *   Дата | Категорія | Картка | Опис операції
 *   Сума в валюті картки | Валюта картки
 *   Сума в валюті транзакції | Валюта транзакції
 *   Залишок на кінець | Валюта залишку
 */
export function parseBankStatementRows(rows: any[][]): BankParseResult {
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
  const transactions: ParsedBankTransaction[] = [];
  let skippedRows = 0;
  const dataRows = rows.slice(headerRowIdx + 1);

  for (let r = 0; r < dataRows.length; r++) {
    const row = dataRows[r];
    if (!row || row.length === 0) {
      skippedRows++;
      continue;
    }

    const rawAmountCell = row[idx.amount];
    if (rawAmountCell == null || rawAmountCell === "") {
      skippedRows++;
      continue;
    }

    const { abs: amount, isNegative } = parseBankAmount(rawAmountCell);
    if (amount === 0 || isNaN(amount)) {
      skippedRows++;
      continue;
    }

    const createdAt = parseBankDate(
      idx.date !== -1 ? row[idx.date] : undefined
    );

    const rawDesc =
      idx.desc !== -1 && row[idx.desc] != null
        ? sanitizeFormulaInjection(String(row[idx.desc]))
        : "Банківська операція";

    const rawCategory =
      idx.category !== -1 && row[idx.category] != null
        ? sanitizeFormulaInjection(String(row[idx.category]))
        : "Інше";

    const currency =
      idx.currency !== -1 ? parseCurrency(row[idx.currency]) : "UAH";
    const lowerDesc = rawDesc.toLowerCase();
    const lowerCat = rawCategory.toLowerCase();
    const isRoundup =
      lowerDesc.includes("подушка") ||
      lowerDesc.includes("подушк") ||
      lowerDesc.includes("округлення") ||
      lowerCat.includes("подушка");

    const categoryName = normalizeBankCategory(rawCategory, rawDesc);
    const type: "expense" | "income" | "transfer" = isRoundup
      ? "transfer"
      : isNegative
        ? "expense"
        : "income";

    // ── external_id: детермінований та стабільний ─────────
    // Формат: pb_{ISO-дата-без-мс}_{сума}_{первые16символів-опису}
    const isoDatePart = createdAt.slice(0, 19).replace(/[T:]/g, "-");
    const descSlug = rawDesc
      .slice(0, 20)
      .toLowerCase()
      .replace(/[^a-zа-яіїєґ0-9]/gi, "");
    const externalId = `pb_${isoDatePart}_${amount.toFixed(2)}_${currency}_${descSlug}`;

    const parseResult = bankTransactionSchema.safeParse({
      external_id: externalId.slice(0, 255),
      amount,
      currency,
      merchant_raw: rawDesc.slice(0, 255),
      category_name: categoryName.slice(0, 100),
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

export const parsePrivatStatementRows = parseBankStatementRows;
