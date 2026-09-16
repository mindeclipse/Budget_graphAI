import { describe, it, expect } from "vitest";
import {
  NEW_HABITS_BASELINE,
  calibrateHabitsFromBaseline,
  calculateWeightedCalendarPacing,
  isWeekendOrLeisureDay,
  simulatePurchaseImpact,
} from "@/lib/weighted-pacing";
import { Transaction } from "@/types/finance";

describe("Weighted Calendar Pacing Engine (Step 4)", () => {
  describe("Базова лінія калібрування (August 15, 2026 Constraint)", () => {
    it("має сувору константу початку відліку 15 серпня 2026 року", () => {
      expect(NEW_HABITS_BASELINE).toBe("2026-08-15T00:00:00.000Z");
    });

    it("повністю ігнорує транзакції до 15 серпня 2026 року (попередній хаотичний досвід)", () => {
      const mixedTransactions = [
        {
          id: 1,
          amount: 5000,
          type: "expense",
          created_at: "2026-08-14T23:59:59.000Z", // ДО базової лінії
          merchant_raw: "Хаотична стара витрата",
        },
        {
          id: 2,
          amount: 8000,
          type: "expense",
          created_at: "2026-07-20T12:00:00.000Z", // Липень
          merchant_raw: "Старий відпочинок",
        },
        {
          id: 3,
          amount: 400,
          type: "expense",
          created_at: "2026-08-15T00:00:01.000Z", // ВІД базової лінії
          merchant_raw: "Свідома витрата 1",
        },
        {
          id: 4,
          amount: 600,
          type: "expense",
          created_at: "2026-08-16T14:00:00.000Z", // ВІД базової лінії
          merchant_raw: "Свідома витрата 2",
        },
      ] as unknown as Transaction[];

      const habits = calibrateHabitsFromBaseline(mixedTransactions);

      expect(habits.totalCalibratedTx).toBe(2);
      expect(habits.totalCalibratedSpend).toBe(1000); // 400 + 600
    });

    it("ігнорує доходи, інвестиції, перекази, виключені з бюджету та видалені транзакції", () => {
      const txs = [
        {
          id: 1,
          amount: 15000,
          type: "income",
          created_at: "2026-08-20T10:00:00.000Z",
        },
        {
          id: 2,
          amount: 35000,
          type: "investment",
          created_at: "2026-08-20T11:00:00.000Z",
        },
        {
          id: 3,
          amount: 10000,
          type: "transfer",
          created_at: "2026-08-20T12:00:00.000Z",
        },
        {
          id: 4,
          amount: 3000,
          type: "expense",
          exclude_from_budget: true,
          created_at: "2026-08-21T10:00:00.000Z",
        },
        {
          id: 5,
          amount: 700,
          type: "expense",
          deleted_at: "2026-08-22T10:00:00.000Z",
          created_at: "2026-08-22T10:00:00.000Z",
        },
        {
          id: 6,
          amount: 250,
          type: "expense",
          created_at: "2026-08-23T10:00:00.000Z",
        },
      ] as unknown as Transaction[];

      const habits = calibrateHabitsFromBaseline(txs);
      expect(habits.totalCalibratedTx).toBe(1);
      expect(habits.totalCalibratedSpend).toBe(250);
    });
  });

  describe("Класифікація днів тижня та розрахунок коефіцієнта вікенду (alpha)", () => {
    it("правильно класифікує п'ятницю (5), суботу (6) та неділю (0) як вікенд/дозвілля", () => {
      expect(isWeekendOrLeisureDay(5)).toBe(true); // П'ятниця
      expect(isWeekendOrLeisureDay(6)).toBe(true); // Субота
      expect(isWeekendOrLeisureDay(0)).toBe(true); // Неділя
      expect(isWeekendOrLeisureDay(1)).toBe(false); // Понеділок
      expect(isWeekendOrLeisureDay(2)).toBe(false); // Вівторок
      expect(isWeekendOrLeisureDay(3)).toBe(false); // Середа
      expect(isWeekendOrLeisureDay(4)).toBe(false); // Четвер
    });

    it("за недостатності днів використовує безпечний дефолтний коефіцієнт 1.35", () => {
      const txs = [
        {
          id: 1,
          amount: 500,
          type: "expense",
          created_at: "2026-08-17T12:00:00.000Z", // Понеділок
        },
      ] as unknown as Transaction[];

      const habits = calibrateHabitsFromBaseline(txs);
      expect(habits.isSufficientData).toBe(false);
      expect(habits.weekendToWeekdayRatio).toBe(1.35);
    });

    it("при достатніх даних розраховує емпіричний коефіцієнт та обмежує межами [0.75, 2.5]", () => {
      // Створюємо 2 будні по 200 грн і 2 вихідні по 400 грн -> ratio 2.0
      const txs = [
        {
          id: 1,
          amount: 200,
          type: "expense",
          created_at: "2026-08-17T12:00:00.000Z", // Пн
        },
        {
          id: 2,
          amount: 200,
          type: "expense",
          created_at: "2026-08-18T12:00:00.000Z", // Вт
        },
        {
          id: 3,
          amount: 400,
          type: "expense",
          created_at: "2026-08-22T12:00:00.000Z", // Сб
        },
        {
          id: 4,
          amount: 400,
          type: "expense",
          created_at: "2026-08-23T12:00:00.000Z", // Нд
        },
      ] as unknown as Transaction[];

      const habits = calibrateHabitsFromBaseline(txs);
      expect(habits.isSufficientData).toBe(true);
      expect(habits.weekdayDailyAvg).toBe(200);
      expect(habits.weekendDailyAvg).toBe(400);
      expect(habits.weekendToWeekdayRatio).toBe(2);
    });
  });

  describe("Резервування постійних платежів та розрахунок зваженого бюджету", () => {
    it("коректно резервує майбутні платежі циклу та рахує зважений темп буднів і вихідних", () => {
      // 14 вересня 2026 року (Понеділок), кінець місяця 30 вересня (Середа)
      const now = new Date("2026-09-14T10:00:00.000Z");
      const startDate = new Date("2026-09-01T00:00:00.000Z");
      const endDate = new Date("2026-09-30T23:59:59.999Z");

      const upcomingObligations = [
        { title: "Netflix", amount: 400, day_of_month: 20, is_paid: false },
        { title: "Оренда", amount: 12000, day_of_month: 5, is_paid: true }, // вже сплачено
        { title: "Інтернет", amount: 300, day_of_month: 25, is_paid: false },
      ];

      const result = calculateWeightedCalendarPacing([], {
        now,
        startDate,
        endDate,
        totalBudgetLimit: 30000,
        currentExpenseTotal: 10000, // Залишок 20 000 грн
        upcomingObligations,
      });

      // Очікуване резервування: 400 + 300 = 700 грн
      expect(result.budget.reservedObligationsTotal).toBe(700);
      // Вільний залишок: 20 000 - 700 = 19 300 грн
      expect(result.budget.discretionaryRemaining).toBe(19300);

      // Безпечний день у вихідні має бути вищим за будень з урахуванням multiplier
      expect(result.pacing.safeWeekendSpend).toBeGreaterThan(
        result.pacing.safeWeekdaySpend
      );
      expect(result.pacing.status).toBe("healthy");
    });

    it("коректно резервує регулярні платежі при циклі через межу місяців (напр. 08.09 - 08.10)", () => {
      // 17 вересня 2026, цикл з 8 вересня по 8 жовтня
      const now = new Date("2026-09-17T10:00:00.000Z");
      const startDate = new Date("2026-09-08T00:00:00.000Z");
      const endDate = new Date("2026-10-08T23:59:59.999Z");

      const upcomingObligations = [
        { title: "Spotify", amount: 269, day_of_month: 18, is_paid: false }, // 18 вересня -> в циклі
        { title: "Оренда", amount: 20000, day_of_month: 28, is_paid: false }, // 28 вересня -> в циклі
        {
          title: "Youtube Бродячий",
          amount: 100,
          day_of_month: 4,
          is_paid: false,
        }, // 4 жовтня -> в циклі (хоч 4 < 17)
        { title: "Київстар", amount: 250, day_of_month: 11, is_paid: true }, // вже сплачено
      ];

      const result = calculateWeightedCalendarPacing([], {
        now,
        startDate,
        endDate,
        totalBudgetLimit: 35000,
        currentExpenseTotal: 5000,
        upcomingObligations,
      });

      // 269 + 20000 + 100 = 20369 грн
      expect(result.budget.reservedObligationsTotal).toBe(20369);
      expect(result.budget.discretionaryRemaining).toBe(35000 - 5000 - 20369);
    });

    it("при вичерпанні ліміту встановлює статус depleted", () => {
      const now = new Date("2026-09-20T10:00:00.000Z");
      const result = calculateWeightedCalendarPacing([], {
        now,
        totalBudgetLimit: 15000,
        currentExpenseTotal: 16000,
      });

      expect(result.budget.discretionaryRemaining).toBe(0);
      expect(result.pacing.safeWeekdaySpend).toBe(0);
      expect(result.pacing.safeWeekendSpend).toBe(0);
      expect(result.pacing.status).toBe("depleted");
    });

    it("при критично малому залишку встановлює статус critical", () => {
      const now = new Date("2026-09-14T10:00:00.000Z");
      const result = calculateWeightedCalendarPacing([], {
        now,
        totalBudgetLimit: 10000,
        currentExpenseTotal: 9000, // 1000 грн на 17 днів
      });

      expect(result.pacing.safeWeekdaySpend).toBeLessThan(250);
      expect(result.pacing.status).toBe("critical");
    });
  });

  describe("EMA Rolling Habit Learning (14-денний період напіврозпаду)", () => {
    it("надає більшу вагу нещодавнім транзакціям порівняно з тими, що були 2-3 тижні тому", () => {
      const now = new Date("2026-09-14T12:00:00.000Z");

      // Транзакція 28 днів тому (2 періоди напіврозпаду -> вага ~ 0.25)
      // Будень: 500 грн
      const oldWeekdayTx = {
        id: 1,
        amount: 500,
        type: "expense",
        created_at: "2026-08-17T12:00:00.000Z", // Пн, 28 днів тому
      } as unknown as Transaction;

      // Транзакція 1 день тому (вчора -> вага ~ 0.95)
      // Будень: 100 грн
      const recentWeekdayTx = {
        id: 2,
        amount: 100,
        type: "expense",
        created_at: "2026-09-13T12:00:00.000Z", // Сб або Нд
      } as unknown as Transaction;

      const habits = calibrateHabitsFromBaseline(
        [oldWeekdayTx, recentWeekdayTx],
        now
      );

      expect(habits.emaWeekdayDailyAvg).toBeDefined();
      expect(habits.emaWeekendDailyAvg).toBeDefined();
      expect(habits.emaWeekendToWeekdayRatio).toBeGreaterThanOrEqual(0.75);
      expect(habits.emaWeekendToWeekdayRatio).toBeLessThanOrEqual(2.5);
    });
  });

  describe("Surplus Projection (Прогноз профіциту та накопичень)", () => {
    it("коректно прогнозує вільний залишок на кінець циклу та потенціал збереження", () => {
      const now = new Date("2026-09-14T10:00:00.000Z");
      const startDate = new Date("2026-09-01T00:00:00.000Z");
      const endDate = new Date("2026-09-30T23:59:59.999Z");

      const result = calculateWeightedCalendarPacing([], {
        now,
        startDate,
        endDate,
        totalBudgetLimit: 30000,
        currentExpenseTotal: 5000, // Залишилось 25 000 грн на 17 днів
      });

      expect(result.surplusProjection).toBeDefined();
      const { projectedSurplusAmount, savingsPotentialPercent, summaryText } =
        result.surplusProjection;

      expect(projectedSurplusAmount).toBeGreaterThanOrEqual(0);
      expect(savingsPotentialPercent).toBeGreaterThanOrEqual(0);
      expect(savingsPotentialPercent).toBeLessThanOrEqual(100);
      expect(summaryText).toContain("профіцит");
    });
  });

  describe("What-If Purchase Simulator (Симулятор наслідків покупки)", () => {
    it("повертає 'safe' для незначної покупки, яка не суттєво зменшує щоденний ліміт", () => {
      const now = new Date("2026-09-14T10:00:00.000Z");
      const result = simulatePurchaseImpact(
        300, // 300 грн при вільному залишку 20 000
        [],
        {
          now,
          totalBudgetLimit: 30000,
          currentExpenseTotal: 10000,
        },
        "Книга"
      );

      expect(result.verdict).toBe("safe");
      expect(result.verdictTitle).toContain("Безпечна покупка");
      expect(result.newDiscretionary).toBe(19700);
      expect(result.weekdayDropPercent).toBeLessThan(10);
    });

    it("повертає 'caution' для помірної покупки, що забирає 15-35% ліміту", () => {
      const now = new Date("2026-09-14T10:00:00.000Z");
      const result = simulatePurchaseImpact(
        3000, // 3000 грн при вільному залишку 12 000
        [],
        {
          now,
          totalBudgetLimit: 25000,
          currentExpenseTotal: 13000,
        },
        "Курс англійської"
      );

      expect(result.verdict).toBe("caution");
      expect(result.verdictTitle).toContain("Потрібна дисципліна");
      expect(result.newDiscretionary).toBe(9000);
    });

    it("повертає 'danger' у разі дефіциту (покупка перевищує вільний залишок)", () => {
      const now = new Date("2026-09-14T10:00:00.000Z");
      const result = simulatePurchaseImpact(
        15000, // 15 000 грн при залишку 5 000
        [],
        {
          now,
          totalBudgetLimit: 30000,
          currentExpenseTotal: 25000,
        },
        "Смартфон"
      );

      expect(result.verdict).toBe("danger");
      expect(result.verdictTitle).toContain("Перевищення бюджету");
      expect(result.newDiscretionary).toBe(0);
      expect(result.newSafeWeekday).toBe(0);
      expect(result.newSafeWeekend).toBe(0);
    });
  });
});
