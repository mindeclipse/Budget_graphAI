import { WishlistItem, SavingsGoal } from "@/types/finance";

export type WishlistFilterType =
  "all" | "cooling" | "ready" | "saved" | "purchased";

export interface WishlistCardProps {
  items: WishlistItem[];
  savedAmount?: number;
  savingsGoals?: SavingsGoal[];
  onRefresh: () => void | Promise<void>;
  onConvertToCostPerUse?: (item: WishlistItem) => void;
  onAddOptimistic?: (item: any) => void;
  onResolveOptimistic?: (id: number, status: "saved" | "purchased") => void;
  onDeleteOptimistic?: (id: number) => void;
}

export function calculateRemainingDays(endDateStr: string, totalDays: number) {
  const end = new Date(endDateStr).getTime();
  const now = Date.now();
  const diffMs = end - now;
  const diffDays = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
  const passedDays = Math.max(0, totalDays - diffDays);
  const progressPercent = Math.min(
    100,
    Math.max(0, Math.round((passedDays / totalDays) * 100))
  );
  return { diffDays, progressPercent };
}
