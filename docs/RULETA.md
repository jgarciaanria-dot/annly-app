# Ruleta de premios (Annly Agenda)

Disponible en **Medium y Ultimate**, con la cuenta activa (no en prueba gratis ni suspendida).

## Cómo funciona
1. El negocio, en el panel (pestaña **Ruleta**), activa la ruleta, elige **cuándo aparece** y configura sus premios: nombre, probabilidad (pesos relativos) y stock (vacío = ilimitado).
2. Cuando alguien reserva una cita en la agenda pública, aparece la rueda si cumple la regla elegida.
3. El premio lo sortea la base de datos (`ruleta_girar`), no el navegador. El cliente ve su **código de canje** (`RUL-XXXX`).
4. El negocio ve a los ganadores en el panel y marca cada premio como **canjeado**.

### Cómo se canjea un premio
Cada premio tiene un **tipo** que el negocio elige en el panel:
- **Descuento en %:** al reservar, el cliente escribe su código `RUL-XXXX` y se resta ese porcentaje del precio.
- **Descuento en $:** se resta esa cantidad del precio (por ejemplo, $10).
- **Regalo o servicio:** el código queda anotado en la cita y el negocio lo cumple en el local.

Reglas del cupón:
- Es de **quien lo ganó**: al aplicarlo se compara con el WhatsApp de la reserva. Si es de otra persona, no se acepta.
- Tiene **vigencia** (30 días por defecto, configurable; 0 = no vence). Se muestra "Válido hasta…" al ganar y al aplicarlo.
- Se usa **una sola vez**. Si la cita con el cupón se cancela, el cupón vuelve a quedar disponible.
- Antes de guardar la cita se comprueba otra vez; si dejó de valer, se quita del resumen y se avisa.
- En el panel, la cita muestra el código y cuánto se descontó.

### ¿Cuándo aparece? (configurable)
- **Siempre:** a cada cliente, una sola vez.
- **En un periodo** (por ejemplo, el mes de aniversario o una promoción): entre dos fechas; cada cliente gira una vez durante ese periodo. Al terminar el periodo la ruleta deja de aparecer; un nuevo periodo vuelve a dar una oportunidad a todos.
- **Cuando el cliente está de cumpleaños:** solo gira quien ya está en la lista de clientes del negocio con su fecha de cumpleaños (por ejemplo, inscrito en el programa de clientes), durante todo su mes de cumpleaños o solo el día; una vez al año. El cliente se reconoce por su teléfono.
- En cualquiera de las tres se puede escribir un **mensaje sobre la rueda** (por ejemplo, "¡Estamos de aniversario! Gira y gana").

Reglas del sorteo:
- Solo participan los premios activos, con probabilidad mayor que 0 y con stock.
- El teléfono se compara solo por dígitos (`6815-5141` es igual a `68155141`).
- Hace falta una reserva real: la agenda envía el id de la cita recién guardada.
- Si dos giros del mismo teléfono llegan a la vez, solo uno se acepta.
- Al guardar la configuración, los premios se actualizan por id. Un premio que se quita pero ya tiene ganadores se archiva (no se pierde el historial).

## Piezas
- Base de datos: `supabase/sql/ruleta.sql` (funciones `ruleta_disponible`, `ruleta_elegible`, `ruleta_girar`, `ruleta_guardar`, `cupon_validar`, `cupon_marcar_usado`). Se puede ejecutar más de una vez.
- Panel: `admin.html` (pestaña Ruleta) y `sheets.js` (`getRuletaConfig`, `guardarRuletaConfig`, `getGanadoresRuleta`, `marcarGanadorRuleta`).
- Agenda pública: `agenda.js` (construye la rueda), `ruleta-frontend.js` (giro y pantalla del premio) y el modal de `404.html`.

## Guía de prueba (cuenta Medium o Ultimate)
1. Ejecutar `ruleta.sql` en Supabase (si no se ha hecho).
2. Panel → Ruleta: crear 3 o 4 premios (probabilidades 50, 30, 20; uno con stock 1), activar y **guardar**. Debe avisar que se actualizó y los premios deben quedar una sola vez.
3. Guardar otra vez sin cambios: no debe duplicar premios.
4. Agenda pública: reservar una cita. Debe aparecer la rueda; girar. Debe mostrar el premio y el **código de canje** con botón para copiarlo.
5. Panel → Ganadores recientes: debe verse el ganador con su código. Marcar como canjeado y deshacer.
6. Volver a reservar con el mismo teléfono (también escrito de otra forma, por ejemplo `6815-5141` y `68155141`): no debe dejar girar otra vez.
7. Probar los modos: **En un periodo** (fechas que incluyan hoy: aparece; fechas pasadas o futuras: no aparece) y **Cumpleaños** (con un cliente de la lista cuyo cumpleaños sea este mes: aparece; con otro: no). Revisar que el mensaje sobre la rueda se vea.
8. Apagar la ruleta: no debe aparecer al reservar. Con la cuenta en Basic o en prueba: tampoco.
9. Reserva de cita doble (2 personas): debe aparecer la rueda para quien reservó.
10. Probar en celular.
11. Premios con descuento: crear uno en % y otro en $; ganar cada uno y, al reservar otra cita con el mismo WhatsApp, escribir el código. El total debe bajar ese %/$. Con otro WhatsApp debe decir que pertenece a otra persona.
12. Cancelar la cita que usó un cupón: el cupón debe poder usarse otra vez.
