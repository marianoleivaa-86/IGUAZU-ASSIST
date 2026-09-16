/**
 * IGUAZÚ ASSIST — Motor de Recomendaciones y Planificador Inteligente Avanzado
 * 
 * Evalúa en tiempo real: clima (Open-Meteo), momento del día, horarios de apertura,
 * presupuesto, compañía (incluyendo niños), duración, alternativas y función Sorpréndeme.
 */

// ========================================================
// ESTADO DEL PLANIFICADOR Y CLIMA
// ========================================================
let climaActual = {
    estado: "cargando",
    descripcion: "Consultando clima…",
    temperatura: 25,
    lluvia: false,
    lluviaProxima: false,
    tormenta: false,
    icono: "🌤️",
    horas: [],
    actualizado: null,
    desdeCache: false
};

let itinerarioActual = [];
let itinerarioContexto = {};
let ultimaSorpresaId = null;
let itinerarioAdaptacion = { activa: false, nivel: "exacto", mensaje: "", criteriosRelajados: [] };
let ultimaSorpresaCategoria = null;

function planPlaceText(lugar, campo, fallback = "") {
    return window.I18n?.placeText(lugar, campo) || lugar?.[campo] || fallback;
}
let ultimaSorpresaTipo = null;
let sorpresasRecientesIds = [];
let sorpresasRecientesTipos = [];
let ultimoDiagnosticoSorpresa = null;
let estadoCircuitosRemoto = null;
let alertaLluviaMostrada = false;
let contextoTemporalPrueba = null;
const CLIMA_STORAGE_KEY = "iguazu-assist-weather";
const CLIMA_TTL_MS = 20 * 60 * 1000;
const URL_CLIMA_IGUAZU = "https://api.open-meteo.com/v1/forecast?latitude=-25.5972&longitude=-54.5786&current=temperature_2m,weather_code,precipitation&hourly=precipitation_probability,precipitation,weather_code&forecast_days=1&timezone=America%2FArgentina%2FBuenos_Aires";

const NIVELES_DE_GASTO = {
    economico: 1,
    medio: 2,
    alto: 3
};

// Categorías que NUNCA deben aparecer como paradas turísticas en el itinerario.
// El transporte y el alojamiento son información de servicio, no experiencias turísticas.
const CATEGORIAS_EXCLUIDAS_DEL_ITINERARIO = ["movilidad", "alojamiento"];

// ========================================================
// INTEGRACIÓN DEL CLIMA EN TIEMPO REAL (OPEN-METEO)
// ========================================================

function interpretarClima(codigo, temperatura) {
    const esLluvia = [51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99].includes(codigo);
    let texto = "Parcialmente nublado";
    let icono = "🌤️";

    if (codigo === 0) {
        texto = "Despejado";
        icono = "☀️";
    } else if ([1, 2, 3].includes(codigo)) {
        texto = "Nuboso";
        icono = "🌥️";
    } else if ([45, 48].includes(codigo)) {
        texto = "Con niebla";
        icono = "🌫️";
    } else if ([95, 96, 99].includes(codigo)) {
        texto = "Tormentas eléctricas";
        icono = "⛈️";
    } else if (esLluvia) {
        texto = "Lluvia";
        icono = "🌧️";
    }

    const tempRedondeada = Math.round(temperatura);
    const tormenta = [95, 96, 99].includes(codigo);

    return {
        estado: "listo",
        descripcion: `${texto} · ${tempRedondeada} °C`,
        temperatura: tempRedondeada,
        lluvia: esLluvia,
        tormenta,
        icono: icono
    };
}

function extraerLluviaProxima(datos) {
    const hours = Array.isArray(datos?.hourly?.time) ? datos.hourly.time : [];
    const probs = Array.isArray(datos?.hourly?.precipitation_probability) ? datos.hourly.precipitation_probability : [];
    const precs = Array.isArray(datos?.hourly?.precipitation) ? datos.hourly.precipitation : [];
    const now = Date.now();
    const proximas = [];

    hours.forEach((horaIso, index) => {
        const t = new Date(horaIso).getTime();
        if (!Number.isFinite(t) || t < now - 45 * 60 * 1000 || proximas.length >= 6) return;
        proximas.push({
            hora: horaIso,
            probabilidad: Number(probs[index]) || 0,
            mm: Number(precs[index]) || 0
        });
    });

    const maxProb = proximas.reduce((max, item) => Math.max(max, item.probabilidad), 0);
    const mmTotal = proximas.reduce((sum, item) => sum + item.mm, 0);
    return {
        horas: proximas,
        lluviaProxima: maxProb >= 45 || mmTotal >= 1
    };
}

function consejoTukiClima(clima = climaActual) {
    if (clima?.estado !== "listo") {
        return "⏳ Clima todavía no confirmado. Tuki evita asumir condiciones y mantiene opciones flexibles.";
    }
    if (clima.tormenta) {
        return `⛈️ Tormentas en Iguazú (${clima.temperatura}°C). Tuki prioriza opciones techadas y sugiere consultar pasarelas del Parque.`;
    }
    if (clima.lluvia) {
        return `🌧️ Está lloviendo en Iguazú (${clima.temperatura}°C). Tuki prioriza Duty Free, Icebar y gastronomía regional.`;
    }
    if (clima.lluviaProxima) {
        return `🌦️ Hay chance de lluvia en las próximas horas (${clima.temperatura}°C). Llevá abrigo liviano y tené un plan B indoor.`;
    }
    if (clima.temperatura >= 30) {
        return `☀️ Día cálido en Iguazú (${clima.temperatura}°C). Ideal para Cataratas: hidratación y protector solar.`;
    }
    return `🌤️ Clima agradable en Iguazú (${clima.temperatura}°C). Buen momento para selva y Cataratas.`;
}

function pintarBadgeClima() {
    const weatherIcon = document.querySelector("#weather-icon");
    const weatherTemp = document.querySelector("#weather-temp");
    const weatherCond = document.querySelector("#weather-cond");
    const assistantText = document.querySelector("#assistant-text");
    if (weatherIcon) weatherIcon.textContent = climaActual.icono;
    if (weatherTemp) weatherTemp.textContent = Number.isFinite(Number(climaActual.temperatura)) ? `${climaActual.temperatura}°C` : "—";
    if (weatherCond) weatherCond.textContent = String(climaActual.descripcion || "").split(" · ")[0] || "Clima";
    if (assistantText) assistantText.textContent = consejoTukiClima();
}

function guardarClimaEnCache(payload) {
    try {
        localStorage.setItem(CLIMA_STORAGE_KEY, JSON.stringify({
            savedAt: Date.now(),
            clima: payload
        }));
    } catch (error) {
        console.info("No se pudo cachear el clima.", error);
    }
}

function leerClimaEnCache() {
    try {
        const parsed = JSON.parse(localStorage.getItem(CLIMA_STORAGE_KEY) || "null");
        if (!parsed?.clima) return null;
        const edad = Date.now() - Number(parsed.savedAt || 0);
        return { clima: parsed.clima, fresco: Number.isFinite(edad) && edad < CLIMA_TTL_MS, edad };
    } catch (error) {
        return null;
    }
}

function aplicarClimaCargado(clima, { desdeCache = false, notificar = true } = {}) {
    const estado = clima?.estado === "desconocido" || clima?.estado === "cargando" ? clima.estado : "listo";
    climaActual = { ...clima, estado, desdeCache };
    pintarBadgeClima();
    if (typeof window.aplicarClimaEnInterfaz === "function") {
        window.aplicarClimaEnInterfaz(climaActual, { notificar });
    }
}

function abrirFichaClima() {
    const sheet = document.querySelector("#weather-sheet");
    const body = document.querySelector("#weather-sheet-body");
    if (!sheet || !body) return;

    const horasHtml = (climaActual.horas || []).slice(0, 6).map(item => {
        const hora = new Date(item.hora).toLocaleTimeString("es-AR", {
            hour: "2-digit",
            minute: "2-digit",
            timeZone: "America/Argentina/Buenos_Aires"
        });
        return `<li><strong>${hora}</strong> · ${item.probabilidad}% lluvia · ${item.mm.toFixed(1)} mm</li>`;
    }).join("") || "<li>Sin pronóstico horario cacheado.</li>";

    const origen = climaActual.desdeCache ? "Último clima guardado (offline)" : "Open-Meteo en vivo";
    body.innerHTML = `
        <p class="weather-sheet-lead">${escapar(consejoTukiClima())}</p>
        <p class="weather-sheet-meta">${climaActual.icono} ${escapar(climaActual.descripcion)} · ${origen}</p>
        <h4>Próximas horas</h4>
        <ul class="weather-hour-list">${horasHtml}</ul>
        <p class="weather-sheet-note">No hay avisos oficiales del parque acá: es una guía local para armar el día.</p>
    `;
    sheet.classList.remove("hidden");
    sheet.setAttribute("aria-hidden", "false");
}

function cerrarFichaClima() {
    const sheet = document.querySelector("#weather-sheet");
    if (!sheet) return;
    sheet.classList.add("hidden");
    sheet.setAttribute("aria-hidden", "true");
}

window.abrirFichaClima = abrirFichaClima;
window.cerrarFichaClima = cerrarFichaClima;
window.consejoTukiClima = consejoTukiClima;

async function cargarClimaActual() {
    const cache = leerClimaEnCache();
    if (cache?.clima) {
        aplicarClimaCargado(cache.clima, { desdeCache: true, notificar: false });
        if (cache.fresco) {
            // Igual refresca en segundo plano; si falla, el cache ya se ve.
        }
    }

    try {
        const respuesta = await fetch(URL_CLIMA_IGUAZU);
        if (!respuesta.ok) throw new Error("Fallo en API de clima");
        const datos = await respuesta.json();
        const base = interpretarClima(datos.current.weather_code, datos.current.temperature_2m);
        const proxima = extraerLluviaProxima(datos);
        const clima = {
            ...base,
            precipitacion: Number(datos.current.precipitation) || 0,
            lluviaProxima: proxima.lluviaProxima,
            horas: proxima.horas,
            actualizado: Date.now()
        };
        guardarClimaEnCache(clima);
        aplicarClimaCargado(clima, { desdeCache: false, notificar: true });
    } catch (error) {
        if (cache?.clima) {
            aplicarClimaCargado(cache.clima, { desdeCache: true, notificar: false });
            return;
        }
        aplicarClimaCargado({
            estado: "desconocido",
            descripcion: "Clima no disponible",
            temperatura: null,
            lluvia: false,
            lluviaProxima: false,
            tormenta: false,
            icono: "🌥️",
            horas: [],
            actualizado: Date.now()
        }, { desdeCache: true, notificar: false });
    }
}

async function cargarEstadoCircuitosRemoto() {
    try {
        const respuesta = await fetch("./circuitos-estado.json", { cache: "no-store" });
        if (!respuesta.ok) return;
        estadoCircuitosRemoto = await respuesta.json();
        if (typeof window.renderizarAlertaCircuitos === "function") {
            window.renderizarAlertaCircuitos();
        }
    } catch (error) {
        estadoCircuitosRemoto = null;
    }
}

cargarClimaActual();
cargarEstadoCircuitosRemoto();

// ========================================================
// CONTEXTO TEMPORAL Y HORAS DISPONIBLES
// ========================================================

function obtenerFechaHoraContexto() {
    if (!contextoTemporalPrueba?.fecha) return obtenerFechaHoraArgentina();
    const fecha = new Date(contextoTemporalPrueba.fecha);
    if (!Number.isFinite(fecha.getTime())) return obtenerFechaHoraArgentina();
    const formatter = new Intl.DateTimeFormat("en-US", {
        timeZone: "America/Argentina/Buenos_Aires",
        year: "numeric",
        month: "numeric",
        day: "numeric",
        hour: "numeric",
        minute: "numeric",
        second: "numeric",
        hour12: false
    });
    const parts = Object.fromEntries(formatter.formatToParts(fecha).map(part => [part.type, part.value]));
    const year = Number(parts.year);
    const month = Number(parts.month) - 1;
    const day = Number(parts.day);
    const hour = Number(parts.hour);
    const minute = Number(parts.minute);
    const argDate = new Date(year, month, day, hour, minute);
    return {
        argDate,
        horaNumero: hour + minute / 60,
        diaSemana: argDate.getDay(),
        horaTexto: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`
    };
}

function contextoDeAhora() {
    const argTime = obtenerFechaHoraContexto();
    const ahora = argTime.argDate;
    const hora = argTime.horaNumero;
    let momento = "noche";
    let esNocturnoTardio = false;

    if (hora >= 6 && hora < 12) momento = "mañana";
    else if (hora >= 12 && hora < 15) momento = "mediodía";
    else if (hora >= 15 && hora < 18) momento = "tarde";
    else if (hora >= 18 && hora < 20) momento = "atardecer";
    else {
        momento = "noche";
        if (hora >= 20 || hora < 6) {
            esNocturnoTardio = true;
        }
    }

    return {
        momento,
        horaNumero: hora,
        horaTexto: argTime.horaTexto,
        diaSemana: argTime.diaSemana,
        esNocturnoTardio
    };
}

function obtenerFuenteUbicacionAhora(coords) {
    if (!coordenadasValidasPlan(coords)) return "fallback";
    if (typeof AppState !== "undefined" && AppState.gpsActive === true) return "gps";
    try {
        const guardadas = typeof leerCoordenadasGuardadas === "function" ? leerCoordenadasGuardadas() : null;
        if (guardadas && Number(guardadas.lat) === Number(coords.lat) && Number(guardadas.lng) === Number(coords.lng)) return "guardada";
    } catch (error) {
        // El planificador mantiene el fallback si el almacenamiento no está disponible.
    }
    return "fallback";
}

function construirContextoAhora(preferencias = {}) {
    const ahora = contextoDeAhora();
    const coords = typeof AppState !== "undefined" && coordenadasValidasPlan(AppState.userCoords)
        ? { lat: Number(AppState.userCoords.lat), lng: Number(AppState.userCoords.lng) }
        : (typeof CONFIG_APP !== "undefined" && coordenadasValidasPlan(CONFIG_APP.coordenadasCentro)
            ? { lat: Number(CONFIG_APP.coordenadasCentro.lat), lng: Number(CONFIG_APP.coordenadasCentro.lng) }
            : null);
    const climaConocido = climaActual?.estado === "listo" && Number.isFinite(Number(climaActual.temperatura));
    const intereses = normalizarInteresesPlan(preferencias.intereses || preferencias.interes || []);
    const tiempo = preferencias.tiempo || "medio día";
    return {
        fechaHora: contextoTemporalPrueba?.fecha
            ? new Date(contextoTemporalPrueba.fecha).toISOString()
            : new Date().toISOString(),
        ...ahora,
        horaReal: ahora.horaNumero,
        horaTextoReal: ahora.horaTexto,
        ubicacion: { coords, fuente: obtenerFuenteUbicacionAhora(coords) },
        clima: {
            ...climaActual,
            estado: climaActual?.estado || "desconocido",
            disponible: climaConocido,
            lluvia: climaConocido ? Boolean(climaActual.lluvia) : null,
            lluviaProxima: climaConocido ? Boolean(climaActual.lluviaProxima) : null,
            tormenta: climaConocido ? Boolean(climaActual.tormenta) : null,
            temperatura: climaConocido ? climaActual.temperatura : null
        },
        preferencias: {
            intereses,
            tiempo,
            compania: preferencias.compania || "solo",
            presupuesto: preferencias.presupuesto || "medio"
        },
        limiteHoras: horasDisponibles(tiempo),
        origenCoords: coords
    };
}

function crearSnapshotContextoPlan(contextoAhora, contextoPlan) {
    const clima = contextoPlan?.clima || contextoAhora?.clima || {};
    const climaSnapshot = {
        ...clima,
        horas: Array.isArray(clima.horas)
            ? clima.horas.map(hora => ({ ...hora }))
            : clima.horas
    };
    const ubicacion = contextoAhora?.ubicacion || {};
    const coords = coordenadasValidasPlan(ubicacion.coords)
        ? { lat: Number(ubicacion.coords.lat), lng: Number(ubicacion.coords.lng) }
        : ubicacion.coords;
    const preferencias = contextoAhora?.preferencias
        ? {
            ...contextoAhora.preferencias,
            intereses: [...(contextoAhora.preferencias.intereses || [])]
        }
        : contextoPlan?.preferencias;

    return {
        ...contextoPlan,
        clima: climaSnapshot,
        ubicacion: { ...ubicacion, coords },
        preferencias,
        contextoAhora: {
            ...contextoAhora,
            clima: climaSnapshot,
            ubicacion: { ...ubicacion, coords: coords && { ...coords } },
            preferencias: preferencias && {
                ...preferencias,
                intereses: [...(preferencias.intereses || [])]
            }
        },
        origenCoords: coords && { ...coords }
    };
}

function copiarClimaParaPrueba(clima) {
    return {
        ...(clima || {}),
        horas: Array.isArray(clima?.horas) ? clima.horas.map(hora => ({ ...hora })) : []
    };
}

function activarContextoPrueba({ fecha, clima, coords } = {}) {
    if (!fecha || !Number.isFinite(new Date(fecha).getTime())) {
        throw new Error("La prueba requiere una fecha válida en formato ISO.");
    }
    contextoTemporalPrueba = { fecha: new Date(fecha).toISOString() };
    if (clima) climaActual = copiarClimaParaPrueba(clima);
    if (coords && typeof AppState !== "undefined") {
        AppState.userCoords = { lat: Number(coords.lat), lng: Number(coords.lng) };
    }
}

function restaurarContextoPrueba(estado) {
    if (!estado) return;
    contextoTemporalPrueba = estado.contextoTemporalPrueba;
    climaActual = estado.climaActual;
    if (typeof AppState !== "undefined" && estado.appState) {
        AppState.userCoords = estado.appState.userCoords;
        AppState.gpsActive = estado.appState.gpsActive;
    }
    itinerarioActual = estado.itinerarioActual;
    itinerarioContexto = estado.itinerarioContexto;
}

function ejecutarContextoPrueba(opciones, prueba) {
    if (typeof prueba !== "function") throw new Error("La prueba debe ser una función.");
    const estado = {
        contextoTemporalPrueba,
        climaActual,
        appState: typeof AppState !== "undefined"
            ? { userCoords: AppState.userCoords, gpsActive: AppState.gpsActive }
            : null,
        itinerarioActual,
        itinerarioContexto
    };
    try {
        activarContextoPrueba(opciones);
        return prueba({ climaActual, fecha: contextoTemporalPrueba.fecha });
    } finally {
        restaurarContextoPrueba(estado);
    }
}

if (typeof window !== "undefined") {
    Object.defineProperty(window, "__iguazuTesting", {
        configurable: true,
        value: Object.freeze({
            activarContexto: activarContextoPrueba,
            restaurarContexto: () => restaurarContextoPrueba({
                contextoTemporalPrueba: null,
                climaActual: {
                    estado: "desconocido",
                    descripcion: "Clima no disponible",
                    temperatura: null,
                    lluvia: false,
                    lluviaProxima: false,
                    tormenta: false,
                    icono: "🌥️",
                    horas: [],
                    actualizado: Date.now()
                },
                appState: typeof AppState !== "undefined"
                    ? { userCoords: AppState.userCoords, gpsActive: AppState.gpsActive }
                    : null,
                itinerarioActual,
                itinerarioContexto
            }),
            ejecutar: ejecutarContextoPrueba
        })
    });
}

window.construirContextoAhora = construirContextoAhora;

function horasDisponibles(tiempo) {
    if (tiempo === "1-2 horas") return 2;
    if (tiempo === "unas horas") return 3;
    if (tiempo === "medio día") return 5;
    if (tiempo === "todo el día") return 8;
    if (tiempo === "varios días") return 10;
    return 5;
}

const TIPOS_PRECIO_VALIDOS = new Set(["gratis", "fijo", "por_persona", "por_adulto", "por_nino", "grupo", "desde", "variable", "desconocido"]);
const ESTADOS_PRECIO_VALIDOS = new Set(["confirmado", "desconocido", "pendiente"]);

function normalizarPrecio(lugar) {
    const precio = lugar?.precio;
    if (!precio || typeof precio !== "object") {
        return { tipo: "desconocido", monto: null, moneda: null, unidad: null, estado: "desconocido", fuente: null, actualizado: null };
    }
    const tipo = TIPOS_PRECIO_VALIDOS.has(precio.tipo) ? precio.tipo : "desconocido";
    const estado = ESTADOS_PRECIO_VALIDOS.has(precio.estado) ? precio.estado : "desconocido";
    const monto = typeof precio.monto === "number" && Number.isFinite(precio.monto) ? precio.monto : null;
    return { ...precio, tipo, monto, moneda: precio.moneda || null, unidad: precio.unidad || null, estado };
}

function esUnidadPrecioComparable(a, b) {
    const unidadA = a?.unidad || null;
    const unidadB = b?.unidad || null;
    return unidadA === unidadB || (!unidadA && !unidadB);
}

function calcularCostoItinerario(lugares, contexto = {}) {
    const items = Array.isArray(lugares) ? lugares : [];
    const precios = items.map(normalizarPrecio);
    const sinPrecio = precios.filter(precio => precio.tipo === "desconocido" || precio.tipo === "variable" || precio.monto === null || precio.estado !== "confirmado");
    const conPrecio = precios.filter(precio => precio.monto !== null && precio.estado === "confirmado" && precio.tipo !== "desconocido" && precio.tipo !== "variable");
    const preciosPagos = conPrecio.filter(precio => precio.tipo !== "gratis" && precio.monto > 0);
    const monedas = [...new Set(preciosPagos.map(precio => precio.moneda).filter(Boolean))];
    const unidades = [...new Set(preciosPagos.map(precio => precio.unidad).filter(Boolean))];

    if (!items.length) return { total: 0, moneda: null, estado: "confirmado", actividadesConPrecio: 0, actividadesSinPrecio: 0, monedas: [] };
    if (!sinPrecio.length && !conPrecio.length) return { total: 0, moneda: null, estado: "confirmado", actividadesConPrecio: 0, actividadesSinPrecio: 0, monedas: [] };
    if (preciosPagos.some(precio => !precio.moneda) || monedas.length > 1 || (preciosPagos.length > 1 && !preciosPagos.every(precio => esUnidadPrecioComparable(precio, preciosPagos[0])))) {
        return { total: null, moneda: null, estado: "no_comparable", actividadesConPrecio: conPrecio.length, actividadesSinPrecio: sinPrecio.length, monedas };
    }

    const total = conPrecio.reduce((suma, precio) => suma + precio.monto, 0);
    return {
        total: conPrecio.length ? total : null,
        moneda: monedas[0] || null,
        estado: sinPrecio.length ? "parcial" : "confirmado",
        actividadesConPrecio: conPrecio.length,
        actividadesSinPrecio: sinPrecio.length,
        monedas,
    };
}

window.normalizarPrecio = normalizarPrecio;
window.calcularCostoItinerario = calcularCostoItinerario;

function numeroFinitoPlan(valor, fallback = 0) {
    const numero = typeof valor === "number" ? valor : Number(String(valor ?? "").replace(",", "."));
    return Number.isFinite(numero) ? numero : fallback;
}

function obtenerDuracionPlan(lugar) {
    const duracion = numeroFinitoPlan(lugar?.duracionHoras, 1.5);
    return duracion > 0 ? duracion : 1.5;
}

function inferirTipoHorario(lugar) {
    if (lugar && ["diurno", "nocturno", "flexible"].includes(lugar.tipoHorario)) return lugar.tipoHorario;
    if (!lugar || !Array.isArray(lugar.momentos) || !lugar.momentos.length) return "flexible";
    const diurnos = ["mañana", "mediodía", "tarde"];
    const nocturnos = ["atardecer", "noche"];
    const tieneDiurno = lugar.momentos.some(m => diurnos.includes(m));
    const tieneNocturno = lugar.momentos.some(m => nocturnos.includes(m));
    if (tieneDiurno && !tieneNocturno) return "diurno";
    if (!tieneDiurno && tieneNocturno) return "nocturno";
    return "flexible";
}

function momentoParaHora(horaNumero) {
    const hora = numeroFinitoPlan(horaNumero, 12);
    if (hora >= 6 && hora < 12) return "mañana";
    if (hora >= 12 && hora < 15) return "mediodía";
    if (hora >= 15 && hora < 18) return "tarde";
    if (hora >= 18 && hora < 20) return "atardecer";
    return "noche";
}

function formatoHoraDecimalPlan(horaNumero) {
    const total = Math.round(numeroFinitoPlan(horaNumero, 0) * 60);
    return formatearMinutosAHorario(total);
}

function obtenerInicioContextual(intereses, ahora) {
    const horaActual = numeroFinitoPlan(ahora?.horaNumero, 12);
    const diaActual = numeroFinitoPlan(ahora?.diaSemana, 0);
    const interesesNormalizados = normalizarInteresesPlan(intereses);
    const soloNoche = interesesNormalizados.length === 1 && interesesNormalizados.includes("noche");
    const incluyeNoche = interesesNormalizados.includes("noche");
    const soloComida = interesesNormalizados.length === 1 && interesesNormalizados.includes("comida");
    const incluyeComida = interesesNormalizados.includes("comida");
    const soloCompras = interesesNormalizados.length === 1 && interesesNormalizados.includes("compras");
    if (incluyeNoche && !soloNoche && horaActual >= 6 && horaActual < 18) {
        return {
            planificarParaManana: false,
            contexto: { ...ahora, momento: "noche", horaNumero: 20, horaTexto: "20:00", diaSemana: diaActual, esNocturnoTardio: false }
        };
    }
    if (incluyeComida && !soloComida && !incluyeNoche && horaActual < 12) {
        return {
            planificarParaManana: false,
            contexto: { ...ahora, momento: "mediodía", horaNumero: 12, horaTexto: "12:00", diaSemana: diaActual, esNocturnoTardio: false }
        };
    }
    if (soloComida) {
        // Las franjas gastronómicas del catálogo se concentran en almuerzo y cena.
        // Si el usuario elige únicamente Comer, trasladamos el inicio a la próxima
        // franja razonable en vez de devolver alternativas de otra categoría.
        if (horaActual < 6 || horaActual >= 22) {
            return {
                planificarParaManana: true,
                contexto: {
                    ...ahora,
                    momento: "mediodía",
                    horaNumero: 12,
                    horaTexto: "12:00",
                    diaSemana: (diaActual + 1) % 7,
                    esNocturnoTardio: false
                }
            };
        }
        const horaComida = horaActual < 12 ? 12 : (horaActual >= 15.5 && horaActual < 19.5 ? 19.5 : horaActual);
        return {
            planificarParaManana: false,
            contexto: {
                ...ahora,
                momento: momentoParaHora(horaComida),
                horaNumero: horaComida,
                horaTexto: formatoHoraDecimalPlan(horaComida),
                diaSemana: diaActual,
                esNocturnoTardio: false
            }
        };
    }
    if (soloCompras && (horaActual >= 20 || horaActual < 6)) {
        return {
            planificarParaManana: true,
            contexto: {
                ...ahora,
                momento: "mañana",
                horaNumero: 10,
                horaTexto: "10:00",
                diaSemana: (diaActual + 1) % 7,
                esNocturnoTardio: false
            }
        };
    }
    if (soloCompras && horaActual < 10) {
        return {
            planificarParaManana: false,
            contexto: {
                ...ahora,
                momento: momentoParaHora(10),
                horaNumero: 10,
                horaTexto: "10:00",
                diaSemana: diaActual,
                esNocturnoTardio: false
            }
        };
    }
    if (soloNoche) {
        if (horaActual >= 18 || horaActual < 6) {
            return {
                planificarParaManana: false,
                contexto: { ...ahora, momento: "noche", horaNumero: horaActual, horaTexto: ahora.horaTexto || formatoHoraDecimalPlan(horaActual) }
            };
        }
        return {
            planificarParaManana: false,
            contexto: { ...ahora, momento: "noche", horaNumero: 20, horaTexto: "20:00" }
        };
    }

    if (horaActual >= 20 || horaActual < 6) {
        return {
            planificarParaManana: true,
            contexto: {
                ...ahora,
                momento: "mañana",
                horaNumero: 9,
                horaTexto: "09:00",
                diaSemana: (diaActual + 1) % 7,
                esNocturnoTardio: false
            }
        };
    }

    const inicio = horaActual < 8 ? 8 : Math.min(horaActual + 0.25, 20);
    return {
        planificarParaManana: false,
        contexto: {
            ...ahora,
            momento: momentoParaHora(inicio),
            horaNumero: inicio,
            horaTexto: formatoHoraDecimalPlan(inicio),
            esNocturnoTardio: false
        }
    };
}

function esCompatibleConPresupuesto(lugar, presupuestoElegido) {
    const precio = normalizarPrecio(lugar);
    if (precio.tipo === "gratis" && precio.estado === "confirmado" && precio.monto === 0) return true;
    const nivelUsuario = NIVELES_DE_GASTO[presupuestoElegido] || 2;
    const nivelLugar = NIVELES_DE_GASTO[lugar?.nivelGasto] || 2;
    return nivelUsuario >= nivelLugar;
}

function esCompatibleConClima(lugar, clima = climaActual) {
    if (!lugar) return false;
    if (clima?.estado !== "listo") return true;

    // Con tormenta o lluvia activa no se sugieren experiencias al aire libre
    if ((clima.tormenta || clima.lluvia) && lugar.alAireLibre === true) {
        return false;
    }

    // La lluvia próxima no invalida una actividad por sí sola. Se conserva
    // como señal de priorización para opciones cubiertas en el puntaje y Plan B.
    if (clima.lluviaProxima) return true;

    return true;
}


function esCompatibleTemporalmente(lugar, contextoOMomento) {
    if (!lugar) return false;
    const contexto = typeof contextoOMomento === "object" && contextoOMomento !== null
        ? contextoOMomento
        : { momento: contextoOMomento || "mañana" };
    const momento = contexto.momento || momentoParaHora(contexto.horaNumero);
    const tipo = inferirTipoHorario(lugar);
    const momentos = Array.isArray(lugar.momentos) ? lugar.momentos : [];
    if (momentos.includes(momento)) return true;
    if (tipo === "flexible") return true;
    if (tipo === "diurno") return ["mañana", "mediodía", "tarde"].includes(momento);
    if (tipo === "nocturno") return ["atardecer", "noche"].includes(momento);
    return false;
}

function esCompatibleDuranteBloque(lugar, contexto) {
    if (!lugar || !contexto) return false;
    const horaInicio = numeroFinitoPlan(contexto.horaNumero, NaN);
    const diaInicio = numeroFinitoPlan(contexto.diaSemana, NaN);
    const duracion = obtenerDuracionPlan(lugar);
    const tieneHorario = Boolean(lugar.rangoHorario || lugar.rangosHorarios);
    if (!tieneHorario || !Number.isFinite(horaInicio) || !Number.isFinite(diaInicio)) return true;
    if (typeof estaAbiertoEnHorario !== "function") return true;

    // Muestrear cada 30 minutos evita aceptar una actividad que empieza abierta y termina cerrada.
    const muestras = Math.max(1, Math.ceil(duracion * 2));
    for (let indice = 0; indice <= muestras; indice += 1) {
        const offset = Math.min(indice * 0.5, Math.max(0, duracion - 0.05));
        const horaTotal = horaInicio + offset;
        const dia = (diaInicio + Math.floor(horaTotal / 24)) % 7;
        const hora = ((horaTotal % 24) + 24) % 24;
        if (!estaAbiertoEnHorario(lugar, hora, dia)) return false;
    }
    return true;
}

const MINUTOS_MINIMOS_MADRUGADA = 60;

function evaluarMadrugadaNocturna(lugar, contexto = {}) {
    const horaActual = numeroFinitoPlan(contexto?.horaNumero, NaN);
    const diaActual = numeroFinitoPlan(contexto?.diaSemana, NaN);
    const resultadoBase = {
        aplica: false,
        puedeRecomendarse: false,
        tiempoDisponibleMinutos: 0,
        duracionIdealMinutos: Math.round(obtenerDuracionPlan(lugar) * 60),
        duracionParcial: false,
        motivo: "La política de madrugada no aplica."
    };

    if (!lugar || lugar.tipoHorario !== "nocturno" || !Number.isFinite(horaActual) || !Number.isFinite(diaActual)) return resultadoBase;
    if (horaActual < 0 || horaActual >= 6) return resultadoBase;
    if (!estaAbiertoEnHorario(lugar, horaActual, diaActual)) return resultadoBase;

    const rangos = Array.isArray(lugar.rangosHorarios)
        ? lugar.rangosHorarios
        : (lugar.rangoHorario ? [lugar.rangoHorario] : []);
    const cierresPosibles = rangos.map(rango => {
        const apertura = numeroFinitoPlan(rango?.apertura, NaN);
        const cierre = numeroFinitoPlan(rango?.cierre, NaN);
        if (!Number.isFinite(apertura) || !Number.isFinite(cierre)) return null;
        const cruzaMedianoche = cierre > 24 || cierre <= apertura;
        if (!cruzaMedianoche) return null;
        const cierreExtendido = cierre > 24 ? cierre : cierre + 24;
        const horaExtendida = horaActual < apertura ? horaActual + 24 : horaActual;
        return horaExtendida < cierreExtendido ? cierreExtendido - horaExtendida : null;
    }).filter(Number.isFinite);
    if (!cierresPosibles.length) return resultadoBase;

    const tiempoDisponibleMinutos = Math.round(Math.min(...cierresPosibles) * 60);
    const duracionIdealMinutos = resultadoBase.duracionIdealMinutos;
    const duracionParcial = tiempoDisponibleMinutos < duracionIdealMinutos;
    return {
        aplica: true,
        puedeRecomendarse: tiempoDisponibleMinutos >= MINUTOS_MINIMOS_MADRUGADA,
        tiempoDisponibleMinutos,
        duracionIdealMinutos,
        duracionParcial,
        motivo: tiempoDisponibleMinutos >= MINUTOS_MINIMOS_MADRUGADA
            ? (duracionParcial ? "Abierto ahora, pero con menos tiempo disponible que su duración ideal" : "Abierto ahora con tiempo suficiente para completar su duración ideal")
            : "El tiempo restante es inferior al mínimo razonable para recomendar la experiencia."
    };
}

function obtenerDuracionEfectivaPlan(lugar, contexto) {
    const duracionIdeal = obtenerDuracionPlan(lugar);
    const madrugada = evaluarMadrugadaNocturna(lugar, contexto);
    if (madrugada.puedeRecomendarse && madrugada.duracionParcial) return madrugada.tiempoDisponibleMinutos / 60;
    return duracionIdeal;
}

window.evaluarMadrugadaNocturna = evaluarMadrugadaNocturna;

// ========================================================
// VIABILIDAD OPERATIVA
// ========================================================

function detectarOperacionLugar(lugar) {
    if (lugar?.operacion && typeof lugar.operacion === "object") {
        return {
            disponibilidad: lugar.operacion.disponibilidad || "desconocida",
            reserva: lugar.operacion.reserva || "no_requerida",
            coordinacion: lugar.operacion.coordinacion || "no_requerida",
            requiereReserva: lugar.operacion.reserva === "requerida" || lugar.operacion.reserva === "pendiente",
            requiereCoordinacion: lugar.operacion.coordinacion === "requerida" || lugar.operacion.coordinacion === "pendiente"
        };
    }
    const texto = [lugar?.horario, lugar?.precio, lugar?.promocion, lugar?.tipo,
        ...(Array.isArray(lugar?.etiquetas) ? lugar.etiquetas : [])]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
    const requiereReserva = /reserva previa|con reserva|reserva requerida|turno.*reserva|reserva.*turno/.test(texto);
    const requiereCoordinacion = /coordinad|acordar con|consultar disponibilidad comunitaria|visita coordinada|ideal con coordinación/.test(texto);
    return {
        disponibilidad: "desconocida",
        reserva: requiereReserva ? "requerida" : "no_requerida",
        coordinacion: requiereCoordinacion && !requiereReserva ? "requerida" : "no_requerida",
        requiereReserva,
        requiereCoordinacion: requiereCoordinacion && !requiereReserva
    };
}

function obtenerEstadoOperativoLugar(lugar, contexto = {}) {
    const operacion = detectarOperacionLugar(lugar);
    const hora = Number.isFinite(Number(contexto.horaNumero)) ? Number(contexto.horaNumero) : undefined;
    const dia = Number.isFinite(Number(contexto.diaSemana)) ? Number(contexto.diaSemana) : undefined;
    const tieneHorarioEstructurado = Boolean(lugar?.rangoHorario || (Array.isArray(lugar?.rangosHorarios) && lugar.rangosHorarios.length));
    const abierto = tieneHorarioEstructurado ? estaAbiertoEnHorario(lugar, hora, dia) : null;
    const actualizado = lugar?.operacion?.actualizado ?? lugar?.actualizado ?? null;
    const fuenteDato = tieneHorarioEstructurado ? "horario estructurado del catálogo" : "datos operativos del catálogo";

    if (operacion.disponibilidad === "no_disponible") {
        return { estado: "cerrado", abierto: abierto === false ? false : null, confianza: "media", requiereReserva: operacion.requiereReserva, requiereCoordinacion: operacion.requiereCoordinacion, motivo: "El catálogo marca esta experiencia como no disponible.", fuenteDato, actualizado };
    }
    if (abierto === false) {
        return { estado: "cerrado", abierto: false, confianza: "alta", requiereReserva: false, requiereCoordinacion: false, motivo: "El horario estructurado indica que está cerrado en este momento.", fuenteDato, actualizado };
    }
    if (operacion.requiereReserva || operacion.requiereCoordinacion) {
        const condicion = operacion.requiereReserva ? "requiere reserva" : "requiere coordinación";
        return { estado: "condicional", abierto, confianza: abierto === true ? "media" : "baja", requiereReserva: operacion.requiereReserva, requiereCoordinacion: operacion.requiereCoordinacion, motivo: `Es una opción, pero ${condicion} previa.`, fuenteDato, actualizado };
    }
    if (abierto === true) {
        return { estado: "disponible", abierto: true, confianza: "alta", requiereReserva: false, requiereCoordinacion: false, motivo: "El horario estructurado confirma que está abierto ahora.", fuenteDato, actualizado };
    }
    return { estado: "desconocido", abierto: null, confianza: "baja", requiereReserva: false, requiereCoordinacion: false, motivo: "No hay datos estructurados suficientes para confirmar la disponibilidad ahora.", fuenteDato, actualizado };
}

window.obtenerEstadoOperativoLugar = obtenerEstadoOperativoLugar;

function evaluarViabilidadLugar(lugar, contexto = {}) {
    if (!lugar || lugar.planificable !== true) {
        return { viable: false, estado: "no_planificable", abierto: null, disponibilidad: "desconocida", requiereReserva: false, requiereCoordinacion: false, motivo: "La experiencia no está autorizada para itinerarios." };
    }
    const hora = Number.isFinite(Number(contexto.horaNumero)) ? Number(contexto.horaNumero) : undefined;
    const dia = Number.isFinite(Number(contexto.diaSemana)) ? Number(contexto.diaSemana) : undefined;
    const estado = obtenerEstadoOperativoLugar(lugar, contexto);
    return {
        viable: estado.estado !== "cerrado",
        estado: estado.estado,
        abierto: estado.abierto,
        disponibilidad: estado.estado === "disponible" ? "disponible" : "desconocida",
        ...estado,
        motivo: estado.motivo
    };
}

window.evaluarViabilidadLugar = evaluarViabilidadLugar;

function normalizarInteresPlan(interes) {
    const clave = String(interes ?? "").trim().toLowerCase();
    const alias = {
        noche: "noche",
        nocturna: "noche",
        nocturno: "noche",
        night: "noche",
        comer: "comida",
        comida: "comida"
    };
    return alias[clave] || clave;
}

function normalizarInteresesPlan(intereses) {
    return [...new Set((Array.isArray(intereses) ? intereses : [])
        .map(normalizarInteresPlan)
        .filter(Boolean))];
}

function tieneVentanaNocturna(lugar) {
    const rangos = Array.isArray(lugar?.rangosHorarios)
        ? lugar.rangosHorarios
        : (lugar?.rangoHorario ? [lugar.rangoHorario] : []);
    return rangos.some(rango => {
        const apertura = numeroFinitoPlan(rango?.apertura, NaN);
        const cierre = numeroFinitoPlan(rango?.cierre, NaN);
        return Number.isFinite(apertura) && Number.isFinite(cierre) && (apertura >= 18 || cierre > 24 || cierre <= 6);
    });
}

function esExperienciaNocturnaValida(lugar) {
    if (!lugar) return false;
    if (lugar.categoria === "noche" || lugar.tipoHorario === "nocturno") return true;
    if (lugar.categoria === "comida" && (Array.isArray(lugar.momentos) && lugar.momentos.includes("noche") || tieneVentanaNocturna(lugar))) return true;
    return false;
}

function interesesCoincidenConLugar(lugar, intereses) {
    const claves = Array.isArray(intereses) ? intereses.map(normalizarInteresPlan) : [];
    return claves.some(interes => {
        if (lugar.categoria === interes) return true;
        if (Array.isArray(lugar.intereses) && lugar.intereses.includes(interes)) return true;
        if (interes === "noche" && (lugar.categoria === "noche" || lugar.tipoHorario === "nocturno")) return true;
        return false;
    });
}

function interesesCubiertosPorLugar(lugar, intereses) {
    const claves = Array.isArray(intereses) ? intereses : [];
    return claves.filter(interes => {
        if (lugar?.categoria === interes) return true;
        if (Array.isArray(lugar?.intereses) && lugar.intereses.includes(interes)) return true;
        if (interes === "noche" && (lugar?.categoria === "noche" || lugar?.tipoHorario === "nocturno")) return true;
        return false;
    });
}

function esCandidatoValido(lugar, opciones = {}) {
    if (!lugar || CATEGORIAS_EXCLUIDAS_DEL_ITINERARIO.includes(lugar.categoria)) return false;
    const viabilidad = evaluarViabilidadLugar(lugar, opciones.contexto || {});
    if (!viabilidad.viable) return false;
    if (!esCompatibleConClima(lugar, opciones.contexto?.contextoAhora?.clima || opciones.clima || climaActual)) return false;

    const { intereses, interes, contexto, presupuesto, compania } = opciones;
    const listaIntereses = Array.isArray(intereses) && intereses.length ? intereses : (interes ? [interes] : []);
    if (listaIntereses.length && !interesesCoincidenConLugar(lugar, listaIntereses)) return false;
    if (listaIntereses.includes("noche") && !esExperienciaNocturnaValida(lugar)) return false;
    if (listaIntereses.length === 1 && listaIntereses[0] === "comida" && lugar.categoria !== "comida") return false;
    if (contexto && !esCompatibleTemporalmente(lugar, contexto)) return false;
    if (contexto && !esCompatibleDuranteBloque(lugar, contexto)) {
        const madrugada = evaluarMadrugadaNocturna(lugar, contexto);
        if (!madrugada.puedeRecomendarse) return false;
    }
    if (presupuesto && !esCompatibleConPresupuesto(lugar, presupuesto)) return false;
    if (compania && Array.isArray(lugar.aptoPara) && lugar.aptoPara.length && !lugar.aptoPara.includes(compania)) return false;
    return true;
}

function coordenadasValidasPlan(coords) {
    if (!coords) return false;
    const lat = Number(coords.lat);
    const lng = Number(coords.lng);
    return Number.isFinite(lat) && Number.isFinite(lng) &&
        lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

function calcularPuntaje(lugar, contexto, compania, interes) {
    const intereses = Array.isArray(interes) ? interes : (interes ? [interes] : ["naturaleza"]);
    const planContext = contexto || {};
    const clima = planContext.clima || planContext.contextoAhora?.clima || climaActual;
    let score = Math.max(1, Math.min(10, numeroFinitoPlan(lugar?.prioridad, 5))) * 6;
    const coincideCategoria = intereses.includes(lugar.categoria);
    const coincideInteres = interesesCoincidenConLugar(lugar, intereses);
    if (coincideCategoria) score += 28;
    else if (coincideInteres) score += 18;
    if (intereses.includes("comida") && lugar.categoria === "comida") score += 24;

    if (esCompatibleTemporalmente(lugar, planContext)) score += 18;
    if (esCompatibleDuranteBloque(lugar, planContext)) score += 12;
    if (clima?.estado === "listo") {
        if (clima.tormenta && lugar.alAireLibre !== true) score += 20;
        else if (clima.lluvia && lugar.alAireLibre !== true) score += 24;
        else if (clima.lluviaProxima && lugar.alAireLibre !== true) score += 10;
        else if (!clima.lluvia && lugar.alAireLibre === true) score += 10;
    }

    if (Array.isArray(lugar.aptoPara) && lugar.aptoPara.includes(compania)) score += 20;
    if ((compania === "niños" || compania === "familia") && (lugar.etiquetas || []).some(e => /boliche|discoteca|disco/i.test(e))) score -= 50;

    const presupuesto = planContext.presupuesto || itinerarioContexto.presupuesto;
    const precio = normalizarPrecio(lugar);
    if (presupuesto === "economico" && (precio.tipo === "gratis" || lugar.nivelGasto === "economico")) score += 10;
    if (presupuesto === "alto" && lugar.nivelGasto === "alto") score += 10;

    const origen = planContext.origenCoords;
    if (coordenadasValidasPlan(origen) && coordenadasValidasPlan(lugar.coordenadas) && typeof calcularDistanciaKm === "function") {
        const distancia = calcularDistanciaKm(Number(origen.lat), Number(origen.lng), Number(lugar.coordenadas.lat), Number(lugar.coordenadas.lng));
        if (Number.isFinite(distancia)) {
            score += distancia <= 1.5 ? 5 : 0;
            score -= Math.min(18, distancia * 1.35);
        }
    }

    if (lugar.destacado) score += 4;
    if (numeroFinitoPlan(lugar.prioridadComercial, 0) > 0) score += 1;
    return Number.isFinite(score) ? score : 0;
}

function generarMotivoRecomendacion(lugar, contexto, compania) {
    const momento = contexto?.momento || "mañana";
    const clima = contexto?.clima || contexto?.contextoAhora?.clima || climaActual;
    const esBoliche = (lugar.etiquetas || []).some(e => /boliche|discoteca|disco/i.test(e));
    if ((clima.tormenta || clima.lluvia) && lugar.alAireLibre !== true) return "Opción bajo techo priorizada porque el clima actual puede complicar las actividades exteriores.";
    if (clima.lluviaProxima && lugar.alAireLibre !== true) return "Buena alternativa para aprovechar el día con una opción protegida y una lluvia próxima en el pronóstico.";
    if (momento === "noche" && esBoliche) return "Propuesta nocturna que coincide con tu interés y el momento actual.";
    if (momento === "noche" && (lugar.categoria === "noche" || lugar.categoria === "comida")) return "Abierta en la franja nocturna y compatible con tu plan.";
    if (compania === "niños" || compania === "familia") return "Seleccionada por su compatibilidad con una salida familiar.";
    if (compania === "pareja") return "Seleccionada por su buen encaje para compartir en pareja.";
    if (compania === "amigos") return "Seleccionada por su buen encaje para disfrutar con amigos.";
    if (lugar.gratuito === true) return "Alternativa gratuita que ayuda a aprovechar el tiempo sin aumentar el presupuesto.";
    if (lugar.destacado) return "Experiencia destacada del destino y compatible con tu disponibilidad.";
    return "Seleccionada por la combinación de interés, tiempo, horario, clima y distancia.";
}

// ========================================================
// CÁLCULO PRECISO DE TRASLADO// ========================================================
// CÁLCULO PRECISO DE TRASLADO ENTRE PARADAS SUCESIVAS
// ========================================================

/**
 * Calcula la estimación precisa de tiempo y modo de traslado entre dos puntos geográficos.
 * @param {Object} lugarOrigen - Objeto con coordenadas {lat, lng}
 * @param {Object} lugarDestino - Objeto con coordenadas {lat, lng}
 * @returns {Object} { distanciaKm, minutos, horas, modo: 'caminando'|'auto', texto, badgeHtml }
 */
function calcularTiempoTraslado(lugarOrigen, lugarDestino) {
    if (!lugarOrigen || !lugarDestino || !lugarOrigen.coordenadas || !lugarDestino.coordenadas) {
        return {
            distanciaKm: 0,
            minutos: 0,
            horas: 0,
            modo: "mismo_lugar",
            texto: "En la misma zona",
            badgeHtml: ""
        };
    }

    const lat1 = Number(lugarOrigen.coordenadas.lat);
    const lon1 = Number(lugarOrigen.coordenadas.lng);
    const lat2 = Number(lugarDestino.coordenadas.lat);
    const lon2 = Number(lugarDestino.coordenadas.lng);

    if (isNaN(lat1) || isNaN(lat2) || isNaN(lon1) || isNaN(lon2)) {
        return { distanciaKm: 0, minutos: 0, horas: 0, modo: "desconocido", texto: "", badgeHtml: "" };
    }

    const distanciaKm = typeof calcularDistanciaKm === "function"
        ? calcularDistanciaKm(lat1, lon1, lat2, lon2)
        : 0;

    if (distanciaKm < 0.05) { // menos de 50m (contiguos o mismo predio)
        return {
            distanciaKm: 0,
            minutos: 0,
            horas: 0,
            modo: "mismo_lugar",
            texto: "Misma ubicación",
            badgeHtml: ""
        };
    }

    if (distanciaKm <= 1.2) {
        // Desplazamiento a pie (~12 min por km)
        const minutos = Math.max(3, Math.round(distanciaKm * 12));
        const distanciaTexto = Math.round(distanciaKm * 1000) + " m";
        return {
            distanciaKm,
            minutos,
            horas: minutos / 60,
            modo: "caminando",
            texto: `🚶 ~${minutos} min a pie (${distanciaTexto})`,
            badgeHtml: `
                <div class="itinerary-travel-connector">
                    <span class="travel-line"></span>
                    <div class="travel-badge walk">
                        <span>🚶</span>
                        <span>Caminata de ~${minutos} min (${distanciaTexto})</span>
                    </div>
                    <span class="travel-line"></span>
                </div>
            `
        };
    } else {
        // Desplazamiento en auto / taxi / colectivo (Ruta 12 / 101: 3 min base + 1.8 min por km)
        const minutos = Math.max(5, Math.round(distanciaKm * 1.8 + 3));
        const distanciaTexto = distanciaKm.toFixed(1) + " km";
        return {
            distanciaKm,
            minutos,
            horas: minutos / 60,
            modo: "auto",
            texto: `🚗 ~${minutos} min en auto/colectivo (${distanciaTexto})`,
            badgeHtml: `
                <div class="itinerary-travel-connector">
                    <span class="travel-line"></span>
                    <div class="travel-badge car">
                        <span>🚗</span>
                        <span>Traslado de ~${minutos} min (${distanciaTexto})</span>
                    </div>
                    <span class="travel-line"></span>
                </div>
            `
        };
    }
}

const RELACIONES_DE_INTERES = {
    naturaleza: ["fauna", "paseos", "actividades"],
    fauna: ["naturaleza", "actividades", "paseos"],
    compras: ["actividades", "paseos", "comida"],
    tres_paises: ["actividades", "paseos", "noche"],
    paseos: ["actividades", "naturaleza", "compras"],
    actividades: ["paseos", "compras", "naturaleza"],
    comida: ["noche", "actividades", "compras"],
    noche: ["comida", "actividades"]
};

const CATEGORIAS_NO_TURISTICAS_PARA_RESPALDO = ["movilidad", "alojamiento"];

function esLugarValidoParaItinerario(lugar) {
    return Boolean(
        lugar &&
        lugar.planificable === true &&
        !CATEGORIAS_EXCLUIDAS_DEL_ITINERARIO.includes(lugar.categoria) &&
        lugar.nombre &&
        lugar.categoria &&
        lugar.icono &&
        lugar.descripcion &&
        (lugar.direccion || lugar.ubicacion)
    );
}

function coincideConInteres(lugar, interes) {
    return lugar.categoria === interes || (Array.isArray(lugar.intereses) && lugar.intereses.includes(interes));
}

function estaDisponibleDurantePlan(lugar, contexto, duracion = obtenerDuracionPlan(lugar)) {
    if (!lugar || !contexto || typeof estaAbiertoEnHorario !== "function") return false;
    if (!estaAbiertoEnHorario(lugar, contexto.horaNumero, contexto.diaSemana)) return false;

    const rangos = Array.isArray(lugar.rangosHorarios) && lugar.rangosHorarios.length > 0
        ? lugar.rangosHorarios
        : lugar.rangoHorario ? [lugar.rangoHorario] : [];

    if (rangos.length === 0) return true;

    return rangos.some(rango => {
        if (!rango || !Number.isFinite(rango.apertura) || !Number.isFinite(rango.cierre)) return false;
        if (rango.apertura === 0 && rango.cierre === 24) return true;

        let cierre = rango.cierre;
        if (cierre <= rango.apertura) cierre += 24;

        let inicio = contexto.horaNumero;
        if (cierre > 24 && inicio < rango.apertura) inicio += 24;

        return inicio >= rango.apertura && inicio + duracion <= cierre;
    });
}

function momentoParaHoraPlan(hora) {
    if (hora >= 6 && hora < 12) return "mañana";
    if (hora >= 12 && hora < 15) return "mediodía";
    if (hora >= 15 && hora < 18) return "tarde";
    if (hora >= 18 && hora < 20) return "atardecer";
    return "noche";
}

function crearContextosDeBusqueda(ahora, interes) {
    const contextos = [];
    const horaActual = Number.isFinite(ahora.horaNumero) ? ahora.horaNumero : 12;
    const horaInicial = Math.ceil((horaActual + 0.25) * 2) / 2;

    // Buscar desde el próximo bloque de media hora hasta 36 horas después.
    for (let paso = 0; paso <= 72; paso += 1) {
        const horaAbsoluta = horaInicial + (paso * 0.5);
        const desplazamientoDia = Math.floor(horaAbsoluta / 24);
        const horaNumero = horaAbsoluta % 24;

        // No proponer salidas de madrugada salvo que el interés elegido sea vida nocturna.
        if (interes !== "noche" && horaNumero < 7) continue;

        const minutos = Math.round((horaNumero % 1) * 60);
        const horas = Math.floor(horaNumero);
        contextos.push({
            ...ahora,
            momento: momentoParaHoraPlan(horaNumero),
            horaNumero,
            horaTexto: `${String(horas).padStart(2, "0")}:${String(minutos).padStart(2, "0")}`,
            diaSemana: (ahora.diaSemana + desplazamientoDia) % 7,
            desplazamientoDia
        });
    }

    return contextos;
}

function obtenerCandidatosPlanLegacy(interes, presupuesto, compania, contexto, opciones = {}){
    const {
        relajarCompania = false,
        relajarPresupuesto = false,
        modoInteres = "exacto",
        excluirNombres = []
    } = opciones;
    const excluidos = new Set(excluirNombres);
    const interesesRelacionados = RELACIONES_DE_INTERES[interes] || ["actividades", "comida"];
    const categoriasPrincipales = ["naturaleza", "comida", "actividades", "noche"];

    return lugaresReales
        .filter(esLugarValidoParaItinerario)
        .filter(lugar => !CATEGORIAS_NO_TURISTICAS_PARA_RESPALDO.includes(lugar.categoria))
        .filter(lugar => !excluidos.has(lugar.nombre))
        .filter(lugar => {
            if (modoInteres === "exacto") {
                return categoriasPrincipales.includes(interes)
                    ? lugar.categoria === interes
                    : coincideConInteres(lugar, interes);
            }
            if (modoInteres === "relacionado") {
                return interesesRelacionados.some(relacionado => coincideConInteres(lugar, relacionado));
            }
            return !CATEGORIAS_NO_TURISTICAS_PARA_RESPALDO.includes(lugar.categoria);
        })
        .filter(lugar => esCompatibleConClima(lugar, contexto?.contextoAhora?.clima || contexto?.clima || climaActual))
        .filter(lugar => estaDisponibleDurantePlan(lugar, contexto))
        .filter(lugar => relajarPresupuesto || esCompatibleConPresupuesto(lugar, presupuesto))
        .filter(lugar => relajarCompania || (Array.isArray(lugar.aptoPara) && lugar.aptoPara.includes(compania)))
        .map(lugar => ({
            lugar,
            puntaje: calcularPuntaje(lugar, contexto, compania, interes)
        }))
        .sort((a, b) => b.puntaje - a.puntaje)
        .map(item => item.lugar);
}

function construirPlanConFallback({ interes, tiempo, compania, presupuesto, limiteHoras, ahora }) {
    const contextos = crearContextosDeBusqueda(ahora, interes);
    const puedeRelajarCompania = compania !== "familia" && compania !== "niños";
    const etapas = [
        {
            nivel: "exacto",
            opciones: {},
            criteriosRelajados: [],
            mensaje: ""
        },
        ...(puedeRelajarCompania ? [{
            nivel: "compania",
            opciones: { relajarCompania: true },
            criteriosRelajados: ["compañía"],
            mensaje: "Para esas condiciones no encontré una coincidencia perfecta. Tuki mantuvo el tipo de actividad, el horario y el presupuesto, y adaptó la preferencia de compañía."
        }] : []),
        {
            nivel: "presupuesto",
            opciones: { relajarCompania: puedeRelajarCompania, relajarPresupuesto: true },
            criteriosRelajados: puedeRelajarCompania ? ["compañía", "presupuesto"] : ["presupuesto"],
            mensaje: "Para esas condiciones no encontré una opción perfecta. Tuki mantuvo el tipo de actividad y un horario válido, y amplió el rango de presupuesto para ofrecerte una alternativa."
        },
        {
            nivel: "interes-relacionado",
            opciones: { relajarCompania: puedeRelajarCompania, relajarPresupuesto: true, modoInteres: "relacionado" },
            criteriosRelajados: puedeRelajarCompania ? ["compañía", "presupuesto", "preferencia secundaria"] : ["presupuesto", "preferencia secundaria"],
            mensaje: "Para esas condiciones no encontré una opción perfecta, pero Tuki te propone una alternativa turística cercana, segura y compatible con el horario."
        },
        {
            nivel: "respaldo-seguro",
            opciones: { relajarCompania: puedeRelajarCompania, relajarPresupuesto: true, modoInteres: "cualquiera" },
            criteriosRelajados: puedeRelajarCompania ? ["compañía", "presupuesto", "preferencia"] : ["presupuesto", "preferencia"],
            mensaje: "Tuki activó la recomendación de respaldo: una experiencia turística válida, disponible y adecuada para no dejarte sin propuesta."
        }
    ];

    for (const etapa of etapas) {
        for (let indiceContexto = 0; indiceContexto < contextos.length; indiceContexto += 1) {
            const contexto = contextos[indiceContexto];
            const candidatos = obtenerCandidatosPlanLegacy(interes, presupuesto, compania, contexto, etapa.opciones)
            if (candidatos.length === 0) continue;

            const seleccionados = [];
            let horasAcumuladas = 0;
            let duracionAdaptada = false;

            candidatos.forEach(lugar => {
                const duracion = obtenerDuracionPlan(lugar);
                const contextoParada = {
                    ...contexto,
                    horaNumero: (contexto.horaNumero + horasAcumuladas) % 24,
                    momento: momentoParaHoraPlan((contexto.horaNumero + horasAcumuladas) % 24)
                };
                const entraEnTiempo = horasAcumuladas + duracion <= limiteHoras;

                if (entraEnTiempo && estaDisponibleDurantePlan(lugar, contextoParada, duracion)) {
                    seleccionados.push(lugar);
                    horasAcumuladas += duracion;
                }
            });

            // Si ninguna opción entra exactamente en la duración elegida, conservar una
            // alternativa válida y explicar la adaptación en vez de devolver un array vacío.
            if (seleccionados.length === 0) {
                const alternativaMasBreve = [...candidatos]
                    .sort((a, b) => obtenerDuracionPlan(a) - obtenerDuracionPlan(b))[0];
                if (alternativaMasBreve) {
                    seleccionados.push(alternativaMasBreve);
                    horasAcumuladas = obtenerDuracionPlan(alternativaMasBreve);
                    duracionAdaptada = horasAcumuladas > limiteHoras;
                }
            }

            if (seleccionados.length > 0) {
                const horarioAdaptado = indiceContexto > 0;
                const esOtroDia = contexto.desplazamientoDia > 0;
                const mensajeHorario = horarioAdaptado
                    ? ` No había una opción compatible para comenzar de inmediato; el plan se programó ${esOtroDia ? "para mañana" : "para hoy"} a las ${contexto.horaTexto} hs.`
                    : "";
                const mensajeDuracion = duracionAdaptada
                    ? " La alternativa más breve disponible supera levemente el tiempo elegido."
                    : "";
                const mensajeBase = etapa.mensaje || (horarioAdaptado
                    ? "Tuki mantuvo tus preferencias y adaptó únicamente el horario para ofrecerte una opción válida."
                    : duracionAdaptada ? "Tuki mantuvo tus preferencias y eligió la alternativa válida más breve." : "");

                return {
                    lugares: seleccionados,
                    cantidadPrincipales: seleccionados.length,
                    contextoPlan: contexto,
                    horasAcumuladas,
                    planificarParaManana: esOtroDia,
                    adaptacion: {
                        activa: etapa.nivel !== "exacto" || horarioAdaptado || duracionAdaptada,
                        nivel: horarioAdaptado && etapa.nivel === "exacto"
                            ? "horario"
                            : duracionAdaptada && etapa.nivel === "exacto" ? "duracion" : etapa.nivel,
                        mensaje: `${mensajeBase}${mensajeHorario}${mensajeDuracion}`.trim(),
                        criteriosRelajados: [
                            ...etapa.criteriosRelajados,
                            ...(horarioAdaptado ? ["horario de inicio"] : []),
                            ...(duracionAdaptada ? ["duración"] : [])
                        ]
                    }
                };
            }
        }
    }

    return {
        lugares: [],
        cantidadPrincipales: 0,
        contextoPlan: contextos[0] || ahora,
        horasAcumuladas: 0,
        planificarParaManana: false,
        adaptacion: {
            activa: true,
            nivel: "catalogo-no-disponible",
            mensaje: "Tuki no pudo obtener una actividad válida del catálogo en este momento. Revisá la conexión y volvé a intentarlo.",
            criteriosRelajados: []
        }
    };
}

function agregarComplementoCompatible(resultado, interes, presupuesto, compania, limiteHoras, tiempo) {
    if (!resultado.lugares.length || tiempo === "1-2 horas") return resultado;

    const categorias = RELACIONES_DE_INTERES[interes] || ["comida"];
    const nombresUsados = resultado.lugares.map(lugar => lugar.nombre);
    const horaComplemento = (resultado.contextoPlan.horaNumero + resultado.horasAcumuladas) % 24;
    const contextoComplemento = {
        ...resultado.contextoPlan,
        horaNumero: horaComplemento,
        momento: momentoParaHoraPlan(horaComplemento)
    };

    for (const categoria of categorias) {
        const candidatos = obtenerCandidatosPlanLegacy(categoria, presupuesto, compania, contextoComplemento, {
             excluirNombres: nombresUsados })
        const complemento = candidatos.find(lugar =>
            resultado.horasAcumuladas + obtenerDuracionPlan(lugar) <= limiteHoras
        );

        if (complemento) {
            resultado.lugares.push(complemento);
            resultado.horasAcumuladas += obtenerDuracionPlan(complemento);
            return resultado;
        }
    }

    return resultado;
}

// ========================================================
// GENERACIÓN DEL PLAN INTELIGENTE
// ========================================================

function obtenerCandidatosPlan(intereses, contextoPlan, presupuesto, compania, origenCoords, relajar = {}) {
    const candidatos = lugaresReales
        .filter(lugar => esCandidatoValido(lugar, {
            intereses: relajar.intereses ? [] : intereses,
            contexto: contextoPlan,
            presupuesto: relajar.presupuesto ? null : presupuesto,
            compania: relajar.compania ? null : compania
        }))
        .map(lugar => ({
            lugar,
            puntaje: calcularPuntaje(lugar, { ...contextoPlan, presupuesto, origenCoords }, compania, intereses)
        }))
        .filter(item => Number.isFinite(item.puntaje))
        .sort((a, b) => b.puntaje - a.puntaje);
    return candidatos;
}

function calcularPenalizacionDiversidad(lugar, seleccionados, interesesPlan) {
    if (!Array.isArray(interesesPlan) || interesesPlan.length <= 1 || !Array.isArray(seleccionados) || !seleccionados.length) return 0;

    const interesesCandidato = new Set(interesesCubiertosPorLugar(lugar, interesesPlan));
    const perfilExterior = lugar?.alAireLibre === true;
    let penalizacion = 0;

    seleccionados.forEach(anterior => {
        if (anterior?.categoria && lugar?.categoria && anterior.categoria === lugar.categoria) penalizacion += 8;
        if (anterior?.alAireLibre === true || anterior?.alAireLibre === false) {
            if ((anterior.alAireLibre === true) === perfilExterior) penalizacion += 5;
        }

        const interesesAnteriores = new Set(interesesCubiertosPorLugar(anterior, interesesPlan));
        const mismoConjunto = interesesCandidato.size === interesesAnteriores.size &&
            [...interesesCandidato].every(interes => interesesAnteriores.has(interes));
        if (mismoConjunto && interesesCandidato.size > 0) penalizacion += 12;
    });

    return penalizacion;
}

function generarSecuenciasCandidatas(candidatos, maxParadas, limiteCandidatos = 10) {
    const lugares = (Array.isArray(candidatos) ? candidatos : [])
        .slice(0, Math.max(1, limiteCandidatos))
        .map(item => item?.lugar || item)
        .filter(Boolean);
    const secuencias = [];
    const explorar = (actual, restantes) => {
        if (actual.length > 0) secuencias.push([...actual]);
        if (actual.length >= maxParadas) return;
        restantes.forEach((lugar, indice) => {
            explorar([...actual, lugar], [...restantes.slice(0, indice), ...restantes.slice(indice + 1)]);
        });
    };
    explorar([], lugares);
    return secuencias;
}

function evaluarSecuencia(secuencia, contextoPlan, origenCoords) {
    const lugares = Array.isArray(secuencia) ? secuencia : [];
    const contexto = contextoPlan || {};
    const origen = coordenadasValidasPlan(origenCoords) ? { coordenadas: origenCoords } : null;
    let anterior = origen;
    let horasAcumuladas = 0;
    let minutosTraslado = 0;
    let distanciaTotalKm = 0;
    let distanciaDesconocida = false;
    let utilidad = 0;
    let penalizacionDiversidad = 0;
    let retrocesoKm = 0;
    const trazado = [];
    const usados = new Set();

    for (const lugar of lugares) {
        const key = String(lugar?.id ?? lugar?.nombre);
        if (!lugar || usados.has(key)) return { viable: false, lugares, motivo: "Experiencia repetida o inválida." };
        const traslado = anterior ? calcularTiempoTraslado(anterior, lugar) : { horas: 0, minutos: 0, distanciaKm: 0 };
        const tieneDistancia = anterior && coordenadasValidasPlan(anterior.coordenadas) && coordenadasValidasPlan(lugar.coordenadas) && Number.isFinite(Number(traslado.distanciaKm));
        if (tieneDistancia) {
            distanciaTotalKm += Number(traslado.distanciaKm);
            if (trazado.length >= 2 && coordenadasValidasPlan(trazado[trazado.length - 2].lugar?.coordenadas)) {
                const anteriorAnterior = trazado[trazado.length - 2].lugar;
                const retorno = calcularDistanciaKm(anteriorAnterior.coordenadas.lat, anteriorAnterior.coordenadas.lng, lugar.coordenadas.lat, lugar.coordenadas.lng);
                if (Number.isFinite(retorno) && retorno < Number(traslado.distanciaKm) * 0.5) retrocesoKm += Number(traslado.distanciaKm);
            }
        } else if (anterior) {
            distanciaDesconocida = true;
        }

        const trasladoHoras = numeroFinitoPlan(traslado.horas, 0);
        const horaInicio = numeroFinitoPlan(contexto.horaNumero, 9) + horasAcumuladas + trasladoHoras;
        const contextoParada = {
            ...contexto,
            horaNumero: horaInicio % 24,
            horaTexto: formatoHoraDecimalPlan(horaInicio % 24),
            diaSemana: (numeroFinitoPlan(contexto.diaSemana, 0) + Math.floor(horaInicio / 24)) % 7,
            momento: momentoParaHora(horaInicio % 24)
        };
        if (!esCandidatoValido(lugar, { intereses: contexto.intereses, contexto: contextoParada, presupuesto: contexto.presupuesto, compania: contexto.compania })) {
            return { viable: false, lugares, motivo: `La experiencia ${lugar.nombre} no es viable en su posición.` };
        }
        const madrugada = evaluarMadrugadaNocturna(lugar, contextoParada);
        const duracionIdeal = obtenerDuracionPlan(lugar);
        const duracion = obtenerDuracionEfectivaPlan(lugar, contextoParada);
        const bloqueInvalido = !esCompatibleDuranteBloque(lugar, contextoParada) && !madrugada.puedeRecomendarse;
        if (bloqueInvalido || horasAcumuladas + trasladoHoras + duracion > numeroFinitoPlan(contexto.limiteHoras, 5) + 0.001) {
            return { viable: false, lugares, motivo: `La secuencia no permite completar ${lugar.nombre}.` };
        }
        utilidad += calcularPuntaje(lugar, contextoParada, contextoParada.compania, contextoParada.intereses);
        penalizacionDiversidad += calcularPenalizacionDiversidad(lugar, trazado.map(item => item.lugar), contexto.intereses);
        horasAcumuladas += trasladoHoras + duracion;
        minutosTraslado += Number(traslado.minutos) || 0;
        trazado.push({
            lugar,
            horaInicio,
            horaFin: horaInicio + duracion,
            duracionIdeal,
            duracionEfectiva: duracion,
            duracionParcial: madrugada.puedeRecomendarse && madrugada.duracionParcial,
            traslado
        });
        usados.add(key);
        anterior = lugar;
    }

    const costo = calcularCostoItinerario(lugares);
    const penalizacionRuta = distanciaTotalKm * 1.35 + minutosTraslado * 0.12 + retrocesoKm * 2 + penalizacionDiversidad;
    const puntajeFinal = utilidad + lugares.length * 12 - penalizacionRuta;
    return {
        viable: lugares.length > 0,
        lugares,
        distanciaTotalKm: distanciaDesconocida ? null : distanciaTotalKm,
        minutosTraslado,
        horasTotales: horasAcumuladas,
        costo,
        utilidad,
        diversidad: -penalizacionDiversidad,
        penalizacionRuta,
        puntajeFinal,
        trazado
    };
}

function compararEvaluacionesRuta(a, b) {
    if (!a) return b;
    if (!b) return a;
    if (b.puntajeFinal !== a.puntajeFinal) return b.puntajeFinal > a.puntajeFinal ? b : a;
    if (b.lugares.length !== a.lugares.length) return b.lugares.length > a.lugares.length ? b : a;
    if (Number.isFinite(a.distanciaTotalKm) && Number.isFinite(b.distanciaTotalKm) && b.distanciaTotalKm !== a.distanciaTotalKm) return b.distanciaTotalKm < a.distanciaTotalKm ? b : a;
    const costoA = a.costo;
    const costoB = b.costo;
    if (costoA?.estado === "confirmado" && costoB?.estado === "confirmado" && costoA.moneda && costoA.moneda === costoB.moneda && Number.isFinite(costoA.total) && Number.isFinite(costoB.total) && costoA.total !== costoB.total) {
        return costoB.total < costoA.total ? b : a;
    }
    return a;
}

function optimizarRutaGlobal(candidatos, contextoPlan, origenCoords) {
    const maxParadas = contextoPlan?.limiteHoras <= 2 ? 1 : contextoPlan?.limiteHoras <= 3 ? 2 : contextoPlan?.limiteHoras <= 5 ? 3 : 4;
    const secuencias = generarSecuenciasCandidatas(candidatos, maxParadas, 10);
    let mejor = null;
    secuencias.forEach(secuencia => {
        mejor = compararEvaluacionesRuta(mejor, evaluarSecuencia(secuencia, contextoPlan, origenCoords));
    });
    return mejor;
}

function seleccionarParadasContextuales(candidatos, limiteHoras, contextoPlan, origenCoords, restriccionesEfectivas = {}) {
    const seleccionados = [];
    const usados = new Set();
    const interesesPlan = Array.isArray(contextoPlan?.intereses) ? contextoPlan.intereses : [];
    const tieneInteresesEfectivos = Object.prototype.hasOwnProperty.call(restriccionesEfectivas, "intereses");
    const tienePresupuestoEfectivo = Object.prototype.hasOwnProperty.call(restriccionesEfectivas, "presupuesto");
    const tieneCompaniaEfectiva = Object.prototype.hasOwnProperty.call(restriccionesEfectivas, "compania");
    const interesesEfectivos = tieneInteresesEfectivos ? restriccionesEfectivas.intereses : interesesPlan;
    const presupuestoEfectivo = tienePresupuestoEfectivo ? restriccionesEfectivas.presupuesto : contextoPlan?.presupuesto;
    const companiaEfectiva = tieneCompaniaEfectiva ? restriccionesEfectivas.compania : contextoPlan?.compania;
    const interesesCubiertos = new Set();
    const maxParadas = limiteHoras <= 2 ? 1 : limiteHoras <= 3 ? 2 : limiteHoras <= 5 ? 3 : 4;
    let horasAcumuladas = 0;
    let anterior = coordenadasValidasPlan(origenCoords) ? { coordenadas: origenCoords } : null;
    const pendientes = [...candidatos];

    while (pendientes.length && seleccionados.length < maxParadas) {
        // En selecciones múltiples se premian intereses todavía no cubiertos.
        // Para un único interés el bono es cero y Comer conserva prioridad fuerte.
        pendientes.sort((a, b) => {
            const nuevasA = interesesCubiertosPorLugar(a.lugar, interesesPlan).filter(i => !interesesCubiertos.has(i)).length;
            const nuevasB = interesesCubiertosPorLugar(b.lugar, interesesPlan).filter(i => !interesesCubiertos.has(i)).length;
            const penalizacionA = calcularPenalizacionDiversidad(a.lugar, seleccionados, interesesPlan);
            const penalizacionB = calcularPenalizacionDiversidad(b.lugar, seleccionados, interesesPlan);
            return (b.puntaje + nuevasB * 140 - penalizacionB) - (a.puntaje + nuevasA * 140 - penalizacionA);
        });
        const candidato = pendientes.shift();
        if (!candidato) break;
        const lugar = candidato.lugar;
        const key = String(lugar.id ?? lugar.nombre);
        if (usados.has(key)) continue;
        const traslado = anterior ? calcularTiempoTraslado(anterior, lugar) : { horas: 0, minutos: 0 };
        const trasladoHoras = numeroFinitoPlan(traslado.horas, 0);
        const horaInicio = numeroFinitoPlan(contextoPlan.horaNumero, 9) + horasAcumuladas + trasladoHoras;
        const contextoParada = {
            ...contextoPlan,
            horaNumero: horaInicio % 24,
            horaTexto: formatoHoraDecimalPlan(horaInicio % 24),
            diaSemana: (numeroFinitoPlan(contextoPlan.diaSemana, 0) + Math.floor(horaInicio / 24)) % 7,
            momento: momentoParaHora(horaInicio % 24),
            intereses: interesesEfectivos,
            presupuesto: presupuestoEfectivo,
            compania: companiaEfectiva
        };
        const madrugada = evaluarMadrugadaNocturna(lugar, contextoParada);
        const duracion = obtenerDuracionEfectivaPlan(lugar, contextoParada);

        if (!esCandidatoValido(lugar, { intereses: interesesEfectivos, contexto: contextoParada, presupuesto: presupuestoEfectivo, compania: companiaEfectiva })) continue;
        if (!esCompatibleDuranteBloque(lugar, contextoParada) && !madrugada.puedeRecomendarse) continue;
        if (horasAcumuladas + trasladoHoras + duracion > limiteHoras + 0.001) continue;

        seleccionados.push(lugar);
        usados.add(key);
        interesesCubiertosPorLugar(lugar, interesesPlan).forEach(interes => interesesCubiertos.add(interes));
        horasAcumuladas += trasladoHoras + duracion;
        anterior = lugar;
    }

    return { seleccionados, horasAcumuladas };
}

function generarPlan() {
    if (typeof SoundFX !== "undefined") SoundFX.play("plan");
    if (typeof AppState !== "undefined") AppState.currentPlanId = null;

    const intereses = typeof window.obtenerInteresesPlan === "function"
        ? window.obtenerInteresesPlan()
        : [AppState.interes || "naturaleza"];
    const interesesNormalizados = normalizarInteresesPlan(intereses);
    if (!interesesNormalizados.length) interesesNormalizados.push("naturaleza");
    const tiempo = AppState.tiempo || "medio día";
    const compania = AppState.compania || "solo";
    const presupuesto = AppState.presupuesto || "medio";
    const limiteHoras = horasDisponibles(tiempo);
    const contextoAhora = construirContextoAhora({ intereses: interesesNormalizados, tiempo, compania, presupuesto });
    const ahora = {
        momento: contextoAhora.momento,
        horaNumero: contextoAhora.horaNumero,
        horaTexto: contextoAhora.horaTexto,
        diaSemana: contextoAhora.diaSemana,
        esNocturnoTardio: contextoAhora.esNocturnoTardio
    };
    const inicio = obtenerInicioContextual(interesesNormalizados, ahora);
    const origenCoords = contextoAhora.ubicacion.coords;


    const contextoPlan = {
        ...inicio.contexto,
        horaReal: contextoAhora.horaReal,
        horaTextoReal: contextoAhora.horaTextoReal,
        horaInicioPlan: inicio.contexto.horaNumero,
        horaInicioPlanTexto: inicio.contexto.horaTexto,
        intereses: interesesNormalizados,
        presupuesto,
        compania,
        tiempo,
        limiteHoras,
        origenCoords,
        contextoAhora,
        climaEstado: contextoAhora.clima.estado,
        fuenteUbicacion: contextoAhora.ubicacion.fuente
    };
    const snapshotPlan = crearSnapshotContextoPlan(contextoAhora, contextoPlan);
    itinerarioContexto = {
        interes: interesesNormalizados[0] || "naturaleza",
        intereses: interesesNormalizados,
        tiempo,
        compania,
        presupuesto,
        limiteHoras,
        ahora,
        contextoAhora,
        contextoPlan: snapshotPlan,
        horaReal: contextoAhora.horaReal,
        horaTextoReal: contextoAhora.horaTextoReal,
        horaInicioPlan: inicio.contexto.horaNumero,
        horaInicioPlanTexto: inicio.contexto.horaTexto,
        origenCoords: snapshotPlan.origenCoords,
        adaptacion: { activa: false, nivel: "exacto", mensaje: "", criteriosRelajados: [] }
    };
    itinerarioAdaptacion = itinerarioContexto.adaptacion;

    // Se relaja solo grupo/presupuesto si hace falta; no se relajan clima, horario ni duplicados.
    let restriccionesEfectivas = { intereses: interesesNormalizados, presupuesto, compania };
    let adaptacionSeleccion = { activa: false, nivel: "exacto", mensaje: "", criteriosRelajados: [] };
    let candidatos = obtenerCandidatosPlan(interesesNormalizados, contextoPlan, presupuesto, compania, origenCoords);
    // Una preferencia única es un filtro fuerte: no se reemplaza Comer por
    // naturaleza, miradores u otras categorías solo porque tengan mejor score.
    const puedeRelajarIntereses = interesesNormalizados.length > 1;
    if (!candidatos.length) {
        restriccionesEfectivas = { intereses: interesesNormalizados, presupuesto, compania: null };
        adaptacionSeleccion = {
            activa: true,
            nivel: "compania",
            mensaje: "Tuki mantuvo tus intereses, el horario y el presupuesto, y amplió la preferencia de compañía para encontrar una opción válida.",
            criteriosRelajados: ["compañía"]
        };
        candidatos = obtenerCandidatosPlan(interesesNormalizados, contextoPlan, presupuesto, compania, origenCoords, { compania: true });
    }
    if (!candidatos.length) {
        restriccionesEfectivas = { intereses: interesesNormalizados, presupuesto: null, compania: null };
        adaptacionSeleccion = {
            activa: true,
            nivel: "presupuesto",
            mensaje: "Tuki mantuvo tus intereses y el horario, y amplió compañía y presupuesto para encontrar una opción válida.",
            criteriosRelajados: ["compañía", "presupuesto"]
        };
        candidatos = obtenerCandidatosPlan(interesesNormalizados, contextoPlan, presupuesto, compania, origenCoords, { compania: true, presupuesto: true });
    }
    if (!candidatos.length && puedeRelajarIntereses) {
        restriccionesEfectivas = { intereses: [], presupuesto: null, compania: null };
        adaptacionSeleccion = {
            activa: true,
            nivel: "intereses",
            mensaje: "Tuki amplió compañía, presupuesto e intereses para mantener una propuesta turística válida.",
            criteriosRelajados: ["compañía", "presupuesto", "preferencias"]
        };
        candidatos = obtenerCandidatosPlan(interesesNormalizados, contextoPlan, presupuesto, compania, origenCoords, { compania: true, presupuesto: true, intereses: true });
    }
    if (candidatos.length > 0) {
        itinerarioContexto.adaptacion = adaptacionSeleccion;
        itinerarioAdaptacion = adaptacionSeleccion;
    }

    const contextoRuta = { ...contextoPlan, ...restriccionesEfectivas };
    const resultadoGreedy = seleccionarParadasContextuales(candidatos, limiteHoras, contextoPlan, origenCoords, restriccionesEfectivas);
    let resultado = resultadoGreedy;
    try {
        const optimizado = optimizarRutaGlobal(candidatos, contextoRuta, origenCoords);
        if (optimizado?.viable && optimizado.lugares?.length) {
            resultado = { seleccionados: optimizado.lugares, horasAcumuladas: optimizado.horasTotales };
            itinerarioContexto.optimizacionRuta = optimizado;
        }
    } catch (error) {
        console.warn("No se pudo optimizar la ruta; se conserva la selección existente.", error);
    }
    let planificarParaManana = inicio.planificarParaManana;
    if (!Array.isArray(resultado?.seleccionados) || resultado.seleccionados.length === 0) {
        const respaldo = construirPlanConFallback({
            interes: interesesNormalizados[0] || "actividades",
            tiempo,
            compania,
            presupuesto,
            limiteHoras,
            ahora: inicio.contexto
        });
        if (respaldo.lugares.length > 0) {
            resultado = { seleccionados: respaldo.lugares, horasAcumuladas: respaldo.horasAcumuladas };
            planificarParaManana = inicio.planificarParaManana || respaldo.planificarParaManana;
            itinerarioContexto.contextoPlan = crearSnapshotContextoPlan(contextoAhora, {
                ...contextoPlan,
                ...respaldo.contextoPlan,
                intereses: interesesNormalizados,
                presupuesto,
                compania,
                tiempo,
                limiteHoras,
                origenCoords
            });
            itinerarioContexto.adaptacion = respaldo.adaptacion;
            itinerarioAdaptacion = respaldo.adaptacion;
            delete itinerarioContexto.optimizacionRuta;
        }
    }
    itinerarioActual = Array.isArray(resultado?.seleccionados) ? resultado.seleccionados : [];
    itinerarioContexto.costo = calcularCostoItinerario(itinerarioActual, itinerarioContexto);
    renderizarItinerario(itinerarioActual, itinerarioActual.length, planificarParaManana);
}

// ========================================================
// COMPARTIR PLAN
// ========================================================

function construirTextoPlanCompartible(lugares = itinerarioActual) {
    const items = Array.isArray(lugares) ? lugares : [];
    const contexto = itinerarioContexto?.contextoPlan || itinerarioContexto?.ahora || {};
    const horaInicio = contexto.horaTexto || formatoHoraDecimalPlan(contexto.horaNumero);
    const lineas = items.map((lugar, index) => {
        const trazado = itinerarioContexto.optimizacionRuta?.trazado?.[index];
        const hora = Number.isFinite(Number(trazado?.horaInicio))
            ? formatearMinutosAHorario(Math.round(Number(trazado.horaInicio) * 60))
            : horaInicio;
        return `${hora} — ${lugar.nombre}`;
    });
    return [
        "🌴 Mi plan en Iguazú",
        lineas.join("\n"),
        "",
        "Armado con Iguazú Assist"
    ].filter(Boolean).join("\n");
}

async function compartirPlan() {
    const texto = construirTextoPlanCompartible();
    const shareData = {
        title: "Mi plan en Iguazú · Iguazú Assist",
        text: texto
    };

    try {
        if (navigator.share) {
            await navigator.share(shareData);
            return;
        }
        if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(texto);
            if (typeof mostrarToast === "function") mostrarToast("Plan copiado para compartir");
            return;
        }
    } catch (error) {
        if (error?.name === "AbortError") return;
        console.info("No se pudo compartir el plan.", error);
    }
    if (typeof mostrarToast === "function") mostrarToast("Copiá el plan desde esta pantalla");
}

window.construirTextoPlanCompartible = construirTextoPlanCompartible;
window.compartirPlan = compartirPlan;

// ========================================================
// RENDERIZADO DEL ITINERARIO Y MÉTRICAS
// ========================================================

function renderizarItinerario(lugares, cantidadPrincipales, planificarParaManana) {
    const contenedor = document.querySelector("#plan-result");
    if (!contenedor) return;

    if (!lugares || lugares.length === 0) {
        const ahora = itinerarioContexto.ahora || contextoDeAhora();
        const respaldo = construirPlanConFallback({
            interes: itinerarioContexto.interes || "actividades",
            tiempo: itinerarioContexto.tiempo || "medio día",
            compania: itinerarioContexto.compania || "solo",
            presupuesto: itinerarioContexto.presupuesto || "medio",
            limiteHoras: itinerarioContexto.limiteHoras || 5,
            ahora: itinerarioContexto.contextoPlan || ahora
        });

        if (respaldo.lugares.length > 0) {
            lugares = respaldo.lugares;
            cantidadPrincipales = respaldo.cantidadPrincipales;
            planificarParaManana = Boolean(planificarParaManana || respaldo.planificarParaManana);
            itinerarioActual = respaldo.lugares;
            itinerarioContexto.contextoPlan = respaldo.contextoPlan;
            itinerarioContexto.adaptacion = respaldo.adaptacion;
            itinerarioAdaptacion = respaldo.adaptacion;
        } else {
            contenedor.innerHTML = `
                <div style="text-align: center; padding: 24px;">
                    <div style="font-size: 44px; margin-bottom: 10px;">🦜</div>
                    <h3>Tuki sigue acá para ayudarte</h3>
                    <p style="color: var(--color-text-muted);">No pudimos leer el catálogo turístico. Recargá la aplicación para recuperar las recomendaciones guardadas.</p>
                </div>
            `;
            contenedor.classList.remove("hidden");
            return;
        }
    }

    const { interes, intereses, tiempo, compania, presupuesto, ahora } = itinerarioContexto;
    const contextoPlan = itinerarioContexto.contextoPlan || ahora;
    const adaptacion = itinerarioContexto.adaptacion || itinerarioAdaptacion;
    const interesesDelPlan = Array.isArray(intereses) ? intereses : [interes];
    const soloCompras = interesesDelPlan.length === 1 && interesesDelPlan.includes("compras");
    const horaPlanTexto = String(contextoPlan.horaTexto || formatoHoraDecimalPlan(contextoPlan.horaNumero)).replace(/\s*hs$/i, "");

    let minutosInicio = Math.round(numeroFinitoPlan(contextoPlan.horaNumero, 10) * 60);
    let avisoHorario = "";

    if (planificarParaManana) {
        avisoHorario = soloCompras
            ? "🌙 Ya es tarde para comenzar las compras hoy. Armamos tu plan para mañana a las 10:00 hs, cuando comienzan las opciones comerciales."
            : `🌙 Son más de las 20:00 hs y los parques naturales ya cerraron por hoy. Armamos tu plan optimizado para comenzar mañana a las ${horaPlanTexto} hs.`;
    } else if (interesesDelPlan.includes("noche")) {
        avisoHorario = `🌙 Plan nocturno generado, configurado para iniciar a las ${horaPlanTexto} hs.`;
    } else {
        avisoHorario = soloCompras && Number(contextoPlan.horaNumero) === 10
            ? "🛍️ Adaptamos tu plan de compras para comenzar a las 10:00 hs."
            : `⏱️ Plan generado para comenzar a las ${horaPlanTexto} hs, adaptado a tus tiempos.`;
    }

    let minutosRecorrido = minutosInicio;
    let duracionTotalHoras = 0;

    let tarjetasHtml = "";
    const trazadoFinal = Array.isArray(itinerarioContexto.optimizacionRuta?.trazado)
        ? itinerarioContexto.optimizacionRuta.trazado
        : [];

    lugares.forEach((lugar, index) => {
        const nombre = planPlaceText(lugar, "nombre", "Lugar sin nombre");
        const descripcion = planPlaceText(lugar, "descripcion", "Información no disponible.");
        const ubicacion = planPlaceText(lugar, "ubicacion", "Consultar ubicación");
        const precioCatalogo = planPlaceText(lugar, "precioTexto");
        const esComplemento = index >= cantidadPrincipales;
        const tipoEtiqueta = esComplemento ? "➕ Parada recomendada" : "⭐ Parada principal";
const paradaCalculada = trazadoFinal[index]?.lugar?.id === lugar?.id
    ? trazadoFinal[index]
    : trazadoFinal.find(item => item?.lugar?.id === lugar?.id);
        // Si hay una parada anterior, calcular y agregar el tiempo de traslado
        let conectorHtml = "";
        if (index > 0) {
            const lugarPrevio = lugares[index - 1];
            const infoTraslado = calcularTiempoTraslado(lugarPrevio, lugar);
            if (infoTraslado.minutos > 0) {
                minutosRecorrido += infoTraslado.minutos;
                duracionTotalHoras += infoTraslado.horas;
                conectorHtml = infoTraslado.badgeHtml;
            }
        }

        const duracionIdeal = numeroFinitoPlan(paradaCalculada?.duracionIdeal, obtenerDuracionPlan(lugar));
        const duracionLugar = numeroFinitoPlan(paradaCalculada?.duracionEfectiva, duracionIdeal);
        const minutosInicioParada = Number.isFinite(Number(paradaCalculada?.horaInicio))
            ? Math.round(Number(paradaCalculada.horaInicio) * 60)
            : minutosRecorrido;
        const minutosFinParada = Number.isFinite(Number(paradaCalculada?.horaFin))
            ? Math.round(Number(paradaCalculada.horaFin) * 60)
            : minutosInicioParada + Math.round(duracionLugar * 60);
        const horaInicioStr = formatearMinutosAHorario(minutosInicioParada);
        const horaFinStr = formatearMinutosAHorario(minutosFinParada);
        const motivo = generarMotivoRecomendacion(lugar, itinerarioContexto.contextoPlan || ahora, compania);

        duracionTotalHoras += duracionLugar;
        minutosRecorrido = minutosFinParada;

        const indoorBadge = lugar.alAireLibre ? "🌿 Al aire libre" : "🏛️ Techado / Interior";
        const precioTexto = lugar.gratuito === true
            ? "🎁 Gratis"
            : textoSeguro(precioCatalogo || lugar.precio?.texto || lugar.precio, "💰 Consultar tarifa");
        const distanciaTexto = coordenadasValidasPlan(itinerarioContexto.origenCoords) && coordenadasValidasPlan(lugar.coordenadas)
            ? `📍 ${formatearDistancia(calcularDistanciaKm(itinerarioContexto.origenCoords.lat, itinerarioContexto.origenCoords.lng, lugar.coordenadas.lat, lugar.coordenadas.lng))}`
            : "📍 Ubicación disponible en detalle";
        const queryMaps = encodeURIComponent(`${lugar.nombre}, ${lugar.direccion || lugar.ubicacion}`);

        tarjetasHtml += `
            ${conectorHtml}
            <article class="plan-card">
                <div class="plan-card-number">${index + 1}</div>
                <div class="plan-card-icon">${lugar.icono}</div>
                <div class="plan-card-info">
                    <div class="plan-card-meta">
                            <span class="plan-time-tag">${horaInicioStr} a ${horaFinStr} (~${formatearDuracionHumana(Math.round(duracionLugar * 60))})</span>
                        <span class="plan-type-tag">${tipoEtiqueta}</span>
                        <span class="tag-badge" style="font-size:10.5px;">${indoorBadge}</span>
                    </div>
                    <h4>${escapar(lugar.nombre)}</h4>
                    <div class="plan-card-reason">${motivo}</div>
                    <div class="plan-card-details">
                        <span>${escapar(precioTexto)}</span>
                        <span>${escapar(distanciaTexto)}</span>
                        <span>📌 ${escapar(ubicacion || lugar.direccion || "Consultar ubicación")}</span>
                    </div>
                    <p>${escapar(descripcion)}</p>
                    
                    <div class="plan-card-actions">
                        <button class="btn-card-action primary" onclick="mostrarDetalle('${escaparAttr(lugar.nombre)}')">
                            ⭐ Ver detalle
                        </button>
                        <button class="btn-card-action" onclick="cambiarActividad(${index}, '${escaparAttr(lugar.nombre)}')">
                            🔄 Cambiar por otra
                        </button>
                        <a class="btn-card-action" href="https://www.google.com/maps/search/?api=1&query=${queryMaps}" target="_blank" rel="noopener noreferrer">
                            📍 Cómo llegar
                        </a>
                    </div>
                </div>
            </article>
        `;
    });

    // Enlace multiruta Google Maps con waypoints
    const destinos = lugares.map(l => encodeURIComponent(`${l.nombre}, ${l.direccion || l.ubicacion}`));
    let enlaceGoogleMaps = "";
    const origenContextual = coordenadasValidasPlan(itinerarioContexto.origenCoords)
        ? `${Number(itinerarioContexto.origenCoords.lat)},${Number(itinerarioContexto.origenCoords.lng)}`
        : null;
    if (destinos.length === 1 && origenContextual) {
        enlaceGoogleMaps = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(origenContextual)}&destination=${destinos[0]}`;
    } else if (destinos.length === 1) {
        enlaceGoogleMaps = `https://www.google.com/maps/search/?api=1&query=${destinos[0]}`;
    } else if (destinos.length > 1) {
        const origen = encodeURIComponent(origenContextual || `${lugares[0].nombre}, ${lugares[0].direccion || lugares[0].ubicacion}`);
        const destinoFinal = destinos[destinos.length - 1];
        const waypoints = destinos.slice(1, -1).join("%7C");
        enlaceGoogleMaps = `https://www.google.com/maps/dir/?api=1&origin=${origen}&destination=${destinoFinal}${waypoints ? `&waypoints=${waypoints}` : ""}`;
    }

const climaPlan = contextoPlan.clima || contextoPlan.contextoAhora?.clima || climaActual;

// Alternativas cubiertas adicionales para lluvia, siempre válidas para el horario y el perfil.

// Plan B SOLO si llueve
    let planBHtml = "";
    if (climaPlan.estado === "listo" && climaPlan.lluvia) {
        const nombresUsados = lugares.map(l => l.nombre);
        const opcionesCubiertas = lugaresReales
            .filter(esLugarValidoParaItinerario)
            .filter(l => !l.alAireLibre && !nombresUsados.includes(l.nombre))
            .filter(l => esCompatibleConPresupuesto(l, presupuesto))
            .filter(l => l.aptoPara && l.aptoPara.includes(compania))
            .filter(l => estaDisponibleDurantePlan(l, contextoPlan))
            .sort((a, b) => calcularPuntaje(b, contextoPlan, compania, b.categoria) - calcularPuntaje(a, contextoPlan, compania, a.categoria))
            .slice(0, 2);

        if (opcionesCubiertas.length > 0) {
            const itemsB = opcionesCubiertas.map(l => `
                <article class="plan-card" style="margin-top: 10px; cursor: pointer;" onclick="mostrarDetalle('${escaparAttr(l.nombre)}')">
                    <div class="plan-card-icon">${l.icono}</div>
                    <div class="plan-card-info">
                        <span class="plan-time-tag" style="background:#e0f2fe; color:#0369a1;">🌧️ Alternativa bajo techo</span>
                        <h4>${escapar(l.nombre)}</h4>
                        <p>${escapar(l.descripcion)}</p>
                        <span class="tag-badge">📍 ${escapar(l.ubicacion)}</span>
                    </div>
                </article>
            `).join("");

            planBHtml = `
                <div class="plan-b-section">
                    <div class="plan-b-header">
                        <span>🌧️</span>
                        <h4>Plan B para la lluvia</h4>
                    </div>
                    <p style="font-size:13.5px; color:var(--color-text-muted); margin-bottom:10px;">
                        Por precipitaciones en Iguazú, también podés sumar estas opciones techadas:
                    </p>
                    ${itemsB}
                </div>
            `;
        }
    }

    const textoPresupuesto = presupuesto === "economico" ? "Económico" : presupuesto === "medio" ? "Medio" : "Flexible / Sin límite";
    const textoCompania = compania === "solo" ? "Solo" : compania === "pareja" ? "En Pareja" : compania === "familia" ? "En Familia" : compania === "niños" ? "Con Niños" : "Con Amigos";
    const avisoAdaptacionHtml = adaptacion && adaptacion.activa ? `
        <div class="plan-adaptation-notice" role="status">
            <span class="plan-adaptation-icon">🦜</span>
            <p><strong>Tuki adaptó tu propuesta.</strong> ${escapar(adaptacion.mensaje)}</p>
        </div>
    ` : "";

    contenedor.innerHTML = `
        ${avisoAdaptacionHtml}
        <div class="plan-result-header">
            <div class="plan-title-row">
                <h3>🌴 Tu Itinerario en Iguazú</h3>
                <span class="metric-pill" style="background:#fef3c7; color:#92400e; border-color:#fde68a;">
                    ${climaPlan.icono || "🌥️"} ${climaPlan.descripcion || "Clima no disponible"}
                </span>
            </div>
            ${typeof AppState !== "undefined" && AppState.currentPlanId ? `<div class="plan-saved-indicator">📅 Mi plan guardado · recuperado desde Mis planes</div>` : ""}
            <p style="font-size:14px; color:var(--color-text-muted); margin-bottom: 10px;">${avisoHorario}</p>
            
            <div class="plan-metrics-bar">
                <span class="metric-pill">⏱️ ~${formatearDuracionHumana(Math.round(duracionTotalHoras * 60))}</span>
                <span class="metric-pill">👥 ${textoCompania}</span>
                <span class="metric-pill">💰 ${textoPresupuesto}</span>
                <span class="metric-pill">📍 ${lugares.length} paradas</span>
            </div>
            <div class="plan-share-actions">
                <button class="btn-card-action primary" type="button" onclick="compartirPlan()">↗ Compartir mi plan</button>
                <button class="btn-card-action" type="button" onclick="guardarPlanActual()">💾 ${typeof AppState !== "undefined" && AppState.currentPlanId ? "Guardar cambios" : "Guardar plan"}</button>
                <span>${typeof AppState !== "undefined" && AppState.currentPlanId ? "Plan guardado · podés actualizarlo o compartirlo." : "Tu itinerario queda listo para guardar o enviar."}</span>
            </div>
        </div>

        <div class="plan-places-list">
            ${tarjetasHtml}
        </div>

        ${planBHtml}

        <button class="map-route-btn" onclick="window.open('${enlaceGoogleMaps}', '_blank')">
            🗺️ VER RECORRIDO COMPLETO EN GOOGLE MAPS
        </button>
    `;

    contenedor.classList.remove("hidden");
    contenedor.scrollIntoView({ behavior: "smooth", block: "start" });
}

// ========================================================
// 🔄 FUNCIONALIDAD: CAMBIAR UNA ACTIVIDAD DEL PLAN
// ========================================================

function cambiarActividad(indice, nombreActual) {
    if (typeof SoundFX !== "undefined") SoundFX.play("cambio");
    const lugarActual = itinerarioActual[indice];
    if (!lugarActual) return;

const intereses = itinerarioContexto.intereses || [itinerarioContexto.interes || "naturaleza"];
const contextoPlan = itinerarioContexto.contextoPlan || contextoDeAhora();
const usados = new Set(itinerarioActual.map(lugar => String(lugar.id ?? lugar.nombre)));
const candidatos = lugaresReales
    .filter(lugar => !usados.has(String(lugar.id ?? lugar.nombre)) || lugar === lugarActual)
    .filter(lugar => esCandidatoValido(lugar, {
        intereses,
        contexto: contextoPlan,
        presupuesto: itinerarioContexto.presupuesto,
        compania: itinerarioContexto.compania
    }))
    .map(lugar => ({ lugar, puntaje: calcularPuntaje(lugar, contextoPlan, itinerarioContexto.compania, intereses) }))
    .filter(item => Number.isFinite(item.puntaje))
    .sort((a, b) => b.puntaje - a.puntaje);

const reemplazo = candidatos.find(item => {
    if (String(item.lugar.id ?? item.lugar.nombre) === String(lugarActual.id ?? lugarActual.nombre)) return false;
    const propuesta = [...itinerarioActual];
    propuesta[indice] = item.lugar;
    return evaluarSecuencia(propuesta, contextoPlan, itinerarioContexto.origenCoords)?.viable;
})?.lugar;
if (!reemplazo) {
    const mensaje = "No encontramos otra alternativa disponible para este horario, clima y presupuesto.";
    if (typeof mostrarToast === "function") mostrarToast(`⚠️ ${mensaje}`);
    else console.info(mensaje);
    return;
}

const propuesta = [...itinerarioActual];
propuesta[indice] = reemplazo;

const idsPropuesta = propuesta.map(lugar =>
    String(lugar?.id ?? lugar?.nombre)
);

if (new Set(idsPropuesta).size !== idsPropuesta.length) {
    if (typeof mostrarToast === "function") {
        mostrarToast("⚠️ La alternativa produciría un duplicado.");
    }
    return;
}

const evaluacion = evaluarSecuencia(
    propuesta,
    contextoPlan,
    itinerarioContexto.origenCoords
);

if (!evaluacion?.viable) {
    if (typeof mostrarToast === "function") {
        mostrarToast("⚠️ La alternativa no mantiene un itinerario viable.");
    }
    return;
}

itinerarioActual[indice] = reemplazo;
itinerarioContexto.optimizacionRuta = evaluacion;
itinerarioContexto.costo = calcularCostoItinerario(itinerarioActual);

const planificarParaManana =
    Number.isFinite(Number(itinerarioContexto.ahora?.diaSemana)) &&
    Number.isFinite(Number(contextoPlan.diaSemana)) &&
    Number(itinerarioContexto.ahora.diaSemana) !== Number(contextoPlan.diaSemana);

renderizarItinerario(
    itinerarioActual,
    itinerarioActual.length,
    planificarParaManana
);

if (typeof mostrarToast === "function") {
    mostrarToast("🔄 Reemplazado por: " + reemplazo.nombre);
}
    }

function agregarActividadAlItinerario(lugar) {
    if (!lugar || !Array.isArray(itinerarioActual) || !itinerarioActual.length || !itinerarioContexto) return false;

    const claveNueva = String(lugar.id ?? lugar.nombre);
    if (itinerarioActual.some(item => String(item?.id ?? item?.nombre) === claveNueva)) return false;

    const contextoPlan = itinerarioContexto.contextoPlan || itinerarioContexto.ahora || {};
    const contextosInsercion = [
        contextoPlan,
        {
            ...contextoPlan,
            intereses: [],
            limiteHoras: Math.max(24, numeroFinitoPlan(contextoPlan.limiteHoras, 5))
        }
    ];
    let mejorEvaluacion = null;
    let mejorSecuencia = null;

    for (const contextoInsercion of contextosInsercion) {
        for (let indice = 0; indice <= itinerarioActual.length; indice += 1) {
            const propuesta = [
                ...itinerarioActual.slice(0, indice),
                lugar,
                ...itinerarioActual.slice(indice)
            ];
            const ids = propuesta.map(item => String(item?.id ?? item?.nombre));
            if (new Set(ids).size !== ids.length) continue;

            const evaluacion = evaluarSecuencia(propuesta, contextoInsercion, itinerarioContexto.origenCoords);
            if (!evaluacion?.viable) continue;
            if (!mejorEvaluacion || compararEvaluacionesRuta(mejorEvaluacion, evaluacion) === evaluacion) {
                mejorEvaluacion = evaluacion;
                mejorSecuencia = propuesta;
            }
        }
        if (mejorSecuencia) break;
    }

    if (!mejorSecuencia || !mejorEvaluacion) return false;

    itinerarioActual = mejorSecuencia;
    itinerarioContexto.optimizacionRuta = mejorEvaluacion;
    itinerarioContexto.costo = calcularCostoItinerario(itinerarioActual, itinerarioContexto);
    const contextoAhora = itinerarioContexto.ahora || {};
    const planificarParaManana = Number.isFinite(Number(contextoAhora.diaSemana)) &&
        Number.isFinite(Number(contextoPlan.diaSemana)) &&
        Number(contextoAhora.diaSemana) !== Number(contextoPlan.diaSemana);
    renderizarItinerario(itinerarioActual, itinerarioActual.length, planificarParaManana);
    return true;
}

window.agregarActividadAlItinerario = agregarActividadAlItinerario;

// ========================================================
// ✨ FUNCIONALIDAD "SORPRÉNDEME" (1-CLIC)
// ========================================================

function construirExplicacionTuki(sorpresa, contexto, preferencias, distanciaKm, esRepeticionUnica) {
    const clima = contexto?.clima || {};
    const estadoOperativo = obtenerEstadoOperativoLugar(sorpresa, contexto);
    const frases = [];
    if (clima.estado === "listo" && (clima.lluvia || clima.tormenta) && sorpresa.alAireLibre !== true) {
        frases.push("Está lloviendo y esta opción permite resguardarte");
    } else if (clima.estado === "listo" && !clima.lluvia && !clima.tormenta && sorpresa.alAireLibre === true) {
        frases.push("El clima acompaña una experiencia al aire libre");
    }
    if (Number.isFinite(distanciaKm) && distanciaKm <= 1.5) frases.push("queda cerca");
    if (estadoOperativo.estado === "disponible") frases.push("está abierto ahora");
    else if (estadoOperativo.estado === "condicional") frases.push(estadoOperativo.motivo.replace(/^Es una opción, pero /, "es una opción, pero "));
    else if (estadoOperativo.estado === "desconocido") frases.push("no pude confirmar su disponibilidad");
    if (contexto.momento === "noche" && (sorpresa.categoria === "noche" || sorpresa.tipoHorario === "nocturno")) {
        frases.push("encaja con la noche");
    }
    if (preferencias.intereses?.some(interes => interesesCoincidenConLugar(sorpresa, [interes]))) {
        frases.push("coincide con lo que te interesa");
    }
    if (esRepeticionUnica) return "🦜 Tuki no encontró otra opción igual de buena ahora mismo, así que te propone esta nuevamente.";
    if (frases.length >= 2) return `🦜 ${frases.slice(0, 3).join(", ")}. Me parece una buena excusa para salir un rato.`;
    if (frases.length === 1) return `🦜 ${frases[0][0].toUpperCase()}${frases[0].slice(1)}. Puede ser una sorpresa con sentido para este momento.`;
    return "🦜 Es una alternativa válida para este momento y puede sacarte de la rutina sin forzar el contexto.";
}

function obtenerTipoExperienciaSorpresa(lugar) {
    const texto = [lugar?.nombre, lugar?.tipo, ...(Array.isArray(lugar?.etiquetas) ? lugar.etiquetas : [])]
        .map(valor => String(valor || "").toLocaleLowerCase("es-AR"))
        .join(" ");
    if (/tres fronteras|hito tres|tres pa[ií]ses/.test(texto)) return "tres_paises";
    if (/aventura|rafting|kayak|tirolesa|cataratas aventura/.test(texto)) return "aventura";
    if (/costanera|mirador|paseo panor[aá]mico|paseo de la identidad/.test(texto)) return "paseo_urbano";
    if (lugar?.categoria === "fauna" || /fauna|aves|colibr|guira|selva/.test(texto)) return "fauna_naturaleza";
    if (lugar?.categoria === "comida") return "gastronomia";
    if (lugar?.categoria === "compras") return "compras";
    if (lugar?.categoria === "noche" || lugar?.tipoHorario === "nocturno") return "entretenimiento_nocturno";
    if (lugar?.categoria === "naturaleza") return "naturaleza";
    if (lugar?.categoria === "actividades") return "actividades";
    return String(lugar?.categoria || lugar?.tipo || "experiencia").toLocaleLowerCase("es-AR");
}

window.obtenerTipoExperienciaSorpresa = obtenerTipoExperienciaSorpresa;
window.obtenerDiagnosticoSorpresa = () => ultimoDiagnosticoSorpresa ? JSON.parse(JSON.stringify(ultimoDiagnosticoSorpresa)) : null;
window.configurarDiagnosticoSorpresa = ({ recientesTipos = [], recientesIds = [] } = {}) => {
    sorpresasRecientesTipos = Array.isArray(recientesTipos) ? recientesTipos.slice(-3) : [];
    sorpresasRecientesIds = Array.isArray(recientesIds) ? recientesIds.slice(-3) : [];
    return window.obtenerDiagnosticoSorpresa();
};

window.generarSorpresa = function () {
    if (typeof SoundFX !== "undefined") SoundFX.play("shimmer");

    const contenedor = document.querySelector("#surprise-container");
    if (!contenedor) return;

    const interesesExplicitos = obtenerInteresesAhoraExplicitos();
    const preferencias = {
        intereses: interesesExplicitos,
        tiempo: AppState.tiempo || "medio día",
        compania: AppState.compania || "solo",
        presupuesto: AppState.presupuesto || "medio"
    };
    const ahora = contextoDeAhora();
    const contextoBase = typeof construirContextoAhora === "function" ? construirContextoAhora(preferencias) : {};
    const coords = coordenadasValidasPlan(AppState.userCoords) ? AppState.userCoords : null;
    const contexto = {
        ...contextoBase,
        ...ahora,
        origenCoords: coords,
        intereses: normalizarInteresesPlan(preferencias.intereses),
        presupuesto: preferencias.presupuesto,
        compania: preferencias.compania,
        tiempo: preferencias.tiempo,
        contextoAhora: contextoBase
    };
    const idsEnItinerario = new Set((Array.isArray(itinerarioActual) ? itinerarioActual : [])
        .map(item => String(item?.id ?? item?.nombre)));
    const actividadesContexto = itinerarioContexto?.actividades || itinerarioContexto?.itinerario || [];
    if (Array.isArray(actividadesContexto)) {
        actividadesContexto.forEach(item => idsEnItinerario.add(String(item?.id ?? item?.nombre)));
    }
    const idLugarVisto = typeof AppState !== "undefined" && AppState.detailPlace?.id != null
        ? String(AppState.detailPlace.id)
        : "";
    const clima = contexto.clima || climaActual;
    const opciones = lugaresReales
        .filter(lugar => !idsEnItinerario.has(String(lugar.id ?? lugar.nombre)))
        .filter(lugar => !idLugarVisto || String(lugar.id) !== idLugarVisto)
        .filter(lugar => esCandidatoValido(lugar, {
            intereses: contexto.intereses,
            contexto: { ...contexto, clima, contextoAhora: contextoBase },
            presupuesto: preferencias.presupuesto,
            compania: preferencias.compania
        }))
        .map(lugar => {
            const viabilidad = evaluarViabilidadLugar(lugar, contexto);
            const distanciaKm = coordenadasValidasPlan(coords) && coordenadasValidasPlan(lugar.coordenadas)
                ? calcularDistanciaKm(coords.lat, coords.lng, lugar.coordenadas.lat, lugar.coordenadas.lng)
                : null;
            const scoreBase = calcularPuntaje(lugar, contexto, preferencias.compania, contexto.intereses);
            const tipo = obtenerTipoExperienciaSorpresa(lugar);
            const penalidadTemporal = ultimaSorpresaTipo && tipo === ultimaSorpresaTipo ? -7 :
                (ultimaSorpresaCategoria && lugar.categoria === ultimaSorpresaCategoria ? -3 : 0);
            return { lugar, viabilidad, distanciaKm, tipo, score: scoreBase + penalidadTemporal };
        });

    if (!opciones.length) {
        contenedor.innerHTML = `<div class="surprise-empty"><div class="surprise-empty-icon">🦜</div><h2>No encontramos una sorpresa responsable para este momento</h2><p>Probá nuevamente más tarde o revisá el planificador: Tuki respeta horario, clima, preferencias y actividades ya incluidas.</p></div>`;
        return;
    }

    const grupos = new Map();
    opciones.forEach(opcion => {
        if (!grupos.has(opcion.tipo)) grupos.set(opcion.tipo, []);
        grupos.get(opcion.tipo).push(opcion);
    });
    const gruposOrdenados = [...grupos.entries()]
        .map(([tipo, items]) => ({ tipo, items, mejorScore: Math.max(...items.map(item => item.score)) }))
        .sort((a, b) => b.mejorScore - a.mejorScore);
    const gruposExcluidosPorMemoria = gruposOrdenados
        .filter(grupo => sorpresasRecientesTipos.includes(grupo.tipo))
        .map(grupo => grupo.tipo);
    const gruposNoRecientes = gruposOrdenados
        .filter(grupo => !sorpresasRecientesTipos.includes(grupo.tipo));
    const gruposElegibles = gruposNoRecientes.length > 0 ? gruposNoRecientes : gruposOrdenados;
    const grupoElegido = gruposElegibles[0];
    ultimoDiagnosticoSorpresa = {
        ultimaSorpresaId,
        ultimaSorpresaCategoria,
        ultimaSorpresaTipo,
        sorpresasRecientesIds: [...sorpresasRecientesIds],
        sorpresasRecientesTipos: [...sorpresasRecientesTipos],
        gruposDisponibles: gruposOrdenados.map(grupo => ({ tipo: grupo.tipo, cantidad: grupo.items.length, mejorScore: grupo.mejorScore })),
        gruposExcluidosPorMemoria,
        grupoElegidoAntesDeSeleccion: grupoElegido?.tipo || null,
        candidatosGrupoElegido: grupoElegido?.items.length || 0
    };
    if (gruposNoRecientes.length > 0 && gruposNoRecientes.some(grupo => grupo.tipo === "paseo_urbano")) {
        console.warn("[SORPRENDEME DEBUG] paseo_urbano quedó elegible aunque estaba marcado como reciente", ultimoDiagnosticoSorpresa);
    }
    const mejorScoreGrupo = grupoElegido.mejorScore;
    const candidatasGrupo = grupoElegido.items.filter(item => item.score >= mejorScoreGrupo - Math.max(3, mejorScoreGrupo * 0.08));
    const candidatasSinAnterior = candidatasGrupo.filter(item => item.lugar.id !== ultimaSorpresaId);
    const poolSorpresa = candidatasSinAnterior.length ? candidatasSinAnterior : candidatasGrupo;
    const seleccion = poolSorpresa[Math.floor(Math.random() * poolSorpresa.length)] || poolSorpresa[0];
    const sorpresa = seleccion.lugar;
    const esRepeticionUnica = opciones.length === 1;
    ultimaSorpresaId = sorpresa.id;
    ultimaSorpresaCategoria = sorpresa.categoria;
    ultimaSorpresaTipo = seleccion.tipo;
    sorpresasRecientesIds = [...sorpresasRecientesIds.filter(id => id !== sorpresa.id), sorpresa.id].slice(-3);
    sorpresasRecientesTipos = [...sorpresasRecientesTipos.filter(tipo => tipo !== seleccion.tipo), seleccion.tipo].slice(-3);
    ultimoDiagnosticoSorpresa.grupoElegido = seleccion.tipo;
    ultimoDiagnosticoSorpresa.seleccion = { id: sorpresa.id, nombre: sorpresa.nombre, tipo: seleccion.tipo };
    console.info("[SORPRENDEME DEBUG]", ultimoDiagnosticoSorpresa);

    const estadoOperativo = obtenerEstadoOperativoLugar(sorpresa, contexto);
    const disponibilidad = estadoOperativo;
    const distanciaTexto = Number.isFinite(seleccion.distanciaKm) ? formatearDistancia(seleccion.distanciaKm) : "";
    const pillsTuki = [];
    if (distanciaTexto) pillsTuki.push("📍 Cerca de vos");
    if (disponibilidad.estado === "disponible") pillsTuki.push("⏱️ Abierto ahora");
    else if (disponibilidad.estado === "condicional") pillsTuki.push("🟡 Requiere reserva/coordinación");
    else if (disponibilidad.estado === "desconocido") pillsTuki.push("⚪ Disponibilidad no confirmada");
    if ((clima.tormenta || clima.lluvia) && sorpresa.alAireLibre !== true) pillsTuki.push("🌧️ Buena opción con lluvia");
    else if (clima.estado === "listo" && !clima.lluvia && !clima.tormenta && sorpresa.alAireLibre === true) pillsTuki.push("☀️ Ideal para este clima");
    if (ahora.momento === "noche" && (sorpresa.categoria === "noche" || sorpresa.tipoHorario === "nocturno")) pillsTuki.push("🌙 Ideal para la noche");
    if (sorpresa.gratuito === true) pillsTuki.push("💰 Alternativa gratuita");
    else if (sorpresa.nivelGasto === preferencias.presupuesto) pillsTuki.push("💰 Compatible con tu presupuesto");
    if (preferencias.compania === "familia" && sorpresa.aptoPara?.includes("niños")) pillsTuki.push("👨‍👩‍👧 Buena opción para familias");
    if (!pillsTuki.length) pillsTuki.push("✨ Opción válida para este momento");

    const htmlPills = pillsTuki.map(p => `<span class="tag-badge" style="background: var(--color-surface); color: var(--color-text); border: 1px solid var(--color-border); margin: 4px 4px 0 0; display: inline-flex;">${escapar(p)}</span>`).join("");
    const explicacion = construirExplicacionTuki(sorpresa, contexto, preferencias, seleccion.distanciaKm, esRepeticionUnica);
    const queryMaps = encodeURIComponent(`${sorpresa.nombre}, ${sorpresa.direccion || sorpresa.ubicacion}`);
    const badgeGasto = sorpresa.gratuito === true ? "🎁 Gratuito" : sorpresa.nivelGasto === "economico" ? "💰 Económico" : sorpresa.nivelGasto === "medio" ? "💵 Medio" : "💎 Alto";
    const disponibilidadText = disponibilidad.estado === "disponible"
        ? "🟢 Disponible ahora"
        : disponibilidad.estado === "condicional"
            ? "🟡 Requiere reserva/coordinación"
            : "⚪ Disponibilidad no confirmada";

    contenedor.innerHTML = `
        <div class="surprise-icon">${escapar(sorpresa.icono)}</div>
        <h2 class="surprise-place-title">${escapar(sorpresa.nombre)}</h2>
        <div class="tags-row surprise-tags">
            ${distanciaTexto ? `<span class="distance-badge">📍 ${distanciaTexto}</span>` : ""}
            <span class="open-badge open">${disponibilidadText}</span>
            <span class="tag-badge">${badgeGasto}</span>
            <span class="tag-badge">🕐 ${escapar(sorpresa.horario || "Consultar horario")}</span>
        </div>
        <div class="surprise-rationale"><strong>🦜 Por qué Tuki lo eligió</strong><p class="surprise-tuki-quote">“${escapar(explicacion.replace(/^🦜\s*/, ""))}”</p><div class="surprise-factor-list">${htmlPills}</div></div>
        <p class="surprise-description">${escapar(sorpresa.descripcion)}</p>
        <div class="surprise-actions-row">
            <button class="btn-card-action primary" style="padding:14px; justify-content:center;" onclick="mostrarDetalle('${escaparAttr(sorpresa.nombre)}')">⭐ Ver Ficha Completa</button>
            <a class="btn-card-action" style="padding:14px; justify-content:center;" href="https://www.google.com/maps/search/?api=1&query=${queryMaps}" target="_blank" rel="noopener noreferrer">📍 Cómo Llegar</a>
        </div>
        ${construirAccionesRapidas(sorpresa, contexto, { compacto: true })}
        <button class="hero-surprise-btn" style="width: 100%; margin-top: 14px;" onclick="generarSorpresa()">🔄 Sorpréndeme otra vez</button>
    `;
};

// ========================================================
// FORMATEO DE HORARIOS
// ========================================================

function formatearMinutosAHorario(minutosTotales) {
    if (!Number.isFinite(Number(minutosTotales))) return "--:-- hs";
    let horas = Math.floor(minutosTotales / 60);
    let mins = Math.floor(minutosTotales % 60);

    if (horas >= 24) horas -= 24;

    const hh = String(horas).padStart(2, "0");
    const mm = String(mins).padStart(2, "0");
    return `${hh}:${mm} hs`;
}

function formatearDuracionHumana(minutos) {
    if (minutos === null || minutos === undefined || (typeof minutos !== "number" && typeof minutos !== "string") || (typeof minutos === "string" && minutos.trim() === "")) return "--";
    const valorNumerico = Number(minutos);
    if (!Number.isFinite(valorNumerico)) return "--";
    const total = Math.max(0, Math.round(valorNumerico));
    const horas = Math.floor(total / 60);
    const minutosRestantes = total % 60;
    if (horas && minutosRestantes) return `${horas} h ${minutosRestantes} min`;
    if (horas) return `${horas} h`;
    return `${minutosRestantes} min`;
}


// ========================================================
// ¿QUÉ HAGO AHORA? — CAPA CONTEXTUAL SOBRE EL MOTOR EXISTENTE
// ========================================================
let ultimasRecomendacionesAhora = [];
let interesesAhoraSeleccionadosExplicitamente = false;

if (typeof document !== "undefined") {
    const registrarSeleccionExplicita = event => {
        const opcion = event.target.closest?.(".planner-option[data-interest]");
        if (opcion) interesesAhoraSeleccionadosExplicitamente = true;
    };
    document.addEventListener("click", registrarSeleccionExplicita, true);
    document.addEventListener("keydown", event => {
        if ((event.key === "Enter" || event.key === " ") && event.target.closest?.(".planner-option[data-interest]")) {
            registrarSeleccionExplicita(event);
        }
    }, true);
}

function obtenerInteresesAhoraExplicitos() {
    if (!interesesAhoraSeleccionadosExplicitamente || typeof document === "undefined") return [];
    return normalizarInteresesPlan([...document.querySelectorAll(".planner-option.selected")]
        .map(option => option.dataset.interest)
        .filter(Boolean));
}

function obtenerPreferenciasAhora() {
    return {
        intereses: obtenerInteresesAhoraExplicitos(),
        tiempo: AppState?.tiempo || "medio día",
        compania: AppState?.compania || "solo",
        presupuesto: AppState?.presupuesto || "medio"
    };
}

function obtenerMotivosAhora(lugar, contexto, preferencias) {
    const motivos = [];
    const hora = Number(contexto?.horaNumero);
    const clima = contexto?.clima || {};
    const distancia = coordenadasValidasPlan(contexto?.origenCoords) && coordenadasValidasPlan(lugar?.coordenadas)
        ? calcularDistanciaKm(contexto.origenCoords.lat, contexto.origenCoords.lng, lugar.coordenadas.lat, lugar.coordenadas.lng)
        : null;
    const estadoOperativo = obtenerEstadoOperativoLugar(lugar, contexto);
    if (estadoOperativo.estado === "disponible") motivos.push("🟢 Abierto para este horario");
    else if (estadoOperativo.estado === "condicional") motivos.push(`🟡 ${estadoOperativo.motivo}`);
    else if (estadoOperativo.estado === "desconocido") motivos.push("⚪ Disponibilidad no confirmada");
    if (contexto?.momento) {
        const etiquetaMomento = contexto.momento === "mañana"
            ? "Buena opción para esta mañana"
            : `Adecuada para este horario (${contexto.momento})`;
        motivos.push(`🕒 ${etiquetaMomento}`);
    }
    if (Array.isArray(preferencias?.intereses) && preferencias.intereses.length > 0 &&
        preferencias.intereses.some(interes => interesesCoincidenConLugar(lugar, [interes]))) {
        motivos.push("❤️ Coincide con tus intereses");
    }
    if (clima?.estado === "listo" && (clima.lluvia || clima.tormenta) && lugar.alAireLibre !== true) motivos.push("🌧️ Buena opción bajo techo");
    if (clima?.estado === "listo" && !clima.lluvia && !clima.tormenta && lugar.alAireLibre === true) motivos.push("🌿 Favorecida por el buen tiempo");
    if (distancia != null && Number.isFinite(distancia)) motivos.push(`📍 A ${formatearDistancia(distancia)}`);
    if (preferencias.presupuesto && esCompatibleConPresupuesto(lugar, preferencias.presupuesto)) motivos.push("💰 Presupuesto compatible");
    if (!motivos.length) motivos.push("✅ Compatible con tu momento y disponibilidad");
    return { texto: motivos.slice(0, 3).join(" · "), distancia };
}

function buscarLugarParaAccionRapida(id, nombre) {
    const clave = String(id ?? nombre ?? "");
    return (typeof lugaresReales !== "undefined" && Array.isArray(lugaresReales) ? lugaresReales : [])
        .find(item => String(item?.id ?? item?.nombre) === clave) || null;
}

function ejecutarFavoritoRapido(id, nombre) {
    const lugar = buscarLugarParaAccionRapida(id, nombre);
    if (lugar && typeof alternarFavorito === "function") alternarFavorito(lugar);
}

function informarAgregarAlPlanRapido(id, nombre) {
    const lugar = buscarLugarParaAccionRapida(id, nombre);
    if (!lugar || lugar.planificable !== true) {
        mostrarToast("⚠️ Esta experiencia no está habilitada para itinerarios");
        return;
    }
    if (!Array.isArray(itinerarioActual) || !itinerarioActual.length) {
        mostrarToast("📅 Primero generá un plan para agregar esta actividad");
        return;
    }
    if (itinerarioActual.some(item => String(item?.id ?? item?.nombre) === String(lugar.id ?? lugar.nombre))) {
        mostrarToast("📅 Esta actividad ya está incluida en tu plan");
        return;
    }
    if (typeof agregarActividadAlItinerario !== "function" || !agregarActividadAlItinerario(lugar)) {
        mostrarToast("⚠️ No se pudo incorporar esta actividad sin romper la coherencia del plan");
        return;
    }
    mostrarToast("📅 Actividad agregada a tu plan");
}

function construirAccionesRapidas(lugar, contexto = {}, { compacto = false } = {}) {
    if (!lugar) return "";
    const id = escaparAttr(lugar.id ?? lugar.nombre);
    const nombre = escaparAttr(lugar.nombre);
    const queryMaps = encodeURIComponent(`${lugar.nombre}, ${lugar.direccion || lugar.ubicacion || "Puerto Iguazú"}`);
    const estado = obtenerEstadoOperativoLugar(lugar, contexto);
    const acciones = [
        `<a class="quick-action" href="https://www.google.com/maps/search/?api=1&query=${queryMaps}" target="_blank" rel="noopener noreferrer">📍 Cómo llegar</a>`,
        `<button class="quick-action" type="button" onclick="mostrarDetalle('${nombre}')">ℹ️ Ver detalle</button>`,
        `<button class="quick-action" type="button" onclick="informarAgregarAlPlanRapido('${id}', '${nombre}')">📅 Agregar al plan</button>`
    ];
    if (typeof esLugarFavorito === "function") {
        const favorito = esLugarFavorito(lugar);
        acciones.push(`<button class="quick-action" type="button" aria-pressed="${favorito}" onclick="ejecutarFavoritoRapido('${id}', '${nombre}')">${favorito ? "♥" : "♡"} Favorito</button>`);
    }
    const telefono = String(lugar.telefono || lugar.whatsapp || "").trim();
    if (telefono) acciones.push(`<a class="quick-action" href="tel:${encodeURIComponent(telefono)}">📞 Contactar</a>`);
    const sitio = String(lugar.sitioOficial || lugar.website || lugar.urlOficial || "").trim();
    if (/^https?:\/\//i.test(sitio)) acciones.push(`<a class="quick-action" href="${escaparAttr(sitio)}" target="_blank" rel="noopener noreferrer">🌐 Sitio oficial</a>`);
    if (estado.estado === "condicional") {
        acciones.push(telefono
            ? `<a class="quick-action" href="tel:${encodeURIComponent(telefono)}">🎟️ Consultar / reservar</a>`
            : `<button class="quick-action" type="button" onclick="mostrarToast('🟡 Requiere reserva o coordinación previa')">🎟️ Consultar / reservar</button>`);
    }
    return `<div class="quick-actions ${compacto ? "compact" : ""}"><span class="quick-actions-label">⚡ Acciones rápidas</span><div class="quick-actions-list">${acciones.join("")}</div></div>`;
}

window.ejecutarFavoritoRapido = ejecutarFavoritoRapido;
window.informarAgregarAlPlanRapido = informarAgregarAlPlanRapido;

function generarRecomendacionesAhora() {
    const contenedor = document.querySelector("#now-recommendations");
    const lista = document.querySelector("#now-recommendations-list");
    const contextoLabel = document.querySelector("#now-recommendations-context");
    if (!contenedor || !lista) return [];

    const preferencias = obtenerPreferenciasAhora();
    const contextoBase = construirContextoAhora(preferencias);
    const momentoActual = contextoDeAhora();
    const origenGps = coordenadasValidasPlan(AppState?.userCoords)
        ? { lat: Number(AppState.userCoords.lat), lng: Number(AppState.userCoords.lng) }
        : null;
    const contexto = {
        ...contextoBase,
        ...momentoActual,
        horaReal: momentoActual.horaNumero,
        horaTextoReal: momentoActual.horaTexto,
        origenCoords: origenGps,
        preferencias: { ...contextoBase.preferencias, intereses: preferencias.intereses },
        intereses: preferencias.intereses,
        tiempo: preferencias.tiempo,
        compania: preferencias.compania,
        presupuesto: preferencias.presupuesto,
        limiteHoras: horasDisponibles(preferencias.tiempo)
    };
    const idsEnPlan = new Set((Array.isArray(itinerarioActual) ? itinerarioActual : []).map(item => String(item?.id ?? item?.nombre)));
    const idReciente = String(AppState?.detailPlace?.id ?? "");
    const clima = contexto.clima || climaActual;
    const candidatos = (typeof lugaresReales !== "undefined" && Array.isArray(lugaresReales) ? lugaresReales : [])
        .filter(Boolean)
        .filter(lugar => !idsEnPlan.has(String(lugar.id ?? lugar.nombre)))
        .filter(lugar => !idReciente || String(lugar.id) !== idReciente)
        .filter(lugar => esCandidatoValido(lugar, {
            intereses: preferencias.intereses,
            contexto: { ...contexto, contextoAhora: { ...contextoBase, clima } },
            presupuesto: preferencias.presupuesto,
            compania: preferencias.compania
        }))
        .map(lugar => {
            const base = calcularPuntaje(lugar, contexto, preferencias.compania, preferencias.intereses);
            const motivos = obtenerMotivosAhora(lugar, contexto, preferencias);
            const cercania = Number.isFinite(motivos.distancia) ? Math.max(0, 8 - motivos.distancia) : 0;
            const variedad = lugar.destacado ? 2 : 0;
            return { lugar, motivos, estadoOperativo: obtenerEstadoOperativoLugar(lugar, contexto), puntaje: base + cercania + variedad };
        })
        .sort((a, b) => b.puntaje - a.puntaje)
        .slice(0, 5);
    ultimasRecomendacionesAhora = candidatos;

    const horaTexto = contexto.horaTexto || formatoHoraDecimalPlan(contexto.horaNumero);
    const climaTexto = clima?.estado === "listo" ? ` · ${clima.descripcion || "clima actualizado"}` : " · clima no disponible";
    if (contextoLabel) contextoLabel.textContent = `Ahora son las ${horaTexto}${climaTexto}. ${origenGps ? "Distancias calculadas desde tu GPS." : "Ubicación no disponible; se omitieron distancias."} Se excluyen actividades ya incluidas en tu plan.`;
    if (!candidatos.length) {
        lista.innerHTML = `<div class="saved-plans-empty">Hay pocas opciones compatibles con este horario. Probá cambiar tus preferencias o revisá el planificador.</div>`;
    } else {
        const renderRecommendationCard = (item, index, esMejorOpcion = false) => {
            const lugar = item.lugar;
            const nombre = planPlaceText(lugar, "nombre", "Lugar sin nombre");
            const precioCatalogo = planPlaceText(lugar, "precioTexto");
            const mapsQuery = encodeURIComponent(`${lugar.nombre}, ${lugar.direccion || lugar.ubicacion || "Puerto Iguazú"}`);
            const precio = lugar.gratuito ? "🎁 Gratis" : textoSeguro(precioCatalogo || lugar.precio?.texto, "💰 Consultar tarifa");
            return `<article class="now-recommendation-card ${esMejorOpcion ? "best" : ""}">
                <div class="now-recommendation-title">
                    <h4>${escapar(nombre)}</h4>
                </div>
                ${esMejorOpcion ? "<div class=\"now-recommendation-why-label\">¿Por qué esta?</div>" : ""}
                <p class="now-recommendation-reason">${escapar(item.motivos.texto)}</p>
                <div class="now-recommendation-meta">
                    <span>🏷️ ${escapar(lugar.categoria || "actividad")}</span>
                    <span>${item.estadoOperativo.estado === "disponible" ? "🟢 Disponible ahora" : item.estadoOperativo.estado === "condicional" ? "🟡 Requiere reserva/coordinación" : "⚪ Disponibilidad no confirmada"}</span>
                    <span>🕒 ${escapar(lugar.horario || "Horario disponible")}</span>
                    <span>${escapar(precio)}</span>
                </div>
                <div class="now-recommendation-actions">
                    <button class="btn-card-action primary" type="button" onclick="mostrarDetalle('${escaparAttr(lugar.nombre)}')">⭐ Ver detalle</button>
                    <a class="btn-card-action" href="https://www.google.com/maps/search/?api=1&query=${mapsQuery}" target="_blank" rel="noopener noreferrer">📍 Cómo llegar</a>
                </div>
                ${construirAccionesRapidas(lugar, contexto, { compacto: true })}
            </article>`;
        };
        const mejorOpcion = renderRecommendationCard(candidatos[0], 0, true);
        const alternativas = candidatos.slice(1, 4)
            .map((item, index) => renderRecommendationCard(item, index + 1))
            .join("");
        const opcionesRestantes = candidatos.slice(4)
            .map((item, index) => renderRecommendationCard(item, index + 4))
            .join("");
        lista.innerHTML = `
            <section class="now-recommendation-group now-recommendation-best-group">
                <h4 class="now-recommendation-group-title">⭐ Mejor opción ahora</h4>
                ${mejorOpcion}
            </section>
            ${alternativas ? `<section class="now-recommendation-group"><h4 class="now-recommendation-group-title">Otras opciones ahora</h4>${alternativas}</section>` : ""}
            ${opcionesRestantes ? `<section class="now-recommendation-group"><h4 class="now-recommendation-group-title">Más opciones compatibles</h4>${opcionesRestantes}</section>` : ""}
            ${candidatos.length >= 2 ? `<button class="btn-card-action now-compare-button" type="button" onclick="abrirComparadorOpciones()">⚖️ Comparar opciones</button><div id="now-comparison" class="now-comparison hidden" aria-live="polite"></div>` : ""}
        `;
    }
    contenedor.classList.remove("hidden");
    return candidatos;
}

function indicadoresComparacion(item, preferencias, contexto) {
    const lugar = item?.lugar || {};
    const indicadores = [];
    const estado = item?.estadoOperativo?.estado;
    if (estado === "disponible") indicadores.push("🟢 Disponible ahora");
    else if (estado === "condicional") indicadores.push("🟡 Requiere reserva/coordinación");
    else if (estado === "desconocido") indicadores.push("⚪ Disponibilidad no confirmada");
    if (Number.isFinite(item?.motivos?.distancia)) indicadores.push(`📍 ${formatearDistancia(item.motivos.distancia)}`);
    if (lugar.gratuito === true) indicadores.push("🎁 Gratuito");
    else if (lugar.precioTexto || lugar.precio?.texto) indicadores.push(`💰 ${lugar.precioTexto || lugar.precio.texto}`);
    if (contexto?.clima?.estado === "listo") {
        if ((contexto.clima.lluvia || contexto.clima.tormenta) && lugar.alAireLibre !== true) indicadores.push("🌧️ Compatible con lluvia");
        else if (!contexto.clima.lluvia && !contexto.clima.tormenta && lugar.alAireLibre === true) indicadores.push("☀️ Favorecido por el clima");
    }
    if (Array.isArray(preferencias?.intereses) && preferencias.intereses.length > 0 &&
        preferencias.intereses.some(interes => interesesCoincidenConLugar(lugar, [interes]))) {
        indicadores.push("🌿 Coincide con tu interés");
    }
    if (lugar.duracionHoras) indicadores.push(`🕐 ${formatearDuracionHumana(Math.round(Number(lugar.duracionHoras) * 60))}`);
    return indicadores;
}

function abrirComparadorOpciones() {
    const contenedor = document.querySelector("#now-comparison");
    if (!contenedor || ultimasRecomendacionesAhora.length < 2) return;
    const botonComparar = document.querySelector(".now-compare-button");
    if (botonComparar) botonComparar.classList.add("hidden");
    const preferencias = obtenerPreferenciasAhora();
    const contexto = construirContextoAhora(preferencias);
    const tarjetas = ultimasRecomendacionesAhora.map((item, index) => {
        const lugar = item.lugar;
        const mapsQuery = encodeURIComponent(`${lugar.nombre}, ${lugar.direccion || lugar.ubicacion || "Puerto Iguazú"}`);
        const imagen = lugar.imagen || lugar.imagenUrl || lugar.imagenURL;
        const indicadores = indicadoresComparacion(item, preferencias, contexto);
        return `<article class="now-comparison-card ${index === 0 ? "best" : ""}">
            ${imagen ? `<img class="now-comparison-image" src="${escaparAttr(imagen)}" alt="${escaparAttr(lugar.nombre)}" loading="lazy">` : ""}
            <h5>${index === 0 ? "⭐ Mejor opción para vos ahora" : "Otra opción"}</h5>
                    <h4>${escapar(nombre)}</h4>
            <div class="now-comparison-indicators">${indicadores.map(indicador => `<span>${escapar(indicador)}</span>`).join("") || "<span>Consultar información disponible</span>"}</div>
            <p class="now-comparison-why"><strong>Por qué:</strong> ${escapar(item.motivos.texto || "Opción compatible con el contexto actual.")}</p>
            <div class="now-recommendation-actions">
                <button class="btn-card-action primary" type="button" onclick="mostrarDetalle('${escaparAttr(lugar.nombre)}')">⭐ Ver detalle</button>
                <a class="btn-card-action" href="https://www.google.com/maps/search/?api=1&query=${mapsQuery}" target="_blank" rel="noopener noreferrer">📍 Ver en Maps</a>
            </div>
        </article>`;
    }).join("");
    contenedor.innerHTML = `<div class="now-comparison-header"><h4>⚖️ Comparar opciones</h4><p>Elegí según lo que más te importe ahora.</p></div><div class="now-comparison-grid">${tarjetas}</div>`;
    contenedor.classList.remove("hidden");
    contenedor.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function abrirQueHagoAhora() {
    mostrarSeccion("planner");
    generarRecomendacionesAhora();
    document.querySelector("#now-recommendations")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

window.generarRecomendacionesAhora = generarRecomendacionesAhora;
window.abrirComparadorOpciones = abrirComparadorOpciones;
window.abrirQueHagoAhora = abrirQueHagoAhora;
window.generarPlanReal = generarPlan;
window.estaDisponibleDurantePlan = estaDisponibleDurantePlan;
window.calcularPuntaje = calcularPuntaje;
window.contextoDeAhora = contextoDeAhora;
window.PlanificadorAPI = {
    get climaActual() { return climaActual; },
    set climaActual(valor) { climaActual = valor; },
    construirPlanConFallback,
    esLugarValidoParaItinerario,
    horasDisponibles,
    esCompatibleConPresupuesto
};
