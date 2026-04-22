/**
 * Edge Function: sync_ea_customer
 * Runtime: Deno (Supabase Edge Functions)
 *
 * Purpose:
 *   When a user's `estado` transitions to 'activo' (approved by empresa_admin
 *   or global admin), this function pushes the user's data to Easy!Appointments
 *   via its REST API and stores the returned customer ID in `users.ea_customer_id`.
 *
 * Trigger:
 *   Supabase Database Webhook → Table: public.users → Event: UPDATE
 *   Configure at: Supabase Dashboard → Database → Webhooks
 *   URL: https://<project>.supabase.co/functions/v1/sync_ea_customer
 *
 * Environment variables (Supabase → Edge Functions → Secrets):
 *   EA_API_URL             — Base URL of Easy!Appointments (e.g. https://ea.sosmedical.com)
 *   EA_API_TOKEN           — Bearer token configured in EA Settings → API
 *   SUPABASE_URL           — Auto-injected by Supabase runtime
 *   SUPABASE_SERVICE_ROLE_KEY — Needed to write back ea_customer_id to public.users
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ── Types ────────────────────────────────────────────────────────────────────

interface WebhookPayload {
  type: "INSERT" | "UPDATE" | "DELETE";
  table: string;
  schema: string;
  record: UserRecord;
  old_record: UserRecord | null;
}

interface UserRecord {
  id: string;
  nombre_completo: string | null;
  telefono: string | null;
  estado: string;
  rol: string;
  empresa_id: string | null;
  ea_customer_id: number | null;
  documento_identidad: string | null;
  fecha_nacimiento: string | null;
  sexo: string | null;
}

interface EaCustomer {
  id?: number;
  firstName: string;
  lastName: string;
  phone: string;
  email?: string;
  notes?: string;
  timezone?: string;
  language?: string;
}

interface EaSearchResult {
  id: number;
  phone: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Strip non-digit characters from a phone number string. */
function phoneDigits(raw: string | null): string {
  if (!raw) return "";
  return String(raw).replace(/\D/g, "");
}

/**
 * Split a full name into firstName + lastName.
 * "Juan Carlos Pérez López" → { firstName: "Juan", lastName: "Carlos Pérez López" }
 * Single-word names fall back to lastName: "".
 */
function splitName(nombreCompleto: string | null): { firstName: string; lastName: string } {
  const name = (nombreCompleto ?? "").trim();
  const spaceIndex = name.indexOf(" ");
  if (spaceIndex === -1) return { firstName: name, lastName: "" };
  return {
    firstName: name.slice(0, spaceIndex),
    lastName: name.slice(spaceIndex + 1),
  };
}

/** Build JSON headers for EA API calls. */
function eaHeaders(token: string): HeadersInit {
  return {
    "Content-Type": "application/json",
    "Accept": "application/json",
    "Authorization": `Bearer ${token}`,
  };
}

// ── EA API calls ─────────────────────────────────────────────────────────────

/**
 * Search for an existing EA customer by phone number.
 * Returns the customer ID if found, null otherwise.
 *
 * EA's ?q= does a broad search; we verify the phone match client-side
 * to avoid false positives.
 */
async function findEaCustomerByPhone(
  baseUrl: string,
  token: string,
  phone: string
): Promise<number | null> {
  const digits = phoneDigits(phone);
  if (!digits) return null;

  // Search with both formats: digits-only and +digits
  const url = `${baseUrl}/api/v1/customers?q=${encodeURIComponent(`+${digits}`)}&fields=id,phone&length=20`;

  const res = await fetch(url, { headers: eaHeaders(token) });
  if (!res.ok) {
    console.warn(`EA customer search returned ${res.status}`);
    return null;
  }

  const customers: EaSearchResult[] = await res.json();

  // Verify phone digits match to avoid false positives from broad search
  const match = customers.find(
    (c) => phoneDigits(c.phone) === digits
  );

  return match?.id ?? null;
}

/**
 * Create a new customer in Easy!Appointments.
 * Returns the created customer ID.
 */
async function createEaCustomer(
  baseUrl: string,
  token: string,
  customer: EaCustomer
): Promise<number> {
  const res = await fetch(`${baseUrl}/api/v1/customers`, {
    method: "POST",
    headers: eaHeaders(token),
    body: JSON.stringify(customer),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`EA API error ${res.status}: ${body}`);
  }

  const created: EaCustomer = await res.json();
  if (!created.id) throw new Error("EA API returned no customer ID");
  return created.id;
}

// ── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  try {
    // ── Env vars ─────────────────────────────────────────────────────────────
    const EA_API_URL = Deno.env.get("EA_API_URL");
    const EA_API_TOKEN = Deno.env.get("EA_API_TOKEN");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!EA_API_URL || !EA_API_TOKEN || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      console.error("Missing required environment variables.");
      return Response.json({ ok: false, error: "Server misconfiguration." }, { status: 500 });
    }

    // ── Parse webhook payload ─────────────────────────────────────────────────
    const payload: WebhookPayload = await req.json();
    const { type, record, old_record } = payload;

    // Only process UPDATE events
    if (type !== "UPDATE") {
      return Response.json({ ok: true, skipped: true, reason: `Event type '${type}' ignored.` });
    }

    // Only act when estado transitions TO 'activo'
    if (record.estado !== "activo" || old_record?.estado === "activo") {
      return Response.json({ ok: true, skipped: true, reason: "No estado→activo transition." });
    }

    // ── Idempotency check ─────────────────────────────────────────────────────
    if (record.ea_customer_id !== null) {
      console.log(`User ${record.id} already has ea_customer_id=${record.ea_customer_id}. Skipping.`);
      return Response.json({ ok: true, skipped: true, reason: "Already synced.", ea_customer_id: record.ea_customer_id });
    }

    // ── Validate required fields ──────────────────────────────────────────────
    if (!record.nombre_completo || !record.telefono) {
      console.warn(`User ${record.id} missing nombre_completo or telefono.`);
      return Response.json(
        { ok: false, error: "User missing nombre_completo or telefono." },
        { status: 422 }
      );
    }

    const { firstName, lastName } = splitName(record.nombre_completo);
    const phoneFormatted = `+${phoneDigits(record.telefono)}`;

    // ── Check if customer already exists in EA (dedup by phone) ───────────────
    let eaCustomerId = await findEaCustomerByPhone(EA_API_URL, EA_API_TOKEN, record.telefono);

    if (eaCustomerId) {
      console.log(`EA customer already exists with id=${eaCustomerId} for phone ${phoneFormatted}`);
    } else {
      // ── Create new customer in EA ─────────────────────────────────────────
      const notes = [
        `ClubSOS User ID: ${record.id}`,
        `Rol: ${record.rol}`,
        record.documento_identidad ? `Doc: ${record.documento_identidad}` : null,
        record.fecha_nacimiento ? `DOB: ${record.fecha_nacimiento}` : null,
      ]
        .filter(Boolean)
        .join(" | ");

      const eaCustomer: EaCustomer = {
        firstName,
        lastName,
        phone: phoneFormatted,
        notes,
        timezone: "America/Managua",
        language: "spanish",
      };

      eaCustomerId = await createEaCustomer(EA_API_URL, EA_API_TOKEN, eaCustomer);
      console.log(`Created EA customer id=${eaCustomerId} for user ${record.id}`);
    }

    // ── Write ea_customer_id back to public.users ─────────────────────────────
    // auth options required in Deno: no localStorage, no session refresh
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: updated, error: updateError } = await supabase
      .from("users")
      .update({ ea_customer_id: eaCustomerId })
      .eq("id", record.id)
      .select("id, ea_customer_id")
      .single();

    if (updateError) {
      throw new Error(`Failed to update ea_customer_id: ${updateError.message}`);
    }
    if (!updated) {
      throw new Error(`Update matched 0 rows for user id=${record.id}`);
    }

    console.log(`User ${record.id} → ea_customer_id=${eaCustomerId} saved.`);

    return Response.json({
      ok: true,
      user_id: record.id,
      ea_customer_id: eaCustomerId,
    });

  } catch (err) {
    console.error("Unexpected error in sync_ea_customer:", err);
    return Response.json(
      { ok: false, error: String((err as Error)?.message ?? err) },
      { status: 500 }
    );
  }
});
