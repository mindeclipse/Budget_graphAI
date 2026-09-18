import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Серверний fallback для Web Share Target API.
 * Якщо Service Worker ще не контролює клієнт, запит перехоплюється цим обробником.
 */
export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const title = (formData.get("title") as string) || "";
    const text = (formData.get("text") as string) || "";
    const url = (formData.get("url") as string) || "";

    const params = new URLSearchParams();
    params.set("action", "shared_receipt");

    if (text || title) {
      params.set("shared_text", (text || title).slice(0, 500));
    }
    if (url) {
      params.set("shared_url", url.slice(0, 500));
    }

    const redirectUrl = new URL(`/?${params.toString()}`, req.url);
    return NextResponse.redirect(redirectUrl, 303);
  } catch (error) {
    console.error("[Share Target Route Error]:", error);
    return NextResponse.redirect(
      new URL("/?action=shared_receipt", req.url),
      303
    );
  }
}

export async function GET(req: Request) {
  return NextResponse.redirect(new URL("/", req.url), 303);
}
