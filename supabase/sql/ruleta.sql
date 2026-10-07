-- =========================================================
-- Ruleta de premios (Annly Agenda, plan Medium o Ultimate)
-- Ejecutar completo en el SQL Editor de Supabase. Se puede repetir sin problema.
-- Antes de ejecutar el paso 6 (limpieza de premios repetidos) conviene mirar la vista previa que trae.
--
-- Qué corrige respecto a la versión anterior:
--  · Guardar los premios ya no borra y vuelve a crear todo (eso duplicaba premios cuando ya había ganadores).
--  · El sorteo normaliza el teléfono (solo dígitos), garantiza un giro por cliente (también si dos giros llegan a la vez)
--    y exige una reserva real (la cita que se acaba de guardar).
--  · La ruleta puede aparecer siempre, solo en un periodo (aniversario, promoción) o cuando el cliente está de cumpleaños.
--  · Solo hay ruleta en Medium o Ultimate, con cuenta no suspendida.
--  · El sorteo devuelve el id del premio y esPremioReal para que la pantalla muestre el código de canje.
--  · Un premio con probabilidad 0 nunca puede salir.
-- =========================================================

-- 1) Los premios que se quitan de la lista, pero ya tienen ganadores, se archivan en vez de borrarse
alter table public.roulette_prizes add column if not exists archivado boolean not null default false;

-- 1b) ¿Cuándo aparece la ruleta? (configurable desde el panel)
--   siempre : a cada cliente, una sola vez
--   periodo : entre dos fechas (promoción, aniversario...); una vez por cliente durante el periodo
--   cumple  : a clientes registrados que están de cumpleaños (el día o todo el mes); una vez al año
alter table public.business_features
  add column if not exists ruleta_modo text not null default 'siempre',
  add column if not exists ruleta_desde date,
  add column if not exists ruleta_hasta date,
  add column if not exists ruleta_titulo text,
  add column if not exists ruleta_cumple text not null default 'mes';

-- 2) Teléfono a solo dígitos (para comparar "6815-5141" con "68155141")
create or replace function public.solo_digitos(t text)
returns text
language sql
immutable
as $$ select regexp_replace(coalesce(t, ''), '\D', '', 'g') $$;

-- 3) ¿Este negocio puede ofrecer la ruleta ahora mismo?
create or replace function public.ruleta_disponible(p_business uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select coalesce((select bool_or(coalesce(f.ruleta_premios, false)) from business_features f where f.business_id = b.id), false)
       and coalesce(b.activo, true)
       and not public.negocio_suspendido(b.id)
       and exists (
         select 1 from subscriptions s join plans p on p.id = s.plan_id
         where s.business_id = b.id
           and s.status not in ('cancelled', 'canceled', 'trial')
           and upper(p.code) in ('MEDIUM', 'ULTIMATE')
       )
    from businesses b where b.id = p_business
  ), false);
$$;
grant execute on function public.ruleta_disponible(uuid) to anon, authenticated;

-- 4) ¿Esta persona puede girar ahora? (ruleta disponible, dentro de la regla elegida y sin haber girado ya en ese periodo)
create or replace function public.ruleta_elegible(p_business uuid, p_telefono text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_tel text := public.solo_digitos(p_telefono);
  v_hoy date := (now() at time zone 'America/Panama')::date;
  f record;
begin
  if char_length(v_tel) < 7 or not public.ruleta_disponible(p_business) then
    return false;
  end if;
  select ruleta_modo, ruleta_desde, ruleta_hasta, ruleta_cumple into f
    from business_features where business_id = p_business order by ruleta_premios desc nulls last limit 1;

  if coalesce(f.ruleta_modo, 'siempre') = 'periodo' then
    if f.ruleta_desde is null or f.ruleta_hasta is null or v_hoy < f.ruleta_desde or v_hoy > f.ruleta_hasta then
      return false;
    end if;
    return not exists (
      select 1 from roulette_wins w
      where w.business_id = p_business and public.solo_digitos(w.telefono) = v_tel
        and (w.ganado_en at time zone 'America/Panama')::date between f.ruleta_desde and f.ruleta_hasta);

  elsif f.ruleta_modo = 'cumple' then
    if not exists (
      select 1 from clients c
      where c.business_id = p_business and public.solo_digitos(c.telefono) = v_tel
        and c.cumple_mes = extract(month from v_hoy)
        and (coalesce(f.ruleta_cumple, 'mes') = 'mes' or c.cumple_dia = extract(day from v_hoy))
    ) then
      return false;
    end if;
    return not exists (
      select 1 from roulette_wins w
      where w.business_id = p_business and public.solo_digitos(w.telefono) = v_tel
        and extract(year from (w.ganado_en at time zone 'America/Panama')) = extract(year from v_hoy));
  end if;

  -- siempre: una sola vez por cliente
  return not exists (
    select 1 from roulette_wins w
    where w.business_id = p_business and public.solo_digitos(w.telefono) = v_tel);
end $$;
grant execute on function public.ruleta_elegible(uuid, text) to anon, authenticated;

-- 5) El giro. p_cita = id de la cita recién guardada (la agenda lo envía). Sin p_cita se acepta cualquier
--    reserva del teléfono, solo para no romper páginas que aún tengan el código viejo en memoria.
drop function if exists public.ruleta_girar(uuid, text, text);
drop function if exists public.ruleta_guardar(uuid, boolean, jsonb);
create or replace function public.ruleta_girar(p_business uuid, p_telefono text, p_nombre text, p_cita uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tel text := public.solo_digitos(p_telefono);
  v_total numeric;
  v_rand numeric;
  r record;
  v_elegido record;
  v_codigo text;
  v_reserva boolean;
  v_hay boolean := false;
  i int := 0;
begin
  if char_length(v_tel) < 7 then
    return jsonb_build_object('ok', false, 'motivo', 'no_elegible');
  end if;

  -- Un giro a la vez por negocio y teléfono: evita que dos giros simultáneos pasen los dos
  perform pg_advisory_xact_lock(hashtext(p_business::text || ':' || v_tel));

  if not public.ruleta_elegible(p_business, p_telefono) then
    return jsonb_build_object('ok', false, 'motivo', 'no_elegible');
  end if;

  if p_cita is not null then
    select exists (
      select 1 from appointments a
      where a.id = p_cita and a.business_id = p_business
        and public.solo_digitos(a.cliente_telefono) = v_tel
        and a.estado is distinct from 'cancelada'
    ) into v_reserva;
  else
    select exists (
      select 1 from appointments a
      where a.business_id = p_business
        and public.solo_digitos(a.cliente_telefono) = v_tel
        and a.estado is distinct from 'cancelada'
    ) into v_reserva;
  end if;
  if not v_reserva then
    return jsonb_build_object('ok', false, 'motivo', 'sin_reserva');
  end if;

  select sum(probabilidad) into v_total from roulette_prizes
   where business_id = p_business and activo and not archivado
     and coalesce(probabilidad, 0) > 0 and (stock is null or stock > 0);
  if v_total is null or v_total <= 0 then
    return jsonb_build_object('ok', false, 'motivo', 'sin_premios');
  end if;

  v_rand := random() * v_total;
  for r in select id, nombre, stock, probabilidad as p from roulette_prizes
            where business_id = p_business and activo and not archivado
              and coalesce(probabilidad, 0) > 0 and (stock is null or stock > 0)
            order by id for update loop
    v_elegido := r;
    v_hay := true;
    v_rand := v_rand - r.p;
    exit when v_rand < 0;
  end loop;
  if not v_hay then
    return jsonb_build_object('ok', false, 'motivo', 'sin_premios');
  end if;

  loop
    v_codigo := 'RUL-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 4));
    exit when not exists (select 1 from roulette_wins where business_id = p_business and codigo_cupon = v_codigo);
    i := i + 1;
    if i > 10 then raise exception 'No se pudo generar el cupón'; end if;
  end loop;

  insert into roulette_wins (business_id, telefono, nombre, prize_id, codigo_cupon, usado)
  values (p_business, btrim(coalesce(p_telefono, '')), left(btrim(coalesce(p_nombre, '')), 80), v_elegido.id, v_codigo, false);

  if v_elegido.stock is not null then
    update roulette_prizes set stock = stock - 1 where id = v_elegido.id;
  end if;

  return jsonb_build_object('ok', true, 'esPremioReal', true, 'premioId', v_elegido.id,
                            'premio', v_elegido.nombre, 'codigoCanje', v_codigo);
end $$;
grant execute on function public.ruleta_girar(uuid, text, text, uuid) to anon, authenticated;

-- 6) Guardar la configuración desde el panel: todo o nada. Lo puede usar el dueño o el Platform Admin.
--    p_premios = [{ "id": uuid|null, "nombre": text, "probabilidad": numero, "activo": bool, "stock": int|null }, ...]
create or replace function public.ruleta_guardar(p_business uuid, p_activa boolean, p_premios jsonb, p_config jsonb default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  e jsonb;
  v_id uuid;
  v_nombre text;
  v_prob numeric;
  v_stock int;
  v_activo boolean;
  v_vistos uuid[] := '{}';
  v_nombres text[] := '{}';
  v_modo text := coalesce(nullif(p_config->>'modo', ''), 'siempre');
  v_desde date := nullif(p_config->>'desde', '')::date;
  v_hasta date := nullif(p_config->>'hasta', '')::date;
  v_titulo text := nullif(left(btrim(coalesce(p_config->>'titulo', '')), 60), '');
  v_cumple text := coalesce(nullif(p_config->>'cumple', ''), 'mes');
begin
  if not (public.is_owner(p_business) or public.is_platform_admin()) then
    raise exception 'No tienes permiso para cambiar la ruleta de este negocio.';
  end if;
  if p_premios is null or jsonb_typeof(p_premios) <> 'array' then
    raise exception 'La lista de premios no es válida.';
  end if;

  if v_modo not in ('siempre', 'periodo', 'cumple') then
    raise exception 'La forma de activar la ruleta no es válida.';
  end if;
  if v_cumple not in ('dia', 'mes') then
    raise exception 'La opción de cumpleaños no es válida.';
  end if;
  if v_modo = 'periodo' then
    if v_desde is null or v_hasta is null then
      raise exception 'Para una ruleta por periodo indica la fecha de inicio y la de fin.';
    end if;
    if v_hasta < v_desde then
      raise exception 'La fecha de fin no puede ser anterior a la de inicio.';
    end if;
  end if;

  -- Revisar todo antes de tocar nada
  for e in select * from jsonb_array_elements(p_premios) loop
    v_nombre := btrim(coalesce(e->>'nombre', ''));
    if v_nombre = '' or char_length(v_nombre) > 60 then
      raise exception 'Cada premio necesita un nombre de hasta 60 letras.';
    end if;
    if lower(v_nombre) = any (v_nombres) then
      raise exception 'Hay dos premios con el nombre "%". Cada premio debe tener un nombre distinto.', v_nombre;
    end if;
    v_nombres := v_nombres || lower(v_nombre);
    if coalesce((e->>'probabilidad')::numeric, 0) < 0 then
      raise exception 'La probabilidad no puede ser negativa.';
    end if;
    if nullif(e->>'stock', '') is not null and (e->>'stock')::int < 0 then
      raise exception 'El stock no puede ser negativo.';
    end if;
  end loop;

  -- Interruptor de la ruleta
  if exists (select 1 from business_features where business_id = p_business) then
    update business_features set ruleta_premios = coalesce(p_activa, false), ruleta_modo = v_modo,
           ruleta_desde = case when v_modo = 'periodo' then v_desde end,
           ruleta_hasta = case when v_modo = 'periodo' then v_hasta end,
           ruleta_titulo = v_titulo, ruleta_cumple = v_cumple
     where business_id = p_business;
  else
    insert into business_features (business_id, ruleta_premios, ruleta_modo, ruleta_desde, ruleta_hasta, ruleta_titulo, ruleta_cumple)
    values (p_business, coalesce(p_activa, false), v_modo,
            case when v_modo = 'periodo' then v_desde end, case when v_modo = 'periodo' then v_hasta end, v_titulo, v_cumple);
  end if;

  -- Premios: se actualizan por id; los nuevos se crean
  for e in select * from jsonb_array_elements(p_premios) loop
    v_nombre := btrim(e->>'nombre');
    v_prob := coalesce((e->>'probabilidad')::numeric, 0);
    v_stock := nullif(e->>'stock', '')::int;
    v_activo := coalesce((e->>'activo')::boolean, true);
    v_id := nullif(e->>'id', '')::uuid;
    if v_id is not null and exists (select 1 from roulette_prizes where id = v_id and business_id = p_business) then
      update roulette_prizes set nombre = v_nombre, probabilidad = v_prob, stock = v_stock, activo = v_activo, archivado = false
       where id = v_id;
    else
      insert into roulette_prizes (business_id, nombre, probabilidad, stock, activo, archivado)
      values (p_business, v_nombre, v_prob, v_stock, v_activo, false)
      returning id into v_id;
    end if;
    v_vistos := v_vistos || v_id;
  end loop;

  -- Los que ya no están en la lista: se borran si nadie los ganó; si no, se archivan
  delete from roulette_prizes
   where business_id = p_business and id <> all (v_vistos)
     and not exists (select 1 from roulette_wins w where w.prize_id = roulette_prizes.id);
  update roulette_prizes set activo = false, archivado = true
   where business_id = p_business and id <> all (v_vistos) and not archivado;

  return jsonb_build_object('ok', true);
end $$;
grant execute on function public.ruleta_guardar(uuid, boolean, jsonb, jsonb) to authenticated;

-- 7) Limpieza de premios repetidos que dejó el guardado anterior (mismo negocio y mismo nombre).
--    VISTA PREVIA (no cambia nada): quedan los marcados con rn = 1.
--    select business_id, nombre, id, row_number() over (partition by business_id, lower(btrim(nombre))
--           order by (exists (select 1 from roulette_wins w where w.prize_id = p.id)) desc, id) as rn
--    from roulette_prizes p order by business_id, lower(btrim(nombre)), rn;
with ordenados as (
  select p.id,
         row_number() over (partition by p.business_id, lower(btrim(p.nombre))
                            order by (exists (select 1 from roulette_wins w where w.prize_id = p.id)) desc, p.id) as rn
  from roulette_prizes p
  where not p.archivado
)
delete from roulette_prizes p using ordenados o
 where p.id = o.id and o.rn > 1
   and not exists (select 1 from roulette_wins w where w.prize_id = p.id);

with ordenados as (
  select p.id,
         row_number() over (partition by p.business_id, lower(btrim(p.nombre))
                            order by (exists (select 1 from roulette_wins w where w.prize_id = p.id)) desc, p.id) as rn
  from roulette_prizes p
  where not p.archivado
)
update roulette_prizes p set activo = false, archivado = true
  from ordenados o where p.id = o.id and o.rn > 1;
