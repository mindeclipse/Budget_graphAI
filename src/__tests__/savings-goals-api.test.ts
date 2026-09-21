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

import { GET, POST, PATCH, PUT, DELETE } from "@/app/api/savings-goals/route";

describe("/api/savings-goals API Route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("PATCH /api/savings-goals", () => {
    it("відхиляє 401 для неавторизованого користувача", async () => {
      mockCookieGet.mockReturnValue(undefined);
      mockVerifySessionToken.mockResolvedValue({ valid: false });

      const req = new Request("http://localhost/api/savings-goals", {
        method: "PATCH",
        body: JSON.stringify({ id: 1, current_amount: 1058.08 }),
      });

      const res = await PATCH(req);
      expect(res.status).toBe(401);
    });

    it("успішно оновлює поточну суму збережень (current_amount)", async () => {
      mockCookieGet.mockReturnValue({ value: "valid_session" });
      mockVerifySessionToken.mockResolvedValue({ valid: true });

      const updatedGoal = {
        id: 1,
        name: "Фінансова подушка",
        current_amount: 1058.08,
        target_amount: null,
        currency: "UAH",
        target_date: null,
      };

      mockSingle.mockResolvedValue({ data: updatedGoal, error: null });
      mockSelect.mockReturnValue({ single: mockSingle });
      mockEq.mockReturnValue({ select: mockSelect });
      mockUpdate.mockReturnValue({ eq: mockEq });
      mockFrom.mockReturnValue({ update: mockUpdate });

      const req = new Request("http://localhost/api/savings-goals", {
        method: "PATCH",
        body: JSON.stringify({
          id: 1,
          name: "Фінансова подушка",
          current_amount: 1058.08,
          target_amount: null,
          currency: "UAH",
          target_date: null,
        }),
      });

      const res = await PATCH(req);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.goal.current_amount).toBe(1058.08);

      expect(mockFrom).toHaveBeenCalledWith("savings_goals");
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          current_amount: 1058.08,
        })
      );
      expect(mockEq).toHaveBeenCalledWith("id", 1);
    });
  });

  describe("PUT /api/savings-goals", () => {
    it("працює як аліас до PATCH та успішно зберігає зміну суми скарбнички", async () => {
      mockCookieGet.mockReturnValue({ value: "valid_session" });
      mockVerifySessionToken.mockResolvedValue({ valid: true });

      const updatedGoal = {
        id: 2,
        name: "Фінансова подушка",
        current_amount: 1058.08,
        target_amount: null,
        currency: "UAH",
        target_date: null,
      };

      mockSingle.mockResolvedValue({ data: updatedGoal, error: null });
      mockSelect.mockReturnValue({ single: mockSingle });
      mockEq.mockReturnValue({ select: mockSelect });
      mockUpdate.mockReturnValue({ eq: mockEq });
      mockFrom.mockReturnValue({ update: mockUpdate });

      const req = new Request("http://localhost/api/savings-goals", {
        method: "PUT",
        body: JSON.stringify({
          id: 2,
          name: "Фінансова подушка",
          current_amount: 1058.08,
          target_amount: null,
          currency: "UAH",
          target_date: null,
        }),
      });

      const res = await PUT(req);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.goal.current_amount).toBe(1058.08);
    });

    it("відхиляє некоректні дані (наприклад, валідація від'ємної суми)", async () => {
      mockCookieGet.mockReturnValue({ value: "valid_session" });
      mockVerifySessionToken.mockResolvedValue({ valid: true });

      const req = new Request("http://localhost/api/savings-goals", {
        method: "PUT",
        body: JSON.stringify({
          id: 2,
          current_amount: -100,
        }),
      });

      const res = await PUT(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe("Validation failed");
    });
  });
});
