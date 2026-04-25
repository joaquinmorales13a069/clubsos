/**
 * GET /api/ea/disponibilidad?providerId=X&serviceId=Y&date=YYYY-MM-DD
 *
 * Server-side proxy to Easy!Appointments availabilities endpoint.
 * Keeps EA credentials out of client-side code.
 * Returns: string[] of available times in "HH:MM" 24h format.
 */

import { NextRequest, NextResponse } from "next/server";

const EA_BASE = process.env.NEXT_PUBLIC_EA_API_URL ?? "";
const EA_KEY  = process.env.EA_API_KEY ?? "";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const providerId = searchParams.get("providerId");
  const serviceId  = searchParams.get("serviceId");
  const date       = searchParams.get("date");

  if (!providerId || !serviceId || !date) {
    return NextResponse.json(
      { error: "providerId, serviceId, and date are required" },
      { status: 400 },
    );
  }

  if (!EA_BASE || !EA_KEY) {
    return NextResponse.json(
      { error: "EA API not configured" },
      { status: 500 },
    );
  }

  // Normalize EA_BASE: remove trailing slash and redundant /api/v1 if present
  const base = EA_BASE.replace(/\/+$/, "").replace(/\/api\/v1$/, "");
  const url = `${base}/api/v1/availabilities?providerId=${providerId}&serviceId=${serviceId}&date=${date}`;

  try {
    const res = await fetch(url, {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${EA_KEY}`,
      },
      // Revalidate every 60s — slots change as bookings come in
      next: { revalidate: 60 },
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: `EA API error (HTTP ${res.status})` },
        { status: res.status },
      );
    }

    const data: unknown = await res.json();
    const slots = Array.isArray(data) ? (data as string[]) : [];
    return NextResponse.json(slots);
  } catch {
    return NextResponse.json(
      { error: "Failed to reach EA API" },
      { status: 502 },
    );
  }
}
