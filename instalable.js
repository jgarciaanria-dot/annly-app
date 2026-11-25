// Hace que la página se pueda instalar en el celular como app propia del negocio (nombre, colores e ícono con su logo).
// Uso: annlyInstalable({ nombre, corto, startUrl, scope, logo })  — los colores salen de la marca ya aplicada (--purple, --bg).
(function () {
  var evento = null;
  // El manifiesto se lleva mejor con colores en hex: convierte rgb(r,g,b) si hace falta
  function hex(c) { var m = /^rgba?\((\d+)\s*,\s*(\d+)\s*,\s*(\d+)/.exec(c || ''); return m ? '#' + [m[1], m[2], m[3]].map(function (v) { return ('0' + (+v).toString(16)).slice(-2); }).join('') : c; }
  function css(v) { try { return hex(getComputedStyle(document.documentElement).getPropertyValue(v).trim()); } catch (e) { return ''; } }
  function ya() { return (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true; }
  function ui() { return { box: document.getElementById('instalar'), btn: document.getElementById('instalarBtn'), ios: document.getElementById('instalarIos') }; }

  // Ícono cuadrado: el logo centrado (con margen de seguridad) sobre el color de fondo del negocio.
  function pintarIcono(img, lado, fondo) {
    var c = document.createElement('canvas'); c.width = c.height = lado; var g = c.getContext('2d');
    g.fillStyle = fondo; g.fillRect(0, 0, lado, lado);
    if (img) {
      var caja = lado * 0.68, k = Math.min(caja / img.naturalWidth, caja / img.naturalHeight), w = img.naturalWidth * k, h = img.naturalHeight * k;
      g.drawImage(img, (lado - w) / 2, (lado - h) / 2, w, h);
    }
    return c.toDataURL('image/png');
  }
  function iconos(logo, fondo) {
    return new Promise(function (ok) {
      function listo(img) {
        try {
          ok([{ src: pintarIcono(img, 192, fondo), sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
              { src: pintarIcono(img, 512, fondo), sizes: '512x512', type: 'image/png', purpose: 'any maskable' }]);
        } catch (e) { ok(null); }   // el logo no dejó dibujarlo (permisos de imagen): se usa el de Annly
      }
      if (!/^https:\/\//i.test(logo || '')) return listo(null);
      var im = new Image(); im.crossOrigin = 'anonymous';
      im.onload = function () { listo(im); }; im.onerror = function () { ok(null); };
      im.src = logo;
    });
  }

  window.annlyInstalable = function (o) {
    if (ya()) return;
    var fondo = css('--bg') || '#faf7fc', acento = css('--purple') || '#7c3aed';
    iconos(o.logo, fondo).then(function (ic) {
      var lista = ic || [{ src: location.origin + '/logo-annly-v2.png', sizes: '320x320', type: 'image/png', purpose: 'any' }];
      var m = { id: o.startUrl, name: o.nombre, short_name: (o.corto || o.nombre).slice(0, 12), start_url: o.startUrl, scope: o.scope, display: 'standalone',
                background_color: fondo, theme_color: acento, lang: 'es', icons: lista };
      var url = URL.createObjectURL(new Blob([JSON.stringify(m)], { type: 'application/manifest+json' }));
      var viejo = document.querySelector('link[rel=manifest]'); if (viejo) viejo.remove();
      var l = document.createElement('link'); l.rel = 'manifest'; l.href = url; document.head.appendChild(l);
      var ap = document.querySelector('link[rel=apple-touch-icon]'); if (!ap) { ap = document.createElement('link'); ap.rel = 'apple-touch-icon'; document.head.appendChild(ap); }
      ap.href = lista[lista.length - 1].src;
      var t = document.querySelector('meta[name=apple-mobile-web-app-title]'); if (!t) { t = document.createElement('meta'); t.name = 'apple-mobile-web-app-title'; document.head.appendChild(t); }
      t.content = m.short_name;
    });
    try { if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(function () {}); } catch (e) {}
    // iPhone no tiene botón de instalar: se le explica el camino
    var u = ui();
    if (u.ios && /iphone|ipad|ipod/i.test(navigator.userAgent) && !/crios|fxios/i.test(navigator.userAgent)) { u.box && (u.box.hidden = false); u.ios.hidden = false; }
  };

  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault(); evento = e; var u = ui(); if (u.box && u.btn && !ya()) { u.box.hidden = false; u.btn.hidden = false; }
  });
  window.addEventListener('appinstalled', function () { var u = ui(); if (u.box) u.box.hidden = true; evento = null; });
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('#instalarBtn'); if (!b || !evento) return;
    evento.prompt(); evento.userChoice && evento.userChoice.then(function () { evento = null; var u = ui(); if (u.box) u.box.hidden = true; });
  });
})();
