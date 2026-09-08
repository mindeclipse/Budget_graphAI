"use client";

import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/lib/supabase";
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

interface Transaction {
  id: number;
  amount: number;
  currency: string;
  merchant_raw: string;
  category_name: string;
  source: string;
  created_at: string;
}

interface RecurringItem {
  id: number;
  title: string;
  amount: number;
  category_name: string;
  day_of_month: number;
  is_active: boolean;
}

interface AIInsightData {
  status: "safe" | "warning" | "danger";
  summary: string;
  anomalies: string[];
  saving_tactics: string[];
  forecast: string;
}

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

const CATEGORY_COLORS: Record<string, string> = {
  "Продукти": "#10B981",
  "Кафе та ресторани": "#F59E0B",
  "Транспорт": "#3B82F6",
  "Підписки та сервіси": "#8B5CF6",
  "Здоров'я та догляд": "#EC4899",
  "Дім та побут": "#14B8A6",
  "Одяг та взуття": "#F97316",
  "Благодійність": "#EF4444",
  "Інше": "#6B7280",
};

const CATEGORY_ICONS: Record<string, any> = {
  "Продукти": ShoppingBag,
  "Кафе та ресторани": Coffee,
  "Транспорт": Car,
  "Підписки та сервіси": Tv,
  "Здоров'я та догляд": HeartPulse,
  "Дім та побут": Home,
  "Одяг та взуття": Shirt,
  "Благодійність": HandHeart,
  "Інше": HelpCircle,
};

export default function Dashboard() {
  // Стан аутентифікації
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [pinInput, setPinInput] = useState("");
  const [pinError, setPinError] = useState("");
  const [isVerifyingPin, setIsVerifyingPin] = useState(false);

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [recurring, setRecurring] = useState<RecurringItem[]>([]);
  const [activeTab, setActiveTab] = useState<"overview" | "history" | "recurring">("overview");

  const [selectedDate, setSelectedDate] = useState(() => new Date());

  const selectedMonthKey = useMemo(() => {
    return `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, "0")}`;
  }, [selectedDate]);

  const monthLabel = useMemo(() => {
    return selectedDate.toLocaleDateString("uk-UA", {
      month: "long",
      year: "numeric",
    });
  }, [selectedDate]);

  const [budgetLimit, setBudgetLimit] = useState<number>(30000);
  const [isEditingBudget, setIsEditingBudget] = useState(false);
  const [tempBudgetInput, setTempBudgetInput] = useState("30000");

  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);

  const [isAddingRecurring, setIsAddingRecurring] = useState(false);
  const [editingRecurring, setEditingRecurring] = useState<RecurringItem | null>(null);
  const [recTitleInput, setRecTitleInput] = useState("");
  const [recAmountInput, setRecAmountInput] = useState("");
  const [recCategoryInput, setRecCategoryInput] = useState<string>("Підписки та сервіси");
  const [recDayInput, setRecDayInput] = useState("1");

  const [aiInsight, setAiInsight] = useState<AIInsightData | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // Перевірка активної сесії при першому завантаженні
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

  const handlePrevMonth = () => {
    setSelectedDate((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
    setAiInsight(null);
  };

  const handleNextMonth = () => {
    setSelectedDate((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
    setAiInsight(null);
  };

  useEffect(() => {
    if (!isAuthenticated) return;

    const fetchData = async () => {
      const [txRes, recRes] = await Promise.all([
        supabase.from("transactions").select("*").order("created_at", { ascending: false }),
        supabase.from("recurring_templates").select("*").order("day_of_month", { ascending: true }),
      ]);

      if (txRes.data) setTransactions(txRes.data);
      if (recRes.data) setRecurring(recRes.data as RecurringItem[]);
    };

    fetchData();

    const txChannel = supabase
      .channel("realtime-transactions")
      .on("postgres_changes", { event: "*", schema: "public", table: "transactions" }, (payload) => {
        if (payload.eventType === "INSERT") {
          setTransactions((prev) => [payload.new as Transaction, ...prev]);
        } else if (payload.eventType === "UPDATE") {
          setTransactions((prev) =>
            prev.map((t) => (t.id === payload.new.id ? (payload.new as Transaction) : t))
          );
        } else if (payload.eventType === "DELETE") {
          setTransactions((prev) => prev.filter((t) => t.id === payload.old.id));
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(txChannel);
    };
  }, [isAuthenticated]);

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

  const filteredTransactions = useMemo(() => {
    return transactions.filter((t) => {
      const d = new Date(t.created_at);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      return key === selectedMonthKey;
    });
  }, [transactions, selectedMonthKey]);

  const recurringTotal = useMemo(() => {
    return recurring.filter((r) => r.is_active).reduce((acc, r) => acc + Number(r.amount), 0);
  }, [recurring]);

  const totalSpent = useMemo(() => {
    return filteredTransactions.reduce((acc, t) => acc + Number(t.amount), 0);
  }, [filteredTransactions]);

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
    const safeDailySpend = daysRemaining > 0 && remaining > 0 ? remaining / daysRemaining : 0;

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
        percentage: totalSpent > 0 ? Math.round((amount / totalSpent) * 100) : 0,
        color: CATEGORY_COLORS[name] || "#6B7280",
      }))
      .sort((a, b) => b.amount - a.amount);
  }, [filteredTransactions, totalSpent]);

  const handleGenerateInsight = async () => {
    setIsAnalyzing(true);
    try {
      const topTransactions = [...filteredTransactions]
        .sort((a, b) => Number(b.amount) - Number(a.amount))
        .slice(0, 5)
        .map((t) => ({ merchant: t.merchant_raw, amount: t.amount, category: t.category_name }));

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

  const handleOpenAddRecurring = () => {
    setEditingRecurring(null);
    setRecTitleInput("");
    setRecAmountInput("");
    setRecCategoryInput("Підписки та сервіси");
    setRecDayInput("1");
    setIsAddingRecurring(true);
  };

  const handleOpenEditRecurring = (item: RecurringItem) => {
    setEditingRecurring(item);
    setRecTitleInput(item.title);
    setRecAmountInput(item.amount.toString());
    setRecCategoryInput(item.category_name);
    setRecDayInput(item.day_of_month.toString());
    setIsAddingRecurring(true);
  };

  const handleSaveRecurring = async () => {
    const amt = parseFloat(recAmountInput);
    if (!recTitleInput || isNaN(amt) || amt <= 0) return;

    if (editingRecurring) {
      const updatedPayload = {
        title: recTitleInput,
        amount: amt,
        category_name: recCategoryInput,
        day_of_month: parseInt(recDayInput) || 1,
      };

      setRecurring((prev) =>
        prev.map((r) => (r.id === editingRecurring.id ? { ...r, ...updatedPayload } : r))
      );
      setIsAddingRecurring(false);

      await supabase
        .from("recurring_templates")
        .update(updatedPayload)
        .eq("id", editingRecurring.id);
    } else {
      const newItem = {
        title: recTitleInput,
        amount: amt,
        category_name: recCategoryInput,
        day_of_month: parseInt(recDayInput) || 1,
        is_active: true,
      };

      const { data } = await supabase.from("recurring_templates").insert(newItem).select().single();
      if (data) {
        setRecurring((prev) => [...prev, data as RecurringItem]);
      }
      setIsAddingRecurring(false);
    }
  };

  const handleDeleteRecurring = async (id: number) => {
    setRecurring((prev) => prev.filter((r) => r.id !== id));
    setIsAddingRecurring(false);
    await supabase.from("recurring_templates").delete().eq("id", id);
  };

  const handleExecuteRecurring = async (item: RecurringItem) => {
    const newTx = {
      amount: item.amount,
      currency: "UAH",
      merchant_raw: item.title,
      category_name: item.category_name,
      source: "recurring",
    };

    const { data } = await supabase.from("transactions").insert(newTx).select().single();
    if (data) {
      setTransactions((prev) => [data as Transaction, ...prev]);
    }
  };

  const handleSaveBudget = async () => {
    const parsed = parseFloat(tempBudgetInput);
    if (!isNaN(parsed) && parsed > 0) {
      setBudgetLimit(parsed);
      await supabase
        .from("budgets")
        .upsert(
          { month: selectedMonthKey, amount: parsed, updated_at: new Date().toISOString() },
          { onConflict: "month" }
        );
    }
    setIsEditingBudget(false);
  };

  const handleUpdateCategory = async (txId: number, newCategory: string) => {
    setTransactions((prev) =>
      prev.map((t) => (t.id === txId ? { ...t, category_name: newCategory } : t))
    );
    setSelectedTx(null);

    await supabase.from("transactions").update({ category_name: newCategory }).eq("id", txId);
  };

  const handleDeleteTransaction = async (txId: number) => {
    setTransactions((prev) => prev.filter((t) => t.id !== txId));
    setSelectedTx(null);

    await supabase.from("transactions").delete().eq("id", txId);
  };

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

  // Екран завантаження стану авторизації
  if (isAuthenticated === null) {
    return (
      <main className="min-h-screen bg-black flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-zinc-700 border-t-white rounded-full animate-spin" />
      </main>
    );
  }

  // Екран блокування: вхід за PIN-кодом
  if (!isAuthenticated) {
    return (
      <main className="min-h-screen bg-black text-white flex items-center justify-center p-4">
        <div className="w-full max-w-xs bg-zinc-950 border border-zinc-900 rounded-3xl p-6 text-center shadow-2xl space-y-6">
          <div className="w-12 h-12 bg-zinc-900 rounded-2xl flex items-center justify-center mx-auto text-zinc-400 border border-zinc-800">
            <Lock size={20} />
          </div>
          <div>
            <h2 className="text-base font-bold text-white">Вхід до фінансів</h2>
            <p className="text-xs text-zinc-500 mt-1">Введіть PIN-код доступу</p>
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
              className="w-full text-center tracking-[0.4em] font-mono text-xl py-3 bg-zinc-900 border border-zinc-800 rounded-2xl text-white focus:outline-none focus:border-zinc-600 transition-all"
            />

            {pinError && <p className="text-rose-400 text-xs font-medium">{pinError}</p>}

            <button
              type="submit"
              disabled={isVerifyingPin || !pinInput}
              className="w-full py-3 rounded-2xl bg-white hover:bg-zinc-200 disabled:opacity-40 text-black text-xs font-bold transition-all"
            >
              {isVerifyingPin ? "Перевірка..." : "Розблокувати"}
            </button>
          </form>
        </div>
      </main>
    );
  }

  // Головний дашборд (відображається лише після авторизації)
  return (
    <main className="min-h-screen bg-black text-white px-4 sm:px-8 lg:px-12 pt-28 pb-24 md:pt-10 max-w-7xl mx-auto font-sans antialiased">
      {/* Навігатор місяців */}
      <div className="flex items-center justify-between mb-4 bg-zinc-950 border border-zinc-900 px-3.5 py-2 rounded-xl">
        <button
          onClick={handlePrevMonth}
          className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-900 transition-all"
        >
          <ChevronLeft size={18} />
        </button>
        <div className="flex items-center gap-2">
          <Calendar size={14} className="text-zinc-500" />
          <span className="text-sm font-semibold capitalize text-zinc-200">
            {monthLabel}
          </span>
        </div>
        <button
          onClick={handleNextMonth}
          className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-900 transition-all"
        >
          <ChevronRight size={18} />
        </button>
      </div>

      <header className="mb-6 flex flex-col md:flex-row md:items-end justify-between border-b border-zinc-800/80 pb-6 gap-4">
        <div>
          <p className="text-xs uppercase tracking-widest text-zinc-400 font-semibold mb-1 flex items-center gap-1.5">
            <TrendingUp size={14} className="text-emerald-400" /> Витрачено за період
          </p>
          <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight">
            {totalSpent.toLocaleString("uk-UA", { minimumFractionDigits: 2 })}{" "}
            <span className="text-zinc-500 text-3xl font-light">₴</span>
          </h1>
        </div>

        <div className="flex items-center gap-3 text-xs text-zinc-400">
          <div className="bg-zinc-900 border border-zinc-800 px-3 py-1.5 rounded-lg">
            Постійні: <span className="text-white font-semibold">{recurringTotal.toLocaleString("uk-UA")} ₴</span>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 px-3 py-1.5 rounded-lg">
            Транзакцій: <span className="text-white font-semibold">{filteredTransactions.length}</span>
          </div>
        </div>
      </header>

      {/* КАРТКА БЮДЖЕТУ */}
      <section className="mb-8 bg-zinc-950 border border-zinc-900 rounded-2xl p-5 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-xs uppercase tracking-wider text-zinc-400 font-semibold">
              Бюджет на місяць
            </span>
            {budgetMetrics.exactPercent > 100 && (
              <span className="flex items-center gap-1 text-[11px] font-semibold text-rose-400 bg-rose-950/50 border border-rose-800/50 px-2 py-0.5 rounded-full">
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
                className="w-28 bg-zinc-900 border border-zinc-700 text-white text-xs px-2.5 py-1 rounded-lg focus:outline-none focus:border-emerald-500"
                autoFocus
              />
              <button
                onClick={handleSaveBudget}
                className="bg-emerald-600 hover:bg-emerald-500 p-1.5 rounded-lg text-white transition-all"
              >
                <Check size={13} />
              </button>
            </div>
          ) : (
            <button
              onClick={() => setIsEditingBudget(true)}
              className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white bg-zinc-900 border border-zinc-800 hover:border-zinc-700 px-2.5 py-1 rounded-lg transition-all"
            >
              <span className="font-semibold text-zinc-200">
                {budgetLimit.toLocaleString("uk-UA")} ₴
              </span>
              <Pencil size={11} className="text-zinc-500" />
            </button>
          )}
        </div>

        <div className="h-2 w-full bg-zinc-900 rounded-full overflow-hidden mb-4 border border-zinc-800/60">
          <div
            className="h-full rounded-full transition-all duration-700 ease-out"
            style={{
              width: `${budgetMetrics.spentPercent}%`,
              backgroundColor: budgetMetrics.barColor,
            }}
          />
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-1 border-t border-zinc-900 text-xs">
          <div>
            <p className="text-zinc-500 mb-0.5">Залишок</p>
            <p
              className={`font-bold text-sm ${
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
            <p className="text-zinc-500 mb-0.5">Безпечно на день</p>
            <p className="font-bold text-sm text-zinc-200">
              {budgetMetrics.isCurrentMonth
                ? `~${Math.round(budgetMetrics.safeDailySpend).toLocaleString("uk-UA")} ₴/д`
                : "Період минув"}
            </p>
          </div>

          <div className="col-span-2 sm:col-span-1 flex items-center gap-1.5 text-zinc-400">
            <Calendar size={13} className="text-zinc-500 shrink-0" />
            <span>
              {budgetMetrics.isCurrentMonth ? (
                <>Залишилось <strong className="text-zinc-200">{budgetMetrics.daysRemaining}</strong> дн.</>
              ) : (
                "Архівний період"
              )}
            </span>
          </div>
        </div>
      </section>

      {/* Мобільні таби */}
      <div className="flex md:hidden bg-zinc-900/80 p-1 rounded-xl mb-6 border border-zinc-800">
        <button
          onClick={() => setActiveTab("overview")}
          className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all ${
            activeTab === "overview" ? "bg-zinc-800 text-white shadow" : "text-zinc-400 hover:text-white"
          }`}
        >
          Аналітика
        </button>
        <button
          onClick={() => setActiveTab("history")}
          className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all ${
            activeTab === "history" ? "bg-zinc-800 text-white shadow" : "text-zinc-400 hover:text-white"
          }`}
        >
          Історія ({filteredTransactions.length})
        </button>
        <button
          onClick={() => setActiveTab("recurring")}
          className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all ${
            activeTab === "recurring" ? "bg-zinc-800 text-white shadow" : "text-zinc-400 hover:text-white"
          }`}
        >
          Постійні ({recurring.length})
        </button>
      </div>

      {/* Основна сітка */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-start">
        {/* Ліва колонка */}
        <section
          className={`md:col-span-7 space-y-6 ${
            activeTab === "overview" ? "block" : "hidden md:block"
          }`}
        >
          {/* AI ФІНАНСОВИЙ АСИСТЕНТ */}
          <div className="bg-gradient-to-b from-zinc-900/80 to-zinc-950 p-5 rounded-2xl border border-zinc-800/80 shadow-lg relative overflow-hidden">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-indigo-500/20 text-indigo-400">
                  <Sparkles size={16} />
                </div>
                <div>
                  <h3 className="text-xs uppercase tracking-wider text-zinc-300 font-bold">
                    AI Фінансовий Аналітик
                  </h3>
                  <p className="text-[11px] text-zinc-500">Аналіз витрат та стратегія оптимізації</p>
                </div>
              </div>

              <button
                onClick={handleGenerateInsight}
                disabled={isAnalyzing || filteredTransactions.length === 0}
                className="flex items-center gap-1.5 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-white text-xs font-semibold px-3 py-1.5 rounded-xl border border-zinc-700/60 transition-all"
              >
                <RefreshCw size={12} className={isAnalyzing ? "animate-spin" : ""} />
                {isAnalyzing ? "Аналізую..." : aiInsight ? "Оновити" : "Аналізувати"}
              </button>
            </div>

            {aiInsight ? (
              <div className="space-y-4 text-xs animate-in fade-in duration-300">
                <div className="flex items-center justify-between p-3 rounded-xl bg-zinc-900/60 border border-zinc-800">
                  <div className="flex items-center gap-2">
                    {aiInsight.status === "safe" ? (
                      <ShieldCheck size={16} className="text-emerald-400" />
                    ) : aiInsight.status === "warning" ? (
                      <Zap size={16} className="text-amber-400" />
                    ) : (
                      <AlertTriangle size={16} className="text-rose-400" />
                    )}
                    <span className="font-semibold text-zinc-200">{aiInsight.summary}</span>
                  </div>
                </div>

                {aiInsight.anomalies?.length > 0 && (
                  <div>
                    <p className="text-[11px] uppercase tracking-wider text-zinc-500 font-semibold mb-1.5">
                      Виявлені аномалії
                    </p>
                    <ul className="space-y-1">
                      {aiInsight.anomalies.map((item, idx) => (
                        <li key={idx} className="text-zinc-300 flex items-start gap-2">
                          <span className="text-zinc-600 mt-0.5">•</span>
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {aiInsight.saving_tactics?.length > 0 && (
                  <div className="bg-zinc-900/40 p-3 rounded-xl border border-zinc-850">
                    <p className="text-[11px] uppercase tracking-wider text-emerald-400 font-semibold mb-2 flex items-center gap-1.5">
                      <Lightbulb size={13} /> Як заощадити кошти
                    </p>
                    <div className="space-y-1.5">
                      {aiInsight.saving_tactics.map((tactic, idx) => (
                        <div key={idx} className="text-zinc-300 flex items-start gap-2">
                          <span className="font-mono text-zinc-500 text-[10px] mt-0.5">{idx + 1}.</span>
                          <span>{tactic}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {aiInsight.forecast && (
                  <p className="text-[11px] text-zinc-500 italic pt-1 border-t border-zinc-900">
                    <strong className="text-zinc-400 not-italic">Прогноз:</strong> {aiInsight.forecast}
                  </p>
                )}
              </div>
            ) : (
              <div className="text-center py-6 text-zinc-500 text-xs">
                {filteredTransactions.length === 0 ? (
                  "Немає транзакцій за цей місяць для формування аналітики"
                ) : (
                  <>
                    Натисніть <strong className="text-zinc-300">«Аналізувати»</strong>, щоб отримати
                    структурований аналіз структури витрат та план заощадження від Gemini AI.
                  </>
                )}
              </div>
            )}
          </div>

          {/* Графік */}
          <div className="bg-zinc-950 p-5 rounded-2xl border border-zinc-900 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <p className="text-xs uppercase tracking-wider text-zinc-400 font-semibold">
                Динаміка витрат за днями
              </p>
              <span className="text-xs text-zinc-500 font-mono">UAH</span>
            </div>

            {dailyStats.length > 0 ? (
              <div className="h-48 md:h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={dailyStats} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <XAxis dataKey="date" stroke="#71717a" fontSize={11} tickLine={false} axisLine={false} />
                    <YAxis stroke="#71717a" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(val) => `${val}₴`} />
                    <Tooltip
                      cursor={{ fill: "rgba(255, 255, 255, 0.05)" }}
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          return (
                            <div className="bg-zinc-800/95 backdrop-blur border border-zinc-700 px-3 py-1.5 rounded-lg shadow-xl text-xs">
                              <p className="text-zinc-400">{payload[0].payload.date}</p>
                              <p className="text-white font-bold">{payload[0].value} ₴</p>
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
              <div className="h-40 flex items-center justify-center text-xs text-zinc-600">
                Немає даних за цей місяць
              </div>
            )}
          </div>

          {/* Структура категорій */}
          <div className="bg-zinc-950 p-5 rounded-2xl border border-zinc-900 shadow-sm">
            <h2 className="text-xs uppercase tracking-wider text-zinc-400 font-semibold mb-4">
              Структура витрат за категоріями
            </h2>

            {categoryStats.length === 0 ? (
              <p className="text-sm text-zinc-600 py-4">Категорії ще не сформовані</p>
            ) : (
              <div className="space-y-3.5">
                {categoryStats.map((cat) => {
                  const IconComponent = CATEGORY_ICONS[cat.name] || HelpCircle;
                  return (
                    <div
                      key={cat.name}
                      className="bg-zinc-900/40 border border-zinc-800/60 hover:border-zinc-700/70 p-3.5 rounded-xl transition-all"
                    >
                      <div className="flex items-center justify-between mb-2.5">
                        <div className="flex items-center space-x-3">
                          <div className="p-2 rounded-lg" style={{ backgroundColor: `${cat.color}20`, color: cat.color }}>
                            <IconComponent size={16} />
                          </div>
                          <span className="text-sm font-medium text-zinc-200">{cat.name}</span>
                        </div>
                        <div className="text-right">
                          <span className="text-sm font-semibold text-white">
                            {cat.amount.toLocaleString("uk-UA")} ₴
                          </span>
                          <span className="text-xs text-zinc-500 ml-2 font-mono">
                            {cat.percentage}%
                          </span>
                        </div>
                      </div>

                      <div className="h-1.5 w-full bg-zinc-800/80 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-700 ease-out"
                          style={{ width: `${cat.percentage}%`, backgroundColor: cat.color }}
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
          className={`md:col-span-5 space-y-6 ${
            activeTab === "history" || activeTab === "recurring" ? "block" : "hidden md:block"
          }`}
        >
          {/* БЛОК ПОСТІЙНИХ ВИТРАТ */}
          <div className="bg-zinc-950 p-5 rounded-2xl border border-zinc-900 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Repeat size={15} className="text-violet-400" />
                <h2 className="text-xs uppercase tracking-wider text-zinc-400 font-semibold">
                  Постійні витрати
                </h2>
              </div>
              <button
                onClick={handleOpenAddRecurring}
                className="flex items-center gap-1 text-xs text-zinc-400 hover:text-white bg-zinc-900 hover:bg-zinc-850 border border-zinc-800 px-2.5 py-1 rounded-lg transition-all"
              >
                <Plus size={13} /> Додати
              </button>
            </div>

            {recurring.length === 0 ? (
              <p className="text-xs text-zinc-600 py-3">Немає запланованих платежів</p>
            ) : (
              <div className="space-y-2">
                {recurring.map((item) => (
                  <div
                    key={item.id}
                    className="group flex items-center justify-between p-2.5 bg-zinc-900/40 hover:bg-zinc-900/80 border border-zinc-850 hover:border-zinc-700 rounded-xl transition-all"
                  >
                    <div
                      onClick={() => handleOpenEditRecurring(item)}
                      className="cursor-pointer flex-1 min-w-0 pr-2"
                    >
                      <div className="flex items-center gap-1.5">
                        <p className="text-xs font-semibold text-zinc-200 group-hover:text-white truncate">
                          {item.title}
                        </p>
                        <Pencil size={11} className="text-zinc-600 group-hover:text-zinc-400 shrink-0" />
                      </div>
                      <p className="text-[11px] text-zinc-500 truncate">
                        {item.day_of_month}-е число • {item.category_name}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span
                        onClick={() => handleOpenEditRecurring(item)}
                        className="text-xs font-bold text-white cursor-pointer hover:underline"
                      >
                        {Number(item.amount).toLocaleString("uk-UA")} ₴
                      </span>
                      <button
                        onClick={() => handleExecuteRecurring(item)}
                        title="Провести платіж зараз"
                        className="p-1.5 rounded-lg bg-zinc-850 hover:bg-emerald-950/60 border border-zinc-800 hover:border-emerald-700/60 text-zinc-400 hover:text-emerald-400 transition-all"
                      >
                        <CheckCircle2 size={13} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* СПИСОК ОПЕРАЦІЙ */}
          <div className="bg-zinc-950 p-5 rounded-2xl border border-zinc-900 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xs uppercase tracking-wider text-zinc-400 font-semibold flex items-center gap-1.5">
                <Receipt size={14} className="text-zinc-500" /> Транзакції за місяць
              </h2>
              <span className="text-xs text-zinc-500">{filteredTransactions.length} оп.</span>
            </div>

            {filteredTransactions.length === 0 ? (
              <div className="text-center py-16 text-zinc-600">
                <Receipt size={32} className="mx-auto mb-2 opacity-40" />
                <p className="text-sm">Транзакцій немає</p>
                <p className="text-xs mt-1 text-zinc-700">У цьому місяці витрат не зафіксовано</p>
              </div>
            ) : (
              <div className="space-y-2.5 max-h-[500px] overflow-y-auto pr-1">
                {filteredTransactions.map((t) => {
                  const IconComponent = CATEGORY_ICONS[t.category_name] || HelpCircle;
                  const iconColor = CATEGORY_COLORS[t.category_name] || "#6B7280";

                  return (
                    <div
                      key={t.id}
                      onClick={() => setSelectedTx(t)}
                      className="group flex items-center justify-between p-3 bg-zinc-900/40 hover:bg-zinc-900/80 border border-zinc-800/60 hover:border-zinc-700 cursor-pointer rounded-xl transition-all active:scale-[0.99]"
                    >
                      <div className="flex items-center space-x-3">
                        <div
                          className="p-2 rounded-lg shrink-0 group-hover:scale-105 transition-transform"
                          style={{ backgroundColor: `${iconColor}15`, color: iconColor }}
                        >
                          <IconComponent size={16} />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold truncate text-zinc-100 group-hover:text-white">
                            {t.merchant_raw}
                          </p>
                          <p className="text-xs text-zinc-500 truncate">
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
                      <span className="text-sm font-bold tracking-tight text-white whitespace-nowrap ml-2">
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

      {/* МОДАЛКА ДОДАВАННЯ ТА РЕДАГУВАННЯ ПОСТІЙНОЇ ВИТРАТИ */}
      {isAddingRecurring && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm bg-zinc-950 border border-zinc-800 rounded-2xl p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <h3 className="text-sm font-bold text-white">
                {editingRecurring ? "Редагування постійної витрати" : "Новий постійний платіж"}
              </h3>
              <button onClick={() => setIsAddingRecurring(false)} className="text-zinc-500 hover:text-white">
                <X size={16} />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-[11px] text-zinc-400 font-semibold block mb-1">Назва</label>
                <input
                  type="text"
                  placeholder="Оренда, зв'язок, підписка"
                  value={recTitleInput}
                  onChange={(e) => setRecTitleInput(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-zinc-600"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] text-zinc-400 font-semibold block mb-1">Сума (UAH)</label>
                  <input
                    type="number"
                    placeholder="15000"
                    value={recAmountInput}
                    onChange={(e) => setRecAmountInput(e.target.value)}
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-zinc-600"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-zinc-400 font-semibold block mb-1">День місяця</label>
                  <input
                    type="number"
                    min="1"
                    max="31"
                    value={recDayInput}
                    onChange={(e) => setRecDayInput(e.target.value)}
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-zinc-600"
                  />
                </div>
              </div>

              <div>
                <label className="text-[11px] text-zinc-400 font-semibold block mb-1">Категорія</label>
                <select
                  value={recCategoryInput}
                  onChange={(e) => setRecCategoryInput(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-zinc-600"
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
                  className="p-2 rounded-xl bg-rose-950/30 hover:bg-rose-950/60 border border-rose-900/50 text-rose-400 transition-all"
                  title="Видалити цей регулярний платіж"
                >
                  <Trash2 size={15} />
                </button>
              )}
              <button
                onClick={() => setIsAddingRecurring(false)}
                className="flex-1 py-2 text-xs rounded-xl bg-zinc-900 hover:bg-zinc-850 text-zinc-400 transition-all"
              >
                Скасувати
              </button>
              <button
                onClick={handleSaveRecurring}
                className="flex-1 py-2 text-xs font-semibold rounded-xl bg-white hover:bg-zinc-200 text-black transition-all"
              >
                {editingRecurring ? "Оновити" : "Зберегти"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* QUICK ACTION SHEET ДЛЯ ТРАНЗАКЦІЙ */}
      {selectedTx && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/75 backdrop-blur-sm p-0 sm:p-4 animate-in fade-in duration-150">
          <div
            className="w-full sm:max-w-md bg-zinc-950 border border-zinc-800 rounded-t-3xl sm:rounded-2xl p-5 sm:p-6 shadow-2xl max-h-[85vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-10 h-1 bg-zinc-700/80 rounded-full mx-auto mb-4 sm:hidden" />

            <div className="flex items-start justify-between mb-5 border-b border-zinc-800/80 pb-4">
              <div>
                <span className="text-xs font-medium text-zinc-400 uppercase tracking-wider">
                  Редагування операції
                </span>
                <h3 className="text-lg font-bold text-white mt-0.5">{selectedTx.merchant_raw}</h3>
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
                  className="text-zinc-400 hover:text-white p-1 rounded-lg bg-zinc-900 border border-zinc-800"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            <div className="mb-6">
              <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2.5">
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
                      onClick={() => handleUpdateCategory(selectedTx.id, catName)}
                      className={`flex items-center space-x-2.5 p-2.5 rounded-xl border text-left text-xs font-medium transition-all ${
                        isCurrent
                          ? "bg-zinc-800 border-zinc-600 text-white shadow-sm"
                          : "bg-zinc-900/40 border-zinc-800/80 hover:bg-zinc-900 text-zinc-300 hover:text-white"
                      }`}
                    >
                      <div className="p-1.5 rounded-lg shrink-0" style={{ backgroundColor: `${color}20`, color: color }}>
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
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-rose-950/30 hover:bg-rose-950/60 border border-rose-900/50 hover:border-rose-700/80 text-rose-400 text-xs font-semibold transition-all"
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