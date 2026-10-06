-- Precios y módulos definidos (octubre 2026)
-- Agenda: Pagos en línea $5. Tiendas: plan inicial $14, módulos $6 (Ventas e Inventario y Programa de clientes).

-- Pagos en línea (Yappy Comercial y otras pasarelas, a pedido)
update public.features set
  name = 'Pagos en línea',
  description = 'Cobra en línea con Yappy Comercial y confirma los pagos automáticamente. Si ya usas otra pasarela (Tilopay, PagueloFácil, Tafi u otra), la integramos contigo.',
  monthly_price = 5.00
where code = 'PAGOS';

-- Tiendas: Ventas e Inventario baja a $6
update public.features set monthly_price = 6.00 where code = 'PEDIDOS_REPORTES';

-- Tiendas: plan inicial a $14
update public.plans set monthly_price = 14.00 where code = 'PEDIDOS_BASIC';

-- Tiendas: módulo Programa de clientes ($6). Queda inactivo (no se vende) hasta que esté construido.
insert into public.features (code, name, description, monthly_price, is_addon, is_active, producto)
select 'PEDIDOS_CLIENTES', 'Programa de clientes',
       'Invita a tus compradores a inscribirse para recibir descuentos, regalos y promociones, y arma tu base de clientes con sus cumpleaños.',
       6.00, true, false, 'pedidos'
where not exists (select 1 from public.features where code = 'PEDIDOS_CLIENTES');

-- Revisar:
-- select code, name, monthly_price, producto, is_active from public.features where is_addon order by producto, code;
-- select code, monthly_price from public.plans order by monthly_price;
