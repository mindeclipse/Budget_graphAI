"use client";

import React from "react";
import { Zap } from "lucide-react";
import { SupportedGeminiModel } from "@/types/ai";

interface ModelSelectorProps {
  selectedModel: SupportedGeminiModel;
  onModelChange: (model: SupportedGeminiModel) => void;
}

export function ModelSelector({
  selectedModel,
  onModelChange,
}: ModelSelectorProps) {
  return (
    <div className="mb-3 flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-900/50 p-1.5">
      <div className="flex items-center gap-1.5 pl-2 text-[11px] font-medium text-zinc-400">
        <Zap size={12} className="text-purple-400" />
        <span>Модель Gemini:</span>
      </div>
      <div className="flex gap-1">
        <button
          type="button"
          onClick={() => onModelChange("gemini-3.5-flash")}
          className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-all ${
            selectedModel === "gemini-3.5-flash"
              ? "border border-purple-500/30 bg-zinc-800 text-purple-300 shadow-xs"
              : "text-zinc-500 hover:text-zinc-300"
          }`}
        >
          3.5 Flash
        </button>
        <button
          type="button"
          onClick={() => onModelChange("gemini-3.7-flash")}
          className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-all ${
            selectedModel === "gemini-3.7-flash"
              ? "border border-purple-500/30 bg-zinc-800 text-purple-300 shadow-xs"
              : "text-zinc-500 hover:text-zinc-300"
          }`}
        >
          3.7 Flash
        </button>
        <button
          type="button"
          onClick={() => onModelChange("gemini-3.5-flash-lite")}
          className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-all ${
            selectedModel === "gemini-3.5-flash-lite"
              ? "border border-purple-500/30 bg-zinc-800 text-purple-300 shadow-xs"
              : "text-zinc-500 hover:text-zinc-300"
          }`}
        >
          Lite
        </button>
      </div>
    </div>
  );
}
