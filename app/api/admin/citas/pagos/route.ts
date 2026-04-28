import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: profile } = await supabase.from("users").select("rol").eq("id", user.id).single();
  if (profile?.rol !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data, error } = await supabase
    .from("citas")
    .select(`
      id, estado_sync, fecha_hora_cita, servicio_asociado, created_at,
      user:users!paciente_id(nombre_completo, telefono),
      pago:pagos(id, metodo, estado, monto, link_url, referencia, notas)
    `)
    .in("estado_sync", ["pendiente_pago", "pendiente_admin"])
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // PostgREST returns `pago` as an array (one-to-many). Normalize to single object.
  const citas = (data ?? []).map((c) => ({
    ...c,
    pago: Array.isArray(c.pago) ? (c.pago[0] ?? null) : c.pago,
  }));

  return NextResponse.json({ citas });
}
