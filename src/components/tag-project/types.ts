import { Transaction } from "@/types/finance";

export interface ProjectCategoryStat {
  name: string;
  amount: number;
  percentage: number;
}

export interface ProjectMonthStat {
  key: string;
  label: string;
  amount: number;
  count: number;
}

export interface ProjectMetricsResult {
  projectTxs: Transaction[];
  expenseTxs: Transaction[];
  incomeTxs: Transaction[];
  totalSpent: number;
  totalIncome: number;
  netBalance: number;
  txCount: number;
  firstDate: Date | null;
  lastDate: Date | null;
  categories: ProjectCategoryStat[];
  monthlyDistribution: ProjectMonthStat[];
  avgCheck: number;
}

export interface TagProjectModalProps {
  tag: string | null;
  transactions: Transaction[];
  onClose: () => void;
  onSelectTransaction?: (transaction: Transaction) => void;
}
