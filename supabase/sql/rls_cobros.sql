-- =====================================================================
-- Etapa 2 · Candados en la base de datos para los cobros
-- Cierra estas vías de saltarse el pago desde la consola del navegador:
--   * poner la suscripción en 'active' o mover su fecha de fin sin pagar        (trigger subscriptions_guard)
--   * agregar módulos/extras con precio 0 o cantidades raras                     (trigger subscription_items_guard)
--   * agregar módulos/extras fuera de la prueba gratis / cortesía sin pagar     (política de INSERT)
--   * borrar ítems de la suscripción                                            (sin política de DELETE para el dueño)
--   * reservar (público) o editar citas (panel) en una cuenta SUSPENDIDA        (negocio_suspendido en appointments)
-- Siguen funcionando: registro de negocios nuevos (suscripción trial), cambiar de plan, agregar módulos en
-- prueba o cortesía, cancelar módulos/extras, y todos los cobros (las Edge Functions usan service_role).
-- Requiere: negocio_suspendido(uuid) ya creada. Para deshacer todo: rls_cobros_rollback.sql
-- =====================================================================
begin;

-- ---------- subscriptions ----------
drop policy if exists subscriptions_access on public.subscriptions;

create policy subscriptions_select on public.subscriptions for select to public
using (
  exists (select 1 from public.businesses b where b.id = subscriptions.business_id and b.owner_user_id = auth.uid())
  or public.is_platform_admin()
);

-- Alta: el negocio nuevo crea su suscripción de PRUEBA con plan Basic (registro). Nada más.
create policy subscriptions_insert on public.subscriptions for insert to public
with check (
  public.is_platform_admin()
  or (
    exists (select 1 from public.businesses b where b.id = subscriptions.business_id and b.owner_user_id = auth.uid())
    and subscriptions.status = 'trial'
    and exists (select 1 from public.plans p where p.id = subscriptions.plan_id and p.code in ('BASIC', 'PEDIDOS_BASIC'))
    and subscriptions.current_period_end <= (now() + interval '16 days')
    and not exists (select 1 from public.subscriptions x where x.business_id = subscriptions.business_id)
  )
);

create policy subscriptions_update on public.subscriptions for update to public
using (
  exists (select 1 from public.businesses b where b.id = subscriptions.business_id and b.owner_user_id = auth.uid())
  or public.is_platform_admin()
)
with check (
  exists (select 1 from public.businesses b where b.id = subscriptions.business_id and b.owner_user_id = auth.uid())
  or public.is_platform_admin()
);

create policy subscriptions_delete on public.subscriptions for delete to public
using (public.is_platform_admin());

-- El dueño NO puede cambiar el estado ni la fecha de fin (eso lo hacen los pagos y el equipo de Annly)
create or replace function public.subscriptions_guard()
returns trigger language plpgsql as $$
begin
  if auth.uid() is not null and coalesce(auth.role(), '') <> 'service_role' and not public.is_platform_admin() then
    if new.status is distinct from old.status
       or new.current_period_end is distinct from old.current_period_end
       or new.business_id is distinct from old.business_id then
      raise exception 'El estado y la fecha de la suscripción solo cambian con un pago confirmado o por el equipo de Annly';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists subscriptions_guard on public.subscriptions;
create trigger subscriptions_guard before update on public.subscriptions
for each row execute function public.subscriptions_guard();

-- ---------- subscription_items ----------
drop policy if exists subscription_items_access on public.subscription_items;

create policy subscription_items_select on public.subscription_items for select to public
using (
  exists (
    select 1 from public.subscriptions s join public.businesses b on b.id = s.business_id
    where s.id = subscription_items.subscription_id and (b.owner_user_id = auth.uid() or public.is_platform_admin())
  )
);

-- Alta por el dueño solo durante la prueba gratis o en cuentas de cortesía; el resto lo agregan los pagos
create policy subscription_items_insert on public.subscription_items for insert to public
with check (
  exists (
    select 1 from public.subscriptions s join public.businesses b on b.id = s.business_id
    where s.id = subscription_items.subscription_id
      and (
        public.is_platform_admin()
        or (b.owner_user_id = auth.uid() and (s.status = 'trial' or left(s.current_period_end::text, 10) >= '2099-01-01'))
      )
  )
);

create policy subscription_items_update on public.subscription_items for update to public
using (
  exists (
    select 1 from public.subscriptions s join public.businesses b on b.id = s.business_id
    where s.id = subscription_items.subscription_id and (b.owner_user_id = auth.uid() or public.is_platform_admin())
  )
)
with check (
  exists (
    select 1 from public.subscriptions s join public.businesses b on b.id = s.business_id
    where s.id = subscription_items.subscription_id and (b.owner_user_id = auth.uid() or public.is_platform_admin())
  )
);

create policy subscription_items_delete on public.subscription_items for delete to public
using (public.is_platform_admin());

-- El dueño no puede fijar precios ni cantidades: el precio sale del catálogo (features) y la cantidad es 1;
-- al editar solo puede programar la baja (cancela_el) o desactivar, nunca reactivar ni cambiar precio.
create or replace function public.subscription_items_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_precio numeric;
begin
  if auth.uid() is null or coalesce(auth.role(), '') = 'service_role' or public.is_platform_admin() then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.quantity := 1;
    new.is_active := true;
    if new.item_type = 'addon' then
      select monthly_price into v_precio from public.features where code = new.item_code limit 1;
      if v_precio is not null and v_precio > 0 then new.unit_price := v_precio; end if;
    end if;
  elsif tg_op = 'UPDATE' then
    if new.unit_price is distinct from old.unit_price
       or new.quantity is distinct from old.quantity
       or new.item_code is distinct from old.item_code
       or new.item_type is distinct from old.item_type
       or new.subscription_id is distinct from old.subscription_id
       or (new.is_active and not old.is_active) then
      raise exception 'Cambio no permitido en un ítem de la suscripción';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists subscription_items_guard on public.subscription_items;
create trigger subscription_items_guard before insert or update on public.subscription_items
for each row execute function public.subscription_items_guard();

-- ---------- appointments: cuenta suspendida = sin reservas públicas ni cambios desde el panel ----------
alter policy public_insert_appointments on public.appointments
with check (
  (coalesce(estado, 'confirmada'::text) = any (array['confirmada'::text, 'por_confirmar'::text]))
  and public.negocio_existe(business_id)
  and not public.negocio_suspendido(business_id)
);

alter policy appointments_owner_insert on public.appointments
with check ((public.is_owner(business_id) and not public.negocio_suspendido(business_id)) or public.is_platform_admin());

alter policy owner_update_appointments on public.appointments
using (public.is_owner(business_id) and not public.negocio_suspendido(business_id))
with check (public.is_owner(business_id) and not public.negocio_suspendido(business_id));

alter policy owner_delete_appointments on public.appointments
using (public.is_owner(business_id) and not public.negocio_suspendido(business_id));

commit;
