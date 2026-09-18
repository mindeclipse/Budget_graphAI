"use client";

import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Trash2,
  RotateCcw,
  AlertCircle,
  X,
  Loader2,
  Clock,
  CheckCircle2,
} from "lucide-react";
import { Transaction } from "@/types/finance";
import { triggerHaptic } from "@/lib/haptics";
import { toast } from "sonner";

interface TrashModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function TrashModal({ isOpen, onClose }: TrashModalProps) {
  const queryClient = useQueryClient();
  const [confirmClear, setConfirmClear] = useState(false);

  // Отримання списку транзакцій у кошику
  const {
    data: trashItems = [],
    isLoading,
    isRefetching,
  } = useQuery<Transaction[]>({
    queryKey: ["trash"],
    queryFn: async () => {
      const res = await fetch("/api/transactions?trash=true&limit=100");
      if (!res.ok) throw new Error("Помилка завантаження кошика");
      const json = await res.json();
      return json.transactions || [];
    },
    enabled: isOpen,
    staleTime: 1000 * 15,
  });

  // Відновлення однієї транзакції
  const restoreMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch("/api/transactions/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Не вдалося відновити");
      }
      return res.json();
    },
    onSuccess: () => {
      triggerHaptic("success");
      toast.success("Транзакцію відновлено");
      queryClient.invalidateQueries({ queryKey: ["trash"] });
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["analytics"] });
    },
    onError: (err: any) => {
      triggerHaptic("error");
      toast.error(err.message || "Помилка відновлення");
    },
  });

  // Остаточне безповоротне видалення однієї транзакції
  const permanentDeleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/transactions?id=${id}&permanent=true`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Помилка видалення");
      return res.json();
    },
    onSuccess: () => {
      triggerHaptic("heavy");
      toast.success("Видалено остаточно");
      queryClient.invalidateQueries({ queryKey: ["trash"] });
    },
    onError: (err: any) => {
      triggerHaptic("error");
      toast.error(err.message || "Помилка видалення");
    },
  });

  // Очищення всього кошика
  const clearTrashMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/transactions?clear_trash=true", {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Помилка очищення");
      return res.json();
    },
    onSuccess: () => {
      triggerHaptic("heavy");
      setConfirmClear(false);
      toast.success("Кошик очищено");
      queryClient.invalidateQueries({ queryKey: ["trash"] });
    },
    onError: (err: any) => {
      triggerHaptic("error");
      toast.error(err.message || "Помилка очищення кошика");
    },
  });

  if (!isOpen) return null;

  // Розрахунок скільки днів залишилося з 10
  const getDaysRemaining = (deletedAtStr?: string | null) => {
    if (!deletedAtStr) return 10;
    const deletedTime = new Date(deletedAtStr).getTime();
    const now = Date.now();
    const daysPassed = (now - deletedTime) / (1000 * 60 * 60 * 24);
    const remaining = Math.max(1, Math.ceil(10 - daysPassed));
    return remaining;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/75 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      {/* Підкладка для закриття */}
      <div
        className="fixed inset-0"
        onClick={() => {
          triggerHaptic("light");
          onClose();
        }}
      />

      {/* Модальне вікно */}
      <div className="relative z-10 flex max-h-[85vh] min-h-0 w-full max-w-lg flex-col overscroll-contain rounded-t-[28px] border border-zinc-800/80 bg-zinc-950 p-5 pt-3 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-2xl sm:max-h-[85vh] sm:rounded-3xl sm:p-6 sm:pb-6">
        {/* Grabber Bar для смартфонів */}
        <div className="mx-auto mb-3.5 h-1.5 w-11 shrink-0 rounded-full bg-zinc-700/50 sm:hidden" />

        {/* Шапка модального вікна */}
        <div className="mb-4 flex items-center justify-between border-b border-zinc-800/80 pb-3.5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-rose-500/20 bg-rose-500/10 text-rose-400">
              <Trash2 size={18} />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">
                Кошик транзакцій
              </h3>
              <p className="text-xs text-zinc-400">
                Зберігаються 10 днів до автоочищення
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              triggerHaptic("light");
              onClose();
            }}
            className="flex h-8 w-8 items-center justify-center rounded-full text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-white"
          >
            <X size={18} />
          </button>
        </div>

        {/* Інформаційний бейдж 10 днів */}
        <div className="mb-3 flex items-center gap-2 rounded-xl border border-amber-500/20 bg-amber-500/10 px-3.5 py-2 text-xs text-amber-300">
          <Clock size={15} className="shrink-0 text-amber-400" />
          <span>
            Видалені транзакції зберігаються <b>10 днів</b>. Після цього вони
            остаточно стираються системою.
          </span>
        </div>

        {/* Список елементів */}
        <div className="min-h-0 flex-1 [scrollbar-width:thin] space-y-2.5 overflow-y-auto overscroll-contain pr-1">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-12 text-zinc-500">
              <Loader2 size={24} className="animate-spin" />
              <p className="mt-2 text-xs">Завантаження кошика...</p>
            </div>
          ) : trashItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center text-zinc-500">
              <CheckCircle2 size={32} className="mb-2 text-emerald-500/60" />
              <p className="text-sm font-medium text-zinc-300">
                Кошик порожній
              </p>
              <p className="mt-1 text-xs text-zinc-500">
                Немає нещодавно видалених операцій
              </p>
            </div>
          ) : (
            trashItems.map((item) => {
              const daysLeft = getDaysRemaining(item.deleted_at);
              return (
                <div
                  key={item.id}
                  className="flex items-center justify-between gap-3 rounded-2xl border border-zinc-800/80 bg-zinc-900/60 p-3.5 transition-colors hover:border-zinc-700/80"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h4 className="truncate text-sm font-semibold text-white">
                        {item.merchant_raw}
                      </h4>
                      <span className="shrink-0 rounded-md bg-zinc-800 px-1.5 py-0.5 text-[10px] font-medium text-zinc-400">
                        {item.category_name}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-xs text-zinc-400">
                      <span className="font-mono font-semibold text-zinc-200 tabular-nums">
                        {Number(item.amount).toFixed(2)} {item.currency || "₴"}
                      </span>
                      <span>•</span>
                      <span className="text-[11px] text-amber-400/90">
                        {daysLeft} {daysLeft === 1 ? "день" : "дн."} до
                        видалення
                      </span>
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-1.5">
                    {/* Кнопка Відновити */}
                    <button
                      type="button"
                      onClick={() => restoreMutation.mutate(item.id)}
                      disabled={restoreMutation.isPending}
                      className="flex items-center gap-1 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1.5 text-xs font-semibold text-emerald-400 transition-all hover:bg-emerald-500/20 active:scale-95 disabled:opacity-50"
                      title="Відновити транзакцію"
                    >
                      <RotateCcw size={13} />
                      <span className="hidden sm:inline">Відновити</span>
                    </button>

                    {/* Кнопка Безповоротне видалення */}
                    <button
                      type="button"
                      onClick={() => permanentDeleteMutation.mutate(item.id)}
                      disabled={permanentDeleteMutation.isPending}
                      className="flex h-8 w-8 items-center justify-center rounded-xl text-zinc-500 transition-colors hover:bg-rose-500/20 hover:text-rose-400 active:scale-95 disabled:opacity-50"
                      title="Видалити безповоротно"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Футер: Кнопка очищення всього кошика */}
        {trashItems.length > 0 && (
          <div className="mt-3 shrink-0 border-t border-zinc-800/80 pt-3">
            {confirmClear ? (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic("selection");
                    setConfirmClear(false);
                  }}
                  className="flex-1 rounded-xl border border-zinc-800 bg-zinc-900 py-2 text-xs font-semibold text-zinc-400 transition-colors hover:bg-zinc-800 active:scale-95"
                >
                  Скасувати
                </button>
                <button
                  type="button"
                  onClick={() => clearTrashMutation.mutate()}
                  disabled={clearTrashMutation.isPending}
                  className="flex-1 rounded-xl bg-rose-600 py-2 text-xs font-bold text-white shadow-lg shadow-rose-950/40 transition-all hover:bg-rose-500 active:scale-95 disabled:opacity-50"
                >
                  {clearTrashMutation.isPending ? (
                    <Loader2 size={14} className="mx-auto animate-spin" />
                  ) : (
                    "Точно очистити все"
                  )}
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => {
                  triggerHaptic("warning");
                  setConfirmClear(true);
                }}
                className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-rose-900/30 bg-rose-950/20 py-2 text-xs font-semibold text-rose-400 transition-colors hover:bg-rose-900/30 active:scale-95"
              >
                <Trash2 size={13} />
                Очистити весь кошик
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
