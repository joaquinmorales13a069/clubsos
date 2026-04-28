"use server";

import { createClient } from "@/utils/supabase/server";
import { createClient as createAdmin } from "@supabase/supabase-js";
import { getTranslations } from "next-intl/server";

/**
 * Validates the new email against public.users and public.doctores before
 * calling supabase.auth.updateUser(), which triggers a confirmation email.
 * Returns { error } if the email is already taken, { sent: true } on success.
 */
export async function updateEmailAction(
  newEmail: string,
): Promise<{ sent: true } | { error: string }> {
  const t           = await getTranslations("Auth.errors");
  const supabase    = await createClient();
  const adminClient = createAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: t("invalidSession") };

  // Check email against public.users (exclude self) and public.doctores in parallel
  const [{ data: existingUser }, { data: existingDoctor }] = await Promise.all([
    adminClient
      .from("users")
      .select("id")
      .eq("email", newEmail)
      .neq("id", user.id)
      .single(),
    adminClient
      .from("doctores")
      .select("id")
      .eq("correo", newEmail)
      .single(),
  ]);

  if (existingUser || existingDoctor) return { error: t("emailExists") };

  // Trigger confirmation email via user's session
  const { error } = await supabase.auth.updateUser({ email: newEmail });
  if (error) return { error: error.message };

  return { sent: true };
}
