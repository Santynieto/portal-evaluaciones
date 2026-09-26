-- =====================================================================
-- PARCHE: agrega el rol "analista" (investiga y deja notas, no aprueba)
-- Ejecutar UNA VEZ en: Supabase Dashboard > SQL Editor > New query
-- (para una base de datos que ya tenía el schema.sql original cargado)
-- =====================================================================

-- 1. Tabla analistas + función helper
create table if not exists public.analistas (
  user_id uuid primary key references auth.users(id) on delete cascade,
  nombre text,
  creado_en timestamptz default now()
);

alter table public.analistas enable row level security;

create or replace function public.is_analista()
returns boolean
language sql
security definer
stable
as $$
  select exists (select 1 from public.analistas a where a.user_id = auth.uid());
$$;

drop policy if exists "analistas_select_propio_o_admin" on public.analistas;
create policy "analistas_select_propio_o_admin"
  on public.analistas for select
  using (auth.uid() = user_id or public.is_admin());

-- 2. Dar acceso de lectura al analista sobre casos / datos_evaluado / documentos
drop policy if exists "casos_select_propio_o_admin" on public.casos;
create policy "casos_select_propio_o_admin"
  on public.casos for select
  using (evaluado_user_id = auth.uid() or public.is_admin() or public.is_analista());

drop policy if exists "casos_update_analista_solo_en_revision" on public.casos;
create policy "casos_update_analista_solo_en_revision"
  on public.casos for update
  using (public.is_analista())
  with check (estado = 'en_revision');

drop policy if exists "datos_select_propio_o_admin" on public.datos_evaluado;
create policy "datos_select_propio_o_admin"
  on public.datos_evaluado for select
  using (
    exists (select 1 from public.casos c where c.id = caso_id and c.evaluado_user_id = auth.uid())
    or public.is_admin()
    or public.is_analista()
  );

drop policy if exists "storage_select_propio_o_admin" on storage.objects;
create policy "storage_select_propio_o_admin"
  on storage.objects for select
  using (
    bucket_id = 'documentos'
    and (
      public.is_admin()
      or public.is_analista()
      or exists (
        select 1 from public.casos c
        where c.id::text = (storage.foldername(name))[1]
        and c.evaluado_user_id = auth.uid()
      )
    )
  );

-- 3. Tabla verificaciones (hallazgos por fuente externa)
create table if not exists public.verificaciones (
  id uuid primary key default gen_random_uuid(),
  caso_id uuid not null references public.casos(id) on delete cascade,
  fuente text not null
    check (fuente in ('judicatura','ministerio_interior','fiscalia','supercias','supa','whitepages','redes_sociales','otro')),
  resultado text not null default 'sin_novedad'
    check (resultado in ('sin_novedad','con_novedad','no_verificable')),
  notas text,
  analista_user_id uuid references auth.users(id),
  creado_en timestamptz default now()
);

alter table public.verificaciones enable row level security;

drop policy if exists "verificaciones_select_analista_o_admin" on public.verificaciones;
create policy "verificaciones_select_analista_o_admin"
  on public.verificaciones for select
  using (public.is_analista() or public.is_admin());

drop policy if exists "verificaciones_insert_analista_o_admin" on public.verificaciones;
create policy "verificaciones_insert_analista_o_admin"
  on public.verificaciones for insert
  with check ((public.is_analista() or public.is_admin()) and analista_user_id = auth.uid());

drop policy if exists "verificaciones_update_propio_o_admin" on public.verificaciones;
create policy "verificaciones_update_propio_o_admin"
  on public.verificaciones for update
  using (analista_user_id = auth.uid() or public.is_admin());

-- =====================================================================
-- Fin del parche. Después de correr esto, registra a tu primer analista:
-- insert into public.analistas (user_id, nombre) values ('<uuid>', 'Nombre');
-- =====================================================================
