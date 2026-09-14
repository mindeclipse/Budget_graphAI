import { BehavioralMetrics } from "@/types/ai";

/**
 * Повертає дату у форматі YYYY-MM-DD за київським часом (Europe/Kyiv)
 */
export function getKyivDateString(date: Date | string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Kyiv",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(date));
}

/**
 * Форматує число як суму в гривнях (округлення до цілого, український розділювач тисяч)
 */
export function formatAmount(num: number): string {
  return Math.round(num).toLocaleString("uk-UA");
}

/**
 * Повертає годину (0-23) за київським часом (Europe/Kyiv)
 */
export function getKyivHour(date: Date | string): number {
  const d = typeof date === "string" ? new Date(date) : date;
  const hourStr = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Kyiv",
    hour: "2-digit",
    hourCycle: "h23",
  }).format(d);
  return parseInt(hourStr, 10);
}

/**
 * Повертає день тижня (0 = неділя, 1 = понеділок, ..., 6 = субота) за київським часом
 */
export function getKyivDayOfWeek(date: Date | string): number {
  const d = typeof date === "string" ? new Date(date) : date;
  const kyivDate = getKyivDateString(d);
  const [year, month, day] = kyivDate.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0)).getUTCDay();
}

/**
 * Розраховує часові, вікенд- та мікро-метрики витрат для поведінкового AI-коуча
 */
export function calculateBehavioralMetrics(
  expenseTx: Array<{ amount: number | string; created_at: string }>,
  wishlist: {
    savedAmount: number;
    savedCount: number;
    coolingAmount: number;
    coolingCount: number;
  } = { savedAmount: 0, savedCount: 0, coolingAmount: 0, coolingCount: 0 }
): BehavioralMetrics {
  const totalExpense = expenseTx.reduce(
    (sum, t) => sum + Number(t.amount || 0),
    0
  );

  let morningAmount = 0;
  let morningCount = 0;
  let dayAmount = 0;
  let dayCount = 0;
  let eveningAmount = 0;
  let eveningCount = 0;

  let weekdayAmount = 0;
  let weekdayCount = 0;
  let weekendAmount = 0;
  let weekendCount = 0;

  let microAmount = 0;
  let microCount = 0;

  for (const tx of expenseTx) {
    const amt = Number(tx.amount || 0);
    const hour = getKyivHour(tx.created_at);
    const dayOfWeek = getKyivDayOfWeek(tx.created_at);

    // Час доби за Києвом: Ранок (06-12), День (12-18), Вечір/Ніч (18-06)
    if (hour >= 6 && hour < 12) {
      morningAmount += amt;
      morningCount++;
    } else if (hour >= 12 && hour < 18) {
      dayAmount += amt;
      dayCount++;
    } else {
      eveningAmount += amt;
      eveningCount++;
    }

    // Вікенд (Субота = 6, Неділя = 0) vs Будні
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      weekendAmount += amt;
      weekendCount++;
    } else {
      weekdayAmount += amt;
      weekdayCount++;
    }

    // «Латте-фактор» (дрібні споживчі чеки <= 200 ₴)
    if (amt <= 200 && amt > 0) {
      microAmount += amt;
      microCount++;
    }
  }

  const calcPercent = (val: number) =>
    totalExpense > 0 ? Math.round((val / totalExpense) * 100) : 0;

  return {
    totalExpense,
    timeProfile: {
      morning: {
        count: morningCount,
        amount: morningAmount,
        percent: calcPercent(morningAmount),
      },
      day: {
        count: dayCount,
        amount: dayAmount,
        percent: calcPercent(dayAmount),
      },
      evening: {
        count: eveningCount,
        amount: eveningAmount,
        percent: calcPercent(eveningAmount),
      },
    },
    dayProfile: {
      weekday: {
        count: weekdayCount,
        amount: weekdayAmount,
        percent: calcPercent(weekdayAmount),
      },
      weekend: {
        count: weekendCount,
        amount: weekendAmount,
        percent: calcPercent(weekendAmount),
      },
    },
    microTransactions: {
      count: microCount,
      amount: microAmount,
      percent: calcPercent(microAmount),
    },
    wishlist,
  };
}
