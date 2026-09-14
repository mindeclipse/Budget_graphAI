import { describe, it, expect, vi, beforeEach } from "vitest";
import { escapeHtml, sendTelegramMessage } from "@/lib/telegram";
import {
  getKyivHour,
  getKyivDayOfWeek,
  calculateBehavioralMetrics,
} from "@/lib/behavioral-metrics";

describe("Telegram Digest & Alerts", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("HTML Escaping for Telegram Bot API", () => {
    it("екранує небезпечні символи в назвах мерчантів та AI-порадах", () => {
      const dirtyMerchant = "ATB & Silpo <Kyiv> 'Center'";
      const cleaned = escapeHtml(dirtyMerchant);
      expect(cleaned).not.toContain("<");
      expect(cleaned).not.toContain(">");
      expect(cleaned).toContain("&amp;");
      expect(cleaned).toContain("&lt;");
      expect(cleaned).toContain("&gt;");
    });
  });

  describe("sendTelegramMessage", () => {
    it("повертає false та попереджає, якщо змінні середовища відсутні", async () => {
      const originalToken = process.env.TELEGRAM_BOT_TOKEN;
      const originalChat = process.env.TELEGRAM_CHAT_ID;

      delete process.env.TELEGRAM_BOT_TOKEN;
      delete process.env.TELEGRAM_CHAT_ID;

      const result = await sendTelegramMessage("<b>Тестове повідомлення</b>");
      expect(result).toBe(false);

      process.env.TELEGRAM_BOT_TOKEN = originalToken;
      process.env.TELEGRAM_CHAT_ID = originalChat;
    });

    it("надсилає коректний payload коли токени наявні", async () => {
      process.env.TELEGRAM_BOT_TOKEN = "mock_token_123";
      process.env.TELEGRAM_CHAT_ID = "mock_chat_456";

      const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValueOnce({
        ok: true,
        text: async () => "ok",
      } as any);

      const result = await sendTelegramMessage("<b>Привіт</b>");
      expect(result).toBe(true);
      expect(fetchSpy).toHaveBeenCalledWith(
        "https://api.telegram.org/botmock_token_123/sendMessage",
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining('"parse_mode":"HTML"'),
        })
      );
    });
  });

  describe("Математика WoW (Week-over-Week) та сплесків", () => {
    it("коректно розраховує відсоток динаміки WoW", () => {
      const currentWeek = 8500;
      const prevWeek = 7000;
      const change = ((currentWeek - prevWeek) / prevWeek) * 100;
      expect(Number(change.toFixed(1))).toBe(21.4);
    });

    it("ідентифікує аномальні сплески витрат (Spike Detection)", () => {
      const averageSpendPerTransaction = 300;
      const normalTx = 450;
      const spikeTx = 3200;

      const isSpike = (amount: number, avg: number) =>
        amount >= avg * 3 && amount > 1000;

      expect(isSpike(normalTx, averageSpendPerTransaction)).toBe(false);
      expect(isSpike(spikeTx, averageSpendPerTransaction)).toBe(true);
    });
  });

  describe("Розділення споживчих витрат та інвестицій/заощаджень", () => {
    it("не враховує інвестиції та внутрішні перекази у споживчий бюджет", () => {
      const transactions = [
        { id: 1, type: "expense", amount: 1500, exclude_from_budget: false },
        { id: 2, type: "expense", amount: 800, exclude_from_budget: false },
        {
          id: 3,
          type: "investment",
          amount: 35000,
          exclude_from_budget: false,
        },
        { id: 4, type: "transfer", amount: 500, exclude_from_budget: false },
        { id: 5, type: "expense", amount: 200, exclude_from_budget: true },
      ];

      const expenseTx = transactions.filter(
        (t) => t.type === "expense" && !t.exclude_from_budget
      );
      const totalExpense = expenseTx.reduce((s, t) => s + t.amount, 0);

      const investmentTx = transactions.filter(
        (t) => t.type === "investment" && !t.exclude_from_budget
      );
      const totalInvested = investmentTx.reduce((s, t) => s + t.amount, 0);

      const transferTx = transactions.filter(
        (t) => t.type === "transfer" && !t.exclude_from_budget
      );
      const totalTransferred = transferTx.reduce((s, t) => s + t.amount, 0);

      expect(totalExpense).toBe(2300); // 1500 + 800
      expect(totalInvested).toBe(35000);
      expect(totalTransferred).toBe(500);
    });
  });

  describe("Поведінковий AI-коуч: часовий профіль та метрики", () => {
    it("коректно визначає годину за київським часом (Europe/Kyiv)", () => {
      // 2026-09-14T07:15:00Z у вересні (UTC+3) -> 10:15 за Києвом (ранок)
      const morningUtc = "2026-09-14T07:15:00Z";
      expect(getKyivHour(morningUtc)).toBe(10);

      // 2026-09-14T11:00:00Z у вересні (UTC+3) -> 14:00 за Києвом (день)
      const dayUtc = "2026-09-14T11:00:00Z";
      expect(getKyivHour(dayUtc)).toBe(14);

      // 2026-09-14T17:45:00Z у вересні (UTC+3) -> 20:45 за Києвом (вечір)
      const eveningUtc = "2026-09-14T17:45:00Z";
      expect(getKyivHour(eveningUtc)).toBe(20);
    });

    it("коректно визначає день тижня за київським часом (Europe/Kyiv)", () => {
      // 2026-09-14 — Понеділок (1)
      expect(getKyivDayOfWeek("2026-09-14T10:00:00Z")).toBe(1);
      // 2026-09-13 — Неділя (0)
      expect(getKyivDayOfWeek("2026-09-13T10:00:00Z")).toBe(0);
      // 2026-09-12 — Субота (6)
      expect(getKyivDayOfWeek("2026-09-12T10:00:00Z")).toBe(6);
    });

    it("розраховує часові блоки, вікенд-співвідношення та «латте-фактор»", () => {
      const mockExpenses = [
        // Ранок, Будень (Понеділок), дрібна покупка (кава 85 ₴)
        { amount: 85, created_at: "2026-09-14T06:30:00Z" }, // 09:30 Kyiv
        // День, Будень (Понеділок), звичайна покупка (обід 350 ₴)
        { amount: 350, created_at: "2026-09-14T11:00:00Z" }, // 14:00 Kyiv
        // Вечір, Субота, більша покупка (ресторан 1200 ₴)
        { amount: 1200, created_at: "2026-09-12T17:00:00Z" }, // 20:00 Kyiv
        // Вечір, Неділя, дрібна покупка (снеки 150 ₴)
        { amount: 150, created_at: "2026-09-13T18:00:00Z" }, // 21:00 Kyiv
      ];

      const metrics = calculateBehavioralMetrics(mockExpenses, {
        savedAmount: 2500,
        savedCount: 2,
        coolingAmount: 1800,
        coolingCount: 1,
      });

      const total = 85 + 350 + 1200 + 150; // 1785
      expect(metrics.totalExpense).toBe(total);

      // Часовий розподіл
      expect(metrics.timeProfile.morning.count).toBe(1);
      expect(metrics.timeProfile.morning.amount).toBe(85);
      expect(metrics.timeProfile.day.count).toBe(1);
      expect(metrics.timeProfile.day.amount).toBe(350);
      expect(metrics.timeProfile.evening.count).toBe(2);
      expect(metrics.timeProfile.evening.amount).toBe(1200 + 150); // 1350
      expect(metrics.timeProfile.evening.percent).toBe(
        Math.round((1350 / total) * 100)
      );

      // Вікенд vs Будні (Сб + Нд = 1200 + 150 = 1350; Будні = 85 + 350 = 435)
      expect(metrics.dayProfile.weekend.amount).toBe(1350);
      expect(metrics.dayProfile.weekend.count).toBe(2);
      expect(metrics.dayProfile.weekday.amount).toBe(435);
      expect(metrics.dayProfile.weekday.count).toBe(2);

      // Латте-фактор (чеки <= 200 ₴: 85 + 150 = 235 ₴)
      expect(metrics.microTransactions.count).toBe(2);
      expect(metrics.microTransactions.amount).toBe(235);
      expect(metrics.microTransactions.percent).toBe(
        Math.round((235 / total) * 100)
      );

      // Wishlist (Лист охолодження)
      expect(metrics.wishlist.savedAmount).toBe(2500);
      expect(metrics.wishlist.savedCount).toBe(2);
      expect(metrics.wishlist.coolingAmount).toBe(1800);
      expect(metrics.wishlist.coolingCount).toBe(1);
    });
  });
});
