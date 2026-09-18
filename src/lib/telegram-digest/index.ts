/**
 * Telegram Digest & Analytics Module
 * Модуль генерації щотижневих AI-дайджестів та підсумків зарплатних циклів для Telegram
 */

export {
  getKyivDateString,
  formatAmount,
  getKyivHour,
  getKyivDayOfWeek,
  calculateBehavioralMetrics,
} from "@/lib/behavioral-metrics";

export { generateWeeklyDigest } from "./weekly";
export { generateCycleSummary } from "./cycle";
export {
  calculateWeeklySpendingStats,
  fetchWeeklyWishlistStats,
} from "./weekly-stats";
export { fetchWeeklyCyclePacing } from "./weekly-cycle";
export {
  getAppUrl,
  getKyivWeekKey,
  formatWeeklyDigestHtml,
  formatCycleSummaryHtml,
} from "./formatters";
export {
  generateBehavioralCoachAdvice,
  generateCycleSummaryConclusion,
} from "./ai";

export * from "./types";
