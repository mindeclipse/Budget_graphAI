import { useMemo } from "react";
import { Transaction } from "@/types/finance";

export interface UseCapitalTransactionsProps {
  investmentTransactions: Transaction[];
  rawTransactions: Transaction[];
}

/**
 * Вибірка транзакцій для вкладки "Капітал & Цілі":
 * 1) Окремий запит investmentTransactions (ліміт 5000, без date-фільтру) для всієї історії Inzhur/ОВДП
 * 2) Транзакції капіталу із загального списку rawTransactions (скарбнички, заощадження, депозити)
 * 3) Розумна дедуплікація (Reconciliation): якщо банківський переказ на Inzhur (з виписки банку) вже
 *    представлений у виписці Inzhur як «Поповнення брокерського рахунку», банківський дублікат автоматично відсікається.
 */
export function useCapitalTransactions({
  investmentTransactions,
  rawTransactions,
}: UseCapitalTransactionsProps): Transaction[] {
  return useMemo(() => {
    const txMap = new Map<number, Transaction>();

    // 1. Спеціальні investment-транзакції брокера
    for (const t of investmentTransactions) {
      if (!t.exclude_from_budget) {
        txMap.set(t.id, t);
      }
    }

    const hasInzhurStatement = investmentTransactions.some(
      (t) => t.source === "inzhur_statement"
    );

    // 2. Операції капіталу із загального списку транзакцій
    for (const t of rawTransactions) {
      if (t.exclude_from_budget) continue;

      const isCapital =
        t.type === "investment" ||
        t.category_name?.toLowerCase().includes("інвест") ||
        t.category_name?.toLowerCase().includes("заощадж") ||
        t.tags?.some(
          (tag: string) =>
            tag.toLowerCase().includes("капітал") ||
            tag.toLowerCase().includes("інвест")
        );

      if (!isCapital) continue;

      // Якщо це банківський переказ на брокерський рахунок Inzhur, перевіряємо, чи є
      // вже відповідне «Поповнення брокерського рахунку» у виписці Inzhur
      const isInzhurBankTransfer =
        t.source !== "inzhur_statement" &&
        (t.merchant_raw?.toLowerCase().includes("інжур") ||
          t.merchant_raw?.toLowerCase().includes("inzhur") ||
          t.category_name?.toLowerCase().includes("inzhur"));

      if (isInzhurBankTransfer && hasInzhurStatement) {
        const hasMatchingInzhurDeposit = investmentTransactions.some(
          (inv) =>
            inv.source === "inzhur_statement" &&
            Math.abs(Number(inv.amount) - Number(t.amount)) < 0.01 &&
            Math.abs(
              new Date(inv.created_at).getTime() -
                new Date(t.created_at).getTime()
            ) <
              3 * 24 * 60 * 60 * 1000 // збіг суми у межах 3 днів банківського клірингу
        );

        if (hasMatchingInzhurDeposit) {
          continue; // Усуваємо дублювання: брокерський запис Inzhur є пріоритетним
        }
      }

      txMap.set(t.id, t);
    }

    return Array.from(txMap.values()).sort(
      (a: Transaction, b: Transaction) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  }, [investmentTransactions, rawTransactions]);
}
