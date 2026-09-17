"use client";

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
import { BurnRatePoint } from "./types";
import { BurnRateTooltip } from "./BurnRateTooltip";

interface BurnRateLineChartProps {
  data: BurnRatePoint[];
  budgetLimit: number;
  isOverPace: boolean;
}

export function BurnRateLineChart({
  data,
  budgetLimit,
  isOverPace,
}: BurnRateLineChartProps) {
  return (
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
            content={(props) => (
              <BurnRateTooltip
                active={props.active}
                payload={props.payload as any}
                label={props.label}
              />
            )}
          />

          <ReferenceLine
            y={budgetLimit}
            stroke="#f43f5e"
            strokeDasharray="4 4"
            strokeOpacity={0.4}
            label={{
              value: `Ліміт ${
                budgetLimit % 1000 === 0
                  ? budgetLimit / 1000
                  : Number((budgetLimit / 1000).toFixed(1))
              }k`,
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
  );
}
