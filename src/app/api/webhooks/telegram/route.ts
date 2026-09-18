import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { handleTelegramCallbackQuery } from "@/lib/telegram-bot";
import { validateTelegramSecret, isAuthorizedChat } from "./auth";
import {
  handleStartHelpCommand,
  handleBotInquiry,
} from "./handlers/commands-handler";
import {
  handlePhotoReceipt,
  handleDocumentReceipt,
} from "./handlers/receipt-handler";
import { handleTextMessage } from "./handlers/text-expense-handler";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  return NextResponse.json({ status: "Telegram Webhook Active" });
}

export async function POST(req: NextRequest) {
  if (!validateTelegramSecret(req)) {
    console.warn(
      "[Telegram Webhook] Unauthorized request: invalid secret token"
    );
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const supabaseAdmin = getSupabaseAdmin();
    const authorizedChatId = process.env.TELEGRAM_CHAT_ID;

    // 1. Обробка inline кнопок (callback_query)
    if (body.callback_query) {
      const incomingChatId =
        body.callback_query.message?.chat?.id || body.callback_query.from?.id;

      if (!isAuthorizedChat(incomingChatId, authorizedChatId)) {
        console.warn(
          `[Telegram Webhook] Unauthorized callback_query from chatId: ${incomingChatId}`
        );
        return NextResponse.json({ ok: true });
      }

      await handleTelegramCallbackQuery(body.callback_query, supabaseAdmin);
      return NextResponse.json({ ok: true });
    }

    // 2. Обробка вхідних повідомлень
    const message = body.message;
    if (!message) {
      return NextResponse.json({ ok: true });
    }

    const chatId = message.chat?.id;
    if (!isAuthorizedChat(chatId, authorizedChatId)) {
      console.warn(
        `[Telegram Webhook] Unauthorized message from chatId: ${chatId}`
      );
      return NextResponse.json({ ok: true });
    }

    const text = message.text?.trim() || "";

    // А. Команди початку роботи / допомоги
    if (text === "/start" || text === "/help" || text === "/menu") {
      await handleStartHelpCommand();
      return NextResponse.json({ ok: true });
    }

    // Б. Обробка фотографій (скріншоти чеків)
    if (Array.isArray(message.photo) && message.photo.length > 0) {
      await handlePhotoReceipt(message, supabaseAdmin);
      return NextResponse.json({ ok: true });
    }

    // В. Обробка документів (PDF / нестиснені чеки)
    if (message.document) {
      await handleDocumentReceipt(message, supabaseAdmin);
      return NextResponse.json({ ok: true });
    }

    // Г. Обробка тексту: системні та аналітичні запити (темп, цикл, графік, подушка, What-If)
    if (text) {
      const handledInquiry = await handleBotInquiry(text, supabaseAdmin);
      if (handledInquiry) {
        return NextResponse.json({ ok: true });
      }

      // Д. Запис витрати природною мовою або AI асистент
      await handleTextMessage(text, supabaseAdmin);
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error("[Telegram Webhook Error]:", error);
    // Завжди повертаємо 200 Telegram, щоб запобігти шторму повторних запитів
    return NextResponse.json({ ok: true });
  }
}
