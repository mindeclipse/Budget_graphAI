"use client";

import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { useBudgetMetrics } from "@/hooks/useBudgetMetrics";
import { BurnRateChart } from "@/components/BurnRateChart";
import { MoMComparison } from "@/components/MoMComparison";
import { RecurringModal } from "@/components/RecurringModal";
import { TransactionActionSheet } from "@/components/TransactionActionSheet";
import { CategoryDetailModal } from "@/components/CategoryDetailModal";
import { Transaction, RecurringItem, AIInsightData } from "@/types/finance";
import { CATEGORY_COLORS, CATEGORY_ICONS } from "@/constants/categories";
import { useAutoLock } from "@/hooks/useAutoLock";
import { useFinanceQueries } from "@/hooks/useFinanceQueries";
import { CsvImportModal } from "@/components/CsvImportModal";
import {
  startAuthentication,
  startRegistration,
  browserSupportsWebAuthn,
} from "@simplewebauthn/browser";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
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
  RefreshCw,
  Lightbulb,
  ShieldCheck,
  Zap,
  Lock,
  HelpCircle,
  Fingerprint,
  LogOut,
  Search,
  X,
} from "lucide-react";

/** Резервний курс для ручного списання USD, якщо API банку тимчасово недоступне */
const DEFAULT_USD_RATE = 44.5;

export default function Dashboard() {
  // Сесія користувача та аутентифікація
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [pinInput, setPinInput] = useState("");
  const [pinError, setPinError] = useState("");
  const [isVerifyingPin, setIsVerifyingPin] = useState(false);

  // Сховище фінансових даних
  // Кешовані дані через React Query
  const {
    transactions: rawTransactions,
    recurring,
    invalidateTransactions,
    invalidateRecurring,
  } = useFinanceQueries(isAuthenticated);

  // Відсікаємо транзакції, які позначені як виключені з поточного бюджету
  const transactions = useMemo(() => {
    return rawTransactions.filter((t: Transaction) => !t.exclude_from_budget);
  }, [rawTransactions]);
  const [activeTab, setActiveTab] = useState<
    "overview" | "history" | "recurring"
  >("overview");

  // Активний період перегляду
  const [selectedDate, setSelectedDate] = useState(() => new Date());

  // Ліміт бюджету
  const [budgetLimit, setBudgetLimit] = useState<number>(30000);
  const [isEditingBudget, setIsEditingBudget] = useState(false);
  const [tempBudgetInput, setTempBudgetInput] = useState("30000");

  // Обчислення аналітичних показників через кастомний хук
  const {
    selectedMonthKey,
    monthLabel,
    filteredTransactions,
    previousMonthTransactions,
    recurringTotal,
    totalSpent,
    budgetMetrics,
    categoryStats,
    dailyStats,
  } = useBudgetMetrics({
    transactions,
    recurring,
    budgetLimit,
    selectedDate,
  });

  // Стани для рядка пошуку та обраного тегу
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTag, setActiveTag] = useState<string | null>(null);

  // Збір усіх унікальних тегів із транзакцій поточного місяця
  const availableTags = useMemo<string[]>(() => {
    const tagsSet = new Set<string>();
    filteredTransactions.forEach((tx) => {
      tx.tags?.forEach((tag: string) => tagsSet.add(tag));
    });
    return Array.from(tagsSet);
  }, [filteredTransactions]);

  // Транзакції для відображення у списку (місяць + активний тег + текст пошуку)
  const displayedTransactions = useMemo<Transaction[]>(() => {
    return filteredTransactions.filter((t: Transaction) => {
      if (activeTag && (!t.tags || !t.tags.includes(activeTag))) {
        return false;
      }

      if (!searchQuery.trim()) return true;

      const query = searchQuery.toLowerCase().trim();
      const merchantMatch = t.merchant_raw?.toLowerCase().includes(query);
      const categoryMatch = t.category_name?.toLowerCase().includes(query);
      const amountMatch = String(t.amount).includes(query);
      const tagsMatch = t.tags?.some((tag: string) =>
        tag.toLowerCase().includes(query.replace(/^#/, ""))
      );

      return Boolean(
        merchantMatch || categoryMatch || amountMatch || tagsMatch
      );
    });
  }, [filteredTransactions, activeTag, searchQuery]);

  // Стани модальних вікон
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);
  const [isAddingRecurring, setIsAddingRecurring] = useState(false);
  const [editingRecurring, setEditingRecurring] =
    useState<RecurringItem | null>(null);
  const [isExecutingRecurring, setIsExecutingRecurring] = useState<
    number | null
  >(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  // Gemini AI аналітика
  const [aiInsight, setAiInsight] = useState<AIInsightData | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // Перевірка активної HTTP-only cookie сесії
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

  // Виклик Face ID для розблокування
  const handleBiometricLogin = async () => {
    setPinError("");
    setIsVerifyingPin(true);

    try {
      const optsRes = await fetch("/api/auth/webauthn/login");
      if (!optsRes.ok) {
        const err = await optsRes.json();
        throw new Error(err.error || "Біометрія недоступна");
      }
      const options = await optsRes.json();

      // Запуск системного вікна Face ID / Touch ID
      const authResp = await startAuthentication({ optionsJSON: options });

      const verifyRes = await fetch("/api/auth/webauthn/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(authResp),
      });

      if (verifyRes.ok) {
        setIsAuthenticated(true);
      } else {
        const err = await verifyRes.json();
        setPinError(err.error || "Не вдалося розпізнати");
      }
    } catch (err: any) {
      if (err.name !== "NotAllowedError") {
        setPinError(err.message || "Помилка Face ID");
      }
    } finally {
      setIsVerifyingPin(false);
    }
  };

  // Прив'язка поточного пристрою (викликається один раз після входу)
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
    setAiInsight(null);
  };

  const handleNextMonth = () => {
    setSelectedDate(
      (prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1)
    );
    setAiInsight(null);
  };

  // Повне блокування та очищення сесії
  const handleLogout = async () => {
    setIsAuthenticated(false);
    setPinInput("");
    setPinError("");
    await fetch("/api/auth", { method: "DELETE" }).catch(() => null);
  };

  // Автоблокування при неактивності або згортанні PWA
  useAutoLock({
    isAuthenticated,
    onLock: () => {
      setIsAuthenticated(false);
      setPinInput("");
    },
    inactivityTimeoutMs: 7 * 60 * 1000, // 5 хвилин відсутності дій
    maxBackgroundTimeMs: 5 * 60 * 1000, // 2 хвилини у згорнутому стані
  });

  // Початкове завантаження даних та підписка на Realtime
  useEffect(() => {
    if (!isAuthenticated) return;

    const txChannel = supabase
      .channel("realtime-transactions")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "transactions" },
        () => {
          invalidateTransactions();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(txChannel);
    };
  }, [isAuthenticated, invalidateTransactions]);

  // Завантаження ліміту бюджету для обраного періоду
  useEffect(() => {
    if (!isAuthenticated) return;

    const fetchBudget = async () => {
      const { data } = await supabase
        .from("budgets")
        .select("amount")
        .eq("month", selectedMonthKey)
        .maybeSingle();

      if (data?.amount) {
        const val = Number(data.amount);
        setBudgetLimit(val);
        setTempBudgetInput(val.toString());
      } else {
        setBudgetLimit(30000);
        setTempBudgetInput("30000");
      }
    };

    fetchBudget();
  }, [selectedMonthKey, isAuthenticated]);

  // Запит аналітичного звіту від Gemini AI
  const handleGenerateInsight = async () => {
    setIsAnalyzing(true);
    try {
      const topTransactions = [...filteredTransactions]
        .sort((a, b) => Number(b.amount) - Number(a.amount))
        .slice(0, 5)
        .map((t) => ({
          merchant: t.merchant_raw,
          amount: t.amount,
          category: t.category_name,
        }));

      const payload = {
        month: monthLabel,
        budgetLimit,
        totalSpent,
        remaining: budgetMetrics.remaining,
        daysRemaining: budgetMetrics.daysRemaining,
        safeDailySpend: budgetMetrics.safeDailySpend,
        categories: categoryStats,
        recurringTotal,
        topTransactions,
      };

      const res = await fetch("/api/ai-insights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        const data = await res.json();
        setAiInsight(data);
      }
    } catch (err) {
      console.error("Failed to generate AI insights", err);
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Створення / оновлення підписки через відокремлений RecurringModal
  const handleSaveRecurring = async (formData: {
    id?: number;
    title: string;
    amount: number;
    currency: "UAH" | "USD";
    category_name: string;
    day_of_month: number;
  }) => {
    if (formData.id) {
      await fetch("/api/recurring", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
    } else {
      const newItem = { ...formData, is_active: true };
      await supabase.from("recurring_templates").insert(newItem);
    }
    invalidateRecurring();
    setIsAddingRecurring(false);
    setEditingRecurring(null);
  };

  // Видалення шаблону підписки
  const handleDeleteRecurring = async (id: number) => {
    await fetch(`/api/recurring?id=${id}`, { method: "DELETE" });
    invalidateRecurring();
    setIsAddingRecurring(false);
    setEditingRecurring(null);
  };

  // Позачергове ручне проведення підписки
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
        currency: "UAH",
        merchant_raw: merchantTitle,
        category_name: item.category_name,
        source: "recurring",
        type: "expense",
      };

      const { error } = await supabase.from("transactions").insert([newTx]);

      if (error) throw error;

      invalidateTransactions();
    } catch (err) {
      console.error("Помилка списання:", err);
    } finally {
      setIsExecutingRecurring(null);
    }
  };

  // Збереження місячного ліміту бюджету
  const handleSaveBudget = async () => {
    const parsed = parseFloat(tempBudgetInput);
    if (!isNaN(parsed) && parsed > 0) {
      setBudgetLimit(parsed);
      await supabase.from("budgets").upsert(
        {
          month: selectedMonthKey,
          amount: parsed,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "month" }
      );
    }
    setIsEditingBudget(false);
  };

  // Оновлення категорії операції
  const handleUpdateCategory = async (txId: number, newCategory: string) => {
    setSelectedTx(null);
    await fetch("/api/transactions", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: txId, category_name: newCategory }),
    });
    invalidateTransactions();
  };

  // Оновлення списку тегів транзакції
  const handleUpdateTags = async (txId: number, newTags: string[]) => {
    await fetch("/api/transactions", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: txId, tags: newTags }),
    });
    invalidateTransactions();
  };

  // Видалення транзакції
  const handleDeleteTransaction = async (txId: number) => {
    setSelectedTx(null);
    await fetch(`/api/transactions?id=${txId}`, { method: "DELETE" });
    invalidateTransactions();
  };

  // Екран перевірки наявності сесії
  if (isAuthenticated === null) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-black">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-700 border-t-white" />
      </main>
    );
  }

  // Екран введення PIN-коду
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
    <main className="mx-auto min-h-screen max-w-7xl bg-black px-4 pt-28 pb-24 font-sans text-white antialiased sm:px-8 md:pt-10 lg:px-12">
      {/* Навігація календарних періодів */}
      <div className="mb-4 flex items-center justify-between rounded-xl border border-zinc-900 bg-zinc-950 px-3.5 py-2">
        <button
          onClick={handlePrevMonth}
          className="rounded-lg p-1.5 text-zinc-400 transition-all hover:bg-zinc-900 hover:text-white"
        >
          <ChevronLeft size={18} />
        </button>
        <div className="flex items-center gap-2">
          <Calendar size={14} className="text-zinc-500" />
          <span className="text-sm font-semibold text-zinc-200 capitalize">
            {monthLabel}
          </span>
        </div>
        <button
          onClick={handleNextMonth}
          className="rounded-lg p-1.5 text-zinc-400 transition-all hover:bg-zinc-900 hover:text-white"
        >
          <ChevronRight size={18} />
        </button>
      </div>

      {/* Головний підсумок витрат та лічильники */}
      <header className="mb-6 flex flex-col justify-between gap-4 border-b border-zinc-800/80 pb-6 md:flex-row md:items-end">
        <div>
          <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold tracking-widest text-zinc-400 uppercase">
            <TrendingUp size={14} className="text-emerald-400" /> Витрачено за
            період
          </p>
          <h1 className="text-4xl font-extrabold tracking-tight md:text-5xl">
            {totalSpent.toLocaleString("uk-UA", { minimumFractionDigits: 2 })}{" "}
            <span className="text-3xl font-light text-zinc-500">₴</span>
          </h1>
        </div>

        <div className="flex items-center gap-3 text-xs text-zinc-400">
          <div className="rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-1.5">
            Постійні:{" "}
            <span className="font-semibold text-white">
              {recurringTotal.toLocaleString("uk-UA")} ₴
            </span>
          </div>
          <div className="rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-1.5">
            Транзакцій:{" "}
            <span className="font-semibold text-white">
              {filteredTransactions.length}
            </span>
          </div>
          {/* 👇 Кнопка імпорту виписки Приват24 */}
          <CsvImportModal onSuccess={() => window.location.reload()} />
          {/* Кнопка прив'язки біометрії поточного пристрою */}
          <button
            onClick={handleRegisterDevice}
            title="Налаштувати Face ID / Touch ID для цього пристрою"
            className="flex items-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 py-1.5 text-zinc-400 transition-all hover:border-zinc-700 hover:text-white"
          >
            <Fingerprint size={14} />
            <span className="hidden sm:inline">Face ID</span>
          </button>
          {/* Кнопка ручного блокування екрана */}
          <button
            onClick={handleLogout}
            title="Заблокувати додаток"
            className="flex items-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 py-1.5 text-zinc-400 transition-all hover:border-rose-900/60 hover:bg-rose-950/30 hover:text-rose-400"
          >
            <LogOut size={14} />
            <span className="hidden sm:inline">Вийти</span>
          </button>
        </div>
      </header>

      {/* Картка місячного ліміту бюджету */}
      <section className="mb-8 rounded-2xl border border-zinc-900 bg-zinc-950 p-5 shadow-sm">
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
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={tempBudgetInput}
                onChange={(e) => setTempBudgetInput(e.target.value)}
                className="w-28 rounded-lg border border-zinc-700 bg-zinc-900 px-2.5 py-1 text-xs text-white focus:border-emerald-500 focus:outline-none"
                autoFocus
              />
              <button
                onClick={handleSaveBudget}
                className="rounded-lg bg-emerald-600 p-1.5 text-white transition-all hover:bg-emerald-500"
              >
                <Check size={13} />
              </button>
            </div>
          ) : (
            <button
              onClick={() => setIsEditingBudget(true)}
              className="flex items-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 py-1 text-xs text-zinc-400 transition-all hover:border-zinc-700 hover:text-white"
            >
              <span className="font-semibold text-zinc-200">
                {budgetLimit.toLocaleString("uk-UA")} ₴
              </span>
              <Pencil size={11} className="text-zinc-500" />
            </button>
          )}
        </div>

        <div className="mb-4 h-2 w-full overflow-hidden rounded-full border border-zinc-800/60 bg-zinc-900">
          <div
            className="h-full rounded-full transition-all duration-700 ease-out"
            style={{
              width: `${budgetMetrics.spentPercent}%`,
              backgroundColor: budgetMetrics.barColor,
            }}
          />
        </div>

        <div className="grid grid-cols-2 gap-3 border-t border-zinc-900 pt-1 text-xs sm:grid-cols-3">
          <div>
            <p className="mb-0.5 text-zinc-500">Залишок</p>
            <p
              className={`text-sm font-bold ${
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
            <p className="text-sm font-bold text-zinc-200">
              {budgetMetrics.isCurrentMonth
                ? `~${Math.round(budgetMetrics.safeDailySpend).toLocaleString("uk-UA")} ₴/д`
                : "Період минув"}
            </p>
          </div>

          <div className="col-span-2 flex items-center gap-1.5 text-zinc-400 sm:col-span-1">
            <Calendar size={13} className="shrink-0 text-zinc-500" />
            <span>
              {budgetMetrics.isCurrentMonth ? (
                <>
                  Залишилось{" "}
                  <strong className="text-zinc-200">
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
        <button
          onClick={() => setActiveTab("recurring")}
          className={`flex-1 rounded-lg py-2 text-xs font-semibold transition-all ${
            activeTab === "recurring"
              ? "bg-zinc-800 text-white shadow"
              : "text-zinc-400 hover:text-white"
          }`}
        >
          Постійні ({recurring.length})
        </button>
      </div>

      {/* Основна сітка */}
      <div className="grid grid-cols-1 items-start gap-8 md:grid-cols-12">
        {/* Ліва колонка */}
        <section
          className={`space-y-6 md:col-span-7 ${
            activeTab === "overview" ? "block" : "hidden md:block"
          }`}
        >
          {/* Рекомендації від Gemini AI */}
          <div className="relative overflow-hidden rounded-2xl border border-zinc-800/80 bg-gradient-to-b from-zinc-900/80 to-zinc-950 p-5 shadow-lg">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="rounded-lg bg-indigo-500/20 p-1.5 text-indigo-400">
                  <Sparkles size={16} />
                </div>
                <div>
                  <h3 className="text-xs font-bold tracking-wider text-zinc-300 uppercase">
                    AI Фінансовий Аналітик
                  </h3>
                  <p className="text-[11px] text-zinc-500">
                    Аналіз витрат та стратегія оптимізації
                  </p>
                </div>
              </div>

              <button
                onClick={handleGenerateInsight}
                disabled={isAnalyzing || filteredTransactions.length === 0}
                className="flex items-center gap-1.5 rounded-xl border border-zinc-700/60 bg-zinc-800 px-3 py-1.5 text-xs font-semibold text-white transition-all hover:bg-zinc-700 disabled:opacity-50"
              >
                <RefreshCw
                  size={12}
                  className={isAnalyzing ? "animate-spin" : ""}
                />
                {isAnalyzing
                  ? "Аналізую..."
                  : aiInsight
                    ? "Оновити"
                    : "Аналізувати"}
              </button>
            </div>

            {aiInsight ? (
              <div className="animate-in fade-in space-y-4 text-xs duration-300">
                <div className="flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-900/60 p-3">
                  <div className="flex items-center gap-2">
                    {aiInsight.status === "safe" ? (
                      <ShieldCheck size={16} className="text-emerald-400" />
                    ) : aiInsight.status === "warning" ? (
                      <Zap size={16} className="text-amber-400" />
                    ) : (
                      <AlertTriangle size={16} className="text-rose-400" />
                    )}
                    <span className="font-semibold text-zinc-200">
                      {aiInsight.summary}
                    </span>
                  </div>
                </div>

                {aiInsight.anomalies?.length > 0 && (
                  <div>
                    <p className="mb-1.5 text-[11px] font-semibold tracking-wider text-zinc-500 uppercase">
                      Виявлені аномалії
                    </p>
                    <ul className="space-y-1">
                      {aiInsight.anomalies.map((item, idx) => (
                        <li
                          key={idx}
                          className="flex items-start gap-2 text-zinc-300"
                        >
                          <span className="mt-0.5 text-zinc-600">•</span>
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {aiInsight.saving_tactics?.length > 0 && (
                  <div className="border-zinc-850 rounded-xl border bg-zinc-900/40 p-3">
                    <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold tracking-wider text-emerald-400 uppercase">
                      <Lightbulb size={13} /> Як заощадити кошти
                    </p>
                    <div className="space-y-1.5">
                      {aiInsight.saving_tactics.map((tactic, idx) => (
                        <div
                          key={idx}
                          className="flex items-start gap-2 text-zinc-300"
                        >
                          <span className="mt-0.5 font-mono text-[10px] text-zinc-500">
                            {idx + 1}.
                          </span>
                          <span>{tactic}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {aiInsight.forecast && (
                  <p className="border-t border-zinc-900 pt-1 text-[11px] text-zinc-500 italic">
                    <strong className="text-zinc-400 not-italic">
                      Прогноз:
                    </strong>{" "}
                    {aiInsight.forecast}
                  </p>
                )}
              </div>
            ) : (
              <div className="py-6 text-center text-xs text-zinc-500">
                {filteredTransactions.length === 0 ? (
                  "Немає транзакцій за цей місяць для формування аналітики"
                ) : (
                  <>
                    Натисніть{" "}
                    <strong className="text-zinc-300">«Аналізувати»</strong>,
                    щоб отримати структурований аналіз структури витрат та план
                    заощадження від Gemini AI.
                  </>
                )}
              </div>
            )}
          </div>

          {/* Діаграма витрат за днями */}
          <div className="rounded-2xl border border-zinc-900 bg-zinc-950 p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <p className="text-xs font-semibold tracking-wider text-zinc-400 uppercase">
                Динаміка витрат за днями
              </p>
              <span className="font-mono text-xs text-zinc-500">UAH</span>
            </div>

            {dailyStats.length > 0 ? (
              <div className="h-48 w-full md:h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={dailyStats}
                    margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                  >
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
                      cursor={{ fill: "rgba(255, 255, 255, 0.05)" }}
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          return (
                            <div className="rounded-lg border border-zinc-700 bg-zinc-800/95 px-3 py-1.5 text-xs shadow-xl backdrop-blur">
                              <p className="text-zinc-400">
                                {payload[0].payload.date}
                              </p>
                              <p className="font-bold text-white">
                                {payload[0].value} ₴
                              </p>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <Bar dataKey="amount" radius={[6, 6, 0, 0]}>
                      {dailyStats.map((_, index) => (
                        <Cell key={`cell-${index}`} fill="#3B82F6" />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="flex h-40 items-center justify-center text-xs text-zinc-600">
                Немає даних за цей місяць
              </div>
            )}
          </div>

          {/* Структура категорій */}
          <div className="rounded-2xl border border-zinc-900 bg-zinc-950 p-5 shadow-sm">
            <h2 className="mb-4 text-xs font-semibold tracking-wider text-zinc-400 uppercase">
              Структура витрат за категоріями
            </h2>

            {categoryStats.length === 0 ? (
              <p className="py-4 text-sm text-zinc-600">
                Категорії ще не сформовані
              </p>
            ) : (
              <div className="space-y-3.5">
                {categoryStats.map((cat) => {
                  const IconComponent = CATEGORY_ICONS[cat.name] || HelpCircle;
                  return (
                    <div
                      key={cat.name}
                      onClick={() => setSelectedCategory(cat.name)}
                      className="cursor-pointer rounded-xl border border-zinc-800/60 bg-zinc-900/40 p-3.5 transition-all hover:border-zinc-700/70 hover:bg-zinc-900/70 active:scale-[0.99]"
                    >
                      <div className="mb-2.5 flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          <div
                            className="rounded-lg p-2"
                            style={{
                              backgroundColor: `${cat.color}20`,
                              color: cat.color,
                            }}
                          >
                            <IconComponent size={16} />
                          </div>
                          <span className="text-sm font-medium text-zinc-200">
                            {cat.name}
                          </span>
                        </div>
                        <div className="text-right">
                          <span className="text-sm font-semibold text-white">
                            {cat.amount.toLocaleString("uk-UA")} ₴
                          </span>
                          <span className="ml-2 font-mono text-xs text-zinc-500">
                            {cat.percentage}%
                          </span>
                        </div>
                      </div>

                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-800/80">
                        <div
                          className="h-full rounded-full transition-all duration-700 ease-out"
                          style={{
                            width: `${cat.percentage}%`,
                            backgroundColor: cat.color,
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        {/* Права колонка */}
        <section
          className={`space-y-6 md:col-span-5 ${
            activeTab === "history" || activeTab === "recurring"
              ? "block"
              : "hidden md:block"
          }`}
        >
          {/* Графік темпу спалювання бюджету (Burn Rate) */}
          <div className="mb-6">
            <BurnRateChart
              transactions={filteredTransactions}
              budgetLimit={budgetLimit}
              recurringTotal={recurringTotal}
              selectedMonthKey={selectedMonthKey}
            />
          </div>

          {/* Порівняння з минулим місяцем (MoM) */}
          <div className="mb-6">
            <MoMComparison
              currentTransactions={filteredTransactions}
              previousTransactions={previousMonthTransactions}
              currentMonthLabel="Цей місяць"
              previousMonthLabel="Мин. місяць"
            />
          </div>

          {/* Блок постійних платежів */}
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

          {/* Журнал останніх операцій */}
          <div className="rounded-2xl border border-zinc-900 bg-zinc-950 p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="flex items-center gap-1.5 text-xs font-semibold tracking-wider text-zinc-400 uppercase">
                <Receipt size={14} className="text-zinc-500" /> Транзакції за
                місяць
              </h2>
              <span className="text-xs text-zinc-500">
                {displayedTransactions.length} оп.
              </span>
            </div>

            {/* Панель пошуку та фільтрації за тегами */}
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
              <div className="max-h-[500px] space-y-2.5 overflow-y-auto pr-1">
                {displayedTransactions.map((t: Transaction) => {
                  const IconComponent =
                    CATEGORY_ICONS[t.category_name] || HelpCircle;
                  const iconColor =
                    CATEGORY_COLORS[t.category_name] || "#71717A";

                  return (
                    <div
                      key={t.id}
                      onClick={() => setSelectedTx(t)}
                      className="group flex cursor-pointer items-center justify-between rounded-xl border border-zinc-800/60 bg-zinc-900/40 p-3 transition-all hover:border-zinc-700 hover:bg-zinc-900/80 active:scale-[0.99]"
                    >
                      <div className="flex items-center space-x-3">
                        <div
                          className="shrink-0 rounded-lg p-2 transition-transform group-hover:scale-105"
                          style={{
                            backgroundColor: `${iconColor}15`,
                            color: iconColor,
                          }}
                        >
                          <IconComponent size={16} />
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-zinc-100 group-hover:text-white">
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
                          {/* 👇 БЛОК ТЕГІВ: вставляємо тут, перед закриваючим </div> */}
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
                      <span className="ml-2 text-sm font-bold tracking-tight whitespace-nowrap text-white">
                        -{Number(t.amount).toFixed(2)} ₴
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      </div>

      {/* Деталізація витрат по вибраній категорії */}
      <CategoryDetailModal
        categoryName={selectedCategory}
        transactions={filteredTransactions}
        onClose={() => setSelectedCategory(null)}
        onSelectTransaction={(tx) => {
          setSelectedTx(tx);
        }}
      />

      {/* Відокремлена модалка підписок */}
      <RecurringModal
        isOpen={isAddingRecurring}
        item={editingRecurring}
        onClose={() => setIsAddingRecurring(false)}
        onSave={handleSaveRecurring}
        onDelete={handleDeleteRecurring}
      />

      {/* Відокремлена панель дій транзакції */}
      <TransactionActionSheet
        transaction={selectedTx}
        onClose={() => setSelectedTx(null)}
        onUpdateCategory={handleUpdateCategory}
        onUpdateTags={handleUpdateTags}
        onDelete={handleDeleteTransaction}
      />
    </main>
  );
}
