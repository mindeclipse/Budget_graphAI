import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
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

// GET: генерація виклику (challenge) для створення Passkey
export async function GET(req: Request) {
  const cookieStore = await cookies();
  const session = cookieStore.get("finance_session")?.value;
  const correctPin = process.env.APP_ACCESS_PIN;

  // Реєструвати пристрій дозволено лише після входу за PIN
  if (!correctPin || session !== correctPin) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  }

  const { rpID } = getRpInfo(req);

  // Отримуємо вже зареєстровані ключі, щоб не створювати дублікатів
  const { data: existing } = await supabase
    .from("webauthn_credentials")
    .select("id, transports");

  const excludeCredentials =
    existing?.map((c) => ({
      id: c.id,
      transports: c.transports,
    })) || [];

  const options = await generateRegistrationOptions({
    rpName: "Особисті Фінанси",
    rpID,
    userID: new TextEncoder().encode("owner"),
    userName: "owner@finance",
    userDisplayName: "Власник",
    attestationType: "none",
    excludeCredentials,
    authenticatorSelection: {
      residentKey: "preferred",
      userVerification: "preferred",
    },
  });

  // Зберігаємо challenge у тимчасову куку на 5 хвилин
  cookieStore.set("webauthn_reg_challenge", options.challenge, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: 300,
    path: "/",
  });

  return NextResponse.json(options);
}

// POST: перевірка криптографічної відповіді пристрою та запис публічного ключа
export async function POST(req: Request) {
  const cookieStore = await cookies();
  const expectedChallenge = cookieStore.get("webauthn_reg_challenge")?.value;

  if (!expectedChallenge) {
    return NextResponse.json({ error: "Виклик застарів" }, { status: 400 });
  }

  const body = await req.json();
  const { rpID, expectedOrigin } = getRpInfo(req);

  try {
    const verification = await verifyRegistrationResponse({
      response: body,
      expectedChallenge,
      expectedOrigin,
      expectedRPID: rpID,
    });

    if (!verification.verified || !verification.registrationInfo) {
      return NextResponse.json(
        { error: "Помилка валідації біометрії" },
        { status: 400 }
      );
    }

    const { credential, credentialDeviceType, credentialBackedUp } =
      verification.registrationInfo;

    // Публічний ключ конвертуємо в base64 для зручного збереження в Supabase
    const publicKeyBase64 = Buffer.from(credential.publicKey).toString(
      "base64url"
    );

    await supabase.from("webauthn_credentials").insert({
      id: credential.id,
      public_key: publicKeyBase64,
      counter: credential.counter,
      device_type: credentialDeviceType,
      backed_up: credentialBackedUp,
      transports: credential.transports || [],
    });

    cookieStore.delete("webauthn_reg_challenge");

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Помилка реєстрації WebAuthn:", err);
    return NextResponse.json(
      { error: "Не вдалося прив'язати пристрій" },
      { status: 500 }
    );
  }
}
