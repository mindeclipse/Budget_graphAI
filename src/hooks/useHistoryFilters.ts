import { useState, useMemo, useDeferredValue } from "react";
import { Transaction } from "@/types/finance";

export interface UseHistoryFiltersProps {
  filteredTransactions: Transaction[];
}

export function useHistoryFilters({
  filteredTransactions,
}: UseHistoryFiltersProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const [activeTag, setActiveTag] = useState<string | null>(null);

  const availableTags = useMemo<string[]>(() => {
    const tagsSet = new Set<string>();
    filteredTransactions.forEach((tx) => {
      tx.tags?.forEach((tag: string) => tagsSet.add(tag));
    });
    return Array.from(tagsSet);
  }, [filteredTransactions]);

  const displayedTransactions = useMemo(() => {
    return filteredTransactions.filter((t) => {
      const q = deferredSearchQuery.toLowerCase().trim();
      const comment =
        (typeof t.metadata?.comment === "string" ? t.metadata.comment : "") ||
        (typeof t.metadata?.note === "string" ? t.metadata.note : "");

      const matchesSearch =
        q === "" ||
        t.merchant_raw?.toLowerCase().includes(q) ||
        t.category_name?.toLowerCase().includes(q) ||
        String(t.amount).includes(q) ||
        t.tags?.some((tag) => tag.toLowerCase().includes(q)) ||
        comment.toLowerCase().includes(q);

      const matchesTag = !activeTag || (t.tags && t.tags.includes(activeTag));

      return matchesSearch && matchesTag;
    });
  }, [filteredTransactions, deferredSearchQuery, activeTag]);

  return {
    searchQuery,
    setSearchQuery,
    deferredSearchQuery,
    activeTag,
    setActiveTag,
    availableTags,
    displayedTransactions,
  };
}
