import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { sendTelegramMessage } from "@/lib/telegram";

const ESTIMATED_USD_RATE = 44.5;

export async function checkDailyBudgetThreshold(customBudgetLimit?: number) {
  const supabase = getSupabaseAdmin();
  const now = new Date();

  // Локальна дата за київським часом (YYYY-MM-DD)
  const kyivDateStr = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Kyiv",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);

  const startOfMonth = `${kyivDateStr.slice(0, 7)}-01T00:00:00Z`;
  const startOfDay = `${kyivDateStr}T00:00:00Z`;

  // 1. Перевірка дедуплікації за сьогодні
  const { data: existingAlert } = await supabase
    .from("budget_alerts")
    .select("id")
    .eq("alert_date", kyivDateStr)
    .eq("alert_type", "daily_85_percent")
    .maybeSingle();

  if (existingAlert) {
    return { alerted: false, reason: "already_notified_today" };
  }

  // 2. Отримуємо місячний ліміт (якщо не передано — читаємо 35000 або з налаштувань)
  const budgetLimit = customBudgetLimit || 35000;

  // 3. Завантажуємо активні постійні витрати
  const { data: recurringItems } = await supabase
    .from("recurring_templates")
    .select("amount, currency, is_active")
    .eq("is_active", true);

  const recurringTotal = (recurringItems || []).reduce((sum, r) => {
    const amt = Number(r.amount) || 0;
    return sum + (r.currency === "USD" ? amt * ESTIMATED_USD_RATE : amt);
  }, 0);

  // 4. Завантажуємо витрати поточного місяця
  const { data: monthTransactions, error } = await supabase
    .from("transactions")
    .select("amount, created_at, type")
    .gte("created_at", startOfMonth)
    .eq("type", "expense");

  if (error || !monthTransactions) {
    console.error("Error fetching transactions for alert:", error);
    return { alerted: false, error };
  }

  const totalSpentMonth = monthTransactions.reduce(
    (sum, t) => sum + Number(t.amount || 0),
    0
  );

  // Витрати за поточну добу
  const todayTransactions = monthTransactions.filter(
    (t) => t.created_at >= startOfDay
  );
  const totalSpentToday = todayTransactions.reduce(
    (sum, t) => sum + Number(t.amount || 0),
    0
  );

  // 5. Точна математика вільного залишку
  const [year, month] = kyivDateStr.split("-").map(Number);
  const totalDaysInMonth = new Date(year, month, 0).getDate();
  const currentDay = Number(kyivDateStr.split("-")[2]);
  const daysRemaining = Math.max(1, totalDaysInMonth - currentDay + 1);

  const variableBudget = Math.max(0, budgetLimit - recurringTotal);
  const remaining = variableBudget - totalSpentMonth;
  const safeDailySpend =
    daysRemaining > 0 && remaining > 0 ? remaining / daysRemaining : 0;

  const threshold85 = safeDailySpend * 0.85;

  // 6. Якщо витрати перевищили 85% від денного ліміту (або якщо денний ліміт уже 0 через оверспенд)
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
        alert_date: kyivDateStr,
        alert_type: "daily_85_percent",
      });
      return { alerted: true, totalSpentToday, safeDailySpend };
    }
  }

  return { alerted: false, totalSpentToday, safeDailySpend };
}
