import { describe, it, expect, vi, beforeEach } from "vitest";
import { sendTelegramDocument } from "@/lib/telegram";

describe("Telegram Document & Backup Service", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("sendTelegramDocument", () => {
    it("повертає false, якщо токен або chat ID відсутні", async () => {
      const origToken = process.env.TELEGRAM_BOT_TOKEN;
      const origChat = process.env.TELEGRAM_CHAT_ID;

      delete process.env.TELEGRAM_BOT_TOKEN;
      delete process.env.TELEGRAM_CHAT_ID;

      const res = await sendTelegramDocument('{"test": true}', "test.json");
      expect(res).toBe(false);

      process.env.TELEGRAM_BOT_TOKEN = origToken;
      process.env.TELEGRAM_CHAT_ID = origChat;
    });

    it("надсилає документ у Telegram Bot API через FormData", async () => {
      process.env.TELEGRAM_BOT_TOKEN = "token_doc_test";
      process.env.TELEGRAM_CHAT_ID = "chat_doc_test";

      const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValueOnce({
        ok: true,
        text: async () => "ok",
      } as any);

      const res = await sendTelegramDocument(
        '{"backup": true}',
        "backup.json",
        "Ось бекап"
      );

      expect(res).toBe(true);
      expect(fetchSpy).toHaveBeenCalledWith(
        "https://api.telegram.org/bottoken_doc_test/sendDocument",
        expect.objectContaining({
          method: "POST",
          body: expect.any(FormData),
        })
      );
    });

    it("обробляє помилку Telegram Bot API коректно", async () => {
      process.env.TELEGRAM_BOT_TOKEN = "token_doc_test";
      process.env.TELEGRAM_CHAT_ID = "chat_doc_test";

      vi.spyOn(global, "fetch").mockResolvedValueOnce({
        ok: false,
        text: async () => "Bad Request",
      } as any);

      const res = await sendTelegramDocument("{}", "test.json");
      expect(res).toBe(false);
    });
  });

  describe("sendTelegramPhoto", () => {
    it("повертає false, якщо токен або chat ID відсутні", async () => {
      const origToken = process.env.TELEGRAM_BOT_TOKEN;
      const origChat = process.env.TELEGRAM_CHAT_ID;

      delete process.env.TELEGRAM_BOT_TOKEN;
      delete process.env.TELEGRAM_CHAT_ID;

      const { sendTelegramPhoto } = await import("@/lib/telegram");
      const res = await sendTelegramPhoto(Buffer.from("fake-png"), "Графік");
      expect(res).toBe(false);

      process.env.TELEGRAM_BOT_TOKEN = origToken;
      process.env.TELEGRAM_CHAT_ID = origChat;
    });

    it("надсилає фото у Telegram Bot API через FormData", async () => {
      process.env.TELEGRAM_BOT_TOKEN = "token_photo_test";
      process.env.TELEGRAM_CHAT_ID = "chat_photo_test";

      const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValueOnce({
        ok: true,
        text: async () => "ok",
      } as any);

      const { sendTelegramPhoto } = await import("@/lib/telegram");
      const res = await sendTelegramPhoto(
        Buffer.from("fake-png-buffer"),
        "📊 Підсумок",
        {
          inline_keyboard: [[{ text: "Оновити", callback_data: "refresh" }]],
        }
      );

      expect(res).toBe(true);
      expect(fetchSpy).toHaveBeenCalledWith(
        "https://api.telegram.org/bottoken_photo_test/sendPhoto",
        expect.objectContaining({
          method: "POST",
          body: expect.any(FormData),
        })
      );
    });

    it("обробляє помилку Telegram Bot API коректно", async () => {
      process.env.TELEGRAM_BOT_TOKEN = "token_photo_test";
      process.env.TELEGRAM_CHAT_ID = "chat_photo_test";

      vi.spyOn(global, "fetch").mockResolvedValueOnce({
        ok: false,
        text: async () => "Bad Request",
      } as any);

      const { sendTelegramPhoto } = await import("@/lib/telegram");
      const res = await sendTelegramPhoto(Buffer.from("fake-png"), "Графік");
      expect(res).toBe(false);
    });
  });
});
