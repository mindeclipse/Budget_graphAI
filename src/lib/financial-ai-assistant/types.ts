export interface FinancialAssistantContext {
  cycle: {
    name: string;
    startDate: string;
    endDate: string;
    daysTotal: number;
    daysPassed: number;
    daysRemaining: number;
  };
  budget: {
    totalBudgetLimit: number;
    currentExpenseTotal: number;
    discretionaryRemaining: number;
    reservedObligationsTotal: number;
  };
  pacing: {
    safeWeekdaySpend: number;
    safeWeekendSpend: number;
    flatDailySpend: number;
    statusLabel: string;
    advice: string;
  };
  surplusProjection: {
    projectedSurplusAmount: number;
    projectedDeficitAmount?: number;
    status?: string;
    summaryText: string;
  };
  cushion: {
    currentAmount: number;
    targetAmount?: number | null;
    monthRoundupAmount: number;
    totalRoundupAmount: number;
  };
  otherGoals: Array<{ name: string; amount: number; currency: string }>;
  subscriptions: Array<{
    title: string;
    amount: number;
    currency: string;
    day_of_month: number;
    status: string;
  }>;
  categoryStats: Record<string, { total: number; count: number }>;
  topPurchases: Array<{
    date: string;
    amount: number;
    merchant: string;
    category: string;
  }>;
  recentTransactions: Array<{
    date: string;
    amount: number;
    merchant: string;
    category: string;
    type: string;
    note?: string;
    amortization?: any;
    is_emergency?: boolean;
  }>;
  kyivNowStr: string;
}
