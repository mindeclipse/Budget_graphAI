import { NextRequest } from "next/server";
import { timingSafeEqual } from "@/lib/security";

/**
 * Валідація секретного токена вебхука від Telegram через timingSafeEqual
 */
export function validateTelegramSecret(req: NextRequest): boolean {
  const secretHeader = req.headers.get("x-telegram-bot-api-secret-token");
  const configuredSecret = process.env.TELEGRAM_WEBHOOK_SECRET;

  // Якщо секрет налаштовано в оточенні — суворо перевіряємо через timingSafeEqual
  if (configuredSecret) {
    if (!secretHeader) return false;
    return timingSafeEqual(secretHeader, configuredSecret);
  }

  // Якщо специфічний секрет вебхука не задано, дозволяємо (авторизація суворо відбудеться за TELEGRAM_CHAT_ID)
  return true;
}

/**
 * Перевіряє відповідність chatId авторизованому власнику
 */
export function isAuthorizedChat(
  chatId: string | number | undefined,
  authorizedChatId: string | undefined
): boolean {
  if (!authorizedChatId || !chatId) return false;
  return String(chatId) === String(authorizedChatId);
}
