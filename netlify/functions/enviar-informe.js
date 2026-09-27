// Function servidor (Netlify Functions / Node). Envía el informe PDF por
// correo usando Resend. Requiere RESEND_API_KEY como variable de entorno
// en Netlify (nunca en el navegador). Solo el equipo Defender (admin)
// puede enviar informes — se verifica la sesión antes de hacer nada.
const { createClient } = require("@supabase/supabase-js");

const REMITENTE = "Defender <informes@defender.com.ec>";

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const resendKey = process.env.RESEND_API_KEY;

  if (!supabaseUrl || !serviceKey || !resendKey) {
    return { statusCode: 500, body: JSON.stringify({ error: "Falta configurar SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / RESEND_API_KEY en Netlify." }) };
  }

  const admin = createClient(supabaseUrl, serviceKey);

  const authHeader = event.headers.authorization || event.headers.Authorization || "";
  const token = authHeader.replace(/^Bearer /i, "");
  if (!token) {
    return { statusCode: 401, body: JSON.stringify({ error: "No autenticado." }) };
  }

  const { data: userRes, error: authError } = await admin.auth.getUser(token);
  if (authError || !userRes?.user) {
    return { statusCode: 401, body: JSON.stringify({ error: "Sesión inválida." }) };
  }

  const { data: adminRow } = await admin.from("admins").select("user_id").eq("user_id", userRes.user.id).maybeSingle();
  if (!adminRow) {
    return { statusCode: 403, body: JSON.stringify({ error: "Solo el equipo Defender puede enviar informes." }) };
  }

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: "JSON inválido." }) };
  }

  const { destinatario, asunto, nombreArchivo, pdfBase64, nombreCaso } = body;
  if (!destinatario || !pdfBase64) {
    return { statusCode: 400, body: JSON.stringify({ error: "Faltan campos: destinatario, pdfBase64." }) };
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${resendKey}`,
      },
      body: JSON.stringify({
        from: REMITENTE,
        to: [destinatario],
        subject: asunto || `Informe de evaluación — ${nombreCaso || ""}`,
        html: `
          <p>Estimado/a,</p>
          <p>Adjuntamos el informe de evaluación${nombreCaso ? ` de <strong>${nombreCaso}</strong>` : ""}.</p>
          <p>Este documento es confidencial y de uso exclusivo del destinatario.</p>
          <p>Equipo Defender</p>
        `,
        attachments: [{ filename: nombreArchivo || "informe.pdf", content: pdfBase64 }],
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      return { statusCode: 502, body: JSON.stringify({ error: data.message || "Error enviando el correo." }) };
    }

    return { statusCode: 200, body: JSON.stringify({ ok: true, id: data.id }) };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};
