-- Si el aviso de Yappy llega DESPUÉS de que la agenda dejó la cita "por confirmar" (esperó y se rindió),
-- en cuanto la orden queda "ejecutada" la base confirma sola esa cita: mismo negocio, mismo comprobante
-- y monto cobrado suficiente para el abono. Idempotente.
create or replace function public.yappy_confirma_cita()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.estado = 'ejecutado' and new.estado is distinct from old.estado then
    update appointments a
       set estado = 'confirmada'
     where a.business_id = new.business_id
       and a.comprobante = new.order_id
       and a.estado = 'por_confirmar'
       and coalesce(a.abono_monto, 0) > 0
       and coalesce(new.total, 0) + 0.005 >= a.abono_monto;
  end if;
  return new;
end $$;

drop trigger if exists trg_yappy_confirma_cita on public.yappy_orders;
create trigger trg_yappy_confirma_cita
  after update of estado on public.yappy_orders
  for each row execute function public.yappy_confirma_cita();

-- Citas que ya quedaron "por confirmar" con un pago de Yappy ya ejecutado (por ejemplo la de la prueba):
update public.appointments a set estado = 'confirmada'
  from public.yappy_orders y
 where y.business_id = a.business_id and y.order_id = a.comprobante and y.estado = 'ejecutado'
   and a.estado = 'por_confirmar' and coalesce(a.abono_monto, 0) > 0 and coalesce(y.total, 0) + 0.005 >= a.abono_monto;
