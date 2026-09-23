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

/**
 * Рахує сумарну виплату купонів для активу (для ОВДП).
 */
export function calculateTotalCoupons(asset: InvestmentAsset): number {
  if (!asset.coupons || !Array.isArray(asset.coupons)) return 0;
  return asset.coupons.reduce((sum, c) => sum + (Number(c.amount) || 0), 0);
}

/**
 * Розраховує фінансовий результат (P&L та %) для інвестиційного активу.
 * Для ОВДП до прибутку додаються отримані купонні виплати, при цьому
 * поточна ринкова вартість (тіло) залишається незмінною.
 */
export function calculateAssetPnl(asset: InvestmentAsset): {
  diff: number;
  pct: string;
  totalCoupons: number;
  isProfit: boolean;
} {
  const investedVal = Number(asset.invested_amount) || 0;
  const currentVal = Number(asset.current_value) || 0;
  const totalCoupons = calculateTotalCoupons(asset);
  const diff = currentVal + totalCoupons - investedVal;
  const pct = investedVal > 0 ? ((diff / investedVal) * 100).toFixed(1) : "0";
  const isProfit = diff >= 0;
  return { diff, pct, totalCoupons, isProfit };
}

/**
 * Перевіряє, чи є актив архівним (погашеним або вручну перенесеним у архів).
 * ОВДП з минулою датою погашення автоматично вважаються архівними.
 */
export function isAssetArchived(
  asset: InvestmentAsset,
  todayIso?: string
): boolean {
  if (asset.is_archived) return true;
  if (asset.asset_type === "bonds" && asset.maturity_date) {
    const today =
      todayIso ||
      new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Kyiv" });
    const matIso = asset.maturity_date.slice(0, 10);
    if (matIso < today) return true;
  }
  return false;
}
