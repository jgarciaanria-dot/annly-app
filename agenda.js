// ============================================================
// Ajustes de tema de la agenda pública: usan los colores de la paleta del negocio
// (--gold / --gold-dark) en lugar de fondos negros fijos. Van aquí para no depender
// de que agenda.css o 404.html estén al día.
// ============================================================
(function(){
  if (document.getElementById('annly-tema-css')) return;
  const st = document.createElement('style');
  st.id = 'annly-tema-css';
  st.textContent = `
@keyframes annlyGiro{to{transform:rotate(360deg);}}
/* ---------- Computadora y tablet: página completa, no una columna recortada sobre fondo gris ---------- */
@media(min-width:600px){
  body:not(.modo-oscuro){background-color:var(--bg-page);}
  body.modo-oscuro{background-color:var(--bg-page,#0d0c0b);}
  html body .hdr{max-width:none;}
  html body .marcas-strip,html body footer{max-width:none;}
  html body #serviceList,html body #cert-link-wrap,html body #club-link-wrap,html body #suc-chip{max-width:720px;margin-left:auto;margin-right:auto;background-color:transparent;}
  html body #serviceList{padding-left:1.25rem;padding-right:1.25rem;}
}
@media(min-width:900px){
  /* Compacto y centrado: las reservas se hacen sobre todo desde el celular */
  html body #serviceList,html body #cert-link-wrap,html body #club-link-wrap,html body #suc-chip{max-width:960px;}
  html body #serviceList{padding-left:1.5rem;padding-right:1.5rem;padding-bottom:2.5rem;}
  html body #cert-link-wrap,html body #club-link-wrap{padding-left:1.5rem;padding-right:1.5rem;}
  /* La tarjeta de sede con el mismo ancho que la del certificado */
  html body #suc-chip{padding-left:calc(1.5rem + 14px);padding-right:calc(1.5rem + 14px);}
  html body .grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;}
}
:root{--b1:#EEE6F8;--b2:#F5F0FA;--b3:#FBF8FD;--b-glow:transparent;--b-ink:#2B2238;--b-ink-soft:rgba(43,34,56,.68);}
.svc-banner,.svc-pill,.svc-resumen{background:radial-gradient(130% 150% at 88% -10%,var(--b-glow) 0%,transparent 62%),linear-gradient(180deg,var(--b1) 0%,var(--b2) 58%,var(--b3) 100%);border:1px solid rgba(255,255,255,.85);box-shadow:0 12px 26px -18px rgba(var(--gold-rgb),.55),inset 0 1px 0 rgba(255,255,255,.9);}
html body:not(.modo-oscuro) .hdr{background-color:var(--b3);background-image:radial-gradient(120% 90% at 50% 0%,var(--b-glow) 0%,transparent 65%),linear-gradient(180deg,var(--b1) 0%,var(--b2) 62%,var(--b3) 100%);}
html body:not(.modo-oscuro) .hdr::before{background:radial-gradient(circle,rgba(255,255,255,.75) 0%,transparent 70%);}
.svc-banner-name,.svc-pill-name,.svc-resumen-name{color:var(--b-ink);}
.svc-banner-price,.svc-pill-price{color:var(--b-ink);font-weight:700;}
.svc-banner-dur,.svc-pill-dur,.svc-resumen-meta{color:var(--b-ink-soft);}
.svc-banner-icon{border-color:rgba(255,255,255,.9);background:rgba(255,255,255,.6);box-shadow:0 4px 10px -6px rgba(var(--gold-rgb),.5);}
.svc-banner-icon i{color:var(--b-ink);}
.svc-resumen{border-radius:var(--radius);padding:10px 14px;margin-bottom:1rem;}
.svc-resumen-name{font-size:15px;font-weight:700;font-family:var(--font-heading);}
.svc-resumen-meta{font-size:11.5px;margin-top:3px;}
.stepn{background:var(--gold-dark);color:var(--on-gold-dark,#fff);font-weight:600;}
.card-arrow{background:var(--gold-dark);}
.incl-grid{grid-template-columns:1fr 1fr;gap:10px 16px;}
.incl-item{align-items:flex-start;line-height:1.45;}
.incl-dot{width:5px;height:5px;margin-top:.5em;background:var(--gold-dark);}
@media(max-width:480px){.incl-grid{grid-template-columns:1fr;}}
`;
  document.head.appendChild(st);
})();

document.getElementById('ruletaCloseBtn').addEventListener('click', function(){
    document.getElementById('ruletaModal').classList.remove('activo');
  });

  // ============================================================
  // RUEDA DINÁMICA - se construye desde RuletaConfig, sin código fijo
  // ============================================================
  let RULETA_SEGMENTOS_ACTIVOS = [];
  let RULETA_UI = { modo: 'siempre', titulo: '' };

  // ---- Colores de la ruleta: salen de los colores de la marca del negocio ----
  function rHex(h){ const m = /^#?([0-9a-f]{6})$/i.exec(String(h||'').trim()); if(!m) return null; const n = parseInt(m[1],16); return [n>>16&255, n>>8&255, n&255]; }
  function rToHex(c){ return '#' + c.map(v => Math.max(0,Math.min(255,Math.round(v))).toString(16).padStart(2,'0')).join(''); }
  function rMix(a, b, t){ const A=rHex(a), B=rHex(b); return rToHex(A.map((v,i)=> v + (B[i]-v)*t)); }
  function rLum(h){ const c=rHex(h).map(v=>{v/=255; return v<=.03928 ? v/12.92 : Math.pow((v+.055)/1.055,2.4);}); return .2126*c[0]+.7152*c[1]+.0722*c[2]; }
  function rLegible(h, min){ let c=h, i=0; while(rLum(c) < min && i++ < 10) c = rMix(c,'#ffffff',.14); return c; }
  function rDist(a,b){ const A=rHex(a), B=rHex(b); return Math.sqrt(A.reduce((t,v,i)=>t+Math.pow(v-B[i],2),0)); }

  function ruletaTema(){
    const neg = window.ANNLY_BUSINESS || {};
    const p = rHex(neg.color_primario) ? neg.color_primario : '#C9A24B';
    let s = rHex(neg.color_secundario) ? neg.color_secundario : '#8A6A24';
    if (rDist(p, s) < 70) s = rMix(p, '#000000', .45);          // colores muy parecidos: se usa una versión más oscura
    // Realce: el color principal, oscurecido si hace falta para que se lea sobre blanco
    let acc = p, i = 0;
    while (rLum(acc) > .20 && i++ < 14) acc = rMix(acc, '#000000', .12);
    const card1 = p, card2 = rMix(p, '#000000', .18);
    return {
      bg: '#FFFFFF', acc,
      titulo: '#201B2B',
      muted: '#7A7287',
      linea: rMix('#FFFFFF', acc, .30),
      card1, card2, cardTexto: rLum(card1) > .30 ? '#201B2B' : '#FFFFFF',
      segmentos: [p, rMix(p,'#ffffff',.55), s, rMix(s,'#ffffff',.55)],
      confeti: ['#FF4D6D','#FFC233','#2EC4B6','#4D96FF','#9B5DE5','#FF8A3D']
    };
  }
  let RULETA_TEMA = null;
  function aplicarTemaRuleta(){
    RULETA_TEMA = ruletaTema();
    const m = document.getElementById('ruletaModal'); if(!m) return;
    const t = RULETA_TEMA;
    [['--rul-bg',t.bg],['--rul-acc',t.acc],['--rul-title',t.titulo],['--rul-muted',t.muted],['--rul-line',t.linea],
     ['--rul-card1',t.card1],['--rul-card2',t.card2],['--rul-card-text',t.cardTexto]].forEach(([k,v]) => m.style.setProperty(k, v));
  }

  function ruletaPt(cx, cy, r, angleDeg){
    const rad = angleDeg * Math.PI / 180;
    return { x: (cx + r * Math.sin(rad)).toFixed(1), y: (cy - r * Math.cos(rad)).toFixed(1) };
  }

  function ruletaWordWrap(texto, maxLen, maxLineas){
    const palabras = String(texto).split(' ');
    let lineas = [];
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
    maxLineas = maxLineas || 2;
    if (lineas.length > maxLineas) {
      const resto = lineas.slice(maxLineas - 1).join(' ');
      lineas = lineas.slice(0, maxLineas - 1).concat([resto.length > maxLen + 2 ? resto.slice(0, maxLen - 1).trim() + '…' : resto]);
    }
    return lineas;
  }

  function ruletaEscapeHtml(s){
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  async function loadRuletaConfig(){
    try {
      const config = await Sheets.getRuletaConfig();
      // Solo aparecen en la rueda los premios que de verdad pueden salir: activos, con probabilidad y con stock
      RULETA_UI = { modo: config.modo || 'siempre', titulo: config.titulo || '' };
      const activos = (config.premios || []).filter(p => p.activo && Number(p.probabilidad) > 0 && (p.stock === null || p.stock === undefined || p.stock > 0));
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

    aplicarTemaRuleta();
    const T = RULETA_TEMA;
    const cx = 125, cy = 125, R = 118;
    const step = 360 / n;
    const maxLineLen = n <= 4 ? 14 : (n <= 6 ? 11 : 8);
    const fontSize = n <= 4 ? 15 : (n <= 6 ? 12 : 9);

    let pathsHtml = '';
    let linesHtml = '';
    let textsHtml = '';
    const segmentos = [];

    for (let k = 0; k < n; k++) {
      const p1 = ruletaPt(cx, cy, R, k * step);
      const p2 = ruletaPt(cx, cy, R, (k + 1) * step);
      let idxColor = k % T.segmentos.length;
      if (k === n - 1 && n > 1 && idxColor === 0) idxColor = 2;     // el último no repite el color del primero
      const fillSeg = T.segmentos[idxColor];
      const color = { fill: fillSeg, text: rLum(fillSeg) > .45 ? '#1B1612' : '#FFFFFF' };
      const segId = 'seg' + k;

      pathsHtml += n === 1
        ? `<circle id="${segId}" cx="${cx}" cy="${cy}" r="${R}" fill="${color.fill}"/>\n`
        : `<path id="${segId}" d="M${cx},${cy} L${p1.x},${p1.y} A${R},${R} 0 0,1 ${p2.x},${p2.y} Z" fill="${color.fill}"/>\n`;
      if (n > 1) linesHtml += `<line x1="${cx}" y1="${cy}" x2="${p1.x}" y2="${p1.y}" stroke="${T.acc}" stroke-width="0.75" opacity="0.55"/>\n`;

      const midAngle = (k + 0.5) * step;
      const nLineasTxt = ruletaWordWrap(premiosActivos[k].premio, maxLineLen, n <= 5 ? 3 : 2).length;
      const headline = ruletaPt(cx, cy, R * (nLineasTxt >= 3 ? .72 : .62), midAngle);
      const fontSeg = nLineasTxt >= 3 ? fontSize * .88 : fontSize;

      // Rotación fija tipo abanico para el TEXTO: siempre legible, nunca boca abajo
      const rotDeg = midAngle;

      const maxLineas = n <= 5 ? 3 : 2;
      const lineas = ruletaWordWrap(premiosActivos[k].premio, maxLineLen, maxLineas);
      const lh = fontSeg * 1.15;
      const startY = parseFloat(headline.y) - ((lineas.length - 1) * lh) / 2;
      const tspans = lineas.map((linea, i) =>
        `<tspan x="${headline.x}" dy="${i === 0 ? 0 : lh}">${ruletaEscapeHtml(linea)}</tspan>`
      ).join('');
      if (n > 6) {
        // Con muchos premios el texto va a lo largo del radio: cabe más y se lee completo
        const rad = ruletaPt(cx, cy, R * .63, midAngle);
        const lR = ruletaWordWrap(premiosActivos[k].premio, 15, 2);
        const fR = lR.some(l => l.length > 12) ? 8.6 : 9.4, lhR = fR * 1.15;
        const rotR = midAngle - 90 + (midAngle > 180 ? 180 : 0);
        const y0 = parseFloat(rad.y) - ((lR.length - 1) * lhR) / 2 + fR * .35;
        const ts = lR.map((l, i) => `<tspan x="${rad.x}" dy="${i === 0 ? 0 : lhR}">${ruletaEscapeHtml(l)}</tspan>`).join('');
        textsHtml += `<text x="${rad.x}" y="${y0.toFixed(1)}" font-size="${fR}" font-weight="800" fill="${color.text}" text-anchor="middle" transform="rotate(${rotR.toFixed(1)} ${rad.x} ${rad.y})">${ts}</text>\n`;
      } else
      textsHtml += `<text x="${headline.x}" y="${startY.toFixed(1)}" font-size="${fontSeg.toFixed(1)}" font-weight="800" fill="${color.text}" text-anchor="middle" transform="rotate(${rotDeg.toFixed(1)} ${headline.x} ${startY.toFixed(1)})">${tspans}</text>\n`;

      segmentos.push({ id: segId, premioId: premiosActivos[k].id, premio: premiosActivos[k].premio, angle: midAngle });
    }

    const dotsHtml = [
      [125.0,4.0],[162.4,9.9],[196.1,27.1],[222.9,53.9],[240.1,87.6],[246.0,125.0],
      [240.1,162.4],[222.9,196.1],[196.1,222.9],[162.4,240.1],[125.0,246.0],[87.6,240.1],
      [53.9,222.9],[27.1,196.1],[9.9,162.4],[4.0,125.0],[9.9,87.6],[27.1,53.9],[53.9,27.1],[87.6,9.9]
    ].map(([x,y]) => `<circle cx="${x}" cy="${y}" r="2.4" fill="${T.acc}"/>`).join('\n');

    cont.innerHTML = `<svg id="wheelSvg" viewBox="0 0 250 250" width="250" height="250">
      <circle cx="125" cy="125" r="122" fill="none" stroke="${T.acc}" stroke-width="1" opacity="0.6"/>
      ${pathsHtml}
      <circle cx="125" cy="125" r="118" fill="none" stroke="${T.acc}" stroke-width="1.5"/>
      ${linesHtml}
      ${dotsHtml}
      ${textsHtml}
      <circle cx="125" cy="125" r="34" fill="${T.bg}" stroke="${T.acc}" stroke-width="2"/>
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
    BLOQUEOS = await Sheets.getBloqueos(SUCURSAL_ACTUAL ? SUCURSAL_ACTUAL.id : null);
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

// Cuenta suspendida por falta de pago: la agenda pública queda en solo vista (sin reservas)
window.AnnlyReady.then(() => Sheets.negocioSuspendido()).then(suspendido => {
  if (!suspendido) return;
  annlyModoVista('Por el momento este negocio no está recibiendo reservas.');
  ['openCal', 'confirmar', 'confirmarDoble', 'confirmarCitaConfirmada', 'abrirModalComprarCertificado', 'enviarCompraCertificado', 'abrirModalInscripcion', 'enviarInscripcion'].forEach(n => {
    const f = window[n];
    if (typeof f !== 'function') return;
    window[n] = function () { alert('Por el momento este negocio no está recibiendo reservas.'); };
  });
}).catch(() => {});

// Banner pastel y difuso con los colores de la marca: un lavado suave de arriba hacia abajo, con un brillo cálido
function annlyBannerPastel(p, s){
  if (!rHex(p) || !rHex(s)) return null;
  const calido = '#FFEBD6';
  const base = (k, c) => rMix(rMix(p, '#ffffff', k), calido, c);   // tono de la marca aclarado y con un toque cálido
  let tinta = s, i = 0;
  while (rLum(tinta) > .07 && i++ < 16) tinta = rMix(tinta, '#000000', .12);   // texto oscuro, del tono de la marca
  tinta = rMix(tinta, '#1B1612', .25);
  const rgb = hex => rHex(hex).join(',');
  return {
    b1: base(.70, .22), b2: base(.86, .30), b3: base(.95, .35),
    glow: 'rgba(' + rgb(rMix(p, calido, .45)) + ',.55)',
    ink: tinta, inkSoft: 'rgba(' + rgb(tinta) + ',.68)'
  };
}

window.AnnlyReady.then(() => {
  const b = window.ANNLY_BUSINESS;
  if (b) {
    if (b.color_primario) {
      document.documentElement.style.setProperty('--gold', b.color_primario);
      const rgb = hexToRgb(b.color_primario);
      if (rgb) document.documentElement.style.setProperty('--gold-rgb', rgb);
      // Texto que va sobre el color de la marca: blanco si el color es oscuro, oscuro si es claro
      if (rHex(b.color_primario)) document.documentElement.style.setProperty('--on-gold', rLum(b.color_primario) > .30 ? '#201B2B' : '#FFFFFF');
    }
    if (rHex(b.color_primario) && rHex(b.color_secundario)) {
      const rs = document.documentElement.style;
      // Botón principal: del color de la marca hacia un tono más cercano al secundario
      const mezcla = rMix(b.color_primario, b.color_secundario, .28);
      rs.setProperty('--gold-mix', mezcla);
      rs.setProperty('--on-gold', rLum(rMix(b.color_primario, mezcla, .5)) > .30 ? '#201B2B' : '#FFFFFF');
      // Banner de los servicios: pastel difuso con los colores de la marca
      const bn = annlyBannerPastel(b.color_primario, b.color_secundario);
      if (bn) {
        rs.setProperty('--b1', bn.b1); rs.setProperty('--b2', bn.b2); rs.setProperty('--b3', bn.b3);
        rs.setProperty('--b-glow', bn.glow); rs.setProperty('--b-ink', bn.ink); rs.setProperty('--b-ink-soft', bn.inkSoft);
      }
    }
    if (b.color_secundario) {
      document.documentElement.style.setProperty('--gold-dark', b.color_secundario);
      const rgbDark = hexToRgb(b.color_secundario);
      if (rgbDark) document.documentElement.style.setProperty('--gold-dark-rgb', rgbDark);
      if (rHex(b.color_secundario)) document.documentElement.style.setProperty('--on-gold-dark', rLum(b.color_secundario) > .30 ? '#201B2B' : '#FFFFFF');
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
  // annly.app/slug de un negocio de pedidos: se envía a su tienda en Annly Pedidos
  if (window.ANNLY_BUSINESS && window.ANNLY_BUSINESS.tipo_negocio === 'pedidos') {
    window.location.replace(ANNLY_PEDIDOS_URL + '/' + encodeURIComponent(window.ANNLY_BUSINESS.slug) + window.location.search);
    return;
  }
  Promise.all([loadServices(), cargarSucursalesSitio()]).then(() => { iniciarSucursalSitio(); });
  loadPromo();
  loadRuletaConfig();
  loadCertificadosModulo();
  try{Sheets.initSheet();}catch(e){}
});


// ===== SUCURSALES (sitio público) =====
// Con más de una sucursal activa, el cliente elige dónde reservar (o llega directo con ?s=slug).
// La sucursal define: servicios visibles, profesionales, horario, bloqueos, dirección y WhatsApp.
let SUCURSALES_PUB = [];
let SUCURSAL_ACTUAL = null;
let SERVICES_TODOS = [];
let EMPLEADOS_SERVICIOS = null; // [{ id, servicios:[] }] profesionales activos ([] = hace todos)

function escSuc(t){ return String(t||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

function horarioBaseSitio(){
  return (SUCURSAL_ACTUAL && SUCURSAL_ACTUAL.horario) || (window.ANNLY_BUSINESS && window.ANNLY_BUSINESS.horario_estructurado) || null;
}

// Horario propio del profesional en la sucursal elegida (null = usa el de la sucursal)
function horarioPropioSitio(empleadoId){
  return Sheets.getEmpleadoHorario(empleadoId, SUCURSAL_ACTUAL ? SUCURSAL_ACTUAL.id : undefined);
}

async function cargarSucursalesSitio(){
  try {
    const [sucs, emps] = await Promise.all([
      Sheets.getSucursales(),
      Sheets.getEmpleadosActivosServicios().catch(() => null)
    ]);
    SUCURSALES_PUB = (sucs || []).filter(x => x.activa);
    EMPLEADOS_SERVICIOS = emps;
  } catch(e){
    console.error('Sucursales no disponibles, se muestra el negocio completo:', e);
    SUCURSALES_PUB = [];
  }
}

// Un servicio aparece si está activado en la sucursal y alguno de sus profesionales lo realiza
function serviciosDeSucursal(lista){
  if (!SUCURSAL_ACTUAL) return lista;
  const ofrecidos = Array.isArray(SUCURSAL_ACTUAL.servicios) ? new Set(SUCURSAL_ACTUAL.servicios) : null;
  const hayEquipo = Array.isArray(EMPLEADOS_SERVICIOS) && EMPLEADOS_SERVICIOS.length > 0;
  const equipo = hayEquipo ? EMPLEADOS_SERVICIOS.filter(e => (SUCURSAL_ACTUAL.empleados || []).includes(e.id)) : [];
  return lista.filter(svc => {
    if (ofrecidos && !ofrecidos.has(svc.id)) return false;
    if (!hayEquipo) return true; // negocio sin profesionales cargados: se reserva sin elegir
    const n = equipo.filter(e => !e.servicios.length || e.servicios.includes(svc.id)).length;
    return svc.esDoble ? n >= 2 : n >= 1;
  });
}

function iniciarSucursalSitio(){
  SERVICES_TODOS = SERVICES.slice();
  if (SUCURSALES_PUB.length <= 1){
    // Una sola sucursal: igual que siempre, pero con su horario y sus datos
    if (SUCURSALES_PUB.length === 1) aplicarSucursalSitio(SUCURSALES_PUB[0], false);
    else { renderServices(); loadBloqueos(); }
    return;
  }
  const b = window.ANNLY_BUSINESS || {};
  const param = new URLSearchParams(window.location.search).get('s');
  let guardada = null;
  try { guardada = sessionStorage.getItem('annly_suc_' + (b.slug || '')); } catch(e){}
  const buscar = slug => slug ? SUCURSALES_PUB.find(x => x.slug === slug || (slug === 'principal' && x.esPrincipal)) : null;
  const elegida = buscar(param) || buscar(guardada);
  if (elegida) aplicarSucursalSitio(elegida, true);
  else abrirSelectorSucursal(false);
}

function telefonoWhatsApp(t){
  let d = String(t || '').replace(/\D/g, '');
  if (d.length === 8) d = '507' + d; // número de Panamá sin código de país
  return d;
}

function formatHora12Sitio(hhmm){
  if (!hhmm) return '';
  const [hStr, mStr] = hhmm.split(':');
  let h = parseInt(hStr, 10);
  const m = mStr || '00';
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12; if (h === 0) h = 12;
  return m === '00' ? `${h}${ampm}` : `${h}:${m}${ampm}`;
}
function textoHorarioSitio(h){
  if (!h || !h.lv) return null;
  const etiqueta = { lv:'Lun-Vie', sab:'Sáb', dom:'Domingo' };
  return ['lv','sab','dom'].map(k => {
    const d = h[k] || { cerrado:true };
    return etiqueta[k] + ' ' + (d.cerrado ? 'Cerrado' : formatHora12Sitio(d.abre) + '-' + formatHora12Sitio(d.cierra));
  }).join(' | ');
}

function aplicarSucursalSitio(suc, conSelector){
  SUCURSAL_ACTUAL = suc;
  window.ANNLY_SUCURSAL_ID = suc.id;
  const b = window.ANNLY_BUSINESS || {};

  // Catálogo de la sucursal
  SERVICES = serviciosDeSucursal(SERVICES_TODOS);
  renderServices();
  loadBloqueos();

  // Dirección, horario y WhatsApp de la sucursal (con los del negocio como respaldo)
  const dirEl = document.getElementById('footer-direccion');
  if (dirEl) dirEl.textContent = suc.direccion || b.direccion || '';
  const horEl = document.getElementById('footer-horario');
  const horTxt = textoHorarioSitio(suc.horario) || b.horario_texto || 'Consulta disponibilidad';
  if (horEl) horEl.innerHTML = escSuc(horTxt).replace(/\|/g, '<br>');
  const waLink = document.getElementById('wa-float-link');
  const wa = suc.telefono ? telefonoWhatsApp(suc.telefono) : (b.whatsapp || '');
  if (waLink){
    if (wa){ waLink.href = 'https://wa.me/' + wa; waLink.style.display = ''; }
    else waLink.style.display = 'none';
  }

  // Tarjeta "Estás reservando en <sede> · Cambiar sede" debajo del encabezado (solo con varias sucursales)
  let chip = document.getElementById('suc-chip');
  if (conSelector){
    // Estilos de la tarjeta (van aquí para no depender de otro archivo)
    if (!document.getElementById('suc-chip-css')){
      const st = document.createElement('style');
      st.id = 'suc-chip-css';
      st.textContent = `/* Sede elegida (solo negocios con varias sucursales) */
#suc-chip{display:block;width:100%;flex:0 0 100%;box-sizing:border-box;padding:1rem 1rem 0;background-color:var(--bg-page);}
@media(min-width:600px){#suc-chip{max-width:480px;margin-left:auto!important;margin-right:auto!important;}}
@media(min-width:900px){#suc-chip{max-width:760px;}}
.suc-card{display:flex;align-items:center;gap:12px;padding:12px 12px 12px 14px;border-radius:var(--radius-lg,14px);background:#fff;border:1.5px solid rgba(var(--gold-dark-rgb),.35);box-shadow:0 6px 18px -12px rgba(var(--gold-dark-rgb),.55);}
.suc-card-ico{width:40px;height:40px;border-radius:50%;flex-shrink:0;display:flex;align-items:center;justify-content:center;background:rgba(var(--gold-dark-rgb),.12);color:var(--gold-dark);font-size:19px;}
.suc-card-txt{flex:1;min-width:0;display:flex;flex-direction:column;gap:1px;}
.suc-card-lbl{font-size:10px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--gold-dark);opacity:.85;}
.suc-card-name{font-family:var(--font-heading);font-size:17px;font-weight:700;color:#1a1816;line-height:1.2;}
.suc-card-dir{font-size:12px;color:rgba(30,26,22,.62);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.suc-card-btn{flex-shrink:0;display:inline-flex;align-items:center;gap:6px;padding:9px 14px;border-radius:999px;border:0;background:var(--gold-dark);color:var(--on-gold-dark,#fff);font-family:inherit;font-size:12.5px;font-weight:600;cursor:pointer;transition:transform .15s,filter .15s;}
.suc-card-btn:hover{transform:translateY(-1px);filter:brightness(1.08);}
.suc-card-btn i{font-size:15px;}
body.modo-oscuro .suc-card{background:rgba(255,255,255,.05);border-color:rgba(var(--gold-rgb),.35);}
body.modo-oscuro .suc-card-name{color:#F4EFE6;}
body.modo-oscuro .suc-card-dir{color:rgba(244,239,230,.65);}
body.modo-oscuro .suc-card-ico{background:rgba(var(--gold-rgb),.15);color:var(--gold);}
body.modo-oscuro .suc-card-lbl{color:var(--gold);}
@media(max-width:380px){.suc-card-btn span{display:none;}.suc-card-btn{padding:10px;}}
`;
      document.head.appendChild(st);
    }
    if (!chip){
      chip = document.createElement('div');
      chip.id = 'suc-chip';
      const lista = document.getElementById('serviceList');
      lista.parentNode.insertBefore(chip, document.getElementById('cert-link-wrap') || lista);
    }
    chip.innerHTML = `<div class="suc-card">
        <div class="suc-card-ico"><i class="ti ti-map-pin" aria-hidden="true"></i></div>
        <div class="suc-card-txt">
          <span class="suc-card-lbl">Estás reservando en</span>
          <span class="suc-card-name">${escSuc(suc.nombre)}</span>
          ${suc.direccion ? `<span class="suc-card-dir">${escSuc(suc.direccion)}</span>` : ''}
        </div>
        <button type="button" class="suc-card-btn" onclick="abrirSelectorSucursal(true)" aria-label="Cambiar de sede">
          <i class="ti ti-arrows-exchange" aria-hidden="true"></i><span>Cambiar sede</span>
        </button>
      </div>`;
    // El link queda listo para compartir y la elección se recuerda en esta visita
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('s', suc.slug || 'principal');
      window.history.replaceState(null, '', url.toString());
      sessionStorage.setItem('annly_suc_' + (b.slug || ''), suc.slug || 'principal');
    } catch(e){}
  } else if (chip) chip.remove();
}

function abrirSelectorSucursal(puedeCerrar){
  let ov = document.getElementById('ov-sucursal');
  if (!ov){
    ov = document.createElement('div');
    ov.className = 'ov';
    ov.id = 'ov-sucursal';
    document.body.appendChild(ov);
  }
  const tarjetas = SUCURSALES_PUB.map(x => `
    <div class="eval-card" style="cursor:pointer;margin-bottom:10px;${SUCURSAL_ACTUAL && SUCURSAL_ACTUAL.id === x.id ? 'border-color:var(--gold);' : ''}" onclick="elegirSucursalSitio('${x.id}')">
      <div class="eval-icon"><i class="ti ti-map-pin" aria-hidden="true"></i></div>
      <div style="flex:1;min-width:0;">
        <div class="eval-name">${escSuc(x.nombre)}</div>
        <div class="eval-sub">${escSuc(x.direccion || (window.ANNLY_BUSINESS && window.ANNLY_BUSINESS.direccion) || '')}</div>
      </div>
      <div class="eval-right"><i class="ti ti-arrow-right" aria-hidden="true" style="font-size:16px;color:var(--gold-dark);"></i></div>
    </div>`).join('');
  ov.innerHTML = `<div class="panel">
    <div class="phdr"><span class="ptitle">¿En qué sucursal quieres tu cita?</span>${puedeCerrar ? `<button class="pclose" onclick="closeOv('ov-sucursal')">×</button>` : ''}</div>
    <div class="pbody">${tarjetas}</div>
  </div>`;
  if (!puedeCerrar) document.getElementById('serviceList').innerHTML = '';
  openOv('ov-sucursal');
}

// Sucursal para los correos (solo si el negocio tiene más de una)
function datosSucursalCorreo(){
  if (!SUCURSAL_ACTUAL || SUCURSALES_PUB.length < 2) return {};
  const b = window.ANNLY_BUSINESS || {};
  const dir = SUCURSAL_ACTUAL.direccion || b.direccion || '';
  return {
    sucursal: SUCURSAL_ACTUAL.nombre,
    sucursalDireccion: dir,
    sucursalTelefono: SUCURSAL_ACTUAL.telefono || '',
    sucursalMapsUrl: dir ? 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(dir + ', Panamá') : ''
  };
}

function lineaSucursalResumen(){
  if (!SUCURSAL_ACTUAL || SUCURSALES_PUB.length < 2) return '';
  return `<strong>Sucursal:</strong> ${escSuc(SUCURSAL_ACTUAL.nombre)}${SUCURSAL_ACTUAL.direccion ? ' · ' + escSuc(SUCURSAL_ACTUAL.direccion) : ''}<br>`;
}

function elegirSucursalSitio(id){
  const suc = SUCURSALES_PUB.find(x => x.id === id);
  if (!suc) return;
  closeOv('ov-sucursal');
  aplicarSucursalSitio(suc, true);
}

// ===== CERTIFICADOS DE REGALO (sitio público) =====
let CERT_MODULO_DISPONIBLE = false;
let PAGOS_MODULO_DISPONIBLE = false;

async function loadCertificadosModulo(){
  try {
    // Camino principal: función pública en Supabase (funciona sin sesión).
    const codigos = await Sheets.getModulosPublicos();
    if (codigos) {
      CERT_MODULO_DISPONIBLE = codigos.includes('CERTIFICADOS');
      PAGOS_MODULO_DISPONIBLE = codigos.includes('PAGOS');
    } else {
      // Respaldo (solo funciona con sesión de dueño/Platform Admin, por RLS).
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
    }
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
        <button class="btn-main" style="background:var(--gold-dark);color:var(--on-gold-dark,#fff);" onclick="closeOv('ov-comprar-certificado')">Listo</button>
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
let empleadoHorarioCache=null,ocupadosPorEmpleadoCache={},horariosEmpleadosCache={};
// Cita doble: un segundo profesional, para la 2da persona de la reserva
let empleadoSeleccionado2=null,empleadoHorarioCache2=null;
let cuponAplicado=null,cuponDescuentoPct=0,cuponDescuentoMonto=0,cuponPremioTexto='';

// Descuento del cupón sobre un precio: primero el porcentaje y luego el monto fijo, sin pasar del precio
function descuentoDeCupon(precio){
  const dPct = cuponDescuentoPct>0 ? precio*(cuponDescuentoPct/100) : 0;
  const dFijo = cuponDescuentoMonto>0 ? Math.min(cuponDescuentoMonto, Math.max(0,precio-dPct)) : 0;
  return Math.round((dPct+dFijo)*100)/100;
}
let certAplicado=null; // {id, codigo, saldoDisponible}
let pagoRender=null, abonoMostrado=null;

// Fuente única de los montos de la reserva (precio, cupón, certificado y abono).
// Si el certificado cubre parte del servicio, el abono nunca puede ser mayor a lo
// que aún queda por pagar; si lo cubre completo, no se cobra abono.
// Un precio "no fijo" (sin precio, o con texto como "desde $25" o "consultar") no se conoce
// hasta atender al cliente. En ese caso el certificado SOLO se valida al reservar: no se
// descuenta nada hasta que el negocio complete la cita con el precio final.
function precioNoFijo(svc){
  return !svc || svc.price<=0 || !!(svc.precioTexto && String(svc.precioTexto).trim());
}

// Duración con espacio entre el número y la unidad ("4 - 6Horas" -> "4 - 6 Horas")
function fmtDur(d){
  return String(d==null?'':d).replace(/(\d)\s*(horas?|hrs?|min(?:utos)?)\b/gi,'$1 $2');
}

function calcularMontos(){
  const precio=curSvc.price>0?curSvc.price:0;
  const esConsultar=curSvc.price<=0;
  const noFijo=precioNoFijo(curSvc);
  const descuentoMonto=!esConsultar?descuentoDeCupon(precio):0;
  const precioTrasCupon=Math.max(0,precio-descuentoMonto);
  const certPorAplicar=!!certAplicado && noFijo;
  const montoCert=(certAplicado && !noFijo)?Math.min(certAplicado.saldoDisponible,precioTrasCupon):0;
  const precioFinal=Math.max(0,precioTrasCupon-montoCert);
  const tieneAbono=!!(curSvc.esEval||curSvc.requiereAbono);
  const abonoBase=curSvc.esEval?10:(curSvc.abonoMonto||10);
  let abono=tieneAbono?abonoBase:0;
  if(tieneAbono && !esConsultar && montoCert>0) abono=Math.min(abonoBase,precioFinal);
  return {precio,esConsultar,noFijo,certPorAplicar,descuentoMonto,precioTrasCupon,montoCert,precioFinal,tieneAbono,abonoBase,abono};
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
  // Orden de las categorías: el que definió el negocio en su panel (las nuevas van al final).
  // Sin un orden guardado se mantiene el clásico.
  const presentes=[...new Set(SERVICES.map(s=>s.cat).filter(Boolean))];
  const guardado=(window.ANNLY_BUSINESS && Array.isArray(window.ANNLY_BUSINESS.categorias_servicios)) ? window.ANNLY_BUSINESS.categorias_servicios : [];
  let cats;
  if(guardado.length){
    cats=[...guardado.filter(c=>presentes.includes(c)), ...presentes.filter(c=>!guardado.includes(c))];
  } else {
    const knownOrder=['Básicos','Tratamientos','Alisados','Color','Extensiones'];
    cats=[...knownOrder, ...presentes.filter(c=>!knownOrder.includes(c))];
  }
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
    <div class="card-footer"><span class="card-price">${precio}</span><span class="card-dur">${fmtDur(s.dur)}</span></div>
    <div class="card-arrow"><i class="ti ti-arrow-right" aria-hidden="true"></i></div>
  </div>`;
}

// Datos del calendario de un servicio (profesionales + sus horarios + bloqueos), pedidos EN PARALELO.
// Se empiezan a pedir al abrir el detalle, así al tocar "Agendar" ya están (o casi).
const PRECARGA_CAL = {};
function precargarCalendario(svcId){
  const clave = svcId + '|' + (SUCURSAL_ACTUAL ? SUCURSAL_ACTUAL.id : '');
  if (PRECARGA_CAL[clave]) return PRECARGA_CAL[clave];
  const t0 = performance.now();
  const p = (async () => {
    const [bloq, emps] = await Promise.all([
      Sheets.getBloqueos(SUCURSAL_ACTUAL ? SUCURSAL_ACTUAL.id : null).catch(() => ({ dias:[], horas:{} })),
      Sheets.getEmpleadosParaServicio(svcId).catch(() => [])
    ]);
    let empleados = emps || [];
    if (SUCURSAL_ACTUAL && Array.isArray(SUCURSAL_ACTUAL.empleados)) empleados = empleados.filter(e => SUCURSAL_ACTUAL.empleados.includes(e.id));
    const horarios = {};
    const hs = await Promise.all(empleados.map(e => horarioPropioSitio(e.id).catch(() => null)));
    empleados.forEach((e, i) => { horarios[e.id] = hs[i]; });
    console.log('[Annly] Calendario listo en', Math.round(performance.now() - t0), 'ms');
    return { bloqueos: bloq || { dias:[], horas:{} }, empleados, horarios };
  })();
  PRECARGA_CAL[clave] = p;
  // Vence en 60 s para no usar datos viejos (bloqueos u horarios recién cambiados)
  setTimeout(() => { if (PRECARGA_CAL[clave] === p) delete PRECARGA_CAL[clave]; }, 60000);
  p.catch(() => { delete PRECARGA_CAL[clave]; });
  return p;
}

function openDetail(id, esPromo){
  curSvc=SERVICES.find(s=>s.id===id);
  if(!curSvc)return;
  precargarCalendario(curSvc.id);
  if(esPromo && PROMO_DATA && PROMO_DATA.precioPromo){
    curSvc={...curSvc, price:parseFloat(PROMO_DATA.precioPromo), precioTexto:null, _promo:true, _precioOriginal:curSvc.price};
  }
  const icon=SVC_ICONS[curSvc.id]||'ti-star';
  const precio=curSvc.precioTexto||(curSvc.price>0?'$'+curSvc.price.toFixed(2):'A consultar');
  // Cada ítem: punto alineado con la primera línea; lo que va antes del guion largo, en negrita.
  // Si los textos son largos, la lista va en una sola columna para que se lea ordenada.
  const inclLargo=curSvc.includes.some(i=>String(i).length>34);
  const incl=curSvc.includes.map(i=>{
    const partes=String(i).split(' — ');
    const texto=partes.length>1 ? `<strong>${partes[0]}</strong> — ${partes.slice(1).join(' — ')}` : i;
    return `<div class="incl-item"><span class="incl-dot"></span><span>${texto}</span></div>`;
  }).join('');

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
          <span class="svc-banner-dur">${fmtDur(curSvc.dur)}</span>
        </div>
      </div>
    </div>
    <p class="svc-desc">${curSvc.desc}</p>
    <p class="incl-title">Incluye</p>
    <div class="incl-grid${inclLargo?' incl-uno':''}">${incl}</div>
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
    <div class="svc-pill-meta"><span class="svc-pill-price">${curSvc.price>0?'$'+curSvc.price.toFixed(2):curSvc.precioTexto||'A consultar'}</span><span class="svc-pill-dur">${fmtDur(curSvc.dur)}</span></div>`
    + (SUCURSAL_ACTUAL && SUCURSALES_PUB.length > 1 ? `<div style="width:100%;font-size:11px;opacity:.85;margin-top:4px;"><i class="ti ti-map-pin" aria-hidden="true"></i> ${escSuc(SUCURSAL_ACTUAL.nombre)}${SUCURSAL_ACTUAL.direccion ? ' · ' + escSuc(SUCURSAL_ACTUAL.direccion) : ''}</div>` : '');
  document.getElementById('timeSec').style.display='none';
  document.getElementById('btnContinue').disabled=true;

  // El calendario se abre YA con un aviso de carga; los datos llegan de la precarga
  const sel = document.getElementById('cal-empleado-sel');
  if (sel){ sel.style.display='none'; sel.innerHTML=''; }
  document.getElementById('calGrid').innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:1.5rem 0;color:#999;font-size:12px;"><i class="ti ti-loader-2" style="display:inline-block;animation:annlyGiro 1s linear infinite;font-size:18px;"></i><br>Cargando disponibilidad…</div>';
  openOv('ov-cal');
  const svcAbierto = curSvc.id;

  let datos;
  try { datos = await precargarCalendario(curSvc.id); }
  catch(e){ console.error(e); datos = { bloqueos:{ dias:[], horas:{} }, empleados:[], horarios:{} }; }
  if (!curSvc || curSvc.id !== svcAbierto) return; // cambió de servicio mientras cargaba

  BLOQUEOS = datos.bloqueos;
  if (!BLOQUEOS.dias) BLOQUEOS.dias = [];
  if (!BLOQUEOS.horas) BLOQUEOS.horas = {};
  empleadosDelServicio = datos.empleados.slice();
  horariosEmpleadosCache = {};
  if (empleadosDelServicio.length > 1) empleadosDelServicio.forEach(e => { horariosEmpleadosCache[e.id] = datos.horarios[e.id] || null; });

  if (curSvc.esDoble) {
    // Cita doble: siempre se elige explícito para cada persona, nunca "cualquiera"
    modoCualquiera = false;
    empleadoSeleccionado = null; empleadoSeleccionado2 = null;
    empleadoHorarioCache = null; empleadoHorarioCache2 = null;
  } else {
    modoCualquiera = empleadosDelServicio.length > 1;
    empleadoSeleccionado = empleadosDelServicio.length === 1 ? empleadosDelServicio[0].id : null;
    empleadoHorarioCache = empleadosDelServicio.length === 1 ? (datos.horarios[empleadoSeleccionado] || null) : null;
  }
  renderSelectorEmpleado();

  renderCal();
}

function escTextoEmp(t){
  return String(t||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/\n/g,'<br>');
}

// Presentación del profesional (la que el negocio escribió en su ficha)
// "11:00" -> "11:00 AM"
function horaLegible(t){
  const [h, m] = String(t || '0:00').split(':').map(Number);
  const hh = h % 12 === 0 ? 12 : h % 12;
  return hh + ':' + String(m || 0).padStart(2, '0') + ' ' + (h >= 12 ? 'PM' : 'AM');
}

// Días y horas que atiende un profesional con horario propio, agrupando días seguidos con la misma hora.
// Ej.: "Mar a Vie · 11:00 AM – 5:00 PM"
function resumenHorarioEmpleado(h){
  if (!h) return '';
  const orden = [['Lun',1],['Mar',2],['Mié',3],['Jue',4],['Vie',5],['Sáb',6],['Dom',0]];
  const dias = orden.map(([nombre, dow]) => {
    const c = cfgDia(h, dow);
    return (!c.cerrado && c.abre && c.cierra) ? { nombre, rango: horaLegible(c.abre) + ' – ' + horaLegible(c.cierra) } : null;
  });
  const grupos = [];
  dias.forEach((d, i) => {
    if (!d) return;
    const ant = grupos[grupos.length - 1];
    if (ant && ant.fin === i - 1 && ant.rango === d.rango) { ant.fin = i; ant.hasta = d.nombre; }
    else grupos.push({ desde: d.nombre, hasta: d.nombre, fin: i, rango: d.rango });
  });
  if (!grupos.length) return '';
  return grupos.map(g => (g.desde === g.hasta ? g.desde : g.desde + ' a ' + g.hasta) + ' · ' + g.rango).join(' | ');
}

// Presentación del profesional (la que el negocio escribió en su ficha) y su horario asignado
function bioEmpleadoHtml(e, etiqueta, horario){
  const horarioTxt = resumenHorarioEmpleado(horario);
  if (!e || (!e.bio && !e.fotoUrl && !horarioTxt)) return '';
  const inicial = escTextoEmp((e.nombre || '?').trim().charAt(0).toUpperCase());
  const foto = e.fotoUrl
    ? `<img class="emp-bio-foto" src="${escTextoEmp(e.fotoUrl)}" alt=""/>`
    : `<div class="emp-bio-foto emp-bio-ini">${inicial}</div>`;
  return `<div class="emp-bio">
    <div class="emp-bio-head">${foto}<div class="emp-bio-name">${etiqueta} ${escTextoEmp(e.nombre)}</div></div>
    ${e.bio ? `<p>${escTextoEmp(e.bio)}</p>` : ''}
    ${horarioTxt ? `<div class="emp-bio-horario"><i class="ti ti-clock" aria-hidden="true"></i> Atiende: ${escTextoEmp(horarioTxt)}</div>` : ''}
  </div>`;
}

function renderSelectorEmpleado(){
  const cont=document.getElementById('cal-empleado-sel');
  if (!cont) return;
  if (curSvc && curSvc.esDoble){ renderSelectorEmpleadoDoble(); return; }
  if (empleadosDelServicio.length <= 1){
    // Con un solo profesional no se pregunta "¿con quién?", pero si tiene presentación se muestra
    const unico = empleadosDelServicio[0];
    const tarjeta = unico ? bioEmpleadoHtml(unico, 'Tu profesional:', empleadoHorarioCache) : '';
    if (tarjeta){ cont.style.display='block'; cont.innerHTML = tarjeta; }
    else { cont.style.display='none'; cont.innerHTML=''; }
    return;
  }
  cont.style.display='block';
  const elegido = (!modoCualquiera && empleadoSeleccionado) ? empleadosDelServicio.find(e => e.id===empleadoSeleccionado) : null;
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
    </div>
    ${bioEmpleadoHtml(elegido, 'Sobre', empleadoHorarioCache)}`;
}

// Cita doble: 2 selectores — uno por persona — sin permitir elegir al mismo profesional en los 2
function renderSelectorEmpleadoDoble(){
  const cont=document.getElementById('cal-empleado-sel');
  if (!cont) return;
  cont.style.display='block';
  const pill=(e,sel,cual)=>`
    <div class="emp-pill${sel?' sel':''}" onclick="elegirEmpleadoDoble(${cual},'${e.id}')">
      <div class="emp-pill-av">${e.fotoUrl?`<img src="${e.fotoUrl}"/>`:`<span>${(e.nombre||'?').trim().charAt(0).toUpperCase()}</span>`}</div>
      <span>${e.nombre}</span>
    </div>`;
  const pillsA = empleadosDelServicio.filter(e=>e.id!==empleadoSeleccionado2).map(e=>pill(e, empleadoSeleccionado===e.id, 1)).join('');
  const pillsB = empleadosDelServicio.filter(e=>e.id!==empleadoSeleccionado).map(e=>pill(e, empleadoSeleccionado2===e.id, 2)).join('');
  cont.innerHTML = `
    <p class="emp-sel-lbl">Profesional para ti</p>
    <div class="emp-pill-row">${pillsA}</div>
    <p class="emp-sel-lbl" style="margin-top:10px;">Profesional para tu acompañante</p>
    <div class="emp-pill-row">${pillsB}</div>
    ${(!empleadoSeleccionado||!empleadoSeleccionado2)?'<p style="font-size:11px;color:#aaa;margin-top:8px;">Elige un profesional distinto para cada persona para ver los horarios disponibles.</p>':''}`;
}

async function elegirEmpleadoDoble(cual, id){
  if (cual===1){ empleadoSeleccionado=id; try{ empleadoHorarioCache=await horarioPropioSitio(id);}catch(e){ empleadoHorarioCache=null; } }
  else { empleadoSeleccionado2=id; try{ empleadoHorarioCache2=await horarioPropioSitio(id);}catch(e){ empleadoHorarioCache2=null; } }
  renderSelectorEmpleadoDoble();
  renderCal();
  if (selectedDay) selDay2(selectedDay);
}

async function elegirEmpleado(id){
  if (id === null){ modoCualquiera = true; empleadoSeleccionado = null; empleadoHorarioCache = null; }
  else {
    modoCualquiera = false; empleadoSeleccionado = id;
    try { empleadoHorarioCache = await horarioPropioSitio(id); } catch(e){ empleadoHorarioCache = null; }
  }
  renderSelectorEmpleado();
  renderCal();
  if (selectedDay) selDay2(selectedDay);
}
// Reglas de horarios: viven en horarios.js (compartido con el panel). Aquí solo se usan.
const HOR = window.AnnlyHorarios;
function bloqueDelDia(dow, horario){ return HOR.bloqueDelDia(dow, horario); }
function cfgDia(h, dow){ return HOR.cfgDia(h, dow); }

// Qué horarios cuentan para el calendario según cómo se está reservando:
// cita doble (los 2 deben estar: intersección), "cualquiera disponible" (basta uno: unión)
// o un profesional / la sucursal.
function horariosParaCalendario(){
  if (curSvc && curSvc.esDoble){
    if (!empleadoSeleccionado || !empleadoSeleccionado2) return null; // hasta elegir a los 2 no hay calendario
    return { horarios: [horarioDeEmpleado(empleadoSeleccionado), horarioDeEmpleado(empleadoSeleccionado2)], modoDia: 'todos', modoRango: 'interseccion' };
  }
  if (modoCualquiera && empleadosDelServicio.length > 1){
    return { horarios: empleadosDelServicio.map(e => horarioDeEmpleado(e.id)), modoDia: 'alguno', modoRango: 'union' };
  }
  const h = (!modoCualquiera && empleadoHorarioCache) ? empleadoHorarioCache : horarioBaseSitio();
  return { horarios: [h], modoDia: 'todos', modoRango: 'interseccion' };
}

function horarioDeEmpleado(id){
  return horariosEmpleadosCache[id] || horarioBaseSitio() || null;
}

// ¿Este profesional trabaja a esa hora? (según su propio horario o, si no tiene, el del negocio)
function empleadoTrabajaEn(id, dow, slotKey){
  const c = cfgDia(horarioDeEmpleado(id), dow);
  if (c.cerrado || !c.abre || !c.cierra) return false;
  const m = timeToMin(slotKey);
  return m >= timeToMin(c.abre) && m <= timeToMin(c.cierra);
}

function diaCerrado(dow){
  const cfg = horariosParaCalendario();
  if (!cfg) return true;
  return HOR.diaCerrado(cfg.horarios, dow, cfg.modoDia);
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

function timeToMin(t){ return HOR.timeToMin(t); }

function genSlots(){
  const cfg = horariosParaCalendario();
  if (!cfg) return [];
  return HOR.generarSlots({ horarios: cfg.horarios, fecha: new Date(calY, calM, selectedDay), modo: cfg.modoRango, durMin: (curSvc && curSvc.durMin) || 60 });
}

function isBlocked(slotKey, citas, durSvc){ return HOR.solapa(slotKey, citas, durSvc); }

async function selDay2(d){
  selectedDay=d; selTime=null;
  renderCal();
  document.getElementById('timeSec').style.display='block';
  document.getElementById('btnContinue').disabled=true;
  document.getElementById('timeGrid').innerHTML='<p style="color:#aaa;font-size:11px;grid-column:span 4;text-align:center;padding:.5rem;">Consultando disponibilidad...</p>';
  const fechaStr=d+' de '+MESES[calM]+' '+calY;
  try{
    if (curSvc && curSvc.esDoble){
      const [ocA, ocB] = await Promise.all([
        Sheets.getHorasOcupadas(fechaStr, empleadoSeleccionado).catch(()=>[]),
        Sheets.getHorasOcupadas(fechaStr, empleadoSeleccionado2).catch(()=>[])
      ]);
      ocupadosPorEmpleadoCache = {};
      ocupadosPorEmpleadoCache[empleadoSeleccionado]=ocA;
      ocupadosPorEmpleadoCache[empleadoSeleccionado2]=ocB;
      window._citasOcupadas = null;
    } else if (modoCualquiera && empleadosDelServicio.length > 1){
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
    if (curSvc && curSvc.esDoble){
      ocupada = isBlocked(key, ocupadosPorEmpleadoCache[empleadoSeleccionado]||[], durSvc) || isBlocked(key, ocupadosPorEmpleadoCache[empleadoSeleccionado2]||[], durSvc);
    } else if (modoCualquiera && empleadosDelServicio.length > 1){
      // Solo se ve "ocupado" si TODOS los profesionales que hacen el servicio están ocupados
      // o no trabajan a esa hora
      const dowSlot = new Date(calY,calM,selectedDay).getDay();
      ocupada = empleadosDelServicio.every(e => !empleadoTrabajaEn(e.id, dowSlot, key) || isBlocked(key, ocupadosPorEmpleadoCache[e.id]||[], durSvc));
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
  const dowSel = new Date(calY,calM,selectedDay).getDay();
  for (const e of empleadosDelServicio){
    if (empleadoTrabajaEn(e.id, dowSel, selTime) && !isBlocked(selTime, ocupadosPorEmpleadoCache[e.id]||[], durSvc)) return e.id;
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
  cuponAplicado=null; cuponDescuentoPct=0; cuponDescuentoMonto=0; cuponPremioTexto='';
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
    const stepAbono = curSvc.esDoble ? 3 : 2;
    if(!tieneYappy && !tieneYappyComercial && !tieneBanco){
      pagoSection=`
      <div class="step-row" style="margin-top:1rem;"><span class="stepn">${stepAbono}</span><span class="step-lbl">Abono $${montoAbono.toFixed(2)} — ${textoTipo}</span></div>
      <div class="note-box-warn">
        <i class="ti ti-whatsapp" aria-hidden="true"></i>
        <span>Este servicio requiere un abono. Contáctanos por WhatsApp para coordinar el pago antes de confirmar tu cita.</span>
      </div>
      <div class="fg" style="margin-top:.875rem;"><label class="flbl">N° de comprobante / referencia</label><input class="fi" id="fref" placeholder="Ej: coordinado por WhatsApp"/></div>`;
    } else {
      pagoSection=`
      <div class="step-row" style="margin-top:1rem;"><span class="stepn">${stepAbono}</span><span class="step-lbl">Abono $${montoAbono.toFixed(2)} — ${textoTipo}</span></div>
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
    <div class="svc-resumen">
      <div class="svc-resumen-name">${curSvc.name}</div>
      <div class="svc-resumen-meta">${dayStr} · ${selTime} · ${fmtDur(curSvc.dur)}</div>
    </div>
    <div class="step-row"><span class="stepn">1</span><span class="step-lbl">Tus datos</span></div>
    <div class="frow">
      <div class="fg"><label class="flbl">Nombre</label><input class="fi" id="fn" placeholder="Tu nombre"/></div>
      <div class="fg"><label class="flbl">WhatsApp</label><input class="fi" id="fp" placeholder="+507..."/></div>
    </div>
    <div class="fg"><label class="flbl">Correo</label><input class="fi" id="fe" placeholder="tu@correo.com"/></div>
    <div class="fg"><label class="flbl">Nota (opcional)</label><input class="fi" id="fnote" placeholder="Alguna preferencia o detalle que debamos saber..."/></div>
    ${curSvc.esDoble ? `
    <div class="step-row" style="margin-top:1rem;"><span class="stepn">2</span><span class="step-lbl">Datos de tu acompañante</span></div>
    <div class="frow">
      <div class="fg"><label class="flbl">Nombre</label><input class="fi" id="fn2" placeholder="Nombre de tu acompañante"/></div>
      <div class="fg"><label class="flbl">WhatsApp</label><input class="fi" id="fp2" placeholder="+507..."/></div>
    </div>
    <div class="fg"><label class="flbl">Correo</label><input class="fi" id="fe2" placeholder="correo@acompañante.com"/></div>` : `
    <div class="fg">
      <label class="flbl">¿Tienes un cupón de descuento?</label>
      <div style="display:flex;gap:8px;">
        <input class="fi" id="fcupon" placeholder="Ej: RUL-4F2A" style="flex:1;text-transform:uppercase;">
        <button type="button" onclick="aplicarCupon()" style="padding:0 16px;background:var(--gold-dark);color:var(--on-gold-dark,#fff);border:none;border-radius:var(--radius);font-size:12px;font-weight:500;cursor:pointer;white-space:nowrap;">Aplicar</button>
      </div>
      <p id="cuponMsg" style="font-size:11px;margin-top:6px;min-height:14px;"></p>
    </div>
    <div class="fg">
      <label class="flbl">¿Tienes un certificado de regalo?</label>
      <div style="display:flex;gap:8px;">
        <input class="fi" id="fcert" placeholder="Ej: CERT-A1B2C3" style="flex:1;text-transform:uppercase;">
        <button type="button" onclick="aplicarCertificadoCodigo()" style="padding:0 16px;background:var(--gold-dark);color:var(--on-gold-dark,#fff);border:none;border-radius:var(--radius);font-size:12px;font-weight:500;cursor:pointer;white-space:nowrap;">Aplicar</button>
      </div>
      <p id="certMsg" style="font-size:11px;margin-top:6px;min-height:14px;"></p>
    </div>`}
    <div id="pagoWrap">${pagoSection}</div>
    <button class="btn-main" id="btnConfirmar" onclick="${curSvc.esDoble ? `confirmarDoble('${dayStr}')` : `confirmar('${dayStr}')`}" style="${(tieneAbono&&tieneYappyComercial)?'display:none;':''}">Confirmar mi cita</button>`;

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
    certAplicado={id:res.certificateId, codigo:res.codigo, saldoDisponible:res.saldoDisponible, unSoloUso:!!res.unSoloUso};
    msgEl.style.color='#3a7a3a';
    const _m=calcularMontos();
    if(_m.noFijo){
      // Precio no fijo: el certificado solo se valida; se descuenta el día de la cita
      msgEl.textContent=res.unSoloUso
        ? `✓ Certificado de cortesía válido: $${res.saldoDisponible.toFixed(2)}. Es de un solo uso. Como el precio de este servicio no es fijo, no se descuenta ahora: se aplicará el día de tu cita, cuando se confirme el precio.`
        : `✓ Certificado válido: $${res.saldoDisponible.toFixed(2)} disponibles. Como el precio de este servicio no es fijo, no se descuenta ahora: se aplicará el día de tu cita, cuando se confirme el precio.`;
    } else {
      msgEl.textContent=res.unSoloUso
        ? `✓ Certificado de cortesía: $${res.saldoDisponible.toFixed(2)}. Es de un solo uso: se aplica en esta cita y no queda saldo.`
        : `✓ Certificado válido: $${res.saldoDisponible.toFixed(2)} disponibles.`;
      if(_m.tieneAbono && !_m.esConsultar && _m.abono<=0) msgEl.textContent+=' Cubre tu servicio: no necesitas pagar abono.';
    }
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
  const reset=()=>{ cuponAplicado=null; cuponDescuentoPct=0; cuponDescuentoMonto=0; cuponPremioTexto=''; };
  if(!codigo){ msgEl.textContent=''; reset(); actualizarPagoPorCert(); return; }
  // El cupón es de quien ganó el premio: se comprueba con el WhatsApp de la reserva
  const tel=(document.getElementById('fp')||{}).value||'';
  if(tel.replace(/\D/g,'').length<7){
    reset(); msgEl.style.color='#c0392b';
    msgEl.textContent='Escribe primero tu WhatsApp (el mismo con el que giraste la ruleta).';
    actualizarPagoPorCert(); return;
  }
  msgEl.style.color='#999';
  msgEl.textContent='Verificando...';
  const res=await Sheets.validarCupon(codigo, tel);
  reset();
  const hasta=res.venceEn?` Válido hasta el ${res.venceEn.split('-').reverse().join('/')}.`:'';
  if(res.valido && res.tipo==='porcentaje'){
    cuponAplicado=codigo.toUpperCase(); cuponDescuentoPct=res.valor; cuponPremioTexto=res.premio;
    msgEl.style.color='#3a7a3a';
    msgEl.textContent=`✓ Cupón válido: ${res.valor}% de descuento.${hasta}`;
  } else if(res.valido && res.tipo==='monto'){
    cuponAplicado=codigo.toUpperCase(); cuponDescuentoMonto=res.valor; cuponPremioTexto=res.premio;
    msgEl.style.color='#3a7a3a';
    msgEl.textContent=`✓ Cupón válido: $${Number(res.valor).toFixed(2)} de descuento.${hasta}`;
  } else if(res.valido){
    cuponAplicado=codigo.toUpperCase(); cuponPremioTexto=res.premio;
    msgEl.style.color='#3a7a3a';
    msgEl.textContent=`✓ Cupón válido: ${res.premio}. Lo recibirás cuando vengas a tu cita.${hasta}`;
  } else {
    msgEl.style.color='#c0392b';
    const motivos={ya_canjeado:'Este cupón ya fue utilizado.',codigo_no_encontrado:'Cupón no válido.',codigo_vacio:'Ingresa un código.',otro_cliente:'Este cupón pertenece a otra persona. Usa el WhatsApp con el que giraste la ruleta.',vencido:'Este cupón ya venció.'};
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
  await finalizarCita(dayStr, ref, false);
}

// Llamado cuando el pago se completó de verdad por el botón real de Yappy
// (eventSuccess del widget) — el comprobante es el propio orderId de Yappy,
// no algo que el cliente tipeó a mano.
async function confirmarCitaConfirmada(dayStr, orderId){
  if(timerInt)clearInterval(timerInt);
  await finalizarCita(dayStr, orderId, true);
}

// pagoVerificado = true solo con el botón real de Yappy. Un abono a mano queda "por confirmar".
async function finalizarCita(dayStr, ref, pagoVerificado){
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
  const noFijo = precioNoFijo(curSvc);
  const notaFinal = curSvc._promo ? (nota ? nota+' [PROMO aplicada]' : 'PROMO aplicada') : nota;
  const citaId = 'cita-' + Date.now();

  const descuentoMonto = !esConsultar ? descuentoDeCupon(precio) : 0;
  const precioTrasCupon = Math.max(0, precio - descuentoMonto);
  // Precio fijo: el certificado se descuenta ahora. Precio no fijo ("desde…", "consultar"):
  // solo se valida, y el negocio lo aplica al completar la cita con el precio final. Así, si el
  // cliente no califica para el servicio, su certificado queda intacto.
  const montoCertAplicado = (certAplicado && !noFijo)
    ? Math.min(certAplicado.saldoDisponible, precioTrasCupon)
    : 0;
  const certPorAplicar = !!certAplicado && noFijo;
  const precioFinal = Math.max(0, precioTrasCupon - montoCertAplicado);

  const cita={nombre,telefono:tel,correo,nota:notaFinal,servicio:curSvc.name,categoria:curSvc.cat,
    precioTotal:precio,precioEsConsultar:esConsultar,fecha:dayStr,hora:selTime,duracionMin:curSvc.durMin,
    comprobante:ref,abonoMonto:tieneAbono?montoAbono:0,abonoTipo:tieneAbono?tipoAbono:'',
    metodoPago:tieneAbono?pagoTipo:'', citaId:citaId, empleadoId:empleadoAsignadoFinal(),
    abonoPorConfirmar: tieneAbono && !pagoVerificado,
    cuponUsado:cuponAplicado||'', descuentoCupon:cuponDescuentoPct||0, descuentoCuponMonto:(!esConsultar && cuponDescuentoMonto>0)?Math.round((descuentoMonto-(cuponDescuentoPct>0?precio*(cuponDescuentoPct/100):0))*100)/100:0, precioFinal:precioFinal,
    certificadoCodigo: (montoCertAplicado>0 || certPorAplicar) ? certAplicado.codigo : null,
    certificadoMonto: montoCertAplicado>0 ? montoCertAplicado : null,
    certificadoSaldoRestante: montoCertAplicado>0 ? (certAplicado.unSoloUso ? 0 : Math.max(0, certAplicado.saldoDisponible - montoCertAplicado)) : null};
  // El cupón se vuelve a comprobar con los datos finales (teléfono y fecha): es de quien lo ganó y solo vale una vez
  if(cuponAplicado && !pagoVerificado){
    let chk={valido:true};
    try{ chk=await Sheets.validarCupon(cuponAplicado, tel); }catch(e){ console.error(e); }
    if(!chk.valido){
      const motivos={ya_canjeado:'ya fue utilizado',otro_cliente:'pertenece a otra persona (usa el WhatsApp con el que giraste la ruleta)',vencido:'ya venció',codigo_no_encontrado:'no es válido'};
      cuponAplicado=null; cuponDescuentoPct=0; cuponDescuentoMonto=0; cuponPremioTexto='';
      const el=document.getElementById('fcupon'); if(el) el.value='';
      const cm=document.getElementById('cuponMsg'); if(cm) cm.textContent='';
      try{ actualizarPagoPorCert(); }catch(e){}
      errorAlGuardarCita(null, null, 'Tu cupón '+(motivos[chk.motivo]||'ya no es válido')+'. Lo quitamos del resumen: revisa el total y confirma de nuevo.');
      return;
    }
  }
  let appointmentId=null;
  try{ appointmentId=await Sheets.guardarCita(cita); }
  catch(e){
    console.error('Error guardando la cita:', e);
    errorAlGuardarCita(e, pagoVerificado ? ref : null);
    return;
  }
  try{await Sheets.upsertClienteDesdeReserva(nombre, tel, correo);}catch(e){console.error(e);}
  if(cuponAplicado){ try{await Sheets.marcarCuponCanjeado(cuponAplicado, tel);}catch(e){console.error(e);} }
  let certFallo=false;
  if(montoCertAplicado>0){ try{await Sheets.aplicarCertificado(certAplicado.id, montoCertAplicado, appointmentId);}catch(e){console.error(e); certFallo=true;} }
  const horaDisplay = (()=>{const[h,m]=selTime.split(':');const hh=parseInt(h);return (hh>12?hh-12:hh)+':'+m+(hh>=12?' PM':' AM');})();
  Sheets.enviarCorreo('cita_confirmada', {correoCliente:correo, nombreCliente:nombre, servicio:curSvc.name, fecha:dayStr, hora:horaDisplay, ...datosSucursalCorreo()});
  Sheets.enviarCorreo('cita_nueva', {nombreCliente:nombre, telefonoCliente:tel, servicio:curSvc.name, fecha:dayStr, hora:horaDisplay, ...datosSucursalCorreo()});
  await new Promise(r=>setTimeout(r,900));
  const precioStr=esConsultar?'Por confirmar':(curSvc.precioTexto&&curSvc.precioTexto.toLowerCase().includes('desde')?'Desde $'+precio.toFixed(2):'$'+precio.toFixed(2));
  const restanteTexto = noFijo
    ? (tieneAbono ? 'Se aplicará el abono al precio acordado' : 'Por confirmar')
    : '$'+(tipoAbono==='descontable' ? Math.max(0, precioFinal - montoAbono).toFixed(2) : precioFinal.toFixed(2));
  const abonoLine=tieneAbono?`<strong>Abono ${pagoVerificado ? 'pagado' : 'enviado (por validar)'}:</strong> <span style="color:#4CAF50;font-weight:600;">$${montoAbono.toFixed(2)}</span> (${textoTipo})<br><strong>Comprobante:</strong> ${ref}<br>`
    :(abonoExonerado?`<strong>Abono:</strong> No requerido (cubierto por tu certificado)<br>`:'');
  const cuponLine = (cuponAplicado && descuentoMonto>0 && !esConsultar)
    ? `<strong>Descuento por cupón:</strong> <span style="color:#D95F2B;font-weight:600;">${cuponDescuentoPct>0&&cuponDescuentoMonto<=0?`-${cuponDescuentoPct}% `:''}(-$${descuentoMonto.toFixed(2)})</span><br>`
    : (cuponAplicado ? `<strong>Cupón aplicado:</strong> ${cuponPremioTexto}<br>` : '');
  const certLine = montoCertAplicado>0
    ? `<strong>Certificado aplicado (${certAplicado.codigo}):</strong> <span style="color:#4CAF50;font-weight:600;">-$${montoCertAplicado.toFixed(2)}</span><br>${certFallo
      ? '<span style="color:#c0392b;font-size:12px;">No pudimos actualizar el saldo de tu certificado; el negocio lo revisará contigo.</span><br>'
      : `<strong>Saldo restante del certificado:</strong> <span style="color:#4CAF50;font-weight:600;">$${(certAplicado.unSoloUso ? 0 : Math.max(0,certAplicado.saldoDisponible-montoCertAplicado)).toFixed(2)}</span>${certAplicado.unSoloUso ? ' <span style="font-size:11px;color:#888;">(cortesía de un solo uso)</span>' : ''}<br>`}`
    : '';
  const certPendienteLine = certPorAplicar
    ? `<strong>Certificado (${certAplicado.codigo}):</strong> validado, con $${certAplicado.saldoDisponible.toFixed(2)} disponibles<br><span style="font-size:12px;color:#888;">No se ha descontado nada. Se aplicará el día de tu cita, cuando se confirme el precio final.</span><br>`
    : '';
  const totalLine = noFijo
    ? `<strong>Monto a cancelar el día de la cita:</strong> ${restanteTexto}<br>`
    : `<strong>Total a pagar:</strong> <span style="color:#D95F2B;font-weight:600;">${restanteTexto}</span><br>`;
  document.getElementById('form-body').innerHTML=`
    <div class="success-wrap">
      <div class="s-icon"><i class="ti ti-${tieneAbono && !pagoVerificado ? 'hourglass' : 'check'}" aria-hidden="true"></i></div>
      <div class="s-title">${tieneAbono && !pagoVerificado ? '¡Reserva recibida!' : '¡Cita reservada!'}</div>
      <div class="s-sub">${tieneAbono && !pagoVerificado
        ? 'Tu horario quedó apartado. Vamos a validar tu abono y te llegará la confirmación por correo.'
        : 'Tu cita está confirmada. Te enviamos los detalles por correo.'}</div>
      <div class="s-detail">
        <strong>Servicio:</strong> ${curSvc.name}<br>
        ${lineaSucursalResumen()}<strong>Fecha:</strong> ${dayStr}<br>
        <strong>Hora:</strong> ${selTime ? (()=>{const[h,m]=selTime.split(':');const hh=parseInt(h);return (hh>12?hh-12:hh)+':'+m+(hh>=12?' PM':' AM');})() : selTime}<br>
        <strong>Duración aprox.:</strong> ${fmtDur(curSvc.dur)}<br>
        <strong>Precio total:</strong> <span style="color:#D95F2B;font-weight:600;">${precioStr}</span><br>
        ${abonoLine}
        ${cuponLine}
        ${certLine}
        ${certPendienteLine}
        ${totalLine}
      </div>
      ${abonoExonerado?'':'<p style="font-size:11px;color:#aaa;margin-bottom:1rem;">Recuerda: cancelaciones con menos de 24 horas de anticipación no tienen reembolso del abono.</p>'}
      <button class="btn-main" style="background:var(--gold-dark);color:var(--on-gold-dark,#fff);font-family:var(--font-heading);" onclick="closeOv('ov-form')">Listo</button>
    </div>`;

  setTimeout(async () => {
    try {
      const check = await Sheets.verificarElegibilidadRuleta(tel);
      if (check && check.elegible) {
        closeOv('ov-form');
        abrirModalRuleta(tel, nombre, appointmentId);
      }
      // si no es elegible (ya participó o ruleta apagada), el modal de confirmación se queda abierto tal cual
    } catch (err) {
      console.error('Error verificando elegibilidad de ruleta:', err);
    }
  }, 1800);
}

// ---- Cita doble: confirmación y guardado (2 personas, 2 profesionales, 1 solo abono) ----
async function confirmarDoble(dayStr){
  const nombre=document.getElementById('fn').value.trim();
  const tel=document.getElementById('fp').value.trim();
  const correo=document.getElementById('fe').value.trim();
  const nombre2=document.getElementById('fn2').value.trim();
  const tel2=document.getElementById('fp2').value.trim();
  const correo2=document.getElementById('fe2').value.trim();
  const refEl=document.getElementById('fref');
  const ref=refEl?refEl.value.trim():'Sin abono';
  const tieneAbono = !!(curSvc.esEval || curSvc.requiereAbono);
  if(!nombre||!tel||!correo){alert('Por favor completa tu nombre, WhatsApp y correo.');return;}
  if(!nombre2||!tel2||!correo2){alert('Por favor completa los datos de tu acompañante.');return;}
  if(!empleadoSeleccionado||!empleadoSeleccionado2){alert('Elige un profesional para cada persona.');return;}
  if(tieneAbono&&!ref){alert('Por favor ingresa el número de comprobante del pago.');return;}
  if(timerInt)clearInterval(timerInt);
  const btnC=document.getElementById('btnConfirmar');
  if(btnC){btnC.disabled=true;btnC.textContent='Confirmando...';}
  await finalizarCitaDoble(dayStr, ref);
}

async function finalizarCitaDoble(dayStr, ref){
  const nombre=document.getElementById('fn').value.trim();
  const tel=document.getElementById('fp').value.trim();
  const correo=document.getElementById('fe').value.trim();
  const nota=document.getElementById('fnote')?document.getElementById('fnote').value.trim():'';
  const nombre2=document.getElementById('fn2').value.trim();
  const tel2=document.getElementById('fp2').value.trim();
  const correo2=document.getElementById('fe2').value.trim();

  const tieneAbono = !!(curSvc.esEval || curSvc.requiereAbono);
  const montoAbono = curSvc.esEval ? 10 : (curSvc.abonoMonto || 10);
  const tipoAbono = curSvc.esEval ? 'descontable' : (curSvc.abonoTipo || 'noreembolsable');
  const precioTotal = curSvc.price>0?curSvc.price:0;
  const precioMitad = Math.round((precioTotal/2)*100)/100;
  const citaIdBase = 'cita-' + Date.now();

  const base = {
    nota, servicio:curSvc.name, categoria:curSvc.cat, precioEsConsultar:false,
    fecha:dayStr, hora:selTime, duracionMin:curSvc.durMin,
    cuponUsado:'', descuentoCupon:0, certificadoCodigo:null, certificadoMonto:null, certificadoSaldoRestante:null
  };

  const citaPrincipal = { ...base, nombre, telefono:tel, correo,
    precioTotal:precioMitad, precioFinal:precioMitad, comprobante:ref,
    abonoMonto:tieneAbono?montoAbono:0, abonoTipo:tieneAbono?tipoAbono:'',
    metodoPago:tieneAbono?pagoTipo:'', citaId:citaIdBase, empleadoId:empleadoSeleccionado,
    abonoPorConfirmar: tieneAbono };

  const citaSecundaria = { ...base, nombre:nombre2, telefono:tel2, correo:correo2,
    precioTotal:precioMitad, precioFinal:precioMitad,
    comprobante: tieneAbono ? ('Incluido en la reserva de ' + nombre) : 'Sin abono',
    abonoMonto:0, abonoTipo:'', metodoPago:'', citaId:citaIdBase+'-b', empleadoId:empleadoSeleccionado2,
    abonoPorConfirmar: tieneAbono };

  let citaDobleGuardada=null;
  try{ citaDobleGuardada = await Sheets.guardarCitaDoble(citaPrincipal, citaSecundaria); }
  catch(e){ console.error('Error guardando la cita doble:', e); errorAlGuardarCita(e, null); return; }
  try{ await Sheets.upsertClienteDesdeReserva(nombre, tel, correo); }catch(e){}
  try{ await Sheets.upsertClienteDesdeReserva(nombre2, tel2, correo2); }catch(e){}

  const horaDisplay = (()=>{const[h,m]=selTime.split(':');const hh=parseInt(h);return (hh>12?hh-12:hh)+':'+m+(hh>=12?' PM':' AM');})();
  Sheets.enviarCorreo('cita_confirmada', {correoCliente:correo, nombreCliente:nombre, servicio:curSvc.name+' (con '+nombre2+')', fecha:dayStr, hora:horaDisplay, ...datosSucursalCorreo()});
  Sheets.enviarCorreo('cita_confirmada', {correoCliente:correo2, nombreCliente:nombre2, servicio:curSvc.name+' (con '+nombre+')', fecha:dayStr, hora:horaDisplay, ...datosSucursalCorreo()});
  Sheets.enviarCorreo('cita_nueva', {nombreCliente:nombre+' y '+nombre2, telefonoCliente:tel+' / '+tel2, servicio:curSvc.name, fecha:dayStr, hora:horaDisplay, ...datosSucursalCorreo()});

  await new Promise(r=>setTimeout(r,900));

  const abonoLine = tieneAbono
    ? `<strong>Abono enviado (por validar):</strong> <span style="color:#4CAF50;font-weight:600;">$${montoAbono.toFixed(2)}</span><br><strong>Comprobante:</strong> ${ref}<br>`
    : '';
  document.getElementById('form-body').innerHTML=`
    <div class="success-wrap">
      <div class="s-icon"><i class="ti ti-check" aria-hidden="true"></i></div>
      <div class="s-title">${tieneAbono ? '¡Reserva recibida!' : '¡Cita doble reservada!'}</div>
      <div class="s-sub">${tieneAbono ? 'Su horario quedó apartado. Vamos a validar el abono y les llegará la confirmación a los 2 correos.' : 'Le mandamos la confirmación a los 2 correos.'}</div>
      <div class="s-detail">
        <strong>Servicio:</strong> ${curSvc.name}<br>
        <strong>Fecha:</strong> ${dayStr}<br>
        ${lineaSucursalResumen()}<strong>Hora:</strong> ${horaDisplay}<br>
        <strong>${nombre}</strong> y <strong>${nombre2}</strong>, cada quien con su profesional elegido<br>
        ${abonoLine}
        <strong>Total del combo:</strong> <span style="color:#D95F2B;font-weight:600;">$${precioTotal.toFixed(2)}</span><br>
      </div>
      <p style="font-size:11px;color:#aaa;margin-bottom:1rem;">Esta es una reserva conjunta: reprogramar o cancelar aplica a las 2 personas juntas.</p>
      <button class="btn-main" style="background:var(--gold-dark);color:var(--on-gold-dark,#fff);font-family:var(--font-heading);" onclick="closeOv('ov-form')">Listo</button>
    </div>`;

  // Ruleta: gira quien hizo la reserva (la persona principal)
  setTimeout(async () => {
    try {
      const check = await Sheets.verificarElegibilidadRuleta(tel);
      if (check && check.elegible) {
        closeOv('ov-form');
        abrirModalRuleta(tel, nombre, citaDobleGuardada && citaDobleGuardada.idPrincipal);
      }
    } catch (err) {
      console.error('Error verificando elegibilidad de ruleta:', err);
    }
  }, 1800);
}

// Si la cita no se guardó no se muestra éxito ni se mandan correos.
// err: el error de la base. ordenPagada: orderId de Yappy cuando el cliente YA pagó
// (no se le pide reintentar: se le da el número para que el negocio lo agende).
function errorAlGuardarCita(err, ordenPagada, mensajePropio){
  const ocupado = /HORARIO_OCUPADO/.test((err && (err.message || err.details)) || '');
  const btnC=document.getElementById('btnConfirmar');
  const b=window.ANNLY_BUSINESS||{};
  const wa=b.whatsapp?` por WhatsApp al <a href="https://wa.me/${b.whatsapp}" target="_blank" rel="noopener">${b.whatsapp}</a>`:'';
  let msg;
  if(mensajePropio){
    msg = mensajePropio;
  } else if(ordenPagada){
    msg = `Recibimos tu pago (orden <strong>${ordenPagada}</strong>), pero ${ocupado ? 'ese horario se acaba de ocupar' : 'no pudimos guardar tu cita'}. Escríbenos${wa} con ese número y te agendamos de inmediato.`;
  } else if(ocupado){
    msg = 'Alguien acaba de reservar ese horario. Elige otra hora, tus datos se mantienen.';
  } else {
    msg = 'No pudimos guardar tu cita. Revisa tu conexión e inténtalo de nuevo.';
  }
  if(btnC && !ordenPagada){
    btnC.disabled=false;
    btnC.textContent = ocupado ? 'Elegir otra hora' : 'Confirmar mi cita';
    if(ocupado){ btnC.onclick = () => { closeOv('ov-form'); openCal(); }; }
  }
  let el=document.getElementById('errorCita');
  if(!el){
    el=document.createElement('div');
    el.id='errorCita'; el.className='note-box-warn'; el.style.marginTop='.875rem';
    const ancla=btnC||document.getElementById('pagoWrap');
    if(ancla) ancla.insertAdjacentElement('beforebegin', el);
    else document.getElementById('form-body').appendChild(el);
  }
  el.innerHTML=`<i class="ti ti-alert-triangle" aria-hidden="true"></i><span>${msg}</span>`;
  el.scrollIntoView({behavior:'smooth',block:'center'});
}

// ===== Inscripción de clientes (plan Medium o Ultimate, si el negocio la activa) =====
window.AnnlyReady.then(() => Sheets.inscripcionClientesActiva()).then(activa => {
  const w = document.getElementById('club-link-wrap');
  if (activa && w) w.style.display = '';
}).catch(() => {});

function abrirModalInscripcion(){
  const nombreNegocio = (window.ANNLY_BUSINESS && window.ANNLY_BUSINESS.nombre) || 'este negocio';
  const meses = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  const esc = t => String(t).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  document.getElementById('inscripcion-body').innerHTML = `
    <p style="font-size:13.5px;line-height:1.55;margin:0 0 14px;color:var(--ink,#2c2c2a);">¿Te gustaría recibir <b>descuentos, regalos y promociones</b>? Déjanos tus datos y ${esc(nombreNegocio)} te tendrá en cuenta.</p>
    <div class="fg"><label class="flbl">Tu nombre</label><input class="fi" id="insc-nombre" maxlength="80" autocomplete="name"/></div>
    <div class="fg"><label class="flbl">Tu WhatsApp</label><input class="fi" id="insc-telefono" inputmode="tel" maxlength="20" autocomplete="tel" placeholder="6000-0000"/></div>
    <div class="fg"><label class="flbl">Tu correo (opcional)</label><input class="fi" id="insc-correo" type="email" maxlength="120" autocomplete="email" placeholder="tu@correo.com"/></div>
    <div class="fg"><label class="flbl">Tu cumpleaños (opcional, para sorprenderte)</label>
      <div style="display:flex;gap:8px;">
        <select class="fi" id="insc-dia" style="flex:1;"><option value="">Día</option>${Array.from({length:31},(_,i)=>`<option value="${i+1}">${i+1}</option>`).join('')}</select>
        <select class="fi" id="insc-mes" style="flex:2;"><option value="">Mes</option>${meses.map((m,i)=>`<option value="${i+1}">${m}</option>`).join('')}</select>
      </div></div>
    <input id="insc-web" tabindex="-1" autocomplete="off" style="position:absolute;left:-9999px;opacity:0;height:0;width:0;" aria-hidden="true"/>
    <label style="display:flex;gap:9px;align-items:flex-start;font-size:12px;line-height:1.5;margin:10px 0;cursor:pointer;">
      <input type="checkbox" id="insc-acepta" style="margin-top:3px;flex-shrink:0;"/>
      <span>Acepto que ${esc(nombreNegocio)} me contacte con promociones y beneficios. Puedo pedir que me quiten cuando quiera.</span>
    </label>
    <p id="insc-msg" style="font-size:11.5px;color:#c0392b;min-height:16px;margin:4px 0 8px;"></p>
    <button class="btn-main" id="btnInscripcion" onclick="enviarInscripcion()">Inscribirme</button>`;
  openOv('ov-inscripcion');
}

async function enviarInscripcion(){
  const msg = document.getElementById('insc-msg');
  const btn = document.getElementById('btnInscripcion');
  const v = id => (document.getElementById(id).value || '').trim();
  if (v('insc-web')) return; // trampa para programas automáticos
  const nombre = v('insc-nombre'), telefono = v('insc-telefono'), correo = v('insc-correo');
  const dia = parseInt(v('insc-dia'), 10) || null, mes = parseInt(v('insc-mes'), 10) || null;
  if (nombre.length < 2) { msg.textContent = 'Escribe tu nombre.'; return; }
  if (telefono.replace(/\D/g, '').length < 7) { msg.textContent = 'Escribe tu número de WhatsApp.'; return; }
  if (correo && !/^\S+@\S+\.\S+$/.test(correo)) { msg.textContent = 'Revisa tu correo.'; return; }
  if ((dia && !mes) || (!dia && mes)) { msg.textContent = 'Elige el día y el mes de tu cumpleaños, o deja los dos vacíos.'; return; }
  if (!document.getElementById('insc-acepta').checked) { msg.textContent = 'Marca la casilla para poder inscribirte.'; return; }
  msg.textContent = '';
  btn.disabled = true; btn.textContent = 'Enviando...';
  try {
    const r = await Sheets.inscribirCliente({ nombre, telefono, correo, cumpleDia: dia, cumpleMes: mes, acepta: true });
    if (!r || !r.ok) {
      const errores = { cumple: 'Revisa la fecha de tu cumpleaños.', correo: 'Revisa tu correo.', telefono: 'Revisa tu número de WhatsApp.', nombre: 'Escribe tu nombre.', no_disponible: 'Por ahora no está disponible la inscripción.' };
      msg.textContent = errores[r && r.error] || 'No se pudo completar la inscripción. Intenta de nuevo.';
      btn.disabled = false; btn.textContent = 'Inscribirme';
      return;
    }
    document.getElementById('inscripcion-body').innerHTML = `
      <div style="text-align:center;padding:1.2rem .5rem 1rem;">
        <div style="width:54px;height:54px;border-radius:50%;background:rgba(var(--gold-dark-rgb),.12);color:var(--gold-dark);display:flex;align-items:center;justify-content:center;font-size:26px;margin:0 auto 14px;"><i class="ti ti-check" aria-hidden="true"></i></div>
        <div style="font-size:17px;font-weight:700;margin-bottom:6px;">¡Listo, ya estás inscrito(a)!</div>
        <p style="font-size:13px;color:var(--ink-soft,#6b6b66);line-height:1.5;margin:0 0 16px;">Gracias por unirte. Pronto sabrás de nuestras promociones y sorpresas.</p>
        <button class="btn-main" onclick="closeOv('ov-inscripcion')">Cerrar</button>
      </div>`;
  } catch(e) {
    console.error(e);
    msg.textContent = 'No se pudo completar la inscripción. Intenta de nuevo.';
    btn.disabled = false; btn.textContent = 'Inscribirme';
  }
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
