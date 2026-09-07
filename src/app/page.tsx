"use client";

import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import {
  BarChart,
  Bar,
  XAxis,
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
  "Продукти": "#10B981", // смарагдовий
  "Кафе та ресторани": "#F59E0B", // бурштиновий
  "Транспорт": "#3B82F6", // синій
  "Підписки та сервіси": "#8B5CF6", // фіолетовий
  "Здоров'я та догляд": "#EC4899", // рожевий
  "Дім та побут": "#14B8A6", // бірюзовий
  "Одяг та взуття": "#F97316", // помаранчевий
  "Благодійність": "#EF4444", // червоний
  "Інше": "#6B7280", // сірий
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
    // 1. Початкове завантаження
    const fetchTransactions = async () => {
      const { data } = await supabase
        .from("transactions")
        .select("*")
        .order("created_at", { ascending: false });

      if (data) setTransactions(data);
    };

    fetchTransactions();

    // 2. Realtime підписка на нові додавання
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

  // Загальна сума
  const totalSpent = useMemo(() => {
    return transactions.reduce((acc, t) => acc + Number(t.amount), 0);
  }, [transactions]);

  // Агрегація за категоріями
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

  // Агрегація за днями для графіка
  const dailyStats = useMemo(() => {
    const daysMap: Record<string, number> = {};
    
    // Формуємо список останніх транзакцій за датою (день/місяць)
    transactions.forEach((t) => {
      const date = new Date(t.created_at);
      const key = `${date.getDate()}.${date.getMonth() + 1}`;
      daysMap[key] = (daysMap[key] || 0) + Number(t.amount);
    });

    return Object.entries(daysMap)
      .map(([date, amount]) => ({ date, amount }))
      .reverse(); // від старих до нових
  }, [transactions]);

  return (
    <main className="min-h-screen bg-black text-white px-4 py-8 max-w-md mx-auto pb-24 font-sans">
      {/* Заголовок та баланс */}
      <header className="mb-6">
        <p className="text-xs uppercase tracking-widest text-zinc-500 font-semibold mb-1">
          Витрачено цього місяця
        </p>
        <h1 className="text-4xl font-extrabold tracking-tight">
          {totalSpent.toLocaleString("uk-UA", { minimumFractionDigits: 2 })}{" "}
          <span className="text-zinc-500 text-3xl font-light">₴</span>
        </h1>
      </header>

      {/* Перемикач табів */}
      <div className="flex bg-zinc-900/80 p-1 rounded-xl mb-6 border border-zinc-800">
        <button
          onClick={() => setActiveTab("overview")}
          className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all ${
            activeTab === "overview"
              ? "bg-zinc-800 text-white shadow"
              : "text-zinc-400 hover:text-white"
          }`}
        >
          Аналітика
        </button>
        <button
          onClick={() => setActiveTab("history")}
          className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all ${
            activeTab === "history"
              ? "bg-zinc-800 text-white shadow"
              : "text-zinc-400 hover:text-white"
          }`}
        >
          Історія ({transactions.length})
        </button>
      </div>

      {activeTab === "overview" ? (
        <div className="space-y-6">
          {/* Графік динаміки витрат */}
          {dailyStats.length > 0 ? (
            <div className="bg-zinc-950 p-4 rounded-2xl border border-zinc-900">
              <p className="text-xs text-zinc-400 font-medium mb-3">
                Динаміка за днями (UAH)
              </p>
              <div className="h-36 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={dailyStats}>
                    <XAxis
                      dataKey="date"
                      stroke="#52525b"
                      fontSize={10}
                      tickLine={false}
                      axisLine={false}
                    />
                    <Tooltip
                      cursor={{ fill: "rgba(255, 255, 255, 0.05)" }}
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          return (
                            <div className="bg-zinc-800 border border-zinc-700 px-2 py-1 rounded text-xs">
                              {payload[0].value} ₴
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <Bar dataKey="amount" radius={[4, 4, 0, 0]}>
                      {dailyStats.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill="#3B82F6" />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          ) : null}

          {/* Розподіл за категоріями */}
          <div>
            <h2 className="text-xs uppercase tracking-wider text-zinc-500 font-bold mb-3">
              Розподіл за категоріями
            </h2>
            {categoryStats.length === 0 ? (
              <p className="text-sm text-zinc-600">Немає даних для аналізу</p>
            ) : (
              <div className="space-y-3">
                {categoryStats.map((cat) => {
                  const IconComponent = CATEGORY_ICONS[cat.name] || HelpCircle;
                  return (
                    <div
                      key={cat.name}
                      className="bg-zinc-900/60 border border-zinc-800/80 p-3 rounded-xl"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center space-x-2.5">
                          <div
                            className="p-1.5 rounded-lg"
                            style={{ backgroundColor: `${cat.color}20`, color: cat.color }}
                          >
                            <IconComponent size={16} />
                          </div>
                          <span className="text-sm font-medium">{cat.name}</span>
                        </div>
                        <div className="text-right">
                          <span className="text-sm font-bold">
                            {cat.amount.toLocaleString("uk-UA")} ₴
                          </span>
                          <span className="text-xs text-zinc-500 ml-1.5">
                            {cat.percentage}%
                          </span>
                        </div>
                      </div>
                      {/* Прогрес-бар */}
                      <div className="h-1.5 w-full bg-zinc-800 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-500"
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
        </div>
      ) : (
        /* Список останніх транзакцій */
        <div>
          <h2 className="text-xs uppercase tracking-wider text-zinc-500 font-bold mb-3">
            Останні операції
          </h2>
          {transactions.length === 0 ? (
            <div className="text-center py-12 text-zinc-600">
              <p className="text-sm">Транзакцій поки немає</p>
              <p className="text-xs mt-1">Оплатіть щось через Apple Pay</p>
            </div>
          ) : (
            <div className="space-y-2">
              {transactions.map((t) => {
                const IconComponent = CATEGORY_ICONS[t.category_name] || HelpCircle;
                const iconColor = CATEGORY_COLORS[t.category_name] || "#6B7280";

                return (
                  <div
                    key={t.id}
                    className="flex items-center justify-between p-3.5 bg-zinc-900/50 border border-zinc-800/60 rounded-xl"
                  >
                    <div className="flex items-center space-x-3">
                      <div
                        className="p-2 rounded-lg"
                        style={{ backgroundColor: `${iconColor}15`, color: iconColor }}
                      >
                        <IconComponent size={18} />
                      </div>
                      <div>
                        <p className="text-sm font-semibold">{t.merchant_raw}</p>
                        <p className="text-xs text-zinc-500">
                          {t.category_name} • {new Date(t.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </p>
                      </div>
                    </div>
                    <span className="text-sm font-bold tracking-tight text-white">
                      -{Number(t.amount).toFixed(2)} ₴
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </main>
  );
}