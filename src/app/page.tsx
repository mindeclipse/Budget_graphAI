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

  useEffect(() => {
    const fetchTransactions = async () => {
      const { data } = await supabase
        .from("transactions")
        .select("*")
        .order("created_at", { ascending: false });

      if (data) setTransactions(data);
    };

    fetchTransactions();

    const channel = supabase
      .channel("realtime-transactions")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "transactions" },
        (payload) => {
          setTransactions((prev) => [payload.new as Transaction, ...prev]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const totalSpent = useMemo(() => {
    return transactions.reduce((acc, t) => acc + Number(t.amount), 0);
  }, [transactions]);

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
    <main className="min-h-screen bg-black text-white px-4 sm:px-8 lg:px-12 py-8 max-w-7xl mx-auto font-sans antialiased">
      {/* Верхня панель / Заголовок */}
      <header className="mb-8 flex flex-col md:flex-row md:items-end justify-between border-b border-zinc-800/80 pb-6 gap-4">
        <div>
          <p className="text-xs uppercase tracking-widest text-zinc-400 font-semibold mb-1 flex items-center gap-1.5">
            <TrendingUp size={14} className="text-emerald-400" /> Витрачено цього місяця
          </p>
          <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight">
            {totalSpent.toLocaleString("uk-UA", { minimumFractionDigits: 2 })}{" "}
            <span className="text-zinc-500 text-3xl font-light">₴</span>
          </h1>
        </div>

        <div className="flex items-center gap-4 text-xs text-zinc-400">
          <div className="bg-zinc-900 border border-zinc-800 px-3 py-1.5 rounded-lg">
            Всього транзакцій: <span className="text-white font-semibold">{transactions.length}</span>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 px-3 py-1.5 rounded-lg">
            Категорій: <span className="text-white font-semibold">{categoryStats.length}</span>
          </div>
        </div>
      </header>

      {/* Мобільні таби (ховаються на десктопі завдяки md:hidden) */}
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

      {/* Основна 2-колонкова сітка на десктопі */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-start">
        
        {/* ЛІВА КОЛОНКА: Графік + Категорії (7 колонок з 12) */}
        <section
          className={`md:col-span-7 space-y-6 ${
            activeTab === "overview" ? "block" : "hidden md:block"
          }`}
        >
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

          {/* Розподіл за категоріями */}
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

                      {/* Прогрес-бар */}
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

        {/* ПРАВА КОЛОНКА: Останні операції (5 колонок з 12) */}
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