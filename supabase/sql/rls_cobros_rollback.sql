-- Deshace rls_cobros.sql: vuelve a las reglas anteriores (dueño con acceso total a subscriptions y subscription_items)
begin;

drop trigger if exists subscriptions_guard on public.subscriptions;
drop trigger if exists subscription_items_guard on public.subscription_items;
drop function if exists public.subscriptions_guard();
drop function if exists public.subscription_items_guard();

drop policy if exists subscriptions_select on public.subscriptions;
drop policy if exists subscriptions_insert on public.subscriptions;
drop policy if exists subscriptions_update on public.subscriptions;
drop policy if exists subscriptions_delete on public.subscriptions;
create policy subscriptions_access on public.subscriptions for all to public
using ((exists (select 1 from public.businesses b where b.id = subscriptions.business_id and b.owner_user_id = auth.uid())) or public.is_platform_admin())
with check ((exists (select 1 from public.businesses b where b.id = subscriptions.business_id and b.owner_user_id = auth.uid())) or public.is_platform_admin());

drop policy if exists subscription_items_select on public.subscription_items;
drop policy if exists subscription_items_insert on public.subscription_items;
drop policy if exists subscription_items_update on public.subscription_items;
drop policy if exists subscription_items_delete on public.subscription_items;
create policy subscription_items_access on public.subscription_items for all to public
using (exists (select 1 from public.subscriptions s join public.businesses b on b.id = s.business_id where s.id = subscription_items.subscription_id and (b.owner_user_id = auth.uid() or public.is_platform_admin())))
with check (exists (select 1 from public.subscriptions s join public.businesses b on b.id = s.business_id where s.id = subscription_items.subscription_id and (b.owner_user_id = auth.uid() or public.is_platform_admin())));

alter policy public_insert_appointments on public.appointments
with check ((coalesce(estado, 'confirmada'::text) = any (array['confirmada'::text, 'por_confirmar'::text])) and public.negocio_existe(business_id));
alter policy appointments_owner_insert on public.appointments
with check (public.is_owner(business_id) or public.is_platform_admin());
alter policy owner_update_appointments on public.appointments
using (public.is_owner(business_id)) with check (public.is_owner(business_id));
alter policy owner_delete_appointments on public.appointments
using (public.is_owner(business_id));

commit;
