import { CostPerUseItem } from "@/types/finance";

export interface CostPerUseCardProps {
  items: CostPerUseItem[];
  totalMoneySaved?: number;
  onRefresh: () => void | Promise<void>;
  prefillItem?: Partial<CostPerUseItem> | null;
  onClearPrefill?: () => void;
}

export interface CostPerUseItemMetrics {
  uses: number;
  price: number;
  currentCost: number;
  moneySaved: number;
  roiPercent: number;
}

export function calculateItemCpuMetrics(
  item: CostPerUseItem
): CostPerUseItemMetrics {
  const uses = Math.max(1, Number(item.total_uses || 1));
  const price = Number(item.purchase_price || 0);
  const currentCost = Math.round((price / uses) * 100) / 100;

  let moneySaved = 0;
  let roiPercent = 0;
  if (item.benchmark_cost_per_use && Number(item.benchmark_cost_per_use) > 0) {
    const benchmark = Number(item.benchmark_cost_per_use);
    moneySaved = Math.max(0, benchmark * uses - price);
    roiPercent = Math.round(((benchmark * uses) / price) * 100);
  }

  return {
    uses,
    price,
    currentCost,
    moneySaved,
    roiPercent,
  };
}
