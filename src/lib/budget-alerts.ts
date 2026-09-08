import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { sendTelegramMessage } from "@/lib/telegram";

interface CheckBudgetAlertOptions {
  budgetLimit?: number; // якщо передається або береться за замовчуванням
}

export async function checkDailyBudgetThreshold({
  budgetLimit = 45000, // Вкажіть свій дефолтний місячний ліміт
}: CheckBudgetAlertOptions = {}) {
  const supabase = getSupabaseAdmin();
  const now = new Date();

  // Дати для вибірки поточного місяця та поточного дня (UTC)
  const startOfMonth = new Date(
    now.getFullYear(),
    now.getMonth(),
    1
  ).toISOString();
  const startOfDay = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate()
  ).toISOString();
  const todayDateStr = now.toISOString().split("T")[0];

  // 1. Перевіряємо, чи не відправлявся вже алерт сьогодні
  const { data: existingAlert } = await supabase
    .from("budget_alerts")
    .select("id")
    .eq("alert_date", todayDateStr)
    .eq("alert_type", "daily_85_percent")
    .maybeSingle();

  if (existingAlert) {
    return { alerted: false, reason: "already_notified_today" };
  }

  // 2. Отримуємо транзакції поточного місяця
  const { data: monthTransactions, error } = await supabase
    .from("transactions")
    .select("amount, created_at, type")
    .gte("created_at", startOfMonth)
    .eq("type", "expense");

  if (error || !monthTransactions) {
    console.error("Error fetching transactions for budget alert:", error);
    return { alerted: false, error };
  }

  // Розрахунок витрат за весь місяць
  const totalSpentMonth = monthTransactions.reduce(
    (sum, t) => sum + Number(t.amount || 0),
    0
  );

  // Розрахунок витрат за сьогодні
  const todayTransactions = monthTransactions.filter(
    (t) => new Date(t.created_at) >= new Date(startOfDay)
  );
  const totalSpentToday = todayTransactions.reduce(
    (sum, t) => sum + Number(t.amount || 0),
    0
  );

  // 3. Розрахунок параметрів безпечного денного ліміту
  const totalDaysInMonth = new Date(
    now.getFullYear(),
    now.getMonth() + 1,
    0
  ).getDate();
  const daysRemaining = Math.max(1, totalDaysInMonth - now.getDate() + 1);
  const remainingBudget = budgetLimit - totalSpentMonth;
  const safeDailySpend =
    remainingBudget > 0 ? remainingBudget / daysRemaining : 0;

  if (safeDailySpend <= 0) {
    return { alerted: false, reason: "budget_already_exhausted" };
  }

  const threshold85 = safeDailySpend * 0.85;

  // 4. Якщо витрати за сьогодні перевищили 85% від денного ліміту
  if (totalSpentToday >= threshold85) {
    const percentSpent = Math.round((totalSpentToday / safeDailySpend) * 100);

    const message = [
      `⚠️ <b>Увага: денний ліміт майже вичерпано!</b>`,
      ``,
      `Витрачено за сьогодні: <b>${totalSpentToday.toFixed(2)} ₴</b> (${percentSpent}% від безпечної норми)`,
      `Безпечний ліміт на день: <b>${safeDailySpend.toFixed(2)} ₴</b>`,
      `Пороги 85%: <b>${threshold85.toFixed(2)} ₴</b>`,
      ``,
      `📊 Залишок бюджету на місяць: <b>${remainingBudget.toFixed(2)} ₴</b>`,
      `⏳ Залишилося днів до кінця місяця: <b>${daysRemaining}</b>`,
    ].join("\n");

    const sent = await sendTelegramMessage(message);

    if (sent) {
      // Фіксуємо унікальний запис у базі
      await supabase.from("budget_alerts").insert({
        alert_date: todayDateStr,
        alert_type: "daily_85_percent",
      });
      return { alerted: true, totalSpentToday, safeDailySpend };
    }
  }

  return { alerted: false, totalSpentToday, safeDailySpend, threshold85 };
}
