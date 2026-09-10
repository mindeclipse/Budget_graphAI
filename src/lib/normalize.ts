// Очищення мерчантів від банківського сміття:
export function cleanMerchantRaw(raw: string): string {
  if (!raw) return "";

  return (
    raw
      // Прибираємо номери терміналів і кас (#376, №12, T001 тощо)
      .replace(/[#№]\s*\d+/gi, "")
      // Прибираємо типові міські мітки, які додають банки
      .replace(
        /(?:^|[^\p{L}\p{N}])(LVIV|ЛЬВІВ|KYIV|КИЇВ|DNIPRO|ДНІПРО|ODESA|ОДЕСА)(?=[^\p{L}\p{N}]|$)/giu,
        ""
      )
      // Прибираємо маски карток і технічні таймстемпи (4*01, 20:36 тощо)
      .replace(/\b\d\*\d{2}\b/g, "")
      .replace(/\b\d{1,2}:\d{2}(:\d{2})?\b/g, "")
      // Прибираємо окремо стоячі цифри в кінці (номери будинків/точок, як у "Dk Shevchenka 8")
      .replace(/\s+\d+\b/g, "")
      // Прибираємо технічні приписки (ФОП, ТОВ тощо)
      .replace(/(?:^|[^\p{L}\p{N}])(FOP|ФОП|TOV|ТОВ)(?=[^\p{L}\p{N}]|$)/giu, "")
      // Схлопуємо подвійні пробіли та підчищаємо краї
      .replace(/\s+/g, " ")
      .trim()
  );
}

/**
 * Очищує та парсить числові значення з підтримкою ком, пробілів та символів валют
 */
export function parseFlexibleNumber(val?: string | number | null): number {
  if (val == null) return 0;
  if (typeof val === "number") return isNaN(val) ? 0 : val;
  const clean = String(val)
    .replace(/[\s\u00A0₴$€]/g, "")
    .replace(",", ".");
  const num = parseFloat(clean);
  return isNaN(num) ? 0 : num;
}
