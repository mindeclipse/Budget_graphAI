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
  id: number;
  amount: number;
  created_at: string;
  type?: string;
}

interface BurnRateChartProps {
  transactions: Transaction[];
  budgetLimit: number;
  selectedMonthKey: string; // Формат "YYYY-MM"
}

export function BurnRateChart({
  transactions,
  budgetLimit,
  selectedMonthKey,
}: BurnRateChartProps) {
  const chartData = useMemo(() => {
    const [yearStr, monthStr] = selectedMonthKey.split("-");
    const year = parseInt(yearStr, 10);
    const monthIndex = parseInt(monthStr, 10) - 1;

    const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
    const now = new Date();
    const isCurrentMonth =
      now.getFullYear() === year && now.getMonth() === monthIndex;
    const currentDay = isCurrentMonth ? now.getDate() : daysInMonth;

    // Агрегація витрат за днями
    const dailyExpenses: Record<number, number> = {};
    for (let d = 1; d <= daysInMonth; d++) {
      dailyExpenses[d] = 0;
    }

    transactions.forEach((tx) => {
      if (tx.type && tx.type !== "expense") return;
      const txDate = new Date(tx.created_at);
      const day = txDate.getDate();
      dailyExpenses[day] = (dailyExpenses[day] || 0) + Number(tx.amount);
    });

    // Побудова накопичувального масиву
    let runningTotal = 0;
    const data = [];

    for (let d = 1; d <= daysInMonth; d++) {
      const ideal = Math.round((budgetLimit / daysInMonth) * d);

      if (d <= currentDay) {
        runningTotal += dailyExpenses[d] || 0;
        data.push({
          day: d,
          ideal,
          actual: runningTotal,
        });
      } else {
        data.push({
          day: d,
          ideal,
          actual: null,
        });
      }
    }

    return { data, currentDay, daysInMonth, runningTotal };
  }, [transactions, budgetLimit, selectedMonthKey]);

  const { data, currentDay, daysInMonth, runningTotal } = chartData;

  const idealToday = Math.round((budgetLimit / daysInMonth) * currentDay);
  const diffFromTarget = runningTotal - idealToday;
  const isOverPace = diffFromTarget > 0;
  const projectedMonthEnd =
    currentDay > 0 ? Math.round((runningTotal / currentDay) * daysInMonth) : 0;

  return (
    <div className="rounded-2xl border border-zinc-900 bg-zinc-950 p-5 shadow-sm">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-xs font-semibold tracking-wider text-zinc-400 uppercase">
            <TrendingUp size={14} className="text-zinc-500" />
            Динаміка спалювання бюджету (Burn Rate)
          </h2>
          <p className="mt-0.5 text-[11px] text-zinc-500">
            Порівняння факту з плановою прямою ліміту (
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
                ((value: any, name?: any) => {
                  const label =
                    name === "actual" ? "Фактично витрачено" : "Плановий ліміт";
                  return [
                    `${Number(value || 0).toLocaleString("uk-UA")} ₴`,
                    label,
                  ];
                }) as any
              }
            />
            <ReferenceLine
              y={budgetLimit}
              stroke="#ef4444"
              strokeDasharray="4 4"
              opacity={0.4}
            />

            {/* Лінія планового спалювання */}
            <Line
              type="monotone"
              dataKey="ideal"
              stroke="#52525b"
              strokeWidth={1.5}
              strokeDasharray="4 4"
              dot={false}
              name="ideal"
            />

            {/* Крива фактичних витрат */}
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
            Норма на сьогодні
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
