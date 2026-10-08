-- Endurecimiento de permisos (resultado de la auditoría). Idempotente. NO cambia lo que hace la app:
-- solo quita permisos que ninguna política deja usar, y cierra funciones que solo usan quienes inician sesión.

-- 1) Función de administración sin validación interna: nadie la llama desde la API (ya cerrada el 08/10; se repite por si se reconstruye la base)
revoke execute on function public.admin_cambiar_password(uuid, text) from public, anon, authenticated;

-- 2) Ninguna tabla necesita vaciarse ni crear relaciones/disparadores desde la API
revoke truncate, references, trigger on all tables in schema public from anon, authenticated;

-- 3) Un visitante no edita ni borra nada, y solo crea citas
revoke update, delete on all tables in schema public from anon;
revoke insert on all tables in schema public from anon;
grant insert on public.appointments to anon;
-- (la lectura pública sigue como estaba: las políticas RLS ya dejan ver solo lo público)

-- 4) Funciones que solo usa quien inicia sesión: se quitan al visitante (por dentro igual validaban al dueño o al administrador)
do $$
declare f text;
begin
  foreach f in array array[
    'public.ruleta_guardar(uuid, boolean, jsonb, jsonb)',
    'public.yappy_credenciales_estado(uuid)',
    'public.yappy_guardar(uuid, text, text, text, boolean)',
    'public.yappy_eliminar(uuid)',
    'public.admin_extender_cuenta(uuid, date, text, boolean)'
  ] loop
    if to_regprocedure(f) is not null then
      execute format('revoke execute on function %s from public, anon', f);
      execute format('grant execute on function %s to authenticated', f);
    end if;
  end loop;
end $$;
