"use client";

import { useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";

interface QuickActionsListenerProps {
  onAddExpense: () => void;
}

export function QuickActionsListener({
  onAddExpense,
}: QuickActionsListenerProps) {
  const searchParams = useSearchParams();
  const router = useRouter();

  useEffect(() => {
    const action = searchParams.get("action");

    if (action === "new_expense") {
      // 1. Викликаємо відкриття форми або модалки
      onAddExpense();

      // 2. Очищаємо query-параметр без перезавантаження сторінки
      router.replace("/", { scroll: false });
    }
  }, [searchParams, onAddExpense, router]);

  return null;
}
