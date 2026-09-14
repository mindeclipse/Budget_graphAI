export { escapeHtml } from "@/lib/security";

export interface TelegramInlineKeyboardButton {
  text: string;
  url?: string;
  web_app?: { url: string };
  callback_data?: string;
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

export async function answerTelegramCallbackQuery(
  callbackQueryId: string,
  text?: string,
  showAlert = false
): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return false;

  try {
    const payload: Record<string, any> = {
      callback_query_id: callbackQueryId,
      show_alert: showAlert,
    };
    if (text) payload.text = text;

    const res = await fetch(
      `https://api.telegram.org/bot${token}/answerCallbackQuery`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(5000),
      }
    );

    return res.ok;
  } catch (error) {
    console.error("Error answering Telegram callback query:", error);
    return false;
  }
}

export async function editTelegramMessageText(
  chatId: string | number,
  messageId: number,
  text: string,
  replyMarkup?: TelegramReplyMarkup
): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return false;

  try {
    const payload: Record<string, any> = {
      chat_id: chatId,
      message_id: messageId,
      text,
      parse_mode: "HTML",
    };
    if (replyMarkup) {
      payload.reply_markup = replyMarkup;
    }

    const res = await fetch(
      `https://api.telegram.org/bot${token}/editMessageText`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(5000),
      }
    );

    if (!res.ok) {
      const err = await res.text();
      console.error("Failed to edit Telegram message:", err);
      return false;
    }

    return true;
  } catch (error) {
    console.error("Network error editing Telegram message:", error);
    return false;
  }
}

export async function getTelegramFile(
  fileId: string
): Promise<{ buffer: Buffer; filePath: string; fileName: string } | null> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token || !fileId) return null;

  try {
    const metaRes = await fetch(
      `https://api.telegram.org/bot${token}/getFile?file_id=${encodeURIComponent(fileId)}`,
      { signal: AbortSignal.timeout(8000) }
    );
    if (!metaRes.ok) {
      console.error("Failed to get Telegram file info:", await metaRes.text());
      return null;
    }
    const metaData = await metaRes.json();
    const filePath = metaData.result?.file_path;
    if (!filePath) return null;

    const fileName = filePath.split("/").pop() || "file";

    const fileRes = await fetch(
      `https://api.telegram.org/file/bot${token}/${filePath}`,
      { signal: AbortSignal.timeout(15000) }
    );
    if (!fileRes.ok) {
      console.error("Failed to download Telegram file:", await fileRes.text());
      return null;
    }

    const arrayBuffer = await fileRes.arrayBuffer();
    return {
      buffer: Buffer.from(arrayBuffer),
      filePath,
      fileName,
    };
  } catch (error) {
    console.error("Error downloading Telegram file:", error);
    return null;
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
