// =====================================================================
// Annly · horarios.js — lógica ÚNICA de días y horas disponibles
// La usan la agenda pública (agenda.js → 404.html) y el panel (admin.html:
// Reprogramar y Bloqueos). Cualquier regla de horarios se cambia SOLO aquí.
//
// Formatos de horario aceptados:
//   - por bloques (negocio / sucursal): { lv:{abre,cierra,cerrado}, sab:{…}, dom:{…} }
//   - por día (profesional):            { lun:{…}, mar:{…}, …, dom:{…} }
// Las horas van en texto "H:MM" de 24 h ("8:00", "16:30").
// =====================================================================
(function (global) {
  'use strict';

  const PASO_MIN = 30;                                  // cada cuánto se ofrece una hora
  const POR_DEFECTO = { abre: '8:00', cierra: '16:00' }; // si el negocio aún no configuró horario

  function timeToMin(t) {
    const [h, m] = String(t || '0:00').split(':').map(Number);
    return (h || 0) * 60 + (m || 0);
  }

  // "H:MM" sin cero a la izquierda en la hora (mismo formato que guardan los bloqueos)
  function minToKey(min) {
    return Math.floor(min / 60) + ':' + String(min % 60).padStart(2, '0');
  }

  function minToLabel(min) {
    const h = Math.floor(min / 60), m = min % 60;
    const h12 = h % 12 === 0 ? 12 : h % 12;
    return h12 + ':' + String(m).padStart(2, '0') + (h >= 12 ? ' PM' : ' AM');
  }

  // Clave del día dentro de un horario: por día (lun…dom) o por bloque (lv/sab/dom)
  function bloqueDelDia(dow, horario) {
    if (horario && (horario.lun || horario.mar || horario.mie || horario.jue || horario.vie)) {
      return ['dom', 'lun', 'mar', 'mie', 'jue', 'vie', 'sab'][dow];
    }
    return dow === 0 ? 'dom' : (dow === 6 ? 'sab' : 'lv');
  }

  // Configuración de un día. Sin horario: domingo cerrado y el resto 8:00–16:00.
  function cfgDia(horario, dow) {
    if (!horario) return dow === 0 ? { cerrado: true } : { ...POR_DEFECTO, cerrado: false };
    return horario[bloqueDelDia(dow, horario)] || { cerrado: true };
  }

  function abierto(c) {
    return !!(c && !c.cerrado && c.abre && c.cierra && timeToMin(c.abre) <= timeToMin(c.cierra));
  }

  // ¿Día cerrado?
  //   modo 'todos'  → cerrado si CUALQUIERA no trabaja (un profesional, o los 2 de una cita doble)
  //   modo 'alguno' → cerrado solo si NINGUNO trabaja ("cualquiera disponible", varias sucursales)
  function diaCerrado(horarios, dow, modo = 'todos') {
    const lista = (horarios && horarios.length) ? horarios : [null];
    const abiertos = lista.map(h => abierto(cfgDia(h, dow)));
    return modo === 'alguno' ? !abiertos.some(Boolean) : !abiertos.every(Boolean);
  }

  // Rango del día en minutos { ini, fin } o null si está cerrado.
  //   'interseccion' → todos deben estar (cita doble): la ventana común
  //   'union'        → basta con uno ("cualquiera disponible"): de la apertura más temprana al cierre más tarde
  function rangoDelDia(horarios, dow, modo = 'interseccion') {
    const lista = (horarios && horarios.length) ? horarios : [null];
    const cfgs = lista.map(h => cfgDia(h, dow));
    if (modo === 'interseccion') {
      if (!cfgs.every(abierto)) return null;
      const ini = Math.max(...cfgs.map(c => timeToMin(c.abre)));
      const fin = Math.min(...cfgs.map(c => timeToMin(c.cierra)));
      return ini <= fin ? { ini, fin } : null;
    }
    const ab = cfgs.filter(abierto);
    if (!ab.length) return null;
    return { ini: Math.min(...ab.map(c => timeToMin(c.abre))), fin: Math.max(...ab.map(c => timeToMin(c.cierra))) };
  }

  // Horas del día: [{ key:'9:30', lbl:'9:30 AM' }, …] cada 30 min, desde la apertura
  // hasta la hora de cierre inclusive (regla actual de Annly).
  // fecha: Date del día. Si es hoy, solo se ofrecen horas que aún no pasaron (salvo incluirPasadas).
  function generarSlots({ horarios, fecha, modo = 'interseccion', incluirPasadas = false, ahora = new Date() }) {
    const dow = fecha.getDay();
    const r = rangoDelDia(horarios, dow, modo);
    if (!r) return [];
    const slots = [];
    for (let t = r.ini; t <= r.fin; t += PASO_MIN) slots.push({ key: minToKey(t), lbl: minToLabel(t) });
    const esHoy = fecha.getFullYear() === ahora.getFullYear() && fecha.getMonth() === ahora.getMonth() && fecha.getDate() === ahora.getDate();
    if (esHoy && !incluirPasadas) {
      const nowMin = ahora.getHours() * 60 + ahora.getMinutes();
      return slots.filter(s => timeToMin(s.key) > nowMin);
    }
    return slots;
  }

  // ¿Un servicio de durSvc minutos que empieza en slotKey choca con alguna cita ocupada?
  // citas: [{ hora:'H:MM', duracion:min }]
  function solapa(slotKey, citas, durSvc) {
    const ini = timeToMin(slotKey);
    const dur = parseInt(durSvc, 10) || 60;
    return (citas || []).some(c => {
      const oIni = timeToMin(c.hora);
      const oDur = parseInt(c.duracion, 10) || 60;
      return ini < oIni + oDur && ini + dur > oIni;
    });
  }

  global.AnnlyHorarios = {
    PASO_MIN, timeToMin, minToKey, minToLabel,
    bloqueDelDia, cfgDia, diaCerrado, rangoDelDia, generarSlots, solapa
  };
})(window);
