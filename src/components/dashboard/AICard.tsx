"use client";

import React from "react";
import { Sparkles } from "lucide-react";
import { AIAnalysisResponse } from "@/types/ai";

interface AICardProps {
  aiAnalysis: AIAnalysisResponse | null;
  onOpenAiDrawer: () => void;
}

export function AICard({ aiAnalysis, onOpenAiDrawer }: AICardProps) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-zinc-800/80 bg-gradient-to-b from-zinc-900/60 to-zinc-950 p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="rounded-xl border border-purple-500/30 bg-purple-500/10 p-2 text-purple-400">
            <Sparkles size={18} />
          </div>
          <div>
            <h3 className="text-xs font-bold tracking-wider text-zinc-200 uppercase">
              AI Фінансовий Аналітик
            </h3>
            <p className="text-[11px] text-zinc-500">
              {aiAnalysis
                ? `Останній аналіз: ${aiAnalysis.status === "on_track" ? "В нормі" : "Потребує уваги"}`
                : "Аналіз темпу витрат та оптимізація бюджету"}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onOpenAiDrawer}
          className="flex items-center gap-1.5 rounded-xl border border-purple-500/30 bg-purple-500/10 px-3.5 py-2 text-xs font-medium text-purple-300 transition-all hover:bg-purple-500/20 active:scale-95"
        >
          <Sparkles size={13} />
          {aiAnalysis ? "Переглянути" : "Аналізувати"}
        </button>
      </div>
    </div>
  );
}
