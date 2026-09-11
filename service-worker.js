const CACHE_NAME = "iguazu-assist-v7";

const ARCHIVOS_CACHE = [
  "./",
  "./index.html",
  "./style.css",
  "./data.js",
  "./app.js",
  "./planificador-inteligente.js",
  "./tuki-asistente.js",
  "./manifest.json",
  "./icon.svg"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(ARCHIVOS_CACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(llaves =>
      Promise.all(
        llaves
          .filter(llave => llave !== CACHE_NAME)
          .map(llave => caches.delete(llave))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  // Solo cachear peticiones locales de la app
  if (!event.request.url.startsWith(self.location.origin)) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then(cachedResponse => {
      const fetchPromise = fetch(event.request)
        .then(networkResponse => {
          if (networkResponse && networkResponse.status === 200 && networkResponse.type === "basic") {
            const copia = networkResponse.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, copia));
          }
          return networkResponse;
        })
        .catch(() => {
          if (event.request.mode === "navigate") {
            return caches.match("./index.html");
          }
        });

      return cachedResponse || fetchPromise;
    })
  );
});
