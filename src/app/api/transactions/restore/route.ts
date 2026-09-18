import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { verifySessionToken } from "@/lib/session";

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

export async function POST(req: NextRequest) {
  try {
    if (!(await checkAuthSession())) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const { searchParams } = new URL(req.url);
    const id = body.id || searchParams.get("id");
    const numId = Number(id);

    if (!id || isNaN(numId) || numId <= 0 || !Number.isInteger(numId)) {
      return NextResponse.json(
        { error: "Valid numeric Transaction ID required" },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("transactions")
      .update({ deleted_at: null })
      .eq("id", numId)
      .select()
      .maybeSingle();

    if (
      error &&
      (error.code === "42703" || error.message?.includes("deleted_at"))
    ) {
      return NextResponse.json(
        { error: "Колонка deleted_at ще не налаштована в базі даних" },
        { status: 400 }
      );
    }

    if (error) {
      console.error("[API restore POST] DB error:", error);
      throw error;
    }

    // Каскадне відновлення: якщо відновлюється батьківська транзакція, відновлюємо всі її дочірні частки
    await supabase
      .from("transactions")
      .update({ deleted_at: null })
      .eq("parent_transaction_id", numId);

    // Якщо відновлюється дочірня транзакція, відновлюємо і батьківську транзакцію, щоб уникнути осиротіння
    if (data?.parent_transaction_id) {
      await supabase
        .from("transactions")
        .update({ deleted_at: null })
        .eq("id", data.parent_transaction_id);
    }

    return NextResponse.json({
      success: true,
      restored: data,
      message: "Транзакцію успішно відновлено з кошика",
    });
  } catch (err: any) {
    console.error("Transaction restore POST error:", err);
    return NextResponse.json(
      { error: getSafeErrorMessage(err) },
      { status: 500 }
    );
  }
}
