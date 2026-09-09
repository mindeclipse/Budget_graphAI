import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { verifySessionToken } from "@/lib/session";
import { z } from "zod";
import * as XLSX from "xlsx";

export const dynamic = "force-dynamic";

// Обмеження: макс 5 МБ для виписки
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;
// Розмір чанка для вставки в базу
const BATCH_SIZE = 500;

// Схема валідації рядка перед записом
const importedRowSchema = z.object({
  external_id: z.string().min(1).max(255),
  amount: z.number().positive().max(10_000_000),
  currency: z.literal("UAH"),
  merchant_raw: z.string().min(1).max(255),
  category_name: z.string().min(1).max(100),
  source: z.literal("privatbank_statement"),
  type: z.enum(["expense", "income"]),
  created_at: z.string().datetime(),
});

function sanitizeFormulaInjection(text: string): string {
  const trimmed = text.trim();
  if (/^[=+\-@\t\r]/.test(trimmed)) {
    return `'${trimmed}`;
  }
  return trimmed;
}

function parsePrivatDate(rawVal: any): string {
  if (!rawVal) return new Date().toISOString();
  if (rawVal instanceof Date) return rawVal.toISOString();

  const str = String(rawVal).trim();
  const parts = str.split(/[\s,]+/);
  const datePart = parts[0];
  const timePart = parts[1] || "00:00:00";

  const [day, month, year] = datePart.split(".").map(Number);
  const [hours, minutes, seconds] = timePart.split(":").map(Number);

  const parsed = new Date(
    year,
    month - 1,
    day,
    hours || 0,
    minutes || 0,
    seconds || 0
  );
  return isNaN(parsed.getTime())
    ? new Date().toISOString()
    : parsed.toISOString();
}

function normalizePrivatCategory(rawCategory: string): string {
  const cat = rawCategory.toLowerCase();
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
    return "Здоров'я та догляд";
  if (
    cat.includes("підписк") ||
    cat.includes("комунал") ||
    cat.includes("зв'язок")
  )
    return "Підписки та сервіси";
  if (cat.includes("розваг") || cat.includes("кіно")) return "Розваги";
  return rawCategory || "Інше";
}

export async function POST(req: Request) {
  try {
    const cookieStore = await cookies();
    const session = cookieStore.get("finance_session")?.value;
    const { valid } = await verifySessionToken(session);

    if (!valid) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "Файл не надано" }, { status: 400 });
    }

    const lowerName = file.name.toLowerCase();
    if (
      !lowerName.endsWith(".xlsx") &&
      !lowerName.endsWith(".xls") &&
      !lowerName.endsWith(".csv")
    ) {
      return NextResponse.json(
        { error: "Дозволені лише формати .xlsx, .xls або .csv" },
        { status: 400 }
      );
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      return NextResponse.json(
        { error: "Розмір файлу перевищує ліміт (максимум 5 МБ)" },
        { status: 400 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const workbook = XLSX.read(buffer, { type: "buffer", cellDates: false });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];

    const rows = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      raw: false,
    }) as any[][];

    if (!rows || rows.length < 3) {
      return NextResponse.json(
        { error: "Таблиця містить замало рядків для аналізу" },
        { status: 400 }
      );
    }

    // 1. Пошук рядка заголовків
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
      const hasAmount = candidateCells.some(
        (c) => c.includes("сума") || c.includes("amount")
      );

      if (hasDate && hasAmount) {
        headerRowIdx = i;
        headers = candidateCells;
        break;
      }
    }

    if (headerRowIdx === -1) {
      return NextResponse.json(
        { error: "Не вдалося знайти рядок колонок (Дата, Сума) у файлі" },
        { status: 400 }
      );
    }

    // 2. Індекси колонок
    const dateIdx = headers.findIndex(
      (h) => h.includes("дата") || h.includes("date")
    );
    const catIdx = headers.findIndex(
      (h) => h.includes("категорія") || h.includes("category")
    );
    const descIdx = headers.findIndex(
      (h) =>
        h.includes("опис") || h.includes("деталі") || h.includes("контрагент")
    );

    let amountIdx = headers.findIndex((h) =>
      h.includes("сума в валюті картки")
    );
    if (amountIdx === -1) {
      amountIdx = headers.findIndex(
        (h) => h.includes("сума") || h.includes("amount")
      );
    }

    const validatedTransactions: z.infer<typeof importedRowSchema>[] = [];

    // 3. Збір та валідація рядків через Zod
    for (let i = headerRowIdx + 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.length <= amountIdx) continue;

      const rawAmountStr = String(row[amountIdx] || "")
        .replace(/\s/g, "")
        .replace(",", ".");
      const rawAmount = parseFloat(rawAmountStr);
      if (isNaN(rawAmount) || rawAmount === 0) continue;

      const createdAt = parsePrivatDate(row[dateIdx]);
      const rawMerchant =
        descIdx !== -1 && row[descIdx]
          ? sanitizeFormulaInjection(String(row[descIdx]))
          : "ПриватБанк операція";
      const rawCategory =
        catIdx !== -1 && row[catIdx]
          ? sanitizeFormulaInjection(String(row[catIdx]))
          : "Інше";

      const isExpense = rawAmount < 0;
      const finalAmount = Math.abs(rawAmount);
      const type = isExpense ? "expense" : "income";

      const merchantSlug = rawMerchant
        .slice(0, 16)
        .replace(/[^a-zA-Z0-9а-яА-Яіїєґ]/gi, "");
      const externalId = `pb_${new Date(createdAt).getTime()}_${finalAmount}_${merchantSlug}`;

      const parseResult = importedRowSchema.safeParse({
        external_id: externalId,
        amount: finalAmount,
        currency: "UAH",
        merchant_raw: rawMerchant.slice(0, 255),
        category_name: normalizePrivatCategory(rawCategory).slice(0, 100),
        source: "privatbank_statement",
        type,
        created_at: createdAt,
      });

      if (parseResult.success) {
        validatedTransactions.push(parseResult.data);
      }
    }

    if (validatedTransactions.length === 0) {
      return NextResponse.json(
        { error: "У файлі не знайдено валідних операцій" },
        { status: 400 }
      );
    }

    // 4. Пакетний запис (Chunking) для запобігання перевантаженню PostgREST
    const supabaseAdmin = getSupabaseAdmin();
    let totalInserted = 0;

    for (let i = 0; i < validatedTransactions.length; i += BATCH_SIZE) {
      const chunk = validatedTransactions.slice(i, i + BATCH_SIZE);
      const { data, error } = await supabaseAdmin
        .from("transactions")
        .upsert(chunk, {
          onConflict: "external_id",
          ignoreDuplicates: true,
        })
        .select("id");

      if (error) throw error;
      totalInserted += data?.length || 0;
    }

    return NextResponse.json({
      success: true,
      total_rows: validatedTransactions.length,
      imported_count: totalInserted,
    });
  } catch (err: any) {
    console.error("[PrivatBank Import Error]:", err);
    return NextResponse.json(
      { error: err.message || "Помилка обробки файлу" },
      { status: 500 }
    );
  }
}
