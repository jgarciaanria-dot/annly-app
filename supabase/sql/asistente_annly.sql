-- Asistente virtual de la página de Annly (visitantes interesados). Idempotente.
-- Cuenta cuántos mensajes manda cada visitante por día para que nadie dispare el costo de la IA.
create table if not exists public.asistente_uso (
  clave text not null,           -- huella del visitante (no se guarda la IP)
  dia   date not null default current_date,
  n     integer not null default 0,
  primary key (clave, dia)
);
alter table public.asistente_uso enable row level security;   -- sin políticas: solo la función (service_role) la toca
revoke all on public.asistente_uso from public, anon, authenticated;

-- Suma 1 al contador y dice si todavía puede preguntar (true) o ya llegó al límite (false). Atómica.
create or replace function public.asistente_registrar(p_clave text, p_limite integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare v integer;
begin
  insert into asistente_uso (clave, dia, n) values (p_clave, current_date, 1)
  on conflict (clave, dia) do update set n = asistente_uso.n + 1
  returning n into v;
  delete from asistente_uso where dia < current_date - 7;
  return v <= p_limite;
end $$;

revoke execute on function public.asistente_registrar(text, integer) from public, anon, authenticated;
grant execute on function public.asistente_registrar(text, integer) to service_role;


-- =========================================================
-- Registro de conversaciones y prospectos del asistente. Idempotente.
-- Solo la función (service_role) lee y escribe; nadie más ve esta tabla.
-- =========================================================
create table if not exists public.asistente_conversaciones (
  id            uuid primary key,                       -- lo genera la página por conversación
  visitante     text not null,                          -- huella del visitante (no se guarda la IP)
  origen        text,                                   -- página desde la que escribió
  creado        timestamptz not null default now(),
  actualizado   timestamptz not null default now(),
  mensajes      jsonb not null default '[]'::jsonb,     -- [{r:'user'|'assistant', t:'...', at:'...'}]
  n_usuario     integer not null default 0,             -- mensajes del visitante
  uso_maqueta   boolean not null default false,
  rubro         text,                                   -- lo infiere la IA
  producto      text,                                   -- agenda | tiendas | ninguno
  interes       text,                                   -- alto | medio | bajo
  resumen       text,
  freno         text,                                   -- qué lo frena (precio, tarjeta, algo que no hacemos...)
  nombre        text,                                   -- solo si el visitante lo dijo
  contacto      text,                                   -- correo o teléfono que dejó
  contacto_at   timestamptz,
  estado        text not null default 'nuevo'           -- nuevo | contactado | cerrado (lo cambias tú)
);
create index if not exists asistente_conv_actualizado on public.asistente_conversaciones (actualizado desc);
create index if not exists asistente_conv_contacto on public.asistente_conversaciones (contacto_at desc) where contacto is not null;
alter table public.asistente_conversaciones enable row level security;   -- sin políticas
revoke all on public.asistente_conversaciones from public, anon, authenticated;

-- Consultas útiles (SQL editor):
--   Prospectos con contacto:   select creado, nombre, contacto, rubro, producto, interes, resumen, freno, estado
--                              from asistente_conversaciones where contacto is not null order by creado desc;
--   Interés alto sin contacto: select creado, rubro, producto, resumen, freno from asistente_conversaciones
--                              where interes = 'alto' and contacto is null order by creado desc;
--   Interacción por día:       select creado::date dia, count(*) conversaciones, count(*) filter (where n_usuario >= 3) con_3_o_mas,
--                              count(*) filter (where uso_maqueta) con_maqueta, count(*) filter (where contacto is not null) prospectos
--                              from asistente_conversaciones group by 1 order by 1 desc;
--   Qué los frena:             select freno, count(*) from asistente_conversaciones where freno is not null group by 1 order by 2 desc;
--   Marcar contactado:         update asistente_conversaciones set estado = 'contactado' where id = '...';
--   Borrar conversaciones viejas (opcional): delete from asistente_conversaciones where creado < now() - interval '180 days' and contacto is null;
