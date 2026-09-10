import { Transaction, RecurringItem } from "@/types/finance";
import { cleanMerchantRaw } from "@/lib/normalize";

export interface DetectedSubscription {
  id: string; // Унікальний хеш-підпис, напр. "netflix-390-uah"
  title: string;
  amount: number;
  currency: "UAH" | "USD";
  category_name: string;
  predicted_day_of_month: number;
  confidence: "high" | "medium";
  interval_days: number;
  occurrences_count: number;
  last_billed_at: string;
}

export type ScheduleItemStatus = "paid" | "due_today" | "upcoming" | "overdue";

export interface UpcomingScheduleItem {
  id: number;
  title: string;
  amount: number;
  currency: "UAH" | "USD";
  category_name: string;
  day_of_month: number;
  status: ScheduleItemStatus;
  days_remaining: number;
  paid_at?: string;
  paid_amount?: number;
}

export interface SubscriptionRadarMetrics {
  monthly_total: number;
  annual_total: number;
  paid_this_month: number;
  remaining_this_month: number;
  detected_count: number;
}

export interface SubscriptionRadarResult {
  detected: DetectedSubscription[];
  upcoming: UpcomingScheduleItem[];
  metrics: SubscriptionRadarMetrics;
}

// База типових відомих підписок для покращення точності розпізнавання
const KNOWN_SERVICES = [
  { pattern: /netflix/i, category: "Підписки та сервіси", title: "Netflix" },
  { pattern: /spotify/i, category: "Підписки та сервіси", title: "Spotify" },
  {
    pattern: /youtube/i,
    category: "Підписки та сервіси",
    title: "YouTube Premium",
  },
  {
    pattern: /(apple\.com|itunes|icloud)/i,
    category: "Підписки та сервіси",
    title: "Apple Services",
  },
  {
    pattern: /(openai|chatgpt)/i,
    category: "Підписки та сервіси",
    title: "ChatGPT / OpenAI",
  },
  { pattern: /megogo/i, category: "Підписки та сервіси", title: "MEGOGO" },
  {
    pattern: /sweet\.?tv/i,
    category: "Підписки та сервіси",
    title: "Sweet.tv",
  },
  {
    pattern: /kyivstar|київстар/i,
    category: "Комунальні та зв'язок",
    title: "Київстар",
  },
  {
    pattern: /vodafone/i,
    category: "Комунальні та зв'язок",
    title: "Vodafone",
  },
  {
    pattern: /lifecell/i,
    category: "Комунальні та зв'язок",
    title: "Lifecell",
  },
  {
    pattern: /playstation|ps\s*store|sony/i,
    category: "Підписки та сервіси",
    title: "PlayStation",
  },
  {
    pattern: /xbox|microsoft/i,
    category: "Підписки та сервіси",
    title: "Microsoft",
  },
  { pattern: /github/i, category: "Підписки та сервіси", title: "GitHub" },
  { pattern: /notion/i, category: "Підписки та сервіси", title: "Notion" },
  { pattern: /duolingo/i, category: "Освіта", title: "Duolingo" },
  { pattern: /strava/i, category: "Спорт", title: "Strava" },
  { pattern: /adobe/i, category: "Підписки та сервіси", title: "Adobe" },
  { pattern: /patreon/i, category: "Підписки та сервіси", title: "Patreon" },
  {
    pattern: /google\s*(one|storage)/i,
    category: "Підписки та сервіси",
    title: "Google One",
  },
];

/**
 * Виявляє повторювані підписки в історії транзакцій користувача.
 */
export function detectSubscriptions(
  transactions: Transaction[],
  existingTemplates: RecurringItem[] = [],
  dismissedSignatures: string[] = []
): DetectedSubscription[] {
  const dismissedSet = new Set(
    dismissedSignatures.map((s) => s.toLowerCase().trim())
  );

  // Створюємо нормалізований список назв уже зареєстрованих підписок
  const trackedNormalized = new Set(
    existingTemplates.map((tmpl) =>
      cleanMerchantRaw(tmpl.title).toLowerCase().trim()
    )
  );

  // Фільтруємо лише витрати
  const expenses = transactions.filter(
    (t) =>
      t.type === "expense" &&
      !t.exclude_from_budget &&
      t.amount > 0 &&
      t.merchant_raw
  );

  // Групуємо транзакції за нормалізованою назвою мерчанта
  const groups = new Map<string, Transaction[]>();

  for (const tx of expenses) {
    const cleaned = cleanMerchantRaw(tx.merchant_raw).toLowerCase().trim();
    if (!cleaned) continue;

    if (!groups.has(cleaned)) {
      groups.set(cleaned, []);
    }
    groups.get(cleaned)!.push(tx);
  }

  const detected: DetectedSubscription[] = [];

  for (const [cleanName, group] of groups.entries()) {
    // Якщо мерчант уже відстежується в шаблонах — пропускаємо
    const isAlreadyTracked = Array.from(trackedNormalized).some(
      (tracked) =>
        tracked.includes(cleanName) ||
        cleanName.includes(tracked) ||
        existingTemplates.some((t) => t.title.toLowerCase().includes(cleanName))
    );

    if (isAlreadyTracked) continue;

    // Сортуємо транзакції за хронологією
    const sorted = [...group].sort(
      (a, b) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );

    const knownService = KNOWN_SERVICES.find(
      (s) => s.pattern.test(cleanName) || s.pattern.test(sorted[0].merchant_raw)
    );

    // Розраховуємо середню суму та перевіряємо однаковість
    const amounts = sorted.map((t) => Number(t.amount));
    const avgAmount = Math.round(
      amounts.reduce((sum, a) => sum + a, 0) / amounts.length
    );

    // Перевіряємо варіацію сум: якщо це підписка, суми зазвичай однакові або коливаються в межах курсу (<10%)
    const maxDiffRatio =
      Math.max(...amounts) > 0
        ? (Math.max(...amounts) - Math.min(...amounts)) / Math.max(...amounts)
        : 0;

    const isStableAmount = maxDiffRatio <= 0.12;

    // Аналіз часових інтервалів між списаннями
    let hasRegularCadence = false;
    let avgIntervalDays = 30;

    if (sorted.length >= 2) {
      const intervals: number[] = [];
      for (let i = 1; i < sorted.length; i++) {
        const d1 = new Date(sorted[i - 1].created_at).getTime();
        const d2 = new Date(sorted[i].created_at).getTime();
        const days = Math.round((d2 - d1) / (1000 * 60 * 60 * 24));
        intervals.push(days);
      }

      // Перевіряємо, чи інтервали відповідають щомісячному циклу (25-35 днів)
      const monthlyIntervals = intervals.filter((d) => d >= 25 && d <= 35);
      if (monthlyIntervals.length >= 1) {
        hasRegularCadence = true;
        avgIntervalDays = Math.round(
          monthlyIntervals.reduce((sum, d) => sum + d, 0) /
            monthlyIntervals.length
        );
      }
    }

    // Критерії визначення:
    // 1. Стабільна сума + регулярний інтервал (25-35 дн.)
    // 2. АБО відомий стрімінг/сервіс із бази + хоча б 1 транзакція
    const isDetected =
      (hasRegularCadence && isStableAmount) ||
      (knownService && sorted.length >= 1);

    if (!isDetected) continue;

    const lastTx = sorted[sorted.length - 1];
    const predictedDay = new Date(lastTx.created_at).getDate();
    const title = knownService ? knownService.title : sorted[0].merchant_raw;
    const category = knownService
      ? knownService.category
      : lastTx.category_name || "Підписки та сервіси";
    const currency = (lastTx.currency === "USD" ? "USD" : "UAH") as
      "UAH" | "USD";

    const signature = `radar-${cleanName.toLowerCase()}-${avgAmount}-${currency.toLowerCase()}`;
    const normalizedClean = cleanName.toLowerCase().trim();
    const normalizedTitle = (title || "").toLowerCase().trim();
    const cleanSignature = `radar-${normalizedClean}`;

    const isDismissed =
      dismissedSet.has(signature.toLowerCase()) ||
      dismissedSet.has(normalizedClean) ||
      dismissedSet.has(cleanSignature) ||
      dismissedSet.has(normalizedTitle) ||
      Array.from(dismissedSet).some((d) => {
        const dl = d.toLowerCase().trim();
        return (
          dl === normalizedClean ||
          dl === cleanSignature ||
          dl === normalizedTitle ||
          (dl.startsWith("radar-") &&
            normalizedClean.length >= 3 &&
            dl.includes(normalizedClean)) ||
          (normalizedTitle.length >= 3 && dl.includes(normalizedTitle))
        );
      });

    if (isDismissed) continue;

    const confidence: "high" | "medium" =
      sorted.length >= 3 && hasRegularCadence && isStableAmount
        ? "high"
        : "medium";

    detected.push({
      id: signature,
      title,
      amount: avgAmount,
      currency,
      category_name: category,
      predicted_day_of_month: Math.min(31, Math.max(1, predictedDay)),
      confidence,
      interval_days: avgIntervalDays,
      occurrences_count: sorted.length,
      last_billed_at: lastTx.created_at,
    });
  }

  return detected.sort((a, b) => b.occurrences_count - a.occurrences_count);
}

/**
 * Будує графік майбутніх списань на поточний місяць та розраховує фінансові метрики.
 */
export function buildUpcomingSchedule(
  templates: RecurringItem[],
  currentMonthTransactions: Transaction[],
  usdRate: number = 41.5,
  referenceDate: Date = new Date()
): { upcoming: UpcomingScheduleItem[]; metrics: SubscriptionRadarMetrics } {
  const activeTemplates = templates.filter((t) => t.is_active);
  const currentDay = referenceDate.getDate();

  // Витрати поточного місяця
  const monthExpenses = currentMonthTransactions.filter(
    (t) => t.type === "expense" && !t.exclude_from_budget
  );

  const upcoming: UpcomingScheduleItem[] = [];

  let monthlyTotal = 0;
  let paidThisMonth = 0;
  let remainingThisMonth = 0;

  for (const tmpl of activeTemplates) {
    const isUsd = tmpl.currency === "USD";
    const expectedUah = isUsd
      ? Math.round(Number(tmpl.amount) * usdRate)
      : Number(tmpl.amount);

    monthlyTotal += expectedUah;

    // Шукаємо, чи була вже транзакція для цього шаблону в поточному періоді
    const matchedTx = monthExpenses.find((tx) => {
      // 0. Прямий збіг за ID шаблону в метаданих транзакції
      const metaRecId = (tx as any).metadata?.recurring_id;
      if (metaRecId != null && Number(metaRecId) === tmpl.id) {
        return true;
      }

      // 1. Якщо джерело 'recurring' і збігається назва
      if (
        tx.source === "recurring" &&
        (tx.merchant_raw.toLowerCase().includes(tmpl.title.toLowerCase()) ||
          tmpl.title.toLowerCase().includes(tx.merchant_raw.toLowerCase()))
      ) {
        return true;
      }

      // 2. Якщо це звичайна транзакція з подібним мерчантом і сумою (±15%)
      const cleanTx = cleanMerchantRaw(tx.merchant_raw).toLowerCase();
      const cleanTmpl = cleanMerchantRaw(tmpl.title).toLowerCase();

      const nameMatch =
        cleanTx.includes(cleanTmpl) ||
        cleanTmpl.includes(cleanTx) ||
        tx.merchant_raw.toLowerCase().includes(tmpl.title.toLowerCase()) ||
        tmpl.title.toLowerCase().includes(tx.merchant_raw.toLowerCase());

      const amountMatch =
        Math.abs(Number(tx.amount) - expectedUah) / Math.max(1, expectedUah) <=
        0.15;

      return nameMatch && amountMatch;
    });

    let status: ScheduleItemStatus;
    let daysRemaining = tmpl.day_of_month - currentDay;

    if (matchedTx) {
      status = "paid";
      daysRemaining = 0;
      paidThisMonth += Number(matchedTx.amount);
    } else {
      if (tmpl.day_of_month === currentDay) {
        status = "due_today";
        daysRemaining = 0;
      } else if (tmpl.day_of_month > currentDay) {
        status = "upcoming";
      } else {
        status = "overdue";
      }
      remainingThisMonth += expectedUah;
    }

    upcoming.push({
      id: tmpl.id,
      title: tmpl.title,
      amount: Number(tmpl.amount),
      currency: tmpl.currency || "UAH",
      category_name: tmpl.category_name,
      day_of_month: tmpl.day_of_month,
      status,
      days_remaining: daysRemaining,
      paid_at: matchedTx?.created_at,
      paid_amount: matchedTx ? Number(matchedTx.amount) : undefined,
    });
  }

  // Сортуємо: спочатку актуальні та майбутні (сьогодні, найближчі дні), потім прострочені, в кінці вже сплачені
  const statusOrder: Record<ScheduleItemStatus, number> = {
    due_today: 0,
    upcoming: 1,
    overdue: 2,
    paid: 3,
  };

  upcoming.sort((a, b) => {
    if (statusOrder[a.status] !== statusOrder[b.status]) {
      return statusOrder[a.status] - statusOrder[b.status];
    }
    return a.day_of_month - b.day_of_month;
  });

  const annualTotal = monthlyTotal * 12;

  return {
    upcoming,
    metrics: {
      monthly_total: monthlyTotal,
      annual_total: annualTotal,
      paid_this_month: paidThisMonth,
      remaining_this_month: remainingThisMonth,
      detected_count: 0, // буде додано в контролері
    },
  };
}
