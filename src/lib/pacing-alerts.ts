import { getSupabaseAdmin } from "@/lib/supabase-admin";
import {
  sendTelegramMessage,
  escapeHtml,
  TelegramReplyMarkup,
} from "@/lib/telegram";
import {
  getKyivDateString,
  getKyivDayOfWeek,
  formatAmount,
} from "@/lib/behavioral-metrics";
import {
  calculateWeightedCalendarPacing,
  getEffectiveTransactionExpense,
  loadPastAmortizationObligations,
  UpcomingObligation,
} from "@/lib/weighted-pacing";
import { Transaction } from "@/types/finance";
import { getCycleDateRange, FALLBACK_BUDGET_LIMIT } from "@/lib/cycle-utils";
import { getUsdRate } from "@/lib/currency";
import { buildUpcomingSchedule } from "@/lib/subscription-radar";
import { timingSafeEqual } from "@/lib/security";

function getAppUrl(): string {
  return (
    process.env.APP_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "https://budget-pwa.vercel.app"
  );
}

/**
 * Валідує заголовок авторизації CRON через timingSafeEqual
 */
export function validateCronAuthorization(
  authHeader: string | null | undefined,
  cronSecret: string | undefined
): boolean {
  if (process.env.NODE_ENV === "production" || cronSecret) {
    if (!cronSecret || !authHeader) return false;
    return timingSafeEqual(authHeader, `Bearer ${cronSecret}`);
  }
  return true;
}

export interface PacingAlertResult {
  success: boolean;
  sent: boolean;
  alertType?: "pacing_friday_radar" | "pacing_monday_reset";
  reason?: string;
  data?: any;
}

/**
 * П'ятничний радар вихідних (Friday Weekend Radar):
 * Розраховує та надсилає зважений вікенд-буфер на 3 дні (Пт-Сб-Нд),
 * показує збережений ліміт на наступний тиждень та прогноз профіциту.
 */
export async function generateFridayRadarAlert(options?: {
  force?: boolean;
  now?: Date;
  supabaseInstance?: any;
}): Promise<PacingAlertResult> {
  const supabase = options?.supabaseInstance || getSupabaseAdmin();
  const now = options?.now || new Date();
  const kyivTodayStr = getKyivDateString(now);

  // 1. Дедуплікація: не надсилати повторно у ту саму п'ятницю
  if (!options?.force) {
    const { data: existingAlert } = await supabase
      .from("budget_alerts")
      .select("id")
      .eq("alert_date", kyivTodayStr)
      .eq("alert_type", "pacing_friday_radar")
      .maybeSingle();

    if (existingAlert) {
      return {
        success: true,
        sent: false,
        alertType: "pacing_friday_radar",
        reason: "already_sent_today",
      };
    }
  }

  // 2. Отримання активного циклу
  const currentMonthStart = new Date(
    now.getFullYear(),
    now.getMonth(),
    1
  ).toISOString();
  const currentMonthEnd = new Date(
    now.getFullYear(),
    now.getMonth() + 1,
    0,
    23,
    59,
    59,
    999
  ).toISOString();

  // Отримуємо активний або останній цикл
  const { data: activeCycle } = await supabase
    .from("budget_cycles")
    .select("id, name, budget_limit, start_date, end_date, is_active")
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const cycleConfig =
    activeCycle ||
    (
      await supabase
        .from("budget_cycles")
        .select("id, name, budget_limit, start_date, end_date, is_active")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle()
    ).data;

  const { startDate, endDate } = getCycleDateRange(cycleConfig, now);
  const totalBudgetLimit = Number(
    cycleConfig?.budget_limit || FALLBACK_BUDGET_LIMIT
  );

  // 3. Завантаження валідних транзакцій циклу та історії звички
  const habitBaselineIso = "2026-08-15T00:00:00.000Z";
  const fetchStart =
    startDate.toISOString() < habitBaselineIso
      ? startDate.toISOString()
      : habitBaselineIso;

  const { data: txs } = await supabase
    .from("transactions")
    .select(
      "id, amount, currency, merchant_raw, category_name, source, type, created_at, exclude_from_budget, metadata, deleted_at"
    )
    .is("deleted_at", null)
    .gte("created_at", fetchStart)
    .lte("created_at", endDate.toISOString());

  const allValidTransactions = (txs || []) as Transaction[];

  const cycleTransactions = allValidTransactions.filter((t) => {
    const d = new Date(t.created_at);
    return d >= startDate && d <= endDate;
  });

  // 4. Завантаження шаблонів постійних платежів
  const { data: recurring } = await supabase
    .from("recurring_templates")
    .select(
      "id, title, amount, currency, day_of_month, is_active, category_name"
    )
    .eq("is_active", true);

  const usdRate = await getUsdRate();

  const schedule = buildUpcomingSchedule(
    recurring || [],
    cycleTransactions,
    usdRate,
    now
  );

  const upcomingObligations: UpcomingObligation[] = schedule.upcoming.map(
    (u) => ({
      title: u.title,
      amount:
        u.currency === "USD"
          ? Math.round(u.amount * usdRate)
          : Number(u.amount),
      day_of_month: u.day_of_month,
      is_paid: u.status === "paid",
    })
  );

  // Завантажуємо активні амортизовані витрати з попередніх місяців
  const pastObligations = await loadPastAmortizationObligations(
    supabase,
    startDate,
    now
  );
  if (pastObligations.length > 0) {
    upcomingObligations.push(...pastObligations);
  }

  const currentExpenseTotal = cycleTransactions
    .filter((t) => !t.exclude_from_budget && t.type === "expense")
    .reduce((sum, t) => sum + getEffectiveTransactionExpense(t), 0);

  // 5. Розрахунок зваженого темпу
  const pacing = calculateWeightedCalendarPacing(allValidTransactions, {
    now,
    startDate,
    endDate,
    totalBudgetLimit,
    currentExpenseTotal,
    upcomingObligations,
  });

  const weekendDaily = pacing.pacing.safeWeekendSpend;
  const weekendThreeDayTotal = weekendDaily * 3;

  const lines = [
    `🍻 <b>П'ятничний радар вихідних (Пт–Нд)</b>`,
    `🗓 <i>Ритм на 3 дні відпочинку та дозвілля</i>`,
    ``,
    `🎉 <b>Загальний вікенд-буфер (3 дні):</b> <code>${formatAmount(weekendThreeDayTotal)} ₴</code>`,
    `🍺 <b>Денний ліміт на вихідні:</b> ${formatAmount(weekendDaily)} ₴/день`,
    `💼 <b>Збережений ліміт на будні далі:</b> ${formatAmount(pacing.pacing.safeWeekdaySpend)} ₴/день`,
    ``,
    `📊 <b>Вільний залишок циклу:</b> ${formatAmount(pacing.budget.discretionaryRemaining)} ₴ (залишилось ${pacing.cycle.daysRemaining} дн.)`,
    `🔒 <b>Зарезервовано на підписки/оплати:</b> ${formatAmount(pacing.budget.reservedObligationsTotal)} ₴`,
  ];

  if (pacing.surplusProjection.projectedSurplusAmount > 0) {
    lines.push(
      ``,
      `🎯 <b>Очікуваний профіцит на кінець циклу:</b> +${formatAmount(pacing.surplusProjection.projectedSurplusAmount)} ₴ (${pacing.surplusProjection.savingsPotentialPercent}% бюджету)`
    );
  }

  lines.push(``, `💡 <i>${escapeHtml(pacing.pacing.advice)}</i>`);

  const appUrl = getAppUrl();
  const replyMarkup: TelegramReplyMarkup = {
    inline_keyboard: [
      [
        { text: "🔄 Оновити темп", callback_data: "tg_refresh_pace" },
        { text: "📊 Відкрити BudgetGraph", url: appUrl },
      ],
    ],
  };

  const sent = await sendTelegramMessage(lines.join("\n"), replyMarkup);

  if (sent) {
    await supabase.from("budget_alerts").insert({
      alert_date: kyivTodayStr,
      alert_type: "pacing_friday_radar",
    });
  }

  return {
    success: true,
    sent,
    alertType: "pacing_friday_radar",
    data: {
      kyivTodayStr,
      weekendThreeDayTotal,
      weekendDaily,
      safeWeekdaySpend: pacing.pacing.safeWeekdaySpend,
      discretionaryRemaining: pacing.budget.discretionaryRemaining,
      projectedSurplus: pacing.surplusProjection.projectedSurplusAmount,
    },
  };
}

/**
 * Понеділковий перезапуск злітної смуги (Monday Runway Reset):
 * Аналізує фактичні витрати за минулі вихідні (Пт-Сб-Нд),
 * калібрує новий щоденний ліміт на робочі дні тижня та оновлює прогноз профіциту.
 */
export async function generateMondayResetAlert(options?: {
  force?: boolean;
  now?: Date;
  supabaseInstance?: any;
}): Promise<PacingAlertResult> {
  const supabase = options?.supabaseInstance || getSupabaseAdmin();
  const now = options?.now || new Date();
  const kyivTodayStr = getKyivDateString(now);

  // 1. Дедуплікація: не надсилати повторно у той самий понеділок
  if (!options?.force) {
    const { data: existingAlert } = await supabase
      .from("budget_alerts")
      .select("id")
      .eq("alert_date", kyivTodayStr)
      .eq("alert_type", "pacing_monday_reset")
      .maybeSingle();

    if (existingAlert) {
      return {
        success: true,
        sent: false,
        alertType: "pacing_monday_reset",
        reason: "already_sent_today",
      };
    }
  }

  // 2. Часові межі активного циклу
  const currentMonthStart = new Date(
    now.getFullYear(),
    now.getMonth(),
    1
  ).toISOString();
  const currentMonthEnd = new Date(
    now.getFullYear(),
    now.getMonth() + 1,
    0,
    23,
    59,
    59,
    999
  ).toISOString();

  // Отримуємо активний або останній цикл
  const { data: activeCycle } = await supabase
    .from("budget_cycles")
    .select("id, name, budget_limit, start_date, end_date, is_active")
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const cycleConfig =
    activeCycle ||
    (
      await supabase
        .from("budget_cycles")
        .select("id, name, budget_limit, start_date, end_date, is_active")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle()
    ).data;

  const { startDate, endDate } = getCycleDateRange(cycleConfig, now);
  const totalBudgetLimit = Number(
    cycleConfig?.budget_limit || FALLBACK_BUDGET_LIMIT
  );

  // 3. Завантаження валідних транзакцій циклу
  // 3. Завантаження валідних транзакцій циклу та історії звички
  const habitBaselineIso = "2026-08-15T00:00:00.000Z";
  const fetchStart =
    startDate.toISOString() < habitBaselineIso
      ? startDate.toISOString()
      : habitBaselineIso;

  const { data: txs } = await supabase
    .from("transactions")
    .select(
      "id, amount, currency, merchant_raw, category_name, source, type, created_at, exclude_from_budget, metadata, deleted_at"
    )
    .is("deleted_at", null)
    .gte("created_at", fetchStart)
    .lte("created_at", endDate.toISOString());

  const allValidTransactions = (txs || []) as Transaction[];

  const cycleTransactions = allValidTransactions.filter((t) => {
    const d = new Date(t.created_at);
    return d >= startDate && d <= endDate;
  });

  // 4. Аналіз минулих вихідних (Пт, Сб, Нд перед цим понеділком)
  const fridayDate = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
  const sundayDate = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000);
  const fridayKyivStr = getKyivDateString(fridayDate);
  const sundayKyivStr = getKyivDateString(sundayDate);

  const pastWeekendTxs = cycleTransactions.filter((t) => {
    if (t.exclude_from_budget || t.type !== "expense" || t.deleted_at) {
      return false;
    }
    const tKyiv = getKyivDateString(t.created_at);
    return tKyiv >= fridayKyivStr && tKyiv <= sundayKyivStr;
  });

  const weekendSpent = pastWeekendTxs.reduce(
    (sum, t) => sum + getEffectiveTransactionExpense(t),
    0
  );

  // 5. Завантаження обов'язкових платежів
  const { data: recurring } = await supabase
    .from("recurring_templates")
    .select(
      "id, title, amount, currency, day_of_month, is_active, category_name"
    )
    .eq("is_active", true);

  const usdRate = await getUsdRate();

  const schedule = buildUpcomingSchedule(
    recurring || [],
    cycleTransactions,
    usdRate,
    now
  );

  const upcomingObligations: UpcomingObligation[] = schedule.upcoming.map(
    (u) => ({
      title: u.title,
      amount:
        u.currency === "USD"
          ? Math.round(u.amount * usdRate)
          : Number(u.amount),
      day_of_month: u.day_of_month,
      is_paid: u.status === "paid",
    })
  );

  // Завантажуємо активні амортизовані витрати з попередніх місяців
  const pastObligations = await loadPastAmortizationObligations(
    supabase,
    startDate,
    now
  );
  if (pastObligations.length > 0) {
    upcomingObligations.push(...pastObligations);
  }

  const currentExpenseTotal = cycleTransactions
    .filter((t) => !t.exclude_from_budget && t.type === "expense")
    .reduce((sum, t) => sum + getEffectiveTransactionExpense(t), 0);

  // 6. Розрахунок свіжого темпу на новий робочий тиждень
  const pacing = calculateWeightedCalendarPacing(allValidTransactions, {
    now,
    startDate,
    endDate,
    totalBudgetLimit,
    currentExpenseTotal,
    upcomingObligations,
  });

  let weekendFeedback = "";
  if (weekendSpent === 0) {
    weekendFeedback = `✨ <b>Минулі вихідні пройшли без споживчих витрат (0 ₴)!</b> Чудовий резерв збережено.`;
  } else {
    weekendFeedback = `💸 <b>Витрачено за вікенд (Пт–Нд):</b> ${formatAmount(weekendSpent)} ₴ (${pastWeekendTxs.length} операцій)`;
  }

  const lines = [
    `🌅 <b>Понеділковий Runway Reset: новий робочий тиждень</b>`,
    `🗓 <i>Свіже калібрування злітної смуги бюджету</i>`,
    ``,
    weekendFeedback,
    ``,
    `💼 <b>Денна норма на будні (Пн–Чт):</b> <code>${formatAmount(pacing.pacing.safeWeekdaySpend)} ₴/день</code>`,
    `🍻 <b>Плановий вікенд-буфер:</b> ~${formatAmount(pacing.pacing.safeWeekendSpend)} ₴/день`,
    ``,
    `📊 <b>Вільний залишок:</b> ${formatAmount(pacing.budget.discretionaryRemaining)} ₴ (залишилось ${pacing.cycle.daysRemaining} дн.)`,
    `🔒 <b>Зарезервовано під обов'язкові платежі:</b> ${formatAmount(pacing.budget.reservedObligationsTotal)} ₴`,
  ];

  if (pacing.surplusProjection.projectedSurplusAmount > 0) {
    lines.push(
      ``,
      `🎯 <b>Прогноз профіциту на кінець циклу:</b> +${formatAmount(pacing.surplusProjection.projectedSurplusAmount)} ₴ (${pacing.surplusProjection.savingsPotentialPercent}% бюджету)`
    );
  }

  lines.push(``, `💡 <i>${escapeHtml(pacing.pacing.advice)}</i>`);

  const appUrl = getAppUrl();
  const replyMarkup: TelegramReplyMarkup = {
    inline_keyboard: [
      [
        { text: "🔄 Оновити темп", callback_data: "tg_refresh_pace" },
        { text: "📊 Відкрити BudgetGraph", url: appUrl },
      ],
    ],
  };

  const sent = await sendTelegramMessage(lines.join("\n"), replyMarkup);

  if (sent) {
    await supabase.from("budget_alerts").insert({
      alert_date: kyivTodayStr,
      alert_type: "pacing_monday_reset",
    });
  }

  return {
    success: true,
    sent,
    alertType: "pacing_monday_reset",
    data: {
      kyivTodayStr,
      weekendSpent,
      weekendTxsCount: pastWeekendTxs.length,
      safeWeekdaySpend: pacing.pacing.safeWeekdaySpend,
      safeWeekendSpend: pacing.pacing.safeWeekendSpend,
      discretionaryRemaining: pacing.budget.discretionaryRemaining,
      projectedSurplus: pacing.surplusProjection.projectedSurplusAmount,
    },
  };
}
