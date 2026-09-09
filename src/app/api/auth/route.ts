import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { timingSafeEqual, getClientIp } from "@/lib/security";
import { createSessionToken, verifySessionToken } from "@/lib/session";

// In-memory трекер невдалих спроб
const failedAttempts = new Map<
  string,
  { count: number; blockedUntil: number }
>();

export async function POST(req: Request) {
  try {
    const ip = getClientIp(new Headers(req.headers));
    const now = Date.now();
    const tracker = failedAttempts.get(ip);

    // Перевірка блокування (якщо більше 5 невдалих спроб — бан на 15 хвилин)
    if (tracker && tracker.blockedUntil > now) {
      const waitMinutes = Math.ceil((tracker.blockedUntil - now) / 60000);
      return NextResponse.json(
        { error: `Забагато спроб. Спробуйте через ${waitMinutes} хв.` },
        { status: 429 }
      );
    }

    const { pin } = await req.json();
    const correctPin = process.env.APP_ACCESS_PIN;

    const isPinValid =
      typeof pin === "string" &&
      typeof correctPin === "string" &&
      timingSafeEqual(pin, correctPin);

    if (!isPinValid) {
      // Затримка 1 секунда проти атак повного перебору (brute-force)
      await new Promise((resolve) => setTimeout(resolve, 1000));

      const currentCount = (tracker?.count || 0) + 1;
      if (currentCount >= 5) {
        failedAttempts.set(ip, {
          count: currentCount,
          blockedUntil: now + 15 * 60 * 1000,
        });
      } else {
        failedAttempts.set(ip, { count: currentCount, blockedUntil: 0 });
      }

      return NextResponse.json({ error: "Невірний PIN-код" }, { status: 401 });
    }

    // Скидаємо лічильник при успішному вході
    failedAttempts.delete(ip);

    // Створюємо криптографічно підписаний HMAC-SHA256 токен
    const sessionToken = await createSessionToken();

    const cookieStore = await cookies();
    cookieStore.set("finance_session", sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 60 * 60 * 24 * 30, // 30 днів
      path: "/",
    });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Помилка сервера" }, { status: 500 });
  }
}

export async function GET() {
  const cookieStore = await cookies();
  const session = cookieStore.get("finance_session")?.value;

  const { valid } = await verifySessionToken(session);
  return NextResponse.json({ authenticated: valid });
}

export async function DELETE() {
  const cookieStore = await cookies();
  cookieStore.delete("finance_session");
  return NextResponse.json({ success: true });
}
