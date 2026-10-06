-- Correo de bienvenida: marca para no enviarlo dos veces al mismo negocio.
alter table public.businesses add column if not exists bienvenida_enviada_at timestamptz;
-- Los negocios que ya existen no reciben el correo.
update public.businesses set bienvenida_enviada_at = now() where bienvenida_enviada_at is null;
