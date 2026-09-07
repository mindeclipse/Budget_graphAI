"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Wallet, Layers, BarChart3 } from "lucide-react";

interface Transaction {
  id: number;
  amount: number;
  currency: string;
  category_name: string;
  merchant_raw: string | null;
  source: string;
  type: string;
  created_at: string;
}

export default function HomePage() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [totalSpent, setTotalSpent] = useState<number>(0);

  useEffect(() => {
    // 1. Початкове завантаження транзакцій
    const fetchTransactions = async () => {
      const { data, error } = await supabase
        .from("transactions")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Помилка Supabase:", error.message);
        return;
      }

      if (data) {
        setTransactions(data);
        const total = data
          .filter((tx) => tx.type === "expense")
          .reduce((acc, curr) => acc + Number(curr.amount), 0);
        setTotalSpent(total);
      }
    };

    fetchTransactions();

    // 2. Підписка на нові транзакції в реальному часі через WebSockets
    const channel = supabase
      .channel("realtime-feed")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "transactions" },
        (payload) => {
          const newTx = payload.new as Transaction;
          setTransactions((prev) => [newTx, ...prev]);

          if (newTx.type === "expense") {
            setTotalSpent((prev) => prev + Number(newTx.amount));
          }

          if (typeof window !== "undefined" && "vibrate" in navigator) {
            navigator.vibrate(25);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return (
    <main className="min-h-screen bg-black text-white px-5 pt-14 pb-28">
      {/* Підсумок місячних витрат */}
      <div className="mb-8">
        <p className="text-neutral-500 text-xs font-semibold uppercase tracking-wider">
          Витрачено цього місяця
        </p>
        <h1 className="text-4xl font-extrabold tracking-tight mt-1 text-white">
          {totalSpent.toLocaleString("uk-UA", { minimumFractionDigits: 2 })} ₴
        </h1>
      </div>

      {/* Стрічка операцій */}
      <div className="space-y-3">
        <h2 className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-3">
          Останні транзакції
        </h2>

        {transactions.length === 0 ? (
          <div className="bg-[#121212] border border-neutral-900 rounded-2xl p-8 text-center text-neutral-500 text-sm">
            Транзакцій поки немає. Здійсніть покупку через Apple Pay для тесту.
          </div>
        ) : (
          transactions.map((tx) => (
            <div
              key={tx.id}
              className="flex items-center justify-between p-4 bg-[#121212] border border-neutral-900 rounded-2xl active:scale-[0.99] transition-transform"
            >
              <div>
                <p className="font-semibold text-sm text-white">
                  {tx.merchant_raw || tx.category_name}
                </p>
                <p className="text-xs text-neutral-500 mt-0.5">
                  {tx.category_name} •{" "}
                  {new Date(tx.created_at).toLocaleTimeString("uk-UA", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              </div>
              <p
                className={`font-bold text-base ${
                  tx.type === "expense" ? "text-white" : "text-emerald-400"
                }`}
              >
                {tx.type === "expense" ? "-" : "+"}
                {Number(tx.amount).toFixed(2)} {tx.currency}
              </p>
            </div>
          ))
        )}
      </div>

      {/* Нижня панель навігації */}
      <nav className="fixed bottom-0 left-0 right-0 bg-[#0A0A0A]/90 backdrop-blur-xl border-t border-neutral-900 pb-[env(safe-area-inset-bottom)] px-8 pt-3">
        <div className="flex justify-between items-center max-w-sm mx-auto h-12">
          <button className="text-white p-2">
            <Layers size={22} />
          </button>
          <button className="text-neutral-500 hover:text-white p-2">
            <BarChart3 size={22} />
          </button>
          <button className="text-neutral-500 hover:text-white p-2">
            <Wallet size={22} />
          </button>
        </div>
      </nav>
    </main>
  );
}