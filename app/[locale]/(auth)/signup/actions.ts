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

// ─── Step 2: Buscar empresa por código ─────────────────────────────────────

export async function buscarEmpresaAction(
  codigo: string
): Promise<{ id?: string; nombre?: string; error?: string }> {
  // Use the service_role key to bypass RLS because the user is not authenticated yet.
  const { createClient: createSupabaseClient } = await import("@supabase/supabase-js");
  const supabaseAdmin = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY!
  );

  const searchValUpper = codigo.trim().toUpperCase();

  const { data, error } = await supabaseAdmin
    .from("empresas")
    .select("id, nombre")
    .eq("codigo_empresa", searchValUpper)
    .single();

  if (error || !data) {
    return { error: "Empresa no encontrada. Verifica el código e intenta de nuevo." };
  }

  return { id: data.id, nombre: data.nombre };
}
import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";

// ─── Step 4: Send OTP to verify phone during signup ────────────────────────

export async function sendSignupOtpAction(
  phone: string
): Promise<{ error?: string }> {
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
}

export async function completeSignupAction(
  formData: SignupProfileData
): Promise<{ error?: string }> {
  const supabase = await createClient();

  // Confirm the user is authenticated (phone was verified in Step 4)
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { error: "Sesión no válida. Por favor verifica tu número de nuevo." };
  }

  // Set the user's password and metadata (for Display Name in Dashboard)
  const authUpdateData: {
    password?: string;
    data: { full_name: string; display_name: string; nombre_completo: string };
  } = {
    data: { 
      full_name: formData.nombreCompleto,
      display_name: formData.nombreCompleto,
      nombre_completo: formData.nombreCompleto
    }
  };
  
  if (formData.password) {
    authUpdateData.password = formData.password;
  }

  const { error: pwError } = await supabase.auth.updateUser(authUpdateData);
  if (pwError) return { error: `Error al configurar credenciales: ${pwError.message}` };

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
      // Activate the account once profile is complete
      estado: "activo",
    })
    .eq("id", user.id);

  if (profileError) {
    return { error: `Error al guardar perfil: ${profileError.message}` };
  }

  // Redirect to member dashboard on successful registration
  const locale = await getLocale();
  redirect(`/${locale}/dashboard`);
}
