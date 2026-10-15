-- Permite al administrador de la plataforma ver, marcar y borrar las conversaciones del asistente desde el panel (pestaña Prospectos).
-- Los dueños de negocio y los visitantes siguen sin ver nada. Idempotente. Requiere asistente_annly.sql (tabla asistente_conversaciones).
grant select, update, delete on public.asistente_conversaciones to authenticated;

drop policy if exists asistente_conv_admin_select on public.asistente_conversaciones;
create policy asistente_conv_admin_select on public.asistente_conversaciones for select to authenticated using (public.is_platform_admin());

drop policy if exists asistente_conv_admin_update on public.asistente_conversaciones;
create policy asistente_conv_admin_update on public.asistente_conversaciones for update to authenticated
using (public.is_platform_admin()) with check (public.is_platform_admin());

drop policy if exists asistente_conv_admin_delete on public.asistente_conversaciones;
create policy asistente_conv_admin_delete on public.asistente_conversaciones for delete to authenticated using (public.is_platform_admin());
