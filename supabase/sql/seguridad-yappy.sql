-- Seguridad de las credenciales de Yappy: el Secret se escribe desde el panel pero NUNCA se vuelve a leer en el navegador.
-- Idempotente. Orden de uso:
--   PARTE A (crea las funciones)  -> se ejecuta primero.
--   Se publica la nueva versión de la agenda (sheets.js ?v=69 o posterior).
--   PARTE B (quita la lectura directa de la tabla) -> se ejecuta al final.
-- Las Edge Functions (yappy-crear-orden / smooth-api, yappy-ipn) usan la service_role y no se ven afectadas.

-- ============================ PARTE A ============================
-- Leer: devuelve solo lo no secreto y si ya hay un Secret guardado.
create or replace function public.yappy_credenciales_estado(p_business uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare r record;
begin
  if not (public.is_owner(p_business) or public.is_platform_admin()) then
    raise exception 'No tienes permiso para ver las credenciales de este negocio.';
  end if;
  select merchant_id, dominio_registrado, activo, coalesce(secret_b64, '') <> '' as tiene_secret
    into r from yappy_credentials where business_id = p_business;
  if not found then return null; end if;
  return jsonb_build_object('merchantId', r.merchant_id, 'dominioRegistrado', r.dominio_registrado,
                            'activo', r.activo, 'tieneSecret', r.tiene_secret);
end $$;
grant execute on function public.yappy_credenciales_estado(uuid) to authenticated;

-- Guardar: si p_secret viene vacío se conserva el que ya estaba.
create or replace function public.yappy_guardar(p_business uuid, p_merchant text, p_secret text, p_dominio text, p_activo boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (public.is_owner(p_business) or public.is_platform_admin()) then
    raise exception 'No tienes permiso para cambiar las credenciales de este negocio.';
  end if;
  insert into yappy_credentials (business_id, merchant_id, secret_b64, dominio_registrado, activo)
  values (p_business, btrim(coalesce(p_merchant, '')), coalesce(nullif(btrim(p_secret), ''), ''), btrim(coalesce(p_dominio, '')), coalesce(p_activo, true))
  on conflict (business_id) do update
    set merchant_id = excluded.merchant_id,
        secret_b64 = coalesce(nullif(btrim(p_secret), ''), yappy_credentials.secret_b64),
        dominio_registrado = excluded.dominio_registrado,
        activo = excluded.activo;
  update businesses set tiene_yappy_comercial = coalesce(p_activo, true) where id = p_business;
  return jsonb_build_object('ok', true);
end $$;
grant execute on function public.yappy_guardar(uuid, text, text, text, boolean) to authenticated;

create or replace function public.yappy_eliminar(p_business uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (public.is_owner(p_business) or public.is_platform_admin()) then
    raise exception 'No tienes permiso para cambiar las credenciales de este negocio.';
  end if;
  delete from yappy_credentials where business_id = p_business;
  update businesses set tiene_yappy_comercial = false where id = p_business;
  return jsonb_build_object('ok', true);
end $$;
grant execute on function public.yappy_eliminar(uuid) to authenticated;

-- ============================ PARTE B ============================
-- Ejecutar SOLO después de publicar la nueva agenda. Desde aquí nadie con sesión puede leer ni escribir la tabla directamente.
-- (Si algo falla, se deshace con:  grant select, insert, update, delete on public.yappy_credentials to authenticated;
--  y volviendo a la versión anterior de la agenda.)
-- revoke select, insert, update, delete on public.yappy_credentials from anon, authenticated;
