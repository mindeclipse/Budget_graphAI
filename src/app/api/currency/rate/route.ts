import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifySessionToken } from "@/lib/session";
import { getCommercialRates } from "@/lib/currency";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const cookieStore = await cookies();
    const session = cookieStore.get("finance_session")?.value;
    const { valid } = await verifySessionToken(session);

    if (!valid) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rates = await getCommercialRates();

    return NextResponse.json(
      {
        success: true,
        rates,
        rate: rates.USD, // для зворотної сумісності з попередніми викликами
      },
      {
        headers: {
          "Cache-Control": "private, max-age=120, stale-while-revalidate=600",
        },
      }
    );
  } catch (error: any) {
    console.error("[API currency/rate GET error]:", error);
    return NextResponse.json(
      {
        success: false,
        rates: { USD: 44.0, EUR: 48.0, PLN: 11.0 },
        rate: 44.0,
      },
      { status: 200 }
    );
  }
}
