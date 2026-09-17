import { escapeHtml } from "@/lib/security";
import { TelegramReplyMarkup } from "@/lib/telegram";
import { generateBudgetDashboardImage } from "@/lib/dashboard-image";
import { ROUNDUP_GOAL_NAME } from "@/lib/roundup-utils";
import {
  formatKyivDate,
  renderProgressBar,
  formatPaceResponse,
  formatWhatIfResponse,
} from "@/lib/bot/formatters";
import {
  calculateWeightedCalendarPacing,
  simulatePurchaseImpact,
  isWeekendOrLeisureDay,
  WeightedPacingResult,
  getEffectiveTransactionExpense,
  loadPastAmortizationObligations,
  UpcomingObligation,
} from "@/lib/weighted-pacing";
import { getKyivDayOfWeek } from "@/lib/behavioral-metrics";
import { getCycleDateRange, FALLBACK_BUDGET_LIMIT } from "@/lib/cycle-utils";
import { getUsdRate } from "@/lib/currency";
import { buildUpcomingSchedule } from "@/lib/subscription-radar";
import { Transaction } from "@/types/finance";
import {
  loadFinancialAssistantContext,
  generateFinancialAssistantResponse,
} from "@/lib/financial-ai-assistant";

/**
 * Допоміжна функція завантаження та розрахунку темпу поточного бюджетного циклу
 */
export async function loadCyclePacing(
  supabaseAdmin: any,
  now: Date = new Date()
): Promise<{
  pacing: WeightedPacingResult;
  startDate: Date;
  endDate: Date;
  totalBudgetLimit: number;
}> {
  // Отримуємо активний або останній цикл
  const { data: activeCycle } = await supabaseAdmin
    .from("budget_cycles")
    .select("id, name, budget_limit, start_date, end_date, is_active")
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const cycleConfig =
    activeCycle ||
    (
      await supabaseAdmin
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

  const habitBaselineIso = "2026-08-15T00:00:00.000Z";
  const fetchStart =
    startDate.toISOString() < habitBaselineIso
      ? startDate.toISOString()
      : habitBaselineIso;

  const { data: txs } = await supabaseAdmin
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

  const { data: recurring } = await supabaseAdmin
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
    supabaseAdmin,
    startDate,
    now
  );
  if (pastObligations.length > 0) {
    upcomingObligations.push(...pastObligations);
  }

  const currentExpenseTotal = cycleTransactions
    .filter((t) => !t.exclude_from_budget && t.type === "expense")
    .reduce((sum, t) => sum + getEffectiveTransactionExpense(t), 0);

  const pacing = calculateWeightedCalendarPacing(allValidTransactions, {
    now,
    startDate,
    endDate,
    totalBudgetLimit,
    currentExpenseTotal,
    upcomingObligations,
  });

  return { pacing, startDate, endDate, totalBudgetLimit };
}

/**
 * Обробник команди або запиту про темп бюджету
 */
export async function handleTelegramPaceCommand(
  supabaseAdmin: any,
  now: Date = new Date()
): Promise<string> {
  const { pacing } = await loadCyclePacing(supabaseAdmin, now);
  return formatPaceResponse(pacing, now);
}

/**
 * Обробник запиту про розгорнутий залишок та підсумок циклу
 */
export async function handleTelegramCycleSummaryCommand(
  supabaseAdmin: any,
  now: Date = new Date()
): Promise<string> {
  const { pacing, startDate, endDate, totalBudgetLimit } =
    await loadCyclePacing(supabaseAdmin, now);

  const spentPercent = Math.min(
    999,
    Math.round(
      (pacing.budget.currentExpenseTotal / (totalBudgetLimit || 1)) * 100
    )
  );

  const statusEmojis: Record<string, string> = {
    healthy: "🟢",
    tight: "🟡",
    critical: "🟠",
    depleted: "🔴",
  };
  const statusEmoji = statusEmojis[pacing.pacing.status] || "ℹ️";

  const actualDailyAverage =
    pacing.cycle.daysPassed > 0
      ? Math.round(pacing.budget.currentExpenseTotal / pacing.cycle.daysPassed)
      : 0;

  const lines = [
    `📊 <b>Підсумок бюджетного циклу</b>`,
    ``,
    `🗓 <b>Період:</b> ${formatKyivDate(startDate)} — ${formatKyivDate(endDate)}`,
    `⏳ <b>Прогрес часу:</b> ${pacing.cycle.daysPassed} з ${pacing.cycle.daysTotal} дн. (залишилось ${pacing.cycle.daysRemaining} дн.)`,
    ``,
    `💰 <b>Загальний ліміт:</b> <code>${totalBudgetLimit.toLocaleString("uk-UA")} ₴</code>`,
    `💸 <b>Витрачено:</b> <code>${pacing.budget.currentExpenseTotal.toLocaleString("uk-UA")} ₴</code> (${spentPercent}%)`,
    `<code>[${renderProgressBar(spentPercent)}]</code>`,
    ``,
    `💵 <b>Вільний залишок:</b> <b>${pacing.budget.discretionaryRemaining.toLocaleString("uk-UA")} ₴</b>`,
    `🔒 <b>Зарезервовано під підписки:</b> ${pacing.budget.reservedObligationsTotal.toLocaleString("uk-UA")} ₴`,
    ``,
    `📈 <b>Середні витрати:</b>`,
    `• Фактично: ~${actualDailyAverage.toLocaleString("uk-UA")} ₴/день`,
    `• Базовий орієнтир: ~${pacing.pacing.flatDailySpend.toLocaleString("uk-UA")} ₴/день`,
    `• Рекомендовано будні: ~${pacing.pacing.safeWeekdaySpend.toLocaleString("uk-UA")} ₴/день`,
    `• Рекомендовано вихідні: ~${pacing.pacing.safeWeekendSpend.toLocaleString("uk-UA")} ₴/день`,
  ];

  if (pacing.surplusProjection.projectedSurplusAmount > 0) {
    lines.push(
      ``,
      `🎯 <b>Очікуваний профіцит:</b> +${pacing.surplusProjection.projectedSurplusAmount.toLocaleString("uk-UA")} ₴ (${pacing.surplusProjection.savingsPotentialPercent}%)`
    );
  }

  lines.push(
    ``,
    `${statusEmoji} <b>Статус:</b> ${pacing.pacing.statusLabel}`,
    `💡 <i>${escapeHtml(pacing.pacing.advice)}</i>`
  );

  return lines.join("\n");
}

/**
 * Обробник запиту на генерацію графічної картки / дашборду бюджету
 */
export async function handleTelegramChartCommand(
  supabaseAdmin: any,
  now: Date = new Date()
): Promise<{
  photoBuffer: Buffer;
  caption: string;
  replyMarkup: TelegramReplyMarkup;
}> {
  const { pacing } = await loadCyclePacing(supabaseAdmin, now);

  const { data: goals } = await supabaseAdmin
    .from("savings_goals")
    .select("id, name, current_amount")
    .order("id", { ascending: true });

  const cushionGoal = (goals || []).find(
    (g: any) =>
      g.name?.toLowerCase().includes("подушка") ||
      g.name?.toLowerCase() === ROUNDUP_GOAL_NAME.toLowerCase()
  );
  const cushionCurrent = Number(cushionGoal?.current_amount || 0);

  const currentMonthStart = new Date(
    now.getFullYear(),
    now.getMonth(),
    1
  ).toISOString();

  const { data: rawRoundupTxs } = await supabaseAdmin
    .from("transactions")
    .select("amount, created_at, merchant_raw, category_name, source")
    .gte("created_at", currentMonthStart)
    .or(
      "category_name.ilike.%подушка%,merchant_raw.ilike.%округлення%,source.eq.roundup"
    )
    .is("deleted_at", null);

  const monthRoundupTxs = (rawRoundupTxs || []).filter((t: any) => {
    const m = (t.merchant_raw || "").toLowerCase();
    return (
      m.includes("округлення") || m.includes("решта") || t.source === "roundup"
    );
  });

  const monthRoundupAmount =
    Math.round(
      monthRoundupTxs.reduce(
        (sum: number, t: any) => sum + Number(t.amount || 0),
        0
      ) * 100
    ) / 100;

  const photoBuffer = await generateBudgetDashboardImage(pacing, {
    cushionCurrent,
    monthRoundupAmount,
  });

  const statusEmojis: Record<string, string> = {
    healthy: "🟢",
    tight: "🟡",
    critical: "🟠",
    depleted: "🔴",
  };
  const statusEmoji = statusEmojis[pacing.pacing.status] || "ℹ️";

  const dayOfWeek = getKyivDayOfWeek(now);
  const isWeekend = isWeekendOrLeisureDay(dayOfWeek);
  const safeToday = isWeekend
    ? pacing.pacing.safeWeekendSpend
    : pacing.pacing.safeWeekdaySpend;

  const caption = [
    `📈 <b>Графічний дашборд бюджетного циклу</b>`,
    ``,
    `Статус: ${statusEmoji} <b>${pacing.pacing.statusLabel}</b>`,
    `Вільний залишок: <b>${pacing.budget.discretionaryRemaining.toLocaleString("uk-UA")} ₴</b>`,
    `Ліміт на сьогодні (${isWeekend ? "вихідні" : "будні"}): <b>~${safeToday.toLocaleString("uk-UA")} ₴</b>`,
  ].join("\n");

  const appUrl =
    process.env.APP_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "https://budget-pwa.vercel.app";

  const replyMarkup: TelegramReplyMarkup = {
    inline_keyboard: [
      [
        { text: "🔄 Оновити графік", callback_data: "tg_send_chart" },
        { text: "🎯 Мій темп", callback_data: "tg_refresh_pace" },
      ],
      [{ text: "📊 Відкрити BudgetGraph", url: appUrl }],
    ],
  };

  return { photoBuffer, caption, replyMarkup };
}

/**
 * Обробник запиту про стан подушки безпеки та скарбнички автоокруглення
 */
export async function handleTelegramEmergencyFundCommand(
  supabaseAdmin: any,
  now: Date = new Date()
): Promise<string> {
  const { data: goals } = await supabaseAdmin
    .from("savings_goals")
    .select("id, name, target_amount, current_amount, currency")
    .order("id", { ascending: true });

  const cushionGoal = (goals || []).find(
    (g: any) =>
      g.name?.toLowerCase().includes("подушка") ||
      g.name?.toLowerCase() === ROUNDUP_GOAL_NAME.toLowerCase()
  );

  const otherGoals = (goals || []).filter((g: any) => g.id !== cushionGoal?.id);

  const { data: rawRoundupTxs } = await supabaseAdmin
    .from("transactions")
    .select("amount, created_at, merchant_raw, category_name, source")
    .or(
      "category_name.ilike.%подушка%,merchant_raw.ilike.%округлення%,source.eq.roundup"
    )
    .is("deleted_at", null);

  const roundupTxs: any[] = [];
  const directTransfers: any[] = [];

  for (const t of rawRoundupTxs || []) {
    const m = (t.merchant_raw || "").toLowerCase();
    if (
      m.includes("округлення") ||
      m.includes("решта") ||
      t.source === "roundup"
    ) {
      roundupTxs.push(t);
    } else {
      directTransfers.push(t);
    }
  }

  const totalRoundupAmount =
    Math.round(
      roundupTxs.reduce(
        (sum: number, t: any) => sum + Number(t.amount || 0),
        0
      ) * 100
    ) / 100;
  const totalRoundupsCount = roundupTxs.length;

  const directTransferTotal =
    Math.round(
      directTransfers.reduce(
        (sum: number, t: any) => sum + Number(t.amount || 0),
        0
      ) * 100
    ) / 100;
  const directTransfersCount = directTransfers.length;

  const currentMonthStart = new Date(
    now.getFullYear(),
    now.getMonth(),
    1
  ).toISOString();

  const monthRoundupTxs = roundupTxs.filter(
    (t: any) => t.created_at && t.created_at >= currentMonthStart
  );
  const monthRoundupAmount =
    Math.round(
      monthRoundupTxs.reduce(
        (sum: number, t: any) => sum + Number(t.amount || 0),
        0
      ) * 100
    ) / 100;
  const monthRoundupCount = monthRoundupTxs.length;

  const cushionCurrent = Number(cushionGoal?.current_amount || 0);
  const cushionTarget = cushionGoal?.target_amount
    ? Number(cushionGoal.target_amount)
    : null;

  const lines = [
    `🛡️ <b>Фінансова подушка безпеки</b>`,
    ``,
    `🪙 <b>Скарбничка автоокруглення («${escapeHtml(cushionGoal?.name || ROUNDUP_GOAL_NAME)}»):</b>`,
    `• Доступний баланс: <b>${cushionCurrent.toLocaleString("uk-UA")} ₴</b>`,
  ];

  if (cushionTarget && cushionTarget > 0) {
    const progressPercent = Math.min(
      100,
      Math.round((cushionCurrent / cushionTarget) * 100)
    );
    lines.push(
      `• Ціль: <b>${cushionTarget.toLocaleString("uk-UA")} ₴</b> (${progressPercent}%)`,
      `<code>[${renderProgressBar(progressPercent)}]</code>`
    );
  }

  lines.push(
    `• Заощаджено рештою за цей місяць: <b>+${monthRoundupAmount.toLocaleString("uk-UA")} ₴</b> (${monthRoundupCount} оп.)`,
    `• Всього накопичено чистою рештою: <b>+${totalRoundupAmount.toLocaleString("uk-UA")} ₴</b> (${totalRoundupsCount} оп.)`
  );

  if (directTransfersCount > 0) {
    lines.push(
      `• Прямі поповнення подушки: <b>+${directTransferTotal.toLocaleString("uk-UA")} ₴</b> (${directTransfersCount} оп.)`
    );
  }

  if (otherGoals.length > 0) {
    lines.push(``, `💵 <b>Інші активи та резерви:</b>`);
    for (const g of otherGoals) {
      const currSymbol =
        g.currency === "USD"
          ? "$"
          : g.currency === "EUR"
            ? "€"
            : g.currency === "UAH"
              ? "₴"
              : g.currency;
      const amount = Number(g.current_amount || 0).toLocaleString("uk-UA");
      lines.push(`• ${escapeHtml(g.name)}: <b>${amount} ${currSymbol}</b>`);
    }
  }

  lines.push(
    ``,
    `💡 <i>Кожна безготівкова витрата округлюється до 10 ₴, непомітно формуючи вашу фінансову безпеку.</i>`
  );

  return lines.join("\n");
}

/**
 * Обробник довідки щодо симулятора What-If
 */
export function handleTelegramWhatIfGuideCommand(): string {
  return [
    `💡 <b>Симулятор покупок (What-If аналіз)</b>`,
    ``,
    `Симулятор дозволяє перед покупкою дізнатися, чи не порушить вона баланс бюджету та як змінить ваш щоденний темп витрат.`,
    ``,
    `🤖 <b>Як зробити запит? Напишіть у чат будь-яку з фраз:</b>`,
    `• <code>/whatif 1500</code> або <code>/whatif 2500 кросівки</code>`,
    `• <code>чи можу купити кросівки за 3200?</code>`,
    `• <code>хочу купити навушники 2500 грн</code>`,
    `• <code>чи норм витратити 800 на ресторан?</code>`,
    `• <code>планую покупку 4500</code>`,
    ``,
    `📊 <b>Що порахує бот:</b>`,
    `1. ✅ <b>Вердикт:</b> <i>Безпечно</i>, <i>Обережно</i> або <i>Не рекомендовано</i>.`,
    `2. 📉 <b>Зміну лімітів:</b> перерахує новий ліміт на будні (Пн-Чт) та вихідні (Пт-Нд).`,
    `3. 🔒 <b>Захист зобов'язань:</b> врахує всі майбутні підписки та обов'язкові платежі до кінця циклу.`,
  ].join("\n");
}

/**
 * Обробник симуляції What-If для Telegram
 */
export async function handleTelegramWhatIfCommand(
  amount: number,
  itemDescription: string | undefined,
  supabaseAdmin: any,
  now: Date = new Date()
): Promise<string> {
  // Отримуємо активний або останній цикл
  const { data: activeCycle } = await supabaseAdmin
    .from("budget_cycles")
    .select("id, name, budget_limit, start_date, end_date, is_active")
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const cycleConfig =
    activeCycle ||
    (
      await supabaseAdmin
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

  const habitBaselineIso = "2026-08-15T00:00:00.000Z";
  const fetchStart =
    startDate.toISOString() < habitBaselineIso
      ? startDate.toISOString()
      : habitBaselineIso;

  const { data: txs } = await supabaseAdmin
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

  const { data: recurring } = await supabaseAdmin
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
  const pastWhatIfObligations = await loadPastAmortizationObligations(
    supabaseAdmin,
    startDate,
    now
  );
  if (pastWhatIfObligations.length > 0) {
    upcomingObligations.push(...pastWhatIfObligations);
  }

  const currentExpenseTotal = cycleTransactions
    .filter((t) => !t.exclude_from_budget && t.type === "expense")
    .reduce((sum, t) => sum + getEffectiveTransactionExpense(t), 0);

  const simulation = simulatePurchaseImpact(
    amount,
    allValidTransactions,
    {
      now,
      startDate,
      endDate,
      totalBudgetLimit,
      currentExpenseTotal,
      upcomingObligations,
    },
    itemDescription
  );

  return formatWhatIfResponse(simulation);
}

/**
 * Обробник фінансового запиту природною мовою через AI
 */
export async function handleTelegramFinancialInquiry(
  query: string,
  supabaseAdmin: any,
  now: Date = new Date()
): Promise<{ replyHtml: string; replyMarkup: TelegramReplyMarkup }> {
  const context = await loadFinancialAssistantContext(supabaseAdmin, now);
  return generateFinancialAssistantResponse(query, context);
}
