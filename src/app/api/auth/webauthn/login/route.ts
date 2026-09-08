import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from "@simplewebauthn/server";
import { supabase } from "@/lib/supabase";

function getRpInfo(req: Request) {
  const host =
    req.headers.get("x-forwarded-host") ||
    req.headers.get("host") ||
    "localhost:3000";
  const proto =
    req.headers.get("x-forwarded-proto") ||
    (host.includes("localhost") ? "http" : "https");
  const [rpID] = host.split(":");
  return { rpID, expectedOrigin: `${proto}://${host}` };
}

// GET: запит параметрів для виклику сканера Face ID / Touch ID
export async function GET(req: Request) {
  const { rpID } = getRpInfo(req);

  const { data: credentials } = await supabase
    .from("webauthn_credentials")
    .select("id, transports");

  if (!credentials || credentials.length === 0) {
    return NextResponse.json(
      { error: "Не знайдено прив'язаних пристроїв" },
      { status: 404 }
    );
  }

  const options = await generateAuthenticationOptions({
    rpID,
    allowCredentials: credentials.map((c) => ({
      id: c.id,
      transports: c.transports,
    })),
    userVerification: "preferred",
  });

  const cookieStore = await cookies();
  cookieStore.set("webauthn_auth_challenge", options.challenge, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: 300,
    path: "/",
  });

  return NextResponse.json(options);
}

// POST: перевірка підпису Face ID та видача session cookie
export async function POST(req: Request) {
  const cookieStore = await cookies();
  const expectedChallenge = cookieStore.get("webauthn_auth_challenge")?.value;

  if (!expectedChallenge) {
    return NextResponse.json({ error: "Виклик застарів" }, { status: 400 });
  }

  const body = await req.json();
  const { rpID, expectedOrigin } = getRpInfo(req);

  const { data: dbCredential } = await supabase
    .from("webauthn_credentials")
    .select("*")
    .eq("id", body.id)
    .maybeSingle();

  if (!dbCredential) {
    return NextResponse.json(
      { error: "Пристрій не розпізнано" },
      { status: 404 }
    );
  }

  try {
    const verification = await verifyAuthenticationResponse({
      response: body,
      expectedChallenge,
      expectedOrigin,
      expectedRPID: rpID,
      credential: {
        id: dbCredential.id,
        publicKey: Buffer.from(dbCredential.public_key, "base64url"),
        counter: Number(dbCredential.counter),
        transports: dbCredential.transports,
      },
    });

    if (!verification.verified) {
      return NextResponse.json(
        { error: "Біометричний підпис не підтверджено" },
        { status: 401 }
      );
    }

    // Оновлюємо лічильник для захисту від повторних атак (replay attacks)
    await supabase
      .from("webauthn_credentials")
      .update({ counter: verification.authenticationInfo.newCounter })
      .eq("id", dbCredential.id);

    cookieStore.delete("webauthn_auth_challenge");

    // Виставляємо ту саму сесійну куку, що й при введенні PIN-коду
    const correctPin = process.env.APP_ACCESS_PIN;
    if (correctPin) {
      cookieStore.set("finance_session", correctPin, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        maxAge: 60 * 60 * 24 * 30, // 30 днів
        path: "/",
      });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Помилка біометричної аутентифікації:", err);
    return NextResponse.json(
      { error: "Помилка автентифікації" },
      { status: 500 }
    );
  }
}
