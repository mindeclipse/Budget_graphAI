import { useState, useMemo } from "react";
import {
  Transaction,
  BudgetCycle,
  WishlistItem,
  CostPerUseItem,
} from "@/types/finance";
import {
  AIAnalysisResponse,
  SupportedGeminiModel,
  AIAnalysisRequest,
  AIChatFinancialContext,
} from "@/types/ai";
import {
  SubscriptionRadarResult,
  UpcomingScheduleItem,
} from "@/lib/subscription-radar";

export interface UseAiAdvisorProps {
  activeCycle?: BudgetCycle | null;
  effectiveLimit: number;
  recurringTotal: number;
  totalSpent: number;
  budgetMetrics: {
    remaining: number;
    safeDailySpend: number;
    daysRemaining: number;
    exactPercent: number;
  };
  categoryStats: Array<{
    name: string;
    amount: number;
    percentage: number;
  }>;
  filteredTransactions: Transaction[];
  wishlistItems: WishlistItem[];
  wishlistSavedAmount: number;
  costPerUseItems: CostPerUseItem[];
  costPerUseSavedAmount: number;
  radarData?: SubscriptionRadarResult | null;
  openAiDrawer: (initialPrompt?: string) => void;
}

export function useAiAdvisor({
  activeCycle,
  effectiveLimit,
  recurringTotal,
  totalSpent,
  budgetMetrics,
  categoryStats,
  filteredTransactions,
  wishlistItems,
  wishlistSavedAmount,
  costPerUseItems,
  costPerUseSavedAmount,
  radarData,
  openAiDrawer,
}: UseAiAdvisorProps) {
  const [aiAnalysis, setAiAnalysis] = useState<AIAnalysisResponse | null>(null);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [selectedAiModel, setSelectedAiModel] =
    useState<SupportedGeminiModel>("gemini-3.5-flash");

  const aiFinancialContext = useMemo<AIChatFinancialContext>(() => {
    const coolingCount = wishlistItems.filter(
      (i) => i.status === "cooling" || i.status === "ready"
    ).length;
    const pendingAmount = wishlistItems
      .filter((i) => i.status === "cooling" || i.status === "ready")
      .reduce((sum, i) => sum + Number(i.estimated_price || 0), 0);

    return {
      cycleName: activeCycle?.name,
      budgetLimit: effectiveLimit,
      totalSpent,
      remaining: budgetMetrics.remaining,
      safeDailySpend: budgetMetrics.safeDailySpend,
      daysRemaining: budgetMetrics.daysRemaining,
      topCategories: categoryStats.slice(0, 5).map((c) => ({
        name: c.name,
        amount: c.amount,
        percentage: c.percentage,
      })),
      analysisSummary: aiAnalysis?.summary,
      upcomingSubscriptions: (radarData?.upcoming || [])
        .slice(0, 4)
        .map((s: UpcomingScheduleItem) => ({
          title: s.title,
          amount: s.amount,
          currency: s.currency,
          daysRemaining: s.days_remaining,
        })),
      wishlistCount: coolingCount,
      wishlistPendingAmount: pendingAmount,
      savedImpulseAmount: wishlistSavedAmount,
      costPerUseCount: costPerUseItems.length,
      costPerUseTotalSaved: costPerUseSavedAmount,
      recentTransactions: filteredTransactions
        .filter(
          (t) =>
            (t.tags && t.tags.length > 0) ||
            t.metadata?.comment ||
            t.metadata?.note
        )
        .slice(0, 15)
        .map((t) => ({
          merchant: t.merchant_raw,
          amount: Number(t.amount),
          category: t.category_name,
          tags: t.tags,
          comment:
            (t.metadata?.comment as string) ||
            (t.metadata?.note as string) ||
            undefined,
          isEmergency: Boolean(
            t.metadata?.is_emergency || t.tags?.includes("форсмажор")
          ),
          date: new Date(t.created_at).toLocaleDateString("uk-UA", {
            day: "numeric",
            month: "short",
          }),
        })),
    };
  }, [
    activeCycle?.name,
    effectiveLimit,
    totalSpent,
    budgetMetrics.remaining,
    budgetMetrics.safeDailySpend,
    budgetMetrics.daysRemaining,
    categoryStats,
    aiAnalysis?.summary,
    radarData?.upcoming,
    wishlistItems,
    wishlistSavedAmount,
    costPerUseItems.length,
    costPerUseSavedAmount,
    filteredTransactions,
  ]);

  const handleRunAiAnalysis = async (
    modelToUse = selectedAiModel,
    initialPrompt?: string
  ) => {
    openAiDrawer(initialPrompt);

    if (aiAnalysis && !initialPrompt) {
      return;
    }

    setIsAiLoading(true);

    try {
      const recentTaggedTransactions = filteredTransactions
        .filter(
          (t) =>
            (t.tags && t.tags.length > 0) ||
            t.metadata?.comment ||
            t.metadata?.note
        )
        .slice(0, 10)
        .map((t) => ({
          merchant: t.merchant_raw,
          amount: Number(t.amount),
          category: t.category_name,
          tags: t.tags,
          comment:
            (t.metadata?.comment as string) ||
            (t.metadata?.note as string) ||
            undefined,
          isEmergency: Boolean(
            t.metadata?.is_emergency || t.tags?.includes("форсмажор")
          ),
        }));

      const payload: AIAnalysisRequest = {
        cycleName: activeCycle?.name,
        budgetLimit: effectiveLimit,
        variableBudget: Math.max(0, effectiveLimit - recurringTotal),
        recurringTotal,
        totalSpent,
        remaining: budgetMetrics.remaining,
        safeDailySpend: budgetMetrics.safeDailySpend,
        daysRemaining: budgetMetrics.daysRemaining,
        spentPercent: budgetMetrics.exactPercent,
        topCategories: categoryStats.slice(0, 4).map((c) => ({
          name: c.name,
          amount: c.amount,
          percentage: c.percentage,
        })),
        recentTaggedTransactions,
        preferredModel: modelToUse,
      };

      const res = await fetch("/api/ai/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error("Не вдалося отримати аналіз");

      const data: AIAnalysisResponse = await res.json();
      setAiAnalysis(data);
    } catch (err) {
      console.error("AI Analysis error:", err);
    } finally {
      setIsAiLoading(false);
    }
  };

  return {
    aiAnalysis,
    setAiAnalysis,
    isAiLoading,
    selectedAiModel,
    setSelectedAiModel,
    aiFinancialContext,
    handleRunAiAnalysis,
  };
}
