document.getElementById('ruletaCloseBtn').addEventListener('click', function(){
    document.getElementById('ruletaModal').classList.remove('activo');
  });

  // ============================================================
  // RUEDA DINÁMICA - se construye desde RuletaConfig, sin código fijo
  // ============================================================
  let RULETA_SEGMENTOS_ACTIVOS = [];

  const RULETA_PALETA = [
    { fill: '#F0D68C', text: '#241B10', muted: '#5C4B22' },
    { fill: '#C9A24B', text: '#241B10', muted: '#4A3B18' },
    { fill: '#8A6A24', text: '#F5F1E6', muted: '#D8D4CC' },
    { fill: '#E3C077', text: '#241B10', muted: '#5C4B22' },
    { fill: '#B8933D', text: '#241B10', muted: '#4A3B18' },
    { fill: '#6B5518', text: '#F5F1E6', muted: '#D8D4CC' }
  ];

  function ruletaPt(cx, cy, r, angleDeg){
    const rad = angleDeg * Math.PI / 180;
    return { x: (cx + r * Math.sin(rad)).toFixed(1), y: (cy - r * Math.cos(rad)).toFixed(1) };
  }

  function ruletaWordWrap(texto, maxLen){
    const palabras = texto.split(' ');
    const lineas = [];
    let actual = '';
    palabras.forEach(p => {
      if ((actual + ' ' + p).trim().length > maxLen && actual) {
        lineas.push(actual.trim());
        actual = p;
      } else {
        actual = (actual + ' ' + p).trim();
      }
    });
    if (actual) lineas.push(actual);
    return lineas.slice(0, 2); // máximo 2 líneas para que quepa
  }

  function ruletaEscapeHtml(s){
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  async function loadRuletaConfig(){
    try {
      const config = await Sheets.getRuletaConfig();
      const activos = (config.premios || []).filter(p => p.activo);
      construirRuedaDinamica(activos);
    } catch(e){
      console.error('Error cargando config de ruleta:', e);
    }
  }

  function construirRuedaDinamica(premiosActivos){
    const cont = document.getElementById('wheelSvgContainer');
    const n = premiosActivos.length;

    if (n === 0) {
      cont.innerHTML = '<p style="color:#8A7A4E;font-size:12px;text-align:center;padding:2rem 0;">La ruleta no tiene premios configurados.</p>';
      RULETA_SEGMENTOS_ACTIVOS = [];
      return;
    }

    const cx = 125, cy = 125, R = 118;
    const step = 360 / n;
    const maxLineLen = n <= 4 ? 14 : (n <= 6 ? 11 : 8);
    const fontSize = n <= 4 ? 15 : (n <= 6 ? 12 : 9);
    const lineHeight = fontSize * 1.15;

    let pathsHtml = '';
    let linesHtml = '';
    let textsHtml = '';
    const segmentos = [];

    for (let k = 0; k < n; k++) {
      const p1 = ruletaPt(cx, cy, R, k * step);
      const p2 = ruletaPt(cx, cy, R, (k + 1) * step);
      const color = RULETA_PALETA[k % RULETA_PALETA.length];
      const segId = 'seg' + k;

      pathsHtml += `<path id="${segId}" d="M${cx},${cy} L${p1.x},${p1.y} A${R},${R} 0 0,1 ${p2.x},${p2.y} Z" fill="${color.fill}"/>\n`;
      linesHtml += `<line x1="${cx}" y1="${cy}" x2="${p1.x}" y2="${p1.y}" stroke="#C9A24B" stroke-width="0.75" opacity="0.55"/>\n`;

      const midAngle = (k + 0.5) * step;
      const headline = ruletaPt(cx, cy, R * 0.62, midAngle);

      // Rotación fija tipo abanico para el TEXTO: siempre legible, nunca boca abajo
      const rotDeg = midAngle;

      const lineas = ruletaWordWrap(premiosActivos[k].premio, maxLineLen);
      const startY = parseFloat(headline.y) - ((lineas.length - 1) * lineHeight) / 2;
      const tspans = lineas.map((linea, i) =>
        `<tspan x="${headline.x}" dy="${i === 0 ? 0 : lineHeight}">${ruletaEscapeHtml(linea)}</tspan>`
      ).join('');
      textsHtml += `<text x="${headline.x}" y="${startY.toFixed(1)}" font-size="${fontSize}" font-weight="800" fill="${color.text}" text-anchor="middle" transform="rotate(${rotDeg.toFixed(1)} ${headline.x} ${startY.toFixed(1)})">${tspans}</text>\n`;

      segmentos.push({ id: segId, premio: premiosActivos[k].premio, angle: midAngle });
    }

    const dotsHtml = [
      [125.0,4.0],[162.4,9.9],[196.1,27.1],[222.9,53.9],[240.1,87.6],[246.0,125.0],
      [240.1,162.4],[222.9,196.1],[196.1,222.9],[162.4,240.1],[125.0,246.0],[87.6,240.1],
      [53.9,222.9],[27.1,196.1],[9.9,162.4],[4.0,125.0],[9.9,87.6],[27.1,53.9],[53.9,27.1],[87.6,9.9]
    ].map(([x,y]) => `<circle cx="${x}" cy="${y}" r="2.4" fill="#C9A24B"/>`).join('\n');

    cont.innerHTML = `<svg id="wheelSvg" viewBox="0 0 250 250" width="250" height="250">
      <circle cx="125" cy="125" r="122" fill="none" stroke="#C9A24B" stroke-width="1" opacity="0.6"/>
      ${pathsHtml}
      <circle cx="125" cy="125" r="118" fill="none" stroke="#C9A24B" stroke-width="1.5"/>
      ${linesHtml}
      ${dotsHtml}
      ${textsHtml}
      <circle cx="125" cy="125" r="34" fill="#0D0C0A" stroke="#C9A24B" stroke-width="2"/>
    </svg>`;

    RULETA_SEGMENTOS_ACTIVOS = segmentos;
  }

const MESES=['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

const SVC_ICONS={
  eval:'ti-clipboard-list',
  lavblower:'ti-wind',lavcrteblower:'ti-scissors',
  peinpro:'ti-sparkles',peinglam:'ti-crown',
  fastrepair:'ti-droplet',trussinfusion:'ti-leaf',
  ultimatewella:'ti-heart',celulasmadre:'ti-atom',
  combocm:'ti-star',
  highliss:'ti-wave-sine',ybera:'ti-ripple',
  retoque:'ti-circle-half',colorglobal:'ti-palette',balayage:'ti-brush',
  instexten:'ti-arrow-merge',retiromantenimiento:'ti-refresh'
};

let SERVICES=[];
let BLOQUEOS={dias:[], horas:{}};

async function loadBloqueos(){
  try {
    BLOQUEOS = await Sheets.getBloqueos();
    if(!BLOQUEOS.dias) BLOQUEOS.dias=[];
    if(!BLOQUEOS.horas) BLOQUEOS.horas={};
  } catch(e){ BLOQUEOS={dias:[], horas:{}}; }
}

function fechaISO(y,m,d){
  return y+'-'+String(m+1).padStart(2,'0')+'-'+String(d).padStart(2,'0');
}

// ===== FIX: función restaurada (se había perdido en una edición anterior) =====
async function loadServices(){
  try {
    const servicios = await Sheets.getServicios();
    if(servicios && servicios.length > 0){
      SERVICES = servicios;
      return;
    }
  } catch(e) {
    console.log('Fallback a localStorage:', e);
  }
  const saved = (window.ANNLY_BUSINESS && window.ANNLY_BUSINESS.slug === 'vicelly')
    ? localStorage.getItem('vss_hair_services') : null;
  if(saved){
    SERVICES = JSON.parse(saved);
  } else if (window.ANNLY_BUSINESS && window.ANNLY_BUSINESS.slug === 'vicelly') {
    SERVICES = getDefaultServices(); // solo Vicelly usa este catálogo de respaldo
  } else {
    SERVICES = []; // negocio nuevo: catálogo vacío de verdad
  }
}

// ===== Branding dinámico + arranque único (multi-tenant) =====
function hexToRgb(hex){
  if(!hex) return null;
  const m = hex.replace('#','').match(/.{1,2}/g);
  if(!m || m.length<3) return null;
  return m.slice(0,3).map(h=>parseInt(h,16)).join(',');
}

window.AnnlyReady.then(() => {
  const b = window.ANNLY_BUSINESS;
  if (b) {
    if (b.color_primario) {
      document.documentElement.style.setProperty('--gold', b.color_primario);
      const rgb = hexToRgb(b.color_primario);
      if (rgb) document.documentElement.style.setProperty('--gold-rgb', rgb);
    }
    if (b.color_secundario) {
      document.documentElement.style.setProperty('--gold-dark', b.color_secundario);
      const rgbDark = hexToRgb(b.color_secundario);
      if (rgbDark) document.documentElement.style.setProperty('--gold-dark-rgb', rgbDark);
    }
    const h1 = document.getElementById('hdr-nombre');
    if (h1 && b.nombre) h1.textContent = b.nombre.toUpperCase();
    if (b.logo_url) {
      document.getElementById('hdr-logo').innerHTML =
        `<img src="${b.logo_url}" alt="${b.nombre || ''}" style="width:130px;height:130px;object-fit:contain;border-radius:50%;"/>`;
    } else {
      const inicial = (b.nombre || 'A').trim().charAt(0).toUpperCase();
      document.getElementById('hdr-logo-fallback').textContent = inicial;
    }
    document.title = (b.nombre || 'Annly') + ' — Reservas';

    // Tipografía de títulos: elegante (Vicelly) o básica sans-serif (default para negocios nuevos)
    const esFuenteElegante = (b.fuente || '').toLowerCase().includes('garamond');
    document.documentElement.style.setProperty('--font-heading',
      esFuenteElegante ? "'Cormorant Garamond', serif" : "'Inter', sans-serif");

    // Modo de fondo (claro/oscuro)
    if (b.modo_fondo === 'oscuro') {
      document.body.classList.add('modo-oscuro');
    } else {
      document.body.classList.remove('modo-oscuro');
      // Modo claro: tiñe el fondo con el color del propio negocio,
      // en vez de dejar el gris neutro fijo (que era solo el de Vicelly)
      if (b.color_primario) {
        const rgbBase = hexToRgb(b.color_primario);
        if (rgbBase) {
          const mezclar = (factorBlanco) => rgbBase.split(',').map(Number)
            .map(c => Math.round(c + (255 - c) * factorBlanco)).join(',');
          document.documentElement.style.setProperty('--bg-page', 'rgb(' + mezclar(0.90) + ')');
          document.documentElement.style.setProperty('--bg-header', 'rgb(' + mezclar(0.72) + ')');
          // Footer: se tiñe con el mismo color del negocio en vez de quedar fijo en crema
          document.documentElement.style.setProperty('--bg-footer', 'rgb(' + mezclar(0.94) + ')');
          document.documentElement.style.setProperty('--footer-text', b.color_primario);
          document.documentElement.style.setProperty('--footer-text-soft', 'rgba(' + rgbBase + ',.75)');
          document.documentElement.style.setProperty('--footer-text-faint', 'rgba(' + rgbBase + ',.45)');
          document.documentElement.style.setProperty('--footer-label', b.color_secundario || b.color_primario);
        }
      }
    }

    // Texto del footer: override manual (negro/blanco) elegido en el Perfil,
    // por si el tinte automático queda poco legible con alguna paleta
    if (b.footer_texto === 'claro') {
      document.documentElement.style.setProperty('--footer-text', '#FFFFFF');
      document.documentElement.style.setProperty('--footer-text-soft', 'rgba(255,255,255,.85)');
      document.documentElement.style.setProperty('--footer-text-faint', 'rgba(255,255,255,.6)');
      document.documentElement.style.setProperty('--footer-label', '#FFFFFF');
    } else if (b.footer_texto === 'oscuro') {
      document.documentElement.style.setProperty('--footer-text', '#201b16');
      document.documentElement.style.setProperty('--footer-text-soft', 'rgba(32,27,22,.75)');
      document.documentElement.style.setProperty('--footer-text-faint', 'rgba(32,27,22,.45)');
      document.documentElement.style.setProperty('--footer-label', '#201b16');
    }

    // Tagline
    const tagEl = document.getElementById('hdr-tagline');
    if (tagEl) tagEl.textContent = b.tagline || '';
    const footerTagEl = document.getElementById('footer-tagline');
    if (footerTagEl) footerTagEl.textContent = b.footer_mensaje || '';

    // WhatsApp flotante
    const waLink = document.getElementById('wa-float-link');
    if (waLink) {
      if (b.whatsapp) { waLink.href = 'https://wa.me/' + b.whatsapp; waLink.style.display = ''; }
      else { waLink.style.display = 'none'; }
    }

    // Instagram (solo se muestra si el negocio tiene uno cargado)
    if (b.instagram) {
      document.getElementById('footer-ig-wrap').style.display = 'block';
      document.getElementById('footer-ig-link').href = 'https://www.instagram.com/' + b.instagram;
      document.getElementById('footer-ig-handle').textContent = '@' + b.instagram.replace(/^@+/, '');
    }

    // Horario y dirección
    const horEl = document.getElementById('footer-horario');
    if (horEl) horEl.innerHTML = (b.horario_texto || 'Consulta disponibilidad').replace(/\|/g, '<br>');
    const dirEl = document.getElementById('footer-direccion');
    if (dirEl) dirEl.textContent = b.direccion || '';
    const copyEl = document.getElementById('footer-copyright');
    if (copyEl) copyEl.textContent = '© ' + (b.nombre || 'Annly') + ' · Powered by Annly';

    // La franja de marcas (L'Oréal, Truss, etc.) es contenido específico
    // de Vicelly — solo se muestra para ese negocio hasta que tengamos
    // un sistema de "marcas propias" configurable por negocio.
    if (b.slug === 'vicelly') {
      document.getElementById('marcas-strip').style.display = 'block';
    }
  }
  loadServices().then(() => { renderServices(); });
  loadBloqueos();
  loadPromo();
  loadRuletaConfig();
  loadCertificadosModulo();
  try{Sheets.initSheet();}catch(e){}
});

// ===== CERTIFICADOS DE REGALO (sitio público) =====
let CERT_MODULO_DISPONIBLE = false;
let PAGOS_MODULO_DISPONIBLE = false;

async function loadCertificadosModulo(){
  try {
    const sus = await Sheets.getSuscripcionActual();
    if (!sus) return;
    // En trial, el acceso real queda limitado a lo que trae Basic —
    // el plan/addon seleccionado no cuenta hasta que haya suscripción paga.
    const enTrial = sus.status === 'trial';
    const [features, activos] = await Promise.all([
      enTrial ? Sheets.getFeaturesDePlanCode('BASIC') : Sheets.getFeaturesDelPlan(sus.plan.id),
      enTrial ? Promise.resolve([]) : Sheets.getModulosActivos(sus.subscriptionId)
    ]);
    CERT_MODULO_DISPONIBLE = features.includes('CERTIFICADOS') || activos.includes('CERTIFICADOS');
    PAGOS_MODULO_DISPONIBLE = features.includes('PAGOS') || activos.includes('PAGOS');
  } catch(e) { CERT_MODULO_DISPONIBLE = false; PAGOS_MODULO_DISPONIBLE = false; }
  const wrap = document.getElementById('cert-link-wrap');
  if (wrap) wrap.style.display = CERT_MODULO_DISPONIBLE ? 'block' : 'none';
  const subEl = document.getElementById('cert-card-sub');
  if (subEl) subEl.textContent = 'Regala una experiencia ' + ((window.ANNLY_BUSINESS && window.ANNLY_BUSINESS.nombre) || 'especial');
}

let certPagoTipo = 'yappy';

function abrirModalComprarCertificado(){
  const b = window.ANNLY_BUSINESS || {};
  const tieneYappy = !!(b.yappy_numero);
  const tieneBanco = !!(b.banco_nombre && b.banco_numero_cuenta && b.banco_titular);
  certPagoTipo = tieneYappy ? 'yappy' : 'bank';

  let pagoHtml = '';
  if (tieneYappy || tieneBanco) {
    let opciones = '';
    if (tieneYappy) {
      opciones += `<div class="pay-opt sel" id="cert-opt-yappy" onclick="selPagoCert('yappy')">
        <div><span class="pay-badge badge-yappy">Yappy</span><span class="pay-opt-title">Pagar con Yappy</span></div>
        <div class="pay-opt-sub">Envía el pago desde tu app Yappy.</div>
        <div class="pay-detail">Envía el monto al número <strong>${b.yappy_numero}</strong> y copia el comprobante aquí abajo.</div>
      </div>`;
    }
    if (tieneBanco) {
      opciones += `<div class="pay-opt${tieneYappy?'':' sel'}" id="cert-opt-bank" onclick="selPagoCert('bank')">
        <div><span class="pay-badge badge-bank">Transferencia</span><span class="pay-opt-title">${b.banco_nombre}</span></div>
        <div class="pay-opt-sub">Transferencia bancaria a cuenta ${(b.banco_tipo_cuenta||'').toLowerCase()}.</div>
        <div class="pay-detail"><strong>Banco:</strong> ${b.banco_nombre}<br>${b.banco_tipo_cuenta?`<strong>Tipo:</strong> ${b.banco_tipo_cuenta}<br>`:''}<strong>Cuenta:</strong> ${b.banco_numero_cuenta}<br><strong>Titular:</strong> ${b.banco_titular}</div>
      </div>`;
    }
    pagoHtml = `<div class="fg"><label class="flbl">Método de pago</label></div>${opciones}
      <div class="fg" style="margin-top:.875rem;"><label class="flbl">N° de comprobante / referencia</label><input class="fi" id="cert-comprobante" placeholder="Ej: YAPPY-001"/></div>`;
  } else {
    pagoHtml = `<div class="note-box-warn"><i class="ti ti-whatsapp" aria-hidden="true"></i><span>Contáctanos por WhatsApp para coordinar el pago de tu certificado.</span></div>
      <div class="fg" style="margin-top:.875rem;"><label class="flbl">N° de comprobante / referencia</label><input class="fi" id="cert-comprobante" placeholder="Ej: coordinado por WhatsApp"/></div>`;
  }

  document.getElementById('comprar-cert-body').innerHTML = `
    <div class="fg"><label class="flbl">Monto del certificado ($)</label><input class="fi" id="cert-pub-monto" type="number" min="1" step="1" placeholder="30"/></div>
    <div class="step-row"><span class="stepn">1</span><span class="step-lbl">Tus datos</span></div>
    <div class="frow">
      <div class="fg"><label class="flbl">Tu nombre</label><input class="fi" id="cert-pub-comprador-nombre"/></div>
      <div class="fg"><label class="flbl">Tu WhatsApp</label><input class="fi" id="cert-pub-comprador-telefono"/></div>
    </div>
    <div class="fg"><label class="flbl">Tu correo</label><input class="fi" id="cert-pub-comprador-correo" type="email" placeholder="tu@correo.com"/></div>
    <div class="step-row" style="margin-top:1rem;"><span class="stepn">2</span><span class="step-lbl">¿Para quién es? (opcional — déjalo vacío si es para ti)</span></div>
    <div class="fg"><label class="flbl">Nombre de quien lo recibe</label><input class="fi" id="cert-pub-destinatario-nombre"/></div>
    <div class="fg"><label class="flbl">Correo de quien lo recibe</label><input class="fi" id="cert-pub-destinatario-correo" type="email"/></div>
    <div class="fg"><label class="flbl">Mensaje (opcional)</label><input class="fi" id="cert-pub-mensaje" placeholder="Disfruta este momento..."/></div>
    <div class="step-row" style="margin-top:1rem;"><span class="stepn">3</span><span class="step-lbl">Pago</span></div>
    ${pagoHtml}
    <p id="cert-pub-msg" style="font-size:11px;color:#c0392b;margin-top:8px;min-height:14px;"></p>
    <button class="btn-main" id="btnComprarCert" onclick="enviarCompraCertificado()">Enviar compra</button>`;

  openOv('ov-comprar-certificado');
}

function selPagoCert(tipo){
  certPagoTipo = tipo;
  const optY = document.getElementById('cert-opt-yappy');
  const optB = document.getElementById('cert-opt-bank');
  if (optY) optY.classList.toggle('sel', tipo === 'yappy');
  if (optB) optB.classList.toggle('sel', tipo === 'bank');
}

async function enviarCompraCertificado(){
  const msgEl = document.getElementById('cert-pub-msg');
  const monto = parseFloat(document.getElementById('cert-pub-monto').value);
  const compradorNombre = document.getElementById('cert-pub-comprador-nombre').value.trim();
  const compradorTelefono = document.getElementById('cert-pub-comprador-telefono').value.trim();
  const compradorCorreo = document.getElementById('cert-pub-comprador-correo').value.trim();
  const comprobanteEl = document.getElementById('cert-comprobante');
  const comprobante = comprobanteEl ? comprobanteEl.value.trim() : '';

  if (!monto || monto <= 0){ msgEl.textContent = 'Ingresa un monto válido.'; return; }
  if (!compradorNombre || !compradorTelefono || !compradorCorreo){ msgEl.textContent = 'Completa tu nombre, WhatsApp y correo.'; return; }
  if (!comprobante){ msgEl.textContent = 'Ingresa el número de comprobante del pago.'; return; }

  msgEl.textContent = '';
  const btn = document.getElementById('btnComprarCert');
  if (btn){ btn.disabled = true; btn.textContent = 'Enviando...'; }

  const vencimiento = new Date();
  vencimiento.setMonth(vencimiento.getMonth() + 12);

  try {
    const destinatarioNombre = document.getElementById('cert-pub-destinatario-nombre').value.trim();
    await Sheets.comprarCertificadoPublico({
      monto, fechaVencimiento: vencimiento.toISOString().split('T')[0],
      compradorNombre, compradorTelefono, compradorCorreo,
      destinatarioNombre: destinatarioNombre || null,
      destinatarioCorreo: document.getElementById('cert-pub-destinatario-correo').value.trim() || null,
      mensaje: document.getElementById('cert-pub-mensaje').value.trim() || null,
      comprobante, metodoPago: certPagoTipo
    });
    document.getElementById('comprar-cert-body').innerHTML = `
      <div class="success-wrap">
        <div class="s-icon"><i class="ti ti-check" aria-hidden="true"></i></div>
        <div class="s-title">¡Compra recibida!</div>
        <div class="s-sub">Estamos confirmando tu pago — en cuanto quede validado te llegará el certificado por correo.</div>
        <button class="btn-main" style="background:#2E2B2B;color:#C9A96E;" onclick="closeOv('ov-comprar-certificado')">Listo</button>
      </div>`;
  } catch(e) {
    console.error('Error comprando certificado:', e);
    msgEl.textContent = 'No se pudo procesar la compra. Intenta de nuevo.';
    if (btn){ btn.disabled = false; btn.textContent = 'Enviar compra'; }
  }
}


function getDefaultServices(){
  return [
      {id:'eval',name:'Cita de Evaluación',cat:'Básicos',price:10,dur:'30 min',durMin:30,active:true,esEval:true,
        desc:'El punto de partida para cualquier servicio de color, alisado o tratamiento intensivo. Analizamos tu historial capilar, tratamientos químicos previos, tipo y textura para diseñar el plan perfecto para ti.',
        includes:['Análisis de historial capilar','Diagnóstico de tipo y textura','Revisión de tratamientos previos','Plan de servicio personalizado','Recomendación de productos','Prueba de mechón']},
      {id:'lavblower',name:'Lavado y Blower',cat:'Básicos',price:25,precioTexto:'desde $25',dur:'40–60 min',durMin:60,active:true,esEval:false,
        desc:'Limpieza profunda con productos de marcas profesionales Truss, Wella y L\'Oréal, adaptados al tipo y necesidad de tu cabello. Secado con blower profesional para un acabado con volumen, brillo y movimiento natural.',
        includes:['Lavado con champú profesional','Acondicionador o mascarilla','Protector térmico','Blower con cepillo profesional','Acabado con brillo','Asesoría de cuidado en casa']},
      {id:'lavcrteblower',name:'Lavado, Corte y Blower',cat:'Básicos',price:65,precioTexto:'desde $65',dur:'~90 min',durMin:90,active:true,esEval:false,
        desc:'Lavado técnico con productos de alta gama, corte personalizado según tu tipo de cabello y estilo de vida, más blower profesional para un resultado impecable.',
        includes:['Lavado técnico con marca profesional','Asesoría de corte personalizado','Corte a tu preferencia','Protector térmico','Blower con cepillo redondo','Acabado brillante y definido']},
      {id:'peinpro',name:'Peinado Profesional',cat:'Básicos',price:0,precioTexto:'consultar',dur:'según estilo',durMin:60,active:true,esEval:false,
        desc:'Peinado social elegante ideal para salidas, reuniones y ocasiones especiales. Adaptado a tu tipo de cabello y la ocasión, con acabado duradero.',
        includes:['Secado y preparación de cabello','Peinado a elección','Fijador profesional','Acabado duradero','Asesoría de estilo']},
      {id:'peinglam',name:'Peinado Glam & Evento',cat:'Básicos',price:0,precioTexto:'consultar',dur:'~60 min',durMin:60,active:true,esEval:false,
        desc:'Look sofisticado y moderno para eventos, celebraciones, sesiones de fotos o cualquier ocasión especial donde quieras destacar con un toque de elegancia.',
        includes:['Secado profesional','Peinado de evento o glam','Accesorios a elección','Fijador de larga duración','Retoque y detalle final']},
      {id:'fastrepair',name:'Fast Repair Truss',cat:'Tratamientos',price:65,dur:'60–90 min',durMin:90,active:true,esEval:false,
        desc:'Tratamiento de hidratación y nutrición intensiva de la marca Truss en 4 pasos. Restaura la salud del cabello dañado, aporta brillo, suavidad y reduce el frizz en todos los tipos de cabello.',
        includes:['Champú Fast Repair','Mascarilla Net Mask','Cera vegana Infusión','Sellado con calor','Blower con protectores']},
      {id:'trussinfusion',name:'Recuperación Truss Infusión',cat:'Tratamientos',price:0,precioTexto:'consultar',dur:'~2 hrs',durMin:120,active:true,esEval:false,
        desc:'El tratamiento más completo de Truss para cabello muy dañado. Combina la cera vegana Infusión, el Fast Repair de 3 productos y la mascarilla reparadora Net Mask para una recuperación profunda.',
        includes:['Cera vegana Infusión','Fast Repair 3 productos','Mascarilla reparadora Net Mask','Blower con protectores de calor','Sellado y acabado brillante']},
      {id:'ultimatewella',name:'Ultimate Repair Wella',cat:'Tratamientos',price:0,precioTexto:'consultar',dur:'consultar',durMin:90,active:true,esEval:false,
        desc:'Fórmula vegana que repara y reconstruye la fibra capilar desde adentro. Restaura la fuerza, aporta brillo y suavidad. Ideal para todo tipo de cabello, especialmente el dañado por químicos o calor.',
        includes:['Diagnóstico capilar previo','Aplicación Ultimate Repair','Tecnología de reconstrucción','Sellado de cutícula','Acabado suave y brillante']},
      {id:'celulasmadre',name:'Células Madre',cat:'Tratamientos',price:0,precioTexto:'consultar',dur:'consultar',durMin:90,active:true,esEval:false,
        desc:'Tratamiento regenerador que nutre y fortalece el cabello dañado desde la raíz. Mejora la elasticidad, el brillo y la suavidad aportando vitalidad al cabello sin vida.',
        includes:['Champú de preparación','Aplicación de células madre','Masaje capilar activador','Sellado con calor','Blower y acabado final']},
      {id:'combocm',name:'Combo Células Madre + Rubber Gel',cat:'Tratamientos',price:75,dur:'consultar',durMin:120,active:true,esEval:false,
        desc:'El combo perfecto para quienes buscan cabello y manos en un solo servicio. Brillo, suavidad, nutrición y fuerza con fórmula vegana. Ideal para cabello seco, dañado o sin vida.',
        includes:['Tratamiento Células Madre completo','Rubber Gel en manos','Brillo y suavidad garantizados','Nutrición con fórmula vegana','Acabado profesional manos y cabello']},
      {id:'highliss',name:'High Liss Orgánico Truss',cat:'Alisados',price:0,precioTexto:'consultar',dur:'3–3.5 hrs',durMin:210,active:true,esEval:false,
        desc:'Alisado progresivo orgánico de la marca Truss para control de frizz y volumen sin alisar el 100% del cabello. Resultados naturales con movimiento. Requiere evaluación previa.',
        includes:['Lavado preparatorio','Aplicación High Liss Truss','Plancha y sellado','Blower con protectores','Mantenimiento en casa indicado']},
      {id:'ybera',name:'Ybera Alisado Orgánico',cat:'Alisados',price:120,precioTexto:'desde $120',dur:'consultar',durMin:180,active:true,esEval:false,
        desc:'Alisado orgánico Ybera, el precio es por onza y media. Por lo general esta cantidad funciona para retocar raíces de aproximadamente 3 a 4 cm de crecimiento. Requiere evaluación previa.',
        includes:['Evaluación previa requerida','Lavado de preparación','Aplicación Ybera por zonas','Plancha y sellado','Asesoría de mantenimiento']},
      {id:'retoque',name:'Retoque de Raíz',cat:'Color',price:0,precioTexto:'consultar',dur:'consultar',durMin:90,active:true,esEval:false,
        desc:'Aplicación precisa de tinte solo en las raíces o zona de crecimiento para mantener el color uniforme. Lavado previo con champú que equilibra el pH y elimina residuos de productos anteriores.',
        includes:['Lavado de equilibrio de pH','Aplicación de tinte en raíces','Control de tiempo técnico','Enjuague y tratamiento post-color','Blower y acabado final']},
      {id:'colorglobal',name:'Color Global',cat:'Color',price:0,precioTexto:'consultar',dur:'4–5 hrs',durMin:270,active:true,esEval:false,
        desc:'Aplicación de tinte global para cambiar o reforzar el tono natural del cabello (no incluye decoloración). El servicio dura de 4 a 5 horas e incluye tratamientos de nutrición y protección.',
        includes:['Consulta de color previa','Lavado preparatorio','Aplicación de color completo','Tratamiento post-color','Blower profesional final']},
      {id:'balayage',name:'Balayage',cat:'Color',price:0,precioTexto:'consultar',dur:'consultar',durMin:180,active:true,esEval:false,
        desc:'Técnica de iluminación a mano libre para lograr un efecto natural y luminoso. Requiere cita de evaluación previa. Incluye preparación del cabello con tratamiento de fuerza, lípidos y proteína.',
        includes:['Cita de evaluación previa obligatoria','Preparación capilar (fuerza + lípidos)','Técnica balayage a mano libre','Tratamiento de brillo post-color','Blower y acabado final']},
      {id:'instexten',name:'Instalación de Extensiones',cat:'Extensiones',price:0,precioTexto:'consultar',dur:'variable',durMin:120,active:true,esEval:false,
        desc:'Instalación profesional de extensiones. El tiempo de servicio dependerá de la cantidad de paquetes a instalar. Incluye lavado especial y blower con protectores de calor.',
        includes:['Consulta de cantidad y método','Lavado especial pre-instalación','Instalación profesional','Blower con protectores de calor','Asesoría de mantenimiento en casa']},
      {id:'retiromantenimiento',name:'Retiro y Mantenimiento',cat:'Extensiones',price:0,precioTexto:'consultar',dur:'2–3 hrs',durMin:150,active:true,esEval:false,
        desc:'Servicio de retiro cuidadoso de extensiones + lavado especial + blower con protectores de calor. El tiempo varía según la cantidad de paquetes. No aplica abono para este servicio.',
        includes:['Retiro cuidadoso de extensiones','Lavado especial post-retiro','Mascarilla nutritiva','Blower con protectores de calor','Asesoría capilar post-extensiones']},
    ].map(s => ({requiereAbono: false, abonoMonto: null, abonoTipo: null, ...s}));
}

let curSvc=null,calY,calM,selectedDay=null,selTime=null,timerInt=null,timerSecs=300;
let empleadosDelServicio=[],empleadoSeleccionado=null,modoCualquiera=false;
let empleadoHorarioCache=null,ocupadosPorEmpleadoCache={};
let cuponAplicado=null,cuponDescuentoPct=0,cuponPremioTexto='';
let certAplicado=null; // {id, codigo, saldoDisponible}
let pagoRender=null, abonoMostrado=null;

// Fuente única de los montos de la reserva (precio, cupón, certificado y abono).
// Si el certificado cubre parte del servicio, el abono nunca puede ser mayor a lo
// que aún queda por pagar; si lo cubre completo, no se cobra abono.
function calcularMontos(){
  const precio=curSvc.price>0?curSvc.price:0;
  const esConsultar=curSvc.price<=0;
  const descuentoMonto=(!esConsultar&&cuponDescuentoPct>0)?precio*(cuponDescuentoPct/100):0;
  const precioTrasCupon=Math.max(0,precio-descuentoMonto);
  const montoCert=certAplicado?(esConsultar?certAplicado.saldoDisponible:Math.min(certAplicado.saldoDisponible,precioTrasCupon)):0;
  const precioFinal=Math.max(0,precioTrasCupon-montoCert);
  const tieneAbono=!!(curSvc.esEval||curSvc.requiereAbono);
  const abonoBase=curSvc.esEval?10:(curSvc.abonoMonto||10);
  let abono=tieneAbono?abonoBase:0;
  if(tieneAbono && !esConsultar && montoCert>0) abono=Math.min(abonoBase,precioFinal);
  return {precio,esConsultar,descuentoMonto,precioTrasCupon,montoCert,precioFinal,tieneAbono,abonoBase,abono};
}
let currentDayStr='';
const CERT_DESDE_URL = new URLSearchParams(window.location.search).get('certificado') || '';

function renderServices(){
  if(!SERVICES.length){
    document.getElementById('serviceList').innerHTML =
      `<div style="text-align:center;padding:3rem 1.5rem;color:var(--page-label-text);opacity:.7;">
        <i class="ti ti-calendar-off" style="font-size:32px;display:block;margin-bottom:.75rem;"></i>
        <p style="font-size:13px;">Este negocio todavía no tiene servicios cargados.</p>
      </div>`;
    return;
  }
  const knownOrder=['Básicos','Tratamientos','Alisados','Color','Extensiones'];
  const presentes=[...new Set(SERVICES.map(s=>s.cat).filter(Boolean))];
  const extra=presentes.filter(c=>!knownOrder.includes(c));
  const cats=[...knownOrder, ...extra];
  let html='';
  cats.forEach(cat=>{
    const svcs=SERVICES.filter(s=>s.cat===cat&&s.active);
    if(!svcs.length)return;

    if(cat==='Básicos'){
      html+=`<div class="sec-label">Básicos</div>`;
      const evalSvc=svcs.find(s=>s.esEval);
      if(evalSvc){
        html+=`<div class="eval-wrap"><div class="eval-card" onclick="openDetail('${evalSvc.id}')">
          <div class="eval-icon"><i class="ti ti-clipboard-list" aria-hidden="true"></i></div>
          <div><div class="eval-name">${evalSvc.name}</div><div class="eval-sub">Análisis capilar + prueba de mechón</div></div>
          <div class="eval-right"><div class="eval-price">$10.00</div><div class="eval-badge">descontable</div></div>
        </div></div>`;
      }
      const otros=svcs.filter(s=>!s.esEval);
      if(otros.length){
        html+=`<div class="grid">`;
        otros.forEach(s=>{
          const icon=SVC_ICONS[s.id]||'ti-star';
          html+=buildCard(s,icon);
        });
        html+=`</div>`;
      }
      return;
    }

    html+=`<div class="sec-label">${cat}</div><div class="grid">`;
    svcs.forEach((s,i)=>{
      const icon=SVC_ICONS[s.id]||'ti-star';
      const isLast=i===svcs.length-1&&svcs.length%2!==0&&svcs.length>1;
      html+=buildCard(s,icon,isLast);
    });
    html+='</div>';
  });
  html+='<div style="padding-bottom:1.5rem;"></div>';
  document.getElementById('serviceList').innerHTML=html;
}

function buildCard(s,icon,full=false){
  const precio=s.precioTexto||(s.price>0?'$'+s.price.toFixed(2):'consultar');
  const iconHtml = s.imagenUrl
    ? `<img src="${s.imagenUrl}" style="width:100%;height:100%;object-fit:cover;border-radius:12px;"/>`
    : `<i class="ti ${icon}" aria-hidden="true"></i>`;
  return `<div class="card${full?' full':''}" onclick="openDetail('${s.id}')">
    <div class="card-top"><div class="card-icon" style="${s.imagenUrl?'overflow:hidden;background:none;border:none;border-radius:12px;':''}">${iconHtml}</div><div class="card-name">${s.name}</div></div>
    <div class="card-desc">${s.desc}</div>
    <div class="card-sep"></div>
    <div class="card-footer"><span class="card-price">${precio}</span><span class="card-dur">${s.dur}</span></div>
    <div class="card-arrow"><i class="ti ti-arrow-right" aria-hidden="true"></i></div>
  </div>`;
}

function openDetail(id, esPromo){
  curSvc=SERVICES.find(s=>s.id===id);
  if(!curSvc)return;
  if(esPromo && PROMO_DATA && PROMO_DATA.precioPromo){
    curSvc={...curSvc, price:parseFloat(PROMO_DATA.precioPromo), precioTexto:null, _promo:true, _precioOriginal:curSvc.price};
  }
  const icon=SVC_ICONS[curSvc.id]||'ti-star';
  const precio=curSvc.precioTexto||(curSvc.price>0?'$'+curSvc.price.toFixed(2):'A consultar');
  const incl=curSvc.includes.map(i=>`<div class="incl-item"><span class="incl-dot"></span>${i}</div>`).join('');

  let extraBox='';
  if(curSvc.esEval){
    extraBox=`<div class="mechon-box">
      <div class="mechon-header"><i class="ti ti-test-pipe" aria-hidden="true"></i><span class="mechon-title">Prueba de mechón incluida</span></div>
      <p class="mechon-text">Realizamos una prueba de mechón para verificar la compatibilidad del color o químico con tu cabello antes de proceder. Esencial para garantizar resultados seguros y predecibles.</p>
    </div>
    <div class="note-box"><i class="ti ti-info-circle" aria-hidden="true"></i><span>El abono de <strong>$10.00</strong> se descuenta del servicio que elijas realizar. Si decides no continuar, no hay cobro adicional.</span></div>`;
  } else if(curSvc.requiereAbono){
    const montoAb=(curSvc.abonoMonto||10).toFixed(2);
    const tipoAb=curSvc.abonoTipo==='descontable'?'descontable del servicio':'no reembolsable';
    extraBox=`<div class="note-box-warn"><i class="ti ti-info-circle" aria-hidden="true"></i><span>Este servicio requiere un abono de <strong>$${montoAb}</strong> (${tipoAb}) para confirmar la cita.</span></div>
    <div class="note-box-warn"><i class="ti ti-clock" aria-hidden="true"></i><span>Política de cancelación: avisa con al menos <strong>24 horas</strong> de anticipación por WhatsApp.</span></div>`;
  } else {
    extraBox=`<div class="note-box"><i class="ti ti-info-circle" aria-hidden="true"></i><span>Este servicio no requiere abono. El pago se realiza el día de tu cita.</span></div>
    <div class="note-box-warn"><i class="ti ti-clock" aria-hidden="true"></i><span>Política de cancelación: avisa con al menos <strong>24 horas</strong> de anticipación por WhatsApp.</span></div>`;
  }

  document.getElementById('detail-title').textContent=curSvc.name;
  document.getElementById('detail-body').innerHTML=`
    <div class="svc-banner">
      <div class="svc-banner-icon" style="${curSvc.imagenUrl?'overflow:hidden;background:none;border:none;border-radius:12px;':''}">${curSvc.imagenUrl?`<img src="${curSvc.imagenUrl}" style="width:100%;height:100%;object-fit:cover;border-radius:12px;"/>`:`<i class="ti ${icon}" aria-hidden="true"></i>`}</div>
      <div>
        <div class="svc-banner-name">${curSvc.name}</div>
        <div class="svc-banner-meta">
          <span class="svc-banner-price">${curSvc._promo?`<span style="color:#aaa;text-decoration:line-through;font-weight:400;">$${curSvc._precioOriginal.toFixed(2)}</span> <span style="color:#D95F2B;">${precio}</span> <span style="background:#D95F2B;color:#fff;font-size:9px;padding:2px 7px;border-radius:999px;margin-left:4px;vertical-align:middle;">PROMO</span>`:`${precio}${curSvc.esEval?' · descontable':''}`}</span>
          <span class="svc-banner-dur">${curSvc.dur}</span>
        </div>
      </div>
    </div>
    <p class="svc-desc">${curSvc.desc}</p>
    <p class="incl-title">Incluye</p>
    <div class="incl-grid">${incl}</div>
    ${extraBox}
    <button class="btn-main" onclick="openCal()">Agendar este servicio</button>
    <button class="btn-ghost" onclick="closeOv('ov-detail')">Volver</button>`;
  openOv('ov-detail');
}

async function openCal(){
  closeOv('ov-detail');
  selectedDay=null; selTime=null;
  const now=new Date(); calY=now.getFullYear(); calM=now.getMonth();
  const precio=curSvc.precioTexto||(curSvc.price>0?'$'+curSvc.price.toFixed(2):'A consultar');
  document.getElementById('cal-svc-info').innerHTML=`
    <span class="svc-pill-name">${curSvc.name}</span>
    <div class="svc-pill-meta"><span class="svc-pill-price">${curSvc.price>0?'$'+curSvc.price.toFixed(2):curSvc.precioTexto||'A consultar'}</span><span class="svc-pill-dur">${curSvc.dur}</span></div>`;
  document.getElementById('timeSec').style.display='none';
  document.getElementById('btnContinue').disabled=true;

  // Refresca bloqueos justo antes de mostrar el calendario
  try { await loadBloqueos(); } catch(e){ console.error(e); }

  // Qué empleados hacen este servicio (si hay 0 o 1, no se pregunta nada)
  try { empleadosDelServicio = await Sheets.getEmpleadosParaServicio(curSvc.id); } catch(e){ empleadosDelServicio = []; }
  modoCualquiera = empleadosDelServicio.length > 1;
  empleadoSeleccionado = empleadosDelServicio.length === 1 ? empleadosDelServicio[0].id : null;
  empleadoHorarioCache = null;
  if (empleadosDelServicio.length === 1) {
    try { empleadoHorarioCache = await Sheets.getEmpleadoHorario(empleadoSeleccionado); } catch(e){ empleadoHorarioCache = null; }
  }
  renderSelectorEmpleado();

  renderCal();
  openOv('ov-cal');
}

function renderSelectorEmpleado(){
  const cont=document.getElementById('cal-empleado-sel');
  if (!cont) return;
  if (empleadosDelServicio.length <= 1){ cont.style.display='none'; cont.innerHTML=''; return; }
  cont.style.display='block';
  const pills = empleadosDelServicio.map(e => `
    <div class="emp-pill${(!modoCualquiera && empleadoSeleccionado===e.id)?' sel':''}" onclick="elegirEmpleado('${e.id}')">
      <div class="emp-pill-av">${e.fotoUrl?`<img src="${e.fotoUrl}"/>`:`<span>${(e.nombre||'?').trim().charAt(0).toUpperCase()}</span>`}</div>
      <span>${e.nombre}</span>
    </div>`).join('');
  cont.innerHTML = `
    <p class="emp-sel-lbl">¿Con quién?</p>
    <div class="emp-pill-row">
      <div class="emp-pill${modoCualquiera?' sel':''}" onclick="elegirEmpleado(null)">
        <div class="emp-pill-av"><i class="ti ti-users" aria-hidden="true"></i></div>
        <span>Cualquiera</span>
      </div>
      ${pills}
    </div>`;
}

async function elegirEmpleado(id){
  if (id === null){ modoCualquiera = true; empleadoSeleccionado = null; empleadoHorarioCache = null; }
  else {
    modoCualquiera = false; empleadoSeleccionado = id;
    try { empleadoHorarioCache = await Sheets.getEmpleadoHorario(id); } catch(e){ empleadoHorarioCache = null; }
  }
  renderSelectorEmpleado();
  renderCal();
  if (selectedDay) selDay2(selectedDay);
}
function bloqueDelDia(dow){ return dow===0 ? 'dom' : (dow===6 ? 'sab' : 'lv'); }

function diaCerrado(dow){
  const h = (!modoCualquiera && empleadoHorarioCache) ? empleadoHorarioCache : ((window.ANNLY_BUSINESS && window.ANNLY_BUSINESS.horario_estructurado) || null);
  if (!h) return dow===0; // si no hay horario configurado todavía, solo domingo cerrado por defecto
  const bloque = h[bloqueDelDia(dow)];
  return !bloque || !!bloque.cerrado;
}

function renderCal(){
  document.getElementById('calMoLbl').textContent=MESES[calM]+' '+calY;
  const dn=['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
  let h=dn.map((d,i)=>`<div class="cdn${i===0?' dom':''}">${d}</div>`).join('');
  const first=new Date(calY,calM,1).getDay();
  const days=new Date(calY,calM+1,0).getDate();
  const today=new Date(); today.setHours(0,0,0,0);
  for(let i=0;i<first;i++) h+=`<div class="cd emp"></div>`;
  for(let d=1;d<=days;d++){
    const dt=new Date(calY,calM,d);
    const dow=dt.getDay();
    const iso=fechaISO(calY,calM,d);
    const isBloq=BLOQUEOS.dias.some(b=>b.fecha===iso);
    const isPast=dt<today,isDom=diaCerrado(dow),isHoy=dt.getTime()===today.getTime(),isSel=selectedDay===d;
    let cls='cd';
    if(isPast) cls+=' pst';
    else if(isDom) cls+=' dom';
    else if(isBloq) cls+=' bloq';
    if(isHoy) cls+=' hoy';
    if(isSel&&!isPast&&!isDom&&!isBloq) cls+=' sel';
    const ok=!isPast&&!isDom&&!isBloq;
    const title=isBloq?'title="No disponible"':'';
    h+=`<div class="${cls}" ${title} ${ok?`onclick="selDay2(${d})"`:''} >${d}</div>`;
  }
  document.getElementById('calGrid').innerHTML=h;
}

function timeToMin(t){const[h,m]=t.split(':').map(Number);return h*60+m;}

function genSlots(){
  const dt=new Date(calY,calM,selectedDay);
  const dow=dt.getDay();
  const horarioBase=(!modoCualquiera && empleadoHorarioCache) ? empleadoHorarioCache : (window.ANNLY_BUSINESS && window.ANNLY_BUSINESS.horario_estructurado);
  const bloqueCfg=(horarioBase && horarioBase[bloqueDelDia(dow)]) || null;

  let hIni=8, mIni=0, hFin=16, mFin=0; // respaldo si no hay horario configurado
  if (bloqueCfg && !bloqueCfg.cerrado && bloqueCfg.abre && bloqueCfg.cierra) {
    [hIni,mIni]=bloqueCfg.abre.split(':').map(Number);
    [hFin,mFin]=bloqueCfg.cierra.split(':').map(Number);
  } else if (bloqueCfg && bloqueCfg.cerrado) {
    return []; // cerrado ese día — sin horarios disponibles
  }

  const slots=[];
  let h=hIni,m=mIni;
  while(h<hFin||(h===hFin&&m===mFin)){
    const key=h+':'+(m===0?'00':'30');
    const lbl=(h>12?h-12:h)+':'+(m===0?'00':'30')+(h>=12?' PM':' AM');
    slots.push({key,lbl});
    m+=30; if(m>=60){m=0;h++;}
  }
  const now=new Date();
  const esHoy=selectedDay===now.getDate()&&calM===now.getMonth()&&calY===now.getFullYear();
  if(esHoy){
    const nowMin=now.getHours()*60+now.getMinutes();
    return slots.filter(s=>timeToMin(s.key)>nowMin);
  }
  return slots;
}

function isBlocked(slotKey,citas,durSvc){
  const slotMin=timeToMin(slotKey);
  for(const c of citas){
    const occMin=timeToMin(c.hora);
    const occDur=parseInt(c.duracion)||60;
    if(slotMin<occMin+occDur && slotMin+durSvc>occMin) return true;
  }
  return false;
}

async function selDay2(d){
  selectedDay=d; selTime=null;
  renderCal();
  document.getElementById('timeSec').style.display='block';
  document.getElementById('btnContinue').disabled=true;
  document.getElementById('timeGrid').innerHTML='<p style="color:#aaa;font-size:11px;grid-column:span 4;text-align:center;padding:.5rem;">Consultando disponibilidad...</p>';
  const fechaStr=d+' de '+MESES[calM]+' '+calY;
  try{
    if (modoCualquiera && empleadosDelServicio.length > 1){
      const resultados = await Promise.all(empleadosDelServicio.map(e => Sheets.getHorasOcupadas(fechaStr, e.id).catch(()=>[])));
      ocupadosPorEmpleadoCache = {};
      empleadosDelServicio.forEach((e,i) => { ocupadosPorEmpleadoCache[e.id] = resultados[i]; });
      window._citasOcupadas = null;
    } else {
      window._citasOcupadas = await Sheets.getHorasOcupadas(fechaStr, empleadoSeleccionado);
      ocupadosPorEmpleadoCache = {};
    }
  }catch(e){ window._citasOcupadas=[]; ocupadosPorEmpleadoCache={}; }
  renderTimes();
}

function renderTimes(){
  const durSvc=curSvc.durMin||60;
  const slots=genSlots();
  const grid=document.getElementById('timeGrid');
  const iso=fechaISO(calY,calM,selectedDay);
  const horasBloqueadas=BLOQUEOS.horas[iso]||[];
  grid.innerHTML='';
  slots.forEach(({key,lbl})=>{
    let ocupada;
    if (modoCualquiera && empleadosDelServicio.length > 1){
      // Solo se ve "ocupado" si TODOS los empleados que hacen el servicio están ocupados a esa hora
      ocupada = empleadosDelServicio.every(e => isBlocked(key, ocupadosPorEmpleadoCache[e.id]||[], durSvc));
    } else {
      ocupada = isBlocked(key, window._citasOcupadas||[], durSvc);
    }
    const bloqueada=horasBloqueadas.includes(key);
    const blocked=ocupada||bloqueada;
    const isSel=selTime===key;
    const div=document.createElement('div');
    div.className='ts'+(blocked?' tkn':'')+(isSel?' sel':'');
    div.textContent=lbl;
    if(blocked){
      const sub=document.createElement('span');
      sub.style.cssText='display:block;font-size:9px;color:#ccc;margin-top:1px;';
      sub.textContent=bloqueada?'no disp.':'ocupada';
      div.appendChild(sub);
    }
    if(!blocked) div.onclick=()=>{selTime=key;renderTimes();document.getElementById('btnContinue').disabled=false;};
    grid.appendChild(div);
  });
}

// En modo "cualquiera", decide a quién le toca realmente la cita: el primer
// empleado (de los que hacen el servicio) que esté libre a la hora elegida.
function empleadoAsignadoFinal(){
  if (!modoCualquiera) return empleadoSeleccionado;
  const durSvc=curSvc.durMin||60;
  for (const e of empleadosDelServicio){
    if (!isBlocked(selTime, ocupadosPorEmpleadoCache[e.id]||[], durSvc)) return e.id;
  }
  return empleadosDelServicio[0] ? empleadosDelServicio[0].id : null;
}

function chMo(d){
  calM+=d;
  if(calM<0){calM=11;calY--;}
  if(calM>11){calM=0;calY++;}
  selectedDay=null; selTime=null;
  document.getElementById('timeSec').style.display='none';
  document.getElementById('btnContinue').disabled=true;
  renderCal();
}

function goForm(){
  closeOv('ov-cal');
  cuponAplicado=null; cuponDescuentoPct=0; cuponPremioTexto='';
  certAplicado=null;
  const dayStr=`${selectedDay} de ${MESES[calM]} ${calY}`;
  currentDayStr=dayStr;
  timerSecs=300;
  const precio=curSvc.precioTexto||(curSvc.price>0?'$'+curSvc.price.toFixed(2):'A consultar');

  const tieneAbono = curSvc.esEval || curSvc.requiereAbono;
  const montoAbono = curSvc.esEval ? 10 : (curSvc.abonoMonto || 10);
  const tipoAbono = curSvc.esEval ? 'descontable' : (curSvc.abonoTipo || 'noreembolsable');
  const textoTipo = tipoAbono === 'descontable' ? 'descontable del servicio' : 'no reembolsable';

  const b = window.ANNLY_BUSINESS || {};
  const tieneYappy = !!(b.yappy_numero);
  const tieneYappyComercial = !!(b.tiene_yappy_comercial) && PAGOS_MODULO_DISPONIBLE;
  const tieneBanco = !!(b.banco_nombre && b.banco_numero_cuenta && b.banco_titular);
  pagoTipo = (tieneYappy || tieneYappyComercial) ? 'yappy' : 'bank';
  yappyAbonoListoInicializado=false;

  const armarPagoSection=(montoAbono)=>{
  let pagoSection='';
  if(tieneAbono){
    let opcionesHtml = '';
    if(tieneYappy || tieneYappyComercial){
      opcionesHtml += `
      <div class="pay-opt sel" id="opt-yappy" onclick="selPago('yappy')">
        <div><span class="pay-badge badge-yappy">Yappy</span><span class="pay-opt-title">Pagar con Yappy</span></div>
        <div class="pay-opt-sub">${tieneYappyComercial?'Pago rápido y seguro desde tu app Yappy. Tu cita se confirma automáticamente al completar el pago.':'Envía el pago desde tu app Yappy.'}</div>
        ${tieneYappyComercial?'':`<div class="pay-detail">Abre tu app Yappy y envía <strong>$${montoAbono.toFixed(2)}</strong> al número <strong>${b.yappy_numero}</strong>. Copia el número de comprobante aquí abajo.</div>`}
      </div>`;
    }
    if(tieneBanco){
      opcionesHtml += `
      <div class="pay-opt${(tieneYappy||tieneYappyComercial)?'':' sel'}" id="opt-bank" onclick="selPago('bank')">
        <div><span class="pay-badge badge-bank">Transferencia</span><span class="pay-opt-title">${b.banco_nombre}</span></div>
        <div class="pay-opt-sub">Transferencia bancaria a cuenta ${(b.banco_tipo_cuenta||'').toLowerCase()}.</div>
        <div class="pay-detail"><strong>Banco:</strong> ${b.banco_nombre}<br>${b.banco_tipo_cuenta?`<strong>Tipo:</strong> ${b.banco_tipo_cuenta}<br>`:''}<strong>Cuenta:</strong> ${b.banco_numero_cuenta}<br><strong>Titular:</strong> ${b.banco_titular}<br><strong>Monto:</strong> $${montoAbono.toFixed(2)}<br><span style="color:#e74c3c;font-size:11px;">Incluye tu nombre en la referencia</span></div>
      </div>`;
    }
    if(!tieneYappy && !tieneYappyComercial && !tieneBanco){
      pagoSection=`
      <div class="step-row" style="margin-top:1rem;"><span class="stepn">2</span><span class="step-lbl">Abono $${montoAbono.toFixed(2)} — ${textoTipo}</span></div>
      <div class="note-box-warn">
        <i class="ti ti-whatsapp" aria-hidden="true"></i>
        <span>Este servicio requiere un abono. Contáctanos por WhatsApp para coordinar el pago antes de confirmar tu cita.</span>
      </div>
      <div class="fg" style="margin-top:.875rem;"><label class="flbl">N° de comprobante / referencia</label><input class="fi" id="fref" placeholder="Ej: coordinado por WhatsApp"/></div>`;
    } else {
      pagoSection=`
      <div class="step-row" style="margin-top:1rem;"><span class="stepn">2</span><span class="step-lbl">Abono $${montoAbono.toFixed(2)} — ${textoTipo}</span></div>
      <div class="timer-box" id="timerBox">
        <div class="timer-val" id="timerVal">5:00</div>
        <div class="timer-lbl">Tienes <strong>5 minutos</strong> para completar el pago.<br>Si no se confirma, el cupo se libera.</div>
      </div>
      ${opcionesHtml}
      ${tieneYappyComercial ? `
      <div id="yappyRealWrap" style="margin-top:.875rem;">
        <div class="fg"><label class="flbl">Tu número Yappy (sin +507)</label><input class="fi" id="fAliasYappy" placeholder="6XXXXXXX"></div>
        <p id="yappyRealMsg" style="font-size:12px;margin:6px 0 10px;min-height:14px;"></p>
        <btn-yappy id="btnYappyReal" theme="darkBlue" rounded="true"></btn-yappy>
      </div>` : ''}
      <div id="yappyManualWrap" class="${tieneYappyComercial?'hidden':''}">
        <div class="fg" style="margin-top:.875rem;"><label class="flbl">N° de comprobante / referencia</label><input class="fi" id="fref" placeholder="Ej: YAPPY-001 o número de transacción"/></div>
        ${(tieneYappy&&!tieneYappyComercial)?`<button class="btn-yappy" id="btnYappy" onclick="copiarYappy()">Copiar número de Yappy</button>`:''}
        <button class="btn-transfer${(tieneYappy||tieneYappyComercial)?' hidden':' visible'}" id="btnTransfer" onclick="copiarCuenta()">Copiar número de cuenta</button>
      </div>`;
    }
  } else {
    pagoSection=`
      <div class="note-box" style="margin-top:.875rem;">
        <i class="ti ti-info-circle" aria-hidden="true"></i>
        <span>Sin abono requerido. El pago se realiza completo el día de tu cita.</span>
      </div>
      <div class="note-box-warn">
        <i class="ti ti-clock" aria-hidden="true"></i>
        <span>Política de cancelación: avisa con al menos <strong>24 horas</strong> de anticipación por WhatsApp.</span>
      </div>`;
  }
  return pagoSection;
  };
  pagoRender=armarPagoSection;
  abonoMostrado=montoAbono;
  const pagoSection=armarPagoSection(montoAbono);

  document.getElementById('form-body').innerHTML=`
    <div style="background:#3A3A3A;border-radius:var(--radius);padding:10px 14px;margin-bottom:1rem;">
      <div style="font-size:15px;font-weight:700;color:var(--gold);font-family:var(--font-heading);">${curSvc.name}</div>
      <div style="font-size:11px;color:rgba(255,255,255,.5);margin-top:3px;">${dayStr} · ${selTime} · ${curSvc.dur}</div>
    </div>
    <div class="step-row"><span class="stepn">1</span><span class="step-lbl">Tus datos</span></div>
    <div class="frow">
      <div class="fg"><label class="flbl">Nombre</label><input class="fi" id="fn" placeholder="Tu nombre"/></div>
      <div class="fg"><label class="flbl">WhatsApp</label><input class="fi" id="fp" placeholder="+507..."/></div>
    </div>
    <div class="fg"><label class="flbl">Correo</label><input class="fi" id="fe" placeholder="tu@correo.com"/></div>
    <div class="fg"><label class="flbl">Nota (opcional)</label><input class="fi" id="fnote" placeholder="Alguna preferencia o detalle que debamos saber..."/></div>
    <div class="fg">
      <label class="flbl">¿Tienes un cupón de descuento?</label>
      <div style="display:flex;gap:8px;">
        <input class="fi" id="fcupon" placeholder="Ej: RUL-4F2A" style="flex:1;text-transform:uppercase;">
        <button type="button" onclick="aplicarCupon()" style="padding:0 16px;background:#2E2B2B;color:#C9A96E;border:none;border-radius:var(--radius);font-size:12px;font-weight:500;cursor:pointer;white-space:nowrap;">Aplicar</button>
      </div>
      <p id="cuponMsg" style="font-size:11px;margin-top:6px;min-height:14px;"></p>
    </div>
    <div class="fg">
      <label class="flbl">¿Tienes un certificado de regalo?</label>
      <div style="display:flex;gap:8px;">
        <input class="fi" id="fcert" placeholder="Ej: CERT-A1B2C3" style="flex:1;text-transform:uppercase;">
        <button type="button" onclick="aplicarCertificadoCodigo()" style="padding:0 16px;background:#2E2B2B;color:#C9A96E;border:none;border-radius:var(--radius);font-size:12px;font-weight:500;cursor:pointer;white-space:nowrap;">Aplicar</button>
      </div>
      <p id="certMsg" style="font-size:11px;margin-top:6px;min-height:14px;"></p>
    </div>
    <div id="pagoWrap">${pagoSection}</div>
    <button class="btn-main" id="btnConfirmar" onclick="confirmar('${dayStr}')" style="${(tieneAbono&&tieneYappyComercial)?'display:none;':''}">Confirmar mi cita</button>`;

  if(tieneAbono && tieneYappyComercial) selPago('yappy');
  if(tieneAbono) startTimer();
  if(CERT_DESDE_URL){
    document.getElementById('fcert').value = CERT_DESDE_URL;
    aplicarCertificadoCodigo();
  }
  openOv('ov-form');
}

async function aplicarCertificadoCodigo(){
  const input=document.getElementById('fcert');
  const msgEl=document.getElementById('certMsg');
  const codigo=input.value.trim();
  if(!codigo){ msgEl.textContent=''; certAplicado=null; actualizarPagoPorCert(); return; }
  msgEl.style.color='#999';
  msgEl.textContent='Verificando...';
  const res=await Sheets.validarCertificado(codigo);
  if(res.valido){
    certAplicado={id:res.certificateId, codigo:res.codigo, saldoDisponible:res.saldoDisponible};
    msgEl.style.color='#3a7a3a';
    msgEl.textContent=`✓ Certificado válido: $${res.saldoDisponible.toFixed(2)} disponibles.`;
    const _m=calcularMontos();
    if(_m.tieneAbono && !_m.esConsultar && _m.abono<=0) msgEl.textContent+=' Cubre tu servicio: no necesitas pagar abono.';
  } else {
    certAplicado=null;
    msgEl.style.color='#c0392b';
    const motivos={codigo_no_encontrado:'Código no válido.',codigo_vacio:'Ingresa un código.',sin_saldo:'Este certificado ya no tiene saldo.',vencido:'Este certificado está vencido.',pendiente_pago:'Este certificado aún no ha sido activado.',cancelado:'Este certificado fue cancelado.'};
    msgEl.textContent=motivos[res.motivo]||'Código no válido.';
  }
  actualizarPagoPorCert();
}

// Cuando cambia el certificado (o el cupón) se recalcula el abono y se vuelve a
// dibujar la sección de pago: si el certificado cubre todo, no hay abono que pagar.
function actualizarPagoPorCert(){
  if(!curSvc || !pagoRender) return;
  const m=calcularMontos();
  if(!m.tieneAbono) return;
  const wrap=document.getElementById('pagoWrap');
  if(!wrap || abonoMostrado===m.abono) return;
  const antes=abonoMostrado;
  abonoMostrado=m.abono;
  const btnC=document.getElementById('btnConfirmar');
  if(m.abono<=0){
    if(timerInt) clearInterval(timerInt);
    wrap.innerHTML=`
      <div class="note-box" style="margin-top:.875rem;">
        <i class="ti ti-gift" aria-hidden="true"></i>
        <span>Tu certificado cubre este servicio: <strong>no necesitas pagar abono</strong>.</span>
      </div>`;
    if(btnC){ btnC.style.display=''; btnC.disabled=false; btnC.textContent='Confirmar mi cita'; }
    return;
  }
  const refPrev=(document.getElementById('fref')||{}).value||'';
  const aliasPrev=(document.getElementById('fAliasYappy')||{}).value||'';
  wrap.innerHTML=pagoRender(m.abono);
  const refEl=document.getElementById('fref'); if(refEl) refEl.value=refPrev;
  const aliasEl=document.getElementById('fAliasYappy'); if(aliasEl) aliasEl.value=aliasPrev;
  yappyAbonoListoInicializado=false;
  selPago(pagoTipo);
  if(btnC){ btnC.disabled=false; btnC.textContent='Confirmar mi cita'; }
  if(antes<=0) startTimer();
}


async function aplicarCupon(){
  const input=document.getElementById('fcupon');
  const msgEl=document.getElementById('cuponMsg');
  const codigo=input.value.trim();
  if(!codigo){ msgEl.textContent=''; cuponAplicado=null; cuponDescuentoPct=0; actualizarPagoPorCert(); return; }
  msgEl.style.color='#999';
  msgEl.textContent='Verificando...';
  const res=await Sheets.validarCupon(codigo);
  if(res.valido && res.tipo==='porcentaje'){
    cuponAplicado=codigo.toUpperCase();
    cuponDescuentoPct=res.valor;
    cuponPremioTexto=res.premio;
    msgEl.style.color='#3a7a3a';
    msgEl.textContent=`✓ Cupón válido: ${res.valor}% de descuento.`;
  } else if(res.valido && res.tipo==='especial'){
    cuponAplicado=codigo.toUpperCase();
    cuponDescuentoPct=0;
    cuponPremioTexto=res.premio;
    msgEl.style.color='#3a7a3a';
    msgEl.textContent=`✓ Cupón válido: ${res.premio}. Se coordinará el detalle contigo.`;
  } else {
    cuponAplicado=null; cuponDescuentoPct=0; cuponPremioTexto='';
    msgEl.style.color='#c0392b';
    const motivos={ya_canjeado:'Este cupón ya fue utilizado.',codigo_no_encontrado:'Cupón no válido.',codigo_vacio:'Ingresa un código.'};
    msgEl.textContent=motivos[res.motivo]||'Cupón no válido.';
  }
  actualizarPagoPorCert();
}

let pagoTipo='yappy';
let yappyAbonoListoInicializado=false;

function limpiarNumYappy(tel){
  let n=(tel||'').replace(/[^0-9]/g,'');
  if(n.length>8 && n.startsWith('507')) n=n.substring(3);
  return n;
}

function selPago(tipo){
  pagoTipo=tipo;
  const optY=document.getElementById('opt-yappy');
  const optB=document.getElementById('opt-bank');
  if(optY) optY.classList.toggle('sel',tipo==='yappy');
  if(optB) optB.classList.toggle('sel',tipo==='bank');

  const b = window.ANNLY_BUSINESS || {};
  const tieneYappyComercial = !!(b.tiene_yappy_comercial) && PAGOS_MODULO_DISPONIBLE;
  const yappyRealWrap=document.getElementById('yappyRealWrap');
  const yappyManualWrap=document.getElementById('yappyManualWrap');
  const btnC=document.getElementById('btnConfirmar');

  if(tipo==='bank'){
    if(yappyRealWrap) yappyRealWrap.classList.add('hidden');
    if(yappyManualWrap) yappyManualWrap.classList.remove('hidden');
    if(btnC) btnC.style.display='';
  } else if(tieneYappyComercial && yappyRealWrap){
    yappyRealWrap.classList.remove('hidden');
    if(yappyManualWrap) yappyManualWrap.classList.add('hidden');
    if(btnC) btnC.style.display='none';
    setupYappyButtonAbono();
  } else {
    if(yappyManualWrap) yappyManualWrap.classList.remove('hidden');
    if(btnC) btnC.style.display='';
    const btnY=document.getElementById('btnYappy');
    const btnB=document.getElementById('btnTransfer');
    if(btnY) btnY.classList.remove('hidden');
    if(btnB) btnB.classList.remove('visible');
  }
}

// Conecta el <btn-yappy> real (SDK oficial de Yappy) para el abono de la
// cita: al hacer click crea la orden vía la Edge Function y le pasa el
// token de vuelta al widget con eventPayment(); al confirmar el pago
// (eventSuccess) reserva la cita de una vez, usando el orderId como
// comprobante.
function setupYappyButtonAbono(){
  const btn=document.getElementById('btnYappyReal');
  if(!btn || yappyAbonoListoInicializado) return;
  yappyAbonoListoInicializado=true;

  const telInput=document.getElementById('fp');
  const aliasInput=document.getElementById('fAliasYappy');
  if(telInput && aliasInput && !aliasInput.value){ aliasInput.value=limpiarNumYappy(telInput.value); }

  btn.addEventListener('eventClick', async () => {
    const msgEl=document.getElementById('yappyRealMsg');
    const nombre=document.getElementById('fn').value.trim();
    const tel=document.getElementById('fp').value.trim();
    const correo=document.getElementById('fe').value.trim();
    if(!nombre||!tel||!correo){ msgEl.style.color='#c0392b'; msgEl.textContent='Completa tu nombre, WhatsApp y correo antes de pagar.'; btn.isButtonLoading=false; return; }
    const alias=limpiarNumYappy(document.getElementById('fAliasYappy').value);
    if(!alias || alias.length<7){ msgEl.style.color='#c0392b'; msgEl.textContent='Ingresa tu número Yappy (8 dígitos, sin +507).'; btn.isButtonLoading=false; return; }

    msgEl.style.color='#999'; msgEl.textContent='Creando tu orden de pago...';
    const montoAbono = calcularMontos().abono;
    const orderId='C'+Date.now().toString().slice(-10);
    window._yappyOrderId=orderId;

    const res=await Sheets.crearOrdenYappy({orderId, total:montoAbono, aliasYappy:alias, tipo:'cita', refId:orderId});
    if(res && res.ok){
      msgEl.textContent='';
      btn.eventPayment({ transactionId: res.transactionId, documentName: res.documentName, token: res.token });
    } else {
      msgEl.style.color='#c0392b';
      msgEl.textContent = (res && res.error) || 'No se pudo crear la orden de pago. Intenta de nuevo.';
      btn.isButtonLoading=false;
    }
  });

  btn.addEventListener('eventSuccess', () => {
    confirmarCitaConfirmada(currentDayStr, window._yappyOrderId);
  });

  btn.addEventListener('eventError', () => {
    const msgEl=document.getElementById('yappyRealMsg');
    if(msgEl){ msgEl.style.color='#c0392b'; msgEl.textContent='El pago no se completó. Puedes intentar de nuevo.'; }
  });
}

function copiarCuenta(){
  const b = window.ANNLY_BUSINESS || {};
  navigator.clipboard.writeText(b.banco_numero_cuenta || '').then(()=>{
    const btn=document.getElementById('btnTransfer');
    btn.textContent='¡Copiado!';
    setTimeout(()=>{btn.textContent='Copiar número de cuenta';},2000);
  });
}

function copiarYappy(){
  const b = window.ANNLY_BUSINESS || {};
  navigator.clipboard.writeText(b.yappy_numero || '').then(()=>{
    const btn=document.getElementById('btnYappy');
    btn.textContent='¡Copiado!';
    setTimeout(()=>{btn.textContent='Copiar número de Yappy';},2000);
  });
}

function startTimer(){
  if(timerInt)clearInterval(timerInt);
  timerSecs=300;
  timerInt=setInterval(()=>{
    timerSecs--;
    const el=document.getElementById('timerVal');
    const box=document.getElementById('timerBox');
    const btnC=document.getElementById('btnConfirmar');
    if(timerSecs<=0){
      clearInterval(timerInt);
      if(el)el.textContent='0:00';
      if(box)box.classList.add('exp');
      if(btnC){btnC.disabled=true;btnC.textContent='Tiempo expirado — vuelve a empezar';}
      return;
    }
    const mm=Math.floor(timerSecs/60),ss=timerSecs%60;
    if(el)el.textContent=mm+':'+String(ss).padStart(2,'0');
    if(timerSecs<=60&&box)box.classList.add('exp');
  },1000);
}

async function confirmar(dayStr){
  const nombre=document.getElementById('fn').value.trim();
  const tel=document.getElementById('fp').value.trim();
  const correo=document.getElementById('fe')?document.getElementById('fe').value.trim():'';
  const refEl=document.getElementById('fref');
  const ref=refEl?refEl.value.trim():'Sin abono';
  const tieneAbono = calcularMontos().abono>0;
  if(!nombre||!tel||!correo){alert('Por favor completa tu nombre, WhatsApp y correo.');return;}
  if(tieneAbono&&!ref){alert('Por favor ingresa el número de comprobante del pago.');return;}
  if(timerInt)clearInterval(timerInt);
  const btnC=document.getElementById('btnConfirmar');
  if(btnC){btnC.disabled=true;btnC.textContent='Confirmando...';}
  await finalizarCita(dayStr, ref);
}

// Llamado cuando el pago se completó de verdad por el botón real de Yappy
// (eventSuccess del widget) — el comprobante es el propio orderId de Yappy,
// no algo que el cliente tipeó a mano.
async function confirmarCitaConfirmada(dayStr, orderId){
  if(timerInt)clearInterval(timerInt);
  await finalizarCita(dayStr, orderId);
}

async function finalizarCita(dayStr, ref){
  const nombre=document.getElementById('fn').value.trim();
  const tel=document.getElementById('fp').value.trim();
  const correo=document.getElementById('fe')?document.getElementById('fe').value.trim():'';
  const nota=document.getElementById('fnote')?document.getElementById('fnote').value.trim():'';
  const _M = calcularMontos();
  const tieneAbono = _M.abono>0;
  const abonoExonerado = _M.tieneAbono && _M.abono<=0; // el certificado cubrió todo el servicio
  const montoAbono = _M.abono;
  const tipoAbono = curSvc.esEval ? 'descontable' : (curSvc.abonoTipo || 'noreembolsable');
  const textoTipo = tipoAbono === 'descontable' ? 'descontable del servicio' : 'sujeto a política de cancelación';
  const precio=curSvc.price>0?curSvc.price:0;
  const esConsultar = curSvc.price<=0;
  const notaFinal = curSvc._promo ? (nota ? nota+' [PROMO aplicada]' : 'PROMO aplicada') : nota;
  const citaId = 'cita-' + Date.now();

  const descuentoMonto = (!esConsultar && cuponDescuentoPct>0) ? precio*(cuponDescuentoPct/100) : 0;
  const precioTrasCupon = Math.max(0, precio - descuentoMonto);
  // El certificado es dinero real ya pagado, así que se descuenta siempre —
  // incluso en servicios "a consultar" sin precio fijo. Como no hay un precio
  // conocido para topear el descuento, se aplica el saldo completo disponible
  // y el negocio lo resta del monto que acuerde con el cliente en persona.
  const montoCertAplicado = certAplicado
    ? (esConsultar ? certAplicado.saldoDisponible : Math.min(certAplicado.saldoDisponible, precioTrasCupon))
    : 0;
  const precioFinal = Math.max(0, precioTrasCupon - montoCertAplicado);

  const cita={nombre,telefono:tel,correo,nota:notaFinal,servicio:curSvc.name,categoria:curSvc.cat,
    precioTotal:precio,precioEsConsultar:esConsultar,fecha:dayStr,hora:selTime,duracionMin:curSvc.durMin,
    comprobante:ref,abonoMonto:tieneAbono?montoAbono:0,abonoTipo:tieneAbono?tipoAbono:'',
    metodoPago:tieneAbono?pagoTipo:'', citaId:citaId, empleadoId:empleadoAsignadoFinal(),
    cuponUsado:cuponAplicado||'', descuentoCupon:cuponDescuentoPct||0, precioFinal:precioFinal,
    certificadoCodigo: montoCertAplicado>0 ? certAplicado.codigo : null,
    certificadoMonto: montoCertAplicado>0 ? montoCertAplicado : null};
  let appointmentId=null;
  try{ appointmentId=await Sheets.guardarCita(cita); }catch(e){console.error(e);}
  try{await Sheets.upsertClienteDesdeReserva(nombre, tel, correo);}catch(e){console.error(e);}
  if(cuponAplicado){ try{await Sheets.marcarCuponCanjeado(cuponAplicado);}catch(e){console.error(e);} }
  if(montoCertAplicado>0){ try{await Sheets.aplicarCertificado(certAplicado.id, montoCertAplicado, appointmentId);}catch(e){console.error(e);} }
  const horaDisplay = (()=>{const[h,m]=selTime.split(':');const hh=parseInt(h);return (hh>12?hh-12:hh)+':'+m+(hh>=12?' PM':' AM');})();
  Sheets.enviarCorreo('cita_confirmada', {correoCliente:correo, nombreCliente:nombre, servicio:curSvc.name, fecha:dayStr, hora:horaDisplay});
  Sheets.enviarCorreo('cita_nueva', {nombreCliente:nombre, telefonoCliente:tel, servicio:curSvc.name, fecha:dayStr, hora:horaDisplay});
  await new Promise(r=>setTimeout(r,900));
  const precioStr=esConsultar?'Por confirmar':(curSvc.precioTexto&&curSvc.precioTexto.toLowerCase().includes('desde')?'Desde $'+precio.toFixed(2):'$'+precio.toFixed(2));
  const restanteTexto = esConsultar
    ? (tieneAbono ? 'Se aplicará el abono al precio acordado' : 'Por confirmar')
    : '$'+(tipoAbono==='descontable' ? Math.max(0, precioFinal - montoAbono).toFixed(2) : precioFinal.toFixed(2));
  const abonoLine=tieneAbono?`<strong>Abono pagado:</strong> <span style="color:#4CAF50;font-weight:600;">$${montoAbono.toFixed(2)}</span> (${textoTipo})<br><strong>Comprobante:</strong> ${ref}<br>`
    :(abonoExonerado?`<strong>Abono:</strong> No requerido (cubierto por tu certificado)<br>`:'');
  const cuponLine = (cuponAplicado && cuponDescuentoPct>0 && !esConsultar)
    ? `<strong>Descuento por cupón:</strong> <span style="color:#D95F2B;font-weight:600;">-${cuponDescuentoPct}% (-$${descuentoMonto.toFixed(2)})</span><br>`
    : (cuponAplicado ? `<strong>Cupón aplicado:</strong> ${cuponPremioTexto}<br>` : '');
  const certLine = montoCertAplicado>0
    ? `<strong>Certificado aplicado (${certAplicado.codigo}):</strong> <span style="color:#4CAF50;font-weight:600;">-$${montoCertAplicado.toFixed(2)}</span><br><strong>Saldo restante del certificado:</strong> <span style="color:#4CAF50;font-weight:600;">$${Math.max(0,certAplicado.saldoDisponible-montoCertAplicado).toFixed(2)}</span><br>`
    : '';
  const totalLine = esConsultar
    ? `<strong>Monto a cancelar el día de la cita:</strong> ${restanteTexto}<br>`
    : `<strong>Total a pagar:</strong> <span style="color:#D95F2B;font-weight:600;">${restanteTexto}</span><br>`;
  document.getElementById('form-body').innerHTML=`
    <div class="success-wrap">
      <div class="s-icon"><i class="ti ti-check" aria-hidden="true"></i></div>
      <div class="s-title">¡Cita reservada!</div>
      <div class="s-sub">Pronto nos pondremos en contacto contigo para confirmar los detalles.</div>
      <div class="s-detail">
        <strong>Servicio:</strong> ${curSvc.name}<br>
        <strong>Fecha:</strong> ${dayStr}<br>
        <strong>Hora:</strong> ${selTime ? (()=>{const[h,m]=selTime.split(':');const hh=parseInt(h);return (hh>12?hh-12:hh)+':'+m+(hh>=12?' PM':' AM');})() : selTime}<br>
        <strong>Duración aprox.:</strong> ${curSvc.dur}<br>
        <strong>Precio total:</strong> <span style="color:#D95F2B;font-weight:600;">${precioStr}</span><br>
        ${abonoLine}
        ${cuponLine}
        ${certLine}
        ${totalLine}
      </div>
      ${abonoExonerado?'':'<p style="font-size:11px;color:#aaa;margin-bottom:1rem;">Recuerda: cancelaciones con menos de 24 horas de anticipación no tienen reembolso del abono.</p>'}
      <button class="btn-main" style="background:#2E2B2B;color:#C9A96E;font-family:var(--font-heading);" onclick="closeOv('ov-form')">Listo</button>
    </div>`;

  setTimeout(async () => {
    try {
      const check = await Sheets.verificarElegibilidadRuleta(tel);
      if (check && check.elegible) {
        closeOv('ov-form');
        abrirModalRuleta(tel, nombre, citaId);
      }
      // si no es elegible (ya participó o ruleta apagada), el modal de confirmación se queda abierto tal cual
    } catch (err) {
      console.error('Error verificando elegibilidad de ruleta:', err);
    }
  }, 1800);
}

function openOv(id){document.getElementById(id).classList.add('open');}
function closeOv(id){
  document.getElementById(id).classList.remove('open');
  if(id==='ov-form'&&timerInt)clearInterval(timerInt);
}

const TEMAS_PROMO={
  mundial:{emoji:'⚽',bg:'linear-gradient(160deg,#7BA87F 0%,#4E7A53 100%)',lblColor:'#fff',porteria:true,confeti:false,cardBg:'#F0F7F0',cardBorder:'#C8DFC8',vigColor:'#3a7a3f'},
  regalo:{emoji:'🎁',bg:'#FBF0F3',bgBorder:'#D693AA',lblColor:'#B85478',porteria:false,confeti:true,confetiLight:true,cardBg:'#FBF0F3',cardBorder:'#EDD2DA',vigColor:'#B85478'},
  corazon:{emoji:'💝',bg:'linear-gradient(160deg,#F0A8B8 0%,#D67D95 100%)',lblColor:'#fff',porteria:false,confeti:true,confetiLight:false,cardBg:'#FBF0F3',cardBorder:'#EDD2DA',vigColor:'#a8455f'},
  fiesta:{emoji:'🎉',bg:'linear-gradient(160deg,#A89BD9 0%,#7A6AB5 100%)',lblColor:'#fff',porteria:false,confeti:true,confetiLight:false,cardBg:'#F2F0FA',cardBorder:'#DAD3EC',vigColor:'#52468a'}
};

let PROMO_DATA=null;

async function loadPromo(){
  let promo;
  try { promo = await Sheets.getPromo(); }
  catch(e){ return; }
  if(!promo || !promo.activa) return;
  PROMO_DATA=promo;

  const tema=TEMAS_PROMO[promo.tema]||TEMAS_PROMO.mundial;
  const topEl=document.getElementById('promo-top');
  topEl.style.background=tema.bg;
  topEl.style.borderBottom=tema.bgBorder?('3px solid '+tema.bgBorder):'none';
  document.getElementById('promo-emoji').textContent=tema.emoji;
  document.getElementById('promo-porteria').style.display=tema.porteria?'block':'none';
  const lblEl=document.getElementById('promo-lbl');
  lblEl.textContent=promo.etiqueta||'PROMOCIÓN';
  lblEl.style.color=tema.lblColor;
  document.getElementById('promo-fest').textContent=promo.festejo||'¡Oferta especial!';
  document.getElementById('promo-svc').textContent=promo.servicio||'';
  const card=document.getElementById('promo-card');
  card.style.background=tema.cardBg;
  card.style.border='0.5px solid '+tema.cardBorder;
  if(promo.precioNormal){
    document.getElementById('promo-pn').textContent='$'+parseFloat(promo.precioNormal).toFixed(2);
    document.getElementById('promo-pn').style.display='inline';
  } else { document.getElementById('promo-pn').style.display='none'; }
  document.getElementById('promo-pp').textContent=promo.precioPromo?'$'+parseFloat(promo.precioPromo).toFixed(2):'';
  const vig=document.getElementById('promo-vig');
  vig.textContent=promo.vigencia||'';
  vig.style.color=tema.vigColor;

  setTimeout(()=>{
    document.getElementById('promo-ov').style.display='flex';
    animarPromo(promo.tema);
  }, 600);
}

function animarPromo(tema){
  const emoji=document.getElementById('promo-emoji');
  const fest=document.getElementById('promo-fest');
  const topEl=document.getElementById('promo-top');
  if(!emoji) return;
  const conf=TEMAS_PROMO[tema]||TEMAS_PROMO.mundial;

  topEl.querySelectorAll('.promo-confeti').forEach(c=>c.remove());

  fest.style.opacity='0';
  if(tema==='mundial'){
    emoji.animate([
      {transform:'translateX(-50%) translateY(0) scale(1)',offset:0},
      {transform:'translateX(-50%) translateY(-20px) scale(.7) rotate(360deg)',offset:.6},
      {transform:'translateX(-50%) translateY(12px) scale(.92) rotate(540deg)',offset:1}
    ],{duration:1100,easing:'cubic-bezier(.4,1.3,.6,1)',fill:'forwards'});
  } else {
    emoji.animate([
      {transform:'translateX(-50%) scale(0) rotate(-20deg)',offset:0},
      {transform:'translateX(-50%) scale(1.2) rotate(10deg)',offset:.7},
      {transform:'translateX(-50%) scale(1) rotate(0)',offset:1}
    ],{duration:900,easing:'cubic-bezier(.4,1.3,.6,1)',fill:'forwards'});
  }

  if(conf.confeti){
    const colors=conf.confetiLight?['#E8A23C','#D26C7A','#7BA87F','#5B9BD5','#C77F3C']:['#F5D76E','#fff','#A6D9F4','#C8F4A6','#FCE8A0'];
    for(let i=0;i<14;i++){
      const c=document.createElement('div');
      c.className='promo-confeti';
      const size=4+Math.random()*4;
      c.style.cssText='position:absolute;width:'+size+'px;height:'+(size+2)+'px;background:'+colors[i%colors.length]+';top:-12px;left:'+(Math.random()*100)+'%;border-radius:1px;opacity:.8;z-index:1;pointer-events:none;';
      topEl.appendChild(c);
      const dur=2200+Math.random()*1600;
      const delay=Math.random()*2500;
      const drift=(Math.random()*36-18);
      c.animate([
        {transform:'translateY(0) translateX(0) rotate(0deg)',opacity:.85},
        {transform:'translateY(105px) translateX('+drift+'px) rotate('+(360+Math.random()*360)+'deg)',opacity:.5}
      ],{duration:dur,delay:delay,iterations:Infinity,easing:'linear'});
    }
  }

  setTimeout(()=>{
    fest.style.transition='opacity .4s';
    fest.style.opacity='1';
    fest.animate([{transform:'scale(.5)'},{transform:'scale(1.15)'},{transform:'scale(1)'}],{duration:450,easing:'ease-out'});
  }, tema==='mundial'?900:700);
}

function cerrarPromo(){
  document.getElementById('promo-ov').style.display='none';
}

function agendarPromo(){
  cerrarPromo();
  if(!PROMO_DATA || !PROMO_DATA.servicio){ return; }
  const norm=s=>s.toLowerCase().trim().replace(/\s+/g,' ');
  const objetivo=norm(PROMO_DATA.servicio);
  let svc=SERVICES.find(s=>norm(s.name)===objetivo);
  if(!svc) svc=SERVICES.find(s=>norm(s.name).includes(objetivo)||objetivo.includes(norm(s.name)));
  if(svc){
    openDetail(svc.id, true);
  } else {
    document.querySelector('.servicios-wrap, #servicios, .svc-grid')?.scrollIntoView({behavior:'smooth'});
  }
}

// El botón de WhatsApp ahora se queda siempre visible (discreto), sin ocultarse cerca del footer
