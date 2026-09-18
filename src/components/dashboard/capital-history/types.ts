import { Transaction } from "@/types/finance";

export const INITIAL_VISIBLE = 6;

export interface CapitalHistoryCardProps {
  transactions: Transaction[];
  onSelectTransaction: (tx: Transaction) => void;
  onAddCapital?: () => void;
  onImportInzhur?: () => void;
}
