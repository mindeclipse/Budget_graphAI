export interface CpiTransaction {
  id?: number;
  amount: number;
  category_name: string;
  created_at: string;
  type?: string;
}

export interface CpiCategoryStats {
  categoryKey: string;
  categoryName: string;
  icon: string;
  currentAvgCheck: number;
  previousAvgCheck: number;
  currentTxCount: number;
  previousTxCount: number;
  inflationRate: number | null; // percentage change (e.g. 5.2 for +5.2%)
}

export interface PersonalCpiReport {
  overallInflationRate: number | null;
  periodMode: "yoy" | "baseline" | "mom";
  periodLabel: string;
  previousPeriodLabel: string;
  basketStats: CpiCategoryStats[];
  totalCurrentBasketSpend: number;
  totalPreviousBasketSpend: number;
  totalCurrentTransactions: number;
  totalPreviousTransactions: number;
}

export interface CpiCategoryConfig {
  key: string;
  label: string;
  icon: string;
  matches: (categoryName: string) => boolean;
}

export const DEFAULT_STAPLE_CATEGORIES: CpiCategoryConfig[] = [
  {
    key: "groceries",
    label: "Супермаркети",
    icon: "shopping-cart",
    matches: (name: string) => {
      const lower = (name || "").toLowerCase().trim();
      return (
        lower === "продукти" ||
        lower === "супермаркети" ||
        lower.includes("продукт")
      );
    },
  },
  {
    key: "smoking",
    label: "Куріння",
    icon: "cigarette",
    matches: (name: string) => {
      const lower = (name || "").toLowerCase().trim();
      return (
        lower === "куріння" ||
        lower.includes("тютюн") ||
        lower.includes("сигарет") ||
        lower.includes("курін")
      );
    },
  },
  {
    key: "health",
    label: "Аптеки та здоров'я",
    icon: "pill",
    matches: (name: string) => {
      const lower = (name || "").toLowerCase().trim();
      return (
        lower.includes("здоров") ||
        lower.includes("аптек") ||
        lower.includes("ліки")
      );
    },
  },
];

export interface CalculateCpiOptions {
  minAmount?: number; // Minimum transaction threshold to filter out micro-transactions (default: 20 UAH)
  periodMode?: "yoy" | "baseline" | "mom";
  currentPeriodLabel?: string;
  previousPeriodLabel?: string;
  categories?: CpiCategoryConfig[];
}

/**
 * Розраховує Персональний індекс інфляції (Personal CPI) на основі реального середнього чека
 * у базових категоріях повсякденного попиту (продукти, куріння, аптеки).
 */
export function calculatePersonalCpi(
  currentTransactions: CpiTransaction[],
  previousTransactions: CpiTransaction[],
  options: CalculateCpiOptions = {}
): PersonalCpiReport {
  const minAmount = options.minAmount ?? 20;
  const periodMode = options.periodMode ?? "baseline";
  const periodLabel = options.currentPeriodLabel ?? "Поточний період";
  const previousPeriodLabel = options.previousPeriodLabel ?? "Базовий період";
  const categories = options.categories ?? DEFAULT_STAPLE_CATEGORIES;

  // Фільтруємо лише витратні транзакції з валідною сумою понад minAmount
  const filterTxs = (txs: CpiTransaction[]) =>
    txs.filter((tx) => {
      if (tx.type && tx.type !== "expense") return false;
      const amt = Number(tx.amount) || 0;
      return amt >= minAmount;
    });

  const validCurrent = filterTxs(currentTransactions);
  const validPrev = filterTxs(previousTransactions);

  let totalCurrBasketSum = 0;
  let totalCurrBasketCount = 0;
  let totalPrevBasketSum = 0;
  let totalPrevBasketCount = 0;

  const basketStats: CpiCategoryStats[] = categories.map((catConfig) => {
    // Поточні транзакції для даної категорії
    const currCatTxs = validCurrent.filter((tx) =>
      catConfig.matches(tx.category_name)
    );
    const currSum = currCatTxs.reduce(
      (sum, tx) => sum + (Number(tx.amount) || 0),
      0
    );
    const currCount = currCatTxs.length;
    const currAvg = currCount > 0 ? currSum / currCount : 0;

    // Попередні транзакції для даної категорії
    const prevCatTxs = validPrev.filter((tx) =>
      catConfig.matches(tx.category_name)
    );
    const prevSum = prevCatTxs.reduce(
      (sum, tx) => sum + (Number(tx.amount) || 0),
      0
    );
    const prevCount = prevCatTxs.length;
    const prevAvg = prevCount > 0 ? prevSum / prevCount : 0;

    // Агрегуємо в загальний кошик
    totalCurrBasketSum += currSum;
    totalCurrBasketCount += currCount;
    totalPrevBasketSum += prevSum;
    totalPrevBasketCount += prevCount;

    // Відсоткова зміна середнього чека
    let inflationRate: number | null = null;
    if (prevAvg > 0 && currAvg > 0) {
      inflationRate = Number(
        (((currAvg - prevAvg) / prevAvg) * 100).toFixed(1)
      );
    }

    return {
      categoryKey: catConfig.key,
      categoryName: catConfig.label,
      icon: catConfig.icon,
      currentAvgCheck: Math.round(currAvg),
      previousAvgCheck: Math.round(prevAvg),
      currentTxCount: currCount,
      previousTxCount: prevCount,
      inflationRate,
    };
  });

  // Загальний зважений індекс інфляції кошика (Basket Average Order Value change)
  let overallInflationRate: number | null = null;
  const overallCurrAvg =
    totalCurrBasketCount > 0 ? totalCurrBasketSum / totalCurrBasketCount : 0;
  const overallPrevAvg =
    totalPrevBasketCount > 0 ? totalPrevBasketSum / totalPrevBasketCount : 0;

  if (overallPrevAvg > 0 && overallCurrAvg > 0) {
    overallInflationRate = Number(
      (((overallCurrAvg - overallPrevAvg) / overallPrevAvg) * 100).toFixed(1)
    );
  }

  return {
    overallInflationRate,
    periodMode,
    periodLabel,
    previousPeriodLabel,
    basketStats,
    totalCurrentBasketSpend: Math.round(totalCurrBasketSum),
    totalPreviousBasketSpend: Math.round(totalPrevBasketSum),
    totalCurrentTransactions: totalCurrBasketCount,
    totalPreviousTransactions: totalPrevBasketCount,
  };
}
