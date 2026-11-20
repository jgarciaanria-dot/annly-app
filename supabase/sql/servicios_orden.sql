-- Orden de los servicios dentro de su categoría (flechas de subir/bajar en el panel).
-- La página de reservas muestra los servicios por `orden` y, a igualdad, por fecha de creación.
alter table public.services
  add column if not exists orden integer not null default 0;

-- Numera los servicios existentes en cada categoría según su orden de creación (el orden que ya se veía)
update public.services s
set orden = r.rn
from (
  select id, (row_number() over (partition by business_id, categoria order by creado_en, id) - 1) as rn
  from public.services
) r
where r.id = s.id;
