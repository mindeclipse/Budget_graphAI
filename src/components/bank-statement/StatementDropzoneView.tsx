"use client";

import React from "react";
import { Upload, Loader2, CheckCircle2, AlertCircle } from "lucide-react";

interface StatementDropzoneViewProps {
  initialType?: "expense" | "investment";
  isLoading: boolean;
  loadingText: string;
  status: { type: "success" | "error"; text: string } | null;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onFileSelected: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

export function StatementDropzoneView({
  initialType = "expense",
  isLoading,
  loadingText,
  status,
  fileInputRef,
  onFileSelected,
}: StatementDropzoneViewProps) {
  return (
    <div className="space-y-4">
      <p className="text-xs leading-relaxed text-zinc-400">
        {initialType === "investment"
          ? "Завантажуйте виписки Inzhur (.xlsx) або окремі банківські квитанції (.pdf) поповнення ОВДП та брокерських рахунків."
          : "Виписки вашого банку (.xlsx, .xls, .csv) або поодинокі квитанції переказів (.pdf). Дані зчитуються автоматично, дублікати фільтруються."}
      </p>

      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-800 bg-zinc-900/30 p-6 text-center transition-colors hover:border-zinc-700">
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls,.csv,.pdf,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
          className="hidden"
          onChange={onFileSelected}
          disabled={isLoading}
        />

        {isLoading ? (
          <div className="flex flex-col items-center gap-2.5 py-4">
            <Loader2 size={28} className="animate-spin text-emerald-400" />
            <span className="font-mono text-xs text-zinc-300">
              {loadingText}
            </span>
            <span className="text-[11px] text-zinc-500">
              Зазвичай це займає 2-4 секунди
            </span>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <div className="bg-zinc-850 flex h-11 w-11 items-center justify-center rounded-full border border-zinc-800 text-zinc-400">
              <Upload size={20} />
            </div>
            <div className="space-y-1">
              <p className="text-xs font-medium text-zinc-200">
                Перетягніть файл сюди або натисніть для вибору
              </p>
              <p className="text-[11px] text-zinc-500">
                Квитанція PDF чи виписка XLSX / CSV до 5 МБ
              </p>
            </div>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="mt-1 flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-semibold text-white shadow-lg shadow-emerald-950/40 transition-all hover:bg-emerald-500 active:scale-95"
            >
              Обрати файл з пристрою
            </button>
          </div>
        )}
      </div>

      {status && (
        <div
          className={`flex items-center gap-2.5 rounded-xl border p-3 text-xs ${
            status.type === "success"
              ? "border-emerald-500/30 bg-emerald-500/10 font-mono text-emerald-300 tabular-nums"
              : "border-rose-500/30 bg-rose-500/10 text-rose-300"
          }`}
        >
          {status.type === "success" ? (
            <CheckCircle2 size={16} className="shrink-0 text-emerald-400" />
          ) : (
            <AlertCircle size={16} className="shrink-0 text-rose-400" />
          )}
          <span className="leading-snug">{status.text}</span>
        </div>
      )}
    </div>
  );
}
