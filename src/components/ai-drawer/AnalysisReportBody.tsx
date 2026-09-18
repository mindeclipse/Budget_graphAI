"use client";

import React from "react";
import {
  CheckCircle2,
  AlertTriangle,
  AlertOctagon,
  RefreshCw,
} from "lucide-react";
import { AIAnalysisResponse, SupportedGeminiModel } from "@/types/ai";

interface AnalysisReportBodyProps {
  isLoading: boolean;
  analysis: AIAnalysisResponse | null;
  selectedModel: SupportedGeminiModel;
}

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

export function AnalysisReportBody({
  isLoading,
  analysis,
  selectedModel,
}: AnalysisReportBodyProps) {
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-zinc-400">
        <RefreshCw size={24} className="mb-3 animate-spin text-purple-400" />
        <p className="text-xs text-zinc-400">
          Формування фінансового звіту через {selectedModel}...
        </p>
      </div>
    );
  }

  if (!analysis) return null;

  const currentStatus = statusConfig[analysis.status] || statusConfig.on_track;
  const StatusIcon = currentStatus.icon;

  return (
    <>
      {/* Статус і резюме */}
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-3.5">
        <div className="mb-2 flex items-center justify-between">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${currentStatus.badge}`}
          >
            <StatusIcon size={12} />
            {currentStatus.label}
          </span>
          <span className="font-mono text-[10px] text-zinc-500">
            модель: {analysis.usedModel}
          </span>
        </div>
        <p className="text-xs leading-relaxed text-zinc-300">
          {analysis.summary}
        </p>
      </div>

      {/* Метрики темпу */}
      <div className="grid grid-cols-2 gap-2.5">
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-3">
          <div className="text-[10px] font-medium text-zinc-500 uppercase">
            Прогноз залишку
          </div>
          <div
            className={`mt-1 font-mono text-sm font-bold tabular-nums ${
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

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-3">
          <div className="text-[10px] font-medium text-zinc-500 uppercase">
            Рекомендовано на день
          </div>
          <div className="mt-1 font-mono text-sm font-bold text-zinc-200 tabular-nums">
            ~{analysis.paceAnalysis.adjustedDailyBudget.toLocaleString("uk-UA")}{" "}
            ₴/дн
          </div>
        </div>
      </div>

      {/* Спостереження та план дій */}
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-3">
          <div className="mb-1.5 text-[10px] font-semibold tracking-wide text-zinc-400 uppercase">
            Ключові факти
          </div>
          <ul className="space-y-1.5 text-[11px] text-zinc-300">
            {analysis.keyFindings.map((item, idx) => (
              <li key={idx} className="flex items-start gap-1.5">
                <span className="text-purple-400">•</span>
                <span className="leading-snug">{item}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-3">
          <div className="mb-1.5 text-[10px] font-semibold tracking-wide text-zinc-400 uppercase">
            План дій
          </div>
          <ul className="space-y-1.5 text-[11px] text-zinc-300">
            {analysis.actionableSteps.map((step, idx) => (
              <li key={idx} className="flex items-start gap-1.5">
                <span className="font-mono text-[10px] font-bold text-purple-400">
                  {idx + 1}.
                </span>
                <span className="leading-snug">{step}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </>
  );
}
