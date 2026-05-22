import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { parseCitaError } from "@/lib/citas/errors";

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const params = req.nextUrl.searchParams;
  const doctorId    = params.get("doctor_id");
  const fechaInicio = params.get("fecha_inicio");
  const fechaFin    = params.get("fecha_fin");

  if (!doctorId || !fechaInicio || !fechaFin) {
    return NextResponse.json(
      { error: "Missing doctor_id, fecha_inicio or fecha_fin" },
      { status: 400 },
    );
  }

  const { data, error } = await supabase.rpc("obtener_dias_disponibles", {
    p_doctor_id:    doctorId,
    p_fecha_inicio: fechaInicio,
    p_fecha_fin:    fechaFin,
  });

  if (error) {
    const parsed = parseCitaError(error.message);
    return NextResponse.json(
      { error: parsed.code, i18nKey: parsed.i18nKey },
      { status: parsed.status },
    );
  }

  return NextResponse.json({ dias: data ?? [] });
}
