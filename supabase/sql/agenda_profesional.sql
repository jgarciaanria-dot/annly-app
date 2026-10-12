-- Enlace privado de solo lectura con la agenda de cada profesional. Idempotente.
-- El dueño crea el enlace desde Equipo; el profesional lo abre en su celular (mi-agenda.html?t=TOKEN) sin contraseña.
-- La página llama a la Edge Function agenda-profesional, que valida el token y devuelve solo las citas de ese profesional.
-- El token vive en una tabla aparte (no en employees) para que nunca salga por las consultas públicas de la agenda.
create table if not exists public.agenda_profesional_enlaces (
  employee_id text primary key,                          -- id del profesional (employees.id)
  business_id uuid not null,
  token       text not null unique,                      -- 48 caracteres hex generados con crypto.getRandomValues
  creado      timestamptz not null default now()
);
create index if not exists agenda_pro_enlaces_negocio on public.agenda_profesional_enlaces (business_id);

alter table public.agenda_profesional_enlaces enable row level security;
revoke all on public.agenda_profesional_enlaces from public, anon;
grant select, insert, update, delete on public.agenda_profesional_enlaces to authenticated;

drop policy if exists agenda_pro_enlaces_dueno on public.agenda_profesional_enlaces;
create policy agenda_pro_enlaces_dueno on public.agenda_profesional_enlaces for all to authenticated
using (
  exists (select 1 from public.businesses b where b.id = agenda_profesional_enlaces.business_id and b.owner_user_id = auth.uid())
)
with check (
  exists (select 1 from public.businesses b where b.id = agenda_profesional_enlaces.business_id and b.owner_user_id = auth.uid())
  and exists (select 1 from public.employees e where e.id::text = agenda_profesional_enlaces.employee_id and e.business_id = agenda_profesional_enlaces.business_id)
);
