import { getSupabaseAdmin } from "@/lib/supabase-admin";
import {
  sendTelegramMessage,
  escapeHtml,
  TelegramReplyMarkup,
} from "@/lib/telegram";
import { getGeminiClient, GEMINI_MODELS } from "@/lib/gemini";

const ESTIMATED_USD_RATE = 44.5;
const CYCLE_DURATION_DAYS = 30;

function getAppUrl(): string {
  return (
    process.env.APP_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "https://budget-pwa.vercel.app"
  );
}

function getKyivDateString(date: Date | string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Kyiv",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(date));
}

function formatAmount(num: number): string {
  return Math.round(num).toLocaleString("uk-UA");
}

function getKyivWeekKey(d: Date = new Date()): string {
  const dateStr = getKyivDateString(d);
  const [year, month, day] = dateStr.split("-").map(Number);
  const curr = new Date(Date.UTC(year, month - 1, day));
  const dayNum = curr.getUTCDay() || 7;
  curr.setUTCDate(curr.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(curr.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(
    ((curr.getTime() - yearStart.getTime()) / 86400000 + 1) / 7
  );
  return `weekly_digest_${curr.getUTCFullYear()}_W${weekNo.toString().padStart(2, "0")}`;
}

/**
 * Генерує та надсилає Щотижневий AI-дайджест у Telegram
 */
export async function generateWeeklyDigest(options?: {
  force?: boolean;
}): Promise<{
  success: boolean;
  sent: boolean;
  reason?: string;
  data?: any;
}> {
  const supabase = getSupabaseAdmin();
  const now = new Date();
  const kyivTodayStr = getKyivDateString(now);
  const weekKey = getKyivWeekKey(now);

  // 1. Перевірка дедуплікації
  if (!options?.force) {
    const { data: existingAlert } = await supabase
      .from("budget_alerts")
      .select("id")
      .eq("alert_type", weekKey)
      .maybeSingle();

    if (existingAlert) {
      console.log("[WeeklyDigest] Already sent for week:", weekKey);
      return { success: true, sent: false, reason: "already_sent_this_week" };
    }
  }

  // 2. Межі дат: поточні 7 днів та попередні 7 днів (для WoW динаміки)
  const msInDay = 24 * 60 * 60 * 1000;
  const currentWeekStart = new Date(now.getTime() - 7 * msInDay);
  const prevWeekStart = new Date(now.getTime() - 14 * msInDay);

  const { data: rawTransactions, error: txError } = await supabase
    .from("transactions")
    .select(
      "id, amount, created_at, type, merchant_raw, category_name, exclude_from_budget"
    )
    .gte("created_at", prevWeekStart.toISOString())
    .order("created_at", { ascending: false });

  if (txError) {
    console.error("[WeeklyDigest] Error fetching transactions:", txError);
    return { success: false, sent: false, reason: txError.message };
  }

  const validTransactions = (rawTransactions || []).filter(
    (t) => t.type !== "income" && !t.exclude_from_budget
  );

  const currentWeekTx = validTransactions.filter(
    (t) => new Date(t.created_at) >= currentWeekStart
  );
  const prevWeekTx = validTransactions.filter(
    (t) =>
      new Date(t.created_at) >= prevWeekStart &&
      new Date(t.created_at) < currentWeekStart
  );

  const thisWeekSpent = currentWeekTx.reduce(
    (sum, t) => sum + Number(t.amount || 0),
    0
  );
  const prevWeekSpent = prevWeekTx.reduce(
    (sum, t) => sum + Number(t.amount || 0),
    0
  );

  // 3. Динаміка порівняння з минулим тижнем (Week-over-Week)
  let wowText = "даних за попередній тиждень недостатньо";
  if (prevWeekSpent > 0) {
    const diffPercent = Math.round(
      ((thisWeekSpent - prevWeekSpent) / prevWeekSpent) * 100
    );
    if (diffPercent > 0) {
      wowText = `+${diffPercent}% до минулого тижня ↗️`;
    } else if (diffPercent < 0) {
      wowText = `${diffPercent}% до минулого тижня 📉`;
    } else {
      wowText = `на рівні минулого тижня ➡️`;
    }
  }

  // 4. Топ категорії за 7 днів
  const categoryMap = new Map<string, number>();
  for (const t of currentWeekTx) {
    const cat = t.category_name || "Інше";
    categoryMap.set(cat, (categoryMap.get(cat) || 0) + Number(t.amount || 0));
  }

  const sortedCategories = Array.from(categoryMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([name, amount]) => ({
      name,
      amount,
      percent:
        thisWeekSpent > 0 ? Math.round((amount / thisWeekSpent) * 100) : 0,
    }));

  // 5. Виявлення найбільшої разової покупки (Spike / Outlier)
  const largestTx = [...currentWeekTx].sort(
    (a, b) => Number(b.amount || 0) - Number(a.amount || 0)
  )[0];

  // 6. Стан активного циклу
  const { data: activeCycle } = await supabase
    .from("budget_cycles")
    .select("id, name, start_date, end_date, budget_limit")
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let daysRemaining = 0;
  let remainingBudget = 0;
  let safeDailySpend = 0;

  if (activeCycle) {
    const cycleStart = new Date(activeCycle.start_date);
    const cycleEnd = activeCycle.end_date
      ? new Date(activeCycle.end_date)
      : new Date(cycleStart.getTime() + CYCLE_DURATION_DAYS * msInDay);

    const diffMs = cycleEnd.getTime() - now.getTime();
    daysRemaining = Math.max(1, Math.ceil(diffMs / msInDay));

    const { data: cycleTx } = await supabase
      .from("transactions")
      .select("amount, type, exclude_from_budget")
      .gte("created_at", cycleStart.toISOString());

    const totalCycleSpent = (cycleTx || [])
      .filter((t) => t.type !== "income" && !t.exclude_from_budget)
      .reduce((s, t) => s + Number(t.amount || 0), 0);

    const { data: recurringItems } = await supabase
      .from("recurring_templates")
      .select("amount, currency")
      .eq("is_active", true);

    const recurringTotal = (recurringItems || []).reduce((sum, r) => {
      const amt = Number(r.amount) || 0;
      return sum + (r.currency === "USD" ? amt * ESTIMATED_USD_RATE : amt);
    }, 0);

    const limit = Number(activeCycle.budget_limit) || 35000;
    const variableBudget = Math.max(0, limit - recurringTotal);
    remainingBudget = variableBudget - totalCycleSpent;
    safeDailySpend = Math.max(0, Math.round(remainingBudget / daysRemaining));
  }

  // 7. Аналітика від Gemini
  let aiAdvice = "";
  try {
    const ai = getGeminiClient();
    const prompt = `
Аналізуй щотижневі фінансові витрати користувача:
- Витрачено за останні 7 днів: ${formatAmount(thisWeekSpent)} ₴
- Динаміка відносно минулого тижня: ${wowText} (було ${formatAmount(prevWeekSpent)} ₴)
- Топ категорії: ${sortedCategories.map((c) => `${c.name}: ${formatAmount(c.amount)} ₴ (${c.percent}%)`).join(", ")}
${largestTx ? `- Найбільша разова витрата: ${largestTx.merchant_raw} (${formatAmount(Number(largestTx.amount))} ₴)` : ""}
- До кінця циклу залишилося: ${daysRemaining} дн., вільний залишок: ${formatAmount(remainingBudget)} ₴, рекомендовано на день: ${formatAmount(safeDailySpend)} ₴/день.

Надай висновок українською мовою у 2-3 коротких ділових реченнях: оціни темп і дай 1 конкретну практичну пораду на наступний тиждень. Без вступних привітань, одразу суть.
`;

    const modelToUse = GEMINI_MODELS.BALANCED || "gemini-3.5-flash";
    const result = await ai.models.generateContent({
      model: modelToUse,
      contents: prompt,
      config: {
        temperature: 0.3,
      },
    });

    aiAdvice = result.text?.trim() || "";
  } catch (err) {
    console.warn("[WeeklyDigest] Gemini generation fallback:", err);
    aiAdvice = `Темп витрат за 7 днів склав ${formatAmount(thisWeekSpent)} ₴. Зверніть увагу на категорію «${sortedCategories[0]?.name || "головні витрати"}», яка займає найбільшу частку бюджету.`;
  }

  // 8. Форматування Telegram повідомлення
  const dateFromStr = getKyivDateString(currentWeekStart)
    .slice(5)
    .replace("-", ".");
  const dateToStr = kyivTodayStr.slice(5).replace("-", ".");

  const lines: string[] = [
    `📊 <b>Щотижневий AI-дайджест витрат</b>`,
    `🗓 <i>Період: ${dateFromStr} — ${dateToStr}</i>`,
    ``,
    `💸 <b>Витрати за 7 днів:</b> <b>${formatAmount(thisWeekSpent)} ₴</b>`,
    `📈 <b>Динаміка:</b> ${wowText}`,
    ``,
    `🏷 <b>Топ статті витрат:</b>`,
  ];

  if (sortedCategories.length > 0) {
    sortedCategories.forEach((cat) => {
      lines.push(
        `• ${escapeHtml(cat.name)}: <b>${formatAmount(cat.amount)} ₴</b> (${cat.percent}%)`
      );
    });
  } else {
    lines.push(`• Витрат не зафіксовано`);
  }

  if (largestTx && Number(largestTx.amount) > 0) {
    lines.push(``);
    lines.push(
      `⚡️ <b>Найбільша покупка:</b> ${escapeHtml(largestTx.merchant_raw)} (<b>${formatAmount(Number(largestTx.amount))} ₴</b>)`
    );
  }

  if (activeCycle) {
    lines.push(``);
    lines.push(`🎯 <b>Статус активного циклу:</b>`);
    lines.push(
      `• Залишилось: <b>${formatAmount(remainingBudget)} ₴</b> (на ${daysRemaining} дн.)`
    );
    lines.push(
      `• Безпечний темп: <b>${formatAmount(safeDailySpend)} ₴/день</b>`
    );
  }

  if (aiAdvice) {
    lines.push(``);
    lines.push(`💡 <b>Порада від Gemini:</b>`);
    lines.push(`<i>${escapeHtml(aiAdvice)}</i>`);
  }

  const appUrl = getAppUrl();
  const replyMarkup: TelegramReplyMarkup = {
    inline_keyboard: [[{ text: "📊 Відкрити BudgetGraph", url: appUrl }]],
  };

  const sent = await sendTelegramMessage(lines.join("\n"), replyMarkup);

  if (sent) {
    await supabase.from("budget_alerts").insert({
      alert_date: kyivTodayStr,
      alert_type: weekKey,
    });
    console.log("[WeeklyDigest] Telegram message sent successfully.");
  }

  return {
    success: true,
    sent,
    data: {
      weekKey,
      thisWeekSpent,
      prevWeekSpent,
      sortedCategories,
      largestTx,
      remainingBudget,
    },
  };
}

/**
 * Генерує та надсилає Підсумковий AI-дайджест наприкінці зарплатного циклу
 */
export async function generateCycleSummary(
  targetCycleId?: string,
  options?: { force?: boolean }
): Promise<{
  success: boolean;
  sent: boolean;
  reason?: string;
  data?: any;
}> {
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
  const startDateIso = new Date(cycle.start_date).toISOString();
  const endDateIso = cycle.end_date
    ? new Date(cycle.end_date).toISOString()
    : now.toISOString();

  const cycleDurationDays = Math.max(
    1,
    Math.round(
      (new Date(endDateIso).getTime() - new Date(startDateIso).getTime()) /
        (1000 * 60 * 60 * 24)
    )
  );

  // 4. Отримання всіх транзакцій циклу
  const { data: cycleTx, error: txError } = await supabase
    .from("transactions")
    .select(
      "id, amount, created_at, type, merchant_raw, category_name, exclude_from_budget"
    )
    .gte("created_at", startDateIso)
    .lte("created_at", endDateIso)
    .order("created_at", { ascending: false });

  if (txError) {
    console.error("[CycleSummary] Error fetching transactions:", txError);
    return { success: false, sent: false, reason: txError.message };
  }

  const expenseTx = (cycleTx || []).filter(
    (t) => t.type !== "income" && !t.exclude_from_budget
  );

  const totalSpent = expenseTx.reduce(
    (sum, t) => sum + Number(t.amount || 0),
    0
  );

  const budgetLimit = Number(cycle.budget_limit) || 35000;
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

  const topCategories = Array.from(categoryMap.entries())
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
  let aiConclusion = "";
  try {
    const ai = getGeminiClient();
    const prompt = `
Ти — особистий фінансовий радник. Проаналізуй підсумки завершеного зарплатного циклу:
- Назва циклу: ${cycle.name || "Зарплатний цикл"}
- Тривалість: ${cycleDurationDays} днів
- Плановий ліміт: ${formatAmount(budgetLimit)} ₴
- Фактичні витрати: ${formatAmount(totalSpent)} ₴
- Результат: ${isSaved ? `Збережено +${formatAmount(savedAmount)} ₴ (${savedPercent}%)` : `Перевитрата -${formatAmount(Math.abs(savedAmount))} ₴ (${savedPercent}%)`}
- Топ статті витрат: ${topCategories.map((c) => `${c.name}: ${formatAmount(c.amount)} ₴ (${c.percent}%)`).join(", ")}
${topPurchases.length > 0 ? `- Найбільші окремі витрати: ${topPurchases.map((p) => `${p.merchant_raw} (${formatAmount(Number(p.amount))} ₴)`).join(", ")}` : ""}

Сформулюй структурований висновок українською мовою:
1. Оцінка успішності циклу (1 коротке речення).
2. Головне спостереження щодо категорій або нетипових витрат (1 речення).
3. Порада та рекомендація щодо розміру ліміту на наступний цикл (наприклад, зберегти ${formatAmount(budgetLimit)} ₴ або скоригувати).
Відповідай ділово, без привітань, чітко й лаконічно.
`;

    const modelToUse = GEMINI_MODELS.BALANCED || "gemini-3.5-flash";
    const result = await ai.models.generateContent({
      model: modelToUse,
      contents: prompt,
      config: {
        temperature: 0.3,
      },
    });

    aiConclusion = result.text?.trim() || "";
  } catch (err) {
    console.warn("[CycleSummary] Gemini generation fallback:", err);
    if (isSaved) {
      aiConclusion = `Чудовий результат! Вам вдалося втриматися в рамках бюджету та зберегти ${formatAmount(savedAmount)} ₴. Рекомендуємо спрямувати вільний залишок у накопичення.`;
    } else {
      aiConclusion = `Зафіксовано перевитрату на ${formatAmount(Math.abs(savedAmount))} ₴. Зверніть увагу на витрати в категорії «${topCategories[0]?.name || "головні витрати"}» для оптимізації наступного циклу.`;
    }
  }

  // 7. Форматування Telegram HTML
  const lines: string[] = [
    `🏁 <b>Підсумок зарплатного циклу</b>`,
    `📌 <i>«${escapeHtml(cycle.name || "Поточний цикл")}» (${cycleDurationDays} дн.)</i>`,
    ``,
    `💰 <b>Плановий бюджет:</b> ${formatAmount(budgetLimit)} ₴`,
    `💸 <b>Фактично витрачено:</b> ${formatAmount(totalSpent)} ₴`,
  ];

  if (isSaved) {
    lines.push(
      `🎉 <b>Вдалося зберегти:</b> <b>+${formatAmount(savedAmount)} ₴</b> (${savedPercent}%) ✅`
    );
    if (piggyBankAmount > 0) {
      lines.push(
        `🐷 <b>Рекомендовано у Скарбничку:</b> <b>${formatAmount(piggyBankAmount)} ₴</b> (70% від залишку)`
      );
    }
  } else {
    lines.push(
      `⚠️ <b>Перевитрата:</b> <b>-${formatAmount(Math.abs(savedAmount))} ₴</b> (${savedPercent}%)`
    );
  }

  lines.push(``);
  lines.push(`🏷 <b>Головні статті витрат циклу:</b>`);
  topCategories.forEach((cat) => {
    lines.push(
      `${cat.rank}. ${escapeHtml(cat.name)}: <b>${formatAmount(cat.amount)} ₴</b> (${cat.percent}%)`
    );
  });

  if (topPurchases.length > 0) {
    lines.push(``);
    lines.push(`🔍 <b>Найбільші окремі покупки:</b>`);
    topPurchases.forEach((p) => {
      lines.push(
        `• ${escapeHtml(p.merchant_raw)}: <b>${formatAmount(Number(p.amount))} ₴</b>`
      );
    });
  }

  if (aiConclusion) {
    lines.push(``);
    lines.push(`🤖 <b>Аналітичний висновок Gemini:</b>`);
    lines.push(`<i>${escapeHtml(aiConclusion)}</i>`);
  }

  const appUrl = getAppUrl();
  const replyMarkup: TelegramReplyMarkup = {
    inline_keyboard: [
      [
        { text: "➕ Почати новий цикл", url: `${appUrl}/?action=new_cycle` },
        { text: "📊 Додаток", url: appUrl },
      ],
    ],
  };

  const sent = await sendTelegramMessage(lines.join("\n"), replyMarkup);

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
      savedAmount,
      isSaved,
      topCategories,
    },
  };
}
