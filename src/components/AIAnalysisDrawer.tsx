"use client";

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
    <div className="fixed inset-0 z-50 flex justify-center bg-black/60 backdrop-blur-xs">
      {/* Клік по підкладці закриває шторку */}
      <div className="absolute inset-0" onClick={onClose} />

      {/* Контейнер шторки знизу */}
      <div className="absolute bottom-0 z-10 max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-t-3xl border-t border-zinc-800 bg-zinc-950 p-6 shadow-2xl transition-all">
        {/* Ручка шторки */}
        <div className="mx-auto mb-5 h-1.5 w-12 rounded-full bg-zinc-800" />

        {/* Заголовок та контролери */}
        <div className="mb-5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-purple-500/30 bg-purple-500/10 text-purple-400">
              <Sparkles size={16} />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-white">
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
            className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-800 hover:text-white"
          >
            <X size={18} />
          </button>
        </div>

        {/* Селектор версій моделі */}
        <div className="mb-5 flex items-center justify-between rounded-xl border border-zinc-900 bg-zinc-900/60 p-1.5">
          <span className="pl-2 text-xs text-zinc-400">Версія моделі:</span>
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => onModelChange("gemini-3.7-flash")}
              className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-all ${
                selectedModel === "gemini-3.5-flash"
                  ? "bg-zinc-800 text-purple-300 shadow-xs"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              3.7 Flash (Глибок)
            </button>
            <button
              type="button"
              onClick={() => onModelChange("gemini-3.5-flash-lite")}
              className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-all ${
                selectedModel === "gemini-3.5-flash-lite"
                  ? "bg-zinc-800 text-purple-300 shadow-xs"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              3.5 Flash-Lite (Швидка)
            </button>
          </div>
        </div>

        {/* Стан завантаження */}
        {isLoading && (
          <div className="flex flex-col items-center justify-center py-12 text-zinc-400">
            <RefreshCw
              size={24}
              className="mb-3 animate-spin text-purple-400"
            />
            <p className="text-xs">
              Формування фінансового звіту через {selectedModel}...
            </p>
          </div>
        )}

        {/* Тіло аналізу */}
        {!isLoading && analysis && (
          <div className="space-y-4">
            {/* Статус і резюме */}
            <div className="rounded-2xl border border-zinc-900 bg-zinc-900/40 p-4">
              <div className="mb-2 flex items-center justify-between">
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
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl border border-zinc-900 bg-zinc-900/40 p-3.5">
                <div className="text-[11px] text-zinc-500">Прогноз залишку</div>
                <div
                  className={`mt-1 font-mono text-base font-semibold ${
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
              <div className="rounded-2xl border border-zinc-900 bg-zinc-900/40 p-3.5">
                <div className="text-[11px] text-zinc-500">
                  Рекомендовано на день
                </div>
                <div className="mt-1 font-mono text-base font-semibold text-zinc-200">
                  ~
                  {analysis.paceAnalysis.adjustedDailyBudget.toLocaleString(
                    "uk-UA"
                  )}{" "}
                  ₴/дн
                </div>
              </div>
            </div>

            {/* Спостереження */}
            <div className="rounded-2xl border border-zinc-900 bg-zinc-900/40 p-4">
              <div className="mb-2 text-xs font-semibold text-zinc-400">
                Ключові факти:
              </div>
              <ul className="space-y-1.5 text-xs text-zinc-300">
                {analysis.keyFindings.map((item, idx) => (
                  <li key={idx} className="flex items-start gap-2">
                    <span className="text-purple-400">•</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Рекомендації */}
            <div className="rounded-2xl border border-zinc-900 bg-zinc-900/40 p-4">
              <div className="mb-2 text-xs font-semibold text-zinc-400">
                План дій:
              </div>
              <ul className="space-y-1.5 text-xs text-zinc-300">
                {analysis.actionableSteps.map((step, idx) => (
                  <li key={idx} className="flex items-start gap-2">
                    <span className="font-mono text-[11px] text-purple-400">
                      0{idx + 1}.
                    </span>
                    <span>{step}</span>
                  </li>
                ))}
              </ul>
            </div>

            <button
              type="button"
              onClick={onReanalyze}
              className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900 py-2.5 text-xs font-medium text-zinc-300 hover:bg-zinc-800"
            >
              <RefreshCw size={14} /> Оновити аналіз
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
