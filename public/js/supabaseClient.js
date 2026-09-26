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
  { id: "redes_sociales", nombre: "Redes sociales", url: null },
  { id: "otro", nombre: "Otra fuente", url: null },
];

async function cerrarSesion() {
  await window.sb.auth.signOut();
  window.location.href = "index.html";
}
