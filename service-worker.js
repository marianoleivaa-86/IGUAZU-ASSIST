const CACHE_NAME = "iguazu-assist-v37";
const APP_SHELL = [
  "./",
  "./index.html",
  "./place-translations.js",
  "./style.css",
  "./i18n.js",
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
  "./hero-bg-640.webp",
  "./tuki-avatar-160.webp",
  "./tuki-branch-160.webp",
  "./tuki-branch-640.webp",
  "./tuki-branch-transparent-160.webp",
  "./tuki-branch-transparent-640.webp",
  "./img_aqva-160.webp",
  "./img_aqva-640.webp",
  "./img_aqva.webp",
  "./img_casanova-160.webp",
  "./img_casanova-640.webp",
  "./img_casanova.webp",
  "./img_cataratas-160.webp",
  "./img_cataratas-640.webp",
  "./img_cataratas.webp",
  "./img_hito-160.webp",
  "./img_hito-640.webp",
  "./img_hito.webp",
  "./img_mirador-160.webp",
  "./img_mirador-640.webp",
  "./img_mirador.webp",
  "./img_saintgeorge-160.webp",
  "./img_saintgeorge-640.webp",
  "./img_saintgeorge.webp",
  "./tuki-avatar.webp",
  "./tuki-branch-transparent.webp",
  "./tuki-branch.webp"
];

const NETWORK_FIRST_DATA = new Set(["./data.js", "/circuitos-estado.json"]);
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

async function audioWithOfflineFallback(request) {
  try {
    const response = await fetch(request);
    if (!response.ok) throw new Error(`Audio request failed with HTTP ${response.status}`);
    return response;
  } catch (error) {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match("./audio/iguazu-ambiente.mp3");
    if (!cached) throw error;

    const buffer = await cached.arrayBuffer();
    const total = buffer.byteLength;
    const rangeHeader = request.headers.get("Range");
    const baseHeaders = {
      "Accept-Ranges": "bytes",
      "Content-Type": "audio/mpeg"
    };

    if (!rangeHeader) {
      return new Response(buffer, {
        status: 200,
        headers: {
          ...baseHeaders,
          "Content-Length": String(total)
        }
      });
    }

    const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim());
    if (!match || (!match[1] && !match[2])) {
      return new Response(null, {
        status: 416,
        headers: {
          ...baseHeaders,
          "Content-Range": `bytes */${total}`
        }
      });
    }

    let start;
    let end;
    if (!match[1]) {
      const suffixLength = Math.min(Number(match[2]), total);
      start = total - suffixLength;
      end = total - 1;
    } else {
      start = Number(match[1]);
      end = match[2] ? Math.min(Number(match[2]), total - 1) : total - 1;
    }

    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start >= total || start > end) {
      return new Response(null, {
        status: 416,
        headers: {
          ...baseHeaders,
          "Content-Range": `bytes */${total}`
        }
      });
    }

    const body = buffer.slice(start, end + 1);
    return new Response(body, {
      status: 206,
      headers: {
        ...baseHeaders,
        "Content-Range": `bytes ${start}-${end}/${total}`,
        "Content-Length": String(body.byteLength)
      }
    });
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

  if (request.method === "GET" && sameOrigin && url.pathname === "/audio/iguazu-ambiente.mp3") {
    event.respondWith(audioWithOfflineFallback(request));
    return;
  }

  if (sameOrigin) {
    event.respondWith(cacheFirst(request));
  }
});
