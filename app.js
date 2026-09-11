/**
 * IGUAZÚ ASSIST — Controlador Principal de Interfaz, Navegación, Geolocalización y Efectos de Sonido
 */

const CLAVE_AUDIO_ACTIVO = "iguazuAssist.audioActivo";
const CLAVE_VOLUMEN_AMBIENTE = "iguazuAssist.volumenAmbiente";

function leerPreferenciaLocal(clave, valorPorDefecto) {
    try {
        const valor = localStorage.getItem(clave);
        return valor === null ? valorPorDefecto : valor;
    } catch (error) {
        return valorPorDefecto;
    }
}

function guardarPreferenciaLocal(clave, valor) {
    try {
        localStorage.setItem(clave, String(valor));
    } catch (error) {
        // La aplicación continúa normalmente si el almacenamiento está bloqueado.
    }
}

// ========================================================
// ESTADO GLOBAL DE LA APLICACIÓN
// ========================================================
const AppState = {
    interes: "naturaleza",
    tiempo: "medio día",
    compania: "solo",
    presupuesto: "medio",
    lastView: "home", // 'home' | 'results' | 'planner' | 'nearby' | 'surprise'
    userCoords: null,
    gpsActive: false,
    audioActivo: leerPreferenciaLocal(CLAVE_AUDIO_ACTIVO, "false") === "true",
    volumenAmbiente: Math.min(100, Math.max(0, Number(leerPreferenciaLocal(CLAVE_VOLUMEN_AMBIENTE, "24")) || 24)),
    filtroCercaMio: "todos"
};

// ========================================================
// SISTEMA DE EFECTOS DE SONIDO CORTOS (WEB AUDIO API)
// ========================================================
const SoundFX = {
    audioCtx: null,
    activeOscillators: [],
    ambientNodes: [],
    ambientGain: null,
    ambientBirdTimer: null,
    ambientActive: false,

    init() {
        if (!this.audioCtx && (window.AudioContext || window.webkitAudioContext)) {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            this.audioCtx = new AudioContext();
        }
        if (this.audioCtx && this.audioCtx.state === "suspended") {
            this.audioCtx.resume();
        }
    },

    stopAll() {
        this.activeOscillators.forEach(osc => {
            try { osc.stop(); osc.disconnect(); } catch (e) {}
        });
        this.activeOscillators = [];
    },

    getAmbientGainValue() {
        return (AppState.volumenAmbiente / 100) * 0.055;
    },

    setAmbientVolume(valor) {
        AppState.volumenAmbiente = Math.min(100, Math.max(0, Number(valor) || 0));
        guardarPreferenciaLocal(CLAVE_VOLUMEN_AMBIENTE, AppState.volumenAmbiente);
        if (this.ambientGain && this.audioCtx) {
            this.ambientGain.gain.setTargetAtTime(this.getAmbientGainValue(), this.audioCtx.currentTime, 0.08);
        }
    },

    playAmbientBird() {
        if (!AppState.audioActivo || !this.ambientActive || !this.audioCtx) return;
        const ctx = this.audioCtx;
        const now = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(1680, now);
        osc.frequency.exponentialRampToValueAtTime(2450, now + 0.1);
        osc.frequency.exponentialRampToValueAtTime(1850, now + 0.24);
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(this.getAmbientGainValue() * 0.7, now + 0.025);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.32);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.34);
    },

    startAmbient() {
        if (!AppState.audioActivo || this.ambientActive) return;

        try {
            this.init();
            if (!this.audioCtx) return;

            const ctx = this.audioCtx;
            const buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
            const datos = buffer.getChannelData(0);
            let muestraAnterior = 0;
            for (let i = 0; i < datos.length; i += 1) {
                const ruido = (Math.random() * 2) - 1;
                muestraAnterior = (muestraAnterior * 0.985) + (ruido * 0.015);
                datos[i] = muestraAnterior;
            }

            const fuenteAgua = ctx.createBufferSource();
            const filtroAgua = ctx.createBiquadFilter();
            const filtroSelva = ctx.createBiquadFilter();
            const gananciaAgua = ctx.createGain();
            const gananciaSelva = ctx.createGain();
            this.ambientGain = ctx.createGain();

            fuenteAgua.buffer = buffer;
            fuenteAgua.loop = true;
            filtroAgua.type = "lowpass";
            filtroAgua.frequency.value = 950;
            filtroSelva.type = "bandpass";
            filtroSelva.frequency.value = 260;
            filtroSelva.Q.value = 0.7;
            gananciaAgua.gain.value = 0.72;
            gananciaSelva.gain.value = 0.28;
            this.ambientGain.gain.value = this.getAmbientGainValue();

            fuenteAgua.connect(filtroAgua);
            filtroAgua.connect(gananciaAgua);
            fuenteAgua.connect(filtroSelva);
            filtroSelva.connect(gananciaSelva);
            gananciaAgua.connect(this.ambientGain);
            gananciaSelva.connect(this.ambientGain);
            this.ambientGain.connect(ctx.destination);
            fuenteAgua.start();

            this.ambientNodes = [fuenteAgua, filtroAgua, filtroSelva, gananciaAgua, gananciaSelva, this.ambientGain];
            this.ambientActive = true;
            this.ambientBirdTimer = setInterval(() => this.playAmbientBird(), 18000);
        } catch (error) {
            console.info("Ambiente sonoro no disponible:", error);
            this.stopAmbient();
        }
    },

    stopAmbient() {
        if (this.ambientBirdTimer) clearInterval(this.ambientBirdTimer);
        this.ambientBirdTimer = null;
        this.ambientNodes.forEach(node => {
            try {
                if (typeof node.stop === "function") node.stop();
                node.disconnect();
            } catch (error) {}
        });
        this.ambientNodes = [];
        this.ambientGain = null;
        this.ambientActive = false;
    },

    play(effectName) {
        // Si el usuario tiene el sonido desactivado, no reproducir nada
        if (!AppState.audioActivo) return;

        try {
            this.init();
            if (!this.audioCtx) return;
            if (!this.ambientActive) this.startAmbient();
            this.stopAll();

            const ctx = this.audioCtx;
            const now = ctx.currentTime;

            if (effectName === "bird" || effectName === "cerca") {
                // Canto breve y sutil de pájaro (dos trinos suaves, ~0.35s)
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = "sine";
                osc.frequency.setValueAtTime(1760, now);
                osc.frequency.exponentialRampToValueAtTime(2640, now + 0.12);
                osc.frequency.exponentialRampToValueAtTime(1975, now + 0.28);
                gain.gain.setValueAtTime(0, now);
                gain.gain.linearRampToValueAtTime(0.035, now + 0.03);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.start(now);
                osc.stop(now + 0.36);
                this.activeOscillators.push(osc);

            } else if (effectName === "shimmer" || effectName === "sorpresa") {
                // Arpegio armónico selvático suave (~0.7s)
                const freqs = [1046.5, 1318.5, 1567.98, 1975.5];
                freqs.forEach((f, idx) => {
                    const osc = ctx.createOscillator();
                    const gain = ctx.createGain();
                    osc.type = "sine";
                    osc.frequency.setValueAtTime(f, now + idx * 0.07);
                    gain.gain.setValueAtTime(0, now + idx * 0.07);
                    gain.gain.linearRampToValueAtTime(0.025, now + idx * 0.07 + 0.02);
                    gain.gain.exponentialRampToValueAtTime(0.0005, now + idx * 0.07 + 0.55);
                    osc.connect(gain);
                    gain.connect(ctx.destination);
                    osc.start(now + idx * 0.07);
                    osc.stop(now + idx * 0.07 + 0.6);
                    this.activeOscillators.push(osc);
                });

            } else if (effectName === "plan" || effectName === "wood") {
                // Acorde cálido de marimba/madera natural (~0.5s)
                const freqs = [523.25, 659.25, 783.99];
                freqs.forEach((f, idx) => {
                    const osc = ctx.createOscillator();
                    const gain = ctx.createGain();
                    osc.type = "triangle";
                    osc.frequency.setValueAtTime(f, now + idx * 0.05);
                    gain.gain.setValueAtTime(0, now + idx * 0.05);
                    gain.gain.linearRampToValueAtTime(0.03, now + idx * 0.05 + 0.02);
                    gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.05 + 0.4);
                    osc.connect(gain);
                    gain.connect(ctx.destination);
                    osc.start(now + idx * 0.05);
                    osc.stop(now + idx * 0.05 + 0.45);
                    this.activeOscillators.push(osc);
                });

            } else if (effectName === "drop" || effectName === "cambio") {
                // Gota de agua sutil para cambio o selección (~0.2s)
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = "sine";
                osc.frequency.setValueAtTime(800, now);
                osc.frequency.exponentialRampToValueAtTime(1600, now + 0.06);
                osc.frequency.exponentialRampToValueAtTime(600, now + 0.18);
                gain.gain.setValueAtTime(0, now);
                gain.gain.linearRampToValueAtTime(0.035, now + 0.02);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.start(now);
                osc.stop(now + 0.22);
                this.activeOscillators.push(osc);
            }
        } catch (e) {
            console.log("Audio FX no disponible:", e);
        }
    }
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
        document.body.appendChild(toast);
    }
    toast.innerText = mensaje;
    toast.classList.add("visible");
    setTimeout(() => {
        toast.classList.remove("visible");
    }, 2200);
}

// ========================================================
// INICIALIZACIÓN AL CARGAR EL DOM
// ========================================================
document.addEventListener("DOMContentLoaded", () => {
    initNavegacion();
    initCategorias();
    initPlanificadorOpciones();
    initCercaMio();
    initSorprendeme();
    initControlSonido();
});

// ========================================================
// NAVEGACIÓN Y GESTIÓN DE VISTAS CON MEMORIA DE ORIGEN
// ========================================================

function initNavegacion() {
    const btnPlan = document.querySelector("#btn-open-planner");
    if (btnPlan) {
        btnPlan.addEventListener("click", () => {
            mostrarSeccion("planner");
            SoundFX.play("plan");
        });
    }

    const btnNearby = document.querySelector("#btn-open-nearby");
    if (btnNearby) {
        btnNearby.addEventListener("click", () => {
            abrirCercaMio();
            SoundFX.play("bird");
        });
    }

    const btnSurprise = document.querySelector("#btn-open-surprise");
    if (btnSurprise) {
        btnSurprise.addEventListener("click", () => {
            abrirSorprendeme();
            SoundFX.play("shimmer");
        });
    }
}

function mostrarSeccion(seccionId) {
    const hero = document.querySelector("#hero-section");
    const assistant = document.querySelector("#assistant-banner");
    const categories = document.querySelector("#categories-section");
    const results = document.querySelector("#results");
    const planner = document.querySelector("#planner");
    const detail = document.querySelector("#detail");
    const nearby = document.querySelector("#nearby");
    const surprise = document.querySelector("#surprise");

    // Si vamos a abrir el detalle, guardamos cuál era la vista anterior exacta
    if (seccionId === "detail") {
        if (!planner.classList.contains("hidden")) {
            AppState.lastView = "planner";
        } else if (!results.classList.contains("hidden")) {
            AppState.lastView = "results";
        } else if (!nearby.classList.contains("hidden")) {
            AppState.lastView = "nearby";
        } else if (!surprise.classList.contains("hidden")) {
            AppState.lastView = "surprise";
        } else {
            AppState.lastView = "home";
        }
    }

    // Ocultar todas las vistas
    hero.classList.add("hidden");
    assistant.classList.add("hidden");
    categories.classList.add("hidden");
    results.classList.add("hidden");
    planner.classList.add("hidden");
    detail.classList.add("hidden");
    nearby.classList.add("hidden");
    surprise.classList.add("hidden");

    // Mostrar la vista solicitada
    if (seccionId === "home") {
        hero.classList.remove("hidden");
        assistant.classList.remove("hidden");
        categories.classList.remove("hidden");
        AppState.lastView = "home";
    } else if (seccionId === "planner") {
        planner.classList.remove("hidden");
        window.scrollTo({ top: 0, behavior: "smooth" });
    } else if (seccionId === "results") {
        results.classList.remove("hidden");
        window.scrollTo({ top: 0, behavior: "smooth" });
    } else if (seccionId === "detail") {
        detail.classList.remove("hidden");
        window.scrollTo({ top: 0, behavior: "smooth" });
    } else if (seccionId === "nearby") {
        nearby.classList.remove("hidden");
        window.scrollTo({ top: 0, behavior: "smooth" });
    } else if (seccionId === "surprise") {
        surprise.classList.remove("hidden");
        window.scrollTo({ top: 0, behavior: "smooth" });
    }
}

function volverInicio() {
    mostrarSeccion("home");
    SoundFX.play("drop");
}

function volverAtras() {
    const detail = document.querySelector("#detail");
    const planner = document.querySelector("#planner");
    const results = document.querySelector("#results");
    const nearby = document.querySelector("#nearby");
    const surprise = document.querySelector("#surprise");

    SoundFX.play("drop");

    // Si estamos en la ficha de detalle, volvemos a la vista previa que originó la visita
    if (!detail.classList.contains("hidden")) {
        if (AppState.lastView === "planner") {
            mostrarSeccion("planner");
        } else if (AppState.lastView === "results") {
            mostrarSeccion("results");
        } else if (AppState.lastView === "nearby") {
            mostrarSeccion("nearby");
        } else if (AppState.lastView === "surprise") {
            mostrarSeccion("surprise");
        } else {
            mostrarSeccion("home");
        }
        return;
    }

    // Desde cualquier sección secundaria, volvemos al inicio
    if (!planner.classList.contains("hidden") ||
        !results.classList.contains("hidden") ||
        !nearby.classList.contains("hidden") ||
        !surprise.classList.contains("hidden")) {
        volverInicio();
    }
}

// ========================================================
// GEOLOCALIZACIÓN Y DISTANCIA (FÓRMULA DE HAVERSINE)
// ========================================================

function calcularDistanciaKm(lat1, lon1, lat2, lon2) {
    const R = 6371; // Radio de la Tierra en km
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

function formatearDistancia(km) {
    if (km < 1) {
        return `a ${Math.round(km * 1000)} m`;
    }
    return `a ${km.toFixed(1)} km`;
}

function calcularEstimacionTraslado(km) {
    if (km <= 1.5) {
        const mins = Math.max(1, Math.round(km * 12));
        return `<span class="tag-badge walk-badge">🚶 ~${mins} min a pie</span>`;
    } else {
        // Entre 1.5 km y 10 km (≤10 km es el límite de Cerca Tuyo)
        const mins = Math.max(3, Math.round(km * 1.6 + 2));
        return `<span class="tag-badge car-badge">🚗 ~${mins} min en auto</span>`;
    }
}

function obtenerUbicacionUsuario(onSuccess) {
    const gpsStatus = document.querySelector("#nearby-gps-status");

    if ("geolocation" in navigator) {
        if (gpsStatus) {
            gpsStatus.innerText = "🔍 Localizando GPS…";
            gpsStatus.className = "gps-pill searching";
        }

        navigator.geolocation.getCurrentPosition(
            (position) => {
                AppState.userCoords = {
                    lat: position.coords.latitude,
                    lng: position.coords.longitude
                };
                AppState.gpsActive = true;
                const accuracyM = position.coords.accuracy ? Math.round(position.coords.accuracy) : null;
                const precisionLabel = accuracyM ? ` (±${accuracyM}m)` : "";
                if (gpsStatus) {
                    gpsStatus.innerText = `📍 GPS Activo${precisionLabel}`;
                    gpsStatus.className = "gps-pill active";
                }
                // Mostrar precisión real en el toast, sin adjetivos sobre la calidad
                const toastPrecision = accuracyM ? ` · precisión ±${accuracyM} m` : "";
                mostrarToast(`📍 Ubicación GPS obtenida${toastPrecision}`);
                if (onSuccess) onSuccess();
            },
            (error) => {
                console.log("Ubicación rechazada o no disponible, usando Centro de Iguazú:", error.message);
                AppState.userCoords = CONFIG_APP.coordenadasCentro;
                AppState.gpsActive = false;
                if (gpsStatus) {
                    gpsStatus.innerText = "📍 Ref: Plaza San Martín (Centro)";
                    gpsStatus.className = "gps-pill fallback";
                }
                mostrarToast("📍 Usando Centro de Puerto Iguazú como referencia");
                if (onSuccess) onSuccess();
            },
            { timeout: 10000, enableHighAccuracy: true, maximumAge: 30000 }
        );
    } else {
        AppState.userCoords = CONFIG_APP.coordenadasCentro;
        AppState.gpsActive = false;
        if (gpsStatus) {
            gpsStatus.innerText = "📍 Ref: Plaza San Martín (Centro)";
            gpsStatus.className = "gps-pill fallback";
        }
        if (onSuccess) onSuccess();
    }
}

// ========================================================
// MÓDULO CERCA MÍO (PROXIMIDAD & DISPONIBILIDAD EN TIEMPO REAL)
// ========================================================

function initCercaMio() {
    // Filtros por botón/pill
    const filterPills = document.querySelectorAll(".filter-pill[data-nearby-filter]");
    filterPills.forEach(pill => {
        pill.addEventListener("click", function() {
            filterPills.forEach(p => p.classList.remove("active"));
            this.classList.add("active");
            AppState.filtroCercaMio = this.dataset.nearbyFilter;
            renderizarCercaMio(AppState.filtroCercaMio);
            SoundFX.play("drop");
        });
    });

    // Botón para refrescar la posición GPS
    const btnRefreshGps = document.querySelector("#btn-refresh-gps");
    if (btnRefreshGps) {
        btnRefreshGps.addEventListener("click", () => {
            SoundFX.play("cambio");
            obtenerUbicacionUsuario(() => {
                renderizarCercaMio(AppState.filtroCercaMio || "todos");
            });
        });
    }
}

function abrirCercaMio() {
    mostrarSeccion("nearby");
    if (!AppState.userCoords) {
        obtenerUbicacionUsuario(() => {
            renderizarCercaMio(AppState.filtroCercaMio || "todos");
        });
    } else {
        renderizarCercaMio(AppState.filtroCercaMio || "todos");
    }
}

function renderizarCercaMio(categoriaFiltro = "todos") {
    const lista = document.querySelector("#nearby-list");
    if (!lista) return;

    const coords = AppState.userCoords || CONFIG_APP.coordenadasCentro;
    const now = new Date();
    const horaActual = now.getHours() + (now.getMinutes() / 60);
    const diaActual = now.getDay();

    // 1. Calcular distancias y disponibilidad SOLO para lugares con coordenadas y a ≤10 km
    //    Los lugares de más de 10 km siguen en la base de datos y son accesibles
    //    desde categorías, planificador e itinerarios, pero NO aparecen en Cerca Tuyo.
    const LIMITE_CERCA_KM = 10;
    const lugaresConDistancia = lugaresReales
        .filter(l => l.coordenadas && typeof l.coordenadas.lat === "number")
        .map(lugar => {
            const distancia = calcularDistanciaKm(coords.lat, coords.lng, lugar.coordenadas.lat, lugar.coordenadas.lng);
            const disponibilidad = typeof obtenerEstadoDisponibilidad === "function"
                ? obtenerEstadoDisponibilidad(lugar, horaActual, diaActual)
                : { abierto: estaAbiertoEnHorario(lugar, horaActual, diaActual), badgeHtml: "" };
            return { lugar, distancia, disponibilidad };
        })
        .filter(item => item.distancia <= LIMITE_CERCA_KM); // Excluir lugares lejanos

    // 2. Ordenar de menor a mayor distancia (desde el más cercano)
    lugaresConDistancia.sort((a, b) => a.distancia - b.distancia);

    // 3. Aplicar filtro dinámico
    let filtrados = lugaresConDistancia;
    if (categoriaFiltro === "abiertos") {
        filtrados = lugaresConDistancia.filter(item => item.disponibilidad.abierto === true);
    } else if (categoriaFiltro === "caminando") {
        filtrados = lugaresConDistancia.filter(item => item.distancia <= 1.5);
    } else if (categoriaFiltro === "ferias_compras") {
        filtrados = lugaresConDistancia.filter(item => 
            item.lugar.categoria === "compras" ||
            (item.lugar.intereses && item.lugar.intereses.includes("compras")) ||
            (item.lugar.tipo && item.lugar.tipo.toLowerCase().includes("feria")) ||
            (item.lugar.etiquetas && item.lugar.etiquetas.some(e => e.toLowerCase().includes("feria") || e.toLowerCase().includes("compras")))
        );
    } else if (categoriaFiltro === "gratuitos") {
        filtrados = lugaresConDistancia.filter(item => 
            item.lugar.gratuito === true ||
            (item.lugar.precio && (
                item.lugar.precio.toLowerCase().includes("gratuito") ||
                item.lugar.precio.toLowerCase().includes("gratis") ||
                item.lugar.precio.toLowerCase().includes("libre")
            ))
        );
    } else if (categoriaFiltro !== "todos") {
        filtrados = lugaresConDistancia.filter(item => 
            item.lugar.categoria === categoriaFiltro ||
            (item.lugar.intereses && item.lugar.intereses.includes(categoriaFiltro))
        );
    }

    lista.innerHTML = "";

    if (filtrados.length === 0) {
        lista.innerHTML = `
            <div class="place-card-item" style="text-align:center; padding: 32px 20px;">
                <div style="font-size: 36px; margin-bottom: 8px;">🔍</div>
                <h4 style="color:var(--color-primary-dark); margin-bottom: 6px;">No hay opciones para este filtro</h4>
                <p style="font-size:13.5px; color:var(--color-text-muted);">Probá seleccionando "✨ Todos" o ampliando el criterio de búsqueda.</p>
            </div>
        `;
        return;
    }

    filtrados.forEach(({ lugar, distancia, disponibilidad }) => {
        const badgeDistancia = `<span class="distance-badge">📍 ${formatearDistancia(distancia)}</span>`;
        const badgeTraslado = calcularEstimacionTraslado(distancia);
        const badgeAbierto = disponibilidad.badgeHtml || (disponibilidad.abierto
            ? `<span class="open-badge open">🟢 Abierto ahora</span>`
            : `<span class="open-badge closed">🔴 Cerrado</span>`);
        
        let badgeGasto = "";
        if (lugar.gratuito) {
            badgeGasto = `<span class="tag-badge free-badge">🆓 Gratuito</span>`;
        } else if (lugar.nivelGasto === "economico") {
            badgeGasto = `<span class="tag-badge">💰 Económico</span>`;
        } else if (lugar.nivelGasto === "medio") {
            badgeGasto = `<span class="tag-badge">💵 Medio</span>`;
        } else {
            badgeGasto = `<span class="tag-badge">💎 Alto</span>`;
        }

        const badgeDestacado = lugar.destacado ? `<span class="badge-featured">⭐ Destacado</span>` : "";
        const queryMaps = encodeURIComponent(`${lugar.nombre}, ${lugar.direccion || lugar.ubicacion}`);

        lista.innerHTML += `
            <article class="place-card-item">
                <div class="place-card-item-icon">
                    ${lugar.icono}
                </div>
                <div class="place-card-item-info">
                    <h3>
                        ${escapar(lugar.nombre)}
                        ${badgeDestacado}
                    </h3>
                    <p>${escapar(lugar.descripcion)}</p>
                    <div class="tags-row" style="margin-bottom: 10px;">
                        ${badgeDistancia}
                        ${badgeTraslado}
                        ${badgeAbierto}
                        ${badgeGasto}
                        <span class="tag-badge">🕐 ${escapar(lugar.horario)}</span>
                    </div>
                    <div class="plan-card-actions">
                        <button class="btn-card-action primary" onclick="mostrarDetalle('${escaparAttr(lugar.nombre)}')">
                            ⭐ Ver detalle
                        </button>
                        <a class="btn-card-action" href="https://www.google.com/maps/search/?api=1&query=${queryMaps}" target="_blank" rel="noopener noreferrer">
                            📍 Cómo llegar
                        </a>
                    </div>
                </div>
            </article>
        `;
    });
}

// ========================================================
// MÓDULO SORPRÉNDEME (1-CLIC)
// ========================================================

function initSorprendeme() {
    // Inicialización de vista
}

function abrirSorprendeme() {
    mostrarSeccion("surprise");
    if (typeof window.generarSorpresa === "function") {
        window.generarSorpresa();
    }
}

// ========================================================
// CATEGORÍAS
// ========================================================

const CATEGORIAS_CONFIG = {
    naturaleza: { icono: "🌿", titulo: "Naturaleza", desc: "Cataratas, selva virgen, cascadas y refugios de fauna." },
    comida: { icono: "🍽️", titulo: "Dónde Comer", desc: "Pescados de río, parrillas argentinas y cocina regional." },
    movilidad: { icono: "🚗", titulo: "Movilidad & Traslados", desc: "Colectivos al Parque, taxis oficiales y traslados al Aeropuerto." },
    actividades: { icono: "🎭", titulo: "Qué Hacer", desc: "Hito Tres Fronteras, paseos culturales, compras y excursiones." },
    alojamiento: { icono: "🏨", titulo: "Alojamiento", desc: "Hoteles céntricos, resorts de selva y lodges con spa." },
    noche: { icono: "🌙", titulo: "De Noche", desc: "Paseos de luna llena, shows de agua y bares temáticos." }
};

function initCategorias() {
    const categoryCards = document.querySelectorAll(".category-card");

    categoryCards.forEach(card => {
        card.addEventListener("click", () => {
            const catKey = card.dataset.category;
            const config = CATEGORIAS_CONFIG[catKey] || { icono: "🌴", titulo: "Explorar", desc: "Lugares de Iguazú" };
            const lugares = obtenerLugaresPorCategoria(catKey);

            mostrarResultadosCategoria(config.icono, config.titulo, config.desc, lugares);
            SoundFX.play("drop");
        });
    });
}

function mostrarResultadosCategoria(icono, titulo, descripcion, lugares) {
    document.querySelector("#results-icon").innerText = icono;
    document.querySelector("#results-title").innerText = titulo;
    document.querySelector("#results-description").innerText = descripcion;

    const lista = document.querySelector("#results-list");
    lista.innerHTML = "";

    if (!lugares || lugares.length === 0) {
        lista.innerHTML = `
            <div class="place-card-item" style="text-align:center; padding: 30px;">
                <p>No se encontraron lugares en esta categoría por el momento.</p>
            </div>
        `;
    } else {
        lugares.forEach(lugar => {
            const badgeDestacado = lugar.destacado ? `<span class="badge-featured">⭐ Destacado</span>` : "";
            const badgePromo = lugar.promocion ? `<span class="badge-promo">🏷️ ${escapar(lugar.promocion)}</span>` : "";
            const tagsHtml = (lugar.etiquetas || []).slice(0, 3).map(tag => `<span class="tag-badge">${escapar(tag)}</span>`).join("");
            const queryMaps = encodeURIComponent(`${lugar.nombre}, ${lugar.direccion || lugar.ubicacion}`);

            lista.innerHTML += `
                <article class="place-card-item">
                    <div class="place-card-item-icon">
                        ${lugar.icono}
                    </div>
                    <div class="place-card-item-info">
                        <h3>
                            ${escapar(lugar.nombre)}
                            ${badgeDestacado}
                            ${badgePromo}
                        </h3>
                        <p>${escapar(lugar.descripcion)}</p>
                        <div class="tags-row" style="margin-bottom: 10px;">
                            <span class="tag-badge">📍 ${escapar(lugar.ubicacion)}</span>
                            <span class="tag-badge">🕐 ${escapar(lugar.horario)}</span>
                            ${tagsHtml}
                        </div>
                        <div class="plan-card-actions">
                            <button class="btn-card-action primary" onclick="mostrarDetalle('${escaparAttr(lugar.nombre)}')">
                                ⭐ Ver detalle
                            </button>
                            <a class="btn-card-action" href="https://www.google.com/maps/search/?api=1&query=${queryMaps}" target="_blank" rel="noopener noreferrer">
                                📍 Cómo llegar
                            </a>
                        </div>
                    </div>
                </article>
            `;
        });
    }

    mostrarSeccion("results");
}

// ========================================================
// FORMULARIO DEL PLANIFICADOR: SINCRONIZACIÓN DE OPCIONES
// ========================================================

function initPlanificadorOpciones() {
    // Intereses (8 opciones)
    document.querySelectorAll(".planner-option").forEach(btn => {
        btn.addEventListener("click", function() {
            document.querySelectorAll(".planner-option").forEach(b => b.classList.remove("selected"));
            this.classList.add("selected");
            AppState.interes = this.dataset.interest;
            SoundFX.play("drop");
        });
    });

    // Tiempo (5 opciones)
    document.querySelectorAll(".time-option").forEach(btn => {
        btn.addEventListener("click", function() {
            document.querySelectorAll(".time-option").forEach(b => b.classList.remove("selected"));
            this.classList.add("selected");
            AppState.tiempo = this.dataset.time;
            SoundFX.play("drop");
        });
    });

    // Compañía (5 opciones)
    document.querySelectorAll(".traveler-option").forEach(btn => {
        btn.addEventListener("click", function() {
            document.querySelectorAll(".traveler-option").forEach(b => b.classList.remove("selected"));
            this.classList.add("selected");
            AppState.compania = this.dataset.traveler;
            SoundFX.play("drop");
        });
    });

    // Presupuesto (3 opciones: Económico, Medio, Alto)
    document.querySelectorAll(".budget-option").forEach(btn => {
        btn.addEventListener("click", function() {
            document.querySelectorAll(".budget-option").forEach(b => b.classList.remove("selected"));
            this.classList.add("selected");
            AppState.presupuesto = this.dataset.budget;
            SoundFX.play("drop");
        });
    });
}

// ========================================================
// FICHA DE DETALLE DE LUGAR
// ========================================================

function mostrarDetalle(nombreOLugar) {
    let lugar = null;
    if (typeof nombreOLugar === "string") {
        lugar = obtenerLugarPorIdentificador(nombreOLugar);
    } else {
        lugar = nombreOLugar;
    }

    if (!lugar) return;

    SoundFX.play("drop");

    document.querySelector("#detail-icon").innerText = lugar.icono;
    document.querySelector("#detail-title").innerText = lugar.nombre;
    document.querySelector("#detail-description").innerText = lugar.descripcion;
    document.querySelector("#detail-location").innerText = lugar.direccion || lugar.ubicacion;
    document.querySelector("#detail-hours").innerText = lugar.horario || "Consultar horarios";
    document.querySelector("#detail-price").innerText = lugar.precio || "Consultar tarifa";

    // Badges
    const badgesContainer = document.querySelector("#detail-badges");
    let badgesHtml = "";
    if (lugar.destacado) badgesHtml += `<span class="badge-featured">⭐ Destacado</span>`;
    if (lugar.promocion) badgesHtml += `<span class="badge-promo">🏷️ ${escapar(lugar.promocion)}</span>`;
    if (lugar.alAireLibre) {
        badgesHtml += `<span class="tag-badge">🌿 Al aire libre</span>`;
    } else {
        badgesHtml += `<span class="tag-badge">🏛️ Techado (Ideal Lluvia)</span>`;
    }
    badgesContainer.innerHTML = badgesHtml;

    // Botón de Google Maps
    const mapBtn = document.querySelector("#detail-map-btn");
    mapBtn.onclick = () => {
        let query = encodeURIComponent(`${lugar.nombre}, ${lugar.direccion || lugar.ubicacion}`);
        if (lugar.coordenadas && typeof lugar.coordenadas.lat === "number") {
            query = `${lugar.coordenadas.lat},${lugar.coordenadas.lng}`;
        }
        window.open(`https://www.google.com/maps/search/?api=1&query=${query}`, "_blank");
    };

    // Botones de Contacto (WhatsApp, Llamar, Web)
    const contactContainer = document.querySelector("#contact-buttons");
    let contactHtml = "";

    if (lugar.whatsapp && lugar.whatsapp !== "Consultar") {
        contactHtml += `
            <a class="contact-btn whatsapp" href="https://wa.me/${lugar.whatsapp}?text=${encodeURIComponent('Hola, los contacto desde Iguazú Assist.')}" target="_blank">
                💬 WhatsApp
            </a>
        `;
    }

    if (lugar.telefono && lugar.telefono !== "Consultar") {
        contactHtml += `
            <a class="contact-btn call" href="tel:${lugar.telefono}">
                📞 Llamar
            </a>
        `;
    }

    if (lugar.web && lugar.web !== "Consultar") {
        contactHtml += `
            <a class="contact-btn web" href="${lugar.web}" target="_blank" rel="noopener noreferrer">
                🌐 Sitio Web
            </a>
        `;
    }

    contactContainer.innerHTML = contactHtml;

    mostrarSeccion("detail");
}

// ========================================================
// CONTROL DE SONIDO (MUTED BY DEFAULT & EFECTOS CORTOS)
// ========================================================

function initControlSonido() {
    const audioBtn = document.querySelector("#audio-toggle");
    if (!audioBtn) return;

    const actualizarBoton = () => {
        audioBtn.innerText = AppState.audioActivo ? "🔊" : "🔇";
        audioBtn.classList.toggle("active", AppState.audioActivo);
        audioBtn.title = AppState.audioActivo
            ? "Ambiente y efectos activados (clic para silenciar)"
            : "Sonido silenciado (clic para activar)";
        audioBtn.setAttribute("aria-pressed", String(AppState.audioActivo));
    };

    actualizarBoton();

    audioBtn.addEventListener("click", () => {
        if (!AppState.audioActivo) {
            AppState.audioActivo = true;
            guardarPreferenciaLocal(CLAVE_AUDIO_ACTIVO, true);
            actualizarBoton();
            SoundFX.startAmbient();
            SoundFX.play("wood");
            mostrarToast("🔊 Ambiente de Misiones activado");
        } else {
            AppState.audioActivo = false;
            guardarPreferenciaLocal(CLAVE_AUDIO_ACTIVO, false);
            SoundFX.stopAll();
            SoundFX.stopAmbient();
            actualizarBoton();
            mostrarToast("🔇 Sonido desactivado");
        }
    });
}

// ========================================================
// HELPERS DE ESCAPADO
// ========================================================

function escapar(texto) {
    if (!texto) return "";
    return String(texto)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}

function escaparAttr(texto) {
    if (!texto) return "";
    return String(texto)
        .replace(/'/g, "\\'")
        .replace(/"/g, "&quot;");
}
