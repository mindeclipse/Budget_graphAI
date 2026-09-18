export interface BudgetSummaryHeaderProps {
  spentWhole: string;
  spentCents?: string;
  recurringTotal: number;
  transactionCount: number;
  onOpenNewCycle: () => void;
  onOpenImport: () => void;
  onRegisterDevice: () => void;
  onLogout: () => void;
  onExportExcel?: () => void;
  onRestoreSuccess?: () => void;
  onOpenTrash?: () => void;
  onOpenMerchantRules?: () => void;
}
