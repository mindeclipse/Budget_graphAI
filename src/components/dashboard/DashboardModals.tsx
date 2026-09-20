"use client";

import dynamic from "next/dynamic";
import {
  Transaction,
  BudgetCycle,
  RecurringItem,
  InvestmentAsset,
} from "@/types/finance";
import { FALLBACK_BUDGET_LIMIT } from "@/lib/cycle-utils";
import {
  AIAnalysisResponse,
  SupportedGeminiModel,
  AIChatFinancialContext,
} from "@/types/ai";

// Dynamic Code Splitting для важких модальних вікон
const CategoryDetailModal = dynamic(
  () =>
    import("@/components/CategoryDetailModal").then(
      (m) => m.CategoryDetailModal
    ),
  { ssr: false }
);
const CreateTransactionDrawer = dynamic(
  () =>
    import("@/components/CreateTransactionDrawer").then(
      (m) => m.CreateTransactionDrawer
    ),
  { ssr: false }
);
const RecurringModal = dynamic(
  () => import("@/components/RecurringModal").then((m) => m.RecurringModal),
  { ssr: false }
);
const TransactionActionSheet = dynamic(
  () =>
    import("@/components/TransactionActionSheet").then(
      (m) => m.TransactionActionSheet
    ),
  { ssr: false }
);
const SplitTransactionModal = dynamic(
  () =>
    import("@/components/SplitTransactionModal").then(
      (m) => m.SplitTransactionModal
    ),
  { ssr: false }
);
const NewCycleModal = dynamic(
  () => import("@/components/NewCycleModal").then((m) => m.NewCycleModal),
  { ssr: false }
);
const AIAnalysisDrawer = dynamic(
  () => import("@/components/AIAnalysisDrawer").then((m) => m.AIAnalysisDrawer),
  { ssr: false }
);
const BankStatementModal = dynamic(
  () =>
    import("@/components/BankStatementModal").then((m) => m.BankStatementModal),
  { ssr: false }
);
const InzhurImportModal = dynamic(
  () =>
    import("@/components/InzhurImportModal").then((m) => m.InzhurImportModal),
  { ssr: false }
);
const TrashModal = dynamic(
  () => import("@/components/TrashModal").then((m) => m.TrashModal),
  { ssr: false }
);
const MerchantRulesModal = dynamic(
  () =>
    import("@/components/MerchantRulesModal").then((m) => m.MerchantRulesModal),
  { ssr: false }
);
const TagProjectModal = dynamic(
  () => import("@/components/TagProjectModal").then((m) => m.TagProjectModal),
  { ssr: false }
);
const FinancialCalendarModal = dynamic(
  () =>
    import("@/components/dashboard/modals/FinancialCalendarModal").then(
      (m) => m.FinancialCalendarModal
    ),
  { ssr: false }
);

export interface DashboardModalsProps {
  // Category detail
  selectedCategory: string | null;
  filteredTransactions: Transaction[];
  onCloseCategory: () => void;

  // Tag project modal
  selectedProjectTag: string | null;
  transactions: Transaction[];
  onCloseProjectTag: () => void;

  // Create transaction drawer
  isCreateExpenseOpen: boolean;
  onCloseCreateExpense: () => void;

  // Recurring modal
  isAddingRecurring: boolean;
  editingRecurring: RecurringItem | null;
  onCloseRecurring: () => void;
  onSaveRecurring: (formData: {
    id?: number;
    title: string;
    amount: number;
    currency: "UAH" | "USD";
    category_name: string;
    day_of_month: number;
  }) => Promise<void>;
  onDeleteRecurring: (id: number) => Promise<void>;

  // Transaction action sheet
  selectedTx: Transaction | null;
  onCloseSelectedTx: () => void;
  onUpdateCategory: (txId: number, category: string) => void;
  onUpdateTags: (txId: number, newTags: string[]) => void;
  onDeleteTransaction: (txId: number) => void;
  onOpenSplit: (tx: Transaction) => void;
  onOpenTagProject: (tag: string) => void;
  onReceiptUpdated: () => void;
  onUpdateTransaction: (payload: {
    id: number;
    amount?: number;
    merchant_raw?: string;
    category_name?: string;
    created_at?: string;
  }) => void;

  // Split transaction modal
  splitTx: Transaction | null;
  onCloseSplit: () => void;
  onSplitSuccess: () => Promise<void> | void;

  // Budget Cycle modal
  isCycleModalOpen: boolean;
  onCloseCycleModal: () => void;
  activeCycle: BudgetCycle | null;
  effectiveLimit: number;
  onCycleStarted: () => void;

  // AI Drawer
  isAiDrawerOpen: boolean;
  onCloseAiDrawer: () => void;
  aiAnalysis: AIAnalysisResponse | null;
  isAiLoading: boolean;
  selectedAiModel: SupportedGeminiModel;
  onAiModelChange: (model: SupportedGeminiModel) => void;
  onAiReanalyze: () => void;
  aiInitialPrompt?: string;
  aiFinancialContext: AIChatFinancialContext;

  // Bank Statement Import modal
  isImportModalOpen: boolean;
  onCloseImportModal: () => void;
  onImportSuccess: () => void;
  investments: InvestmentAsset[];
  importModalType: "expense" | "investment";
  importModalFile?: File | null;
  onInvestmentsChange: () => void;

  // Inzhur Import modal
  isInzhurImportOpen: boolean;
  onCloseInzhurImport: () => void;
  onInzhurSuccess: () => void;

  // Trash modal
  isTrashOpen: boolean;
  onCloseTrash: () => void;

  // Merchant Rules modal
  isMerchantRulesOpen: boolean;
  onCloseMerchantRules: () => void;

  // Financial Calendar modal
  isCalendarOpen?: boolean;
  onCloseCalendar?: () => void;
  daysRemaining?: number;

  // Generic transaction selection setter
  onSelectTransaction: (tx: Transaction | null) => void;
}

export function DashboardModals({
  selectedCategory,
  filteredTransactions,
  onCloseCategory,

  selectedProjectTag,
  transactions,
  onCloseProjectTag,

  isCreateExpenseOpen,
  onCloseCreateExpense,

  isAddingRecurring,
  editingRecurring,
  onCloseRecurring,
  onSaveRecurring,
  onDeleteRecurring,

  selectedTx,
  onCloseSelectedTx,
  onUpdateCategory,
  onUpdateTags,
  onDeleteTransaction,
  onOpenSplit,
  onOpenTagProject,
  onReceiptUpdated,
  onUpdateTransaction,

  splitTx,
  onCloseSplit,
  onSplitSuccess,

  isCycleModalOpen,
  onCloseCycleModal,
  activeCycle,
  effectiveLimit,
  onCycleStarted,

  isAiDrawerOpen,
  onCloseAiDrawer,
  aiAnalysis,
  isAiLoading,
  selectedAiModel,
  onAiModelChange,
  onAiReanalyze,
  aiInitialPrompt,
  aiFinancialContext,

  isImportModalOpen,
  onCloseImportModal,
  onImportSuccess,
  investments,
  importModalType,
  importModalFile,
  onInvestmentsChange,

  isInzhurImportOpen,
  onCloseInzhurImport,
  onInzhurSuccess,

  isTrashOpen,
  onCloseTrash,

  isMerchantRulesOpen,
  onCloseMerchantRules,

  isCalendarOpen,
  onCloseCalendar,
  daysRemaining,

  onSelectTransaction,
}: DashboardModalsProps) {
  return (
    <>
      {selectedCategory && (
        <CategoryDetailModal
          categoryName={selectedCategory}
          transactions={filteredTransactions}
          onClose={onCloseCategory}
          onSelectTransaction={onSelectTransaction}
        />
      )}

      {selectedProjectTag && (
        <TagProjectModal
          tag={selectedProjectTag}
          transactions={transactions}
          onClose={onCloseProjectTag}
          onSelectTransaction={onSelectTransaction}
        />
      )}

      <CreateTransactionDrawer
        isOpen={isCreateExpenseOpen}
        onClose={onCloseCreateExpense}
      />

      {isAddingRecurring && (
        <RecurringModal
          isOpen={isAddingRecurring}
          item={editingRecurring}
          onClose={onCloseRecurring}
          onSave={onSaveRecurring}
          onDelete={onDeleteRecurring}
        />
      )}

      {selectedTx && (
        <TransactionActionSheet
          transaction={selectedTx}
          onClose={onCloseSelectedTx}
          onUpdateCategory={onUpdateCategory}
          onUpdateTags={onUpdateTags}
          onDelete={onDeleteTransaction}
          onOpenSplit={onOpenSplit}
          onOpenTagProject={onOpenTagProject}
          onReceiptUpdated={onReceiptUpdated}
          onUpdateTransaction={(payload) => {
            onCloseSelectedTx();
            onUpdateTransaction(payload);
          }}
        />
      )}

      {splitTx && (
        <SplitTransactionModal
          transaction={splitTx}
          onClose={onCloseSplit}
          onSplitSuccess={onSplitSuccess}
        />
      )}

      {isCycleModalOpen && (
        <NewCycleModal
          isOpen={isCycleModalOpen}
          onClose={onCloseCycleModal}
          defaultLimit={
            activeCycle?.budget_limit || effectiveLimit || FALLBACK_BUDGET_LIMIT
          }
          onCycleStarted={onCycleStarted}
        />
      )}

      {isAiDrawerOpen && (
        <AIAnalysisDrawer
          isOpen={isAiDrawerOpen}
          onClose={onCloseAiDrawer}
          analysis={aiAnalysis}
          isLoading={isAiLoading}
          selectedModel={selectedAiModel}
          onModelChange={onAiModelChange}
          onReanalyze={onAiReanalyze}
          initialPrompt={aiInitialPrompt}
          financialContext={aiFinancialContext}
        />
      )}

      {isImportModalOpen && (
        <BankStatementModal
          isOpen={isImportModalOpen}
          onClose={onCloseImportModal}
          onSuccess={onImportSuccess}
          investments={investments}
          initialType={importModalType}
          initialFile={importModalFile}
          onInvestmentsChange={onInvestmentsChange}
        />
      )}

      {isInzhurImportOpen && (
        <InzhurImportModal
          isOpen={isInzhurImportOpen}
          onClose={onCloseInzhurImport}
          onSuccess={onInzhurSuccess}
        />
      )}

      {isTrashOpen && (
        <TrashModal isOpen={isTrashOpen} onClose={onCloseTrash} />
      )}

      {isMerchantRulesOpen && (
        <MerchantRulesModal
          isOpen={isMerchantRulesOpen}
          onClose={onCloseMerchantRules}
        />
      )}

      {isCalendarOpen && (
        <FinancialCalendarModal
          isOpen={isCalendarOpen}
          onClose={onCloseCalendar || (() => {})}
          activeCycle={activeCycle}
          daysRemaining={daysRemaining}
        />
      )}
    </>
  );
}
