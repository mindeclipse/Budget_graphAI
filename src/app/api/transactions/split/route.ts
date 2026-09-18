import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { verifySessionToken } from "@/lib/session";
import { transactionSplitSchema } from "@/lib/validations";

async function checkAuthSession(): Promise<boolean> {
  const cookieStore = await cookies();
  const session = cookieStore.get("finance_session")?.value;
  const { valid } = await verifySessionToken(session);
  return valid;
}

function getSafeErrorMessage(error: any): string {
  return process.env.NODE_ENV === "production"
    ? "Помилка обробки запиту"
    : error?.message || "Помилка сервера";
}

export async function POST(req: Request) {
  try {
    if (!(await checkAuthSession())) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rawBody = await req.json();
    const parsed = transactionSplitSchema.safeParse(rawBody);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.format() },
        { status: 400 }
      );
    }

    const { parent_transaction_id, items } = parsed.data;
    const supabase = getSupabaseAdmin();

    // 1. Отримуємо батьківську транзакцію
    const { data: parentTx, error: fetchErr } = await supabase
      .from("transactions")
      .select(
        "id, amount, currency, merchant_raw, category_name, source, type, created_at, tags, exclude_from_budget"
      )
      .eq("id", parent_transaction_id)
      .single();

    if (fetchErr || !parentTx) {
      return NextResponse.json(
        { error: "Батьківську транзакцію не знайдено" },
        { status: 404 }
      );
    }

    // 2. Перевіряємо точність суми
    const itemsSum = items.reduce((acc, it) => acc + it.amount, 0);
    const parentAmount = Number(parentTx.amount);

    if (Math.abs(itemsSum - parentAmount) > 0.01) {
      return NextResponse.json(
        {
          error: `Сума часток (${itemsSum.toFixed(2)}) не дорівнює сумі транзакції (${parentAmount.toFixed(2)})`,
        },
        { status: 400 }
      );
    }

    // 3. Позначаємо батьківську транзакцію як виключену з бюджету (щоб уникнути подвійного підрахунку)
    const existingTags = Array.isArray(parentTx.tags) ? parentTx.tags : [];
    const updatedTags = Array.from(new Set([...existingTags, "розділена"]));

    const { error: parentUpdateErr } = await supabase
      .from("transactions")
      .update({
        exclude_from_budget: true,
        tags: updatedTags,
      })
      .eq("id", parent_transaction_id);

    if (parentUpdateErr) throw parentUpdateErr;

    // 4. Створюємо дочірні спліт-транзакції
    const childRecords = items.map((item) => ({
      amount: item.amount,
      currency: parentTx.currency || "UAH",
      merchant_raw: item.merchant_raw || parentTx.merchant_raw,
      category_name: item.category_name,
      source: parentTx.source || "manual",
      type: parentTx.type || "expense",
      created_at: parentTx.created_at,
      parent_transaction_id: parent_transaction_id,
      exclude_from_budget: false,
      tags: ["спліт"],
    }));

    const { data: insertedChildren, error: insertErr } = await supabase
      .from("transactions")
      .insert(childRecords)
      .select();

    if (insertErr) {
      console.error(
        "[API transactions/split error] Insert children failed, rolling back parent:",
        insertErr
      );
      // Відкочуємо стан батьківської транзакції до початкового
      await supabase
        .from("transactions")
        .update({
          exclude_from_budget: parentTx.exclude_from_budget ?? false,
          tags: parentTx.tags || [],
        })
        .eq("id", parent_transaction_id);

      // Видаляємо будь-які частково вставлені частки
      await supabase
        .from("transactions")
        .delete()
        .eq("parent_transaction_id", parent_transaction_id);

      throw insertErr;
    }

    return NextResponse.json({
      success: true,
      parent_id: parent_transaction_id,
      children: insertedChildren,
    });
  } catch (err: any) {
    console.error("[API transactions/split error]:", err);
    return NextResponse.json(
      { error: getSafeErrorMessage(err) },
      { status: 500 }
    );
  }
}
