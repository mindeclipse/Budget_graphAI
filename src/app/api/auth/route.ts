import { NextResponse } from "next/server";
import { cookies } from "next/headers";

// Простий in-memory трекер невдалих спроб
const failedAttempts = new Map<
  string,
  { count: number; blockedUntil: number }
>();

export async function POST(req: Request) {
  try {
    const ip = req.headers.get("x-forwarded-for") || "unknown";
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

    if (!correctPin || pin !== correctPin) {
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

    const cookieStore = await cookies();
    cookieStore.set("finance_session", correctPin, {
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
  const correctPin = process.env.APP_ACCESS_PIN;

  const isAuthenticated = Boolean(correctPin && session === correctPin);
  return NextResponse.json({ authenticated: isAuthenticated });
}

export async function DELETE() {
  const cookieStore = await cookies();
  cookieStore.delete("finance_session");
  return NextResponse.json({ success: true });
}
