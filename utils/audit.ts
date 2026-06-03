import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/utils/supabase/service";

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

/**
 * Write to public.audit_logs. The `audit_no_client_insert` RLS policy blocks
 * INSERTs from anon/authenticated/admin client sessions by design — only
 * service_role bypasses RLS. So this helper always builds its own service
 * client internally regardless of what the caller passes.
 *
 * The first argument is kept for API compatibility with existing call sites;
 * it is intentionally ignored. Callers may pass `null` or any client.
 */
export async function logAction(
  _supabase: SupabaseClient | null,
  params: LogActionParams,
): Promise<void> {
  const service = createServiceClient();
  const { error } = await service.from("audit_logs").insert({
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
