import { getCycleDateRange, DEFAULT_BUDGET_LIMIT } from "@/lib/cycle-utils";

export function formatQuickSummary(
  cleanTitle: string,
  amount: number,
  categoryName: string,
  safeDailyRemaining: number | null
): string {
  const amountFormatted = `${Number(amount)
    .toLocaleString("uk-UA")
    .replace(/\u00A0/g, " ")} ₴`;
  let summary = `${cleanTitle}: ${amountFormatted} (${categoryName})`;

  if (safeDailyRemaining !== null) {
    if (safeDailyRemaining > 0) {
      summary += ` • На день: ${safeDailyRemaining.toLocaleString("uk-UA").replace(/\u00A0/g, " ")} ₴`;
    } else {
      summary += ` • Денний бюджет вичерпано`;
    }
  }

  return summary;
}

export async function computeSafeDailyBudget(
  supabaseAdmin: any
): Promise<number | null> {
  try {
    const now = new Date();

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

    const msPerDay = 1000 * 60 * 60 * 24;
    const daysTotal = Math.max(
      1,
      Math.round((cycleEnd.getTime() - cycleStart.getTime()) / msPerDay)
    );
    const daysPassed = Math.max(
      1,
      Math.min(
        daysTotal,
        Math.ceil((now.getTime() - cycleStart.getTime()) / msPerDay)
      )
    );
    const daysRemaining = Math.max(1, daysTotal - daysPassed);

    // 2. Постійні витрати
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

    // 3. Витрати за період (вже з урахуванням доданої транзакції)
    const { data: periodTx } = await supabaseAdmin
      .from("transactions")
      .select("amount, type, exclude_from_budget, created_at")
      .gte("created_at", cycleStart.toISOString())
      .lte("created_at", cycleEnd.toISOString());

    const periodExpenses = (periodTx || []).filter(
      (t: any) => t.type !== "income" && !t.exclude_from_budget
    );

    const totalSpentPeriod = periodExpenses.reduce(
      (sum: number, t: any) => sum + Number(t.amount || 0),
      0
    );

    const variableBudget = Math.max(0, budgetLimit - recurringTotal);
    const remainingBudget = Math.max(0, variableBudget - totalSpentPeriod);

    return Math.round(remainingBudget / daysRemaining);
  } catch (err) {
    console.error("Помилка розрахунку safeDailyRemaining у classify:", err);
    return null;
  }
}
