import { Transaction } from "@/types/finance";
import { CategoryDiff, MoMDiffResult } from "./types";

export function calculateMoMDiffs(
  currentTransactions: Transaction[],
  previousTransactions: Transaction[]
): MoMDiffResult {
  // 1. Агрегація поточного місяця
  const currMap: Record<string, number> = {};
  let currTotal = 0;
  currentTransactions.forEach((tx) => {
    if (tx.type && tx.type !== "expense") return;
    const amt = Number(tx.amount) || 0;
    currMap[tx.category_name] = (currMap[tx.category_name] || 0) + amt;
    currTotal += amt;
  });

  // 2. Агрегація попереднього місяця
  const prevMap: Record<string, number> = {};
  let prevTotal = 0;
  previousTransactions.forEach((tx) => {
    if (tx.type && tx.type !== "expense") return;
    const amt = Number(tx.amount) || 0;
    prevMap[tx.category_name] = (prevMap[tx.category_name] || 0) + amt;
    prevTotal += amt;
  });

  // 3. Об'єднання всіх унікальних категорій
  const allCategories = Array.from(
    new Set([...Object.keys(currMap), ...Object.keys(prevMap)])
  );

  const diffs: CategoryDiff[] = allCategories
    .map((cat) => {
      const cur = currMap[cat] || 0;
      const prv = prevMap[cat] || 0;
      const diff = cur - prv;
      const pct = prv > 0 ? ((cur - prv) / prv) * 100 : null;

      return {
        category: cat,
        currentAmount: cur,
        prevAmount: prv,
        diffAmount: diff,
        percentChange: pct,
      };
    })
    .filter((row) => row.currentAmount > 0 || row.prevAmount > 0);

  // Сортуємо: спочатку категорії з найбільшими витратами в поточному місяці
  diffs.sort((a, b) => b.currentAmount - a.currentAmount);

  const totDiff = currTotal - prevTotal;
  const totPct =
    prevTotal > 0 ? ((currTotal - prevTotal) / prevTotal) * 100 : null;

  return {
    categoryDiffs: diffs,
    totalCurrent: currTotal,
    totalPrev: prevTotal,
    totalDiffAmount: totDiff,
    totalPercentChange: totPct,
  };
}
