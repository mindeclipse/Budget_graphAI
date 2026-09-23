import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifySessionToken } from "@/lib/session";

async function checkAuthSession(): Promise<boolean> {
  const cookieStore = await cookies();
  const session = cookieStore.get("finance_session")?.value;
  const { valid } = await verifySessionToken(session);
  return valid;
}

export async function POST(req: Request) {
  try {
    if (!(await checkAuthSession())) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { url } = await req.json();
    if (!url || typeof url !== "string") {
      return NextResponse.json({ error: "URL is required" }, { status: 400 });
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
      if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
        return NextResponse.json(
          { error: "Invalid protocol" },
          { status: 400 }
        );
      }
    } catch {
      return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4500);

    try {
      const response = await fetch(parsedUrl.toString(), {
        signal: controller.signal,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
          "Accept-Language": "uk-UA,uk;q=0.9,en-US;q=0.8,en;q=0.7",
        },
      });

      clearTimeout(timeout);

      if (response.status === 403 || response.status === 503) {
        return NextResponse.json({
          success: false,
          reason: "anti_bot",
          message: "Сайт захищено від автоматичного сканування",
        });
      }

      if (!response.ok) {
        return NextResponse.json({
          success: false,
          reason: "http_error",
          status: response.status,
        });
      }

      const html = await response.text();

      // 1. Пошук у schema.org JSON-LD
      const jsonLdRegex =
        /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
      let match: RegExpExecArray | null;

      while ((match = jsonLdRegex.exec(html)) !== null) {
        try {
          const parsed = JSON.parse(match[1]);
          const checkNode = (
            node: any
          ): { price?: number; currency?: string; title?: string } | null => {
            if (!node || typeof node !== "object") return null;

            // Перевірка графу
            if (Array.isArray(node["@graph"])) {
              for (const sub of node["@graph"]) {
                const res = checkNode(sub);
                if (res?.price) return res;
              }
            }

            const type = node["@type"];
            const isProduct =
              type === "Product" ||
              (Array.isArray(type) && type.includes("Product"));

            if (isProduct) {
              const title = node.name || undefined;
              const offers = Array.isArray(node.offers)
                ? node.offers[0]
                : node.offers;
              if (offers) {
                const rawPrice =
                  offers.price ?? offers.lowPrice ?? offers.highPrice;
                const priceNum = parseFloat(
                  String(rawPrice).replace(/[^\d.]/g, "")
                );
                if (!isNaN(priceNum) && priceNum > 0) {
                  return {
                    price: priceNum,
                    currency: offers.priceCurrency || "UAH",
                    title,
                  };
                }
              }
            }

            if (type === "Offer") {
              const rawPrice = node.price ?? node.lowPrice;
              const priceNum = parseFloat(
                String(rawPrice).replace(/[^\d.]/g, "")
              );
              if (!isNaN(priceNum) && priceNum > 0) {
                return {
                  price: priceNum,
                  currency: node.priceCurrency || "UAH",
                  title: node.name,
                };
              }
            }

            return null;
          };

          const found = checkNode(parsed);
          if (found && found.price) {
            return NextResponse.json({
              success: true,
              price: found.price,
              currency: found.currency || "UAH",
              title: found.title,
              source: "json-ld",
            });
          }
        } catch {
          // ignore JSON-LD parse error
        }
      }

      // 2. Пошук у метатегах OpenGraph
      const ogPriceMatch =
        html.match(
          /<meta[^>]*property=["'](?:product|og):price:amount["'][^>]*content=["']([^"']+)["']/i
        ) ||
        html.match(
          /<meta[^>]*content=["']([^"']+)["'][^>]*property=["'](?:product|og):price:amount["']/i
        );

      if (ogPriceMatch) {
        const raw = ogPriceMatch[1];
        const priceNum = parseFloat(raw.replace(/[^\d.]/g, ""));
        if (!isNaN(priceNum) && priceNum > 0) {
          const ogCurrencyMatch =
            html.match(
              /<meta[^>]*property=["'](?:product|og):price:currency["'][^>]*content=["']([^"']+)["']/i
            ) ||
            html.match(
              /<meta[^>]*content=["']([^"']+)["'][^>]*property=["'](?:product|og):price:currency["']/i
            );

          const ogTitleMatch =
            html.match(
              /<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i
            ) ||
            html.match(
              /<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:title["']/i
            );

          return NextResponse.json({
            success: true,
            price: priceNum,
            currency: ogCurrencyMatch
              ? ogCurrencyMatch[1].toUpperCase()
              : "UAH",
            title: ogTitleMatch ? ogTitleMatch[1] : undefined,
            source: "opengraph",
          });
        }
      }

      return NextResponse.json({
        success: false,
        reason: "not_found",
        message: "Ціну не знайдено в розмітці сторінки",
      });
    } catch (err: any) {
      clearTimeout(timeout);
      if (err.name === "AbortError") {
        return NextResponse.json({
          success: false,
          reason: "timeout",
          message: "Час очікування відповіді сайту вичерпано",
        });
      }
      return NextResponse.json({
        success: false,
        reason: "network_error",
        message: err.message,
      });
    }
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Server error" },
      { status: 500 }
    );
  }
}
