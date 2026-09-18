import { useOfflineSyncQueue } from "./useOfflineSyncQueue";
import { useCrudMutations } from "./useCrudMutations";

export * from "./types";
export * from "./useOfflineSyncQueue";
export * from "./useCrudMutations";

export function useTransactionMutations() {
  const { isSyncing, handleSyncQueue } = useOfflineSyncQueue();
  const { updateMutation, createMutation, deleteMutation } = useCrudMutations();

  return {
    updateTransaction: updateMutation.mutate,
    createTransaction: createMutation.mutate,
    deleteTransaction: deleteMutation.mutate,
    syncQueue: handleSyncQueue,
    isSyncing,
  };
}
