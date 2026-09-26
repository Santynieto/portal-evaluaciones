-- =====================================================================
-- Portal de Evaluaciones (Background Check / Due Diligence)
-- Defender78
--
-- Ejecutar completo en: Supabase Dashboard > SQL Editor > New query
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. TABLA: admins
--    Lista de usuarios (auth.users) que son parte del equipo Defender
--    y pueden revisar TODOS los casos. Se llena manualmente:
--    insert into public.admins (user_id) values ('<uuid del usuario>');
-- ---------------------------------------------------------------------
create table if not exists public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  nombre text,
  creado_en timestamptz default now()
);

alter table public.admins enable row level security;

-- Función helper: ¿el usuario actual es admin?
-- security definer: corre con privilegios elevados y por lo tanto IGNORA las
-- políticas RLS de "admins" en su propia consulta interna. Es imprescindible
-- usarla (y no una subconsulta directa a "admins") en cualquier política sobre
-- la propia tabla "admins", o Postgres cae en "infinite recursion detected in
-- policy for relation admins" (la política se dispara a sí misma).
create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
as $$
  select exists (select 1 from public.admins a where a.user_id = auth.uid());
$$;

-- Un admin puede ver la lista de admins (para debug); nadie más.
create policy "admins_select_propio_o_admin"
  on public.admins for select
  using (auth.uid() = user_id or public.is_admin());

-- ---------------------------------------------------------------------
-- 2. TABLA: casos
--    Un "caso" = una evaluación de background check para una persona.
--    El admin crea el registro (y el usuario en Auth) al iniciar el caso.
-- ---------------------------------------------------------------------
create table if not exists public.casos (
  id uuid primary key default gen_random_uuid(),
  evaluado_user_id uuid not null references auth.users(id) on delete cascade,
  nombre_completo text not null,
  empresa_solicitante text,
  tipo_evaluacion text not null default 'estandar', -- estandar | laboral | proveedor | socio
  estado text not null default 'pendiente'
    check (estado in ('pendiente','en_revision','observado','aprobado','rechazado')),
  notas_admin text,
  creado_en timestamptz default now(),
  actualizado_en timestamptz default now()
);

alter table public.casos enable row level security;

create policy "casos_select_propio_o_admin"
  on public.casos for select
  using (evaluado_user_id = auth.uid() or public.is_admin());

create policy "casos_update_propio_o_admin"
  on public.casos for update
  using (evaluado_user_id = auth.uid() or public.is_admin());

create policy "casos_insert_solo_admin"
  on public.casos for insert
  with check (public.is_admin());

-- ---------------------------------------------------------------------
-- 3. TABLA: datos_evaluado
--    Formulario que llena el evaluado (1 fila por caso).
-- ---------------------------------------------------------------------
create table if not exists public.datos_evaluado (
  caso_id uuid primary key references public.casos(id) on delete cascade,
  cedula_pasaporte text,
  fecha_nacimiento date,
  direccion text,
  telefono text,
  email_contacto text,
  cargo_puesto text,
  referencias jsonb default '[]'::jsonb, -- [{nombre, relacion, telefono, email}]
  consentimiento_lopdp boolean not null default false,
  consentimiento_fecha timestamptz,
  declaracion_veracidad boolean not null default false,
  enviado boolean not null default false,
  enviado_en timestamptz,
  actualizado_en timestamptz default now()
);

alter table public.datos_evaluado enable row level security;

create policy "datos_select_propio_o_admin"
  on public.datos_evaluado for select
  using (
    exists (select 1 from public.casos c where c.id = caso_id and c.evaluado_user_id = auth.uid())
    or public.is_admin()
  );

create policy "datos_insert_propio"
  on public.datos_evaluado for insert
  with check (
    exists (select 1 from public.casos c where c.id = caso_id and c.evaluado_user_id = auth.uid())
  );

create policy "datos_update_propio_o_admin"
  on public.datos_evaluado for update
  using (
    exists (select 1 from public.casos c where c.id = caso_id and c.evaluado_user_id = auth.uid())
    or public.is_admin()
  );

-- ---------------------------------------------------------------------
-- 4. Trigger: mantener actualizado_en al día en casos
-- ---------------------------------------------------------------------
create or replace function public.set_actualizado_en()
returns trigger
language plpgsql
as $$
begin
  new.actualizado_en = now();
  return new;
end;
$$;

drop trigger if exists trg_casos_actualizado on public.casos;
create trigger trg_casos_actualizado
  before update on public.casos
  for each row execute function public.set_actualizado_en();

drop trigger if exists trg_datos_actualizado on public.datos_evaluado;
create trigger trg_datos_actualizado
  before update on public.datos_evaluado
  for each row execute function public.set_actualizado_en();

-- =====================================================================
-- 5. STORAGE: bucket privado "documentos"
--    Crear el bucket manualmente en Supabase Dashboard > Storage:
--    - Nombre: documentos
--    - Public: NO (privado)
--    Luego correr las políticas de abajo.
--    Convención de ruta: {caso_id}/{tipo_documento}.{ext}
--    Ej: 3f2a.../cedula.pdf, 3f2a.../cv.pdf
-- =====================================================================

create policy "storage_select_propio_o_admin"
  on storage.objects for select
  using (
    bucket_id = 'documentos'
    and (
      public.is_admin()
      or exists (
        select 1 from public.casos c
        where c.id::text = (storage.foldername(name))[1]
        and c.evaluado_user_id = auth.uid()
      )
    )
  );

create policy "storage_insert_propio"
  on storage.objects for insert
  with check (
    bucket_id = 'documentos'
    and exists (
      select 1 from public.casos c
      where c.id::text = (storage.foldername(name))[1]
      and c.evaluado_user_id = auth.uid()
    )
  );

create policy "storage_update_propio_o_admin"
  on storage.objects for update
  using (
    bucket_id = 'documentos'
    and (
      public.is_admin()
      or exists (
        select 1 from public.casos c
        where c.id::text = (storage.foldername(name))[1]
        and c.evaluado_user_id = auth.uid()
      )
    )
  );

-- =====================================================================
-- Fin del esquema.
-- =====================================================================
