"use server";

/**
 * Server Actions for citas (appointment) management.
 * RLS on public.citas (citas_miembro_crud) enforces auth.uid() = paciente_id.
 *
 * NOTE: After the native citas module migration, creation flows through the
 * wizard (POST /api/citas, using the RPC crear_cita_native). The crearCita
 * server action has been removed; only cancelarCita remains for the cancel
 * button on existing cita cards.
 */

import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { logAction } from "@/utils/audit";

// ── cancelarCita ──────────────────────────────────────────────────────────────
//
// The second `_legacyEaId` parameter is kept for backward compatibility with
// existing callers (CitaCard) that still pass it; it is ignored. The signature
// will be cleaned up in Phase 3 when the wizard/miembro components are migrated.

export async function cancelarCita(citaId: string, _legacyEaId?: string | null) {
  void _legacyEaId; // unused — preserved for caller compatibility
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "No autenticado" };

  const { data: profile } = await supabase
    .from("users").select("rol").eq("id", user.id).single();

  const { error } = await supabase
    .from("citas")
    .update({ estado_sync: "cancelado" })
    .eq("id", citaId);

  if (error) return { error: error.message };

  await logAction(supabase, {
    actorId:      user.id,
    actorRol:     profile?.rol ?? "miembro",
    accion:       "cita.cancelar",
    entidad:      "citas",
    entidadId:    citaId,
    datosDespues: { estado_sync: "cancelado" },
  });

  revalidatePath("/", "layout");
  return { success: true };
}
