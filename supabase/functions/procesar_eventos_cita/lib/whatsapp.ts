const PHONE_NUMBER_ID = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID") ?? "";
const API_TOKEN       = Deno.env.get("WHATSAPP_API_TOKEN")       ?? "";

function toE164(phone: string): string {
  const digits = phone.replace(/\s/g, "");
  return digits.startsWith("+") ? digits : `+${digits}`;
}

export async function sendWhatsappTemplate(opts: {
  to:           string;
  template:     string;
  languageCode: string;
  params:       string[];
}): Promise<{ ok: boolean; error?: string }> {
  if (!PHONE_NUMBER_ID || !API_TOKEN) {
    return { ok: false, error: "WhatsApp env vars missing" };
  }

  const res = await fetch(
    `https://graph.facebook.com/v25.0/${PHONE_NUMBER_ID}/messages`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${API_TOKEN}` },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: toE164(opts.to),
        type: "template",
        template: {
          name: opts.template,
          language: { code: opts.languageCode },
          components: [{
            type: "body",
            parameters: opts.params.map((p) => ({ type: "text", text: p })),
          }],
        },
      }),
    },
  );

  if (!res.ok) {
    return { ok: false, error: `${res.status}: ${await res.text().catch(() => "")}` };
  }
  return { ok: true };
}
