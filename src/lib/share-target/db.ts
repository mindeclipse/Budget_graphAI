/**
 * IndexedDB сховище для Web Share Target API
 * Працює як у Window, так і у ServiceWorkerGlobalScope.
 */

export const DB_NAME = "budget_share_target_db";
export const DB_VERSION = 1;
export const STORE_NAME = "shared_items";

export interface StoredSharedData {
  id?: number;
  blob?: Blob;
  fileName?: string;
  fileType?: string;
  title?: string;
  text?: string;
  url?: string;
  timestamp: number;
}

export interface ConsumedSharedReceipt {
  file?: File;
  fileName?: string;
  fileType?: string;
  title?: string;
  text?: string;
  url?: string;
  timestamp: number;
}

function getIndexedDB(): IDBFactory | undefined {
  if (typeof indexedDB !== "undefined") {
    return indexedDB;
  }
  if (typeof globalThis !== "undefined" && globalThis.indexedDB) {
    return globalThis.indexedDB;
  }
  return undefined;
}

/**
 * Відкриття бази даних IndexedDB для збереження спільних квитанцій
 */
export function openShareTargetDb(): Promise<IDBDatabase> {
  const idb = getIndexedDB();
  if (!idb) {
    return Promise.reject(
      new Error("IndexedDB не підтримується у цьому середовищі")
    );
  }

  return new Promise((resolve, reject) => {
    const request = idb.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, {
          keyPath: "id",
          autoIncrement: true,
        });
      }
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = () => {
      reject(request.error || new Error("Не вдалося відкрити базу даних"));
    };
  });
}

/**
 * Зберігає спільний файл або текст квитанції у сховище
 */
export async function storeSharedReceipt(data: {
  file?: Blob | File;
  fileName?: string;
  fileType?: string;
  title?: string;
  text?: string;
  url?: string;
}): Promise<number> {
  const db = await openShareTargetDb();

  let blob: Blob | undefined = undefined;
  let fileName = data.fileName || "receipt.pdf";
  let fileType = data.fileType || "application/pdf";

  if (data.file) {
    blob = data.file;
    if ("name" in data.file && data.file.name) {
      fileName = data.file.name;
    }
    if (data.file.type) {
      fileType = data.file.type;
    }
  }

  const record: StoredSharedData = {
    blob,
    fileName,
    fileType,
    title: data.title || "",
    text: data.text || "",
    url: data.url || "",
    timestamp: Date.now(),
  };

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.add(record);

    request.onsuccess = () => {
      resolve(Number(request.result));
    };

    request.onerror = () => {
      reject(
        request.error || new Error("Помилка збереження квитанції в IndexedDB")
      );
    };

    transaction.oncomplete = () => {
      db.close();
    };
  });
}

/**
 * Зчитує найновішу спільну квитанцію та видаляє її зі сховища (одноразове споживання)
 */
export async function consumeSharedReceipt(): Promise<ConsumedSharedReceipt | null> {
  const idb = getIndexedDB();
  if (!idb) return null;

  let db: IDBDatabase;
  try {
    db = await openShareTargetDb();
  } catch {
    return null;
  }

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();

    request.onsuccess = () => {
      const items = (request.result || []) as StoredSharedData[];
      if (items.length === 0) {
        resolve(null);
        return;
      }

      // Беремо найновіший запис
      items.sort((a, b) => b.timestamp - a.timestamp);
      const latest = items[0];

      // Видаляємо всі оброблені або застарілі (> 1 години) записи
      const oneHourAgo = Date.now() - 60 * 60 * 1000;
      for (const it of items) {
        if (
          it.id !== undefined &&
          (it.id === latest.id || it.timestamp < oneHourAgo)
        ) {
          store.delete(it.id);
        }
      }

      let file: File | undefined = undefined;
      if (latest.blob) {
        try {
          file = new File(
            [latest.blob],
            latest.fileName || "shared-receipt.pdf",
            {
              type: latest.fileType || latest.blob.type || "application/pdf",
              lastModified: latest.timestamp,
            }
          );
        } catch {
          // Fallback для середовищ, де new File недоступний
          file = latest.blob as any;
        }
      }

      resolve({
        file,
        fileName: latest.fileName,
        fileType: latest.fileType,
        title: latest.title,
        text: latest.text,
        url: latest.url,
        timestamp: latest.timestamp,
      });
    };

    request.onerror = () => {
      reject(request.error || new Error("Помилка отримання квитанції"));
    };

    transaction.oncomplete = () => {
      db.close();
    };
  });
}
