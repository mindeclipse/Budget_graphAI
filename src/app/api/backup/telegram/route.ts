import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { timingSafeEqual } from "@/lib/security";
import { verifySessionToken } from "@/lib/session";
import { sendBackupToTelegram } from "@/lib/backup-service";

export const dynamic = "force-dynamic";

let lastBackupTimestamp = 0;
const BACKUP_COOLDOWN_MS = 30 * 1000; // 30 секунд захисту від спаму/флуду

async function isAuthorized(req: NextRequest): Promise<boolean> {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (
    cronSecret &&
    authHeader &&
    timingSafeEqual(authHeader, `Bearer ${cronSecret}`)
  ) {
    return true;
  }

  const cookieStore = await cookies();
  const session = cookieStore.get("finance_session")?.value;
  const { valid } = await verifySessionToken(session);
  if (valid) {
    return true;
  }

  if (process.env.NODE_ENV !== "production" && !cronSecret) {
    return true;
  }

  return false;
}

export async function POST(req: NextRequest) {
  try {
    if (!(await isAuthorized(req))) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const now = Date.now();
    if (now - lastBackupTimestamp < BACKUP_COOLDOWN_MS) {
      const waitSeconds = Math.ceil(
        (BACKUP_COOLDOWN_MS - (now - lastBackupTimestamp)) / 1000
      );
      return NextResponse.json(
        {
          error: `Зачекайте ${waitSeconds} сек. перед повторною відправкою бекапу`,
        },
        { status: 429 }
      );
    }
    lastBackupTimestamp = now;

    const result = await sendBackupToTelegram();

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || "Не вдалося надіслати бекап" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Резервну копію успішно надіслано в Telegram",
      fileName: result.fileName,
    });
  } catch (err: any) {
    console.error("[API backup telegram error]:", err);
    return NextResponse.json(
      {
        error:
          process.env.NODE_ENV === "production"
            ? "Помилка відправки бекапу"
            : err?.message,
      },
      { status: 500 }
    );
  }
}
