import { ImageResponse } from "next/og";
import React from "react";
import { WeightedPacingResult } from "@/lib/weighted-pacing";

export interface BudgetDashboardImageOptions {
  cushionCurrent?: number;
  monthRoundupAmount?: number;
}

function formatKyivDateLabel(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    return new Intl.DateTimeFormat("uk-UA", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      timeZone: "Europe/Kyiv",
    }).format(d);
  } catch {
    return dateStr;
  }
}

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
  const spentPercent = Math.round(
    (budget.currentExpenseTotal / totalLimit) * 100
  );
  const clampedPercent = Math.min(100, Math.max(0, spentPercent));

  const radius = 75;
  const circumference = 2 * Math.PI * radius; // ~471.24
  const strokeDashoffset = Math.round(
    circumference * (1 - clampedPercent / 100)
  );

  const statusThemes: Record<
    string,
    { stroke: string; bg: string; border: string; text: string; emoji: string }
  > = {
    healthy: {
      stroke: "#10b981",
      bg: "#064e3b",
      border: "#059669",
      text: "#34d399",
      emoji: "🟢",
    },
    tight: {
      stroke: "#f59e0b",
      bg: "#451a03",
      border: "#d97706",
      text: "#fbbf24",
      emoji: "🟡",
    },
    critical: {
      stroke: "#f97316",
      bg: "#431407",
      border: "#ea580c",
      text: "#fb923c",
      emoji: "🟠",
    },
    depleted: {
      stroke: "#ef4444",
      bg: "#450a0a",
      border: "#dc2626",
      text: "#f87171",
      emoji: "🔴",
    },
  };

  const theme = statusThemes[paceInfo.status] || statusThemes.healthy;

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
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          borderBottom: "1px solid #1f2937",
          paddingBottom: 18,
          marginBottom: 20,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div
            style={{
              display: "flex",
              width: 42,
              height: 42,
              borderRadius: 12,
              backgroundColor: "#10b981",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 24,
              fontWeight: 800,
              color: "#0b0f19",
            }}
          >
            B
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ fontSize: 22, fontWeight: 700, color: "#ffffff" }}>
              BudgetGraph AI
            </span>
            <span style={{ fontSize: 13, color: "#9ca3af" }}>
              Дашборд бюджетного циклу
            </span>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 14, color: "#9ca3af" }}>
            {formatKyivDateLabel(cycle.startDate)} —{" "}
            {formatKyivDateLabel(cycle.endDate)}
          </span>
          <div
            style={{
              display: "flex",
              padding: "6px 14px",
              borderRadius: 20,
              backgroundColor: "#1f2937",
              border: "1px solid #374151",
              color: "#60a5fa",
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            Залишилось {cycle.daysRemaining} дн. (день {cycle.daysPassed}/
            {cycle.daysTotal})
          </div>
        </div>
      </div>

      {/* Main Content: 2 columns */}
      <div style={{ display: "flex", flex: 1, gap: 24 }}>
        {/* Left Column: Gauge Card */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            width: 360,
            backgroundColor: "#111827",
            borderRadius: 20,
            border: "1px solid #1f2937",
            padding: "24px 20px",
          }}
        >
          <div
            style={{
              position: "relative",
              display: "flex",
              width: 190,
              height: 190,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <svg
              width="190"
              height="190"
              viewBox="0 0 190 190"
              style={{ position: "absolute", top: 0, left: 0 }}
            >
              <circle
                cx={95}
                cy={95}
                r={radius}
                fill="none"
                stroke="#1f2937"
                strokeWidth={16}
              />
              <circle
                cx={95}
                cy={95}
                r={radius}
                fill="none"
                stroke={theme.stroke}
                strokeWidth={16}
                strokeDasharray={circumference.toString()}
                strokeDashoffset={strokeDashoffset.toString()}
                strokeLinecap="round"
                transform="rotate(-90 95 95)"
              />
            </svg>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <span style={{ fontSize: 44, fontWeight: 800, color: "#ffffff" }}>
                {spentPercent}%
              </span>
              <span style={{ fontSize: 13, color: "#9ca3af", marginTop: 2 }}>
                витрачено
              </span>
            </div>
          </div>

          <div
            style={{
              display: "flex",
              marginTop: 18,
              padding: "6px 16px",
              borderRadius: 16,
              backgroundColor: theme.bg,
              border: `1px solid ${theme.border}`,
              color: theme.text,
              fontSize: 14,
              fontWeight: 700,
            }}
          >
            {theme.emoji} {paceInfo.statusLabel}
          </div>

          <span
            style={{
              marginTop: 14,
              fontSize: 12,
              color: "#9ca3af",
              textAlign: "center",
              lineHeight: 1.4,
              maxWidth: 320,
            }}
          >
            {paceInfo.advice}
          </span>
        </div>

        {/* Right Column: 4 Metric Cards + Summary Bar */}
        <div
          style={{
            display: "flex",
            flex: 1,
            flexDirection: "column",
            gap: 16,
          }}
        >
          {/* Row 1 */}
          <div style={{ display: "flex", gap: 16, flex: 1 }}>
            {/* Card 1: Discretionary Remaining */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                flex: 1,
                backgroundColor: "#111827",
                borderRadius: 16,
                border: "1px solid #1f2937",
                padding: "16px 20px",
                justifyContent: "space-between",
              }}
            >
              <span style={{ fontSize: 13, color: "#9ca3af", fontWeight: 600 }}>
                💵 Вільний залишок
              </span>
              <span
                style={{
                  fontSize: 26,
                  fontWeight: 800,
                  color:
                    budget.discretionaryRemaining >= 0 ? "#10b981" : "#ef4444",
                }}
              >
                {budget.discretionaryRemaining >= 0 ? "+" : ""}
                {budget.discretionaryRemaining.toLocaleString("uk-UA")} ₴
              </span>
              <span style={{ fontSize: 12, color: "#6b7280" }}>
                із ліміту {budget.totalBudgetLimit.toLocaleString("uk-UA")} ₴
              </span>
            </div>

            {/* Card 2: Recommended Daily Spend */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                flex: 1,
                backgroundColor: "#111827",
                borderRadius: 16,
                border: "1px solid #1f2937",
                padding: "16px 20px",
                justifyContent: "space-between",
              }}
            >
              <span style={{ fontSize: 13, color: "#9ca3af", fontWeight: 600 }}>
                🎯 Рекомендований темп
              </span>
              <div
                style={{
                  display: "flex",
                  gap: 14,
                  alignItems: "baseline",
                }}
              >
                <div style={{ display: "flex", flexDirection: "column" }}>
                  <span
                    style={{
                      fontSize: 20,
                      fontWeight: 700,
                      color: "#ffffff",
                    }}
                  >
                    {paceInfo.safeWeekdaySpend.toLocaleString("uk-UA")} ₴
                  </span>
                  <span style={{ fontSize: 11, color: "#9ca3af" }}>
                    будні (Пн-Чт)
                  </span>
                </div>
                <div style={{ display: "flex", flexDirection: "column" }}>
                  <span
                    style={{
                      fontSize: 20,
                      fontWeight: 700,
                      color: "#60a5fa",
                    }}
                  >
                    {paceInfo.safeWeekendSpend.toLocaleString("uk-UA")} ₴
                  </span>
                  <span style={{ fontSize: 11, color: "#9ca3af" }}>
                    вихідні (Пт-Нд)
                  </span>
                </div>
              </div>
              <span style={{ fontSize: 12, color: "#6b7280" }}>
                базовий лінійний: ~
                {paceInfo.flatDailySpend.toLocaleString("uk-UA")} ₴/д
              </span>
            </div>
          </div>

          {/* Row 2 */}
          <div style={{ display: "flex", gap: 16, flex: 1 }}>
            {/* Card 3: Spent so far */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                flex: 1,
                backgroundColor: "#111827",
                borderRadius: 16,
                border: "1px solid #1f2937",
                padding: "16px 20px",
                justifyContent: "space-between",
              }}
            >
              <span style={{ fontSize: 13, color: "#9ca3af", fontWeight: 600 }}>
                💸 Витрачено циклу
              </span>
              <span style={{ fontSize: 24, fontWeight: 800, color: "#ffffff" }}>
                {budget.currentExpenseTotal.toLocaleString("uk-UA")} ₴
              </span>
              <span style={{ fontSize: 12, color: "#6b7280" }}>
                фактично ~{actualDailyAvg.toLocaleString("uk-UA")} ₴/день
              </span>
            </div>

            {/* Card 4: Cushion & Roundups */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                flex: 1,
                backgroundColor: "#111827",
                borderRadius: 16,
                border: "1px solid #1f2937",
                padding: "16px 20px",
                justifyContent: "space-between",
              }}
            >
              <span style={{ fontSize: 13, color: "#9ca3af", fontWeight: 600 }}>
                🛡️ Подушка безпеки
              </span>
              <span style={{ fontSize: 24, fontWeight: 800, color: "#34d399" }}>
                {cushionCurrent.toLocaleString("uk-UA")} ₴
              </span>
              <span style={{ fontSize: 12, color: "#6b7280" }}>
                +{monthRoundup.toLocaleString("uk-UA")} ₴ рештою за цей місяць
              </span>
            </div>
          </div>

          {/* Bottom Summary Bar */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              backgroundColor: "#111827",
              borderRadius: 12,
              border: "1px solid #1f2937",
              padding: "10px 18px",
              fontSize: 12,
              color: "#9ca3af",
            }}
          >
            <span>
              🔒 Зарезервовано під підписки:{" "}
              {budget.reservedObligationsTotal.toLocaleString("uk-UA")} ₴
            </span>
            <span style={{ color: "#10b981", fontWeight: 600 }}>
              🎯 Очікуваний профіцит: +
              {surplusProjection.projectedSurplusAmount.toLocaleString("uk-UA")}{" "}
              ₴ ({surplusProjection.savingsPotentialPercent}%)
            </span>
          </div>
        </div>
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
