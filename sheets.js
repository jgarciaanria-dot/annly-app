const Sheets = {
  async initSheet() {},

  async guardarCita(cita) {
    try {
      const params = new URLSearchParams({
        action: 'guardar',
        nombre: cita.nombre || '',
        telefono: cita.telefono || '',
        correo: cita.correo || '',
        servicio: cita.servicio || '',
        categoria: cita.categoria || '',
        precioTotal: cita.precioTotal || 0,
        precioEsConsultar: cita.precioEsConsultar || false,
        fecha: cita.fecha || '',
        hora: cita.hora || '',
        duracionMin: cita.duracionMin || 60,
        comprobante: cita.comprobante || 'Sin abono',
        nota: cita.nota || '',
        abonoMonto: cita.abonoMonto || 0,
        abonoTipo: cita.abonoTipo || '',
        metodoPago: cita.metodoPago || '',
        cuponUsado: cita.cuponUsado || '',
        descuentoCupon: cita.descuentoCupon || 0,
        precioFinal: cita.precioFinal || cita.precioTotal || 0,
        omitirCorreos: cita.omitirCorreos ? 'true' : 'false'
      });
      const url = CONFIG.sheets.scriptUrl + '?' + params.toString();
      await fetch(url, { mode: 'no-cors' });
    } catch (e) {
      console.error('Error guardando cita:', e);
    }
  },

  async getHorasOcupadas(fecha) {
    try {
      const url = CONFIG.sheets.scriptUrl + '?action=horas&fecha=' + encodeURIComponent(fecha);
      const res = await fetch(url);
      const data = await res.json();
      return data.citas || [];
    } catch (e) {
      console.error('Error consultando horas:', e);
      return [];
    }
  },

  async getServicios() {
    try {
      const url = CONFIG.sheets.scriptUrl + '?action=getServicios&_=' + Date.now();
      const res = await fetch(url);
      const data = await res.json();
      return data.servicios || [];
    } catch (e) {
      console.error('Error cargando servicios:', e);
      return [];
    }
  },

  async guardarServicios(servicios) {
    try {
      await fetch(CONFIG.sheets.scriptUrl, {
        method: 'POST',
        mode: 'no-cors',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({action: 'guardarServicios', servicios: JSON.stringify(servicios)})
      });
    } catch (e) {
      console.error('Error guardando servicios:', e);
    }
  },

  async getBloqueos() {
    try {
      const url = CONFIG.sheets.scriptUrl + '?action=getBloqueos&_=' + Date.now();
      const res = await fetch(url);
      const data = await res.json();
      return data.bloqueos || {dias:[], horas:{}};
    } catch (e) {
      console.error('Error cargando bloqueos:', e);
      return {dias:[], horas:{}};
    }
  },

  async getCitas() {
    try {
      const url = CONFIG.sheets.scriptUrl + '?action=getCitas&_=' + Date.now();
      const res = await fetch(url);
      const data = await res.json();
      return data.citas || [];
    } catch (e) {
      console.error('Error cargando citas:', e);
      return [];
    }
  },

  async getPromo() {
    try {
      const url = CONFIG.sheets.scriptUrl + '?action=getPromo&_=' + Date.now();
      const res = await fetch(url);
      const data = await res.json();
      return data.promo || {activa:false};
    } catch (e) {
      console.error('Error cargando promo:', e);
      return {activa:false};
    }
  },

  async guardarPromo(promo) {
    try {
      await fetch(CONFIG.sheets.scriptUrl, {
        method: 'POST',
        mode: 'no-cors',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({action: 'guardarPromo', promo: JSON.stringify(promo)})
      });
    } catch (e) {
      console.error('Error guardando promo:', e);
    }
  },

  async guardarBloqueos(bloqueos) {
    try {
      await fetch(CONFIG.sheets.scriptUrl, {
        method: 'POST',
        mode: 'no-cors',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({action: 'guardarBloqueos', bloqueos: JSON.stringify(bloqueos)})
      });
    } catch (e) {
      console.error('Error guardando bloqueos:', e);
    }
  },

  async verificarElegibilidadRuleta(identificador) {
    try {
      const url = CONFIG.sheets.scriptUrl
        + '?action=verificarElegibilidad&identificador=' + encodeURIComponent(identificador)
        + '&_=' + Date.now();
      const res = await fetch(url);
      const data = await res.json();
      return data;
    } catch (e) {
      console.error('Error verificando elegibilidad ruleta:', e);
      return { elegible: false, motivo: 'error_red' };
    }
  },

  async girarRuleta(identificador, nombre, citaId) {
    try {
      const params = new URLSearchParams({
        action: 'girarRuleta',
        identificador: identificador || '',
        nombre: nombre || '',
        citaId: citaId || ''
      });
      const url = CONFIG.sheets.scriptUrl + '?' + params.toString() + '&_=' + Date.now();
      const res = await fetch(url);
      const data = await res.json();
      return data;
    } catch (e) {
      console.error('Error girando ruleta:', e);
      return { ok: false, motivo: 'error_red' };
    }
  },

  async validarCupon(codigo) {
    try {
      const url = CONFIG.sheets.scriptUrl + '?action=validarCupon&codigo=' + encodeURIComponent(codigo) + '&_=' + Date.now();
      const res = await fetch(url);
      return await res.json();
    } catch (e) {
      console.error('Error validando cupón:', e);
      return { valido: false, motivo: 'error_red' };
    }
  },

  async marcarCuponCanjeado(codigo) {
    try {
      const url = CONFIG.sheets.scriptUrl + '?action=marcarCanjeado&codigo=' + encodeURIComponent(codigo) + '&_=' + Date.now();
      const res = await fetch(url);
      return await res.json();
    } catch (e) {
      console.error('Error marcando cupón canjeado:', e);
      return { ok: false };
    }
  },

  async getRuletaConfig() {
    try {
      const url = CONFIG.sheets.scriptUrl + '?action=getRuletaConfig&_=' + Date.now();
      const res = await fetch(url);
      return await res.json();
    } catch (e) {
      console.error('Error cargando config de ruleta:', e);
      return { activa: false, premios: [] };
    }
  },

  async guardarRuletaConfig(payload) {
    try {
      await fetch(CONFIG.sheets.scriptUrl, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'guardarRuletaConfig', payload: payload })
      });
    } catch (e) {
      console.error('Error guardando config de ruleta:', e);
    }
  },

  async getClientas() {
    try {
      const url = CONFIG.sheets.scriptUrl + '?action=getClientas&_=' + Date.now();
      const res = await fetch(url);
      const data = await res.json();
      return data.clientas || [];
    } catch (e) {
      console.error('Error cargando clientas:', e);
      return [];
    }
  },

  async guardarClientas(clientas) {
    try {
      await fetch(CONFIG.sheets.scriptUrl, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'guardarClientas', clientas: JSON.stringify(clientas) })
      });
    } catch (e) {
      console.error('Error guardando clientas:', e);
    }
  }
};
