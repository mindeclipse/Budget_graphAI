export { escapeHtml } from "@/lib/security";

export interface TelegramInlineKeyboardButton {
  text: string;
  url?: string;
  web_app?: { url: string };
}

export interface TelegramReplyMarkup {
  inline_keyboard?: TelegramInlineKeyboardButton[][];
}

export async function sendTelegramMessage(
  text: string,
  replyMarkup?: TelegramReplyMarkup
): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    console.warn("Telegram alert skipped: missing credentials in environment.");
    return false;
  }

  try {
    const payload: Record<string, any> = {
      chat_id: chatId,
      text,
      parse_mode: "HTML",
    };

    if (replyMarkup) {
      payload.reply_markup = replyMarkup;
    }

    const res = await fetch(
      `https://api.telegram.org/bot${token}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(5000),
      }
    );

    if (!res.ok) {
      const err = await res.text();
      console.error("Failed to send Telegram message:", err);
      return false;
    }

    return true;
  } catch (error) {
    console.error("Network error sending Telegram message:", error);
    return false;
  }
}

export async function sendTelegramDocument(
  fileData: string | Buffer | Uint8Array,
  fileName: string,
  caption?: string
): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    console.warn(
      "Telegram document skipped: missing credentials in environment."
    );
    return false;
  }

  try {
    const formData = new FormData();
    formData.append("chat_id", chatId);
    const blob =
      typeof fileData === "string"
        ? new Blob([fileData], { type: "application/json" })
        : new Blob([fileData as any]);
    formData.append("document", blob, fileName);
    if (caption) {
      formData.append("caption", caption);
      formData.append("parse_mode", "HTML");
    }

    const res = await fetch(
      `https://api.telegram.org/bot${token}/sendDocument`,
      {
        method: "POST",
        body: formData,
        signal: AbortSignal.timeout(15000),
      }
    );

    if (!res.ok) {
      const err = await res.text();
      console.error("Failed to send Telegram document:", err);
      return false;
    }

    return true;
  } catch (error) {
    console.error("Network error sending Telegram document:", error);
    return false;
  }
}
