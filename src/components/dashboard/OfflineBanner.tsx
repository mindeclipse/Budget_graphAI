"use client";

import { useEffect, useState } from "react";
import { WifiOff, RefreshCw, CloudAlert } from "lucide-react";
import { getOfflineQueue } from "@/lib/offline-queue";

interface OfflineBannerProps {
  onSync?: () => Promise<void> | void;
  isSyncing?: boolean;
}

export function OfflineBanner({
  onSync,
  isSyncing = false,
}: OfflineBannerProps) {
  const [isOnline, setIsOnline] = useState<boolean>(true);
  const [queueCount, setQueueCount] = useState<number>(0);

  useEffect(() => {
    // Початковий стан
    if (typeof window !== "undefined") {
      setIsOnline(navigator.onLine);
      setQueueCount(getOfflineQueue().length);
    }

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    const handleQueueChange = (e: Event) => {
      const customEvent = e as CustomEvent<{ count: number }>;
      setQueueCount(customEvent.detail?.count ?? getOfflineQueue().length);
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    window.addEventListener("offline_queue_changed", handleQueueChange);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("offline_queue_changed", handleQueueChange);
    };
  }, []);

  // Якщо онлайн і немає транзакцій у черзі — банер не показуємо
  if (isOnline && queueCount === 0) {
    return null;
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className={`animate-in fade-in slide-in-from-top-2 mb-4 flex flex-col gap-2 rounded-2xl border p-3 text-xs transition-all duration-300 sm:flex-row sm:items-center sm:justify-between sm:text-sm ${
        !isOnline
          ? "border-amber-500/30 bg-amber-500/10 text-amber-200"
          : "border-sky-500/30 bg-sky-500/10 text-sky-200"
      }`}
    >
      <div className="flex items-center gap-2.5">
        {!isOnline ? (
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-amber-500/20 text-amber-400">
            <WifiOff size={16} />
          </div>
        ) : (
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-sky-500/20 text-sky-400">
            <CloudAlert size={16} />
          </div>
        )}

        <div>
          <p className="leading-tight font-semibold">
            {!isOnline ? "Офлайн-режим" : "Очікується збереження на сервер"}
          </p>
          <p className="text-[11px] opacity-80 sm:text-xs">
            {!isOnline
              ? queueCount > 0
                ? `В черзі: ${queueCount} ${queueCount === 1 ? "операція" : "операцій"}. Вони збережені локально та відправляться при появі зв'язку.`
                : "Ви можете вносити витрати — вони збережуться в локальну чергу."
              : `Зв'язок відновлено. В черзі ${queueCount} ${queueCount === 1 ? "операція" : "операцій"} для синхронізації.`}
          </p>
        </div>
      </div>

      {queueCount > 0 && onSync && isOnline && (
        <button
          type="button"
          onClick={() => onSync()}
          disabled={isSyncing}
          className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl border border-sky-400/30 bg-sky-500/20 px-3 py-1.5 text-xs font-semibold text-sky-100 transition-all hover:bg-sky-500/30 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <RefreshCw
            size={13}
            className={isSyncing ? "animate-spin text-sky-300" : "text-sky-300"}
          />
          {isSyncing ? "Синхронізація..." : "Синхронізувати"}
        </button>
      )}
    </div>
  );
}
