/**
 * GET /api/admin/usuarios/[id]/contratos-usage
 *
 * Admin-only. Returns the per-contract usage for a member (cuota, used,
 * remaining) by calling RPC public.get_miembro_contrato_usage(user_id).
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: me } = await supabase
    .from("users")
    .select("rol")
    .eq("id", user.id)
    .single();

  if (me?.rol !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data, error } = await supabase.rpc("get_miembro_contrato_usage", {
    p_user_id: id,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ usage: data ?? [] });
}
