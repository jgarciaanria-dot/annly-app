// =========================================================
// sheets.js — Adaptador Supabase COMPLETO
// Cubre index.html (sitio público) y admin.html (panel)
// =========================================================

const SUPABASE_URL = 'https://hokrimtsyseuqfjjvmxu.supabase.co';
const SUPABASE_KEY = 'sb_publishable_7JZShvbADW0URka-k_hjBQ_MSE0LM-V';
const BUSINESS_ID = '0eeae4cd-7460-4d53-8e60-4658200910e3';

const sbClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const MESES_MAP = { enero:0,febrero:1,marzo:2,abril:3,mayo:4,junio:5,julio:6,agosto:7,septiembre:8,octubre:9,noviembre:10,diciembre:11 };
const MESES_ARR = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

function parseFechaTexto(fechaStr) {
  const m = fechaStr.match(/(\d+)\s+de\s+(\w+)\s+(\d+)/i);
  if (!m) return null;
  const mesIdx = MESES_MAP[m[2].toLowerCase()];
  if (mesIdx === undefined) return null;
  return `${m[3]}-${String(mesIdx + 1).padStart(2, '0')}-${String(m[1]).padStart(2, '0')}`;
}
function isoAFechaTexto(iso) {
  const [a, m, d] = iso.split('-');
  return `${parseInt(d)} de ${MESES_ARR[parseInt(m) - 1]} ${a}`;
}
function formatHoraSitio(horaPg) {
  if (!horaPg) return '';
  const [h, m] = horaPg.split(':');
  return parseInt(h) + ':' + m;
}
function genCodigoCupon() {
  return 'RUL-' + Math.random().toString(16).slice(2, 6).toUpperCase();
}

const Sheets = {

  async initSheet() { return true; },

  // ---------- SERVICIOS ----------
  async getServicios() {
    const { data, error } = await sbClient.from('services').select('*').eq('business_id', BUSINESS_ID);
    if (error || !data) return [];
    return data.map(s => ({
      id: s.id, name: s.nombre, cat: s.categoria, price: parseFloat(s.precio) || 0,
      precioTexto: s.precio_texto, dur: s.dur, durMin: s.dur_min, active: s.activo,
      esEval: s.es_eval, requiereAbono: s.requiere_abono, abonoMonto: s.abono_monto,
      abonoTipo: s.abono_tipo, desc: s.descripcion, includes: s.includes || []
    }));
  },

  // Reemplaza el catálogo completo del negocio (borra y re-inserta)
  async guardarServicios(serviciosArr) {
    const servicios = typeof serviciosArr === 'string' ? JSON.parse(serviciosArr) : serviciosArr;
    await sbClient.from('services').delete().eq('business_id', BUSINESS_ID);
    if (!servicios.length) return;
    const rows = servicios.map(s => ({
      business_id: BUSINESS_ID, nombre: s.name, categoria: s.cat, precio: s.price || 0,
      precio_texto: s.precioTexto || null, dur: s.dur, dur_min: s.durMin, activo: s.active,
      es_eval: s.esEval || false, requiere_abono: s.requiereAbono || false,
      abono_monto: s.abonoMonto, abono_tipo: s.abonoTipo, descripcion: s.desc,
      includes: s.includes || []
    }));
    const { error } = await sbClient.from('services').insert(rows);
    if (error) console.error('Error guardando servicios:', error);
  },

  // ---------- BLOQUEOS ----------
  async getBloqueos() {
    const { data: fechas } = await sbClient.from('blocked_dates').select('fecha,motivo').eq('business_id', BUSINESS_ID);
    const { data: horas } = await sbClient.from('blocked_hours').select('fecha,hora').eq('business_id', BUSINESS_ID);
    const horasObj = {};
    (horas || []).forEach(h => { (horasObj[h.fecha] ||= []).push(h.hora); });
    return { dias: (fechas || []).map(f => ({ fecha: f.fecha, motivo: f.motivo })), horas: horasObj };
  },

  async guardarBloqueos(bloqueos) {
    await sbClient.from('blocked_dates').delete().eq('business_id', BUSINESS_ID);
    await sbClient.from('blocked_hours').delete().eq('business_id', BUSINESS_ID);
    if (bloqueos.dias?.length) {
      await sbClient.from('blocked_dates').insert(
        bloqueos.dias.map(d => ({ business_id: BUSINESS_ID, fecha: d.fecha, motivo: d.motivo }))
      );
    }
    const filas = [];
    Object.keys(bloqueos.horas || {}).forEach(fecha => {
      (bloqueos.horas[fecha] || []).forEach(hora => filas.push({ business_id: BUSINESS_ID, fecha, hora }));
    });
    if (filas.length) await sbClient.from('blocked_hours').insert(filas);
  },

  // ---------- CITAS ----------
  async getHorasOcupadas(fechaStr) {
    const fechaISO = parseFechaTexto(fechaStr);
    if (!fechaISO) return [];
    const { data } = await sbClient.from('appointments').select('hora, duracion_min')
      .eq('business_id', BUSINESS_ID).eq('fecha', fechaISO).neq('estado', 'cancelada');
    return (data || []).map(c => ({ hora: formatHoraSitio(c.hora), duracion: c.duracion_min || 60 }));
  },

  async getCitas() {
    const { data } = await sbClient.from('appointments').select('*').eq('business_id', BUSINESS_ID).neq('estado', 'cancelada');
    return (data || []).map(c => ({
      nombre: c.cliente_nombre, telefono: c.cliente_telefono, servicio: c.servicio_nombre,
      fecha: isoAFechaTexto(c.fecha), hora: formatHoraSitio(c.hora) + (parseInt(c.hora) >= 12 ? ' PM' : ' AM'),
      duracion: c.duracion_min
    }));
  },

  async guardarCita(cita) {
    const fechaISO = parseFechaTexto(cita.fecha);
    const { error } = await sbClient.from('appointments').insert([{
      business_id: BUSINESS_ID, cliente_nombre: cita.nombre, cliente_telefono: cita.telefono,
      cliente_correo: cita.correo, nota: cita.nota, servicio_nombre: cita.servicio, categoria: cita.categoria,
      precio_total: cita.precioTotal, precio_es_consultar: cita.precioEsConsultar, fecha: fechaISO,
      hora: cita.hora, duracion_min: cita.duracionMin, comprobante: cita.comprobante,
      abono_monto: cita.abonoMonto, abono_tipo: cita.abonoTipo, metodo_pago: cita.metodoPago,
      cupon_aplicado: cita.cuponUsado, descuento_cupon: cita.descuentoCupon,
      precio_final: cita.precioFinal, cita_id_externo: cita.citaId, estado: 'confirmada'
    }]);
    if (error) { console.error('Error guardando la cita:', error); throw error; }
  },

  // ---------- PROMO (banner emergente) ----------
  async getPromo() {
    const { data } = await sbClient.from('promo_banner').select('*').eq('business_id', BUSINESS_ID).maybeSingle();
    if (!data) return { activa: false };
    return {
      activa: data.activa, tema: data.tema, etiqueta: data.etiqueta, festejo: data.festejo,
      servicio: data.servicio, precioNormal: data.precio_normal, precioPromo: data.precio_promo,
      vigencia: data.vigencia
    };
  },

  async guardarPromo(promo) {
    await sbClient.from('promo_banner').upsert({
      business_id: BUSINESS_ID, activa: promo.activa, tema: promo.tema, etiqueta: promo.etiqueta,
      festejo: promo.festejo, servicio: promo.servicio, precio_normal: promo.precioNormal || null,
      precio_promo: promo.precioPromo || null, vigencia: promo.vigencia
    });
  },

  // ---------- RULETA ----------
  async getRuletaConfig() {
    const { data: feat } = await sbClient.from('business_features').select('ruleta_premios').eq('business_id', BUSINESS_ID).maybeSingle();
    const { data: premios } = await sbClient.from('roulette_prizes').select('*').eq('business_id', BUSINESS_ID);
    return {
      activa: !!(feat && feat.ruleta_premios),
      premios: (premios || []).map(p => ({ premio: p.nombre, probabilidad: p.probabilidad, activo: p.activo, stock: p.stock }))
    };
  },

  async guardarRuletaConfig(payload) {
    await sbClient.from('business_features').update({ ruleta_premios: payload.activa }).eq('business_id', BUSINESS_ID);
    await sbClient.from('roulette_prizes').delete().eq('business_id', BUSINESS_ID);
    if (payload.premios?.length) {
      await sbClient.from('roulette_prizes').insert(
        payload.premios.map(p => ({ business_id: BUSINESS_ID, nombre: p.premio, probabilidad: p.probabilidad, activo: p.activo, stock: p.stock }))
      );
    }
  },

  async verificarElegibilidadRuleta(tel) {
    const { data: yaParticipo } = await sbClient.from('roulette_wins').select('id').eq('business_id', BUSINESS_ID).eq('telefono', tel).limit(1);
    if (yaParticipo?.length) return { elegible: false };
    const { data: feat } = await sbClient.from('business_features').select('ruleta_premios').eq('business_id', BUSINESS_ID).maybeSingle();
    return { elegible: !!(feat && feat.ruleta_premios) };
  },

  async girarRuleta(identificador, nombre, citaId) {
    const { data: premios } = await sbClient.from('roulette_prizes').select('*').eq('business_id', BUSINESS_ID).eq('activo', true);
    const disponibles = (premios || []).filter(p => p.stock === null || p.stock > 0);
    if (!disponibles.length) return { ok: false, motivo: 'sin_premios' };
    const total = disponibles.reduce((s, p) => s + (p.probabilidad || 0), 0);
    let rand = Math.random() * total, elegido = disponibles[disponibles.length - 1];
    for (const p of disponibles) { rand -= (p.probabilidad || 0); if (rand <= 0) { elegido = p; break; } }
    const codigo = genCodigoCupon();
    await sbClient.from('roulette_wins').insert([{
      business_id: BUSINESS_ID, telefono: identificador, nombre, prize_id: elegido.id, codigo_cupon: codigo, usado: false
    }]);
    if (elegido.stock !== null) await sbClient.from('roulette_prizes').update({ stock: elegido.stock - 1 }).eq('id', elegido.id);
    return { ok: true, esPremioReal: true, premio: elegido.nombre, codigoCanje: codigo };
  },

  async validarCupon(codigo) {
    const cod = (codigo || '').toUpperCase().trim();
    if (!cod) return { valido: false, motivo: 'codigo_vacio' };
    const { data } = await sbClient.from('roulette_wins').select('*').eq('business_id', BUSINESS_ID).eq('codigo_cupon', cod).maybeSingle();
    if (!data) return { valido: false, motivo: 'codigo_no_encontrado' };
    if (data.usado) return { valido: false, motivo: 'ya_canjeado' };
    const { data: premio } = await sbClient.from('roulette_prizes').select('nombre').eq('id', data.prize_id).maybeSingle();
    const nombre = premio?.nombre || '';
    const pctMatch = nombre.match(/(\d+)\s*%/);
    if (pctMatch) return { valido: true, tipo: 'porcentaje', valor: parseInt(pctMatch[1]), premio: nombre };
    return { valido: true, tipo: 'especial', premio: nombre };
  },

  async marcarCuponCanjeado(codigo) {
    await sbClient.from('roulette_wins').update({ usado: true }).eq('business_id', BUSINESS_ID).eq('codigo_cupon', (codigo || '').toUpperCase().trim());
    return { ok: true };
  },
async getGanadoresRuleta() {
    const { data, error } = await sbClient
      .from('roulette_wins')
      .select('*, roulette_prizes(nombre)')
      .eq('business_id', BUSINESS_ID)
      .order('ganado_en', { ascending: false });
    if (error || !data) return [];
    return data.map(w => ({
      nombre: w.nombre,
      telefono: w.telefono,
      premio: w.roulette_prizes?.nombre || '',
      codigoCanje: w.codigo_cupon,
      canjeado: w.usado ? 'si' : 'no'
    }));
  },
  // ---------- CLIENTAS ----------
  async getClientas() {
    const { data } = await sbClient.from('clients').select('*').eq('business_id', BUSINESS_ID);
    return (data || []).map(c => ({ nombre: c.nombre, telefono: c.telefono, correo: c.email, notas: c.notas }));
  },

  async guardarClientas(clientasArr) {
    const clientas = typeof clientasArr === 'string' ? JSON.parse(clientasArr) : clientasArr;
    await sbClient.from('clients').delete().eq('business_id', BUSINESS_ID);
    if (!clientas.length) return;
    await sbClient.from('clients').insert(
      clientas.map(c => ({ business_id: BUSINESS_ID, nombre: c.nombre, telefono: c.telefono, email: c.correo, notas: c.notas }))
    );
  }
};
