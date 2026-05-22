import { Resend } from "https://esm.sh/resend@4";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const EMAIL_FROM     = Deno.env.get("EMAIL_FROM")     ?? "no-reply@clubsos.com";

const resend = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null;

export async function sendEmail(opts: {
  to:          string;
  subject:     string;
  html:        string;
  icsContent?: string;
}): Promise<{ ok: boolean; error?: string }> {
  if (!resend) return { ok: false, error: "RESEND_API_KEY missing" };

  const attachments = opts.icsContent
    ? [{ filename: "cita.ics", content: opts.icsContent, contentType: "text/calendar; charset=utf-8" }]
    : undefined;

  try {
    const result = await resend.emails.send({
      from:        EMAIL_FROM,
      to:          opts.to,
      subject:     opts.subject,
      html:        opts.html,
      attachments,
    });
    if (result.error) return { ok: false, error: String(result.error) };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}
