import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock cookies
const mockCookieGet = vi.fn();
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: mockCookieGet,
  }),
}));

// Mock verifySessionToken
const mockVerifySessionToken = vi.fn();
vi.mock("@/lib/session", () => ({
  verifySessionToken: (token?: string) => mockVerifySessionToken(token),
}));

// Mock Supabase
const mockSelect = vi.fn();
const mockOrder = vi.fn();
const mockInsert = vi.fn();
const mockUpdate = vi.fn();
const mockDelete = vi.fn();
const mockEq = vi.fn();
const mockSingle = vi.fn();
const mockFrom = vi.fn();

vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdmin: () => ({
    from: mockFrom,
  }),
}));

import { GET, POST, PATCH, DELETE } from "@/app/api/recurring/route";

describe("/api/recurring API Handlers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("GET /api/recurring", () => {
    it("відхиляє запит зі статусом 401, якщо сесія невалідна", async () => {
      mockCookieGet.mockReturnValue(undefined);
      mockVerifySessionToken.mockResolvedValue({ valid: false });

      const res = await GET();
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.error).toBe("Unauthorized");
    });

    it("успішно повертає список постійних витрат із точною проєкцією колонок та Cache-Control", async () => {
      mockCookieGet.mockReturnValue({ value: "session_token" });
      mockVerifySessionToken.mockResolvedValue({ valid: true });

      const mockData = [
        {
          id: 1,
          title: "Netflix",
          amount: 400,
          currency: "UAH",
          category_name: "Підписки та сервіси",
          day_of_month: 5,
          is_active: true,
          created_at: "2026-09-01T00:00:00.000Z",
        },
      ];

      mockOrder.mockResolvedValue({ data: mockData, error: null });
      mockSelect.mockReturnValue({ order: mockOrder });
      mockFrom.mockReturnValue({ select: mockSelect });

      const res = await GET();
      expect(res.status).toBe(200);

      expect(mockFrom).toHaveBeenCalledWith("recurring_templates");
      // Перевіряємо, що у select запитуються саме реальні колонки таблиці (title, currency, category_name)
      expect(mockSelect).toHaveBeenCalledWith(
        "id, title, amount, currency, category_name, day_of_month, is_active, created_at"
      );
      expect(mockOrder).toHaveBeenCalledWith("day_of_month", {
        ascending: true,
      });

      // Перевіряємо Cache-Control заголовок
      expect(res.headers.get("Cache-Control")).toBe(
        "private, max-age=60, stale-while-revalidate=300"
      );

      const json = await res.json();
      expect(json.items).toEqual(mockData);
    });

    it("повертає 500, якщо база даних викинула помилку", async () => {
      mockCookieGet.mockReturnValue({ value: "session_token" });
      mockVerifySessionToken.mockResolvedValue({ valid: true });

      mockOrder.mockResolvedValue({
        data: null,
        error: new Error("DB Query Error"),
      });
      mockSelect.mockReturnValue({ order: mockOrder });
      mockFrom.mockReturnValue({ select: mockSelect });

      const res = await GET();
      expect(res.status).toBe(500);
      const json = await res.json();
      expect(json.error).toBeDefined();
    });
  });

  describe("POST /api/recurring", () => {
    it("відхиляє 401 для неавторизованого запиту", async () => {
      mockCookieGet.mockReturnValue(undefined);
      mockVerifySessionToken.mockResolvedValue({ valid: false });

      const req = new Request("http://localhost/api/recurring", {
        method: "POST",
        body: JSON.stringify({}),
      });

      const res = await POST(req);
      expect(res.status).toBe(401);
    });

    it("відхиляє 400, якщо валідація Zod не пройшла", async () => {
      mockCookieGet.mockReturnValue({ value: "valid" });
      mockVerifySessionToken.mockResolvedValue({ valid: true });

      const req = new Request("http://localhost/api/recurring", {
        method: "POST",
        body: JSON.stringify({
          title: "", // порожня назва
          amount: -50, // від'ємна сума
        }),
      });

      const res = await POST(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe("Validation failed");
    });

    it("успішно створює новий шаблон витрати", async () => {
      mockCookieGet.mockReturnValue({ value: "valid" });
      mockVerifySessionToken.mockResolvedValue({ valid: true });

      const validPayload = {
        title: "Spotify",
        amount: 150,
        currency: "UAH",
        category_name: "Підписки та сервіси",
        day_of_month: 10,
        is_active: true,
      };

      const createdItem = { id: 2, ...validPayload };
      mockSingle.mockResolvedValue({ data: createdItem, error: null });
      mockSelect.mockReturnValue({ single: mockSingle });
      mockInsert.mockReturnValue({ select: mockSelect });
      mockFrom.mockReturnValue({ insert: mockInsert });

      const req = new Request("http://localhost/api/recurring", {
        method: "POST",
        body: JSON.stringify(validPayload),
      });

      const res = await POST(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.item).toEqual(createdItem);
    });
  });

  describe("PATCH /api/recurring", () => {
    it("відхиляє 400 при відсутності ID для оновлення", async () => {
      mockCookieGet.mockReturnValue({ value: "valid" });
      mockVerifySessionToken.mockResolvedValue({ valid: true });

      const req = new Request("http://localhost/api/recurring", {
        method: "PATCH",
        body: JSON.stringify({
          amount: 500,
        }),
      });

      const res = await PATCH(req);
      expect(res.status).toBe(400);
    });

    it("успішно оновлює існуючий шаблон", async () => {
      mockCookieGet.mockReturnValue({ value: "valid" });
      mockVerifySessionToken.mockResolvedValue({ valid: true });

      mockEq.mockResolvedValue({ error: null });
      mockUpdate.mockReturnValue({ eq: mockEq });
      mockFrom.mockReturnValue({ update: mockUpdate });

      const req = new Request("http://localhost/api/recurring", {
        method: "PATCH",
        body: JSON.stringify({
          id: 5,
          amount: 600,
        }),
      });

      const res = await PATCH(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(mockEq).toHaveBeenCalledWith("id", 5);
    });
  });

  describe("DELETE /api/recurring", () => {
    it("відхиляє 400, якщо не передано валідний числовий ID", async () => {
      mockCookieGet.mockReturnValue({ value: "valid" });
      mockVerifySessionToken.mockResolvedValue({ valid: true });

      const req = new Request("http://localhost/api/recurring?id=abc", {
        method: "DELETE",
      });

      const res = await DELETE(req);
      expect(res.status).toBe(400);
    });

    it("успішно видаляє шаблон за id", async () => {
      mockCookieGet.mockReturnValue({ value: "valid" });
      mockVerifySessionToken.mockResolvedValue({ valid: true });

      mockEq.mockResolvedValue({ error: null });
      mockDelete.mockReturnValue({ eq: mockEq });
      mockFrom.mockReturnValue({ delete: mockDelete });

      const req = new Request("http://localhost/api/recurring?id=7", {
        method: "DELETE",
      });

      const res = await DELETE(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(mockEq).toHaveBeenCalledWith("id", 7);
    });
  });
});
