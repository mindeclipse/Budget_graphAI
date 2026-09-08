import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { readSheet } from "read-excel-file/node";

export const dynamic = "force-dynamic";

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
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "Файл не надано" }, { status: 400 });
    }

    const fileName = file.name.toLowerCase();
    const isExcel = fileName.endsWith(".xlsx");
    let rows: any[][] = [];

    if (isExcel) {
      // Безпечний парсинг XLSX через Buffer напряму в рядки таблиці
      const buffer = Buffer.from(await file.arrayBuffer());
      const parsedRows = await readSheet(buffer);
      rows = parsedRows as any[][];
    } else {
      // Парсинг звичайного CSV
      const text = await file.text();
      const lines = text
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean);

      let delimiter = ",";
      for (const l of lines.slice(0, 5)) {
        if (l.includes(";")) {
          delimiter = ";";
          break;
        }
      }

      rows = lines.map((line) =>
        line
          .split(new RegExp(`${delimiter}(?=(?:(?:[^"]*"){2})*[^"]*$)`))
          .map((c) => c.replace(/^["']|["']$/g, "").trim())
      );
    }

    if (rows.length < 3) {
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

    const transactionsToInsert: any[] = [];

    // 3. Формування транзакцій
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
          ? String(row[descIdx]).trim()
          : "ПриватБанк операція";
      const rawCategory =
        catIdx !== -1 && row[catIdx] ? String(row[catIdx]).trim() : "Інше";

      const isExpense = rawAmount < 0;
      const finalAmount = Math.abs(rawAmount);
      const type = isExpense ? "expense" : "income";

      const merchantSlug = rawMerchant
        .slice(0, 16)
        .replace(/[^a-zA-Z0-9а-яА-Яіїєґ]/gi, "");
      const externalId = `pb_${new Date(createdAt).getTime()}_${finalAmount}_${merchantSlug}`;

      transactionsToInsert.push({
        external_id: externalId,
        amount: finalAmount,
        currency: "UAH",
        merchant_raw: rawMerchant,
        category_name: normalizePrivatCategory(rawCategory),
        source: isExcel ? "privatbank_xlsx" : "privatbank_csv",
        type,
        created_at: createdAt,
      });
    }

    if (transactionsToInsert.length === 0) {
      return NextResponse.json(
        { error: "У файлі не знайдено валідних операцій" },
        { status: 400 }
      );
    }

    // 4. Запис у базу з дедуплікацією
    const supabaseAdmin = getSupabaseAdmin();
    const { data, error } = await supabaseAdmin
      .from("transactions")
      .upsert(transactionsToInsert, {
        onConflict: "external_id",
        ignoreDuplicates: true,
      })
      .select("id");

    if (error) throw error;

    return NextResponse.json({
      success: true,
      total_rows: transactionsToInsert.length,
      imported_count: data?.length || 0,
    });
  } catch (err: any) {
    console.error("[PrivatBank Import Error]:", err);
    return NextResponse.json(
      { error: err.message || "Помилка обробки файлу" },
      { status: 500 }
    );
  }
}
