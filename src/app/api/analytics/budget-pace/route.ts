import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { calculateBudgetPacing } from "@/lib/analytics-engine";
import { verifySessionToken } from "@/lib/session";
import { Transaction } from "@/types/finance";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const cookieStore = await cookies();
    const session = cookieStore.get("finance_session")?.value;
    const { valid } = await verifySessionToken(session);

    if (!valid) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const now = new Date();

    // За замовчуванням беремо поточний календарний місяць
    const defaultStart = new Date(
      now.getFullYear(),
      now.getMonth(),
      1
    ).toISOString();
    const defaultEnd = new Date(
      now.getFullYear(),
      now.getMonth() + 1,
      0,
      23,
      59,
      59,
      999
    ).toISOString();

    const fromDate = searchParams.get("from") || defaultStart;
    const toDate = searchParams.get("to") || defaultEnd;

    const startDate = new Date(fromDate);
    const endDate = new Date(toDate);

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      return NextResponse.json(
        { error: "Invalid date format" },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();

    // Завантажуємо активні транзакції вибраного циклу (виключаючи кошик)
    const { data: transactions, error: txError } = await supabase
      .from("transactions")
      .select(
        "id, amount, currency, merchant_raw, category_name, source, type, created_at, exclude_from_budget, deleted_at"
      )
      .is("deleted_at", null)
      .gte("created_at", fromDate)
      .lte("created_at", toDate)
      .order("created_at", { ascending: false });

    if (txError) throw txError;

    // Отримуємо збережені налаштування циклу (якщо є)
    const { data: cycleConfig } = await supabase
      .from("budget_cycles")
      .select("id, category_limits, monthly_limit, start_date, end_date")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const categoryLimits = cycleConfig?.category_limits || [];
    const totalBudgetLimit = cycleConfig?.monthly_limit || undefined;

    const validTransactions = (transactions || []) as unknown as Transaction[];

    const pacing = calculateBudgetPacing(
      validTransactions.filter((t) => !t.exclude_from_budget),
      startDate,
      endDate,
      categoryLimits,
      totalBudgetLimit
    );

    return NextResponse.json({ success: true, pacing });
  } catch (err: any) {
    console.error("[API budget-pace error]:", err);
    return NextResponse.json(
      {
        error:
          process.env.NODE_ENV === "production"
            ? "Помилка розрахунку темпу"
            : err.message,
      },
      { status: 500 }
    );
  }
}
