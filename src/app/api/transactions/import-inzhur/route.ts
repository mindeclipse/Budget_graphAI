import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { verifySessionToken } from "@/lib/session";
import * as XLSX from "xlsx";
import { parseInzhurStatementRows } from "@/lib/inzhur-parser";

export const dynamic = "force-dynamic";

// Обмеження розміру файлу: 5 МБ
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;
// Розмір чанка для вставки в базу
const BATCH_SIZE = 500;

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
        { error: "Дозволені лише файли звітів .xlsx або .xls" },
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

    // Magic bytes — захист від підробленого розширення файлу
    const lowerNameInzhur = file.name.toLowerCase();
    const isXlsxInzhur = buffer[0] === 0x50 && buffer[1] === 0x4b; // PK ZIP (xlsx)
    const isXlsInzhur =
      buffer[0] === 0xd0 &&
      buffer[1] === 0xcf &&
      buffer[2] === 0x11 &&
      buffer[3] === 0xe0; // Compound Document (xls)
    const isCsvInzhur = lowerNameInzhur.endsWith(".csv");

    if (!isXlsxInzhur && !isXlsInzhur && !isCsvInzhur) {
      return NextResponse.json(
        { error: "Вміст файлу не відповідає формату Excel або CSV" },
        { status: 400 }
      );
    }

    let rows: any[][];
    try {
      const workbook = XLSX.read(buffer, {
        type: "buffer",
        cellDates: true,
        cellNF: true,
      });

      // Захист від DoS: надмірна кількість аркушів
      if (workbook.SheetNames.length > 20) {
        return NextResponse.json(
          { error: "Файл містить забагато аркушів (максимум 20)" },
          { status: 400 }
        );
      }

      // Пошук цільового аркуша (пріоритет аркушам з випискою/транзакціями)
      const targetSheetName =
        workbook.SheetNames.find((name) => {
          const lower = name.toLowerCase();
          return (
            lower.includes("виписка") ||
            lower.includes("операці") ||
            lower.includes("рух") ||
            lower.includes("statement") ||
            lower.includes("transact") ||
            lower.includes("звіт")
          );
        }) || workbook.SheetNames[0];

      if (!targetSheetName) {
        return NextResponse.json(
          { error: "Файл Excel не містить аркушів" },
          { status: 400 }
        );
      }
      const sheet = workbook.Sheets[targetSheetName];

      // raw: true зберігає точні числа (cell.v) та об'єкти Date без похибок SSF форматування,
      // а defval: null запобігає зсувам колонок при наявності порожніх комірок
      rows = XLSX.utils.sheet_to_json(sheet, {
        header: 1,
        raw: true,
        defval: null,
      }) as any[][];
    } catch (parseErr: any) {
      return NextResponse.json(
        { error: "Помилка читання Excel-файлу: " + (parseErr.message || "") },
        { status: 400 }
      );
    }

    if (!rows || rows.length < 2) {
      return NextResponse.json(
        { error: "Таблиця містить замало рядків для аналізу" },
        { status: 400 }
      );
    }

    let parsedResult;
    try {
      parsedResult = parseInzhurStatementRows(rows);
    } catch (err: any) {
      return NextResponse.json(
        {
          error:
            err.message || "Не вдалося розпізнати структуру виписки Inzhur",
        },
        { status: 400 }
      );
    }

    const { transactions: validatedTransactions, totalRows } = parsedResult;

    if (validatedTransactions.length === 0) {
      return NextResponse.json(
        {
          error:
            "Не знайдено жодної валідної операції. Перевірте, чи це виписка Inzhur.",
        },
        { status: 400 }
      );
    }

    const supabaseAdmin = getSupabaseAdmin();

    // 1. Отримання вже існуючих external_id для дедуплікації
    const { data: existingRecords, error: fetchErr } = await supabaseAdmin
      .from("transactions")
      .select("external_id")
      .eq("source", "inzhur_statement")
      .not("external_id", "is", null);

    if (fetchErr) {
      console.error("[Inzhur Import] Error fetching existing IDs:", fetchErr);
      throw fetchErr;
    }

    const existingIds = new Set(
      (existingRecords || []).map((r: any) => r.external_id)
    );

    const newItems = validatedTransactions.filter(
      (item) => !existingIds.has(item.external_id)
    );

    const skippedDuplicates = validatedTransactions.length - newItems.length;

    // 2. Якщо нових записів немає — повертаємо інформативну відповідь
    if (newItems.length === 0) {
      return NextResponse.json({
        success: true,
        imported_count: 0,
        skipped_duplicates: skippedDuplicates,
        total_rows: totalRows,
        message:
          "Усі операції з файлу вже були завантажені раніше (дублікати).",
      });
    }

    // 3. Вставка частинами (батчами) для захисту від перевантаження БД
    for (let i = 0; i < newItems.length; i += BATCH_SIZE) {
      const chunk = newItems.slice(i, i + BATCH_SIZE);
      const { error: insertErr } = await supabaseAdmin
        .from("transactions")
        .insert(chunk);

      if (insertErr) {
        console.error("[Inzhur Import] DB Insert error:", insertErr);
        throw insertErr;
      }
    }

    return NextResponse.json({
      success: true,
      imported_count: newItems.length,
      skipped_duplicates: skippedDuplicates,
      total_rows: totalRows,
      message: `Успішно імпортовано ${newItems.length} операцій капіталу (${skippedDuplicates} дублікатів пропущено).`,
    });
  } catch (error: any) {
    console.error("[API transactions/import-inzhur POST error]:", error);
    return NextResponse.json(
      {
        error:
          process.env.NODE_ENV === "production"
            ? "Помилка обробки файлу"
            : error?.message || "Помилка сервера",
      },
      { status: 500 }
    );
  }
}
