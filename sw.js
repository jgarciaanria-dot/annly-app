// Service worker mínimo: hace que Mis citas / Mi agenda se puedan instalar como app.
// No guarda nada en caché (siempre usa la red), así que nunca muestra datos ni código viejos.
self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (e) { e.waitUntil(self.clients.claim()); });
self.addEventListener('fetch', function () { /* sin caché: el navegador resuelve la petición normalmente */ });
