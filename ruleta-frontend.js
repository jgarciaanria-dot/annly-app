/* ============================================================
   RULETA - FRONTEND
   Usa CONFIG.sheets.scriptUrl (definido en config.js) —
   mismo deployment que usan guardarCita, getServicios, etc.
   ============================================================ */

async function intentarMostrarRuleta(identificador, nombre, citaId) {
  try {
    const check = await Sheets.verificarElegibilidadRuleta(identificador);
    if (!check.elegible) {
      console.log('Ruleta no disponible:', check.motivo);
      return;
    }
    abrirModalRuleta(identificador, nombre, citaId);
  } catch (err) {
    console.error('Error verificando elegibilidad de ruleta:', err);
  }
}

function abrirModalRuleta(identificador, nombre, citaId) {
  const modal = document.getElementById('ruletaModal');
  const wheel = document.getElementById('wheelSvg');
  const btnGirar = document.getElementById('ruletaSpinBtn');
  const subtitle = document.getElementById('ruletaSubtitle');
  const resultCard = document.getElementById('ruletaResultCard');

  if (!wheel) {
    console.error('La rueda no se generó (sin premios activos o falló la carga de RuletaConfig).');
    return;
  }

  // Reinicia el estado por si el modal ya se usó antes en esta misma sesión
  wheel.classList.remove('spinning-fast');
  wheel.style.transition = 'none';
  wheel.style.transform = 'rotate(0deg)';
  void wheel.offsetWidth; // fuerza reflow para que la próxima transición sí anime

  btnGirar.style.pointerEvents = 'auto';
  subtitle.textContent = 'Una sola oportunidad por cliente';
  resultCard.style.opacity = '0';
  resultCard.style.transform = 'scale(.9)';

  modal.classList.add('activo');
  btnGirar.onclick = () => girarRuletaUI(identificador, nombre, citaId);
}

// Los segmentos ahora se generan dinámicamente desde RuletaConfig
// (ver RULETA_SEGMENTOS_ACTIVOS y construirRuedaDinamica() en index.html)

async function girarRuletaUI(identificador, nombre, citaId) {
  const btnGirar = document.getElementById('ruletaSpinBtn');
  const subtitle = document.getElementById('ruletaSubtitle');
  const wheel = document.getElementById('wheelSvg');

  if (!wheel || !RULETA_SEGMENTOS_ACTIVOS || RULETA_SEGMENTOS_ACTIVOS.length === 0) {
    subtitle.textContent = 'La ruleta no está disponible en este momento.';
    return;
  }

  btnGirar.style.pointerEvents = 'none';
  subtitle.textContent = 'Girando...';
  wheel.style.transition = 'none';

  // Fase 1: gira a velocidad constante mientras esperamos al servidor.
  // Llevamos la cuenta del ángulo nosotros mismos (no le preguntamos al
  // navegador "dónde vas" — esa lectura puede fallar en algunos navegadores
  // justo al interrumpir una animación en curso, causando saltos).
  let anguloActual = 0;
  let fase1Activa = true;
  const velocidadGrados = 480; // grados por segundo
  let ultimoTs = performance.now();

  function loopFase1(ts){
    if (!fase1Activa) return;
    const dt = (ts - ultimoTs) / 1000;
    ultimoTs = ts;
    anguloActual += velocidadGrados * dt;
    wheel.style.transform = 'rotate(' + anguloActual + 'deg)';
    requestAnimationFrame(loopFase1);
  }
  requestAnimationFrame(loopFase1);

  const resultado = await Sheets.girarRuleta(identificador, nombre, citaId);
  fase1Activa = false;

  if (!resultado.ok) {
    wheel.style.transform = 'rotate(0deg)';
    subtitle.textContent = 'No se pudo completar el giro. Intenta más tarde.';
    btnGirar.style.pointerEvents = 'auto';
    return;
  }

  const seg = RULETA_SEGMENTOS_ACTIVOS.find(s => s.premio === resultado.premio);
  if (!seg) {
    console.error('Premio devuelto por el backend no coincide con ningún segmento activo:', resultado.premio, '— revisa que esté marcado como activo en RuletaConfig');
  }
  const segFinal = seg || RULETA_SEGMENTOS_ACTIVOS[0];

  const desiredMod = ((90 - segFinal.angle - 8) % 360 + 360) % 360;
  const currentMod = ((anguloActual % 360) + 360) % 360;
  const adjustment = ((desiredMod - currentMod) % 360 + 360) % 360;
  const finalAngle = anguloActual + 2520 + adjustment; // 7 vueltas + ajuste

  // Fase 2: frenado controlado cuadro por cuadro, arrancando exactamente
  // desde el ángulo que nosotros mismos veníamos calculando — sin salto.
  animarFrenadoRuleta(wheel, anguloActual, finalAngle, 6000, () => {
    subtitle.textContent = '¡Felicidades!';
    resaltarSegmentoGanador(segFinal.id);
    lanzarConfetti();
    mostrarResultadoRuleta(resultado);
  });
}

function easeOutQuintJS(t){
  return 1 - Math.pow(1 - t, 5);
}

function animarFrenadoRuleta(wheel, desde, hasta, duracionMs, alTerminar){
  const inicio = performance.now();
  function cuadro(ahora){
    const transcurrido = ahora - inicio;
    const t = Math.min(transcurrido / duracionMs, 1);
    const suavizado = easeOutQuintJS(t);
    const angulo = desde + (hasta - desde) * suavizado;
    wheel.style.transform = 'rotate(' + angulo + 'deg)';
    if (t < 1) {
      requestAnimationFrame(cuadro);
    } else {
      alTerminar();
    }
  }
  requestAnimationFrame(cuadro);
}

function getCurrentRotationDeg(el) {
  const transform = getComputedStyle(el).transform;
  if (!transform || transform === 'none') return 0;
  try {
    const m = new DOMMatrixReadOnly(transform);
    let angle = Math.atan2(m.b, m.a) * (180 / Math.PI);
    if (angle < 0) angle += 360;
    return angle;
  } catch (e) {
    return 0;
  }
}

function resaltarSegmentoGanador(segId) {
  const el = document.getElementById(segId);
  if (!el) return;
  el.style.transition = 'filter 0.4s ease';
  el.style.filter = 'drop-shadow(0 0 10px #F0DDAE) brightness(1.4)';
  setTimeout(() => { el.style.filter = 'none'; }, 1600);
}

function lanzarConfetti() {
  const layer = document.getElementById('confettiLayer');
  if (!layer) return;
  const colors = ['#FFD700', '#FFC933', '#FFE9A8', '#F5B942'];
  for (let i = 0; i < 40; i++) {
    const p = document.createElement('div');
    const size = 6 + Math.random() * 6;
    const color = colors[Math.floor(Math.random() * colors.length)];
    p.style.position = 'absolute';
    p.style.width = size + 'px';
    p.style.height = size + 'px';
    p.style.background = color;
    p.style.left = (5 + Math.random() * 90) + '%';
    p.style.top = '-14px';
    p.style.borderRadius = Math.random() > 0.5 ? '50%' : '2px';
    p.style.opacity = '1';
    p.style.boxShadow = '0 0 6px ' + color + ', 0 0 12px rgba(255,215,0,0.6)';
    p.style.transition = 'transform 2.4s cubic-bezier(0.25,0.46,0.45,0.94), opacity 2.4s ease';
    layer.appendChild(p);
    requestAnimationFrame(() => {
      const fall = 420 + Math.random() * 160;
      const drift = (Math.random() - 0.5) * 110;
      const rot = Math.random() * 640;
      p.style.transform = 'translate(' + drift + 'px,' + fall + 'px) rotate(' + rot + 'deg)';
      p.style.opacity = '0';
    });
    setTimeout(() => p.remove(), 2600);
  }
}

function mostrarResultadoRuleta(resultado) {
  const resultCard = document.getElementById('ruletaResultCard');
  const resultText = document.getElementById('ruletaResultText');

  resultText.textContent = resultado.esPremioReal
    ? 'Ganaste: ' + resultado.premio + (resultado.codigoCanje ? ' — Código: ' + resultado.codigoCanje : '')
    : resultado.premio;

  resultCard.style.opacity = '1';
  resultCard.style.transform = 'scale(1)';
}
