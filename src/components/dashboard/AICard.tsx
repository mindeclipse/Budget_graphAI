"use client";

import { useMemo, useState, type FormEvent } from "react";
import {
  Sparkles,
  AlertTriangle,
  CheckCircle2,
  AlertOctagon,
  MessageSquare,
  Clock,
  Send,
} from "lucide-react";
import { AIAnalysisResponse, SupportedGeminiModel } from "@/types/ai";
import {
  generateProactiveAlerts,
  generateDynamicQuickPrompts,
} from "@/lib/client-proactive-alerts";

interface AICardProps {
  aiAnalysis: AIAnalysisResponse | null;
  onOpenAiDrawer: (initialPrompt?: string) => void;
  isAiLoading?: boolean;
  budgetMetrics?: {
    remaining: number;
    safeDailySpend: number;
    daysRemaining: number;
    exactPercent: number;
    barColor?: string;
    status?: "healthy" | "warning" | "danger";
  };
  categoryStats?: Array<{
    name: string;
    amount: number;
    percentage: number;
  }>;
  categoryBudgets?: Record<string, number>;
  radarUpcoming?: Array<{
    id: number;
    title: string;
    amount: number;
    days_remaining: number;
    status: string;
  }>;
  selectedModel?: SupportedGeminiModel;
  onModelChange?: (model: SupportedGeminiModel) => void;
}

export function AICard({
  aiAnalysis,
  onOpenAiDrawer,
  isAiLoading: _isAiLoading = false,
  budgetMetrics = {
    remaining: 0,
    safeDailySpend: 0,
    daysRemaining: 0,
    exactPercent: 0,
    status: "healthy",
  },
  categoryStats = [],
  categoryBudgets = {},
  radarUpcoming = [],
  selectedModel = "gemini-3.5-flash",
  onModelChange,
}: AICardProps) {
  const [quickInput, setQuickInput] = useState("");

  // Генерація проактивних алертів на основі реальних показників
  const proactiveAlerts = useMemo(() => {
    return generateProactiveAlerts({
      budgetMetrics,
      categoryStats,
      categoryBudgets,
      radarUpcoming,
      aiAnalysis,
    });
  }, [
    budgetMetrics,
    categoryStats,
    categoryBudgets,
    radarUpcoming,
    aiAnalysis,
  ]);

  const statusConfig = {
    healthy: {
      label: "Бюджет у нормі",
      badge: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
      dot: "bg-emerald-400 animate-pulse",
      icon: CheckCircle2,
    },
    warning: {
      label: "Підвищений темп",
      badge: "border-amber-500/30 bg-amber-500/10 text-amber-400",
      dot: "bg-amber-400 animate-pulse",
      icon: AlertTriangle,
    },
    danger: {
      label: "Ризик дефіциту",
      badge: "border-rose-500/30 bg-rose-500/10 text-rose-400",
      dot: "bg-rose-400 animate-pulse",
      icon: AlertOctagon,
    },
  };

  const derivedBudgetStatus =
    budgetMetrics.status ||
    (budgetMetrics.remaining <= 0 || budgetMetrics.safeDailySpend < 150
      ? "danger"
      : budgetMetrics.exactPercent >= 80
        ? "warning"
        : "healthy");

  const currentStatus =
    aiAnalysis?.status === "critical"
      ? statusConfig.danger
      : aiAnalysis?.status === "warning"
        ? statusConfig.warning
        : statusConfig[derivedBudgetStatus] || statusConfig.healthy;

  const handleQuickSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!quickInput.trim()) return;
    onOpenAiDrawer(quickInput.trim());
    setQuickInput("");
  };

  const quickQuestions = useMemo(() => {
    const upcomingSub = radarUpcoming?.[0]
      ? {
          title: radarUpcoming[0].title,
          amount: radarUpcoming[0].amount,
          daysRemaining: radarUpcoming[0].days_remaining,
        }
      : undefined;

    return generateDynamicQuickPrompts({
      remaining: budgetMetrics.remaining,
      safeDailySpend: budgetMetrics.safeDailySpend,
      daysRemaining: budgetMetrics.daysRemaining,
      exactPercent: budgetMetrics.exactPercent,
      status: budgetMetrics.status,
      topCategoryName: categoryStats[0]?.name,
      upcomingSubscription: upcomingSub,
    });
  }, [budgetMetrics, categoryStats, radarUpcoming]);

  return (
    <div className="flex flex-col justify-between overflow-hidden rounded-2xl border border-zinc-900 bg-zinc-950 p-5 shadow-sm">
      {/* 1. Верхній заголовок та перемикач моделей */}
      <div>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-zinc-900 pb-4">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg border border-purple-500/20 bg-purple-500/10 text-purple-400">
              <Sparkles size={15} />
            </div>
            <div>
              <h2 className="text-xs font-semibold tracking-wider text-zinc-300 uppercase">
                AI Фінансовий Радник
              </h2>
              <p className="text-[11px] text-zinc-500">
                Проактивний моніторинг & живий діалог
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {onModelChange && (
              <select
                value={selectedModel}
                onChange={(e) =>
                  onModelChange(e.target.value as SupportedGeminiModel)
                }
                className="rounded-lg border border-zinc-800 bg-zinc-900 px-2 py-1 text-[11px] font-medium text-zinc-300 focus:ring-1 focus:ring-purple-500 focus:outline-none"
              >
                <option value="gemini-3.5-flash">Flash (Швидка)</option>
                <option value="gemini-3.7-flash">3.7 Flash (Міркування)</option>
                <option value="gemini-3.5-flash-lite">Lite (Економна)</option>
              </select>
            )}

            <div
              className={`flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium ${currentStatus.badge}`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${currentStatus.dot}`}
              />
              <span>{currentStatus.label}</span>
            </div>
          </div>
        </div>

        {/* 2. Швидкі метрики здоров'я бюджету */}
        <div className="mb-4 grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-xl border border-zinc-900 bg-zinc-900/30 p-2.5">
            <p className="text-[10px] font-medium tracking-wider text-zinc-500 uppercase">
              Безпечно на день
            </p>
            <p className="mt-0.5 font-mono text-sm font-bold text-emerald-400 tabular-nums">
              {Math.round(budgetMetrics.safeDailySpend).toLocaleString("uk-UA")}{" "}
              ₴
              <span className="text-[10px] font-normal text-zinc-500">
                {" "}
                /дн
              </span>
            </p>
          </div>

          <div className="rounded-xl border border-zinc-900 bg-zinc-900/30 p-2.5">
            <p className="text-[10px] font-medium tracking-wider text-zinc-500 uppercase">
              Залишок бюджету
            </p>
            <p className="mt-0.5 font-mono text-sm font-bold text-zinc-200 tabular-nums">
              {Math.round(budgetMetrics.remaining).toLocaleString("uk-UA")} ₴
              <span className="text-[10px] font-normal text-zinc-500">
                {" "}
                ({budgetMetrics.daysRemaining} дн)
              </span>
            </p>
          </div>
        </div>

        {/* 3. Проактивні алерти (Live Alerts) */}
        <div className="mb-4 space-y-2">
          <p className="text-[10px] font-semibold tracking-wider text-zinc-500 uppercase">
            Проактивні спостереження
          </p>

          {proactiveAlerts.slice(0, 2).map((alert) => (
            <div
              key={alert.id}
              className={`flex items-start gap-2.5 rounded-xl border p-2.5 text-xs transition-colors ${
                alert.severity === "critical"
                  ? "border-rose-900/30 bg-rose-950/10 text-rose-300"
                  : alert.severity === "warning"
                    ? "border-amber-900/30 bg-amber-950/10 text-amber-300"
                    : alert.severity === "info"
                      ? "border-blue-900/30 bg-blue-950/10 text-blue-300"
                      : "border-emerald-900/30 bg-emerald-950/10 text-emerald-300"
              }`}
            >
              <div className="mt-0.5 shrink-0">
                {alert.severity === "critical" ? (
                  <AlertOctagon size={13} className="text-rose-400" />
                ) : alert.severity === "warning" ? (
                  <AlertTriangle size={13} className="text-amber-400" />
                ) : alert.type === "subscription" ? (
                  <Clock size={13} className="text-blue-400" />
                ) : (
                  <CheckCircle2 size={13} className="text-emerald-400" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-zinc-200">{alert.title}</p>
                <p className="text-[11px] leading-snug text-zinc-400">
                  {alert.description}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* 4. Швидкі чіпси запитань для чату */}
        <div className="mb-4">
          <p className="mb-1.5 text-[10px] font-semibold tracking-wider text-zinc-500 uppercase">
            Швидкі запитання до радника
          </p>
          <div className="flex flex-wrap gap-1.5">
            {quickQuestions.map((q, i) => (
              <button
                key={i}
                type="button"
                onClick={() => onOpenAiDrawer(q)}
                className="rounded-lg border border-zinc-800/80 bg-zinc-900/50 px-2.5 py-1 text-[11px] text-zinc-300 transition-all hover:border-purple-500/40 hover:bg-purple-950/20 hover:text-purple-200"
              >
                {q}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 5. Нижня форма швидкого вводу та кнопка розгортання шторки */}
      <div className="border-t border-zinc-900 pt-3">
        <form
          onSubmit={handleQuickSubmit}
          className="relative flex items-center gap-1.5"
        >
          <input
            type="text"
            value={quickInput}
            onChange={(e) => setQuickInput(e.target.value)}
            placeholder="Запитати радника про бюджет..."
            className="w-full rounded-xl border border-zinc-800 bg-zinc-900/80 px-3 py-2 text-xs text-zinc-200 placeholder-zinc-500 focus:border-purple-500 focus:bg-zinc-900 focus:outline-none"
          />
          <button
            type="submit"
            disabled={!quickInput.trim()}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-purple-600 text-white transition-all hover:bg-purple-500 disabled:opacity-30"
          >
            <Send size={13} />
          </button>
        </form>

        <button
          type="button"
          onClick={() => onOpenAiDrawer()}
          className="mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-xl border border-purple-500/30 bg-purple-500/10 py-2 text-xs font-semibold text-purple-300 transition-all hover:bg-purple-500/20 active:scale-[0.99]"
        >
          <MessageSquare size={13} />
          {aiAnalysis
            ? "Відкрити повний звіт & чат"
            : "Запустити детальний аналіз & чат"}
        </button>
      </div>
    </div>
  );
}
