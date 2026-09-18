import React from "react";
import { WeightedPacingResult } from "@/lib/weighted-pacing";
import { formatKyivDateLabel } from "../constants";

interface HeaderProps {
  cycle: WeightedPacingResult["cycle"];
}

export const Header: React.FC<HeaderProps> = ({ cycle }) => {
  return (
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
  );
};
