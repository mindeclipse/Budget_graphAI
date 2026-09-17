import { getGeminiClient, GEMINI_MODELS } from "@/lib/gemini";
import { Type } from "@google/genai";
import {
  SupportedGeminiModel,
  BehavioralCoachAdvice,
  BehavioralMetrics,
} from "@/types/ai";
import { formatAmount } from "@/lib/behavioral-metrics";
import { Transaction } from "@/types/finance";
import { WeeklyCategoryBreakdown, CycleTopCategory } from "./types";

export interface GenerateBehavioralAdviceParams {
  currentWeekTx: Transaction[];
  thisWeekSpent: number;
  wowText: string;
  sortedCategories: WeeklyCategoryBreakdown[];
  largestTx?: Transaction;
  totalInvestedThisWeek: number;
  totalSavedThisWeek: number;
  behavioralMetrics: BehavioralMetrics;
  cycleInfo?: {
    daysRemaining: number;
    remainingBudget: number;
    safeWeekdaySpend: number;
    safeWeekendSpend: number;
  } | null;
}

export async function generateBehavioralCoachAdvice(
  params: GenerateBehavioralAdviceParams
): Promise<BehavioralCoachAdvice> {
  const candidateModels: SupportedGeminiModel[] = [
    GEMINI_MODELS.REASONING, // gemini-3.7-flash (глибокі міркування для тижневого звіту)
    GEMINI_MODELS.BALANCED, // gemini-3.5-flash (високоякісний резерв)
    GEMINI_MODELS.FAST, // gemini-3.5-flash-lite (страховка 500 RPD)
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
    const amortizedTxs = params.currentWeekTx.filter((t) => {
      const a = t.metadata?.amortization;
      return a && typeof a === "object" && Number(a.months) > 1;
    });

    const emergencyTxs = params.currentWeekTx.filter((t) => {
      return (
        Boolean(t.metadata?.is_emergency) ||
        (Array.isArray(t.tags) && t.tags.includes("форсмажор"))
      );
    });

    const systemInstruction = `Ти — персональний фінансовий AI-коуч із поведінкових фінансів (Behavioral Finance Coach & Nudge Economics).
Твоє завдання — аналізувати фінансову поведінку користувача за останній тиждень, виявляти психологічні патерни (вікенд-розрядку, розмивання грошей на дрібні суми до 200 ₴) та давати чіткий 7-денний челендж із конкретною вигодою у гривнях.
ВАЖЛИВИЙ КОНТЕКСТ РОЗПОРЯДКУ КОРИСТУВАЧА:
- Користувач у будні дні працює віддалено з дому до 17:00. Будь-які покупки після 17:00 (продукти, вечеря, аптека, побут) є природними та плановими потребами забезпечення життя. СУВОРО ЗАБОРОНЕНО інтерпретувати вечірній час як емоційну «сліпу зону» чи неконтрольовані витрати!
Враховуй, що інвестиції та перекази у фінансову подушку — це позитивне формування капіталу, а НЕ споживчі витрати.
Враховуй збережені гроші у «Листі охолодження» (Wishlist) як перемогу сили волі.
Враховуй, що покупки з поміткою амортизації на кілька місяців (наприклад, курс вітамінів/лікування на 3+ місяці, річна страховка) — це планова розумна інвестиція, а НЕ марнотратство чи імпульсивне перевантаження бюджету.
Враховуй витрати з поміткою форс-мажору (термінові ліки, ремонт тощо) як вимушену життєву потребу, а НЕ як споживче марнотратство чи слабкість волі.

ОБОВ'ЯЗКОВО поверни суворий JSON-об'єкт із трьома полями:
- behavioralInsight: Виявлений корисний інсайт або патерн витрат (1-2 речення українською).
- capitalFeedback: Оцінка формування капіталу, інвестицій або сили волі щодо імпульсивних покупок (1 речення українською).
- microChallenge: Чітка вимірна дія на 7 днів із точною прогнозованою сумою заощадження у ₴ (1-2 речення українською). Без банальностей, максимально конкретно.`;

    const prompt = `
Проаналізуй фінансову поведінку користувача за останні 7 днів:
• Споживчі витрати за 7 днів: ${formatAmount(params.thisWeekSpent)} ₴ (Динаміка: ${params.wowText})
• Топ категорії витрат: ${params.sortedCategories.map((c) => `${c.name}: ${formatAmount(c.amount)} ₴ (${c.percent}%)`).join(", ")}
${params.largestTx ? `• Найбільша окрема витрата: ${params.largestTx.merchant_raw} (${formatAmount(Number(params.largestTx.amount))} ₴)` : ""}
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
${
  emergencyTxs.length > 0
    ? `• Форс-мажорні та екстрені витрати (вимушена потреба, НЕ марнотратство):
${emergencyTxs
  .map((t) => `  - ${t.merchant_raw}: ${formatAmount(Number(t.amount))} ₴`)
  .join("\n")}`
    : ""
}
• Часовий профіль витрат (Київ):
  - Ранок (06:00–12:00): ${formatAmount(params.behavioralMetrics.timeProfile.morning.amount)} ₴ (${params.behavioralMetrics.timeProfile.morning.percent}%, ${params.behavioralMetrics.timeProfile.morning.count} транз.)
  - День (12:00–18:00): ${formatAmount(params.behavioralMetrics.timeProfile.day.amount)} ₴ (${params.behavioralMetrics.timeProfile.day.percent}%, ${params.behavioralMetrics.timeProfile.day.count} транз.)
  - Вечір/Ніч (18:00–06:00): ${formatAmount(params.behavioralMetrics.timeProfile.evening.amount)} ₴ (${params.behavioralMetrics.timeProfile.evening.percent}%, ${params.behavioralMetrics.timeProfile.evening.count} транз.)
• Вікенд-сплеск vs Будні:
  - Робочі дні (Пн–Пт): ${formatAmount(params.behavioralMetrics.dayProfile.weekday.amount)} ₴ (${params.behavioralMetrics.dayProfile.weekday.percent}%)
  - Вихідні (Сб–Нд): ${formatAmount(params.behavioralMetrics.dayProfile.weekend.amount)} ₴ (${params.behavioralMetrics.dayProfile.weekend.percent}%)
• «Латте-фактор» (покупки до 200 ₴): ${params.behavioralMetrics.microTransactions.count} покупок на суму ${formatAmount(params.behavioralMetrics.microTransactions.amount)} ₴ (${params.behavioralMetrics.microTransactions.percent}% від усіх витрат)
• Лист охолодження (Wishlist):
  - Успішно скасовано покупок (заощаджено): ${params.behavioralMetrics.wishlist.savedCount} шт. на суму +${formatAmount(params.behavioralMetrics.wishlist.savedAmount)} ₴
  - Зараз на паузі охолодження: ${params.behavioralMetrics.wishlist.coolingCount} шт. на суму ${formatAmount(params.behavioralMetrics.wishlist.coolingAmount)} ₴
• Капітал за 7 днів:
  - Інвестовано: ${formatAmount(params.totalInvestedThisWeek)} ₴
  - Заощаджено у подушку: +${formatAmount(params.totalSavedThisWeek)} ₴
${
  params.cycleInfo
    ? `• Стан активного циклу: залишилось ${params.cycleInfo.daysRemaining} дн., вільний операційний залишок ${formatAmount(params.cycleInfo.remainingBudget)} ₴, зважений щоденний темп: ${formatAmount(params.cycleInfo.safeWeekdaySpend)} ₴/день у будні, ${formatAmount(params.cycleInfo.safeWeekendSpend)} ₴/день у вихідні (зважування EMA α).`
    : ""
}

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
            return {
              behavioralInsight: parsed.behavioralInsight.trim(),
              capitalFeedback: parsed.capitalFeedback.trim(),
              microChallenge: parsed.microChallenge.trim(),
              usedModel: modelToUse,
            };
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

  // Детермінований алгоритм fallback, якщо моделі недоступні
  const topCatName = params.sortedCategories[0]?.name || "головні витрати";
  const isEveningHeavy =
    params.behavioralMetrics.timeProfile.evening.percent >= 40;
  const isMicroHeavy = params.behavioralMetrics.microTransactions.count >= 4;

  const insight = isEveningHeavy
    ? `${params.behavioralMetrics.timeProfile.evening.percent}% витрат припало на вечірній час (${formatAmount(params.behavioralMetrics.timeProfile.evening.amount)} ₴). Зверніть увагу на вечірні замовлення для зниження темпу.`
    : isMicroHeavy
      ? `Зафіксовано ${params.behavioralMetrics.microTransactions.count} дрібних оплат до 200 ₴ на суму ${formatAmount(params.behavioralMetrics.microTransactions.amount)} ₴ — це «латте-фактор», який непомітно зменшує бюджет.`
      : `Споживчі витрати склали ${formatAmount(params.thisWeekSpent)} ₴. Основна стаття — «${topCatName}» (${params.sortedCategories[0]?.percent || 0}%).`;

  const capital =
    params.behavioralMetrics.wishlist.savedAmount > 0
      ? `Сила волі: вберегли +${formatAmount(params.behavioralMetrics.wishlist.savedAmount)} ₴ завдяки листу охолодження бажань.`
      : params.totalInvestedThisWeek > 0 || params.totalSavedThisWeek > 0
        ? `Успішно сформовано ${formatAmount(params.totalInvestedThisWeek + params.totalSavedThisWeek)} ₴ капіталу та накопичень за 7 днів.`
        : `Рекомендуємо запланувати регулярний переказ у подушку безпеки або активи.`;

  const challenge = isMicroHeavy
    ? `Об'єднайте дрібні щоденні покупки to-go у 1 запланований візит — це збереже ~${formatAmount(Math.round(params.behavioralMetrics.microTransactions.amount * 0.4))} ₴ за 7 днів.`
    : `Спробуйте скоротити необов'язкові витрати у категорії «${topCatName}» на 10-15% — це збільшить денний безпечний темп.`;

  return {
    behavioralInsight: insight,
    capitalFeedback: capital,
    microChallenge: challenge,
  };
}

export interface GenerateCycleConclusionParams {
  cycleName: string;
  cycleDurationDays: number;
  budgetLimit: number;
  totalSpent: number;
  isSaved: boolean;
  savedAmount: number;
  savedPercent: string;
  topCategories: CycleTopCategory[];
  topPurchases: Transaction[];
  totalCycleInvested: number;
  totalCycleSaved: number;
}

export async function generateCycleSummaryConclusion(
  params: GenerateCycleConclusionParams
): Promise<string> {
  try {
    const ai = getGeminiClient();
    const prompt = `
Ти — особистий фінансовий радник. Проаналізуй підсумки завершеного зарплатного циклу:
- Назва циклу: ${params.cycleName || "Зарплатний цикл"}
- Тривалість: ${params.cycleDurationDays} днів
- Плановий ліміт: ${formatAmount(params.budgetLimit)} ₴
- Фактичні споживчі витрати: ${formatAmount(params.totalSpent)} ₴
- Результат: ${
      params.isSaved
        ? `Збережено +${formatAmount(params.savedAmount)} ₴ (${params.savedPercent}%)`
        : `Перевитрата -${formatAmount(Math.abs(params.savedAmount))} ₴ (${params.savedPercent}%)`
    }
- Топ статті витрат: ${params.topCategories.map((c) => `${c.name}: ${formatAmount(c.amount)} ₴ (${c.percent}%)`).join(", ")}
${
  params.topPurchases.length > 0
    ? `- Найбільші окремі витрати: ${params.topPurchases.map((p) => `${p.merchant_raw} (${formatAmount(Number(p.amount))} ₴)`).join(", ")}`
    : ""
}
${params.totalCycleInvested > 0 ? `- Інвестовано в активи за цикл: ${formatAmount(params.totalCycleInvested)} ₴` : ""}
${params.totalCycleSaved > 0 ? `- Відкладено у подушку безпеки: ${formatAmount(params.totalCycleSaved)} ₴` : ""}

ВАЖЛИВО: Інвестиції та заощадження є формуванням капіталу і не зменшують плановий ліміт повсякденного споживчого бюджету.
Сформулюй структурований висновок українською мовою:
1. Оцінка успішності циклу (1 коротке речення).
2. Головне спостереження щодо категорій або нетипових витрат (1 речення).
3. Порада та рекомендація щодо розміру ліміту на наступний цикл (наприклад, зберегти ${formatAmount(params.budgetLimit)} ₴ або скоригувати).
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

    return result.text?.trim() || "";
  } catch (err) {
    console.warn("[CycleSummary] Gemini generation fallback:", err);
    if (params.isSaved) {
      return `Чудовий результат! Вам вдалося втриматися в рамках бюджету та зберегти ${formatAmount(params.savedAmount)} ₴. Рекомендуємо спрямувати вільний залишок у накопичення.`;
    } else {
      return `Зафіксовано перевитрату на ${formatAmount(Math.abs(params.savedAmount))} ₴. Зверніть увагу на витрати в категорії «${params.topCategories[0]?.name || "головні витрати"}» для оптимізації наступного циклу.`;
    }
  }
}
