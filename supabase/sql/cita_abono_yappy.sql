-- Una cita con abono NO puede quedar "confirmada" por lo que diga el navegador.
-- Si la crea alguien que no es el dueño ni el administrador, con abono mayor a 0 y estado 'confirmada', la base exige que
-- exista una orden de Yappy de ESE negocio, ya "ejecutada" (la marca el aviso firmado de Yappy), por un monto igual o mayor al abono,
-- y que esa orden no haya servido ya para otra cita. Si no, rechaza con PAGO_NO_VERIFICADO (la agenda entonces guarda la cita "por confirmar").
-- Las citas "por_confirmar" (abono a mano) y las del panel del dueño no se ven afectadas. Idempotente.
create or replace function public.cita_exigir_pago_yappy()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.estado is distinct from 'confirmada' or coalesce(new.abono_monto, 0) <= 0 then
    return new;
  end if;
  if public.is_owner(new.business_id) or public.is_platform_admin() then
    return new;
  end if;
  perform pg_advisory_xact_lock(hashtext(new.business_id::text || ':' || coalesce(new.comprobante, '')));  -- dos reservas a la vez no usan la misma orden
  if coalesce(btrim(new.comprobante), '') = '' or not exists (
       select 1 from yappy_orders y
        where y.business_id = new.business_id and y.order_id = btrim(new.comprobante)
          and y.estado = 'ejecutado' and coalesce(y.total, 0) + 0.005 >= new.abono_monto
     ) then
    raise exception 'PAGO_NO_VERIFICADO';
  end if;
  if exists (
       select 1 from appointments a
        where a.business_id = new.business_id and a.comprobante = new.comprobante and a.id <> new.id
          and a.estado is distinct from 'cancelada'
     ) then
    raise exception 'PAGO_NO_VERIFICADO';
  end if;
  return new;
end $$;

drop trigger if exists trg_cita_exigir_pago_yappy on public.appointments;
create trigger trg_cita_exigir_pago_yappy
  before insert on public.appointments
  for each row execute function public.cita_exigir_pago_yappy();
