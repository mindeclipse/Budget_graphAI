import { InvestmentAsset, SavingsGoal } from "@/types/finance";

export interface ExchangeRates {
  USD: number;
  EUR: number;
  PLN: number;
}

export const DEFAULT_RATES: ExchangeRates = {
  USD: 41.5,
  EUR: 45.3,
  PLN: 10.6,
};

/**
 * Конвертує суму вказаної валюти у гривневий еквівалент за наданим курсом.
 */
export function convertToUah(
  amount: number,
  currency: string = "UAH",
  rates: Partial<ExchangeRates> = DEFAULT_RATES
): number {
  const num = Number(amount) || 0;
  const curr = (currency || "UAH").toUpperCase().trim();
  const usd = rates.USD || DEFAULT_RATES.USD;
  const eur = rates.EUR || DEFAULT_RATES.EUR;
  const pln = rates.PLN || DEFAULT_RATES.PLN;

  if (curr === "USD") return num * usd;
  if (curr === "EUR") return num * eur;
  if (curr === "PLN") return num * pln;
  return num;
}

/**
 * Визначає, чи є елемент збережень вільною «Скарбничкою» (не цільовим проектом).
 * Відповідно до критерію: не має дедлайну (target_date) ТА/АБО не має цільової суми (target_amount).
 */
export function isPiggyBank(goal: SavingsGoal): boolean {
  const hasTargetAmount =
    goal.target_amount != null && Number(goal.target_amount) > 0;
  const hasTargetDate = Boolean(
    goal.target_date && String(goal.target_date).trim().length > 0
  );

  // Скарбничка — це накопичення без дедлайну або без чіткої цільової суми (кеш, подушка, сейф)
  return !hasTargetAmount || !hasTargetDate;
}

export interface PortfolioYieldMetricsParams {
  investments: InvestmentAsset[];
  savingsGoals: SavingsGoal[];
  rates?: Partial<ExchangeRates>;
}

export interface PortfolioYieldMetricsResult {
  // Загальна база капіталу (інвестиції + вільні скарбнички)
  totalCapitalBaseUah: number;

  // Окремо обсяг інвестиційного портфеля
  investmentsValueUah: number;

  // Окремо сума у вільних скарбничках
  savingsValueUah: number;

  // Сума в цільових проектах (не враховується у вільні скарбнички)
  goalsValueUah: number;

  // Прогнозований річний прибуток (грн/рік)
  projectedAnnualProfitUah: number;

  // Прогнозований середньомісячний пасивний дохід (грн/міс)
  projectedMonthlyProfitUah: number;

  // Середньозважена доходність портфеля + скарбничок (%)
  weightedYieldPercent: number;

  // Доходність виключно інвестиційного портфеля (%)
  investmentsOnlyYieldPercent: number;

  // Кількість врахованих позицій
  investmentsCount: number;
  savingsCount: number;
  goalsCount: number;
}

/**
 * Розраховує середньозважену річну доходність капіталу та прогноз річного прибутку.
 * Враховує активи інвестиційного портфеля та кошти у вільних скарбничках.
 */
export function calculateCapitalYieldMetrics({
  investments,
  savingsGoals,
  rates = DEFAULT_RATES,
}: PortfolioYieldMetricsParams): PortfolioYieldMetricsResult {
  let investmentsValueUah = 0;
  let projectedAnnualProfitUah = 0;
  let investmentsCount = 0;

  for (const inv of investments) {
    const valUah = convertToUah(
      Number(inv.current_value) || 0,
      inv.currency,
      rates
    );
    const yieldPct = Number(inv.yield_percent) || 0;

    investmentsValueUah += valUah;
    if (yieldPct > 0) {
      projectedAnnualProfitUah += (valUah * yieldPct) / 100;
    }
    investmentsCount++;
  }

  let savingsValueUah = 0;
  let goalsValueUah = 0;
  let savingsCount = 0;
  let goalsCount = 0;

  for (const goal of savingsGoals) {
    const amountUah = convertToUah(
      Number(goal.current_amount) || 0,
      goal.currency,
      rates
    );

    if (isPiggyBank(goal)) {
      savingsValueUah += amountUah;
      savingsCount++;
    } else {
      goalsValueUah += amountUah;
      goalsCount++;
    }
  }

  const totalCapitalBaseUah = investmentsValueUah + savingsValueUah;

  const weightedYieldPercent =
    totalCapitalBaseUah > 0
      ? (projectedAnnualProfitUah / totalCapitalBaseUah) * 100
      : 0;

  const investmentsOnlyYieldPercent =
    investmentsValueUah > 0
      ? (projectedAnnualProfitUah / investmentsValueUah) * 100
      : 0;

  const projectedMonthlyProfitUah = projectedAnnualProfitUah / 12;

  return {
    totalCapitalBaseUah,
    investmentsValueUah,
    savingsValueUah,
    goalsValueUah,
    projectedAnnualProfitUah,
    projectedMonthlyProfitUah,
    weightedYieldPercent,
    investmentsOnlyYieldPercent,
    investmentsCount,
    savingsCount,
    goalsCount,
  };
}
