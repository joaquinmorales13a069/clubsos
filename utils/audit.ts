import type { SupabaseClient } from "@supabase/supabase-js";

type LogActionParams = {
  actorId: string;
  actorRol: string;
  accion: string;
  entidad: string;
  entidadId?: string;
  datosDespues?: Record<string, unknown>;
  datosAntes?: Record<string, unknown>;
  ipAddress?: string | null;
  metadata?: Record<string, unknown>;
};

export async function logAction(
  supabase: SupabaseClient,
  params: LogActionParams,
): Promise<void> {
  const { error } = await supabase.from("audit_logs").insert({
    actor_id:      params.actorId,
    actor_rol:     params.actorRol,
    accion:        params.accion,
    entidad:       params.entidad,
    entidad_id:    params.entidadId,
    datos_antes:   params.datosAntes,
    datos_despues: params.datosDespues,
    ip_address:    params.ipAddress,
    metadata:      params.metadata ?? {},
  });

  if (error) {
    console.error("[audit] logAction failed:", error.message);
  }
}
