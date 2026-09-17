import { escapeHtml } from "@/lib/telegram";
import { formatAmount, getKyivDateString } from "@/lib/behavioral-metrics";
import { BehavioralCoachAdvice } from "@/types/ai";
import { Transaction } from "@/types/finance";
import { WeeklyCategoryBreakdown, CycleTopCategory } from "./types";

export function getAppUrl(): string {
  return (
    process.env.APP_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "https://budget-pwa.vercel.app"
  );
}

export function getKyivWeekKey(d: Date = new Date()): string {
  const dateStr = getKyivDateString(d);
  const [year, month, day] = dateStr.split("-").map(Number);
  const curr = new Date(Date.UTC(year, month - 1, day));
  const dayNum = curr.getUTCDay() || 7;
  curr.setUTCDate(curr.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(curr.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(
    ((curr.getTime() - yearStart.getTime()) / 86400000 + 1) / 7
  );
  return `weekly_digest_${curr.getUTCFullYear()}_W${weekNo.toString().padStart(2, "0")}`;
}

export interface FormatWeeklyDigestParams {
  currentWeekStart: Date;
  now: Date;
  thisWeekSpent: number;
  wowText: string;
  sortedCategories: WeeklyCategoryBreakdown[];
  largestTx?: Transaction;
  totalInvestedThisWeek: number;
  totalSavedThisWeek: number;
  cycleInfo?: {
    remainingBudget: number;
    daysRemaining: number;
    safeWeekdaySpend: number;
    safeWeekendSpend: number;
  } | null;
  coachAdvice: BehavioralCoachAdvice | null;
}

export function formatWeeklyDigestHtml(
  params: FormatWeeklyDigestParams
): string {
  const dateFromStr = getKyivDateString(params.currentWeekStart)
    .slice(5)
    .replace("-", ".");
  const dateToStr = getKyivDateString(params.now).slice(5).replace("-", ".");

  const lines: string[] = [
    `📊 <b>Щотижневий AI-дайджест витрат</b>`,
    `🗓 <i>Період: ${dateFromStr} — ${dateToStr}</i>`,
    ``,
    `💸 <b>Споживчі витрати за 7 днів:</b> <b>${formatAmount(params.thisWeekSpent)} ₴</b>`,
    `📈 <b>Динаміка:</b> ${params.wowText}`,
    ``,
    `🏷 <b>Топ статті витрат:</b>`,
  ];

  if (params.sortedCategories.length > 0) {
    params.sortedCategories.forEach((cat) => {
      lines.push(
        `• ${escapeHtml(cat.name)}: <b>${formatAmount(cat.amount)} ₴</b> (${cat.percent}%)`
      );
    });
  } else {
    lines.push(`• Витрат не зафіксовано`);
  }

  if (params.largestTx && Number(params.largestTx.amount) > 0) {
    lines.push(``);
    lines.push(
      `⚡️ <b>Найбільша покупка:</b> ${escapeHtml(params.largestTx.merchant_raw)} (<b>${formatAmount(Number(params.largestTx.amount))} ₴</b>)`
    );
  }

  if (params.totalInvestedThisWeek > 0 || params.totalSavedThisWeek > 0) {
    lines.push(``);
    lines.push(`🏦 <b>Капітал та заощадження за 7 днів:</b>`);
    if (params.totalInvestedThisWeek > 0) {
      lines.push(
        `• Інвестовано в активи: <b>${formatAmount(params.totalInvestedThisWeek)} ₴</b>`
      );
    }
    if (params.totalSavedThisWeek > 0) {
      lines.push(
        `• Заощаджено у подушку: <b>+${formatAmount(params.totalSavedThisWeek)} ₴</b>`
      );
    }
  }

  if (params.cycleInfo) {
    lines.push(``);
    lines.push(`🎯 <b>Статус активного циклу:</b>`);
    lines.push(
      `• Залишилось: <b>${formatAmount(params.cycleInfo.remainingBudget)} ₴</b> (на ${params.cycleInfo.daysRemaining} дн.)`
    );
    lines.push(
      `• Безпечний темп: <b>${formatAmount(params.cycleInfo.safeWeekdaySpend)} ₴</b> (будні) · <b>${formatAmount(params.cycleInfo.safeWeekendSpend)} ₴</b> (вихідні)`
    );
  }

  if (params.coachAdvice) {
    lines.push(``);
    lines.push(`🧠 <b>Поведінковий аудит & Коучинг:</b>`);
    lines.push(
      `• 🔍 <b>Сліпа зона:</b> ${escapeHtml(params.coachAdvice.behavioralInsight)}`
    );
    lines.push(
      `• 🛡️ <b>Капітал & Сила волі:</b> ${escapeHtml(params.coachAdvice.capitalFeedback)}`
    );
    lines.push(
      `• 🎯 <b>Мікро-челендж (7 днів):</b> ${escapeHtml(params.coachAdvice.microChallenge)}`
    );
  }

  return lines.join("\n");
}

export interface FormatCycleSummaryParams {
  cycleName: string;
  cycleDurationDays: number;
  budgetLimit: number;
  totalSpent: number;
  isSaved: boolean;
  savedAmount: number;
  savedPercent: string;
  piggyBankAmount: number;
  topCategories: CycleTopCategory[];
  topPurchases: Transaction[];
  totalCycleInvested: number;
  totalCycleSaved: number;
  aiConclusion: string;
}

export function formatCycleSummaryHtml(
  params: FormatCycleSummaryParams
): string {
  const lines: string[] = [
    `🏁 <b>Підсумок зарплатного циклу</b>`,
    `📌 <i>«${escapeHtml(params.cycleName || "Поточний цикл")}» (${params.cycleDurationDays} дн.)</i>`,
    ``,
    `💰 <b>Плановий бюджет:</b> ${formatAmount(params.budgetLimit)} ₴`,
    `💸 <b>Фактично витрачено:</b> ${formatAmount(params.totalSpent)} ₴`,
  ];

  if (params.isSaved) {
    lines.push(
      `🎉 <b>Вдалося зберегти:</b> <b>+${formatAmount(params.savedAmount)} ₴</b> (${params.savedPercent}%) ✅`
    );
    if (params.piggyBankAmount > 0) {
      lines.push(
        `🐷 <b>Рекомендовано у Скарбничку:</b> <b>${formatAmount(params.piggyBankAmount)} ₴</b> (70% від залишку)`
      );
    }
  } else {
    lines.push(
      `⚠️ <b>Перевитрата:</b> <b>-${formatAmount(Math.abs(params.savedAmount))} ₴</b> (${params.savedPercent}%)`
    );
  }

  lines.push(``);
  lines.push(`🏷 <b>Головні статті витрат циклу:</b>`);
  params.topCategories.forEach((cat) => {
    lines.push(
      `${cat.rank}. ${escapeHtml(cat.name)}: <b>${formatAmount(cat.amount)} ₴</b> (${cat.percent}%)`
    );
  });

  if (params.topPurchases.length > 0) {
    lines.push(``);
    lines.push(`🔍 <b>Найбільші окремі покупки:</b>`);
    params.topPurchases.forEach((p) => {
      lines.push(
        `• ${escapeHtml(p.merchant_raw)}: <b>${formatAmount(Number(p.amount))} ₴</b>`
      );
    });
  }

  if (params.totalCycleInvested > 0 || params.totalCycleSaved > 0) {
    lines.push(``);
    lines.push(`🏦 <b>Капітал та заощадження за цикл:</b>`);
    if (params.totalCycleInvested > 0) {
      lines.push(
        `• Інвестовано в активи: <b>${formatAmount(params.totalCycleInvested)} ₴</b>`
      );
    }
    if (params.totalCycleSaved > 0) {
      lines.push(
        `• Заощаджено у подушку: <b>+${formatAmount(params.totalCycleSaved)} ₴</b>`
      );
    }
  }

  if (params.aiConclusion) {
    lines.push(``);
    lines.push(`🤖 <b>Аналітичний висновок Gemini:</b>`);
    lines.push(`<i>${escapeHtml(params.aiConclusion)}</i>`);
  }

  return lines.join("\n");
}
