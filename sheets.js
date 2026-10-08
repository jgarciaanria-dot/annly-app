// =========================================================
// sheets.js — Adaptador Supabase COMPLETO
// Cubre index.html (sitio público) y admin.html (panel)
// =========================================================

const SUPABASE_URL = 'https://hokrimtsyseuqfjjvmxu.supabase.co';
const SUPABASE_KEY = 'sb_publishable_7JZShvbADW0URka-k_hjBQ_MSE0LM-V';

const sbClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// =========================================================
// ESTADO DE LA CUENTA POR PAGO
// Al vencer el plan (o la prueba): 48 horas de gracia con contador en pantalla; pasadas esas horas la
// cuenta queda SUSPENDIDA (el panel en solo vista y el sitio público sin reservas ni pedidos).
// (ANNLY_MORA_DESDE: tope inferior de la regla; hoy sin efecto práctico. Subirlo daría gracia extra a los ya vencidos.)
// ⚠ La regla debe ser la misma que la función SQL negocio_suspendido() (supabase/sql/negocio_suspendido.sql).
// Es un bloqueo de la aplicación (no de la base de datos): ver docs/etapa-2-pendientes.md.
// =========================================================
const ANNLY_GRACIA_HORAS = 48;
const ANNLY_MORA_DESDE = Date.parse('2026-01-01T00:00:00-05:00'); // inicio de la regla (hora de Panamá)
const ANNLY_MSG_SUSPENDIDA = 'Tu cuenta está suspendida. Para seguir utilizando las funciones, por favor realiza tu pago.';

// Cuenta de cortesía / acuerdo comercial: sin vencimiento (fecha de fin 2099-12-31)
function annlyEsCortesia(periodoHasta) {
  return String(periodoHasta || '').slice(0, 10) >= '2099-01-01';
}

// periodoHasta: fecha de fin del periodo pagado o de la prueba (current_period_end)
function annlyEstadoCuenta(periodoHasta) {
  const fin = String(periodoHasta || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fin)) return { fase: 'ok' };
  const vence = Date.parse(fin + 'T00:00:00-05:00') + 86400000; // vence al terminar el día de fin (hora de Panamá)
  const ahora = Date.now();
  if (ahora < vence) return { fase: 'ok' };
  const suspendeEn = Math.max(vence, ANNLY_MORA_DESDE) + ANNLY_GRACIA_HORAS * 3600000;
  return ahora < suspendeEn ? { fase: 'gracia', suspendeEn } : { fase: 'suspendida' };
}

// Con la cuenta suspendida, toda escritura a la base (insert/update/upsert/delete) devuelve un error en vez de guardarse
function annlyBloqueado() {
  const res = { data: null, count: null, status: 403, statusText: 'Forbidden', error: { code: 'CUENTA_SUSPENDIDA', message: ANNLY_MSG_SUSPENDIDA } };
  const p = new Proxy(function () {}, {
    get(_, k) {
      if (k === 'then') return (ok, ko) => Promise.resolve(res).then(ok, ko);
      if (k === 'catch') return (f) => Promise.resolve(res).catch(f);
      if (k === 'finally') return (f) => Promise.resolve(res).finally(f);
      return () => p;
    },
    apply() { return p; }
  });
  return p;
}
function annlyGuardarEscrituras(client, tablasLibres) {
  const from = client.from.bind(client);
  client.from = function (tabla) {
    const q = from(tabla);
    if (!window.ANNLY_SUSPENDIDA || (tablasLibres || []).includes(tabla)) return q;
    return new Proxy(q, {
      get(t, k) {
        if (k === 'insert' || k === 'update' || k === 'upsert' || k === 'delete') return () => annlyBloqueado();
        const v = t[k];
        return typeof v === 'function' ? v.bind(t) : v;
      }
    });
  };
}

function annlyEstilosCuenta() {
  if (document.getElementById('cuenta-estilos')) return;
  const st = document.createElement('style');
  st.id = 'cuenta-estilos';
  st.textContent = `
.cuenta-banner{position:fixed;left:0;right:0;bottom:0;z-index:900;display:flex;align-items:center;justify-content:center;gap:12px;padding:12px 16px;font:600 14px/1.35 'DM Sans',system-ui,sans-serif;flex-wrap:wrap;text-align:center;box-shadow:0 -6px 24px rgba(0,0,0,.18);}
.cuenta-banner.gracia{background:#FFF4DE;color:#7A5200;border-top:1px solid #F6E2B8;}
.cuenta-banner.suspendida{background:#7A1F2B;color:#fff;}
.cuenta-banner button{border:0;border-radius:10px;padding:9px 16px;font:800 13.5px 'DM Sans',system-ui,sans-serif;cursor:pointer;background:#7C3AED;color:#fff;}
.cuenta-banner .cb-timer{font-variant-numeric:tabular-nums;font-weight:800;font-size:16px;}
body.cuenta-aviso{padding-bottom:70px;}
.cuenta-toast{position:fixed;left:50%;bottom:84px;transform:translateX(-50%);z-index:950;max-width:92vw;background:#1A1625;color:#fff;padding:12px 16px;border-radius:12px;font:600 13.5px/1.4 'DM Sans',system-ui,sans-serif;box-shadow:0 10px 30px rgba(0,0,0,.3);}
#cuenta-vista{position:sticky;top:0;z-index:3000;background:#7A1F2B;color:#fff;text-align:center;padding:10px 14px;font:700 14px/1.4 system-ui,sans-serif;}
body.negocio-suspendido .btn-pedir,
body.negocio-suspendido .btn-main[onclick*="openCal"],
body.negocio-suspendido .btn-main[onclick*="Certificado"],
body.negocio-suspendido [onclick*="abrirModalComprarCertificado"]{display:none !important;}`;
  document.head.appendChild(st);
}
function annlyToastSuspension() {
  document.querySelectorAll('.cuenta-toast').forEach(e => e.remove());
  const t = document.createElement('div');
  t.className = 'cuenta-toast'; t.textContent = ANNLY_MSG_SUSPENDIDA;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 4500);
}

// Panel del negocio: pinta el aviso (contador en gracia, o suspendida) y, ya suspendida, deja la pantalla en solo vista.
// o.irAPagar: abre "Mi plan"; o.permitidos: selector CSS de lo que sigue funcionando (menú, "Mi plan", pago).
function annlyAplicarEstadoCuenta(periodoHasta, o) {
  clearInterval(window._cuentaT);
  annlyEstilosCuenta();
  const est = window.ANNLY_PLATFORM_ADMIN ? { fase: 'ok' } : annlyEstadoCuenta(periodoHasta);
  window.ANNLY_SUSPENDIDA = est.fase === 'suspendida';
  document.body.classList.toggle('cuenta-suspendida', window.ANNLY_SUSPENDIDA);
  let bar = document.getElementById('cuenta-banner');
  if (est.fase === 'ok') {
    if (bar) bar.remove();
    document.body.classList.remove('cuenta-aviso');
    return est;
  }
  if (!bar) { bar = document.createElement('div'); bar.id = 'cuenta-banner'; document.body.appendChild(bar); }
  document.body.classList.add('cuenta-aviso');
  bar.className = 'cuenta-banner ' + est.fase;
  if (est.fase === 'gracia') {
    bar.innerHTML = `<span>⏳ <b>Tu plan venció.</b> Tu cuenta se suspende en <span class="cb-timer"></span>. Paga ahora para evitarlo.</span><button type="button">Pagar ahora</button>`;
    const timer = bar.querySelector('.cb-timer');
    const tick = () => {
      const ms = est.suspendeEn - Date.now();
      if (ms <= 0) { annlyAplicarEstadoCuenta(periodoHasta, o); return; } // pasó la gracia: se suspende
      const s = Math.floor(ms / 1000);
      timer.textContent = [Math.floor(s / 3600), Math.floor(s % 3600 / 60), s % 60].map(n => String(n).padStart(2, '0')).join(':');
    };
    tick();
    window._cuentaT = setInterval(tick, 1000);
  } else {
    bar.innerHTML = `<span>🔒 <b>${ANNLY_MSG_SUSPENDIDA}</b></span><button type="button">Pagar ahora</button>`;
  }
  const btn = bar.querySelector('button');
  if (btn) btn.onclick = () => { if (o && o.irAPagar) o.irAPagar(); };
  if (!window._cuentaClickGuard) {
    window._cuentaClickGuard = true;
    document.addEventListener('click', ev => {
      if (!window.ANNLY_SUSPENDIDA) return;
      const t = ev.target && ev.target.closest && ev.target.closest('button, a, [onclick], select, label, input[type=checkbox], input[type=radio]');
      if (!t) return;
      const ok = (window._cuentaPermitidos || '') + ', #cuenta-banner, .pm-ov, btn-yappy, [class*="yappy" i], [id*="yappy" i]';
      if (t.closest(ok)) return;
      ev.preventDefault(); ev.stopPropagation(); ev.stopImmediatePropagation();
      annlyToastSuspension();
    }, true);
  }
  window._cuentaPermitidos = (o && o.permitidos) || '';
  return est;
}

// Sitio público: aviso arriba y sin reservas/pedidos
function annlyModoVista(texto) {
  annlyEstilosCuenta();
  window.ANNLY_VISTA = true;
  document.body.classList.add('negocio-suspendido');
  if (document.getElementById('cuenta-vista')) return;
  const d = document.createElement('div');
  d.id = 'cuenta-vista'; d.textContent = texto;
  document.body.prepend(d);
}
annlyGuardarEscrituras(sbClient, ['pagos_plataforma']);

// Annly Tiendas (producto aparte en Vercel, repo annly-pedidos).
// Producción: tienda.annly.app (pedidos.annly.app redirige ahí). Dev: dev-pedidos.annly.app.
// develop (dev.annly.app o *.vercel.app) enlaza con la tienda de desarrollo; main, con la de producción
const ANNLY_ES_DEV = /^dev[.-]|\.vercel\.app$|^localhost$|^127\./.test(window.location.hostname);
const ANNLY_PEDIDOS_URL = (window.ANNLY_PEDIDOS_URL || (ANNLY_ES_DEV ? 'https://dev-pedidos.annly.app' : 'https://tienda.annly.app')).replace(/\/$/, '');


// =========================================================
// PAGO DE PLANES CON TARJETA (etapa 1): enlaces fijos de PagueloFácil por concepto.
// Son públicos (cualquiera con el link puede pagar). Si falta uno, ese concepto no muestra botón.
// =========================================================
const ANNLY_LINKS_PAGO = {
  BASIC:                 'https://checkout.paguelofacil.com/W_RBOSITE/64ba7b3d',
  ULTIMATE:              'https://checkout.paguelofacil.com/W_RBOSITE/fab99d1c',
  MEDIUM:                'https://checkout.paguelofacil.com/W_RBOSITE/c2e772ba',
  FINANZAS:              'https://checkout.paguelofacil.com/W_RBOSITE/37eaa1fb',
  PAGOS:                 'https://checkout.paguelofacil.com/W_RBOSITE/34678531',
  CERTIFICADOS:          'https://checkout.paguelofacil.com/W_RBOSITE/7e4ee3fe',
  PROFESIONAL_ADICIONAL: 'https://checkout.paguelofacil.com/W_RBOSITE/6f51d01d',
  SUCURSAL_ADICIONAL:    'https://checkout.paguelofacil.com/W_RBOSITE/18c2e0dc'
};
window.ANNLY_LINKS_PAGO = ANNLY_LINKS_PAGO;

// =========================================================
// CONTEXTO MULTI-TENANT
// =========================================================

let BUSINESS_ID = null;

window.ANNLY_BUSINESS = null;
window.ANNLY_BUSINESSES = [];
window.ANNLY_PLATFORM_ADMIN = false;
window.ANNLY_AUTHENTICATED = false;


// =========================================================
// RESOLVER NEGOCIO
// =========================================================

async function resolverNegocio() {

  window.ANNLY_AUTHENTICATED = false;
  window.ANNLY_PLATFORM_ADMIN = false;
  window.ANNLY_BUSINESS = null;
  window.ANNLY_BUSINESSES = [];
  BUSINESS_ID = null;

  const esPanelAdmin = window.location.pathname.includes('admin.html');
  const esRegistro = window.location.pathname.includes('registro.html');


  // =======================================================
  // ADMIN / REGISTRO
  // =======================================================

  if (esPanelAdmin || esRegistro) {

    // Esperamos a que Supabase termine de resolver la sesión.
    const session = await new Promise((resolve) => {

      let resuelto = false;

      const resolver = (session) => {
        if (resuelto) return;
        resuelto = true;
        resolve(session);
      };

      const { data: sub } = sbClient.auth.onAuthStateChange(
        (_event, session) => {

          try {
            sub.subscription.unsubscribe();
          } catch (e) {}

          resolver(session);
        }
      );

      // Fallback por si ya existe una sesión y no recibimos
      // inmediatamente el evento esperado.
      setTimeout(async () => {

        if (resuelto) return;

        try {

          const { data } = await sbClient.auth.getSession();

          try {
            sub.subscription.unsubscribe();
          } catch (e) {}

          resolver(data?.session || null);

        } catch (e) {

          try {
            sub.subscription.unsubscribe();
          } catch (err) {}

          resolver(null);
        }

      }, 1500);
    });


    if (!session || !session.user) {
      return;
    }


    window.ANNLY_AUTHENTICATED = true;


    // =====================================================
    // REGISTRO
    // =====================================================

    if (esRegistro) {
      return;
    }


    // =====================================================
    // ADMIN — VERIFICAR PLATFORM ADMIN
    // =====================================================

    let esPlatformAdmin = false;

    try {

      const { data, error } = await sbClient.rpc('is_platform_admin');

      if (!error && data === true) {
        esPlatformAdmin = true;
      }

    } catch (e) {

      console.error(
        '[Annly] Error verificando Platform Admin:',
        e
      );

    }


    window.ANNLY_PLATFORM_ADMIN = esPlatformAdmin;


    // =====================================================
    // PLATFORM ADMIN
    // =====================================================

    if (esPlatformAdmin) {

      console.log(
        '[Annly] Usuario Platform Admin detectado.'
      );


      const { data: negocios, error } = await sbClient
        .from('businesses')
        .select('*')
        .order('nombre', { ascending: true });


      if (error) {

        console.error(
          '[Annly] Error cargando negocios:',
          error
        );

        return;
      }


      window.ANNLY_BUSINESSES = negocios || [];


      if (!window.ANNLY_BUSINESSES.length) {

        console.warn(
          '[Annly] Platform Admin sin negocios disponibles.'
        );

        return;
      }


      // Intentamos mantener el último negocio seleccionado
      // durante la sesión.
      const negocioGuardado =
        sessionStorage.getItem('annly_selected_business_id');


      let negocioInicial = null;


      if (negocioGuardado) {

        negocioInicial =
          window.ANNLY_BUSINESSES.find(
            b => String(b.id) === String(negocioGuardado)
          );
      }


      // Si no existe uno guardado, usamos el primero.
      if (!negocioInicial) {
        negocioInicial = window.ANNLY_BUSINESSES[0];
      }


      BUSINESS_ID = negocioInicial.id;
      window.ANNLY_BUSINESS = negocioInicial;


      sessionStorage.setItem(
        'annly_selected_business_id',
        String(negocioInicial.id)
      );


      console.log(
        '[Annly] Negocio seleccionado:',
        negocioInicial.nombre
      );


      return;
    }


    // =====================================================
    // USUARIO NORMAL — SOLO SU NEGOCIO
    // =====================================================

    const {
      data,
      error
    } = await sbClient
      .from('businesses')
      .select('*')
      .eq('owner_user_id', session.user.id)
      .maybeSingle();


    if (!error && data) {

      BUSINESS_ID = data.id;
      window.ANNLY_BUSINESS = data;
      window.ANNLY_BUSINESSES = [data];

    } else {

      window.ANNLY_BUSINESS = null;
      window.ANNLY_BUSINESSES = [];

    }


    return;
  }


  // =======================================================
  // SITIO PÚBLICO
  // =======================================================

  const params =
    new URLSearchParams(window.location.search);

  let slug = params.get('n');


  if (!slug) {

    const segmentos =
      window.location.pathname
        .split('/')
        .filter(Boolean);

    slug =
      segmentos.find(
        s => !s.includes('.')
      ) || 'demo';
  }


  // Función segura: un solo negocio, por su slug, con las columnas públicas
  const {
    data,
    error
  } = await sbClient.rpc('negocio_publico', { p_slug: slug });


  if (error || !data) {

    console.error(
      'No se encontró ningún negocio activo para el slug:',
      slug,
      error
    );

    return;
  }


  BUSINESS_ID = data.id;
  window.ANNLY_BUSINESS = data;

  // El sitio público no utiliza permisos de Platform Admin.
  window.ANNLY_AUTHENTICATED = false;
}


// =========================================================
// AUTENTICACIÓN
// =========================================================

window.AnnlyAuth = {

  // -------------------------------------------------------
  // LOGIN
  // -------------------------------------------------------

  async login(email, password) {

    const {
      data,
      error
    } = await sbClient.auth.signInWithPassword({
      email,
      password
    });


    if (error) {
      throw error;
    }


    window.AnnlyReady = resolverNegocio();

    await window.AnnlyReady;

    return data;
  },


  // -------------------------------------------------------
  // LOGOUT
  // -------------------------------------------------------

  async logout() {

    sessionStorage.removeItem(
      'annly_selected_business_id'
    );

    await sbClient.auth.signOut();

    window.location.reload();
  },


  // -------------------------------------------------------
  // LOGOUT SILENCIOSO
  // -------------------------------------------------------

  async logoutSilent() {

    sessionStorage.removeItem(
      'annly_selected_business_id'
    );

    await sbClient.auth.signOut();

    window.ANNLY_AUTHENTICATED = false;
    window.ANNLY_PLATFORM_ADMIN = false;
    window.ANNLY_BUSINESS = null;
    window.ANNLY_BUSINESSES = [];

    BUSINESS_ID = null;
  },


  // -------------------------------------------------------
  // PASSWORD RESET
  // -------------------------------------------------------

async resetPassword(email) {

  const {
    error
  } = await sbClient.auth.resetPasswordForEmail(
    email,
    {
      redirectTo:
        window.location.origin + '/update-password.html'
    }
  );

  if (error) {
    throw error;
  }
},


  // -------------------------------------------------------
  // OAUTH
  // -------------------------------------------------------

  async loginWithOAuth(provider) {

    const {
      error
    } = await sbClient.auth.signInWithOAuth({

      provider,

      options: {
        redirectTo:
          window.location.origin + '/admin.html'
      }

    });


    if (error) {
      throw error;
    }

    // La página se redirige al proveedor.
    // Al volver, Supabase detecta la sesión automáticamente.
  },


  // -------------------------------------------------------
  // GET SESSION
  // -------------------------------------------------------

  async getSession() {

    const {
      data
    } = await sbClient.auth.getSession();

    return data.session;
  },


  // -------------------------------------------------------
  // ¿ES PLATFORM ADMIN?
  // -------------------------------------------------------

  async esPlatformAdmin() {

    try {

      const {
        data,
        error
      } = await sbClient.rpc(
        'is_platform_admin'
      );


      if (error) {

        console.error(
          '[Annly] Error verificando Platform Admin:',
          error
        );

        return false;
      }


      return data === true;

    } catch (e) {

      console.error(
        '[Annly] Error verificando Platform Admin:',
        e
      );

      return false;
    }
  },


  // -------------------------------------------------------
  // OBTENER NEGOCIOS DISPONIBLES
  // -------------------------------------------------------

  async getNegociosDisponibles() {

    await window.AnnlyReady;


    if (!window.ANNLY_AUTHENTICATED) {
      return [];
    }


    if (!window.ANNLY_PLATFORM_ADMIN) {

      return window.ANNLY_BUSINESS
        ? [window.ANNLY_BUSINESS]
        : [];
    }


    return window.ANNLY_BUSINESSES || [];
  },


  // -------------------------------------------------------
  // SELECCIONAR NEGOCIO
  // -------------------------------------------------------

  async seleccionarNegocio(businessId) {

    await window.AnnlyReady;


    if (!window.ANNLY_PLATFORM_ADMIN) {

      throw new Error(
        'Solo un Platform Admin puede cambiar de negocio.'
      );
    }


    const negocio =
      (window.ANNLY_BUSINESSES || []).find(
        b => String(b.id) === String(businessId)
      );


    if (!negocio) {

      throw new Error(
        'El negocio seleccionado no está disponible.'
      );
    }


    BUSINESS_ID = negocio.id;

    window.ANNLY_BUSINESS = negocio;


    sessionStorage.setItem(
      'annly_selected_business_id',
      String(negocio.id)
    );


    console.log(
      '[Annly] Cambio de negocio:',
      negocio.nombre
    );


    // Evento para que admin.html pueda reaccionar
    // cuando agreguemos el selector visual.
    window.dispatchEvent(
      new CustomEvent(
        'annly:business-changed',
        {
          detail: negocio
        }
      )
    );


    return negocio;
  },


  // -------------------------------------------------------
  // REGISTRO SELF-SERVICE
  // -------------------------------------------------------

  async registrar({
    email,
    password,
    nombreNegocio,
    categoria,
    representanteLegal,
    ruc,
    whatsapp,
        colorPrimario,
    colorSecundario,
    tipoNegocio
  }) {
    // 1. Crear usuario en Supabase Auth

    const {
      data: authData,
      error: authError
    } = await sbClient.auth.signUp({
      email,
      password
    });


    if (authError) {
      throw authError;
    }


    const userId =
      authData.user?.id;


    if (!userId) {

      throw new Error(
        'No se pudo crear el usuario.'
      );
    }


    // 2. Asegurar sesión activa

    if (!authData.session) {

      const {
        error: loginError
      } = await sbClient.auth.signInWithPassword({
        email,
        password
      });


      if (loginError) {
        throw loginError;
      }
    }


    return await this._crearNegocio(
      userId,
      {
        nombreNegocio,
        categoria,
        representanteLegal,
        ruc,
                whatsapp,
        colorPrimario,
        colorSecundario,
        tipoNegocio
      }
    );
  },

  // -------------------------------------------------------
  // ANNLY PEDIDOS: link al panel con la sesión actual.
  // Cada dominio guarda su propia sesión, así que se pasa en el hash
  // (nunca viaja al servidor) y el panel de Pedidos la toma con setSession.
  // -------------------------------------------------------
  async urlPanelPedidos() {
    const { data } = await sbClient.auth.getSession();
    const ses = data && data.session;
    if (!ses) return ANNLY_PEDIDOS_URL + '/admin';
    return ANNLY_PEDIDOS_URL + '/admin#annly_at=' + encodeURIComponent(ses.access_token) +
      '&annly_rt=' + encodeURIComponent(ses.refresh_token);
  },

  async irAPanelPedidos() {
    window.location.replace(await this.urlPanelPedidos());
  },
  // -------------------------------------------------------
  // ¿YA HAY UN NEGOCIO REGISTRADO CON ESTE WHATSAPP?
  // Aviso suave en el registro; no bloquea (un mismo dueño puede
  // administrar varios negocios con el mismo número).
  // -------------------------------------------------------

  async existeWhatsapp(whatsapp) {
    if (!whatsapp) return false;
    // Función segura: responde sí/no sin poder leer los demás negocios
    const { data, error } = await sbClient.rpc('whatsapp_registrado', { p_whatsapp: whatsapp });
    if (error) { console.error('Error revisando el WhatsApp:', error); return false; }
    return !!data;
  },


  // -------------------------------------------------------
  // REGISTRO CON GOOGLE
  // -------------------------------------------------------

  async iniciarRegistroConGoogle(datosNegocio) {

    sessionStorage.setItem(
      'annly_registro_pendiente',
      JSON.stringify(datosNegocio)
    );


    const {
      error
    } = await sbClient.auth.signInWithOAuth({

      provider: 'google',

      options: {
        redirectTo:
          window.location.origin + '/registro.html'
      }

    });


    if (error) {

      sessionStorage.removeItem(
        'annly_registro_pendiente'
      );

      throw error;
    }
  },


  // -------------------------------------------------------
  // COMPLETAR REGISTRO DESPUÉS DE GOOGLE
  // -------------------------------------------------------

  async completarRegistroTrasOAuth(datosNegocio) {

    const {
      data: userData
    } = await sbClient.auth.getUser();


    const userId =
      userData?.user?.id;


    if (!userId) {

      throw new Error(
        'No hay sesión activa de Google.'
      );
    }


    return await this._crearNegocio(
      userId,
      datosNegocio
    );
  },


  // -------------------------------------------------------
  // CREAR NEGOCIO
  // -------------------------------------------------------

  async _crearNegocio(
    userId,
    {
      nombreNegocio,
      categoria,
      representanteLegal,
      ruc,
      whatsapp,
            colorPrimario,
      colorSecundario,
      tipoNegocio
    }
  ) {
    const esPedidos = tipoNegocio === 'pedidos';
    // Generar slug único

    const base =
      nombreNegocio
        .toLowerCase()
        .trim()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-');


    let slug = base;
    let intento = 1;


    while (true) {

      // Función segura: revisa el slug en todos los negocios sin poder leerlos
      const {
        data: libre,
        error: errSlug
      } = await sbClient.rpc('slug_disponible', { p_slug: slug });

      if (errSlug) {
        throw errSlug;
      }

      if (libre) {
        break;
      }


      intento++;

      slug =
        `${base}-${intento}`;
    }


    // Trial de 14 días. Se cuenta con la fecha de Panamá (UTC-5): con la hora UTC, un registro de noche
    // caía ya en el día siguiente y la prueba salía de 15 días.

    const trialVence =
      new Date(Date.now() - 5 * 3600000);

    trialVence.setUTCDate(
      trialVence.getUTCDate() + 14
    );


    // Crear negocio

    const {
      data: negocio,
      error: bizError
    } = await sbClient
      .from('businesses')
      .insert([{

        nombre: nombreNegocio,

        slug,

        categoria:
          categoria || null,

        representante_legal:
          representanteLegal || null,

        ruc_cedula:
          ruc || null,

        whatsapp:
          whatsapp || null,

        color_primario:
          colorPrimario || '#7C3AED',

        color_secundario:
          colorSecundario || '#EC4899',

        plan: 'trial',

        trial_vence_en:
          trialVence
            .toISOString()
            .split('T')[0],

        activo: true,

                owner_user_id:
          userId,
        tipo_negocio:
          esPedidos ? 'pedidos' : 'citas'
      }])
      .select()
      .single();


    if (bizError) {
      throw bizError;
    }


        // Annly Pedidos: configuración inicial (tiempo mínimo, vencimiento de pago, etc.)
    if (esPedidos) {
      const { error: cfgError } = await sbClient.from('order_settings').insert([{ business_id: negocio.id }]);
      if (cfgError) console.error('No se pudo crear la configuración de pedidos:', cfgError);
    }
    // Crear business_features
    await sbClient
      .from('business_features')
      .insert([{

        business_id:
          negocio.id,

        ruleta_premios:
          false,

        clientes_vip:
          false,

        promociones:
          true,

        dominio_personalizado:
          false

      }]);


    // Crear la suscripción del negocio (plan Basic por defecto, en periodo de
    // prueba) — sin esto, "Mi plan" en admin.html no puede cambiar de plan ni
    // activar módulos, porque getSuscripcionActual() no encuentra nada.
    const {
      data: planBasic
    } = await sbClient
            .from('plans')
      .select('id')
      .eq('code', esPedidos ? 'PEDIDOS_BASIC' : 'BASIC')
      .maybeSingle();

    if (planBasic) {
      const {
        error: subError
      } = await sbClient
        .from('subscriptions')
        .insert([{
          business_id: negocio.id,
          plan_id: planBasic.id,
          status: 'trial',
          current_period_end: trialVence.toISOString().split('T')[0]
        }]);

      if (subError) {
        console.error('No se pudo crear la suscripción del negocio nuevo:', subError);
      }
    } else {
      console.error('No se encontró el plan BASIC — no se pudo crear la suscripción del negocio nuevo.');
    }


    // Correo de bienvenida (una sola vez; si falla, el registro sigue igual)
    try {
      const { data: ses } = await sbClient.auth.getSession();
      if (ses && ses.session) {
        fetch(`${SUPABASE_URL}/functions/v1/enviar-bienvenida`, {
          method: 'POST',
          headers: { 'Authorization': 'Bearer ' + ses.session.access_token, 'Content-Type': 'application/json' },
          body: '{}'
        }).catch(() => {});
      }
    } catch (e) { console.error('Correo de bienvenida:', e); }

    BUSINESS_ID =
      negocio.id;


    window.ANNLY_BUSINESS =
      negocio;


    window.ANNLY_BUSINESSES =
      [negocio];


    window.ANNLY_AUTHENTICATED =
      true;


    window.ANNLY_PLATFORM_ADMIN =
      false;


    return negocio;
  }

};


// =========================================================
// PROMESA GLOBAL DE INICIALIZACIÓN
// =========================================================

window.AnnlyReady =
  resolverNegocio();


// =========================================================
// UTILIDADES
// =========================================================

const MESES_MAP = {
  enero: 0,
  febrero: 1,
  marzo: 2,
  abril: 3,
  mayo: 4,
  junio: 5,
  julio: 6,
  agosto: 7,
  septiembre: 8,
  octubre: 9,
  noviembre: 10,
  diciembre: 11
};


const MESES_ARR = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre'
];


function parseFechaTexto(fechaStr) {

  const m =
    fechaStr.match(
      /(\d+)\s+de\s+(\w+)\s+(\d+)/i
    );


  if (!m) {
    return null;
  }


  const mesIdx =
    MESES_MAP[
      m[2].toLowerCase()
    ];


  if (mesIdx === undefined) {
    return null;
  }


  return `${m[3]}-${String(
    mesIdx + 1
  ).padStart(2, '0')}-${String(
    m[1]
  ).padStart(2, '0')}`;
}


function isoAFechaTexto(iso) {

  const [a, m, d] =
    iso.split('-');


  return `${parseInt(d)} de ${
    MESES_ARR[
      parseInt(m) - 1
    ]
  } ${a}`;
}


function formatHoraSitio(horaPg) {

  if (!horaPg) {
    return '';
  }


  const [h, m] =
    horaPg.split(':');


  return parseInt(h) + ':' + m;
}


// "13:00:00" -> "1:00 PM" | "09:30:00" -> "9:30 AM" | "00:15:00" -> "12:15 AM"
function formatHora12Cita(horaPg) {

  if (!horaPg) {
    return '';
  }

  const [hStr, mStr] =
    horaPg.split(':');

  const h = parseInt(hStr, 10);

  return (
    ((h % 12) || 12) +
    ':' +
    (mStr || '00') +
    (h >= 12 ? ' PM' : ' AM')
  );
}


function nuevoUUID() {
  if (window.crypto && typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

function genCodigoCupon() {

  return 'RUL-' +
    Math.random()
      .toString(16)
      .slice(2, 6)
      .toUpperCase();
}


// =========================================================
// SHEETS
// =========================================================

// ¿La base respondió que la función no existe? (aún no se ha corrido el SQL nuevo)
function yappyFuncionFaltante(err){ return !!err && (err.code === 'PGRST202' || err.code === '42883' || /could not find the function|does not exist/i.test(err.message || '')); }

const Sheets = {

  async initSheet() {
    return true;
  },


  // =======================================================
  // SERVICIOS
  // =======================================================

  async getServicios() {
    await window.AnnlyReady;
    // Se piden en el orden en que se crearon (así las categorías salen en orden de creación);
    // si esa columna no existiera, se piden sin orden.
    let {
      data,
      error
    } = await sbClient
      .from('services')
      .select('*')
      .eq('business_id', BUSINESS_ID)
      .order('creado_en', { ascending: true });
    if (error) {
      ({
        data,
        error
      } = await sbClient
        .from('services')
        .select('*')
        .eq('business_id', BUSINESS_ID));
    }
    if (error || !data) {
      return [];
    }
    return data.map(s => ({

      id: s.id,

      name: s.nombre,

      cat: s.categoria,

      price:
        parseFloat(s.precio) || 0,

      precioTexto:
        s.precio_texto,

      dur:
        s.dur,

      durMin:
        s.dur_min,

      active:
        s.activo,

      esEval:
        s.es_eval,

      requiereAbono:
        s.requiere_abono,

      abonoMonto:
        s.abono_monto,

      abonoTipo:
        s.abono_tipo,

      desc:
        s.descripcion,

      includes:
        s.includes || [],

      imagenUrl:
        s.imagen_url || null,

      esDoble:
        s.es_doble || false

    }));
  },


  // Guarda el catálogo SIN recrear los servicios: cada uno conserva su id, así las
  // asignaciones de profesionales (employee_services) no se pierden al editar.
  async guardarServicios(serviciosArr) {

    await window.AnnlyReady;


    const servicios =
      typeof serviciosArr === 'string'
        ? JSON.parse(serviciosArr)
        : serviciosArr;


    const esUuid = v =>
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
        .test(String(v || ''));

    const nuevoUuid = () =>
      (window.crypto && typeof window.crypto.randomUUID === 'function')
        ? window.crypto.randomUUID()
        : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
            const r = Math.random() * 16 | 0;
            return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
          });

    const armarFila = s => ({

      business_id:
        BUSINESS_ID,

      nombre:
        s.name,

      categoria:
        s.cat,

      precio:
        s.price || 0,

      precio_texto:
        s.precioTexto || null,

      dur:
        s.dur,

      dur_min:
        s.durMin,

      activo:
        s.active,

      es_eval:
        s.esEval || false,

      requiere_abono:
        s.requiereAbono || false,

      abono_monto:
        s.abonoMonto,

      abono_tipo:
        s.abonoTipo,

      descripcion:
        s.desc,

      includes:
        s.includes || [],

      imagen_url:
        s.imagenUrl || null,

      es_doble:
        s.esDoble || false

    });


    const {
      data: existentes
    } = await sbClient
      .from('services')
      .select('id')
      .eq('business_id', BUSINESS_ID);

    const idsExistentes = (existentes || []).map(r => r.id);


    // Respaldo: si los ids de la base no son uuid, se usa el método anterior
    // (borrar todo y volver a insertar) para no arriesgar los servicios.
    if (!idsExistentes.every(esUuid)) {

      await sbClient
        .from('services')
        .delete()
        .eq('business_id', BUSINESS_ID);

      if (!servicios.length) {
        return;
      }

      const {
        error: errLegacy
      } = await sbClient
        .from('services')
        .insert(servicios.map(armarFila));

      if (errLegacy) {
        console.error('Error guardando servicios:', errLegacy);
      }

      return;
    }


    // Servicios nuevos o viejos sin uuid: se les da uno (y se refleja en memoria)
    servicios.forEach(s => {
      if (!esUuid(s.id)) {
        s.id = nuevoUuid();
      }
    });


    // 1) Eliminar los que ya no están en la lista
    const conservados = new Set(servicios.map(s => s.id));

    const aBorrar = idsExistentes.filter(id => !conservados.has(id));

    if (aBorrar.length) {

      const {
        error: errDel
      } = await sbClient
        .from('services')
        .delete()
        .in('id', aBorrar);

      if (errDel) {
        console.error('Error eliminando servicios:', errDel);
      }
    }


    if (!servicios.length) {
      return;
    }


    // 2) Crear o actualizar el resto conservando su id
    const rows =
      servicios.map(s => ({ id: s.id, ...armarFila(s) }));


    const {
      error
    } = await sbClient
      .from('services')
      .upsert(
        rows,
        { onConflict: 'id' }
      );


    if (error) {

      console.error(
        'Error guardando servicios:',
        error
      );
    }
  },


  async subirImagenServicio(file) {

    await window.AnnlyReady;


    const ext =
      (
        file.name
          .split('.')
          .pop() || 'jpg'
      ).toLowerCase();


    const path =
      `${BUSINESS_ID}-svc-${Date.now()}.${ext}`;


    const {
      error: upErr
    } = await sbClient
      .storage
      .from('servicios')
      .upload(
        path,
        file,
        {
          upsert: true
        }
      );


    if (upErr) {
      throw upErr;
    }


    const {
      data
    } =
      sbClient
        .storage
        .from('servicios')
        .getPublicUrl(path);


    return data.publicUrl;
  },


  // =======================================================
  // BLOQUEOS
  // =======================================================

  async getBloqueos() {

    await window.AnnlyReady;


    // Con sucursal (sitio público): solo los bloqueos de esa sucursal
    const locationId = arguments[0] || null;
    let qF = sbClient.from('blocked_dates').select('fecha,motivo').eq('business_id', BUSINESS_ID);
    let qH = sbClient.from('blocked_hours').select('fecha,hora').eq('business_id', BUSINESS_ID);
    // Filas sin sucursal (anteriores a sucursales) aplican a todas por compatibilidad
    if (locationId) {
      const f = 'location_id.eq.' + locationId + ',location_id.is.null';
      qF = qF.or(f); qH = qH.or(f);
    }
    const { data: fechas } = await qF;
    const { data: horas } = await qH;


    const horasObj = {};


    (horas || []).forEach(h => {

      (horasObj[h.fecha] ||= [])
        .push(h.hora);

    });


    return {

      dias:
        (fechas || []).map(f => ({
          fecha: f.fecha,
          motivo: f.motivo
        })),

      horas:
        horasObj
    };
  },


  // Panel admin: todos los bloqueos del negocio con su sucursal (filas planas)
  async getBloqueosDetalle() {
    await window.AnnlyReady;
    const [rF, rH] = await Promise.all([
      sbClient.from('blocked_dates').select('fecha,motivo,location_id').eq('business_id', BUSINESS_ID),
      sbClient.from('blocked_hours').select('fecha,hora,location_id').eq('business_id', BUSINESS_ID)
    ]);
    if (rF.error) throw rF.error;
    if (rH.error) throw rH.error;
    return {
      dias: (rF.data || []).map(f => ({ fecha: f.fecha, motivo: f.motivo, locationId: f.location_id || null })),
      horas: (rH.data || []).map(h => ({ fecha: h.fecha, hora: h.hora, locationId: h.location_id || null }))
    };
  },

  // Reemplaza todos los bloqueos del negocio; cada fila lleva su sucursal
  async guardarBloqueosDetalle(bloqueos) {
    await window.AnnlyReady;
    const dias = (bloqueos.dias || []).map(d => ({
      business_id: BUSINESS_ID, fecha: d.fecha, motivo: d.motivo || 'No disponible', location_id: d.locationId || null
    }));
    const horas = (bloqueos.horas || []).map(h => ({
      business_id: BUSINESS_ID, fecha: h.fecha, hora: h.hora, location_id: h.locationId || null
    }));
    const d1 = await sbClient.from('blocked_dates').delete().eq('business_id', BUSINESS_ID);
    if (d1.error) throw d1.error;
    const d2 = await sbClient.from('blocked_hours').delete().eq('business_id', BUSINESS_ID);
    if (d2.error) throw d2.error;
    if (dias.length) {
      const { error } = await sbClient.from('blocked_dates').insert(dias);
      if (error) throw error;
    }
    if (horas.length) {
      const { error } = await sbClient.from('blocked_hours').insert(horas);
      if (error) throw error;
    }
  },


  async guardarBloqueos(bloqueos) {

    await window.AnnlyReady;


    await sbClient
      .from('blocked_dates')
      .delete()
      .eq('business_id', BUSINESS_ID);


    await sbClient
      .from('blocked_hours')
      .delete()
      .eq('business_id', BUSINESS_ID);


    if (bloqueos.dias?.length) {

      await sbClient
        .from('blocked_dates')
        .insert(
          bloqueos.dias.map(d => ({

            business_id:
              BUSINESS_ID,

            fecha:
              d.fecha,

            motivo:
              d.motivo

          }))
        );
    }


    const filas = [];


    Object.keys(
      bloqueos.horas || {}
    ).forEach(fecha => {

      (
        bloqueos.horas[fecha] || []
      ).forEach(hora => {

        filas.push({

          business_id:
            BUSINESS_ID,

          fecha,

          hora

        });

      });

    });


    if (filas.length) {

      await sbClient
        .from('blocked_hours')
        .insert(filas);
    }
  },


  // =======================================================
  // CITAS
  // =======================================================

  // opts (opcional, lo usa Reprogramar en el panel):
  //   excluirIds: citas que no cuentan como ocupadas (la misma cita que se está moviendo)
  //   locationId: sin profesional, solo cuenta lo ocupado en esa sucursal

  async getHorasOcupadas(fechaStr, empleadoId, opts) {
    await window.AnnlyReady;
    const fechaISO = parseFechaTexto(fechaStr);
    if (!fechaISO || !BUSINESS_ID) return [];
    // Función segura de la base: solo hora, duración y sede (nunca datos del cliente)
    const { data, error } = await sbClient.rpc('agenda_horas_ocupadas', {
      p_business: BUSINESS_ID, p_fecha: fechaISO, p_employee: empleadoId || null
    });
    if (error) { console.error('Error leyendo horarios ocupados:', error); return []; }
    const o = opts || {};
    const excluir = (o.excluirIds || []).map(String);
    return (data || [])
      .filter(c => !excluir.includes(String(c.id)))
      .filter(c => empleadoId || !o.locationId || !c.location_id || c.location_id === o.locationId)
      .map(c => ({ hora: formatHoraSitio(c.hora), duracion: c.duracion_min || 60 }));
  },


  async getCitas() {

    await window.AnnlyReady;


    const {
      data
    } = await sbClient
      .from('appointments')
      .select('*')
      .eq(
        'business_id',
        BUSINESS_ID
      );


    const empleados =
      await this.getEmpleados();


    const mapaEmpleados =
      Object.fromEntries(
        empleados.map(
          e => [e.id, e.nombre]
        )
      );


    return (data || [])
      .map(c => ({

        id:
          c.id,

        nombre:
          c.cliente_nombre,

        telefono:
          c.cliente_telefono,

        servicio:
          c.servicio_nombre,

        fecha:
          isoAFechaTexto(c.fecha),

        hora:
          formatHora12Cita(c.hora),

        duracion:
          c.duracion_min,

        fechaISO:
          c.fecha,

        horaISO:
          c.hora,

        categoria:
          c.categoria,

        precioTotal:
          c.precio_total,

        precioFinal:
          c.precio_final,

        precioEsConsultar:
          c.precio_es_consultar,

        empleadoId:
          c.employee_id,

        locationId:
          c.location_id || null,

        empleadoNombre:
          mapaEmpleados[
            c.employee_id
          ] || null,

        abonoMonto:
          c.abono_monto,

        abonoTipo:
          c.abono_tipo,

        metodoPago:
          c.metodo_pago,

        descuentoCupon:
          c.descuento_cupon,

        descuentoCuponMonto:
          c.descuento_cupon_monto,

        certificadoMonto:
          c.certificado_monto,

        certificadoCodigo:
          c.certificado_codigo,

        comprobante:
          c.comprobante,

        completadaEn:
          c.completada_en || null,

        precioCobrado:
          c.precio_cobrado,

        comisionPct:
          c.comision_pct != null ? Number(c.comision_pct) : null,

        comisionMonto:
          c.comision_monto != null ? Number(c.comision_monto) : null,

        correo:
          c.cliente_correo,

        nota:
          c.nota,

        cuponAplicado:
          c.cupon_aplicado,

        certificadoSaldoRestante:
          c.certificado_saldo_restante != null
            ? Number(c.certificado_saldo_restante)
            : null,

        ajusteDetalle:
          c.ajuste_detalle || '',

        certificadoMotivoNoAplicado:
          c.certificado_no_aplicado_motivo || '',

        creadoEn:
          c.creado_en || '',

        estado:
          c.estado,

        cancelacionMotivo:
          c.cancelacion_motivo || '',

        canceladaEn:
          c.cancelada_en || null,

        grupoCitaId:
          c.grupo_cita_id || null,

        grupoPrincipal:
          !!c.grupo_principal

      }));
  },


  async guardarCita(cita) {
    const [id] = await this._insertarCitas([cita]);
    return id;
  },
  // Inserta una o varias citas en UNA sola operación: o se guardan todas o ninguna.
  // La base rechaza la operación completa si alguna choca con otra cita (HORARIO_OCUPADO).
  async _insertarCitas(citas) {
    await window.AnnlyReady;

    // El saldo que le queda al certificado tras esta cita se guarda en la propia cita
    // (así aparece en los correos y en el detalle). Si esa columna aún no existe en
    // la base, se reintenta sin ella para no romper la reserva.
    const armarFila = (cita, conSaldo) => ({

        business_id:
          BUSINESS_ID,

        employee_id:
          cita.empleadoId || null,

        cliente_nombre:
          cita.nombre,

        cliente_telefono:
          cita.telefono,

        cliente_correo:
          cita.correo,

        nota:
          cita.nota,

        servicio_nombre:
          cita.servicio,

        categoria:
          cita.categoria,

        precio_total:
          cita.precioTotal,

        precio_es_consultar:
          cita.precioEsConsultar,

        fecha:
          parseFechaTexto(cita.fecha),

        hora:
          cita.hora,

        duracion_min:
          cita.duracionMin,

        comprobante:
          cita.comprobante,

        abono_monto:
          cita.abonoMonto,

        abono_tipo:
          cita.abonoTipo,

        metodo_pago:
          cita.metodoPago,

        // Sucursal donde se reservó (sin dato, la base asigna la Principal)
        ...((cita.locationId || window.ANNLY_SUCURSAL_ID) ? { location_id: cita.locationId || window.ANNLY_SUCURSAL_ID } : {}),

        cupon_aplicado:
          cita.cuponUsado,

        descuento_cupon:
          cita.descuentoCupon,

        // Descuento en dólares del cupón (solo se manda si hay, así la reserva no falla si la columna aún no existe)
        ...(Number(cita.descuentoCuponMonto) > 0 ? { descuento_cupon_monto: Number(cita.descuentoCuponMonto) } : {}),

        precio_final:
          cita.precioFinal,

        certificado_codigo:
          cita.certificadoCodigo || null,

        certificado_monto:
          cita.certificadoMonto || null,

        ...(
          conSaldo && cita.certificadoSaldoRestante != null
            ? { certificado_saldo_restante: cita.certificadoSaldoRestante }
            : {}
        ),

        cita_id_externo:
          cita.citaId,

        // Abono pagado a mano (número + comprobante): queda por confirmar hasta que el
        // negocio revise el pago. Con el botón real de Yappy o sin abono: confirmada.
        estado:
          cita.abonoPorConfirmar ? 'por_confirmar' : 'confirmada',

        ...(
          cita.grupoCitaId
            ? { grupo_cita_id: cita.grupoCitaId, grupo_principal: !!cita.grupoPrincipal }
            : {}
        )

    });

    // Los id se generan aquí: quien reserva sin sesión ya no puede leer la cita después de crearla
    const ids = citas.map(() => nuevoUUID());
    const insertar = (conSaldo) =>
      sbClient
        .from('appointments')
        .insert(citas.map((c, n) => ({ id: ids[n], ...armarFila(c, conSaldo) })));
    let { error } = await insertar(true);
    if (
      error &&
      /certificado_saldo_restante/.test(error.message || '')
    ) {
      ({ error } = await insertar(false));
    }
    if (error) {
      console.error(
        'Error guardando la cita:',
        error
      );
      throw error;
    }
    return ids;
  },
  // Cita doble: guarda las 2 citas (una por profesional/clienta) amarradas con el mismo
  // grupo_cita_id, en UNA sola operación: si una choca con otra cita, no se guarda ninguna.
  // citaPrincipal lleva el abono/comprobante de la reserva.
  async guardarCitaDoble(citaPrincipal, citaSecundaria) {
    const grupoCitaId = nuevoUUID();
    const [idPrincipal, idSecundaria] = await this._insertarCitas([
      { ...citaPrincipal, grupoCitaId, grupoPrincipal: true },
      { ...citaSecundaria, grupoCitaId, grupoPrincipal: false }
    ]);
    return { idPrincipal, idSecundaria, grupoCitaId };
  },

  // Trae la cita pareja de una cita doble (o null si no tiene)
  async getCitaPareja(citaId) {
    await window.AnnlyReady;
    const { data: actual } = await sbClient.from('appointments').select('grupo_cita_id')
      .eq('id', citaId).eq('business_id', BUSINESS_ID).maybeSingle();
    if (!actual || !actual.grupo_cita_id) return null;
    const { data: pareja } = await sbClient.from('appointments').select('id, cliente_nombre, employee_id')
      .eq('business_id', BUSINESS_ID).eq('grupo_cita_id', actual.grupo_cita_id).neq('id', citaId).maybeSingle();
    return pareja ? { id: pareja.id, clienteNombre: pareja.cliente_nombre, employeeId: pareja.employee_id } : null;
  },

  async reprogramarCita(
    id,
    fechaISO,
    hora
  ) {

    await window.AnnlyReady;

    // Si es parte de una cita doble, se reprograman las 2 juntas — nunca por separado.
    const { data: actual } = await sbClient.from('appointments').select('grupo_cita_id')
      .eq('id', id).eq('business_id', BUSINESS_ID).maybeSingle();

    const base = sbClient.from('appointments').update({ fecha: fechaISO, hora }).eq('business_id', BUSINESS_ID);
    const {
      error
    } = (actual && actual.grupo_cita_id)
      ? await base.eq('grupo_cita_id', actual.grupo_cita_id)
      : await base.eq('id', id);


    if (error) {

      console.error(
        'Error reprogramando la cita:',
        error
      );

      throw error;
    }
  },


  // Caso sugerido al cancelar, según las horas que faltan para la cita y la política del negocio
  // → { caso: 'a_tiempo'|'tarde'|'no_show', horasFaltan, horasAviso }
  async sugerirCasoCancelacion(fechaISO, hora) {
    const aj = await this.getAjustesFinanzas();
    const [h, m] = String(hora || '0:00').split(':').map(n => parseInt(n, 10) || 0);
    const inicio = new Date(fechaISO + 'T00:00:00');
    inicio.setHours(h, m, 0, 0);
    const horasFaltan = (inicio.getTime() - Date.now()) / 3600000;
    const caso = horasFaltan < 0 ? 'no_show' : (horasFaltan >= aj.horasAviso ? 'a_tiempo' : 'tarde');
    return { caso, horasFaltan, horasAviso: aj.horasAviso, creditoVigencia: aj.creditoVigencia };
  },

  async _codigoCertificadoUnico(prefijo = 'CERT') {
    for (let i = 0; i < 6; i++) {
      const codigo = prefijo + '-' + Math.random().toString(16).slice(2, 6).toUpperCase() + Math.random().toString(16).slice(2, 4).toUpperCase();
      const { data: existe } = await sbClient.from('gift_certificates').select('id').eq('business_id', BUSINESS_ID).eq('codigo', codigo).maybeSingle();
      if (!existe) return codigo;
    }
    throw new Error('No se pudo generar un código único.');
  },

  // Cancela aplicando la política (documento "Reglas de negocio para políticas", sección 3):
  // opciones = { caso: 'a_tiempo'|'tarde'|'no_show'|'negocio'|'abono_rechazado', abonoDestino?: 'credito'|'reembolso' (solo 'negocio'), reembolsoMetodo? }
  //  - Certificado: siempre se devuelve al saldo lo descontado (la Cortesía se pierde si no se presentó).
  //  - Abono: a_tiempo → crédito · tarde/no_show → penalidad · abono_rechazado → nada (no hubo dinero).
  //  - Si el NEGOCIO no puede atender, lo normal es REPROGRAMAR (no pasa por aquí). Solo si el cliente
  //    no acepta otra fecha se cancela con 'negocio', y el dueño elige EXPRESAMENTE: saldo a favor o
  //    devolver el dinero (queda en la bitácora con su motivo).
  //  - Crédito y penalidad entran como ingreso hoy; el reembolso queda en la bitácora.
  async cancelarConPolitica(id, motivo, opciones, detalle) {
    await window.AnnlyReady;
    const caso = opciones && opciones.caso;
    if (!['a_tiempo', 'tarde', 'no_show', 'negocio', 'abono_rechazado'].includes(caso)) throw new Error('Elige el caso de la cancelación.');
    if (caso === 'negocio' && !['credito', 'reembolso'].includes(opciones.abonoDestino)) {
      throw new Error('Si el negocio no puede atender, primero ofrece reprogramar. Si el cliente no acepta, elige saldo a favor o devolver el dinero.');
    }
    if (!motivo || !motivo.trim()) throw new Error('Indica el motivo de la cancelación.');

    const { data: actual, error: errA } = await sbClient.from('appointments').select('*').eq('id', id).eq('business_id', BUSINESS_ID).maybeSingle();
    if (errA) throw errA;
    if (!actual) throw new Error('La cita no existe.');
    if (actual.estado === 'cancelada') throw new Error('Esta cita ya estaba cancelada.');
    if (actual.completada_en) throw new Error('Esta cita ya fue completada; no se puede cancelar.');
    let filas = [actual];
    if (actual.grupo_cita_id) {
      const { data: par } = await sbClient.from('appointments').select('*').eq('business_id', BUSINESS_ID).eq('grupo_cita_id', actual.grupo_cita_id);
      if (par && par.length) filas = par;
    }
    const principal = filas.find(f => f.grupo_principal) || filas[0];
    const aj = await this.getAjustesFinanzas();
    const hoy = this._hoyISO();
    const r2 = n => Math.round(n * 100) / 100;

    // 1) Certificados: se devuelve al saldo lo que se había descontado en cada cita
    const devuelto = {};
    for (const f of filas) {
      const monto = Number(f.certificado_monto || 0);
      if (!f.certificado_codigo || !(monto > 0)) continue;
      const { data: cert } = await sbClient.from('gift_certificates').select('*')
        .eq('business_id', BUSINESS_ID).eq('codigo', String(f.certificado_codigo).toUpperCase()).maybeSingle();
      if (!cert) continue;
      if (cert.tipo === 'cortesia' && caso === 'no_show') continue; // la cortesía se pierde si no se presentó
      const nuevo = r2(Math.min(Number(cert.monto_inicial), Number(cert.saldo_restante) + monto));
      const cambios = { saldo_restante: nuevo };
      if (cert.estado !== 'cancelado' && cert.estado !== 'pendiente_pago') cambios.estado = 'activo';
      const { error: errC } = await sbClient.from('gift_certificates').update(cambios).eq('id', cert.id);
      if (errC) throw errC;
      const filaCanje = { certificate_id: cert.id, business_id: BUSINESS_ID, appointment_id: f.id, monto_aplicado: -monto, saldo_despues: nuevo };
      let { error: errR } = await sbClient.from('gift_certificate_redemptions').insert([filaCanje]);
      if (errR) console.error('No se pudo registrar la devolución en el historial del certificado:', errR);
      devuelto[f.id] = monto;
    }

    // 2) Abono (en citas dobles vive en la cita principal)
    // Abono rechazado: el dinero nunca llegó, así que no hay saldo a favor, penalidad ni reembolso
    const abono = caso === 'abono_rechazado' ? 0 : r2(Number(principal.abono_monto || 0));
    const metodoAbono = principal.metodo_pago === 'yappy' ? 'yappy' : 'transferencia';
    let destino = null, creditoCodigo = null, creditoVence = null;
    if (abono > 0) {
      destino = caso === 'a_tiempo' ? 'credito' : (caso === 'negocio' ? (opciones.abonoDestino === 'reembolso' ? 'reembolso' : 'credito') : 'penalidad');
      const concepto = principal.servicio_nombre || 'servicio';

      if (destino === 'credito') {
        creditoCodigo = await this._codigoCertificadoUnico('CRED');
        const vence = new Date(hoy + 'T00:00:00'); vence.setDate(vence.getDate() + (aj.creditoVigencia || 30));
        creditoVence = vence.getFullYear() + '-' + String(vence.getMonth() + 1).padStart(2, '0') + '-' + String(vence.getDate()).padStart(2, '0');
        const { data: cred, error: errCred } = await sbClient.from('gift_certificates').insert([{
          business_id: BUSINESS_ID, codigo: creditoCodigo, tipo: 'credito', estado: 'activo',
          monto_inicial: abono, saldo_restante: abono,
          comprador_nombre: principal.cliente_nombre || null, comprador_telefono: principal.cliente_telefono || null, comprador_correo: principal.cliente_correo || null,
          destinatario_nombre: principal.cliente_nombre || null, destinatario_telefono: principal.cliente_telefono || null, destinatario_correo: principal.cliente_correo || null,
          nota: `Saldo a favor por la cita cancelada del ${this._fmtFechaCorta(principal.fecha)} (${concepto})`,
          fecha_vencimiento: creditoVence
        }]).select('id').single();
        if (errCred) throw errCred;
        const { error: errP } = await sbClient.from('finance_payments').insert([{
          business_id: BUSINESS_ID, origen: 'credito', estado: 'confirmado', metodo: metodoAbono, monto: abono, fecha: hoy,
          concepto: `Saldo a favor por cancelación — ${concepto}`, cliente_nombre: principal.cliente_nombre || null,
          employee_id: principal.employee_id || null, referencia: creditoCodigo, location_id: principal.location_id || null
        }]);
        if (errP) console.error('Se creó el crédito, pero no se pudo registrar en Finanzas:', errP);
      } else if (destino === 'penalidad') {
        const { error: errP } = await sbClient.from('finance_payments').insert([{
          business_id: BUSINESS_ID, origen: 'penalidad', estado: 'confirmado', metodo: metodoAbono, monto: abono, fecha: hoy,
          concepto: `Penalidad por ${caso === 'no_show' ? 'no presentarse' : 'cancelación tardía'} — ${concepto}`,
          cliente_nombre: principal.cliente_nombre || null, employee_id: principal.employee_id || null,
          referencia: principal.comprobante || null, location_id: principal.location_id || null
        }]);
        if (errP) throw errP;
      }
      // reembolso: no es ingreso; queda en la bitácora (abajo)
    }

    // 3) La cita (y su pareja) queda cancelada con lo que pasó — el correo de cancelación lo lee de aquí
    const ahora = new Date().toISOString();
    for (const f of filas) {
      const base = { estado: 'cancelada' };
      const completo = {
        ...base, cancelacion_motivo: motivo.trim(), cancelada_en: ahora, cancelacion_caso: caso,
        certificado_devuelto: devuelto[f.id] || 0,
        ...(f.id === principal.id && abono > 0 ? {
          abono_destino: destino, credito_codigo: creditoCodigo, credito_vence: creditoVence,
          reembolso_metodo: destino === 'reembolso' ? (opciones.reembolsoMetodo || metodoAbono) : null
        } : {})
      };
      let { error } = await sbClient.from('appointments').update(completo).eq('id', f.id).eq('business_id', BUSINESS_ID);
      if (error) {
        console.error('Faltan columnas de cancelación (¿corriste el SQL?). Se cancela igual:', error);
        ({ error } = await sbClient.from('appointments').update(base).eq('id', f.id).eq('business_id', BUSINESS_ID));
      }
      if (error) throw error;
      await this.registrarAccion({ entidad: 'cita', entidadId: f.id, accion: 'cancelada', motivo: motivo.trim(), monto: f.id === principal.id ? abono : null,
        detalle: { ...(detalle || {}), caso, abonoDestino: destino, creditoCodigo, certificadoDevuelto: devuelto[f.id] || 0 } });
    }
    if (destino === 'reembolso') {
      await this.registrarAccion({ entidad: 'reembolso', entidadId: principal.id, accion: 'reembolso_abono', motivo: motivo.trim(), monto: abono,
        detalle: { metodo: opciones.reembolsoMetodo || metodoAbono, cliente: principal.cliente_nombre } });
    }
    return { caso, abono, destino, creditoCodigo, creditoVence, certificadoDevuelto: Object.values(devuelto).reduce((a, b) => a + b, 0) };
  },

  // El negocio revisó el comprobante y el abono sí llegó: la cita (y su pareja si es doble)
  // pasa a confirmada. El webhook de correos manda entonces la confirmación al cliente.
  async confirmarAbonoCita(id) {
    await window.AnnlyReady;
    const { data: c, error } = await sbClient.from('appointments').select('id, grupo_cita_id, estado').eq('id', id).eq('business_id', BUSINESS_ID).maybeSingle();
    if (error) throw error;
    if (!c) throw new Error('La cita no existe.');
    if (c.estado !== 'por_confirmar') throw new Error('Esta cita ya no está por confirmar.');
    let q = sbClient.from('appointments').update({ estado: 'confirmada', abono_confirmado_en: new Date().toISOString() }).eq('business_id', BUSINESS_ID);
    q = c.grupo_cita_id ? q.eq('grupo_cita_id', c.grupo_cita_id) : q.eq('id', id);
    let { error: errU } = await q;
    if (errU) {
      // Sin la columna abono_confirmado_en (SQL pendiente) se confirma igual
      let q2 = sbClient.from('appointments').update({ estado: 'confirmada' }).eq('business_id', BUSINESS_ID);
      q2 = c.grupo_cita_id ? q2.eq('grupo_cita_id', c.grupo_cita_id) : q2.eq('id', id);
      ({ error: errU } = await q2);
    }
    if (errU) throw errU;
    await this.registrarAccion({ entidad: 'cita', entidadId: id, accion: 'abono_confirmado', motivo: 'Abono verificado por el negocio' });
  },

  // El abono no llegó: la cita se cancela sin penalidad ni saldo a favor (no hubo dinero),
  // y el certificado aplicado vuelve a su saldo.
  async rechazarAbonoCita(id, motivo) {
    return this.cancelarConPolitica(id, motivo, { caso: 'abono_rechazado' }, { tipo: 'abono_rechazado' });
  },

  async cancelarCita(id, motivo, detalle) {
    await window.AnnlyReady;

    // Si es parte de una cita doble, se cancelan las 2 juntas — siempre, sin excepción.
    const { data: actual } = await sbClient.from('appointments').select('grupo_cita_id')
      .eq('id', id).eq('business_id', BUSINESS_ID).maybeSingle();
    let ids = [id];
    if (actual && actual.grupo_cita_id) {
      const { data: pareja } = await sbClient.from('appointments').select('id')
        .eq('business_id', BUSINESS_ID).eq('grupo_cita_id', actual.grupo_cita_id);
      if (pareja && pareja.length) ids = pareja.map(p => p.id);
    }

    const base = { estado: 'cancelada' };
    const conMotivo = motivo ? { ...base, cancelacion_motivo: motivo, cancelada_en: new Date().toISOString() } : base;
    let { error } = await sbClient.from('appointments').update(conMotivo).in('id', ids).eq('business_id', BUSINESS_ID);
    if (error && motivo) {
      // Si las columnas del motivo aún no existen, se cancela igual (el motivo queda en la bitácora)
      ({ error } = await sbClient.from('appointments').update(base).in('id', ids).eq('business_id', BUSINESS_ID));
    }
    if (error) {
      console.error('Error cancelando la cita:', error);
      throw error;
    }
    if (motivo) {
      for (const cid of ids) {
        await this.registrarAccion({ entidad: 'cita', entidadId: cid, accion: 'cancelada', motivo, monto: null, detalle });
      }
    }
  },


  // =======================================================
  // PROMO
  // =======================================================

  async getPromo() {

    await window.AnnlyReady;


    const {
      data
    } = await sbClient
      .from('promo_banner')
      .select('*')
      .eq(
        'business_id',
        BUSINESS_ID
      )
      .maybeSingle();


    if (!data) {
      return {
        activa: false
      };
    }


    return {

      activa:
        data.activa,

      tema:
        data.tema,

      etiqueta:
        data.etiqueta,

      festejo:
        data.festejo,

      servicio:
        data.servicio,

      precioNormal:
        data.precio_normal,

      precioPromo:
        data.precio_promo,

      vigencia:
        data.vigencia

    };
  },


  async guardarPromo(promo) {

    await window.AnnlyReady;


    await sbClient
      .from('promo_banner')
      .upsert({

        business_id:
          BUSINESS_ID,

        activa:
          promo.activa,

        tema:
          promo.tema,

        etiqueta:
          promo.etiqueta,

        festejo:
          promo.festejo,

        servicio:
          promo.servicio,

        precio_normal:
          promo.precioNormal || null,

        precio_promo:
          promo.precioPromo || null,

        vigencia:
          promo.vigencia

      });
  },


  // =======================================================
  // RULETA
  // =======================================================

  async getRuletaConfig() {
    await window.AnnlyReady;

    // Interruptor y regla de la ruleta. Si la base aún no tiene las columnas nuevas, se lee solo el interruptor.
    let { data: feat, error: errFeat } = await sbClient
      .from('business_features')
      .select('ruleta_premios, ruleta_modo, ruleta_desde, ruleta_hasta, ruleta_titulo, ruleta_cumple, ruleta_vigencia_dias')
      .eq('business_id', BUSINESS_ID)
      .maybeSingle();
    if (errFeat) {
      const r0 = await sbClient.from('business_features').select('ruleta_premios').eq('business_id', BUSINESS_ID).maybeSingle();
      feat = r0.data;
    }

    // Los premios quitados de la lista (archivados) no se muestran. Si la base aún no tiene
    // esa columna, se leen todos para no romper la pantalla.
    let { data: premios, error } = await sbClient
      .from('roulette_prizes')
      .select('*')
      .eq('business_id', BUSINESS_ID)
      .eq('archivado', false)
      .order('id');
    if (error) {
      const r = await sbClient.from('roulette_prizes').select('*').eq('business_id', BUSINESS_ID).order('id');
      premios = r.data;
    }

    return {
      activa: !!(feat && feat.ruleta_premios),
      modo: (feat && feat.ruleta_modo) || 'siempre',
      desde: (feat && feat.ruleta_desde) || '',
      hasta: (feat && feat.ruleta_hasta) || '',
      titulo: (feat && feat.ruleta_titulo) || '',
      cumple: (feat && feat.ruleta_cumple) || 'mes',
      vigencia: (feat && feat.ruleta_vigencia_dias != null) ? feat.ruleta_vigencia_dias : 30,
      premios: (premios || []).map(p => ({
        id: p.id,
        premio: p.nombre,
        probabilidad: p.probabilidad,
        activo: p.activo,
        stock: p.stock,
        tipo: p.tipo || 'otro',
        valor: p.valor
      }))
    };
  },


  // Guarda interruptor y premios en una sola operación de la base (todo o nada).
  // Lanza un error con un mensaje claro si algo falla.
  async guardarRuletaConfig(payload) {
    await window.AnnlyReady;
    const lista = (payload.premios || []).map(p => ({
      id: p.id || null,
      nombre: p.premio,
      probabilidad: p.probabilidad,
      activo: !!p.activo,
      stock: (p.stock === null || p.stock === undefined || p.stock === '') ? null : p.stock,
      tipo: p.tipo || 'otro',
      valor: (p.tipo && p.tipo !== 'otro') ? p.valor : null
    }));
    const { data, error } = await sbClient.rpc('ruleta_guardar', {
      p_business: BUSINESS_ID, p_activa: !!payload.activa, p_premios: lista,
      p_config: {
        modo: payload.modo || 'siempre',
        desde: payload.desde || '',
        hasta: payload.hasta || '',
        titulo: payload.titulo || '',
        cumple: payload.cumple || 'mes',
        vigencia: (payload.vigencia === '' || payload.vigencia == null) ? 30 : payload.vigencia
      }
    });
    if (error) {
      console.error('Error guardando la ruleta:', error);
      if (/ruleta_guardar/.test(error.message || '') && /function|schema cache/i.test(error.message || '')) {
        throw new Error('Falta actualizar la base de datos de la ruleta (ruleta.sql). Avísale a soporte.');
      }
      throw new Error(error.message || 'No se pudo guardar la ruleta.');
    }
    return data;
  },


  // Ganadores de la ruleta (el dueño y el Platform Admin pueden verlos)
  async getGanadoresRuleta() {
    await window.AnnlyReady;
    const { data, error } = await sbClient
      .from('roulette_wins')
      .select('id, nombre, telefono, codigo_cupon, usado, ganado_en, roulette_prizes(nombre)')
      .eq('business_id', BUSINESS_ID)
      .order('ganado_en', { ascending: false })
      .limit(200);
    if (error) { console.error('Error leyendo los ganadores:', error); throw error; }
    return (data || []).map(w => ({
      id: w.id,
      nombre: w.nombre || '',
      telefono: w.telefono || '',
      codigo: w.codigo_cupon || '',
      usado: !!w.usado,
      fecha: w.ganado_en,
      premio: (w.roulette_prizes && w.roulette_prizes.nombre) || ''
    }));
  },

  async marcarGanadorRuleta(id, usado) {
    await window.AnnlyReady;
    const { error } = await sbClient.from('roulette_wins').update({ usado: !!usado }).eq('id', id).eq('business_id', BUSINESS_ID);
    if (error) { console.error('Error marcando el premio:', error); throw error; }
  },



  async verificarElegibilidadRuleta(tel) {
    await window.AnnlyReady;
    const { data, error } = await sbClient.rpc('ruleta_elegible', { p_business: BUSINESS_ID, p_telefono: tel });
    if (error) { console.error('Error verificando la ruleta:', error); return { elegible: false }; }
    return { elegible: !!data };
  },



  async girarRuleta(identificador, nombre, citaId) {
    await window.AnnlyReady;
    // El premio se sortea en la base. Se manda el id de la cita recién guardada para comprobar la reserva.
    const esUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(citaId || ''));
    const args = { p_business: BUSINESS_ID, p_telefono: identificador, p_nombre: nombre };
    if (esUuid) args.p_cita = citaId;
    const { data, error } = await sbClient.rpc('ruleta_girar', args);
    if (error) { console.error('Error girando la ruleta:', error); return { ok: false, motivo: 'error' }; }
    return data || { ok: false, motivo: 'error' };
  },



  async validarCupon(codigo, telefono) {
    await window.AnnlyReady;
    const cod = (codigo || '').toUpperCase().trim();
    if (!cod) return { valido: false, motivo: 'codigo_vacio' };
    const args = { p_business: BUSINESS_ID, p_codigo: cod };
    if (telefono) args.p_telefono = telefono;
    const { data, error } = await sbClient.rpc('cupon_validar', args);
    if (error || !data) {
      if (error) console.error('Error validando el cupón:', error);
      return { valido: false, motivo: 'codigo_no_encontrado' };
    }
    if (!data.valido) return data;
    const nombre = data.premio || '';
    // La base dice el tipo del premio. Si responde la versión anterior (sin tipo), se deduce del nombre.
    let tipo = data.tipo, valor = Number(data.valor) || 0;
    if (!tipo) {
      const pctMatch = nombre.match(/(\d+(?:\.\d+)?)\s*%/);
      const monMatch = nombre.match(/\$\s*(\d+(?:\.\d+)?)/);
      if (pctMatch) { tipo = 'porcentaje'; valor = parseFloat(pctMatch[1]); }
      else if (monMatch) { tipo = 'monto'; valor = parseFloat(monMatch[1]); }
      else tipo = 'otro';
    }
    return { valido: true, tipo, valor, premio: nombre, venceEn: data.venceEn || null };
  },



  async marcarCuponCanjeado(codigo, telefono) {
    await window.AnnlyReady;
    const args = { p_business: BUSINESS_ID, p_codigo: codigo || '' };
    if (telefono) args.p_telefono = telefono;
    const { error } = await sbClient.rpc('cupon_marcar_usado', args);
    if (error) console.error('Error marcando el cupón como usado:', error);
    return { ok: !error };
  },


  // =======================================================
  // CLIENTAS
  // =======================================================

  async getClientas() {

    await window.AnnlyReady;


    const {
      data
    } = await sbClient
      .from('clients')
      .select('*')
      .eq(
        'business_id',
        BUSINESS_ID
      );


    return (data || [])
      .map(c => ({

        nombre:
          c.nombre,

        telefono:
          c.telefono,

        correo:
          c.email,

        notas:
          c.notas,

        id: c.id,
        aceptaPromos: !!c.acepta_promos,
        cumpleDia: c.cumple_dia || null,
        cumpleMes: c.cumple_mes || null,
        origen: c.origen || null,
        inscritoEn: c.inscrito_en || null

      }));
  },


  // Guarda un solo cliente (sin tocar a los demás). Con id actualiza; sin id crea.
  async guardarClienta(c) {
    await window.AnnlyReady;
    const datos = { nombre: c.nombre, telefono: c.telefono, email: c.correo || null, notas: c.notas || null };
    // El cumpleaños solo se envía si se usa (así guardar no depende de las columnas nuevas)
    if (c.cumpleDia || c.cumpleMes || c.tieneCumple) { datos.cumple_dia = c.cumpleDia || null; datos.cumple_mes = c.cumpleMes || null; }
    if (c.id) {
      const { error } = await sbClient.from('clients').update(datos).eq('id', c.id).eq('business_id', BUSINESS_ID);
      if (error) throw error;
      return;
    }
    const { error } = await sbClient.from('clients').insert([{ ...datos, business_id: BUSINESS_ID }]);
    if (error) throw error;
  },

  async eliminarClienta(id) {
    await window.AnnlyReady;
    const { error } = await sbClient.from('clients').delete().eq('id', id).eq('business_id', BUSINESS_ID);
    if (error) throw error;
  },

  // Un módulo que se cotiza aparte (Agente AI): avisa a soporte@annly.app para saber quién está interesado
  async consultarModulo(modulo, mensaje) {
    await window.AnnlyReady;
    const { data: ses } = await sbClient.auth.getSession();
    if (!ses || !ses.session) throw new Error('Inicia sesión de nuevo.');
    const resp = await fetch(`${SUPABASE_URL}/functions/v1/consulta-modulo`, {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + ses.session.access_token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ businessId: BUSINESS_ID, modulo, mensaje: mensaje || '' })
    });
    if (!resp.ok) throw new Error('No se pudo enviar tu consulta. Intenta de nuevo.');
    return true;
  },

  // Agenda pública: ¿se muestra el botón para inscribirse?
  async inscripcionClientesActiva() {
    await window.AnnlyReady;
    if (!BUSINESS_ID) return false;
    const { data, error } = await sbClient.rpc('inscripcion_clientes_activa', { p_business: BUSINESS_ID });
    if (error) { console.error('Inscripción de clientes:', error); return false; }
    return data === true;
  },

  async inscribirCliente(d) {
    await window.AnnlyReady;
    const { data, error } = await sbClient.rpc('inscribir_cliente', {
      p_business: BUSINESS_ID, p_nombre: d.nombre, p_telefono: d.telefono, p_correo: d.correo || null,
      p_cumple_dia: d.cumpleDia || null, p_cumple_mes: d.cumpleMes || null, p_acepta: !!d.acepta
    });
    if (error) throw error;
    return data;
  },


  async guardarClientas(clientasArr) {

    await window.AnnlyReady;


    const clientas =
      typeof clientasArr === 'string'
        ? JSON.parse(clientasArr)
        : clientasArr;


    await sbClient
      .from('clients')
      .delete()
      .eq(
        'business_id',
        BUSINESS_ID
      );


    if (!clientas.length) {
      return;
    }


    await sbClient
      .from('clients')
      .insert(

        clientas.map(c => ({

          business_id:
            BUSINESS_ID,

          nombre:
            c.nombre,

          telefono:
            c.telefono,

          email:
            c.correo,

          notas:
            c.notas

        }))

      );
  },



  async upsertClienteDesdeReserva(nombre, telefono, correo) {
    await window.AnnlyReady;
    if (!telefono) return;
    // Función segura de la base: el público ya no lee ni escribe la tabla de clientes
    const { error } = await sbClient.rpc('agenda_upsert_cliente', {
      p_business: BUSINESS_ID, p_nombre: nombre, p_telefono: telefono, p_correo: correo || null
    });
    if (error) console.error('Error guardando el cliente:', error);
  },


  // =======================================================
  // EQUIPO / EMPLEADOS
  // =======================================================

  LIMITE_EMPLEADOS_POR_PLAN: {

    trial: 1,

    basic: 1,

    medium: 2,

    ultimate: 3

  },


  async getEmpleados() {

    await window.AnnlyReady;


    const {
      data,
      error
    } = await sbClient
      .from('employees')
      .select('*')
      .eq(
        'business_id',
        BUSINESS_ID
      )
      .order(
        'creado_en'
      );


    if (error) {

      console.error(
        'Error leyendo empleados:',
        error
      );

      return [];
    }


    return (data || [])
      .map(e => ({

        id:
          e.id,

        nombre:
          e.nombre,

        telefono:
          e.telefono,

        correo:
          e.correo,

        fotoUrl:
          e.foto_url,

        activo:
          e.activo,

        comisionGlobal:
          e.comision_global != null ? Number(e.comision_global) : null,

        bio:
          e.bio || '',

        esDueno:
          e.es_dueno || false

      }));
  },


  // Garantiza que el dueño exista como empleado y que su ficha traiga los datos
  // con los que se inscribió (correo de su cuenta y WhatsApp del negocio). Solo
  // completa campos vacíos: nunca pisa lo que el dueño ya editó.
  async asegurarEmpleadoDueno() {

    await window.AnnlyReady;

    const biz = window.ANNLY_BUSINESS || {};

    // Teléfono: el WhatsApp del registro (guardado como 507 + número)
    let telefonoDueno = (biz.whatsapp || '').replace(/\D/g, '');
    if (telefonoDueno.startsWith('507') && telefonoDueno.length > 8) {
      telefonoDueno = telefonoDueno.substring(3);
    }

    // Correo y nombre de la cuenta: solo si quien está en el panel ES el dueño
    // (un Platform Admin viendo otro negocio no debe cargar su propio correo).
    let correoDueno = null;
    let nombreCuenta = null;

    if (!window.ANNLY_PLATFORM_ADMIN) {
      try {
        const { data } = await sbClient.auth.getUser();
        const u = data && data.user;
        correoDueno = (u && u.email) || null;
        nombreCuenta = (u && u.user_metadata && (u.user_metadata.full_name || u.user_metadata.name)) || null;
      } catch (e) {}
    }

    const { data: duenos } = await sbClient
      .from('employees')
      .select('id, telefono, correo')
      .eq('business_id', BUSINESS_ID)
      .eq('es_dueno', true)
      .limit(1);

    if (duenos && duenos.length) {

      const d = duenos[0];
      const cambios = {};

      if (!d.telefono && telefonoDueno) cambios.telefono = telefonoDueno;
      if (!d.correo && correoDueno) cambios.correo = correoDueno;

      if (Object.keys(cambios).length) {
        await sbClient.from('employees').update(cambios).eq('id', d.id);
      }

      return;
    }

    // Sin fila de dueño: si ya hay empleados (negocios viejos) no se toca nada.
    const { count } = await sbClient
      .from('employees')
      .select('id', { count: 'exact', head: true })
      .eq('business_id', BUSINESS_ID);

    if (count && count > 0) {
      return;
    }

    await sbClient
      .from('employees')
      .insert([{
        business_id: BUSINESS_ID,
        nombre: nombreCuenta || biz.nombre || 'Dueño/a',
        telefono: telefonoDueno || null,
        correo: correoDueno,
        activo: true,
        es_dueno: true
      }]);
  },


  async guardarEmpleado(empleado) {

    await window.AnnlyReady;


    const row = {

      business_id:
        BUSINESS_ID,

      nombre:
        empleado.nombre,

      telefono:
        empleado.telefono || null,

      correo:
        empleado.correo || null,

      foto_url:
        empleado.fotoUrl || null,

      bio:
        (empleado.bio || '').trim() || null,

      activo:
        empleado.activo !== false,

      comision_global:
        empleado.comisionGlobal != null ? Number(empleado.comisionGlobal) : null

    };


    if (empleado.id) {

      const {
        error
      } = await sbClient
        .from('employees')
        .update(row)
        .eq(
          'id',
          empleado.id
        );


      if (error) {
        throw error;
      }


      return empleado.id;

    } else {

      const {
        data,
        error
      } = await sbClient
        .from('employees')
        .insert([row])
        .select()
        .single();


      if (error) {
        throw error;
      }


      return data.id;
    }
  },


  async eliminarEmpleado(id) {

    await window.AnnlyReady;


    const {
      error
    } = await sbClient
      .from('employees')
      .delete()
      .eq(
        'id',
        id
      );


    if (error) {
      throw error;
    }
  },


  async subirFotoEmpleado(file) {

    await window.AnnlyReady;


    const ext =
      (
        file.name
          .split('.')
          .pop() || 'jpg'
      ).toLowerCase();


    const path =
      `${BUSINESS_ID}-emp-${Date.now()}.${ext}`;


    const {
      error: upErr
    } = await sbClient
      .storage
      .from('servicios')
      .upload(
        path,
        file,
        {
          upsert: true
        }
      );


    if (upErr) {
      throw upErr;
    }


    const {
      data
    } =
      sbClient
        .storage
        .from('servicios')
        .getPublicUrl(path);


    return data.publicUrl;
  },


  async getEmpleadoServicios(
    empleadoId
  ) {

    await window.AnnlyReady;


    const {
      data
    } = await sbClient
      .from('employee_services')
      .select('service_id')
      .eq(
        'employee_id',
        empleadoId
      );


    return (data || [])
      .map(
        r => r.service_id
      );
  },


  // servicios: acepta un array de ids ('svc1','svc2') o de objetos con comisión
  // por servicio ({ id:'svc1', comision:60 }, { id:'svc2', comision:null }).
  async guardarEmpleadoServicios(
    empleadoId,
    servicios
  ) {

    await window.AnnlyReady;


    const {
      error: errDel
    } = await sbClient
      .from('employee_services')
      .delete()
      .eq(
        'employee_id',
        empleadoId
      );

    if (errDel) {
      throw errDel;
    }


    if (!servicios.length) {
      return;
    }


    const {
      error: errIns
    } = await sbClient
      .from('employee_services')
      .insert(

        servicios.map(
          s => {
            const esObjeto = s && typeof s === 'object';
            return {

              employee_id:
                empleadoId,

              service_id:
                esObjeto ? s.id : s,

              comision:
                esObjeto && s.comision != null ? Number(s.comision) : null

            };
          }
        )

      );

    if (errIns) {
      throw errIns;
    }
  },

  // Comisión por servicio ya asignada a un empleado: { serviceId: comision|null }
  async getComisionesServiciosEmpleado(empleadoId) {
    await window.AnnlyReady;
    const { data, error } = await sbClient.from('employee_services')
      .select('service_id, comision').eq('employee_id', empleadoId);
    if (error) throw error;
    const mapa = {};
    (data || []).forEach(r => { mapa[r.service_id] = r.comision != null ? Number(r.comision) : null; });
    return mapa;
  },


  async getMapaServiciosEmpleados() {

    await window.AnnlyReady;


    const {
      data: empleados
    } = await sbClient
      .from('employees')
      .select('id')
      .eq(
        'business_id',
        BUSINESS_ID
      )
      .eq(
        'activo',
        true
      );


    const ids =
      (empleados || [])
        .map(
          e => e.id
        );


    if (!ids.length) {
      return {};
    }


    const {
      data
    } = await sbClient
      .from('employee_services')
      .select(
        'employee_id, service_id'
      )
      .in(
        'employee_id',
        ids
      );


    const mapa = {};


    (data || []).forEach(r => {

      (
        mapa[r.service_id] ||=
        []
      ).push(
        r.employee_id
      );

    });


    return mapa;
  },



  async getEmpleadosParaServicio(serviceId) {
    await window.AnnlyReady;
    // Función segura: profesionales activos con nombre, foto, bio y servicios (nada privado)
    const { data, error } = await sbClient.rpc('empleados_publicos', { p_business: BUSINESS_ID });
    if (error) { console.error('Error leyendo profesionales:', error); return []; }
    return (data || [])
      .filter(e => !e.servicios || !e.servicios.length || e.servicios.includes(serviceId))
      .map(e => ({ id: e.id, nombre: e.nombre, fotoUrl: e.foto_url, bio: e.bio || '' }));
  },


  async getEmpleadoHorario(
    empleadoId
  ) {

    await window.AnnlyReady;


    // Se toma la fila que trae el horario completo (aunque hubiera filas viejas sin él).
    // Con sucursal: el de esa sucursal. Sin sucursal: primero el de la Principal.
    let q = sbClient.from('employee_schedules')
      .select('horario_estructurado, location_id, locations(is_main)')
      .eq('employee_id', empleadoId)
      .not('horario_estructurado', 'is', null);
    if (arguments[1]) q = q.eq('location_id', arguments[1]);
    let { data, error } = await q;
    if (error) {
      // Respaldo si la relación con locations no está disponible
      ({ data } = await sbClient.from('employee_schedules').select('horario_estructurado')
        .eq('employee_id', empleadoId).not('horario_estructurado', 'is', null).limit(1));
    }
    if (!data || !data.length) return null;
    const principal = data.find(r => r.locations && r.locations.is_main);
    return (principal || data[0]).horario_estructurado;
  },


  async guardarEmpleadoHorario(
    empleadoId,
    horario
  ) {

    await window.AnnlyReady;


    // Se reemplaza lo que hubiera (incluidas filas de un diseño anterior por día)
    // por una sola fila con el horario completo.
    const {
      error: errBorrar
    } = await sbClient
      .from('employee_schedules')
      .delete()
      .eq(
        'employee_id',
        empleadoId
      );

    if (errBorrar) {
      throw errBorrar;
    }


    const {
      error: errInsert
    } = await sbClient
      .from('employee_schedules')
      .insert([{
        employee_id:
          empleadoId,
        horario_estructurado:
          horario
      }]);

    if (errInsert) {
      throw errInsert;
    }
  },


  async eliminarEmpleadoHorario(
    empleadoId
  ) {

    await window.AnnlyReady;


    const {
      error
    } = await sbClient
      .from('employee_schedules')
      .delete()
      .eq(
        'employee_id',
        empleadoId
      );

    if (error) {
      throw error;
    }
  },


  // =======================================================
  // SUSCRIPCIÓN / PLAN / MÓDULOS
  // =======================================================

  // Trae la suscripción real del negocio, cruzada con su plan.
  // Devuelve null si el negocio todavía no tiene ninguna fila en subscriptions
  // (los negocios de prueba viejos, creados antes de esta arquitectura).
  async getSuscripcionActual() {
    await window.AnnlyReady;
    const { data, error } = await sbClient
      .from('subscriptions')
      .select('*, plans(*)')
      .eq('business_id', BUSINESS_ID)
      .neq('status', 'cancelled')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) { console.error('Error leyendo la suscripción:', error); return null; }
    if (!data) return null;
    return {
      subscriptionId: data.id,
      status: data.status,
      currentPeriodEnd: data.current_period_end,
      periodoHasta: data.current_period_end,
      plan: {
        id: data.plans.id,
        code: data.plans.code,
        name: data.plans.name,
        price: Number(data.plans.monthly_price),
        professionals: data.plans.included_professionals,
        locations: data.plans.included_locations
      }
    };
  },

  // Códigos de feature incluidos en un plan (ej. ['AGENDA','CLIENTES','PAGOS', ...])
  async getFeaturesDelPlan(planId) {
    await window.AnnlyReady;
    const { data } = await sbClient.from('plan_features').select('features(code)').eq('plan_id', planId);
    return (data || []).map(r => r.features.code);
  },

  // Features incluidas en un plan buscándolo por su código (BASIC/MEDIUM/ULTIMATE).
  // Usado para saber qué puede usar un negocio en trial, que siempre queda
  // limitado a Basic sin importar el plan que tenga seleccionado.
  async getFeaturesDePlanCode(code) {
    await window.AnnlyReady;
    const { data: plan } = await sbClient.from('plans').select('id').eq('code', code.toUpperCase()).maybeSingle();
    if (!plan) return [];
    return await this.getFeaturesDelPlan(plan.id);
  },

  // =======================================================
  // FINANZAS
  // =======================================================

  // Periodo de cierre del negocio (semanal o quincenal)
  async getAjustesFinanzas() {
    await window.AnnlyReady;
    const { data } = await sbClient.from('finance_settings').select('*').eq('business_id', BUSINESS_ID).maybeSingle();
    return {
      periodo: (data && data.periodo_cierre) || 'quincenal',
      semanaInicia: (data && data.semana_inicia != null) ? data.semana_inicia : 1,
      // Política de cancelación (configurable por negocio)
      horasAviso: (data && data.horas_aviso_cancelacion != null) ? Number(data.horas_aviso_cancelacion) : 24,
      creditoVigencia: (data && data.credito_vigencia_dias != null) ? Number(data.credito_vigencia_dias) : 30
    };
  },

  async guardarPoliticaCancelacion({ horasAviso, creditoVigencia }) {
    await window.AnnlyReady;
    const h = Math.max(0, Math.min(168, parseInt(horasAviso, 10) || 0));
    const d = Math.max(1, Math.min(365, parseInt(creditoVigencia, 10) || 30));
    const { error } = await sbClient.from('finance_settings').upsert({
      business_id: BUSINESS_ID, horas_aviso_cancelacion: h, credito_vigencia_dias: d,
      actualizado_en: new Date().toISOString()
    }, { onConflict: 'business_id' });
    if (error) throw error;
  },

  async guardarAjustesFinanzas({ periodo, semanaInicia }) {
    await window.AnnlyReady;
    const { error } = await sbClient.from('finance_settings').upsert({
      business_id: BUSINESS_ID,
      periodo_cierre: periodo === 'semanal' ? 'semanal' : 'quincenal',
      semana_inicia: Number.isInteger(semanaInicia) ? semanaInicia : 1,
      actualizado_en: new Date().toISOString()
    }, { onConflict: 'business_id' });
    if (error) throw error;
  },

  // Cobros confirmados del periodo (de citas completadas y de ventas en el local)
  async getPagosFinanzas(desdeISO, hastaISO) {
    await window.AnnlyReady;
    const { data, error } = await sbClient.from('finance_payments').select('*')
      .eq('business_id', BUSINESS_ID).eq('estado', 'confirmado')
      .gte('fecha', desdeISO).lte('fecha', hastaISO)
      .order('fecha', { ascending: false });
    if (error) throw error;
    return (data || []).map(p => ({
      id: p.id, origen: p.origen, appointmentId: p.appointment_id, localSaleId: p.local_sale_id, certificateId: p.certificate_id,
      metodo: p.metodo, monto: Number(p.monto), referencia: p.referencia, fecha: p.fecha,
      concepto: p.concepto, cliente: p.cliente_nombre, empleadoId: p.employee_id, creadoEn: p.creado_en,
      locationId: p.location_id || null
    }));
  },

  async getGastosFinanzas(desdeISO, hastaISO) {
    await window.AnnlyReady;
    const { data, error } = await sbClient.from('finance_expenses').select('*')
      .eq('business_id', BUSINESS_ID)
      .gte('fecha', desdeISO).lte('fecha', hastaISO)
      .order('fecha', { ascending: false });
    if (error) throw error;
    return (data || []).map(g => ({
      id: g.id, fecha: g.fecha, categoria: g.categoria, descripcion: g.descripcion,
      monto: Number(g.monto), metodo: g.metodo, referencia: g.referencia, creadoEn: g.creado_en,
      anulado: !!g.anulado, motivoAnulacion: g.anulado_motivo || '', anuladoEn: g.anulado_en || null,
      locationId: g.location_id || null
    }));
  },

  async registrarGasto(g) {
    await window.AnnlyReady;
    const { error } = await sbClient.from('finance_expenses').insert([{
      business_id: BUSINESS_ID, fecha: g.fecha, categoria: g.categoria,
      descripcion: g.descripcion || null, monto: g.monto, metodo: g.metodo,
      referencia: g.referencia || null,
      ...(g.locationId ? { location_id: g.locationId } : {})
    }]);
    if (error) throw error;
  },

  // Bitácora de acciones (anulaciones, cancelaciones): quién, cuándo, por qué y los datos que tenía.
  // Si no se puede guardar, no bloquea la acción; devuelve false y queda el aviso en la consola.
  async registrarAccion({ entidad, entidadId, accion, motivo, monto, detalle }) {
    await window.AnnlyReady;
    try {
      const { data: u } = await sbClient.auth.getUser();
      const user = u && u.user;
      const { error } = await sbClient.from('registro_acciones').insert([{
        business_id: BUSINESS_ID, entidad, entidad_id: entidadId != null ? String(entidadId) : null,
        accion, motivo, monto: monto != null ? monto : null, detalle: detalle || null,
        usuario_id: user ? user.id : null, usuario_correo: user ? user.email : null
      }]);
      if (error) throw error;
      return true;
    } catch (e) {
      console.error('No se pudo guardar el registro de la acción:', e);
      return false;
    }
  },

  // Anula un gasto: queda en la lista, tachado, con su motivo, y deja de contar en los totales.
  async anularGasto(id, motivo, detalle) {
    await window.AnnlyReady;
    if (!motivo || !motivo.trim()) throw new Error('Indica el motivo de la anulación.');
    {
      const { data: g } = await sbClient.from('finance_expenses').select('fecha, location_id').eq('id', id).eq('business_id', BUSINESS_ID).maybeSingle();
      if (g) {
        const st = await this.estadoCierreMovimiento({ tipo: 'gasto', fecha: g.fecha, locationId: g.location_id });
        if (st.cerrado) throw new Error('Este gasto es de un periodo ya cerrado: regístrale un ajuste en vez de anularlo.');
      }
    }
    const { data: filas, error } = await sbClient.from('finance_expenses')
      .update({ anulado: true, anulado_motivo: motivo.trim(), anulado_en: new Date().toISOString() })
      .eq('id', id).eq('business_id', BUSINESS_ID).eq('anulado', false)
      .select('id');
    if (error) throw error;
    if (!filas || !filas.length) throw new Error('El gasto ya estaba anulado o no existe.');
    await this.registrarAccion({ entidad: 'gasto', entidadId: id, accion: 'anulado', motivo: motivo.trim(), monto: detalle && detalle.monto, detalle });
  },

  async eliminarGasto(id) {
    await window.AnnlyReady;
    const { error } = await sbClient.from('finance_expenses').delete().eq('id', id).eq('business_id', BUSINESS_ID);
    if (error) throw error;
  },

  async getVentasLocales(desdeISO, hastaISO) {
    await window.AnnlyReady;
    const { data, error } = await sbClient.from('local_sales').select('*')
      .eq('business_id', BUSINESS_ID)
      .gte('fecha', desdeISO).lte('fecha', hastaISO)
      .order('fecha', { ascending: false });
    if (error) throw error;
    return (data || []).map(v => ({
      id: v.id, fecha: v.fecha, cliente: v.cliente_nombre, servicio: v.servicio_nombre,
      empleadoId: v.employee_id, monto: Number(v.monto), creadoEn: v.creado_en,
      anulada: !!v.anulada, motivoAnulacion: v.anulada_motivo || '', anuladaEn: v.anulada_en || null,
      locationId: v.location_id || null,
      comisionMonto: Number(v.comision_monto || 0)
    }));
  },

  // Una venta y sus pagos son cosas separadas: una venta puede tener varios pagos.
  async registrarVentaLocal(v, pagos) {
    await window.AnnlyReady;

    // Comisión: se calcula y se congela en la venta al momento de registrarla
    // (si luego cambia el % del profesional o del servicio, no altera lo ya generado)
    // v.comision: { modo:'pct'|'monto', valor } la decide el negocio en cada venta;
    // null = sin comisión. (Sin el dato, se usa el % del profesional, como antes.)
    let comisionPct = 0, comisionMonto = 0;
    if (v.empleadoId && v.comision && Number(v.comision.valor) > 0) {
      const montoVenta = Number(v.monto || 0);
      if (v.comision.modo === 'pct') {
        comisionPct = Number(v.comision.valor);
        comisionMonto = Math.round(montoVenta * comisionPct) / 100;
      } else {
        comisionMonto = Math.round(Number(v.comision.valor) * 100) / 100;
        comisionPct = montoVenta > 0 ? Math.round(comisionMonto / montoVenta * 10000) / 100 : 0;
      }
      if (comisionMonto > montoVenta) throw new Error('La comisión no puede ser mayor que el monto de la venta.');
    } else if (v.empleadoId && v.comision === undefined) {
      comisionPct = await this.getComisionAplicable(v.empleadoId, v.servicio);
      comisionMonto = Math.round(Number(v.monto || 0) * comisionPct) / 100;
    }

    const { data: venta, error } = await sbClient.from('local_sales').insert([{
      business_id: BUSINESS_ID, fecha: v.fecha, cliente_nombre: v.cliente || null,
      servicio_nombre: v.servicio, employee_id: v.empleadoId || null, monto: v.monto,
      comision_pct: comisionPct, comision_monto: comisionMonto,
      ...(v.locationId ? { location_id: v.locationId } : {})
    }]).select('id').single();
    if (error) throw error;

    const filas = (pagos || []).filter(p => p.monto > 0).map(p => ({
      business_id: BUSINESS_ID, origen: 'local', local_sale_id: venta.id,
      metodo: p.metodo, monto: p.monto, referencia: p.referencia || null,
      fecha: v.fecha, concepto: v.servicio, cliente_nombre: v.cliente || null,
      employee_id: v.empleadoId || null,
      ...(v.locationId ? { location_id: v.locationId } : {})
    }));
    if (filas.length) {
      const { error: errPagos } = await sbClient.from('finance_payments').insert(filas);
      if (errPagos) {
        // No dejamos una venta sin sus pagos
        await sbClient.from('local_sales').delete().eq('id', venta.id);
        throw errPagos;
      }
    }

    // Propina: si vino en el cobro (nunca desde certificado), queda pendiente de liquidar
    if (v.propina && v.propina.monto > 0 && v.empleadoId) {
      await this.registrarPropina({
        employeeId: v.empleadoId, localSaleId: venta.id, monto: v.propina.monto,
        metodo: v.propina.metodo, fecha: v.fecha,
        clienteNombre: v.cliente || null, servicioNombre: v.servicio || null
      });
    }

    return venta.id;
  },

  async _idPrincipal() {
    const { data } = await sbClient.from('locations').select('id').eq('business_id', BUSINESS_ID).eq('is_main', true).limit(1);
    return data && data[0] ? data[0].id : null;
  },

  _fmtFechaCorta(iso) {
    if (!iso) return '';
    const [y, m, d] = String(iso).split('-');
    return `${d}/${m}/${y}`;
  },

  // ¿La fecha de un movimiento cae en un periodo ya cerrado de su sede?
  // tipo 'venta': cierra el periodo del profesional que la hizo o el cierre general de la sede.
  // tipo 'gasto': solo el cierre general de la sede.
  async estadoCierreMovimiento({ tipo, fecha, employeeId, locationId }) {
    await window.AnnlyReady;
    const loc = locationId || await this._idPrincipal();
    if (tipo === 'venta' && employeeId) {
      const c = await this.getCierreQueCubre([employeeId], fecha, loc);
      if (c) return { cerrado: true, por: 'profesional', desde: c.desde, hasta: c.hasta };
    }
    const { data, error } = await this._enSede(sbClient.from('cierres_negocio').select('periodo_desde, periodo_hasta')
      .eq('business_id', BUSINESS_ID).lte('periodo_desde', fecha).gte('periodo_hasta', fecha), loc).limit(1);
    if (error) throw error;
    if (data && data[0]) return { cerrado: true, por: 'negocio', desde: data[0].periodo_desde, hasta: data[0].periodo_hasta };
    return { cerrado: false };
  },

  // Ajustes ya hechos (para marcar en las listas lo que ya se ajustó): Set de 'venta:<id>' / 'gasto:<id>'
  async getAjustesHechos() {
    await window.AnnlyReady;
    const [g, p] = await Promise.all([
      sbClient.from('finance_expenses').select('ajuste_de').eq('business_id', BUSINESS_ID).not('ajuste_de', 'is', null),
      sbClient.from('finance_payments').select('ajuste_de').eq('business_id', BUSINESS_ID).not('ajuste_de', 'is', null)
    ]);
    const set = new Set();
    [...((g && g.data) || []), ...((p && p.data) || [])].forEach(r => set.add(r.ajuste_de));
    return set;
  },

  // Corrige un movimiento de un periodo cerrado sin tocar el pasado: crea un movimiento con fecha de hoy.
  // - venta: un gasto "Ajuste / devolución" por el monto de la venta y, si ya generó comisión,
  //          un adelanto por esa comisión que se descuenta en el siguiente cierre del profesional.
  // - gasto: un ingreso de origen "ajuste" por el monto del gasto.
  async registrarAjuste({ tipo, id, motivo }) {
    await window.AnnlyReady;
    if (!motivo || !motivo.trim()) throw new Error('Indica el motivo del ajuste.');
    const hoy = this._hoyISO();
    const ref = tipo + ':' + id;

    if (tipo === 'venta') {
      const { data: v, error } = await sbClient.from('local_sales').select('*').eq('id', id).eq('business_id', BUSINESS_ID).maybeSingle();
      if (error) throw error;
      if (!v) throw new Error('La venta no existe.');
      if (v.anulada) throw new Error('La venta ya está anulada.');
      const { data: ya } = await sbClient.from('finance_expenses').select('id').eq('business_id', BUSINESS_ID).eq('ajuste_de', ref).limit(1);
      if (ya && ya.length) throw new Error('Esta venta ya tiene un ajuste registrado.');
      const { data: pagos } = await sbClient.from('finance_payments').select('metodo').eq('local_sale_id', id).limit(1);
      const metodo = (pagos && pagos[0] && pagos[0].metodo && pagos[0].metodo !== 'certificado') ? pagos[0].metodo : 'efectivo';

      const { error: errG } = await sbClient.from('finance_expenses').insert([{
        business_id: BUSINESS_ID, fecha: hoy, categoria: 'Ajuste / devolución',
        descripcion: `Devolución de la venta del ${this._fmtFechaCorta(v.fecha)} — ${v.servicio_nombre || 'venta'}${v.cliente_nombre ? ' (' + v.cliente_nombre + ')' : ''}`,
        monto: Number(v.monto), metodo, referencia: motivo.trim().slice(0, 120),
        location_id: v.location_id || null, ajuste_de: ref
      }]);
      if (errG) throw errG;

      const comision = Number(v.comision_monto || 0);
      if (v.employee_id && comision > 0) {
        const { error: errA } = await sbClient.from('adelantos').insert([{
          business_id: BUSINESS_ID, employee_id: v.employee_id, monto: comision, fecha: hoy,
          nota: `Ajuste venta del ${this._fmtFechaCorta(v.fecha)} (comisión ya pagada)`,
          location_id: v.location_id || null
        }]);
        if (errA) console.error('El ajuste se registró, pero no se pudo descontar la comisión:', errA);
      }
      await this.registrarAccion({ entidad: 'ajuste', entidadId: id, accion: 'ajuste_venta', motivo: motivo.trim(), monto: Number(v.monto),
        detalle: { venta: v.servicio_nombre, fechaVenta: v.fecha, comisionDescontada: comision } });
      return { comisionDescontada: comision };
    }

    if (tipo === 'gasto') {
      const { data: g, error } = await sbClient.from('finance_expenses').select('*').eq('id', id).eq('business_id', BUSINESS_ID).maybeSingle();
      if (error) throw error;
      if (!g) throw new Error('El gasto no existe.');
      if (g.anulado) throw new Error('El gasto ya está anulado.');
      const { data: ya } = await sbClient.from('finance_payments').select('id').eq('business_id', BUSINESS_ID).eq('ajuste_de', ref).limit(1);
      if (ya && ya.length) throw new Error('Este gasto ya tiene un ajuste registrado.');
      const { error: errP } = await sbClient.from('finance_payments').insert([{
        business_id: BUSINESS_ID, origen: 'ajuste', estado: 'confirmado', metodo: g.metodo || 'efectivo',
        monto: Number(g.monto), fecha: hoy, referencia: motivo.trim().slice(0, 120),
        concepto: `Ajuste del gasto del ${this._fmtFechaCorta(g.fecha)} — ${g.categoria}`,
        location_id: g.location_id || null, ajuste_de: ref
      }]);
      if (errP) throw errP;
      await this.registrarAccion({ entidad: 'ajuste', entidadId: id, accion: 'ajuste_gasto', motivo: motivo.trim(), monto: Number(g.monto),
        detalle: { categoria: g.categoria, fechaGasto: g.fecha } });
      return {};
    }
    throw new Error('Tipo de ajuste desconocido.');
  },

  // Anula una venta en el local (devolución, error de captura...): no se borra, queda en
  // el historial con su motivo, y sus pagos dejan de contar en los ingresos.
  async anularVentaLocal(id, motivo, detalle) {
    await window.AnnlyReady;
    if (!motivo || !motivo.trim()) throw new Error('Indica el motivo de la anulación.');
    {
      const { data: v } = await sbClient.from('local_sales').select('fecha, employee_id, location_id').eq('id', id).eq('business_id', BUSINESS_ID).maybeSingle();
      if (v) {
        const st = await this.estadoCierreMovimiento({ tipo: 'venta', fecha: v.fecha, employeeId: v.employee_id, locationId: v.location_id });
        if (st.cerrado) throw new Error('Esta venta es de un periodo ya cerrado: regístrale un ajuste en vez de anularla.');
      }
    }

    // 1) Los pagos de la venta dejan de contar como ingreso
    const { error: errPagos } = await sbClient.from('finance_payments')
      .update({ estado: 'anulado' })
      .eq('local_sale_id', id).eq('business_id', BUSINESS_ID).eq('estado', 'confirmado');
    if (errPagos) throw errPagos;

    // 2) La venta queda marcada como anulada, con su motivo
    const { data: filas, error: errVenta } = await sbClient.from('local_sales')
      .update({ anulada: true, anulada_motivo: motivo.trim(), anulada_en: new Date().toISOString() })
      .eq('id', id).eq('business_id', BUSINESS_ID).eq('anulada', false)
      .select('id');
    if (errVenta || !filas || !filas.length) {
      // Si no se pudo marcar la venta, los pagos vuelven a contar
      await sbClient.from('finance_payments').update({ estado: 'confirmado' })
        .eq('local_sale_id', id).eq('business_id', BUSINESS_ID).eq('estado', 'anulado');
      throw errVenta || new Error('La venta ya estaba anulada o no existe.');
    }
    await this.registrarAccion({ entidad: 'venta_local', entidadId: id, accion: 'anulado', motivo: motivo.trim(), monto: detalle && detalle.monto, detalle });
  },

  // Completa una cita de la Agenda: la cita existente es el origen del cobro
  // (no se crea una venta duplicada). Se marca primero, solo si aún no estaba
  // completada, para que dos clics no registren el cobro dos veces.
  async completarCita(citaId, datos) {
    await window.AnnlyReady;

    // Comisión: se calcula y se congela en la cita al momento de completarla
    // (si luego cambia el % del profesional o del servicio, no altera lo ya generado)
    const { data: citaActual } = await sbClient.from('appointments')
      .select('employee_id, servicio_nombre, grupo_cita_id, fecha')
      .eq('id', citaId).eq('business_id', BUSINESS_ID).maybeSingle();
    if (citaActual && citaActual.grupo_cita_id) {
      throw new Error('Esta cita es parte de una cita doble: se completa desde la tarjeta doble (completarCitaDoble).');
    }
    const empleadoFinal = (datos.cambiarEmpleado && datos.empleadoId) ? datos.empleadoId : (citaActual && citaActual.employee_id);
    // Una cita cuya fecha de atención cae en un periodo ya cerrado no se puede completar (sin excepción)
    await this.validarFechaAbierta([citaActual && citaActual.employee_id, empleadoFinal], (citaActual && citaActual.fecha) || datos.fecha);
    let comisionPct = 0, comisionMonto = 0;
    if (empleadoFinal) {
      comisionPct = await this.getComisionAplicable(empleadoFinal, citaActual && citaActual.servicio_nombre);
      comisionMonto = Math.round(Number(datos.precioCobrado || 0) * comisionPct) / 100;
    }

    const marca = { completada_en: new Date().toISOString(), precio_cobrado: datos.precioCobrado, comision_pct: comisionPct, comision_monto: comisionMonto };
    if (datos.ajusteDetalle) marca.ajuste_detalle = datos.ajusteDetalle;
    // Motivo por el que un certificado validado al reservar no se aplicó (trazabilidad)
    if (datos.certNoAplicadoMotivo) marca.certificado_no_aplicado_motivo = datos.certNoAplicadoMotivo;
    // Si quien realizó el servicio es otra persona, la cita queda a nombre de ese profesional
    if (datos.cambiarEmpleado && datos.empleadoId) marca.employee_id = datos.empleadoId;
    const { data: marcada, error: errMarca } = await sbClient.from('appointments')
      .update(marca)
      .eq('id', citaId).eq('business_id', BUSINESS_ID).is('completada_en', null)
      .select('id');
    if (errMarca) throw errMarca;
    if (!marcada || !marcada.length) throw new Error('Esta cita ya fue completada.');

    const revertirMarca = () => sbClient.from('appointments')
      .update({ completada_en: null, precio_cobrado: null, comision_pct: null, comision_monto: null, ...(datos.ajusteDetalle ? { ajuste_detalle: null } : {}), ...(datos.certNoAplicadoMotivo ? { certificado_no_aplicado_motivo: null } : {}), ...(datos.cambiarEmpleado ? { employee_id: datos.empleadoIdOriginal || null } : {}) }).eq('id', citaId);

    // Ventas adicionales de la visita (tratamientos, productos, etc.)
    let extrasIds = [];
    const extras = (datos.extras || []).filter(x => x.monto > 0 && x.descripcion);
    if (extras.length) {
      const { data: insertados, error: errExtras } = await sbClient.from('appointment_extras').insert(
        extras.map(x => ({
          business_id: BUSINESS_ID, appointment_id: citaId, descripcion: x.descripcion,
          monto: x.monto, fecha: datos.fecha, employee_id: datos.empleadoId || null,
          cliente_nombre: datos.cliente || null
        }))
      ).select('id');
      if (errExtras) {
        await revertirMarca();
        throw errExtras;
      }
      extrasIds = (insertados || []).map(r => r.id);
    }

    const filas = (datos.pagos || []).filter(p => p.monto > 0).map(p => ({
      business_id: BUSINESS_ID, origen: 'agenda', appointment_id: citaId,
      metodo: p.metodo, monto: p.monto, referencia: p.referencia || null,
      fecha: datos.fecha, concepto: datos.concepto || null,
      cliente_nombre: datos.cliente || null, employee_id: datos.empleadoId || null
    }));
    if (filas.length) {
      const { error: errPagos } = await sbClient.from('finance_payments').insert(filas);
      if (errPagos) {
        // Si fallan los pagos, se deshace todo y la cita vuelve a quedar por completar
        if (extrasIds.length) await sbClient.from('appointment_extras').delete().in('id', extrasIds);
        await revertirMarca();
        throw errPagos;
      }
    }

    // Propina: si vino en el cobro (nunca desde certificado), queda pendiente de liquidar
    if (datos.propina && datos.propina.monto > 0 && empleadoFinal) {
      await this.registrarPropina({
        employeeId: empleadoFinal, appointmentId: citaId, monto: datos.propina.monto,
        metodo: datos.propina.metodo, fecha: datos.fecha,
        clienteNombre: datos.cliente || null, servicioNombre: datos.concepto || (citaActual && citaActual.servicio_nombre) || null
      });
    }

  },

  // Cita doble: se completan las 2 juntas, con UN solo cobro por el combo. El precio final del
  // combo se reparte a la mitad en cada cita (cada profesional cobra su comisión sobre su mitad) y
  // el cobro se asigna a las 2 citas para que cada una cuadre sola: primero se cubre lo que le falta
  // a la principal (la que lleva el abono) y el resto va a la otra. La propina se reparte mitad y mitad.
  // datos: { grupoCitaId, precioCombo, pagos:[{metodo,monto,referencia}], fecha, extras, ajusteDetalle, propina:{monto,metodo} }
  async completarCitaDoble(datos) {
    await window.AnnlyReady;

    const { data: par, error: errPar } = await sbClient.from('appointments')
      .select('id, employee_id, servicio_nombre, cliente_nombre, completada_en, grupo_principal, abono_monto, abono_tipo, metodo_pago, comprobante, fecha')
      .eq('business_id', BUSINESS_ID).eq('grupo_cita_id', datos.grupoCitaId);
    if (errPar) throw errPar;
    if (!par || par.length !== 2) throw new Error('No se encontraron las 2 citas de esta reserva doble.');
    if (par.some(p => p.completada_en)) throw new Error('Esta cita doble ya fue completada.');
    await this.validarFechaAbierta(par.map(p => p.employee_id), par[0].fecha || datos.fecha);

    const principal = par.find(p => p.grupo_principal) || par[0];
    const otra = par.find(p => p.id !== principal.id);

    const total = Math.round(Number(datos.precioCombo || 0) * 100) / 100;
    const mitadP = Math.round(total * 100 / 2) / 100;
    const mitadO = Math.round((total - mitadP) * 100) / 100;

    const abono = Number(principal.abono_monto || 0);
    const descontable = principal.abono_tipo === 'descontable';
    const extras = (datos.extras || []).filter(x => x.monto > 0 && x.descripcion);
    const extrasTotal = Math.round(extras.reduce((s, x) => s + x.monto, 0) * 100) / 100;

    // Lo que le toca cobrar hoy a cada cita (el abono descontable ya cubre parte de la principal)
    const abonoDescontado = descontable ? Math.min(abono, mitadP) : 0;
    let debeP = Math.round((mitadP + extrasTotal - abonoDescontado) * 100) / 100;
    if (debeP < 0) debeP = 0;
    const debeO = mitadO;

    // Se reparte el cobro de hoy: primero lo que falta de la principal, el resto a la otra
    const lineasP = [], lineasO = [];
    let faltaP = debeP;
    for (const l of (datos.pagos || [])) {
      let restante = Math.round(Number(l.monto) * 100) / 100;
      if (!(restante > 0)) continue;
      if (faltaP > 0) {
        const aP = Math.min(restante, faltaP);
        lineasP.push({ ...l, monto: aP });
        faltaP = Math.round((faltaP - aP) * 100) / 100;
        restante = Math.round((restante - aP) * 100) / 100;
      }
      if (restante > 0) lineasO.push({ ...l, monto: restante });
    }

    const ahora = new Date().toISOString();
    const marcar = async (cita, mitad) => {
      const pct = cita.employee_id ? await this.getComisionAplicable(cita.employee_id, cita.servicio_nombre) : 0;
      const monto = Math.round(mitad * pct) / 100;
      const fila = { completada_en: ahora, precio_cobrado: mitad, comision_pct: pct, comision_monto: monto };
      if (datos.ajusteDetalle) fila.ajuste_detalle = datos.ajusteDetalle;
      const { data: ok, error } = await sbClient.from('appointments').update(fila)
        .eq('id', cita.id).eq('business_id', BUSINESS_ID).is('completada_en', null).select('id');
      if (error) throw error;
      if (!ok || !ok.length) throw new Error('Una de las 2 citas ya estaba completada.');
    };
    const revertir = (ids) => sbClient.from('appointments')
      .update({ completada_en: null, precio_cobrado: null, comision_pct: null, comision_monto: null, ajuste_detalle: null })
      .in('id', ids);

    await marcar(principal, mitadP);
    try { await marcar(otra, mitadO); }
    catch (e) { await revertir([principal.id]); throw e; }

    const ids = [principal.id, otra.id];
    let extrasIds = [];
    try {
      if (extras.length) {
        const { data: insertados, error: errEx } = await sbClient.from('appointment_extras').insert(
          extras.map(x => ({
            business_id: BUSINESS_ID, appointment_id: principal.id, descripcion: x.descripcion,
            monto: x.monto, fecha: datos.fecha, employee_id: principal.employee_id || null,
            cliente_nombre: principal.cliente_nombre || null
          }))
        ).select('id');
        if (errEx) throw errEx;
        extrasIds = (insertados || []).map(r => r.id);
      }

      const filas = [];
      // El abono ya pagado por la reserva se registra en la principal, igual que en una cita normal
      if (abono > 0) {
        filas.push({
          business_id: BUSINESS_ID, origen: 'agenda', appointment_id: principal.id,
          metodo: principal.metodo_pago === 'yappy' ? 'yappy' : 'transferencia', monto: abono,
          referencia: principal.comprobante || null, fecha: datos.fecha, concepto: datos.concepto || null,
          cliente_nombre: principal.cliente_nombre || null, employee_id: principal.employee_id || null
        });
      }
      const filaPago = (cita, l) => ({
        business_id: BUSINESS_ID, origen: 'agenda', appointment_id: cita.id,
        metodo: l.metodo, monto: l.monto, referencia: l.referencia || null,
        fecha: datos.fecha, concepto: datos.concepto || null,
        cliente_nombre: cita.cliente_nombre || null, employee_id: cita.employee_id || null
      });
      lineasP.forEach(l => filas.push(filaPago(principal, l)));
      lineasO.forEach(l => filas.push(filaPago(otra, l)));
      if (filas.length) {
        const { error: errPagos } = await sbClient.from('finance_payments').insert(filas);
        if (errPagos) throw errPagos;
      }
    } catch (e) {
      if (extrasIds.length) await sbClient.from('appointment_extras').delete().in('id', extrasIds);
      await revertir(ids);
      throw e;
    }

    // Propina: se reparte mitad y mitad entre los 2 profesionales
    if (datos.propina && datos.propina.monto > 0) {
      const montoP = Math.round(datos.propina.monto * 100 / 2) / 100;
      const montoO = Math.round((datos.propina.monto - montoP) * 100) / 100;
      for (const [cita, monto] of [[principal, montoP], [otra, montoO]]) {
        if (monto > 0 && cita.employee_id) {
          await this.registrarPropina({
            employeeId: cita.employee_id, appointmentId: cita.id, monto,
            metodo: datos.propina.metodo, fecha: datos.fecha,
            clienteNombre: cita.cliente_nombre || null, servicioNombre: cita.servicio_nombre || datos.concepto || null
          });
        }
      }
    }

    return { principalId: principal.id, otraId: otra.id };
  },

  // Cobros registrados de una cita (para su detalle / trazabilidad)
  async getPagosDeCita(citaId) {
    await window.AnnlyReady;
    const { data, error } = await sbClient.from('finance_payments').select('*')
      .eq('business_id', BUSINESS_ID).eq('appointment_id', citaId)
      .order('creado_en', { ascending: true });
    if (error) throw error;
    return (data || []).map(p => ({
      id: p.id, metodo: p.metodo, monto: Number(p.monto), referencia: p.referencia, fecha: p.fecha
    }));
  },

  // Ventas adicionales (tratamientos, productos...) registradas en las visitas del periodo
  async getExtrasFinanzas(desdeISO, hastaISO) {
    await window.AnnlyReady;
    const { data, error } = await sbClient.from('appointment_extras').select('*')
      .eq('business_id', BUSINESS_ID)
      .gte('fecha', desdeISO).lte('fecha', hastaISO);
    if (error) throw error;
    return (data || []).map(x => ({
      id: x.id, appointmentId: x.appointment_id, descripcion: x.descripcion,
      monto: Number(x.monto), fecha: x.fecha, empleadoId: x.employee_id, cliente: x.cliente_nombre, creadoEn: x.creado_en,
      locationId: x.location_id || null
    }));
  },

  async getExtrasDeCita(citaId) {
    await window.AnnlyReady;
    const { data, error } = await sbClient.from('appointment_extras').select('*')
      .eq('business_id', BUSINESS_ID).eq('appointment_id', citaId)
      .order('creado_en', { ascending: true });
    if (error) throw error;
    return (data || []).map(x => ({ id: x.id, descripcion: x.descripcion, monto: Number(x.monto) }));
  },

  // =======================================================
  // COMISIONES, PROPINAS Y ADELANTOS
  // =======================================================

  // % aplicable a un profesional: el de servicio (si existe) manda sobre el global
  async getComisionAplicable(employeeId, servicioNombre) {
    await window.AnnlyReady;
    const { data: emp } = await sbClient.from('employees').select('comision_global').eq('id', employeeId).maybeSingle();
    const global = (emp && emp.comision_global != null) ? Number(emp.comision_global) : 0;
    if (!servicioNombre) return global;
    const { data: srv } = await sbClient.from('services').select('id')
      .eq('business_id', BUSINESS_ID).eq('nombre', servicioNombre).maybeSingle();
    if (!srv) return global;
    const { data: es } = await sbClient.from('employee_services').select('comision')
      .eq('employee_id', employeeId).eq('service_id', srv.id).maybeSingle();
    return (es && es.comision != null) ? Number(es.comision) : global;
  },

  async guardarComisionGlobal(employeeId, comision) {
    await window.AnnlyReady;
    const { error } = await sbClient.from('employees')
      .update({ comision_global: comision != null ? Number(comision) : null })
      .eq('id', employeeId).eq('business_id', BUSINESS_ID);
    if (error) throw error;
  },

  async guardarComisionServicio(employeeId, serviceId, comision) {
    await window.AnnlyReady;
    const { error } = await sbClient.from('employee_services')
      .update({ comision: comision != null ? Number(comision) : null })
      .eq('employee_id', employeeId).eq('service_id', serviceId);
    if (error) throw error;
  },

  // Comisión ya generada (congelada) por un profesional en un rango — suma directa,
  // no recalcula %.
  // Finanzas por sede: si viene locationId, la consulta se limita a esa sede
  _enSede(q, locationId) {
    return locationId ? q.eq('location_id', locationId) : q;
  },

  async getComisionGeneradaPeriodo(employeeId, desdeISO, hastaISO, locationId) {
    await window.AnnlyReady;
    const [citas, ventas] = await Promise.all([
      this._enSede(sbClient.from('appointments').select('comision_monto')
        .eq('business_id', BUSINESS_ID).eq('employee_id', employeeId)
        .not('completada_en', 'is', null)
        .gte('fecha', desdeISO).lte('fecha', hastaISO), locationId),
      this._enSede(sbClient.from('local_sales').select('comision_monto')
        .eq('business_id', BUSINESS_ID).eq('employee_id', employeeId).eq('anulada', false)
        .gte('fecha', desdeISO).lte('fecha', hastaISO), locationId)
    ]);
    const sum = r => (r.data || []).reduce((s, x) => s + Number(x.comision_monto || 0), 0);
    return sum(citas) + sum(ventas);
  },

  // Total de propinas generadas por un profesional en un rango (pendientes + pagadas) —
  // para el resumen de "Propinas generadas en caja" en Comisiones.
  async getPropinasGeneradasPeriodo(employeeId, desdeISO, hastaISO, locationId) {
    await window.AnnlyReady;
    const { data, error } = await this._enSede(sbClient.from('propinas').select('monto')
      .eq('business_id', BUSINESS_ID).eq('employee_id', employeeId)
      .gte('fecha', desdeISO).lte('fecha', hastaISO), locationId);
    if (error) throw error;
    return (data || []).reduce((s, r) => s + Number(r.monto || 0), 0);
  },

  // ---- Propinas ----
  // Solo las que llegan al negocio por tarjeta/Yappy/transferencia; nacen "pendiente"
  // y se liquidan (efectivo en mano del profesional) con liquidarPropina.
  async registrarPropina({ employeeId, monto, metodo, fecha, appointmentId, localSaleId, clienteNombre, servicioNombre }) {
    await window.AnnlyReady;
    if (metodo === 'certificado') throw new Error('El certificado nunca cubre propina.');
    const { error } = await sbClient.from('propinas').insert([{
      business_id: BUSINESS_ID, employee_id: employeeId, monto, metodo, fecha,
      appointment_id: appointmentId || null, local_sale_id: localSaleId || null,
      cliente_nombre: clienteNombre || null, servicio_nombre: servicioNombre || null
    }]);
    if (error) throw error;
  },

  async getPropinas(employeeId, estado, locationId) {
    await window.AnnlyReady;
    let q = sbClient.from('propinas').select('*').eq('business_id', BUSINESS_ID);
    if (employeeId) q = q.eq('employee_id', employeeId);
    if (estado) q = q.eq('estado', estado);
    q = this._enSede(q, locationId);
    const { data, error } = await q.order('fecha', { ascending: false });
    if (error) throw error;
    return (data || []).map(p => ({
      id: p.id, empleadoId: p.employee_id, monto: Number(p.monto), metodo: p.metodo,
      fecha: p.fecha, estado: p.estado, pagadaEn: p.pagada_en, pagadaDetalle: p.pagada_detalle || '',
      pagadaMetodo: p.pagada_metodo || '', cierreId: p.cierre_id,
      appointmentId: p.appointment_id, localSaleId: p.local_sale_id,
      clienteNombre: p.cliente_nombre || '', servicioNombre: p.servicio_nombre || '',
      locationId: p.location_id || null
    }));
  },

  // Propinas pendientes (sin decidir todavía) de un profesional en un rango — para bloquear
  // el cierre de periodo si queda alguna sin resolver.
  async getPropinasPendientesPeriodo(employeeId, desdeISO, hastaISO, locationId) {
    await window.AnnlyReady;
    const { data, error } = await this._enSede(sbClient.from('propinas').select('id, monto, fecha, cliente_nombre, servicio_nombre')
      .eq('business_id', BUSINESS_ID).eq('employee_id', employeeId).eq('estado', 'pendiente')
      .gte('fecha', desdeISO).lte('fecha', hastaISO), locationId);
    if (error) throw error;
    return (data || []).map(p => ({ id: p.id, monto: Number(p.monto), fecha: p.fecha, clienteNombre: p.cliente_nombre || '', servicioNombre: p.servicio_nombre || '' }));
  },

  // Camino 1: se le paga al profesional ahora mismo (puede ser en cualquier medio, no solo efectivo)
  async pagarPropinaContado(id, metodo, detalle) {
    await window.AnnlyReady;
    if (!metodo) throw new Error('Indica el medio con que se le pagó al profesional.');
    const { data: u } = await sbClient.auth.getUser();
    const { data: filas, error } = await sbClient.from('propinas')
      .update({ estado: 'pagada_contado', pagada_en: new Date().toISOString(), pagada_metodo: metodo, pagada_detalle: (detalle || '').trim() || null, pagada_por: u && u.user ? u.user.id : null })
      .eq('id', id).eq('business_id', BUSINESS_ID).eq('estado', 'pendiente')
      .select('id, monto, employee_id');
    if (error) throw error;
    if (!filas || !filas.length) throw new Error('Esa propina ya no está pendiente.');
    await this.registrarAccion({ entidad: 'propina', entidadId: id, accion: 'pagada_contado', motivo: (detalle || '').trim() || ('Pagada al contado — ' + metodo), monto: filas[0].monto, detalle: { employeeId: filas[0].employee_id, metodo } });
  },

  // Camino 2: se paga junto con el corte de periodo — no hay reversa
  async programarPropinaCierre(id) {
    await window.AnnlyReady;
    const { data: filas, error } = await sbClient.from('propinas')
      .update({ estado: 'programada_cierre' })
      .eq('id', id).eq('business_id', BUSINESS_ID).eq('estado', 'pendiente')
      .select('id, monto, employee_id');
    if (error) throw error;
    if (!filas || !filas.length) throw new Error('Esa propina ya no está pendiente.');
    await this.registrarAccion({ entidad: 'propina', entidadId: id, accion: 'programada_cierre', motivo: 'Programada para pagarse en el corte de periodo', monto: filas[0].monto, detalle: { employeeId: filas[0].employee_id } });
  },

  // ---- Adelantos ----
  // Contra comisión, no contra propina. desdeISO/hastaISO = periodo actual
  // (rangoPeriodoCierre(FIN.ajustes, 0) en admin.html).
  // Con sedes: el adelanto se da contra la comisión de ESA sede y se descuenta de su pago
  async registrarAdelanto({ employeeId, monto, fecha, nota, desdeISO, hastaISO, locationId }) {
    await window.AnnlyReady;
    const generado = await this.getComisionGeneradaPeriodo(employeeId, desdeISO, hastaISO, locationId);
    const dados = await this.getAdelantosPeriodo(employeeId, desdeISO, hastaISO, locationId);
    const disponible = generado - dados;
    if (monto > disponible) throw new Error(`El adelanto máximo disponible en este periodo es ${disponible.toFixed(2)}.`);
    const { error } = await sbClient.from('adelantos').insert([{
      business_id: BUSINESS_ID, employee_id: employeeId, monto, fecha, nota: nota || null,
      ...(locationId ? { location_id: locationId } : {})
    }]);
    if (error) throw error;
  },

  // Detalle de cada adelanto (no solo el total) en un rango — incluye los anulados,
  // para que se vean tachados con su motivo, igual que los gastos.
  async getAdelantosDetalle(employeeId, desdeISO, hastaISO, locationId) {
    await window.AnnlyReady;
    const { data, error } = await this._enSede(sbClient.from('adelantos').select('*')
      .eq('business_id', BUSINESS_ID).eq('employee_id', employeeId)
      .gte('fecha', desdeISO).lte('fecha', hastaISO), locationId)
      .order('fecha', { ascending: false });
    if (error) throw error;
    return (data || []).map(a => ({
      id: a.id, monto: Number(a.monto), fecha: a.fecha, nota: a.nota || '',
      anulado: a.anulado, anuladoMotivo: a.anulado_motivo || '', anuladoEn: a.anulado_en
    }));
  },

  async getAdelantosPeriodo(employeeId, desdeISO, hastaISO, locationId) {
    await window.AnnlyReady;
    const { data, error } = await this._enSede(sbClient.from('adelantos').select('monto')
      .eq('business_id', BUSINESS_ID).eq('employee_id', employeeId).eq('anulado', false)
      .gte('fecha', desdeISO).lte('fecha', hastaISO), locationId);
    if (error) throw error;
    return (data || []).reduce((s, r) => s + Number(r.monto), 0);
  },

  async anularAdelanto(id, motivo) {
    await window.AnnlyReady;
    if (!motivo || !motivo.trim()) throw new Error('Indica el motivo de la anulación.');
    const { data: filas, error } = await sbClient.from('adelantos')
      .update({ anulado: true, anulado_motivo: motivo.trim(), anulado_en: new Date().toISOString() })
      .eq('id', id).eq('business_id', BUSINESS_ID).eq('anulado', false)
      .select('id, monto');
    if (error) throw error;
    if (!filas || !filas.length) throw new Error('El adelanto ya estaba anulado o no existe.');
    await this.registrarAccion({ entidad: 'adelanto', entidadId: id, accion: 'anulado', motivo: motivo.trim(), monto: filas[0].monto });
  },

  // =======================================================
  // CIERRE DE PERIODO
  // Reglas: no se cierra antes de que termine el rango (hoy >= hasta); no se cierra si al
  // profesional le quedan citas sin completar (atrasadas o futuras) o propinas sin decidir en ese
  // rango; una cita con fecha dentro de un periodo cerrado ya no se puede completar. La pertenencia
  // de una cita a un periodo siempre se mide por su fecha de atención (appointments.fecha).
  // =======================================================

  // Fecha de hoy (hora local del navegador) en formato YYYY-MM-DD
  _hoyISO() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  },

  // Cierres de un profesional que se cruzan con el rango (evita cierres encimados si se cambió
  // de quincenal a semanal o viceversa)
  async _cierresQueSeCruzan(employeeId, desdeISO, hastaISO, locationId) {
    const { data, error } = await this._enSede(sbClient.from('cierres_profesional').select('id, periodo_desde, periodo_hasta')
      .eq('business_id', BUSINESS_ID).eq('employee_id', employeeId)
      .lte('periodo_desde', hastaISO).gte('periodo_hasta', desdeISO), locationId);
    if (error) throw error;
    return data || [];
  },

  // Cierre (de cualquiera de esos profesionales) que cubre la fecha de atención dada, o null
  // Con sedes: solo bloquea el cierre de la sede de la cita
  async getCierreQueCubre(employeeIds, fechaISO, locationId) {
    await window.AnnlyReady;
    const ids = [...new Set((employeeIds || []).filter(Boolean))];
    if (!ids.length || !fechaISO) return null;
    const { data, error } = await this._enSede(sbClient.from('cierres_profesional').select('id, employee_id, periodo_desde, periodo_hasta')
      .eq('business_id', BUSINESS_ID).in('employee_id', ids)
      .lte('periodo_desde', fechaISO).gte('periodo_hasta', fechaISO), locationId).limit(1);
    if (error) throw error;
    const c = data && data[0];
    return c ? { id: c.id, employeeId: c.employee_id, desde: c.periodo_desde, hasta: c.periodo_hasta } : null;
  },

  // Lanza error si la fecha de atención pertenece a un periodo ya cerrado
  async validarFechaAbierta(employeeIds, fechaISO, locationId) {
    const c = await this.getCierreQueCubre(employeeIds, fechaISO, locationId);
    if (c) throw new Error(`La fecha ${fechaISO} pertenece a un periodo ya cerrado (${c.desde} al ${c.hasta}). Esta cita no se puede completar.`);
  },

  // ¿Se puede cerrar este periodo para este profesional? Devuelve los motivos si no.
  async getElegibilidadCierreProfesional(employeeId, desdeISO, hastaISO, locationId) {
    await window.AnnlyReady;
    const hoy = this._hoyISO();
    const periodoTerminado = hoy >= hastaISO;
    const [citasRes, propinas, cruces] = await Promise.all([
      this._enSede(sbClient.from('appointments').select('id, fecha, hora, cliente_nombre, servicio_nombre')
        .eq('business_id', BUSINESS_ID).eq('employee_id', employeeId)
        .or('estado.is.null,estado.neq.cancelada').is('completada_en', null)
        .gte('fecha', desdeISO).lte('fecha', hastaISO), locationId)
        .order('fecha', { ascending: true }).order('hora', { ascending: true }),
      this.getPropinasPendientesPeriodo(employeeId, desdeISO, hastaISO, locationId),
      this._cierresQueSeCruzan(employeeId, desdeISO, hastaISO, locationId)
    ]);
    if (citasRes.error) throw citasRes.error;
    const citasPendientes = (citasRes.data || []).map(c => ({
      id: c.id, fecha: c.fecha, hora: c.hora || '', cliente: c.cliente_nombre || '', servicio: c.servicio_nombre || '',
      atrasada: c.fecha < hoy
    }));
    const cruce = cruces.find(c => !(c.periodo_desde === desdeISO && c.periodo_hasta === hastaISO)) || null;

    const motivos = [];
    if (!periodoTerminado) motivos.push(`El periodo termina el ${hastaISO}; se puede cerrar desde ese día.`);
    if (citasPendientes.length) {
      const atrasadas = citasPendientes.filter(c => c.atrasada).length;
      const futuras = citasPendientes.length - atrasadas;
      const partes = [];
      if (atrasadas) partes.push(`${atrasadas} atrasada${atrasadas === 1 ? '' : 's'}`);
      if (futuras) partes.push(`${futuras} por atender`);
      motivos.push(`Tiene ${citasPendientes.length} cita${citasPendientes.length === 1 ? '' : 's'} sin completar (${partes.join(', ')}). Complétalas o cancélalas desde Citas.`);
    }
    if (propinas.length) motivos.push(`Tiene ${propinas.length} propina${propinas.length === 1 ? '' : 's'} sin decidir. Resuélvelas en Comisiones y propinas.`);
    if (cruce) motivos.push(`Este rango se cruza con un cierre ya hecho (${cruce.periodo_desde} al ${cruce.periodo_hasta}).`);

    return { listo: motivos.length === 0, periodoTerminado, citasPendientes, propinasPendientes: propinas.length, motivos };
  },

  // Todos los rangos que tienen algún cierre (por profesional y/o general), del más reciente al más viejo
  async getHistorialCierres(locationId) {
    await window.AnnlyReady;
    const [prof, neg] = await Promise.all([
      this._enSede(sbClient.from('cierres_profesional').select('periodo_desde, periodo_hasta, employee_id').eq('business_id', BUSINESS_ID), locationId),
      this._enSede(sbClient.from('cierres_negocio').select('periodo_desde, periodo_hasta').eq('business_id', BUSINESS_ID), locationId)
    ]);
    if (prof.error) throw prof.error;
    if (neg.error) throw neg.error;
    const mapa = {};
    const entrada = (d, h) => {
      const k = d + '|' + h;
      if (!mapa[k]) mapa[k] = { desde: d, hasta: h, profesionales: [], general: false };
      return mapa[k];
    };
    (prof.data || []).forEach(c => entrada(c.periodo_desde, c.periodo_hasta).profesionales.push(c.employee_id));
    (neg.data || []).forEach(c => { entrada(c.periodo_desde, c.periodo_hasta).general = true; });
    return Object.values(mapa).sort((a, b) => b.desde.localeCompare(a.desde));
  },

  // Cierre ya existente para un profesional en ese rango exacto (o null si no se ha cerrado)
  async getCierreProfesional(employeeId, desdeISO, hastaISO, locationId) {
    await window.AnnlyReady;
    const { data, error } = await this._enSede(sbClient.from('cierres_profesional').select('*')
      .eq('business_id', BUSINESS_ID).eq('employee_id', employeeId)
      .eq('periodo_desde', desdeISO).eq('periodo_hasta', hastaISO), locationId).limit(1).maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return {
      id: data.id, comisionTotal: Number(data.comision_total), propinasTotal: Number(data.propinas_total),
      adelantosTotal: Number(data.adelantos_total), netoPagado: Number(data.neto_pagado),
      enviadoEn: data.enviado_en, creadoEn: data.creado_en, pdfBase64: data.pdf_base64, detalle: data.detalle
    };
  },

  // Arma el detalle completo (citas, ventas, propinas, adelantos) de un profesional en un rango
  async _detalleCierreProfesional(employeeId, desdeISO, hastaISO, locationId) {
    const [citas, ventas, propinas, adelantos] = await Promise.all([
      this._enSede(sbClient.from('appointments').select('fecha, servicio_nombre, cliente_nombre, precio_cobrado, comision_pct, comision_monto')
        .eq('business_id', BUSINESS_ID).eq('employee_id', employeeId).not('completada_en', 'is', null)
        .gte('fecha', desdeISO).lte('fecha', hastaISO), locationId),
      this._enSede(sbClient.from('local_sales').select('fecha, servicio_nombre, cliente_nombre, monto, comision_pct, comision_monto')
        .eq('business_id', BUSINESS_ID).eq('employee_id', employeeId).eq('anulada', false)
        .gte('fecha', desdeISO).lte('fecha', hastaISO), locationId),
      this._enSede(sbClient.from('propinas').select('id, fecha, cliente_nombre, servicio_nombre, monto, estado')
        .eq('business_id', BUSINESS_ID).eq('employee_id', employeeId)
        .gte('fecha', desdeISO).lte('fecha', hastaISO), locationId),
      this._enSede(sbClient.from('adelantos').select('fecha, monto, nota')
        .eq('business_id', BUSINESS_ID).eq('employee_id', employeeId).eq('anulado', false)
        .gte('fecha', desdeISO).lte('fecha', hastaISO), locationId)
    ]);
    return {
      citas: (citas.data || []).map(c => ({ fecha: c.fecha, servicio: c.servicio_nombre, cliente: c.cliente_nombre, precio: Number(c.precio_cobrado || 0), comisionPct: Number(c.comision_pct || 0), comisionMonto: Number(c.comision_monto || 0) })),
      ventas: (ventas.data || []).map(v => ({ fecha: v.fecha, servicio: v.servicio_nombre, cliente: v.cliente_nombre, precio: Number(v.monto || 0), comisionPct: Number(v.comision_pct || 0), comisionMonto: Number(v.comision_monto || 0) })),
      propinas: (propinas.data || []).map(p => ({ id: p.id, fecha: p.fecha, cliente: p.cliente_nombre, servicio: p.servicio_nombre, monto: Number(p.monto), estado: p.estado })),
      adelantos: (adelantos.data || []).map(a => ({ fecha: a.fecha, monto: Number(a.monto), nota: a.nota || '' }))
    };
  },

  // Envía tipo 'cierre_profesional' (con PDF) o 'cierre_negocio' (resumen) al Edge Function dedicado.
  // A diferencia de enviarCorreo(), este SÍ lanza error si falla — el cierre depende de que se envíe.
  // Nombre y dirección de la sede para el comprobante (null si no hay sede)
  async _datosSedeComprobante(locationId) {
    if (!locationId) return null;
    const { data } = await sbClient.from('locations').select('name, address, phone, is_main')
      .eq('id', locationId).eq('business_id', BUSINESS_ID).maybeSingle();
    return data ? { id: locationId, nombre: data.name, direccion: data.address || '', telefono: data.phone || '', esPrincipal: !!data.is_main } : null;
  },

  async enviarComprobanteCierre(tipo, datos) {
    const resp = await fetch(`${SUPABASE_URL}/functions/v1/send-cierre-comprobante`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SUPABASE_KEY}` },
      body: JSON.stringify({ tipo, businessId: BUSINESS_ID, datos })
    });
    const resultado = await resp.json();
    if (!resultado.ok) throw new Error(resultado.error || 'No se pudo enviar el comprobante.');
    return resultado;
  },

  // Cierra el periodo de un profesional: valida, arma el detalle, envía primero el comprobante
  // (si falla el envío no se escribe nada, queda igual que antes) y solo entonces lo congela en
  // cierres_profesional y resuelve las propinas que estaban programadas para este corte. No hay reversa.
  async cerrarPeriodoProfesional({ employeeId, desdeISO, hastaISO, locationId }) {
    await window.AnnlyReady;

    const yaExiste = await this.getCierreProfesional(employeeId, desdeISO, hastaISO, locationId);
    if (yaExiste) throw new Error('Este periodo ya está cerrado para este profesional' + (locationId ? ' en esta sede.' : '.'));

    const elig = await this.getElegibilidadCierreProfesional(employeeId, desdeISO, hastaISO, locationId);
    if (!elig.listo) throw new Error(elig.motivos.join(' '));

    const { data: emp } = await sbClient.from('employees').select('nombre, correo').eq('id', employeeId).maybeSingle();
    if (!emp || !emp.correo) throw new Error('Este profesional no tiene correo registrado en su ficha — agrégaselo antes de cerrar.');

    const detalle = await this._detalleCierreProfesional(employeeId, desdeISO, hastaISO, locationId);
    const sucursal = await this._datosSedeComprobante(locationId);
    const comisionTotal = Math.round((detalle.citas.reduce((s, c) => s + c.comisionMonto, 0) + detalle.ventas.reduce((s, v) => s + v.comisionMonto, 0)) * 100) / 100;
    // Propinas: solo las programadas para el corte se pagan aquí (y suman al neto).
    // Las pagadas al contado ya se entregaron: se informan aparte, no se vuelven a pagar.
    const propinasResueltas = detalle.propinas.filter(p => p.estado === 'programada_cierre');
    const propinasTotal = Math.round(propinasResueltas.reduce((s, p) => s + p.monto, 0) * 100) / 100;
    const propinasContado = Math.round(detalle.propinas.filter(p => p.estado === 'pagada_contado').reduce((s, p) => s + p.monto, 0) * 100) / 100;
    const adelantosTotal = Math.round(detalle.adelantos.reduce((s, a) => s + a.monto, 0) * 100) / 100;
    const netoPagado = Math.round((comisionTotal + propinasTotal - adelantosTotal) * 100) / 100;

    const resultado = await this.enviarComprobanteCierre('cierre_profesional', {
      employeeId, periodo: { desde: desdeISO, hasta: hastaISO }, sucursal,
      resumen: { comisionTotal, propinasTotal, propinasContado, adelantosTotal, netoPagado }, detalle
    });

    const { data: cierre, error } = await sbClient.from('cierres_profesional').insert([{
      business_id: BUSINESS_ID, employee_id: employeeId, periodo_desde: desdeISO, periodo_hasta: hastaISO,
      comision_total: comisionTotal, propinas_total: propinasTotal, adelantos_total: adelantosTotal, neto_pagado: netoPagado,
      detalle, pdf_base64: resultado.pdfBase64 || null, enviado_en: new Date().toISOString(),
      ...(locationId ? { location_id: locationId } : {})
    }]).select('id').single();
    if (error) throw error;

    if (propinasResueltas.length) {
      const { error: errProp } = await sbClient.from('propinas')
        .update({ estado: 'pagada_cierre', pagada_en: new Date().toISOString(), cierre_id: cierre.id })
        .in('id', propinasResueltas.map(p => p.id));
      if (errProp) throw errProp;
    }

    return cierre.id;
  },

  // ---------------------------------------------------------
  // REPORTES DE AGENDA (dentro del módulo Finanzas)
  // ---------------------------------------------------------
  // Citas del rango (todas, incluidas canceladas), ventas en el local del rango y, para saber si un
  // cliente es nuevo, los teléfonos de quienes ya tenían citas antes del rango.
  // ---------- Pagos de planes (etapa 1) ----------
  async registrarAvisoPago(code, concepto, monto) {
    await window.AnnlyReady;
    const { error } = await sbClient.from('pagos_plataforma').insert([{ business_id: BUSINESS_ID, concepto_code: code, concepto, monto }]);
    if (error) throw error;
  },
  async getAvisosPagoNegocio() {
    await window.AnnlyReady;
    const { data, error } = await sbClient.from('pagos_plataforma').select('*').eq('business_id', BUSINESS_ID).order('creado_en', { ascending: false }).limit(20);
    if (error) throw error;
    return data || [];
  },
  // Platform Admin: pagos de todos los negocios (los más recientes)
  async getAvisosPagoPlataforma() {
    await window.AnnlyReady;
    const { data, error } = await sbClient.from('pagos_plataforma').select('*, businesses(nombre, slug)')
      .order('creado_en', { ascending: false }).limit(60);
    if (error) throw error;
    return data || [];
  },
  // Etapa 2: crea en el servidor un enlace único de PagueloFácil por la mensualidad completa y devuelve la URL
  async crearEnlaceMensualidad(modulo, extra, plan) {
    await window.AnnlyReady;
    const { data, error } = await sbClient.functions.invoke('pf-crear-enlace', {
      body: { negocioId: BUSINESS_ID, origen: 'agenda', volverA: window.location.origin, modulo: modulo || undefined, extra: extra || undefined, plan: plan || undefined }
    });
    if (error) {
      let msg = error.message;
      try { const j = await error.context.json(); if (j && j.error) msg = j.error; } catch(_){}
      throw new Error(msg);
    }
    if (plan && !/^cambio a plan/i.test((data && data.concepto) || '')) throw new Error('El servidor todavía no está actualizado para cobrar cambios de plan. Intenta en unos minutos o escríbenos.');
    if (extra && !/adicional/i.test((data && data.concepto) || '')) throw new Error('El servidor todavía no está actualizado para cobrar extras. Intenta en unos minutos o escríbenos.');
    if (modulo && !/^m[oó]dulo/i.test((data && data.concepto) || '')) throw new Error('El servidor todavía no está actualizado para cobrar módulos. Intenta en unos minutos o escríbenos.');
    if (!data || !data.url) throw new Error((data && data.error) || 'No se pudo crear el enlace de pago.');
    return data;
  },
  // Platform Admin: todos los negocios con su suscripción vigente (para prórrogas, cortesías y acuerdos)
  async getCuentasPlataforma() {
    await window.AnnlyReady;
    const { data, error } = await sbClient.from('businesses')
      .select('id, nombre, slug, tipo_negocio, subscriptions(status, current_period_end, created_at)')
      .order('nombre', { ascending: true });
    if (error) throw error;
    return (data || []).map(b => {
      const subs = (b.subscriptions || []).filter(s => s.status !== 'cancelled' && s.status !== 'canceled')
        .sort((x, y) => String(y.created_at).localeCompare(String(x.created_at)));
      const s = subs[0] || null;
      return { id: b.id, nombre: b.nombre, slug: b.slug, tipo: b.tipo_negocio, status: s ? s.status : null, hasta: s ? s.current_period_end : null };
    });
  },
  // Platform Admin: mueve la fecha de fin de un negocio (prórroga / cortesía). Queda registrado con el motivo.
  async extenderCuenta(negocioId, hasta, motivo, activar) {
    await window.AnnlyReady;
    const { data, error } = await sbClient.rpc('admin_extender_cuenta', { p_negocio: negocioId, p_hasta: hasta, p_motivo: motivo, p_activar: !!activar });
    if (error) throw new Error(error.message);
    return data;
  },

  // ¿La cuenta del negocio está suspendida por falta de pago? (agenda pública: solo vista, sin reservas)
  async negocioSuspendido() {
    await window.AnnlyReady;
    if (!BUSINESS_ID) return false;
    const { data, error } = await sbClient.rpc('negocio_suspendido', { p_negocio: BUSINESS_ID });
    if (error) { console.warn('negocio_suspendido:', error.message); return false; } // si falla, no se bloquea
    return data === true;
  },

  // Pago de la mensualidad con Yappy: el servidor calcula el monto y crea la orden en Yappy
  async crearOrdenYappyMensualidad(aliasYappy, modulo, extra, plan) {
    await window.AnnlyReady;
    const { data, error } = await sbClient.functions.invoke('yappy-crear-orden', {
      body: { negocioId: BUSINESS_ID, origen: 'agenda', volverA: window.location.origin, aliasYappy, modulo: modulo || undefined, extra: extra || undefined, plan: plan || undefined }
    });
    if (error) {
      let msg = error.message;
      try { const j = await error.context.json(); if (j && j.error) msg = j.error; } catch(_){}
      throw new Error(msg);
    }
    if (plan && !/^cambio a plan/i.test((data && data.concepto) || '')) throw new Error('El servidor todavía no está actualizado para cobrar cambios de plan. Intenta en unos minutos o escríbenos.');
    if (extra && !/adicional/i.test((data && data.concepto) || '')) throw new Error('El servidor todavía no está actualizado para cobrar extras. Intenta en unos minutos o escríbenos.');
    if (modulo && !/^m[oó]dulo/i.test((data && data.concepto) || '')) throw new Error('El servidor todavía no está actualizado para cobrar módulos. Intenta en unos minutos o escríbenos.');
    if (!data || !data.body || !data.body.token) throw new Error((data && data.error) || 'No se pudo crear la orden de pago.');
    return data;
  },
  async resolverAvisoPago(id, estado, referencia, nota) {
    await window.AnnlyReady;
    const { error } = await sbClient.from('pagos_plataforma').update({
      estado, referencia: referencia || null, nota: nota || null, resuelto_en: new Date().toISOString()
    }).eq('id', id);
    if (error) throw error;
  },

  async getReporteAgenda(desdeISO, hastaISO, locationId) {
    await window.AnnlyReady;
    const paginar = async (armar, max = 20000) => {
      const filas = [];
      for (let i = 0; i < max; i += 1000) {
        const { data, error } = await armar().range(i, i + 999);
        if (error) throw error;
        filas.push(...(data || []));
        if (!data || data.length < 1000) break;
      }
      return filas;
    };
    // Se piden todas las columnas (*) para no fallar si alguna tiene otro nombre en la base.
    // Cada parte falla por separado: si una no carga, el resto del reporte igual se muestra.
    const seguro = (p, nombre) => p.catch(e => { console.error('[Reportes] No se pudo leer ' + nombre + ':', e); return []; });
    const [citas, ventas, previas] = await Promise.all([
      paginar(() => this._enSede(sbClient.from('appointments').select('*')
        .eq('business_id', BUSINESS_ID).gte('fecha', desdeISO).lte('fecha', hastaISO), locationId)
        .order('fecha', { ascending: true })),
      seguro(paginar(() => this._enSede(sbClient.from('local_sales').select('*')
        .eq('business_id', BUSINESS_ID).eq('anulada', false).gte('fecha', desdeISO).lte('fecha', hastaISO), locationId)), 'ventas en el local'),
      seguro(paginar(() => sbClient.from('appointments').select('cliente_telefono')
        .eq('business_id', BUSINESS_ID).neq('estado', 'cancelada').lt('fecha', desdeISO)), 'citas anteriores')
    ]);
    const tel = t => String(t || '').replace(/\D/g, '').slice(-8);
    return {
      citas,
      ventas,
      clientesPrevios: new Set(previas.map(r => tel(r.cliente_telefono)).filter(Boolean))
    };
  },

  // Estado PARCIAL a la fecha de un profesional (en una sede): no congela nada y se puede pedir
  // cuantas veces se quiera. Va desde el inicio del periodo hasta hoy (o hasta el fin si ya terminó).
  // enviar=true lo manda al correo del profesional; siempre devuelve el PDF para descargarlo.
  async estadoProfesionalALaFecha({ employeeId, desdeISO, hastaISO, locationId, enviar }) {
    await window.AnnlyReady;
    const hoy = this._hoyISO();
    const hasta = hoy < hastaISO ? hoy : hastaISO;
    if (hasta < desdeISO) throw new Error('Este periodo todavía no empieza.');

    const detalle = await this._detalleCierreProfesional(employeeId, desdeISO, hasta, locationId);
    const r2 = n => Math.round(n * 100) / 100;
    const comisionTotal = r2(detalle.citas.reduce((s, c) => s + c.comisionMonto, 0) + detalle.ventas.reduce((s, v) => s + v.comisionMonto, 0));
    const propinasTotal = r2(detalle.propinas.filter(p => p.estado === 'programada_cierre').reduce((s, p) => s + p.monto, 0));
    const propinasContado = r2(detalle.propinas.filter(p => p.estado === 'pagada_contado').reduce((s, p) => s + p.monto, 0));
    const adelantosTotal = r2(detalle.adelantos.reduce((s, a) => s + a.monto, 0));
    const netoPagado = r2(comisionTotal + propinasTotal - adelantosTotal);
    const sucursal = await this._datosSedeComprobante(locationId);

    const resultado = await this.enviarComprobanteCierre('estado_profesional', {
      employeeId, periodo: { desde: desdeISO, hasta }, sucursal, enviar: !!enviar,
      resumen: { comisionTotal, propinasTotal, propinasContado, adelantosTotal, netoPagado }, detalle
    });
    if (enviar) {
      await this.registrarAccion({ entidad: 'estado_profesional', entidadId: employeeId, accion: 'enviado',
        motivo: `Estado a la fecha ${desdeISO} al ${hasta}`, monto: netoPagado, detalle: { locationId: locationId || null, enviadoA: resultado.enviadoA || null } });
    }
    return { pdfBase64: resultado.pdfBase64, archivo: resultado.archivo, enviadoA: resultado.enviadoA || null, hasta };
  },

  // ¿Ya se puede hacer el cierre general de este periodo? (todos los profesionales activos cerrados)
  // Profesionales activos que atienden en una sede (sin sede: todos los activos)
  async _empleadosDeSede(locationId) {
    const activos = (await this.getEmpleados()).filter(e => e.activo);
    if (!locationId) return activos;
    const { data, error } = await sbClient.from('employee_locations').select('employee_id').eq('location_id', locationId);
    if (error) throw error;
    const ids = new Set((data || []).map(r => r.employee_id));
    return activos.filter(e => ids.has(e.id));
  },

  async getCierreNegocioElegibilidad(desdeISO, hastaISO, locationId) {
    await window.AnnlyReady;
    const periodoTerminado = this._hoyISO() >= hastaISO;
    const empleados = await this._empleadosDeSede(locationId);
    const faltantes = [];
    for (const e of empleados) {
      const c = await this.getCierreProfesional(e.id, desdeISO, hastaISO, locationId);
      if (!c) faltantes.push(e.nombre);
    }
    return { listo: periodoTerminado && faltantes.length === 0 && empleados.length > 0, faltantes, periodoTerminado };
  },

  async getCierreNegocio(desdeISO, hastaISO, locationId) {
    await window.AnnlyReady;
    const { data, error } = await this._enSede(sbClient.from('cierres_negocio').select('*')
      .eq('business_id', BUSINESS_ID).eq('periodo_desde', desdeISO).eq('periodo_hasta', hastaISO), locationId).limit(1).maybeSingle();
    if (error) throw error;
    return data ? { id: data.id, ingresosTotal: Number(data.ingresos_total), comisionesTotal: Number(data.comisiones_total), enviadoEn: data.enviado_en, creadoEn: data.creado_en } : null;
  },

  // Cierre general: junta lo ya cerrado por profesional y manda el resumen al correo del dueño.
  // Solo corre si todos los profesionales activos ya cerraron ese mismo periodo.
  async cerrarNegocio({ desdeISO, hastaISO, locationId }) {
    await window.AnnlyReady;

    const yaExiste = await this.getCierreNegocio(desdeISO, hastaISO, locationId);
    if (yaExiste) throw new Error('Este periodo ya tiene un cierre general' + (locationId ? ' en esta sede.' : '.'));

    const elig = await this.getCierreNegocioElegibilidad(desdeISO, hastaISO, locationId);
    if (!elig.periodoTerminado) throw new Error(`El periodo termina el ${hastaISO}; el cierre general se puede hacer desde ese día.`);
    if (!elig.listo) throw new Error('Faltan por cerrar: ' + (elig.faltantes.join(', ') || 'no hay profesionales activos'));

    const [pagos, cierresProf] = await Promise.all([
      this._enSede(sbClient.from('finance_payments').select('monto').eq('business_id', BUSINESS_ID).eq('estado', 'confirmado').gte('fecha', desdeISO).lte('fecha', hastaISO), locationId),
      this._enSede(sbClient.from('cierres_profesional').select('employee_id, comision_total, propinas_total, neto_pagado').eq('business_id', BUSINESS_ID).eq('periodo_desde', desdeISO).eq('periodo_hasta', hastaISO), locationId)
    ]);
    const ingresosTotal = Math.round((pagos.data || []).reduce((s, p) => s + Number(p.monto), 0) * 100) / 100;
    const comisionesTotal = Math.round((cierresProf.data || []).reduce((s, c) => s + Number(c.comision_total), 0) * 100) / 100;

    const empleados = await this.getEmpleados();
    const mapaNombres = Object.fromEntries(empleados.map(e => [e.id, e.nombre]));
    const porProfesional = (cierresProf.data || []).map(c => ({
      nombre: mapaNombres[c.employee_id] || 'Profesional', comisionTotal: Number(c.comision_total),
      propinasTotal: Number(c.propinas_total), netoPagado: Number(c.neto_pagado)
    }));

    const sucursal = await this._datosSedeComprobante(locationId);
    await this.enviarComprobanteCierre('cierre_negocio', {
      periodo: { desde: desdeISO, hasta: hastaISO }, sucursal,
      resumen: { ingresosTotal, comisionesTotal }, porProfesional
    });

    const { data: cierre, error } = await sbClient.from('cierres_negocio').insert([{
      business_id: BUSINESS_ID, periodo_desde: desdeISO, periodo_hasta: hastaISO,
      ingresos_total: ingresosTotal, comisiones_total: comisionesTotal, detalle: { porProfesional, sucursal },
      enviado_en: new Date().toISOString(),
      ...(locationId ? { location_id: locationId } : {})
    }]).select('id').single();
    if (error) throw error;

    return cierre.id;
  },

  // Datos de un certificado por su código (aunque ya no tenga saldo), para el detalle de una cita
  async getCertificadoPorCodigo(codigo) {
    await window.AnnlyReady;
    const cod = (codigo || '').toUpperCase().trim();
    if (!cod) return null;
    const { data, error } = await sbClient.from('gift_certificates').select('*')
      .eq('business_id', BUSINESS_ID).eq('codigo', cod).maybeSingle();
    if (error || !data) return null;
    return {
      id: data.id, codigo: data.codigo, estado: data.estado, tipo: data.tipo,
      saldoRestante: Number(data.saldo_restante), montoInicial: Number(data.monto_inicial),
      fechaVencimiento: data.fecha_vencimiento
    };
  },

  // Deja constancia en la cita de un certificado usado al completarla en el local
  // (monto usado y saldo que le quedó). Nunca pisa el certificado de otro código.
  async registrarCertificadoEnCita(citaId, { codigo, monto, saldo }) {
    await window.AnnlyReady;
    const { data: cita } = await sbClient.from('appointments')
      .select('certificado_codigo, certificado_monto')
      .eq('id', citaId).eq('business_id', BUSINESS_ID).maybeSingle();
    if (!cita) return;
    // Un certificado ya descontado en la cita no se cambia por otro; uno solo "por aplicar" (monto 0) sí
    if (cita.certificado_codigo && Number(cita.certificado_monto) > 0 && cita.certificado_codigo !== codigo) return;
    const { error } = await sbClient.from('appointments').update({
      certificado_codigo: codigo,
      certificado_monto: (Number(cita.certificado_monto) || 0) + monto,
      certificado_saldo_restante: saldo
    }).eq('id', citaId);
    if (error) console.error('No se pudo registrar el certificado en la cita:', error);
  },

  // Cobro de la venta de un certificado (efectivo, Yappy, transferencia o tarjeta).
  // Es dinero recibido, pero NO ingreso: pasa a ser ingreso cuando el certificado se canjea.
  async registrarPagosCertificado(certificateId, { codigo, compradorNombre, pagos }) {
    await window.AnnlyReady;
    const hoy = new Date();
    const fecha = hoy.getFullYear() + '-' + String(hoy.getMonth() + 1).padStart(2, '0') + '-' + String(hoy.getDate()).padStart(2, '0');
    const filas = (pagos || []).filter(p => p.monto > 0).map(p => ({
      business_id: BUSINESS_ID, origen: 'certificado', certificate_id: certificateId,
      metodo: p.metodo, monto: p.monto, referencia: p.referencia || null,
      fecha, concepto: 'Certificado ' + (codigo || ''), cliente_nombre: compradorNombre || null
    }));
    if (!filas.length) return;
    const { error } = await sbClient.from('finance_payments').insert(filas);
    if (error) throw error;
  },

  // ---------------------------------------------------------------
  // SUCURSALES
  // Un negocio tiene siempre una sucursal Principal (la crea la base de datos).
  // Las adicionales se habilitan con el módulo por cantidad SUCURSAL_ADICIONAL.
  // Una sucursal no se borra: se desactiva (queda su historial de citas y ventas).
  // ---------------------------------------------------------------
  _slugSucursal(texto) {
    return String(texto || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'sucursal';
  },

  async getSucursales() {
    await window.AnnlyReady;
    const { data, error } = await sbClient.from('locations').select('*')
      .eq('business_id', BUSINESS_ID)
      .order('is_main', { ascending: false }).order('orden', { ascending: true }).order('created_at', { ascending: true });
    if (error) throw error;
    const sucursales = data || [];
    let enlaces = [], servicios = [], serviciosDisponibles = false;
    if (sucursales.length) {
      const ids = sucursales.map(s => s.id);
      const [elRes, lsRes] = await Promise.all([
        sbClient.from('employee_locations').select('employee_id, location_id, is_primary').in('location_id', ids),
        sbClient.from('location_services').select('location_id, service_id').in('location_id', ids)
      ]);
      if (elRes.error) throw elRes.error;
      enlaces = elRes.data || [];
      // Si la tabla aún no existe (SQL 3.1 sin correr) se sigue sin servicios por sucursal
      if (lsRes.error) console.error('Servicios por sucursal no disponibles:', lsRes.error);
      else { servicios = lsRes.data || []; serviciosDisponibles = true; }
    }
    return sucursales.map(s => ({
      id: s.id, nombre: s.name, direccion: s.address || '', telefono: s.phone || '', correo: s.email || '',
      slug: s.slug || '', esPrincipal: !!s.is_main, activa: !!s.is_active, orden: s.orden || 0,
      horario: s.horario_estructurado || null,
      empleados: enlaces.filter(e => e.location_id === s.id).map(e => e.employee_id),
      servicios: serviciosDisponibles ? servicios.filter(x => x.location_id === s.id).map(x => x.service_id) : null
    }));
  },

  // Crea o edita una sucursal. Devuelve su id. La Principal no se puede desactivar.
  async guardarSucursal({ id, nombre, direccion, telefono, correo, activa, horario, horarioTexto }) {
    await window.AnnlyReady;
    const nom = (nombre || '').trim();
    if (!nom) throw new Error('Escribe el nombre de la sucursal.');

    const { data: todas, error: errT } = await sbClient.from('locations').select('id, name, slug, is_main')
      .eq('business_id', BUSINESS_ID);
    if (errT) throw errT;
    const otras = (todas || []).filter(s => s.id !== id);
    if (otras.some(s => (s.name || '').trim().toLowerCase() === nom.toLowerCase())) {
      throw new Error('Ya tienes una sucursal con ese nombre.');
    }
    const actual = id ? (todas || []).find(s => s.id === id) : null;
    if (actual && actual.is_main && activa === false) throw new Error('La sucursal principal no se puede desactivar.');

    // Identificador para el link público (?s=...), único dentro del negocio
    let slug = actual && actual.is_main ? (actual.slug || 'principal') : this._slugSucursal(nom);
    if (!(actual && actual.is_main)) {
      const usados = new Set(otras.map(s => s.slug).filter(Boolean));
      const base = slug; let n = 2;
      while (usados.has(slug)) slug = base + '-' + (n++);
    }

    const fila = {
      name: nom, address: (direccion || '').trim() || null, phone: (telefono || '').trim() || null,
      email: (correo || '').trim() || null, slug, updated_at: new Date().toISOString()
    };
    if (!(actual && actual.is_main)) fila.is_active = activa !== false;
    if (horario) fila.horario_estructurado = horario;

    if (id) {
      const { data, error } = await sbClient.from('locations').update(fila)
        .eq('id', id).eq('business_id', BUSINESS_ID).select('id');
      if (error) throw error;
      if (!data || !data.length) throw new Error('No se pudo guardar la sucursal (sin permisos).');
      // La Principal y el horario del Perfil son el mismo: se mantienen iguales
      if (actual && actual.is_main && horario) {
        const cambios = { horario_estructurado: horario };
        if (horarioTexto) cambios.horario_texto = horarioTexto;
        const { error: errB } = await sbClient.from('businesses').update(cambios).eq('id', BUSINESS_ID);
        if (errB) throw errB;
        if (window.ANNLY_BUSINESS) { window.ANNLY_BUSINESS.horario_estructurado = horario; if (horarioTexto) window.ANNLY_BUSINESS.horario_texto = horarioTexto; }
      }
      return id;
    }
    const { data, error } = await sbClient.from('locations')
      .insert([{ ...fila, business_id: BUSINESS_ID, is_main: false, orden: (todas || []).length }])
      .select('id').single();
    if (error) throw error;
    return data.id;
  },

  // Citas pendientes (hoy en adelante, sin completar ni cancelar) en una sucursal
  async contarCitasFuturasSucursal(locationId) {
    await window.AnnlyReady;
    const hoy = this._hoyISO();
    const { count, error } = await sbClient.from('appointments').select('id', { count: 'exact', head: true })
      .eq('business_id', BUSINESS_ID).eq('location_id', locationId)
      .or('estado.is.null,estado.neq.cancelada').is('completada_en', null).gte('fecha', hoy);
    if (error) throw error;
    return count || 0;
  },

  // Deja a la sucursal con exactamente estos profesionales. Un profesional nunca
  // se queda sin sucursal: si esta era la única que tenía, no se le puede quitar.
  async asignarProfesionalesSucursal(locationId, employeeIds) {
    await window.AnnlyReady;
    const deseados = [...new Set((employeeIds || []).filter(Boolean))];
    const { data: actuales, error } = await sbClient.from('employee_locations')
      .select('id, employee_id').eq('location_id', locationId);
    if (error) throw error;
    const actualesIds = (actuales || []).map(a => a.employee_id);
    const quitar = (actuales || []).filter(a => !deseados.includes(a.employee_id));
    const agregar = deseados.filter(e => !actualesIds.includes(e));

    if (quitar.length) {
      const { data: otrosEnlaces, error: errO } = await sbClient.from('employee_locations')
        .select('employee_id, location_id').in('employee_id', quitar.map(q => q.employee_id)).neq('location_id', locationId);
      if (errO) throw errO;
      const conOtra = new Set((otrosEnlaces || []).map(o => o.employee_id));
      const sinSucursal = quitar.filter(q => !conOtra.has(q.employee_id));
      if (sinSucursal.length) {
        const { data: emps } = await sbClient.from('employees').select('id, nombre').in('id', sinSucursal.map(s => s.employee_id));
        const nombres = (emps || []).map(e => e.nombre).join(', ');
        throw new Error(`${nombres || 'Un profesional'} quedaría sin ninguna sucursal. Asígnalo primero a otra sucursal.`);
      }
      const { error: errDel } = await sbClient.from('employee_locations').delete().in('id', quitar.map(q => q.id));
      if (errDel) throw errDel;
    }

    if (agregar.length) {
      const { data: yaTienen } = await sbClient.from('employee_locations').select('employee_id').in('employee_id', agregar);
      const conAlguna = new Set((yaTienen || []).map(y => y.employee_id));
      const { error: errIns } = await sbClient.from('employee_locations').insert(
        agregar.map(e => ({ employee_id: e, location_id: locationId, is_primary: !conAlguna.has(e) }))
      );
      if (errIns) throw errIns;
    }
  },

  // Profesionales activos y los servicios que realiza cada uno ([] = hace todos)

  async getEmpleadosActivosServicios() {
    await window.AnnlyReady;
    const { data, error } = await sbClient.rpc('empleados_publicos', { p_business: BUSINESS_ID });
    if (error) throw error;
    return (data || []).map(e => ({ id: e.id, servicios: e.servicios || [] }));
  },

  // Deja a la sucursal con exactamente estos servicios
  async guardarServiciosDeSucursal(locationId, serviceIds) {
    await window.AnnlyReady;
    const deseados = [...new Set((serviceIds || []).filter(Boolean))];
    const { data: actuales, error } = await sbClient.from('location_services').select('service_id').eq('location_id', locationId);
    if (error) throw error;
    const actualesIds = (actuales || []).map(a => a.service_id);
    const quitar = actualesIds.filter(x => !deseados.includes(x));
    const agregar = deseados.filter(x => !actualesIds.includes(x));
    if (quitar.length) {
      const { error: e1 } = await sbClient.from('location_services').delete().eq('location_id', locationId).in('service_id', quitar);
      if (e1) throw e1;
    }
    if (agregar.length) {
      const { error: e2 } = await sbClient.from('location_services').insert(agregar.map(x => ({ location_id: locationId, service_id: x })));
      if (e2) throw e2;
    }
  },

  // Deja a un servicio disponible en exactamente estas sucursales (solo sucursales de este negocio)
  async guardarSucursalesDeServicio(serviceId, locationIds) {
    await window.AnnlyReady;
    const { data: sucs, error: errS } = await sbClient.from('locations').select('id').eq('business_id', BUSINESS_ID);
    if (errS) throw errS;
    const delNegocio = (sucs || []).map(x => x.id);
    const deseadas = [...new Set((locationIds || []).filter(l => delNegocio.includes(l)))];
    const { data: actuales, error } = await sbClient.from('location_services').select('location_id')
      .eq('service_id', serviceId).in('location_id', delNegocio);
    if (error) throw error;
    const actualesIds = (actuales || []).map(a => a.location_id);
    const quitar = actualesIds.filter(x => !deseadas.includes(x));
    const agregar = deseadas.filter(x => !actualesIds.includes(x));
    if (quitar.length) {
      const { error: e1 } = await sbClient.from('location_services').delete().eq('service_id', serviceId).in('location_id', quitar);
      if (e1) throw e1;
    }
    if (agregar.length) {
      const { error: e2 } = await sbClient.from('location_services').insert(agregar.map(l => ({ location_id: l, service_id: serviceId })));
      if (e2) throw e2;
    }
  },

  // El horario del Perfil es el de la sucursal Principal: al guardar el Perfil se copia ahí
  async sincronizarHorarioPrincipal(horario) {
    await window.AnnlyReady;
    if (!horario) return;
    const { error } = await sbClient.from('locations').update({ horario_estructurado: horario, updated_at: new Date().toISOString() })
      .eq('business_id', BUSINESS_ID).eq('is_main', true);
    if (error) throw error;
  },

  // Horarios propios de un profesional, por sucursal: { location_id: horario }
  async getEmpleadoHorarios(empleadoId) {
    await window.AnnlyReady;
    const { data, error } = await sbClient.from('employee_schedules')
      .select('location_id, horario_estructurado').eq('employee_id', empleadoId).not('horario_estructurado', 'is', null);
    if (error) throw error;
    const mapa = {};
    (data || []).forEach(r => { if (r.location_id && !mapa[r.location_id]) mapa[r.location_id] = r.horario_estructurado; });
    return mapa;
  },

  // Horario propio del profesional en una sucursal (null = usa el de la sucursal)
  async guardarEmpleadoHorarioSucursal(empleadoId, locationId, horario) {
    await window.AnnlyReady;
    const { error: errDel } = await sbClient.from('employee_schedules').delete()
      .eq('employee_id', empleadoId).eq('location_id', locationId);
    if (errDel) throw errDel;
    if (!horario) return;
    const { error } = await sbClient.from('employee_schedules')
      .insert([{ employee_id: empleadoId, location_id: locationId, horario_estructurado: horario }]);
    if (error) throw error;
  },

  // Borra horarios propios de sucursales donde el profesional ya no atiende (y filas viejas sin sucursal)
  async limpiarHorariosEmpleado(empleadoId, locationIdsVigentes) {
    await window.AnnlyReady;
    const vigentes = (locationIdsVigentes || []).filter(Boolean);
    let q = sbClient.from('employee_schedules').delete().eq('employee_id', empleadoId);
    if (vigentes.length) q = q.or('location_id.is.null,location_id.not.in.(' + vigentes.join(',') + ')');
    const { error } = await q;
    if (error) throw error;
  },

  // Sucursales donde atiende un profesional (ids)
  async getSucursalesDeEmpleado(employeeId) {
    await window.AnnlyReady;
    const { data, error } = await sbClient.from('employee_locations').select('location_id').eq('employee_id', employeeId);
    if (error) throw error;
    return (data || []).map(r => r.location_id);
  },

  // Deja al profesional en exactamente estas sucursales (mínimo una)
  async asignarSucursalesEmpleado(employeeId, locationIds) {
    await window.AnnlyReady;
    const deseadas = [...new Set((locationIds || []).filter(Boolean))];
    if (!deseadas.length) throw new Error('El profesional debe atender al menos en una sucursal.');
    const { data: actuales, error } = await sbClient.from('employee_locations')
      .select('id, location_id').eq('employee_id', employeeId);
    if (error) throw error;
    const quitar = (actuales || []).filter(a => !deseadas.includes(a.location_id));
    const actualesIds = (actuales || []).map(a => a.location_id);
    const agregar = deseadas.filter(l => !actualesIds.includes(l));
    if (agregar.length) {
      const { error: errIns } = await sbClient.from('employee_locations').insert(
        agregar.map((l, i) => ({ employee_id: employeeId, location_id: l, is_primary: !actualesIds.length && i === 0 }))
      );
      if (errIns) throw errIns;
    }
    if (quitar.length) {
      const { error: errDel } = await sbClient.from('employee_locations').delete().in('id', quitar.map(q => q.id));
      if (errDel) throw errDel;
    }
  },

  // Sucursales adicionales contratadas (mismo esquema que Profesional adicional)
  async getSucursalesExtra(subscriptionId) {
    await window.AnnlyReady;
    const vacio = { cantidad: 0, totalMensual: 0, pendientes: [] };
    if (!subscriptionId) return vacio;
    const hoyISO = this._hoyISO();
    const { data, error } = await sbClient.from('subscription_items')
      .select('id, quantity, unit_price, created_at, cancela_el')
      .eq('subscription_id', subscriptionId).eq('item_type', 'addon')
      .eq('item_code', 'SUCURSAL_ADICIONAL').eq('is_active', true)
      .order('created_at', { ascending: true });
    if (error) { console.error('Error leyendo sucursales adicionales:', error); return vacio; }
    const vigentes = (data || []).filter(r => !r.cancela_el || r.cancela_el >= hoyISO);
    return {
      cantidad: vigentes.reduce((s, r) => s + (r.quantity || 1), 0),
      totalMensual: vigentes.reduce((s, r) => s + (Number(r.unit_price) || 0) * (r.quantity || 1), 0),
      pendientes: vigentes.filter(r => r.cancela_el).map(r => r.cancela_el).sort()
    };
  },

  async agregarSucursalExtra(subscriptionId, precio) {
    await window.AnnlyReady;
    const { error } = await sbClient.from('subscription_items').insert([{
      subscription_id: subscriptionId, item_type: 'addon', item_code: 'SUCURSAL_ADICIONAL',
      description: 'Sucursal adicional', quantity: 1, unit_price: precio, is_active: true
    }]);
    if (error) throw error;
  },

  // Da de baja UNA sucursal adicional al terminar su mes ya pagado. Devuelve la fecha de baja.
  async quitarSucursalExtra(subscriptionId) {
    await window.AnnlyReady;
    const { data, error } = await sbClient.from('subscription_items')
      .select('id, created_at')
      .eq('subscription_id', subscriptionId).eq('item_type', 'addon')
      .eq('item_code', 'SUCURSAL_ADICIONAL').eq('is_active', true).is('cancela_el', null)
      .order('created_at', { ascending: true }).limit(1);
    if (error || !data || !data.length) throw error || new Error('No hay sucursales adicionales para quitar.');
    const corte = new Date(data[0].created_at);
    const ahora = new Date();
    while (corte <= ahora) corte.setMonth(corte.getMonth() + 1);
    const fecha = corte.getFullYear() + '-' + String(corte.getMonth() + 1).padStart(2, '0') + '-' + String(corte.getDate()).padStart(2, '0');
    const { error: errUpd } = await sbClient.from('subscription_items').update({ cancela_el: fecha }).eq('id', data[0].id);
    if (errUpd) throw errUpd;
    return fecha;
  },

  // ---------------------------------------------------------------
  // PROFESIONAL ADICIONAL (módulo por cantidad)
  // Cada extra es una fila (quantity 1) con su propio precio y su propio ciclo de cobro.
  // ---------------------------------------------------------------
  async getProfesionalesExtra(subscriptionId) {
    await window.AnnlyReady;
    const vacio = { cantidad: 0, totalMensual: 0, pendientes: [] };
    if (!subscriptionId) return vacio;
    const hoy = new Date();
    const hoyISO = hoy.getFullYear() + '-' + String(hoy.getMonth() + 1).padStart(2, '0') + '-' + String(hoy.getDate()).padStart(2, '0');
    const { data, error } = await sbClient.from('subscription_items')
      .select('id, quantity, unit_price, created_at, cancela_el')
      .eq('subscription_id', subscriptionId).eq('item_type', 'addon')
      .eq('item_code', 'PROFESIONAL_ADICIONAL').eq('is_active', true)
      .order('created_at', { ascending: true });
    if (error) { console.error('Error leyendo profesionales adicionales:', error); return vacio; }
    // Uno con fecha de baja sigue contando hasta esa fecha (ya está pagado)
    const vigentes = (data || []).filter(r => !r.cancela_el || r.cancela_el >= hoyISO);
    return {
      cantidad: vigentes.reduce((s, r) => s + (r.quantity || 1), 0),
      totalMensual: vigentes.reduce((s, r) => s + (Number(r.unit_price) || 0) * (r.quantity || 1), 0),
      pendientes: vigentes.filter(r => r.cancela_el).map(r => r.cancela_el).sort()
    };
  },

  async agregarProfesionalExtra(subscriptionId, precio) {
    await window.AnnlyReady;
    const { error } = await sbClient.from('subscription_items').insert([{
      subscription_id: subscriptionId, item_type: 'addon', item_code: 'PROFESIONAL_ADICIONAL',
      description: 'Profesional adicional', quantity: 1, unit_price: precio, is_active: true
    }]);
    if (error) throw error;
  },

  // Da de baja UN profesional extra al terminar su ciclo mensual ya pagado (no se corta a mitad del mes).
  // Se toma el más antiguo que aún no tenga baja programada. Devuelve la fecha de baja.
  async quitarProfesionalExtra(subscriptionId) {
    await window.AnnlyReady;
    const { data, error } = await sbClient.from('subscription_items')
      .select('id, created_at')
      .eq('subscription_id', subscriptionId).eq('item_type', 'addon')
      .eq('item_code', 'PROFESIONAL_ADICIONAL').eq('is_active', true).is('cancela_el', null)
      .order('created_at', { ascending: true }).limit(1);
    if (error || !data || !data.length) throw error || new Error('No hay profesionales adicionales para quitar.');
    const corte = new Date(data[0].created_at);
    const ahora = new Date();
    while (corte <= ahora) corte.setMonth(corte.getMonth() + 1);
    const fecha = corte.getFullYear() + '-' + String(corte.getMonth() + 1).padStart(2, '0') + '-' + String(corte.getDate()).padStart(2, '0');
    const { error: errUpd } = await sbClient.from('subscription_items').update({ cancela_el: fecha }).eq('id', data[0].id);
    if (errUpd) throw errUpd;
    return fecha;
  },

  // Módulos que el negocio tiene disponibles ahora mismo, pensado para el sitio
  // público (visitantes SIN sesión, que por RLS no pueden leer subscriptions).
  // Lo resuelve la función SQL modulos_publicos (security definer): en trial
  // cuenta solo lo de Basic; si no, plan + addons vigentes. Devuelve null si falla.
  async getModulosPublicos() {
    await window.AnnlyReady;
    if (!BUSINESS_ID) return null;
    const { data, error } = await sbClient.rpc('modulos_publicos', { p_business_id: String(BUSINESS_ID) });
    if (error) { console.error('Error leyendo módulos públicos:', error); return null; }
    return Array.isArray(data) ? data : [];
  },

  // Todas las features marcadas como módulo adicional (is_addon = true), con su precio.
  async getCatalogoModulos() {
    await window.AnnlyReady;
    // Solo los módulos de Agenda (los de Tiendas tienen producto = 'pedidos')
    let { data, error } = await sbClient.from('features').select('*').eq('is_addon', true).eq('is_active', true).eq('producto', 'agenda').order('code');
    if (error) ({ data } = await sbClient.from('features').select('*').eq('is_addon', true).eq('is_active', true).order('code'));
    return (data || []).map(f => ({ code: f.code, name: f.name, description: f.description, price: Number(f.monthly_price) || 0 }));
  },

  // Módulos que el negocio ya activó por separado (subscription_items tipo 'addon').
  // Uno cancelado sigue contando como activo hasta que pase su fecha de corte
  // (cancela_el) — así el cliente no pierde acceso a mitad del mes que ya pagó.
  async getModulosActivos(subscriptionId) {
    await window.AnnlyReady;
    if (!subscriptionId) return [];
    const hoy = new Date().toISOString().split('T')[0];
    const { data } = await sbClient.from('subscription_items').select('item_code, cancela_el')
      .eq('subscription_id', subscriptionId).eq('item_type', 'addon').eq('is_active', true);
    return (data || [])
      .filter(r => !r.cancela_el || r.cancela_el >= hoy)
      .map(r => r.item_code);
  },

  // Detalle completo de los módulos activos del negocio (incluye si está
  // pendiente de cancelación y hasta cuándo), para pintar el estado real
  // en la pestaña Mi plan.
  async getModulosActivosDetalle(subscriptionId) {
    await window.AnnlyReady;
    if (!subscriptionId) return [];
    const hoy = new Date().toISOString().split('T')[0];
    const { data } = await sbClient.from('subscription_items').select('item_code, cancela_el, created_at')
      .eq('subscription_id', subscriptionId).eq('item_type', 'addon').eq('is_active', true);
    return (data || [])
      .filter(r => !r.cancela_el || r.cancela_el >= hoy)
      .map(r => ({ code: r.item_code, canceladoParaEl: r.cancela_el, fechaActivacion: r.created_at }));
  },

  // Activa un módulo al toque (sin cobro real todavía — ver nota en admin.html).
  async activarModulo(subscriptionId, featureCode, nombre, precio) {
    await window.AnnlyReady;
    const { error } = await sbClient.from('subscription_items').insert([{
      subscription_id: subscriptionId, item_type: 'addon', item_code: featureCode,
      description: nombre, quantity: 1, unit_price: precio, is_active: true
    }]);
    if (error) throw error;
  },

  // El negocio abandona un addon que compró — sigue activo hasta que se
  // cumpla un mes desde el día que lo activó (no se le corta a mitad de lo
  // que ya pagó). item_code puede repetirse si se reactivó antes, así que
  // se toma la fila activa (is_active) más reciente.
  async cancelarModulo(subscriptionId, featureCode) {
    await window.AnnlyReady;
    const { data: item, error: errRead } = await sbClient.from('subscription_items')
      .select('id, created_at').eq('subscription_id', subscriptionId).eq('item_code', featureCode)
      .eq('item_type', 'addon').eq('is_active', true).order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (errRead || !item) throw errRead || new Error('Módulo no encontrado.');

    const activado = new Date(item.created_at);
    const corte = new Date(activado);
    corte.setMonth(corte.getMonth() + 1);

    const { error: errUpdate } = await sbClient.from('subscription_items')
      .update({ cancela_el: corte.toISOString().split('T')[0] }).eq('id', item.id);
    if (errUpdate) throw errUpdate;

    return corte.toISOString().split('T')[0];
  },

  // A diferencia de cancelarModulo() (que mantiene el acceso hasta fin de
  // mes), esto apaga el addon YA — pensado para Pagos/Yappy: no tiene
  // sentido seguir "teniendo" el botón de cobro real activo un rato más
  // después de que el negocio pidió quitarlo. No hace nada si el módulo
  // viene incluido en el plan (nada que desactivar ahí).
  async desactivarModuloInmediato(subscriptionId, featureCode) {
    await window.AnnlyReady;
    const { error } = await sbClient.from('subscription_items')
      .update({ is_active: false }).eq('subscription_id', subscriptionId)
      .eq('item_code', featureCode).eq('item_type', 'addon').eq('is_active', true);
    if (error) throw error;
  },

  // Cambia el plan de la suscripción (sin cobro real todavía, mismo criterio que los
  // módulos). Si algún módulo comprado suelto ya viene incluido en el plan nuevo,
  // se desactiva ese cobro aparte para no cobrar dos veces por lo mismo.
  async cambiarPlan(subscriptionId, nuevoPlanCode) {
    await window.AnnlyReady;
    const { data: plan, error: errPlan } = await sbClient.from('plans').select('id').eq('code', nuevoPlanCode.toUpperCase()).maybeSingle();
    if (errPlan || !plan) throw errPlan || new Error('Plan no encontrado');

    const { error: errUpdate } = await sbClient.from('subscriptions').update({ plan_id: plan.id }).eq('id', subscriptionId);
    if (errUpdate) throw errUpdate;

    const featuresDelPlanNuevo = await this.getFeaturesDelPlan(plan.id);
    if (featuresDelPlanNuevo.length) {
      const { error: errItems } = await sbClient.from('subscription_items')
        .update({ is_active: false })
        .eq('subscription_id', subscriptionId).eq('item_type', 'addon').eq('is_active', true)
        .in('item_code', featuresDelPlanNuevo);
      if (errItems) console.error('No se pudieron desactivar los módulos ya incluidos:', errItems);
    }
  },

  // El negocio decide pagar y salir de su prueba gratis antes de que termine
  // (paga por fuera del sistema — Yappy/transferencia — y el Platform Admin
  // lo confirma aquí). En cuanto queda "activo", todo lo que ya tenía
  // seleccionado (plan + addons) se destraba de inmediato.
  async activarSuscripcion(subscriptionId) {
    await window.AnnlyReady;
    const { error } = await sbClient.from('subscriptions').update({ status: 'active' }).eq('id', subscriptionId);
    if (error) throw error;
  },

  // =======================================================
  // CERTIFICADOS Y CUPONES DE REGALO
  // =======================================================

  // Llama a la Edge Function de Supabase que arma y envía el correo
  // (mantiene la API key de Resend fuera del navegador). No lanza error
  // si falla — un correo que no sale no debe tumbar la acción principal.
  async enviarCorreo(tipo, datos) {
    try {
      const resp = await fetch(`${SUPABASE_URL}/functions/v1/send-confirmation-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SUPABASE_KEY}` },
        body: JSON.stringify({ tipo, businessId: BUSINESS_ID, datos })
      });
      const resultado = await resp.json();
      if (!resultado.ok) console.error('No se pudo enviar el correo (' + tipo + '):', resultado.error);
    } catch (e) {
      console.error('Error de red enviando correo (' + tipo + '):', e);
    }
  },

  async getCertificados() {
    await window.AnnlyReady;
    const { data, error } = await sbClient
      .from('gift_certificates')
      .select('*')
      .eq('business_id', BUSINESS_ID)
      .order('creado_en', { ascending: false });
    if (error) { console.error('Error leyendo certificados:', error); return []; }
    return (data || []).map(c => ({
      id: c.id,
      codigo: c.codigo,
      tipo: c.tipo,
      estado: c.estado,
      montoInicial: Number(c.monto_inicial),
      saldoRestante: Number(c.saldo_restante),
      compradorNombre: c.comprador_nombre,
      compradorTelefono: c.comprador_telefono,
      compradorCorreo: c.comprador_correo,
      destinatarioNombre: c.destinatario_nombre,
      destinatarioTelefono: c.destinatario_telefono,
      destinatarioCorreo: c.destinatario_correo,
      mensaje: c.mensaje,
      nota: c.nota,
      comprobante: c.comprobante,
      metodoPago: c.metodo_pago,
      fechaEmision: c.fecha_emision,
      fechaVencimiento: c.fecha_vencimiento
    }));
  },

  // Emitido por el negocio desde el panel — nace activo de una vez
  // (ya se sabe que el pago, si lo hubo, se resolvió aparte).
  async emitirCertificado({ tipo, monto, fechaVencimiento, compradorNombre, compradorTelefono, compradorCorreo, destinatarioNombre, destinatarioTelefono, destinatarioCorreo, mensaje, nota, pagos }) {
    await window.AnnlyReady;

    let codigo, intentos = 0;
    while (true) {
      codigo = 'CERT-' + Math.random().toString(16).slice(2, 6).toUpperCase() + Math.random().toString(16).slice(2, 4).toUpperCase();
      const { data: existe } = await sbClient.from('gift_certificates').select('id').eq('business_id', BUSINESS_ID).eq('codigo', codigo).maybeSingle();
      if (!existe) break;
      intentos++;
      if (intentos > 5) throw new Error('No se pudo generar un código único.');
    }

    const { data: creado, error } = await sbClient.from('gift_certificates').insert([{
      business_id: BUSINESS_ID,
      codigo,
      tipo,
      estado: 'activo',
      monto_inicial: monto,
      saldo_restante: monto,
      comprador_nombre: compradorNombre || null,
      comprador_telefono: compradorTelefono || null,
      comprador_correo: compradorCorreo || null,
      destinatario_nombre: destinatarioNombre || null,
      destinatario_telefono: destinatarioTelefono || null,
      destinatario_correo: destinatarioCorreo || null,
      mensaje: mensaje || null,
      nota: nota || null,
      fecha_vencimiento: fechaVencimiento
    }]).select('id').single();
    if (error) throw error;

    // El certificado se cobra al venderlo: se deja registrado el dinero recibido
    // (no es ingreso todavía: cuenta cuando el cliente lo canjea).
    if (pagos && pagos.length && creado) {
      try {
        await this.registrarPagosCertificado(creado.id, { codigo, compradorNombre, pagos });
      } catch (e) {
        console.error('El certificado se emitió, pero no se pudo registrar su cobro:', e);
      }
    }

    await this._notificarCertificadoActivo({
      codigo, monto, fechaVencimiento,
      compradorNombre, compradorCorreo,
      destinatarioNombre, destinatarioCorreo, mensaje
    });

    return codigo;
  },

  // Compra hecha por el cliente en el sitio público — nace pendiente de pago.
  // Solo notifica al negocio para que revise el comprobante y la confirme.

  async comprarCertificadoPublico({ monto, fechaVencimiento, compradorNombre, compradorTelefono, compradorCorreo, destinatarioNombre, destinatarioTelefono, destinatarioCorreo, mensaje, comprobante, metodoPago }) {
    await window.AnnlyReady;
    // Función segura de la base: el certificado siempre nace "pendiente de pago"
    const { data: codigo, error } = await sbClient.rpc('certificado_comprar', {
      p_business: BUSINESS_ID,
      p: { monto, fechaVencimiento, compradorNombre, compradorTelefono, compradorCorreo,
           destinatarioNombre, destinatarioTelefono, destinatarioCorreo, mensaje, comprobante, metodoPago }
    });
    if (error) throw error;
    await this.enviarCorreo('certificado_pendiente_pago', {
      monto, nombreComprador: compradorNombre, metodoPago, comprobante
    });
    return codigo;
  },

  // El negocio confirma que el pago de un certificado comprado en el sitio
  // público sí llegó — lo activa y recién ahí salen los correos al
  // comprador y al destinatario. Misma función que usará el webhook de la
  // pasarela de pagos el día que esté conectada, en vez de un click manual.
  async confirmarPagoCertificado(certificateId) {
    await window.AnnlyReady;

    const { data: cert, error: errRead } = await sbClient.from('gift_certificates').select('*').eq('id', certificateId).maybeSingle();
    if (errRead || !cert) throw errRead || new Error('Certificado no encontrado.');

    const { error: errUpdate } = await sbClient.from('gift_certificates').update({ estado: 'activo' }).eq('id', certificateId);
    if (errUpdate) throw errUpdate;

    // Compra hecha en el sitio público: al confirmar el pago queda registrado el dinero recibido
    try {
      const { data: yaRegistrado } = await sbClient.from('finance_payments').select('id')
        .eq('business_id', BUSINESS_ID).eq('certificate_id', certificateId).limit(1);
      if (!yaRegistrado || !yaRegistrado.length) {
        await this.registrarPagosCertificado(certificateId, {
          codigo: cert.codigo, compradorNombre: cert.comprador_nombre,
          pagos: [{
            metodo: cert.metodo_pago === 'yappy' ? 'yappy' : 'transferencia',
            monto: Number(cert.monto_inicial), referencia: cert.comprobante || null
          }]
        });
      }
    } catch (e) { console.error('No se pudo registrar el cobro del certificado:', e); }

    await this._notificarCertificadoActivo({
      codigo: cert.codigo, monto: Number(cert.monto_inicial), fechaVencimiento: cert.fecha_vencimiento,
      compradorNombre: cert.comprador_nombre, compradorCorreo: cert.comprador_correo,
      destinatarioNombre: cert.destinatario_nombre, destinatarioCorreo: cert.destinatario_correo,
      mensaje: cert.mensaje
    });
    await this.enviarCorreo('certificado_activado', { codigo: cert.codigo });
  },

  // Dispara los correos de comprador + destinatario de un certificado que
  // acaba de quedar activo (ya sea porque el negocio lo emitió directo, o
  // porque acaba de confirmar el pago de una compra pública).
  async _notificarCertificadoActivo({ codigo, monto, fechaVencimiento, compradorNombre, compradorCorreo, destinatarioNombre, destinatarioCorreo, mensaje }) {
    const slugNegocio = (window.ANNLY_BUSINESS && window.ANNLY_BUSINESS.slug) || '';
    const linkCertificado = window.location.origin + '/certificado.html?codigo=' + encodeURIComponent(codigo) + (slugNegocio ? '&n=' + encodeURIComponent(slugNegocio) : '');
    if (compradorCorreo) {
      await this.enviarCorreo('certificado_comprador', { codigo, monto, fechaVencimiento, nombreComprador: compradorNombre, correoComprador: compradorCorreo, nombreDestinatario: destinatarioNombre });
    }
    if (destinatarioCorreo) {
      await this.enviarCorreo('certificado_destinatario', { codigo, monto, mensaje, nombreComprador: compradorNombre, correoDestinatario: destinatarioCorreo, linkCertificado });
    }
  },

  // Usado desde el sitio público al reservar: valida el código contra el negocio actual.

  async validarCertificado(codigo) {
    await window.AnnlyReady;
    const cod = (codigo || '').toUpperCase().trim();
    if (!cod) return { valido: false, motivo: 'codigo_vacio' };
    // Función segura de la base: solo responde por el código que se escribió
    const { data, error } = await sbClient.rpc('certificado_validar', { p_business: BUSINESS_ID, p_codigo: cod });
    if (error || !data) {
      if (error) console.error('Error validando el certificado:', error);
      return { valido: false, motivo: 'codigo_no_encontrado' };
    }
    if (!data.valido) return data;
    const saldo = Number(data.saldoDisponible);
    return {
      valido: true, certificateId: data.certificateId, saldoDisponible: saldo, codigo: data.codigo,
      tipo: data.tipo, unSoloUso: data.tipo === 'cortesia',
      montoOriginal: Number(data.montoOriginal), montoDisponible: saldo,
      compradoPorNombre: data.compradoPorNombre, destinatarioNombre: data.destinatarioNombre,
      mensaje: data.mensaje, fechaVencimiento: data.fechaVencimiento
    };
  },

  // Descuenta el monto usado del saldo del certificado y deja el registro del canje.
  // Se llama al confirmar la cita en el sitio público, después de guardarCita().
  async aplicarCertificado(certificateId, montoAplicado, appointmentId) {
    await window.AnnlyReady;

    // 1) Función segura en la base (canjear_certificado): revisa el saldo, lo descuenta y
    //    registra el canje en un solo paso, con los permisos correctos aunque quien reserva
    //    sea un cliente sin sesión.
    const { data: saldoNuevo, error: errRpc } = await sbClient.rpc('canjear_certificado', {
      p_certificate_id: String(certificateId),
      p_monto: montoAplicado,
      p_appointment_id: (appointmentId !== null && appointmentId !== undefined) ? String(appointmentId) : null
    });
    if (!errRpc) return Number(saldoNuevo);

    const noExiste = /canjear_certificado|could not find the function|schema cache|PGRST202/i
      .test((errRpc.message || '') + ' ' + (errRpc.code || ''));
    if (!noExiste) throw errRpc;

    // 2) Respaldo (si esa función aún no existe): método anterior, pero verificando
    //    que el saldo realmente se actualizó.
    const { data: cert, error: errRead } = await sbClient.from('gift_certificates').select('saldo_restante, tipo').eq('id', certificateId).maybeSingle();
    if (errRead || !cert) throw errRead || new Error('Certificado no encontrado.');

    if (Number(cert.saldo_restante) - montoAplicado < 0) throw new Error('El monto aplicado supera el saldo disponible.');
    // Cortesía: de un solo uso, se consume completo aunque el servicio valga menos
    const nuevoSaldo = cert.tipo === 'cortesia' ? 0 : Number(cert.saldo_restante) - montoAplicado;

    const { data: filas, error: errUpdate } = await sbClient.from('gift_certificates')
      .update({ saldo_restante: nuevoSaldo }).eq('id', certificateId).select('id');
    if (errUpdate) throw errUpdate;
    if (!filas || !filas.length) throw new Error('No se pudo actualizar el saldo del certificado (sin permisos).');

    const filaCanje = {
      certificate_id: certificateId, business_id: BUSINESS_ID, appointment_id: appointmentId || null, monto_aplicado: montoAplicado
    };
    let { error: errInsert } = await sbClient.from('gift_certificate_redemptions').insert([{ ...filaCanje, saldo_despues: nuevoSaldo }]);
    // Si la columna saldo_despues aún no existe, se registra el canje sin ella
    if (errInsert && /saldo_despues/.test(errInsert.message || '')) {
      ({ error: errInsert } = await sbClient.from('gift_certificate_redemptions').insert([filaCanje]));
    }
    if (errInsert) console.error('No se pudo registrar el canje del certificado:', errInsert);
    return nuevoSaldo;
  },

  // Historial de canjes de un certificado — para trazabilidad ante reclamos
  // ("¿cuándo y en qué cita se usó este certificado?").
  async getCanjesCertificado(certificateId) {
    await window.AnnlyReady;
    const { data, error } = await sbClient.from('gift_certificate_redemptions')
      .select('*, appointments(servicio_nombre, fecha, hora, cliente_nombre)')
      .eq('certificate_id', certificateId)
      .order('fecha', { ascending: false });
    if (error) { console.error('Error leyendo canjes del certificado:', error); return []; }
    return (data || []).map(r => ({
      id: r.id,
      montoAplicado: Number(r.monto_aplicado),
      saldoDespues: r.saldo_despues != null ? Number(r.saldo_despues) : null,
      fecha: r.fecha,
      servicioNombre: r.appointments ? r.appointments.servicio_nombre : null,
      fechaCita: r.appointments ? r.appointments.fecha : null,
      horaCita: r.appointments ? r.appointments.hora : null,
      clienteNombre: r.appointments ? r.appointments.cliente_nombre : null
    }));
  },

  // Activar/desactivar un certificado manualmente desde el panel (ej. si
  // hay un reclamo o se detecta un abuso). "activo" reactiva uno cancelado;
  // "cancelado" lo bloquea sin importar el saldo o vencimiento que tenga.
  async cambiarEstadoCertificado(certificateId, nuevoEstado) {
    await window.AnnlyReady;
    const { error } = await sbClient.from('gift_certificates').update({ estado: nuevoEstado }).eq('id', certificateId);
    if (error) throw error;
  },

  // =======================================================
  // YAPPY COMERCIAL (botón de pago real, por negocio)
  // =======================================================

  // Solo para el panel admin (RLS: dueño o Platform Admin) — incluye el secret.
  // El Secret nunca llega al navegador: solo se sabe si ya hay uno guardado (tieneSecret).
  async getCredencialesYappy() {
    await window.AnnlyReady;
    let { data, error } = await sbClient.rpc('yappy_credenciales_estado', { p_business: BUSINESS_ID });
    if (error && yappyFuncionFaltante(error)) {
      // Transición: si la base aún no tiene la función nueva, se leen solo los datos no secretos
      const r = await sbClient.from('yappy_credentials').select('merchant_id, dominio_registrado, activo').eq('business_id', BUSINESS_ID).maybeSingle();
      if (r.error) throw r.error;
      data = r.data ? { merchantId: r.data.merchant_id, dominioRegistrado: r.data.dominio_registrado, activo: r.data.activo, tieneSecret: true } : null;
      error = null;
    }
    if (error) throw error;
    if (!data) return null;
    return {
      merchantId: data.merchantId, tieneSecret: !!data.tieneSecret,
      dominioRegistrado: data.dominioRegistrado, activo: data.activo
    };
  },

  // Guarda o actualiza las credenciales del negocio y mantiene sincronizado
  // el flag público businesses.tiene_yappy_comercial (sin secretos) que usa
  // el sitio de reservas para decidir botón real vs flujo manual.
  // secret vacío = se conserva el que ya estaba guardado.
  async guardarCredencialesYappy({ merchantId, secret, dominioRegistrado, activo }) {
    await window.AnnlyReady;
    const { error } = await sbClient.rpc('yappy_guardar', {
      p_business: BUSINESS_ID, p_merchant: merchantId, p_secret: secret || null,
      p_dominio: dominioRegistrado, p_activo: activo !== false
    });
    if (error && yappyFuncionFaltante(error)) {
      // Transición: base sin la función nueva. Sin Secret nuevo no se toca el que ya estaba guardado.
      const fila = { business_id: BUSINESS_ID, merchant_id: merchantId, dominio_registrado: dominioRegistrado, activo: activo !== false };
      if (secret) fila.secret_b64 = secret;
      const r = await sbClient.from('yappy_credentials').upsert(fila, { onConflict: 'business_id' });
      if (r.error) throw r.error;
      await sbClient.from('businesses').update({ tiene_yappy_comercial: activo !== false }).eq('id', BUSINESS_ID);
      return;
    }
    if (error) throw error;
  },

  async eliminarCredencialesYappy() {
    await window.AnnlyReady;
    const { error } = await sbClient.rpc('yappy_eliminar', { p_business: BUSINESS_ID });
    if (error && yappyFuncionFaltante(error)) {
      const r = await sbClient.from('yappy_credentials').delete().eq('business_id', BUSINESS_ID);
      if (r.error) throw r.error;
      await sbClient.from('businesses').update({ tiene_yappy_comercial: false }).eq('id', BUSINESS_ID);
      return;
    }
    if (error) throw error;
  },

  // Llamado desde el sitio público (index/404.html) al confirmar el pago del
  // abono/certificado/etc. Crea la orden en Yappy vía la Edge Function
  // (nunca con las credenciales en el navegador) y devuelve el token que
  // necesita el botón <btn-yappy> del SDK oficial para continuar el pago.
  // Devuelve {ok:false, error} en vez de lanzar excepción — el llamador
  // (el widget <btn-yappy>) necesita mostrar el error exacto inline, igual
  // que el flujo que ya tenías funcionando.
  async crearOrdenYappy({ orderId, total, aliasYappy, tipo, refId }) {
    await window.AnnlyReady;
    try {
      const resp = await fetch(`${SUPABASE_URL}/functions/v1/smooth-api`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SUPABASE_KEY}` },
        body: JSON.stringify({ businessId: BUSINESS_ID, orderId, total, aliasYappy, tipo, refId })
      });
      return await resp.json();
    } catch (e) {
      return { ok: false, error: 'Error de conexión al crear la orden de pago.' };
    }
  },

  // Consulta ligera del estado de una orden mientras el cliente completa el
  // pago en su app de Yappy (pendiente / ejecutado / rechazado / etc).
  async estadoOrdenYappy(orderId) {
    await window.AnnlyReady;
    const resp = await fetch(`${SUPABASE_URL}/functions/v1/swift-function?orderId=${encodeURIComponent(orderId)}`);
    const resultado = await resp.json();
    return resultado.ok ? resultado.estado : 'error';
  },

  // =======================================================
  // PERFIL DEL NEGOCIO
  // =======================================================

  async actualizarPerfil(datos) {

    await window.AnnlyReady;


    const {
      error
    } = await sbClient
      .from('businesses')
      .update(datos)
      .eq(
        'id',
        BUSINESS_ID
      );


    if (error) {
      throw error;
    }


    Object.assign(
      window.ANNLY_BUSINESS,
      datos
    );


    // Actualizar también la lista de negocios
    // si estamos trabajando como Platform Admin.

    if (
      window.ANNLY_PLATFORM_ADMIN &&
      Array.isArray(
        window.ANNLY_BUSINESSES
      )
    ) {

      const index =
        window.ANNLY_BUSINESSES.findIndex(
          b =>
            String(b.id) ===
            String(BUSINESS_ID)
        );


      if (index >= 0) {

        window.ANNLY_BUSINESSES[index] =
          {
            ...window.ANNLY_BUSINESSES[index],
            ...datos
          };
      }
    }
  },


  async subirLogo(file) {

    await window.AnnlyReady;


    const ext =
      (
        file.name
          .split('.')
          .pop() || 'png'
      ).toLowerCase();


    const path =
      `${BUSINESS_ID}-${Date.now()}.${ext}`;


    const {
      error: upErr
    } = await sbClient
      .storage
      .from('logos')
      .upload(
        path,
        file,
        {
          upsert: true
        }
      );


    if (upErr) {
      throw upErr;
    }


    const {
      data
    } =
      sbClient
        .storage
        .from('logos')
        .getPublicUrl(path);


    return data.publicUrl;
  }

};
