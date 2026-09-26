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

async function cerrarSesion() {
  await window.sb.auth.signOut();
  window.location.href = "index.html";
}
