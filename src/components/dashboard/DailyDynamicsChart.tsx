"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { DailyStatItem } from "@/hooks/useBudgetMetrics";

interface DailyDynamicsChartProps {
  dailyStats: DailyStatItem[];
}

export function DailyDynamicsChart({ dailyStats }: DailyDynamicsChartProps) {
  return (
    <div className="relative rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-5 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)]">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs font-semibold tracking-wider text-zinc-400 uppercase">
          Динаміка витрат за днями
        </p>
        <span className="font-mono text-xs text-zinc-500">UAH</span>
      </div>

      {dailyStats.length > 0 ? (
        <div className="h-44 w-full md:h-52">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={dailyStats}
              margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
            >
              <defs>
                <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#38BDF8" stopOpacity={0.9} />
                  <stop offset="100%" stopColor="#0284C7" stopOpacity={0.25} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="date"
                stroke="#71717a"
                fontSize={11}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                stroke="#71717a"
                fontSize={11}
                tickLine={false}
                axisLine={false}
                tickFormatter={(val) => `${val}₴`}
              />
              <Tooltip
                cursor={{ fill: "rgba(255, 255, 255, 0.04)" }}
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    return (
                      <div className="rounded-xl border border-zinc-700/80 bg-zinc-900/95 px-3 py-1.5 text-xs shadow-2xl backdrop-blur">
                        <p className="text-zinc-400">
                          {payload[0].payload.date}
                        </p>
                        <p className="font-mono font-bold text-white tabular-nums">
                          {Number(payload[0].value).toLocaleString("uk-UA")} ₴
                        </p>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Bar
                dataKey="amount"
                fill="url(#barGradient)"
                radius={[6, 6, 0, 0]}
                maxBarSize={28}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="flex h-40 items-center justify-center text-xs text-zinc-600">
          Немає даних за цей місяць
        </div>
      )}
    </div>
  );
}
