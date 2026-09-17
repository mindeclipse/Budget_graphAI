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
        rates: { USD: 41.5, EUR: 45.3, PLN: 10.6 },
        rate: 41.5,
      },
      { status: 200 }
    );
  }
}
