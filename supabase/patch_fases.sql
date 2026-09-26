-- =====================================================================
-- PARCHE: convertir "verificaciones" en un estado por fase (una fila por
-- caso+fuente, editable) en vez de un historial de entradas repetidas.
-- Ejecutar UNA VEZ en: Supabase Dashboard > SQL Editor > New query
-- =====================================================================

-- 1. Si hay filas duplicadas para el mismo caso+fuente (de pruebas
--    anteriores), dejar solo la más reciente.
delete from public.verificaciones a using public.verificaciones b
where a.caso_id = b.caso_id
  and a.fuente = b.fuente
  and a.creado_en < b.creado_en;

-- 2. Restricción de unicidad: una sola fila por caso+fuente.
alter table public.verificaciones drop constraint if exists verificaciones_caso_fuente_unique;
alter table public.verificaciones add constraint verificaciones_caso_fuente_unique unique (caso_id, fuente);

-- 3. Columna + trigger para saber cuándo se actualizó cada fase.
alter table public.verificaciones add column if not exists actualizado_en timestamptz default now();

drop trigger if exists trg_verificaciones_actualizado on public.verificaciones;
create trigger trg_verificaciones_actualizado
  before update on public.verificaciones
  for each row execute function public.set_actualizado_en();

-- 4. Cualquier analista puede editar una fase ya iniciada por otro
--    analista (reemplaza la política vieja, que solo dejaba al mismo
--    analista que la creó).
drop policy if exists "verificaciones_update_propio_o_admin" on public.verificaciones;
drop policy if exists "verificaciones_update_analista_o_admin" on public.verificaciones;
create policy "verificaciones_update_analista_o_admin"
  on public.verificaciones for update
  using (public.is_analista() or public.is_admin());

-- =====================================================================
-- Fin del parche.
-- =====================================================================
