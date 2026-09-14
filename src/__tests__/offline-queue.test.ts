import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  getOfflineQueue,
  saveOfflineQueue,
  enqueueTransaction,
  removeQueuedTransaction,
  clearOfflineQueue,
} from "@/lib/offline-queue";

let store: Record<string, string> = {};
const localStorageMock = {
  getItem: (key: string) => store[key] || null,
  setItem: (key: string, val: string) => {
    store[key] = String(val);
  },
  removeItem: (key: string) => {
    delete store[key];
  },
  clear: () => {
    store = {};
  },
};

const listeners: Record<string, Function[]> = {};
const windowMock = {
  localStorage: localStorageMock,
  addEventListener: (event: string, cb: Function) => {
    listeners[event] = listeners[event] || [];
    listeners[event].push(cb);
  },
  removeEventListener: (event: string, cb: Function) => {
    listeners[event] = (listeners[event] || []).filter((fn) => fn !== cb);
  },
  dispatchEvent: (ev: any) => {
    const handlers = listeners[ev.type] || [];
    handlers.forEach((fn) => fn(ev));
    return true;
  },
};

(global as any).localStorage = localStorageMock;
(global as any).window = windowMock;
(global as any).CustomEvent = class CustomEvent {
  type: string;
  detail: any;
  constructor(type: string, params?: any) {
    this.type = type;
    this.detail = params?.detail;
  }
};

describe("Offline Queue Management (PWA)", () => {
  beforeEach(() => {
    localStorageMock.clear();
  });

  it("повертає порожній масив, якщо черга в localStorage чиста", () => {
    expect(getOfflineQueue()).toEqual([]);
  });

  it("успішно додає транзакцію в чергу та призначає tempId", () => {
    const payload = {
      amount: 450,
      currency: "UAH" as const,
      merchant_raw: "АТБ",
      category_name: "Продукти",
      type: "expense" as const,
    };

    const item = enqueueTransaction(payload);
    expect(typeof item.tempId).toBe("number");

    const queue = getOfflineQueue();
    expect(queue.length).toBe(1);
    expect(queue[0].tempId).toBe(item.tempId);
    expect(queue[0].payload.merchant_raw).toBe("АТБ");
    expect(queue[0].retryCount).toBe(0);
  });

  it("видаляє транзакцію з черги за tempId після успішної синхронізації", () => {
    const item1 = enqueueTransaction({
      amount: 100,
      merchant_raw: "Кава",
      type: "expense",
    });
    const item2 = enqueueTransaction({
      amount: 200,
      merchant_raw: "Таксі",
      type: "expense",
    });

    expect(getOfflineQueue().length).toBe(2);

    removeQueuedTransaction(item1.tempId);
    const remaining = getOfflineQueue();
    expect(remaining.length).toBe(1);
    expect(remaining[0].tempId).toBe(item2.tempId);
  });

  it("зберігає чергу та оновлює лічильник спроб (retryCount)", () => {
    const item = enqueueTransaction({
      amount: 50,
      merchant_raw: "Метро",
      type: "expense",
    });
    expect(item.retryCount).toBe(0);

    const queue = getOfflineQueue();
    queue[0].retryCount += 1;
    saveOfflineQueue(queue);

    const updatedQueue = getOfflineQueue();
    expect(updatedQueue[0].retryCount).toBe(1);
  });

  it("надсилає подію offline_queue_changed у window", () => {
    const listener = vi.fn();
    window.addEventListener("offline_queue_changed", listener);

    enqueueTransaction({
      amount: 75,
      merchant_raw: "Чай",
      type: "expense",
    });

    expect(listener).toHaveBeenCalled();
    window.removeEventListener("offline_queue_changed", listener);
  });

  it("очищає всю чергу за викликом clearOfflineQueue", () => {
    enqueueTransaction({ amount: 10, merchant_raw: "A", type: "expense" });
    enqueueTransaction({ amount: 20, merchant_raw: "B", type: "expense" });
    expect(getOfflineQueue().length).toBe(2);

    clearOfflineQueue();
    expect(getOfflineQueue()).toEqual([]);
  });
});
