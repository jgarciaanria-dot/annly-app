-- Programa de clientes para Tiendas (módulo PEDIDOS_CLIENTES, $6/mes).
-- Reemplaza inscripcion_clientes_activa para atender a las dos ramas:
--  · Agenda: plan Medium o Ultimate ya activo (no en prueba).
--  · Tiendas: el módulo PEDIDOS_CLIENTES contratado y vigente (activo, o en prueba sin vencer).
-- En ambos casos: negocio activo, interruptor encendido y cuenta no suspendida.
create or replace function public.inscripcion_clientes_activa(p_business uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select b.inscripcion_clientes
       and coalesce(b.activo, true)
       and not public.negocio_suspendido(b.id)
       and case
         when b.tipo_negocio = 'pedidos' then exists (
           select 1
           from subscriptions s
           join subscription_items i on i.subscription_id = s.id
           where s.business_id = b.id
             and s.status not in ('cancelled', 'canceled')
             and (s.status <> 'trial' or s.current_period_end is null or left(s.current_period_end::text, 10) >= (now() at time zone 'America/Panama')::date::text)
             and i.item_type = 'addon' and i.item_code = 'PEDIDOS_CLIENTES' and i.is_active
             and (i.cancela_el is null or i.cancela_el >= (now() at time zone 'America/Panama')::date)
         )
         else exists (
           select 1 from subscriptions s join plans p on p.id = s.plan_id
           where s.business_id = b.id
             and s.status not in ('cancelled', 'canceled', 'trial')
             and upper(p.code) in ('MEDIUM', 'ULTIMATE')
         )
       end
    from businesses b where b.id = p_business
  ), false);
$$;
grant execute on function public.inscripcion_clientes_activa(uuid) to anon, authenticated;

-- El módulo ya está construido: se pone a la venta ($6/mes)
update public.features set is_active = true, monthly_price = 6.00 where code = 'PEDIDOS_CLIENTES';
