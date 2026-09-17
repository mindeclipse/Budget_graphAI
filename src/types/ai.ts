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
  recentTaggedTransactions?: Array<{
    merchant: string;
    amount: number;
    category: string;
    comment?: string;
    tags?: string[];
    isEmergency?: boolean;
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

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  usedModel?: SupportedGeminiModel;
}

export interface AIChatFinancialContext {
  cycleName?: string;
  budgetLimit: number;
  totalSpent: number;
  remaining: number;
  safeDailySpend: number;
  daysRemaining: number;
  topCategories: Array<{
    name: string;
    amount: number;
    percentage: number;
  }>;
  recentTransactions?: Array<{
    merchant: string;
    amount: number;
    category: string;
    comment?: string;
    tags?: string[];
    isEmergency?: boolean;
    date: string;
  }>;
  analysisSummary?: string;
  upcomingSubscriptions?: Array<{
    title: string;
    amount: number;
    daysRemaining: number;
  }>;
  wishlistCount?: number;
  wishlistPendingAmount?: number;
  savedImpulseAmount?: number;
  costPerUseCount?: number;
  costPerUseTotalSaved?: number;
}

export interface AIChatRequest {
  messages: Array<{
    role: "user" | "assistant";
    content: string;
  }>;
  financialContext: AIChatFinancialContext;
  preferredModel?: SupportedGeminiModel;
}

export interface AIChatResponse {
  reply: string;
  usedModel: SupportedGeminiModel;
  modelFallbackOccurred?: boolean;
}

export interface ProactiveAlert {
  id: string;
  type: "pace" | "category" | "subscription" | "tip";
  severity: "info" | "warning" | "critical" | "success";
  title: string;
  description: string;
  suggestedAction?: string;
}

export interface BehavioralCoachAdvice {
  behavioralInsight: string;
  capitalFeedback: string;
  microChallenge: string;
  usedModel?: SupportedGeminiModel;
}

export interface BehavioralMetrics {
  totalExpense: number;
  timeProfile: {
    morning: { count: number; amount: number; percent: number };
    day: { count: number; amount: number; percent: number };
    evening: { count: number; amount: number; percent: number };
  };
  dayProfile: {
    weekday: { count: number; amount: number; percent: number };
    weekend: { count: number; amount: number; percent: number };
  };
  microTransactions: {
    count: number;
    amount: number;
    percent: number;
  };
  wishlist: {
    savedAmount: number;
    savedCount: number;
    coolingAmount: number;
    coolingCount: number;
  };
}
