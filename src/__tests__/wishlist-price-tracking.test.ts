import { describe, it, expect } from "vitest";
import { wishlistItemSchema, wishlistResolveSchema } from "@/lib/validations";

describe("Wishlist Price Tracking & Extended Cooling Validations", () => {
  it("валідує бажання з 6-місячним періодом охолодження (180 днів)", () => {
    const validWish = {
      title: "MacBook Pro 16 M4 Max",
      estimated_price: 145000,
      initial_price: 145000,
      target_price: 130000,
      currency: "UAH",
      category_name: "Гаджети",
      cooling_days: 180,
      url: "https://stylus.ua/macbook-pro",
      notes: "Купити для відеомонтажу восени",
      price_history: [
        {
          date: new Date().toISOString(),
          price: 145000,
          source: "manual",
        },
      ],
    };

    const parsed = wishlistItemSchema.safeParse(validWish);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.cooling_days).toBe(180);
      expect(parsed.data.target_price).toBe(130000);
      expect(parsed.data.initial_price).toBe(145000);
      expect(parsed.data.price_history).toHaveLength(1);
    }
  });

  it("дозволяє зв'язок зі скарбничкою (savings_goal_id)", () => {
    const wishWithGoal = {
      title: "Sony A7 IV",
      estimated_price: 85000,
      cooling_days: 90,
      savings_goal_id: 42,
    };

    const parsed = wishlistItemSchema.safeParse(wishWithGoal);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.savings_goal_id).toBe(42);
    }
  });

  it("успішно валідує дію update_price у wishlistResolveSchema", () => {
    const updateAction = {
      id: 12,
      action: "update_price",
      new_price: 138000,
      price_source: "manual",
      price_notes: "Знижка на Чорну П'ятницю",
    };

    const parsed = wishlistResolveSchema.safeParse(updateAction);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.action).toBe("update_price");
      expect(parsed.data.new_price).toBe(138000);
      expect(parsed.data.price_source).toBe("manual");
    }
  });

  it("успішно валідує дію link_savings_goal у wishlistResolveSchema", () => {
    const linkAction = {
      id: 15,
      action: "link_savings_goal",
      savings_goal_id: 7,
    };

    const parsed = wishlistResolveSchema.safeParse(linkAction);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.action).toBe("link_savings_goal");
      expect(parsed.data.savings_goal_id).toBe(7);
    }
  });
});
