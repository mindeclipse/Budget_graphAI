"use client";

import { useState, useCallback } from "react";
import { Transaction, RecurringItem, CostPerUseItem } from "@/types/finance";

export function useDashboardModals() {
  // 1. Модальні вікна відкриття/закриття
  const [isCycleModalOpen, setIsCycleModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importModalType, setImportModalType] = useState<
    "expense" | "investment"
  >("expense");
  const [isInzhurImportOpen, setIsInzhurImportOpen] = useState(false);
  const [isCreateExpenseOpen, setIsCreateExpenseOpen] = useState(false);
  const [isTrashOpen, setIsTrashOpen] = useState(false);
  const [isMerchantRulesOpen, setIsMerchantRulesOpen] = useState(false);

  // 2. AI аналіз
  const [isAiDrawerOpen, setIsAiDrawerOpen] = useState(false);
  const [aiInitialPrompt, setAiInitialPrompt] = useState<string | undefined>(
    undefined
  );

  // 3. Вибрані сутності (транзакція, спліт, категорія, тег)
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);
  const [splitTx, setSplitTx] = useState<Transaction | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedProjectTag, setSelectedProjectTag] = useState<string | null>(
    null
  );

  // 4. Регулярні платежі
  const [isAddingRecurring, setIsAddingRecurring] = useState(false);
  const [editingRecurring, setEditingRecurring] =
    useState<RecurringItem | null>(null);

  // 5. Попереднє заповнення Cost-per-Use
  const [prefillCostPerUse, setPrefillCostPerUse] =
    useState<Partial<CostPerUseItem> | null>(null);

  // Хендлери відкриття/закриття
  const openCycleModal = useCallback(() => setIsCycleModalOpen(true), []);
  const closeCycleModal = useCallback(() => setIsCycleModalOpen(false), []);

  const openImportModal = useCallback(
    (type: "expense" | "investment" = "expense") => {
      setImportModalType(type);
      setIsImportModalOpen(true);
    },
    []
  );
  const closeImportModal = useCallback(() => setIsImportModalOpen(false), []);

  const openInzhurImport = useCallback(() => setIsInzhurImportOpen(true), []);
  const closeInzhurImport = useCallback(() => setIsInzhurImportOpen(false), []);

  const openCreateExpense = useCallback(() => setIsCreateExpenseOpen(true), []);
  const closeCreateExpense = useCallback(
    () => setIsCreateExpenseOpen(false),
    []
  );

  const openTrash = useCallback(() => setIsTrashOpen(true), []);
  const closeTrash = useCallback(() => setIsTrashOpen(false), []);

  const openMerchantRules = useCallback(() => setIsMerchantRulesOpen(true), []);
  const closeMerchantRules = useCallback(
    () => setIsMerchantRulesOpen(false),
    []
  );

  const openAiDrawer = useCallback((prompt?: string) => {
    setAiInitialPrompt(prompt);
    setIsAiDrawerOpen(true);
  }, []);
  const closeAiDrawer = useCallback(() => {
    setIsAiDrawerOpen(false);
    setAiInitialPrompt(undefined);
  }, []);

  const openAddRecurring = useCallback(() => {
    setEditingRecurring(null);
    setIsAddingRecurring(true);
  }, []);

  const openEditRecurring = useCallback((item: RecurringItem) => {
    setEditingRecurring(item);
    setIsAddingRecurring(true);
  }, []);

  const closeRecurringModal = useCallback(() => {
    setIsAddingRecurring(false);
    setEditingRecurring(null);
  }, []);

  return {
    // Cycles
    isCycleModalOpen,
    openCycleModal,
    closeCycleModal,
    setIsCycleModalOpen,

    // Import
    isImportModalOpen,
    importModalType,
    openImportModal,
    closeImportModal,
    setIsImportModalOpen,

    // Inzhur
    isInzhurImportOpen,
    openInzhurImport,
    closeInzhurImport,
    setIsInzhurImportOpen,

    // Create Expense
    isCreateExpenseOpen,
    openCreateExpense,
    closeCreateExpense,
    setIsCreateExpenseOpen,

    // Trash
    isTrashOpen,
    openTrash,
    closeTrash,
    setIsTrashOpen,

    // Merchant Rules
    isMerchantRulesOpen,
    openMerchantRules,
    closeMerchantRules,
    setIsMerchantRulesOpen,

    // AI Drawer
    isAiDrawerOpen,
    aiInitialPrompt,
    openAiDrawer,
    closeAiDrawer,
    setIsAiDrawerOpen,
    setAiInitialPrompt,

    // Selections
    selectedTx,
    setSelectedTx,
    splitTx,
    setSplitTx,
    selectedCategory,
    setSelectedCategory,
    selectedProjectTag,
    setSelectedProjectTag,

    // Recurring
    isAddingRecurring,
    editingRecurring,
    openAddRecurring,
    openEditRecurring,
    closeRecurringModal,
    setIsAddingRecurring,
    setEditingRecurring,

    // Cost Per Use
    prefillCostPerUse,
    setPrefillCostPerUse,
  };
}
