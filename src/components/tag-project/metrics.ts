import { Transaction } from "@/types/finance";
import {
  ProjectCategoryStat,
  ProjectMonthStat,
  ProjectMetricsResult,
} from "./types";

export function calculateProjectMetrics(
  tag: string | null,
  transactions: Transaction[]
): ProjectMetricsResult {
  if (!tag) {
    return {
      projectTxs: [],
      expenseTxs: [],
      incomeTxs: [],
      totalSpent: 0,
      totalIncome: 0,
      netBalance: 0,
      txCount: 0,
      firstDate: null,
      lastDate: null,
      categories: [],
      monthlyDistribution: [],
      avgCheck: 0,
    };
  }

  const normalizedTag = tag.toLowerCase().replace(/^#/, "").trim();

  const projectTxs = transactions
    .filter((t) => {
      if (!t.tags || !Array.isArray(t.tags)) return false;
      return t.tags.some(
        (txTag) =>
          typeof txTag === "string" &&
          txTag.toLowerCase().replace(/^#/, "").trim() === normalizedTag
      );
    })
    .sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );

  const expenseTxs = projectTxs.filter(
    (t) => (t.type === "expense" || !t.type) && !t.exclude_from_budget
  );
  const incomeTxs = projectTxs.filter((t) => t.type === "income");

  const totalSpent = expenseTxs.reduce(
    (sum, t) => sum + Number(t.amount || 0),
    0
  );
  const totalIncome = incomeTxs.reduce(
    (sum, t) => sum + Number(t.amount || 0),
    0
  );
  const netBalance = totalIncome - totalSpent;

  let firstDate: Date | null = null;
  let lastDate: Date | null = null;
  if (projectTxs.length > 0) {
    const timestamps = projectTxs.map((t) => new Date(t.created_at).getTime());
    firstDate = new Date(Math.min(...timestamps));
    lastDate = new Date(Math.max(...timestamps));
  }

  const categoryMap: Record<string, number> = {};
  expenseTxs.forEach((t) => {
    const cat = t.category_name || "Інше";
    categoryMap[cat] = (categoryMap[cat] || 0) + Number(t.amount || 0);
  });

  const categories: ProjectCategoryStat[] = Object.entries(categoryMap)
    .map(([name, amount]) => ({
      name,
      amount,
      percentage: totalSpent > 0 ? (amount / totalSpent) * 100 : 0,
    }))
    .sort((a, b) => b.amount - a.amount);

  const monthMap: Record<
    string,
    { label: string; amount: number; count: number }
  > = {};
  expenseTxs.forEach((t) => {
    const d = new Date(t.created_at);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = d.toLocaleDateString("uk-UA", {
      month: "short",
      year: "numeric",
    });
    if (!monthMap[key]) {
      monthMap[key] = { label, amount: 0, count: 0 };
    }
    monthMap[key].amount += Number(t.amount || 0);
    monthMap[key].count += 1;
  });

  const monthlyDistribution: ProjectMonthStat[] = Object.entries(monthMap)
    .sort(([k1], [k2]) => k1.localeCompare(k2))
    .map(([key, data]) => ({
      key,
      ...data,
    }));

  const avgCheck = expenseTxs.length > 0 ? totalSpent / expenseTxs.length : 0;

  return {
    projectTxs,
    expenseTxs,
    incomeTxs,
    totalSpent,
    totalIncome,
    netBalance,
    txCount: projectTxs.length,
    firstDate,
    lastDate,
    categories,
    monthlyDistribution,
    avgCheck,
  };
}
