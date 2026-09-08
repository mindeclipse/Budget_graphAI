export type SupportedGeminiModel =
  "gemini-3.5-flash" | "gemini-3.5-flash-lite" | "gemini-3.7-flash";

export interface AIAnalysisRequest {
  cycleName?: string;
  budgetLimit: number;
  variableBudget: number;
  recurringTotal: number;
  totalSpent: number;
  remaining: number;
  safeDailySpend: number;
  daysRemaining: number;
  spentPercent: number;
  topCategories: Array<{
    name: string;
    amount: number;
    percentage: number;
  }>;
  preferredModel?: SupportedGeminiModel;
}

export interface AIAnalysisResponse {
  status: "on_track" | "warning" | "critical";
  summary: string;
  paceAnalysis: {
    burnRateEvaluation: string;
    projectedEndBalance: number;
    adjustedDailyBudget: number;
  };
  keyFindings: string[];
  actionableSteps: string[];
  usedModel: SupportedGeminiModel;
}
