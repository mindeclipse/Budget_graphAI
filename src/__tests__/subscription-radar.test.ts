import { describe, it, expect } from "vitest";
import {
  detectSubscriptions,
  buildUpcomingSchedule,
} from "@/lib/subscription-radar";
import { Transaction, RecurringItem } from "@/types/finance";

describe("Subscription Radar Engine", () => {
  describe("detectSubscriptions", () => {
    it("виявляє регулярну підписку з інтервалом 30 днів та однаковою сумою", () => {
      const transactions: Transaction[] = [
        {
          id: 1,
          merchant_raw: "Sport Life Gym #45",
          amount: 1200,
          currency: "UAH",
          category_name: "Спорт",
          created_at: "2026-01-10T10:00:00Z",
          source: "monobank",
          type: "expense",
        },
        {
          id: 2,
          merchant_raw: "Sport Life Gym Kyiv",
          amount: 1200,
          currency: "UAH",
          category_name: "Спорт",
          created_at: "2026-02-09T10:00:00Z",
          source: "monobank",
          type: "expense",
        },
        {
          id: 3,
          merchant_raw: "Sport Life Gym",
          amount: 1200,
          currency: "UAH",
          category_name: "Спорт",
          created_at: "2026-03-11T10:00:00Z",
          source: "monobank",
          type: "expense",
        },
      ];

      const detected = detectSubscriptions(transactions);

      expect(detected.length).toBe(1);
      expect(detected[0].amount).toBe(1200);
      expect(detected[0].currency).toBe("UAH");
      expect(detected[0].confidence).toBe("high");
      expect(detected[0].occurrences_count).toBe(3);
    });

    it("виявляє відомі сервіси підписок (наприклад Netflix) за евристикою", () => {
      const transactions: Transaction[] = [
        {
          id: 10,
          merchant_raw: "Netflix.com Amsterdam NL",
          amount: 390,
          currency: "UAH",
          category_name: "Розваги",
          created_at: "2026-02-15T12:00:00Z",
          source: "monobank",
          type: "expense",
        },
      ];

      const detected = detectSubscriptions(transactions);

      expect(detected.length).toBe(1);
      expect(detected[0].title).toBe("Netflix");
      expect(detected[0].category_name).toBe("Підписки та сервіси");
      expect(detected[0].amount).toBe(390);
    });

    it("ігнорує підписки, які вже додані в templates", () => {
      const transactions: Transaction[] = [
        {
          id: 20,
          merchant_raw: "Spotify AB",
          amount: 149,
          currency: "UAH",
          category_name: "Розваги",
          created_at: "2026-02-01T10:00:00Z",
          source: "monobank",
          type: "expense",
        },
      ];

      const existingTemplates: RecurringItem[] = [
        {
          id: 1,
          title: "Spotify",
          amount: 149,
          currency: "UAH",
          category_name: "Підписки та сервіси",
          day_of_month: 1,
          is_active: true,
        },
      ];

      const detected = detectSubscriptions(transactions, existingTemplates);
      expect(detected.length).toBe(0);
    });

    it("ігнорує відхилені користувачем підписки (dismissed)", () => {
      const transactions: Transaction[] = [
        {
          id: 30,
          merchant_raw: "YouTube Premium",
          amount: 149,
          currency: "UAH",
          category_name: "Підписки та сервіси",
          created_at: "2026-02-05T10:00:00Z",
          source: "monobank",
          type: "expense",
        },
      ];

      const dismissed = ["radar-youtube premium-149-uah"];
      const detected = detectSubscriptions(transactions, [], dismissed);
      expect(detected.length).toBe(0);
    });

    it("надійно блокує повернення підписки навіть якщо сума змінилася (по мерчанту)", () => {
      const transactions: Transaction[] = [
        {
          id: 31,
          merchant_raw: "Megogo",
          amount: 199, // нова сума (раніше було 149)
          currency: "UAH",
          category_name: "Підписки та сервіси",
          created_at: "2026-02-05T10:00:00Z",
          source: "monobank",
          type: "expense",
        },
      ];

      // Користувач відхилив стару сигнатуру 149 грн або просто назву мерчанта
      const dismissedWithOldAmount = ["radar-megogo-149-uah"];
      const detected1 = detectSubscriptions(
        transactions,
        [],
        dismissedWithOldAmount
      );
      expect(detected1.length).toBe(0);

      const dismissedByCleanName = ["megogo"];
      const detected2 = detectSubscriptions(
        transactions,
        [],
        dismissedByCleanName
      );
      expect(detected2.length).toBe(0);
    });

    it("ігнорує доходи, інвестиції та випадкові разові витрати", () => {
      const transactions: Transaction[] = [
        {
          id: 40,
          merchant_raw: "Зарплата",
          amount: 50000,
          currency: "UAH",
          category_name: "Дохід",
          created_at: "2026-02-01T10:00:00Z",
          source: "manual",
          type: "income",
        },
        {
          id: 41,
          merchant_raw: "ОВДП Купівля",
          amount: 20000,
          currency: "UAH",
          category_name: "Інвестиції",
          created_at: "2026-02-05T10:00:00Z",
          source: "manual",
          type: "investment",
        },
        {
          id: 42,
          merchant_raw: "Сільпо #123",
          amount: 543,
          currency: "UAH",
          category_name: "Продукти",
          created_at: "2026-02-07T14:00:00Z",
          source: "monobank",
          type: "expense",
        },
      ];

      const detected = detectSubscriptions(transactions);
      expect(detected.length).toBe(0);
    });
  });

  describe("buildUpcomingSchedule", () => {
    const templates: RecurringItem[] = [
      {
        id: 1,
        title: "Netflix",
        amount: 390,
        currency: "UAH",
        category_name: "Підписки та сервіси",
        day_of_month: 5,
        is_active: true,
      },
      {
        id: 2,
        title: "ChatGPT Plus",
        amount: 20,
        currency: "USD",
        category_name: "Підписки та сервіси",
        day_of_month: 15,
        is_active: true,
      },
      {
        id: 3,
        title: "Оренда паркомісця",
        amount: 2500,
        currency: "UAH",
        category_name: "Авто",
        day_of_month: 25,
        is_active: true,
      },
    ];

    it("коректно визначає статус paid, due_today та upcoming", () => {
      // Референсна дата: 15 березня 2026
      const referenceDate = new Date(2026, 2, 15); // Month is 0-indexed: 2 = March

      const currentMonthTransactions: Transaction[] = [
        {
          id: 101,
          merchant_raw: "Netflix.com",
          amount: 390,
          currency: "UAH",
          category_name: "Підписки та сервіси",
          created_at: "2026-03-05T10:00:00Z",
          source: "monobank",
          type: "expense",
        },
      ];

      const { upcoming, metrics } = buildUpcomingSchedule(
        templates,
        currentMonthTransactions,
        42.0, // USD rate
        referenceDate
      );

      const netflix = upcoming.find((u) => u.title === "Netflix")!;
      const chatGpt = upcoming.find((u) => u.title === "ChatGPT Plus")!;
      const parking = upcoming.find((u) => u.title === "Оренда паркомісця")!;

      expect(netflix.status).toBe("paid");
      expect(chatGpt.status).toBe("due_today");
      expect(chatGpt.days_remaining).toBe(0);
      expect(parking.status).toBe("upcoming");
      expect(parking.days_remaining).toBe(10); // 25 - 15 = 10 days

      // ChatGPT Plus: 20 USD * 42 = 840 UAH
      // Monthly Total: 390 + 840 + 2500 = 3730 UAH
      expect(metrics.monthly_total).toBe(3730);
      expect(metrics.annual_total).toBe(3730 * 12);
      expect(metrics.paid_this_month).toBe(390);
      expect(metrics.remaining_this_month).toBe(840 + 2500);
    });

    it("визначає overdue, якщо день платежу минув і платіж не зафіксовано", () => {
      // Референсна дата: 20 березня 2026
      const referenceDate = new Date(2026, 2, 20);

      const { upcoming } = buildUpcomingSchedule(
        templates,
        [], // Жодних транзакцій
        42.0,
        referenceDate
      );

      const netflix = upcoming.find((u) => u.title === "Netflix")!;
      expect(netflix.status).toBe("overdue");
      expect(netflix.days_remaining).toBe(-15); // 5 - 20 = -15
    });

    it("завчасне проведення підписки (Київстар заплановано на 11-е, проведено 10-го числа): статус paid, days_remaining 0, опускається в кінець", () => {
      const kyivstarTemplate: RecurringItem = {
        id: 77,
        title: "Київстар",
        amount: 250,
        currency: "UAH",
        category_name: "Підписки та сервіси",
        day_of_month: 11,
        is_active: true,
      };

      const spotifyTemplate: RecurringItem = {
        id: 88,
        title: "Spotify",
        amount: 260,
        currency: "UAH",
        category_name: "Підписки та сервіси",
        day_of_month: 18,
        is_active: true,
      };

      // Сьогодні 10 вересня 2026 (за 1 день до планової дати 11 вересня)
      const referenceDate = new Date(2026, 8, 10); // 8 = September

      // Користувач завчасно провів платіж 10 вересня
      const executedTransactions: Transaction[] = [
        {
          id: 501,
          merchant_raw: "Київстар",
          amount: 250,
          currency: "UAH",
          category_name: "Підписки та сервіси",
          created_at: "2026-09-10T14:30:00Z",
          source: "recurring",
          type: "expense",
          metadata: {
            recurring_id: 77,
          },
        },
      ];

      const { upcoming, metrics } = buildUpcomingSchedule(
        [kyivstarTemplate, spotifyTemplate],
        executedTransactions,
        41.5,
        referenceDate
      );

      const kyivstar = upcoming.find((u) => u.id === 77)!;
      const spotify = upcoming.find((u) => u.id === 88)!;

      // Перевіряємо, що Київстар визнано сплаченим
      expect(kyivstar.status).toBe("paid");
      expect(kyivstar.days_remaining).toBe(0); // НЕ "Через 1 дн."!

      // Spotify залишається майбутнім
      expect(spotify.status).toBe("upcoming");
      expect(spotify.days_remaining).toBe(8); // 18 - 10 = 8

      // Перевіряємо порядок у списку: не оплачений Spotify перший, оплачений Київстар — внизу!
      expect(upcoming[0].id).toBe(88); // Spotify
      expect(upcoming[1].id).toBe(77); // Київстар (опустився вниз!)

      // Метрики
      expect(metrics.paid_this_month).toBe(250);
      expect(metrics.remaining_this_month).toBe(260);
    });

    it("зіставляє транзакцію за metadata.recurring_id навіть якщо користувач ввів іншу назву мерчанта", () => {
      const template: RecurringItem = {
        id: 99,
        title: "Apple iCloud",
        amount: 120,
        currency: "UAH",
        category_name: "Підписки та сервіси",
        day_of_month: 26,
        is_active: true,
      };

      const transactions: Transaction[] = [
        {
          id: 502,
          merchant_raw: "Оплата за хмару через термінал", // відмінна назва
          amount: 120,
          currency: "UAH",
          category_name: "Підписки та сервіси",
          created_at: "2026-09-10T15:00:00Z",
          source: "recurring",
          type: "expense",
          metadata: {
            recurring_id: 99,
          },
        },
      ];

      const { upcoming } = buildUpcomingSchedule(
        [template],
        transactions,
        41.5,
        new Date(2026, 8, 10)
      );

      expect(upcoming[0].status).toBe("paid");
      expect(upcoming[0].days_remaining).toBe(0);
    });
  });
});
