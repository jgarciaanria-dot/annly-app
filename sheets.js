// =========================================================
// sheets.js — Adaptador Supabase COMPLETO
// Cubre index.html (sitio público) y admin.html (panel)
// =========================================================

const SUPABASE_URL = 'https://hokrimtsyseuqfjjvmxu.supabase.co';
const SUPABASE_KEY = 'sb_publishable_7JZShvbADW0URka-k_hjBQ_MSE0LM-V';

const sbClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// =========================================================
// RESOLUCIÓN DINÁMICA DEL NEGOCIO (multi-tenant)
// Hoy: por parámetro ?n=slug en la URL (simulación en GitHub Pages).
// En producción con subdominios: se reemplaza el origen del slug
// por window.location.hostname.split('.')[0] — el resto no cambia.
// =========================================================
let BUSINESS_ID = null;
window.ANNLY_BUSINESS = null;

async function resolverNegocio() {
  window.ANNLY_AUTHENTICATED = false;

  // El panel admin y el registro necesitan saber si hay una sesión de usuario.
  // El sitio público (index.html/404.html) SIEMPRE usa el slug de la ruta,
  // sin importar si el navegador tiene una sesión de admin abierta (si no, un
  // dueño logueado vería su propio negocio en cualquier sitio público).
  const esPanelAdmin = window.location.pathname.includes('admin.html');
  const esRegistro = window.location.pathname.includes('registro.html');

  if (esPanelAdmin || esRegistro) {
    // No usamos getSession() directo: si venimos de un redirect de Google, el token
    // todavía se está procesando desde el hash de la URL. Esperamos el primer evento
    // de auth (que Supabase siempre dispara al iniciar, con la sesión ya resuelta)
    // en vez de competir con ese procesamiento y leer una sesión vieja del caché.
    const session = await new Promise((resolve) => {
      const { data: sub } = sbClient.auth.onAuthStateChange((_event, session) => {
        sub.subscription.unsubscribe();
        resolve(session);
      });
    });
    if (session && session.user) {
      window.ANNLY_AUTHENTICATED = true;
      if (esPanelAdmin) {
        const { data, error } = await sbClient.from('businesses').select('*').eq('owner_user_id', session.user.id).maybeSingle();
        if (!error && data) {
          BUSINESS_ID = data.id;
          window.ANNLY_BUSINESS = data;
        } else {
          // Hay sesión, pero ningún negocio vinculado a este usuario todavía
          window.ANNLY_BUSINESS = null;
        }
      }
    }
    return; // admin.html y registro.html nunca resuelven negocio por slug
  }

  // Sitio público -> resolver siempre por slug
  const params = new URLSearchParams(window.location.search);
  let slug = params.get('n');
  if (!slug) {
    const segmentos = window.location.pathname.split('/').filter(Boolean);
    slug = segmentos.find(s => !s.includes('.')) || 'demo';
  }
  const { data, error } = await sbClient.from('businesses').select('*').eq('slug', slug).maybeSingle();
  if (error || !data) {
    console.error('No se encontró ningún negocio activo para el slug:', slug, error);
    return;
  }
  BUSINESS_ID = data.id;
  window.ANNLY_BUSINESS = data;
  // ANNLY_AUTHENTICATED queda en false: esto es el sitio público, no una sesión de admin
}

// Autenticación (usada por admin.html)
window.AnnlyAuth = {
  async login(email, password) {
    const { data, error } = await sbClient.auth.signInWithPassword({ email, password });
    if (error) throw error;
    window.AnnlyReady = resolverNegocio(); // vuelve a resolver, ahora con sesión
    await window.AnnlyReady;
    return data;
  },
  async logout() {
    await sbClient.auth.signOut();
    window.location.reload();
  },
  async logoutSilent() {
    await sbClient.auth.signOut();
    window.ANNLY_AUTHENTICATED = false;
    window.ANNLY_BUSINESS = null;
  },
  async resetPassword(email) {
    const { error } = await sbClient.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + '/admin.html'
    });
    if (error) throw error;
  },
  async loginWithOAuth(provider) {
    const { error } = await sbClient.auth.signInWithOAuth({
      provider,
      options: { redirectTo: window.location.origin + '/admin.html' }
    });
    if (error) throw error;
    // La página se redirige a Google/Microsoft; al volver, supabase-js
    // detecta la sesión sola y verificarSesionInicial() en admin.html la retoma.
  },
  async getSession() {
    const { data } = await sbClient.auth.getSession();
    return data.session;
  },
  // Registro self-service: crea el usuario, el negocio, y los vincula, todo en un paso
  async registrar({ email, password, nombreNegocio, categoria, whatsapp, colorPrimario, colorSecundario }) {
    // 1. Crear el usuario en Supabase Auth
    const { data: authData, error: authError } = await sbClient.auth.signUp({ email, password });
    if (authError) throw authError;
    const userId = authData.user?.id;
    if (!userId) throw new Error('No se pudo crear el usuario.');

    // 2. Asegurar que hay sesión activa (algunos proyectos requieren confirmar correo primero)
    if (!authData.session) {
      const { error: loginError } = await sbClient.auth.signInWithPassword({ email, password });
      if (loginError) throw loginError; // el correo probablemente requiere confirmación
    }

    return await this._crearNegocio(userId, { nombreNegocio, categoria, whatsapp, colorPrimario, colorSecundario });
  },

  // Guarda los datos del paso 1 y 2 del registro antes de mandar al usuario a Google,
  // porque la redirección de OAuth recarga la página y perdemos cualquier variable JS.
  async iniciarRegistroConGoogle(datosNegocio) {
    sessionStorage.setItem('annly_registro_pendiente', JSON.stringify(datosNegocio));
    const { error } = await sbClient.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin + '/registro.html' }
    });
    if (error) { sessionStorage.removeItem('annly_registro_pendiente'); throw error; }
  },

  // Al volver de Google ya hay sesión (usuario autenticado); solo falta crear el negocio.
  async completarRegistroTrasOAuth(datosNegocio) {
    const { data: userData } = await sbClient.auth.getUser();
    const userId = userData?.user?.id;
    if (!userId) throw new Error('No hay sesión activa de Google.');
    return await this._crearNegocio(userId, datosNegocio);
  },

  async _crearNegocio(userId, { nombreNegocio, categoria, whatsapp, colorPrimario, colorSecundario }) {
    // Generar un slug único a partir del nombre del negocio
    const base = nombreNegocio.toLowerCase().trim()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // quita acentos
      .replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-');
    let slug = base;
    let intento = 1;
    while (true) {
      const { data: existe } = await sbClient.from('businesses').select('id').eq('slug', slug).maybeSingle();
      if (!existe) break;
      intento++;
      slug = `${base}-${intento}`;
    }

    // Crear el negocio, vinculado al usuario
    const trialVence = new Date();
    trialVence.setDate(trialVence.getDate() + 14);
    const { data: negocio, error: bizError } = await sbClient.from('businesses').insert([{
      nombre: nombreNegocio,
      slug,
      categoria: categoria || null,
      whatsapp: whatsapp || null,
      color_primario: colorPrimario || '#7C3AED',
      color_secundario: colorSecundario || '#EC4899',
      plan: 'trial',
      trial_vence_en: trialVence.toISOString().split('T')[0],
      activo: true,
      owner_user_id: userId
    }]).select().single();
    if (bizError) throw bizError;

    // Crear su fila de business_features (todo apagado salvo promociones)
    await sbClient.from('business_features').insert([{
      business_id: negocio.id,
      ruleta_premios: false,
      clientes_vip: false,
      promociones: true,
      dominio_personalizado: false
    }]);

    BUSINESS_ID = negocio.id;
    window.ANNLY_BUSINESS = negocio;
    window.ANNLY_AUTHENTICATED = true;
    return negocio;
  }
};

// Promesa exportada: index.html y admin.html la esperan antes de pintar nada
window.AnnlyReady = resolverNegocio();

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
    await window.AnnlyReady;
    const { data, error } = await sbClient.from('services').select('*').eq('business_id', BUSINESS_ID);
    if (error || !data) return [];
    return data.map(s => ({
      id: s.id, name: s.nombre, cat: s.categoria, price: parseFloat(s.precio) || 0,
      precioTexto: s.precio_texto, dur: s.dur, durMin: s.dur_min, active: s.activo,
      esEval: s.es_eval, requiereAbono: s.requiere_abono, abonoMonto: s.abono_monto,
      abonoTipo: s.abono_tipo, desc: s.descripcion, includes: s.includes || [],
      imagenUrl: s.imagen_url || null
    }));
  },

  // Reemplaza el catálogo completo del negocio (borra y re-inserta)
  async guardarServicios(serviciosArr) {
    await window.AnnlyReady;
    const servicios = typeof serviciosArr === 'string' ? JSON.parse(serviciosArr) : serviciosArr;
    await sbClient.from('services').delete().eq('business_id', BUSINESS_ID);
    if (!servicios.length) return;
    const rows = servicios.map(s => ({
      business_id: BUSINESS_ID, nombre: s.name, categoria: s.cat, precio: s.price || 0,
      precio_texto: s.precioTexto || null, dur: s.dur, dur_min: s.durMin, activo: s.active,
      es_eval: s.esEval || false, requiere_abono: s.requiereAbono || false,
      abono_monto: s.abonoMonto, abono_tipo: s.abonoTipo, descripcion: s.desc,
      includes: s.includes || [], imagen_url: s.imagenUrl || null
    }));
    const { error } = await sbClient.from('services').insert(rows);
    if (error) console.error('Error guardando servicios:', error);
  },

  async subirImagenServicio(file) {
    await window.AnnlyReady;
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
    const path = `${BUSINESS_ID}-svc-${Date.now()}.${ext}`;
    const { error: upErr } = await sbClient.storage.from('servicios').upload(path, file, { upsert: true });
    if (upErr) throw upErr;
    const { data } = sbClient.storage.from('servicios').getPublicUrl(path);
    return data.publicUrl;
  },

  // ---------- BLOQUEOS ----------
  async getBloqueos() {
    await window.AnnlyReady;
    const { data: fechas } = await sbClient.from('blocked_dates').select('fecha,motivo').eq('business_id', BUSINESS_ID);
    const { data: horas } = await sbClient.from('blocked_hours').select('fecha,hora').eq('business_id', BUSINESS_ID);
    const horasObj = {};
    (horas || []).forEach(h => { (horasObj[h.fecha] ||= []).push(h.hora); });
    return { dias: (fechas || []).map(f => ({ fecha: f.fecha, motivo: f.motivo })), horas: horasObj };
  },

  async guardarBloqueos(bloqueos) {
    await window.AnnlyReady;
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
  async getHorasOcupadas(fechaStr, empleadoId) {
    await window.AnnlyReady;
    const fechaISO = parseFechaTexto(fechaStr);
    if (!fechaISO) return [];
    let query = sbClient.from('appointments').select('hora, duracion_min')
      .eq('business_id', BUSINESS_ID).eq('fecha', fechaISO).neq('estado', 'cancelada');
    if (empleadoId) query = query.eq('employee_id', empleadoId);
    const { data } = await query;
    return (data || []).map(c => ({ hora: formatHoraSitio(c.hora), duracion: c.duracion_min || 60 }));
  },

  async getCitas() {
    await window.AnnlyReady;
    const { data } = await sbClient.from('appointments').select('*').eq('business_id', BUSINESS_ID).neq('estado', 'cancelada');
    const empleados = await this.getEmpleados();
    const mapaEmpleados = Object.fromEntries(empleados.map(e => [e.id, e.nombre]));
    return (data || []).map(c => ({
      id: c.id, nombre: c.cliente_nombre, telefono: c.cliente_telefono, servicio: c.servicio_nombre,
      fecha: isoAFechaTexto(c.fecha), hora: formatHoraSitio(c.hora) + (parseInt(c.hora) >= 12 ? ' PM' : ' AM'),
      duracion: c.duracion_min, fechaISO: c.fecha, horaISO: c.hora, categoria: c.categoria,
      precioTotal: c.precio_total, precioFinal: c.precio_final, precioEsConsultar: c.precio_es_consultar,
      empleadoId: c.employee_id, empleadoNombre: mapaEmpleados[c.employee_id] || null
    }));
  },

  async guardarCita(cita) {
    await window.AnnlyReady;
    const fechaISO = parseFechaTexto(cita.fecha);
    const { error } = await sbClient.from('appointments').insert([{
      business_id: BUSINESS_ID, employee_id: cita.empleadoId || null,
      cliente_nombre: cita.nombre, cliente_telefono: cita.telefono,
      cliente_correo: cita.correo, nota: cita.nota, servicio_nombre: cita.servicio, categoria: cita.categoria,
      precio_total: cita.precioTotal, precio_es_consultar: cita.precioEsConsultar, fecha: fechaISO,
      hora: cita.hora, duracion_min: cita.duracionMin, comprobante: cita.comprobante,
      abono_monto: cita.abonoMonto, abono_tipo: cita.abonoTipo, metodo_pago: cita.metodoPago,
      cupon_aplicado: cita.cuponUsado, descuento_cupon: cita.descuentoCupon,
      precio_final: cita.precioFinal, cita_id_externo: cita.citaId, estado: 'confirmada'
    }]);
    if (error) { console.error('Error guardando la cita:', error); throw error; }
  },

  async reprogramarCita(id, fechaISO, hora) {
    await window.AnnlyReady;
    const { error } = await sbClient.from('appointments')
      .update({ fecha: fechaISO, hora: hora })
      .eq('id', id).eq('business_id', BUSINESS_ID);
    if (error) { console.error('Error reprogramando la cita:', error); throw error; }
  },

  async cancelarCita(id) {
    await window.AnnlyReady;
    const { error } = await sbClient.from('appointments')
      .update({ estado: 'cancelada' })
      .eq('id', id).eq('business_id', BUSINESS_ID);
    if (error) { console.error('Error cancelando la cita:', error); throw error; }
  },

  // ---------- PROMO (banner emergente) ----------
  async getPromo() {
    await window.AnnlyReady;
    const { data } = await sbClient.from('promo_banner').select('*').eq('business_id', BUSINESS_ID).maybeSingle();
    if (!data) return { activa: false };
    return {
      activa: data.activa, tema: data.tema, etiqueta: data.etiqueta, festejo: data.festejo,
      servicio: data.servicio, precioNormal: data.precio_normal, precioPromo: data.precio_promo,
      vigencia: data.vigencia
    };
  },

  async guardarPromo(promo) {
    await window.AnnlyReady;
    await sbClient.from('promo_banner').upsert({
      business_id: BUSINESS_ID, activa: promo.activa, tema: promo.tema, etiqueta: promo.etiqueta,
      festejo: promo.festejo, servicio: promo.servicio, precio_normal: promo.precioNormal || null,
      precio_promo: promo.precioPromo || null, vigencia: promo.vigencia
    });
  },

  // ---------- RULETA ----------
  async getRuletaConfig() {
    await window.AnnlyReady;
    const { data: feat } = await sbClient.from('business_features').select('ruleta_premios').eq('business_id', BUSINESS_ID).maybeSingle();
    const { data: premios } = await sbClient.from('roulette_prizes').select('*').eq('business_id', BUSINESS_ID);
    return {
      activa: !!(feat && feat.ruleta_premios),
      premios: (premios || []).map(p => ({ premio: p.nombre, probabilidad: p.probabilidad, activo: p.activo, stock: p.stock }))
    };
  },

  async guardarRuletaConfig(payload) {
    await window.AnnlyReady;
    await sbClient.from('business_features').update({ ruleta_premios: payload.activa }).eq('business_id', BUSINESS_ID);
    await sbClient.from('roulette_prizes').delete().eq('business_id', BUSINESS_ID);
    if (payload.premios?.length) {
      await sbClient.from('roulette_prizes').insert(
        payload.premios.map(p => ({ business_id: BUSINESS_ID, nombre: p.premio, probabilidad: p.probabilidad, activo: p.activo, stock: p.stock }))
      );
    }
  },

  async verificarElegibilidadRuleta(tel) {
    await window.AnnlyReady;
    const { data: yaParticipo } = await sbClient.from('roulette_wins').select('id').eq('business_id', BUSINESS_ID).eq('telefono', tel).limit(1);
    if (yaParticipo?.length) return { elegible: false };
    const { data: feat } = await sbClient.from('business_features').select('ruleta_premios').eq('business_id', BUSINESS_ID).maybeSingle();
    return { elegible: !!(feat && feat.ruleta_premios) };
  },

  async girarRuleta(identificador, nombre, citaId) {
    await window.AnnlyReady;
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
    return { ok: true, premio: elegido.nombre, codigoCanje: codigo };
  },

  async validarCupon(codigo) {
    await window.AnnlyReady;
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
    await window.AnnlyReady;
    await sbClient.from('roulette_wins').update({ usado: true }).eq('business_id', BUSINESS_ID).eq('codigo_cupon', (codigo || '').toUpperCase().trim());
    return { ok: true };
  },

  // ---------- CLIENTAS ----------
  async getClientas() {
    await window.AnnlyReady;
    const { data } = await sbClient.from('clients').select('*').eq('business_id', BUSINESS_ID);
    return (data || []).map(c => ({ nombre: c.nombre, telefono: c.telefono, correo: c.email, notas: c.notas }));
  },

  async guardarClientas(clientasArr) {
    await window.AnnlyReady;
    const clientas = typeof clientasArr === 'string' ? JSON.parse(clientasArr) : clientasArr;
    await sbClient.from('clients').delete().eq('business_id', BUSINESS_ID);
    if (!clientas.length) return;
    await sbClient.from('clients').insert(
      clientas.map(c => ({ business_id: BUSINESS_ID, nombre: c.nombre, telefono: c.telefono, email: c.correo, notas: c.notas }))
    );
  },

  // Crea o actualiza (por teléfono) un cliente cuando reserva desde el sitio público.
  // A diferencia de guardarClientas, esto NO borra ni toca al resto de la lista.
  async upsertClienteDesdeReserva(nombre, telefono, correo) {
    await window.AnnlyReady;
    if (!telefono) return;
    const { data: existente, error: errBusqueda } = await sbClient.from('clients').select('id')
      .eq('business_id', BUSINESS_ID).eq('telefono', telefono).maybeSingle();
    if (errBusqueda) { console.error('Error buscando cliente existente:', errBusqueda); return; }
    if (existente) {
      const { error } = await sbClient.from('clients').update({ nombre, email: correo || null }).eq('id', existente.id);
      if (error) console.error('Error actualizando cliente:', error);
    } else {
      const { error } = await sbClient.from('clients').insert([{ business_id: BUSINESS_ID, nombre, telefono, email: correo || null }]);
      if (error) console.error('Error creando cliente:', error);
    }
  },

  // ---------- EQUIPO / EMPLEADOS ----------

  // Límite de empleados según el plan del negocio (campo simple, no el motor de suscripciones nuevo)
  LIMITE_EMPLEADOS_POR_PLAN: { trial: 1, basic: 1, medium: 2, ultimate: 3 },

  async getEmpleados() {
    await window.AnnlyReady;
    const { data, error } = await sbClient.from('employees').select('*').eq('business_id', BUSINESS_ID).order('creado_en');
    if (error) { console.error('Error leyendo empleados:', error); return []; }
    return (data || []).map(e => ({
      id: e.id, nombre: e.nombre, telefono: e.telefono, correo: e.correo,
      fotoUrl: e.foto_url, activo: e.activo, esDueno: e.es_dueno || false
    }));
  },

  // Si el negocio todavía no tiene ningún empleado, le crea uno por defecto
  // representando al dueño — así siempre hay al menos uno, sin casos especiales.
  async asegurarEmpleadoDueno() {
    await window.AnnlyReady;
    const { count } = await sbClient.from('employees').select('id', { count: 'exact', head: true }).eq('business_id', BUSINESS_ID);
    if (count && count > 0) return;
    const nombreNegocio = (window.ANNLY_BUSINESS && window.ANNLY_BUSINESS.nombre) || 'Dueño/a';
    await sbClient.from('employees').insert([{ business_id: BUSINESS_ID, nombre: nombreNegocio, activo: true, es_dueno: true }]);
  },

  async guardarEmpleado(empleado) {
    await window.AnnlyReady;
    const row = { business_id: BUSINESS_ID, nombre: empleado.nombre, telefono: empleado.telefono || null, correo: empleado.correo || null, foto_url: empleado.fotoUrl || null, activo: empleado.activo !== false };
    if (empleado.id) {
      const { error } = await sbClient.from('employees').update(row).eq('id', empleado.id);
      if (error) throw error;
      return empleado.id;
    } else {
      const { data, error } = await sbClient.from('employees').insert([row]).select().single();
      if (error) throw error;
      return data.id;
    }
  },

  async eliminarEmpleado(id) {
    await window.AnnlyReady;
    const { error } = await sbClient.from('employees').delete().eq('id', id);
    if (error) throw error;
  },

  async subirFotoEmpleado(file) {
    await window.AnnlyReady;
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
    const path = `${BUSINESS_ID}-emp-${Date.now()}.${ext}`;
    const { error: upErr } = await sbClient.storage.from('servicios').upload(path, file, { upsert: true });
    if (upErr) throw upErr;
    const { data } = sbClient.storage.from('servicios').getPublicUrl(path);
    return data.publicUrl;
  },

  async getEmpleadoServicios(empleadoId) {
    await window.AnnlyReady;
    const { data } = await sbClient.from('employee_services').select('service_id').eq('employee_id', empleadoId);
    return (data || []).map(r => r.service_id);
  },

  async guardarEmpleadoServicios(empleadoId, serviceIds) {
    await window.AnnlyReady;
    await sbClient.from('employee_services').delete().eq('employee_id', empleadoId);
    if (!serviceIds.length) return;
    await sbClient.from('employee_services').insert(serviceIds.map(sid => ({ employee_id: empleadoId, service_id: sid })));
  },

  // Devuelve { service_id: [employee_id, ...] } para todo el negocio de una vez
  async getMapaServiciosEmpleados() {
    await window.AnnlyReady;
    const { data: empleados } = await sbClient.from('employees').select('id').eq('business_id', BUSINESS_ID).eq('activo', true);
    const ids = (empleados || []).map(e => e.id);
    if (!ids.length) return {};
    const { data } = await sbClient.from('employee_services').select('employee_id, service_id').in('employee_id', ids);
    const mapa = {};
    (data || []).forEach(r => { (mapa[r.service_id] = mapa[r.service_id] || []).push(r.employee_id); });
    return mapa;
  },

  // Empleados activos que realizan un servicio específico. Un empleado sin
  // ningún servicio asignado se asume que los hace todos (mismo criterio
  // que en el modal de admin: "si no marcas ninguno, se asume que hace todos").
  async getEmpleadosParaServicio(serviceId) {
    await window.AnnlyReady;
    const { data: empleados } = await sbClient.from('employees').select('id, nombre, foto_url').eq('business_id', BUSINESS_ID).eq('activo', true);
    const lista = empleados || [];
    if (!lista.length) return [];
    const ids = lista.map(e => e.id);
    const { data: asignaciones } = await sbClient.from('employee_services').select('employee_id, service_id').in('employee_id', ids);
    const porEmpleado = {};
    (asignaciones || []).forEach(a => { (porEmpleado[a.employee_id] = porEmpleado[a.employee_id] || []).push(a.service_id); });
    return lista.filter(e => {
      const asign = porEmpleado[e.id];
      return !asign || !asign.length || asign.includes(serviceId);
    }).map(e => ({ id: e.id, nombre: e.nombre, fotoUrl: e.foto_url }));
  },

  async getEmpleadoHorario(empleadoId) {
    await window.AnnlyReady;
    const { data } = await sbClient.from('employee_schedules').select('horario_estructurado').eq('employee_id', empleadoId).maybeSingle();
    return data ? data.horario_estructurado : null; // null = usa el horario general del negocio
  },

  async guardarEmpleadoHorario(empleadoId, horario) {
    await window.AnnlyReady;
    const { data: existente } = await sbClient.from('employee_schedules').select('id').eq('employee_id', empleadoId).maybeSingle();
    if (existente) {
      await sbClient.from('employee_schedules').update({ horario_estructurado: horario }).eq('id', existente.id);
    } else {
      await sbClient.from('employee_schedules').insert([{ employee_id: empleadoId, horario_estructurado: horario }]);
    }
  },

  async eliminarEmpleadoHorario(empleadoId) {
    await window.AnnlyReady;
    await sbClient.from('employee_schedules').delete().eq('employee_id', empleadoId);
  },

  // ---------- PERFIL DEL NEGOCIO ----------
  async actualizarPerfil(datos) {
    await window.AnnlyReady;
    const { error } = await sbClient.from('businesses').update(datos).eq('id', BUSINESS_ID);
    if (error) throw error;
    Object.assign(window.ANNLY_BUSINESS, datos);
  },

  async subirLogo(file) {
    await window.AnnlyReady;
    const ext = (file.name.split('.').pop() || 'png').toLowerCase();
    const path = `${BUSINESS_ID}-${Date.now()}.${ext}`;
    const { error: upErr } = await sbClient.storage.from('logos').upload(path, file, { upsert: true });
    if (upErr) throw upErr;
    const { data } = sbClient.storage.from('logos').getPublicUrl(path);
    return data.publicUrl;
  }
};
