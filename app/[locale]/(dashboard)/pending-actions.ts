"use server";

import { createClient } from "@/utils/supabase/server";

/**
 * Re-checks the current user's `estado` in public.users.
 * Returns { activo: true } so the client can call router.refresh(),
 * which causes the dashboard layout Server Component to re-render
 * and show the full dashboard now that estado = 'activo'.
 * Returns { stillPending: true } if the account hasn't been activated yet.
 */
export async function checkActivationStatusAction(): Promise<
  { activo: true } | { stillPending: true }
> {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { stillPending: true };

  const { data: profile } = await supabase
    .from("users")
    .select("estado")
    .eq("id", user.id)
    .single();

  if (profile?.estado === "activo") return { activo: true };

  return { stillPending: true };
}
