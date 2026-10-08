-- Auditoría de seguridad de la base (solo LEE, no cambia nada). Ejecutar cada bloque por separado y revisar el resultado.

-- 1) Tablas SIN RLS activado. Debe salir vacío (o solo tablas que no guardan datos de negocios).
select c.relname as tabla
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
order by 1;

-- 2) Políticas abiertas a TODOS: condición "true" para visitantes (anon/public). Cada fila es una puerta abierta: revisar una por una.
select tablename as tabla, policyname as politica, cmd as operacion, roles, qual as condicion_lectura, with_check as condicion_escritura
from pg_policies
where schemaname = 'public'
  and (roles::text like '%anon%' or roles::text = '{public}')
  and (coalesce(qual, 'true') in ('true', '(true)') or coalesce(with_check, 'true') in ('true', '(true)') )
order by 1, 3;

-- 3) Políticas para usuarios con sesión que no miran a qué negocio pertenece el dato ("true").
select tablename as tabla, policyname as politica, cmd as operacion, qual as condicion_lectura, with_check as condicion_escritura
from pg_policies
where schemaname = 'public'
  and roles::text like '%authenticated%'
  and (qual in ('true', '(true)') or with_check in ('true', '(true)'))
order by 1, 3;

-- 4) Qué puede tocar un visitante (anon) directamente en las tablas: lo normal es que sea muy poco.
select table_name as tabla, string_agg(privilege_type, ', ' order by privilege_type) as permisos
from information_schema.role_table_grants
where table_schema = 'public' and grantee = 'anon'
group by 1 order by 1;

-- 5) Funciones que un visitante puede ejecutar y que corren con permisos de administrador (SECURITY DEFINER). Revisar que cada una valide lo que recibe.
select p.proname as funcion, pg_get_function_identity_arguments(p.oid) as parametros
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prosecdef
  and has_function_privilege('anon', p.oid, 'execute')
order by 1;

-- 6) Columnas sensibles: confirmar que ningún rol de la API puede leer secretos directamente.
select table_name as tabla, column_name as columna, grantee
from information_schema.column_privileges
where table_schema = 'public' and privilege_type = 'SELECT'
  and grantee in ('anon', 'authenticated')
  and column_name in ('secret_b64', 'pin', 'password', 'api_key', 'token', 'secret')
order by 1, 2;
