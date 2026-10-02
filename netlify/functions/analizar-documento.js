// Function servidor (Netlify Functions / Node). Recibe un PDF (base64),
// se lo manda a la API de Claude (Anthropic) para que lo resuma y sugiera
// un nivel de riesgo. Soporta distintos tipos de documento (cada uno con
// su propio prompt). Requiere ANTHROPIC_API_KEY como variable de entorno
// en Netlify (nunca en el navegador).
const { createClient } = require("@supabase/supabase-js");

const PROMPTS = {
  judicatura: (nombreArchivo) => `Eres un analista de riesgo revisando un documento judicial descargado del Consejo de la Judicatura de Ecuador (archivo: ${nombreArchivo || "sin nombre"}), como parte de un proceso de verificación de antecedentes (background check).

Analiza el documento adjunto y responde ÚNICAMENTE con un objeto JSON válido, sin texto adicional antes ni después, con esta forma exacta:
{
  "resumen": "un párrafo (3-5 oraciones) que concluya el estado y la situación actual del juicio: tipo de proceso, partes involucradas si se identifican, estado procesal, y resultado si ya concluyó",
  "nivel_riesgo": "bajo" | "medio" | "alto" | "critico",
  "justificacion": "una oración explicando por qué asignaste ese nivel de riesgo"
}

Criterios de riesgo: "bajo" si el proceso es civil menor, ya se resolvió a favor de la persona, o es un trámite administrativo sin gravedad; "medio" si está en curso o es un proceso civil/laboral relevante; "alto" si involucra un proceso penal en curso o una sentencia condenatoria por delito no grave; "critico" si hay sentencia condenatoria por delito grave (violencia, fraude, corrupción, etc.) o el proceso sigue activo por delitos graves.`,

  iess: (nombreArchivo) => `Eres un analista de riesgo revisando un Certificado de Mecanizado del IESS (historial de aportes al Instituto Ecuatoriano de Seguridad Social) de un candidato (archivo: ${nombreArchivo || "sin nombre"}), como parte de una verificación de antecedentes laborales.

Extrae del documento cada periodo de empleo registrado (empleador, fecha de inicio, fecha de fin o "vigente"), identifica los vacíos (periodos sin aportes) entre un empleo y el siguiente, y evalúa si el historial es coherente y continuo.

Responde ÚNICAMENTE con un objeto JSON válido, sin texto adicional antes ni después, con esta forma exacta:
{
  "resumen": "un párrafo (4-6 oraciones) que liste los empleadores con sus periodos aproximados, mencione cualquier vacío relevante (con su duración aproximada), y concluya si el historial laboral es continuo/coherente o presenta discontinuidades notables",
  "nivel_riesgo": "bajo" | "medio" | "alto" | "critico",
  "justificacion": "una oración explicando por qué asignaste ese nivel de riesgo"
}

Criterios de riesgo: "bajo" si el historial es continuo o con vacíos cortos y explicables (menos de 2-3 meses); "medio" si hay uno o más vacíos moderados (3-12 meses) o un solo empleador muy reciente sin más historial verificable; "alto" si hay vacíos largos y repetidos (más de un año) sin explicación aparente; "critico" si el documento está vacío, ilegible, o el historial sugiere datos fabricados o inconsistentes con lo declarado por el candidato.`,
};

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;

  if (!supabaseUrl || !serviceKey || !anthropicKey) {
    return { statusCode: 500, body: JSON.stringify({ error: "Falta configurar SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / ANTHROPIC_API_KEY en Netlify." }) };
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

  const [{ data: analistaRow }, { data: adminRow }] = await Promise.all([
    admin.from("analistas").select("user_id").eq("user_id", userRes.user.id).maybeSingle(),
    admin.from("admins").select("user_id").eq("user_id", userRes.user.id).maybeSingle(),
  ]);
  if (!analistaRow && !adminRow) {
    return { statusCode: 403, body: JSON.stringify({ error: "No autorizado." }) };
  }

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: "JSON inválido." }) };
  }

  const { pdfBase64, nombreArchivo, tipoDocumento } = body;
  if (!pdfBase64) {
    return { statusCode: 400, body: JSON.stringify({ error: "Falta el archivo PDF (pdfBase64)." }) };
  }

  const construirPrompt = PROMPTS[tipoDocumento] || PROMPTS.judicatura;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-5",
        max_tokens: 1024,
        messages: [{
          role: "user",
          content: [
            { type: "document", source: { type: "base64", media_type: "application/pdf", data: pdfBase64 } },
            { type: "text", text: construirPrompt(nombreArchivo) },
          ],
        }],
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      return { statusCode: 502, body: JSON.stringify({ error: data.error?.message || "Error consultando la IA." }) };
    }

    const textoRespuesta = data.content?.[0]?.text || "";
    let analisis;
    try {
      const match = textoRespuesta.match(/\{[\s\S]*\}/);
      analisis = JSON.parse(match ? match[0] : textoRespuesta);
    } catch {
      analisis = {
        resumen: textoRespuesta.slice(0, 800) || "No se pudo leer el documento.",
        nivel_riesgo: "medio",
        justificacion: "No se pudo interpretar la respuesta como JSON; revisar manualmente.",
      };
    }

    return { statusCode: 200, body: JSON.stringify(analisis) };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};
