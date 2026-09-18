import { StatusTheme } from "./types";

export function formatKyivDateLabel(dateStr: string): string {
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

export const STATUS_THEMES: Record<string, StatusTheme> = {
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
