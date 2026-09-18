import { useState, useEffect, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { syncOfflineQueue, getOfflineQueue } from "@/lib/offline-queue";

export function useOfflineSyncQueue() {
  const queryClient = useQueryClient();
  const [isSyncing, setIsSyncing] = useState(false);

  // Ручна або автоматична синхронізація черги
  const handleSyncQueue = useCallback(async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    try {
      const res = await syncOfflineQueue();
      if (res.synced > 0) {
        queryClient.invalidateQueries({ queryKey: ["transactions"] });
        queryClient.invalidateQueries({ queryKey: ["analytics"] });
        toast.success("Синхронізація успішна", {
          id: "offline-sync-success",
          description: `Офлайн-операцій збережено на сервері: ${res.synced}`,
        });
      }
    } catch (err) {
      console.error("[useTransactionMutations] Error during queue sync:", err);
    } finally {
      setIsSyncing(false);
    }
  }, [isSyncing, queryClient]);

  // Слухач відновлення мережі
  useEffect(() => {
    const onOnline = () => {
      const queue = getOfflineQueue();
      if (queue.length > 0) {
        handleSyncQueue();
      }
    };

    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [handleSyncQueue]);

  return {
    isSyncing,
    handleSyncQueue,
  };
}
