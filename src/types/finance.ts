export interface Transaction {
  id: number;
  created_at: string;
  amount: number;
  currency: string;
  merchant_raw: string;
  category_name: string;
  source: string;
  type: "expense" | "income";
  tags?: string[];
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
