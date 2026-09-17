"use client";

import { useState, useMemo } from "react";
import { CalendarClock, Radio, Plus, Layers } from "lucide-react";
import { DetectedSubscription } from "@/lib/subscription-radar";
import {
  SubscriptionRadarProps,
  RadarTabType,
  filterDismissedDetected,
  sortUpcomingObligations,
  RadarCalendarTab,
  RadarDetectedTab,
  RadarAllTemplatesTab,
  RadarSummaryFooter,
} from "./subscription-radar";

export type { SubscriptionRadarProps } from "./subscription-radar";

export function SubscriptionRadar({
  recurring,
  radarData,
  isLoading: _isLoading,
  onAddRecurring,
  onEditRecurring,
  onExecuteRecurring,
  onAddDetected,
  onDismissDetected,
}: SubscriptionRadarProps) {
  const [activeTab, setActiveTab] = useState<RadarTabType>("calendar");
  const [dismissedSignatures, setDismissedSignatures] = useState<string[]>(
    () => {
      if (typeof window !== "undefined") {
        try {
          const stored = localStorage.getItem("budget_dismissed_radar_subs");
          return stored ? JSON.parse(stored) : [];
        } catch {
          return [];
        }
      }
      return [];
    }
  );

  const detected = useMemo(() => {
    return filterDismissedDetected(
      radarData?.detected || [],
      dismissedSignatures
    );
  }, [radarData?.detected, dismissedSignatures]);

  const sortedUpcoming = useMemo(() => {
    return sortUpcomingObligations(radarData?.upcoming || []);
  }, [radarData?.upcoming]);

  const metrics = radarData?.metrics;

  const totalMonthly =
    metrics?.monthly_total ||
    recurring.reduce((sum, r) => sum + Number(r.amount), 0);
  const totalAnnual = metrics?.annual_total || totalMonthly * 12;
  const remainingThisMonth = metrics?.remaining_this_month ?? 0;
  const paidThisMonth = metrics?.paid_this_month ?? 0;

  const paidCount = sortedUpcoming.filter((u) => u.status === "paid").length;
  const totalCount = sortedUpcoming.length;
  const progressPercent =
    totalCount > 0 ? Math.round((paidCount / totalCount) * 100) : 0;

  const handleDismissDetected = (sub: DetectedSubscription) => {
    const subId = sub.id;
    const cleanId = sub.id.replace(/-[0-9]+-[a-z]+$/, "");
    const cleanMerchant = cleanId.replace(/^radar-/, "");
    const title = sub.title;

    setDismissedSignatures((prev) => [
      ...prev,
      subId,
      cleanId,
      cleanMerchant,
      title,
    ]);
    onDismissDetected(sub.id, sub.title);
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-zinc-900 bg-zinc-950 p-5 shadow-sm">
      {/* Верхній заголовок та перемикач вкладок */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-zinc-900 pb-4">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg border border-violet-500/20 bg-violet-500/10 text-violet-400">
            <Radio size={15} />
          </div>
          <div>
            <h2 className="text-xs font-semibold tracking-wider text-zinc-300 uppercase">
              Радар підписок & Регулярні витрати
            </h2>
            <p className="text-[11px] text-zinc-500">
              Графік списань та автодетекція сервісів
            </p>
          </div>
        </div>

        <button
          onClick={onAddRecurring}
          className="flex items-center gap-1 rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 py-1 text-xs font-medium text-zinc-300 transition-all hover:border-zinc-700 hover:bg-zinc-800 hover:text-white"
        >
          <Plus size={13} /> Додати
        </button>
      </div>

      {/* Перемикач режимів перегляду */}
      <div className="mb-4 flex items-center gap-1.5 rounded-xl border border-zinc-900 bg-zinc-900/50 p-1">
        <button
          onClick={() => setActiveTab("calendar")}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-medium transition-all ${
            activeTab === "calendar"
              ? "bg-zinc-800 text-white shadow-sm"
              : "text-zinc-500 hover:text-zinc-300"
          }`}
        >
          <CalendarClock size={13} />
          <span>Календар ({sortedUpcoming.length})</span>
        </button>

        <button
          onClick={() => setActiveTab("radar")}
          className={`relative flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-medium transition-all ${
            activeTab === "radar"
              ? "bg-zinc-800 text-white shadow-sm"
              : "text-zinc-500 hover:text-zinc-300"
          }`}
        >
          <Radio size={13} />
          <span>Радар</span>
          {detected.length > 0 && (
            <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-violet-500 px-1 text-[10px] font-bold text-white">
              {detected.length}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab("all")}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-medium transition-all ${
            activeTab === "all"
              ? "bg-zinc-800 text-white shadow-sm"
              : "text-zinc-500 hover:text-zinc-300"
          }`}
        >
          <Layers size={13} />
          <span>Всі ({recurring.length})</span>
        </button>
      </div>

      {/* Вкладка 1: Календар списань поточного місяця */}
      {activeTab === "calendar" && (
        <RadarCalendarTab
          sortedUpcoming={sortedUpcoming}
          recurring={recurring}
          paidThisMonth={paidThisMonth}
          paidCount={paidCount}
          totalCount={totalCount}
          progressPercent={progressPercent}
          onEditRecurring={onEditRecurring}
          onExecuteRecurring={onExecuteRecurring}
        />
      )}

      {/* Вкладка 2: Автоматичний радар виявлених підписок */}
      {activeTab === "radar" && (
        <RadarDetectedTab
          detected={detected}
          onAddDetected={onAddDetected}
          onDismissDetected={handleDismissDetected}
        />
      )}

      {/* Вкладка 3: Всі наявні шаблони підписок */}
      {activeTab === "all" && (
        <RadarAllTemplatesTab
          recurring={recurring}
          onEditRecurring={onEditRecurring}
          onExecuteRecurring={onExecuteRecurring}
        />
      )}

      {/* Нижня панель: Фінансове річне навантаження */}
      <RadarSummaryFooter
        totalMonthly={totalMonthly}
        totalAnnual={totalAnnual}
        remainingThisMonth={remainingThisMonth}
      />
    </div>
  );
}
