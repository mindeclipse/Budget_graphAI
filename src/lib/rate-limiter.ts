import { getSupabaseAdmin } from "./supabase-admin";

export interface RateLimitResult {
  allowed: boolean;
  waitMinutes?: number;
  remainingAttempts?: number;
}

const MAX_ATTEMPTS = 5;
const BLOCK_DURATION_MS = 15 * 60 * 1000; // 15 хвилин блокування
const ATTEMPT_WINDOW_MS = 15 * 60 * 1000; // Вікно 15 хвилин для скидання неактивних спроб

// Fallback in-memory трекер на випадок відсутності таблиці в БД
const fallbackMemoryTracker = new Map<
  string,
  { count: number; blockedUntil: number; lastAttempt: number }
>();

function checkFallback(ip: string): RateLimitResult {
  const now = Date.now();
  const entry = fallbackMemoryTracker.get(ip);

  if (entry) {
    if (entry.blockedUntil > now) {
      const waitMinutes = Math.ceil((entry.blockedUntil - now) / 60000);
      return { allowed: false, waitMinutes };
    }
    // Скидання лічильника, якщо вікно застаріло
    if (now - entry.lastAttempt > ATTEMPT_WINDOW_MS) {
      fallbackMemoryTracker.delete(ip);
      return { allowed: true, remainingAttempts: MAX_ATTEMPTS };
    }
    return {
      allowed: true,
      remainingAttempts: Math.max(0, MAX_ATTEMPTS - entry.count),
    };
  }

  return { allowed: true, remainingAttempts: MAX_ATTEMPTS };
}

function recordFailureFallback(ip: string): void {
  const now = Date.now();
  const entry = fallbackMemoryTracker.get(ip);
  const currentCount = (entry?.count || 0) + 1;

  if (currentCount >= MAX_ATTEMPTS) {
    fallbackMemoryTracker.set(ip, {
      count: currentCount,
      blockedUntil: now + BLOCK_DURATION_MS,
      lastAttempt: now,
    });
  } else {
    fallbackMemoryTracker.set(ip, {
      count: currentCount,
      blockedUntil: 0,
      lastAttempt: now,
    });
  }
}

function resetFallback(ip: string): void {
  fallbackMemoryTracker.delete(ip);
}

/**
 * Перевірка ліміту спроб для IP-адреси перед авторизацією через розподілену базу Supabase.
 * Має автоматичний in-memory fallback при недоступності таблиці.
 */
export async function checkRateLimit(ip: string): Promise<RateLimitResult> {
  try {
    const supabase = getSupabaseAdmin();
    const now = new Date();

    const { data, error } = await supabase
      .from("auth_rate_limits")
      .select("attempts, blocked_until, last_attempt_at")
      .eq("ip", ip)
      .maybeSingle();

    if (error) {
      console.warn(
        "[RateLimiter] Supabase query error (using memory fallback):",
        error.message
      );
      return checkFallback(ip);
    }

    if (!data) {
      return { allowed: true, remainingAttempts: MAX_ATTEMPTS };
    }

    // 1. Перевірка активного блокування
    if (data.blocked_until) {
      const blockedUntil = new Date(data.blocked_until);
      if (blockedUntil.getTime() > now.getTime()) {
        const waitMinutes = Math.ceil(
          (blockedUntil.getTime() - now.getTime()) / 60000
        );
        return { allowed: false, waitMinutes };
      }
    }

    // 2. Перевірка застарівання вікна спроб
    if (data.last_attempt_at) {
      const lastAttempt = new Date(data.last_attempt_at);
      if (now.getTime() - lastAttempt.getTime() > ATTEMPT_WINDOW_MS) {
        // Вікно минуло - скидаємо лічильник
        await supabase.from("auth_rate_limits").delete().eq("ip", ip);
        return { allowed: true, remainingAttempts: MAX_ATTEMPTS };
      }
    }

    const remaining = Math.max(0, MAX_ATTEMPTS - (data.attempts || 0));
    return { allowed: true, remainingAttempts: remaining };
  } catch (err: any) {
    console.warn(
      "[RateLimiter] Unexpected error (using memory fallback):",
      err?.message
    );
    return checkFallback(ip);
  }
}

/**
 * Фіксація невдалої спроби входу в розподіленій базі Supabase.
 */
export async function recordFailedAttempt(ip: string): Promise<void> {
  try {
    const supabase = getSupabaseAdmin();
    const now = new Date();

    const { data: existing, error: fetchErr } = await supabase
      .from("auth_rate_limits")
      .select("attempts")
      .eq("ip", ip)
      .maybeSingle();

    if (fetchErr) {
      console.warn(
        "[RateLimiter] Supabase fetch error (using memory fallback):",
        fetchErr.message
      );
      recordFailureFallback(ip);
      return;
    }

    const newAttempts = (existing?.attempts || 0) + 1;
    const isBlocked = newAttempts >= MAX_ATTEMPTS;
    const blockedUntil = isBlocked
      ? new Date(now.getTime() + BLOCK_DURATION_MS).toISOString()
      : null;

    const { error: upsertErr } = await supabase.from("auth_rate_limits").upsert(
      {
        ip,
        attempts: newAttempts,
        blocked_until: blockedUntil,
        last_attempt_at: now.toISOString(),
      },
      { onConflict: "ip" }
    );

    if (upsertErr) {
      console.warn(
        "[RateLimiter] Supabase upsert error (using memory fallback):",
        upsertErr.message
      );
      recordFailureFallback(ip);
    }
  } catch (err: any) {
    console.warn(
      "[RateLimiter] Unexpected error recording failure (using memory fallback):",
      err?.message
    );
    recordFailureFallback(ip);
  }
}

/**
 * Скидання лічильника спроб після успішного входу.
 */
export async function resetRateLimit(ip: string): Promise<void> {
  try {
    resetFallback(ip);
    const supabase = getSupabaseAdmin();
    await supabase.from("auth_rate_limits").delete().eq("ip", ip);
  } catch (err: any) {
    console.warn("[RateLimiter] Error resetting rate limit:", err?.message);
  }
}

export interface AIRateLimitResult {
  allowed: boolean;
  retryAfterSeconds?: number;
  remaining?: number;
}

const aiRateLimitTracker = new Map<
  string,
  { count: number; resetAt: number }
>();

function cleanupExpiredAiRateLimits(now: number): void {
  if (aiRateLimitTracker.size > 1000) {
    for (const [key, val] of aiRateLimitTracker.entries()) {
      if (now > val.resetAt) {
        aiRateLimitTracker.delete(key);
      }
    }
  }
}

/**
 * Швидкий in-memory rate-limiter для AI ендпоінтів (0ms DB Latency).
 * Захищає квоту Google Gemini API від надмірних або зациклених запитів.
 */
export function checkAiRateLimit(
  key: string,
  maxRequests: number = 20,
  windowMs: number = 60 * 1000
): AIRateLimitResult {
  const now = Date.now();
  cleanupExpiredAiRateLimits(now);

  const entry = aiRateLimitTracker.get(key);

  if (!entry || now > entry.resetAt) {
    aiRateLimitTracker.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: maxRequests - 1 };
  }

  if (entry.count >= maxRequests) {
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((entry.resetAt - now) / 1000)
    );
    return { allowed: false, retryAfterSeconds, remaining: 0 };
  }

  entry.count += 1;
  return { allowed: true, remaining: Math.max(0, maxRequests - entry.count) };
}
