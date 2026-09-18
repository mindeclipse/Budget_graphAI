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
import { useCycleComparison } from "@/hooks/useCycleComparison";
import { useDashboardOperations } from "@/hooks/useDashboardOperations";

import { PinAuthScreen } from "@/components/auth/PinAuthScreen";
import { OfflineBanner } from "@/components/dashboard/OfflineBanner";
import { PeriodNav } from "@/components/dashboard/PeriodNav";
import { BudgetSummaryHeader } from "@/components/dashboard/BudgetSummaryHeader";
import { BudgetLimitCard } from "@/components/dashboard/BudgetLimitCard";
import { DashboardModals } from "@/components/dashboard/DashboardModals";
import { MobileBottomBar } from "@/components/dashboard/MobileBottomBar";
import { QuickActionsListener } from "@/components/QuickActionsListener";
import { ShareTargetListener } from "@/components/ShareTargetListener";
import { TabNavigationHeader } from "@/components/dashboard/tabs/TabNavigationHeader";

import { DashboardOverviewTab } from "@/components/dashboard/tabs/DashboardOverviewTab";
import { DashboardHistoryTab } from "@/components/dashboard/tabs/DashboardHistoryTab";
import { DashboardWealthTab } from "@/components/dashboard/tabs/DashboardWealthTab";

import {
  Transaction,
  SavingsGoal,
  InvestmentAsset,
  WishlistItem,
  CostPerUseItem,
} from "@/types/finance";

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
    activeCycle,
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
    importModalFile,
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
  } = useCycleComparison({
    cycles,
    activeCycle,
    transactions,
    monthTransactions,
    previousMonthTransactions,
    monthLabel,
  });

  // 8. Бізнес-логіка операцій дашборду
  const {
    handleSaveBudgetLimit,
    handleUpdateCategory,
    handleUpdateTags,
    handleDeleteTransaction,
    handleSaveCategoryBudget,
    handleDeleteCategoryBudget,
    handleExportExcel,
    handleRestoreSuccess,
    handleSplitSuccess,
  } = useDashboardOperations({
    activeCycle,
    updateActiveCycleLimitOptimistic,
    invalidateCycles,
    updateCategoryBudgetOptimistic,
    deleteCategoryBudgetOptimistic,
    invalidateWealth,
    invalidateTransactions,
    selectedTx,
    setSelectedTx,
    updateTransaction,
    deleteTransaction,
    transactions,
    investments,
    savingsGoals,
  });

  // 9. Виділені хуки бізнес-логіки
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

  // Форматування відображення витрат
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
        <ShareTargetListener
          onOpenReceipt={(file) => openImportModal("expense", file)}
        />
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

      {/* Навігація між вкладками для десктопу */}
      <TabNavigationHeader activeTab={activeTab} onTabChange={setActiveTab} />

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
        importModalFile={importModalFile}
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
