-- Enlace corto y legible para la agenda de cada profesional: annly.app/agenda/paola-3fa9c01b27de
-- El token largo de siempre sigue funcionando (mi-agenda.html?t=TOKEN). Idempotente.
-- El código = nombre (solo para que se lea bien) + 12 caracteres hex al azar (48 bits). Lo que protege el enlace es la parte al azar.
alter table public.agenda_profesional_enlaces add column if not exists codigo text;

update public.agenda_profesional_enlaces l
set codigo = left(coalesce(nullif(trim(both '-' from regexp_replace(lower(translate(e.nombre, 'áéíóúüñÁÉÍÓÚÜÑ', 'aeiouunAEIOUUN')), '[^a-z0-9]+', '-', 'g')), ''), 'agenda'), 20)
             || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12)
from public.employees e
where e.id::text = l.employee_id and l.codigo is null;

update public.agenda_profesional_enlaces
set codigo = 'agenda-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12)
where codigo is null;

create unique index if not exists agenda_pro_enlaces_codigo on public.agenda_profesional_enlaces (codigo);
