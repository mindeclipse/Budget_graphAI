import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { sendTelegramMessage } from "@/lib/telegram";

const ESTIMATED_USD_RATE = 44.5;

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
  const startOfMonthIso = `${kyivMonthStr}-01T00:00:00Z`;

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

  // 2. Місячний ліміт
  const budgetLimit = customBudgetLimit || 35000;

  // 3. Завантаження активних постійних витрат
  const { data: recurringItems } = await supabase
    .from("recurring_templates")
    .select("amount, currency, is_active")
    .eq("is_active", true);

  const recurringTotal = (recurringItems || []).reduce((sum, r) => {
    const amt = Number(r.amount) || 0;
    return sum + (r.currency === "USD" ? amt * ESTIMATED_USD_RATE : amt);
  }, 0);

  // 4. Отримання транзакцій поточного місяця (враховуємо все, крім явних income)
  const { data: rawTransactions, error } = await supabase
    .from("transactions")
    .select("amount, created_at, type")
    .gte("created_at", startOfMonthIso);

  if (error || !rawTransactions) {
    console.error("[BudgetAlert] Error fetching transactions:", error);
    return { alerted: false, error };
  }

  const monthExpenses = rawTransactions.filter((t) => t.type !== "income");

  const totalSpentMonth = monthExpenses.reduce(
    (sum, t) => sum + Number(t.amount || 0),
    0
  );

  // Фільтрація операцій саме за сьогоднішню добу за Києвом
  const todayTransactions = monthExpenses.filter(
    (t) => getKyivDateString(t.created_at) === kyivTodayStr
  );

  const totalSpentToday = todayTransactions.reduce(
    (sum, t) => sum + Number(t.amount || 0),
    0
  );

  // 5. Розрахунок лімітів
  const [year, month, day] = kyivTodayStr.split("-").map(Number);
  const totalDaysInMonth = new Date(year, month, 0).getDate();
  const daysRemaining = Math.max(1, totalDaysInMonth - day + 1);

  const variableBudget = Math.max(0, budgetLimit - recurringTotal);
  const remaining = variableBudget - totalSpentMonth;
  const safeDailySpend =
    daysRemaining > 0 && remaining > 0 ? remaining / daysRemaining : 0;

  const threshold85 = safeDailySpend * 0.85;

  // Діагностичний лог у Vercel
  console.log("[BudgetAlert] Calculation:", {
    date: kyivTodayStr,
    todayTransactionsCount: todayTransactions.length,
    totalSpentToday,
    threshold85,
    safeDailySpend,
    variableBudget,
    remaining,
    daysRemaining,
  });

  // 6. Порівняння з порогом 85%
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
