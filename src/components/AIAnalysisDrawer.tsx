"use client";

import { useEffect } from "react";
import {
  X,
  Sparkles,
  AlertTriangle,
  CheckCircle2,
  AlertOctagon,
  RefreshCw,
} from "lucide-react";
import { AIAnalysisResponse, SupportedGeminiModel } from "@/types/ai";

interface AIAnalysisDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  analysis: AIAnalysisResponse | null;
  isLoading: boolean;
  selectedModel: SupportedGeminiModel;
  onModelChange: (model: SupportedGeminiModel) => void;
  onReanalyze: () => void;
}

export function AIAnalysisDrawer({
  isOpen,
  onClose,
  analysis,
  isLoading,
  selectedModel,
  onModelChange,
  onReanalyze,
}: AIAnalysisDrawerProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (isOpen) {
      window.addEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "hidden";
    }
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "unset";
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const statusConfig = {
    on_track: {
      label: "У межах норми",
      icon: CheckCircle2,
      badge: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
    },
    warning: {
      label: "Підвищений темп",
      icon: AlertTriangle,
      badge: "border-amber-500/30 bg-amber-500/10 text-amber-400",
    },
    critical: {
      label: "Ризик перевитрати",
      icon: AlertOctagon,
      badge: "border-rose-500/30 bg-rose-500/10 text-rose-400",
    },
  };

  const currentStatus = analysis
    ? statusConfig[analysis.status]
    : statusConfig.on_track;
  const StatusIcon = currentStatus.icon;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/75 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      {/* Клік по підкладці закриває шторку */}
      <div className="fixed inset-0" onClick={onClose} aria-hidden="true" />

      {/* Адаптивна шторка для iPhone / Центрована картка для десктопу */}
      <div className="border-zinc-850 relative z-10 flex max-h-[90vh] w-full max-w-2xl flex-col overscroll-contain rounded-t-[28px] border bg-zinc-950 p-5 pt-3 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-2xl sm:max-h-[85vh] sm:rounded-3xl sm:p-6 sm:pb-6">
        {/* Grabber Bar для iOS */}
        <div className="mx-auto mb-3 h-1.5 w-11 shrink-0 rounded-full bg-zinc-700/50 sm:hidden" />

        {/* Заголовок та закриття */}
        <div className="border-zinc-850/80 mb-4 flex items-center justify-between border-b pb-3.5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl border border-purple-500/30 bg-purple-500/10 text-purple-400 shadow-[0_0_12px_rgba(168,85,247,0.15)]">
              <Sparkles size={16} />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">
                AI Фінансовий аналітик
              </h2>
              <span className="text-[11px] text-zinc-400">
                Аналіз витрат поточного циклу
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="border-zinc-850 flex h-8 w-8 items-center justify-center rounded-xl border bg-zinc-900/60 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-white active:scale-95"
          >
            <X size={16} />
          </button>
        </div>

        {/* Селектор версій моделі */}
        <div className="border-zinc-850 mb-4 flex items-center justify-between rounded-xl border bg-zinc-900/50 p-1.5">
          <span className="pl-2 text-[11px] font-medium text-zinc-400">
            Версія моделі:
          </span>
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => onModelChange("gemini-3.5-flash-lite")}
              className={`rounded-lg px-2.5 py-1.5 text-xs font-medium transition-all active:scale-95 ${
                selectedModel === "gemini-3.5-flash-lite"
                  ? "border border-purple-500/30 bg-zinc-800 text-purple-300 shadow-xs"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              3.5 Flash-Lite
            </button>
            <button
              type="button"
              onClick={() => onModelChange("gemini-3.7-flash")}
              className={`rounded-lg px-2.5 py-1.5 text-xs font-medium transition-all active:scale-95 ${
                selectedModel === "gemini-3.7-flash"
                  ? "border border-purple-500/30 bg-zinc-800 text-purple-300 shadow-xs"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              3.7 Flash
            </button>
          </div>
        </div>

        {/* Вміст аналізу / Скрол-зона */}
        <div className="flex-1 [scrollbar-width:thin] space-y-3.5 overflow-y-auto overscroll-contain pr-1">
          {/* Стан завантаження */}
          {isLoading && (
            <div className="flex flex-col items-center justify-center py-16 text-zinc-400">
              <RefreshCw
                size={26}
                className="mb-3 animate-spin text-purple-400"
              />
              <p className="text-xs text-zinc-400">
                Формування фінансового звіту через {selectedModel}...
              </p>
            </div>
          )}

          {/* Тіло аналізу */}
          {!isLoading && analysis && (
            <>
              {/* Статус і резюме */}
              <div className="border-zinc-850 rounded-2xl border bg-zinc-900/40 p-4">
                <div className="mb-2.5 flex items-center justify-between">
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${currentStatus.badge}`}
                  >
                    <StatusIcon size={12} />
                    {currentStatus.label}
                  </span>
                  <span className="font-mono text-[10px] text-zinc-500">
                    model: {analysis.usedModel}
                  </span>
                </div>
                <p className="text-xs leading-relaxed text-zinc-300">
                  {analysis.summary}
                </p>
              </div>

              {/* Метрики темпу */}
              <div className="grid grid-cols-2 gap-2.5">
                <div className="border-zinc-850 rounded-2xl border bg-zinc-900/40 p-3.5">
                  <div className="text-[11px] font-medium text-zinc-500">
                    Прогноз залишку
                  </div>
                  <div
                    className={`mt-1 font-mono text-base font-semibold tabular-nums ${
                      analysis.paceAnalysis.projectedEndBalance >= 0
                        ? "text-emerald-400"
                        : "text-rose-400"
                    }`}
                  >
                    {analysis.paceAnalysis.projectedEndBalance > 0 ? "+" : ""}
                    {analysis.paceAnalysis.projectedEndBalance.toLocaleString(
                      "uk-UA"
                    )}{" "}
                    ₴
                  </div>
                </div>

                <div className="border-zinc-850 rounded-2xl border bg-zinc-900/40 p-3.5">
                  <div className="text-[11px] font-medium text-zinc-500">
                    Рекомендовано на день
                  </div>
                  <div className="mt-1 font-mono text-base font-semibold text-zinc-200 tabular-nums">
                    ~
                    {analysis.paceAnalysis.adjustedDailyBudget.toLocaleString(
                      "uk-UA"
                    )}{" "}
                    ₴/дн
                  </div>
                </div>
              </div>

              {/* Спостереження */}
              <div className="border-zinc-850 rounded-2xl border bg-zinc-900/40 p-4">
                <div className="mb-2 text-xs font-semibold tracking-wide text-zinc-400 uppercase">
                  Ключові факти
                </div>
                <ul className="space-y-2 text-xs text-zinc-300">
                  {analysis.keyFindings.map((item, idx) => (
                    <li key={idx} className="flex items-start gap-2">
                      <span className="text-purple-400">•</span>
                      <span className="leading-relaxed">{item}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Рекомендації */}
              <div className="border-zinc-850 rounded-2xl border bg-zinc-900/40 p-4">
                <div className="mb-2 text-xs font-semibold tracking-wide text-zinc-400 uppercase">
                  План дій
                </div>
                <ul className="space-y-2 text-xs text-zinc-300">
                  {analysis.actionableSteps.map((step, idx) => (
                    <li key={idx} className="flex items-start gap-2">
                      <span className="font-mono text-[11px] font-semibold text-purple-400">
                        0{idx + 1}.
                      </span>
                      <span className="leading-relaxed">{step}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Кнопка перезапуску аналізу */}
              <div className="pt-1">
                <button
                  type="button"
                  onClick={onReanalyze}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900/80 py-3 text-xs font-semibold text-zinc-200 transition-all hover:border-zinc-700 hover:bg-zinc-800 active:scale-[0.99]"
                >
                  <RefreshCw size={14} /> Оновити аналіз
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
