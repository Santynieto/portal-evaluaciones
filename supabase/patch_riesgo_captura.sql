-- =====================================================================
-- PARCHE: niveles de riesgo, capturas de pantalla y PDF final
-- Ejecutar UNA VEZ en: Supabase Dashboard > SQL Editor > New query
-- (versión segura de re-ejecutar aunque un intento anterior haya fallado)
-- =====================================================================

-- 1. Si la columna todavía se llama "resultado", renombrarla.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'verificaciones' and column_name = 'resultado'
  ) then
    alter table public.verificaciones rename column resultado to nivel_riesgo;
  end if;
end $$;

-- 2. Quitar la restricción vieja PRIMERO (si no, no deja migrar los datos).
alter table public.verificaciones drop constraint if exists verificaciones_resultado_check;
alter table public.verificaciones drop constraint if exists verificaciones_nivel_riesgo_check;

-- 3. Recién ahora adaptar cualquier valor antiguo a los 4 niveles nuevos.
update public.verificaciones set nivel_riesgo = 'bajo'  where nivel_riesgo = 'sin_novedad';
update public.verificaciones set nivel_riesgo = 'medio' where nivel_riesgo = 'con_novedad';
update public.verificaciones set nivel_riesgo = 'bajo'  where nivel_riesgo = 'no_verificable';

-- 4. Aplicar la restricción nueva.
alter table public.verificaciones add constraint verificaciones_nivel_riesgo_check
  check (nivel_riesgo in ('bajo','medio','alto','critico'));
alter table public.verificaciones alter column nivel_riesgo set default 'bajo';

-- 5. Ruta de la captura de pantalla adjunta a esa verificación (dentro del
--    bucket "documentos").
alter table public.verificaciones add column if not exists captura_path text;

-- 6. Nivel de riesgo final del caso completo (lo decide el admin, aparece
--    destacado en el PDF para el cliente).
alter table public.casos add column if not exists nivel_riesgo_final text;
alter table public.casos drop constraint if exists casos_nivel_riesgo_final_check;
alter table public.casos add constraint casos_nivel_riesgo_final_check
  check (nivel_riesgo_final in ('bajo','medio','alto','critico'));

-- 7. El analista puede subir capturas de pantalla al bucket "documentos"
--    bajo la carpeta de cualquier caso existente.
drop policy if exists "storage_insert_analista" on storage.objects;
create policy "storage_insert_analista"
  on storage.objects for insert
  with check (
    bucket_id = 'documentos'
    and public.is_analista()
    and exists (select 1 from public.casos c where c.id::text = (storage.foldername(name))[1])
  );

-- =====================================================================
-- Fin del parche.
-- =====================================================================
