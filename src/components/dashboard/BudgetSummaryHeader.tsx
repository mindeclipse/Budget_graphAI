"use client";

import React, { useState } from "react";
import {
  TrendingUp,
  Settings,
  Wallet,
  Upload,
  Fingerprint,
  LogOut,
  Send,
} from "lucide-react";
import { toast } from "sonner";

interface BudgetSummaryHeaderProps {
  spentWhole: string;
  spentCents?: string;
  recurringTotal: number;
  transactionCount: number;
  onOpenNewCycle: () => void;
  onOpenImport: () => void;
  onRegisterDevice: () => void;
  onLogout: () => void;
}

export function BudgetSummaryHeader({
  spentWhole,
  spentCents,
  recurringTotal,
  transactionCount,
  onOpenNewCycle,
  onOpenImport,
  onRegisterDevice,
  onLogout,
}: BudgetSummaryHeaderProps) {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isSendingDigest, setIsSendingDigest] = useState(false);

  const handleSendTestDigest = async () => {
    if (isSendingDigest) return;
    setIsSendingDigest(true);
    const toastId = toast.loading("Формування AI-дайджесту...");
    try {
      const res = await fetch("/api/cron/digest?type=weekly&force=true");
      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || "Помилка відправки");
      }
      if (data.sent) {
        toast.success("AI-дайджест успішно надіслано в Telegram!", {
          id: toastId,
          description: "Перевірте чат вашого бота",
        });
      } else {
        toast.info("Дайджест сформовано, але не відправлено", {
          id: toastId,
          description:
            data.reason ||
            "Перевірте налаштування TELEGRAM_BOT_TOKEN та TELEGRAM_CHAT_ID",
        });
      }
    } catch (err: any) {
      toast.error("Не вдалося надіслати дайджест", {
        id: toastId,
        description: err.message || "Помилка зв'язку із сервером",
      });
    } finally {
      setIsSendingDigest(false);
      setIsSettingsOpen(false);
    }
  };

  return (
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
          <span className="font-semibold text-white">{transactionCount}</span>
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
                    onOpenNewCycle();
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
                    onOpenImport();
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
                    onRegisterDevice();
                  }}
                  title="Налаштувати Face ID / Touch ID для цього пристрою"
                  className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-medium text-zinc-300 transition-colors hover:bg-zinc-900"
                >
                  <Fingerprint size={14} className="text-zinc-400" />
                  <span>Face ID / Touch ID</span>
                </button>

                <button
                  type="button"
                  onClick={handleSendTestDigest}
                  disabled={isSendingDigest}
                  title="Надіслати щотижневий звіт із порадами Gemini у Telegram"
                  className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-medium text-zinc-300 transition-colors hover:bg-zinc-900 disabled:opacity-50"
                >
                  <Send size={14} className="text-zinc-400" />
                  <span>
                    {isSendingDigest ? "Відправка..." : "Дайджест у Telegram"}
                  </span>
                </button>

                <div className="my-1 border-t border-zinc-800/60" />

                <button
                  type="button"
                  onClick={() => {
                    setIsSettingsOpen(false);
                    onLogout();
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
  );
}
