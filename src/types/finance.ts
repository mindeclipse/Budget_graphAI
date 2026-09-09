export interface Transaction {
  id: number;
  created_at: string;
  amount: number;
  currency: string;
  merchant_raw: string;
  category_name: string;
  source: string;
  type: "expense" | "income" | "investment";
  exclude_from_budget?: boolean;
  tags?: string[];
  parent_transaction_id?: number | null;
  original_amount?: number | null;
  original_currency?: string | null;
}

export interface SavingsGoal {
  id: number;
  name: string;
  target_amount: number;
  current_amount: number;
  currency: string;
  target_date?: string | null;
  created_at: string;
}

export interface InvestmentAsset {
  id: number;
  asset_name: string;
  asset_type: "bonds" | "stocks" | "crypto" | "deposit" | "other";
  invested_amount: number;
  current_value: number;
  currency: string;
  yield_percent?: number | null;
  maturity_date?: string | null;
  notes?: string | null;
  created_at: string;
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

export interface AIInsightData {
  status: "safe" | "warning" | "danger";
  summary: string;
  anomalies: string[];
  saving_tactics: string[];
  forecast: string;
}
