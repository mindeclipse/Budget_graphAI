import { describe, it, expect } from "vitest";
import {
  wishlistItemSchema,
  wishlistResolveSchema,
  costPerUseSchema,
  costPerUseActionSchema,
} from "../lib/validations";

describe("Behavioral Finance & Psychology Unit Tests", () => {
  describe("Wishlist / Anti-Impulse Validations & Calculations", () => {
    it("валідує коректне нове бажання з таймером охолодження", () => {
      const valid = wishlistItemSchema.safeParse({
        title: "Навушники Sony WH-1000XM5",
        estimated_price: 14500,
        currency: "UAH",
        category_name: "Гаджети",
        cooling_days: 14,
        notes: "Побачив огляд, хочу для зосередженої роботи",
        url: "https://rozetka.com.ua/item123",
      });

      expect(valid.success).toBe(true);
      if (valid.success) {
        expect(valid.data.title).toBe("Навушники Sony WH-1000XM5");
        expect(valid.data.estimated_price).toBe(14500);
        expect(valid.data.cooling_days).toBe(14);
      }
    });

    it("відхиляє некоректну ціну або порожню назву", () => {
      const invalid = wishlistItemSchema.safeParse({
        title: "   ",
        estimated_price: -500,
        currency: "UAH",
      });
      expect(invalid.success).toBe(false);
    });

    it("валідує дію вирішення бажання (saved / purchased / extend)", () => {
      const resolveSaved = wishlistResolveSchema.safeParse({
        id: 42,
        action: "saved",
      });
      expect(resolveSaved.success).toBe(true);

      const resolveExtend = wishlistResolveSchema.safeParse({
        id: 42,
        action: "extend",
        extend_days: 7,
      });
      expect(resolveExtend.success).toBe(true);

      const invalidAction = wishlistResolveSchema.safeParse({
        id: 42,
        action: "unknown_action",
      });
      expect(invalidAction.success).toBe(false);
    });

    it("коректно рахує суму врятованих грошей", () => {
      const items = [
        { id: 1, title: "Годинник", estimated_price: 12000, status: "saved" },
        { id: 2, title: "Куртка", estimated_price: 4500, status: "saved" },
        { id: 3, title: "Ноутбук", estimated_price: 60000, status: "cooling" },
        { id: 4, title: "Кавоварка", estimated_price: 18000, status: "purchased" },
      ];

      const savedAmount = items
        .filter((i) => i.status === "saved")
        .reduce((sum, i) => sum + i.estimated_price, 0);

      expect(savedAmount).toBe(16500);
    });

    it("коректно визначає статус ready коли дата охолодження в минулому", () => {
      const pastDate = new Date(Date.now() - 1000 * 60 * 60).toISOString(); // 1 година тому
      const futureDate = new Date(Date.now() + 1000 * 60 * 60 * 24 * 5).toISOString(); // +5 днів

      const itemReady = {
        status: "cooling",
        cooling_end_date: pastDate,
      };
      const itemCooling = {
        status: "cooling",
        cooling_end_date: futureDate,
      };

      const now = new Date();
      const status1 =
        itemReady.status === "cooling" && new Date(itemReady.cooling_end_date) <= now
          ? "ready"
          : itemReady.status;
      const status2 =
        itemCooling.status === "cooling" && new Date(itemCooling.cooling_end_date) <= now
          ? "ready"
          : itemCooling.status;

      expect(status1).toBe("ready");
      expect(status2).toBe("cooling");
    });
  });

  describe("Cost-per-Use Validations & Economic Calculations", () => {
    it("валідує додавання речі в трекер окупності", () => {
      const valid = costPerUseSchema.safeParse({
        item_name: "Кавоварка DeLonghi Magnifica",
        category_name: "Кухня та дім",
        purchase_price: 18000,
        currency: "UAH",
        purchase_date: "2026-01-15",
        total_uses: 120,
        benchmark_cost_per_use: 70,
        target_cost_per_use: 50,
        notes: "Замінює щоденну каву з кав'ярні біля дому",
      });

      expect(valid.success).toBe(true);
      if (valid.success) {
        expect(valid.data.item_name).toBe("Кавоварка DeLonghi Magnifica");
        expect(valid.data.purchase_price).toBe(18000);
        expect(valid.data.benchmark_cost_per_use).toBe(70);
      }
    });

    it("валідує дію log_use (+1 використання)", () => {
      const validAction = costPerUseActionSchema.safeParse({
        id: 15,
        action: "log_use",
        increment: 1,
      });
      expect(validAction.success).toBe(true);
    });

    it("коректно рахує вартість за одне використання та економію ROI", () => {
      const purchasePrice = 18000;
      const uses = 300;
      const benchmark = 70; // 70 грн за чашку

      const currentCostPerUse = Math.round((purchasePrice / Math.max(1, uses)) * 100) / 100;
      expect(currentCostPerUse).toBe(60); // 18000 / 300 = 60 грн/чашка (дешевше ніж 70 грн!)

      const totalBenchmarkValue = benchmark * uses; // 21 000 грн
      const moneySaved = Math.max(0, totalBenchmarkValue - purchasePrice); // 3 000 грн чистої економії
      const roiPercent = Math.round((totalBenchmarkValue / purchasePrice) * 100); // 117%

      expect(moneySaved).toBe(3000);
      expect(roiPercent).toBe(117);
    });

    it("коректно захищає від ділення на нуль якщо uses = 0", () => {
      const price = 5000;
      const uses = 0;
      const cost = price / Math.max(1, uses);
      expect(cost).toBe(5000);
    });
  });
});
