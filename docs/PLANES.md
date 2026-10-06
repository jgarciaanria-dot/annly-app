# Planes y módulos de Annly (Agenda)

Documento de referencia. Resume lo que el producto ofrece hoy según el código. Los precios y qué funciones trae cada plan viven en la base de datos (tablas `plans`, `features`, `plan_features`); la sección "Cómo comprobarlo" tiene la consulta para verlos tal como están.

## 1. Resumen

| | Basic | Medium | Ultimate |
|---|---|---|---|
| Precio | $14/mes | $24/mes | $49/mes |
| Profesionales incluidos | 1 | 2 | 3 |
| Sucursales incluidas | 1 | 1 | 1 |
| Prueba gratis | 14 días, sin tarjeta, siempre con las funciones de Basic | | |

Extras que se pueden sumar a cualquier plan:

- **Profesional adicional:** +$7/mes cada uno.
- **Sucursal adicional:** +$14/mes cada una, incluye 1 profesional.

Módulos sueltos de Agenda (se contratan desde "Mi plan"; si el plan ya los incluye, no se cobran):

| Módulo | Precio | Notas |
|---|---|---|
| Pagos en línea (`PAGOS`) | $5/mes | Yappy Comercial con confirmación automática. Otras pasarelas (Tilopay, PagueloFácil, Tafi u otra) se integran a pedido. Incluido en Medium y Ultimate. |
| Certificados (`CERTIFICADOS`) | $6/mes | Incluido en Ultimate. |
| Finanzas (`FINANZAS`) | $12/mes | Incluido en Ultimate. |
| Agente AI (`AGENTE_AI`) | desde $12/mes | Opcional y cotizado aparte. El botón "Quiero información" envía la consulta a soporte@annly.app (función `consulta-modulo`) para saber quiénes están interesados. |

## 2. Qué incluye cada plan

**Basic** — lo esencial para organizar el negocio
- Agenda en línea 24/7, con citas y servicios ilimitados.
- Notificaciones por correo al negocio y al cliente, y recordatorios automáticos.
- Reagendar y cancelar citas.
- Sistema de abono (pago manual por Yappy o transferencia, que el negocio confirma).
- Horarios personalizados y bloqueo de horas o días.
- Botón de WhatsApp y diseño profesional con su logo.

**Medium** — todo lo de Basic, más:
- Sistema de promociones (ventana promocional en la agenda).
- Ruleta de premios.
- Paleta de colores a escoger.
- Pagos en línea con Yappy Comercial (confirmación automática). Si el negocio ya tiene una pasarela de pago propia, se puede integrar a pedido.
- Programa de clientes: botón en la agenda para que los clientes se inscriban, con cumpleaños y consentimiento para recibir promociones.

**Ultimate** — todo lo de Medium, más:
- Finanzas, reportes y dashboard financiero.
- Certificados de regalo.
- Gestión de pagos y comisiones por profesional.
- Propinas y anticipos.
- Cierres quincenales con comprobante de pago digital.

## 3. Cómo se aplica en el panel y en la agenda pública

| Función | Qué la habilita | Dónde se revisa |
|---|---|---|
| Promoción | Feature `PROMOCIONES` | Pestaña Promo |
| Ruleta de premios | Feature `RULETA` | Pestaña Ruleta |
| Certificados de regalo | Feature `CERTIFICADOS` | Pestaña Certificados y agenda pública |
| Finanzas, completar citas con cobro, ventas en el local | Feature `FINANZAS` | Pestañas Finanzas y Citas |
| Propinas | Feature `PROPINAS` | Cobro de citas |
| Yappy Comercial (botón de pago real) | Feature `PAGOS` | Perfil, sección Yappy Comercial |
| Paleta de colores a escoger | Plan Medium o Ultimate | Perfil |
| Programa de clientes (inscripción) | Plan Medium o Ultimate ya activo (no en prueba) | Pestaña Clientes y agenda pública; la comprueba también la base de datos |

Una pestaña sin la función incluida muestra una vitrina con "Ver planes". En la prueba gratis el panel se comporta como Basic aunque se haya elegido otro plan.

## 3.1 Límites
- Profesionales: se cuentan desde el plan (1, 2 o 3) más los adicionales contratados. En prueba solo cuenta el incluido.
- Sucursales: 1 incluida más las adicionales contratadas. Cada sucursal tiene su horario, y los profesionales pueden tener un horario propio por sucursal.

## 4. Cobro, vencimiento y suspensión

- Pago de la membresía: tarjeta (PagueloFácil) o Yappy desde "Mi plan". El monto se calcula siempre en el servidor.
- La membresía vence al terminar el día de su fecha de fin (hora de Panamá). Desde el vencimiento hay **48 horas de gracia** con un contador en el panel.
- Pasada la gracia, la cuenta queda **suspendida en solo vista**: el panel se puede mirar, y la agenda pública y la tienda muestran los servicios pero no aceptan reservas, compras ni inscripciones.
- **Cortesía:** una cuenta con fecha de fin en 2099 o después se trata como acuerdo comercial, sin pagos ni vencimiento. Solo la puede dar el administrador de la plataforma, con motivo.
- Cambiar de plan o contratar un módulo, un profesional o una sucursal abre el cobro de inmediato y se activa al confirmarse el pago.

## 5. Annly Tiendas (pedidos)

- **Plan inicial: $14/mes.** Tienda con logo y colores, catálogo con extras y dedicatoria, fechas y franjas con cupo, retiro o entrega por zonas, pago por Yappy o transferencia (confirmado a mano), avisos por correo, inventario y hoja de preparación.
- **Módulos opcionales: $6/mes cada uno.**
  - Ventas e Inventario (`PEDIDOS_REPORTES`): reportes de ventas, productos más vendidos, inventario valorizado, ganancia por producto y exportar a Excel.
  - Programa de clientes (`PEDIDOS_CLIENTES`): inscripción de compradores con cumpleaños y consentimiento. **Próximamente**: está definido en la base de datos pero inactivo hasta que se construya.
- 14 días gratis.
- Se cuenta y se cobra por separado de Agenda (cuenta propia).

## 6. Dónde se define cada cosa

- Precios y funciones de cada plan: tablas `plans`, `plan_features` y `features` en Supabase.
- Textos de los planes que ven los clientes: `index.html` (landing, sección de precios) y `ANNLY_PLANES_UI` en `admin.html` (pestaña Mi plan). Los dos deben decir lo mismo.
- Límite de profesionales: `LIMITE_EMPLEADOS_POR_PLAN` en `sheets.js` y `included_professionals` en `plans`.
- Regla de vencimiento y suspensión: función `negocio_suspendido` (SQL) y `annlyEstadoCuenta` en `sheets.js`.

## 7. Cómo comprobarlo en la base de datos

Para ver qué trae cada plan y el precio de cada módulo, ejecutar en el SQL Editor de Supabase:

```sql
-- Qué incluye cada plan
select p.code as plan, p.monthly_price, p.included_professionals as profesionales, p.included_locations as sucursales,
       string_agg(f.code, ', ' order by f.code) as funciones
from plans p
left join plan_features pf on pf.plan_id = p.id
left join features f on f.id = pf.feature_id
group by p.code, p.monthly_price, p.included_professionals, p.included_locations
order by p.monthly_price;

-- Módulos que se pueden contratar por separado
select code, name, monthly_price, producto, is_active
from features
where is_addon = true
order by producto, code;
```

## 8. Pendiente
- Construir el Programa de clientes para Tiendas y activar `PEDIDOS_CLIENTES`.
- Confirmar con la consulta de la sección 7 que la lista de funciones por plan coincide con la sección 2.
- Pagos en línea: hoy solo Yappy Comercial se configura desde el panel. Las demás pasarelas son trabajo a pedido.
- Precios en la base de datos: ejecutar `supabase/sql/precios_modulos.sql`.
