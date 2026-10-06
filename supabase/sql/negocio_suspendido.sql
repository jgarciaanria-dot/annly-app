-- negocio_suspendido(p_negocio): ¿la cuenta del negocio está suspendida por falta de pago?
-- La usan la agenda pública (annly.app) y la tienda pública (tienda.annly.app) para quedar en solo vista.
-- Regla (la misma de annlyEstadoCuenta() en sheets.js y pedidos.js):
--   vence al terminar el día de current_period_end (hora de Panamá); desde el vencimiento hay 48 horas de gracia;
--   quien ya estaba vencido antes del 2026-10-07 cuenta sus 48 horas desde esa fecha.
-- Sin suscripción o sin fecha de fin: no se suspende.
create or replace function public.negocio_suspendido(p_negocio uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select (now() at time zone 'America/Panama') >=
           greatest(
             (left(s.current_period_end::text, 10)::date + 1)::timestamp,
             timestamp '2026-10-07 00:00:00'
           ) + interval '48 hours'
    from subscriptions s
    where s.business_id = p_negocio
      and s.status not in ('cancelled', 'canceled')
      and s.current_period_end is not null
    order by s.created_at desc
    limit 1
  ), false);
$$;

grant execute on function public.negocio_suspendido(uuid) to anon, authenticated;

-- Para ver qué negocios quedarían suspendidos (revisar ANTES de que empiece a regir):
-- select b.id, b.nombre, b.slug, s.status, s.current_period_end, public.negocio_suspendido(b.id) as suspendido
-- from businesses b left join subscriptions s on s.business_id = b.id and s.status not in ('cancelled','canceled')
-- order by suspendido desc, b.nombre;
