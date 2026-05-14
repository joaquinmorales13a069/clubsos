/**
 * GET /api/ea/disponibilidad?providerId=X&serviceId=Y&date=YYYY-MM-DD
 *
 * Server-side proxy to Easy!Appointments availabilities endpoint.
 * Keeps EA credentials out of client-side code.
 * Returns: string[] of available times in "HH:MM" 24h format,
 * with slots already booked in the local DB (pending/confirmed) removed.
 */

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/utils/supabase/service";

const EA_BASE = process.env.NEXT_PUBLIC_EA_API_URL ?? "";
const EA_KEY  = process.env.EA_API_KEY ?? "";

/** Extract "HH:MM" (Nicaragua UTC-6) from a UTC timestamptz string. */
function toNicaraguaTime(utcStr: string): string {
  const d = new Date(utcStr);
  const h = (d.getUTCHours() - 6 + 24) % 24;
  const m = d.getUTCMinutes();
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

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
      // 60s cache on EA — live DB filter below keeps the result accurate
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

    if (slots.length === 0) return NextResponse.json(slots);

    // ── Filter out slots already booked in the local DB ───────────────────────
    // Nicaragua midnight in UTC: date T00:00:00-06:00 = date T06:00:00Z
    const dayStart = new Date(`${date}T00:00:00-06:00`).toISOString();
    const dayEnd   = new Date(`${date}T24:00:00-06:00`).toISOString();

    const { data: booked } = await createServiceClient()
      .from("citas")
      .select("fecha_hora_cita")
      .eq("ea_provider_id", parseInt(providerId, 10))
      .eq("ea_service_id",  parseInt(serviceId,  10))
      .gte("fecha_hora_cita", dayStart)
      .lt("fecha_hora_cita",  dayEnd)
      .not("estado_sync", "in", "(cancelado,rechazado)");

    if (booked && booked.length > 0) {
      const bookedTimes = new Set(booked.map(r => toNicaraguaTime(r.fecha_hora_cita)));
      return NextResponse.json(slots.filter(s => !bookedTimes.has(s)));
    }

    return NextResponse.json(slots);
  } catch {
    return NextResponse.json(
      { error: "Failed to reach EA API" },
      { status: 502 },
    );
  }
}
