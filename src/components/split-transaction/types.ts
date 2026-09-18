import { Transaction } from "@/types/finance";

export interface SplitItem {
  amount: string;
  category_name: string;
  merchant_raw: string;
}

export interface SplitTransactionModalProps {
  transaction: Transaction | null;
  onClose: () => void;
  onSplitSuccess: () => void;
}

export interface SplitItemRowProps {
  item: SplitItem;
  index: number;
  canDelete: boolean;
  onRemove: (index: number) => void;
  onUpdate: (index: number, field: keyof SplitItem, value: string) => void;
}

export interface SplitBalanceIndicatorProps {
  isBalanced: boolean;
  diff: number;
  currentSum: number;
  totalAmount: number;
}
