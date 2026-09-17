"use client";

import dynamic from "next/dynamic";
import { CapitalYieldMetrics } from "@/components/dashboard/CapitalYieldMetrics";
import { SavingsGoalsCard } from "@/components/dashboard/SavingsGoalsCard";
import { InvestmentsCard } from "@/components/dashboard/InvestmentsCard";
import { WishlistCard } from "@/components/dashboard/WishlistCard";
import { CostPerUseCard } from "@/components/dashboard/CostPerUseCard";
import {
  InvestmentAsset,
  SavingsGoal,
  WishlistItem,
  CostPerUseItem,
  Transaction,
} from "@/types/finance";

// Пульсуючий прелоадер-скелетон для відкладеного завантаження графіків Recharts
function ChartSkeleton({ height = "h-52 md:h-60" }: { height?: string }) {
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

const CapitalHistoryCard = dynamic(
  () =>
    import("@/components/dashboard/CapitalHistoryCard").then(
      (m) => m.CapitalHistoryCard
    ),
  {
    ssr: false,
    loading: () => <ChartSkeleton height="h-52 md:h-60" />,
  }
);

export interface DashboardWealthTabProps {
  investments: InvestmentAsset[];
  savingsGoals: SavingsGoal[];
  commercialRates: {
    USD: number;
    EUR: number;
    PLN: number;
  };
  totalSpent: number;
  effectiveLimit: number;
  onRefreshWealth: () => void;
  wishlistItems: WishlistItem[];
  wishlistSavedAmount: number;
  costPerUseItems: CostPerUseItem[];
  costPerUseSavedAmount: number;
  prefillCostPerUse: any;
  setPrefillCostPerUse: (item: any) => void;
  capitalTransactions: Transaction[];
  onSelectTransaction: (tx: Transaction) => void;
  onAddCapital: () => void;
  onOpenImportInvestment: () => void;
}

export function DashboardWealthTab({
  investments,
  savingsGoals,
  commercialRates,
  totalSpent,
  effectiveLimit,
  onRefreshWealth,
  wishlistItems,
  wishlistSavedAmount,
  costPerUseItems,
  costPerUseSavedAmount,
  prefillCostPerUse,
  setPrefillCostPerUse,
  capitalTransactions,
  onSelectTransaction,
  onAddCapital,
  onOpenImportInvestment,
}: DashboardWealthTabProps) {
  return (
    <div className="space-y-6">
      {/* Зведена аналітика капіталу: Середньозважена доходність (%) та Прогноз річного прибутку (грн) */}
      <CapitalYieldMetrics
        investments={investments}
        savingsGoals={savingsGoals}
        rates={commercialRates}
      />

      {/* Ряд 1: Скарбнички та Інвестиційний портфель */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <SavingsGoalsCard
          goals={savingsGoals}
          monthlyBurnRate={totalSpent > 0 ? totalSpent : effectiveLimit}
          rates={commercialRates}
          onRefresh={onRefreshWealth}
        />
        <InvestmentsCard
          investments={investments}
          rates={commercialRates}
          onRefresh={onRefreshWealth}
        />
      </div>

      {/* Ряд 2: Поведінкова психологія та усвідомлені покупки */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <WishlistCard
          items={wishlistItems}
          savedAmount={wishlistSavedAmount}
          onRefresh={onRefreshWealth}
          onConvertToCostPerUse={(wish) => {
            setPrefillCostPerUse({
              item_name: wish.title,
              purchase_price: wish.estimated_price,
              currency: wish.currency,
              category_name: wish.category_name,
              notes: wish.notes || undefined,
              total_uses: 1,
              purchase_date: new Date().toISOString().split("T")[0],
            });
          }}
        />
        <CostPerUseCard
          items={costPerUseItems}
          totalMoneySaved={costPerUseSavedAmount}
          onRefresh={onRefreshWealth}
          prefillItem={prefillCostPerUse}
          onClearPrefill={() => setPrefillCostPerUse(null)}
        />
      </div>

      {/* Ряд 3: Окрема історія операцій капіталу */}
      <CapitalHistoryCard
        transactions={capitalTransactions}
        onSelectTransaction={onSelectTransaction}
        onAddCapital={onAddCapital}
        onImportInzhur={onOpenImportInvestment}
      />
    </div>
  );
}
