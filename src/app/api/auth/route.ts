import { NextResponse } from "next/server";
import { cookies } from "next/headers";

export async function POST(req: Request) {
  try {
    const { pin } = await req.json();
    const correctPin = process.env.APP_ACCESS_PIN;

    if (!correctPin || pin !== correctPin) {
      return NextResponse.json({ error: "Невірний PIN" }, { status: 401 });
    }

    // Встановлюємо безпечну HTTP-only куку на 30 днів
    const cookieStore = await cookies();
    cookieStore.set("finance_session", correctPin, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 60 * 60 * 24 * 30,
      path: "/",
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: "Помилка авторизації" }, { status: 500 });
  }
}

export async function GET() {
  const cookieStore = await cookies();
  const session = cookieStore.get("finance_session")?.value;
  const correctPin = process.env.APP_ACCESS_PIN;

  const isAuthenticated = Boolean(correctPin && session === correctPin);
  return NextResponse.json({ authenticated: isAuthenticated });
}