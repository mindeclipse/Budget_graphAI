import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFrom = vi.fn();
const mockVerifySessionToken = vi.fn();
const mockCookies = vi.fn();

vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdmin: () => ({
    from: mockFrom,
  }),
}));

vi.mock("@/lib/session", () => ({
  verifySessionToken: (...args: any[]) => mockVerifySessionToken(...args),
}));

vi.mock("next/headers", () => ({
  cookies: () => mockCookies(),
}));

import { POST as splitHandler } from "@/app/api/transactions/split/route";
import { POST as restoreHandler } from "@/app/api/transactions/restore/route";
import { deleteTransactionRecord } from "@/app/api/transactions/mutations";

describe("Split Transactions: Rollback & Cascade Soft Delete/Restore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockVerifySessionToken.mockResolvedValue({ valid: true });
    mockCookies.mockResolvedValue({
      get: vi.fn().mockReturnValue({ value: "valid-session" }),
    });
  });

  describe("Split Route Rollback (POST /api/transactions/split)", () => {
    it("відкочує статус батьківської транзакції, якщо збереження дочірніх часток зазнало збою", async () => {
      const parentTx = {
        id: 100,
        amount: 300,
        currency: "UAH",
        merchant_raw: "Сільпо",
        category_name: "Продукти",
        source: "manual",
        type: "expense",
        created_at: "2026-09-18T10:00:00Z",
        tags: ["супермаркет"],
        exclude_from_budget: false,
      };

      const updateParentMock = vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      });

      const insertChildrenMock = vi.fn().mockReturnValue({
        select: vi.fn().mockResolvedValue({
          data: null,
          error: new Error("DB Insert Failure: Network timeout"),
        }),
      });

      const rollbackParentMock = vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      });

      const cleanupChildrenMock = vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      });

      let updateCount = 0;
      mockFrom.mockImplementation((table: string) => {
        if (table === "transactions") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: parentTx,
                  error: null,
                }),
              }),
            }),
            update: vi.fn().mockImplementation((data) => {
              updateCount++;
              if (updateCount === 1) {
                // Перший update: позначаємо exclude_from_budget = true
                expect(data.exclude_from_budget).toBe(true);
                expect(data.tags).toContain("розділена");
                return updateParentMock();
              } else {
                // Другий update: ROLLBACK до вихідного стану
                expect(data.exclude_from_budget).toBe(false);
                expect(data.tags).toEqual(["супермаркет"]);
                return rollbackParentMock();
              }
            }),
            insert: insertChildrenMock,
            delete: vi.fn().mockImplementation(() => cleanupChildrenMock()),
          };
        }
        return {};
      });

      const req = new Request("http://localhost/api/transactions/split", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          parent_transaction_id: 100,
          items: [
            { amount: 100, category_name: "Продукти" },
            { amount: 200, category_name: "Побут" },
          ],
        }),
      });

      const res = await splitHandler(req);
      expect(res.status).toBe(500);

      // Перевіряємо, що rollback був викликаний
      expect(updateCount).toBe(2);
      expect(cleanupChildrenMock).toHaveBeenCalled();
    });

    it("успішно розбиває транзакцію, якщо збереження дочірніх часток пройшло без помилок", async () => {
      const parentTx = {
        id: 101,
        amount: 150,
        currency: "UAH",
        merchant_raw: "АТБ",
        category_name: "Продукти",
        source: "manual",
        type: "expense",
        created_at: "2026-09-18T10:00:00Z",
        tags: [],
        exclude_from_budget: false,
      };

      const insertedRows = [
        { id: 201, amount: 50, category_name: "Продукти" },
        { id: 202, amount: 100, category_name: "Напої" },
      ];

      mockFrom.mockImplementation((table: string) => {
        if (table === "transactions") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: parentTx,
                  error: null,
                }),
              }),
            }),
            update: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ error: null }),
            }),
            insert: vi.fn().mockReturnValue({
              select: vi.fn().mockResolvedValue({
                data: insertedRows,
                error: null,
              }),
            }),
          };
        }
        return {};
      });

      const req = new Request("http://localhost/api/transactions/split", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          parent_transaction_id: 101,
          items: [
            { amount: 50, category_name: "Продукти" },
            { amount: 100, category_name: "Напої" },
          ],
        }),
      });

      const res = await splitHandler(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.children).toHaveLength(2);
    });
  });

  describe("Cascade Soft Delete (deleteTransactionRecord)", () => {
    it("каскадно переміщує в кошик дочірні спліти при soft delete батька", async () => {
      const parentUpdateEqMock = vi.fn().mockResolvedValue({ error: null });
      const childUpdateEqMock = vi.fn().mockResolvedValue({ error: null });

      let callIdx = 0;
      const fakeSupabase = {
        from: vi.fn().mockReturnValue({
          update: vi.fn().mockImplementation((payload) => {
            expect(payload.deleted_at).toBeDefined();
            return {
              eq: vi.fn().mockImplementation((col, val) => {
                callIdx++;
                if (col === "id") {
                  expect(val).toBe(55);
                  return parentUpdateEqMock();
                }
                if (col === "parent_transaction_id") {
                  expect(val).toBe(55);
                  return childUpdateEqMock();
                }
              }),
            };
          }),
        }),
      };

      const result = await deleteTransactionRecord(fakeSupabase as any, {
        id: "55",
        permanent: false,
      });

      expect(result).toEqual({ success: true, softDeleted: true });
      expect(callIdx).toBe(2); // Оновлено і id = 55, і parent_transaction_id = 55
    });
  });

  describe("Cascade Restore (POST /api/transactions/restore)", () => {
    it("каскадно відновлює дочірні спліт-транзакції при відновленні батька", async () => {
      const parentRow = {
        id: 77,
        amount: 250,
        merchant_raw: "Епіцентр",
        parent_transaction_id: null,
      };

      const parentRestoreMock = vi.fn().mockResolvedValue({
        data: parentRow,
        error: null,
      });

      const childRestoreMock = vi.fn().mockResolvedValue({
        error: null,
      });

      mockFrom.mockImplementation((table: string) => {
        if (table === "transactions") {
          return {
            update: vi.fn().mockImplementation((payload) => {
              expect(payload.deleted_at).toBeNull();
              return {
                eq: vi.fn().mockImplementation((col, val) => {
                  if (col === "id") {
                    expect(val).toBe(77);
                    return {
                      select: vi.fn().mockReturnValue({
                        maybeSingle: parentRestoreMock,
                      }),
                    };
                  }
                  if (col === "parent_transaction_id") {
                    expect(val).toBe(77);
                    return childRestoreMock();
                  }
                }),
              };
            }),
          };
        }
        return {};
      });

      const req = new Request("http://localhost/api/transactions/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: 77 }),
      });

      const res = await restoreHandler(req as any);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(childRestoreMock).toHaveBeenCalled();
    });

    it("відновлює батьківську транзакцію, якщо користувач відновлює її дочірню частку", async () => {
      const childRow = {
        id: 88,
        amount: 100,
        merchant_raw: "Епіцентр",
        parent_transaction_id: 77,
      };

      const parentRestoreMock = vi.fn().mockResolvedValue({ error: null });

      mockFrom.mockImplementation((table: string) => {
        if (table === "transactions") {
          return {
            update: vi.fn().mockImplementation((payload) => {
              expect(payload.deleted_at).toBeNull();
              return {
                eq: vi.fn().mockImplementation((col, val) => {
                  if (col === "id" && val === 88) {
                    return {
                      select: vi.fn().mockReturnValue({
                        maybeSingle: vi.fn().mockResolvedValue({
                          data: childRow,
                          error: null,
                        }),
                      }),
                    };
                  }
                  if (col === "id" && val === 77) {
                    // Батьківська транзакція відновлюється
                    return parentRestoreMock();
                  }
                  if (col === "parent_transaction_id") {
                    return Promise.resolve({ error: null });
                  }
                }),
              };
            }),
          };
        }
        return {};
      });

      const req = new Request("http://localhost/api/transactions/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: 88 }),
      });

      const res = await restoreHandler(req as any);
      expect(res.status).toBe(200);
      expect(parentRestoreMock).toHaveBeenCalled();
    });
  });
});
