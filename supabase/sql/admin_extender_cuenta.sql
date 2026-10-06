-- admin_extender_cuenta: el Platform Admin de Annly mueve la fecha de fin de la suscripción de un negocio
-- (prórroga de pago, cortesía o acuerdo comercial) y queda registrado quién, cuándo y por qué.
--   p_hasta   : nueva fecha de fin. Para una cortesía sin vencimiento se usa 2099-12-31.
--   p_motivo  : obligatorio (queda en registro_acciones).
--   p_activar : true = la suscripción pasa a 'active' (cortesía/acuerdo con el plan completo);
--               false = se mantiene como está (p. ej. una prueba gratis que se alarga).
-- Solo funciona si quien llama es Platform Admin (se llama desde el panel, no desde el SQL Editor).
create or replace function public.admin_extender_cuenta(
  p_negocio uuid, p_hasta date, p_motivo text, p_activar boolean default false
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sub record;
  v_correo text;
begin
  if not public.is_platform_admin() then
    raise exception 'No autorizado';
  end if;
  if p_motivo is null or length(trim(p_motivo)) < 3 then
    raise exception 'Indica el motivo';
  end if;
  if p_hasta is null then
    raise exception 'Indica la fecha';
  end if;

  select id, status, current_period_end into v_sub
  from subscriptions
  where business_id = p_negocio and status not in ('cancelled', 'canceled')
  order by created_at desc
  limit 1;
  if v_sub.id is null then
    raise exception 'El negocio no tiene suscripción';
  end if;

  update subscriptions
  set current_period_end = p_hasta,
      status = case when p_activar then 'active' else status end
  where id = v_sub.id;

  select email into v_correo from auth.users where id = auth.uid();
  insert into registro_acciones (business_id, entidad, entidad_id, accion, motivo, detalle, usuario_id, usuario_correo)
  values (
    p_negocio, 'suscripcion', v_sub.id::text, 'extender_cuenta', trim(p_motivo),
    json_build_object('antes', v_sub.current_period_end, 'despues', p_hasta, 'estado_antes', v_sub.status, 'activar', p_activar),
    auth.uid(), v_correo
  );

  return json_build_object('antes', v_sub.current_period_end, 'despues', p_hasta);
end;
$$;

grant execute on function public.admin_extender_cuenta(uuid, date, text, boolean) to authenticated;
