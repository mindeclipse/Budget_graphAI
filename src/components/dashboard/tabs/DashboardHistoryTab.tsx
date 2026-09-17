"use client";

import { TransactionsList } from "@/components/dashboard/TransactionsList";
import { HistorySidebar } from "@/components/dashboard/HistorySidebar";
import { Transaction } from "@/types/finance";

export interface DashboardHistoryTabProps {
  filteredTransactions: Transaction[];
  displayedTransactions: Transaction[];
  searchQuery: string;
  onSearchChange: (q: string) => void;
  availableTags: string[];
  activeTag: string | null;
  onTagChange: (tag: string | null) => void;
  onOpenCreateExpense: () => void;
  onSelectTransaction: (tx: Transaction) => void;
  onDeleteTransaction: (id: number) => void;
  onOpenSplitTransaction: (tx: Transaction) => void;
  onOpenTrash: () => void;
  onOpenMerchantRules: () => void;
  onOpenTagProject: (tag: string) => void;
  periodLabel: string;
}

export function DashboardHistoryTab({
  filteredTransactions,
  displayedTransactions,
  searchQuery,
  onSearchChange,
  availableTags,
  activeTag,
  onTagChange,
  onOpenCreateExpense,
  onSelectTransaction,
  onDeleteTransaction,
  onOpenSplitTransaction,
  onOpenTrash,
  onOpenMerchantRules,
  onOpenTagProject,
  periodLabel,
}: DashboardHistoryTabProps) {
  return (
    <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-12">
      {/* Список транзакцій */}
      <section className="space-y-6 lg:col-span-8">
        <TransactionsList
          totalMonthTransactionsCount={filteredTransactions.length}
          displayedTransactions={displayedTransactions}
          searchQuery={searchQuery}
          onSearchChange={onSearchChange}
          availableTags={availableTags}
          activeTag={activeTag}
          onTagChange={onTagChange}
          onOpenCreateExpense={onOpenCreateExpense}
          onSelectTransaction={onSelectTransaction}
          onDeleteTransaction={onDeleteTransaction}
          onOpenSplitTransaction={onOpenSplitTransaction}
          onOpenTrash={onOpenTrash}
          onOpenMerchantRules={onOpenMerchantRules}
          onOpenTagProject={onOpenTagProject}
        />
      </section>

      {/* Бічна колонка: Аналітика вибірки та швидкий фільтр */}
      <aside className="space-y-6 lg:col-span-4">
        <HistorySidebar
          displayedTransactions={displayedTransactions}
          totalPeriodTransactions={filteredTransactions}
          searchQuery={searchQuery}
          onSearchChange={onSearchChange}
          activeTag={activeTag}
          onTagChange={onTagChange}
          periodLabel={periodLabel}
          onOpenCreateExpense={onOpenCreateExpense}
        />
      </aside>
    </div>
  );
}
