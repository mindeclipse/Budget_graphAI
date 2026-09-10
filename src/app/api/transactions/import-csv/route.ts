import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { verifySessionToken } from "@/lib/session";
import * as XLSX from "xlsx";
import { parsePrivatStatementRows } from "@/lib/privat-parser";

export const dynamic = "force-dynamic";

// Обмеження: максимум 5 МБ
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;
// Розмір чанку для batch-insert
const BATCH_SIZE = 500;

function getSafeErrorMessage(err: any): string {
  return process.env.NODE_ENV === "production"
    ? "Помилка обробки файлу"
    : err?.message || "Помилка сервера";
}

export async function POST(req: Request) {
  try {
    // ── Аутентифікація ──────────────────────────────────────
    const cookieStore = await cookies();
    const session = cookieStore.get("finance_session")?.value;
    const { valid } = await verifySessionToken(session);

    if (!valid) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // ── Валідація файлу ─────────────────────────────────────
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

    // ── Парсинг Excel / CSV ─────────────────────────────────
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const workbook = XLSX.read(buffer, {
      type: "buffer",
      cellDates: true, // SheetJS повертає Date-об'єкти для дат
      cellNF: true, // зберігає числовий формат (для серійних дат)
    });

    // Шукаємо аркуш за ключовими словами виписки
    const SHEET_KEYWORDS = ["виписк", "операц", "statement", "history", "рух"];
    let sheetName = workbook.SheetNames[0];
    for (const name of workbook.SheetNames) {
      if (SHEET_KEYWORDS.some((kw) => name.toLowerCase().includes(kw))) {
        sheetName = name;
        break;
      }
    }

    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      raw: true, // числа як числа, дати як Date-об'єкти (з cellDates)
      defval: null, // порожні комірки → null, а не undefined
    }) as any[][];

    if (!rows || rows.length < 3) {
      return NextResponse.json(
        { error: "Таблиця містить замало рядків для аналізу" },
        { status: 400 }
      );
    }

    // ── Парсинг рядків через privat-parser ──────────────────
    const {
      transactions: parsed,
      totalRows,
      skippedRows,
    } = parsePrivatStatementRows(rows);

    if (parsed.length === 0) {
      return NextResponse.json(
        { error: "У файлі не знайдено валідних операцій" },
        { status: 400 }
      );
    }

    // ── Дедуплікація через попередній SELECT ────────────────
    // Зчитуємо всі external_id з нового файлу
    const incomingIds = parsed.map((t) => t.external_id);

    const supabase = getSupabaseAdmin();

    // Вибираємо вже існуючі ID порціями (PostgREST обмежує IN-list)
    const existingIds = new Set<string>();
    for (let i = 0; i < incomingIds.length; i += 500) {
      const chunk = incomingIds.slice(i, i + 500);
      const { data } = await supabase
        .from("transactions")
        .select("external_id")
        .in("external_id", chunk)
        .eq("source", "privatbank_statement");
      (data || []).forEach((r: { external_id: string }) =>
        existingIds.add(r.external_id)
      );
    }

    const newTransactions = parsed.filter(
      (t) => !existingIds.has(t.external_id)
    );
    const skippedDuplicates = parsed.length - newTransactions.length;

    if (newTransactions.length === 0) {
      return NextResponse.json({
        success: true,
        total_rows: totalRows,
        parsed_count: parsed.length,
        imported_count: 0,
        skipped_duplicates: skippedDuplicates,
        skipped_invalid: skippedRows,
        message: "Всі операції вже імпортовані раніше",
      });
    }

    // ── Batch INSERT (НЕ upsert — щоб уникнути race condition) ──
    let totalInserted = 0;

    for (let i = 0; i < newTransactions.length; i += BATCH_SIZE) {
      const chunk = newTransactions.slice(i, i + BATCH_SIZE);
      const { data, error } = await supabase
        .from("transactions")
        .insert(chunk)
        .select("id");

      if (error) throw error;
      totalInserted += data?.length || 0;
    }

    return NextResponse.json({
      success: true,
      total_rows: totalRows,
      parsed_count: parsed.length,
      imported_count: totalInserted,
      skipped_duplicates: skippedDuplicates,
      skipped_invalid: skippedRows,
    });
  } catch (err: any) {
    console.error("[PrivatBank Import Error]:", err);
    return NextResponse.json(
      { error: getSafeErrorMessage(err) },
      { status: 500 }
    );
  }
}
