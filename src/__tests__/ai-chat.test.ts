import { describe, it, expect } from "vitest";
import {
  generateProactiveAlerts,
  generateDynamicQuickPrompts,
} from "@/lib/client-proactive-alerts";
import { GEMINI_FALLBACK_CHAIN, MODEL_FALLBACK_MAP } from "@/lib/gemini";

describe("AI Advisor & Proactive Alerts", () => {
  it("генерує критичний алерт, якщо темп витрат небезпечний або денний ліміт низький", () => {
    const alerts = generateProactiveAlerts({
      budgetMetrics: {
        remaining: 500,
        safeDailySpend: 50,
        daysRemaining: 10,
        exactPercent: 95,
        status: "danger",
      },
      categoryStats: [{ name: "Продукти", amount: 1500, percentage: 60 }],
      categoryBudgets: {},
    });

    const paceAlert = alerts.find((a) => a.type === "pace");
    expect(paceAlert).toBeDefined();
    expect(paceAlert?.severity).toBe("critical");
    expect(paceAlert?.title).toContain("Критичний темп");
  });

  it("генерує алерт перевищення ліміту категорії", () => {
    const alerts = generateProactiveAlerts({
      budgetMetrics: {
        remaining: 15000,
        safeDailySpend: 1500,
        daysRemaining: 10,
        exactPercent: 50,
        status: "healthy",
      },
      categoryStats: [
        { name: "Кафе та ресторани", amount: 4500, percentage: 30 },
      ],
      categoryBudgets: {
        "Кафе та ресторани": 3000,
      },
    });

    const catAlert = alerts.find((a) => a.type === "category");
    expect(catAlert).toBeDefined();
    expect(catAlert?.title).toContain("Кафе та ресторани");
    expect(catAlert?.description).toContain("4500");
  });

  it("генерує алерт наближення підписки, якщо платіж сьогодні", () => {
    const alerts = generateProactiveAlerts({
      budgetMetrics: {
        remaining: 10000,
        safeDailySpend: 1000,
        daysRemaining: 10,
        exactPercent: 40,
        status: "healthy",
      },
      categoryStats: [],
      categoryBudgets: {},
      radarUpcoming: [
        {
          id: 1,
          title: "Netflix",
          amount: 390,
          days_remaining: 0,
          status: "due_today",
        },
      ],
    });

    const subAlert = alerts.find((a) => a.type === "subscription");
    expect(subAlert).toBeDefined();
    expect(subAlert?.title).toContain("Netflix");
    expect(subAlert?.description).toContain("390");
  });

  it("містить правильний ланцюжок відмовостійкості моделей Gemini", () => {
    expect(GEMINI_FALLBACK_CHAIN).toContain("gemini-3.5-flash");
    expect(GEMINI_FALLBACK_CHAIN).toContain("gemini-3.5-flash-lite");
    expect(GEMINI_FALLBACK_CHAIN).toContain("gemini-3.7-flash");
    expect(GEMINI_FALLBACK_CHAIN).not.toContain("gemini-2.5-flash");

    expect(MODEL_FALLBACK_MAP["gemini-3.5-flash"]).toBe("gemini-3.7-flash");
    expect(MODEL_FALLBACK_MAP["gemini-3.5-flash-lite"]).toBe(
      "gemini-3.5-flash"
    );
  });

  it("генерує динамічні запитання для нормального бюджету", () => {
    const prompts = generateDynamicQuickPrompts({
      remaining: 10000,
      safeDailySpend: 500,
      daysRemaining: 10,
      status: "healthy",
      topCategoryName: "Продукти",
      upcomingSubscription: {
        title: "Spotify",
        amount: 6.49,
        currency: "USD",
        daysRemaining: 12,
      },
    });

    expect(prompts).toContain("Чи вкладаюсь я в бюджет?");
    expect(prompts).toContain("Скільки можу витратити на вихідних?");
    expect(prompts).toContain('Як оптимізувати категорію "Продукти"?');
  });

  it("генерує запитання про доживання до кінця циклу при критичному залишку", () => {
    const prompts = generateDynamicQuickPrompts({
      remaining: 200,
      safeDailySpend: 50,
      daysRemaining: 5,
      status: "danger",
      topCategoryName: "Кафе та ресторани",
    });

    expect(prompts).toContain("Як дожити до кінця циклу без дефіциту?");
    expect(prompts).toContain('Як оптимізувати категорію "Кафе та ресторани"?');
  });

  it("генерує цільове запитання про підписку, якщо списання незабаром (<= 7 днів)", () => {
    const prompts = generateDynamicQuickPrompts({
      remaining: 5000,
      safeDailySpend: 400,
      daysRemaining: 8,
      status: "healthy",
      upcomingSubscription: {
        title: "Netflix",
        amount: 390,
        currency: "UAH",
        daysRemaining: 2,
      },
      wishlistCount: 2,
    });

    expect(prompts.some((p) => p.includes("Netflix (390 ₴)"))).toBe(true);
    expect(prompts).toContain("Чи можу дозволити покупку з вішліста?");
  });
});
