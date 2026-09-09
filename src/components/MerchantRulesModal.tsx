"use client";

import React, { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  SlidersHorizontal,
  Search,
  Plus,
  Trash2,
  Edit2,
  X,
  Loader2,
  Check,
  Tag,
  ArrowRight,
} from "lucide-react";
import { CATEGORIES } from "@/constants/categories";
import { MerchantRule } from "@/types/finance";
import { triggerHaptic } from "@/lib/haptics";
import { toast } from "sonner";

interface MerchantRulesModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function MerchantRulesModal({
  isOpen,
  onClose,
}: MerchantRulesModalProps) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [isFormOpen, setIsFormOpen] = useState(false);

  // Стан форми створення/редагування
  const [pattern, setPattern] = useState("");
  const [normalizedName, setNormalizedName] = useState("");
  const [categoryName, setCategoryName] = useState<string>(CATEGORIES[0]);
  const [editingPattern, setEditingPattern] = useState<string | null>(null);

  // Отримання списку правил з API
  const { data: rules = [], isLoading } = useQuery<MerchantRule[]>({
    queryKey: ["merchant-rules"],
    queryFn: async () => {
      const res = await fetch("/api/merchant-rules");
      if (!res.ok) throw new Error("Помилка завантаження правил");
      const json = await res.json();
      return json.rules || [];
    },
    enabled: isOpen,
    staleTime: 1000 * 30,
  });

  // Збереження або оновлення правила
  const saveMutation = useMutation({
    mutationFn: async (payload: {
      pattern: string;
      normalized_name: string;
      category_name: string;
    }) => {
      const res = await fetch("/api/merchant-rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Не вдалося зберегти правило");
      }
      return res.json();
    },
    onSuccess: () => {
      triggerHaptic("success");
      toast.success(
        editingPattern ? "Правило оновлено" : "Нове правило додано"
      );
      resetForm();
      queryClient.invalidateQueries({ queryKey: ["merchant-rules"] });
    },
    onError: (err: any) => {
      triggerHaptic("error");
      toast.error(err.message || "Помилка збереження");
    },
  });

  // Видалення правила
  const deleteMutation = useMutation({
    mutationFn: async (pat: string) => {
      const res = await fetch(
        `/api/merchant-rules?pattern=${encodeURIComponent(pat)}`,
        {
          method: "DELETE",
        }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Не вдалося видалити правило");
      }
      return res.json();
    },
    onSuccess: () => {
      triggerHaptic("heavy");
      toast.success("Правило видалено");
      queryClient.invalidateQueries({ queryKey: ["merchant-rules"] });
    },
    onError: (err: any) => {
      triggerHaptic("error");
      toast.error(err.message || "Помилка видалення");
    },
  });

  const resetForm = () => {
    setPattern("");
    setNormalizedName("");
    setCategoryName(CATEGORIES[0]);
    setEditingPattern(null);
    setIsFormOpen(false);
  };

  const handleStartEdit = (rule: MerchantRule) => {
    triggerHaptic("selection");
    setPattern(rule.pattern);
    setNormalizedName(rule.normalized_name || "");
    setCategoryName(rule.category_name || CATEGORIES[0]);
    setEditingPattern(rule.pattern);
    setIsFormOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!pattern.trim()) {
      toast.error("Вкажіть шаблон або назву мерчанта");
      return;
    }
    saveMutation.mutate({
      pattern: pattern.trim(),
      normalized_name: normalizedName.trim() || pattern.trim(),
      category_name: categoryName,
    });
  };

  // Фільтрація правил за пошуком
  const filteredRules = useMemo(() => {
    if (!search.trim()) return rules;
    const s = search.toLowerCase();
    return rules.filter(
      (r) =>
        r.pattern.toLowerCase().includes(s) ||
        r.normalized_name?.toLowerCase().includes(s) ||
        r.category_name.toLowerCase().includes(s)
    );
  }, [rules, search]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/75 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      {/* Підкладка */}
      <div
        className="fixed inset-0"
        onClick={() => {
          triggerHaptic("light");
          onClose();
        }}
      />

      {/* Модальне вікно */}
      <div className="relative z-10 flex max-h-[88vh] w-full max-w-xl flex-col overscroll-contain rounded-t-[28px] border border-zinc-800/80 bg-zinc-950 p-5 pt-3 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-2xl sm:max-h-[85vh] sm:rounded-3xl sm:p-6 sm:pb-6">
        {/* Grabber Bar */}
        <div className="mx-auto mb-3.5 h-1.5 w-11 shrink-0 rounded-full bg-zinc-700/50 sm:hidden" />

        {/* Шапка */}
        <div className="mb-3.5 flex items-center justify-between border-b border-zinc-800/80 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-sky-500/20 bg-sky-500/10 text-sky-400">
              <SlidersHorizontal size={18} />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">
                Правила мерчантів
              </h3>
              <p className="text-xs text-zinc-400">
                Автокатегоризація та охайні назви
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

        {/* Панель пошуку та кнопка створення нового правила */}
        <div className="mb-3 flex items-center gap-2">
          <div className="relative flex-1">
            <Search
              size={14}
              className="absolute top-1/2 left-3 -translate-y-1/2 text-zinc-500"
            />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Пошук серед правил..."
              className="w-full rounded-xl border border-zinc-800 bg-zinc-900/90 py-2 pr-3 pl-9 text-xs text-white placeholder-zinc-500 focus:border-zinc-700 focus:outline-none"
            />
          </div>

          <button
            type="button"
            onClick={() => {
              triggerHaptic("selection");
              if (isFormOpen) {
                resetForm();
              } else {
                setIsFormOpen(true);
              }
            }}
            className="flex shrink-0 items-center gap-1.5 rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs font-semibold text-zinc-200 transition-colors hover:bg-zinc-800 active:scale-95"
          >
            {isFormOpen ? (
              <>
                <X size={14} /> Скасувати
              </>
            ) : (
              <>
                <Plus size={14} className="text-sky-400" /> Додати
              </>
            )}
          </button>
        </div>

        {/* Форма додавання/редагування */}
        {isFormOpen && (
          <form
            onSubmit={handleSubmit}
            className="mb-3.5 rounded-2xl border border-sky-500/20 bg-sky-950/10 p-3.5"
          >
            <h4 className="mb-2.5 text-xs font-semibold text-sky-400">
              {editingPattern
                ? `Редагування правила для: ${editingPattern}`
                : "Нове правило автокатегоризації"}
            </h4>

            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-[11px] font-medium text-zinc-400">
                  Шаблон мерчанта (підрядок у чеку)
                </label>
                <input
                  type="text"
                  required
                  value={pattern}
                  disabled={!!editingPattern}
                  onChange={(e) => setPattern(e.target.value)}
                  placeholder="напр. SILPO або UBER"
                  className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-xs text-white placeholder-zinc-600 focus:border-sky-500 focus:outline-none disabled:opacity-60"
                />
              </div>

              <div>
                <label className="mb-1 block text-[11px] font-medium text-zinc-400">
                  Охайна назва в списку
                </label>
                <input
                  type="text"
                  value={normalizedName}
                  onChange={(e) => setNormalizedName(e.target.value)}
                  placeholder="напр. Сільпо"
                  className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-xs text-white placeholder-zinc-600 focus:border-sky-500 focus:outline-none"
                />
              </div>
            </div>

            <div className="mt-2.5">
              <label className="mb-1 block text-[11px] font-medium text-zinc-400">
                Категорія для автопризначення
              </label>
              <select
                value={categoryName}
                onChange={(e) => setCategoryName(e.target.value)}
                className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-xs text-white focus:border-sky-500 focus:outline-none"
              >
                {CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            <div className="mt-3 flex justify-end gap-2">
              <button
                type="button"
                onClick={resetForm}
                className="rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-zinc-400 hover:bg-zinc-800 active:scale-95"
              >
                Скасувати
              </button>
              <button
                type="submit"
                disabled={saveMutation.isPending}
                className="flex items-center gap-1 rounded-xl bg-sky-500 px-3.5 py-1.5 text-xs font-bold text-zinc-950 shadow-md shadow-sky-950/30 hover:bg-sky-400 active:scale-95 disabled:opacity-50"
              >
                {saveMutation.isPending ? (
                  <Loader2 size={13} className="animate-spin" />
                ) : (
                  <Check size={13} />
                )}
                <span>Зберегти</span>
              </button>
            </div>
          </form>
        )}

        {/* Список правил */}
        <div className="flex-1 space-y-2 overflow-y-auto pr-1">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-12 text-zinc-500">
              <Loader2 size={24} className="animate-spin" />
              <p className="mt-2 text-xs">Завантаження правил...</p>
            </div>
          ) : filteredRules.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center text-zinc-500">
              <Tag size={32} className="mb-2 text-zinc-600" />
              <p className="text-sm font-medium text-zinc-300">
                {search ? "Нічого не знайдено" : "Правил ще немає"}
              </p>
              <p className="mt-1 text-xs text-zinc-500">
                {search
                  ? "Спробуйте інший запит"
                  : "Додайте перше правило для автоматичної категоризації"}
              </p>
            </div>
          ) : (
            filteredRules.map((rule) => (
              <div
                key={rule.pattern}
                className="flex items-center justify-between gap-3 rounded-2xl border border-zinc-800/80 bg-zinc-900/50 p-3 transition-colors hover:border-zinc-700/80"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="max-w-[160px] truncate rounded-lg border border-sky-800/40 bg-sky-950/40 px-2 py-0.5 font-mono text-xs font-semibold text-sky-400 sm:max-w-xs">
                      {rule.pattern}
                    </span>
                    <ArrowRight size={12} className="shrink-0 text-zinc-600" />
                    <span className="max-w-[140px] truncate text-xs font-semibold text-white">
                      {rule.normalized_name || rule.pattern}
                    </span>
                  </div>
                  <div className="mt-1">
                    <span className="inline-flex items-center rounded-md bg-zinc-800/90 px-2 py-0.5 text-[10px] font-medium text-zinc-300">
                      {rule.category_name}
                    </span>
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => handleStartEdit(rule)}
                    className="flex h-8 w-8 items-center justify-center rounded-xl text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-white active:scale-95"
                    title="Редагувати правило"
                  >
                    <Edit2 size={13} />
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      if (confirm(`Видалити правило для "${rule.pattern}"?`)) {
                        deleteMutation.mutate(rule.pattern);
                      }
                    }}
                    disabled={deleteMutation.isPending}
                    className="flex h-8 w-8 items-center justify-center rounded-xl text-zinc-500 transition-colors hover:bg-rose-500/20 hover:text-rose-400 active:scale-95 disabled:opacity-50"
                    title="Видалити правило"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Футер із загальною кількістю */}
        <div className="mt-3 flex items-center justify-between border-t border-zinc-800/80 pt-2.5 text-xs text-zinc-500">
          <span>
            Всього правил: <b>{rules.length}</b>
          </span>
          <span className="text-[11px] text-zinc-500">
            Працюють автоматично при додаванні витрат
          </span>
        </div>
      </div>
    </div>
  );
}
