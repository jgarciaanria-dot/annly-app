# Ruleta de premios (Annly Agenda)

Disponible en **Medium y Ultimate**, con la cuenta activa (no en prueba gratis ni suspendida).

## Cómo funciona
1. El negocio, en el panel (pestaña **Ruleta**), activa la ruleta y configura sus premios: nombre, probabilidad (pesos relativos) y stock (vacío = ilimitado).
2. Cuando alguien reserva una cita en la agenda pública, aparece la rueda. Cada cliente (por teléfono) puede girar **una sola vez**.
3. El premio lo sortea la base de datos (`ruleta_girar`), no el navegador. El cliente ve su **código de canje** (`RUL-XXXX`).
4. El negocio ve a los ganadores en el panel y marca cada premio como **canjeado**.

Reglas del sorteo:
- Solo participan los premios activos, con probabilidad mayor que 0 y con stock.
- El teléfono se compara solo por dígitos (`6815-5141` es igual a `68155141`).
- Hace falta una reserva real: la agenda envía el id de la cita recién guardada.
- Si dos giros del mismo teléfono llegan a la vez, solo uno se acepta.
- Al guardar la configuración, los premios se actualizan por id. Un premio que se quita pero ya tiene ganadores se archiva (no se pierde el historial).

## Piezas
- Base de datos: `supabase/sql/ruleta.sql` (funciones `ruleta_disponible`, `ruleta_elegible`, `ruleta_girar`, `ruleta_guardar`). Se puede ejecutar más de una vez.
- Panel: `admin.html` (pestaña Ruleta) y `sheets.js` (`getRuletaConfig`, `guardarRuletaConfig`, `getGanadoresRuleta`, `marcarGanadorRuleta`).
- Agenda pública: `agenda.js` (construye la rueda), `ruleta-frontend.js` (giro y pantalla del premio) y el modal de `404.html`.

## Guía de prueba (cuenta Medium o Ultimate)
1. Ejecutar `ruleta.sql` en Supabase (si no se ha hecho).
2. Panel → Ruleta: crear 3 o 4 premios (probabilidades 50, 30, 20; uno con stock 1), activar y **guardar**. Debe avisar que se actualizó y los premios deben quedar una sola vez.
3. Guardar otra vez sin cambios: no debe duplicar premios.
4. Agenda pública: reservar una cita. Debe aparecer la rueda; girar. Debe mostrar el premio y el **código de canje** con botón para copiarlo.
5. Panel → Ganadores recientes: debe verse el ganador con su código. Marcar como canjeado y deshacer.
6. Volver a reservar con el mismo teléfono (también escrito de otra forma, por ejemplo `6815-5141` y `68155141`): no debe dejar girar otra vez.
7. Apagar la ruleta: no debe aparecer al reservar. Con la cuenta en Basic o en prueba: tampoco.
8. Reserva de cita doble (2 personas): debe aparecer la rueda para quien reservó.
9. Probar en celular.
