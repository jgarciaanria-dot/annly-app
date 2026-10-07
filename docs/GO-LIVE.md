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
- [x] Ejecutados y verificados en Supabase: `bienvenida.sql`, `correo_avisos.sql`, `clientes_inscripcion.sql`, `precios_modulos.sql`, `clientes_pedidos.sql` (columnas, funciones y precios en OK; `inscripcion_clientes_activa` en la versión de Tiendas).
- [x] Desplegadas `enviar-bienvenida`, `consulta-modulo` y la versión nueva de `send-confirmation-email` (Verify JWT apagado). `consulta-modulo` usa el secreto opcional `SOPORTE_EMAIL` (hoy `appannly@gmail.com`).
- [ ] Revisar por qué `auth.getUser(token)` devolvía 401 en `consulta-modulo` (se resolvió validando la sesión con `is_platform_admin`). Comprobar con una cuenta nueva que `enviar-bienvenida` sí envía la bienvenida; si no, aplicar la misma validación.

## Cuentas
- [ ] Depurar cuentas de prueba (consulta de cuentas en el SQL Editor).
- [ ] Poner en cortesía las que se quedan sin cobro (por ejemplo Salud y Belleza Spa, usada por el QA).

## Publicación
- [ ] Publicar `develop` a `main` en `annly-app` y en `annly-pedidos`.
- [ ] Soporte: buzón real para `soporte@annly.app` y número de WhatsApp definitivo en la landing.
  - Hoy el correo entrante de `annly.app` pasa por ImprovMX (MX y SPF en GoDaddy) y se reenvía a `appannly@gmail.com`. Funciona, pero la IP compartida de ImprovMX estuvo en la lista negra de SpamCop y Gmail rechazó un envío; las respuestas de clientes a `soporte@annly.app` podrían perderse.
  - Antes de salir, montar un buzón real (Zoho Mail gratis o Google Workspace) y cambiar los MX; entonces se puede quitar el secreto `SOPORTE_EMAIL`.
  - El envío (Resend) no se ve afectado por el reenvío.
- Nota: `consulta-modulo` manda un solo correo por negocio, módulo y día; al probar, usar otro negocio o esperar al día siguiente.

## Después de la salida
- [ ] Decidir si se comparte la sesión entre annly.app y tienda.annly.app con una cookie en `.annly.app`.
- [ ] Usar la base de clientes: descuento de cumpleaños, promo por cliente y ruleta.
