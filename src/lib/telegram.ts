export { escapeHtml } from "@/lib/security";

export async function sendTelegramMessage(text: string): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    console.warn("Telegram alert skipped: missing credentials in environment.");
    return false;
  }

  try {
    const res = await fetch(
      `https://api.telegram.org/bot${token}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          parse_mode: "HTML",
        }),
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
