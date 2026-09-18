import { ImageResponse } from "next/og";
import React from "react";
import { WeightedPacingResult } from "@/lib/weighted-pacing";
import { BudgetDashboardImageOptions } from "./types";
import { STATUS_THEMES } from "./constants";
import { Header } from "./components/Header";
import { GaugeCard } from "./components/GaugeCard";
import { MetricsCards } from "./components/MetricsCards";

/**
 * Генерує візуальну графічну картку дашборду бюджету (1000x560 px, PNG)
 * із круговим прогрес-баром (Circular Gauge) та ключовими метриками темпу.
 */
export async function generateBudgetDashboardImage(
  pacing: WeightedPacingResult,
  options?: BudgetDashboardImageOptions
): Promise<Buffer> {
  const { cycle, budget, pacing: paceInfo, surplusProjection } = pacing;

  const totalLimit = Math.max(1, budget.totalBudgetLimit);
  const variableBudget = Math.max(
    0,
    budget.totalBudgetLimit - budget.reservedObligationsTotal
  );
  // Відсоток використання операційного (вільного) бюджету — відповідає панелі трекера в PWA
  const variableSpentPercent =
    variableBudget > 0
      ? Math.round((budget.currentExpenseTotal / variableBudget) * 100)
      : 100;
  // Відсоток використання від загального ліміту циклу
  const totalSpentPercent = Math.round(
    (budget.currentExpenseTotal / totalLimit) * 100
  );
  const clampedPercent = Math.min(100, Math.max(0, variableSpentPercent));

  const radius = 75;
  const circumference = 2 * Math.PI * radius; // ~471.24
  const strokeDashoffset = Math.round(
    circumference * (1 - clampedPercent / 100)
  );

  const theme = STATUS_THEMES[paceInfo.status] || STATUS_THEMES.healthy;

  const actualDailyAvg =
    cycle.daysPassed > 0
      ? Math.round(budget.currentExpenseTotal / cycle.daysPassed)
      : 0;

  const cushionCurrent = options?.cushionCurrent || 0;
  const monthRoundup = options?.monthRoundupAmount || 0;

  const element = (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: 1000,
        height: 560,
        backgroundColor: "#0b0f19",
        color: "#f3f4f6",
        padding: "28px 36px",
        fontFamily: "sans-serif",
        boxSizing: "border-box",
      }}
    >
      <Header cycle={cycle} />

      {/* Main Content: 2 columns */}
      <div style={{ display: "flex", flex: 1, gap: 24 }}>
        <GaugeCard
          radius={radius}
          circumference={circumference}
          strokeDashoffset={strokeDashoffset}
          theme={theme}
          variableSpentPercent={variableSpentPercent}
          totalSpentPercent={totalSpentPercent}
          paceInfo={paceInfo}
        />

        <MetricsCards
          budget={budget}
          paceInfo={paceInfo}
          surplusProjection={surplusProjection}
          actualDailyAvg={actualDailyAvg}
          cushionCurrent={cushionCurrent}
          monthRoundup={monthRoundup}
        />
      </div>
    </div>
  );

  const response = new ImageResponse(element, {
    width: 1000,
    height: 560,
  });

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}
