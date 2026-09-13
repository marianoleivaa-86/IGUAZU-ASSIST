const CACHE_NAME = "iguazu-assist-v25";
const APP_SHELL = [
  "./",
  "./index.html",
  "./style.css",
  "./data.js",
  "./app.js",
  "./planificador-inteligente.js",
  "./tuki-asistente.js",
  "./manifest.json",
  "./icon.svg",
  "./icon-180.png",
  "./icon-192.png",
  "./icon-512.png",
  "./icon-512-maskable.png",
  "./tuki.svg",
  "./hero-art.svg",
  "./circuitos-estado.json",
  "./audio/iguazu-ambiente.mp3",
  "./hero-bg.webp",
  "./tuki-avatar.webp",
  "./tuki-branch.webp",
  "./tuki-branch-transparent.webp",
  "./img_aqva.webp",
  "./img_casanova.webp",
  "./img_cataratas.webp",
  "./img_hito.webp",
  "./img_mirador.webp",
  "./img_saintgeorge.webp"
];
const NETWORK_FIRST_DATA = new Set(["/circuitos-estado.json"]);
const NETWORK_FIRST_EXTERNAL = "https://api.open-meteo.com/";

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(key => key.startsWith("iguazu-assist-") && key !== CACHE_NAME)
          .map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request);
    if (response && (response.ok || response.type === "opaque")) {
      await cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    const cached = await cache.match(request);
    if (cached) return cached;
    if (request.mode === "navigate") {
      return cache.match("./index.html");
    }
    throw error;
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response && (response.ok || response.type === "opaque")) {
      await cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    if (request.mode === "navigate") return cache.match("./index.html");
    throw error;
  }
}

self.addEventListener("fetch", event => {
  const request = event.request;
  const url = new URL(request.url);
  const sameOrigin = url.origin === self.location.origin;
  const isData = sameOrigin && NETWORK_FIRST_DATA.has(url.pathname);
  const isWeather = request.url.startsWith(NETWORK_FIRST_EXTERNAL);

  // External weather data is allowed by CORS and gets a cached fallback.
  if (isWeather || isData) {
    event.respondWith(networkFirst(request));
    return;
  }

  if (sameOrigin) {
    event.respondWith(cacheFirst(request));
  }
});
