"use client";

import { useState, useMemo, Suspense } from "react";
import { useAuthSession } from "@/hooks/useAuthSession";
import { useFinanceQueries } from "@/hooks/useFinanceQueries";
import { useBudgetMetrics } from "@/hooks/useBudgetMetrics";
import { useTransactionMutations } from "@/hooks/useTransactionMutations";
import { useDashboardModals } from "@/hooks/useDashboardModals";
import { useAiAdvisor } from "@/hooks/useAiAdvisor";
import { useHistoryFilters } from "@/hooks/useHistoryFilters";
import { useCapitalTransactions } from "@/hooks/useCapitalTransactions";
import { useRecurringActions } from "@/hooks/useRecurringActions";

import { PinAuthScreen } from "@/components/auth/PinAuthScreen";
import { OfflineBanner } from "@/components/dashboard/OfflineBanner";
import { PeriodNav } from "@/components/dashboard/PeriodNav";
import { BudgetSummaryHeader } from "@/components/dashboard/BudgetSummaryHeader";
import { BudgetLimitCard } from "@/components/dashboard/BudgetLimitCard";
import { DashboardModals } from "@/components/dashboard/DashboardModals";
import { MobileBottomBar } from "@/components/dashboard/MobileBottomBar";
import { QuickActionsListener } from "@/components/QuickActionsListener";

import { DashboardOverviewTab } from "@/components/dashboard/tabs/DashboardOverviewTab";
import { DashboardHistoryTab } from "@/components/dashboard/tabs/DashboardHistoryTab";
import { DashboardWealthTab } from "@/components/dashboard/tabs/DashboardWealthTab";

import {
  Transaction,
  BudgetCycle,
  SavingsGoal,
  InvestmentAsset,
  WishlistItem,
  CostPerUseItem,
} from "@/types/finance";
import {
  getCycleDateRange,
  filterTransactionsByDateRange,
} from "@/lib/cycle-utils";

export default function Dashboard() {
  // 1. Автентифікація та сесія
  const {
    isAuthenticated,
    isVerifyingPin,
    isBiometricSupported,
    isOnline,
    pinInput,
    setPinInput,
    pinError,
    handleLogin,
    handleBiometricLogin,
    handleRegisterDevice,
    handleLogout,
  } = useAuthSession();

  // 2. Завантаження кешованих даних
  const {
    transactions: rawTransactions,
    invalidateTransactions,
    investmentTransactions,
    invalidateInvestmentTransactions,
    recurring,
    invalidateRecurring,
    radar: radarData,
    isLoadingRadar,
    invalidateRadar,
    markRecurringPaidOptimistic,
    cycles,
    activeCycle: queryActiveCycle,
    wealthData,
    invalidateCycles,
    invalidateWealth,
    updateActiveCycleLimitOptimistic,
    updateCategoryBudgetOptimistic,
    deleteCategoryBudgetOptimistic,
  } = useFinanceQueries(isAuthenticated);

  // Відфільтровуємо транзакції, виключені з бюджету
  const transactions = useMemo(() => {
    return rawTransactions.filter((t: Transaction) => !t.exclude_from_budget);
  }, [rawTransactions]);

  // 3. Стан вкладок і періодів
  const [activeTab, setActiveTab] = useState<"overview" | "wealth" | "history">(
    "overview"
  );
  const [selectedDate, setSelectedDate] = useState(() => new Date());

  const activeCycle = queryActiveCycle;
  const previousCycle = useMemo(() => {
    if (!cycles || cycles.length === 0) return null;
    const activeIdx = cycles.findIndex(
      (c: BudgetCycle) => c.id === activeCycle?.id || c.is_active
    );
    return activeIdx !== -1 ? cycles[activeIdx + 1] || null : cycles[1] || null;
  }, [cycles, activeCycle]);

  // 4. Стан капіталу з TanStack Query
  const savingsGoals = useMemo<SavingsGoal[]>(() => {
    return Array.isArray(wealthData?.goals) ? wealthData.goals : [];
  }, [wealthData?.goals]);

  const investments = useMemo<InvestmentAsset[]>(() => {
    return Array.isArray(wealthData?.investments) ? wealthData.investments : [];
  }, [wealthData?.investments]);

  const categoryBudgets = useMemo<Record<string, number>>(() => {
    return wealthData?.categoryBudgets &&
      typeof wealthData.categoryBudgets === "object"
      ? wealthData.categoryBudgets
      : {};
  }, [wealthData?.categoryBudgets]);

  const commercialRates = useMemo<{
    USD: number;
    EUR: number;
    PLN: number;
  }>(() => {
    return (
      wealthData?.rates || {
        USD: 41.5,
        EUR: 45.3,
        PLN: 10.6,
      }
    );
  }, [wealthData?.rates]);

  // Стан для Wishlist & Cost-per-Use
  const wishlistItems = useMemo<WishlistItem[]>(() => {
    return wealthData?.wishlist?.items || [];
  }, [wealthData?.wishlist?.items]);

  const wishlistSavedAmount = useMemo<number>(() => {
    return wealthData?.wishlist?.metrics?.saved_amount ?? 0;
  }, [wealthData?.wishlist?.metrics?.saved_amount]);

  const costPerUseItems = useMemo<CostPerUseItem[]>(() => {
    return wealthData?.costPerUse?.items || [];
  }, [wealthData?.costPerUse?.items]);

  const costPerUseSavedAmount = useMemo<number>(() => {
    return wealthData?.costPerUse?.metrics?.total_money_saved ?? 0;
  }, [wealthData?.costPerUse?.metrics?.total_money_saved]);

  // 5. Модальні вікна
  const {
    isCycleModalOpen,
    openCycleModal,
    closeCycleModal,
    isImportModalOpen,
    importModalType,
    openImportModal,
    closeImportModal,
    isInzhurImportOpen,
    closeInzhurImport,
    isCreateExpenseOpen,
    openCreateExpense,
    closeCreateExpense,
    isTrashOpen,
    openTrash,
    closeTrash,
    isMerchantRulesOpen,
    openMerchantRules,
    closeMerchantRules,
    isAiDrawerOpen,
    aiInitialPrompt,
    openAiDrawer,
    closeAiDrawer,
    selectedTx,
    setSelectedTx,
    splitTx,
    setSplitTx,
    selectedCategory,
    setSelectedCategory,
    selectedProjectTag,
    setSelectedProjectTag,
    isAddingRecurring,
    editingRecurring,
    openAddRecurring,
    openEditRecurring,
    closeRecurringModal,
    prefillCostPerUse,
    setPrefillCostPerUse,
  } = useDashboardModals();

  // 6. Оптимістичні мутації транзакцій
  const {
    updateTransaction,
    createTransaction,
    deleteTransaction,
    syncQueue,
    isSyncing,
  } = useTransactionMutations();

  // 7. Розрахунок аналітичних показників
  const {
    selectedMonthKey,
    monthLabel,
    monthTransactions,
    filteredTransactions,
    previousMonthTransactions,
    recurringTotal,
    totalSpent,
    budgetMetrics,
    categoryStats,
    dailyStats,
    effectiveLimit,
  } = useBudgetMetrics({
    transactions,
    recurring,
    budgetLimit: activeCycle?.budget_limit || 30000,
    selectedDate,
    activeCycle,
    usdRate: commercialRates.USD,
  });

  // Фільтрація транзакцій за зарплатними циклами для MoM-порівняння
  const {
    cycleCurrentTransactions,
    cyclePreviousTransactions,
    cycleCurrentLabel,
    cyclePreviousLabel,
  } = useMemo(() => {
    if (!activeCycle) {
      return {
        cycleCurrentTransactions: monthTransactions,
        cyclePreviousTransactions: previousMonthTransactions,
        cycleCurrentLabel: monthLabel,
        cyclePreviousLabel: "Мин. місяць",
      };
    }

    const currentRange = getCycleDateRange(activeCycle);
    const curr = filterTransactionsByDateRange(
      transactions,
      currentRange.startMs,
      currentRange.endMs
    );

    let prev: Transaction[] = [];
    if (previousCycle) {
      const prevRange = getCycleDateRange(previousCycle);
      prev = filterTransactionsByDateRange(
        transactions,
        prevRange.startMs,
        currentRange.startMs
      );
    }

    return {
      cycleCurrentTransactions: curr,
      cyclePreviousTransactions: prev,
      cycleCurrentLabel: activeCycle.name || "Поточний цикл",
      cyclePreviousLabel: previousCycle?.name || "Мин. цикл",
    };
  }, [
    activeCycle,
    previousCycle,
    transactions,
    monthTransactions,
    previousMonthTransactions,
    monthLabel,
  ]);

  // 8. Виділені хуки бізнес-логіки
  const {
    aiAnalysis,
    isAiLoading,
    selectedAiModel,
    setSelectedAiModel,
    aiFinancialContext,
    handleRunAiAnalysis,
  } = useAiAdvisor({
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
  });

  const {
    searchQuery,
    setSearchQuery,
    activeTag,
    setActiveTag,
    availableTags,
    displayedTransactions,
  } = useHistoryFilters({
    filteredTransactions,
  });

  const capitalTransactions = useCapitalTransactions({
    investmentTransactions,
    rawTransactions,
  });

  const {
    handleSaveRecurring,
    handleDeleteRecurring,
    handleExecuteRecurring,
    handleAddDetectedFromRadar,
    handleDismissDetectedFromRadar,
  } = useRecurringActions({
    commercialRates,
    markRecurringPaidOptimistic,
    createTransaction,
    invalidateRecurring,
    invalidateRadar,
    openEditRecurring,
    closeRecurringModal,
  });

  // 9. Хендлери операцій
  const [spentWhole, spentCents] = totalSpent
    .toLocaleString("uk-UA", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
    .split(",");

  const handlePrevMonth = () => {
    setSelectedDate(
      (prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1)
    );
  };

  const handleNextMonth = () => {
    setSelectedDate(
      (prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1)
    );
  };

  const handleSaveBudgetLimit = async (newLimit: number) => {
    if (!activeCycle?.id) return;
    updateActiveCycleLimitOptimistic(newLimit);
    try {
      const res = await fetch("/api/cycles", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cycleId: activeCycle.id, limit: newLimit }),
      });
      if (!res.ok) throw new Error("Не вдалося оновити ліміт на сервері");
    } catch (error) {
      console.error("Помилка збереження бюджету:", error);
      invalidateCycles();
    }
  };

  const handleUpdateCategory = (
    txId: number,
    newCategory: string,
    cleanTitle?: string,
    saveAsRule?: boolean
  ) => {
    setSelectedTx(null);
    updateTransaction({
      id: txId,
      category_name: newCategory,
      merchant_raw: selectedTx?.merchant_raw,
      clean_title: cleanTitle,
      save_as_rule: saveAsRule,
    });
  };

  const handleUpdateTags = (txId: number, newTags: string[]) => {
    updateTransaction({
      id: txId,
      tags: newTags,
    });
  };

  const handleDeleteTransaction = (txId: number) => {
    setSelectedTx(null);
    deleteTransaction(txId, {
      onError: (err) => {
        console.error("Помилка видалення транзакції:", err);
      },
    });
  };

  const handleSaveCategoryBudget = async (
    categoryName: string,
    limit: number
  ) => {
    updateCategoryBudgetOptimistic(categoryName, limit);
    try {
      await fetch("/api/category-budgets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category_name: categoryName,
          monthly_limit: limit,
        }),
      });
    } catch (err) {
      console.error("Помилка збереження ліміту категорії:", err);
      invalidateWealth();
    }
  };

  const handleDeleteCategoryBudget = async (categoryName: string) => {
    deleteCategoryBudgetOptimistic(categoryName);
    try {
      await fetch(
        `/api/category-budgets?category_name=${encodeURIComponent(categoryName)}`,
        { method: "DELETE" }
      );
    } catch (err) {
      console.error("Помилка видалення ліміту категорії:", err);
      invalidateWealth();
    }
  };

  const handleExportExcel = async () => {
    try {
      const { exportFinancialDataToExcel } = await import("@/lib/export-excel");
      exportFinancialDataToExcel({
        transactions,
        investments,
        savingsGoals,
      });
    } catch (err) {
      console.error("Помилка експорту в Excel:", err);
    }
  };

  const handleRestoreSuccess = async () => {
    invalidateCycles();
    invalidateWealth();
    window.location.reload();
  };

  const handleSplitSuccess = async () => {
    invalidateWealth();
    invalidateTransactions();
    window.location.reload();
  };

  // Екран автентифікації, якщо користувач не залогінений
  if (!isAuthenticated) {
    return (
      <PinAuthScreen
        isLoading={isAuthenticated === null}
        pinInput={pinInput}
        onPinChange={setPinInput}
        pinError={pinError}
        isVerifyingPin={isVerifyingPin}
        onLogin={handleLogin}
        onBiometricLogin={handleBiometricLogin}
        isBiometricSupported={isBiometricSupported}
        isOnline={isOnline}
      />
    );
  }

  return (
    <main className="mx-auto min-h-screen max-w-screen-2xl px-4 pt-[calc(env(safe-area-inset-top)+1rem)] pb-[calc(5.5rem+env(safe-area-inset-bottom))] font-sans text-white antialiased sm:px-8 md:pt-10 md:pb-[calc(1.5rem+env(safe-area-inset-bottom))] lg:px-12">
      <Suspense fallback={null}>
        <QuickActionsListener onAddExpense={openCreateExpense} />
      </Suspense>

      {/* Офлайн банер та черга несинхронізованих транзакцій */}
      <OfflineBanner onSync={syncQueue} isSyncing={isSyncing} />

      {/* 1. Компактний навігатор періодів */}
      <PeriodNav
        monthLabel={monthLabel}
        onPrevMonth={handlePrevMonth}
        onNextMonth={handleNextMonth}
      />

      {/* 2. Головна шапка підсумку витрат та меню */}
      <BudgetSummaryHeader
        spentWhole={spentWhole}
        spentCents={spentCents}
        recurringTotal={recurringTotal}
        transactionCount={filteredTransactions.length}
        onOpenNewCycle={openCycleModal}
        onOpenImport={() => openImportModal("expense")}
        onRegisterDevice={handleRegisterDevice}
        onLogout={handleLogout}
        onExportExcel={handleExportExcel}
        onRestoreSuccess={handleRestoreSuccess}
        onOpenTrash={openTrash}
        onOpenMerchantRules={openMerchantRules}
      />

      {/* 3. Картка місячного ліміту бюджету */}
      <BudgetLimitCard
        effectiveLimit={effectiveLimit}
        budgetMetrics={budgetMetrics}
        onSaveBudget={handleSaveBudgetLimit}
      />

      {/* Навігація між вкладками: Аналітика & Бюджет -> Історія операцій -> Капітал & Цілі */}
      <div className="mb-6 hidden rounded-2xl border border-zinc-800 bg-zinc-900/80 p-1 backdrop-blur-md md:flex">
        <button
          type="button"
          onClick={() => setActiveTab("overview")}
          className={`flex-1 rounded-xl py-2 text-xs font-semibold transition-all ${
            activeTab === "overview"
              ? "bg-zinc-800 text-white shadow-md"
              : "text-zinc-400 hover:text-white"
          }`}
        >
          Аналітика & Бюджет
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("history")}
          className={`flex-1 rounded-xl py-2 text-xs font-semibold transition-all ${
            activeTab === "history"
              ? "bg-zinc-800 text-white shadow-md"
              : "text-zinc-400 hover:text-white"
          }`}
        >
          Історія операцій
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("wealth")}
          className={`flex-1 rounded-xl py-2 text-xs font-semibold transition-all ${
            activeTab === "wealth"
              ? "bg-zinc-800 text-white shadow-md"
              : "text-zinc-400 hover:text-white"
          }`}
        >
          Капітал & Цілі
        </button>
      </div>

      {/* Вкладка 1: Аналітика & Бюджет */}
      {activeTab === "overview" && (
        <DashboardOverviewTab
          dailyStats={dailyStats}
          categoryStats={categoryStats}
          categoryBudgets={categoryBudgets}
          onSelectCategory={setSelectedCategory}
          onSaveCategoryBudget={handleSaveCategoryBudget}
          onDeleteCategoryBudget={handleDeleteCategoryBudget}
          recurring={recurring}
          radarData={radarData}
          isLoadingRadar={isLoadingRadar}
          onAddRecurring={openAddRecurring}
          onEditRecurring={openEditRecurring}
          onExecuteRecurring={handleExecuteRecurring}
          onAddDetectedFromRadar={handleAddDetectedFromRadar}
          onDismissDetectedFromRadar={handleDismissDetectedFromRadar}
          filteredTransactions={filteredTransactions}
          effectiveLimit={effectiveLimit}
          recurringTotal={recurringTotal}
          selectedMonthKey={selectedMonthKey}
          commercialRates={commercialRates}
          activeCycle={activeCycle}
          cycleCurrentTransactions={cycleCurrentTransactions}
          cyclePreviousTransactions={cyclePreviousTransactions}
          cycleCurrentLabel={cycleCurrentLabel}
          cyclePreviousLabel={cyclePreviousLabel}
          aiAnalysis={aiAnalysis}
          isAiLoading={isAiLoading}
          budgetMetrics={budgetMetrics}
          selectedAiModel={selectedAiModel}
          onModelChange={(model) => {
            setSelectedAiModel(model);
            handleRunAiAnalysis(model);
          }}
          onRunAiAnalysis={handleRunAiAnalysis}
        />
      )}

      {/* Вкладка 2: Історія операцій */}
      {activeTab === "history" && (
        <DashboardHistoryTab
          filteredTransactions={filteredTransactions}
          displayedTransactions={displayedTransactions}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          availableTags={availableTags}
          activeTag={activeTag}
          onTagChange={setActiveTag}
          onOpenCreateExpense={openCreateExpense}
          onSelectTransaction={setSelectedTx}
          onDeleteTransaction={handleDeleteTransaction}
          onOpenSplitTransaction={(tx) => setSplitTx(tx)}
          onOpenTrash={openTrash}
          onOpenMerchantRules={openMerchantRules}
          onOpenTagProject={setSelectedProjectTag}
          periodLabel={activeCycle?.name || monthLabel}
        />
      )}

      {/* Вкладка 3: Капітал & Цілі */}
      {activeTab === "wealth" && (
        <DashboardWealthTab
          investments={investments}
          savingsGoals={savingsGoals}
          commercialRates={commercialRates}
          totalSpent={totalSpent}
          effectiveLimit={effectiveLimit}
          onRefreshWealth={invalidateWealth}
          wishlistItems={wishlistItems}
          wishlistSavedAmount={wishlistSavedAmount}
          costPerUseItems={costPerUseItems}
          costPerUseSavedAmount={costPerUseSavedAmount}
          prefillCostPerUse={prefillCostPerUse}
          setPrefillCostPerUse={setPrefillCostPerUse}
          capitalTransactions={capitalTransactions}
          onSelectTransaction={setSelectedTx}
          onAddCapital={openCreateExpense}
          onOpenImportInvestment={() => openImportModal("investment")}
        />
      )}

      {/* Глобальні модальні вікна та шторки */}
      <DashboardModals
        selectedCategory={selectedCategory}
        filteredTransactions={filteredTransactions}
        onCloseCategory={() => setSelectedCategory(null)}
        selectedProjectTag={selectedProjectTag}
        transactions={transactions}
        onCloseProjectTag={() => setSelectedProjectTag(null)}
        isCreateExpenseOpen={isCreateExpenseOpen}
        onCloseCreateExpense={closeCreateExpense}
        isAddingRecurring={isAddingRecurring}
        editingRecurring={editingRecurring}
        onCloseRecurring={closeRecurringModal}
        onSaveRecurring={handleSaveRecurring}
        onDeleteRecurring={handleDeleteRecurring}
        selectedTx={selectedTx}
        onCloseSelectedTx={() => setSelectedTx(null)}
        onUpdateCategory={handleUpdateCategory}
        onUpdateTags={handleUpdateTags}
        onDeleteTransaction={handleDeleteTransaction}
        onOpenSplit={(tx) => setSplitTx(tx)}
        onOpenTagProject={setSelectedProjectTag}
        onReceiptUpdated={() => {
          invalidateTransactions();
          invalidateInvestmentTransactions();
        }}
        onUpdateTransaction={(payload) => {
          setSelectedTx(null);
          updateTransaction(payload);
        }}
        splitTx={splitTx}
        onCloseSplit={() => setSplitTx(null)}
        onSplitSuccess={handleSplitSuccess}
        isCycleModalOpen={isCycleModalOpen}
        onCloseCycleModal={closeCycleModal}
        activeCycle={activeCycle}
        effectiveLimit={effectiveLimit}
        onCycleStarted={invalidateCycles}
        isAiDrawerOpen={isAiDrawerOpen}
        onCloseAiDrawer={closeAiDrawer}
        aiAnalysis={aiAnalysis}
        isAiLoading={isAiLoading}
        selectedAiModel={selectedAiModel}
        onAiModelChange={(model) => {
          setSelectedAiModel(model);
          handleRunAiAnalysis(model);
        }}
        onAiReanalyze={() => handleRunAiAnalysis(selectedAiModel)}
        aiInitialPrompt={aiInitialPrompt}
        aiFinancialContext={aiFinancialContext}
        isImportModalOpen={isImportModalOpen}
        onCloseImportModal={closeImportModal}
        onImportSuccess={() => {
          closeImportModal();
          invalidateTransactions();
          invalidateInvestmentTransactions();
          invalidateWealth();
        }}
        investments={investments}
        importModalType={importModalType}
        onInvestmentsChange={invalidateWealth}
        isInzhurImportOpen={isInzhurImportOpen}
        onCloseInzhurImport={closeInzhurImport}
        onInzhurSuccess={() => {
          invalidateTransactions();
          invalidateInvestmentTransactions();
          invalidateWealth();
        }}
        isTrashOpen={isTrashOpen}
        onCloseTrash={closeTrash}
        isMerchantRulesOpen={isMerchantRulesOpen}
        onCloseMerchantRules={closeMerchantRules}
        onSelectTransaction={setSelectedTx}
      />

      {/* Ергономічна мобільна панель дій під великий палець */}
      <MobileBottomBar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        onAddExpense={openCreateExpense}
        onOpenAi={() => openAiDrawer()}
      />
    </main>
  );
}
