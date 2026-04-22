"use server";

/**
 * Server Actions: Login
 *
 * These actions run on the server and communicate with Supabase Auth.
 * The OTP flow uses Supabase's phone auth + our custom send-sms Edge Function
 * which delivers the code via WhatsApp (Meta Cloud API).
 */

import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";

// ─── OTP: Send WhatsApp verification code ──────────────────────────────────

export async function sendOtpAction(
  phone: string
): Promise<{ error?: string }> {
  const supabase = await createClient();

  const { error } = await supabase.auth.signInWithOtp({
    phone,
    options: {
      // Login only — do NOT create a new user if they don't exist
      shouldCreateUser: false,
    },
  });

  if (error) return { error: error.message };
  return {};
}

// ─── OTP: Verify code and redirect based on role ───────────────────────────

export async function verifyOtpAction(
  phone: string,
  token: string
): Promise<{ error?: string }> {
  const supabase = await createClient();

  const { data, error } = await supabase.auth.verifyOtp({
    phone,
    token,
    type: "sms",
  });

  if (error) return { error: error.message };
  if (!data.user) return { error: "No se pudo verificar el código." };

  // Fetch user role from public.users to route to the correct dashboard
  const { data: profile } = await supabase
    .from("users")
    .select("rol")
    .eq("id", data.user.id)
    .single();

  const locale = await getLocale();

  // Redirect based on role — matches CONTEXT.md RBAC requirements
  if (profile?.rol === "admin") {
    redirect(`/${locale}/dashboard/admin`);
  } else if (profile?.rol === "empresa_admin") {
    redirect(`/${locale}/dashboard/empresa`);
  } else {
    redirect(`/${locale}/dashboard`);
  }
}

// ─── Password: Login with username + password ──────────────────────────────

export async function loginWithPasswordAction(
  username: string,
  password: string
): Promise<{ error?: string }> {
  const supabase = await createClient();

  // Look up the user's phone number via their username in public.users
  const { data: profile, error: profileError } = await supabase
    .from("users")
    .select("id, telefono")
    .eq("username", username)
    .single();

  if (profileError || !profile?.telefono) {
    return { error: "Usuario no encontrado o sin número registrado." };
  }

  // Sign in using phone + password
  // Note: this requires the user to have set a password previously (Step 5 of signup)
  const { error: signInError } = await supabase.auth.signInWithPassword({
    phone: profile.telefono,
    password,
  });

  if (signInError) return { error: signInError.message };

  const locale = await getLocale();
  redirect(`/${locale}/dashboard`);
}
