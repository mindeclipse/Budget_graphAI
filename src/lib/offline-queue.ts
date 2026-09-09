export interface QueuedTransactionPayload {
  amount: number;
  currency?: "UAH" | "USD" | "EUR" | "PLN";
  merchant_raw: string;
  category_name?: string;
  source?: "manual" | "monobank" | "recurring" | "csv";
  type?: "expense" | "income" | "investment";
  created_at?: string;
  exclude_from_budget?: boolean;
}

export interface QueuedTransaction {
  tempId: number;
  payload: QueuedTransactionPayload;
  timestamp: number;
  retryCount: number;
}

const STORAGE_KEY = "budget_offline_transaction_queue";

export function getOfflineQueue(): QueuedTransaction[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export function saveOfflineQueue(queue: QueuedTransaction[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
    window.dispatchEvent(
      new CustomEvent("offline_queue_changed", {
        detail: { count: queue.length },
      })
    );
  } catch (err) {
    console.error("[OfflineQueue] Failed to save queue to localStorage:", err);
  }
}

let queueCounter = 0;

export function enqueueTransaction(
  payload: QueuedTransactionPayload,
  tempId?: number
): QueuedTransaction {
  const queue = getOfflineQueue();
  const id = tempId || -(Date.now() * 1000 + (++queueCounter % 1000));
  const item: QueuedTransaction = {
    tempId: id,
    payload,
    timestamp: Date.now(),
    retryCount: 0,
  };
  queue.push(item);
  saveOfflineQueue(queue);
  return item;
}

export function removeQueuedTransaction(tempId: number): void {
  const queue = getOfflineQueue().filter((item) => item.tempId !== tempId);
  saveOfflineQueue(queue);
}

export function clearOfflineQueue(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(STORAGE_KEY);
  window.dispatchEvent(
    new CustomEvent("offline_queue_changed", { detail: { count: 0 } })
  );
}

/**
 * Синхронізація накопичених офлайн-транзакцій із сервером
 */
export async function syncOfflineQueue(): Promise<{
  synced: number;
  failed: number;
  remaining: number;
}> {
  const queue = getOfflineQueue();
  if (queue.length === 0) {
    return { synced: 0, failed: 0, remaining: 0 };
  }

  let syncedCount = 0;
  let failedCount = 0;
  const remainingQueue: QueuedTransaction[] = [];

  for (const item of queue) {
    try {
      const res = await fetch("/api/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(item.payload),
      });

      if (res.ok) {
        syncedCount++;
      } else if (res.status >= 400 && res.status < 500) {
        // Помилка валідації чи 4xx - запис невалідний, видаляємо з черги
        console.warn(
          `[OfflineQueue] Transaction ${item.tempId} rejected by server with status ${res.status}`
        );
        failedCount++;
      } else {
        // Серверна помилка (5xx) чи збій - залишаємо на наступну спробу
        remainingQueue.push({ ...item, retryCount: item.retryCount + 1 });
        failedCount++;
      }
    } catch {
      // Мережа все ще недоступна
      remainingQueue.push({ ...item, retryCount: item.retryCount + 1 });
      failedCount++;
    }
  }

  saveOfflineQueue(remainingQueue);
  return {
    synced: syncedCount,
    failed: failedCount,
    remaining: remainingQueue.length,
  };
}
