import { getSupabaseAdmin } from "@/lib/supabase-admin";
import {
  sendTelegramMessage,
  escapeHtml,
  TelegramReplyMarkup,
} from "@/lib/telegram";
import { sendBackupToTelegram } from "@/lib/backup-service";
import {
  getGeminiClient,
  GEMINI_MODELS,
  GEMINI_FALLBACK_CHAIN,
} from "@/lib/gemini";
import { getUsdRate } from "@/lib/currency";
import {
  getCycleDateRange,
  calculateCycleDaysRemaining,
  DEFAULT_BUDGET_LIMIT,
} from "@/lib/cycle-utils";
import { Type } from "@google/genai";
import {
  SupportedGeminiModel,
  BehavioralCoachAdvice,
  BehavioralMetrics,
} from "@/types/ai";

function getAppUrl(): string {
  return (
    process.env.APP_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "https://budget-pwa.vercel.app"
  );
}

import {
  getKyivDateString,
  formatAmount,
  getKyivHour,
  getKyivDayOfWeek,
  calculateBehavioralMetrics,
} from "./behavioral-metrics";

export {
  getKyivDateString,
  formatAmount,
  getKyivHour,
  getKyivDayOfWeek,
  calculateBehavioralMetrics,
};

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
      "id, amount, created_at, type, merchant_raw, category_name, exclude_from_budget, metadata"
    )
    .is("deleted_at", null)
    .gte("created_at", prevWeekStart.toISOString())
    .order("created_at", { ascending: false });

  if (txError) {
    console.error("[WeeklyDigest] Error fetching transactions:", txError);
    return { success: false, sent: false, reason: txError.message };
  }

  const expenseTransactions = (rawTransactions || []).filter(
    (t) => t.type === "expense" && !t.exclude_from_budget
  );

  const currentWeekTx = expenseTransactions.filter(
    (t) => new Date(t.created_at) >= currentWeekStart
  );
  const prevWeekTx = expenseTransactions.filter(
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

  // 3b. Інвестиції та заощадження за 7 днів (відокремлені від споживчих витрат)
  const currentWeekInvestments = (rawTransactions || []).filter(
    (t) =>
      t.type === "investment" &&
      !t.exclude_from_budget &&
      new Date(t.created_at) >= currentWeekStart
  );

  // Сума придбання інвестиційних активів (ОВДП, REIT тощо), без технічних записів податків чи дивідендів
  const totalInvestedThisWeek = currentWeekInvestments
    .filter(
      (t) =>
        !t.merchant_raw?.toLowerCase().includes("дивіденд") &&
        !t.merchant_raw?.toLowerCase().includes("подат")
    )
    .reduce((sum, t) => sum + Number(t.amount || 0), 0);

  // Заощадження (перекази у фінансову подушку/скарбничку, за винятком переказів брокеру)
  const currentWeekSavings = (rawTransactions || []).filter(
    (t) =>
      t.type === "transfer" &&
      !t.exclude_from_budget &&
      new Date(t.created_at) >= currentWeekStart &&
      !t.merchant_raw?.toLowerCase().includes("інжур") &&
      !t.merchant_raw?.toLowerCase().includes("inzhur")
  );

  const totalSavedThisWeek = currentWeekSavings.reduce(
    (sum, t) => sum + Number(t.amount || 0),
    0
  );

  // 3c. Лист охолодження (Wishlist) за останні 7 днів
  const { data: wishlistData } = await supabase
    .from("wishlist_items")
    .select(
      "id, name, estimated_price, status, cooling_end_date, resolved_at, created_at"
    );

  const recentWishlist = wishlistData || [];
  // Успішно скасовані імпульсивні бажання за 7 днів (saved)
  const savedWishlistItems = recentWishlist.filter(
    (item) =>
      item.status === "saved" &&
      item.resolved_at &&
      new Date(item.resolved_at) >= currentWeekStart
  );
  const savedWishlistAmount = savedWishlistItems.reduce(
    (sum, item) => sum + Number(item.estimated_price || 0),
    0
  );

  // Товари, які зараз перебувають у стані охолодження (cooling)
  const coolingWishlistItems = recentWishlist.filter(
    (item) =>
      item.status === "cooling" &&
      item.cooling_end_date &&
      new Date(item.cooling_end_date) > now
  );
  const coolingWishlistAmount = coolingWishlistItems.reduce(
    (sum, item) => sum + Number(item.estimated_price || 0),
    0
  );

  const behavioralMetrics = calculateBehavioralMetrics(currentWeekTx, {
    savedAmount: savedWishlistAmount,
    savedCount: savedWishlistItems.length,
    coolingAmount: coolingWishlistAmount,
    coolingCount: coolingWishlistItems.length,
  });

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
    .select("id, name, start_date, end_date, budget_limit, is_active")
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let daysRemaining = 0;
  let remainingBudget = 0;
  let safeDailySpend = 0;

  if (activeCycle) {
    const cycleRange = getCycleDateRange(activeCycle, now);
    daysRemaining = calculateCycleDaysRemaining(activeCycle, now, now);

    const { data: cycleTx } = await supabase
      .from("transactions")
      .select("amount, type, exclude_from_budget")
      .is("deleted_at", null)
      .gte("created_at", cycleRange.startDate.toISOString());

    const totalCycleSpent = (cycleTx || [])
      .filter((t) => t.type === "expense" && !t.exclude_from_budget)
      .reduce((s, t) => s + Number(t.amount || 0), 0);

    const { data: recurringItems } = await supabase
      .from("recurring_templates")
      .select("amount, currency")
      .eq("is_active", true);

    const usdRate = await getUsdRate();
    const recurringTotal = (recurringItems || []).reduce((sum, r) => {
      const amt = Number(r.amount) || 0;
      return sum + (r.currency === "USD" ? amt * usdRate : amt);
    }, 0);

    const limit = Number(activeCycle.budget_limit) || DEFAULT_BUDGET_LIMIT;
    const variableBudget = Math.max(0, limit - recurringTotal);
    remainingBudget = variableBudget - totalCycleSpent;
    safeDailySpend = Math.max(0, Math.round(remainingBudget / daysRemaining));
  }

  // 7. Поведінковий AI-коуч від Gemini (Structured Outputs & High-Availability Failover)
  let coachAdvice: BehavioralCoachAdvice | null = null;
  const candidateModels: SupportedGeminiModel[] = [
    GEMINI_MODELS.BALANCED || "gemini-3.5-flash",
    ...GEMINI_FALLBACK_CHAIN.filter(
      (m) => m !== (GEMINI_MODELS.BALANCED || "gemini-3.5-flash")
    ),
  ];

  const behavioralResponseSchema = {
    type: Type.OBJECT,
    properties: {
      behavioralInsight: {
        type: Type.STRING,
        description:
          "Психологічне спостереження або сліпа зона витрат: зв'язок між часом (вечір), днем тижня (вихідні) чи дрібними чеками (латте-фактор) та емоційним станом (1-2 лаконічні ділові речення українською).",
      },
      capitalFeedback: {
        type: Type.STRING,
        description:
          "Оцінка формування капіталу / сили волі: інвестиції, заощадження або вбережені кошти у вішлісті (1 лаконічне речення українською).",
      },
      microChallenge: {
        type: Type.STRING,
        description:
          "Конкретний вимірний мікро-челендж на 7 днів із реальною прогнозованою сумою заощадження у гривнях (1-2 речення українською).",
      },
    },
    required: ["behavioralInsight", "capitalFeedback", "microChallenge"],
  };

  try {
    const ai = getGeminiClient();
    const amortizedTxs = currentWeekTx.filter((t) => {
      const a = t.metadata?.amortization;
      return a && typeof a === "object" && Number(a.months) > 1;
    });

    const systemInstruction = `Ти — персональний фінансовий AI-коуч із поведінкових фінансів (Behavioral Finance Coach & Nudge Economics).
Твоє завдання — виявляти психологічні патерни («сліпі зони», вечірні імпульсивні витрати, вікенд-розрядку, розмивання грошей на дрібні суми до 200 ₴) та давати чіткий 7-денний челендж із конкретною вигодою у гривнях.
Враховуй, що інвестиції та перекази у фінансову подушку — це позитивне формування капіталу, а НЕ споживчі витрати.
Враховуй збережені гроші у «Листі охолодження» (Wishlist) як перемогу сили волі.
Враховуй, що покупки з поміткою амортизації на кілька місяців (наприклад, курс вітамінів/лікування на 3+ місяці, річна страховка) — це планова розумна інвестиція, а НЕ марнотратство чи імпульсивне перевантаження бюджету.

ОБОВ'ЯЗКОВО поверни суворий JSON-об'єкт із трьома полями:
- behavioralInsight: Виявлена «сліпа зона» або патерн витрат (1-2 речення українською).
- capitalFeedback: Оцінка формування капіталу, інвестицій або сили волі щодо імпульсивних покупок (1 речення українською).
- microChallenge: Чітка вимірна дія на 7 днів із точною прогнозованою сумою заощадження у ₴ (1-2 речення українською). Без банальностей, максимально конкретно.`;

    const prompt = `
Проаналізуй фінансову поведінку користувача за останні 7 днів:
• Споживчі витрати за 7 днів: ${formatAmount(thisWeekSpent)} ₴ (Динаміка: ${wowText})
• Топ категорії витрат: ${sortedCategories.map((c) => `${c.name}: ${formatAmount(c.amount)} ₴ (${c.percent}%)`).join(", ")}
${largestTx ? `• Найбільша окрема витрата: ${largestTx.merchant_raw} (${formatAmount(Number(largestTx.amount))} ₴)` : ""}
${
  amortizedTxs.length > 0
    ? `• Стратегічні покупки з амортизацією на кілька місяців (планова інвестиція, НЕ марнотратство):
${amortizedTxs
  .map((t) => {
    const m = t.metadata?.amortization;
    const months = m?.months || 1;
    const monthly =
      m?.monthly_amount || Math.round(Number(t.amount || 0) / months);
    return `  - ${t.merchant_raw}: сплачено ${formatAmount(Number(t.amount))} ₴, розраховано на ${months} міс (по ~${formatAmount(monthly)} ₴/міс)`;
  })
  .join("\n")}`
    : ""
}
• Часовий профіль витрат (Київ):
  - Ранок (06:00–12:00): ${formatAmount(behavioralMetrics.timeProfile.morning.amount)} ₴ (${behavioralMetrics.timeProfile.morning.percent}%, ${behavioralMetrics.timeProfile.morning.count} транз.)
  - День (12:00–18:00): ${formatAmount(behavioralMetrics.timeProfile.day.amount)} ₴ (${behavioralMetrics.timeProfile.day.percent}%, ${behavioralMetrics.timeProfile.day.count} транз.)
  - Вечір/Ніч (18:00–06:00): ${formatAmount(behavioralMetrics.timeProfile.evening.amount)} ₴ (${behavioralMetrics.timeProfile.evening.percent}%, ${behavioralMetrics.timeProfile.evening.count} транз.)
• Вікенд-сплеск vs Будні:
  - Робочі дні (Пн–Пт): ${formatAmount(behavioralMetrics.dayProfile.weekday.amount)} ₴ (${behavioralMetrics.dayProfile.weekday.percent}%)
  - Вихідні (Сб–Нд): ${formatAmount(behavioralMetrics.dayProfile.weekend.amount)} ₴ (${behavioralMetrics.dayProfile.weekend.percent}%)
• «Латте-фактор» (покупки до 200 ₴): ${behavioralMetrics.microTransactions.count} покупок на суму ${formatAmount(behavioralMetrics.microTransactions.amount)} ₴ (${behavioralMetrics.microTransactions.percent}% від усіх витрат)
• Лист охолодження (Wishlist):
  - Успішно скасовано покупок (заощаджено): ${behavioralMetrics.wishlist.savedCount} шт. на суму +${formatAmount(behavioralMetrics.wishlist.savedAmount)} ₴
  - Зараз на паузі охолодження: ${behavioralMetrics.wishlist.coolingCount} шт. на суму ${formatAmount(behavioralMetrics.wishlist.coolingAmount)} ₴
• Капітал за 7 днів:
  - Інвестовано: ${formatAmount(totalInvestedThisWeek)} ₴
  - Заощаджено у подушку: +${formatAmount(totalSavedThisWeek)} ₴
${activeCycle ? `• Стан активного циклу: залишилось ${daysRemaining} дн., вільний операційний залишок ${formatAmount(remainingBudget)} ₴, безпечний щоденний темп ${formatAmount(safeDailySpend)} ₴/день.` : ""}

Сформуй JSON за наданою схемою.
`;

    for (const modelToUse of candidateModels) {
      try {
        const result = await ai.models.generateContent({
          model: modelToUse,
          contents: prompt,
          config: {
            systemInstruction,
            temperature: 0.3,
            responseMimeType: "application/json",
            responseSchema: behavioralResponseSchema,
          },
        });

        if (result.text) {
          const parsed = JSON.parse(result.text.trim());
          if (
            typeof parsed.behavioralInsight === "string" &&
            typeof parsed.capitalFeedback === "string" &&
            typeof parsed.microChallenge === "string"
          ) {
            coachAdvice = {
              behavioralInsight: parsed.behavioralInsight.trim(),
              capitalFeedback: parsed.capitalFeedback.trim(),
              microChallenge: parsed.microChallenge.trim(),
              usedModel: modelToUse,
            };
            break;
          }
        }
      } catch (modelErr) {
        console.warn(
          `[WeeklyDigest] Gemini model ${modelToUse} failed in fallback chain:`,
          modelErr
        );
      }
    }
  } catch (err) {
    console.warn("[WeeklyDigest] Gemini initialization failed:", err);
  }

  // Якщо моделі Gemini недоступні — використовуємо розумний детермінований алгоритм fallback
  if (!coachAdvice) {
    const topCatName = sortedCategories[0]?.name || "головні витрати";
    const isEveningHeavy = behavioralMetrics.timeProfile.evening.percent >= 40;
    const isMicroHeavy = behavioralMetrics.microTransactions.count >= 4;

    const insight = isEveningHeavy
      ? `${behavioralMetrics.timeProfile.evening.percent}% витрат припало на вечірній час (${formatAmount(behavioralMetrics.timeProfile.evening.amount)} ₴). Зверніть увагу на вечірні замовлення для зниження темпу.`
      : isMicroHeavy
        ? `Зафіксовано ${behavioralMetrics.microTransactions.count} дрібних оплат до 200 ₴ на суму ${formatAmount(behavioralMetrics.microTransactions.amount)} ₴ — це «латте-фактор», який непомітно зменшує бюджет.`
        : `Споживчі витрати склали ${formatAmount(thisWeekSpent)} ₴. Основна стаття — «${topCatName}» (${sortedCategories[0]?.percent || 0}%).`;

    const capital =
      behavioralMetrics.wishlist.savedAmount > 0
        ? `Сила волі: вберегли +${formatAmount(behavioralMetrics.wishlist.savedAmount)} ₴ завдяки листу охолодження бажань.`
        : totalInvestedThisWeek > 0 || totalSavedThisWeek > 0
          ? `Успішно сформовано ${formatAmount(totalInvestedThisWeek + totalSavedThisWeek)} ₴ капіталу та накопичень за 7 днів.`
          : `Рекомендуємо запланувати регулярний переказ у подушку безпеки або активи.`;

    const challenge = isMicroHeavy
      ? `Об'єднайте дрібні щоденні покупки to-go у 1 запланований візит — це збереже ~${formatAmount(Math.round(behavioralMetrics.microTransactions.amount * 0.4))} ₴ за 7 днів.`
      : `Спробуйте скоротити необов'язкові витрати у категорії «${topCatName}» на 10-15% — це збільшить денний безпечний темп.`;

    coachAdvice = {
      behavioralInsight: insight,
      capitalFeedback: capital,
      microChallenge: challenge,
    };
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
    `💸 <b>Споживчі витрати за 7 днів:</b> <b>${formatAmount(thisWeekSpent)} ₴</b>`,
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

  if (totalInvestedThisWeek > 0 || totalSavedThisWeek > 0) {
    lines.push(``);
    lines.push(`🏦 <b>Капітал та заощадження за 7 днів:</b>`);
    if (totalInvestedThisWeek > 0) {
      lines.push(
        `• Інвестовано в активи: <b>${formatAmount(totalInvestedThisWeek)} ₴</b>`
      );
    }
    if (totalSavedThisWeek > 0) {
      lines.push(
        `• Заощаджено у подушку: <b>+${formatAmount(totalSavedThisWeek)} ₴</b>`
      );
    }
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

  if (coachAdvice) {
    lines.push(``);
    lines.push(`🧠 <b>Поведінковий аудит & Коучинг:</b>`);
    lines.push(
      `• 🔍 <b>Сліпа зона:</b> ${escapeHtml(coachAdvice.behavioralInsight)}`
    );
    lines.push(
      `• 🛡️ <b>Капітал & Сила волі:</b> ${escapeHtml(coachAdvice.capitalFeedback)}`
    );
    lines.push(
      `• 🎯 <b>Мікро-челендж (7 днів):</b> ${escapeHtml(coachAdvice.microChallenge)}`
    );
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

    // Автоматичний щотижневий бекап бази даних у Telegram
    try {
      const backupRes = await sendBackupToTelegram();
      if (backupRes.success) {
        console.log("[WeeklyDigest] Weekly backup file sent to Telegram.");
      } else {
        console.warn(
          "[WeeklyDigest] Failed to send weekly backup:",
          backupRes.error
        );
      }
    } catch (backupErr) {
      console.error(
        "[WeeklyDigest] Error sending weekly backup to Telegram:",
        backupErr
      );
    }
  }

  return {
    success: true,
    sent,
    data: {
      weekKey,
      thisWeekSpent,
      prevWeekSpent,
      totalInvestedThisWeek,
      totalSavedThisWeek,
      sortedCategories,
      largestTx,
      remainingBudget,
      behavioralMetrics,
      coachAdvice,
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
    .is("deleted_at", null)
    .gte("created_at", startDateIso)
    .lte("created_at", endDateIso)
    .order("created_at", { ascending: false });

  if (txError) {
    console.error("[CycleSummary] Error fetching transactions:", txError);
    return { success: false, sent: false, reason: txError.message };
  }

  const expenseTx = (cycleTx || []).filter(
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
- Фактичні споживчі витрати: ${formatAmount(totalSpent)} ₴
- Результат: ${isSaved ? `Збережено +${formatAmount(savedAmount)} ₴ (${savedPercent}%)` : `Перевитрата -${formatAmount(Math.abs(savedAmount))} ₴ (${savedPercent}%)`}
- Топ статті витрат: ${topCategories.map((c) => `${c.name}: ${formatAmount(c.amount)} ₴ (${c.percent}%)`).join(", ")}
${topPurchases.length > 0 ? `- Найбільші окремі витрати: ${topPurchases.map((p) => `${p.merchant_raw} (${formatAmount(Number(p.amount))} ₴)`).join(", ")}` : ""}
${totalCycleInvested > 0 ? `- Інвестовано в активи за цикл: ${formatAmount(totalCycleInvested)} ₴` : ""}
${totalCycleSaved > 0 ? `- Відкладено у подушку безпеки: ${formatAmount(totalCycleSaved)} ₴` : ""}

ВАЖЛИВО: Інвестиції та заощадження є формуванням капіталу і не зменшують плановий ліміт повсякденного споживчого бюджету.
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

  if (totalCycleInvested > 0 || totalCycleSaved > 0) {
    lines.push(``);
    lines.push(`🏦 <b>Капітал та заощадження за цикл:</b>`);
    if (totalCycleInvested > 0) {
      lines.push(
        `• Інвестовано в активи: <b>${formatAmount(totalCycleInvested)} ₴</b>`
      );
    }
    if (totalCycleSaved > 0) {
      lines.push(
        `• Заощаджено у подушку: <b>+${formatAmount(totalCycleSaved)} ₴</b>`
      );
    }
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
      totalCycleInvested,
      totalCycleSaved,
      savedAmount,
      isSaved,
      topCategories,
    },
  };
}
