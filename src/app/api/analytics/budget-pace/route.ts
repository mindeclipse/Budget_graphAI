import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { calculateBudgetPacing } from "@/lib/analytics-engine";
import {
  calculateWeightedCalendarPacing,
  getEffectiveTransactionExpense,
  loadPastAmortizationObligations,
  type UpcomingObligation,
} from "@/lib/weighted-pacing";
import { verifySessionToken } from "@/lib/session";
import { getUsdRate } from "@/lib/currency";
import { buildUpcomingSchedule } from "@/lib/subscription-radar";
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

    const habitBaselineIso = "2026-08-15T00:00:00.000Z";
    const fetchStart =
      startDate.toISOString() < habitBaselineIso
        ? startDate.toISOString()
        : habitBaselineIso;

    // Завантажуємо активні транзакції (для циклу та базової лінії звичок)
    const { data: transactions, error: txError } = await supabase
      .from("transactions")
      .select(
        "id, amount, currency, merchant_raw, category_name, source, type, created_at, exclude_from_budget, deleted_at"
      )
      .is("deleted_at", null)
      .gte("created_at", fetchStart)
      .lte("created_at", toDate)
      .order("created_at", { ascending: false });

    if (txError) throw txError;

    // Отримуємо збережені налаштування циклу (якщо є)
    const { data: activeCycle } = await supabase
      .from("budget_cycles")
      .select("id, budget_limit, start_date, end_date, is_active")
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const cycleConfig =
      activeCycle ||
      (
        await supabase
          .from("budget_cycles")
          .select("id, budget_limit, start_date, end_date, is_active")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle()
      ).data;

    const totalBudgetLimit = cycleConfig?.budget_limit || undefined;

    const validTransactions = (transactions || []) as unknown as Transaction[];

    const cycleTransactions = validTransactions.filter((t) => {
      const d = new Date(t.created_at);
      return d >= startDate && d <= endDate;
    });

    const pacing = calculateBudgetPacing(
      cycleTransactions.filter(
        (t) => !t.exclude_from_budget && t.type === "expense"
      ),
      startDate,
      endDate,
      [],
      totalBudgetLimit
    );

    // Завантажуємо активні шаблони регулярних платежів для резервування зобов'язань
    const { data: recurringItems } = await supabase
      .from("recurring_templates")
      .select(
        "id, title, amount, currency, day_of_month, is_active, category_name"
      )
      .eq("is_active", true);

    const usdRate = await getUsdRate();

    const schedule = buildUpcomingSchedule(
      recurringItems || [],
      cycleTransactions,
      usdRate,
      now
    );

    const upcomingObligations: UpcomingObligation[] = schedule.upcoming.map(
      (u) => ({
        title: u.title,
        amount:
          u.currency === "USD"
            ? Math.round(u.amount * usdRate)
            : Number(u.amount),
        day_of_month: u.day_of_month,
        is_paid: u.status === "paid",
      })
    );

    // Завантажуємо активні амортизовані витрати з попередніх місяців
    const pastObligations = await loadPastAmortizationObligations(
      supabase,
      startDate,
      now
    );
    if (pastObligations.length > 0) {
      upcomingObligations.push(...pastObligations);
    }

    const currentExpenseTotal = cycleTransactions
      .filter((t) => !t.exclude_from_budget && t.type === "expense")
      .reduce((sum, t) => sum + getEffectiveTransactionExpense(t), 0);

    const weightedPacing = calculateWeightedCalendarPacing(validTransactions, {
      now,
      startDate,
      endDate,
      totalBudgetLimit:
        totalBudgetLimit ||
        pacing.totalExpense +
          pacing.safeDailySpendRemaining * pacing.daysRemaining,
      currentExpenseTotal,
      upcomingObligations,
    });

    return NextResponse.json({ success: true, pacing, weightedPacing });
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
