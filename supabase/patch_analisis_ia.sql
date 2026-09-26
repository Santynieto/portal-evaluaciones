-- =====================================================================
-- PARCHE: columna para guardar los análisis de IA de los documentos de
-- Judicatura (uno por documento subido, dentro de la fila de esa fase).
-- Ejecutar UNA VEZ en: Supabase Dashboard > SQL Editor > New query
-- =====================================================================

alter table public.verificaciones
  add column if not exists analisis_documentos jsonb not null default '[]'::jsonb;

-- =====================================================================
-- Fin del parche.
-- =====================================================================
