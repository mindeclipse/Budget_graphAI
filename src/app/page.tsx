"use client";

import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { BurnRateChart } from "@/components/BurnRateChart";
import { MoMComparison } from "@/components/MoMComparison";
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
  ShoppingBag,
  Coffee,
  Car,
  Tv,
  HeartPulse,
  Home,
  Shirt,
  HandHeart,
  HelpCircle,
  TrendingUp,
  Receipt,
  Pencil,
  Check,
  Calendar,
  AlertTriangle,
  X,
  Trash2,
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
} from "lucide-react";

/** Одинична фінансова операція з бази даних */
interface Transaction {
  id: number;
  amount: number;
  currency: string;
  merchant_raw: string;
  category_name: string;
  source: string;
  created_at: string;
}

/** Шаблон повторюваного регулярного платежу чи підписки */
interface RecurringItem {
  id: number;
  title: string;
  amount: number;
  currency?: "UAH" | "USD";
  category_name: string;
  day_of_month: number;
  is_active: boolean;
}

/** Структурована відповідь аналітичного модуля Gemini AI */
interface AIInsightData {
  status: "safe" | "warning" | "danger";
  summary: string;
  anomalies: string[];
  saving_tactics: string[];
  forecast: string;
}

/** Орієнтовний курс для зведення загальної суми підписок у гривні */
const ESTIMATED_USD_RATE = 41.8;

/** Довідник базових категорій витрат */
const CATEGORIES = [
  "Продукти",
  "Кафе та ресторани",
  "Транспорт",
  "Підписки та сервіси",
  "Здоров'я та догляд",
  "Дім та побут",
  "Одяг та взуття",
  "Благодійність",
  "Інше",
] as const;

/** Палітра кольорів категорій для графіків та індикаторів */
const CATEGORY_COLORS: Record<string, string> = {
  Продукти: "#10B981",
  "Кафе та ресторани": "#F59E0B",
  Транспорт: "#3B82F6",
  "Підписки та сервіси": "#8B5CF6",
  "Здоров'я та догляд": "#EC4899",
  "Дім та побут": "#14B8A6",
  "Одяг та взуття": "#F97316",
  Благодійність: "#EF4444",
  Інше: "#6B7280",
};

/** Відповідність категорій векторним піктограмам */
const CATEGORY_ICONS: Record<string, any> = {
  Продукти: ShoppingBag,
  "Кафе та ресторани": Coffee,
  Транспорт: Car,
  "Підписки та сервіси": Tv,
  "Здоров'я та догляд": HeartPulse,
  "Дім та побут": Home,
  "Одяг та взуття": Shirt,
  Благодійність: HandHeart,
  Інше: HelpCircle,
};

/**
 * Розраховує ключ попереднього календарного місяця у форматі YYYY-MM.
 * Використовується для побудови порівняльної аналітики MoM (Month-over-Month).
 */
function getPreviousMonthKey(monthKey: string): string {
  const [year, month] = monthKey.split("-").map(Number);
  const prevDate = new Date(year, month - 2, 1);
  const prevYear = prevDate.getFullYear();
  const prevMonth = String(prevDate.getMonth() + 1).padStart(2, "0");
  return `${prevYear}-${prevMonth}`;
}

export default function Dashboard() {
  // Аутентифікація та сесія користувача
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [pinInput, setPinInput] = useState("");
  const [pinError, setPinError] = useState("");
  const [isVerifyingPin, setIsVerifyingPin] = useState(false);

  // Сховище фінансових даних
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [recurring, setRecurring] = useState<RecurringItem[]>([]);
  const [recurringCurrency, setRecurringCurrency] = useState<"UAH" | "USD">(
    "UAH"
  );
  const [activeTab, setActiveTab] = useState<
    "overview" | "history" | "recurring"
  >("overview");

  // Вибір активного календарного періоду
  const [selectedDate, setSelectedDate] = useState(() => new Date());

  // Ключ активного місяця для фільтрації та запиту бюджету ("YYYY-MM")
  const selectedMonthKey = useMemo(() => {
    return `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, "0")}`;
  }, [selectedDate]);

  // Локалізована назва місяця для заголовків ("вересень 2026")
  const monthLabel = useMemo(() => {
    return selectedDate.toLocaleDateString("uk-UA", {
      month: "long",
      year: "numeric",
    });
  }, [selectedDate]);

  // Керування лімітом витрат
  const [budgetLimit, setBudgetLimit] = useState<number>(30000);
  const [isEditingBudget, setIsEditingBudget] = useState(false);
  const [tempBudgetInput, setTempBudgetInput] = useState("30000");

  // Швидке контекстне редагування транзакції
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);

  // Стан форми створення та редагування підписок
  const [isAddingRecurring, setIsAddingRecurring] = useState(false);
  const [editingRecurring, setEditingRecurring] =
    useState<RecurringItem | null>(null);
  const [isSubmittingRecurring, setIsSubmittingRecurring] = useState<
    number | null
  >(null);
  const [recTitleInput, setRecTitleInput] = useState("");
  const [recAmountInput, setRecAmountInput] = useState("");
  const [recCategoryInput, setRecCategoryInput] = useState<string>(
    "Підписки та сервіси"
  );
  const [recDayInput, setRecDayInput] = useState("1");

  // Аналітичний висновок Gemini AI
  const [aiInsight, setAiInsight] = useState<AIInsightData | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // Перевірка активної HTTP-only cookie сесії при первинному завантаженні
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

  // Обробка введення PIN-коду та створення сесії
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

  // Перемикання на попередній календарний місяць
  const handlePrevMonth = () => {
    setSelectedDate(
      (prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1)
    );
    setAiInsight(null);
  };

  // Перемикання на наступний календарний місяць
  const handleNextMonth = () => {
    setSelectedDate(
      (prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1)
    );
    setAiInsight(null);
  };

  // Завантаження вихідних даних та підписка на Realtime-зміни в базі
  useEffect(() => {
    if (!isAuthenticated) return;

    const fetchData = async () => {
      const [txRes, recRes] = await Promise.all([
        supabase
          .from("transactions")
          .select("*")
          .order("created_at", { ascending: false }),
        supabase
          .from("recurring_templates")
          .select("*")
          .order("day_of_month", { ascending: true }),
      ]);

      if (txRes.data) setTransactions(txRes.data);
      if (recRes.data) setRecurring(recRes.data as RecurringItem[]);
    };

    fetchData();

    // Канал реального часу для синхронізації змін без перезавантаження сторінки
    const txChannel = supabase
      .channel("realtime-transactions")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "transactions" },
        (payload) => {
          if (payload.eventType === "INSERT") {
            const newTx = payload.new as Transaction;
            setTransactions((prev) => {
              if (prev.some((t) => t.id === newTx.id)) return prev;
              return [newTx, ...prev];
            });
          } else if (payload.eventType === "UPDATE") {
            setTransactions((prev) =>
              prev.map((t) =>
                t.id === payload.new.id ? (payload.new as Transaction) : t
              )
            );
          } else if (payload.eventType === "DELETE") {
            setTransactions((prev) =>
              prev.filter((t) => t.id !== payload.old.id)
            );
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(txChannel);
    };
  }, [isAuthenticated]);

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

  // Фільтрація транзакцій за обраний у календарі місяць
  const filteredTransactions = useMemo(() => {
    return transactions.filter((t) => {
      const d = new Date(t.created_at);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      return key === selectedMonthKey;
    });
  }, [transactions, selectedMonthKey]);

  // Обчислення ключа та вибірки попереднього місяця для блоку MoM
  const prevMonthKey = useMemo(
    () => getPreviousMonthKey(selectedMonthKey),
    [selectedMonthKey]
  );

  const previousMonthTransactions = useMemo(() => {
    return transactions.filter((t) => {
      const d = new Date(t.created_at);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      return key === prevMonthKey;
    });
  }, [transactions, prevMonthKey]);

  // Загальна вартість активних регулярних підписок (з конвертацією USD в UAH)
  const recurringTotal = useMemo(() => {
    return recurring
      .filter((r) => r.is_active)
      .reduce((acc, r) => {
        const amt = Number(r.amount) || 0;
        return acc + (r.currency === "USD" ? amt * ESTIMATED_USD_RATE : amt);
      }, 0);
  }, [recurring]);

  // Фактична сума витрат за поточний місяць
  const totalSpent = useMemo(() => {
    return filteredTransactions.reduce((acc, t) => acc + Number(t.amount), 0);
  }, [filteredTransactions]);

  // Метрики темпу витрат, залишку та рекомендованої денної норми
  const budgetMetrics = useMemo(() => {
    const now = new Date();
    const isCurrentMonth =
      now.getFullYear() === selectedDate.getFullYear() &&
      now.getMonth() === selectedDate.getMonth();

    const totalDaysInMonth = new Date(
      selectedDate.getFullYear(),
      selectedDate.getMonth() + 1,
      0
    ).getDate();

    let daysRemaining = 0;
    if (isCurrentMonth) {
      daysRemaining = Math.max(1, totalDaysInMonth - now.getDate() + 1);
    }

    const remaining = budgetLimit - totalSpent;
    const spentPercent = budgetLimit > 0 ? (totalSpent / budgetLimit) * 100 : 0;
    const safeDailySpend =
      daysRemaining > 0 && remaining > 0 ? remaining / daysRemaining : 0;

    let barColor = "#10B981";
    if (spentPercent > 95) barColor = "#EF4444";
    else if (spentPercent > 75) barColor = "#F59E0B";

    return {
      isCurrentMonth,
      remaining,
      spentPercent: Math.min(100, spentPercent),
      exactPercent: spentPercent,
      safeDailySpend,
      daysRemaining,
      barColor,
    };
  }, [totalSpent, budgetLimit, selectedDate]);

  // Агрегація витрат за категоріями для побудови шкали часток
  const categoryStats = useMemo(() => {
    const stats: Record<string, number> = {};
    filteredTransactions.forEach((t) => {
      const cat = t.category_name || "Інше";
      stats[cat] = (stats[cat] || 0) + Number(t.amount);
    });

    return Object.entries(stats)
      .map(([name, amount]) => ({
        name,
        amount,
        percentage:
          totalSpent > 0 ? Math.round((amount / totalSpent) * 100) : 0,
        color: CATEGORY_COLORS[name] || "#6B7280",
      }))
      .sort((a, b) => b.amount - a.amount);
  }, [filteredTransactions, totalSpent]);

  // Генерація комплексного аналізу фінансового стану через Gemini API
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

  // Відкриття модалки додавання підписки з дефолтними полями
  const handleOpenAddRecurring = () => {
    setEditingRecurring(null);
    setRecTitleInput("");
    setRecAmountInput("");
    setRecurringCurrency("UAH");
    setRecCategoryInput("Підписки та сервіси");
    setRecDayInput("1");
    setIsAddingRecurring(true);
  };

  // Відкриття модалки для редагування існуючої підписки
  const handleOpenEditRecurring = (item: RecurringItem) => {
    setEditingRecurring(item);
    setRecTitleInput(item.title);
    setRecAmountInput(item.amount.toString());
    setRecurringCurrency(item.currency || "UAH");
    setRecCategoryInput(item.category_name);
    setRecDayInput(item.day_of_month.toString());
    setIsAddingRecurring(true);
  };

  // Збереження нового шаблону або оновлення існуючого
  const handleSaveRecurring = async () => {
    const amt = parseFloat(recAmountInput);
    if (!recTitleInput || isNaN(amt) || amt <= 0) return;

    if (editingRecurring) {
      const updatedPayload = {
        id: editingRecurring.id,
        title: recTitleInput,
        amount: amt,
        currency: recurringCurrency,
        category_name: recCategoryInput,
        day_of_month: parseInt(recDayInput) || 1,
      };

      setRecurring((prev) =>
        prev.map((r) =>
          r.id === editingRecurring.id ? { ...r, ...updatedPayload } : r
        )
      );
      setIsAddingRecurring(false);

      await fetch("/api/recurring", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updatedPayload),
      });
    } else {
      const newItem = {
        title: recTitleInput,
        amount: amt,
        currency: recurringCurrency,
        category_name: recCategoryInput,
        day_of_month: parseInt(recDayInput) || 1,
        is_active: true,
      };

      const { data } = await supabase
        .from("recurring_templates")
        .insert(newItem)
        .select()
        .single();

      if (data) {
        setRecurring((prev) => [...prev, data as RecurringItem]);
      }
      setIsAddingRecurring(false);
      setRecurringCurrency("UAH");
    }
  };

  // Видалення шаблону регулярного платежу
  const handleDeleteRecurring = async (id: number) => {
    setRecurring((prev) => prev.filter((r) => r.id !== id));
    setIsAddingRecurring(false);

    await fetch(`/api/recurring?id=${id}`, {
      method: "DELETE",
    });
  };

  // Ручне проведення регулярного платежу в журнал поточного місяця
  const handleExecuteRecurring = async (item: RecurringItem) => {
    if (isSubmittingRecurring === item.id) return;
    setIsSubmittingRecurring(item.id);

    try {
      const isUsd = item.currency === "USD";
      let finalAmount = Number(item.amount);
      let merchantTitle = item.title;

      if (isUsd) {
        const rateRes = await fetch("/api/currency/rate").catch(() => null);
        const rateData = rateRes?.ok
          ? await rateRes.json()
          : { rate: ESTIMATED_USD_RATE };
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

      const { data, error } = await supabase
        .from("transactions")
        .insert([newTx])
        .select()
        .single();

      if (error) throw error;

      if (data) {
        setTransactions((prev) => {
          if (prev.some((tx) => tx.id === data.id)) return prev;
          return [data, ...prev];
        });
      }
    } catch (err) {
      console.error("Помилка списання:", err);
    } finally {
      setIsSubmittingRecurring(null);
    }
  };

  // Збереження встановленого місячного бюджету в Supabase
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

  // Оновлення категорії операції з миттєвим відображенням у UI
  const handleUpdateCategory = async (txId: number, newCategory: string) => {
    setTransactions((prev) =>
      prev.map((t) =>
        t.id === txId ? { ...t, category_name: newCategory } : t
      )
    );
    setSelectedTx(null);

    await fetch("/api/transactions", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: txId, category_name: newCategory }),
    });
  };

  // Видалення транзакції
  const handleDeleteTransaction = async (txId: number) => {
    setTransactions((prev) => prev.filter((t) => t.id !== txId));
    setSelectedTx(null);

    await fetch(`/api/transactions?id=${txId}`, {
      method: "DELETE",
    });
  };

  // Агрегація витрат по окремих днях місяця для стовпчикового графіка
  const dailyStats = useMemo(() => {
    const daysMap: Record<string, number> = {};
    filteredTransactions.forEach((t) => {
      const date = new Date(t.created_at);
      const key = `${String(date.getDate()).padStart(2, "0")}.${String(
        date.getMonth() + 1
      ).padStart(2, "0")}`;
      daysMap[key] = (daysMap[key] || 0) + Number(t.amount);
    });

    return Object.entries(daysMap)
      .map(([date, amount]) => ({ date, amount }))
      .reverse();
  }, [filteredTransactions]);

  // Екран початкової ініціалізації перевірки доступу
  if (isAuthenticated === null) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-black">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-700 border-t-white" />
      </main>
    );
  }

  // Екран блокування доступу з введенням PIN-коду
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

            <button
              type="submit"
              disabled={isVerifyingPin || !pinInput}
              className="w-full rounded-2xl bg-white py-3 text-xs font-bold text-black transition-all hover:bg-zinc-200 disabled:opacity-40"
            >
              {isVerifyingPin ? "Перевірка..." : "Розблокувати"}
            </button>
          </form>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto min-h-screen max-w-7xl bg-black px-4 pt-28 pb-24 font-sans text-white antialiased sm:px-8 md:pt-10 lg:px-12">
      {/* Навігація між календарними місяцями */}
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

      {/* Головний підсумок витрат за місяць та ключові лічильники */}
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
        </div>
      </header>

      {/* Картка контролю ліміту бюджету */}
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

        {/* Шкала використання бюджету */}
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

      {/* Навігаційні вкладки для мобільних екранів */}
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

      {/* Основна сітка дашборду */}
      <div className="grid grid-cols-1 items-start gap-8 md:grid-cols-12">
        {/* Ліва колонка: Аналітика та розподіл витрат */}
        <section
          className={`space-y-6 md:col-span-7 ${
            activeTab === "overview" ? "block" : "hidden md:block"
          }`}
        >
          {/* Рекомендації та аудит від Gemini AI */}
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

          {/* Діаграма динаміки щоденних витрат */}
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

          {/* Розподіл витрат за категоріями */}
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
                      className="rounded-xl border border-zinc-800/60 bg-zinc-900/40 p-3.5 transition-all hover:border-zinc-700/70"
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

        {/* Права колонка: Burn Rate, MoM-порівняння, підписки та журнал */}
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
              selectedMonthKey={selectedMonthKey}
            />
          </div>

          {/* Порівняння динаміки витрат із минулим місяцем (MoM) */}
          <div className="mb-6">
            <MoMComparison
              currentTransactions={filteredTransactions}
              previousTransactions={previousMonthTransactions}
              currentMonthLabel="Цей місяць"
              previousMonthLabel="Мин. місяць"
            />
          </div>

          {/* Керування постійними витратами та підписками */}
          <div className="rounded-2xl border border-zinc-900 bg-zinc-950 p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Repeat size={15} className="text-violet-400" />
                <h2 className="text-xs font-semibold tracking-wider text-zinc-400 uppercase">
                  Постійні витрати
                </h2>
              </div>
              <button
                onClick={handleOpenAddRecurring}
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
                      onClick={() => handleOpenEditRecurring(item)}
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
                        onClick={() => handleOpenEditRecurring(item)}
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

          {/* Журнал останніх фінансових операцій */}
          <div className="rounded-2xl border border-zinc-900 bg-zinc-950 p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="flex items-center gap-1.5 text-xs font-semibold tracking-wider text-zinc-400 uppercase">
                <Receipt size={14} className="text-zinc-500" /> Транзакції за
                місяць
              </h2>
              <span className="text-xs text-zinc-500">
                {filteredTransactions.length} оп.
              </span>
            </div>

            {filteredTransactions.length === 0 ? (
              <div className="py-16 text-center text-zinc-600">
                <Receipt size={32} className="mx-auto mb-2 opacity-40" />
                <p className="text-sm">Транзакцій немає</p>
                <p className="mt-1 text-xs text-zinc-700">
                  У цьому місяці витрат не зафіксовано
                </p>
              </div>
            ) : (
              <div className="max-h-[500px] space-y-2.5 overflow-y-auto pr-1">
                {filteredTransactions.map((t) => {
                  const IconComponent =
                    CATEGORY_ICONS[t.category_name] || HelpCircle;
                  const iconColor =
                    CATEGORY_COLORS[t.category_name] || "#6B7280";

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

      {/* Модальне вікно створення та редагування підписки */}
      {isAddingRecurring && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm space-y-4 rounded-2xl border border-zinc-800 bg-zinc-950 p-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <h3 className="text-sm font-bold text-white">
                {editingRecurring
                  ? "Редагування постійної витрати"
                  : "Новий постійний платіж"}
              </h3>
              <button
                onClick={() => setIsAddingRecurring(false)}
                className="text-zinc-500 hover:text-white"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-[11px] font-semibold text-zinc-400">
                  Назва
                </label>
                <input
                  type="text"
                  placeholder="Оренда, зв'язок, підписка"
                  value={recTitleInput}
                  onChange={(e) => setRecTitleInput(e.target.value)}
                  className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs text-white focus:border-zinc-600 focus:outline-none"
                />
              </div>

              {/* Введення суми, валюти та дня щомісячного списання */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="mb-1 block text-[11px] font-semibold text-zinc-400">
                    Сума та валюта
                  </label>
                  <div className="flex gap-1.5">
                    <input
                      type="number"
                      step="any"
                      placeholder="100"
                      value={recAmountInput}
                      onChange={(e) => setRecAmountInput(e.target.value)}
                      className="w-full min-w-0 rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs text-white focus:border-zinc-600 focus:outline-none"
                    />
                    <select
                      value={recurringCurrency}
                      onChange={(e) =>
                        setRecurringCurrency(e.target.value as "UAH" | "USD")
                      }
                      className="rounded-xl border border-zinc-800 bg-zinc-900 px-2 py-2 text-xs font-semibold text-zinc-300 focus:border-zinc-600 focus:outline-none"
                    >
                      <option value="UAH">₴</option>
                      <option value="USD">$</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-[11px] font-semibold text-zinc-400">
                    День місяця
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="31"
                    value={recDayInput}
                    onChange={(e) => setRecDayInput(e.target.value)}
                    className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs text-white focus:border-zinc-600 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-[11px] font-semibold text-zinc-400">
                  Категорія
                </label>
                <select
                  value={recCategoryInput}
                  onChange={(e) => setRecCategoryInput(e.target.value)}
                  className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs text-white focus:border-zinc-600 focus:outline-none"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex items-center gap-2 pt-2">
              {editingRecurring && (
                <button
                  onClick={() => handleDeleteRecurring(editingRecurring.id)}
                  className="rounded-xl border border-rose-900/50 bg-rose-950/30 p-2 text-rose-400 transition-all hover:bg-rose-950/60"
                  title="Видалити цей регулярний платіж"
                >
                  <Trash2 size={15} />
                </button>
              )}
              <button
                onClick={() => setIsAddingRecurring(false)}
                className="flex-1 rounded-xl bg-zinc-900 py-2 text-xs text-zinc-400 transition-all hover:bg-zinc-800"
              >
                Скасувати
              </button>
              <button
                onClick={handleSaveRecurring}
                className="flex-1 rounded-xl bg-white py-2 text-xs font-semibold text-black transition-all hover:bg-zinc-200"
              >
                {editingRecurring ? "Оновити" : "Зберегти"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Меню швидких дій для транзакцій */}
      {selectedTx && (
        <div className="animate-in fade-in fixed inset-0 z-50 flex items-end justify-center bg-black/75 p-0 backdrop-blur-sm duration-150 sm:items-center sm:p-4">
          <div
            className="max-h-[85vh] w-full overflow-y-auto rounded-t-3xl border border-zinc-800 bg-zinc-950 p-5 shadow-2xl sm:max-w-md sm:rounded-2xl sm:p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-zinc-700/80 sm:hidden" />

            <div className="mb-5 flex items-start justify-between border-b border-zinc-800/80 pb-4">
              <div>
                <span className="text-xs font-medium tracking-wider text-zinc-400 uppercase">
                  Редагування операції
                </span>
                <h3 className="mt-0.5 text-lg font-bold text-white">
                  {selectedTx.merchant_raw}
                </h3>
                <p className="text-xs text-zinc-500">
                  {new Date(selectedTx.created_at).toLocaleString("uk-UA", {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-base font-extrabold text-white">
                  -{Number(selectedTx.amount).toFixed(2)} ₴
                </span>
                <button
                  onClick={() => setSelectedTx(null)}
                  className="rounded-lg border border-zinc-800 bg-zinc-900 p-1 text-zinc-400 hover:text-white"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            <div className="mb-6">
              <p className="mb-2.5 text-xs font-semibold tracking-wider text-zinc-400 uppercase">
                Оберіть правильну категорію
              </p>
              <div className="grid grid-cols-2 gap-2">
                {CATEGORIES.map((catName) => {
                  const Icon = CATEGORY_ICONS[catName] || HelpCircle;
                  const isCurrent = selectedTx.category_name === catName;
                  const color = CATEGORY_COLORS[catName] || "#6B7280";

                  return (
                    <button
                      key={catName}
                      onClick={() =>
                        handleUpdateCategory(selectedTx.id, catName)
                      }
                      className={`flex items-center space-x-2.5 rounded-xl border p-2.5 text-left text-xs font-medium transition-all ${
                        isCurrent
                          ? "border-zinc-600 bg-zinc-800 text-white shadow-sm"
                          : "border-zinc-800/80 bg-zinc-900/40 text-zinc-300 hover:bg-zinc-900 hover:text-white"
                      }`}
                    >
                      <div
                        className="shrink-0 rounded-lg p-1.5"
                        style={{ backgroundColor: `${color}20`, color: color }}
                      >
                        <Icon size={14} />
                      </div>
                      <span className="truncate">{catName}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <button
              onClick={() => handleDeleteTransaction(selectedTx.id)}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-rose-900/50 bg-rose-950/30 py-2.5 text-xs font-semibold text-rose-400 transition-all hover:border-rose-700/80 hover:bg-rose-950/60"
            >
              <Trash2 size={14} />
              Видалити цю транзакцію
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
