import { timingSafeEqual } from "@/lib/security";

/**
 * Валідує заголовок авторизації CRON через timingSafeEqual
 */
export function validateCronAuthorization(
  authHeader: string | null | undefined,
  cronSecret: string | undefined
): boolean {
  if (process.env.NODE_ENV === "production" || cronSecret) {
    if (!cronSecret || !authHeader) return false;
    return timingSafeEqual(authHeader, `Bearer ${cronSecret}`);
  }
  return true;
}
