"use client";

import { useEffect, useState, useMemo, Suspense } from "react";
import { useAuthSession } from "@/hooks/useAuthSession";
import { useFinanceQueries } from "@/hooks/useFinanceQueries";
import { useBudgetMetrics } from "@/hooks/useBudgetMetrics";
import { useTransactionMutations } from "@/hooks/useTransactionMutations";

import { PinAuthScreen } from "@/components/auth/PinAuthScreen";
import { PeriodNav } from "@/components/dashboard/PeriodNav";
import { BudgetSummaryHeader } from "@/components/dashboard/BudgetSummaryHeader";
import { BudgetLimitCard } from "@/components/dashboard/BudgetLimitCard";
import { DailyDynamicsChart } from "@/components/dashboard/DailyDynamicsChart";
import { CategoryBreakdown } from "@/components/dashboard/CategoryBreakdown";
import { AICard } from "@/components/dashboard/AICard";
import { TransactionsList } from "@/components/dashboard/TransactionsList";
import { RecurringSection } from "@/components/dashboard/RecurringSection";

import { BurnRateChart } from "@/components/BurnRateChart";
import { MoMComparison } from "@/components/MoMComparison";
import { CategoryDetailModal } from "@/components/CategoryDetailModal";
import { CreateTransactionDrawer } from "@/components/CreateTransactionDrawer";
import { RecurringModal } from "@/components/RecurringModal";
import { TransactionActionSheet } from "@/components/TransactionActionSheet";
import { NewCycleModal } from "@/components/NewCycleModal";
import { AIAnalysisDrawer } from "@/components/AIAnalysisDrawer";
import { CsvImportModal } from "@/components/CsvImportModal";
import { QuickActionsListener } from "@/components/QuickActionsListener";

import { Transaction, RecurringItem } from "@/types/finance";
import {
  AIAnalysisResponse,
  SupportedGeminiModel,
  AIAnalysisRequest,
} from "@/types/ai";

const DEFAULT_USD_RATE = 44.5;

export default function Dashboard() {
  // 1. Автентифікація та сесія
  const {
    isAuthenticated,
    isVerifyingPin,
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
    recurring,
    invalidateRecurring,
  } = useFinanceQueries(isAuthenticated);

  // Відфільтровуємо транзакції, виключені з бюджету
  const transactions = useMemo(() => {
    return rawTransactions.filter((t: Transaction) => !t.exclude_from_budget);
  }, [rawTransactions]);

  // 3. Стан тайтлів і розрахункових періодів
  const [activeTab, setActiveTab] = useState<"overview" | "history">(
    "overview"
  );
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [activeCycle, setActiveCycle] = useState<any>(null);
  const [previousCycle, setPreviousCycle] = useState<any>(null);

  // 4. Оптимістичні мутації транзакцій
  const { updateTransaction, createTransaction, deleteTransaction } =
    useTransactionMutations();

  // Завантаження розрахункових циклів
  const loadCycles = async () => {
    try {
      const res = await fetch("/api/cycles");
      const data = await res.json();
      if (data.activeCycle) {
        setActiveCycle(data.activeCycle);
      }
      if (Array.isArray(data.cycles) && data.cycles.length > 0) {
        const activeIdx = data.cycles.findIndex(
          (c: any) => c.id === data.activeCycle?.id || c.is_active
        );
        const prev =
          activeIdx !== -1
            ? data.cycles[activeIdx + 1] || null
            : data.cycles[1] || null;
        setPreviousCycle(prev);
      }
    } catch (e) {
      console.error("Failed to load cycles:", e);
    }
  };

  useEffect(() => {
    loadCycles();
  }, []);

  // 5. Розрахунок аналітичних показників через кастомний хук
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

    const currentStart = new Date(activeCycle.start_date).getTime();
    const currentEnd = activeCycle.end_date
      ? new Date(activeCycle.end_date).getTime()
      : Infinity;

    const curr = transactions.filter((t: any) => {
      const txTime = new Date(t.created_at).getTime();
      return txTime >= currentStart && txTime <= currentEnd;
    });

    let prev: any[] = [];
    if (previousCycle) {
      const prevStart = new Date(previousCycle.start_date).getTime();
      const prevEnd = previousCycle.end_date
        ? new Date(previousCycle.end_date).getTime()
        : currentStart;

      prev = transactions.filter((t: any) => {
        const txTime = new Date(t.created_at).getTime();
        return txTime >= prevStart && txTime < prevEnd;
      });
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

  // 6. Керування AI-аналізом
  const [isAiDrawerOpen, setIsAiDrawerOpen] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState<AIAnalysisResponse | null>(null);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [selectedAiModel, setSelectedAiModel] =
    useState<SupportedGeminiModel>("gemini-3.5-flash");

  const handleRunAiAnalysis = async (modelToUse = selectedAiModel) => {
    setIsAiDrawerOpen(true);
    setIsAiLoading(true);

    try {
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

  // 7. Пошук та теги для історії
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTag, setActiveTag] = useState<string | null>(null);

  const availableTags = useMemo<string[]>(() => {
    const tagsSet = new Set<string>();
    filteredTransactions.forEach((tx) => {
      tx.tags?.forEach((tag: string) => tagsSet.add(tag));
    });
    return Array.from(tagsSet);
  }, [filteredTransactions]);

  const displayedTransactions = useMemo(() => {
    return filteredTransactions.filter((t) => {
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch =
        q === "" ||
        t.merchant_raw?.toLowerCase().includes(q) ||
        t.category_name?.toLowerCase().includes(q) ||
        String(t.amount).includes(q) ||
        t.tags?.some((tag) => tag.toLowerCase().includes(q));

      const matchesTag = !activeTag || (t.tags && t.tags.includes(activeTag));

      return matchesSearch && matchesTag;
    });
  }, [filteredTransactions, searchQuery, activeTag]);

  // 8. Стан модальних вікон
  const [isCycleModalOpen, setIsCycleModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isCreateExpenseOpen, setIsCreateExpenseOpen] = useState(false);
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [isAddingRecurring, setIsAddingRecurring] = useState(false);
  const [editingRecurring, setEditingRecurring] =
    useState<RecurringItem | null>(null);
  const [isExecutingRecurring, setIsExecutingRecurring] = useState<
    number | null
  >(null);

  // Форматування суми для заголовка
  const [spentWhole, spentCents] = totalSpent
    .toLocaleString("uk-UA", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
    .split(",");

  // Перемикання місяців
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

  // Збереження ліміту активного циклу
  const handleSaveBudgetLimit = async (newLimit: number) => {
    if (!activeCycle?.id) return;

    setActiveCycle((prev: any) =>
      prev ? { ...prev, budget_limit: newLimit } : prev
    );

    try {
      const res = await fetch("/api/cycles", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cycleId: activeCycle.id, limit: newLimit }),
      });

      if (!res.ok) throw new Error("Не вдалося оновити ліміт на сервері");
    } catch (error) {
      console.error("Помилка збереження бюджету:", error);
      if (activeCycle?.budget_limit) {
        setActiveCycle((prev: any) => ({ ...prev }));
      }
    }
  };

  // Керування регулярними платежами
  const handleSaveRecurring = async (formData: {
    id?: number;
    title: string;
    amount: number;
    currency: "UAH" | "USD";
    category_name: string;
    day_of_month: number;
  }) => {
    try {
      if (formData.id) {
        const res = await fetch("/api/recurring", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(formData),
        });
        if (!res.ok) throw new Error("Помилка оновлення шаблону");
      } else {
        const newItem = { ...formData, is_active: true };
        const res = await fetch("/api/recurring", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(newItem),
        });
        if (!res.ok) throw new Error("Помилка створення шаблону");
      }

      invalidateRecurring();
      setIsAddingRecurring(false);
      setEditingRecurring(null);
    } catch (err) {
      console.error("Помилка збереження регулярного платежу:", err);
    }
  };

  const handleDeleteRecurring = async (id: number) => {
    await fetch(`/api/recurring?id=${id}`, { method: "DELETE" });
    invalidateRecurring();
    setIsAddingRecurring(false);
    setEditingRecurring(null);
  };

  const handleExecuteRecurring = async (item: RecurringItem) => {
    if (isExecutingRecurring === item.id) return;
    setIsExecutingRecurring(item.id);

    try {
      const isUsd = item.currency === "USD";
      let finalAmount = Number(item.amount);
      let merchantTitle = item.title;

      if (isUsd) {
        const rateRes = await fetch("/api/currency/rate").catch(() => null);
        const rateData = rateRes?.ok
          ? await rateRes.json()
          : { rate: DEFAULT_USD_RATE };
        finalAmount = Math.round(Number(item.amount) * rateData.rate);
        merchantTitle = `${item.title} ($${item.amount})`;
      }

      const newTx = {
        amount: finalAmount,
        currency: "UAH" as const,
        merchant_raw: merchantTitle,
        category_name: item.category_name,
        source: "recurring" as const,
        type: "expense" as const,
      };

      createTransaction(newTx, {
        onError: (err: any) => {
          console.error("Помилка списання регулярного платежу:", err);
        },
      });
    } catch (err) {
      console.error("Помилка підготовки транзакції:", err);
    } finally {
      setIsExecutingRecurring(null);
    }
  };

  // Мутації транзакцій
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
      />
    );
  }

  return (
    <main className="mx-auto min-h-screen max-w-screen-2xl px-4 pt-[calc(env(safe-area-inset-top)+1rem)] pb-[calc(6rem+env(safe-area-inset-bottom))] font-sans text-white antialiased sm:px-8 md:pt-10 lg:px-12">
      <Suspense fallback={null}>
        <QuickActionsListener
          onAddExpense={() => setIsCreateExpenseOpen(true)}
        />
      </Suspense>

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
        onOpenNewCycle={() => setIsCycleModalOpen(true)}
        onOpenImport={() => setIsImportModalOpen(true)}
        onRegisterDevice={handleRegisterDevice}
        onLogout={handleLogout}
      />

      {/* 3. Картка місячного ліміту бюджету */}
      <BudgetLimitCard
        effectiveLimit={effectiveLimit}
        budgetMetrics={budgetMetrics}
        onSaveBudget={handleSaveBudgetLimit}
      />

      {/* Мобільні таби */}
      <div className="mb-6 flex rounded-xl border border-zinc-800 bg-zinc-900/80 p-1 md:hidden">
        <button
          type="button"
          onClick={() => setActiveTab("overview")}
          className={`flex-1 rounded-lg py-2 text-xs font-semibold transition-all ${
            activeTab === "overview"
              ? "bg-zinc-800 text-white shadow"
              : "text-zinc-400 hover:text-white"
          }`}
        >
          Аналітика
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("history")}
          className={`flex-1 rounded-lg py-2 text-xs font-semibold transition-all ${
            activeTab === "history"
              ? "bg-zinc-800 text-white shadow"
              : "text-zinc-400 hover:text-white"
          }`}
        >
          Історія ({filteredTransactions.length})
        </button>
      </div>

      {/* Основна сітка */}
      <div className="grid grid-cols-1 items-start gap-6 md:grid-cols-12">
        {/* ЛІВА КОЛОНКА (Аналітика) */}
        <section
          className={`space-y-6 md:col-span-7 ${
            activeTab === "overview" ? "block" : "hidden md:block"
          }`}
        >
          <DailyDynamicsChart dailyStats={dailyStats} />

          <CategoryBreakdown
            categoryStats={categoryStats}
            onSelectCategory={setSelectedCategory}
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
            onOpenAiDrawer={() => handleRunAiAnalysis()}
          />
        </section>

        {/* ПРАВА КОЛОНКА (Історія та Постійні витрати) */}
        <section
          className={`space-y-6 md:col-span-5 ${
            activeTab === "history" ? "block" : "hidden md:block"
          }`}
        >
          <TransactionsList
            totalMonthTransactionsCount={filteredTransactions.length}
            displayedTransactions={displayedTransactions}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            availableTags={availableTags}
            activeTag={activeTag}
            onTagChange={setActiveTag}
            onOpenCreateExpense={() => setIsCreateExpenseOpen(true)}
            onSelectTransaction={setSelectedTx}
          />

          <RecurringSection
            recurring={recurring}
            onAddRecurring={() => {
              setEditingRecurring(null);
              setIsAddingRecurring(true);
            }}
            onEditRecurring={(item) => {
              setEditingRecurring(item);
              setIsAddingRecurring(true);
            }}
            onExecuteRecurring={handleExecuteRecurring}
          />

          <div>
            <BurnRateChart
              transactions={filteredTransactions}
              budgetLimit={effectiveLimit}
              recurringTotal={recurringTotal}
              selectedMonthKey={selectedMonthKey}
              recurring={recurring}
            />
          </div>
        </section>
      </div>

      {/* Глобальні модальні вікна та шторки */}
      <CategoryDetailModal
        categoryName={selectedCategory}
        transactions={filteredTransactions}
        onClose={() => setSelectedCategory(null)}
        onSelectTransaction={setSelectedTx}
      />

      <CreateTransactionDrawer
        isOpen={isCreateExpenseOpen}
        onClose={() => setIsCreateExpenseOpen(false)}
      />

      <RecurringModal
        isOpen={isAddingRecurring}
        item={editingRecurring}
        onClose={() => setIsAddingRecurring(false)}
        onSave={handleSaveRecurring}
        onDelete={handleDeleteRecurring}
      />

      <TransactionActionSheet
        transaction={selectedTx}
        onClose={() => setSelectedTx(null)}
        onUpdateCategory={handleUpdateCategory}
        onUpdateTags={handleUpdateTags}
        onDelete={handleDeleteTransaction}
      />

      <NewCycleModal
        isOpen={isCycleModalOpen}
        onClose={() => setIsCycleModalOpen(false)}
        defaultLimit={activeCycle?.budget_limit || effectiveLimit || 35000}
        onCycleStarted={loadCycles}
      />

      <AIAnalysisDrawer
        isOpen={isAiDrawerOpen}
        onClose={() => setIsAiDrawerOpen(false)}
        analysis={aiAnalysis}
        isLoading={isAiLoading}
        selectedModel={selectedAiModel}
        onModelChange={(model) => {
          setSelectedAiModel(model);
          handleRunAiAnalysis(model);
        }}
        onReanalyze={() => handleRunAiAnalysis(selectedAiModel)}
      />

      <CsvImportModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        onSuccess={() => {
          setIsImportModalOpen(false);
          window.location.reload();
        }}
      />
    </main>
  );
}
