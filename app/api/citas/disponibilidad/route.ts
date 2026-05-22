import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { parseCitaError } from "@/lib/citas/errors";

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const params = req.nextUrl.searchParams;
  const doctorId   = params.get("doctor_id");
  const servicioId = params.get("servicio_id");
  const fecha      = params.get("fecha");

  if (!doctorId || !servicioId || !fecha) {
    return NextResponse.json(
      { error: "Missing doctor_id, servicio_id or fecha" },
      { status: 400 },
    );
  }

  const { data, error } = await supabase.rpc("obtener_slots_disponibles", {
    p_doctor_id:   doctorId,
    p_servicio_id: servicioId,
    p_fecha:       fecha,
  });

  if (error) {
    const parsed = parseCitaError(error.message);
    return NextResponse.json(
      { error: parsed.code, i18nKey: parsed.i18nKey },
      { status: parsed.status },
    );
  }

  return NextResponse.json({ slots: data ?? [] });
}
