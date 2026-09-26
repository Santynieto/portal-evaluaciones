-- =====================================================================
-- PARCHE: niveles de riesgo, capturas de pantalla y PDF final
-- Ejecutar UNA VEZ en: Supabase Dashboard > SQL Editor > New query
-- =====================================================================

-- 1. "resultado" (sin_novedad/con_novedad/no_verificable) pasa a ser
--    directamente el nivel de riesgo encontrado en esa fuente.
alter table public.verificaciones rename column resultado to nivel_riesgo;
alter table public.verificaciones drop constraint if exists verificaciones_resultado_check;
alter table public.verificaciones add constraint verificaciones_nivel_riesgo_check
  check (nivel_riesgo in ('bajo','medio','alto','critico'));
alter table public.verificaciones alter column nivel_riesgo set default 'bajo';

-- 2. Ruta de la captura de pantalla adjunta a esa verificación (dentro del
--    bucket "documentos").
alter table public.verificaciones add column if not exists captura_path text;

-- 3. Nivel de riesgo final del caso completo (lo decide el admin, aparece
--    destacado en el PDF para el cliente).
alter table public.casos add column if not exists nivel_riesgo_final text
  check (nivel_riesgo_final in ('bajo','medio','alto','critico'));

-- 4. El analista puede subir capturas de pantalla al bucket "documentos"
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
