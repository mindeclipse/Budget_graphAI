import { describe, it, expect } from "vitest";
import {
  parseDateInputToIso,
  formatIsoToDisplayDate,
  parseFlexibleNumber,
  sortInvestments,
  calculateTotalCoupons,
  calculateReceivedCoupons,
  calculateAssetPnl,
  isAssetArchived,
} from "@/components/dashboard/InvestmentsCard";
import { InvestmentAsset } from "@/types/finance";

describe("InvestmentsCard helpers", () => {
  describe("parseDateInputToIso", () => {
    it("парсить формат ДД.ММ.РРРР в ISO YYYY-MM-DD", () => {
      expect(parseDateInputToIso("25.04.2028")).toBe("2028-04-25");
      expect(parseDateInputToIso("01.12.2026")).toBe("2026-12-01");
      expect(parseDateInputToIso("5.4.2027")).toBe("2027-04-05");
    });

    it("підтримує розділювачі скісної риски та дефіса (ДД/ММ/РРРР)", () => {
      expect(parseDateInputToIso("15/05/2027")).toBe("2027-05-15");
      expect(parseDateInputToIso("10-09-2029")).toBe("2029-09-10");
    });

    it("приймає стандартний ISO YYYY-MM-DD без змін", () => {
      expect(parseDateInputToIso("2028-04-25")).toBe("2028-04-25");
    });

    it("повертає null для порожніх або некоректних рядків", () => {
      expect(parseDateInputToIso("")).toBe(null);
      expect(parseDateInputToIso("   ")).toBe(null);
      expect(parseDateInputToIso(null)).toBe(null);
      expect(parseDateInputToIso(undefined)).toBe(null);
      expect(parseDateInputToIso("не_дата")).toBe(null);
      expect(parseDateInputToIso("99.99.9999")).toBe(null);
    });
  });

  describe("formatIsoToDisplayDate", () => {
    it("форматує ISO дату в DD.MM.YYYY для зручного відображення", () => {
      expect(formatIsoToDisplayDate("2028-04-25")).toBe("25.04.2028");
      expect(formatIsoToDisplayDate("2026-12-01")).toBe("01.12.2026");
      expect(formatIsoToDisplayDate("")).toBe("");
      expect(formatIsoToDisplayDate(null)).toBe("");
    });
  });

  describe("parseFlexibleNumber", () => {
    it("парсить числа з комами, пробілами та гривневими символами", () => {
      expect(parseFlexibleNumber("21 059,29")).toBe(21059.29);
      expect(parseFlexibleNumber("23530,88")).toBe(23530.88);
      expect(parseFlexibleNumber("₴ 21 059,29")).toBe(21059.29);
      expect(parseFlexibleNumber("10000")).toBe(10000);
      expect(parseFlexibleNumber(5000)).toBe(5000);
      expect(parseFlexibleNumber("")).toBe(0);
      expect(parseFlexibleNumber(null)).toBe(0);
    });
  });

  describe("sortInvestments - Сортування інвестиційного портфеля за типом", () => {
    it("групує активи за типом: ОВДП -> Акції/ETF -> REIT -> Крипта -> Депозити -> Інше", () => {
      const mockAssets: InvestmentAsset[] = [
        {
          id: 1,
          asset_name: "Bitcoin",
          asset_type: "crypto",
          invested_amount: 1000,
          current_value: 1500,
          currency: "USD",
          created_at: "2026-01-01T00:00:00Z",
        },
        {
          id: 2,
          asset_name: "ПриватБанк Скарбничка",
          asset_type: "deposit",
          invested_amount: 5000,
          current_value: 5200,
          currency: "UAH",
          created_at: "2026-01-02T00:00:00Z",
        },
        {
          id: 3,
          asset_name: "ОВДП UA4000",
          asset_type: "bonds",
          invested_amount: 10000,
          current_value: 10500,
          currency: "UAH",
          maturity_date: "2026-11-18",
          created_at: "2026-01-03T00:00:00Z",
        },
        {
          id: 4,
          asset_name: "Inzhur REIT",
          asset_type: "reit",
          invested_amount: 20000,
          current_value: 23000,
          currency: "UAH",
          created_at: "2026-01-04T00:00:00Z",
        },
        {
          id: 5,
          asset_name: "Apple Inc.",
          asset_type: "stocks",
          invested_amount: 3000,
          current_value: 3500,
          currency: "USD",
          created_at: "2026-01-05T00:00:00Z",
        },
      ];

      const sorted = sortInvestments(mockAssets);
      expect(sorted.map((a) => a.asset_type)).toEqual([
        "bonds",
        "stocks",
        "reit",
        "crypto",
        "deposit",
      ]);
    });

    it("коректно сортує реальний портфель користувача: об'єднує новий випуск ОВДП з іншими ОВДП за датою погашення", () => {
      // Імітація активів з користувацького інтерфейсу (де новий ОВДП був доданий в кінці)
      const userPortfolio: InvestmentAsset[] = [
        {
          id: 1,
          asset_name: "ОВДП UA4000237416",
          asset_type: "bonds",
          invested_amount: 50000,
          current_value: 51577.4,
          currency: "UAH",
          maturity_date: "2026-11-18",
          created_at: "2026-01-01T00:00:00Z",
        },
        {
          id: 2,
          asset_name: "ОВДП UA4000238281",
          asset_type: "bonds",
          invested_amount: 30000,
          current_value: 31200.6,
          currency: "UAH",
          maturity_date: "2026-12-16",
          created_at: "2026-01-02T00:00:00Z",
        },
        {
          id: 3,
          asset_name: "ОВДП UA4000238976",
          asset_type: "bonds",
          invested_amount: 112000,
          current_value: 114083.56,
          currency: "UAH",
          maturity_date: "2027-03-24",
          created_at: "2026-01-03T00:00:00Z",
        },
        {
          id: 4,
          asset_name: "Inzhur REIT",
          asset_type: "reit",
          invested_amount: 21000,
          current_value: 23530.88,
          currency: "UAH",
          created_at: "2026-01-04T00:00:00Z",
        },
        {
          id: 5,
          asset_name: "Криптодепозит Whitebit",
          asset_type: "crypto",
          invested_amount: 19500,
          current_value: 22557.6,
          currency: "UAH",
          maturity_date: "2027-01-16",
          created_at: "2026-01-05T00:00:00Z",
        },
        {
          // Свіжододаний випуск ОВДП, що мав id: 6 та йшов після крипти
          id: 6,
          asset_name: "ОВДП UA4000239016",
          asset_type: "bonds",
          invested_amount: 35758.74,
          current_value: 35778.05,
          currency: "UAH",
          maturity_date: "2027-07-21",
          created_at: "2026-09-10T14:00:00Z",
        },
      ];

      const sorted = sortInvestments(userPortfolio);

      // Всі 4 ОВДП мають йти на початку підряд у хронологічному порядку дат погашення:
      // 1. UA4000237416 (18.11.2026)
      // 2. UA4000238281 (16.12.2026)
      // 3. UA4000238976 (24.03.2027)
      // 4. UA4000239016 (21.07.2027)
      // 5. Inzhur REIT (reit)
      // 6. Криптодепозит Whitebit (crypto)
      expect(sorted.map((a) => a.asset_name)).toEqual([
        "ОВДП UA4000237416",
        "ОВДП UA4000238281",
        "ОВДП UA4000238976",
        "ОВДП UA4000239016",
        "Inzhur REIT",
        "Криптодепозит Whitebit",
      ]);
    });

    it("сортує активи одного типу без дати погашення за спаданням поточної вартості", () => {
      const cryptos: InvestmentAsset[] = [
        {
          id: 1,
          asset_name: "Solana",
          asset_type: "crypto",
          invested_amount: 1000,
          current_value: 2000,
          currency: "USD",
          created_at: "2026-01-01T00:00:00Z",
        },
        {
          id: 2,
          asset_name: "Bitcoin",
          asset_type: "crypto",
          invested_amount: 5000,
          current_value: 10000,
          currency: "USD",
          created_at: "2026-01-02T00:00:00Z",
        },
        {
          id: 3,
          asset_name: "Ethereum",
          asset_type: "crypto",
          invested_amount: 3000,
          current_value: 6000,
          currency: "USD",
          created_at: "2026-01-03T00:00:00Z",
        },
      ];

      const sorted = sortInvestments(cryptos);
      expect(sorted.map((c) => c.asset_name)).toEqual([
        "Bitcoin",
        "Ethereum",
        "Solana",
      ]);
    });

    it("не мутує вхідний масив (immutability)", () => {
      const original: InvestmentAsset[] = [
        {
          id: 2,
          asset_name: "Crypto",
          asset_type: "crypto",
          invested_amount: 100,
          current_value: 100,
          currency: "USD",
          created_at: "2026-01-02T00:00:00Z",
        },
        {
          id: 1,
          asset_name: "Bond",
          asset_type: "bonds",
          invested_amount: 100,
          current_value: 100,
          currency: "UAH",
          created_at: "2026-01-01T00:00:00Z",
        },
      ];

      const copy = [...original];
      sortInvestments(original);
      expect(original).toEqual(copy);
    });
  });

  describe("calculateTotalCoupons & calculateReceivedCoupons", () => {
    it("повертає 0, якщо у активу немає купонів або масив порожній", () => {
      const assetNoCoupons: InvestmentAsset = {
        id: 1,
        asset_name: "ОВДП",
        asset_type: "bonds",
        invested_amount: 10000,
        current_value: 10000,
        currency: "UAH",
        created_at: "2026-01-01T00:00:00Z",
      };
      expect(calculateTotalCoupons(assetNoCoupons)).toBe(0);
      expect(calculateReceivedCoupons(assetNoCoupons)).toBe(0);

      const assetEmptyCoupons: InvestmentAsset = {
        ...assetNoCoupons,
        coupons: [],
      };
      expect(calculateTotalCoupons(assetEmptyCoupons)).toBe(0);
      expect(calculateReceivedCoupons(assetEmptyCoupons)).toBe(0);
    });

    it("підсумовує всі купони за замовчуванням", () => {
      const bond: InvestmentAsset = {
        id: 1,
        asset_name: "ОВДП UA4000",
        asset_type: "bonds",
        invested_amount: 50000,
        current_value: 50000,
        currency: "UAH",
        coupons: [
          { id: "c1", amount: 3750, date: "2026-03-24" },
          { id: "c2", amount: 3750, date: "2026-09-24" },
        ],
        created_at: "2026-01-01T00:00:00Z",
      };
      expect(calculateTotalCoupons(bond)).toBe(7500);
    });

    it("фільтрує виключно фактично отримані купони (date <= today) при onlyReceived: true", () => {
      const bond: InvestmentAsset = {
        id: 1,
        asset_name: "ОВДП UA4000237416",
        asset_type: "bonds",
        invested_amount: 49597.8,
        current_value: 51857.19,
        currency: "UAH",
        coupons: [
          { id: "c1", amount: 4005.75, date: "2026-05-20" }, // минулий
          { id: "c2", amount: 4005.75, date: "2026-11-18" }, // майбутній
        ],
        created_at: "2026-01-01T00:00:00Z",
      };

      const today = "2026-09-24";
      // Всього за графіком: 8011.50
      expect(
        calculateTotalCoupons(bond, { onlyReceived: false, todayIso: today })
      ).toBe(8011.5);
      // Тільки отримані на сьогодні: 4005.75
      expect(
        calculateTotalCoupons(bond, { onlyReceived: true, todayIso: today })
      ).toBe(4005.75);
      expect(calculateReceivedCoupons(bond, today)).toBe(4005.75);
    });
  });

  describe("calculateAssetPnl - Розрахунок P&L з купонами", () => {
    it("враховує у поточному P&L тільки фактично отримані купони і не завищує прибуток наперед", () => {
      const bondWithCoupons: InvestmentAsset = {
        id: 10,
        asset_name: "ОВДП UA4000237416",
        asset_type: "bonds",
        invested_amount: 49597.8,
        current_value: 51857.19, // поточна оцінка банку
        currency: "UAH",
        coupons: [
          { id: "1", amount: 4005.75, date: "2026-05-20" }, // виплачено
          { id: "2", amount: 4005.75, date: "2026-11-18" }, // очікується в майбутньому
        ],
        maturity_date: "2026-11-18",
        created_at: "2026-01-01T00:00:00Z",
      };

      // Станом на 2026-09-24 купон від 18.11.2026 ще не надійшов
      const res = calculateAssetPnl(bondWithCoupons, "2026-09-24");

      expect(res.receivedCoupons).toBe(4005.75);
      expect(res.upcomingCoupons).toBe(4005.75);
      expect(res.allScheduledCoupons).toBe(8011.5);
      // diff = (51857.19 + 4005.75) - 49597.80 = 6265.14
      expect(res.diff).toBeCloseTo(6265.14, 2);
      // pct = (6265.14 / 49597.80) * 100 = 12.6%
      expect(res.pct).toBe("12.6");
      expect(res.isProfit).toBe(true);

      // Станом на дату після погашення (2026-11-19) актив стає архівним і враховуються обидва купони
      const resAfterMaturity = calculateAssetPnl(bondWithCoupons, "2026-11-19");
      expect(resAfterMaturity.receivedCoupons).toBe(8011.5);
      expect(resAfterMaturity.upcomingCoupons).toBe(0);
    });

    it("працює стандартно для активів без купонів (акції, крипта)", () => {
      const stock: InvestmentAsset = {
        id: 20,
        asset_name: "S&P 500 ETF",
        asset_type: "stocks",
        invested_amount: 40000,
        current_value: 46000,
        currency: "USD",
        created_at: "2026-01-01T00:00:00Z",
      };

      const { diff, pct, totalCoupons, isProfit } = calculateAssetPnl(stock);
      expect(totalCoupons).toBe(0);
      expect(diff).toBe(6000);
      expect(pct).toBe("15.0");
      expect(isProfit).toBe(true);
    });
  });

  describe("isAssetArchived - Статус архівності активів", () => {
    it("повертає true, якщо встановлено is_archived = true", () => {
      const asset: InvestmentAsset = {
        id: 1,
        asset_name: "Старий актив",
        asset_type: "bonds",
        invested_amount: 1000,
        current_value: 1000,
        currency: "UAH",
        is_archived: true,
        created_at: "2025-01-01T00:00:00Z",
      };
      expect(isAssetArchived(asset)).toBe(true);
    });

    it("автоматично архірує ОВДП, дата погашення яких раніше поточної", () => {
      const maturedBond: InvestmentAsset = {
        id: 2,
        asset_name: "Погашений ОВДП",
        asset_type: "bonds",
        invested_amount: 20000,
        current_value: 20000,
        currency: "UAH",
        maturity_date: "2026-01-15",
        created_at: "2025-01-01T00:00:00Z",
      };

      // Передаємо дату, пізнішу за дату погашення
      expect(isAssetArchived(maturedBond, "2026-09-23")).toBe(true);
    });

    it("залишає активними ОВДП з майбутньою датою погашення", () => {
      const activeBond: InvestmentAsset = {
        id: 3,
        asset_name: "Активний ОВДП",
        asset_type: "bonds",
        invested_amount: 30000,
        current_value: 30000,
        currency: "UAH",
        maturity_date: "2027-11-20",
        created_at: "2026-01-01T00:00:00Z",
      };

      expect(isAssetArchived(activeBond, "2026-09-23")).toBe(false);
    });
  });
});
