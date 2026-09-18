import { SavingsGoal } from "@/types/finance";
import { convertToUah } from "@/lib/portfolio-analytics";

export { convertToUah };

export const CURRENCY_SYMBOLS: Record<string, string> = {
  UAH: "₴",
  USD: "$",
  EUR: "€",
  PLN: "zł",
};

export interface CurrencyTotalInfo {
  current: number;
  target: number;
  hasTarget: boolean;
}

export interface SavingsMetrics {
  totalSavedUahEquivalent: number;
  totalTargetUahEquivalent: number;
  hasAnyTarget: boolean;
  totalPercent: number;
  runwayMonths: string;
  currencyTotals: Record<string, CurrencyTotalInfo>;
  activeCurrencies: string[];
}

export interface SavingsGoalsCardProps {
  goals: SavingsGoal[];
  monthlyBurnRate?: number;
  rates?: { USD: number; EUR: number; PLN: number };
  onRefresh: () => void | Promise<void>;
}

export function calculateSavingsMetrics(
  goals: SavingsGoal[],
  monthlyBurnRate: number = 35000,
  rates: { USD: number; EUR: number; PLN: number } = {
    USD: 41.5,
    EUR: 45.3,
    PLN: 10.6,
  }
): SavingsMetrics {
  let totalSavedUahEquivalent = 0;
  let totalTargetUahEquivalent = 0;
  let hasAnyTarget = false;

  const currencyTotals: Record<string, CurrencyTotalInfo> = {};

  goals.forEach((goal) => {
    const cur = (goal.currency || "UAH").toUpperCase();
    const currentAmt = Number(goal.current_amount) || 0;
    const targetAmt = Number(goal.target_amount) || 0;
    const hasTarget = targetAmt > 0;

    if (!currencyTotals[cur]) {
      currencyTotals[cur] = { current: 0, target: 0, hasTarget: false };
    }
    currencyTotals[cur].current += currentAmt;
    if (hasTarget) {
      currencyTotals[cur].target += targetAmt;
      currencyTotals[cur].hasTarget = true;
      hasAnyTarget = true;
    }

    totalSavedUahEquivalent += convertToUah(currentAmt, cur, rates);
    if (hasTarget) {
      totalTargetUahEquivalent += convertToUah(targetAmt, cur, rates);
    }
  });

  const totalPercent =
    hasAnyTarget && totalTargetUahEquivalent > 0
      ? Math.min(
          100,
          Math.round((totalSavedUahEquivalent / totalTargetUahEquivalent) * 100)
        )
      : 0;

  const runwayMonths =
    monthlyBurnRate > 0
      ? (totalSavedUahEquivalent / monthlyBurnRate).toFixed(1)
      : "0";

  return {
    totalSavedUahEquivalent,
    totalTargetUahEquivalent,
    hasAnyTarget,
    totalPercent,
    runwayMonths,
    currencyTotals,
    activeCurrencies: Object.keys(currencyTotals).sort(),
  };
}
