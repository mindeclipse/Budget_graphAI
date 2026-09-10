"use client";

import { useMemo } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
} from "recharts";
import { TrendingUp, AlertTriangle, CheckCircle } from "lucide-react";

interface Transaction {
  id?: number | string;
  amount: number | string;
  created_at: string;
  type?: string;
  exclude_from_budget?: boolean;
}

import { BudgetCycle } from "@/types/finance";

export interface RecurringItem {
  id?: number | string;
  title?: string;
  amount: number | string;
  day_of_month: number;
  currency?: string;
  is_active?: boolean;
}

export type { BudgetCycle };

export interface BurnRatePoint {
  day: number;
  dateLabel: string;
  ideal: number;
  actual: number | null;
  dropToday: number;
}

export interface CalculateBurnRateParams {
  transactions: Transaction[];
  budgetLimit: number;
  recurringTotal?: number;
  selectedMonthKey: string;
  recurring?: RecurringItem[];
  usdRate?: number;
  activeCycle?: BudgetCycle | null;
  currentDate?: Date;
}

export interface BurnRateResult {
  data: BurnRatePoint[];
  currentDay: number;
  totalDays: number;
  isCurrentMonth: boolean;
  isFutureMonth: boolean;
  isCycleMode: boolean;
  runningTotal: number;
  projectedMonthEnd: number;
}

export function calculateBurnRateData({
  transactions,
  budgetLimit,
  recurringTotal = 0,
  selectedMonthKey,
  recurring = [],
  usdRate = 41.5,
  activeCycle = null,
  currentDate,
}: CalculateBurnRateParams): BurnRateResult {
  const variableBudget = Math.max(0, budgetLimit - recurringTotal);
  const now = currentDate || new Date();

  const [yearStr, monthStr] = (selectedMonthKey || "").split("-");
  const year = parseInt(yearStr, 10) || now.getFullYear();
  const monthIndex = (parseInt(monthStr, 10) || 1) - 1;

  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const isCurrentMonth =
    now.getFullYear() === year && now.getMonth() === monthIndex;
  const isFutureMonth = new Date(year, monthIndex, 1) > now;

  const isCycleMode = Boolean(
    activeCycle && isCurrentMonth && activeCycle.start_date
  );

  if (isCycleMode && activeCycle) {
    const startRaw = new Date(activeCycle.start_date);
    const cycleStart = new Date(
      startRaw.getFullYear(),
      startRaw.getMonth(),
      startRaw.getDate()
    );

    let cycleEnd: Date;
    if (activeCycle.end_date) {
      const endRaw = new Date(activeCycle.end_date);
      cycleEnd = new Date(
        endRaw.getFullYear(),
        endRaw.getMonth(),
        endRaw.getDate()
      );
    } else {
      cycleEnd = new Date(
        cycleStart.getFullYear(),
        cycleStart.getMonth(),
        cycleStart.getDate() + 30
      );
    }

    const totalDays = Math.max(
      1,
      Math.round((cycleEnd.getTime() - cycleStart.getTime()) / 86400000)
    );

    const todayStart = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate()
    );
    let currentDay = 0;
    if (todayStart < cycleStart) {
      currentDay = 0;
    } else {
      const diffDays =
        Math.round((todayStart.getTime() - cycleStart.getTime()) / 86400000) +
        1;
      currentDay = Math.min(totalDays, Math.max(1, diffDays));
    }

    const dailyVariableAllowance = variableBudget / totalDays;

    const dailyExpenses: Record<number, number> = {};
    for (let d = 1; d <= totalDays; d++) {
      dailyExpenses[d] = 0;
    }

    transactions.forEach((tx) => {
      if (tx.exclude_from_budget) return;
      if (tx.type && tx.type !== "expense") return;
      const tDate = new Date(tx.created_at);
      const tDayStart = new Date(
        tDate.getFullYear(),
        tDate.getMonth(),
        tDate.getDate()
      );
      const dayIndex =
        Math.round((tDayStart.getTime() - cycleStart.getTime()) / 86400000) + 1;
      if (dayIndex >= 1 && dayIndex <= totalDays) {
        dailyExpenses[dayIndex] =
          (dailyExpenses[dayIndex] || 0) + Number(tx.amount || 0);
      }
    });

    const recurringByDay: Record<number, number> = {};
    let totalRecurringParsed = 0;

    const normalizedRecurring = recurring
      .filter((item) => item.is_active !== false)
      .map((item) => {
        const amount =
          item.currency === "USD"
            ? Number(item.amount) * usdRate
            : Number(item.amount);
        return {
          day_of_month: item.day_of_month,
          amount,
        };
      });

    normalizedRecurring.forEach((item) => {
      totalRecurringParsed += item.amount;
    });

    for (let d = 1; d <= totalDays; d++) {
      const dateForDay = new Date(
        cycleStart.getFullYear(),
        cycleStart.getMonth(),
        cycleStart.getDate() + (d - 1)
      );
      const calDay = dateForDay.getDate();
      const daysInThisMonth = new Date(
        dateForDay.getFullYear(),
        dateForDay.getMonth() + 1,
        0
      ).getDate();

      normalizedRecurring.forEach((item) => {
        const targetDom = Math.min(
          Math.max(1, item.day_of_month),
          daysInThisMonth
        );
        if (calDay === targetDom) {
          recurringByDay[d] = (recurringByDay[d] || 0) + item.amount;
        }
      });
    }

    let runningTotal = 0;
    let runningRecurringPlan = 0;
    const data: BurnRatePoint[] = [];

    for (let d = 1; d <= totalDays; d++) {
      const dateForDay = new Date(
        cycleStart.getFullYear(),
        cycleStart.getMonth(),
        cycleStart.getDate() + (d - 1)
      );
      const dateLabel = `${dateForDay.getDate()}.${String(
        dateForDay.getMonth() + 1
      ).padStart(2, "0")}`;

      if (recurringByDay[d]) {
        runningRecurringPlan += recurringByDay[d];
      }

      const scheduledSoFar =
        normalizedRecurring.length > 0
          ? runningRecurringPlan
          : (recurringTotal / totalDays) * d;

      const ideal = Math.round(d * dailyVariableAllowance + scheduledSoFar);

      if (d <= currentDay && !isFutureMonth) {
        runningTotal += dailyExpenses[d] || 0;
        data.push({
          day: d,
          dateLabel,
          ideal,
          actual: Math.round(runningTotal),
          dropToday: recurringByDay[d] || 0,
        });
      } else {
        data.push({
          day: d,
          dateLabel,
          ideal,
          actual: null,
          dropToday: recurringByDay[d] || 0,
        });
      }
    }

    const activeRecurringTotal =
      normalizedRecurring.length > 0 ? totalRecurringParsed : recurringTotal;
    const variableSpentSoFar = Math.max(0, runningTotal - runningRecurringPlan);
    const projectedVariable =
      currentDay > 0 ? (variableSpentSoFar / currentDay) * totalDays : 0;
    const projectedMonthEnd = Math.round(
      projectedVariable + activeRecurringTotal
    );

    return {
      data,
      currentDay,
      totalDays,
      isCurrentMonth,
      isFutureMonth,
      isCycleMode: true,
      runningTotal: Math.round(runningTotal),
      projectedMonthEnd,
    };
  }

  // --- Calendar fallback mode (archive months or no active cycle) ---
  const currentDay = isCurrentMonth
    ? now.getDate()
    : isFutureMonth
      ? 0
      : daysInMonth;

  const dailyVariableAllowance = variableBudget / daysInMonth;

  const dailyExpenses: Record<number, number> = {};
  for (let d = 1; d <= daysInMonth; d++) {
    dailyExpenses[d] = 0;
  }

  transactions.forEach((tx) => {
    if (tx.exclude_from_budget) return;
    if (tx.type && tx.type !== "expense") return;
    const txDate = new Date(tx.created_at);
    const day = txDate.getDate();
    if (day >= 1 && day <= daysInMonth) {
      dailyExpenses[day] = (dailyExpenses[day] || 0) + Number(tx.amount || 0);
    }
  });

  const recurringByDay: Record<number, number> = {};
  let totalRecurringParsed = 0;

  recurring.forEach((item) => {
    const day = Math.min(Math.max(1, item.day_of_month), daysInMonth);
    const amount =
      item.currency === "USD"
        ? Number(item.amount) * usdRate
        : Number(item.amount);
    recurringByDay[day] = (recurringByDay[day] || 0) + amount;
    totalRecurringParsed += amount;
  });

  let runningTotal = 0;
  let runningRecurringPlan = 0;
  const data: BurnRatePoint[] = [];

  for (let d = 1; d <= daysInMonth; d++) {
    const dateLabel = `${d}.${String(monthIndex + 1).padStart(2, "0")}`;

    if (recurringByDay[d]) {
      runningRecurringPlan += recurringByDay[d];
    }

    const scheduledSoFar =
      recurring.length > 0
        ? runningRecurringPlan
        : (recurringTotal / daysInMonth) * d;

    const ideal = Math.round(d * dailyVariableAllowance + scheduledSoFar);

    if (d <= currentDay && !isFutureMonth) {
      runningTotal += dailyExpenses[d] || 0;
      data.push({
        day: d,
        dateLabel,
        ideal,
        actual: Math.round(runningTotal),
        dropToday: recurringByDay[d] || 0,
      });
    } else {
      data.push({
        day: d,
        dateLabel,
        ideal,
        actual: null,
        dropToday: recurringByDay[d] || 0,
      });
    }
  }

  const activeRecurringTotal =
    recurring.length > 0 ? totalRecurringParsed : recurringTotal;
  const variableSpentSoFar = Math.max(0, runningTotal - runningRecurringPlan);
  const projectedVariable =
    currentDay > 0 ? (variableSpentSoFar / currentDay) * daysInMonth : 0;
  const projectedMonthEnd = Math.round(
    projectedVariable + activeRecurringTotal
  );

  return {
    data,
    currentDay,
    totalDays: daysInMonth,
    isCurrentMonth,
    isFutureMonth,
    isCycleMode: false,
    runningTotal: Math.round(runningTotal),
    projectedMonthEnd,
  };
}

interface BurnRateChartProps {
  transactions: Transaction[];
  budgetLimit: number;
  recurringTotal?: number;
  selectedMonthKey: string;
  recurring?: RecurringItem[];
  usdRate?: number;
  activeCycle?: BudgetCycle | null;
}

export function BurnRateChart({
  transactions,
  budgetLimit,
  recurringTotal = 0,
  selectedMonthKey,
  recurring = [],
  usdRate = 41.5,
  activeCycle = null,
}: BurnRateChartProps) {
  const chartData = useMemo(() => {
    return calculateBurnRateData({
      transactions,
      budgetLimit,
      recurringTotal,
      selectedMonthKey,
      recurring,
      usdRate,
      activeCycle,
    });
  }, [
    transactions,
    budgetLimit,
    recurringTotal,
    selectedMonthKey,
    recurring,
    usdRate,
    activeCycle,
  ]);

  const {
    data,
    currentDay,
    isCurrentMonth,
    isFutureMonth,
    isCycleMode,
    runningTotal,
    projectedMonthEnd,
  } = chartData;

  const targetIndex = currentDay > 0 ? currentDay - 1 : 0;
  const idealToday = data[targetIndex] ? data[targetIndex].ideal : 0;
  const diffFromTarget = runningTotal - idealToday;
  const isOverPace = diffFromTarget > 0;

  return (
    <div className="rounded-2xl border border-zinc-800/80 bg-zinc-950 p-5 shadow-sm">
      {/* Шапка графіка */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2.5">
        <div>
          <h2 className="flex items-center gap-2 text-xs font-semibold tracking-wider text-zinc-400 uppercase">
            <TrendingUp size={14} className="text-zinc-500" />
            Динаміка спалювання бюджету (Burn Rate)
          </h2>
          <p className="mt-0.5 text-[11px] text-zinc-500">
            {isCycleMode && activeCycle?.name ? (
              <>
                Зарплатний цикл «{activeCycle.name}» (ліміт{" "}
                <span className="font-mono text-zinc-300">
                  {budgetLimit.toLocaleString("uk-UA")} ₴
                </span>
                )
              </>
            ) : (
              <>
                Ступінчастий план з урахуванням підписок (ліміт{" "}
                <span className="font-mono text-zinc-300">
                  {budgetLimit.toLocaleString("uk-UA")} ₴
                </span>
                )
              </>
            )}
          </p>
        </div>

        {!isFutureMonth && (
          <div className="flex items-center gap-2">
            {isOverPace ? (
              <span className="flex items-center gap-1.5 rounded-full border border-rose-500/30 bg-rose-500/10 px-2.5 py-1 font-mono text-[11px] font-medium text-rose-400 tabular-nums">
                <AlertTriangle size={12} className="shrink-0" />
                Випередження на{" "}
                {Math.abs(diffFromTarget).toLocaleString("uk-UA")} ₴
              </span>
            ) : (
              <span className="flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 font-mono text-[11px] font-medium text-emerald-400 tabular-nums">
                <CheckCircle size={12} className="shrink-0" />
                Запас {Math.abs(diffFromTarget).toLocaleString("uk-UA")} ₴
              </span>
            )}
          </div>
        )}
      </div>

      {/* Контейнер графіка */}
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={data}
            margin={{ top: 12, right: 10, left: -22, bottom: 0 }}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="#27272a"
              vertical={false}
              opacity={0.6}
            />
            <XAxis
              dataKey="day"
              stroke="#71717a"
              fontSize={10}
              tickLine={false}
              axisLine={{ stroke: "#27272a" }}
              minTickGap={18}
              tickFormatter={(v) => `${v}`}
            />
            <YAxis
              stroke="#71717a"
              fontSize={10}
              tickLine={false}
              axisLine={{ stroke: "#27272a" }}
              tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
            />

            <Tooltip
              isAnimationActive={false}
              cursor={{
                stroke: "#3f3f46",
                strokeWidth: 1,
                strokeDasharray: "4 4",
              }}
              content={({ active, payload, label }) => {
                if (!active || !payload || !payload.length) return null;

                const actualPoint = payload.find((p) => p.dataKey === "actual");
                const idealPoint = payload.find((p) => p.dataKey === "ideal");
                const drop = idealPoint?.payload?.dropToday || 0;
                const dateLabel =
                  actualPoint?.payload?.dateLabel ||
                  idealPoint?.payload?.dateLabel;

                return (
                  <div className="rounded-xl border border-zinc-800 bg-zinc-950/95 p-2.5 shadow-2xl backdrop-blur-md">
                    <p className="mb-1.5 border-b border-zinc-800 pb-1 text-[10px] font-semibold tracking-wider text-zinc-400 uppercase">
                      {label}-й день {dateLabel ? `(${dateLabel})` : "періоду"}
                    </p>
                    <div className="space-y-1 font-mono text-xs tabular-nums">
                      {actualPoint && actualPoint.value !== null && (
                        <div className="flex items-center justify-between gap-4">
                          <span className="flex items-center gap-1.5 font-sans text-[11px] text-zinc-400">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                            Факт:
                          </span>
                          <span className="font-semibold text-white">
                            {Number(actualPoint.value).toLocaleString("uk-UA")}{" "}
                            ₴
                          </span>
                        </div>
                      )}
                      {idealPoint && (
                        <div className="flex items-center justify-between gap-4">
                          <span className="flex items-center gap-1.5 font-sans text-[11px] text-zinc-400">
                            <span className="h-1.5 w-1.5 rounded-full bg-zinc-500" />
                            План:
                          </span>
                          <span className="font-semibold text-zinc-300">
                            {Number(idealPoint.value).toLocaleString("uk-UA")} ₴
                          </span>
                        </div>
                      )}
                      {drop > 0 && (
                        <p className="mt-1 border-t border-zinc-800 pt-1 font-sans text-[10px] text-sky-400">
                          ⚡ Фіксоване списання: +{drop.toLocaleString("uk-UA")}{" "}
                          ₴
                        </p>
                      )}
                    </div>
                  </div>
                );
              }}
            />

            <ReferenceLine
              y={budgetLimit}
              stroke="#f43f5e"
              strokeDasharray="4 4"
              strokeOpacity={0.4}
              label={{
                value: `Ліміт ${(budgetLimit / 1000).toFixed(0)}k`,
                fill: "#f43f5e",
                fontSize: 10,
                position: "insideTopRight",
                opacity: 0.7,
              }}
            />

            <Line
              type="linear"
              dataKey="ideal"
              stroke="#52525b"
              strokeWidth={1.5}
              strokeDasharray="4 4"
              dot={false}
              name="ideal"
            />

            <Line
              type="monotone"
              dataKey="actual"
              stroke={isOverPace ? "#f43f5e" : "#10b981"}
              strokeWidth={2.5}
              dot={false}
              activeDot={{
                r: 4.5,
                stroke: "#09090b",
                strokeWidth: 2,
                fill: isOverPace ? "#f43f5e" : "#10b981",
              }}
              name="actual"
              connectNulls={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Нижня зведена панель */}
      <div className="mt-4 grid grid-cols-3 gap-2 border-t border-zinc-800/80 pt-3 text-center">
        <div>
          <span className="block text-[10px] font-medium tracking-wider text-zinc-500 uppercase">
            Витрачено
          </span>
          <span className="font-mono text-xs font-semibold text-zinc-200 tabular-nums">
            {runningTotal.toLocaleString("uk-UA")} ₴
          </span>
        </div>
        <div>
          <span className="block text-[10px] font-medium tracking-wider text-zinc-500 uppercase">
            {isCurrentMonth ? "План на сьогодні" : "План періоду"}
          </span>
          <span className="font-mono text-xs font-semibold text-zinc-200 tabular-nums">
            {idealToday.toLocaleString("uk-UA")} ₴
          </span>
        </div>
        <div>
          <span className="block text-[10px] font-medium tracking-wider text-zinc-500 uppercase">
            {isCurrentMonth ? "Очікуваний фініш" : "Підсумок"}
          </span>
          <span
            className={`font-mono text-xs font-semibold tabular-nums ${
              projectedMonthEnd > budgetLimit
                ? "text-rose-400"
                : "text-emerald-400"
            }`}
          >
            {projectedMonthEnd.toLocaleString("uk-UA")} ₴
          </span>
        </div>
      </div>
    </div>
  );
}
