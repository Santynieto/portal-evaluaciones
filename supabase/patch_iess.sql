-- =====================================================================
-- PARCHE: agregar "iess" como fuente válida de verificación (fase
-- "Historial laboral", analizado con IA desde el Certificado de
-- Mecanizado que sube el propio evaluado).
-- Ejecutar UNA VEZ en: Supabase Dashboard > SQL Editor > New query
-- =====================================================================

alter table public.verificaciones drop constraint if exists verificaciones_fuente_check;
alter table public.verificaciones add constraint verificaciones_fuente_check
  check (fuente in ('judicatura','ministerio_interior','fiscalia','supercias','supa','whitepages','iess','redes_sociales','otro'));

-- =====================================================================
-- Fin del parche.
-- =====================================================================
