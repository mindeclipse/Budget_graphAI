import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { verifySessionToken } from "@/lib/session";
import { timingSafeEqual } from "@/lib/security";
import { getUsdRate } from "@/lib/currency";
import {
  getCycleDateRange,
  calculateCycleDaysRemaining,
  DEFAULT_BUDGET_LIMIT,
} from "@/lib/cycle-utils";
import { getKyivDateString } from "@/lib/behavioral-metrics";
import { WidgetSummaryResponse } from "@/types/finance";

export const dynamic = "force-dynamic";

/**
 * Перевіряє авторизацію через Bearer токен (iOS Scriptable / Shortcuts) або сесійну куку (веб-браузер)
 */
async function isAuthorized(req: NextRequest): Promise<boolean> {
  // 1. Bearer Token (Scriptable Widget, iOS Shortcuts)
  const authHeader = req.headers.get("authorization");
  const appSecretKey = process.env.APP_API_SECRET;
  if (
    appSecretKey &&
    authHeader &&
    timingSafeEqual(authHeader, `Bearer ${appSecretKey}`)
  ) {
    return true;
  }

  // 2. Cookie Session (Web UI)
  const cookieStore = await cookies();
  const session = cookieStore.get("finance_session")?.value;
  const { valid } = await verifySessionToken(session);
  return valid;
}

/**
 * GET /api/widget/summary
 * Повертає зведений статус бюджету для віджета iOS Scriptable
 */
export async function GET(req: NextRequest) {
  try {
    if (!(await isAuthorized(req))) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const supabase = getSupabaseAdmin();
    const now = new Date();

    // 1. Отримання активного або останнього зарплатного циклу
    const { data: activeCycle } = await supabase
      .from("budget_cycles")
      .select("id, name, start_date, end_date, budget_limit, is_active")
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const cycleRange = getCycleDateRange(activeCycle, now);
    const daysRemaining = calculateCycleDaysRemaining(activeCycle, now, now);

    const totalDays = Math.max(
      1,
      Math.round(
        (cycleRange.endDate.getTime() - cycleRange.startDate.getTime()) /
          (1000 * 60 * 60 * 24)
      )
    );
    const daysPassed = Math.max(
      1,
      Math.min(totalDays, totalDays - daysRemaining)
    );
    const cycleProgressPercent = Math.min(
      100,
      Math.round((daysPassed / totalDays) * 100)
    );

    // 2. Постійні щомісячні витрати (підписки/шаблони)
    const { data: recurringItems } = await supabase
      .from("recurring_templates")
      .select("amount, currency")
      .eq("is_active", true);

    const usdRate = await getUsdRate();
    const recurringTotal = (recurringItems || []).reduce((sum, r) => {
      const amt = Number(r.amount) || 0;
      return sum + (r.currency === "USD" ? amt * usdRate : amt);
    }, 0);

    // 3. Транзакції активного циклу (з фільтром кошика .is("deleted_at", null))
    const { data: transactions, error: txError } = await supabase
      .from("transactions")
      .select(
        "id, amount, created_at, type, merchant_raw, category_name, exclude_from_budget"
      )
      .is("deleted_at", null)
      .gte("created_at", cycleRange.startDate.toISOString())
      .lte("created_at", cycleRange.endDate.toISOString())
      .order("created_at", { ascending: false });

    if (txError) {
      console.error("[WidgetSummary] Transaction query error:", txError);
      throw txError;
    }

    const expenseTx = (transactions || []).filter(
      (t) => t.type === "expense" && !t.exclude_from_budget
    );

    const totalCycleSpent = expenseTx.reduce(
      (sum, t) => sum + Number(t.amount || 0),
      0
    );

    const budgetLimit =
      Number(activeCycle?.budget_limit) || DEFAULT_BUDGET_LIMIT;
    const variableBudget = Math.max(0, budgetLimit - recurringTotal);
    const remainingBudget = Math.round(variableBudget - totalCycleSpent);

    const safeDailySpend = Math.max(
      0,
      Math.round(remainingBudget / Math.max(1, daysRemaining))
    );

    // 4. Розрахунок витрат за сьогодні (за київським часом Europe/Kyiv)
    const kyivTodayStr = getKyivDateString(now);
    const todayTx = expenseTx.filter(
      (t) => getKyivDateString(t.created_at) === kyivTodayStr
    );

    const todaySpent = Math.round(
      todayTx.reduce((sum, t) => sum + Number(t.amount || 0), 0)
    );
    const todayRemaining = Math.max(0, safeDailySpend - todaySpent);

    // 5. Визначення статусу темпу (on_track, warning, exceeded)
    let spendPaceStatus: "on_track" | "warning" | "exceeded" = "on_track";
    if (safeDailySpend > 0) {
      if (todaySpent > safeDailySpend) {
        spendPaceStatus = "exceeded";
      } else if (todaySpent >= safeDailySpend * 0.85) {
        spendPaceStatus = "warning";
      }
    } else if (todaySpent > 0) {
      spendPaceStatus = "exceeded";
    }

    // 6. Топ 3 категорії за цикл
    const categoryMap = new Map<string, number>();
    for (const t of expenseTx) {
      const cat = t.category_name || "Інше";
      categoryMap.set(cat, (categoryMap.get(cat) || 0) + Number(t.amount || 0));
    }

    const topCategories = Array.from(categoryMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([name, amount]) => ({
        name,
        amount: Math.round(amount),
      }));

    // 7. Остання зафіксована покупка
    const latestTx = expenseTx[0];
    let lastTransaction: WidgetSummaryResponse["lastTransaction"] = null;
    if (latestTx) {
      const txDate = new Date(latestTx.created_at);
      const timeStr = new Intl.DateTimeFormat("uk-UA", {
        timeZone: "Europe/Kyiv",
        hour: "2-digit",
        minute: "2-digit",
      }).format(txDate);

      lastTransaction = {
        merchant: latestTx.merchant_raw || "Покупка",
        amount: Math.round(Number(latestTx.amount || 0)),
        time: timeStr,
      };
    }

    const payload: WidgetSummaryResponse = {
      success: true,
      cycleName: activeCycle?.name || "Поточний місяць",
      safeDailySpend,
      todaySpent,
      todayRemaining,
      remainingBudget,
      daysRemaining,
      cycleProgressPercent,
      spendPaceStatus,
      topCategories,
      lastTransaction,
      updatedAt: now.toISOString(),
    };

    return NextResponse.json(payload, {
      headers: {
        "Cache-Control": "private, max-age=30, stale-while-revalidate=60",
      },
    });
  } catch (err: any) {
    console.error("[WidgetSummary] Error:", err);
    return NextResponse.json(
      {
        success: false,
        error:
          process.env.NODE_ENV === "production"
            ? "Помилка отримання даних віджета"
            : err.message,
      },
      { status: 500 }
    );
  }
}
