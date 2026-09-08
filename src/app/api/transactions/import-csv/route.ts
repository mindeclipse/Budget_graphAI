import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

function parsePrivatDate(rawDate: string, rawTime?: string): string {
  // Обробка форматів "DD.MM.YYYY", "DD.MM.YYYY HH:mm:ss" або розділених колонок
  const fullStr = rawTime ? `${rawDate} ${rawTime}` : rawDate;
  const parts = fullStr.trim().split(/[\s,]+/);
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

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "Файл не надано" }, { status: 400 });
    }

    const text = await file.text();
    const lines = text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);

    if (lines.length < 2) {
      return NextResponse.json(
        { error: "Файл порожній або некоректний" },
        { status: 400 }
      );
    }

    // Визначення роздільника (кома або крапка з комою)
    const delimiter = lines[0].includes(";") ? ";" : ",";
    const headers = lines[0]
      .split(delimiter)
      .map((h) => h.replace(/["']/g, "").trim().toLowerCase());

    // Пошук індексів колонок
    const dateIdx = headers.findIndex(
      (h) => h.includes("дата") || h.includes("date")
    );
    const timeIdx = headers.findIndex(
      (h) => h.includes("час") || h.includes("time")
    );
    const descIdx = headers.findIndex(
      (h) =>
        h.includes("опис") ||
        h.includes("деталі") ||
        h.includes("призначення") ||
        h.includes("контрагент")
    );
    const amountIdx = headers.findIndex(
      (h) => h.includes("сума") || h.includes("amount")
    );
    const catIdx = headers.findIndex(
      (h) => h.includes("категорія") || h.includes("category")
    );

    if (dateIdx === -1 || amountIdx === -1) {
      return NextResponse.json(
        { error: "Не вдалося знайти обов'язкові колонки (Дата, Сума) у CSV" },
        { status: 400 }
      );
    }

    const transactionsToInsert: any[] = [];

    for (let i = 1; i < lines.length; i++) {
      // Регулярний вираз враховує можливі лапки навколо значень
      const row = lines[i]
        .split(new RegExp(`${delimiter}(?=(?:(?:[^"]*"){2})*[^"]*$)`))
        .map((cell) => cell.replace(/^["']|["']$/g, "").trim());

      if (row.length <= amountIdx) continue;

      const rawAmountStr = row[amountIdx].replace(/\s/g, "").replace(",", ".");
      const rawAmount = parseFloat(rawAmountStr);
      if (isNaN(rawAmount) || rawAmount === 0) continue;

      const dateStr = row[dateIdx];
      const timeStr = timeIdx !== -1 ? row[timeIdx] : undefined;
      const createdAt = parsePrivatDate(dateStr, timeStr);

      const merchant =
        descIdx !== -1 && row[descIdx] ? row[descIdx] : "ПриватБанк операція";
      const category = catIdx !== -1 && row[catIdx] ? row[catIdx] : "Інше";

      const isExpense = rawAmount < 0;
      const finalAmount = Math.abs(rawAmount);
      const type = isExpense ? "expense" : "income";

      // Створення унікального ID на основі дати, суми та мерчанта для запобігання дублікатам
      const merchantSlug = merchant
        .slice(0, 16)
        .replace(/[^a-zA-Z0-9а-яА-Яіїєґ]/gi, "");
      const externalId = `pb_${new Date(createdAt).getTime()}_${finalAmount}_${merchantSlug}`;

      transactionsToInsert.push({
        external_id: externalId,
        amount: finalAmount,
        currency: "UAH",
        merchant_raw: merchant,
        category_name: category,
        source: "privatbank_csv",
        type,
        created_at: createdAt,
      });
    }

    if (transactionsToInsert.length === 0) {
      return NextResponse.json(
        { error: "У файлі не знайдено валідних рядків для імпорту" },
        { status: 400 }
      );
    }

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
    console.error("[CSV Import Error]:", err);
    return NextResponse.json(
      { error: err.message || "Помилка обробки файлу" },
      { status: 500 }
    );
  }
}
