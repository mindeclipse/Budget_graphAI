import { Transaction, RecurringItem, BudgetCycle } from "@/types/finance";

export type { BudgetCycle, RecurringItem, Transaction };

export type BurnRateTransaction = {
  id?: number | string;
  amount: number | string;
  created_at: string;
  type?: "expense" | "income" | "investment" | string;
  exclude_from_budget?: boolean;
} & Omit<Partial<Transaction>, "id" | "type">;

export type BurnRateRecurringItem = {
  id?: number | string;
  title?: string;
  amount: number | string;
  day_of_month: number;
  currency?: "UAH" | "USD" | string;
  is_active?: boolean;
} & Omit<Partial<RecurringItem>, "id" | "currency">;

export interface BurnRatePoint {
  day: number;
  dateLabel: string;
  ideal: number;
  actual: number | null;
  dropToday: number;
}

export interface CalculateBurnRateParams {
  transactions: (Transaction | BurnRateTransaction)[];
  budgetLimit: number;
  recurringTotal?: number;
  selectedMonthKey: string;
  recurring?: (RecurringItem | BurnRateRecurringItem)[];
  usdRate?: number;
  activeCycle?: BudgetCycle | null;
  currentDate?: Date;
}

export interface BurnRateResult {
  data: BurnRatePoint[];
  currentDay: number;
  totalDays: number;
  isCurrentMonth: boolean;
  isFutureMonth: boolean;
  isCycleMode: boolean;
  runningTotal: number;
  projectedMonthEnd: number;
}

export interface BurnRateChartProps {
  transactions: Transaction[];
  budgetLimit: number;
  recurringTotal?: number;
  selectedMonthKey: string;
  recurring?: RecurringItem[];
  usdRate?: number;
  activeCycle?: BudgetCycle | null;
}
