import { CategoryType } from "@/constants/categories";

export interface ParsedTelegramExpense {
  amount: number;
  merchant: string;
  category: CategoryType;
  type: "expense" | "income" | "investment";
  date: string;
  note?: string;
  exclude_from_budget?: boolean;
  is_emergency?: boolean;
  amortization_months?: number;
  tags?: string[];
  metadata?: Record<string, any>;
}

export interface ParsedTelegramReceiptItem {
  name: string;
  price: number;
  quantity?: number;
  suggested_category: CategoryType;
}

export interface ParsedTelegramReceipt {
  amount: number;
  currency: string;
  merchant: string;
  date: string;
  type: "expense" | "income" | "investment";
  suggested_category: CategoryType;
  items?: ParsedTelegramReceiptItem[];
  hasMultipleCategories?: boolean;
  bankName?: string;
  purpose?: string;
}
