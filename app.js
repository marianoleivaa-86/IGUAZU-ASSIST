/**
 * IGUAZÚ ASSIST — Controlador Principal de Interfaz, Navegación, Geolocalización y Efectos de Sonido
 */

// ========================================================
// ESTADO GLOBAL DE LA APLICACIÓN
// ========================================================
function uiText(key, fallback) {
    return window.I18n?.t(key, fallback) || fallback;
}

function placeText(lugar, campo, fallback = "") {
    return window.I18n?.placeText(lugar, campo) || lugar?.[campo] || fallback;
}

const AppState = {
    interes: "naturaleza",
    tiempo: "medio día",
    compania: "solo",
    presupuesto: "medio",
    lastView: "home", // Vista de origen del detalle.
    currentView: "home",
    detailPlace: null,
    userCoords: null,
    gpsActive: false,
    audioActivo: true, // Activo por defecto; el navegador puede esperar la primera interacción.
    volumenAmbiente: 58,
    filtroCercaMio: "todos",
    searchTerm: "",
    favoriteIds: new Set(),
    currentPlanId: null,
    savedPlans: null,
    nearbyItems: [],
    nearbyVisibleCount: 12
};

const APP_CONSTANTS = Object.freeze({
    FALLBACK_IMAGE: "hero-bg.webp",
    NEARBY_LIMIT_KM: 25,
    WALKING_LIMIT_KM: 1.5,
    GPS_STORAGE_KEY: "iguazu-assist-last-coords",
    OFFLINE_READY_NOTICE_KEY: "iguazu-assist-offline-ready-notice",
    DEFAULT_CENTER: Object.freeze({ lat: -25.5979, lng: -54.5742 }),
    SECTION_IDS: Object.freeze([
        "hero-section",
        "categories-section",
        "planner",
        "surprise",
        "profile",
        "results",
        "detail"
    ]),
    SECTION_ALIASES: Object.freeze({
        home: "hero-section",
        nearby: "hero-section",
        categories: "categories-section"
    }),
        NAV_BY_SECTION: Object.freeze({
        "hero-section": "bnav-home",
        "categories-section": "bnav-explore",
        planner: "bnav-plans",
        profile: "bnav-profile"
    }),
    FAVORITES_STORAGE_KEY: "iguazu-assist-favorites",
    AUDIO_ENABLED_STORAGE_KEY: "iguazu-assist-audio-enabled",
    AUDIO_VOLUME_STORAGE_KEY: "iguazu-assist-audio-volume",
    CATEGORY_IMAGES: Object.freeze({
        naturaleza: "img_cataratas.webp",
        comida: "img_aqva.webp",
        noche: "img_casanova.webp",
        actividades: "img_hito.webp",
        alojamiento: "img_saintgeorge.webp",
        movilidad: "img_mirador.webp"
    })
});

const PERSISTENCE_DB_NAME = "iguazu-assist-db";
const PERSISTENCE_DB_VERSION = 1;
const PERSISTENCE_STORE = "kv";
let persistenceDbPromise = null;
let persistenceIndexedDBActive = false;

function abrirPersistenciaIndexedDB() {
    if (persistenceDbPromise) return persistenceDbPromise;
    if (!window.indexedDB) return Promise.reject(new Error("IndexedDB no disponible"));
    persistenceDbPromise = new Promise((resolve, reject) => {
        const request = indexedDB.open(PERSISTENCE_DB_NAME, PERSISTENCE_DB_VERSION);
        request.onupgradeneeded = () => {
            if (!request.result.objectStoreNames.contains(PERSISTENCE_STORE)) {
                request.result.createObjectStore(PERSISTENCE_STORE);
            }
        };
        request.onsuccess = () => {
            persistenceIndexedDBActive = true;
            resolve(request.result);
        };
        request.onerror = () => reject(request.error || new Error("No se pudo abrir IndexedDB"));
    });
    return persistenceDbPromise;
}

function leerPersistenciaIndexedDB(clave) {
    return abrirPersistenciaIndexedDB().then(db => new Promise((resolve, reject) => {
        const request = db.transaction(PERSISTENCE_STORE, "readonly").objectStore(PERSISTENCE_STORE).get(clave);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    }));
}

function guardarPersistenciaIndexedDB(clave, valor) {
    return abrirPersistenciaIndexedDB().then(db => new Promise((resolve, reject) => {
        const transaction = db.transaction(PERSISTENCE_STORE, "readwrite");
        transaction.objectStore(PERSISTENCE_STORE).put(valor, clave);
        transaction.oncomplete = () => resolve(true);
        transaction.onerror = () => reject(transaction.error);
    }));
}

async function inicializarPersistenciaIndexedDB() {
    try {
        await abrirPersistenciaIndexedDB();
        const favoritosIDB = await leerPersistenciaIndexedDB("favorites");
        let favoritosLegacy = [];
        try {
            const rawFavoritos = localStorage.getItem(APP_CONSTANTS.FAVORITES_STORAGE_KEY);
            const parsedFavoritos = rawFavoritos ? JSON.parse(rawFavoritos) : [];
            if (Array.isArray(parsedFavoritos)) favoritosLegacy = parsedFavoritos.map(String);
        } catch (error) {
            console.info("No se pudieron leer los favoritos legacy.", error);
        }
        if (Array.isArray(favoritosIDB) && (favoritosIDB.length || !favoritosLegacy.length)) {
            AppState.favoriteIds = new Set(favoritosIDB.map(String));
        } else {
            AppState.favoriteIds = new Set(favoritosLegacy.length ? favoritosLegacy : [...AppState.favoriteIds]);
            await guardarPersistenciaIndexedDB("favorites", [...AppState.favoriteIds]);
        }
        const planesIDB = await leerPersistenciaIndexedDB("plans");
        let planesLegacy = [];
        try {
            const rawPlanes = localStorage.getItem(SAVED_PLANS_STORAGE_KEY);
            const parsedPlanes = rawPlanes ? JSON.parse(rawPlanes) : [];
            if (Array.isArray(parsedPlanes)) planesLegacy = parsedPlanes.filter(plan => plan && plan.id);
        } catch (error) {
            console.info("No se pudieron leer los planes legacy.", error);
        }
        if (Array.isArray(planesIDB) && (planesIDB.length || !planesLegacy.length)) {
            AppState.savedPlans = planesIDB;
        } else {
            AppState.savedPlans = planesLegacy.length ? planesLegacy : (Array.isArray(AppState.savedPlans) ? AppState.savedPlans : []);
            await guardarPersistenciaIndexedDB("plans", AppState.savedPlans);
        }
        localStorage.removeItem(APP_CONSTANTS.FAVORITES_STORAGE_KEY);
        localStorage.removeItem(SAVED_PLANS_STORAGE_KEY);
        actualizarContadorFavoritos();
        renderizarCercaMio(AppState.filtroCercaMio || "todos");
        if (typeof renderizarPlanesGuardados === "function") renderizarPlanesGuardados();
    } catch (error) {
        persistenceIndexedDBActive = false;
        console.info("Se mantiene la persistencia local de respaldo.", error);
    }
}

let appInitialized = false;
let gpsRequestId = 0;
let gpsWatchId = null;
let lastGpsWatchUpdate = 0;
let deferredInstallPrompt = null;
let planificadorLoadPromise = null;
let _activarAudioConInteraccion = null; // Referencia al listener de interacción de audio para evitar duplicados.

function cargarPlanificador() {
    if (planificadorLoadPromise) return planificadorLoadPromise;
    planificadorLoadPromise = import("./planificador-inteligente.js").catch(error => {
        planificadorLoadPromise = null;
        console.error("No se pudo cargar el planificador.", error);
        mostrarToast(uiText("tukiError", "No se pudo cargar el planificador. Revisá tu conexión e intentá de nuevo."));
        throw error;
    });
    return planificadorLoadPromise;
}
window.cargarPlanificador = cargarPlanificador;

window.generarPlan = () => cargarPlanificador().then(() => window.generarPlanReal?.());
window.generarSorpresa = () => cargarPlanificador().then(() => window.generarSorpresa?.());
window.abrirQueHagoAhora = () => cargarPlanificador().then(() => window.abrirQueHagoAhora?.());

// ========================================================
// SISTEMA DE EFECTOS DE SONIDO CORTOS (WEB AUDIO API)
// ========================================================
const SoundFX = {
    audioCtx: null,
    ambientAudio: null,
    resumePromise: null,
    suspendPromise: null,
    activeOscillators: [],
    ambientNodes: [],
    ambientGain: null,
    ambientBirdTimer: null,
    ambientBirdPlaying: false,
    ambientStartPending: false,
    ambientActive: false,

    init() {
        try {
            if (!this.audioCtx && (window.AudioContext || window.webkitAudioContext)) {
                const AudioContext = window.AudioContext || window.webkitAudioContext;
                this.audioCtx = new AudioContext();
            }
            if (this.audioCtx?.state === "suspended" && !this.resumePromise) {
                this.resumePromise = this.audioCtx.resume()
                    .catch(() => false)
                    .finally(() => { this.resumePromise = null; });
            }
        } catch (error) {
            console.info("Audio ambiental temporalmente bloqueado por el navegador.");
        }
        return this.audioCtx;
    },

    getAmbientGainValue() {
        return (AppState.volumenAmbiente / 100) * 0.16;
    },

    setAmbientVolume(valor) {
        AppState.volumenAmbiente = Math.min(100, Math.max(0, Number(valor) || 0));
        if (this.ambientAudio) this.ambientAudio.volume = this.getAmbientGainValue();
        if (this.ambientGain && this.audioCtx) {
            this.ambientGain.gain.setTargetAtTime(this.getAmbientGainValue(), this.audioCtx.currentTime, 0.08);
        }
        guardarPreferenciasAudio();
    },
    startAmbient({ userGesture = false } = {}) {
    if ((this.ambientActive && this.ambientAudio && !this.ambientAudio.paused) || !AppState.audioActivo || document.hidden) return;
    if (this.ambientAudio?.paused) this.ambientActive = false;

    try {
        if (!this.ambientAudio) {
            this.ambientAudio = new Audio("audio/iguazu-ambiente.mp3");
            this.ambientAudio.loop = false;
            this.ambientAudio.preload = "auto";
            this.ambientAudio.setAttribute("aria-hidden", "true");
        }

        this.ambientAudio.volume = this.getAmbientGainValue();

        const reproduccion = this.ambientAudio.play();

        Promise.resolve(reproduccion).then(() => {
            this.ambientActive = true;
            actualizarControlesAudio();
        }).catch(error => {
            this.ambientActive = false;
            const mediaError = this.ambientAudio?.error;

            console.warn("No se pudo reproducir el ambiente selvático.", {
                name: error?.name || "PlayPromiseRejected",
                code: mediaError?.code ?? null,
                message: error?.message || mediaError?.message || "El navegador rechazó audio.play()."
            });

            actualizarControlesAudio();
        });

    } catch (error) {
        this.ambientActive = false;
        console.warn("No se pudo iniciar el ambiente selvático.", error);
    }
},

    stopAmbient() {
        if (this.ambientBirdTimer) clearTimeout(this.ambientBirdTimer);
        this.ambientBirdTimer = null;
        if (this.ambientAudio) this.ambientAudio.pause();
        this.ambientNodes = []; this.ambientGain = null; this.ambientActive = false; this.ambientBirdPlaying = false;
        actualizarControlesAudio();
    },

    stopAll() {
        // Mantener una única ruta segura para detener cualquier audio de la app.
        // El ambiente real se controla desde stopAmbient; no se generan efectos sintéticos.
        this.stopAmbient();
        this.activeOscillators.forEach(oscillator => {
            try { oscillator.stop(); } catch (error) { /* Ya detenido. */ }
            try { oscillator.disconnect(); } catch (error) { /* Ya desconectado. */ }
        });
        this.activeOscillators = [];
        this.ambientNodes = [];
        this.ambientBirdPlaying = false;
    },

    suspend() {
        if (this.ambientAudio) this.ambientAudio.pause();
        if (this.audioCtx?.state === "running") {
            const suspendPromise = this.audioCtx.suspend();
            if (suspendPromise && typeof suspendPromise.finally === "function") {
                this.suspendPromise = suspendPromise.catch(() => { }).finally(() => {
                    this.suspendPromise = null;
                });
            }
        }
    },

  play(effectName) {
    // Los efectos cortos quedan reservados para futuras mejoras.
    // No deben iniciar ni reactivar el ambiente selvático.
    return;
},

};

// ========================================================
// TOAST NOTIFICATIONS (CONFIRMACIÓN VISUAL)
// ========================================================
function mostrarToast(mensaje) {
    let toast = document.querySelector("#app-toast");
    if (!toast) {
        toast = document.createElement("div");
        toast.id = "app-toast";
        toast.className = "app-toast";
        toast.setAttribute("role", "status");
        toast.setAttribute("aria-live", "polite");
        document.body.appendChild(toast);
    }

    toast.textContent = String(mensaje ?? "");
    toast.classList.add("visible");
    clearTimeout(mostrarToast.timer);
    mostrarToast.timer = setTimeout(() => {
        toast.classList.remove("visible");
    }, 2200);
}

// ========================================================
// INICIALIZACIÓN AL CARGAR EL DOM
// ========================================================
function inicializarExperienciaPwa() {
    const installButton = document.querySelector("#install-app-btn");
    const offlineBanner = document.querySelector("#offline-readiness-banner");
    const dismissOffline = document.querySelector("#offline-readiness-dismiss");

    window.addEventListener("beforeinstallprompt", event => {
        event.preventDefault();
        deferredInstallPrompt = event;
        installButton?.classList.remove("hidden");
    });
    window.addEventListener("appinstalled", () => {
        deferredInstallPrompt = null;
        installButton?.classList.add("hidden");
        mostrarToast("📲 Iguazú Assist quedó instalada en tu dispositivo");
    });
    installButton?.addEventListener("click", async () => {
        if (!deferredInstallPrompt) return;
        deferredInstallPrompt.prompt();
        const choice = await deferredInstallPrompt.userChoice;
        if (choice?.outcome === "accepted") installButton.classList.add("hidden");
        deferredInstallPrompt = null;
    });

    let avisoVisto = false;
    try { avisoVisto = localStorage.getItem(APP_CONSTANTS.OFFLINE_READY_NOTICE_KEY) === "1"; } catch (error) { /* almacenamiento opcional */ }
    if (!avisoVisto && navigator.onLine !== false) {
        offlineBanner?.classList.remove("hidden");
        dismissOffline?.addEventListener("click", () => {
            offlineBanner.classList.add("hidden");
            try { localStorage.setItem(APP_CONSTANTS.OFFLINE_READY_NOTICE_KEY, "1"); } catch (error) { /* almacenamiento opcional */ }
        }, { once: true });
    }
}

function initMenuPrincipal() {
    const toggle = document.querySelector("#main-menu-toggle");
    const panel = document.querySelector("#main-menu-panel");
    const close = document.querySelector("#main-menu-close");
    const install = document.querySelector("#main-menu-install");
    const audio = document.querySelector("#main-menu-audio");
    const preferences = document.querySelector("#main-menu-preferences");
    if (!toggle || !panel || !close) return;

    const setOpen = (open, { restoreFocus = false } = {}) => {
        panel.classList.toggle("hidden", !open);
        panel.setAttribute("aria-hidden", String(!open));
        toggle.setAttribute("aria-expanded", String(open));
        toggle.setAttribute("aria-label", open ? "Cerrar menú principal" : "Abrir menú principal");
        if (open) close.focus();
        else if (restoreFocus) toggle.focus();
    };

    toggle.addEventListener("click", () => setOpen(panel.classList.contains("hidden")));
    close.addEventListener("click", () => setOpen(false, { restoreFocus: true }));
    panel.addEventListener("click", event => {
        if (event.target === panel) setOpen(false, { restoreFocus: true });
    });
    document.addEventListener("keydown", event => {
        if (event.key === "Escape" && !panel.classList.contains("hidden")) {
            event.preventDefault();
            setOpen(false, { restoreFocus: true });
        }
    });

    install?.addEventListener("click", () => {
        document.querySelector("#install-app-btn")?.click();
        setOpen(false, { restoreFocus: true });
    });
    audio?.addEventListener("click", () => document.querySelector("#audio-toggle")?.click());
    preferences?.addEventListener("click", () => {
        mostrarSeccion("profile");
        setOpen(false, { restoreFocus: true });
    });
}

function initPanelFiltrosCercaMio() {
    const toggle = document.querySelector("#nearby-filter-toggle");
    const panel = document.querySelector("#nearby-filter-panel");
    const close = document.querySelector("#nearby-filter-close");
    if (!toggle || !panel || !close) return;

    const setOpen = (open, { restoreFocus = false } = {}) => {
        panel.classList.toggle("hidden", !open);
        panel.setAttribute("aria-hidden", String(!open));
        toggle.setAttribute("aria-expanded", String(open));
        toggle.setAttribute("aria-label", open ? "Cerrar filtros y ordenar" : "Abrir filtros y ordenar");
        if (open) close.focus();
        else if (restoreFocus) toggle.focus();
    };

    toggle.addEventListener("click", () => setOpen(panel.classList.contains("hidden")));
    close.addEventListener("click", () => setOpen(false, { restoreFocus: true }));
    panel.addEventListener("click", event => {
        if (event.target === panel) setOpen(false, { restoreFocus: true });
    });
    document.addEventListener("keydown", event => {
        if (event.key === "Escape" && !panel.classList.contains("hidden")) {
            event.preventDefault();
            setOpen(false, { restoreFocus: true });
        }
    });
}

function inicializarAplicacion() {
    if (appInitialized) return;
    appInitialized = true;

    // Tuki usa sincrónicamente las funciones globales que expone el planificador.
    // Precargarlo evita que una consulta llegue antes de que el módulo esté disponible.
    cargarPlanificador();

    initNavegacion();
    initMenuPrincipal();
    initCategorias();
    initPlanificadorOpciones();
    initPanelFiltrosCercaMio();
    initCercaMio();
    initSorprendeme();
    initFichaClima();
    initControlSonido();
    initAccionesDelegadas();
    inicializarExperienciaPwa();
    cargarFavoritos();
    inicializarPersistenciaIndexedDB();

    // GPS al cargar: getCurrentPosition automático, feed por distancia, fallback Plaza San Martín.
    initGeolocalizacion();

    const initialHash = window.location.hash.replace(/^#/, "");
    if (initialHash) manejarHash(initialHash);
}

// ========================================================
// NAVEGACIÓN Y GESTIÓN DE VISTAS CON MEMORIA DE ORIGEN
// ========================================================

function initNavegacion() {
    window.addEventListener("hashchange", () => {
        manejarHash(window.location.hash.replace(/^#/, ""));
    });

    // Admite tanto data-section como data-view/data-nav en el marcado existente.
    const navigationElements = new Set(
        document.querySelectorAll("[data-section], [data-view], [data-nav]")
    );
    navigationElements.forEach(element => {
        element.addEventListener("click", event => {
            const section = element.dataset.section || element.dataset.view || element.dataset.nav;
            if (!section) return;
            event.preventDefault();
            mostrarSeccion(section);
        });
    });
}

function normalizarSeccion(seccionId) {
    const requestedId = String(seccionId || "home").replace(/^#/, "");
    return APP_CONSTANTS.SECTION_ALIASES[requestedId] || requestedId;
}

function vistaParaHash(seccionId) {
    if (seccionId === "hero-section") return "home";
    return seccionId;
}

function manejarHash(hash) {
    let requestedId = "home";
    try {
        requestedId = decodeURIComponent(String(hash || "")).trim() || "home";
    } catch (error) {
        console.warn("Hash de navegación inválido; se muestra el inicio.", error);
    }

    const routeParts = requestedId.split("/");
    if (routeParts[0] === "detail" && routeParts[1]) {
        const linkedPlace = buscarLugarSeguro(routeParts[1]);
        if (linkedPlace) {
            AppState.detailPlace = linkedPlace;
            mostrarDetalle(linkedPlace);
            return;
        }
        requestedId = "detail";
    }

    const supportedViews = new Set([
        "home", "nearby", "categories", "categories-section",
        "planner", "surprise", "profile", "results", "detail"
    ]);

    if (!supportedViews.has(requestedId)) {
        mostrarSeccion("home", { updateHash: false });
        return;
    }

    // Un detalle requiere un lugar seleccionado; no se muestra vacío por un hash directo.
    if (requestedId === "detail" && !AppState.detailPlace) {
        mostrarSeccion("home", { updateHash: false });
        return;
    }

    mostrarSeccion(requestedId, { updateHash: false });
}

function actualizarHash(seccionId) {
    let hash = vistaParaHash(seccionId);
    if (seccionId === "detail" && AppState.detailPlace?.id != null) {
        hash = `detail/${encodeURIComponent(AppState.detailPlace.id)}`;
    }
    if (window.location.hash.replace(/^#/, "") === hash) return;

    if (window.history?.pushState) {
        window.history.pushState({ view: hash }, "", `#${encodeURIComponent(hash)}`);
    } else {
        window.location.hash = hash;
    }
}

function actualizarNavegacionActiva(targetId) {
    const navId = APP_CONSTANTS.NAV_BY_SECTION[targetId];
    if (typeof setActiveNav === "function" && navId) {
        setActiveNav(navId);
        return;
    }

    document.querySelectorAll(".bottom-nav a, .bottom-nav button, [data-nav]").forEach(item => {
        const itemSection = item.dataset.section || item.dataset.view || item.dataset.nav;
        const isActive = itemSection && normalizarSeccion(itemSection) === targetId;
        item.classList.toggle("active", Boolean(isActive));
        if (isActive) item.setAttribute("aria-current", "page");
        else item.removeAttribute("aria-current");
    });
}

function mostrarSeccion(seccionId, { updateHash = true } = {}) {
    const requestedId = String(seccionId || "home").replace(/^#/, "");
    const targetId = normalizarSeccion(requestedId);

    if (!APP_CONSTANTS.SECTION_IDS.includes(targetId)) {
        console.warn(`Sección no encontrada: ${requestedId}`);
        return false;
    }

    if (targetId === "detail" && AppState.currentView !== "detail") {
        AppState.lastView = AppState.currentView || "home";
    }

    const target = document.getElementById(targetId);
    if (!target) {
        console.warn(`No existe el elemento #${targetId}`);
        return false;
    }

    APP_CONSTANTS.SECTION_IDS.forEach(id => {
        document.getElementById(id)?.classList.add("hidden");
    });
    target.classList.remove("hidden");
    AppState.currentView = requestedId === "hero-section" ? "home" : requestedId;

    if (targetId === "planner") cargarPlanificador();

    if (updateHash) actualizarHash(requestedId === "nearby" ? "nearby" : targetId);
    actualizarNavegacionActiva(targetId);

    if (typeof window.scrollTo === "function") {
        window.scrollTo({ top: 0, behavior: "smooth" });
    }
    return true;
}

function volverInicio() {
    SoundFX.play("cambio");
    AppState.lastView = "home";
    mostrarSeccion("home");
}

function volverAtras() {
    SoundFX.play("cambio");

    if (AppState.currentView === "detail") {
        mostrarSeccion(AppState.lastView || "home");
        return;
    }

    if (AppState.currentView !== "home") {
        volverInicio();
    }
}

// ========================================================
// GEOLOCALIZACIÓN Y DISTANCIA (FÓRMULA DE HAVERSINE)
// ========================================================

function esCoordenadaValida(lat, lng) {
    return Number.isFinite(Number(lat)) && Number.isFinite(Number(lng)) &&
        Number(lat) >= -90 && Number(lat) <= 90 &&
        Number(lng) >= -180 && Number(lng) <= 180;
}

function obtenerCentroDeReferencia() {
    const configuredCenter = typeof CONFIG_APP !== "undefined" && CONFIG_APP?.coordenadasCentro
        ? CONFIG_APP.coordenadasCentro
        : APP_CONSTANTS.DEFAULT_CENTER;

    if (esCoordenadaValida(configuredCenter?.lat, configuredCenter?.lng)) {
        return {
            lat: Number(configuredCenter.lat),
            lng: Number(configuredCenter.lng)
        };
    }
    return { ...APP_CONSTANTS.DEFAULT_CENTER };
}

function calcularDistanciaKm(lat1, lon1, lat2, lon2) {
    if (!esCoordenadaValida(lat1, lon1) || !esCoordenadaValida(lat2, lon2)) {
        return Number.NaN;
    }

    const earthRadiusKm = 6371;
    const latitude1 = Number(lat1) * (Math.PI / 180);
    const latitude2 = Number(lat2) * (Math.PI / 180);
    const dLat = (Number(lat2) - Number(lat1)) * (Math.PI / 180);
    const dLon = (Number(lon2) - Number(lon1)) * (Math.PI / 180);
    const a = Math.min(1, Math.max(0,
        Math.sin(dLat / 2) ** 2 +
        Math.cos(latitude1) * Math.cos(latitude2) * Math.sin(dLon / 2) ** 2
    ));

    return earthRadiusKm * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

function formatearDistancia(km) {
    if (!Number.isFinite(km) || km < 0) return "distancia no disponible";
    if (km < 1) return `a ${Math.round(km * 1000)} m`;
    return `a ${km.toFixed(1)} km`;
}

function calcularEstimacionTraslado(km) {
    if (!Number.isFinite(km) || km < 0) return "";
    if (km <= APP_CONSTANTS.WALKING_LIMIT_KM) {
        const mins = Math.max(1, Math.round(km * 12));
        return `🚶 ~${mins} min a pie`;
    }

    const mins = Math.max(3, Math.round(km * 1.6 + 2));
    return `🚗 ~${mins} min en auto`;
}

function obtenerRadioCercaniaKm() {
    const configured = typeof CONFIG_APP !== "undefined" ? Number(CONFIG_APP.radioCercaniaKm) : NaN;
    return Number.isFinite(configured) && configured > 0 ? configured : APP_CONSTANTS.NEARBY_LIMIT_KM;
}

function esImperdibleSiempreVisible(lugar) {
    const ids = typeof CONFIG_APP !== "undefined" && Array.isArray(CONFIG_APP.idsImperdiblesSiempreVisibles)
        ? CONFIG_APP.idsImperdiblesSiempreVisibles
        : [1];
    if (ids.includes(lugar?.id)) return true;
    const nombre = textoNormalizado(lugar?.nombre);
    return nombre.includes("parque nacional iguazú") || nombre.includes("parque nacional iguazu");
}

function actualizarEstadoGps(texto, estado) {
    const gpsStatus = document.querySelector("#nearby-gps-status");
    if (!gpsStatus) return;
    gpsStatus.className = `gps-ref-pill ${estado || ""}`.trim();
    const icon = document.createElement("span");
    icon.className = "gps-icon";
    icon.textContent = "📍";
    const label = document.createElement("span");
    label.className = "gps-text";
    label.textContent = String(texto ?? "").replace(/^📍\s*/, "");
    gpsStatus.replaceChildren(icon, label);
    const fallbackHelp = document.querySelector("#gps-fallback-help");
    if (fallbackHelp) fallbackHelp.classList.toggle("hidden", !["fallback", "stored"].includes(estado));
    const retryButton = document.querySelector("#btn-refresh-gps");
    if (retryButton) {
        const retryLabel = retryButton.querySelector("span:last-child");
        if (retryLabel) retryLabel.textContent = ["fallback", "stored"].includes(estado) ? uiText("retryGps", "Reintentar GPS") : uiText("refreshGps", "Actualizar GPS");
    }
}

function leerCoordenadasGuardadas() {
    try {
        const raw = localStorage.getItem(APP_CONSTANTS.GPS_STORAGE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!esCoordenadaValida(parsed?.lat, parsed?.lng)) return null;
        return { lat: Number(parsed.lat), lng: Number(parsed.lng) };
    } catch (error) {
        console.info("No se pudo leer la última ubicación guardada.", error);
        return null;
    }
}

function guardarCoordenadasUsuario(coords) {
    if (!esCoordenadaValida(coords?.lat, coords?.lng)) return;
    try {
        localStorage.setItem(APP_CONSTANTS.GPS_STORAGE_KEY, JSON.stringify({
            lat: Number(coords.lat),
            lng: Number(coords.lng),
            savedAt: Date.now()
        }));
    } catch (error) {
        console.info("No se pudo guardar la ubicación para el arranque offline.", error);
    }
}

function aplicarUbicacionGps(lat, lng, accuracy) {
    AppState.userCoords = { lat: Number(lat), lng: Number(lng) };
    AppState.gpsActive = true;
    guardarCoordenadasUsuario(AppState.userCoords);
    const accuracyM = Number.isFinite(Number(accuracy)) ? Math.round(Number(accuracy)) : null;
    const precisionLabel = accuracyM ? ` (±${accuracyM} m)` : "";
    actualizarEstadoGps(`GPS Activo${precisionLabel}`, "active");
    return accuracyM;
}

function aplicarFallbackUbicacion() {
    AppState.userCoords = obtenerCentroDeReferencia();
    AppState.gpsActive = false;
    actualizarEstadoGps("Ref: Plaza San Martín (Centro)", "fallback");
}

function restaurarUbicacionGuardada() {
    const stored = leerCoordenadasGuardadas();
    if (!stored) return false;
    AppState.userCoords = stored;
    AppState.gpsActive = false;
    actualizarEstadoGps("Última ubicación conocida (offline)", "stored");
    return true;
}

function refrescarFeedCercano() {
    renderizarCercaMio(AppState.filtroCercaMio || "todos");
}

function esPermisoGpsDenegado(error) {
    if (!error) return false;
    if (Number(error.code) === 1) return true;
    return /denied/i.test(String(error.message || ""));
}

function aplicarUbicacionTrasErrorGps(error) {
    if (esPermisoGpsDenegado(error)) {
        aplicarFallbackUbicacion();
        mostrarToast(uiText("gpsFallback", "📍 Permiso GPS denegado · referencia Plaza San Martín (Centro)"));
        return;
    }

    if (restaurarUbicacionGuardada()) {
        mostrarToast(uiText("noLocation", "📍 GPS no disponible · usando última ubicación conocida"));
        return;
    }

    aplicarFallbackUbicacion();
    mostrarToast(uiText("gpsFallback", "📍 Usando Plaza San Martín (Centro) como referencia"));
}

function iniciarSeguimientoGps() {
    if (typeof navigator === "undefined" || !navigator.geolocation || gpsWatchId != null) return;

    gpsWatchId = navigator.geolocation.watchPosition(
        position => {
            const now = Date.now();
            if (now - lastGpsWatchUpdate < 20000) return;
            lastGpsWatchUpdate = now;
            const { latitude, longitude, accuracy } = position.coords || {};
            if (!esCoordenadaValida(latitude, longitude)) return;
            aplicarUbicacionGps(latitude, longitude, accuracy);
            refrescarFeedCercano();
        },
        () => { /* El watch es opcional; el fallback ya cubre el permiso denegado. */ },
        { enableHighAccuracy: true, maximumAge: 15000, timeout: 15000 }
    );
}

function initGeolocalizacion() {
    if (!restaurarUbicacionGuardada()) aplicarFallbackUbicacion();
    refrescarFeedCercano();
    obtenerUbicacionUsuario(refrescarFeedCercano, refrescarFeedCercano);
}

function obtenerUbicacionUsuario(onSuccess, onError) {
    const success = typeof onSuccess === "function" ? onSuccess : refrescarFeedCercano;
    const failure = typeof onError === "function" ? onError : () => { };
    const requestId = ++gpsRequestId;
    const completar = (huboExito, error) => {
        if (requestId !== gpsRequestId) return;
        if (huboExito) success();
        else failure(error);
        refrescarFeedCercano();
    };

    if (typeof navigator === "undefined" || !navigator.geolocation) {
        aplicarUbicacionTrasErrorGps({ code: 2, message: "Geolocation API no disponible" });
        completar(false);
        return;
    }

    actualizarEstadoGps("Localizando GPS…", "searching");

    try {
        navigator.geolocation.getCurrentPosition(
            position => {
                const { latitude, longitude, accuracy } = position.coords || {};
                if (!esCoordenadaValida(latitude, longitude)) {
                    aplicarUbicacionTrasErrorGps(new Error("Coordenadas GPS inválidas"));
                    completar(false, new Error("Coordenadas GPS inválidas"));
                    return;
                }

                const accuracyM = aplicarUbicacionGps(latitude, longitude, accuracy);
                mostrarToast(`📍 Ubicación GPS obtenida${accuracyM ? ` · precisión ±${accuracyM} m` : ""}`);
                iniciarSeguimientoGps();
                completar(true);
            },
            error => {
                console.info("Ubicación GPS no disponible.", error?.message || "");
                aplicarUbicacionTrasErrorGps(error);
                completar(false, error);
            },
            { timeout: 10000, enableHighAccuracy: true, maximumAge: 0 }
        );
    } catch (error) {
        aplicarUbicacionTrasErrorGps(error);
        completar(false, error);
    }
}

// ========================================================
// MÓDULO CERCA MÍO (PROXIMIDAD & DISPONIBILIDAD EN TIEMPO REAL)
// ========================================================

function obtenerBaseDeLugares() {
    return typeof lugaresReales !== "undefined" && Array.isArray(lugaresReales)
        ? lugaresReales.filter(Boolean)
        : [];
}

function obtenerFechaHoraSegura() {
    if (typeof obtenerFechaHoraArgentina === "function") {
        try {
            const result = obtenerFechaHoraArgentina();
            if (result && Number.isFinite(Number(result.horaNumero))) return result;
        } catch (error) {
            console.warn("No se pudo obtener la hora de Argentina.", error);
        }
    }

    const parts = new Intl.DateTimeFormat("es-AR", {
        timeZone: "America/Argentina/Buenos_Aires",
        hour: "numeric",
        hour12: false,
        weekday: "long"
    }).formatToParts(new Date());
    const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
    return { horaNumero: Number(values.hour), diaSemana: values.weekday };
}

function obtenerDisponibilidadSegura(lugar, horaActual, diaActual) {
    try {
        if (typeof obtenerEstadoDisponibilidad === "function") {
            const result = obtenerEstadoDisponibilidad(lugar, horaActual, diaActual);
            if (result && typeof result === "object") {
                return {
                    abierto: result.abierto === true ? true : result.abierto === false ? false : null,
                    badgeHtml: ""
                };
            }
        }
        if (typeof estaAbiertoEnHorario === "function") {
            return { abierto: Boolean(estaAbiertoEnHorario(lugar, horaActual, diaActual)), badgeHtml: "" };
        }
    } catch (error) {
        console.warn("No se pudo calcular la disponibilidad de un lugar.", error);
    }
    return { abierto: null, badgeHtml: "" };
}

function textoSeguro(valor, fallback = "") {
    const text = String(valor ?? "").trim();
    return text || fallback;
}

function textoNormalizado(valor) {
    return textoSeguro(valor).toLocaleLowerCase("es-AR");
}

function listaDeTextos(valor) {
    if (Array.isArray(valor)) return valor.map(textoNormalizado).filter(Boolean);
    return textoSeguro(valor) ? [textoNormalizado(valor)] : [];
}

function lugarCoincideConFiltro(lugar, categoriaFiltro) {
    const filtro = textoNormalizado(categoriaFiltro);
    if (filtro === "todos") return true;

    const intereses = listaDeTextos(lugar.intereses);
    const etiquetas = listaDeTextos(lugar.etiquetas);
    const categoria = textoNormalizado(lugar.categoria);
    const tipo = textoNormalizado(lugar.tipo);
    const precio = textoNormalizado(lugar.precio);

    if (filtro === "ferias_compras") {
        return categoria === "compras" || intereses.includes("compras") ||
            tipo.includes("feria") || etiquetas.some(tag => tag.includes("feria") || tag.includes("compras"));
    }

    if (filtro === "gratuitos") {
        return lugar.gratuito === true || /gratuito|gratis|libre/.test(precio);
    }

    return categoria === filtro ||
        intereses.includes(filtro) ||
        etiquetas.some(tag => tag.includes(filtro)) ||
        tipo.includes(filtro);
}

function crearPill(texto, className = "meta-pill") {
    const pill = document.createElement("span");
    pill.className = className;
    pill.textContent = texto;
    return pill;
}

function crearBadgeDisponibilidad(disponibilidad) {
    if (disponibilidad?.abierto === true) {
        return crearPill("🟢 Abierto ahora", "meta-pill status-open");
    }
    if (disponibilidad?.abierto === false) {
        return crearPill("🔴 Cerrado ahora", "meta-pill status-closed");
    }
    return crearPill("🕒 Consultar horario", "meta-pill hours-pill");
}

function crearBadgeGasto(lugar) {
    if (lugar.gratuito === true) return crearPill("🎁 Gratuito", "meta-pill cost-pill");

    if (lugar.rangoPrecio) {
        const rango = textoSeguro(lugar.rangoPrecio).trim().toLowerCase();
        if (rango === "$") return crearPill("💰 Económico ($)", "meta-pill cost-pill");
        if (rango === "$$") return crearPill("💵 Medio ($$)", "meta-pill cost-pill");
        if (rango === "$$$") return crearPill("💎 Alto ($$$)", "meta-pill cost-pill");
        if (rango === "consultar") return crearPill("Consultar tarifa", "meta-pill cost-pill");
        return crearPill(lugar.rangoPrecio, "meta-pill cost-pill");
    }

    const nivel = textoNormalizado(lugar.nivelGasto);
    if (nivel === "economico") return crearPill("💰 Económico", "meta-pill cost-pill");
    if (nivel === "medio") return crearPill("💵 Medio", "meta-pill cost-pill");
    if (nivel === "alto") return crearPill("💎 Alto", "meta-pill cost-pill");
    return crearPill(textoSeguro(lugar.precio, "Consultar tarifa"), "meta-pill cost-pill");
}

function obtenerUrlImagenSegura(url) {
    const candidate = textoSeguro(url, APP_CONSTANTS.FALLBACK_IMAGE);
    if (/^javascript:/i.test(candidate) || /^data:/i.test(candidate)) {
        return APP_CONSTANTS.FALLBACK_IMAGE;
    }
    return candidate;
}

function obtenerImagenLugar(lugar) {
    const imagenPropia = textoSeguro(lugar?.imagen);
    if (imagenPropia) return obtenerUrlImagenSegura(imagenPropia);

    const nombre = textoNormalizado(lugar?.nombre);
    const categoria = textoNormalizado(lugar?.categoria);
    const intereses = listaDeTextos(lugar?.intereses);

    if (nombre.includes("costanera") || nombre.includes("mirador")) return "img_mirador.webp";
    if (nombre.includes("hito tres fronteras")) return "img_hito.webp";
    if (intereses.includes("fauna") || nombre.includes("colibr") || nombre.includes("guira")) return "tuki-branch.webp";
    return APP_CONSTANTS.CATEGORY_IMAGES[categoria] || APP_CONSTANTS.FALLBACK_IMAGE;
}

function obtenerImagenResponsive(url, width = 640) {
    const safeUrl = textoSeguro(url, APP_CONSTANTS.FALLBACK_IMAGE);
    const base = safeUrl.replace(/\.webp(?:\?.*)?$/i, "");
    const candidate = `${base}-${width}.webp`;
    const knownResponsive = /(?:img_(?:aqva|casanova|cataratas|hito|mirador|saintgeorge)|tuki-(?:branch|branch-transparent|avatar))-${width}\.webp$/i;
    return knownResponsive.test(candidate) ? candidate : safeUrl;
}

function obtenerSrcsetImagen(url) {
    const small = obtenerImagenResponsive(url, 160);
    const large = obtenerImagenResponsive(url, 640);
    if (small === url && large === url) return "";
    return `${small} 160w, ${large} 640w`;
}

function actualizarContadorFavoritos() {
    const count = AppState.favoriteIds.size;
    const label = document.querySelector("#profile-favorite-count");
    if (label) label.textContent = count ? `${count} ${count === 1 ? "lugar guardado" : "lugares guardados"} en este dispositivo.` : "Todavía no guardaste lugares.";
}

function cargarFavoritos() {
    try {
        const stored = JSON.parse(localStorage.getItem(APP_CONSTANTS.FAVORITES_STORAGE_KEY) || "[]");
        AppState.favoriteIds = new Set(Array.isArray(stored) ? stored.map(String) : []);
    } catch (error) {
        AppState.favoriteIds = new Set();
        console.info("No se pudieron cargar los favoritos guardados.", error);
    }
    actualizarContadorFavoritos();
}

function guardarFavoritos() {
    const favoritos = [...AppState.favoriteIds];
    if (persistenceIndexedDBActive) {
        guardarPersistenciaIndexedDB("favorites", favoritos).catch(() => {
            persistenceIndexedDBActive = false;
            try { localStorage.setItem(APP_CONSTANTS.FAVORITES_STORAGE_KEY, JSON.stringify(favoritos)); } catch (error) { console.info("No se pudieron guardar los favoritos.", error); }
        });
        return;
    }
    try {
        localStorage.setItem(APP_CONSTANTS.FAVORITES_STORAGE_KEY, JSON.stringify(favoritos));
    } catch (error) {
        console.info("No se pudieron guardar los favoritos.", error);
    }
}

function esLugarFavorito(lugar) {
    return lugar?.id != null && AppState.favoriteIds.has(String(lugar.id));
}

function actualizarBotonFavorito(button, lugar) {
    if (!button || !lugar) return;
    const active = esLugarFavorito(lugar);
    button.classList.toggle("is-favorite", active);
    button.textContent = active ? "★ Guardado" : "☆ Guardar";
    button.setAttribute("aria-pressed", String(active));
    button.setAttribute("aria-label", active ? `Quitar ${textoSeguro(lugar.nombre)} de favoritos` : `Guardar ${textoSeguro(lugar.nombre)} en favoritos`);
}

function alternarFavorito(lugar) {
    if (!lugar?.id) return;
    const id = String(lugar.id);
    const wasFavorite = AppState.favoriteIds.has(id);
    if (wasFavorite) AppState.favoriteIds.delete(id);
    else AppState.favoriteIds.add(id);
    guardarFavoritos();
    actualizarContadorFavoritos();
    mostrarToast(wasFavorite ? "☆ Lugar quitado de favoritos" : "★ Lugar guardado en favoritos");
    document.querySelectorAll('[data-action="favorite"]').forEach(button => {
        if (String(button.dataset.placeId) === id) actualizarBotonFavorito(button, lugar);
    });
    if (AppState.detailPlace?.id != null && String(AppState.detailPlace.id) === id) {
        actualizarBotonFavorito(document.querySelector("#detail-favorite-btn"), lugar);
    }
}

function construirUrlMaps(lugar) {
    const query = lugar.coordenadas && esCoordenadaValida(lugar.coordenadas.lat, lugar.coordenadas.lng)
        ? `${Number(lugar.coordenadas.lat)},${Number(lugar.coordenadas.lng)}`
        : `${textoSeguro(lugar.nombre)}, ${textoSeguro(lugar.direccion || lugar.ubicacion)}`;
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

function obtenerMomentosLegibles(lugar) {
    const momentos = Array.isArray(lugar?.momentos) ? lugar.momentos : [];
    const etiquetas = {
        mañana: "Mañana",
        mediodía: "Mediodía",
        tarde: "Tarde",
        atardecer: "Atardecer",
        noche: "Noche"
    };
    return momentos.map(momento => etiquetas[momento] || momento).filter(Boolean).slice(0, 3).join(" · ");
}

function requiereCoordinacionLugar(lugar) {
    const texto = [lugar?.horario, lugar?.precio, lugar?.promocion, lugar?.tipo, ...(Array.isArray(lugar?.etiquetas) ? lugar.etiquetas : [])]
        .map(valor => textoNormalizado(valor)).join(" ");
    return /reserva|reservas|coordina|autorizaci|gu[ií]a|turno|anticip/.test(texto);
}

function crearTarjetaLugar(lugar, { distancia = null, disponibilidad = null } = {}) {
    const nombre = placeText(lugar, "nombre", "Lugar sin nombre");
    const descripcion = placeText(lugar, "descripcion", "Información no disponible.");
    const ubicacion = placeText(lugar, "ubicacion", "Ubicación no disponible");
    const promocion = placeText(lugar, "promocion");
    const article = document.createElement("article");
    article.className = "place-feed-card";
    article.dataset.placeName = textoSeguro(lugar.nombre);

    const thumbWrap = document.createElement("div");
    thumbWrap.className = "place-card-thumb-wrap";
    const image = document.createElement("img");
    image.className = "place-card-thumb-img";
    image.width = 95;
    image.height = 95;
    const imageUrl = obtenerImagenLugar(lugar);
    image.src = obtenerImagenResponsive(imageUrl, 160);
    const srcset = obtenerSrcsetImagen(imageUrl);
    if (srcset) {
        image.srcset = srcset;
        image.sizes = "(max-width: 480px) 76px, 95px";
    }
    image.alt = textoSeguro(nombre, "Lugar de Iguazú");
    image.loading = "lazy";
    image.addEventListener("error", () => {
        if (image.dataset.fallbackApplied) return;
        image.dataset.fallbackApplied = "true";
        image.src = APP_CONSTANTS.FALLBACK_IMAGE;
    });
    const imageBadge = document.createElement("span");
    imageBadge.className = "place-card-thumb-badge";
    imageBadge.textContent = textoSeguro(lugar.icono, "🌿");
    imageBadge.setAttribute("aria-hidden", "true");
    thumbWrap.append(image, imageBadge);

    const main = document.createElement("div");
    main.className = "place-card-main-info";
    const titleRow = document.createElement("div");
    titleRow.className = "place-card-title-row";
    const title = document.createElement("h3");
    title.className = "place-card-title";
    title.textContent = textoSeguro(nombre, "Lugar sin nombre");
    titleRow.appendChild(title);
    if (esImperdibleSiempreVisible(lugar)) {
        titleRow.appendChild(crearPill("⭐ Imperdible destacado", "badge-featured-gold"));
    } else if (lugar.destacado) {
        titleRow.appendChild(crearPill("⭐ Destacado", "badge-featured-gold"));
    }
    if (promocion) titleRow.appendChild(crearPill(`🏷️ ${textoSeguro(promocion)}`, "meta-pill promo-pill"));

    const description = document.createElement("p");
    description.className = "place-card-description";
    description.textContent = textoSeguro(descripcion, "Información no disponible.");

    const metaLine = document.createElement("div");
    metaLine.className = "place-card-meta-line";
    if (Number.isFinite(distancia)) {
        metaLine.appendChild(crearPill(`📍 ${formatearDistancia(distancia)}`, "meta-pill dist-pill"));
        metaLine.appendChild(crearPill(AppState.gpsActive ? "📡 GPS real" : "📍 Ref. aproximada", `meta-pill ${AppState.gpsActive ? "gps-distance-pill" : "reference-distance-pill"}`));
        const traslado = calcularEstimacionTraslado(distancia);
        if (traslado) metaLine.appendChild(crearPill(traslado, distancia <= APP_CONSTANTS.WALKING_LIMIT_KM ? "tag-badge walk-badge" : "tag-badge car-badge"));
        metaLine.appendChild(crearBadgeDisponibilidad(disponibilidad));
    } else {
        metaLine.appendChild(crearPill(`📍 ${textoSeguro(ubicacion || lugar.direccion, "Ubicación no disponible")}`, "meta-pill loc-pill"));
        metaLine.appendChild(crearPill(`🕒 ${textoSeguro(lugar.horario, "Consultar horarios")}`, "meta-pill hours-pill"));
    }

    const subLine = document.createElement("div");
    subLine.className = "place-card-meta-line sub-line";
    subLine.appendChild(crearBadgeGasto(lugar));
    const duracion = Number(lugar.duracionHoras);
    if (Number.isFinite(duracion) && duracion > 0) {
        subLine.appendChild(crearPill(`⏱️ ~${duracion} h`, "meta-pill"));
    }
    const momentos = obtenerMomentosLegibles(lugar);
    if (momentos) subLine.appendChild(crearPill(`🕐 ${momentos}`, "meta-pill"));
    if (lugar.alAireLibre === false) {
        subLine.appendChild(crearPill("🌧️ Techado", "meta-pill weather-pill"));
    } else if (lugar.alAireLibre === true) {
        subLine.appendChild(crearPill("🌿 Exterior", "meta-pill weather-pill"));
    }
    if (requiereCoordinacionLugar(lugar)) {
        subLine.appendChild(crearPill("📅 Requiere coordinación", "meta-pill coordination-pill"));
    }
    if (Number.isFinite(distancia)) subLine.appendChild(crearPill(`🕒 ${textoSeguro(lugar.horario, "Consultar horarios")}`, "meta-pill hours-pill"));

    main.append(titleRow, description, metaLine);
    if (subLine.childElementCount) main.appendChild(subLine);

    const actions = document.createElement("div");
    actions.className = "place-card-actions-col";
    const detailButton = document.createElement("button");
    detailButton.type = "button";
    detailButton.className = "btn-action-detail";
    detailButton.dataset.action = "detail";
    detailButton.dataset.placeName = textoSeguro(lugar.nombre);
    detailButton.setAttribute("aria-label", `Ver detalle de ${textoSeguro(nombre)}`);
    detailButton.innerHTML = '<span class="action-icon">☆</span><span>Ver detalle</span>';

    const favoriteButton = document.createElement("button");
    favoriteButton.type = "button";
    favoriteButton.className = "btn-action-favorite";
    favoriteButton.dataset.action = "favorite";
    favoriteButton.dataset.placeId = String(lugar.id ?? "");
    favoriteButton.setAttribute("aria-pressed", String(esLugarFavorito(lugar)));
    favoriteButton.setAttribute("aria-label", `${esLugarFavorito(lugar) ? "Quitar" : "Guardar"} ${textoSeguro(nombre)} ${esLugarFavorito(lugar) ? "de" : "en"} favoritos`);
    favoriteButton.innerHTML = esLugarFavorito(lugar) ? "★ Guardado" : "☆ Guardar";

    const directions = document.createElement("a");
    directions.className = "btn-action-directions";
    directions.href = construirUrlMaps(lugar);
    directions.target = "_blank";
    directions.rel = "noopener noreferrer";
    directions.innerHTML = '<span class="action-icon">📍</span><span>Cómo llegar</span>';
    actions.append(detailButton, favoriteButton, directions);

    article.append(thumbWrap, main, actions);
    return article;
}

function mostrarEstadoListaVacia(lista, mensaje = "No hay opciones para este filtro.") {
    const empty = document.createElement("div");
    empty.className = "place-card-item place-empty-state";
    empty.setAttribute("role", "status");
    empty.innerHTML = "<div aria-hidden=\"true\">🔍</div>";
    const heading = document.createElement("h4");
    heading.textContent = mensaje;
    const detail = document.createElement("p");
    detail.textContent = uiText("tukiNoExact", "Probá seleccionando otra opción o ampliando el criterio de búsqueda.");
    empty.append(heading, detail);
    lista.replaceChildren(empty);
}

function obtenerSelectoresFiltroCercaMio() {
    return document.querySelectorAll(".filter-chip[data-nearby-filter], .filter-pill[data-nearby-filter]");
}

function aplicarFiltroCercaMio(filtroOrigen) {
    const valor = textoNormalizado(
        filtroOrigen instanceof Element ? filtroOrigen.dataset.nearbyFilter : filtroOrigen
    ) || "todos";

    obtenerSelectoresFiltroCercaMio().forEach(item => {
        const activo = textoNormalizado(item.dataset.nearbyFilter) === valor;
        item.classList.toggle("active", activo);
        item.setAttribute("aria-pressed", String(activo));
    });

    AppState.filtroCercaMio = valor;
    renderizarCercaMio(valor);
}

function initCercaMio() {
    obtenerSelectoresFiltroCercaMio().forEach(chip => {
        chip.setAttribute("aria-pressed", String(chip.classList.contains("active")));
    });

    const destino = document.querySelector(".filter-chips-container") || document;
    destino.addEventListener("click", event => {
        const chip = event.target instanceof Element
            ? event.target.closest(".filter-chip[data-nearby-filter], .filter-pill[data-nearby-filter]")
            : null;
        if (!chip) return;

        event.preventDefault();
        aplicarFiltroCercaMio(chip);
        const container = chip.closest(".filter-chips-container");
        if (container) {
            const chipRect = chip.getBoundingClientRect();
            const containerRect = container.getBoundingClientRect();
            const chipStart = container.scrollLeft + chipRect.left - containerRect.left;
            const chipEnd = chipStart + chipRect.width;
            const visibleStart = container.scrollLeft;
            const visibleEnd = visibleStart + container.clientWidth;
            if (chipStart < visibleStart || chipEnd > visibleEnd) {
                const targetLeft = chipEnd > visibleEnd ? chipEnd - container.clientWidth : chipStart;
                container.scrollTo({ left: Math.max(0, targetLeft), behavior: "smooth" });
            }
        }
        SoundFX.play("drop");
    });

    const btnRefreshGps = document.querySelector("#btn-refresh-gps");
    btnRefreshGps?.addEventListener("click", () => {
        SoundFX.play("cambio");
        obtenerUbicacionUsuario(refrescarFeedCercano);
    });
    document.querySelector("#gps-fallback-retry")?.addEventListener("click", () => {
        SoundFX.play("cambio");
        obtenerUbicacionUsuario(refrescarFeedCercano);
    });

    const searchInput = document.querySelector("#nearby-search");
    const searchClear = document.querySelector("#nearby-search-clear");
    searchInput?.addEventListener("input", event => {
        AppState.searchTerm = textoSeguro(event.target?.value);
        renderizarCercaMio(AppState.filtroCercaMio || "todos");
    });
    searchClear?.addEventListener("click", () => {
        if (!searchInput) return;
        searchInput.value = "";
        AppState.searchTerm = "";
        renderizarCercaMio(AppState.filtroCercaMio || "todos");
        searchInput.focus();
    });
}

function abrirCercaMio() {
    mostrarSeccion("nearby");
    if (!AppState.userCoords) {
        obtenerUbicacionUsuario(() => renderizarCercaMio(AppState.filtroCercaMio || "todos"));
    } else {
        renderizarCercaMio(AppState.filtroCercaMio || "todos");
    }
}

function abrirFavoritosDesdeNavegacion() {
    mostrarSeccion("home");
    aplicarFiltroCercaMio("favoritos");
    setActiveNav("bnav-favorites");
}

function obtenerCatalogoCompletoConDistancia() {
    const places = obtenerBaseDeLugares();
    const coords = AppState.userCoords && esCoordenadaValida(AppState.userCoords.lat, AppState.userCoords.lng)
        ? AppState.userCoords
        : obtenerCentroDeReferencia();
    const { horaNumero: horaActual, diaSemana: diaActual } = obtenerFechaHoraSegura();

    return places
        .map(lugar => {
            const tieneCoordenadas = esCoordenadaValida(lugar.coordenadas?.lat, lugar.coordenadas?.lng);
            return {
                lugar,
                distancia: tieneCoordenadas
                    ? calcularDistanciaKm(coords.lat, coords.lng, lugar.coordenadas.lat, lugar.coordenadas.lng)
                    : null,
                disponibilidad: obtenerDisponibilidadSegura(lugar, horaActual, diaActual)
            };
        })
        .filter(item => item.distancia === null || Number.isFinite(item.distancia))
        .sort((a, b) => {
            if (a.distancia === null && b.distancia === null) return 0;
            if (a.distancia === null) return 1;
            if (b.distancia === null) return -1;
            return a.distancia - b.distancia;
        });
}

function itemCoincideConFiltroCercaMio(item, filtro) {
    if (filtro === "todos") return true;
    if (filtro === "favoritos") return esLugarFavorito(item.lugar);
    if (filtro === "abiertos") return item.disponibilidad.abierto === true;
    if (filtro === "caminando") return item.distancia <= APP_CONSTANTS.WALKING_LIMIT_KM;
    return lugarCoincideConFiltro(item.lugar, filtro);
}

function lugarCoincideConBusqueda(lugar, termino) {
    const query = textoNormalizado(termino);
    if (!query) return true;
    const haystack = [
        lugar?.nombre,
        lugar?.descripcion,
        lugar?.categoria,
        lugar?.tipo,
        lugar?.ubicacion,
        lugar?.direccion,
        ...(Array.isArray(lugar?.intereses) ? lugar.intereses : []),
        ...(Array.isArray(lugar?.etiquetas) ? lugar.etiquetas : [])
    ].map(textoNormalizado).join(" ");
    return haystack.includes(query);
}

function actualizarContadorCerca(total, totalCatalogo) {
    const counter = document.querySelector("#nearby-count");
    if (!counter) return;
    const search = textoSeguro(AppState.searchTerm);
    const suffix = search ? ` para “${search}”` : "";
    counter.textContent = `${total} ${total === 1 ? "opción" : "opciones"}${suffix}`;
    counter.dataset.totalCatalogo = String(totalCatalogo ?? total);
}

function renderizarCercaMio(categoriaFiltro = "todos") {
    const lista = document.querySelector("#nearby-list");
    if (!lista) return;

    const catalogo = obtenerCatalogoCompletoConDistancia();
    if (!catalogo.length) {
        mostrarEstadoListaVacia(lista, "Todavía no hay lugares cargados.");
        return;
    }

    const filtro = textoNormalizado(categoriaFiltro) || "todos";
    const radioKm = obtenerRadioCercaniaKm();
    const esFiltroDeCercania = filtro === "todos" || filtro === "abiertos" || filtro === "caminando";
    const base = esFiltroDeCercania
        ? catalogo.filter(item =>
            (filtro === "todos" && item.distancia === null) ||
            item.distancia <= radioKm ||
            esImperdibleSiempreVisible(item.lugar)
        )
        : catalogo;

    const filtrados = base.filter(item =>
        itemCoincideConFiltroCercaMio(item, filtro) && lugarCoincideConBusqueda(item.lugar, AppState.searchTerm)
    );
    actualizarContadorCerca(filtrados.length, base.length);
    if (!filtrados.length) {
        mostrarEstadoListaVacia(lista, AppState.searchTerm
            ? `No encontramos opciones para “${AppState.searchTerm}”.`
            : undefined);
        return;
    }

    AppState.nearbyItems = filtrados;
    AppState.nearbyVisibleCount = Math.min(12, filtrados.length);
    renderizarBloqueCercaMio(lista);
}

window.addEventListener("iguazu-language-changed", () => {
    if (typeof renderizarCercaMio === "function") renderizarCercaMio(AppState.filtroCercaMio || "todos");
    if (AppState.detailPlace && typeof mostrarDetalle === "function") mostrarDetalle(AppState.detailPlace.id);
});

function renderizarBloqueCercaMio(lista) {
    const filtrados = Array.isArray(AppState.nearbyItems) ? AppState.nearbyItems : [];
    const fragment = document.createDocumentFragment();
    filtrados.slice(0, AppState.nearbyVisibleCount).forEach(item => {
        fragment.appendChild(crearTarjetaLugar(item.lugar, item));
    });
    if (AppState.nearbyVisibleCount < filtrados.length) {
        const loadMore = document.createElement("button");
        loadMore.type = "button";
        loadMore.className = "nearby-load-more";
        loadMore.textContent = `Cargar más opciones (${filtrados.length - AppState.nearbyVisibleCount})`;
        loadMore.addEventListener("click", () => {
            AppState.nearbyVisibleCount = Math.min(AppState.nearbyVisibleCount + 12, filtrados.length);
            renderizarBloqueCercaMio(lista);
        }, { once: true });
        fragment.appendChild(loadMore);
    }
    lista.replaceChildren(fragment);
}

// ========================================================
// MÓDULO SORPRÉNDEME (1-CLIC)
// ========================================================

function initSorprendeme() {
    // Inicialización de vista
}

function initFichaClima() {
    const badge = document.querySelector("#weather-badge");
    const sheet = document.querySelector("#weather-sheet");
    if (!badge || !sheet) return;

    const abrir = () => abrirFichaClima();
    badge.addEventListener("click", abrir);
    badge.addEventListener("keydown", event => {
        if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            abrir();
        }
    });

    sheet.addEventListener("click", event => {
        if (event.target === sheet) cerrarFichaClima();
    });
}

function abrirSorprendeme() {
    mostrarSeccion("surprise");
    if (typeof window.generarSorpresa === "function") {
        window.generarSorpresa();
    }
}

function initAccionesDelegadas() {
    document.addEventListener("click", event => {
        const target = event.target instanceof Element ? event.target.closest("[data-action]") : null;
        if (!target) return;

        if (target.dataset.action === "detail") {
            event.preventDefault();
            const nombre = target.dataset.placeName;
            if (nombre) mostrarDetalle(nombre);
            return;
        }

        if (target.dataset.action === "favorite") {
            event.preventDefault();
            const lugar = obtenerBaseDeLugares().find(item => String(item.id) === String(target.dataset.placeId));
            if (lugar) alternarFavorito(lugar);
        }
    });
}

// ========================================================
// CATEGORÍAS
// ========================================================

const CATEGORIAS_CONFIG = {
    naturaleza: { icono: "🌿", titulo: "Naturaleza", desc: "Cataratas, selva virgen, cascadas y refugios de fauna." },
    comida: { icono: "🍽️", titulo: "Dónde Comer", desc: "Pescados de río, parrillas argentinas y cocina regional." },
    compras: { icono: "🛍️", titulo: "Compras", desc: "Artesanías, ferias, recuerdos y centros comerciales." },
    movilidad: { icono: "🚗", titulo: "Movilidad & Traslados", desc: "Colectivos al Parque, taxis oficiales y traslados al Aeropuerto." },
    actividades: { icono: "🎭", titulo: "Qué Hacer", desc: "Hito Tres Fronteras, paseos culturales, compras y excursiones." },
    alojamiento: { icono: "🏨", titulo: "Alojamiento", desc: "Hoteles céntricos, resorts de selva y lodges con spa." },
    noche: { icono: "🌙", titulo: "De Noche", desc: "Boliches, espectáculos y bares temáticos." }
};

function obtenerLugaresDeCategoriaSeguro(catKey) {
    if (typeof obtenerLugaresPorCategoria === "function") {
        try {
            const result = obtenerLugaresPorCategoria(catKey);
            return Array.isArray(result) ? result.filter(Boolean) : [];
        } catch (error) {
            console.warn("No se pudo cargar la categoría solicitada.", error);
        }
    }

    return obtenerBaseDeLugares().filter(lugar => lugarCoincideConFiltro(lugar, catKey));
}

function initCategorias() {
    document.querySelectorAll(".category-card").forEach(card => {
        card.addEventListener("click", () => {
            const catKey = card.dataset.category || "";
            const config = CATEGORIAS_CONFIG[catKey] || {
                icono: "🌴",
                titulo: "Explorar",
                desc: "Lugares de Iguazú"
            };
            mostrarResultadosCategoria(
                config.icono,
                config.titulo,
                config.desc,
                obtenerLugaresDeCategoriaSeguro(catKey)
            );
            SoundFX.play("drop");
        });
    });
}

function mostrarResultadosCategoria(icono, titulo, descripcion, lugares = []) {
    const icon = document.querySelector("#results-icon");
    const heading = document.querySelector("#results-title");
    const description = document.querySelector("#results-description");
    const lista = document.querySelector("#results-list");
    if (!lista) return;

    if (icon) icon.textContent = textoSeguro(icono);
    if (heading) heading.textContent = textoSeguro(titulo, "Explorar");
    if (description) description.textContent = textoSeguro(descripcion);

    const validPlaces = Array.isArray(lugares) ? lugares.filter(Boolean) : [];
    if (!validPlaces.length) {
        mostrarEstadoListaVacia(lista, uiText("noLocation", "No se encontraron lugares en esta categoría."));
    } else {
        const fragment = document.createDocumentFragment();
        validPlaces.forEach(lugar => fragment.appendChild(crearTarjetaLugar(lugar)));
        lista.replaceChildren(fragment);
    }

    mostrarSeccion("results");
}

// ========================================================
// FORMULARIO DEL PLANIFICADOR: SINCRONIZACIÓN DE OPCIONES
// ========================================================

function initPlanificadorOpciones() {
    const vincularOpciones = (selector, dataKey, stateKey) => {
        const options = [...document.querySelectorAll(selector)];
        const multiple = false;
        options.forEach(option => {
            if (option.tagName !== "BUTTON" && option.tagName !== "INPUT") {
                option.setAttribute("role", "button");
                if (!option.hasAttribute("tabindex")) option.tabIndex = 0;
            }

            option.setAttribute("aria-pressed", String(option.classList.contains("selected")));
            const seleccionar = () => {
                if (multiple) {
                    const isSelected = option.classList.toggle("selected");
                    option.setAttribute("aria-pressed", String(isSelected));
                    const selected = options.filter(item => item.classList.contains("selected"));
                    AppState[stateKey] = selected[0]?.dataset[dataKey] || AppState[stateKey] || "naturaleza";
                } else {
                    options.forEach(item => {
                        const isSelected = item === option;
                        item.classList.toggle("selected", isSelected);
                        item.setAttribute("aria-pressed", String(isSelected));
                    });
                    AppState[stateKey] = option.dataset[dataKey] || AppState[stateKey];
                }
                SoundFX.play("drop");
            };

            option.addEventListener("click", seleccionar);
            option.addEventListener("keydown", event => {
                if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    seleccionar();
                }
            });
        });
    };

    vincularOpciones(".planner-option", "interest", "interes");
    window.obtenerInteresesPlan = () => {
        const selected = [...document.querySelectorAll(".planner-option.selected")]
            .map(option => option.dataset.interest)
            .filter(Boolean);
        return selected.length ? selected : [AppState.interes || "naturaleza"];
    };
    vincularOpciones(".time-option", "time", "tiempo");
    vincularOpciones(".traveler-option", "traveler", "compania");
    vincularOpciones(".budget-option", "budget", "presupuesto");
}

// ========================================================
// FICHA DE DETALLE DE LUGAR
// ========================================================

function establecerTexto(selector, value, fallback = "") {
    const element = document.querySelector(selector);
    if (element) element.textContent = textoSeguro(value, fallback);
    return element;
}

function buscarLugarSeguro(nombreOLugar) {
    if (nombreOLugar && typeof nombreOLugar === "object") return nombreOLugar;
    if (typeof nombreOLugar !== "string") return null;

    if (typeof obtenerLugarPorIdentificador === "function") {
        try {
            const result = obtenerLugarPorIdentificador(nombreOLugar);
            if (result) return result;
        } catch (error) {
            console.warn("No se pudo buscar el lugar por identificador.", error);
        }
    }

    return obtenerBaseDeLugares().find(lugar =>
        textoSeguro(lugar.nombre) === nombreOLugar || textoSeguro(lugar.id) === nombreOLugar
    ) || null;
}

function obtenerUrlExternaSegura(value, protocols = ["http:", "https:"]) {
    const raw = textoSeguro(value);
    if (!raw || /^consultar$/i.test(raw) || /^javascript:|^data:|^vbscript:/i.test(raw)) return null;

    try {
        const url = new URL(raw, window.location.href);
        return protocols.includes(url.protocol) ? url.href : null;
    } catch (error) {
        return null;
    }
}

function crearBotonContacto(texto, className, href, { nuevaPestana = false } = {}) {
    const link = document.createElement("a");
    link.className = `contact-btn ${className}`;
    link.href = href;
    link.textContent = texto;
    if (nuevaPestana) {
        link.target = "_blank";
        link.rel = "noopener noreferrer";
    }
    return link;
}

async function compartirLugar(lugar) {
    if (!lugar) return;
    const shareUrl = `${window.location.origin}${window.location.pathname}#detail/${encodeURIComponent(lugar.id)}`;
    const shareData = {
        title: `${textoSeguro(lugar.nombre)} · Iguazú Assist`,
        text: textoSeguro(lugar.descripcion, "Descubrí este lugar en Puerto Iguazú."),
        url: shareUrl
    };

    try {
        if (navigator.share) {
            await navigator.share(shareData);
            return;
        }
        if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(shareUrl);
            mostrarToast("Enlace copiado para compartir");
            return;
        }
    } catch (error) {
        if (error?.name === "AbortError") return;
        console.info("No se pudo compartir el lugar.", error);
    }
    mostrarToast("Copiá el enlace desde la barra del navegador");
}

function mostrarDetalle(nombreOLugar) {
    const lugar = buscarLugarSeguro(nombreOLugar);
    if (!lugar) {
        mostrarToast(uiText("noLocation", "No se encontró la información de este lugar."));
        return;
    }

    AppState.detailPlace = lugar;
    SoundFX.play("drop");

    const detailImg = document.querySelector("#detail-image");
    if (detailImg) {
        detailImg.width = 648;
        detailImg.height = 220;
        const detailImageUrl = obtenerImagenLugar(lugar);
        detailImg.src = obtenerImagenResponsive(detailImageUrl, 640);
        const detailSrcset = obtenerSrcsetImagen(detailImageUrl);
        if (detailSrcset) {
            detailImg.srcset = detailSrcset;
            detailImg.sizes = "(max-width: 680px) 100vw, 648px";
        }
        detailImg.alt = textoSeguro(lugar.nombre, "Lugar de Iguazú");
        detailImg.dataset.fallbackApplied = "";
        detailImg.onerror = () => {
            if (detailImg.dataset.fallbackApplied) return;
            detailImg.dataset.fallbackApplied = "true";
            detailImg.src = APP_CONSTANTS.FALLBACK_IMAGE;
        };
    }

    establecerTexto("#detail-icon", lugar.icono, "📍");
    establecerTexto("#detail-title", placeText(lugar, "nombre", "Lugar de Iguazú"), "Lugar de Iguazú");
    establecerTexto("#detail-description", placeText(lugar, "descripcion", "Información no disponible."), "Información no disponible.");
    establecerTexto("#detail-location", lugar.direccion || placeText(lugar, "ubicacion"), "Consultar ubicación");
    establecerTexto("#detail-hours", lugar.horario, "Consultar horarios");
    establecerTexto("#detail-price", placeText(lugar, "precioTexto") || lugar.precio, "Consultar tarifa");

    const badgesContainer = document.querySelector("#detail-badges");
    if (badgesContainer) {
        const badges = document.createDocumentFragment();
        if (lugar.destacado) badges.appendChild(crearPill("⭐ Destacado", "badge-featured-gold"));
        const promocion = placeText(lugar, "promocion");
        if (promocion) badges.appendChild(crearPill(`🏷️ ${textoSeguro(promocion)}`, "meta-pill promo-pill"));
        badges.appendChild(crearPill(
            lugar.alAireLibre === false ? "🏛️ Techado (mejor con lluvia)" : "🌿 Al aire libre",
            "meta-pill"
        ));
        const duracion = Number(lugar.duracionHoras);
        if (Number.isFinite(duracion) && duracion > 0) badges.appendChild(crearPill(`⏱️ ~${duracion} h`, "meta-pill"));
        const momentos = obtenerMomentosLegibles(lugar);
        if (momentos) badges.appendChild(crearPill(`🕐 ${momentos}`, "meta-pill"));
        if (requiereCoordinacionLugar(lugar)) badges.appendChild(crearPill("📅 Requiere coordinación", "meta-pill coordination-pill"));
        badgesContainer.replaceChildren(badges);
    }

    const mapBtn = document.querySelector("#detail-map-btn");
    if (mapBtn) {
        mapBtn.type = "button";
        mapBtn.onclick = () => window.open(construirUrlMaps(lugar), "_blank", "noopener,noreferrer");
    }

    const shareButton = document.querySelector("#detail-share-btn");
    if (shareButton) shareButton.onclick = () => compartirLugar(lugar);
    const detailFavoriteButton = document.querySelector("#detail-favorite-btn");
    if (detailFavoriteButton) detailFavoriteButton.onclick = () => alternarFavorito(lugar);
    actualizarBotonFavorito(detailFavoriteButton, lugar);

    const contactContainer = document.querySelector("#contact-buttons");
    if (contactContainer) {
        const contacts = document.createDocumentFragment();
        const whatsapp = textoSeguro(lugar.whatsapp).replace(/[^0-9]/g, "");
        if (whatsapp && whatsapp.length >= 8) {
            contacts.appendChild(crearBotonContacto(
                "💬 WhatsApp",
                "whatsapp",
                `https://wa.me/${whatsapp}?text=${encodeURIComponent("Hola, los contacto desde Iguazú Assist.")}`,
                { nuevaPestana: true }
            ));
        }

        const phone = textoSeguro(lugar.telefono).replace(/[^0-9+*#;,()-]/g, "");
        if (phone) contacts.appendChild(crearBotonContacto("📞 Llamar", "call", `tel:${phone}`));

        const web = obtenerUrlExternaSegura(lugar.web);
        if (web) contacts.appendChild(crearBotonContacto("🌐 Sitio Web", "web", web, { nuevaPestana: true }));
        contactContainer.replaceChildren(contacts);
    }

    mostrarSeccion("detail");
}

// ========================================================
// CONTROL DE SONIDO (ACTIVO POR DEFECTO, PERSISTENTE Y RESPETUOSO DEL NAVEGADOR)
// ========================================================

function cargarPreferenciasAudio() {
    try {
        const audioGuardado = localStorage.getItem(APP_CONSTANTS.AUDIO_ENABLED_STORAGE_KEY);
        const volumenRaw = localStorage.getItem(APP_CONSTANTS.AUDIO_VOLUME_STORAGE_KEY);
        const volumenGuardado = volumenRaw == null ? NaN : Number(volumenRaw);
        if (audioGuardado === "true" || audioGuardado === "false") {
            AppState.audioActivo = audioGuardado === "true";
        }
        if (Number.isFinite(volumenGuardado) && volumenGuardado >= 0 && volumenGuardado <= 100) {
            AppState.volumenAmbiente = volumenGuardado;
        }
    } catch (error) {
        console.info("No se pudieron leer las preferencias de audio guardadas.");
    }
}

function guardarPreferenciasAudio() {
    try {
        localStorage.setItem(APP_CONSTANTS.AUDIO_ENABLED_STORAGE_KEY, String(AppState.audioActivo));
        localStorage.setItem(APP_CONSTANTS.AUDIO_VOLUME_STORAGE_KEY, String(AppState.volumenAmbiente));
    } catch (error) {
        console.info("No se pudieron guardar las preferencias de audio.");
    }
}

function actualizarControlesAudio() {
    const audioBtn = document.querySelector("#audio-toggle");
    const profileBtn = document.querySelector("#profile-audio-toggle");
    const tukiBtn = document.querySelector("#tuki-sound-toggle");
    const menuAudio = document.querySelector("#main-menu-audio");
    const tukiVolume = document.querySelector("#tuki-volume");
    const activo = AppState.audioActivo;

    if (audioBtn) {
        audioBtn.textContent = activo ? "🔊" : "🔇";
        audioBtn.classList.toggle("active", activo);
        audioBtn.setAttribute("aria-pressed", String(activo));
        audioBtn.setAttribute("aria-label", activo ? "Silenciar efectos de sonido" : "Activar efectos de sonido");
        audioBtn.title = activo
            ? `${uiText("soundActive", "Sonido activo")} (clic para silenciar)`
            : `${uiText("soundOn", "Activar sonido")} (clic para activar)`;
    }
    if (profileBtn) profileBtn.textContent = activo ? `${uiText("soundActive", "Activado")} 🔊` : `${uiText("soundOn", "Silenciado")} 🔇`;
    if (tukiBtn) {
        tukiBtn.textContent = activo ? uiText("soundActive", "Sonido activo") : uiText("soundOn", "Activar sonido");
        tukiBtn.classList.toggle("active", activo);
        tukiBtn.setAttribute("aria-pressed", String(activo));
    }
    if (menuAudio) {
        menuAudio.textContent = activo ? "🔊 Ambiente selvático · Activado" : "🔇 Ambiente selvático · Silenciado";
        menuAudio.setAttribute("aria-pressed", String(activo));
    }
    if (tukiVolume) tukiVolume.value = String(AppState.volumenAmbiente);
}

function iniciarAudioHabilitado() {
    if (!AppState.audioActivo || document.hidden) return;

    SoundFX.startAmbient();

    // En celulares, el navegador puede bloquear el autoplay.
    // Usamos una referencia de módulo (_activarAudioConInteraccion) para poder eliminar
    // los listeners anteriores antes de registrar nuevos, evitando duplicados cuando
    // esta función se llama varias veces (pageshow, visibilitychange, etc.).
    if (_activarAudioConInteraccion) {
        document.removeEventListener("pointerdown", _activarAudioConInteraccion);
        document.removeEventListener("touchstart", _activarAudioConInteraccion);
        document.removeEventListener("touchend", _activarAudioConInteraccion);
        document.removeEventListener("click", _activarAudioConInteraccion);
        document.removeEventListener("keydown", _activarAudioConInteraccion);
        _activarAudioConInteraccion = null;
    }

    _activarAudioConInteraccion = () => {
        if (!AppState.audioActivo || document.hidden) return;

        SoundFX.startAmbient({ userGesture: true });

        // Limpiar todos los listeners una vez que el audio se intentó con gesto real.
        document.removeEventListener("pointerdown", _activarAudioConInteraccion);
        document.removeEventListener("touchstart", _activarAudioConInteraccion);
        document.removeEventListener("touchend", _activarAudioConInteraccion);
        document.removeEventListener("click", _activarAudioConInteraccion);
        document.removeEventListener("keydown", _activarAudioConInteraccion);
        _activarAudioConInteraccion = null;
    };

    document.addEventListener("pointerdown", _activarAudioConInteraccion);
    document.addEventListener("touchstart", _activarAudioConInteraccion, { passive: true });
    document.addEventListener("touchend", _activarAudioConInteraccion, { passive: true });
    document.addEventListener("click", _activarAudioConInteraccion);
    document.addEventListener("keydown", _activarAudioConInteraccion);
}

function initControlSonido() {
    const audioBtn = document.querySelector("#audio-toggle");
    if (!audioBtn) return;

    cargarPreferenciasAudio();
    actualizarControlesAudio();
    audioBtn.addEventListener("click", () => {
        AppState.audioActivo = !AppState.audioActivo;
        guardarPreferenciasAudio();
        actualizarControlesAudio();
        if (AppState.audioActivo) {
            mostrarToast(`🔊 ${uiText("soundActive", "Sonido y ambiente de selva activados")}`);
            SoundFX.startAmbient({ userGesture: true });
        } else {
            SoundFX.stopAmbient();
            SoundFX.stopAll();
            SoundFX.suspend();
            mostrarToast(`🔇 ${uiText("soundOn", "Sonido silenciado")}`);
        }
    });

    const reintentarTrasInteraccion = () => {
        if (!AppState.audioActivo || document.hidden) return;
        SoundFX.startAmbient({ userGesture: true });
    };
    document.addEventListener("pointerdown", reintentarTrasInteraccion, { passive: true });
    document.addEventListener("keydown", reintentarTrasInteraccion);
    document.addEventListener("visibilitychange", () => {
        if (document.hidden) {
            SoundFX.stopAmbient();
            SoundFX.stopAll();
            SoundFX.suspend();
            return;
        }
        iniciarAudioHabilitado();
    });
    window.addEventListener("pagehide", () => {
        SoundFX.stopAmbient();
        SoundFX.stopAll();
        SoundFX.suspend();
    });
    window.addEventListener("pageshow", iniciarAudioHabilitado);

    iniciarAudioHabilitado();
}

// ========================================================
// HELPERS DE ESCAPADO
// ========================================================

function escapar(texto) {
    return String(texto ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function escaparAttr(texto) {
    return String(texto ?? "")
        .replace(/\\/g, "\\\\")
        .replace(/'/g, "\\'")
        .replace(/"/g, "&quot;")
        .replace(/\r?\n/g, " ");
}


// ========================================================
// ARRANQUE CONTROLADO DE LA APLICACIÓN
// ========================================================
if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", inicializarAplicacion, { once: true });
} else {
    inicializarAplicacion();
}


// ========================================================
// MIS PLANES — SNAPSHOTS PERSISTENTES DEL ITINERARIO
// ========================================================
const SAVED_PLANS_STORAGE_KEY = "iguazu-assist-saved-plans";
const SAVED_PLANS_LIMIT = 20;

function clonarPlanSeguro(valor) {
    try {
        return JSON.parse(JSON.stringify(valor ?? null));
    } catch (error) {
        console.info("No se pudo clonar el plan.", error);
        return null;
    }
}

function obtenerPlanesGuardados() {
    if (Array.isArray(AppState.savedPlans)) return AppState.savedPlans;
    try {
        const raw = localStorage.getItem(SAVED_PLANS_STORAGE_KEY);
        if (!raw) {
            AppState.savedPlans = [];
            return AppState.savedPlans;
        }
        const parsed = JSON.parse(raw);
        AppState.savedPlans = Array.isArray(parsed) ? parsed.filter(plan => plan && plan.id) : [];
        return AppState.savedPlans;
    } catch (error) {
        console.info("Storage de planes inválido; se inicia vacío.", error);
        AppState.savedPlans = [];
        return AppState.savedPlans;
    }
}

function guardarColeccionPlanes(planes) {
    const coleccion = Array.isArray(planes) ? planes : [];
    AppState.savedPlans = coleccion;
    if (persistenceIndexedDBActive) {
        guardarPersistenciaIndexedDB("plans", coleccion).catch(() => {
            persistenceIndexedDBActive = false;
            try { localStorage.setItem(SAVED_PLANS_STORAGE_KEY, JSON.stringify(coleccion)); } catch (error) { console.info("No se pudo guardar la colección de planes.", error); }
        });
        return true;
    }
    try {
        localStorage.setItem(SAVED_PLANS_STORAGE_KEY, JSON.stringify(coleccion));
        return true;
    } catch (error) {
        console.info("No se pudo guardar la colección de planes.", error);
        mostrarToast("⚠️ No se pudo guardar el plan en este dispositivo");
        return false;
    }
}

function obtenerPlanPorId(id) {
    return obtenerPlanesGuardados().find(plan => String(plan.id) === String(id)) || null;
}

function generarIdPlan() {
    return `plan-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function crearSnapshotPlanActual() {
    if (typeof itinerarioActual === "undefined" || !Array.isArray(itinerarioActual) || !itinerarioActual.length) return null;
    const contexto = clonarPlanSeguro(typeof itinerarioContexto !== "undefined" ? itinerarioContexto : {});
    const actividades = clonarPlanSeguro(itinerarioActual);
    if (!contexto || !actividades) return null;
    const ahora = new Date().toISOString();
    const existente = AppState.currentPlanId ? obtenerPlanPorId(AppState.currentPlanId) : null;
    const intereses = contexto.intereses || (contexto.interes ? [contexto.interes] : []);
    const tituloBase = intereses.map(item => String(item).replace(/_/g, " ")).join(" + ") || "Itinerario personalizado";
    return {
        id: existente?.id || generarIdPlan(),
        createdAt: existente?.createdAt || ahora,
        updatedAt: ahora,
        titulo: existente?.titulo || `Iguazú · ${tituloBase}`,
        duracion: contexto.tiempo || "Medio día",
        presupuesto: contexto.presupuesto || "medio",
        preferencias: clonarPlanSeguro({ intereses, compania: contexto.compania, tiempo: contexto.tiempo, presupuesto: contexto.presupuesto }),
        contexto: contexto,
        actividades: actividades,
        actividadIds: actividades.map(item => item?.id).filter(id => id != null),
        horarios: clonarPlanSeguro(contexto.optimizacionRuta?.trazado || []),
        origenCoords: clonarPlanSeguro(contexto.origenCoords || contexto.contextoPlan?.origenCoords || null),
        clima: clonarPlanSeguro(contexto.contextoPlan?.clima || contexto.contextoAhora?.clima || null)
    };
}

function guardarPlan(plan) {
    if (!plan?.id) return false;
    const planes = obtenerPlanesGuardados();
    const index = planes.findIndex(item => String(item.id) === String(plan.id));
    if (index < 0 && planes.length >= SAVED_PLANS_LIMIT) {
        mostrarToast(`⚠️ Llegaste al límite de ${SAVED_PLANS_LIMIT} planes. Eliminá uno para guardar otro.`);
        return false;
    }
    if (index >= 0) planes[index] = plan;
    else planes.unshift(plan);
    if (!guardarColeccionPlanes(planes)) return false;
    AppState.currentPlanId = plan.id;
    renderizarPlanesGuardados();
    return true;
}

function actualizarPlan(plan) {
    if (!plan?.id) return false;
    const planes = obtenerPlanesGuardados();
    const index = planes.findIndex(item => String(item.id) === String(plan.id));
    if (index < 0) return guardarPlan(plan);
    planes[index] = plan;
    if (!guardarColeccionPlanes(planes)) return false;
    renderizarPlanesGuardados();
    return true;
}

function eliminarPlan(id) {
    const plan = obtenerPlanPorId(id);
    if (!plan) return;
    if (!window.confirm(`¿Eliminar “${plan.titulo || "este plan"}”?`)) return;
    const restantes = obtenerPlanesGuardados().filter(item => String(item.id) !== String(id));
    if (guardarColeccionPlanes(restantes)) {
        if (String(AppState.currentPlanId) === String(id)) AppState.currentPlanId = null;
        renderizarPlanesGuardados();
        mostrarToast("🗑️ Plan eliminado");
    }
}

function formatearFechaPlan(iso) {
    const fecha = new Date(iso);
    if (!Number.isFinite(fecha.getTime())) return "Fecha no disponible";
    return fecha.toLocaleDateString("es-AR", { day: "numeric", month: "short", year: "numeric" });
}

function renderizarPlanesGuardados() {
    const lista = document.querySelector("#saved-plans-list");
    const contador = document.querySelector("#saved-plans-count");
    if (!lista) return;
    const planes = obtenerPlanesGuardados();
    if (contador) contador.textContent = `${planes.length} ${planes.length === 1 ? "plan" : "planes"}`;
    if (!planes.length) {
        lista.innerHTML = `<div class="saved-plans-empty">Todavía no guardaste itinerarios. Generá un plan y elegí <strong>Guardar plan</strong>.</div>`;
        return;
    }
    lista.innerHTML = planes.map(plan => {
        const cantidad = Array.isArray(plan.actividades) ? plan.actividades.length : 0;
        const presupuesto = plan.presupuesto || plan.preferencias?.presupuesto || "—";
        return `<article class="saved-plan-card">
            <div class="saved-plan-main">
                <span class="saved-plan-title">🌴 ${escapar(plan.titulo || "Plan en Iguazú")}</span>
                <span class="saved-plan-meta">${cantidad} ${cantidad === 1 ? "actividad" : "actividades"} · ${escapar(plan.duracion || "Duración no indicada")} · ${escapar(presupuesto)} · Creado ${formatearFechaPlan(plan.createdAt)}</span>
                ${plan.updatedAt && plan.updatedAt !== plan.createdAt ? `<span class="saved-plan-meta">Actualizado ${formatearFechaPlan(plan.updatedAt)}</span>` : ""}
            </div>
            <div class="saved-plan-actions">
                <button class="btn-card-action primary" type="button" onclick="abrirPlanGuardado('${escaparAttr(plan.id)}')">Abrir plan</button>
                <button class="btn-card-action" type="button" onclick="eliminarPlan('${escaparAttr(plan.id)}')">Eliminar</button>
            </div>
        </article>`;
    }).join("");
}

function guardarPlanActual() {
    const snapshot = crearSnapshotPlanActual();
    if (!snapshot) {
        mostrarToast("⚠️ Primero generá un itinerario válido");
        return;
    }
    const actualizado = Boolean(AppState.currentPlanId && obtenerPlanPorId(AppState.currentPlanId));
    const ok = actualizado ? actualizarPlan(snapshot) : guardarPlan(snapshot);
    if (ok) {
        if (typeof SoundFX !== "undefined") SoundFX.play("plan");
        mostrarToast(actualizado ? "✅ Cambios guardados en Mis planes" : "✅ Plan guardado en Mis planes");
        if (typeof renderizarItinerario === "function") {
            const contextoPlan = itinerarioContexto.contextoPlan || itinerarioContexto.ahora || {};
            const paraManana = Number.isFinite(Number(itinerarioContexto.ahora?.diaSemana)) && Number.isFinite(Number(contextoPlan.diaSemana)) && Number(itinerarioContexto.ahora.diaSemana) !== Number(contextoPlan.diaSemana);
            renderizarItinerario(itinerarioActual, itinerarioActual.length, paraManana);
        }
    }
}

function abrirPlanGuardado(id) {
    const plan = obtenerPlanPorId(id);
    if (!plan || !Array.isArray(plan.actividades) || !plan.actividades.length) {
        mostrarToast("⚠️ Este plan no tiene actividades recuperables");
        return;
    }
    const contexto = clonarPlanSeguro(plan.contexto || {});
    const actividades = clonarPlanSeguro(plan.actividades);
    if (!contexto || !actividades) return;
    itinerarioContexto = contexto;
    itinerarioActual = actividades;
    AppState.currentPlanId = plan.id;
    AppState.interes = contexto.interes || contexto.intereses?.[0] || "naturaleza";
    AppState.tiempo = contexto.tiempo || "medio día";
    AppState.compania = contexto.compania || "solo";
    AppState.presupuesto = contexto.presupuesto || "medio";
    if (contexto.origenCoords) AppState.userCoords = clonarPlanSeguro(contexto.origenCoords);
    if (contexto.contextoPlan?.clima && typeof climaActual !== "undefined") climaActual = clonarPlanSeguro(contexto.contextoPlan.clima);
    if (typeof sincronizarOpcionesPlanificador === "function") sincronizarOpcionesPlanificador(contexto);
    mostrarSeccion("planner");
    renderizarItinerario(itinerarioActual, itinerarioActual.length, false);
    renderizarPlanesGuardados();
    mostrarToast("📅 Plan recuperado");
}

window.obtenerPlanesGuardados = obtenerPlanesGuardados;
window.guardarPlan = guardarPlan;
window.actualizarPlan = actualizarPlan;
window.eliminarPlan = eliminarPlan;
window.obtenerPlanPorId = obtenerPlanPorId;
window.renderizarPlanesGuardados = renderizarPlanesGuardados;
window.guardarPlanActual = guardarPlanActual;
window.abrirPlanGuardado = abrirPlanGuardado;


function sincronizarOpcionesPlanificador(contexto = {}) {
    const intereses = Array.isArray(contexto.intereses) && contexto.intereses.length
        ? contexto.intereses
        : [contexto.interes || AppState.interes || "naturaleza"];
    document.querySelectorAll(".planner-option").forEach(option => {
        const selected = intereses.includes(option.dataset.interest);
        option.classList.toggle("selected", selected);
        option.setAttribute("aria-pressed", String(selected));
    });
    [[".time-option", "time", contexto.tiempo], [".traveler-option", "traveler", contexto.compania], [".budget-option", "budget", contexto.presupuesto]].forEach(([selector, key, value]) => {
        document.querySelectorAll(selector).forEach(option => {
            const selected = String(option.dataset[key]) === String(value);
            option.classList.toggle("selected", selected);
            option.setAttribute("aria-pressed", String(selected));
        });
    });
}
window.sincronizarOpcionesPlanificador = sincronizarOpcionesPlanificador;


if (document.readyState !== "loading") renderizarPlanesGuardados();
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", renderizarPlanesGuardados, { once: true });
