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
-- 1b. TABLA: analistas
--    Usuarios que investigan casos (revisan documentos y fuentes externas)
--    pero NO pueden aprobar/rechazar — eso lo decide solo el admin.
--    insert into public.analistas (user_id) values ('<uuid del usuario>');
-- ---------------------------------------------------------------------
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

create policy "analistas_select_propio_o_admin"
  on public.analistas for select
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
  nivel_riesgo_final text check (nivel_riesgo_final in ('bajo','medio','alto','critico')),
  creado_en timestamptz default now(),
  actualizado_en timestamptz default now()
);

alter table public.casos enable row level security;

create policy "casos_select_propio_o_admin"
  on public.casos for select
  using (evaluado_user_id = auth.uid() or public.is_admin() or public.is_analista());

create policy "casos_update_propio_o_admin"
  on public.casos for update
  using (evaluado_user_id = auth.uid() or public.is_admin());

-- El analista solo puede mover un caso a "en_revision" (marca que ya lo
-- investigó); nunca puede dejarlo en aprobado/rechazado/observado.
create policy "casos_update_analista_solo_en_revision"
  on public.casos for update
  using (public.is_analista())
  with check (estado = 'en_revision');

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
    or public.is_analista()
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

-- ---------------------------------------------------------------------
-- 4b. TABLA: verificaciones
--    Una fila por CADA FASE (fuente) de la verificación estándar, por
--    caso: identidad/whitepages, SUPA, Fiscalía, Ministerio del Interior,
--    Judicatura, entorno web. Es un estado por fase (editable), no un log
--    — de ahí el unique (caso_id, fuente).
-- ---------------------------------------------------------------------
create table if not exists public.verificaciones (
  id uuid primary key default gen_random_uuid(),
  caso_id uuid not null references public.casos(id) on delete cascade,
  fuente text not null
    check (fuente in ('judicatura','ministerio_interior','fiscalia','supercias','supa','whitepages','redes_sociales','otro')),
  nivel_riesgo text not null default 'bajo'
    check (nivel_riesgo in ('bajo','medio','alto','critico')),
  notas text,
  captura_path text, -- ruta dentro del bucket "documentos" a la captura de pantalla adjunta
  analista_user_id uuid references auth.users(id),
  creado_en timestamptz default now(),
  actualizado_en timestamptz default now(),
  unique (caso_id, fuente)
);

drop trigger if exists trg_verificaciones_actualizado on public.verificaciones;
create trigger trg_verificaciones_actualizado
  before update on public.verificaciones
  for each row execute function public.set_actualizado_en();

alter table public.verificaciones enable row level security;

create policy "verificaciones_select_analista_o_admin"
  on public.verificaciones for select
  using (public.is_analista() or public.is_admin());

create policy "verificaciones_insert_analista_o_admin"
  on public.verificaciones for insert
  with check ((public.is_analista() or public.is_admin()) and analista_user_id = auth.uid());

-- Cualquier analista puede seguir/editar una fase ya iniciada por otro
-- (no hay "casos asignados" a un analista en particular).
create policy "verificaciones_update_analista_o_admin"
  on public.verificaciones for update
  using (public.is_analista() or public.is_admin());

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
      or public.is_analista()
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

-- El analista sube capturas de pantalla de verificación bajo la carpeta de
-- cualquier caso existente (no tiene "sus propios" casos, ve todos).
create policy "storage_insert_analista"
  on storage.objects for insert
  with check (
    bucket_id = 'documentos'
    and public.is_analista()
    and exists (select 1 from public.casos c where c.id::text = (storage.foldername(name))[1])
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
