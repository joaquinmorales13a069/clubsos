const LOGO_URL =
  "https://jdhaxwklszodavhdrtsp.supabase.co/storage/v1/object/public/beneficios-imagenes/logo-SOSMedical.webp";

export function buildCodigoEmpresaEmail(empresaNombre: string, codigo: string): string {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Código de Membresía — ClubSOS</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:Roboto,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background-color:#f4f4f5;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" role="presentation"
               style="background:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);max-width:600px;width:100%;">

          <!-- Header -->
          <tr>
            <td style="background:#ffffff;padding:28px 40px;text-align:center;border-bottom:4px solid #CD2129;">
              <img
                src="${LOGO_URL}"
                alt="SOS Medical"
                width="180"
                style="display:block;margin:0 auto;height:auto;max-width:180px;"
              />
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:40px 40px 32px;">
              <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#111827;font-family:Poppins,Arial,sans-serif;">
                Código de Membresía
              </h1>
              <p style="margin:0 0 24px;font-size:15px;color:#6b7280;line-height:1.6;">
                El código de membresía de <strong style="color:#111827;">${empresaNombre}</strong>
                en la plataforma <strong style="color:#CD2129;">ClubSOS</strong> es:
              </p>

              <!-- Code box -->
              <table width="100%" cellpadding="0" cellspacing="0" role="presentation"
                     style="margin:0 0 28px;">
                <tr>
                  <td align="center"
                      style="background:#fef2f2;border:2px dashed #CD2129;border-radius:14px;padding:28px 20px;">
                    <span style="font-family:'Courier New',Courier,monospace;font-size:34px;font-weight:700;
                                 letter-spacing:0.25em;color:#CD2129;display:block;">
                      ${codigo}
                    </span>
                  </td>
                </tr>
              </table>

              <!-- Instructions -->
              <table width="100%" cellpadding="0" cellspacing="0" role="presentation"
                     style="background:#eff6ff;border-radius:12px;padding:0;margin-bottom:28px;">
                <tr>
                  <td style="padding:20px 24px;">
                    <p style="margin:0 0 8px;font-size:13px;font-weight:700;color:#2266A7;text-transform:uppercase;letter-spacing:0.05em;">
                      ¿Cómo usar este código?
                    </p>
                    <ol style="margin:0;padding-left:18px;font-size:14px;color:#374151;line-height:1.8;">
                      <li>Descarga la app ClubSOS o visita el portal web.</li>
                      <li>Durante el registro, ingresa este código en el campo <em>«Código de empresa»</em>.</li>
                      <li>Tu cuenta quedará vinculada automáticamente a <strong>${empresaNombre}</strong>.</li>
                    </ol>
                  </td>
                </tr>
              </table>

              <p style="margin:0;font-size:13px;color:#9ca3af;line-height:1.8;">
                Si no solicitaste este correo, puedes ignorarlo de forma segura.
                Para soporte contáctanos en
                <a href="mailto:desarrollo@sosmedical.com.ni" style="color:#CD2129;text-decoration:none;">
                  desarrollo@sosmedical.com.ni
                </a>
                o por WhatsApp al
                <a href="https://wa.me/50581001226" style="color:#CD2129;text-decoration:none;">
                  +505 8100 1226
                </a>.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#f9fafb;border-top:1px solid #f3f4f6;padding:20px 40px;text-align:center;">
              <p style="margin:0;font-size:12px;color:#9ca3af;">
                © ${new Date().getFullYear()} SOS Medical · ClubSOS · Todos los derechos reservados
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
