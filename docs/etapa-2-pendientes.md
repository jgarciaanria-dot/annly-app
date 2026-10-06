# Etapa 2 — pendientes

## 1. Cerrar la vía de activar el plan o módulos sin pagar (RLS)
Hoy el panel escribe directo en la base con la sesión del usuario, así que alguien con conocimientos técnicos
puede saltarse el cobro:
- `subscriptions`: poner `status = 'active'` o mover `current_period_end` sin pagar.
- `subscription_items`: insertar módulos (`item_type = 'addon'`) sin pagar.

A hacer: restringir en Supabase (RLS) el INSERT/UPDATE de esas tablas para dueños de negocio y dejar que solo
las Edge Functions (`pf-webhook`, `yappy-ipn`, con service role) activen planes y módulos. Mantener la excepción
del módulo agregado durante la prueba gratis (sin cobro) mediante una función en el servidor.

## 2. Bloqueo por mora (modo lectura)
- Gracia de 5 a 7 días tras el vencimiento.
- En lectura: ver agenda, clientes, citas, reportes y exportar datos. Bloqueado: crear o editar citas, ventas,
  certificados y ajustes. "Mi plan" y el pago siempre abiertos.
- No bloquear las reservas de clientes finales de inmediato; suspender la agenda pública tras un plazo largo (p. ej. 15 días) con aviso.
- Aplicarlo en el servidor (RLS), no solo ocultando botones.
- Hoy el bloqueo de módulos al vencer la prueba es solo visual (`pruebaVencida()` en `admin.html`; `moduloDisponible` en `pedidos.js`).

## 3. Otros
- Extras por cantidad (profesional adicional, sede adicional): aún no se cobran al agregarlos.
- Validar que un módulo ya incluido en el plan no se pueda comprar aparte (hoy lo evita solo la interfaz).
