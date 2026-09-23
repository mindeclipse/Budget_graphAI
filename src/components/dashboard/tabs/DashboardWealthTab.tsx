"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { X } from "lucide-react";
import { CapitalYieldMetrics } from "@/components/dashboard/CapitalYieldMetrics";
import { SavingsGoalsCard } from "@/components/dashboard/SavingsGoalsCard";
import { InvestmentsCard } from "@/components/dashboard/InvestmentsCard";
import { WishlistCard } from "@/components/dashboard/WishlistCard";
import { CostPerUseCard } from "@/components/dashboard/CostPerUseCard";
import { AssetAllocationCard } from "@/components/dashboard/AssetAllocationCard";
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
  onRefreshWealth: () => void | Promise<void>;
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
  onDepositSavingsGoalOptimistic?: (goalId: number, amount: number) => void;
  onUpsertSavingsGoalOptimistic?: (goal: any) => void;
  onDeleteSavingsGoalOptimistic?: (goalId: number) => void;
  onUpsertInvestmentOptimistic?: (asset: any) => void;
  onDeleteInvestmentOptimistic?: (assetId: number) => void;
  onAddWishlistOptimistic?: (item: any) => void;
  onResolveWishlistOptimistic?: (
    id: number,
    status: "saved" | "purchased"
  ) => void;
  onDeleteWishlistOptimistic?: (id: number) => void;
  onAddCostPerUseOptimistic?: (item: any) => void;
  onIncrementCostPerUseOptimistic?: (id: number) => void;
  onDeleteCostPerUseOptimistic?: (id: number) => void;
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
  onDepositSavingsGoalOptimistic,
  onUpsertSavingsGoalOptimistic,
  onDeleteSavingsGoalOptimistic,
  onUpsertInvestmentOptimistic,
  onDeleteInvestmentOptimistic,
  onAddWishlistOptimistic,
  onResolveWishlistOptimistic,
  onDeleteWishlistOptimistic,
  onAddCostPerUseOptimistic,
  onIncrementCostPerUseOptimistic,
  onDeleteCostPerUseOptimistic,
}: DashboardWealthTabProps) {
  const [isCostPerUseModalOpen, setIsCostPerUseModalOpen] = useState(false);

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
          onDepositOptimistic={onDepositSavingsGoalOptimistic}
          onUpsertOptimistic={onUpsertSavingsGoalOptimistic}
          onDeleteOptimistic={onDeleteSavingsGoalOptimistic}
        />
        <InvestmentsCard
          investments={investments}
          rates={commercialRates}
          onRefresh={onRefreshWealth}
          onUpsertOptimistic={onUpsertInvestmentOptimistic}
          onDeleteOptimistic={onDeleteInvestmentOptimistic}
        />
      </div>

      {/* Ряд 2: Лист очікування (з трекером цін) та Алокація активів (Заміна Окупності) */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <WishlistCard
          items={wishlistItems}
          savedAmount={wishlistSavedAmount}
          savingsGoals={savingsGoals}
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
            setIsCostPerUseModalOpen(true);
          }}
          onAddOptimistic={onAddWishlistOptimistic}
          onResolveOptimistic={onResolveWishlistOptimistic}
          onDeleteOptimistic={onDeleteWishlistOptimistic}
        />
        <AssetAllocationCard
          investments={investments}
          savingsGoals={savingsGoals}
          rates={commercialRates}
          costPerUseItemCount={costPerUseItems.length}
          onOpenCostPerUse={() => setIsCostPerUseModalOpen(true)}
        />
      </div>

      {/* Ряд 3: Окрема історія операцій капіталу */}
      <CapitalHistoryCard
        transactions={capitalTransactions}
        onSelectTransaction={onSelectTransaction}
        onAddCapital={onAddCapital}
        onImportInzhur={onOpenImportInvestment}
      />

      {/* Модальне вікно для Окупності речей (Cost-per-Use) */}
      {(isCostPerUseModalOpen || prefillCostPerUse) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
          <div
            className="fixed inset-0"
            onClick={() => {
              setIsCostPerUseModalOpen(false);
              setPrefillCostPerUse(null);
            }}
            aria-hidden="true"
          />
          <div className="relative z-10 max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-3xl border border-zinc-800 bg-zinc-900 p-2 shadow-2xl">
            <div className="flex justify-end pt-2 pr-3">
              <button
                type="button"
                onClick={() => {
                  setIsCostPerUseModalOpen(false);
                  setPrefillCostPerUse(null);
                }}
                className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <CostPerUseCard
              items={costPerUseItems}
              totalMoneySaved={costPerUseSavedAmount}
              onRefresh={onRefreshWealth}
              prefillItem={prefillCostPerUse}
              onClearPrefill={() => setPrefillCostPerUse(null)}
              onAddOptimistic={onAddCostPerUseOptimistic}
              onIncrementOptimistic={onIncrementCostPerUseOptimistic}
              onDeleteOptimistic={onDeleteCostPerUseOptimistic}
            />
          </div>
        </div>
      )}
    </div>
  );
}
