// Function servidor (Netlify Functions / Node). Corre fuera del navegador.
// Usa la llave SECRETA de Supabase (service_role) para crear el usuario del
// evaluado y su caso en un solo paso. Esa llave vive solo como variable de
// entorno en Netlify (Project configuration > Environment variables),
// nunca en este archivo ni en el navegador.
const { createClient } = require("@supabase/supabase-js");

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    return { statusCode: 500, body: JSON.stringify({ error: "Falta configurar SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY en Netlify." }) };
  }

  const admin = createClient(supabaseUrl, serviceKey);

  // Verificar que quien llama esté logueado y sea admin.
  const authHeader = event.headers.authorization || event.headers.Authorization || "";
  const token = authHeader.replace(/^Bearer /i, "");
  if (!token) {
    return { statusCode: 401, body: JSON.stringify({ error: "No autenticado." }) };
  }

  const { data: userRes, error: authError } = await admin.auth.getUser(token);
  if (authError || !userRes?.user) {
    return { statusCode: 401, body: JSON.stringify({ error: "Sesión inválida." }) };
  }

  const { data: adminRow } = await admin
    .from("admins")
    .select("user_id")
    .eq("user_id", userRes.user.id)
    .maybeSingle();

  if (!adminRow) {
    return { statusCode: 403, body: JSON.stringify({ error: "No autorizado (no eres admin)." }) };
  }

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: "JSON inválido." }) };
  }

  const { email, password, nombre_completo, empresa_solicitante, tipo_evaluacion } = body;

  if (!email || !password || !nombre_completo) {
    return { statusCode: 400, body: JSON.stringify({ error: "Faltan campos: email, password, nombre_completo." }) };
  }

  const { data: nuevoUsuario, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (createError) {
    return { statusCode: 400, body: JSON.stringify({ error: createError.message }) };
  }

  const { data: caso, error: casoError } = await admin
    .from("casos")
    .insert({
      evaluado_user_id: nuevoUsuario.user.id,
      nombre_completo,
      empresa_solicitante: empresa_solicitante || null,
      tipo_evaluacion: tipo_evaluacion || "estandar",
    })
    .select()
    .single();

  if (casoError) {
    return { statusCode: 400, body: JSON.stringify({ error: casoError.message }) };
  }

  return { statusCode: 200, body: JSON.stringify({ caso, user_id: nuevoUsuario.user.id }) };
};
