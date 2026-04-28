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
import { cookies } from "next/headers";
import { getLocale } from "next-intl/server";

async function verifyTurnstile(token: string): Promise<boolean> {
  try {
    const res = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          secret:   process.env.TURNSTILE_SECRET_KEY!,
          response: token,
        }),
      }
    );
    const data = await res.json() as { success: boolean };
    return data.success;
  } catch {
    return false;
  }
}

/** Marks the session so the dashboard can show a welcome toast. */
async function markJustLoggedIn() {
  const cookieStore = await cookies();
  cookieStore.set("just_logged_in", "1", { maxAge: 10, path: "/", httpOnly: false });
}

// ─── OTP: Send WhatsApp verification code ──────────────────────────────────

export async function sendOtpAction(
  phone: string,
  captchaToken: string,
): Promise<{ error?: string; redirectToSignup?: boolean }> {
  const valid = await verifyTurnstile(captchaToken);
  if (!valid) return { error: "Verificación de seguridad fallida. Por favor, inténtalo de nuevo." };

  const supabase = await createClient();

  const { error } = await supabase.auth.signInWithOtp({
    phone,
    options: {
      // Login only — do NOT create a new user if they don't exist
      shouldCreateUser: false,
    },
  });

  if (error) {
    // Supabase devuelve este error cuando el teléfono no está registrado
    if (/not found|signups not allowed|user not found/i.test(error.message)) {
      return { redirectToSignup: true };
    }
    return { error: error.message };
  }
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
  await markJustLoggedIn();

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
  password: string,
  captchaToken: string,
): Promise<{ error?: string }> {
  const valid = await verifyTurnstile(captchaToken);
  if (!valid) return { error: "Verificación de seguridad fallida. Por favor, inténtalo de nuevo." };
  // Admin client bypasses RLS — required because user is not authenticated yet
  const { createClient: createSupabaseClient } = await import("@supabase/supabase-js");
  const supabaseAdmin = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: profile, error: profileError } = await supabaseAdmin
    .from("users")
    .select("id, telefono, rol")
    .eq("username", username)
    .single();

  if (profileError || !profile?.telefono) {
    return { error: "Usuario no encontrado o sin número registrado." };
  }

  // Sign in using phone + password (regular client for auth)
  const supabase = await createClient();
  const { error: signInError } = await supabase.auth.signInWithPassword({
    phone: profile.telefono,
    password,
  });

  if (signInError) return { error: signInError.message };

  const locale = await getLocale();
  await markJustLoggedIn();

  if (profile.rol === "admin") {
    redirect(`/${locale}/dashboard/admin`);
  } else if (profile.rol === "empresa_admin") {
    redirect(`/${locale}/dashboard/empresa`);
  } else {
    redirect(`/${locale}/dashboard`);
  }
}
