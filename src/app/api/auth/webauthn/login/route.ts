import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from "@simplewebauthn/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import {
  createSessionToken,
  sealChallengeToken,
  verifyChallengeToken,
} from "@/lib/session";
import {
  getCachedCredentials,
  setCachedCredentials,
  updateCachedCredentialCounter,
} from "@/lib/webauthn-cache";

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

// GET: запит параметрів для виклику сканера Face ID / Touch ID (з pre-warming підтримкою)
export async function GET(req: Request) {
  const { rpID } = getRpInfo(req);
  const supabase = getSupabaseAdmin();

  let credentials = getCachedCredentials();

  if (!credentials) {
    const { data: dbData, error } = await supabase
      .from("webauthn_credentials")
      .select("id, transports, public_key, counter");

    if (error) {
      console.error("[WebAuthn Login GET] DB error:", error);
      return NextResponse.json(
        { error: "Помилка завантаження ключів" },
        { status: 500 }
      );
    }

    if (!dbData || dbData.length === 0) {
      return NextResponse.json(
        { error: "Не знайдено прив'язаних пристроїв" },
        { status: 404 }
      );
    }

    credentials = dbData;
    setCachedCredentials(dbData);
  }

  const options = await generateAuthenticationOptions({
    rpID,
    allowCredentials: credentials.map((c) => ({
      id: c.id,
      transports: c.transports,
    })),
    userVerification: "preferred",
  });

  // Запечатуємо challenge та публічні ключі в HMAC-підписаний токен
  const sealedChallenge = await sealChallengeToken(
    options.challenge,
    credentials,
    300 // 5 хвилин
  );

  const cookieStore = await cookies();
  cookieStore.set("webauthn_auth_challenge", sealedChallenge, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: 300,
    path: "/",
  });

  return NextResponse.json(options);
}

// POST: швидка перевірка підпису Face ID без повторного SELECT до бази даних
export async function POST(req: Request) {
  const cookieStore = await cookies();
  const rawChallengeCookie = cookieStore.get("webauthn_auth_challenge")?.value;

  if (!rawChallengeCookie) {
    return NextResponse.json({ error: "Виклик застарів" }, { status: 400 });
  }

  const body = await req.json();
  const { rpID, expectedOrigin } = getRpInfo(req);
  const supabase = getSupabaseAdmin();

  // 1. Спроба валідації запечатаного токена (Zero DB SELECT Latency)
  const { valid, payload } = await verifyChallengeToken(rawChallengeCookie);

  let expectedChallenge: string;
  let dbCredential: {
    id: string;
    public_key: string;
    counter: number;
    transports?: any;
  } | null = null;

  if (valid && payload) {
    expectedChallenge = payload.challenge;
    dbCredential = payload.credentials.find((c) => c.id === body.id) || null;
  } else {
    // Безпечний fallback для застарілих / незапечатаних кук
    expectedChallenge = rawChallengeCookie;
    const { data: fetchCredential, error: fetchError } = await supabase
      .from("webauthn_credentials")
      .select("*")
      .eq("id", body.id)
      .maybeSingle();

    if (fetchError || !fetchCredential) {
      console.error("[WebAuthn Login POST] Fallback fetch error:", fetchError);
      return NextResponse.json(
        { error: "Пристрій не розпізнано" },
        { status: 404 }
      );
    }
    dbCredential = fetchCredential;
  }

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

    const newCounter = verification.authenticationInfo.newCounter;

    // Оновлюємо лічильник у локальному пам'ятному кеші
    if (dbCredential) {
      updateCachedCredentialCounter(dbCredential.id, newCounter);
    }

    // Захист від Replay: одноразове спалювання challenge
    cookieStore.delete("webauthn_auth_challenge");

    // Виставляємо підписану сесійну куку на 30 днів
    const sessionToken = await createSessionToken();
    cookieStore.set("finance_session", sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 60 * 60 * 24 * 30,
      path: "/",
    });

    // Оновлення лічильника в БД (захист від клонування ключів)
    void (async () => {
      try {
        const { error } = await supabase
          .from("webauthn_credentials")
          .update({ counter: newCounter })
          .eq("id", dbCredential.id);
        if (error) {
          console.error(
            "[WebAuthn Login POST] Counter update DB error:",
            error
          );
        }
      } catch (err: unknown) {
        console.error("[WebAuthn Login POST] Counter update exception:", err);
      }
    })();

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Помилка біометричної аутентифікації:", err);
    return NextResponse.json(
      { error: "Помилка автентифікації" },
      { status: 500 }
    );
  }
}
