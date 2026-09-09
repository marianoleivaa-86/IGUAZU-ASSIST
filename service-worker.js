const CACHE_NAME = "iguazu-assist-v21"

const ARCHIVOS_CACHE = [
  "./",
  "./index.html",
  "./style.css",
  "./data.js",
  "./app.js",
  "./planificador-inteligente.js",
  "./manifest.json",
  "./circuitos-estado.json",
  "./icon.svg",
  "./icon.jpg",
  "./tuki-branch.jpg",
  "./tuki-branch-transparent.png",
  "./tuki-avatar.jpg",
  "./hero-bg.jpg",
  "./img_aqva.jpg",
  "./img_casanova.jpg",
  "./img_cataratas.jpg",
  "./img_hito.jpg",
  "./img_mirador.jpg",
  "./img_saintgeorge.jpg"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(ARCHIVOS_CACHE))
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
    )
  );
});

self.addEventListener("fetch", event => {
  // Solo cachear peticiones locales de la app
  if (!event.request.url.startsWith(self.location.origin)) {
    return;
  }

  // Todas las respuestas locales salen del mismo cache versionado. La red
  // sólo completa recursos no incluidos en el precache y nunca reemplaza
  // silenciosamente una versión ya instalada del conjunto crítico.
  event.respondWith(
    caches.open(CACHE_NAME).then(cache =>
      cache.match(event.request).then(cachedResponse => {
        if (cachedResponse) return cachedResponse;

        return fetch(event.request).then(networkResponse => {
          if (networkResponse && networkResponse.status === 200 && networkResponse.type === "basic") {
            cache.put(event.request, networkResponse.clone());
          }
          return networkResponse;
        }).catch(() => {
          if (event.request.mode === "navigate") return cache.match("./index.html");
          return undefined;
        });
      })
    )
  );
});
