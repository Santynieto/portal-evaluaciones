-- =====================================================================
-- PARCHE: verificación biométrica (selfie vs. cédula) al momento del login
-- Ejecutar UNA VEZ en: Supabase Dashboard > SQL Editor > New query
-- =====================================================================

create table if not exists public.verificaciones_biometricas (
  id uuid primary key default gen_random_uuid(),
  caso_id uuid not null references public.casos(id) on delete cascade,
  similitud numeric(5,2),
  aprobado boolean not null default false,
  foto_path text,
  detalle text,
  creado_en timestamptz default now()
);

alter table public.verificaciones_biometricas enable row level security;

drop policy if exists "biometria_select_propio_o_staff" on public.verificaciones_biometricas;
create policy "biometria_select_propio_o_staff"
  on public.verificaciones_biometricas for select
  using (
    exists (select 1 from public.casos c where c.id = caso_id and c.evaluado_user_id = auth.uid())
    or public.is_admin()
    or public.is_analista()
  );

-- =====================================================================
-- Fin del parche.
-- =====================================================================
