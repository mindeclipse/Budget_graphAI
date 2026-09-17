import { getGeminiClient } from "@/lib/gemini";
import { SupportedGeminiModel } from "@/types/ai";
import { loadCyclePacing } from "@/lib/telegram-bot";
import { ROUNDUP_GOAL_NAME } from "@/lib/roundup-utils";
import { buildUpcomingSchedule } from "@/lib/subscription-radar";
import { getUsdRate } from "@/lib/currency";
import { Transaction } from "@/types/finance";
import { TelegramReplyMarkup } from "@/lib/telegram";

export interface FinancialAssistantContext {
  cycle: {
    name: string;
    startDate: string;
    endDate: string;
    daysTotal: number;
    daysPassed: number;
    daysRemaining: number;
  };
  budget: {
    totalBudgetLimit: number;
    currentExpenseTotal: number;
    discretionaryRemaining: number;
    reservedObligationsTotal: number;
  };
  pacing: {
    safeWeekdaySpend: number;
    safeWeekendSpend: number;
    flatDailySpend: number;
    statusLabel: string;
    advice: string;
  };
  surplusProjection: {
    projectedSurplusAmount: number;
    projectedDeficitAmount?: number;
    status?: string;
    summaryText: string;
  };
  cushion: {
    currentAmount: number;
    targetAmount?: number | null;
    monthRoundupAmount: number;
    totalRoundupAmount: number;
  };
  otherGoals: Array<{ name: string; amount: number; currency: string }>;
  subscriptions: Array<{
    title: string;
    amount: number;
    currency: string;
    day_of_month: number;
    status: string;
  }>;
  categoryStats: Record<string, { total: number; count: number }>;
  topPurchases: Array<{
    date: string;
    amount: number;
    merchant: string;
    category: string;
  }>;
  recentTransactions: Array<{
    date: string;
    amount: number;
    merchant: string;
    category: string;
    type: string;
    note?: string;
  }>;
  kyivNowStr: string;
}

/**
 * Завантажує та структурує повний фінансовий контекст користувача із Supabase
 */
export async function loadFinancialAssistantContext(
  supabaseAdmin: any,
  now: Date = new Date()
): Promise<FinancialAssistantContext> {
  const kyivNowStr = new Intl.DateTimeFormat("uk-UA", {
    timeZone: "Europe/Kyiv",
    dateStyle: "full",
    timeStyle: "medium",
  }).format(now);

  // 1. Поточний темп та бюджетний цикл
  const { pacing, startDate, endDate, totalBudgetLimit } =
    await loadCyclePacing(supabaseAdmin, now);

  // 2. Транзакції за останні 45 днів (для глибокого пошуку та аналізу)
  const past45Days = new Date(now.getTime() - 45 * 24 * 60 * 60 * 1000);
  const { data: rawTxs } = await supabaseAdmin
    .from("transactions")
    .select(
      "id, amount, currency, merchant_raw, category_name, source, type, created_at, exclude_from_budget, metadata, deleted_at"
    )
    .is("deleted_at", null)
    .gte("created_at", past45Days.toISOString())
    .lte("created_at", endDate.toISOString())
    .order("created_at", { ascending: false });

  const allTxs = (rawTxs || []) as Transaction[];

  // Транзакції суто поточного активного циклу
  const cycleTxs = allTxs.filter((t) => {
    const d = new Date(t.created_at);
    return d >= startDate && d <= endDate;
  });

  // Агрегація витрат за категоріями у поточному циклі
  const categoryStats: Record<string, { total: number; count: number }> = {};
  for (const t of cycleTxs) {
    if (t.type !== "expense" || t.exclude_from_budget) continue;
    const cat = t.category_name || "Інше";
    if (!categoryStats[cat]) {
      categoryStats[cat] = { total: 0, count: 0 };
    }
    categoryStats[cat].total =
      Math.round((categoryStats[cat].total + Number(t.amount || 0)) * 100) /
      100;
    categoryStats[cat].count += 1;
  }

  // Топ-10 найбільших покупок поточного циклу
  const topPurchases = cycleTxs
    .filter((t) => t.type === "expense" && !t.exclude_from_budget)
    .sort((a, b) => Number(b.amount || 0) - Number(a.amount || 0))
    .slice(0, 10)
    .map((t) => ({
      date: t.created_at.slice(0, 10),
      amount: Number(t.amount || 0),
      merchant: t.merchant_raw,
      category: t.category_name || "Інше",
    }));

  // Компактний список останніх транзакцій (до 150 шт.)
  const recentTransactions = allTxs.slice(0, 150).map((t) => ({
    date: t.created_at.slice(0, 10),
    amount: Number(t.amount || 0),
    merchant: t.merchant_raw,
    category: t.category_name || "Інше",
    type: t.type,
    note: (t as any).metadata?.note || undefined,
  }));

  // 3. Цілі накопичення та подушка безпеки
  const { data: goals } = await supabaseAdmin
    .from("savings_goals")
    .select("id, name, target_amount, current_amount, currency")
    .order("id", { ascending: true });

  const cushionGoal = (goals || []).find(
    (g: any) =>
      g.name?.toLowerCase().includes("подушка") ||
      g.name?.toLowerCase() === ROUNDUP_GOAL_NAME.toLowerCase()
  );
  const otherGoals = (goals || [])
    .filter((g: any) => g.id !== cushionGoal?.id)
    .map((g: any) => ({
      name: g.name,
      amount: Number(g.current_amount || 0),
      currency: g.currency || "UAH",
    }));

  // Автоокруглення (скарбничка)
  const currentMonthStart = new Date(
    now.getFullYear(),
    now.getMonth(),
    1
  ).toISOString();
  const { data: rawRoundupTxs } = await supabaseAdmin
    .from("transactions")
    .select("amount, created_at, merchant_raw, category_name, source")
    .or(
      "category_name.ilike.%подушка%,merchant_raw.ilike.%округлення%,source.eq.roundup"
    )
    .is("deleted_at", null);

  const roundupTxs = (rawRoundupTxs || []).filter((t: any) => {
    const m = (t.merchant_raw || "").toLowerCase();
    return (
      m.includes("округлення") || m.includes("решта") || t.source === "roundup"
    );
  });

  const totalRoundupAmount =
    Math.round(
      roundupTxs.reduce(
        (sum: number, t: any) => sum + Number(t.amount || 0),
        0
      ) * 100
    ) / 100;

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

  // 4. Підписки та регулярні платежі
  const { data: recurring } = await supabaseAdmin
    .from("recurring_templates")
    .select(
      "id, title, amount, currency, day_of_month, is_active, category_name"
    )
    .eq("is_active", true);

  const usdRate = await getUsdRate();
  const schedule = buildUpcomingSchedule(
    recurring || [],
    cycleTxs,
    usdRate,
    now
  );

  const subscriptions = schedule.upcoming.map((u) => ({
    title: u.title,
    amount: Number(u.amount),
    currency: u.currency,
    day_of_month: u.day_of_month,
    status: u.status,
  }));

  return {
    cycle: {
      name: "Поточний цикл",
      startDate: startDate.toISOString().slice(0, 10),
      endDate: endDate.toISOString().slice(0, 10),
      daysTotal: pacing.cycle.daysTotal,
      daysPassed: pacing.cycle.daysPassed,
      daysRemaining: pacing.cycle.daysRemaining,
    },
    budget: {
      totalBudgetLimit,
      currentExpenseTotal: pacing.budget.currentExpenseTotal,
      discretionaryRemaining: pacing.budget.discretionaryRemaining,
      reservedObligationsTotal: pacing.budget.reservedObligationsTotal,
    },
    pacing: {
      safeWeekdaySpend: pacing.pacing.safeWeekdaySpend,
      safeWeekendSpend: pacing.pacing.safeWeekendSpend,
      flatDailySpend: pacing.pacing.flatDailySpend,
      statusLabel: pacing.pacing.statusLabel,
      advice: pacing.pacing.advice,
    },
    surplusProjection: pacing.surplusProjection,
    cushion: {
      currentAmount: Number(cushionGoal?.current_amount || 0),
      targetAmount: cushionGoal?.target_amount
        ? Number(cushionGoal.target_amount)
        : null,
      monthRoundupAmount,
      totalRoundupAmount,
    },
    otherGoals,
    subscriptions,
    categoryStats,
    topPurchases,
    recentTransactions,
    kyivNowStr,
  };
}

/**
 * Санітизує та адаптує розмітку AI у валідний Telegram HTML
 */
export function formatTelegramAiHtml(rawText: string): string {
  let text = rawText.trim();

  // Прибираємо можливі markdown-заголовки (наприклад ### Заголовок -> <b>Заголовок</b>)
  text = text.replace(/^#{1,4}\s+(.+)$/gm, "<b>$1</b>");

  // Конвертуємо подвійні зірочки **жирний** у <b>жирний</b>
  text = text.replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");

  // Конвертуємо поодинокі зірочки *курсив* у <i>курсив</i>
  text = text.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, "<i>$1</i>");

  // Конвертуємо `код` у <code>код</code>
  text = text.replace(/`([^`]+)`/g, "<code>$1</code>");

  // Прибираємо зайві порожні рядки (максимум 2 підряд)
  text = text.replace(/\n{3,}/g, "\n\n");

  return text;
}

/**
 * Генерує інтелектуальну фінансову відповідь через каскад моделей Gemini
 */
export async function generateFinancialAssistantResponse(
  userQuery: string,
  context: FinancialAssistantContext
): Promise<{ replyHtml: string; replyMarkup: TelegramReplyMarkup }> {
  const {
    cycle,
    budget,
    pacing,
    surplusProjection,
    cushion,
    otherGoals,
    subscriptions,
    categoryStats,
    topPurchases,
    recentTransactions,
    kyivNowStr,
  } = context;

  // Формуємо текстові блоки контексту
  const categoryStatsStr = Object.entries(categoryStats)
    .sort((a, b) => b[1].total - a[1].total)
    .map(
      ([cat, data]) =>
        `• ${cat}: ${data.total.toLocaleString("uk-UA")} ₴ (${data.count} оп.)`
    )
    .join("\n");

  const topPurchasesStr = topPurchases
    .map(
      (p, i) =>
        `${i + 1}. ${p.date} — ${p.merchant} (${p.category}): ${p.amount.toLocaleString("uk-UA")} ₴`
    )
    .join("\n");

  const subscriptionsStr = subscriptions
    .map(
      (s) =>
        `• ${s.title} (${s.day_of_month}-го числа): ${s.amount} ${s.currency} — статус: ${
          s.status === "paid" ? "✅ СПЛАЧЕНО" : "⏳ ОЧІКУЄТЬСЯ"
        }`
    )
    .join("\n");

  const otherGoalsStr =
    otherGoals.length > 0
      ? otherGoals
          .map(
            (g) =>
              `• ${g.name}: ${g.amount.toLocaleString("uk-UA")} ${g.currency}`
          )
          .join(", ")
      : "немає";

  const surplusSummary =
    surplusProjection.projectedSurplusAmount > 0
      ? `Очікуваний профіцит: +${surplusProjection.projectedSurplusAmount.toLocaleString("uk-UA")} ₴`
      : (surplusProjection.projectedDeficitAmount || 0) > 100
        ? `Ризик перевитрати/дефіциту: -${(surplusProjection.projectedDeficitAmount || 0).toLocaleString("uk-UA")} ₴`
        : "У межах плану";

  const systemInstruction = `
Ти — персональний фінансовий аналітик та радник у кишеньковому помічнику Telegram для особистого бюджету користувача в Україні.
Твоє завдання — лаконічно, вичерпно, точно та доброзичливо відповідати на запитання користувача щодо його фінансів, витрат, заощаджень, бюджету, підписок та покупок, спираючись СУВОРО на реальні дані з його бази даних.

Сьогоднішня дата та час (Київ): ${kyivNowStr}.

ФІНАНСОВИЙ КОНТЕКСТ КОРИСТУВАЧА:
1. Поточний бюджетний цикл: ${cycle.startDate} — ${cycle.endDate}
- Загальний ліміт: ${budget.totalBudgetLimit.toLocaleString("uk-UA")} ₴
- Фактично витрачено: ${budget.currentExpenseTotal.toLocaleString("uk-UA")} ₴
- Зарезервовано на майбутні підписки: ${budget.reservedObligationsTotal.toLocaleString("uk-UA")} ₴
- Вільний залишок: ${budget.discretionaryRemaining.toLocaleString("uk-UA")} ₴
- Днів до кінця циклу: ${cycle.daysRemaining} дн. (минуло ${cycle.daysPassed} із ${cycle.daysTotal})
- Безпечний денний ліміт: ${pacing.safeWeekdaySpend.toLocaleString("uk-UA")} ₴/будень, ${pacing.safeWeekendSpend.toLocaleString("uk-UA")} ₴/вихідний (лінійний: ~${pacing.flatDailySpend.toLocaleString("uk-UA")} ₴/день)
- Статус темпу: ${pacing.statusLabel}
- Прогноз циклу: ${surplusSummary}

2. Фінансова подушка безпеки та скарбничка автоокруглення:
- Баланс подушки безпеки: ${cushion.currentAmount.toLocaleString("uk-UA")} ₴ (Ціль: ${cushion.targetAmount ? cushion.targetAmount.toLocaleString("uk-UA") + " ₴" : "не задана"})
- Накопичено рештою від автоокруглення за цей місяць: +${cushion.monthRoundupAmount.toLocaleString("uk-UA")} ₴
- Всього накопичено чистою рештою: +${cushion.totalRoundupAmount.toLocaleString("uk-UA")} ₴
- Інші збереження/банки: ${otherGoalsStr}

3. Регулярні платежі та підписки циклу:
${subscriptionsStr || "Немає активних підписок"}

4. Агрегована статистика за категоріями (поточний цикл):
${categoryStatsStr || "Поки немає витрат у циклі"}

5. Найбільші покупки поточного циклу:
${topPurchasesStr || "Немає великих покупок"}

6. Список останніх транзакцій (для детального аналізу мерчантів, кількості покупок і конкретних дат):
${JSON.stringify(recentTransactions)}

ПРАВИЛА ВІДПОВІДІ:
1. Завжди відповідай українською мовою.
2. Будь точним у цифрах: якщо запитують про таксі, їжу чи певного мерчанта (Uklon, Bolt, Сільпо, кава), проаналізуй наданий список транзакцій, порахуй точну суму, кількість операцій та назви мерчантів.
3. Форматуй відповідь виключно за допомогою дозволених тегів Telegram HTML: <b>жирний</b>, <i>курсив</i>, <code>код</code>, емодзі, переліки •. НЕ використовуй Markdown (** або ## або [link]()).
4. Відповідь має бути компактною, структурною та зручною для читання зі смартфона (без зайвої "води", але з усіма потрібними фактами).
5. Якщо користувач запитує пораду чи можливість покупки — обов'язково зіставляй із вільним залишком (${budget.discretionaryRemaining} ₴) та безпечним денним темпом (${pacing.safeWeekdaySpend} ₴/д).
6. Ніколи не вигадуй транзакцій, яких немає у наданому списку. Якщо за цим запитом немає жодної транзакції, чесно і доброзичливо скажи про це.
7. РОЗПОРЯДОК КОРИСТУВАЧА: Користувач у будні дні працює віддалено з дому до 17:00. Всі щоденні побутові покупки робочого дня (супермаркет, вечеря, аптека, побут) природно здійснюються у вечірній час (після 17:00). Це нормальне раціональне забезпечення життя, а НЕ емоційна «сліпа зона» чи імпульсивні витрати.
`;

  const prompt = `Запитання користувача: "${userQuery}"`;
  const ai = getGeminiClient();

  const candidateModels: SupportedGeminiModel[] = [
    "gemini-3.5-flash", // Первинна: багата мова та якісні фінансові поради
    "gemini-3.5-flash-lite", // Безвідмовна страховка (500 RPD), якщо вичерпано 20 RPD
    "gemini-3.7-flash", // Резерв
  ];

  let rawAiText = "";
  for (const model of candidateModels) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: prompt,
        config: {
          systemInstruction,
          temperature: 0.3,
          maxOutputTokens: 1024,
        },
      });
      if (response.text) {
        rawAiText = response.text;
        break;
      }
    } catch (err: any) {
      console.warn(
        `[Financial Assistant] Model ${model} failed for query "${userQuery}":`,
        err?.message || err
      );
    }
  }

  const appUrl =
    process.env.APP_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "https://budget-pwa.vercel.app";

  const replyMarkup: TelegramReplyMarkup = {
    inline_keyboard: [
      [
        { text: "🎯 Мій темп", callback_data: "tg_refresh_pace" },
        { text: "📈 Графік", callback_data: "tg_send_chart" },
      ],
      [{ text: "📊 Відкрити BudgetGraph", url: appUrl }],
    ],
  };

  if (!rawAiText) {
    return {
      replyHtml: [
        `⚠️ <b>Не вдалося отримати відповідь аналітика</b>`,
        ``,
        `Сервіс тимчасово перевантажений. Спробуйте повторити запит за мить або скористайтеся швидкими кнопками меню.`,
      ].join("\n"),
      replyMarkup,
    };
  }

  const cleanHtml = formatTelegramAiHtml(rawAiText);
  return { replyHtml: cleanHtml, replyMarkup };
}
