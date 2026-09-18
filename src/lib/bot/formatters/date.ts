export function formatKyivDateTime(dateStr: string | Date): string {
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return String(dateStr);
    return new Intl.DateTimeFormat("uk-UA", {
      timeZone: "Europe/Kyiv",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(d);
  } catch {
    return String(dateStr);
  }
}

export function formatKyivDate(dateStr: string | Date): string {
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return String(dateStr);
    return new Intl.DateTimeFormat("uk-UA", {
      timeZone: "Europe/Kyiv",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(d);
  } catch {
    return String(dateStr);
  }
}

/**
 * Визначає часовий зсув Europe/Kyiv (наприклад +03:00 влітку або +02:00 взимку) для вказаної дати та часу
 */
export function getKyivTimezoneOffset(
  year: number,
  month: number,
  day: number,
  hour = 12,
  minute = 0
): string {
  const utcEstimate = new Date(Date.UTC(year, month - 1, day, hour, minute));
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Kyiv",
    timeZoneName: "longOffset",
  });
  const parts = formatter.formatToParts(utcEstimate);
  const tz = parts.find((p) => p.type === "timeZoneName")?.value || "+03:00";
  return tz.replace("GMT", "");
}

/**
 * Нормалізує дату та час чеку чи квитанції з урахуванням місцевого часу Києва (Europe/Kyiv).
 * Запобігає 3-годинному хибному зсуву, коли Gemini повертає локальний час чека із закінченням Z (UTC).
 */
export function normalizeKyivReceiptDate(
  rawDateStr?: string,
  referenceDate: Date = new Date()
): string {
  if (!rawDateStr || typeof rawDateStr !== "string") {
    return referenceDate.toISOString();
  }

  const clean = rawDateStr.replace(/Z$/i, "").trim();

  // 1. Формат ISO: YYYY-MM-DD HH:MM[:SS]
  const matchIso = clean.match(
    /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T\s](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/
  );
  // 2. Український формат: DD.MM.YYYY або DD/MM/YYYY HH:MM[:SS]
  const matchUk = clean.match(
    /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})(?:[T\s,]+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/
  );

  let y: number;
  let m: number;
  let d: number;
  let hh = 12;
  let mm = 0;
  let ss = 0;
  let hasTime = false;

  if (matchIso) {
    y = parseInt(matchIso[1], 10);
    m = parseInt(matchIso[2], 10);
    d = parseInt(matchIso[3], 10);
    if (matchIso[4] !== undefined && matchIso[5] !== undefined) {
      hh = parseInt(matchIso[4], 10);
      mm = parseInt(matchIso[5], 10);
      ss = matchIso[6] ? parseInt(matchIso[6], 10) : 0;
      hasTime = true;
    }
  } else if (matchUk) {
    d = parseInt(matchUk[1], 10);
    m = parseInt(matchUk[2], 10);
    y = parseInt(matchUk[3], 10);
    if (matchUk[4] !== undefined && matchUk[5] !== undefined) {
      hh = parseInt(matchUk[4], 10);
      mm = parseInt(matchUk[5], 10);
      ss = matchUk[6] ? parseInt(matchUk[6], 10) : 0;
      hasTime = true;
    }
  } else {
    const parsed = new Date(rawDateStr);
    return isNaN(parsed.getTime())
      ? referenceDate.toISOString()
      : parsed.toISOString();
  }

  // Якщо час не був указаний на чеку, але дата збігається із сьогоднішньою (за Києвом),
  // спадкуємо години та хвилини з referenceDate
  if (!hasTime) {
    const refKyivParts = new Intl.DateTimeFormat("en-US", {
      timeZone: "Europe/Kyiv",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
      hour12: false,
    }).formatToParts(referenceDate);
    const getPart = (type: Intl.DateTimeFormatPartTypes) =>
      parseInt(refKyivParts.find((p) => p.type === type)?.value || "0", 10);
    const refY = getPart("year");
    const refM = getPart("month");
    const refD = getPart("day");
    if (refY === y && refM === m && refD === d) {
      hh = getPart("hour");
      mm = getPart("minute");
      ss = getPart("second");
    }
  }

  const pad = (n: number) => String(n).padStart(2, "0");
  const offset = getKyivTimezoneOffset(y, m, d, hh, mm);
  const isoWithOffset = `${y}-${pad(m)}-${pad(d)}T${pad(hh)}:${pad(mm)}:${pad(ss)}${offset}`;
  const finalDate = new Date(isoWithOffset);
  return isNaN(finalDate.getTime())
    ? referenceDate.toISOString()
    : finalDate.toISOString();
}
