"use client";

import React, { useMemo } from "react";
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
  id: number | string;
  amount: number | string;
  created_at: string;
  type?: string;
  exclude_from_budget?: boolean;
}

export interface RecurringItem {
  id: number | string;
  title?: string;
  amount: number | string;
  day_of_month: number;
  currency?: string;
}

interface BurnRateChartProps {
  transactions: Transaction[];
  budgetLimit: number;
  recurringTotal?: number; // Сума постійних витрат
  selectedMonthKey: string; // Формат "YYYY-MM"
  recurring?: RecurringItem[]; // 👈 Необов'язковий масив для сходинок (нічого не впаде, якщо не передати)
}

export function BurnRateChart({
  transactions,
  budgetLimit,
  recurringTotal = 0,
  selectedMonthKey,
  recurring = [],
}: BurnRateChartProps) {
  // Вільний бюджет на щоденні кишенькові витрати
  const variableBudget = Math.max(0, budgetLimit - recurringTotal);

  const chartData = useMemo(() => {
    const [yearStr, monthStr] = selectedMonthKey.split("-");
    const year = parseInt(yearStr, 10);
    const monthIndex = parseInt(monthStr, 10) - 1;

    const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
    const now = new Date();
    const isCurrentMonth =
      now.getFullYear() === year && now.getMonth() === monthIndex;
    const currentDay = isCurrentMonth ? now.getDate() : daysInMonth;

    // Щоденна норма вільного бюджету
    const dailyVariableAllowance = variableBudget / daysInMonth;

    // Агрегація фактичних витрат за днями
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

    // Агрегація запланованих підписок за днями місяця
    const recurringByDay: Record<number, number> = {};
    let totalRecurringParsed = 0;

    recurring.forEach((item) => {
      const day = Math.min(Math.max(1, item.day_of_month), daysInMonth);
      const amount =
        item.currency === "USD"
          ? Number(item.amount) * 44.5
          : Number(item.amount);
      recurringByDay[day] = (recurringByDay[day] || 0) + amount;
      totalRecurringParsed += amount;
    });

    // Побудова накопичувального ряду
    let runningTotal = 0;
    let runningRecurringPlan = 0;
    const data = [];

    for (let d = 1; d <= daysInMonth; d++) {
      if (recurringByDay[d]) {
        runningRecurringPlan += recurringByDay[d];
      }

      // Якщо передано масив recurring — будуємо сходинки в конкретні дні.
      // Якщо масив порожній — плавний фолбек без сходинок до budgetLimit.
      const scheduledSoFar =
        recurring.length > 0
          ? runningRecurringPlan
          : (recurringTotal / daysInMonth) * d;

      const ideal = Math.round(d * dailyVariableAllowance + scheduledSoFar);

      if (d <= currentDay) {
        runningTotal += dailyExpenses[d] || 0;
        data.push({
          day: d,
          ideal,
          actual: Math.round(runningTotal),
          dropToday: recurringByDay[d] || 0,
        });
      } else {
        data.push({
          day: d,
          ideal,
          actual: null,
          dropToday: recurringByDay[d] || 0,
        });
      }
    }

    // Розумний прогноз на кінець місяця:
    // Поточні змінні витрати екстраполюються на місяць + гарантована сума підписок
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
      daysInMonth,
      runningTotal: Math.round(runningTotal),
      projectedMonthEnd,
    };
  }, [transactions, budgetLimit, recurringTotal, selectedMonthKey, recurring]);

  const { data, currentDay, runningTotal, projectedMonthEnd } = chartData;

  // Поточний план на сьогодні
  const todayPoint = data[currentDay - 1];
  const idealToday = todayPoint ? todayPoint.ideal : 0;
  const diffFromTarget = runningTotal - idealToday;
  const isOverPace = diffFromTarget > 0;

  return (
    <div className="rounded-2xl border border-zinc-900 bg-zinc-950 p-5 shadow-sm">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-xs font-semibold tracking-wider text-zinc-400 uppercase">
            <TrendingUp size={14} className="text-zinc-500" />
            Динаміка спалювання бюджету (Burn Rate)
          </h2>
          <p className="mt-0.5 text-[11px] text-zinc-500">
            Ступінчастий план з урахуванням дат списань (ліміт{" "}
            {budgetLimit.toLocaleString("uk-UA")} ₴)
          </p>
        </div>

        <div className="flex items-center gap-2">
          {isOverPace ? (
            <span className="flex items-center gap-1 rounded-full border border-rose-800/40 bg-rose-950/40 px-2.5 py-1 text-[11px] font-medium text-rose-400">
              <AlertTriangle size={12} />
              Випередження на {Math.abs(diffFromTarget).toLocaleString(
                "uk-UA"
              )}{" "}
              ₴
            </span>
          ) : (
            <span className="flex items-center gap-1 rounded-full border border-emerald-800/40 bg-emerald-950/40 px-2.5 py-1 text-[11px] font-medium text-emerald-400">
              <CheckCircle size={12} />
              Запас {Math.abs(diffFromTarget).toLocaleString("uk-UA")} ₴
            </span>
          )}
        </div>
      </div>

      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={data}
            margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="#27272a"
              vertical={false}
            />
            <XAxis
              dataKey="day"
              stroke="#71717a"
              fontSize={11}
              tickLine={false}
              axisLine={{ stroke: "#27272a" }}
              tickFormatter={(v) => `${v}`}
            />
            <YAxis
              stroke="#71717a"
              fontSize={11}
              tickLine={false}
              axisLine={{ stroke: "#27272a" }}
              tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "#18181b",
                borderColor: "#27272a",
                borderRadius: "0.75rem",
                fontSize: "12px",
              }}
              labelFormatter={(label) => `${label}-й день місяця`}
              formatter={
                ((value: any, name?: any, item?: any) => {
                  const label =
                    name === "actual"
                      ? "Фактично витрачено"
                      : "Ступінчастий план";
                  const formatted = `${Number(value || 0).toLocaleString("uk-UA")} ₴`;
                  const drop = item?.payload?.dropToday;

                  if (name === "ideal" && drop > 0) {
                    return [
                      `${formatted} (⚡ списання +${drop.toLocaleString("uk-UA")} ₴)`,
                      label,
                    ];
                  }
                  return [formatted, label];
                }) as any
              }
            />
            {/* Червоний стельовий ліміт місяця */}
            <ReferenceLine
              y={budgetLimit}
              stroke="#ef4444"
              strokeDasharray="4 4"
              opacity={0.35}
            />

            {/* Ступінчаста планова ламана */}
            <Line
              type="linear"
              dataKey="ideal"
              stroke="#52525b"
              strokeWidth={1.5}
              strokeDasharray="4 4"
              dot={false}
              name="ideal"
            />

            {/* Фактичні витрати */}
            <Line
              type="monotone"
              dataKey="actual"
              stroke={isOverPace ? "#f43f5e" : "#10b981"}
              strokeWidth={2.5}
              dot={{ r: 2, fill: isOverPace ? "#f43f5e" : "#10b981" }}
              activeDot={{ r: 5 }}
              name="actual"
              connectNulls={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2 border-t border-zinc-900 pt-3 text-center">
        <div>
          <span className="block text-[10px] tracking-wider text-zinc-500 uppercase">
            Витрачено
          </span>
          <span className="text-xs font-semibold text-zinc-200">
            {runningTotal.toLocaleString("uk-UA")} ₴
          </span>
        </div>
        <div>
          <span className="block text-[10px] tracking-wider text-zinc-500 uppercase">
            План на сьогодні
          </span>
          <span className="text-xs font-semibold text-zinc-200">
            {idealToday.toLocaleString("uk-UA")} ₴
          </span>
        </div>
        <div>
          <span className="block text-[10px] tracking-wider text-zinc-500 uppercase">
            Очікуваний фініш
          </span>
          <span
            className={`text-xs font-semibold ${
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
