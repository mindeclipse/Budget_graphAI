export interface Transaction {
  id: number;
  created_at: string;
  amount: number;
  currency: string;
  merchant_raw: string;
  category_name: string;
  source: string;
  type: "expense" | "income" | "investment" | "transfer";
  exclude_from_budget?: boolean;
  tags?: string[];
  parent_transaction_id?: number | null;
  original_amount?: number | null;
  original_currency?: string | null;
  deleted_at?: string | null;
  metadata?: Record<string, any> | null;
}

export interface TransactionReceiptMetadata {
  fileName: string;
  fileSize: number;
  mimeType: string;
  base64?: string;
  bankName?: string;
  purpose?: string;
  payer?: string;
  attachedAt?: string;
}

export interface SavingsGoal {
  id: number;
  name: string;
  target_amount?: number | null;
  current_amount: number;
  currency: string;
  target_date?: string | null;
  created_at: string;
}

export interface InvestmentAsset {
  id: number;
  asset_name: string;
  asset_type: "bonds" | "stocks" | "crypto" | "deposit" | "reit" | "other";
  invested_amount: number;
  current_value: number;
  currency: string;
  yield_percent?: number | null;
  maturity_date?: string | null;
  notes?: string | null;
  created_at: string;
}

export interface BudgetCycle {
  id: string;
  name: string;
  start_date: string;
  end_date?: string | null;
  budget_limit: number;
  is_active: boolean;
  created_at?: string;
}

export interface CategoryBudget {
  id: number;
  category_name: string;
  monthly_limit: number;
  created_at?: string;
}

export interface RecurringItem {
  id: number;
  title: string;
  amount: number;
  currency?: "UAH" | "USD";
  category_name: string;
  day_of_month: number;
  is_active: boolean;
}

export interface WishlistItem {
  id: number;
  title: string;
  estimated_price: number;
  currency: string;
  category_name: string;
  url?: string | null;
  notes?: string | null;
  cooling_days: number;
  cooling_end_date: string;
  status: "cooling" | "ready" | "purchased" | "saved";
  resolved_at?: string | null;
  created_at: string;
}

export interface CostPerUseItem {
  id: number;
  item_name: string;
  category_name: string;
  purchase_price: number;
  currency: string;
  purchase_date: string;
  total_uses: number;
  benchmark_cost_per_use?: number | null;
  target_cost_per_use?: number | null;
  notes?: string | null;
  last_used_at?: string | null;
  created_at: string;
}

export interface MerchantRule {
  id?: number;
  pattern: string;
  normalized_name?: string;
  clean_merchant?: string;
  category_name: string;
  created_at?: string;
}

export interface WidgetSummaryResponse {
  success: boolean;
  cycleName: string;
  safeDailySpend: number;
  todaySpent: number;
  todayRemaining: number;
  todayRecurringSpent?: number;
  remainingBudget: number;
  daysRemaining: number;
  cycleProgressPercent: number;
  spendPaceStatus: "on_track" | "warning" | "exceeded";
  safeWeekdaySpend?: number;
  safeWeekendSpend?: number;
  isTodayWeekend?: boolean;
  pacingStatusLabel?: string;
  topCategories: Array<{
    name: string;
    amount: number;
  }>;
  lastTransaction: {
    merchant: string;
    amount: number;
    time: string;
  } | null;
  updatedAt: string;
}
