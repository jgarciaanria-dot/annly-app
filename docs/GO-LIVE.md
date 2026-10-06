# Antes del 15 de octubre (salida a producción)

Lista de pendientes. Marcar al terminar cada uno.

## Calidad
- [ ] **Otra sesión de QA completa** (automática en `annly-qa` y revisión manual en PC y celular). Cubrir lo nuevo desde la última:
  - Landing nueva (sección "Antes y después", botón de WhatsApp, menú) e inicio de sesión.
  - Registro, correo de bienvenida y lista "Primeros pasos".
  - Guía rápida (`guia.html`) en Agenda y Tiendas.
  - Panel: encabezados unificados, menú superior fijo, interruptores en celular.
  - Mi plan: tarjetas de pago (tarjeta y Yappy) en Agenda y Tiendas.
  - Programa de clientes: inscripción en la agenda y en la tienda, lista, cumpleaños y CSV.
  - Correo extra para avisos del negocio.
  - Consulta del Agente AI por correo.
  - Precios nuevos de módulos (Pagos $5, Tiendas $14, módulos de Tiendas $6).
- [ ] Cobro real de $1 por tarjeta con recibo.
- [ ] Probar el flujo completo de suspensión y reactivación al pagar.

## Base de datos y funciones (Supabase)
- [ ] Ejecutar en orden: `bienvenida.sql`, `correo_avisos.sql`, `clientes_inscripcion.sql`, `precios_modulos.sql`, `clientes_pedidos.sql`.
- [ ] Desplegar `enviar-bienvenida`, `consulta-modulo` y la versión nueva de `send-confirmation-email` (Verify JWT apagado).

## Cuentas
- [ ] Depurar cuentas de prueba (consulta de cuentas en el SQL Editor).
- [ ] Poner en cortesía las que se quedan sin cobro (por ejemplo Salud y Belleza Spa, usada por el QA).

## Publicación
- [ ] Publicar `develop` a `main` en `annly-app` y en `annly-pedidos`.
- [ ] Soporte: buzón `soporte@annly.app` y número de WhatsApp definitivo en la landing.

## Después de la salida
- [ ] Decidir si se comparte la sesión entre annly.app y tienda.annly.app con una cookie en `.annly.app`.
- [ ] Usar la base de clientes: descuento de cumpleaños, promo por cliente y ruleta.
