import React from "react";
import { CategoryStatItem } from "@/hooks/useBudgetMetrics";

export interface CategoryBreakdownProps {
  categoryStats: CategoryStatItem[];
  categoryBudgets?: Record<string, number>;
  onSelectCategory: (categoryName: string) => void;
  onSaveCategoryBudget?: (categoryName: string, limit: number) => Promise<void>;
  onDeleteCategoryBudget?: (categoryName: string) => Promise<void>;
}

export interface CategoryStatRowProps {
  cat: CategoryStatItem;
  budgetLimit?: number;
  onSelectCategory: (categoryName: string) => void;
  onOpenBudgetModal?: (e: React.MouseEvent, catName: string) => void;
}

export interface CategoryBudgetModalProps {
  categoryName: string;
  categoryBudgets: Record<string, number>;
  limitInput: string;
  isSubmitting: boolean;
  onLimitInputChange: (val: string) => void;
  onClose: () => void;
  onSave: (e: React.FormEvent) => void;
  onDelete?: () => void;
}
