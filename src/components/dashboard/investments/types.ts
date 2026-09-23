import { InvestmentAsset } from "@/types/finance";

export interface InvestmentsCardProps {
  investments: InvestmentAsset[];
  rates?: { USD: number; EUR: number; PLN: number };
  onRefresh: () => void | Promise<void>;
  onUpsertOptimistic?: (asset: any) => void;
  onDeleteOptimistic?: (assetId: number) => void;
}

export const ASSET_TYPE_LABELS: Record<
  string,
  { label: string; color: string }
> = {
  bonds: { label: "ОВДП", color: "bg-indigo-500" },
  stocks: { label: "Акції / ETF", color: "bg-sky-500" },
  reit: { label: "REIT", color: "bg-teal-500" },
  crypto: { label: "Крипта", color: "bg-amber-500" },
  deposit: { label: "Депозит", color: "bg-emerald-500" },
  other: { label: "Інше", color: "bg-purple-500" },
};

export const ASSET_TYPE_ORDER: Record<string, number> = {
  bonds: 1,
  stocks: 2,
  reit: 3,
  crypto: 4,
  deposit: 5,
  other: 6,
};

/**
 * Сортує інвестиційні активи за типом та фінансовою логікою:
 * 1. Тип активу (ОВДП -> Акції/ETF -> REIT -> Крипта -> Депозити -> Інше)
 * 2. Для активів з датою погашення (ОВДП, строкові депозити) — за зростанням дати (найближчі до погашення перші)
 * 3. Без дати або з однаковою датою — за поточною вартістю спаданням (найбільші позиції вище)
 * 4. За назвою активу (українська локаль)
 */
export function sortInvestments(assets: InvestmentAsset[]): InvestmentAsset[] {
  return [...assets].sort((a, b) => {
    // 1. Сортування за типом активу
    const orderA = ASSET_TYPE_ORDER[a.asset_type] ?? 99;
    const orderB = ASSET_TYPE_ORDER[b.asset_type] ?? 99;
    if (orderA !== orderB) {
      return orderA - orderB;
    }

    // 2. В межах одного типу: дата погашення (найближчі перші)
    if (a.maturity_date && b.maturity_date) {
      const timeA = new Date(a.maturity_date).getTime();
      const timeB = new Date(b.maturity_date).getTime();
      if (timeA !== timeB) return timeA - timeB;
    } else if (a.maturity_date && !b.maturity_date) {
      return -1;
    } else if (!a.maturity_date && b.maturity_date) {
      return 1;
    }

    // 3. За поточною вартістю спаданням
    const curA = Number(a.current_value) || 0;
    const curB = Number(b.current_value) || 0;
    if (Math.abs(curB - curA) > 0.01) {
      return curB - curA;
    }

    // 4. За назвою активу
    return (a.asset_name || "").localeCompare(b.asset_name || "", "uk-UA");
  });
}
