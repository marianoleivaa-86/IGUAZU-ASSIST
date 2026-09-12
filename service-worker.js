const CACHE_NAME = "iguazu-assist-v23";

const ARCHIVOS_CACHE = [
  "./",
  "./index.html",
  "./style.css",
  "./data.js",
  "./app.js",
  "./planificador-inteligente.js",
  "./tuki-asistente.js",
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

self.addEventListener("fetch", event => {
  // Solo manejar peticiones locales de la app
  if (!event.request.url.startsWith(self.location.origin)) {
    return;
  }

  const url = new URL(event.request.url);

  const ARCHIVOS_CRITICOS = [
    "./",
    "./index.html",
    "./style.css",
    "./data.js",
    "./app.js",
    "./planificador-inteligente.js",
    "./tuki-asistente.js"
  ];

  const esCritico = ARCHIVOS_CRITICOS.some(archivo => {
    return url.pathname.endsWith(archivo.replace("./", ""));
  });

  // ========================================================
  // ARCHIVOS CRÍTICOS: NETWORK FIRST
  // ========================================================
  if (esCritico) {
    event.respondWith(
      fetch(event.request)
        .then(networkResponse => {
          if (
            networkResponse &&
            networkResponse.status === 200 &&
            networkResponse.type === "basic"
          ) {
            caches.open(CACHE_NAME).then(cache => {
              cache.put(event.request, networkResponse.clone());
            });
          }

          return networkResponse;
        })
        .catch(() =>
          caches.match(event.request).then(cachedResponse => {
            if (cachedResponse) return cachedResponse;

            if (event.request.mode === "navigate") {
              return caches.match("./index.html");
            }

            return undefined;
          })
        )
    );

    return;
  }

  // ========================================================
  // RESTO DE RECURSOS: CACHE FIRST
  // ========================================================
  event.respondWith(
    caches.open(CACHE_NAME).then(cache =>
      cache.match(event.request).then(cachedResponse => {
        if (cachedResponse) {
          return cachedResponse;
        }

        return fetch(event.request).then(networkResponse => {
          if (
            networkResponse &&
            networkResponse.status === 200 &&
            networkResponse.type === "basic"
          ) {
            cache.put(event.request, networkResponse.clone());
          }

          return networkResponse;
        }).catch(() => {
          if (event.request.mode === "navigate") {
            return cache.match("./index.html");
          }

          return undefined;
        });
      })
    )
  );
});
  