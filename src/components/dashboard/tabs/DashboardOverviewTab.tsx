"use client";

import dynamic from "next/dynamic";
import { CategoryBreakdown } from "@/components/dashboard/CategoryBreakdown";
import { SubscriptionRadar } from "@/components/dashboard/SubscriptionRadar";
import { AICard } from "@/components/dashboard/AICard";
import { Transaction, BudgetCycle, RecurringItem } from "@/types/finance";
import { AIAnalysisResponse, SupportedGeminiModel } from "@/types/ai";
import {
  DetectedSubscription,
  SubscriptionRadarResult,
} from "@/lib/subscription-radar";

// Пульсуючий прелоадер-скелетон для відкладеного завантаження графіків Recharts
function ChartSkeleton({ height = "h-44 md:h-52" }: { height?: string }) {
  return (
    <div className="relative animate-pulse rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-5 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)]">
      <div className="mb-3 flex items-center justify-between">
        <div className="h-3.5 w-36 rounded bg-zinc-800/80" />
        <div className="h-3 w-10 rounded bg-zinc-800/80" />
      </div>
      <div
        className={`${height} flex w-full items-center justify-center rounded-xl bg-zinc-800/30`}
      >
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-zinc-700 border-t-zinc-400 opacity-40" />
      </div>
    </div>
  );
}

// Code Splitting для важких аналітичних графіків Recharts
const DailyDynamicsChart = dynamic(
  () =>
    import("@/components/dashboard/DailyDynamicsChart").then(
      (m) => m.DailyDynamicsChart
    ),
  {
    ssr: false,
    loading: () => <ChartSkeleton height="h-44 md:h-52" />,
  }
);

const BurnRateChart = dynamic(
  () =>
    import("@/components/dashboard/BurnRateChart").then((m) => m.BurnRateChart),
  {
    ssr: false,
    loading: () => <ChartSkeleton height="h-52 md:h-64" />,
  }
);

const MoMComparison = dynamic(
  () =>
    import("@/components/dashboard/MoMComparison").then((m) => m.MoMComparison),
  {
    ssr: false,
    loading: () => <ChartSkeleton height="h-44 md:h-52" />,
  }
);

export interface DashboardOverviewTabProps {
  dailyStats: any[];
  categoryStats: any[];
  categoryBudgets: Record<string, number>;
  onSelectCategory: (category: string) => void;
  onSaveCategoryBudget: (categoryName: string, limit: number) => Promise<void>;
  onDeleteCategoryBudget: (categoryName: string) => Promise<void>;
  recurring: RecurringItem[];
  radarData?: SubscriptionRadarResult | null;
  isLoadingRadar: boolean;
  onAddRecurring: () => void;
  onEditRecurring: (item: RecurringItem) => void;
  onExecuteRecurring: (item: RecurringItem) => void;
  onAddDetectedFromRadar: (sub: DetectedSubscription) => void;
  onDismissDetectedFromRadar: (signature: string, title?: string) => void;
  filteredTransactions: Transaction[];
  effectiveLimit: number;
  recurringTotal: number;
  selectedMonthKey: string;
  commercialRates: {
    USD: number;
    EUR: number;
    PLN: number;
  };
  activeCycle?: BudgetCycle | null;
  cycleCurrentTransactions: Transaction[];
  cyclePreviousTransactions: Transaction[];
  cycleCurrentLabel: string;
  cyclePreviousLabel: string;
  aiAnalysis: AIAnalysisResponse | null;
  isAiLoading: boolean;
  budgetMetrics: any;
  selectedAiModel: SupportedGeminiModel;
  onModelChange: (model: SupportedGeminiModel) => void;
  onRunAiAnalysis: (
    model?: SupportedGeminiModel,
    initialPrompt?: string
  ) => void;
}

export function DashboardOverviewTab({
  dailyStats,
  categoryStats,
  categoryBudgets,
  onSelectCategory,
  onSaveCategoryBudget,
  onDeleteCategoryBudget,
  recurring,
  radarData,
  isLoadingRadar,
  onAddRecurring,
  onEditRecurring,
  onExecuteRecurring,
  onAddDetectedFromRadar,
  onDismissDetectedFromRadar,
  filteredTransactions,
  effectiveLimit,
  recurringTotal,
  selectedMonthKey,
  commercialRates,
  activeCycle,
  cycleCurrentTransactions,
  cyclePreviousTransactions,
  cycleCurrentLabel,
  cyclePreviousLabel,
  aiAnalysis,
  isAiLoading,
  budgetMetrics,
  selectedAiModel,
  onModelChange,
  onRunAiAnalysis,
}: DashboardOverviewTabProps) {
  return (
    <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
      {/* Ліва колонка: Щоденна динаміка -> Категорії -> Радар підписок */}
      <section className="space-y-6">
        <DailyDynamicsChart dailyStats={dailyStats} />

        <CategoryBreakdown
          categoryStats={categoryStats}
          categoryBudgets={categoryBudgets}
          onSelectCategory={onSelectCategory}
          onSaveCategoryBudget={onSaveCategoryBudget}
          onDeleteCategoryBudget={onDeleteCategoryBudget}
        />

        <SubscriptionRadar
          recurring={recurring}
          radarData={radarData || undefined}
          isLoading={isLoadingRadar}
          onAddRecurring={onAddRecurring}
          onEditRecurring={onEditRecurring}
          onExecuteRecurring={onExecuteRecurring}
          onAddDetected={onAddDetectedFromRadar}
          onDismissDetected={onDismissDetectedFromRadar}
        />
      </section>

      {/* Права колонка: Прогноз темпу (Burn Rate) -> Порівняння циклів -> AI Радник */}
      <section className="space-y-6">
        <BurnRateChart
          transactions={filteredTransactions}
          budgetLimit={effectiveLimit}
          recurringTotal={recurringTotal}
          selectedMonthKey={selectedMonthKey}
          recurring={recurring}
          usdRate={commercialRates.USD}
          activeCycle={activeCycle}
        />

        <MoMComparison
          currentTransactions={cycleCurrentTransactions}
          previousTransactions={cyclePreviousTransactions}
          currentMonthLabel={cycleCurrentLabel}
          previousMonthLabel={cyclePreviousLabel}
          title={
            activeCycle
              ? "Порівняння з минулим циклом"
              : "Порівняння з минулим місяцем"
          }
        />

        <AICard
          aiAnalysis={aiAnalysis}
          isAiLoading={isAiLoading}
          budgetMetrics={budgetMetrics}
          categoryStats={categoryStats}
          categoryBudgets={categoryBudgets}
          radarUpcoming={radarData?.upcoming}
          selectedModel={selectedAiModel}
          onModelChange={onModelChange}
          onOpenAiDrawer={(initialPrompt) =>
            onRunAiAnalysis(selectedAiModel, initialPrompt)
          }
        />
      </section>
    </div>
  );
}
