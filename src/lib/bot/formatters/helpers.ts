import { timingSafeEqual } from "@/lib/security";

/**
 * Перевірка валідності секретного токена вебхука Telegram із захистом від Timing Attacks
 */
export function validateTelegramWebhookSecret(
  secretHeader: string | null,
  configuredSecret?: string
): boolean {
  if (configuredSecret) {
    if (!secretHeader) return false;
    return timingSafeEqual(secretHeader, configuredSecret);
  }
  return true;
}

/**
 * Рендерить текстовий прогрес-бар для повідомлень Telegram
 */
export function renderProgressBar(percent: number, totalBlocks = 10): string {
  const safePercent = Math.max(0, Math.min(100, Math.round(percent)));
  const filledBlocks = Math.round((safePercent / 100) * totalBlocks);
  const emptyBlocks = Math.max(0, totalBlocks - filledBlocks);
  return `${"█".repeat(filledBlocks)}${"░".repeat(emptyBlocks)}`;
}

/**
 * Очищує JSON текст від блоків markdown ```json ... ```
 */
export function cleanJsonOutput(raw: string): string {
  return raw
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}
