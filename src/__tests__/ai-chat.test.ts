import { describe, it, expect } from "vitest";
import { generateProactiveAlerts } from "@/lib/client-proactive-alerts";
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
    expect(GEMINI_FALLBACK_CHAIN).toContain("gemini-2.5-flash");

    expect(MODEL_FALLBACK_MAP["gemini-2.5-flash"]).toBe("gemini-3.5-flash");
  });
});
