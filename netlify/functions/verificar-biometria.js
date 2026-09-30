// Function servidor (Netlify Functions / Node). Compara la selfie tomada
// al momento del login del evaluado contra la foto de su cédula ya
// cargada, usando Amazon Rekognition (CompareFaces). Requiere
// AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY / AWS_REGION como variables
// de entorno en Netlify.
const { createClient } = require("@supabase/supabase-js");
const { RekognitionClient, CompareFacesCommand } = require("@aws-sdk/client-rekognition");

const UMBRAL_APROBADO = 80; // % de similitud mínimo para considerarlo un match

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const awsRegion = process.env.AWS_REGION;
  const awsKeyId = process.env.AWS_ACCESS_KEY_ID;
  const awsSecret = process.env.AWS_SECRET_ACCESS_KEY;

  if (!supabaseUrl || !serviceKey || !awsRegion || !awsKeyId || !awsSecret) {
    return { statusCode: 500, body: JSON.stringify({ error: "Falta configurar variables de entorno (Supabase/AWS) en Netlify." }) };
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

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: "JSON inválido." }) };
  }

  const { selfieBase64 } = body;
  if (!selfieBase64) {
    return { statusCode: 400, body: JSON.stringify({ error: "Falta la selfie (selfieBase64)." }) };
  }

  // El evaluado solo puede verificar su propio caso (el más reciente).
  const { data: casos, error: casoError } = await admin
    .from("casos")
    .select("id")
    .eq("evaluado_user_id", userRes.user.id)
    .order("creado_en", { ascending: false })
    .limit(1);

  if (casoError || !casos || casos.length === 0) {
    return { statusCode: 404, body: JSON.stringify({ error: "No se encontró un caso asociado a tu usuario." }) };
  }
  const casoId = casos[0].id;

  // Buscar la cédula ya cargada.
  const { data: archivos } = await admin.storage.from("documentos").list(casoId);
  const archivoCedula = (archivos || []).find(f => f.name.startsWith("cedula"));
  if (!archivoCedula) {
    return { statusCode: 400, body: JSON.stringify({ error: "Primero debes cargar tu cédula en el formulario." }) };
  }

  const { data: cedulaBlob, error: descargaError } = await admin.storage
    .from("documentos")
    .download(`${casoId}/${archivoCedula.name}`);
  if (descargaError) {
    return { statusCode: 500, body: JSON.stringify({ error: "No se pudo leer la cédula: " + descargaError.message }) };
  }

  const cedulaBuffer = Buffer.from(await cedulaBlob.arrayBuffer());
  const selfieBuffer = Buffer.from(selfieBase64, "base64");

  // Guardar la selfie para el registro (evidencia), independiente del resultado.
  const fotoPath = `${casoId}/biometria/${Date.now()}.png`;
  await admin.storage.from("documentos").upload(fotoPath, selfieBuffer, { contentType: "image/png" });

  let similitud = 0;
  let aprobado = false;
  let detalle = null;

  try {
    const rekognition = new RekognitionClient({
      region: awsRegion,
      credentials: { accessKeyId: awsKeyId, secretAccessKey: awsSecret },
    });

    const resultado = await rekognition.send(new CompareFacesCommand({
      SourceImage: { Bytes: selfieBuffer },
      TargetImage: { Bytes: cedulaBuffer },
      SimilarityThreshold: 0,
    }));

    if (resultado.FaceMatches && resultado.FaceMatches.length > 0) {
      similitud = Math.max(...resultado.FaceMatches.map(m => m.Similarity || 0));
      aprobado = similitud >= UMBRAL_APROBADO;
    } else {
      detalle = "No se encontró coincidencia entre la selfie y la cédula.";
    }
  } catch (e) {
    detalle = "Error del servicio de reconocimiento: " + e.message;
  }

  await admin.from("verificaciones_biometricas").insert({
    caso_id: casoId,
    similitud,
    aprobado,
    foto_path: fotoPath,
    detalle,
  });

  return { statusCode: 200, body: JSON.stringify({ similitud, aprobado, detalle }) };
};
