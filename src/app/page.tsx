"use client";

import {
  useEffect,
  useState,
  useMemo,
  Suspense,
  useDeferredValue,
} from "react";
import dynamic from "next/dynamic";
import { useAuthSession } from "@/hooks/useAuthSession";
import { useFinanceQueries } from "@/hooks/useFinanceQueries";
import { useBudgetMetrics } from "@/hooks/useBudgetMetrics";
import { useTransactionMutations } from "@/hooks/useTransactionMutations";

import { PinAuthScreen } from "@/components/auth/PinAuthScreen";
import { OfflineBanner } from "@/components/dashboard/OfflineBanner";
import { PeriodNav } from "@/components/dashboard/PeriodNav";
import { BudgetSummaryHeader } from "@/components/dashboard/BudgetSummaryHeader";
import { BudgetLimitCard } from "@/components/dashboard/BudgetLimitCard";
import { DailyDynamicsChart } from "@/components/dashboard/DailyDynamicsChart";
import { CategoryBreakdown } from "@/components/dashboard/CategoryBreakdown";
import { AICard } from "@/components/dashboard/AICard";
import { TransactionsList } from "@/components/dashboard/TransactionsList";
import { RecurringSection } from "@/components/dashboard/RecurringSection";
import { SavingsGoalsCard } from "@/components/dashboard/SavingsGoalsCard";
import { InvestmentsCard } from "@/components/dashboard/InvestmentsCard";
import { WishlistCard } from "@/components/dashboard/WishlistCard";
import { CostPerUseCard } from "@/components/dashboard/CostPerUseCard";
import { CapitalHistoryCard } from "@/components/dashboard/CapitalHistoryCard";
import { HistorySidebar } from "@/components/dashboard/HistorySidebar";
import { exportFinancialDataToExcel } from "@/lib/export-excel";
import { DetectedSubscription } from "@/lib/subscription-radar";

import { BurnRateChart } from "@/components/BurnRateChart";
import { MoMComparison } from "@/components/MoMComparison";
import { QuickActionsListener } from "@/components/QuickActionsListener";

// Dynamic Code Splitting для важких модальних вікон
const CategoryDetailModal = dynamic(
  () =>
    import("@/components/CategoryDetailModal").then(
      (m) => m.CategoryDetailModal
    ),
  { ssr: false }
);
const CreateTransactionDrawer = dynamic(
  () =>
    import("@/components/CreateTransactionDrawer").then(
      (m) => m.CreateTransactionDrawer
    ),
  { ssr: false }
);
const RecurringModal = dynamic(
  () => import("@/components/RecurringModal").then((m) => m.RecurringModal),
  { ssr: false }
);
const TransactionActionSheet = dynamic(
  () =>
    import("@/components/TransactionActionSheet").then(
      (m) => m.TransactionActionSheet
    ),
  { ssr: false }
);
const SplitTransactionModal = dynamic(
  () =>
    import("@/components/SplitTransactionModal").then(
      (m) => m.SplitTransactionModal
    ),
  { ssr: false }
);
const NewCycleModal = dynamic(
  () => import("@/components/NewCycleModal").then((m) => m.NewCycleModal),
  { ssr: false }
);
const AIAnalysisDrawer = dynamic(
  () => import("@/components/AIAnalysisDrawer").then((m) => m.AIAnalysisDrawer),
  { ssr: false }
);
const CsvImportModal = dynamic(
  () => import("@/components/CsvImportModal").then((m) => m.CsvImportModal),
  { ssr: false }
);
const TrashModal = dynamic(
  () => import("@/components/TrashModal").then((m) => m.TrashModal),
  { ssr: false }
);
const MerchantRulesModal = dynamic(
  () =>
    import("@/components/MerchantRulesModal").then((m) => m.MerchantRulesModal),
  { ssr: false }
);

import {
  Transaction,
  RecurringItem,
  SavingsGoal,
  InvestmentAsset,
  WishlistItem,
  CostPerUseItem,
} from "@/types/finance";
import {
  AIAnalysisResponse,
  SupportedGeminiModel,
  AIAnalysisRequest,
} from "@/types/ai";

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
    radar: radarData,
    isLoadingRadar,
    invalidateRadar,
  } = useFinanceQueries(isAuthenticated);

  // Відфільтровуємо транзакції, виключені з бюджету
  const transactions = useMemo(() => {
    return rawTransactions.filter((t: Transaction) => !t.exclude_from_budget);
  }, [rawTransactions]);

  // 3. Стан тайтлів і розрахункових періодів
  const [activeTab, setActiveTab] = useState<"overview" | "wealth" | "history">(
    "overview"
  );
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [activeCycle, setActiveCycle] = useState<any>(null);
  const [previousCycle, setPreviousCycle] = useState<any>(null);

  // Стан для розширених фінансових можливостей
  const [savingsGoals, setSavingsGoals] = useState<SavingsGoal[]>([]);
  const [investments, setInvestments] = useState<InvestmentAsset[]>([]);
  const [categoryBudgets, setCategoryBudgets] = useState<
    Record<string, number>
  >({});
  const [commercialRates, setCommercialRates] = useState<{
    USD: number;
    EUR: number;
    PLN: number;
  }>({
    USD: 41.5,
    EUR: 45.3,
    PLN: 10.6,
  });
  const [splitTx, setSplitTx] = useState<Transaction | null>(null);

  // Стан для усвідомлених покупок (Wishlist & Cost-per-Use)
  const [wishlistItems, setWishlistItems] = useState<WishlistItem[]>([]);
  const [wishlistSavedAmount, setWishlistSavedAmount] = useState<number>(0);
  const [costPerUseItems, setCostPerUseItems] = useState<CostPerUseItem[]>([]);
  const [costPerUseSavedAmount, setCostPerUseSavedAmount] = useState<number>(0);
  const [prefillCostPerUse, setPrefillCostPerUse] =
    useState<Partial<CostPerUseItem> | null>(null);

  // 4. Оптимістичні мутації транзакцій
  const {
    updateTransaction,
    createTransaction,
    deleteTransaction,
    syncQueue,
    isSyncing,
  } = useTransactionMutations();

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

  // Завантаження скарбничок, інвестицій, лімітів категорій, курсів валют та усвідомлених покупок
  const loadWealthData = async () => {
    try {
      const [
        goalsRes,
        investRes,
        catBudgetsRes,
        ratesRes,
        wishlistRes,
        costPerUseRes,
      ] = await Promise.all([
        fetch("/api/savings-goals").catch(() => null),
        fetch("/api/investments").catch(() => null),
        fetch("/api/category-budgets").catch(() => null),
        fetch("/api/currency/rate").catch(() => null),
        fetch("/api/wishlist").catch(() => null),
        fetch("/api/cost-per-use").catch(() => null),
      ]);

      if (goalsRes?.ok) {
        const data = await goalsRes.json();
        setSavingsGoals(data.goals || []);
      }
      if (investRes?.ok) {
        const data = await investRes.json();
        setInvestments(data.investments || []);
      }
      if (catBudgetsRes?.ok) {
        const data = await catBudgetsRes.json();
        const map: Record<string, number> = {};
        (data.budgets || []).forEach((b: any) => {
          map[b.category_name] = Number(b.monthly_limit);
        });
        setCategoryBudgets(map);
      }
      if (ratesRes?.ok) {
        const data = await ratesRes.json();
        if (data.rates) {
          setCommercialRates(data.rates);
        }
      }
      if (wishlistRes?.ok) {
        const data = await wishlistRes.json();
        setWishlistItems(data.items || []);
        if (data.metrics?.saved_amount !== undefined) {
          setWishlistSavedAmount(data.metrics.saved_amount);
        }
      }
      if (costPerUseRes?.ok) {
        const data = await costPerUseRes.json();
        setCostPerUseItems(data.items || []);
        if (data.metrics?.total_money_saved !== undefined) {
          setCostPerUseSavedAmount(data.metrics.total_money_saved);
        }
      }
    } catch (err) {
      console.error("Failed to load wealth data:", err);
    }
  };

  useEffect(() => {
    if (isAuthenticated) {
      loadCycles();
      loadWealthData();
    }
  }, [isAuthenticated]);

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
  const [aiInitialPrompt, setAiInitialPrompt] = useState<string | undefined>(
    undefined
  );

  const aiFinancialContext = useMemo(() => {
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
        .map((s) => ({
          title: s.title,
          amount: s.amount,
          daysRemaining: s.days_remaining,
        })),
      wishlistCount: coolingCount,
      wishlistPendingAmount: pendingAmount,
      savedImpulseAmount: wishlistSavedAmount,
      costPerUseCount: costPerUseItems.length,
      costPerUseTotalSaved: costPerUseSavedAmount,
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
  ]);

  const handleRunAiAnalysis = async (
    modelToUse = selectedAiModel,
    initialPrompt?: string
  ) => {
    setAiInitialPrompt(initialPrompt);
    setIsAiDrawerOpen(true);

    if (aiAnalysis && !initialPrompt) {
      return;
    }

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

  // 7. Пошук та теги для історії (з оптимізацією useDeferredValue для 120 FPS)
  const [searchQuery, setSearchQuery] = useState("");
  const deferredSearchQuery = useDeferredValue(searchQuery);
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
      const q = deferredSearchQuery.toLowerCase().trim();
      const matchesSearch =
        q === "" ||
        t.merchant_raw?.toLowerCase().includes(q) ||
        t.category_name?.toLowerCase().includes(q) ||
        String(t.amount).includes(q) ||
        t.tags?.some((tag) => tag.toLowerCase().includes(q));

      const matchesTag = !activeTag || (t.tags && t.tags.includes(activeTag));

      return matchesSearch && matchesTag;
    });
  }, [filteredTransactions, deferredSearchQuery, activeTag]);

  // Окрема вибірка транзакцій для вкладки "Капітал & Цілі"
  const capitalTransactions = useMemo(() => {
    return rawTransactions
      .filter(
        (t: Transaction) =>
          !t.exclude_from_budget &&
          (t.type === "investment" ||
            t.category_name?.toLowerCase().includes("інвест") ||
            t.category_name?.toLowerCase().includes("заощадж") ||
            t.tags?.some(
              (tag: string) =>
                tag.toLowerCase().includes("капітал") ||
                tag.toLowerCase().includes("інвест")
            ))
      )
      .sort(
        (a: Transaction, b: Transaction) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
  }, [rawTransactions]);

  // 8. Стан модальних вікон
  const [isCycleModalOpen, setIsCycleModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isCreateExpenseOpen, setIsCreateExpenseOpen] = useState(false);
  const [isTrashOpen, setIsTrashOpen] = useState(false);
  const [isMerchantRulesOpen, setIsMerchantRulesOpen] = useState(false);
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
          : { rate: commercialRates.USD };
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

  const handleAddDetectedFromRadar = (sub: DetectedSubscription) => {
    setEditingRecurring({
      id: 0,
      title: sub.title,
      amount: sub.amount,
      currency: sub.currency,
      category_name: sub.category_name,
      day_of_month: sub.predicted_day_of_month,
      is_active: true,
    });
    setIsAddingRecurring(true);
  };

  const handleDismissDetectedFromRadar = async (
    signature: string,
    title?: string
  ) => {
    try {
      const cleanId = signature.replace(/-[0-9]+-[a-z]+$/, "");
      const cleanMerchant = cleanId.replace(/^radar-/, "");
      const itemsToAdd = [signature, cleanId, cleanMerchant];
      if (title) itemsToAdd.push(title);

      const stored = localStorage.getItem("budget_dismissed_radar_subs");
      const current: string[] = stored ? JSON.parse(stored) : [];
      let changed = false;

      for (const item of itemsToAdd) {
        if (!current.includes(item)) {
          current.push(item);
          changed = true;
        }
      }

      if (changed) {
        localStorage.setItem(
          "budget_dismissed_radar_subs",
          JSON.stringify(current)
        );
      }

      // Синхронізуємо на сервер у cookie для довгострокового збереження між сесіями та пристроями
      await fetch("/api/recurring/radar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "dismiss",
          signature,
          title,
          cleanId,
          cleanMerchant,
        }),
      }).catch(() => null);

      invalidateRadar();
    } catch (e) {
      console.error("Error dismissing radar subscription:", e);
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

  // Керування лімітами категорій
  const handleSaveCategoryBudget = async (
    categoryName: string,
    limit: number
  ) => {
    setCategoryBudgets((prev) => ({ ...prev, [categoryName]: limit }));
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
    }
  };

  const handleDeleteCategoryBudget = async (categoryName: string) => {
    setCategoryBudgets((prev) => {
      const copy = { ...prev };
      delete copy[categoryName];
      return copy;
    });
    try {
      await fetch(
        `/api/category-budgets?category_name=${encodeURIComponent(categoryName)}`,
        { method: "DELETE" }
      );
    } catch (err) {
      console.error("Помилка видалення ліміту категорії:", err);
    }
  };

  // Експорт у Excel (.xlsx)
  const handleExportExcel = () => {
    exportFinancialDataToExcel({
      transactions,
      investments,
      savingsGoals,
    });
  };

  // Відновлення бази даних з бекапу
  const handleRestoreSuccess = async () => {
    await Promise.all([loadCycles(), loadWealthData()]);
    window.location.reload();
  };

  // Успішний спліт транзакції
  const handleSplitSuccess = async () => {
    await loadWealthData();
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
      />
    );
  }

  return (
    <main className="mx-auto min-h-screen max-w-screen-2xl px-4 pt-[calc(env(safe-area-inset-top)+1rem)] pb-[calc(1.5rem+env(safe-area-inset-bottom))] font-sans text-white antialiased sm:px-8 md:pt-10 lg:px-12">
      <Suspense fallback={null}>
        <QuickActionsListener
          onAddExpense={() => setIsCreateExpenseOpen(true)}
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
        onOpenNewCycle={() => setIsCycleModalOpen(true)}
        onOpenImport={() => setIsImportModalOpen(true)}
        onRegisterDevice={handleRegisterDevice}
        onLogout={handleLogout}
        onExportExcel={handleExportExcel}
        onRestoreSuccess={handleRestoreSuccess}
        onOpenTrash={() => setIsTrashOpen(true)}
        onOpenMerchantRules={() => setIsMerchantRulesOpen(true)}
      />

      {/* 3. Картка місячного ліміту бюджету */}
      <BudgetLimitCard
        effectiveLimit={effectiveLimit}
        budgetMetrics={budgetMetrics}
        onSaveBudget={handleSaveBudgetLimit}
      />

      {/* Навігація між вкладками: Аналітика & Бюджет -> Історія операцій -> Капітал & Цілі */}
      <div className="mb-6 flex rounded-2xl border border-zinc-800 bg-zinc-900/80 p-1 backdrop-blur-md">
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

      {/* Вкладка 1: Аналітика & Бюджет (Безшовна згрупована сітка без пробілів) */}
      {activeTab === "overview" && (
        <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
          {/* Ліва колонка: Щоденна динаміка -> Категорії -> Радар підписок */}
          <section className="space-y-6">
            <DailyDynamicsChart dailyStats={dailyStats} />

            <CategoryBreakdown
              categoryStats={categoryStats}
              categoryBudgets={categoryBudgets}
              onSelectCategory={setSelectedCategory}
              onSaveCategoryBudget={handleSaveCategoryBudget}
              onDeleteCategoryBudget={handleDeleteCategoryBudget}
            />

            <RecurringSection
              recurring={recurring}
              radarData={radarData}
              isLoadingRadar={isLoadingRadar}
              onAddRecurring={() => {
                setEditingRecurring(null);
                setIsAddingRecurring(true);
              }}
              onEditRecurring={(item) => {
                setEditingRecurring(item);
                setIsAddingRecurring(true);
              }}
              onExecuteRecurring={handleExecuteRecurring}
              onAddDetected={handleAddDetectedFromRadar}
              onDismissDetected={handleDismissDetectedFromRadar}
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
              onModelChange={(model) => {
                setSelectedAiModel(model);
                handleRunAiAnalysis(model);
              }}
              onOpenAiDrawer={(initialPrompt) =>
                handleRunAiAnalysis(selectedAiModel, initialPrompt)
              }
            />
          </section>
        </div>
      )}

      {/* Вкладка 2: Історія операцій (2-колонковий адаптивний вигляд) */}
      {activeTab === "history" && (
        <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-12">
          {/* Список транзакцій */}
          <section className="space-y-6 lg:col-span-8">
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
              onOpenTrash={() => setIsTrashOpen(true)}
              onOpenMerchantRules={() => setIsMerchantRulesOpen(true)}
            />
          </section>

          {/* Бічна колонка: Аналітика вибірки та швидкий фільтр */}
          <aside className="space-y-6 lg:col-span-4">
            <HistorySidebar
              displayedTransactions={displayedTransactions}
              totalPeriodTransactions={filteredTransactions}
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              activeTag={activeTag}
              onTagChange={setActiveTag}
              periodLabel={activeCycle?.name || monthLabel}
              onOpenCreateExpense={() => setIsCreateExpenseOpen(true)}
            />
          </aside>
        </div>
      )}

      {/* Вкладка 3: Капітал & Цілі (Скарбнички, Runway, Інвестиційний портфель, Анти-імпульс, Cost-per-Use та Окрема історія капіталу) */}
      {activeTab === "wealth" && (
        <div className="space-y-6">
          {/* Ряд 1: Скарбнички та Інвестиційний портфель */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <SavingsGoalsCard
              goals={savingsGoals}
              monthlyBurnRate={totalSpent > 0 ? totalSpent : effectiveLimit}
              onRefresh={loadWealthData}
            />
            <InvestmentsCard
              investments={investments}
              rates={commercialRates}
              onRefresh={loadWealthData}
            />
          </div>

          {/* Ряд 2: Поведінкова психологія та усвідомлені покупки */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <WishlistCard
              items={wishlistItems}
              savedAmount={wishlistSavedAmount}
              onRefresh={loadWealthData}
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
              onRefresh={loadWealthData}
              prefillItem={prefillCostPerUse}
              onClearPrefill={() => setPrefillCostPerUse(null)}
            />
          </div>

          {/* Ряд 3: Окрема історія операцій капіталу */}
          <CapitalHistoryCard
            transactions={capitalTransactions}
            onSelectTransaction={setSelectedTx}
            onAddCapital={() => setIsCreateExpenseOpen(true)}
          />
        </div>
      )}

      {/* Глобальні модальні вікна та шторки (завантажуються за вимогою) */}
      {selectedCategory && (
        <CategoryDetailModal
          categoryName={selectedCategory}
          transactions={filteredTransactions}
          onClose={() => setSelectedCategory(null)}
          onSelectTransaction={setSelectedTx}
        />
      )}

      <CreateTransactionDrawer
        isOpen={isCreateExpenseOpen}
        onClose={() => setIsCreateExpenseOpen(false)}
      />

      {isAddingRecurring && (
        <RecurringModal
          isOpen={isAddingRecurring}
          item={editingRecurring}
          onClose={() => setIsAddingRecurring(false)}
          onSave={handleSaveRecurring}
          onDelete={handleDeleteRecurring}
        />
      )}

      {selectedTx && (
        <TransactionActionSheet
          transaction={selectedTx}
          onClose={() => setSelectedTx(null)}
          onUpdateCategory={handleUpdateCategory}
          onUpdateTags={handleUpdateTags}
          onDelete={handleDeleteTransaction}
          onOpenSplit={(tx) => setSplitTx(tx)}
        />
      )}

      {splitTx && (
        <SplitTransactionModal
          transaction={splitTx}
          onClose={() => setSplitTx(null)}
          onSplitSuccess={handleSplitSuccess}
        />
      )}

      {isCycleModalOpen && (
        <NewCycleModal
          isOpen={isCycleModalOpen}
          onClose={() => setIsCycleModalOpen(false)}
          defaultLimit={activeCycle?.budget_limit || effectiveLimit || 35000}
          onCycleStarted={loadCycles}
        />
      )}

      {isAiDrawerOpen && (
        <AIAnalysisDrawer
          isOpen={isAiDrawerOpen}
          onClose={() => {
            setIsAiDrawerOpen(false);
            setAiInitialPrompt(undefined);
          }}
          analysis={aiAnalysis}
          isLoading={isAiLoading}
          selectedModel={selectedAiModel}
          onModelChange={(model) => {
            setSelectedAiModel(model);
            handleRunAiAnalysis(model);
          }}
          onReanalyze={() => handleRunAiAnalysis(selectedAiModel)}
          initialPrompt={aiInitialPrompt}
          financialContext={aiFinancialContext}
        />
      )}

      {isImportModalOpen && (
        <CsvImportModal
          isOpen={isImportModalOpen}
          onClose={() => setIsImportModalOpen(false)}
          onSuccess={() => {
            setIsImportModalOpen(false);
            window.location.reload();
          }}
        />
      )}

      {isTrashOpen && (
        <TrashModal
          isOpen={isTrashOpen}
          onClose={() => setIsTrashOpen(false)}
        />
      )}

      {isMerchantRulesOpen && (
        <MerchantRulesModal
          isOpen={isMerchantRulesOpen}
          onClose={() => setIsMerchantRulesOpen(false)}
        />
      )}
    </main>
  );
}
