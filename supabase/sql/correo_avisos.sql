-- Correo extra para los avisos del negocio (citas nuevas, cambios, cancelaciones, certificados).
-- Los avisos siempre llegan también al correo de acceso al panel.
alter table public.businesses add column if not exists correo_avisos text;
