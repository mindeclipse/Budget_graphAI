import { ProactiveAlert, AIAnalysisResponse } from "@/types/ai";

export interface GenerateAlertsInput {
  budgetMetrics: {
    remaining: number;
    safeDailySpend: number;
    daysRemaining: number;
    exactPercent: number;
    barColor?: string;
    status?: "healthy" | "warning" | "danger";
  };
  categoryStats: Array<{
    name: string;
    amount: number;
    percentage: number;
  }>;
  categoryBudgets: Record<string, number>;
  radarUpcoming?: Array<{
    id: number;
    title: string;
    amount: number;
    days_remaining: number;
    status: string;
  }>;
  aiAnalysis?: AIAnalysisResponse | null;
}

export function generateProactiveAlerts(
  input: GenerateAlertsInput
): ProactiveAlert[] {
  const alerts: ProactiveAlert[] = [];
  const {
    budgetMetrics,
    categoryStats,
    categoryBudgets,
    radarUpcoming,
    aiAnalysis,
  } = input;

  const derivedStatus =
    budgetMetrics.status ||
    (budgetMetrics.remaining <= 0 || budgetMetrics.safeDailySpend < 150
      ? "danger"
      : budgetMetrics.exactPercent >= 80
        ? "warning"
        : "healthy");

  // 1. Алерти темпу спалювання бюджету (Pace)
  if (derivedStatus === "danger" || budgetMetrics.safeDailySpend < 150) {
    alerts.push({
      id: "pace-critical",
      type: "pace",
      severity: "critical",
      title: "Критичний темп витрат",
      description: `Безпечний залишок становить лише ${Math.round(budgetMetrics.safeDailySpend)} ₴/день. Ризик передчасного вичерпання бюджету.`,
      suggestedAction: "Зменшити денні витрати",
    });
  } else if (budgetMetrics.status === "warning") {
    alerts.push({
      id: "pace-warning",
      type: "pace",
      severity: "warning",
      title: "Підвищений темп витрат",
      description: `Витрачено вже ${Math.round(budgetMetrics.exactPercent)}% ліміту. Оптимальний залишок на день: ${Math.round(budgetMetrics.safeDailySpend)} ₴.`,
      suggestedAction: "Оптимізувати змінні витрати",
    });
  } else {
    alerts.push({
      id: "pace-healthy",
      type: "pace",
      severity: "success",
      title: "Темп витрат у нормі",
      description: `Бюджет виконується за планом. Ви можете безпечно витрачати до ${Math.round(budgetMetrics.safeDailySpend)} ₴ щодня.`,
      suggestedAction: "Тримати поточний ритм",
    });
  }

  // 2. Алерти лімітів категорій (Category Budgets)
  for (const cat of categoryStats) {
    const limit = categoryBudgets[cat.name];
    if (limit && limit > 0 && cat.amount > limit) {
      const overspend = Math.round(cat.amount - limit);
      alerts.push({
        id: `cat-overspend-${cat.name}`,
        type: "category",
        severity: "warning",
        title: `Перевищення: ${cat.name}`,
        description: `Витрачено ${Math.round(cat.amount)} ₴ при ліміті ${limit} ₴ (+${overspend} ₴).`,
        suggestedAction: `Скоригувати бюджет ${cat.name}`,
      });
      break; // беремо тільки топ-перевищення, щоб не захаращувати картку
    }
  }

  // 3. Алерти найближчих регулярних платежів (Subscription Due)
  if (radarUpcoming && radarUpcoming.length > 0) {
    const dueToday = radarUpcoming.find((r) => r.status === "due_today");
    if (dueToday) {
      alerts.push({
        id: `sub-due-${dueToday.id}`,
        type: "subscription",
        severity: "info",
        title: `Сьогодні списання: ${dueToday.title}`,
        description: `Заплановано списання ${dueToday.amount.toLocaleString("uk-UA")} ₴. Перевірте баланс картки.`,
      });
    } else {
      const soonDue = radarUpcoming.find(
        (r) => r.status === "upcoming" && r.days_remaining <= 3
      );
      if (soonDue) {
        alerts.push({
          id: `sub-soon-${soonDue.id}`,
          type: "subscription",
          severity: "info",
          title: `Списання через ${soonDue.days_remaining} дн.`,
          description: `${soonDue.title}: ${soonDue.amount.toLocaleString("uk-UA")} ₴.`,
        });
      }
    }
  }

  // 4. Спостереження з останнього AI-аналізу (якщо є)
  if (aiAnalysis && aiAnalysis.keyFindings.length > 0) {
    alerts.push({
      id: "ai-finding",
      type: "tip",
      severity:
        aiAnalysis.status === "critical"
          ? "critical"
          : aiAnalysis.status === "warning"
            ? "warning"
            : "info",
      title: "Інсайт аналітика",
      description: aiAnalysis.keyFindings[0],
    });
  }

  return alerts;
}
