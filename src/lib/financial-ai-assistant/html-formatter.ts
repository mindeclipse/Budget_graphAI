/**
 * Санітизує та адаптує розмітку AI у валідний Telegram HTML
 */
export function formatTelegramAiHtml(rawText: string): string {
  let text = rawText.trim();

  // Прибираємо можливі markdown-заголовки (наприклад ### Заголовок -> <b>Заголовок</b>)
  text = text.replace(/^#{1,4}\s+(.+)$/gm, "<b>$1</b>");

  // Конвертуємо подвійні зірочки **жирний** у <b>жирний</b>
  text = text.replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");

  // Конвертуємо поодинокі зірочки *курсив* у <i>курсив</i>
  text = text.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, "<i>$1</i>");

  // Конвертуємо `код` у <code>код</code>
  text = text.replace(/`([^`]+)`/g, "<code>$1</code>");

  // Прибираємо зайві порожні рядки (максимум 2 підряд)
  text = text.replace(/\n{3,}/g, "\n\n");

  return text;
}
