import { Transaction } from "@/types/finance";

export interface MoMComparisonProps {
  currentTransactions: Transaction[];
  previousTransactions: Transaction[];
  currentMonthLabel: string;
  previousMonthLabel: string;
  title?: string;
}

export interface CategoryDiff {
  category: string;
  currentAmount: number;
  prevAmount: number;
  diffAmount: number;
  percentChange: number | null; // null якщо в минулому місяці було 0
}

export interface MoMDiffResult {
  categoryDiffs: CategoryDiff[];
  totalCurrent: number;
  totalPrev: number;
  totalDiffAmount: number;
  totalPercentChange: number | null;
}
