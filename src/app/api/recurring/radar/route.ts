import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { verifySessionToken } from "@/lib/session";
import { getUsdRate } from "@/lib/currency";
import {
  detectSubscriptions,
  buildUpcomingSchedule,
} from "@/lib/subscription-radar";
import { Transaction, RecurringItem } from "@/types/finance";

export const dynamic = "force-dynamic";

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

export async function GET(req: NextRequest) {
  try {
    if (!(await checkAuthSession())) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const dismissedParam = searchParams.get("dismissed") || "";
    const dismissedSignatures = dismissedParam
      ? dismissedParam
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : [];

    const supabaseAdmin = getSupabaseAdmin();

    // 1. Отримуємо транзакції за останні 180 днів для точного виявлення циклічності
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - 180);

    const { data: rawTransactions, error: txError } = await supabaseAdmin
      .from("transactions")
      .select("*")
      .gte("created_at", fromDate.toISOString())
      .order("created_at", { ascending: true });

    if (txError) throw txError;

    // 2. Отримуємо всі наявні шаблони постійних витрат
    const { data: rawTemplates, error: tmplError } = await supabaseAdmin
      .from("recurring_templates")
      .select("*")
      .order("day_of_month", { ascending: true });

    if (tmplError) throw tmplError;

    const transactions = (rawTransactions || []) as Transaction[];
    const templates = (rawTemplates || []) as RecurringItem[];

    // 3. Фільтруємо транзакції поточного місяця для аналізу статусів сплати
    const now = new Date();
    const startOfMonth = new Date(
      now.getFullYear(),
      now.getMonth(),
      1
    ).toISOString();
    const endOfMonth = new Date(
      now.getFullYear(),
      now.getMonth() + 1,
      0,
      23,
      59,
      59,
      999
    ).toISOString();

    const currentMonthTransactions = transactions.filter(
      (t) => t.created_at >= startOfMonth && t.created_at <= endOfMonth
    );

    // 4. Отримуємо актуальний комерційний курс USD
    const usdRate = await getUsdRate();

    // 5. Запускаємо рушій детекції та формування розкладу
    const detected = detectSubscriptions(
      transactions,
      templates,
      dismissedSignatures
    );
    const { upcoming, metrics } = buildUpcomingSchedule(
      templates,
      currentMonthTransactions,
      usdRate,
      now
    );

    metrics.detected_count = detected.length;

    return NextResponse.json({
      detected,
      upcoming,
      metrics,
    });
  } catch (error: any) {
    console.error("[API recurring/radar GET error]:", error);
    return NextResponse.json(
      { error: getSafeErrorMessage(error) },
      { status: 500 }
    );
  }
}
