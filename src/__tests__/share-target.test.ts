import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  openShareTargetDb,
  storeSharedReceipt,
  consumeSharedReceipt,
  DB_NAME,
  STORE_NAME,
} from "@/lib/share-target/db";
import { POST, GET } from "@/app/share-target/route";

describe("Web Share Target API & Storage", () => {
  let mockStore: Map<number, any>;
  let autoId: number;

  beforeEach(() => {
    mockStore = new Map();
    autoId = 1;

    // Створюємо стійкий mock для IndexedDB
    const fakeDb = {
      objectStoreNames: {
        contains: (name: string) => name === STORE_NAME,
      },
      createObjectStore: vi.fn(),
      transaction: (storeNames: string[], mode: string) => {
        const tx = {
          objectStore: (name: string) => ({
            add: (record: any) => {
              const id = autoId++;
              mockStore.set(id, { ...record, id });
              const req: any = { result: id };
              setTimeout(() => {
                req.onsuccess?.();
                tx.oncomplete?.();
              }, 0);
              return req;
            },
            getAll: () => {
              const list = Array.from(mockStore.values());
              const req: any = { result: list };
              setTimeout(() => {
                req.onsuccess?.();
                tx.oncomplete?.();
              }, 0);
              return req;
            },
            delete: (id: number) => {
              mockStore.delete(id);
              const req: any = {};
              setTimeout(() => {
                req.onsuccess?.();
              }, 0);
              return req;
            },
          }),
          oncomplete: null as any,
          onerror: null as any,
        };
        return tx;
      },
      close: vi.fn(),
    };

    const fakeIndexedDb = {
      open: (name: string, version: number) => {
        const req: any = {
          result: fakeDb,
          onupgradeneeded: null,
          onsuccess: null,
          onerror: null,
        };
        setTimeout(() => {
          req.onsuccess?.();
        }, 0);
        return req;
      },
    };

    vi.stubGlobal("indexedDB", fakeIndexedDb);
  });

  describe("IndexedDB Store & Consume", () => {
    it("зберігає файл квитанції у сховище та повертає згенерований ID", async () => {
      const blob = new Blob(["%PDF-1.4 test"], { type: "application/pdf" });
      const id = await storeSharedReceipt({
        file: blob,
        fileName: "monobank-receipt.pdf",
        title: "Квитанція Монобанк",
      });

      expect(id).toBe(1);
      expect(mockStore.size).toBe(1);
      expect(mockStore.get(1)?.fileName).toBe("monobank-receipt.pdf");
      expect(mockStore.get(1)?.title).toBe("Квитанція Монобанк");
    });

    it("одноразово споживає (consume) квитанцію та очищує сховище", async () => {
      const blob = new Blob(["test image content"], { type: "image/png" });
      await storeSharedReceipt({
        file: blob,
        fileName: "screenshot.png",
        fileType: "image/png",
      });

      expect(mockStore.size).toBe(1);

      const consumed = await consumeSharedReceipt();
      expect(consumed).not.toBeNull();
      expect(consumed?.fileName).toBe("screenshot.png");
      expect(consumed?.fileType).toBe("image/png");

      // Після споживання запис має бути видалений
      expect(mockStore.size).toBe(0);

      // Повторне зчитування повертає null
      const secondTry = await consumeSharedReceipt();
      expect(secondTry).toBeNull();
    });

    it("повертає найновіший запис, якщо збережено кілька квитанцій", async () => {
      const blob1 = new Blob(["receipt 1"], { type: "application/pdf" });
      const blob2 = new Blob(["receipt 2"], { type: "application/pdf" });

      await storeSharedReceipt({ file: blob1, fileName: "first.pdf" });
      // Невелика затримка для різниці в timestamp
      await new Promise((r) => setTimeout(r, 10));
      await storeSharedReceipt({ file: blob2, fileName: "latest.pdf" });

      const consumed = await consumeSharedReceipt();
      expect(consumed?.fileName).toBe("latest.pdf");
    });

    it("повертає null, якщо сховище порожнє", async () => {
      const consumed = await consumeSharedReceipt();
      expect(consumed).toBeNull();
    });
  });

  describe("Server Route Fallback (POST & GET /share-target)", () => {
    it("POST /share-target перенаправляє на /?action=shared_receipt зі статусом 303", async () => {
      const formData = new FormData();
      formData.append("title", "Оплата рахунку");
      formData.append("text", "Переказ 450 грн");
      formData.append("url", "https://send.monobank.ua/xyz");

      const req = new Request("http://localhost:3000/share-target", {
        method: "POST",
        body: formData,
      });

      const res = await POST(req);
      expect(res.status).toBe(303);

      const location = res.headers.get("location");
      expect(location).toContain("action=shared_receipt");
      expect(location).toContain("shared_text=");
      expect(location).toContain("shared_url=");
    });

    it("GET /share-target перенаправляє на головну сторінку / зі статусом 303", async () => {
      const req = new Request("http://localhost:3000/share-target", {
        method: "GET",
      });

      const res = await GET(req);
      expect(res.status).toBe(303);
      expect(res.headers.get("location")).toBe("http://localhost:3000/");
    });
  });
});
