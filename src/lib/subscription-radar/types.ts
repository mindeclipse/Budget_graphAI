export interface DetectedSubscription {
  id: string; // Унікальний хеш-підпис, напр. "netflix-390-uah"
  title: string;
  amount: number;
  currency: "UAH" | "USD";
  category_name: string;
  predicted_day_of_month: number;
  confidence: "high" | "medium";
  interval_days: number;
  occurrences_count: number;
  last_billed_at: string;
}

export type ScheduleItemStatus = "paid" | "due_today" | "upcoming" | "overdue";

export interface UpcomingScheduleItem {
  id: number;
  title: string;
  amount: number;
  currency: "UAH" | "USD";
  category_name: string;
  day_of_month: number;
  status: ScheduleItemStatus;
  days_remaining: number;
  paid_at?: string;
  paid_amount?: number;
  matched_transaction_id?: number;
}

export interface SubscriptionRadarMetrics {
  monthly_total: number;
  annual_total: number;
  paid_this_month: number;
  remaining_this_month: number;
  detected_count: number;
}

export interface SubscriptionRadarResult {
  detected: DetectedSubscription[];
  upcoming: UpcomingScheduleItem[];
  metrics: SubscriptionRadarMetrics;
}
