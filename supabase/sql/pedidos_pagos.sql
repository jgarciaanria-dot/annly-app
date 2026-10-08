-- Pagos en línea para Tiendas (Yappy Comercial por negocio). Idempotente.
-- 1) Módulo "Pagos en línea" (inactivo hasta que todo esté probado; se activa con el último update de este archivo)
insert into public.features (code, name, description, monthly_price, is_addon, is_active, producto)
select 'PEDIDOS_PAGOS', 'Pagos en línea',
       'Cobra en línea con Yappy Comercial y confirma los pagos de tus pedidos automáticamente. Si ya usas otra pasarela de pagos (Tilopay, PagueloFácil, Tafi u otra), la integramos contigo.',
       5.00, true, false, 'pedidos'
where not exists (select 1 from public.features where code = 'PEDIDOS_PAGOS');

-- 2) ¿El negocio puede usar ese módulo ahora? (suscripción activa o prueba vigente, y módulo agregado y no cancelado)
create or replace function public.pedido_modulo_activo(p_business uuid, p_code text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from subscriptions s
    join subscription_items i on i.subscription_id = s.id
    where s.business_id = p_business
      and s.status not in ('cancelled', 'canceled')
      and (s.status = 'active'
           or (s.status = 'trial' and (s.current_period_end is null or left(s.current_period_end::text, 10) >= (now() at time zone 'America/Panama')::date::text)))
      and i.item_type = 'addon' and i.item_code = p_code and i.is_active
      and (i.cancela_el is null or i.cancela_el >= (now() at time zone 'America/Panama')::date)
  );
$$;

-- 3) Cuánto se cobra de un pedido: lo que dice la base (abono o total), nunca lo que diga el navegador
create or replace function public.pedido_yappy_monto(p_order uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare o record; v_monto numeric;
begin
  select id, business_id, numero, estado, expires_at into o from orders where id = p_order;
  if o.id is null then raise exception 'El pedido no existe.'; end if;
  if o.estado <> 'PENDIENTE' then raise exception 'Este pedido ya no está pendiente de pago.'; end if;
  if o.expires_at is not null and o.expires_at < now() then raise exception 'Este pedido venció. Haz uno nuevo.'; end if;
  select monto into v_monto from order_payments
   where order_id = o.id and tipo = 'inicial' and estado = 'pendiente' order by created_at desc limit 1;
  if v_monto is null or v_monto <= 0 then raise exception 'Este pedido no tiene un pago pendiente.'; end if;
  return jsonb_build_object('businessId', o.business_id, 'numero', o.numero, 'monto', v_monto);
end $$;

-- 4) Yappy confirmó el pago: el pedido pasa a CONFIRMADO (una sola vez, aunque el aviso llegue repetido)
create or replace function public.pedido_pagado_yappy(p_order uuid, p_yappy_order text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare o orders%rowtype;
begin
  select * into o from orders where id = p_order for update;
  if o.id is null then return 'no_existe'; end if;
  if o.estado = 'CONFIRMADO' then return 'ya_confirmado'; end if;
  if o.estado <> 'PENDIENTE' then
    -- Pagó cuando el pedido ya se había liberado o cancelado: el negocio lo revisa a mano
    insert into order_history (order_id, business_id, evento, detalle)
    values (o.id, o.business_id, 'pago_yappy_tardio', jsonb_build_object('yappy', p_yappy_order, 'estado', o.estado));
    return 'revisar';
  end if;
  update order_payments set estado = 'confirmado', metodo = 'yappy', comprobante = 'YAPPY:' || p_yappy_order, confirmado_en = now()
   where order_id = o.id and tipo = 'inicial' and estado = 'pendiente';
  update inventory_movements set tipo = 'venta' where order_id = o.id and tipo = 'reserva';
  update orders set estado = 'CONFIRMADO', expires_at = null, updated_at = now() where id = o.id;
  insert into order_history (order_id, business_id, evento, detalle)
  values (o.id, o.business_id, 'pago_confirmado', jsonb_build_object('via', 'yappy_comercial', 'yappy', p_yappy_order));
  return 'confirmado';
end $$;

-- Solo las Edge Functions (service_role) pueden usarlas
revoke execute on function public.pedido_modulo_activo(uuid, text) from public, anon, authenticated;
revoke execute on function public.pedido_yappy_monto(uuid) from public, anon, authenticated;
revoke execute on function public.pedido_pagado_yappy(uuid, text) from public, anon, authenticated;
grant execute on function public.pedido_modulo_activo(uuid, text) to service_role;
grant execute on function public.pedido_yappy_monto(uuid) to service_role;
grant execute on function public.pedido_pagado_yappy(uuid, text) to service_role;

-- 5) Módulo a la venta (probado de punta a punta)
update public.features set is_active = true where code = 'PEDIDOS_PAGOS';
