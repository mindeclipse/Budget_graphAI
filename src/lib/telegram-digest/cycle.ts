import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { sendTelegramMessage, TelegramReplyMarkup } from "@/lib/telegram";
import { getCycleDateRange, DEFAULT_BUDGET_LIMIT } from "@/lib/cycle-utils";
import { Transaction } from "@/types/finance";
import { getKyivDateString } from "@/lib/behavioral-metrics";
import {
  DigestResult,
  CycleSummaryOptions,
  CycleSummaryData,
  CycleTopCategory,
} from "./types";
import { getAppUrl, formatCycleSummaryHtml } from "./formatters";
import { generateCycleSummaryConclusion } from "./ai";

/**
 * Генерує та надсилає Підсумковий AI-дайджест наприкінці зарплатного циклу
 */
export async function generateCycleSummary(
  targetCycleId?: string,
  options?: CycleSummaryOptions
): Promise<DigestResult<CycleSummaryData>> {
  const supabase = getSupabaseAdmin();
  const now = new Date();
  const kyivTodayStr = getKyivDateString(now);

  // 1. Отримання цільового циклу
  let query = supabase.from("budget_cycles").select("*");
  if (targetCycleId) {
    query = query.eq("id", targetCycleId);
  } else {
    // Шукаємо активний або нещодавно завершений цикл
    query = query.order("created_at", { ascending: false }).limit(1);
  }

  const { data: cycleData, error: cycleError } = await query.maybeSingle();

  if (cycleError || !cycleData) {
    console.error("[CycleSummary] Cycle not found:", cycleError);
    return { success: false, sent: false, reason: "cycle_not_found" };
  }

  const cycle = cycleData;
  const cycleAlertKey = `cycle_summary_${cycle.id}`;

  // 2. Дедуплікація
  if (!options?.force) {
    const { data: existingAlert } = await supabase
      .from("budget_alerts")
      .select("id")
      .eq("alert_type", cycleAlertKey)
      .maybeSingle();

    if (existingAlert) {
      console.log("[CycleSummary] Summary already sent for cycle:", cycle.id);
      return { success: true, sent: false, reason: "already_sent_for_cycle" };
    }
  }

  // 3. Межі дат циклу
  const cycleRange = getCycleDateRange(cycle, now);
  const startDateIso = cycleRange.startDate.toISOString();
  const endDateIso = cycleRange.endDate.toISOString();

  const cycleDurationDays = Math.max(
    1,
    Math.round(
      (cycleRange.endDate.getTime() - cycleRange.startDate.getTime()) /
        (1000 * 60 * 60 * 24)
    )
  );

  // 4. Отримання всіх транзакцій циклу
  const { data: cycleTx, error: txError } = await supabase
    .from("transactions")
    .select(
      "id, amount, created_at, type, merchant_raw, category_name, exclude_from_budget"
    )
    .is("deleted_at", null)
    .gte("created_at", startDateIso)
    .lte("created_at", endDateIso)
    .order("created_at", { ascending: false });

  if (txError) {
    console.error("[CycleSummary] Error fetching transactions:", txError);
    return { success: false, sent: false, reason: txError.message };
  }

  const expenseTx = ((cycleTx || []) as unknown as Transaction[]).filter(
    (t) => t.type === "expense" && !t.exclude_from_budget
  );

  const totalSpent = expenseTx.reduce(
    (sum, t) => sum + Number(t.amount || 0),
    0
  );

  // Інвестиції та заощадження за цикл
  const cycleInvestments = (cycleTx || []).filter(
    (t) =>
      t.type === "investment" &&
      !t.exclude_from_budget &&
      !t.merchant_raw?.toLowerCase().includes("дивіденд") &&
      !t.merchant_raw?.toLowerCase().includes("подат")
  );
  const totalCycleInvested = cycleInvestments.reduce(
    (sum, t) => sum + Number(t.amount || 0),
    0
  );

  const cycleSavings = (cycleTx || []).filter(
    (t) =>
      t.type === "transfer" &&
      !t.exclude_from_budget &&
      !t.merchant_raw?.toLowerCase().includes("інжур") &&
      !t.merchant_raw?.toLowerCase().includes("inzhur")
  );
  const totalCycleSaved = cycleSavings.reduce(
    (sum, t) => sum + Number(t.amount || 0),
    0
  );

  const budgetLimit = Number(cycle.budget_limit) || DEFAULT_BUDGET_LIMIT;
  const savedAmount = budgetLimit - totalSpent;
  const isSaved = savedAmount >= 0;
  const savedPercent =
    budgetLimit > 0 ? ((savedAmount / budgetLimit) * 100).toFixed(1) : "0";

  // Рекомендований переказ у Скарбничку/Подушку (70% від зекономленого залишку)
  const piggyBankAmount =
    isSaved && savedAmount > 0 ? Math.round(savedAmount * 0.7) : 0;

  // 5. Топ 5 категорій
  const categoryMap = new Map<string, number>();
  for (const t of expenseTx) {
    const cat = t.category_name || "Інше";
    categoryMap.set(cat, (categoryMap.get(cat) || 0) + Number(t.amount || 0));
  }

  const topCategories: CycleTopCategory[] = Array.from(categoryMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, amount], index) => ({
      rank: index + 1,
      name,
      amount,
      percent: totalSpent > 0 ? ((amount / totalSpent) * 100).toFixed(1) : "0",
    }));

  // Топ-2 найбільші покупки циклу
  const topPurchases = [...expenseTx]
    .sort((a, b) => Number(b.amount || 0) - Number(a.amount || 0))
    .slice(0, 2);

  // 6. Gemini аналіз підсумків
  const aiConclusion = await generateCycleSummaryConclusion({
    cycleName: cycle.name || "Зарплатний цикл",
    cycleDurationDays,
    budgetLimit,
    totalSpent,
    isSaved,
    savedAmount,
    savedPercent,
    topCategories,
    topPurchases,
    totalCycleInvested,
    totalCycleSaved,
  });

  // 7. Форматування Telegram HTML
  const htmlMessage = formatCycleSummaryHtml({
    cycleName: cycle.name || "Поточний цикл",
    cycleDurationDays,
    budgetLimit,
    totalSpent,
    isSaved,
    savedAmount,
    savedPercent,
    piggyBankAmount,
    topCategories,
    topPurchases,
    totalCycleInvested,
    totalCycleSaved,
    aiConclusion,
  });

  const appUrl = getAppUrl();
  const replyMarkup: TelegramReplyMarkup = {
    inline_keyboard: [
      [
        { text: "➕ Почати новий цикл", url: `${appUrl}/?action=new_cycle` },
        { text: "📊 Додаток", url: appUrl },
      ],
    ],
  };

  const sent = await sendTelegramMessage(htmlMessage, replyMarkup);

  if (sent) {
    await supabase.from("budget_alerts").insert({
      alert_date: kyivTodayStr,
      alert_type: cycleAlertKey,
    });
    console.log(
      "[CycleSummary] Telegram message sent successfully for cycle:",
      cycle.id
    );
  }

  return {
    success: true,
    sent,
    data: {
      cycleId: cycle.id,
      budgetLimit,
      totalSpent,
      totalCycleInvested,
      totalCycleSaved,
      savedAmount,
      isSaved,
      topCategories,
    },
  };
}
