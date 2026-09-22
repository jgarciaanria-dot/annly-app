// =========================================================
// sheets.js — Adaptador Supabase COMPLETO
// Cubre index.html (sitio público) y admin.html (panel)
// =========================================================

const SUPABASE_URL = 'https://hokrimtsyseuqfjjvmxu.supabase.co';
const SUPABASE_KEY = 'sb_publishable_7JZShvbADW0URka-k_hjBQ_MSE0LM-V';

const sbClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

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


  const {
    data,
    error
  } = await sbClient
    .from('businesses')
    .select('*')
    .eq('slug', slug)
    .maybeSingle();


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
    colorSecundario
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
        colorSecundario
      }
    );
  },


  // -------------------------------------------------------
  // ¿YA HAY UN NEGOCIO REGISTRADO CON ESTE WHATSAPP?
  // Aviso suave en el registro; no bloquea (un mismo dueño puede
  // administrar varios negocios con el mismo número).
  // -------------------------------------------------------

  async existeWhatsapp(whatsapp) {
    if (!whatsapp) return false;
    const { data } = await sbClient
      .from('businesses')
      .select('id')
      .eq('whatsapp', whatsapp)
      .limit(1);
    return !!(data && data.length);
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
      colorSecundario
    }
  ) {

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

      const {
        data: existe
      } = await sbClient
        .from('businesses')
        .select('id')
        .eq('slug', slug)
        .maybeSingle();


      if (!existe) {
        break;
      }


      intento++;

      slug =
        `${base}-${intento}`;
    }


    // Trial de 14 días

    const trialVence =
      new Date();

    trialVence.setDate(
      trialVence.getDate() + 14
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
          userId

      }])
      .select()
      .single();


    if (bizError) {
      throw bizError;
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
      .eq('code', 'BASIC')
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
        s.imagen_url || null

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
        s.imagenUrl || null

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


    const {
      data: fechas
    } = await sbClient
      .from('blocked_dates')
      .select('fecha,motivo')
      .eq('business_id', BUSINESS_ID);


    const {
      data: horas
    } = await sbClient
      .from('blocked_hours')
      .select('fecha,hora')
      .eq('business_id', BUSINESS_ID);


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

  async getHorasOcupadas(
    fechaStr,
    empleadoId
  ) {

    await window.AnnlyReady;


    const fechaISO =
      parseFechaTexto(fechaStr);


    if (!fechaISO) {
      return [];
    }


    let query =
      sbClient
        .from('appointments')
        .select(
          'hora, duracion_min'
        )
        .eq(
          'business_id',
          BUSINESS_ID
        )
        .eq(
          'fecha',
          fechaISO
        )
        .neq(
          'estado',
          'cancelada'
        );


    if (empleadoId) {

      query =
        query.eq(
          'employee_id',
          empleadoId
        );
    }


    const {
      data
    } = await query;


    return (data || [])
      .map(c => ({

        hora:
          formatHoraSitio(
            c.hora
          ),

        duracion:
          c.duracion_min || 60

      }));
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
      )
      .neq(
        'estado',
        'cancelada'
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
          c.creado_en || ''

      }));
  },


  async guardarCita(cita) {

    await window.AnnlyReady;


    const fechaISO =
      parseFechaTexto(
        cita.fecha
      );


    // El saldo que le queda al certificado tras esta cita se guarda en la propia cita
    // (así aparece en los correos y en el detalle). Si esa columna aún no existe en
    // la base, se reintenta sin ella para no romper la reserva.
    const armarFila = (conSaldo) => ({

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
          fechaISO,

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

        cupon_aplicado:
          cita.cuponUsado,

        descuento_cupon:
          cita.descuentoCupon,

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

        estado:
          'confirmada'

    });

    const insertar = (fila) =>
      sbClient
        .from('appointments')
        .insert([fila])
        .select('id')
        .single();

    let { data, error } = await insertar(armarFila(true));

    if (
      error &&
      /certificado_saldo_restante/.test(error.message || '')
    ) {
      ({ data, error } = await insertar(armarFila(false)));
    }


    if (error) {

      console.error(
        'Error guardando la cita:',
        error
      );

      throw error;
    }

    return data.id;
  },


  async reprogramarCita(
    id,
    fechaISO,
    hora
  ) {

    await window.AnnlyReady;


    const {
      error
    } = await sbClient
      .from('appointments')
      .update({
        fecha: fechaISO,
        hora: hora
      })
      .eq('id', id)
      .eq(
        'business_id',
        BUSINESS_ID
      );


    if (error) {

      console.error(
        'Error reprogramando la cita:',
        error
      );

      throw error;
    }
  },


  async cancelarCita(id, motivo, detalle) {
    await window.AnnlyReady;
    const base = { estado: 'cancelada' };
    const conMotivo = motivo ? { ...base, cancelacion_motivo: motivo, cancelada_en: new Date().toISOString() } : base;
    let { error } = await sbClient.from('appointments').update(conMotivo).eq('id', id).eq('business_id', BUSINESS_ID);
    if (error && motivo) {
      // Si las columnas del motivo aún no existen, se cancela igual (el motivo queda en la bitácora)
      ({ error } = await sbClient.from('appointments').update(base).eq('id', id).eq('business_id', BUSINESS_ID));
    }
    if (error) {
      console.error('Error cancelando la cita:', error);
      throw error;
    }
    if (motivo) {
      await this.registrarAccion({ entidad: 'cita', entidadId: id, accion: 'cancelada', motivo, monto: null, detalle });
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


    const {
      data: feat
    } = await sbClient
      .from('business_features')
      .select('ruleta_premios')
      .eq(
        'business_id',
        BUSINESS_ID
      )
      .maybeSingle();


    const {
      data: premios
    } = await sbClient
      .from('roulette_prizes')
      .select('*')
      .eq(
        'business_id',
        BUSINESS_ID
      );


    return {

      activa:
        !!(
          feat &&
          feat.ruleta_premios
        ),

      premios:
        (premios || [])
          .map(p => ({

            premio:
              p.nombre,

            probabilidad:
              p.probabilidad,

            activo:
              p.activo,

            stock:
              p.stock

          }))

    };
  },


  async guardarRuletaConfig(payload) {

    await window.AnnlyReady;


    await sbClient
      .from('business_features')
      .update({
        ruleta_premios:
          payload.activa
      })
      .eq(
        'business_id',
        BUSINESS_ID
      );


    await sbClient
      .from('roulette_prizes')
      .delete()
      .eq(
        'business_id',
        BUSINESS_ID
      );


    if (payload.premios?.length) {

      await sbClient
        .from('roulette_prizes')
        .insert(

          payload.premios.map(p => ({

            business_id:
              BUSINESS_ID,

            nombre:
              p.premio,

            probabilidad:
              p.probabilidad,

            activo:
              p.activo,

            stock:
              p.stock

          }))

        );
    }
  },


  async verificarElegibilidadRuleta(tel) {

    await window.AnnlyReady;


    const {
      data: yaParticipo
    } = await sbClient
      .from('roulette_wins')
      .select('id')
      .eq(
        'business_id',
        BUSINESS_ID
      )
      .eq(
        'telefono',
        tel
      )
      .limit(1);


    if (yaParticipo?.length) {

      return {
        elegible: false
      };
    }


    const {
      data: feat
    } = await sbClient
      .from('business_features')
      .select('ruleta_premios')
      .eq(
        'business_id',
        BUSINESS_ID
      )
      .maybeSingle();


    return {

      elegible:
        !!(
          feat &&
          feat.ruleta_premios
        )

    };
  },


  async girarRuleta(
    identificador,
    nombre,
    citaId
  ) {

    await window.AnnlyReady;


    const {
      data: premios
    } = await sbClient
      .from('roulette_prizes')
      .select('*')
      .eq(
        'business_id',
        BUSINESS_ID
      )
      .eq(
        'activo',
        true
      );


    const disponibles =
      (premios || [])
        .filter(
          p =>
            p.stock === null ||
            p.stock > 0
        );


    if (!disponibles.length) {

      return {
        ok: false,
        motivo: 'sin_premios'
      };
    }


    const total =
      disponibles.reduce(
        (s, p) =>
          s + (p.probabilidad || 0),
        0
      );


    let rand =
      Math.random() * total;


    let elegido =
      disponibles[
        disponibles.length - 1
      ];


    for (
      const p of disponibles
    ) {

      rand -=
        p.probabilidad || 0;


      if (rand <= 0) {

        elegido = p;
        break;
      }
    }


    const codigo =
      genCodigoCupon();


    await sbClient
      .from('roulette_wins')
      .insert([{

        business_id:
          BUSINESS_ID,

        telefono:
          identificador,

        nombre,

        prize_id:
          elegido.id,

        codigo_cupon:
          codigo,

        usado:
          false

      }]);


    if (elegido.stock !== null) {

      await sbClient
        .from('roulette_prizes')
        .update({
          stock:
            elegido.stock - 1
        })
        .eq(
          'id',
          elegido.id
        );
    }


    return {

      ok: true,

      premio:
        elegido.nombre,

      codigoCanje:
        codigo

    };
  },


  async validarCupon(codigo) {

    await window.AnnlyReady;


    const cod =
      (codigo || '')
        .toUpperCase()
        .trim();


    if (!cod) {

      return {
        valido: false,
        motivo: 'codigo_vacio'
      };
    }


    const {
      data
    } = await sbClient
      .from('roulette_wins')
      .select('*')
      .eq(
        'business_id',
        BUSINESS_ID
      )
      .eq(
        'codigo_cupon',
        cod
      )
      .maybeSingle();


    if (!data) {

      return {
        valido: false,
        motivo: 'codigo_no_encontrado'
      };
    }


    if (data.usado) {

      return {
        valido: false,
        motivo: 'ya_canjeado'
      };
    }


    const {
      data: premio
    } = await sbClient
      .from('roulette_prizes')
      .select('nombre')
      .eq(
        'id',
        data.prize_id
      )
      .maybeSingle();


    const nombre =
      premio?.nombre || '';


    const pctMatch =
      nombre.match(
        /(\d+)\s*%/
      );


    if (pctMatch) {

      return {

        valido: true,

        tipo:
          'porcentaje',

        valor:
          parseInt(
            pctMatch[1]
          ),

        premio:
          nombre

      };
    }


    return {

      valido: true,

      tipo:
        'especial',

      premio:
        nombre

    };
  },


  async marcarCuponCanjeado(codigo) {

    await window.AnnlyReady;


    await sbClient
      .from('roulette_wins')
      .update({
        usado: true
      })
      .eq(
        'business_id',
        BUSINESS_ID
      )
      .eq(
        'codigo_cupon',
        (
          codigo || ''
        )
          .toUpperCase()
          .trim()
      );


    return {
      ok: true
    };
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
          c.notas

      }));
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


  async upsertClienteDesdeReserva(
    nombre,
    telefono,
    correo
  ) {

    await window.AnnlyReady;


    if (!telefono) {
      return;
    }


    const {
      data: existente,
      error: errBusqueda
    } = await sbClient
      .from('clients')
      .select('id')
      .eq(
        'business_id',
        BUSINESS_ID
      )
      .eq(
        'telefono',
        telefono
      )
      .maybeSingle();


    if (errBusqueda) {

      console.error(
        'Error buscando cliente existente:',
        errBusqueda
      );

      return;
    }


    if (existente) {

      const {
        error
      } = await sbClient
        .from('clients')
        .update({

          nombre,

          email:
            correo || null

        })
        .eq(
          'id',
          existente.id
        );


      if (error) {

        console.error(
          'Error actualizando cliente:',
          error
        );
      }

    } else {

      const {
        error
      } = await sbClient
        .from('clients')
        .insert([{

          business_id:
            BUSINESS_ID,

          nombre,

          telefono,

          email:
            correo || null

        }]);


      if (error) {

        console.error(
          'Error creando cliente:',
          error
        );
      }
    }
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


  async getEmpleadosParaServicio(
    serviceId
  ) {

    await window.AnnlyReady;


    // Se pide también la presentación (bio); si esa columna aún no existe en la
    // base, se reintenta sin ella para no romper el selector de profesional.
    let {
      data: empleados,
      error: errEmp
    } = await sbClient
      .from('employees')
      .select(
        'id, nombre, foto_url, bio'
      )
      .eq(
        'business_id',
        BUSINESS_ID
      )
      .eq(
        'activo',
        true
      );

    if (errEmp) {
      const reintento = await sbClient
        .from('employees')
        .select(
          'id, nombre, foto_url'
        )
        .eq(
          'business_id',
          BUSINESS_ID
        )
        .eq(
          'activo',
          true
        );
      empleados = reintento.data;
    }


    const lista =
      empleados || [];


    if (!lista.length) {
      return [];
    }


    const ids =
      lista.map(
        e => e.id
      );


    const {
      data: asignaciones
    } = await sbClient
      .from('employee_services')
      .select(
        'employee_id, service_id'
      )
      .in(
        'employee_id',
        ids
      );


    const porEmpleado = {};


    (asignaciones || [])
      .forEach(a => {

        (
          porEmpleado[
            a.employee_id
          ] ||= []
        ).push(
          a.service_id
        );

      });


    return lista
      .filter(e => {

        const asign =
          porEmpleado[e.id];


        return (
          !asign ||
          !asign.length ||
          asign.includes(serviceId)
        );

      })
      .map(e => ({

        id:
          e.id,

        nombre:
          e.nombre,

        fotoUrl:
          e.foto_url,

        bio:
          e.bio || ''

      }));
  },


  async getEmpleadoHorario(
    empleadoId
  ) {

    await window.AnnlyReady;


    // Se toma la fila que trae el horario completo (aunque hubiera filas viejas sin él)
    const {
      data
    } = await sbClient
      .from('employee_schedules')
      .select(
        'horario_estructurado'
      )
      .eq(
        'employee_id',
        empleadoId
      )
      .not(
        'horario_estructurado',
        'is',
        null
      )
      .limit(1);

    return (data && data.length)
      ? data[0].horario_estructurado
      : null;
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
      semanaInicia: (data && data.semana_inicia != null) ? data.semana_inicia : 1
    };
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
      concepto: p.concepto, cliente: p.cliente_nombre, empleadoId: p.employee_id, creadoEn: p.creado_en
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
      anulado: !!g.anulado, motivoAnulacion: g.anulado_motivo || '', anuladoEn: g.anulado_en || null
    }));
  },

  async registrarGasto(g) {
    await window.AnnlyReady;
    const { error } = await sbClient.from('finance_expenses').insert([{
      business_id: BUSINESS_ID, fecha: g.fecha, categoria: g.categoria,
      descripcion: g.descripcion || null, monto: g.monto, metodo: g.metodo,
      referencia: g.referencia || null
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
      anulada: !!v.anulada, motivoAnulacion: v.anulada_motivo || '', anuladaEn: v.anulada_en || null
    }));
  },

  // Una venta y sus pagos son cosas separadas: una venta puede tener varios pagos.
  async registrarVentaLocal(v, pagos) {
    await window.AnnlyReady;

    // Comisión: se calcula y se congela en la venta al momento de registrarla
    // (si luego cambia el % del profesional o del servicio, no altera lo ya generado)
    let comisionPct = 0, comisionMonto = 0;
    if (v.empleadoId) {
      comisionPct = await this.getComisionAplicable(v.empleadoId, v.servicio);
      comisionMonto = Math.round(Number(v.monto || 0) * comisionPct) / 100;
    }

    const { data: venta, error } = await sbClient.from('local_sales').insert([{
      business_id: BUSINESS_ID, fecha: v.fecha, cliente_nombre: v.cliente || null,
      servicio_nombre: v.servicio, employee_id: v.empleadoId || null, monto: v.monto,
      comision_pct: comisionPct, comision_monto: comisionMonto
    }]).select('id').single();
    if (error) throw error;

    const filas = (pagos || []).filter(p => p.monto > 0).map(p => ({
      business_id: BUSINESS_ID, origen: 'local', local_sale_id: venta.id,
      metodo: p.metodo, monto: p.monto, referencia: p.referencia || null,
      fecha: v.fecha, concepto: v.servicio, cliente_nombre: v.cliente || null,
      employee_id: v.empleadoId || null
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
        metodo: v.propina.metodo, fecha: v.fecha
      });
    }

    return venta.id;
  },

  // Anula una venta en el local (devolución, error de captura...): no se borra, queda en
  // el historial con su motivo, y sus pagos dejan de contar en los ingresos.
  async anularVentaLocal(id, motivo, detalle) {
    await window.AnnlyReady;
    if (!motivo || !motivo.trim()) throw new Error('Indica el motivo de la anulación.');

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
      .select('employee_id, servicio_nombre')
      .eq('id', citaId).eq('business_id', BUSINESS_ID).maybeSingle();
    const empleadoFinal = (datos.cambiarEmpleado && datos.empleadoId) ? datos.empleadoId : (citaActual && citaActual.employee_id);
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
        metodo: datos.propina.metodo, fecha: datos.fecha
      });
    }
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
      monto: Number(x.monto), fecha: x.fecha, empleadoId: x.employee_id, cliente: x.cliente_nombre, creadoEn: x.creado_en
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
  async getComisionGeneradaPeriodo(employeeId, desdeISO, hastaISO) {
    await window.AnnlyReady;
    const [citas, ventas] = await Promise.all([
      sbClient.from('appointments').select('comision_monto')
        .eq('business_id', BUSINESS_ID).eq('employee_id', employeeId)
        .not('completada_en', 'is', null)
        .gte('fecha', desdeISO).lte('fecha', hastaISO),
      sbClient.from('local_sales').select('comision_monto')
        .eq('business_id', BUSINESS_ID).eq('employee_id', employeeId).eq('anulada', false)
        .gte('fecha', desdeISO).lte('fecha', hastaISO)
    ]);
    const sum = r => (r.data || []).reduce((s, x) => s + Number(x.comision_monto || 0), 0);
    return sum(citas) + sum(ventas);
  },

  // ---- Propinas ----
  // Solo las que llegan al negocio por tarjeta/Yappy/transferencia; nacen "pendiente"
  // y se liquidan (efectivo en mano del profesional) con liquidarPropina.
  async registrarPropina({ employeeId, monto, metodo, fecha, appointmentId, localSaleId }) {
    await window.AnnlyReady;
    if (metodo === 'certificado') throw new Error('El certificado nunca cubre propina.');
    const { error } = await sbClient.from('propinas').insert([{
      business_id: BUSINESS_ID, employee_id: employeeId, monto, metodo, fecha,
      appointment_id: appointmentId || null, local_sale_id: localSaleId || null
    }]);
    if (error) throw error;
  },

  async getPropinas(employeeId, estado) {
    await window.AnnlyReady;
    let q = sbClient.from('propinas').select('*').eq('business_id', BUSINESS_ID);
    if (employeeId) q = q.eq('employee_id', employeeId);
    if (estado) q = q.eq('estado', estado);
    const { data, error } = await q.order('fecha', { ascending: false });
    if (error) throw error;
    return (data || []).map(p => ({
      id: p.id, empleadoId: p.employee_id, monto: Number(p.monto), metodo: p.metodo,
      fecha: p.fecha, estado: p.estado, pagadaEn: p.pagada_en, pagadaDetalle: p.pagada_detalle || '',
      appointmentId: p.appointment_id, localSaleId: p.local_sale_id
    }));
  },

  // Marca la propina como pagada (contado): amarrada al registro original, con el
  // detalle de cómo se liquidó.
  async liquidarPropina(id, detalle) {
    await window.AnnlyReady;
    if (!detalle || !detalle.trim()) throw new Error('Indica el detalle de cómo se pagó la propina.');
    const { data: u } = await sbClient.auth.getUser();
    const { data: filas, error } = await sbClient.from('propinas')
      .update({ estado: 'pagada', pagada_en: new Date().toISOString(), pagada_detalle: detalle.trim(), pagada_por: u && u.user ? u.user.id : null })
      .eq('id', id).eq('business_id', BUSINESS_ID).eq('estado', 'pendiente')
      .select('id, monto, employee_id');
    if (error) throw error;
    if (!filas || !filas.length) throw new Error('Esa propina ya estaba pagada o no existe.');
    await this.registrarAccion({ entidad: 'propina', entidadId: id, accion: 'pagada', motivo: detalle.trim(), monto: filas[0].monto, detalle: { employeeId: filas[0].employee_id } });
  },

  // ---- Adelantos ----
  // Contra comisión, no contra propina. desdeISO/hastaISO = periodo actual
  // (rangoPeriodoCierre(FIN.ajustes, 0) en admin.html).
  async registrarAdelanto({ employeeId, monto, fecha, nota, desdeISO, hastaISO }) {
    await window.AnnlyReady;
    const generado = await this.getComisionGeneradaPeriodo(employeeId, desdeISO, hastaISO);
    const dados = await this.getAdelantosPeriodo(employeeId, desdeISO, hastaISO);
    const disponible = generado - dados;
    if (monto > disponible) throw new Error(`El adelanto máximo disponible en este periodo es ${disponible.toFixed(2)}.`);
    const { error } = await sbClient.from('adelantos').insert([{
      business_id: BUSINESS_ID, employee_id: employeeId, monto, fecha, nota: nota || null
    }]);
    if (error) throw error;
  },

  // Detalle de cada adelanto (no solo el total) en un rango — incluye los anulados,
  // para que se vean tachados con su motivo, igual que los gastos.
  async getAdelantosDetalle(employeeId, desdeISO, hastaISO) {
    await window.AnnlyReady;
    const { data, error } = await sbClient.from('adelantos').select('*')
      .eq('business_id', BUSINESS_ID).eq('employee_id', employeeId)
      .gte('fecha', desdeISO).lte('fecha', hastaISO)
      .order('fecha', { ascending: false });
    if (error) throw error;
    return (data || []).map(a => ({
      id: a.id, monto: Number(a.monto), fecha: a.fecha, nota: a.nota || '',
      anulado: a.anulado, anuladoMotivo: a.anulado_motivo || '', anuladoEn: a.anulado_en
    }));
  },

  async getAdelantosPeriodo(employeeId, desdeISO, hastaISO) {
    await window.AnnlyReady;
    const { data, error } = await sbClient.from('adelantos').select('monto')
      .eq('business_id', BUSINESS_ID).eq('employee_id', employeeId).eq('anulado', false)
      .gte('fecha', desdeISO).lte('fecha', hastaISO);
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
    const { data } = await sbClient.from('features').select('*').eq('is_addon', true).eq('is_active', true).order('code');
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

    let codigo, intentos = 0;
    while (true) {
      codigo = 'CERT-' + Math.random().toString(16).slice(2, 6).toUpperCase() + Math.random().toString(16).slice(2, 4).toUpperCase();
      const { data: existe } = await sbClient.from('gift_certificates').select('id').eq('business_id', BUSINESS_ID).eq('codigo', codigo).maybeSingle();
      if (!existe) break;
      intentos++;
      if (intentos > 5) throw new Error('No se pudo generar un código único.');
    }

    const { error } = await sbClient.from('gift_certificates').insert([{
      business_id: BUSINESS_ID,
      codigo,
      tipo: 'venta',
      estado: 'pendiente_pago',
      monto_inicial: monto,
      saldo_restante: monto,
      comprador_nombre: compradorNombre || null,
      comprador_telefono: compradorTelefono || null,
      comprador_correo: compradorCorreo || null,
      destinatario_nombre: destinatarioNombre || null,
      destinatario_telefono: destinatarioTelefono || null,
      destinatario_correo: destinatarioCorreo || null,
      mensaje: mensaje || null,
      comprobante: comprobante || null,
      metodo_pago: metodoPago || null,
      fecha_vencimiento: fechaVencimiento
    }]);
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

    const { data } = await sbClient.from('gift_certificates').select('*')
      .eq('business_id', BUSINESS_ID).eq('codigo', cod).maybeSingle();
    if (!data) return { valido: false, motivo: 'codigo_no_encontrado' };

    if (data.estado === 'pendiente_pago') return { valido: false, motivo: 'pendiente_pago' };
    if (data.estado === 'cancelado') return { valido: false, motivo: 'cancelado' };

    const saldo = Number(data.saldo_restante);
    if (saldo <= 0) return { valido: false, motivo: 'sin_saldo' };

    const hoy = new Date().toISOString().split('T')[0];
    if (data.fecha_vencimiento && data.fecha_vencimiento < hoy) return { valido: false, motivo: 'vencido' };

    return {
      valido: true, certificateId: data.id, saldoDisponible: saldo, codigo: data.codigo,
      tipo: data.tipo, unSoloUso: data.tipo === 'cortesia',
      montoOriginal: Number(data.monto_inicial), montoDisponible: saldo,
      compradoPorNombre: data.comprador_nombre, destinatarioNombre: data.destinatario_nombre,
      mensaje: data.mensaje, fechaVencimiento: data.fecha_vencimiento
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
  async getCredencialesYappy() {
    await window.AnnlyReady;
    const { data } = await sbClient.from('yappy_credentials').select('*').eq('business_id', BUSINESS_ID).maybeSingle();
    if (!data) return null;
    return {
      merchantId: data.merchant_id, secretB64: data.secret_b64,
      dominioRegistrado: data.dominio_registrado, activo: data.activo
    };
  },

  // Guarda o actualiza las credenciales del negocio y mantiene sincronizado
  // el flag público businesses.tiene_yappy_comercial (sin secretos) que usa
  // el sitio de reservas para decidir botón real vs flujo manual.
  async guardarCredencialesYappy({ merchantId, secretB64, dominioRegistrado, activo }) {
    await window.AnnlyReady;
    const { error } = await sbClient.from('yappy_credentials').upsert({
      business_id: BUSINESS_ID, merchant_id: merchantId, secret_b64: secretB64,
      dominio_registrado: dominioRegistrado, activo: activo !== false
    }, { onConflict: 'business_id' });
    if (error) throw error;

    const { error: errBiz } = await sbClient.from('businesses')
      .update({ tiene_yappy_comercial: activo !== false }).eq('id', BUSINESS_ID);
    if (errBiz) console.error('No se pudo actualizar tiene_yappy_comercial:', errBiz);
  },

  async eliminarCredencialesYappy() {
    await window.AnnlyReady;
    const { error } = await sbClient.from('yappy_credentials').delete().eq('business_id', BUSINESS_ID);
    if (error) throw error;
    const { error: errBiz } = await sbClient.from('businesses')
      .update({ tiene_yappy_comercial: false }).eq('id', BUSINESS_ID);
    if (errBiz) console.error('No se pudo actualizar tiene_yappy_comercial:', errBiz);
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
