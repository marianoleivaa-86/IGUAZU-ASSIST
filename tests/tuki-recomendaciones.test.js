const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const Agenda = require("../agenda-eventos.js");

const TUKI_SOURCE = fs.readFileSync(path.join(__dirname, "..", "tuki-asistente.js"), "utf8");
const PLANNER_SOURCE = fs.readFileSync(path.join(__dirname, "..", "planificador-inteligente.js"), "utf8");
const RELOJ = new Date("2026-10-09T10:00:00-03:00");

function lugar(overrides = {}) {
    return {
        id: "lugar-base",
        nombre: "Lugar base",
        categoria: "actividades",
        planificable: true,
        icono: "🌿",
        descripcion: "Experiencia de prueba en el catálogo.",
        direccion: "Puerto Iguazú",
        ubicacion: "Puerto Iguazú",
        coordenadas: { lat: -25.6, lng: -54.57 },
        horario: "08:00 a 20:00",
        rangoHorario: { apertura: 8, cierre: 20 },
        diasApertura: [0, 1, 2, 3, 4, 5, 6],
        duracionHoras: 1,
        alAireLibre: false,
        aptoPara: ["solo", "pareja", "familia", "amigos", "niños"],
        momentos: ["mañana", "mediodía", "tarde"],
        tipoHorario: "diurno",
        nivelGasto: "medio",
        gratuito: false,
        prioridad: 5,
        precio: { tipo: "desconocido", monto: null, moneda: null, estado: "desconocido" },
        ...overrides
    };
}

function distanciaKm(lat1, lng1, lat2, lng2) {
    const dLat = (lat2 - lat1) * 111;
    const dLng = (lng2 - lng1) * 111;
    return Math.sqrt(dLat ** 2 + dLng ** 2);
}

function crearTuki({ lugares = [], clima = { estado: "listo", lluvia: false, tormenta: false }, disponible = () => true } = {}) {
    let climaActual = { ...clima };
    const llamadasPlanificador = [];
    const agendaStub = {
        ...Agenda,
        cargarAgenda: async () => ({ ok: true, eventos: [] })
    };
    const ventana = {
        AgendaEventos: agendaStub,
        I18n: { t: (_key, fallback) => fallback, placeText: (item, campo) => item?.[campo] },
        addEventListener() {},
        setTimeout,
        contextoDeAhora: () => ({ momento: "mañana", horaNumero: 10, horaTexto: "10:00", diaSemana: 5 }),
        estaDisponibleDurantePlan: (item, _contexto) => disponible(item),
        PlanificadorAPI: {
            esLugarValidoParaItinerario: item => Boolean(item?.planificable),
            esCompatibleConPresupuesto: () => true,
            horasDisponibles: () => 5,
            construirPlanConFallback: opciones => {
                llamadasPlanificador.push({ ...opciones, clima: { ...climaActual } });
                return {
                    lugares: lugares.filter(item => !opciones.lluvia || item.alAireLibre !== true),
                    contextoPlan: opciones.ahora,
                    adaptacion: { activa: false, mensaje: "" }
                };
            },
            get climaActual() { return climaActual; },
            set climaActual(value) { climaActual = value; }
        },
        get __llamadasPlanificador() { return llamadasPlanificador; }
    };
    const contexto = {
        window: ventana,
        document: {
            readyState: "loading",
            baseURI: "https://example.test/",
            addEventListener() {},
            querySelector() { return null; },
            querySelectorAll() { return []; },
            body: { classList: { add() {}, remove() {} } }
        },
        navigator: { onLine: true },
        AppState: {
            compania: "solo",
            presupuesto: "medio",
            tiempo: "medio día",
            userCoords: { lat: -25.6, lng: -54.57 },
            gpsActive: true
        },
        lugaresReales: lugares,
        CONFIG_APP: { coordenadasCentro: { lat: -25.6, lng: -54.57 } },
        calcularDistanciaKm: distanciaKm,
        formatearDistancia: km => `${km.toFixed(1)} km`,
        obtenerEstadoDisponibilidad: (item, hora, dia) => ({
            abierto: item.abiertoEsperado ?? (hora >= item.rangoHorario.apertura && hora <= item.rangoHorario.cierre),
            texto: item.abiertoEsperado === false ? "Cerrado ahora." : `Abierto en el día ${dia}.`
        }),
        escapar: value => String(value ?? ""),
        escaparAttr: value => String(value ?? ""),
        console,
        Intl,
        Date,
        Number,
        String,
        Boolean,
        Object,
        Array,
        Set,
        Promise,
        Math
    };
    vm.runInNewContext(TUKI_SOURCE, contexto);
    return { api: contexto.window.TukiAsistente, ventana, contexto };
}

test("Tuki recomienda hasta tres opciones gastronómicas y respeta la consulta cerca", () => {
    const lugares = [
        lugar({ id: "comida-1", nombre: "Café Central", categoria: "comida", coordenadas: { lat: -25.6005, lng: -54.57 } }),
        lugar({ id: "comida-2", nombre: "Bistró Selva", categoria: "comida", coordenadas: { lat: -25.604, lng: -54.57 } }),
        lugar({ id: "comida-3", nombre: "Parrilla del Puerto", categoria: "comida", coordenadas: { lat: -25.61, lng: -54.57 } }),
        lugar({ id: "comida-4", nombre: "Mesa Guaraní", categoria: "comida", coordenadas: { lat: -25.62, lng: -54.57 } })
    ];
    const { api } = crearTuki({ lugares });
    const respuesta = api.resolver("¿Dónde comer cerca?", { ahora: RELOJ });

    assert.equal(respuesta.intencion.interes, "comida");
    assert.equal(respuesta.intencion.cerca, true);
    assert.equal(respuesta.lugares.length, 3);
    assert.deepEqual(respuesta.lugares.map(item => item.id), ["comida-1", "comida-2", "comida-3"]);
    assert.ok(respuesta.lugares.every(item => Number.isFinite(item.distanciaTuki)));
});

test("Tuki calcula cercanía desde coordenadas GPS conocidas y limita la rama breve a tres", () => {
    const lugares = [
        lugar({ id: "cerca-1", nombre: "Punto Norte", coordenadas: { lat: -25.601, lng: -54.57 } }),
        lugar({ id: "cerca-2", nombre: "Punto Medio", coordenadas: { lat: -25.605, lng: -54.57 } }),
        lugar({ id: "cerca-3", nombre: "Punto Sur", coordenadas: { lat: -25.61, lng: -54.57 } }),
        lugar({ id: "cerca-4", nombre: "Punto Lejano", coordenadas: { lat: -25.63, lng: -54.57 } })
    ];
    const { api, contexto } = crearTuki({ lugares });
    const respuesta = api.resolver("¿Qué hay cerca?", { ahora: RELOJ });

    assert.equal(contexto.AppState.gpsActive, true);
    assert.equal(respuesta.fuenteUbicacion, "tu ubicación GPS");
    assert.equal(respuesta.lugares.length, 3);
    assert.deepEqual(respuesta.lugares.map(item => item.id), ["cerca-1", "cerca-2", "cerca-3"]);
    assert.ok(respuesta.lugares.every(item => item.distanciaTuki <= 10));
});

test("Tuki transmite la consulta de lluvia al planificador y prioriza opciones cubiertas", () => {
    const lugares = [
        lugar({ id: "cubierto-1", nombre: "Museo Selva", categoria: "actividades", alAireLibre: false }),
        lugar({ id: "cubierto-2", nombre: "Icebar", categoria: "actividades", alAireLibre: false }),
        lugar({ id: "cubierto-3", nombre: "Centro Cultural", categoria: "actividades", alAireLibre: false }),
        lugar({ id: "exterior", nombre: "Sendero Abierto", categoria: "naturaleza", alAireLibre: true })
    ];
    const { api, ventana } = crearTuki({ lugares });
    const respuesta = api.resolver("¿Qué hacer si llueve?", { ahora: RELOJ });
    const llamada = ventana.__llamadasPlanificador[0];

    assert.equal(respuesta.intencion.lluvia, true);
    assert.equal(llamada.clima.lluvia, true);
    assert.match(respuesta.texto, /llueve|cubiertas/i);
    assert.equal(respuesta.lugares.length, 3);
    assert.ok(respuesta.lugares.every(item => item.alAireLibre === false));
});

test("Tuki consulta el estado de apertura del lugar mencionado", () => {
    const cafe = lugar({ id: "horario-1", nombre: "Café Central", categoria: "comida", abiertoEsperado: true });
    const { api } = crearTuki({ lugares: [cafe] });
    const respuesta = api.resolver("¿Está abierto Café Central?", { ahora: RELOJ });

    assert.equal(respuesta.exacta, true);
    assert.equal(Array.from(respuesta.lugares, item => item.id).join(","), "horario-1");
    assert.match(respuesta.texto, /horario informado/i);
    assert.match(respuesta.texto, /Abierto/i);
});

test("el planificador público puede construir varias paradas sin confundirse con el límite de Tuki", () => {
    const lugares = [
        lugar({ id: "plan-1", nombre: "Parada Uno", categoria: "naturaleza", coordenadas: { lat: -25.601, lng: -54.57 } }),
        lugar({ id: "plan-2", nombre: "Parada Dos", categoria: "naturaleza", coordenadas: { lat: -25.602, lng: -54.57 } }),
        lugar({ id: "plan-3", nombre: "Parada Tres", categoria: "naturaleza", coordenadas: { lat: -25.603, lng: -54.57 } }),
        lugar({ id: "plan-4", nombre: "Parada Cuatro", categoria: "naturaleza", coordenadas: { lat: -25.604, lng: -54.57 } })
    ];
    const { api } = crearPlanificador({ lugares });
    const resultado = api.construirPlanConFallback({
        interes: "naturaleza",
        tiempo: "medio día",
        compania: "solo",
        presupuesto: "medio",
        limiteHoras: 5,
        ahora: { momento: "mañana", horaNumero: 10, horaTexto: "10:00", diaSemana: 5 }
    });

    assert.ok(Array.isArray(resultado.lugares));
    assert.ok(resultado.lugares.length >= 2);
    assert.ok(resultado.lugares.length <= 4);
    assert.ok(resultado.lugares.every(item => item.categoria === "naturaleza"));
});

function crearPlanificador({ lugares = [] } = {}) {
    const noopElement = {
        textContent: "",
        innerHTML: "",
        classList: { add() {}, remove() {}, toggle() {} },
        setAttribute() {},
        appendChild() {},
        addEventListener() {},
        querySelector() { return null; },
        querySelectorAll() { return []; }
    };
    const ventana = {
        I18n: { placeText: (item, campo) => item?.[campo] },
        addEventListener() {},
        setTimeout,
        open() {}
    };
    const contexto = {
        window: ventana,
        document: {
            readyState: "loading",
            addEventListener() {},
            querySelector() { return noopElement; },
            querySelectorAll() { return []; }
        },
        navigator: {},
        localStorage: { getItem() { return null; }, setItem() {} },
        fetch: async () => { throw new Error("red deshabilitada en la prueba"); },
        lugaresReales: lugares,
        AppState: { userCoords: { lat: -25.6, lng: -54.57 }, gpsActive: true, currentPlanId: null },
        CONFIG_APP: { coordenadasCentro: { lat: -25.6, lng: -54.57 } },
        estaAbiertoEnHorario: (item, hora, dia) => {
            const rango = item.rangoHorario;
            return Boolean(rango && dia >= 0 && dia <= 6 && hora >= rango.apertura && hora <= rango.cierre);
        },
        calcularDistanciaKm: distanciaKm,
        escapar: value => String(value ?? ""),
        escaparAttr: value => String(value ?? ""),
        console,
        Intl,
        Date,
        Number,
        String,
        Boolean,
        Object,
        Array,
        Set,
        Promise,
        Math
    };
    vm.runInNewContext(PLANNER_SOURCE, contexto);
    return { api: contexto.window.PlanificadorAPI, contexto };
}
