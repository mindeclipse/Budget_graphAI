import React from "react";
import { WeightedPacingResult } from "@/lib/weighted-pacing";
import { StatusTheme } from "../types";

interface GaugeCardProps {
  radius: number;
  circumference: number;
  strokeDashoffset: number;
  theme: StatusTheme;
  variableSpentPercent: number;
  totalSpentPercent: number;
  paceInfo: WeightedPacingResult["pacing"];
}

export const GaugeCard: React.FC<GaugeCardProps> = ({
  radius,
  circumference,
  strokeDashoffset,
  theme,
  variableSpentPercent,
  totalSpentPercent,
  paceInfo,
}) => {
  return (
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
          <span style={{ fontSize: 40, fontWeight: 800, color: "#ffffff" }}>
            {variableSpentPercent}%
          </span>
          <span style={{ fontSize: 12, color: "#9ca3af", marginTop: 2 }}>
            вільного ліміту
          </span>
          <span style={{ fontSize: 10, color: "#6b7280", marginTop: 1 }}>
            ({totalSpentPercent}% від заг.)
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
  );
};
