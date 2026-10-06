-- Inscripción de clientes desde la agenda pública (plan Medium o Ultimate).
-- 1) Interruptor del negocio y datos nuevos de cada cliente
alter table public.businesses add column if not exists inscripcion_clientes boolean not null default false;

alter table public.clients
  add column if not exists acepta_promos boolean not null default false,
  add column if not exists consentimiento_en timestamptz,
  add column if not exists cumple_dia smallint,
  add column if not exists cumple_mes smallint,
  add column if not exists origen text,
  add column if not exists inscrito_en timestamptz;

-- 2) ¿La agenda pública puede mostrar el botón? (negocio activo, interruptor encendido,
--    plan Medium/Ultimate ya activo —no en prueba— y cuenta no suspendida)
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
       and exists (
         select 1 from subscriptions s join plans p on p.id = s.plan_id
         where s.business_id = b.id
           and s.status not in ('cancelled', 'canceled', 'trial')
           and upper(p.code) in ('MEDIUM', 'ULTIMATE')
       )
       and not public.negocio_suspendido(b.id)
    from businesses b where b.id = p_business
  ), false);
$$;
grant execute on function public.inscripcion_clientes_activa(uuid) to anon, authenticated;

-- 3) Inscribirse: crea o actualiza al cliente (por teléfono) con su consentimiento
create or replace function public.inscribir_cliente(
  p_business uuid, p_nombre text, p_telefono text, p_correo text,
  p_cumple_dia int, p_cumple_mes int, p_acepta boolean
) returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nombre text := btrim(coalesce(p_nombre, ''));
  v_tel text := btrim(coalesce(p_telefono, ''));
  v_digitos text := regexp_replace(coalesce(p_telefono, ''), '\D', '', 'g');
  v_correo text := nullif(btrim(coalesce(p_correo, '')), '');
  v_id uuid;
  v_dias int[] := array[31,29,31,30,31,30,31,31,30,31,30,31];
begin
  if not public.inscripcion_clientes_activa(p_business) then
    return json_build_object('ok', false, 'error', 'no_disponible');
  end if;
  if not coalesce(p_acepta, false) then
    return json_build_object('ok', false, 'error', 'consentimiento');
  end if;
  if char_length(v_nombre) < 2 or char_length(v_nombre) > 80 then
    return json_build_object('ok', false, 'error', 'nombre');
  end if;
  if char_length(v_digitos) < 7 or char_length(v_digitos) > 15 then
    return json_build_object('ok', false, 'error', 'telefono');
  end if;
  if v_correo is not null and (char_length(v_correo) > 120 or v_correo !~ '^\S+@\S+\.\S+$') then
    return json_build_object('ok', false, 'error', 'correo');
  end if;
  if (p_cumple_dia is null) <> (p_cumple_mes is null) then
    return json_build_object('ok', false, 'error', 'cumple');
  end if;
  if p_cumple_mes is not null and (p_cumple_mes < 1 or p_cumple_mes > 12 or p_cumple_dia < 1 or p_cumple_dia > v_dias[p_cumple_mes]) then
    return json_build_object('ok', false, 'error', 'cumple');
  end if;

  select id into v_id from clients
   where business_id = p_business and regexp_replace(coalesce(telefono, ''), '\D', '', 'g') = v_digitos
   limit 1;

  if v_id is not null then
    update clients set
      nombre = case when coalesce(btrim(nombre), '') = '' then v_nombre else nombre end,
      email = coalesce(email, v_correo),
      acepta_promos = true,
      consentimiento_en = now(),
      cumple_dia = coalesce(p_cumple_dia, cumple_dia),
      cumple_mes = coalesce(p_cumple_mes, cumple_mes),
      origen = coalesce(origen, 'inscripcion'),
      inscrito_en = coalesce(inscrito_en, now())
    where id = v_id;
    return json_build_object('ok', true, 'nuevo', false);
  end if;

  insert into clients (business_id, nombre, telefono, email, acepta_promos, consentimiento_en, cumple_dia, cumple_mes, origen, inscrito_en)
  values (p_business, v_nombre, v_tel, v_correo, true, now(), p_cumple_dia, p_cumple_mes, 'inscripcion', now());
  return json_build_object('ok', true, 'nuevo', true);
end;
$$;
grant execute on function public.inscribir_cliente(uuid, text, text, text, int, int, boolean) to anon, authenticated;
