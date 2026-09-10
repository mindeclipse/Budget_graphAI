import { getCycleDateRange, DEFAULT_BUDGET_LIMIT } from "@/lib/cycle-utils";

export interface DailyBudgetInfo {
  todayRemaining: number;
  todayTarget: number;
  todaySpent: number;
  cycleRemaining: number;
  daysRemaining: number;
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
  supabaseAdmin: any,
  now: Date = new Date()
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
      : DEFAULT_BUDGET_LIMIT;

    const range = getCycleDateRange(activeCycle, now);
    const cycleStart = range.startDate;
    const cycleEnd = range.endDate;

    const todayStr = getKyivDateString(now);
    const cycleEndStr = getKyivDateString(cycleEnd);

    // Розрахунок кількості календарних днів від сьогодні (включно) до кінця циклу
    const dToday = new Date(todayStr + "T00:00:00Z");
    const dEnd = new Date(cycleEndStr + "T00:00:00Z");
    const msDiff = dEnd.getTime() - dToday.getTime();
    const daysRemaining = Math.max(1, Math.round(msDiff / 86400000) + 1);

    // 2. Постійні витрати (шаблони обов'язкових платежів: оренда, підписки)
    const { data: recurringItems } = await supabaseAdmin
      .from("recurring_templates")
      .select("amount, currency, is_active")
      .eq("is_active", true);

    const recurringTotal = (recurringItems || []).reduce(
      (sum: number, r: any) => {
        const amt = Number(r.amount) || 0;
        return sum + (r.currency === "USD" ? amt * 42 : amt);
      },
      0
    );

    // Змінний бюджет на щоденні споживчі витрати (їжа, кафе, авто, покупки тощо)
    const variableBudget = Math.max(0, budgetLimit - recurringTotal);

    // 3. Витрати за цикл (тільки споживчі витрати; виключаємо recurring-платежі щоб уникнути подвійного списання)
    const { data: periodTx } = await supabaseAdmin
      .from("transactions")
      .select("amount, type, source, exclude_from_budget, created_at")
      .gte("created_at", cycleStart.toISOString())
      .lte("created_at", cycleEnd.toISOString())
      .is("deleted_at", null);

    const variableExpenses = (periodTx || []).filter(
      (t: any) =>
        t.type === "expense" &&
        !t.exclude_from_budget &&
        t.source !== "recurring"
    );

    // Розділяємо витрати: зроблені до початку сьогоднішнього дня vs витрачені сьогодні
    let spentBeforeToday = 0;
    let spentToday = 0;

    for (const t of variableExpenses) {
      const amt = Number(t.amount || 0);
      const txDayStr = getKyivDateString(t.created_at);
      if (txDayStr < todayStr) {
        spentBeforeToday += amt;
      } else if (txDayStr === todayStr) {
        spentToday += amt;
      }
    }

    // Залишок змінного бюджету на початок поточного дня
    const budgetAtStartOfDay = variableBudget - spentBeforeToday;

    // Денний таргет (ліміт) на сьогодні
    const todayTarget =
      budgetAtStartOfDay > 0 && daysRemaining > 0
        ? Math.round(budgetAtStartOfDay / daysRemaining)
        : 0;

    // Реальний залишок на СЬОГОДНІ: зменшується строго 1:1 на кожну гривню витрати
    const todayRemaining = Math.round(todayTarget - spentToday);

    // Загальний залишок змінного бюджету до кінця активного циклу
    const cycleRemaining = Math.round(
      variableBudget - (spentBeforeToday + spentToday)
    );

    return {
      todayRemaining,
      todayTarget,
      todaySpent: Math.round(spentToday * 100) / 100,
      cycleRemaining,
      daysRemaining,
    };
  } catch (err) {
    console.error("Помилка розрахунку safeDailyRemaining у classify:", err);
    return null;
  }
}
