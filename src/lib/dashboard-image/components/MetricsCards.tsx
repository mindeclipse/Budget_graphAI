import React from "react";
import { WeightedPacingResult } from "@/lib/weighted-pacing";

interface MetricsCardsProps {
  budget: WeightedPacingResult["budget"];
  paceInfo: WeightedPacingResult["pacing"];
  surplusProjection: WeightedPacingResult["surplusProjection"];
  actualDailyAvg: number;
  cushionCurrent: number;
  monthRoundup: number;
}

export const MetricsCards: React.FC<MetricsCardsProps> = ({
  budget,
  paceInfo,
  surplusProjection,
  actualDailyAvg,
  cushionCurrent,
  monthRoundup,
}) => {
  return (
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
              color: budget.discretionaryRemaining >= 0 ? "#10b981" : "#ef4444",
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
            базовий лінійний: ~{paceInfo.flatDailySpend.toLocaleString("uk-UA")}{" "}
            ₴/д
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
        {surplusProjection.projectedSurplusAmount > 0 ? (
          <span style={{ color: "#10b981", fontWeight: 600 }}>
            🎯 Очікуваний профіцит: +
            {surplusProjection.projectedSurplusAmount.toLocaleString("uk-UA")} ₴
            ({surplusProjection.savingsPotentialPercent}%)
          </span>
        ) : (surplusProjection.projectedDeficitAmount || 0) > 100 ? (
          <span style={{ color: "#f87171", fontWeight: 600 }}>
            ⚠️ Ризик дефіциту: -
            {(surplusProjection.projectedDeficitAmount || 0).toLocaleString(
              "uk-UA"
            )}{" "}
            ₴
          </span>
        ) : (
          <span style={{ color: "#60a5fa", fontWeight: 600 }}>
            🎯 Прогноз: У межах бюджету
          </span>
        )}
      </div>
    </div>
  );
};
