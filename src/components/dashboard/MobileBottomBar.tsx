"use client";

import { BarChart3, Receipt, Plus, Landmark, Sparkles } from "lucide-react";
import { triggerHaptic } from "@/lib/haptics";

export interface MobileBottomBarProps {
  activeTab: "overview" | "history" | "wealth";
  onTabChange: (tab: "overview" | "history" | "wealth") => void;
  onAddExpense: () => void;
  onOpenAi: () => void;
}

export function MobileBottomBar({
  activeTab,
  onTabChange,
  onAddExpense,
  onOpenAi,
}: MobileBottomBarProps) {
  const handleTabClick = (tab: "overview" | "history" | "wealth") => {
    if (activeTab !== tab) {
      triggerHaptic("selection");
      onTabChange(tab);
    }
  };

  const handleAddClick = () => {
    triggerHaptic("medium");
    onAddExpense();
  };

  const handleAiClick = () => {
    triggerHaptic("light");
    onOpenAi();
  };

  return (
    <>
      {/* М'який темний градієнт для усунення просвічування тексту під островом */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-x-0 bottom-0 z-30 h-16 bg-gradient-to-t from-black via-zinc-950/80 to-transparent md:hidden"
      />

      {/* Острів-капсула в самому низу екрана */}
      <nav
        aria-label="Мобільна навігація"
        className="fixed inset-x-3 bottom-2 z-40 mx-auto max-w-md rounded-2xl border border-zinc-800/90 bg-zinc-950/95 p-1.5 shadow-[0_12px_40px_rgba(0,0,0,0.9)] backdrop-blur-2xl transition-all md:hidden"
      >
        <div className="flex items-center justify-between gap-1">
          {/* 1. Вкладка: Аналітика & Бюджет */}
          <button
            type="button"
            onClick={() => handleTabClick("overview")}
            className={`flex flex-1 touch-manipulation flex-col items-center justify-center rounded-xl px-1 py-1.5 transition-all active:scale-95 ${
              activeTab === "overview"
                ? "border border-zinc-700/60 bg-zinc-800 text-white shadow-sm"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <BarChart3 size={18} strokeWidth={2} />
            <span className="mt-1 text-[10px] font-medium tracking-tight">
              Аналітика
            </span>
          </button>

          {/* 2. Вкладка: Історія */}
          <button
            type="button"
            onClick={() => handleTabClick("history")}
            className={`flex flex-1 touch-manipulation flex-col items-center justify-center rounded-xl px-1 py-1.5 transition-all active:scale-95 ${
              activeTab === "history"
                ? "border border-zinc-700/60 bg-zinc-800 text-white shadow-sm"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <Receipt size={18} strokeWidth={2} />
            <span className="mt-1 text-[10px] font-medium tracking-tight">
              Історія
            </span>
          </button>

          {/* 3. Центральна дія: Додати витрату (+) */}
          <button
            type="button"
            onClick={handleAddClick}
            aria-label="Швидко додати витрату"
            className="flex h-11 w-11 shrink-0 touch-manipulation items-center justify-center rounded-xl bg-sky-600 text-white shadow-md shadow-sky-950/50 transition-all hover:bg-sky-500 active:scale-90"
          >
            <Plus size={20} strokeWidth={2.5} />
          </button>

          {/* 4. Вкладка: Капітал */}
          <button
            type="button"
            onClick={() => handleTabClick("wealth")}
            className={`flex flex-1 touch-manipulation flex-col items-center justify-center rounded-xl px-1 py-1.5 transition-all active:scale-95 ${
              activeTab === "wealth"
                ? "border border-zinc-700/60 bg-zinc-800 text-white shadow-sm"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <Landmark size={18} strokeWidth={2} />
            <span className="mt-1 text-[10px] font-medium tracking-tight">
              Капітал
            </span>
          </button>

          {/* 5. Швидка дія: AI Коуч */}
          <button
            type="button"
            onClick={handleAiClick}
            aria-label="AI Фінансовий Коуч"
            className="flex flex-1 touch-manipulation flex-col items-center justify-center rounded-xl px-1 py-1.5 text-zinc-400 transition-all hover:text-zinc-200 active:scale-95"
          >
            <Sparkles size={18} strokeWidth={2} className="text-zinc-300" />
            <span className="mt-1 text-[10px] font-medium tracking-tight">
              AI Коуч
            </span>
          </button>
        </div>
      </nav>
    </>
  );
}
