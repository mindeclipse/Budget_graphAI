"use client";

import { useEffect, useState, useMemo, Suspense } from "react";
import { supabase } from "@/lib/supabase";
import { useBudgetMetrics } from "@/hooks/useBudgetMetrics";
import { BurnRateChart } from "@/components/BurnRateChart";
import { MoMComparison } from "@/components/MoMComparison";
import { RecurringModal } from "@/components/RecurringModal";
import { TransactionActionSheet } from "@/components/TransactionActionSheet";
import { CategoryDetailModal } from "@/components/CategoryDetailModal";
import { Transaction, RecurringItem } from "@/types/finance";
import { CATEGORY_COLORS, CATEGORY_ICONS } from "@/constants/categories";
import { useAutoLock } from "@/hooks/useAutoLock";
import { useFinanceQueries } from "@/hooks/useFinanceQueries";
import { CsvImportModal } from "@/components/CsvImportModal";
import { NewCycleModal } from "@/components/NewCycleModal";
import { AIAnalysisDrawer } from "@/components/AIAnalysisDrawer";
import { useTransactionMutations } from "@/hooks/useTransactionMutations";
import { QuickActionsListener } from "@/components/QuickActionsListener";
import { CreateTransactionDrawer } from "@/components/CreateTransactionDrawer";
import {
  AIAnalysisResponse,
  SupportedGeminiModel,
  AIAnalysisRequest,
} from "@/types/ai";
import {
  startAuthentication,
  startRegistration,
} from "@simplewebauthn/browser";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  TrendingUp,
  Receipt,
  Pencil,
  Check,
  Calendar,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Repeat,
  Plus,
  CheckCircle2,
  Sparkles,
  Lock,
  HelpCircle,
  Fingerprint,
  LogOut,
  Search,
  X,
  Wallet,
  Settings,
  Upload,
} from "lucide-react";

/** Резервний курс для ручного списання USD, якщо API банку тимчасово недоступне */
const DEFAULT_USD_RATE = 44.5;

export default function Dashboard() {
  // Сесія користувача та аутентифікація
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [pinInput, setPinInput] = useState("");
  const [pinError, setPinError] = useState("");
  const [isVerifyingPin, setIsVerifyingPin] = useState(false);

  // Кешовані дані через React Query
  const {
    transactions: rawTransactions,
    recurring,
    invalidateTransactions,
    invalidateRecurring,
  } = useFinanceQueries(isAuthenticated);

  // Відфільтровуємо глобально на рівні сторінки
  const transactions = useMemo(() => {
    return rawTransactions.filter((t: Transaction) => !t.exclude_from_budget);
  }, [rawTransactions]);

  const [activeTab, setActiveTab] = useState<"overview" | "history">(
    "overview"
  );

  // Активний період перегляду
  const [selectedDate, setSelectedDate] = useState(() => new Date());

  // Ліміт бюджету
  const [isEditingBudget, setIsEditingBudget] = useState(false);
  const [tempBudgetInput, setTempBudgetInput] = useState("30000");
  const [isCycleModalOpen, setIsCycleModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [activeCycle, setActiveCycle] = useState<any>(null);
  const [previousCycle, setPreviousCycle] = useState<any>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Окрема форма створення разової витрати
  const [isCreateExpenseOpen, setIsCreateExpenseOpen] = useState(false);

  // Optimistic Updates у TanStack Query
  const { updateTransaction, createTransaction, deleteTransaction } =
    useTransactionMutations();

  // Завантаження активного циклу та визначення попереднього
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

  // Обчислення аналітичних показників через кастомний хук
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

  // Фільтрація транзакцій за зарплатними циклами замість календарних місяців
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

  // Керування AI-аналізом (Шторка)
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

  // Стани для рядка пошуку та обраного тегу
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTag, setActiveTag] = useState<string | null>(null);

  // Збір усіх унікальних тегів із транзакцій
  const availableTags = useMemo<string[]>(() => {
    const tagsSet = new Set<string>();
    filteredTransactions.forEach((tx) => {
      tx.tags?.forEach((tag: string) => tagsSet.add(tag));
    });
    return Array.from(tagsSet);
  }, [filteredTransactions]);

  // Транзакції для відображення у списку
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

  // Стани модальних вікон
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);
  const [isAddingRecurring, setIsAddingRecurring] = useState(false);
  const [editingRecurring, setEditingRecurring] =
    useState<RecurringItem | null>(null);
  const [isExecutingRecurring, setIsExecutingRecurring] = useState<
    number | null
  >(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  const [spentWhole, spentCents] = totalSpent
    .toLocaleString("uk-UA", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
    .split(",");

  // Динамічна палітра
  const spentPct = budgetMetrics.spentPercent || 0;
  const isDanger = spentPct >= 90;
  const isWarning = spentPct >= 70 && !isDanger;

  const progressGradient = isDanger
    ? "from-rose-600 to-rose-400"
    : isWarning
      ? "from-amber-500 to-amber-300"
      : "from-sky-500 to-emerald-400";

  const progressGlow = isDanger
    ? "shadow-[0_0_12px_rgba(244,63,94,0.35)]"
    : isWarning
      ? "shadow-[0_0_12px_rgba(245,158,11,0.3)]"
      : "shadow-[0_0_12px_rgba(52,211,153,0.25)]";

  const tooltipBadgeStyle = isDanger
    ? "border-rose-500/40 bg-rose-950/90 text-rose-300"
    : isWarning
      ? "border-amber-500/40 bg-amber-950/90 text-amber-300"
      : "border-zinc-800 bg-zinc-950/95 text-emerald-400";

  // Перевірка активної сесії
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const res = await fetch("/api/auth");
        const data = await res.json();
        setIsAuthenticated(data.authenticated);
      } catch {
        setIsAuthenticated(false);
      }
    };
    checkAuth();
  }, []);

  // Обробка введення PIN-коду
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsVerifyingPin(true);
    setPinError("");

    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: pinInput }),
      });

      if (res.ok) {
        setIsAuthenticated(true);
      } else {
        setPinError("Невірний PIN-код");
      }
    } catch {
      setPinError("Помилка підключення");
    } finally {
      setIsVerifyingPin(false);
    }
  };

  // Face ID розблокування
  const handleBiometricLogin = async () => {
    setPinError("");
    setIsVerifyingPin(true);

    try {
      const optsRes = await fetch("/api/auth/webauthn/login");
      if (!optsRes.ok) throw new Error("Біометрія недоступна");
      const options = await optsRes.json();

      const authResp = await startAuthentication({ optionsJSON: options });

      const verifyRes = await fetch("/api/auth/webauthn/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(authResp),
      });

      if (verifyRes.ok) {
        setIsAuthenticated(true);
      } else {
        setPinError("Не вдалося розпізнати");
      }
    } catch (err: any) {
      if (err.name !== "NotAllowedError") {
        setPinError(err.message || "Помилка Face ID");
      }
    } finally {
      setIsVerifyingPin(false);
    }
  };

  // Прив'язка Face ID пристрою
  const handleRegisterDevice = async () => {
    try {
      const optsRes = await fetch("/api/auth/webauthn/register");
      if (!optsRes.ok) throw new Error("Помилка отримання параметрів");
      const options = await optsRes.json();

      const regResp = await startRegistration({ optionsJSON: options });

      const verifyRes = await fetch("/api/auth/webauthn/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(regResp),
      });

      if (verifyRes.ok) {
        alert("✅ Face ID / Touch ID успішно прив'язано до цього пристрою!");
      } else {
        alert("Помилка прив'язки пристрою");
      }
    } catch (err: any) {
      if (err.name !== "NotAllowedError") {
        alert(err.message || "Не вдалося налаштувати біометрію");
      }
    }
  };

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

  // Вихід із системи
  const handleLogout = async () => {
    setIsAuthenticated(false);
    setPinInput("");
    setPinError("");
    await fetch("/api/auth", { method: "DELETE" }).catch(() => null);
  };

  // Автоблокування
  useAutoLock({
    isAuthenticated,
    onLock: () => {
      setIsAuthenticated(false);
      setPinInput("");
    },
    inactivityTimeoutMs: 7 * 60 * 1000,
    maxBackgroundTimeMs: 5 * 60 * 1000,
  });

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

  // Функція збереження нової суми через Олівець
  const handleSaveBudget = async () => {
    const newLimit = parseFloat(tempBudgetInput.replace(",", "."));
    if (isNaN(newLimit) || newLimit <= 0 || !activeCycle?.id) {
      setIsEditingBudget(false);
      return;
    }

    // Залишаємо тільки оновлення циклу
    setActiveCycle((prev: any) =>
      prev ? { ...prev, budget_limit: newLimit } : prev
    );
    setIsEditingBudget(false);

    try {
      const res = await fetch("/api/cycles", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cycleId: activeCycle.id, limit: newLimit }),
      });

      if (!res.ok) throw new Error("Не вдалося оновити ліміт на сервері");
    } catch (error) {
      console.error("Помилка збереження бюджету:", error);
      // Відкат
      if (activeCycle?.budget_limit) {
        setActiveCycle((prev: any) => ({ ...prev }));
      }
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

  if (isAuthenticated === null) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-black">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-700 border-t-white" />
      </main>
    );
  }

  if (!isAuthenticated) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-black p-4 text-white">
        <div className="w-full max-w-xs space-y-6 rounded-3xl border border-zinc-900 bg-zinc-950 p-6 text-center shadow-2xl">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-zinc-800 bg-zinc-900 text-zinc-400">
            <Lock size={20} />
          </div>
          <div>
            <h2 className="text-base font-bold text-white">Вхід до фінансів</h2>
            <p className="mt-1 text-xs text-zinc-500">
              Введіть PIN-код доступу
            </p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <input
              type="password"
              inputMode="numeric"
              maxLength={12}
              value={pinInput}
              onChange={(e) => setPinInput(e.target.value)}
              placeholder="••••"
              autoFocus
              className="w-full rounded-2xl border border-zinc-800 bg-zinc-900 py-3 text-center font-mono text-xl tracking-[0.4em] text-white transition-all focus:border-zinc-600 focus:outline-none"
            />

            {pinError && (
              <p className="text-xs font-medium text-rose-400">{pinError}</p>
            )}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleBiometricLogin}
                disabled={isVerifyingPin}
                className="flex items-center justify-center rounded-2xl border border-zinc-800 bg-zinc-900 px-4 py-3 text-zinc-300 transition-all hover:border-zinc-700 hover:text-white disabled:opacity-40"
                title="Увійти за допомогою Face ID / Touch ID"
              >
                <Fingerprint size={18} />
              </button>
              <button
                type="submit"
                disabled={isVerifyingPin || !pinInput}
                className="flex-1 rounded-2xl bg-white py-3 text-xs font-bold text-black transition-all hover:bg-zinc-200 disabled:opacity-40"
              >
                {isVerifyingPin ? "Перевірка..." : "Розблокувати"}
              </button>
            </div>
          </form>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto min-h-screen max-w-screen-2xl px-4 pt-[calc(env(safe-area-inset-top)+1rem)] pb-[calc(6rem+env(safe-area-inset-bottom))] font-sans text-white antialiased sm:px-8 md:pt-10 lg:px-12">
      <Suspense fallback={null}>
        <QuickActionsListener
          onAddExpense={() => setIsCreateExpenseOpen(true)}
        />
      </Suspense>
      {/* Навігація календарних періодів — компактна */}
      <div className="mb-2.5 flex items-center justify-between rounded-xl border border-zinc-900 bg-zinc-950 px-3 py-1.5 shadow-sm">
        <button
          type="button"
          onClick={handlePrevMonth}
          className="relative flex h-8 w-8 items-center justify-center rounded-xl border border-zinc-800/90 bg-zinc-900/80 text-zinc-400 after:absolute after:-inset-2 after:content-[''] active:scale-95"
        >
          <ChevronLeft size={16} />
        </button>
        <div className="flex items-center gap-2">
          <Calendar size={13} className="text-zinc-500" />
          <span className="text-xs font-semibold text-zinc-200 capitalize">
            {monthLabel}
          </span>
        </div>
        <button
          type="button"
          onClick={handleNextMonth}
          className="relative flex h-8 w-8 items-center justify-center rounded-xl border border-zinc-800/90 bg-zinc-900/80 text-zinc-400 after:absolute after:-inset-2 after:content-[''] active:scale-95"
        >
          <ChevronRight size={16} />
        </button>
      </div>
      {/* Головний підсумок витрат та контрастні лічильники */}
      <header className="mb-4 flex flex-col justify-between gap-3 border-b border-zinc-800/80 pb-3 md:flex-row md:items-end">
        <div>
          <p className="mb-0.5 flex items-center gap-1.5 text-xs font-semibold tracking-widest text-zinc-400 uppercase">
            <TrendingUp size={13} className="text-emerald-400" /> Витрачено за
            період
          </p>
          <h1 className="flex items-baseline gap-0.5 text-4xl font-extrabold tracking-tight md:text-5xl">
            <span className="text-white tabular-nums">{spentWhole}</span>
            {spentCents && (
              <span className="text-2xl font-semibold text-zinc-400 tabular-nums md:text-3xl">
                ,{spentCents}
              </span>
            )}
            <span className="ml-1 text-xl font-light text-zinc-500">₴</span>
          </h1>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <div className="flex items-center gap-1.5 rounded-xl border border-zinc-800/90 bg-zinc-900/80 px-3 py-1.5 shadow-sm">
            <span className="text-zinc-400">Постійні:</span>
            <span className="font-semibold text-white">
              {recurringTotal.toLocaleString("uk-UA")} ₴
            </span>
          </div>

          <div className="flex items-center gap-1.5 rounded-xl border border-zinc-800/90 bg-zinc-900/80 px-3 py-1.5 shadow-sm">
            <span className="text-zinc-400">Транзакцій:</span>
            <span className="font-semibold text-white">
              {filteredTransactions.length}
            </span>
          </div>

          <div className="relative">
            <button
              type="button"
              onClick={() => setIsSettingsOpen((prev) => !prev)}
              title="Налаштування та керування"
              className={`flex h-8 w-8 items-center justify-center rounded-xl border transition-all active:scale-95 ${
                isSettingsOpen
                  ? "border-zinc-700 bg-zinc-800 text-white"
                  : "border-zinc-800/90 bg-zinc-900/80 text-zinc-400 hover:border-zinc-700 hover:text-white"
              }`}
            >
              <Settings size={15} />
            </button>

            {isSettingsOpen && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setIsSettingsOpen(false)}
                />

                <div className="absolute top-10 right-0 z-50 w-56 rounded-2xl border border-zinc-800/90 bg-zinc-950/95 p-1.5 shadow-2xl backdrop-blur-xl">
                  <button
                    type="button"
                    onClick={() => {
                      setIsSettingsOpen(false);
                      setIsCycleModalOpen(true);
                    }}
                    className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-semibold text-sky-400 transition-colors hover:bg-sky-500/10"
                  >
                    <Wallet size={14} className="text-sky-400" />
                    <span>Новий цикл</span>
                  </button>

                  <div className="my-1 border-t border-zinc-800/60" />

                  <button
                    type="button"
                    onClick={() => {
                      setIsSettingsOpen(false);
                      setIsImportModalOpen(true);
                    }}
                    className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-medium text-zinc-300 transition-colors hover:bg-zinc-900"
                  >
                    <Upload size={14} className="text-zinc-400" />
                    <span>Імпорт Приват24</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setIsSettingsOpen(false);
                      handleRegisterDevice();
                    }}
                    title="Налаштувати Face ID / Touch ID для цього пристрою"
                    className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-medium text-zinc-300 transition-colors hover:bg-zinc-900"
                  >
                    <Fingerprint size={14} className="text-zinc-400" />
                    <span>Face ID / Touch ID</span>
                  </button>

                  <div className="my-1 border-t border-zinc-800/60" />

                  <button
                    type="button"
                    onClick={() => {
                      setIsSettingsOpen(false);
                      handleLogout();
                    }}
                    title="Заблокувати додаток"
                    className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-medium text-rose-400 transition-colors hover:bg-rose-950/30"
                  >
                    <LogOut size={14} className="text-rose-400" />
                    <span>Вийти</span>
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </header>
      {/* Картка місячного ліміту бюджету */}
      <section className="mb-8 rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-5 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)]">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold tracking-wider text-zinc-400 uppercase">
              Бюджет на місяць
            </span>
            {budgetMetrics.exactPercent > 100 && (
              <span className="flex items-center gap-1 rounded-full border border-rose-800/50 bg-rose-950/50 px-2 py-0.5 text-[11px] font-semibold text-rose-400">
                <AlertTriangle size={12} /> Переліміт
              </span>
            )}
          </div>

          {isEditingBudget ? (
            <div className="flex items-center gap-1.5">
              <input
                type="number"
                inputMode="decimal"
                value={tempBudgetInput}
                onChange={(e) => setTempBudgetInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSaveBudget();
                  if (e.key === "Escape") setIsEditingBudget(false);
                }}
                className="w-24 rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1 font-mono text-base text-white focus:border-emerald-500 focus:outline-none sm:w-28 sm:text-xs"
                autoFocus
              />
              <button
                type="button"
                onClick={handleSaveBudget}
                className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-600 text-white transition-all hover:bg-emerald-500 active:scale-95"
              >
                <Check size={14} />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => {
                setTempBudgetInput(effectiveLimit.toString());
                setIsEditingBudget(true);
              }}
              className="flex items-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-900/80 px-2.5 py-1 text-xs text-zinc-400 transition-all hover:border-zinc-700 hover:text-white active:scale-95"
            >
              <span className="font-mono font-semibold text-zinc-200 tabular-nums">
                {effectiveLimit.toLocaleString("uk-UA")} ₴
              </span>
              <Pencil size={11} className="text-zinc-500" />
            </button>
          )}
        </div>

        {/* Інтерактивний прогрес-бар */}
        <div
          tabIndex={0}
          className="group relative -my-2 mb-4 cursor-pointer py-2 select-none focus:outline-none"
        >
          <div
            className={`pointer-events-none absolute -top-8 -translate-x-1/2 rounded-lg border px-2.5 py-1 font-mono text-[11px] opacity-0 shadow-2xl backdrop-blur-md transition-all duration-150 group-hover:-top-9 group-hover:opacity-100 group-focus:opacity-100 group-active:-top-9 group-active:opacity-100 ${tooltipBadgeStyle}`}
            style={{
              left: `${Math.min(90, Math.max(10, spentPct))}%`,
            }}
          >
            <div className="flex items-center gap-1.5 whitespace-nowrap">
              <span className="font-semibold tabular-nums">
                {spentPct.toFixed(1)}%
              </span>
              <span className="text-[10px] text-zinc-400">використано</span>
            </div>
            <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 border-x-4 border-t-4 border-x-transparent border-t-current opacity-70" />
          </div>

          <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-800/80 ring-1 ring-zinc-800">
            <div
              className={`h-full rounded-full bg-gradient-to-r ${progressGradient} ${progressGlow} transition-all duration-500`}
              style={{
                width: `${Math.min(100, spentPct)}%`,
              }}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 border-t border-zinc-900 pt-1 text-xs sm:grid-cols-3">
          <div>
            <p className="mb-0.5 text-zinc-500">Залишок</p>
            <p
              className={`text-sm font-bold tabular-nums ${
                budgetMetrics.remaining < 0 ? "text-rose-400" : "text-white"
              }`}
            >
              {budgetMetrics.remaining.toLocaleString("uk-UA", {
                minimumFractionDigits: 2,
              })}{" "}
              ₴
            </p>
          </div>

          <div>
            <p className="mb-0.5 text-zinc-500">Безпечно на день</p>
            <p className="text-sm font-bold tabular-nums">
              {budgetMetrics.isCurrentMonth
                ? `~ ${Math.round(budgetMetrics.safeDailySpend).toLocaleString("uk-UA")} ₴/д`
                : "Період минув"}
            </p>
          </div>

          <div className="col-span-2 flex items-center gap-1.5 text-zinc-400 sm:col-span-1">
            <Calendar size={13} className="shrink-0 text-zinc-500" />
            <span>
              {budgetMetrics.isCurrentMonth ? (
                <>
                  Залишилось{" "}
                  <strong className="tabular-nums">
                    {budgetMetrics.daysRemaining}
                  </strong>{" "}
                  дн.
                </>
              ) : (
                "Архівний період"
              )}
            </span>
          </div>
        </div>
      </section>
      {/* Мобільні таби */}
      <div className="mb-6 flex rounded-xl border border-zinc-800 bg-zinc-900/80 p-1 md:hidden">
        <button
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
        {/* ЛІВА КОЛОНКА */}
        <section
          className={`space-y-6 md:col-span-7 ${
            activeTab === "overview" ? "block" : "hidden md:block"
          }`}
        >
          <div className="relative rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-5 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)]">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-xs font-semibold tracking-wider text-zinc-400 uppercase">
                Динаміка витрат за днями
              </p>
              <span className="font-mono text-xs text-zinc-500">UAH</span>
            </div>

            {dailyStats.length > 0 ? (
              <div className="h-44 w-full md:h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={dailyStats}
                    margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                  >
                    <defs>
                      <linearGradient
                        id="barGradient"
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="1"
                      >
                        <stop
                          offset="0%"
                          stopColor="#38BDF8"
                          stopOpacity={0.9}
                        />
                        <stop
                          offset="100%"
                          stopColor="#0284C7"
                          stopOpacity={0.25}
                        />
                      </linearGradient>
                    </defs>
                    <XAxis
                      dataKey="date"
                      stroke="#71717a"
                      fontSize={11}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      stroke="#71717a"
                      fontSize={11}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(val) => `${val}₴`}
                    />
                    <Tooltip
                      cursor={{ fill: "rgba(255, 255, 255, 0.04)" }}
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          return (
                            <div className="rounded-xl border border-zinc-700/80 bg-zinc-900/95 px-3 py-1.5 text-xs shadow-2xl backdrop-blur">
                              <p className="text-zinc-400">
                                {payload[0].payload.date}
                              </p>
                              <p className="font-mono font-bold text-white tabular-nums">
                                {Number(payload[0].value).toLocaleString(
                                  "uk-UA"
                                )}{" "}
                                ₴
                              </p>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <Bar
                      dataKey="amount"
                      fill="url(#barGradient)"
                      radius={[6, 6, 0, 0]}
                      maxBarSize={28}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="flex h-40 items-center justify-center text-xs text-zinc-600">
                Немає даних за цей місяць
              </div>
            )}
          </div>

          <div className="relative rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-5 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)]">
            <h2 className="mb-3.5 text-xs font-semibold tracking-wider text-zinc-400 uppercase">
              Структура витрат за категоріями
            </h2>

            {categoryStats.length === 0 ? (
              <p className="py-4 text-sm text-zinc-600">
                Категорії ще не сформовані
              </p>
            ) : (
              <div className="space-y-2">
                {categoryStats.map((cat) => {
                  const IconComponent = CATEGORY_ICONS[cat.name] || HelpCircle;
                  const catColor = cat.color || "#10B981";
                  const percent = Number(cat.percentage) || 0;

                  return (
                    <div
                      key={cat.name}
                      onClick={() => setSelectedCategory(cat.name)}
                      className="group relative cursor-pointer overflow-hidden rounded-xl border border-zinc-800/60 bg-zinc-900/30 p-2.5 transition-all duration-150 hover:border-zinc-700/80 hover:bg-zinc-900/60 active:scale-[0.99]"
                    >
                      <div
                        className="absolute inset-y-0 left-0 transition-all duration-700 ease-out"
                        style={{
                          width: `${Math.min(100, percent)}%`,
                          backgroundColor: catColor,
                          opacity: 0.12,
                        }}
                      />

                      <div
                        className="absolute inset-y-0 left-0 w-1 rounded-l-xl opacity-90 transition-opacity group-hover:opacity-100"
                        style={{ backgroundColor: catColor }}
                      />

                      <div className="relative z-10 flex items-center justify-between pl-1.5">
                        <div className="flex items-center space-x-2.5 truncate pr-2">
                          <div
                            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-transform duration-150 group-hover:scale-105"
                            style={{
                              backgroundColor: `${catColor}20`,
                              color: catColor,
                            }}
                          >
                            <IconComponent size={14} />
                          </div>
                          <span className="truncate text-xs font-medium text-zinc-200 transition-colors group-hover:text-white">
                            {cat.name}
                          </span>
                        </div>

                        <div className="flex shrink-0 items-baseline gap-2 font-mono text-xs tabular-nums">
                          <span className="font-semibold text-white">
                            {cat.amount.toLocaleString("uk-UA")} ₴
                          </span>
                          <span className="text-[11px] font-medium text-zinc-500">
                            {percent}%
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

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

          <div className="relative overflow-hidden rounded-2xl border border-zinc-800/80 bg-gradient-to-b from-zinc-900/60 to-zinc-950 p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="rounded-xl border border-purple-500/30 bg-purple-500/10 p-2 text-purple-400">
                  <Sparkles size={18} />
                </div>
                <div>
                  <h3 className="text-xs font-bold tracking-wider text-zinc-200 uppercase">
                    AI Фінансовий Аналітик
                  </h3>
                  <p className="text-[11px] text-zinc-500">
                    {aiAnalysis
                      ? `Останній аналіз: ${aiAnalysis.status === "on_track" ? "В нормі" : "Потребує уваги"}`
                      : "Аналіз темпу витрат та оптимізація бюджету"}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => handleRunAiAnalysis()}
                className="flex items-center gap-1.5 rounded-xl border border-purple-500/30 bg-purple-500/10 px-3.5 py-2 text-xs font-medium text-purple-300 transition-all hover:bg-purple-500/20 active:scale-95"
              >
                <Sparkles size={13} />
                {aiAnalysis ? "Переглянути" : "Аналізувати"}
              </button>
            </div>
          </div>
        </section>

        {/* ПРАВА КОЛОНКА */}
        <section
          className={`space-y-6 md:col-span-5 ${
            activeTab === "history" ? "block" : "hidden md:block"
          }`}
        >
          <div className="rounded-2xl border border-zinc-900 bg-zinc-950 p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="flex items-center gap-1.5 text-xs font-semibold tracking-wider text-zinc-400 uppercase">
                <Receipt size={14} className="text-zinc-500" /> Транзакції
              </h2>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsCreateExpenseOpen(true)}
                  className="flex items-center gap-1 rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 py-1 text-xs text-zinc-300 transition-all hover:border-zinc-700 hover:bg-zinc-800 hover:text-white active:scale-95"
                >
                  <Plus size={13} className="text-zinc-400" /> Додати
                </button>
                <span className="rounded-md border border-zinc-800 bg-zinc-900 px-2 py-0.5 font-mono text-[11px] text-zinc-400">
                  {displayedTransactions.length} оп.
                </span>
              </div>
            </div>

            <div className="mb-4 space-y-2.5">
              <div className="relative flex items-center">
                <Search
                  size={15}
                  className="pointer-events-none absolute left-3.5 text-zinc-500"
                />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Пошук за мерчантом, сумою чи категорією..."
                  className="w-full rounded-2xl border border-zinc-800 bg-zinc-900/60 py-2.5 pr-9 pl-9 text-xs text-white placeholder-zinc-500 transition-all focus:border-zinc-700 focus:bg-zinc-900 focus:outline-none"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    className="absolute right-3 rounded-lg p-0.5 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>

              {availableTags.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                  <span className="mr-1 text-[11px] font-medium text-zinc-500">
                    Теги:
                  </span>
                  {availableTags.map((tag: string) => {
                    const isActive = activeTag === tag;
                    return (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => setActiveTag(isActive ? null : tag)}
                        className={`rounded-lg px-2.5 py-1 text-[11px] font-medium transition-all ${
                          isActive
                            ? "border border-sky-500/50 bg-sky-500/15 font-semibold text-sky-400"
                            : "border border-zinc-800 bg-zinc-900/50 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200"
                        }`}
                      >
                        #{tag}
                      </button>
                    );
                  })}
                  {activeTag && (
                    <button
                      type="button"
                      onClick={() => setActiveTag(null)}
                      className="rounded-lg px-2 py-1 text-[10px] text-zinc-500 underline underline-offset-2 hover:text-zinc-300"
                    >
                      Скинути
                    </button>
                  )}
                </div>
              )}
            </div>

            {filteredTransactions.length === 0 ? (
              <div className="py-16 text-center text-zinc-600">
                <Receipt size={32} className="mx-auto mb-2 opacity-40" />
                <p className="text-sm">Транзакцій немає</p>
                <p className="mt-1 text-xs text-zinc-700">
                  У цьому місяці витрат не зафіксовано
                </p>
              </div>
            ) : displayedTransactions.length === 0 ? (
              <div className="rounded-2xl border border-zinc-800/60 bg-zinc-900/30 p-8 text-center">
                <p className="text-sm font-medium text-zinc-400">
                  Нічого не знайдено
                </p>
                <p className="mt-1 text-xs text-zinc-600">
                  За вашим фільтром немає відповідних транзакцій
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery("");
                    setActiveTag(null);
                  }}
                  className="mt-3 inline-flex items-center rounded-xl bg-zinc-800 px-3 py-1.5 text-xs font-semibold text-zinc-300 hover:bg-zinc-700 hover:text-white"
                >
                  Очистити пошук
                </button>
              </div>
            ) : (
              <div className="max-h-[420px] [scrollbar-width:thin] space-y-2 overflow-y-auto pr-1.5 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-zinc-800 hover:[&::-webkit-scrollbar-thumb]:bg-zinc-700 [&::-webkit-scrollbar-track]:bg-transparent">
                {displayedTransactions.map((t: Transaction) => {
                  const IconComponent =
                    CATEGORY_ICONS[t.category_name] || HelpCircle;
                  const iconColor =
                    CATEGORY_COLORS[t.category_name] || "#71717A";
                  const isSyncing = t.id < 0;

                  return (
                    <div
                      key={t.id}
                      onClick={() => {
                        if (isSyncing) return;
                        setSelectedTx(t);
                      }}
                      className={`group flex items-center justify-between rounded-xl border border-zinc-800/60 bg-zinc-900/40 p-3 transition-all duration-150 ${
                        isSyncing
                          ? "pointer-events-none opacity-50 select-none"
                          : "cursor-pointer hover:translate-x-0.5 hover:border-zinc-700/80 hover:bg-zinc-900/80 active:scale-[0.99]"
                      }`}
                    >
                      <div className="flex min-w-0 items-center space-x-3 pr-2">
                        <div
                          className="shrink-0 rounded-lg p-2 transition-transform duration-150 group-hover:scale-110"
                          style={{
                            backgroundColor: `${iconColor}15`,
                            color: iconColor,
                          }}
                        >
                          <IconComponent size={16} />
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-zinc-100 transition-colors group-hover:text-white">
                            {t.merchant_raw}
                          </p>
                          <p className="truncate text-xs text-zinc-500">
                            {t.category_name} •{" "}
                            {new Date(t.created_at).toLocaleDateString([], {
                              day: "numeric",
                              month: "short",
                            })}{" "}
                            {new Date(t.created_at).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </p>
                          {t.tags && t.tags.length > 0 && (
                            <div className="mt-1 flex flex-wrap gap-1">
                              {t.tags.map((tag: string) => (
                                <span
                                  key={tag}
                                  className="rounded bg-zinc-800/90 px-1.5 py-0.5 text-[10px] font-medium text-zinc-400"
                                >
                                  #{tag}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>

                      <span className="ml-2 font-mono text-sm font-bold tracking-tight whitespace-nowrap text-white tabular-nums">
                        -{Number(t.amount).toFixed(2)} ₴
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-zinc-900 bg-zinc-950 p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Repeat size={15} className="text-violet-400" />
                <h2 className="text-xs font-semibold tracking-wider text-zinc-400 uppercase">
                  Постійні витрати
                </h2>
              </div>
              <button
                onClick={() => {
                  setEditingRecurring(null);
                  setIsAddingRecurring(true);
                }}
                className="flex items-center gap-1 rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 py-1 text-xs text-zinc-400 transition-all hover:bg-zinc-800 hover:text-white"
              >
                <Plus size={13} /> Додати
              </button>
            </div>

            {recurring.length === 0 ? (
              <p className="py-3 text-xs text-zinc-600">
                Немає запланованих платежів
              </p>
            ) : (
              <div className="space-y-2">
                {recurring.map((item) => (
                  <div
                    key={item.id}
                    className="group flex items-center justify-between rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-2.5 transition-all hover:border-zinc-700 hover:bg-zinc-900/80"
                  >
                    <div
                      onClick={() => {
                        setEditingRecurring(item);
                        setIsAddingRecurring(true);
                      }}
                      className="min-w-0 flex-1 cursor-pointer pr-2"
                    >
                      <div className="flex items-center gap-1.5">
                        <p className="truncate text-xs font-semibold text-zinc-200 group-hover:text-white">
                          {item.title}
                        </p>
                        <Pencil
                          size={11}
                          className="shrink-0 text-zinc-600 group-hover:text-zinc-400"
                        />
                      </div>
                      <p className="truncate text-[11px] text-zinc-500">
                        {item.day_of_month}-е число • {item.category_name}
                      </p>
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                      <span
                        onClick={() => {
                          setEditingRecurring(item);
                          setIsAddingRecurring(true);
                        }}
                        className="cursor-pointer text-xs font-bold text-white hover:underline"
                      >
                        {item.currency === "USD"
                          ? `$${Number(item.amount).toFixed(item.amount % 1 === 0 ? 0 : 2)}`
                          : `${Number(item.amount).toLocaleString("uk-UA")} ₴`}
                      </span>
                      <button
                        onClick={() => handleExecuteRecurring(item)}
                        title="Провести платіж зараз"
                        className="rounded-lg border border-zinc-800 bg-zinc-800/60 p-1.5 text-zinc-400 transition-all hover:border-emerald-700/60 hover:bg-emerald-950/60 hover:text-emerald-400"
                      >
                        <CheckCircle2 size={13} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

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

      <CategoryDetailModal
        categoryName={selectedCategory}
        transactions={filteredTransactions}
        onClose={() => setSelectedCategory(null)}
        onSelectTransaction={(tx) => {
          setSelectedTx(tx);
        }}
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
        onCycleStarted={() => {
          loadCycles();
        }}
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
