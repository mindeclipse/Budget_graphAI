import { BudgetCycle } from "@/types/finance";

export interface DateRangeFilter {
  from?: string;
  to?: string;
}

export interface CyclesResponse {
  activeCycle: BudgetCycle | null;
  cycles: BudgetCycle[];
}

// Ключі для кешу
export const FINANCE_KEYS = {
  transactions: (range?: DateRangeFilter) =>
    range ? (["transactions", range] as const) : (["transactions"] as const),
  investmentTransactions: ["transactions", "investment"] as const,
  recurring: ["recurring"] as const,
  radar: ["recurring", "radar"] as const,
  budget: (month: string) => ["budget", month] as const,
  analyticsPace: (from?: string, to?: string) =>
    ["analytics", "pace", from, to] as const,
  analyticsCpi: (year?: number, month?: number, from?: string, to?: string) =>
    ["analytics", "cpi", year, month, from, to] as const,
  wealthSummary: ["wealth", "summary"] as const,
  cycles: ["cycles"] as const,
};
