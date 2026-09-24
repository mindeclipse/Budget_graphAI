/**
 * Утиліти безпеки для запобігання Timing Attacks, безпечного отримання IP та екранування HTML
 */

/**
 * Константне за часом порівняння двох рядків (захист від атак за часом / Timing Attacks)
 * Працює як у середовищі Node.js, так і в Edge Runtime (proxy.ts).
 */
export function timingSafeEqual(a: string, b: string): boolean {
  if (typeof a !== "string" || typeof b !== "string") {
    return false;
  }

  const encoder = new TextEncoder();
  const bufA = encoder.encode(a);
  const bufB = encoder.encode(b);

  if (bufA.length !== bufB.length) {
    return false;
  }

  let diff = 0;
  for (let i = 0; i < bufA.length; i++) {
    diff |= bufA[i] ^ bufB[i];
  }

  return diff === 0;
}

/**
 * Надійне вилучення справжнього IP клієнта із заголовків проксі
 */
export function getClientIp(headers: Headers): string {
  const forwardedFor = headers.get("x-forwarded-for");
  if (forwardedFor) {
    const firstIp = forwardedFor.split(",")[0].trim();
    if (firstIp) return firstIp;
  }

  const realIp = headers.get("x-real-ip");
  if (realIp) {
    return realIp.trim();
  }

  return "127.0.0.1";
}

/**
 * Екранування спеціальних HTML-символів для безпечного виклику Telegram Bot API
 */
export function escapeHtml(str: string): string {
  if (!str) return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Захист від Formula Injection (CSV / Excel Injection).
 * Екранує небезпечні керівні символи (=, +, -, @, Tab, CR).
 */
export function sanitizeFormulaInjection(text: string): string {
  const str = String(text || "");
  const trimmed = str.trim();
  if (/^[=+\-@\t\r]/.test(str) || /^[=+\-@\t\r]/.test(trimmed)) {
    return `'${trimmed}`;
  }
  return trimmed;
}
