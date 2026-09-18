import {
  getCycleDateRange,
  calculateCycleDaysRemaining,
  DEFAULT_BUDGET_LIMIT,
} from "@/lib/cycle-utils";
import { getUsdRate } from "@/lib/currency";
import { buildUpcomingSchedule } from "@/lib/subscription-radar";
import {
  calculateWeightedCalendarPacing,
  isWeekendOrLeisureDay,
  UpcomingObligation,
} from "@/lib/weighted-pacing";
import { SupabaseClient } from "@supabase/supabase-js";
import { Transaction } from "@/types/finance";

export interface DailyBudgetInfo {
  todayRemaining: number;
  todayTarget: number;
  todaySpent: number;
  cycleRemaining: number;
  daysRemaining: number;
  recurringTotal?: number;
  safeWeekdaySpend?: number;
  safeWeekendSpend?: number;
  isTodayWeekend?: boolean;
}

/**
 * Повертає дату у часовому поясі Києва (Europe/Kyiv) у форматі YYYY-MM-DD.
 */
export function getKyivDateString(date: Date | string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Kyiv",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(date));
}

export function formatQuickSummary(
  cleanTitle: string,
  amount: number,
  categoryName: string,
  dailyBudget: DailyBudgetInfo | number | null,
  roundupAmount?: number | null
): string {
  const amountFormatted = `${Number(amount)
    .toLocaleString("uk-UA")
    .replace(/\u00A0/g, " ")} ₴`;
  let summary = `${cleanTitle}: ${amountFormatted} (${categoryName})`;

  if (roundupAmount && roundupAmount > 0) {
    const roundupFormatted = `${Number(roundupAmount)
      .toLocaleString("uk-UA")
      .replace(/\u00A0/g, " ")} ₴`;
    summary += ` • Подушка: +${roundupFormatted}`;
  }

  if (dailyBudget !== null && dailyBudget !== undefined) {
    const todayRemaining =
      typeof dailyBudget === "number"
        ? dailyBudget
        : dailyBudget.todayRemaining;

    if (todayRemaining > 0) {
      summary += ` • На день: ${todayRemaining.toLocaleString("uk-UA").replace(/\u00A0/g, " ")} ₴`;
    } else if (todayRemaining === 0) {
      summary += ` • Денний бюджет вичерпано`;
    } else {
      const overspent = Math.abs(todayRemaining)
        .toLocaleString("uk-UA")
        .replace(/\u00A0/g, " ");
      summary += ` • На день: -${overspent} ₴ (переліміт)`;
    }
  }

  return summary;
}

export async function computeSafeDailyBudget(
  supabaseAdmin: SupabaseClient | any,
  now: Date = new Date(),
  customBudgetLimit?: number
): Promise<DailyBudgetInfo | null> {
  try {
    // 1. Отримуємо активний цикл або стандартний календарний місяць
    const { data: activeCycle } = await supabaseAdmin
      .from("budget_cycles")
      .select("budget_limit, is_active, start_date, end_date")
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const budgetLimit = activeCycle?.budget_limit
      ? Number(activeCycle.budget_limit)
      : customBudgetLimit || DEFAULT_BUDGET_LIMIT;

    const range = getCycleDateRange(activeCycle, now);
    const daysRemaining = calculateCycleDaysRemaining(activeCycle, now, now);

    // 2. Постійні щомісячні витрати (підписки/шаблони)
    const { data: recurringItems } = await supabaseAdmin
      .from("recurring_templates")
      .select(
        "id, title, amount, currency, day_of_month, is_active, category_name"
      )
      .eq("is_active", true);

    const usdRate = await getUsdRate();

    // 3. Транзакції активного циклу + базова лінія для аналізу звичок (з 15 серпня)
    const habitBaselineIso = "2026-08-15T00:00:00.000Z";
    const fetchStart =
      range.startDate.toISOString() < habitBaselineIso
        ? range.startDate.toISOString()
        : habitBaselineIso;

    const { data: periodTx } = await supabaseAdmin
      .from("transactions")
      .select(
        "id, amount, currency, type, source, exclude_from_budget, created_at, merchant_raw, category_name, metadata"
      )
      .gte("created_at", fetchStart)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });

    const validTx = ((periodTx || []) as unknown as Transaction[]).filter(
      (t) => t.type === "expense" && !t.exclude_from_budget
    );

    const cycleExpenseTx = validTx.filter((t) => {
      const time = new Date(t.created_at).getTime();
      return time >= range.startMs && time <= range.endMs;
    });

    const totalCycleSpent = cycleExpenseTx.reduce(
      (s, t) => s + Number(t.amount || 0),
      0
    );

    // 4. Графік підписок з виключенням вже оплачених (запобігає подвійному списанню)
    const upcomingSchedule = buildUpcomingSchedule(
      recurringItems || [],
      cycleExpenseTx,
      usdRate,
      now
    );
    const unpaidRecurringTotal = upcomingSchedule.metrics.remaining_this_month;

    const upcomingObligations: UpcomingObligation[] =
      upcomingSchedule.upcoming.map((u) => ({
        title: u.title,
        amount:
          u.currency === "USD"
            ? Math.round(u.amount * usdRate)
            : Number(u.amount),
        day_of_month: u.day_of_month,
        is_paid: u.status === "paid",
      }));

    // 5. Розділяємо витрати: зроблені до початку сьогоднішнього дня vs витрачені сьогодні
    // Виключаємо регулярні підписки з `spentToday` (дискреційного темпу сьогодні),
    // оскільки вони вже зарезервовані в обов'язкових зобов'язаннях циклу.
    const paidRecurringTxIds = new Set(
      upcomingSchedule.upcoming
        .filter((u) => u.status === "paid" && u.matched_transaction_id != null)
        .map((u) => u.matched_transaction_id!)
    );

    const isRecurringTx = (t: Transaction) =>
      t.source === "recurring" ||
      (t.id != null && paidRecurringTxIds.has(t.id)) ||
      Boolean((t.metadata as any)?.recurring_id);

    const todayStr = getKyivDateString(now);
    let spentBeforeToday = 0;
    let spentToday = 0;

    for (const t of cycleExpenseTx) {
      const amt = Number(t.amount || 0);
      const txDayStr = getKyivDateString(t.created_at);
      if (isRecurringTx(t)) {
        spentBeforeToday += amt;
      } else if (txDayStr < todayStr) {
        spentBeforeToday += amt;
      } else if (txDayStr === todayStr) {
        spentToday += amt;
      }
    }

    // 6. Розрахунок зваженого календарного темпу на початок поточного дня
    const weightedPacing = calculateWeightedCalendarPacing(validTx, {
      now,
      startDate: range.startDate,
      endDate: range.endDate,
      totalBudgetLimit: budgetLimit,
      currentExpenseTotal: spentBeforeToday,
      upcomingObligations,
    });

    const isTodayWeekend = isWeekendOrLeisureDay(now.getDay());
    const safeWeekdaySpend = weightedPacing.pacing.safeWeekdaySpend;
    const safeWeekendSpend = weightedPacing.pacing.safeWeekendSpend;
    const todayTarget = isTodayWeekend ? safeWeekendSpend : safeWeekdaySpend;

    // Реальний залишок на СЬОГОДНІ: зменшується строго 1:1 на кожну гривню витрати
    const todayRemaining = Math.round(todayTarget - spentToday);

    // Загальний залишок вільного бюджету до кінця активного циклу
    const cycleRemaining = Math.round(
      Math.max(0, budgetLimit - unpaidRecurringTotal - totalCycleSpent)
    );

    return {
      todayRemaining,
      todayTarget,
      todaySpent: Math.round(spentToday * 100) / 100,
      cycleRemaining,
      daysRemaining,
      recurringTotal: Math.round(unpaidRecurringTotal),
      safeWeekdaySpend,
      safeWeekendSpend,
      isTodayWeekend,
    };
  } catch (err) {
    console.error("Помилка розрахунку safeDailyRemaining у classify:", err);
    return null;
  }
}
