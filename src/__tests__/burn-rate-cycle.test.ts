import { describe, it, expect } from "vitest";
import { calculateBurnRateData } from "@/components/dashboard/BurnRateChart";

describe("Burn Rate Chart Cycle Calculations", () => {
  it("correctly calculates cycle days and aggregates transactions across month boundary", () => {
    // Cycle starts Feb 25, 2026, ends Mar 27, 2026 (30 days)
    const activeCycle = {
      id: "cycle-1",
      name: "Лютий-Березень 2026",
      start_date: "2026-02-25T00:00:00.000Z",
      end_date: "2026-03-27T00:00:00.000Z",
      budget_limit: 30000,
      is_active: true,
    };

    // Current date is Mar 2, 2026:
    // Day 1: Feb 25
    // Day 2: Feb 26
    // Day 3: Feb 27
    // Day 4: Feb 28
    // Day 5: Mar 1
    // Day 6: Mar 2 (today)
    const currentDate = new Date(2026, 2, 2); // Month index 2 is March

    const transactions = [
      {
        id: "tx-1",
        amount: 500,
        created_at: "2026-02-26T12:00:00.000Z", // Day 2
        type: "expense",
      },
      {
        id: "tx-2",
        amount: 750,
        created_at: "2026-03-02T15:00:00.000Z", // Day 6
        type: "expense",
      },
      {
        id: "tx-3",
        amount: 200,
        created_at: "2026-03-02T18:00:00.000Z", // Day 6
        type: "expense",
        exclude_from_budget: true, // Should be ignored
      },
      {
        id: "tx-4",
        amount: 10000,
        created_at: "2026-03-01T10:00:00.000Z", // Day 5
        type: "income", // Should be ignored
      },
    ];

    const result = calculateBurnRateData({
      transactions,
      budgetLimit: 30000,
      selectedMonthKey: "2026-03",
      activeCycle,
      currentDate,
    });

    expect(result.isCycleMode).toBe(true);
    expect(result.totalDays).toBe(30);
    expect(result.currentDay).toBe(6);
    expect(result.runningTotal).toBe(1250); // 500 + 750

    // Day 1: 0 actual
    expect(result.data[0].day).toBe(1);
    expect(result.data[0].actual).toBe(0);

    // Day 2: 500 actual
    expect(result.data[1].day).toBe(2);
    expect(result.data[1].actual).toBe(500);

    // Day 5: 500 actual (unchanged since tx-4 was income)
    expect(result.data[4].day).toBe(5);
    expect(result.data[4].actual).toBe(500);

    // Day 6: 1250 actual (500 + 750, tx-3 excluded)
    expect(result.data[5].day).toBe(6);
    expect(result.data[5].actual).toBe(1250);

    // Day 7: null (future in cycle)
    expect(result.data[6].day).toBe(7);
    expect(result.data[6].actual).toBeNull();
  });

  it("handles recurring subscriptions on their matching cycle calendar day", () => {
    const activeCycle = {
      id: "cycle-sub",
      name: "Цикл з підпискою",
      start_date: "2026-02-25T00:00:00.000Z",
      end_date: "2026-03-27T00:00:00.000Z",
      budget_limit: 20000,
      is_active: true,
    };

    // Subscription drops on the 1st of the month (Mar 1 -> Day 5 of the cycle)
    const recurring = [
      {
        id: "sub-1",
        title: "Оренда",
        amount: 5000,
        day_of_month: 1,
        currency: "UAH",
        is_active: true,
      },
    ];

    const currentDate = new Date(2026, 2, 5); // Mar 5, 2026 (Day 9)

    const result = calculateBurnRateData({
      transactions: [],
      budgetLimit: 20000,
      recurringTotal: 5000,
      selectedMonthKey: "2026-03",
      recurring,
      activeCycle,
      currentDate,
    });

    // Day 4 (Feb 28): dropToday is 0
    expect(result.data[3].dropToday).toBe(0);

    // Day 5 (Mar 1): dropToday is 5000
    expect(result.data[4].dropToday).toBe(5000);

    // The ideal pace on day 5 jumps due to the subscription scheduled on Mar 1
    expect(result.data[4].ideal).toBeGreaterThan(result.data[3].ideal + 1000);
  });

  it("falls back cleanly to calendar month when activeCycle is null", () => {
    const currentDate = new Date(2026, 2, 15); // Mar 15, 2026 (March has 31 days)

    const transactions = [
      {
        id: "tx-cal-1",
        amount: 400,
        created_at: "2026-03-05T10:00:00.000Z",
        type: "expense",
      },
      {
        id: "tx-cal-2",
        amount: 600,
        created_at: "2026-03-10T12:00:00.000Z",
        type: "expense",
      },
    ];

    const result = calculateBurnRateData({
      transactions,
      budgetLimit: 25000,
      selectedMonthKey: "2026-03",
      activeCycle: null,
      currentDate,
    });

    expect(result.isCycleMode).toBe(false);
    expect(result.totalDays).toBe(31);
    expect(result.currentDay).toBe(15);
    expect(result.runningTotal).toBe(1000);
    expect(result.data.length).toBe(31);
    expect(result.data[4].day).toBe(5); // Day 5
    expect(result.data[4].actual).toBe(400);
    expect(result.data[9].day).toBe(10); // Day 10
    expect(result.data[9].actual).toBe(1000);
    expect(result.data[15].actual).toBeNull(); // Day 16 is future
  });

  it("falls back cleanly to calendar month when viewing archive month even if activeCycle exists", () => {
    const currentDate = new Date(2026, 2, 15); // Today is March 2026

    const activeCycle = {
      id: "cycle-active",
      name: "Поточний Березень",
      start_date: "2026-03-01T00:00:00.000Z",
      budget_limit: 30000,
      is_active: true,
    };

    // User selected January 2026 (archive month)
    const result = calculateBurnRateData({
      transactions: [
        {
          id: "tx-archive",
          amount: 800,
          created_at: "2026-01-10T10:00:00.000Z",
          type: "expense",
        },
      ],
      budgetLimit: 20000,
      selectedMonthKey: "2026-01",
      activeCycle,
      currentDate,
    });

    // For archive month, isCurrentMonth is false, so it falls back to full calendar month
    expect(result.isCycleMode).toBe(false);
    expect(result.totalDays).toBe(31); // January has 31 days
    expect(result.currentDay).toBe(31); // Past month is complete
    expect(result.runningTotal).toBe(800);
    expect(result.data[30].actual).toBe(800); // Last day has actual filled
  });
});
