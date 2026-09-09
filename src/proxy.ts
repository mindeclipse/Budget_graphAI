import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "@/lib/security";
import { verifySessionToken } from "@/lib/session";

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // 1. Публічні винятки: автентифікація, вебхуки, крон, системні файли та ресурси PWA
  if (
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/api/webhooks") ||
    pathname.startsWith("/api/cron") ||
    pathname.startsWith("/_next") ||
    pathname === "/favicon.ico" ||
    pathname === "/manifest.json" ||
    pathname === "/manifest.webmanifest" ||
    pathname === "/sw.js" ||
    pathname.match(/\.(png|jpg|jpeg|svg|webp|ico)$/)
  ) {
    return NextResponse.next();
  }

  // 2. Авторизація зовнішніх викликів для Apple Shortcuts через Bearer-токен
  if (pathname.startsWith("/api/classify")) {
    const authHeader = req.headers.get("authorization");
    const secretKey = process.env.APP_API_SECRET;

    // Якщо ключ налаштований і співпадає із заголовком Bearer (постійне за часом порівняння)
    if (
      secretKey &&
      authHeader &&
      timingSafeEqual(authHeader, `Bearer ${secretKey}`)
    ) {
      return NextResponse.next();
    }

    return NextResponse.json(
      { error: "Unauthorized: Invalid or missing Bearer token" },
      { status: 401 }
    );
  }

  const session = req.cookies.get("finance_session")?.value;
  const { valid } = await verifySessionToken(session);

  // 3. Блокування неавторизованих звернень до внутрішніх API веб-інтерфейсу
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
