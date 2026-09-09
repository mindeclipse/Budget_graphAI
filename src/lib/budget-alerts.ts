import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { sendTelegramMessage } from "@/lib/telegram";
import { getUsdRate } from "@/lib/currency";

const CYCLE_DURATION_DAYS = 30; // Стандартна тривалість зарплатного циклу

function getKyivDateString(date: Date | string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Kyiv",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(date));
}

export async function checkDailyBudgetThreshold(customBudgetLimit?: number) {
  const supabase = getSupabaseAdmin();
  const now = new Date();

  const kyivTodayStr = getKyivDateString(now);
  const kyivMonthStr = kyivTodayStr.slice(0, 7); // "YYYY-MM"

  // 1. Дедуплікація сповіщень за сьогодні
  const { data: existingAlert } = await supabase
    .from("budget_alerts")
    .select("id")
    .eq("alert_date", kyivTodayStr)
    .eq("alert_type", "daily_85_percent")
    .maybeSingle();

  if (existingAlert) {
    console.log("[BudgetAlert] Already notified today:", kyivTodayStr);
    return { alerted: false, reason: "already_notified_today" };
  }

  // 2. Отримання поточного активного зарплатного циклу
  const { data: activeCycle } = await supabase
    .from("budget_cycles")
    .select("id, name, start_date, end_date, budget_limit, is_active")
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // 3. Визначення ліміту бюджету (пріоритет: активний цикл -> кастомний параметр -> дефолт 35 000)
  const budgetLimit = activeCycle?.budget_limit
    ? Number(activeCycle.budget_limit)
    : customBudgetLimit || 35000;

  // 4. Завантаження активних постійних витрат
  const { data: recurringItems } = await supabase
    .from("recurring_templates")
    .select("amount, currency, is_active")
    .eq("is_active", true);

  const usdRate = await getUsdRate();
  const recurringTotal = (recurringItems || []).reduce((sum, r) => {
    const amt = Number(r.amount) || 0;
    return sum + (r.currency === "USD" ? amt * usdRate : amt);
  }, 0);

  // 5. Розрахунок днів та початкової дати вибірки операцій
  let cycleStartIso: string;
  let daysRemaining = 0;

  if (activeCycle) {
    // Якщо є активний зарплатний цикл — рахуємо дні циклу (30 днів)
    const cycleStart = new Date(activeCycle.start_date);
    const cycleEnd = activeCycle.end_date
      ? new Date(activeCycle.end_date)
      : new Date(
          cycleStart.getTime() + CYCLE_DURATION_DAYS * 24 * 60 * 60 * 1000
        );

    cycleStartIso = cycleStart.toISOString();
    const diffMs = cycleEnd.getTime() - now.getTime();
    daysRemaining = Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
  } else {
    // Фоллбек на звичайний календарний місяць
    const [year, month, day] = kyivTodayStr.split("-").map(Number);
    const totalDaysInMonth = new Date(year, month, 0).getDate();
    daysRemaining = Math.max(1, totalDaysInMonth - day + 1);
    cycleStartIso = `${kyivMonthStr}-01T00:00:00Z`;
  }

  // 6. Отримання транзакцій від старту активного вікна
  const { data: rawTransactions, error } = await supabase
    .from("transactions")
    .select("amount, created_at, type, exclude_from_budget")
    .gte("created_at", cycleStartIso);

  if (error || !rawTransactions) {
    console.error("[BudgetAlert] Error fetching transactions:", error);
    return { alerted: false, error };
  }

  // Враховуємо лише реальні витрати, які не виключені з бюджету
  const periodExpenses = rawTransactions.filter(
    (t) => t.type !== "income" && !t.exclude_from_budget
  );

  const totalSpentPeriod = periodExpenses.reduce(
    (sum, t) => sum + Number(t.amount || 0),
    0
  );

  // Фільтрація витрат суто за поточну київську добу
  const todayTransactions = periodExpenses.filter(
    (t) => getKyivDateString(t.created_at) === kyivTodayStr
  );

  const totalSpentToday = todayTransactions.reduce(
    (sum, t) => sum + Number(t.amount || 0),
    0
  );

  // 7. Розрахунок лімітів
  const variableBudget = Math.max(0, budgetLimit - recurringTotal);
  const remaining = variableBudget - totalSpentPeriod;
  const safeDailySpend =
    daysRemaining > 0 && remaining > 0 ? remaining / daysRemaining : 0;

  const threshold85 = safeDailySpend * 0.85;

  // Діагностичний лог у Vercel
  console.log("[BudgetAlert] Calculation:", {
    date: kyivTodayStr,
    activeCycleId: activeCycle?.id || null,
    todayTransactionsCount: todayTransactions.length,
    totalSpentToday,
    threshold85,
    safeDailySpend,
    variableBudget,
    remaining,
    daysRemaining,
  });

  // 8. Порівняння з порогом 85%
  if (totalSpentToday >= threshold85 && totalSpentToday > 0) {
    const percentSpent =
      safeDailySpend > 0
        ? Math.round((totalSpentToday / safeDailySpend) * 100)
        : 100;

    const message = [
      `⚠️ <b>Увага: денний ліміт перевищено!</b>`,
      ``,
      `💸 Витрачено за сьогодні: <b>${totalSpentToday.toFixed(2)} ₴</b> (${percentSpent}% від норми)`,
      `🎯 Безпечний ліміт на день: <b>${safeDailySpend.toFixed(2)} ₴</b>`,
      ``,
      `📉 Вільний залишок на <b>${daysRemaining} дн.</b>: <b>${remaining.toFixed(2)} ₴</b>`,
      `🔒 Зарезервовано на постійні витрати: <b>${recurringTotal.toLocaleString("uk-UA")} ₴</b>`,
    ].join("\n");

    const sent = await sendTelegramMessage(message);

    if (sent) {
      await supabase.from("budget_alerts").insert({
        alert_date: kyivTodayStr,
        alert_type: "daily_85_percent",
      });
      console.log("[BudgetAlert] Telegram notification successfully sent.");
      return { alerted: true, totalSpentToday, safeDailySpend };
    }
  }

  return { alerted: false, totalSpentToday, safeDailySpend };
}
