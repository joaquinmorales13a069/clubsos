"use server";

/**
 * Server Actions: Signup
 *
 * Handles the 5-step registration wizard.
 * Step 2: Company code lookup in public.empresas
 * Step 4: Phone OTP via WhatsApp (same flow as login, but allows user creation)
 * Step 5: Profile completion — updates public.users and sets password
 */

import { createClient } from "@/utils/supabase/server";

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

// ─── Step 2: Buscar empresa por código ─────────────────────────────────────

export async function buscarEmpresaAction(
  codigo: string
): Promise<{ id?: string; nombre?: string; error?: string }> {
  // Use the service_role key to bypass RLS because the user is not authenticated yet.
  const { createClient: createSupabaseClient } = await import("@supabase/supabase-js");
  const supabaseAdmin = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const searchValUpper = codigo.trim().toUpperCase();

  const { data, error } = await supabaseAdmin
    .from("empresas")
    .select("id, nombre")
    .eq("codigo_empresa", searchValUpper)
    .single();

  if (error || !data) {
    const t = await getTranslations("Auth.errors");
    return { error: t("companyNotFound") };
  }

  return { id: data.id, nombre: data.nombre };
}
import { getTranslations } from "next-intl/server";

// ─── Step 4: Send OTP to verify phone during signup ────────────────────────

export async function sendSignupOtpAction(
  phone: string,
  captchaToken: string,
): Promise<{ error?: string }> {
  const valid = await verifyTurnstile(captchaToken);
  if (!valid) {
    const t = await getTranslations("Auth.errors");
    return { error: t("captchaError") };
  }
  const { createClient: createSupabaseClient } = await import("@supabase/supabase-js");
  const supabaseAdmin = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Check if phone number is already registered
  const { data: existingUser } = await supabaseAdmin
    .from("users")
    .select("id")
    .eq("telefono", phone)
    .single();

  if (existingUser) {
    const t = await getTranslations("Auth.errors");
    return { error: t("phoneExists") };
  }

  const supabase = await createClient();

  const { error } = await supabase.auth.signInWithOtp({
    phone,
    options: {
      // Allow creating a new auth user if they don't exist
      shouldCreateUser: true,
    },
  });

  if (error) return { error: error.message };
  return {};
}

// ─── Step 4: Verify OTP (creates session, continues wizard to Step 5) ──────

export async function verifySignupOtpAction(
  phone: string,
  token: string
): Promise<{ error?: string }> {
  const supabase = await createClient();

  // This creates a Supabase Auth session. The handle_new_user trigger
  // will automatically create a basic row in public.users.
  const { error } = await supabase.auth.verifyOtp({
    phone,
    token,
    type: "sms",
  });

  if (error) return { error: error.message };

  // Return success — the wizard continues to Step 5 in the UI
  return {};
}

// ─── Step 5: Complete profile after phone verification ─────────────────────

export interface SignupProfileData {
  nombreCompleto: string;
  fechaNacimiento: string;
  sexo: "masculino" | "femenino";
  documento: string;
  username: string;
  password: string;
  tipoCuenta: "titular" | "familiar";
  empresaId?: string;
  titularId?: string;
  /** Optional — null when user checks "No tengo email" */
  email?: string | null;
}

export async function completeSignupAction(
  formData: SignupProfileData
): Promise<{ success?: true; error?: string }> {
  const supabase = await createClient();

  // Confirm the user is authenticated (phone was verified in Step 4)
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  const t = await getTranslations("Auth.errors");

  if (userError || !user) {
    return { error: t("invalidSession") };
  }

  // Check if email is already registered in public.users or public.doctores
  if (formData.email) {
    const { createClient: createAdmin } = await import("@supabase/supabase-js");
    const adminClient = createAdmin(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const [{ data: existingUser }, { data: existingDoctor }] = await Promise.all([
      adminClient
        .from("users")
        .select("id")
        .eq("email", formData.email)
        .neq("id", user.id)
        .single(),
      adminClient
        .from("doctores")
        .select("id")
        .eq("correo", formData.email)
        .single(),
    ]);

    if (existingUser || existingDoctor) {
      return { error: t("emailExists") };
    }
  }

  // Set password, metadata, and optionally email in auth.users.
  // Email is set via admin client (service role) to skip the confirmation email flow —
  // phone is already the verified primary auth method.
  const authUpdateData: {
    password?: string;
    data: { full_name: string; display_name: string; nombre_completo: string };
  } = {
    data: {
      full_name: formData.nombreCompleto,
      display_name: formData.nombreCompleto,
      nombre_completo: formData.nombreCompleto,
    },
  };

  if (formData.password) {
    authUpdateData.password = formData.password;
  }

  const { error: pwError } = await supabase.auth.updateUser(authUpdateData);
  if (pwError) return { error: t("credentialsError", { message: pwError.message }) };

  // Set email without requiring confirmation (phone is the primary auth method)
  if (formData.email) {
    const { createClient: createAdmin } = await import("@supabase/supabase-js");
    const adminClient = createAdmin(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    const { error: emailError } = await adminClient.auth.admin.updateUserById(user.id, {
      email: formData.email,
      email_confirm: true,
    });
    if (emailError) return { error: t("emailError", { message: emailError.message }) };
  }

  // Update the public.users row created by the handle_new_user trigger
  // with the full profile data from Step 5
  const { error: profileError } = await supabase
    .from("users")
    .update({
      nombre_completo: formData.nombreCompleto,
      fecha_nacimiento: formData.fechaNacimiento || null,
      sexo: formData.sexo,
      documento_identidad: formData.documento,
      username: formData.username,
      tipo_cuenta: formData.tipoCuenta,
      empresa_id: formData.empresaId || null,
      titular_id: formData.titularId || null,
      email: formData.email || null,
      // Account starts as pending — activated by empresa_admin (titular) or titular (familiar)
      estado: "pendiente",
    })
    .eq("id", user.id);

  if (profileError) {
    return { error: t("profileError", { message: profileError.message }) };
  }

  return { success: true };
}
