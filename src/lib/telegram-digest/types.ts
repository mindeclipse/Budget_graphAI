import { Transaction } from "@/types/finance";
import { BehavioralMetrics, BehavioralCoachAdvice } from "@/types/ai";

export interface DigestResult<T = unknown> {
  success: boolean;
  sent: boolean;
  reason?: string;
  data?: T;
}

export interface WeeklyDigestOptions {
  force?: boolean;
}

export interface WeeklyCategoryBreakdown {
  name: string;
  amount: number;
  percent: number;
}

export interface WeeklyDigestData {
  weekKey: string;
  thisWeekSpent: number;
  prevWeekSpent: number;
  totalInvestedThisWeek: number;
  totalSavedThisWeek: number;
  sortedCategories: WeeklyCategoryBreakdown[];
  largestTx?: Transaction;
  remainingBudget: number;
  behavioralMetrics: BehavioralMetrics;
  coachAdvice: BehavioralCoachAdvice | null;
}

export interface CycleSummaryOptions {
  force?: boolean;
}

export interface CycleTopCategory {
  rank: number;
  name: string;
  amount: number;
  percent: string;
}

export interface CycleSummaryData {
  cycleId: string;
  budgetLimit: number;
  totalSpent: number;
  totalCycleInvested: number;
  totalCycleSaved: number;
  savedAmount: number;
  isSaved: boolean;
  topCategories: CycleTopCategory[];
}
