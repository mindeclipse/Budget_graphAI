import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { calculateBudgetPacing } from "@/lib/analytics-engine";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
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

    const supabase = getSupabaseAdmin();

    // Завантажуємо транзакції вибраного циклу
    const { data: transactions, error: txError } = await supabase
      .from("transactions")
      .select("*")
      .gte("created_at", fromDate)
      .lte("created_at", toDate)
      .order("created_at", { ascending: false });

    if (txError) throw txError;

    // Отримуємо збережені налаштування циклу (якщо є)
    const { data: cycleConfig } = await supabase
      .from("budget_cycles")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const categoryLimits = cycleConfig?.category_limits || [];
    const totalBudgetLimit = cycleConfig?.monthly_limit || undefined;

    const pacing = calculateBudgetPacing(
      (transactions || []).filter((t: any) => !t.exclude_from_budget),
      new Date(fromDate),
      new Date(toDate),
      categoryLimits,
      totalBudgetLimit
    );

    return NextResponse.json({ success: true, pacing });
  } catch (err: any) {
    console.error("[API budget-pace error]:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
