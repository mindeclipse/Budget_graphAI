import {
  BudgetCycle,
  Transaction,
  InvestmentAsset,
  SavingsGoal,
} from "@/types/finance";

interface UseDashboardOperationsProps {
  activeCycle?: BudgetCycle | null;
  updateActiveCycleLimitOptimistic: (newLimit: number) => void;
  invalidateCycles: () => void;
  updateCategoryBudgetOptimistic: (categoryName: string, limit: number) => void;
  deleteCategoryBudgetOptimistic: (categoryName: string) => void;
  invalidateWealth: () => void;
  invalidateTransactions: () => void;
  selectedTx: Transaction | null;
  setSelectedTx: (tx: Transaction | null) => void;
  updateTransaction: (payload: any) => void;
  deleteTransaction: (id: number, options?: any) => void;
  transactions: Transaction[];
  investments: InvestmentAsset[];
  savingsGoals: SavingsGoal[];
}

export function useDashboardOperations({
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
}: UseDashboardOperationsProps) {
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
      onError: (err: any) => {
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

  return {
    handleSaveBudgetLimit,
    handleUpdateCategory,
    handleUpdateTags,
    handleDeleteTransaction,
    handleSaveCategoryBudget,
    handleDeleteCategoryBudget,
    handleExportExcel,
    handleRestoreSuccess,
    handleSplitSuccess,
  };
}
