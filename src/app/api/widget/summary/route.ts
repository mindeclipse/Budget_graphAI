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
import { buildUpcomingSchedule } from "@/lib/subscription-radar";
import {
  calculateWeightedCalendarPacing,
  isWeekendOrLeisureDay,
} from "@/lib/weighted-pacing";
import { WidgetSummaryResponse, Transaction } from "@/types/finance";

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
      .select(
        "id, title, amount, currency, day_of_month, is_active, category_name"
      )
      .eq("is_active", true);

    const usdRate = await getUsdRate();

    // 3. Транзакції: витягуємо всі валідні від 15 серпня (базова лінія звичок)
    const habitBaselineIso = "2026-08-15T00:00:00.000Z";
    const fetchStart =
      cycleRange.startDate.toISOString() < habitBaselineIso
        ? cycleRange.startDate.toISOString()
        : habitBaselineIso;

    const { data: transactions, error: txError } = await supabase
      .from("transactions")
      .select(
        "id, amount, created_at, type, source, merchant_raw, category_name, exclude_from_budget, metadata"
      )
      .is("deleted_at", null)
      .gte("created_at", fetchStart)
      .order("created_at", { ascending: false });

    if (txError) {
      console.error("[WidgetSummary] Transaction query error:", txError);
      throw txError;
    }

    const validTx = (transactions || []).filter(
      (t) => t.type === "expense" && !t.exclude_from_budget
    ) as unknown as Transaction[];

    const cycleExpenseTx = validTx.filter((t) => {
      const time = new Date(t.created_at).getTime();
      return time >= cycleRange.startMs && time <= cycleRange.endMs;
    });

    const totalCycleSpent = cycleExpenseTx.reduce(
      (sum, t) => sum + Number(t.amount || 0),
      0
    );

    const budgetLimit =
      Number(activeCycle?.budget_limit) || DEFAULT_BUDGET_LIMIT;

    // Графік підписок з виключенням вже оплачених (запобігає подвійному списанню)
    const upcomingSchedule = buildUpcomingSchedule(
      recurringItems || [],
      cycleExpenseTx,
      usdRate,
      now
    );
    const unpaidRecurringTotal = upcomingSchedule.metrics.remaining_this_month;

    const upcomingObligations = upcomingSchedule.upcoming.map((u) => ({
      title: u.title,
      amount:
        u.currency === "USD"
          ? Math.round(u.amount * usdRate)
          : Number(u.amount),
      day_of_month: u.day_of_month,
      is_paid: u.status === "paid",
    }));

    // Зважений календарний темп за EMA (α)
    const weightedPacing = calculateWeightedCalendarPacing(validTx, {
      now,
      startDate: cycleRange.startDate,
      endDate: cycleRange.endDate,
      totalBudgetLimit: budgetLimit,
      currentExpenseTotal: totalCycleSpent,
      upcomingObligations,
    });

    const isTodayWeekend = isWeekendOrLeisureDay(now.getDay());
    const safeWeekdaySpend = weightedPacing.pacing.safeWeekdaySpend;
    const safeWeekendSpend = weightedPacing.pacing.safeWeekendSpend;
    const safeDailySpend = isTodayWeekend ? safeWeekendSpend : safeWeekdaySpend;

    const remainingBudget = Math.round(
      Math.max(0, budgetLimit - unpaidRecurringTotal - totalCycleSpent)
    );

    // 4. Розрахунок витрат за сьогодні (за київським часом Europe/Kyiv)
    // Виключаємо регулярні підписки (source === 'recurring' або зіставлені за розкладом),
    // оскільки вони вже зарезервовані в обов'язкових витратах циклу і не повинні зменшувати дискреційний денний ліміт.
    const paidRecurringTxIds = new Set(
      upcomingSchedule.upcoming
        .filter((u) => u.status === "paid" && u.matched_transaction_id != null)
        .map((u) => u.matched_transaction_id!)
    );

    const isRecurringTx = (t: Transaction) =>
      t.source === "recurring" ||
      (t.id != null && paidRecurringTxIds.has(t.id)) ||
      Boolean((t.metadata as any)?.recurring_id);

    const kyivTodayStr = getKyivDateString(now);
    const todayAllTx = cycleExpenseTx.filter(
      (t) => getKyivDateString(t.created_at) === kyivTodayStr
    );

    const todayDiscretionaryTx = todayAllTx.filter((t) => !isRecurringTx(t));
    const todayRecurringTx = todayAllTx.filter((t) => isRecurringTx(t));

    const todaySpent = Math.round(
      todayDiscretionaryTx.reduce((sum, t) => sum + Number(t.amount || 0), 0)
    );
    const todayRecurringSpent = Math.round(
      todayRecurringTx.reduce((sum, t) => sum + Number(t.amount || 0), 0)
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
    for (const t of cycleExpenseTx) {
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
    const latestTx = cycleExpenseTx[0];
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
      todayRecurringSpent,
      remainingBudget,
      daysRemaining,
      cycleProgressPercent,
      spendPaceStatus,
      safeWeekdaySpend,
      safeWeekendSpend,
      isTodayWeekend,
      pacingStatusLabel: weightedPacing.pacing.statusLabel,
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
