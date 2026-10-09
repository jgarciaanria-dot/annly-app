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
