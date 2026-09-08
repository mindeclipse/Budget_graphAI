import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { checkDailyBudgetThreshold } from "@/lib/budget-alerts";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

// Допоміжна перевірка сесії
async function checkAuthSession() {
  const cookieStore = await cookies();
  const session = cookieStore.get("finance_session")?.value;
  const correctPin = process.env.APP_ACCESS_PIN;
  return Boolean(correctPin && session === correctPin);
}

// UPDATE: зміна категорії та/або тегів транзакції
export async function PATCH(req: Request) {
  try {
    if (!(await checkAuthSession())) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id, category_name, tags } = await req.json();

    if (!id) {
      return NextResponse.json(
        { error: "Transaction ID is required" },
        { status: 400 }
      );
    }

    // Формуємо об'єкт оновлення тільки з тих полів, які передано в запиті
    const updates: Record<string, any> = {};
    if (category_name !== undefined) updates.category_name = category_name;
    if (tags !== undefined) updates.tags = tags;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: "No fields to update" },
        { status: 400 }
      );
    }

    const supabaseAdmin = getSupabaseAdmin();
    const { data, error } = await supabaseAdmin
      .from("transactions")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ success: true, transaction: data });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// CREATE: додавання нової транзакції з перевіркою денного ліміту
export async function POST(req: Request) {
  try {
    if (!(await checkAuthSession())) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const {
      amount,
      merchant_raw,
      category_name = "Інше",
      type = "expense",
      currency = "UAH",
      tags = [],
      created_at,
    } = body;

    if (!amount || isNaN(Number(amount))) {
      return NextResponse.json(
        { error: "Valid amount is required" },
        { status: 400 }
      );
    }

    const supabaseAdmin = getSupabaseAdmin();
    const { data: newTransaction, error } = await supabaseAdmin
      .from("transactions")
      .insert({
        amount: Number(amount),
        merchant_raw: merchant_raw || "Невідомий мерчант",
        category_name,
        type,
        currency,
        tags,
        ...(created_at ? { created_at } : {}),
      })
      .select()
      .single();

    if (error) throw error;

    // Перевіряємо ліміт лише для витрат
    if (type === "expense") {
      // Використовуємо await з перехопленням помилки, щоб Vercel Serverless
      // не вбив фоновий процес до відправки HTTP-запиту в Telegram
      await checkDailyBudgetThreshold().catch((err) => {
        console.error("Budget alert error:", err);
      });
    }

    return NextResponse.json(
      { success: true, transaction: newTransaction },
      { status: 201 }
    );
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// DELETE: видалення транзакції
export async function DELETE(req: Request) {
  try {
    if (!(await checkAuthSession())) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { error: "Transaction ID is required" },
        { status: 400 }
      );
    }

    const supabaseAdmin = getSupabaseAdmin();
    const { error } = await supabaseAdmin
      .from("transactions")
      .delete()
      .eq("id", id);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
