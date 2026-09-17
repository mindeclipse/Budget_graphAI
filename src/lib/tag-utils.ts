/**
 * Утиліти для роботи з інлайн-тегами (#хештегами) та коментарями до транзакцій
 */

const HASHTAG_REGEX = /(?:^|\s)#([a-zA-Z0-9а-яА-ЯіїєґІЇЄҐ_\-]+)/gu;

export interface ParsedCommentTags {
  tags: string[];
  comment: string;
}

/**
 * Парсить текст коментаря та витягує всі валідні хештеги.
 * Забезпечує дедуплікацію, приведення до нижнього регістру та безпечні обмеження довжини.
 */
export function extractTagsAndComment(rawInput: string): ParsedCommentTags {
  if (!rawInput || typeof rawInput !== "string") {
    return { tags: [], comment: "" };
  }

  const trimmed = rawInput.trim().slice(0, 500);
  if (!trimmed) {
    return { tags: [], comment: "" };
  }

  const tagsSet = new Set<string>();
  const matches = trimmed.matchAll(HASHTAG_REGEX);

  for (const match of matches) {
    const rawTag = match[1];
    if (rawTag) {
      const cleanTag = rawTag
        .toLowerCase()
        .replace(/^#+/, "")
        .trim()
        .slice(0, 30);

      if (cleanTag.length > 0 && tagsSet.size < 30) {
        tagsSet.add(cleanTag);
      }
    }
  }

  return {
    tags: Array.from(tagsSet),
    comment: trimmed,
  };
}

/**
 * Формує початковий текст для поля вводу з коментаря та існуючих тегів транзакції.
 * Якщо теги вже згадані у тексті як #тег, вони не дублюються.
 */
export function formatInitialCommentAndTags(
  comment?: string | null,
  tags?: string[] | null
): string {
  const cleanComment = (comment || "").trim();
  const validTags = Array.isArray(tags)
    ? tags
        .map((t) =>
          typeof t === "string" ? t.trim().toLowerCase().replace(/^#+/, "") : ""
        )
        .filter(Boolean)
    : [];

  if (!cleanComment) {
    return validTags.map((t) => `#${t}`).join(" ");
  }

  if (validTags.length === 0) {
    return cleanComment;
  }

  // Перевіряємо, які теги ще не включені в текст коментаря
  const existingTagsInComment = new Set<string>();
  const matches = cleanComment.matchAll(HASHTAG_REGEX);
  for (const m of matches) {
    if (m[1]) {
      existingTagsInComment.add(m[1].toLowerCase().replace(/^#+/, ""));
    }
  }

  const missingTags = validTags.filter((t) => !existingTagsInComment.has(t));
  if (missingTags.length === 0) {
    return cleanComment;
  }

  return `${cleanComment} ${missingTags.map((t) => `#${t}`).join(" ")}`.trim();
}

/**
 * Видаляє вказаний тег із тексту коментаря (наприклад, при кліку на хрестик бейджа).
 */
export function removeTagFromText(text: string, tagToRemove: string): string {
  if (!text || !tagToRemove) return text || "";

  const cleanTarget = tagToRemove.toLowerCase().replace(/^#+/, "").trim();
  if (!cleanTarget) return text;

  // Видаляємо #tagToRemove як окреме слово з можливими оточуючими пропусками
  const pattern = new RegExp(
    `(?:^|\\s)#${cleanTarget}(?=\\s|$|[.,!?;:])`,
    "gi"
  );
  const updated = text
    .replace(pattern, " ")
    .replace(/\s{2,}/g, " ")
    .trim();

  return updated;
}
