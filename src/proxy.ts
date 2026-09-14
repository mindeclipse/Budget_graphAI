import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "@/lib/security";
import { verifySessionToken } from "@/lib/session";

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // 1. Статичні ресурси PWA та Next.js
  if (
    pathname.startsWith("/_next") ||
    pathname === "/favicon.ico" ||
    pathname === "/manifest.json" ||
    pathname === "/manifest.webmanifest" ||
    pathname === "/sw.js" ||
    pathname.match(/\.(png|jpg|jpeg|svg|webp|ico)$/)
  ) {
    return NextResponse.next();
  }

  // 2. Публічні винятки: автентифікація, вебхуки, крон
  if (
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/api/webhooks") ||
    pathname.startsWith("/api/cron")
  ) {
    return NextResponse.next();
  }

  // 3. Авторизація зовнішніх викликів через Bearer-токен (Apple Shortcuts, Cron)
  const authHeader = req.headers.get("authorization");
  const appSecretKey = process.env.APP_API_SECRET;
  const cronSecretKey = process.env.CRON_SECRET;

  // А. Шорткат класифікації чеків Apple Pay (/api/classify)
  if (pathname.startsWith("/api/classify")) {
    if (
      appSecretKey &&
      authHeader &&
      timingSafeEqual(authHeader, `Bearer ${appSecretKey}`)
    ) {
      return NextResponse.next();
    }

    return NextResponse.json(
      { error: "Unauthorized: Invalid or missing Bearer token" },
      { status: 401 }
    );
  }

  // Б. Шорткат округлення залишку (/api/roundup/balance)
  if (pathname.startsWith("/api/roundup/balance")) {
    if (
      appSecretKey &&
      authHeader &&
      timingSafeEqual(authHeader, `Bearer ${appSecretKey}`)
    ) {
      return NextResponse.next();
    }
    // Якщо Bearer відсутній, продовжуємо перевірку сесії користувача нижче
  }

  // В. Віддалений запуск бекапу в Telegram (/api/backup/telegram)
  if (pathname.startsWith("/api/backup/telegram")) {
    if (
      cronSecretKey &&
      authHeader &&
      timingSafeEqual(authHeader, `Bearer ${cronSecretKey}`)
    ) {
      return NextResponse.next();
    }
    // Якщо Bearer відсутній, продовжуємо перевірку сесії користувача нижче
  }

  // Г. Віджет для iPhone (/api/widget/summary)
  if (pathname.startsWith("/api/widget/summary")) {
    if (
      appSecretKey &&
      authHeader &&
      timingSafeEqual(authHeader, `Bearer ${appSecretKey}`)
    ) {
      return NextResponse.next();
    }
    // Якщо Bearer відсутній, продовжуємо перевірку сесії користувача нижче
  }

  // 4. Захист від CSRF для всіх сесійних змінюючих запитів браузера (POST, PATCH, DELETE, PUT)
  if (["POST", "PATCH", "DELETE", "PUT"].includes(req.method)) {
    const origin = req.headers.get("origin");
    if (origin) {
      try {
        const originHost = new URL(origin).host;
        const host =
          req.headers.get("x-forwarded-host") || req.headers.get("host");

        if (host && originHost !== host) {
          return NextResponse.json(
            { error: "Forbidden: Cross-Origin request blocked" },
            { status: 403 }
          );
        }
      } catch {
        return NextResponse.json(
          { error: "Forbidden: Invalid Origin header" },
          { status: 403 }
        );
      }
    }
  }

  const session = req.cookies.get("finance_session")?.value;
  const { valid } = await verifySessionToken(session);

  // 5. Блокування неавторизованих звернень до внутрішніх API веб-інтерфейсу
  if (!valid) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    // Для сторінок дозволяємо завантаження UI, де клієнт покаже екран авторизації
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
