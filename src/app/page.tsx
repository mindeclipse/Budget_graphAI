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
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [activeTab, setActiveTab] = useState<"overview" | "history">("overview");

  // Бюджет із Supabase
  const [budgetLimit, setBudgetLimit] = useState<number>(30000);
  const [isEditingBudget, setIsEditingBudget] = useState(false);
  const [tempBudgetInput, setTempBudgetInput] = useState("30000");

  const currentMonthKey = useMemo(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  }, []);

  useEffect(() => {
    // 1. Отримання транзакцій
    const fetchTransactions = async () => {
      const { data } = await supabase
        .from("transactions")
        .select("*")
        .order("created_at", { ascending: false });

      if (data) setTransactions(data);
    };

    // 2. Отримання бюджету на поточний місяць із Supabase
    const fetchBudget = async () => {
      const { data } = await supabase
        .from("budgets")
        .select("amount")
        .eq("month", currentMonthKey)
        .maybeSingle();

      if (data?.amount) {
        const val = Number(data.amount);
        setBudgetLimit(val);
        setTempBudgetInput(val.toString());
      }
    };

    fetchTransactions();
    fetchBudget();

    // 3. Realtime підписка на транзакції
    const txChannel = supabase
      .channel("realtime-transactions")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "transactions" },
        (payload) => {
          setTransactions((prev) => [payload.new as Transaction, ...prev]);
        }
      )
      .subscribe();

    // 4. Realtime підписка на зміну бюджету (синхронізація Mac <-> iPhone)
    const budgetChannel = supabase
      .channel("realtime-budgets")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "budgets" },
        (payload) => {
          const updated = payload.new as { month: string; amount: number };
          if (updated && updated.month === currentMonthKey) {
            setBudgetLimit(Number(updated.amount));
            setTempBudgetInput(updated.amount.toString());
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(txChannel);
      supabase.removeChannel(budgetChannel);
    };
  }, [currentMonthKey]);

  // Збереження бюджету в базі
  const handleSaveBudget = async () => {
    const parsed = parseFloat(tempBudgetInput);
    if (!isNaN(parsed) && parsed > 0) {
      setBudgetLimit(parsed);
      await supabase
        .from("budgets")
        .upsert(
          { month: currentMonthKey, amount: parsed, updated_at: new Date().toISOString() },
          { onConflict: "month" }
        );
    }
    setIsEditingBudget(false);
  };

  const totalSpent = useMemo(() => {
    return transactions.reduce((acc, t) => acc + Number(t.amount), 0);
  }, [transactions]);

  const budgetMetrics = useMemo(() => {
    const now = new Date();
    const totalDaysInMonth = new Date(
      now.getFullYear(),
      now.getMonth() + 1,
      0
    ).getDate();
    const currentDay = now.getDate();
    const daysRemaining = Math.max(1, totalDaysInMonth - currentDay + 1);

    const remaining = budgetLimit - totalSpent;
    const spentPercent = budgetLimit > 0 ? (totalSpent / budgetLimit) * 100 : 0;
    const safeDailySpend = remaining > 0 ? remaining / daysRemaining : 0;

    let barColor = "#10B981";
    if (spentPercent > 95) barColor = "#EF4444";
    else if (spentPercent > 75) barColor = "#F59E0B";

    return {
      remaining,
      spentPercent: Math.min(100, spentPercent),
      exactPercent: spentPercent,
      safeDailySpend,
      daysRemaining,
      barColor,
    };
  }, [totalSpent, budgetLimit]);

  const categoryStats = useMemo(() => {
    const stats: Record<string, number> = {};
    transactions.forEach((t) => {
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
  }, [transactions, totalSpent]);

  const dailyStats = useMemo(() => {
    const daysMap: Record<string, number> = {};
    transactions.forEach((t) => {
      const date = new Date(t.created_at);
      const key = `${String(date.getDate()).padStart(2, "0")}.${String(
        date.getMonth() + 1
      ).padStart(2, "0")}`;
      daysMap[key] = (daysMap[key] || 0) + Number(t.amount);
    });

    return Object.entries(daysMap)
      .map(([date, amount]) => ({ date, amount }))
      .reverse();
  }, [transactions]);

  return (
    <main className="min-h-screen bg-black text-white px-4 sm:px-8 lg:px-12 pt-28 pb-24 md:pt-10 max-w-7xl mx-auto font-sans antialiased">
      {/* Верхня панель */}
      <header className="mb-6 flex flex-col md:flex-row md:items-end justify-between border-b border-zinc-800/80 pb-6 gap-4">
        <div>
          <p className="text-xs uppercase tracking-widest text-zinc-400 font-semibold mb-1 flex items-center gap-1.5">
            <TrendingUp size={14} className="text-emerald-400" /> Витрачено цього місяця
          </p>
          <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight">
            {totalSpent.toLocaleString("uk-UA", { minimumFractionDigits: 2 })}{" "}
            <span className="text-zinc-500 text-3xl font-light">₴</span>
          </h1>
        </div>

        <div className="flex items-center gap-3 text-xs text-zinc-400">
          <div className="bg-zinc-900 border border-zinc-800 px-3 py-1.5 rounded-lg">
            Всього транзакцій: <span className="text-white font-semibold">{transactions.length}</span>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 px-3 py-1.5 rounded-lg">
            Категорій: <span className="text-white font-semibold">{categoryStats.length}</span>
          </div>
        </div>
      </header>

      {/* КАРТКА МІСЯЧНОГО БЮДЖЕТУ */}
      <section className="mb-8 bg-zinc-950 border border-zinc-900 rounded-2xl p-5 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-xs uppercase tracking-wider text-zinc-400 font-semibold">
              Місячний ліміт
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
            <p className="text-zinc-500 mb-0.5">Залишок бюджету</p>
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
              ~{Math.round(budgetMetrics.safeDailySpend).toLocaleString("uk-UA")} ₴/д
            </p>
          </div>

          <div className="col-span-2 sm:col-span-1 flex items-center gap-1.5 text-zinc-400">
            <Calendar size={13} className="text-zinc-500 shrink-0" />
            <span>
              Залишилось <strong className="text-zinc-200">{budgetMetrics.daysRemaining}</strong> дн.
            </span>
          </div>
        </div>
      </section>

      {/* Мобільні таби */}
      <div className="flex md:hidden bg-zinc-900/80 p-1 rounded-xl mb-6 border border-zinc-800">
        <button
          onClick={() => setActiveTab("overview")}
          className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all ${
            activeTab === "overview"
              ? "bg-zinc-800 text-white shadow"
              : "text-zinc-400 hover:text-white"
          }`}
        >
          Аналітика
        </button>
        <button
          onClick={() => setActiveTab("history")}
          className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all ${
            activeTab === "history"
              ? "bg-zinc-800 text-white shadow"
              : "text-zinc-400 hover:text-white"
          }`}
        >
          Історія ({transactions.length})
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
                Немає даних за поточний період
              </div>
            )}
          </div>

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
                          <div
                            className="p-2 rounded-lg"
                            style={{ backgroundColor: `${cat.color}20`, color: cat.color }}
                          >
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
          className={`md:col-span-5 ${
            activeTab === "history" ? "block" : "hidden md:block"
          }`}
        >
          <div className="bg-zinc-950 p-5 rounded-2xl border border-zinc-900 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xs uppercase tracking-wider text-zinc-400 font-semibold flex items-center gap-1.5">
                <Receipt size={14} className="text-zinc-500" /> Останні транзакції
              </h2>
              <span className="text-xs text-zinc-500">{transactions.length} оп.</span>
            </div>

            {transactions.length === 0 ? (
              <div className="text-center py-16 text-zinc-600">
                <Receipt size={32} className="mx-auto mb-2 opacity-40" />
                <p className="text-sm">Транзакцій поки немає</p>
                <p className="text-xs mt-1 text-zinc-700">Витрати з'являться тут автоматично</p>
              </div>
            ) : (
              <div className="space-y-2.5 max-h-[700px] overflow-y-auto pr-1">
                {transactions.map((t) => {
                  const IconComponent = CATEGORY_ICONS[t.category_name] || HelpCircle;
                  const iconColor = CATEGORY_COLORS[t.category_name] || "#6B7280";

                  return (
                    <div
                      key={t.id}
                      className="flex items-center justify-between p-3 bg-zinc-900/40 border border-zinc-800/60 hover:border-zinc-700/70 rounded-xl transition-all"
                    >
                      <div className="flex items-center space-x-3">
                        <div
                          className="p-2 rounded-lg shrink-0"
                          style={{ backgroundColor: `${iconColor}15`, color: iconColor }}
                        >
                          <IconComponent size={16} />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold truncate text-zinc-100">
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
    </main>
  );
}