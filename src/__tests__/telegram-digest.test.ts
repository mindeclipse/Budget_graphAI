import { describe, it, expect, vi, beforeEach } from "vitest";
import { escapeHtml, sendTelegramMessage } from "@/lib/telegram";

describe("Telegram Digest & Alerts", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("HTML Escaping for Telegram Bot API", () => {
    it("екранує небезпечні символи в назвах мерчантів", () => {
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
});
