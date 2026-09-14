"use client";

import {
  LayoutDashboard,
  Receipt,
  Plus,
  Landmark,
  Sparkles,
} from "lucide-react";
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
    <nav
      aria-label="Мобільна навігація"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-zinc-800/80 bg-zinc-950/90 px-3 pt-1.5 pb-[max(env(safe-area-inset-bottom),10px)] shadow-2xl backdrop-blur-xl transition-all md:hidden"
    >
      <div className="mx-auto flex max-w-md items-center justify-between">
        {/* 1. Вкладка: Огляд / Бюджет */}
        <button
          type="button"
          onClick={() => handleTabClick("overview")}
          className={`flex flex-1 touch-manipulation flex-col items-center justify-center py-1 transition-all active:scale-95 ${
            activeTab === "overview"
              ? "text-sky-400"
              : "text-zinc-500 hover:text-zinc-300"
          }`}
        >
          <div className="relative">
            <LayoutDashboard size={20} />
            {activeTab === "overview" && (
              <span className="absolute -bottom-1 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-sky-400" />
            )}
          </div>
          <span className="mt-1 text-[10px] font-medium tracking-tight">
            Огляд
          </span>
        </button>

        {/* 2. Вкладка: Історія */}
        <button
          type="button"
          onClick={() => handleTabClick("history")}
          className={`flex flex-1 touch-manipulation flex-col items-center justify-center py-1 transition-all active:scale-95 ${
            activeTab === "history"
              ? "text-sky-400"
              : "text-zinc-500 hover:text-zinc-300"
          }`}
        >
          <div className="relative">
            <Receipt size={20} />
            {activeTab === "history" && (
              <span className="absolute -bottom-1 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-sky-400" />
            )}
          </div>
          <span className="mt-1 text-[10px] font-medium tracking-tight">
            Історія
          </span>
        </button>

        {/* 3. Центральна дія: Додати витрату (+) */}
        <div className="flex flex-1 flex-col items-center justify-center">
          <button
            type="button"
            onClick={handleAddClick}
            aria-label="Швидко додати витрату"
            className="-mt-5 flex h-12 w-12 touch-manipulation items-center justify-center rounded-full bg-gradient-to-tr from-sky-500 to-indigo-600 text-white shadow-lg ring-4 shadow-sky-500/30 ring-zinc-950 transition-transform hover:brightness-110 active:scale-90"
          >
            <Plus size={22} strokeWidth={2.5} />
          </button>
          <span className="mt-1 text-[10px] font-medium tracking-tight text-zinc-400">
            Додати
          </span>
        </div>

        {/* 4. Вкладка: Капітал */}
        <button
          type="button"
          onClick={() => handleTabClick("wealth")}
          className={`flex flex-1 touch-manipulation flex-col items-center justify-center py-1 transition-all active:scale-95 ${
            activeTab === "wealth"
              ? "text-sky-400"
              : "text-zinc-500 hover:text-zinc-300"
          }`}
        >
          <div className="relative">
            <Landmark size={20} />
            {activeTab === "wealth" && (
              <span className="absolute -bottom-1 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-sky-400" />
            )}
          </div>
          <span className="mt-1 text-[10px] font-medium tracking-tight">
            Капітал
          </span>
        </button>

        {/* 5. Швидка дія: AI Коуч */}
        <button
          type="button"
          onClick={handleAiClick}
          aria-label="AI Фінансовий Коуч"
          className="flex flex-1 touch-manipulation flex-col items-center justify-center py-1 text-zinc-500 transition-all hover:text-amber-300 active:scale-95"
        >
          <div className="relative">
            <Sparkles size={20} className="text-amber-400" />
          </div>
          <span className="mt-1 text-[10px] font-medium tracking-tight text-zinc-400">
            AI Коуч
          </span>
        </button>
      </div>
    </nav>
  );
}
