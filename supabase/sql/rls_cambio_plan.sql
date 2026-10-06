-- Candado: el dueño no puede SUBIR de plan por su cuenta fuera de la prueba gratis (subir se paga: la diferencia).
-- Bajar de plan y cambiar durante la prueba siguen permitidos. Los pagos (service_role) y el equipo de Annly no tienen restricción.
create or replace function public.subscriptions_guard()
returns trigger language plpgsql as $$
begin
  if auth.uid() is not null and coalesce(auth.role(), '') <> 'service_role' and not public.is_platform_admin() then
    if new.status is distinct from old.status
       or new.current_period_end is distinct from old.current_period_end
       or new.business_id is distinct from old.business_id then
      raise exception 'El estado y la fecha de la suscripción solo cambian con un pago confirmado o por el equipo de Annly';
    end if;
    if new.plan_id is distinct from old.plan_id and old.status <> 'trial' then
      if coalesce((select monthly_price from public.plans where id = new.plan_id), 0)
         > coalesce((select monthly_price from public.plans where id = old.plan_id), 0) then
        raise exception 'Subir de plan requiere un pago confirmado';
      end if;
    end if;
  end if;
  return new;
end $$;
