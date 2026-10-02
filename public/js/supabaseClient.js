// Cliente único de Supabase, reutilizado por todas las páginas.
window.sb = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);

// Redirige a login si no hay sesión activa. Devuelve el usuario si sí la hay.
async function requerirSesion() {
  const { data: { session } } = await window.sb.auth.getSession();
  if (!session) {
    window.location.href = "index.html";
    return null;
  }
  return session.user;
}

async function esAdmin(userId) {
  const { data, error } = await window.sb
    .from("admins")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    console.error(error);
    return false;
  }
  return !!data;
}

async function esAnalista(userId) {
  const { data, error } = await window.sb
    .from("analistas")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    console.error(error);
    return false;
  }
  return !!data;
}

// Fuentes externas de verificación (nombre para UI + enlace directo).
const FUENTES_VERIFICACION = [
  { id: "judicatura", nombre: "Consejo de la Judicatura", url: "https://procesosjudiciales.funcionjudicial.gob.ec/" },
  { id: "ministerio_interior", nombre: "Ministerio del Interior (antecedentes)", url: "https://certificados.ministeriodelinterior.gob.ec/gestorcertificados/antecedentes/" },
  { id: "fiscalia", nombre: "Fiscalía (noticias del delito)", url: "https://www.fiscalia.gob.ec/consulta-de-noticias-del-delito/" },
  { id: "supercias", nombre: "Superintendencia de Compañías", url: "https://appscvsmovil.supercias.gob.ec/PortalInfor/consultaPrincipal.zul" },
  { id: "supa", nombre: "SUPA", url: "https://supa.funcionjudicial.gob.ec/pensiones/publico/consulta.jsf" },
  { id: "whitepages", nombre: "Whitepages.lat", url: "https://whitepages.lat/users/log_in" },
  { id: "iess", nombre: "IESS (mecanizado laboral)", url: null },
  { id: "redes_sociales", nombre: "Redes sociales", url: null },
  { id: "otro", nombre: "Otra fuente", url: null },
];

// Fases fijas de la verificación estándar, en orden. Cada fase = una fuente.
const FASES_VERIFICACION = [
  { fuente: "whitepages", numero: 1, titulo: "Identidad de la persona",
    descripcion: "Revisa la cédula que cargó el evaluado y contrasta sus datos en Whitepages." },
  { fuente: "iess", numero: 2, titulo: "Historial laboral (IESS)",
    descripcion: "Revisa el Certificado de Mecanizado que cargó el evaluado: tiempos por empleador y vacíos entre empleos." },
  { fuente: "supa", numero: 3, titulo: "SUPA" },
  { fuente: "fiscalia", numero: 4, titulo: "Fiscalía" },
  { fuente: "ministerio_interior", numero: 5, titulo: "Ministerio del Interior" },
  { fuente: "judicatura", numero: 6, titulo: "Consejo de la Judicatura" },
  { fuente: "redes_sociales", numero: 7, titulo: "Entorno web" },
];

const NIVEL_RIESGO_ORDEN = { bajo: 1, medio: 2, alto: 3, critico: 4 };
const NIVEL_RIESGO_LABEL = { bajo: "Bajo", medio: "Medio", alto: "Alto", critico: "Crítico" };

// Riesgo consolidado = el nivel más alto entre las fases ya evaluadas.
// Devuelve null si ninguna fase tiene todavía un registro.
function calcularRiesgoConsolidado(verificacionesPorFuente) {
  let peor = null;
  for (const fase of FASES_VERIFICACION) {
    const v = verificacionesPorFuente[fase.fuente];
    if (!v) continue;
    if (peor === null || NIVEL_RIESGO_ORDEN[v.nivel_riesgo] > NIVEL_RIESGO_ORDEN[peor]) {
      peor = v.nivel_riesgo;
    }
  }
  return peor;
}

async function cerrarSesion() {
  await window.sb.auth.signOut();
  window.location.href = "index.html";
}
