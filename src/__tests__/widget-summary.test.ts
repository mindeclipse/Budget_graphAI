import { describe, it, expect } from "vitest";
import { timingSafeEqual } from "@/lib/security";

describe("iOS Scriptable Widget Summary Logic", () => {
  describe("Розрахунок статусу денного темпу (Pace Status)", () => {
    const calculatePaceStatus = (
      todaySpent: number,
      safeDailySpend: number
    ): "on_track" | "warning" | "exceeded" => {
      if (safeDailySpend > 0) {
        if (todaySpent > safeDailySpend) {
          return "exceeded";
        } else if (todaySpent >= safeDailySpend * 0.85) {
          return "warning";
        }
        return "on_track";
      }
      return todaySpent > 0 ? "exceeded" : "on_track";
    };

    it("визначає статус 'on_track' (зелений), коли витрати в межах норми (<85%)", () => {
      const safeDailySpend = 600;
      const todaySpent = 350; // ~58%
      expect(calculatePaceStatus(todaySpent, safeDailySpend)).toBe("on_track");
    });

    it("визначає статус 'warning' (жовтий), коли витрати наближаються до ліміту (85-100%)", () => {
      const safeDailySpend = 600;
      const todaySpent = 520; // 86.6%
      expect(calculatePaceStatus(todaySpent, safeDailySpend)).toBe("warning");
    });

    it("визначає статус 'exceeded' (червоний), коли денну норму перевищено (>100%)", () => {
      const safeDailySpend = 600;
      const todaySpent = 750; // 125%
      expect(calculatePaceStatus(todaySpent, safeDailySpend)).toBe("exceeded");
    });

    it("коректно обробляє нульовий ліміт", () => {
      expect(calculatePaceStatus(0, 0)).toBe("on_track");
      expect(calculatePaceStatus(50, 0)).toBe("exceeded");
    });
  });

  describe("Розрахунок залишку на день та безпечного темпу", () => {
    it("розраховує сьогоднішній залишок і не опускає його нижче 0", () => {
      const safeDaily = 500;
      const spent1 = 200;
      const remaining1 = Math.max(0, safeDaily - spent1);
      expect(remaining1).toBe(300);

      const spentOver = 650;
      const remainingOver = Math.max(0, safeDaily - spentOver);
      expect(remainingOver).toBe(0);
    });

    it("розраховує безпечний щоденний темп із залишку циклу", () => {
      const cycleRemainingBudget = 6500;
      const daysRemaining = 10;
      const safeDaily = Math.max(
        0,
        Math.round(cycleRemainingBudget / Math.max(1, daysRemaining))
      );
      expect(safeDaily).toBe(650);
    });
  });

  describe("Безпека авторизації Bearer токена", () => {
    it("успішно підтверджує коректний Bearer токен через timingSafeEqual", () => {
      const secret = "super_secret_widget_key_999";
      const header = `Bearer ${secret}`;

      expect(timingSafeEqual(header, `Bearer ${secret}`)).toBe(true);
    });

    it("відхиляє некоректний або підроблений токен", () => {
      const secret = "super_secret_widget_key_999";
      const fakeHeader = "Bearer wrong_secret_key";

      expect(timingSafeEqual(fakeHeader, `Bearer ${secret}`)).toBe(false);
    });
  });
});
