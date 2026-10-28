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
    const llamadasDisponibilidad = [];
    const agendaStub = {
        ...Agenda,
        cargarAgenda: async () => ({ ok: true, eventos: [] })
    };
    const ventana = {
        AgendaEventos: agendaStub,
        I18n: { t: (_key, fallback) => fallback, placeText: (item, campo) => item?.[campo] },
        addEventListener() {},
        setTimeout,
        contextoDeAhora: () => ({
            momento: "mañana",
            horaNumero: 10,
            horaTexto: "10:00",
            diaSemana: 5,
            ubicacion: {
                fuente: "gps",
                coords: { lat: -25.6, lng: -54.57 }
            }
        }),
        estaDisponibleDurantePlan: (item, contexto) => {
            llamadasDisponibilidad.push({ item, contexto });
            return disponible(item, contexto);
        },
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
        get __llamadasPlanificador() { return llamadasPlanificador; },
        get __llamadasDisponibilidad() { return llamadasDisponibilidad; }
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
    assert.equal(respuesta.fuenteUbicacion, "tu ubicación GPS actual");
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

test("Tuki hereda el tema y las preferencias explícitas en un seguimiento sobre lluvia", () => {
    const { api, ventana } = crearTuki({ lugares: [
        lugar({ id: "selva", nombre: "Centro de la Selva", categoria: "naturaleza" }),
        lugar({ id: "museo", nombre: "Museo Cubierto", categoria: "naturaleza", alAireLibre: false })
    ] });
    api.resolver("Quiero naturaleza con mi familia, algo económico, para 2 horas", { ahora: RELOJ });
    const respuesta = api.resolver("¿Y si llueve?", { ahora: RELOJ });
    const llamada = ventana.__llamadasPlanificador.at(-1);

    assert.equal(respuesta.intencion.interes, "naturaleza");
    assert.equal(respuesta.intencion.compania, "familia");
    assert.equal(respuesta.intencion.presupuesto, "economico");
    assert.equal(respuesta.intencion.tiempo, "1-2 horas");
    assert.equal(respuesta.intencion.lluvia, true);
    assert.equal(llamada.interes, "naturaleza");
    assert.equal(llamada.compania, "familia");
    assert.equal(llamada.presupuesto, "economico");
    assert.equal(llamada.tiempo, "1-2 horas");

    const respuestaBuenClima = api.resolver("Y si no llueve", { ahora: RELOJ });
    assert.equal(respuestaBuenClima.intencion.lluvia, false);
});

test("Tuki hereda el tema activo cuando el turista solo actualiza una preferencia", () => {
    const { api } = crearTuki();
    api.resolver("Quiero visitar naturaleza", { ahora: RELOJ });
    const respuesta = api.resolver("Mejor con amigos", { ahora: RELOJ });

    assert.equal(respuesta.intencion.interes, "naturaleza");
    assert.equal(respuesta.intencion.compania, "amigos");
});

test("una preferencia nueva reemplaza a la anterior sin acumular compañías contradictorias", () => {
    const { api } = crearTuki();
    api.resolver("Quiero actividades en familia", { ahora: RELOJ });
    const respuesta = api.resolver("Ahora voy con amigos, sin límite de presupuesto y para todo el día", { ahora: RELOJ });

    assert.equal(respuesta.intencion.compania, "amigos");
    assert.notEqual(respuesta.intencion.compania, "familia");
    assert.equal(respuesta.intencion.presupuesto, "alto");
    assert.equal(respuesta.intencion.tiempo, "todo el día");
});

test("un tema nuevo reemplaza la intención anterior y conserva las demás preferencias", () => {
    const { api } = crearTuki();
    api.resolver("Quiero naturaleza con mi familia, barato", { ahora: RELOJ });
    const respuesta = api.resolver("¿Dónde puedo comer?", { ahora: RELOJ });

    assert.equal(respuesta.intencion.interes, "comida");
    assert.equal(respuesta.intencion.compania, "familia");
    assert.equal(respuesta.intencion.presupuesto, "economico");
});

test("Tuki pide aclaración ante una referencia ambigua en vez de adivinar", () => {
    const { api } = crearTuki({ lugares: [
        lugar({ id: "selva", nombre: "Centro de la Selva", categoria: "naturaleza" }),
        lugar({ id: "museo", nombre: "Museo de la Selva", categoria: "naturaleza" })
    ] });
    api.resolver("Quiero visitar naturaleza", { ahora: RELOJ });
    const respuesta = api.resolver("¿Y esa?", { ahora: RELOJ });

    assert.equal(respuesta.conversacional, true);
    assert.equal(respuesta.lugares.length, 2);
    assert.match(respuesta.texto, /No quiero adivinar/i);
});

test("una referencia singular a un único lugar anterior reutiliza catálogo y función de horarios", () => {
    const cafe = lugar({ id: "anterior-1", nombre: "Café Anterior", abiertoEsperado: true });
    const { api } = crearTuki({ lugares: [cafe] });
    api.resolver("¿Qué lugares puedo visitar?", { ahora: RELOJ });
    const respuesta = api.resolver("¿Está abierto ese lugar?", { ahora: RELOJ });

    assert.equal(respuesta.lugares[0].id, "anterior-1");
    assert.match(respuesta.texto, /Café Anterior/);
    assert.match(respuesta.texto, /Abierto/i);
    assert.equal(respuesta.intencion.ahora, true);
});

test("si una pregunta de horario apunta a varias recomendaciones, Tuki pregunta cuál", () => {
    const lugares = [
        lugar({ id: "anterior-1", nombre: "Café Anterior" }),
        lugar({ id: "anterior-2", nombre: "Museo Anterior" })
    ];
    const { api } = crearTuki({ lugares });
    api.resolver("¿Qué lugares puedo visitar?", { ahora: RELOJ });
    const respuesta = api.resolver("¿Está abierto ese lugar?", { ahora: RELOJ });

    assert.equal(respuesta.lugares.length, 2);
    assert.match(respuesta.texto, /No quiero adivinar/);
    assert.match(respuesta.texto, /Café Anterior.*Museo Anterior/);
});

test("¿Cuál de esos queda más cerca? identifica funcionalmente el más próximo de las tarjetas anteriores", () => {
    const lugares = [
        lugar({ id: "lejos", nombre: "Punto Lejano", categoria: "naturaleza", coordenadas: { lat: -25.62, lng: -54.57 } }),
        lugar({ id: "cerca", nombre: "Punto Cercano", categoria: "naturaleza", coordenadas: { lat: -25.601, lng: -54.57 } }),
        lugar({ id: "medio", nombre: "Punto Medio", categoria: "naturaleza", coordenadas: { lat: -25.61, lng: -54.57 } })
    ];
    const { api } = crearTuki({ lugares });
    api.resolver("Quiero visitar naturaleza", { ahora: RELOJ });
    const respuesta = api.resolver("¿Cuál de esos queda más cerca?", { ahora: RELOJ });

    assert.equal(respuesta.lugares[0].id, "cerca");
    assert.match(respuesta.texto, /Punto Cercano es la opción más cercana/);
    assert.ok(respuesta.lugares[0].distanciaTuki < 1);
});

test("si faltan coordenadas para comparar cercanía, Tuki no adivina y pide precisión", () => {
    const lugares = [
        lugar({ id: "sin-coord-1", nombre: "Lugar Sin Coordenadas Uno", categoria: "naturaleza", coordenadas: null }),
        lugar({ id: "sin-coord-2", nombre: "Lugar Sin Coordenadas Dos", categoria: "naturaleza", coordenadas: null })
    ];
    const { api } = crearTuki({ lugares });
    api.resolver("Quiero visitar naturaleza", { ahora: RELOJ });
    const respuesta = api.resolver("¿Cuál de esos queda más cerca?", { ahora: RELOJ });

    assert.equal(respuesta.exacta, false);
    assert.match(respuesta.texto, /No quiero adivinar/);
});

test("Tuki compara cercanía de las tres recomendaciones gastronómicas originales sin introducir opciones ajenas", () => {
    const donaMaria = lugar({ id: "dona-maria", nombre: "Restaurante Doña María", categoria: "comida", coordenadas: { lat: -25.602, lng: -54.57 } });
    const aqva = lugar({ id: "aqva", nombre: "Restaurante Aqva", categoria: "comida", coordenadas: { lat: -25.604, lng: -54.57 } });
    const argentineExperience = lugar({ id: "argentine-exp", nombre: "The Argentine Experience Iguazú", categoria: "comida", coordenadas: { lat: -25.607, lng: -54.57 } });
    const cassino = lugar({ id: "cassino", nombre: "Cassino Iguazú", categoria: "noche", coordenadas: { lat: -25.601, lng: -54.57 } });

    const { api } = crearTuki({ lugares: [donaMaria, aqva, argentineExperience, cassino] });

    // 1. Consulta inicial: Recomendame tres lugares para comer
    const r1 = api.resolver("Recomendame tres lugares para comer", { ahora: RELOJ });
    assert.equal(r1.lugares.length, 3);
    assert.deepEqual(r1.lugares.map(l => l.id), ["dona-maria", "aqva", "argentine-exp"]);
    assert.ok(!r1.lugares.some(l => l.id === "cassino"), "Cassino no debe estar en la recomendación de comida inicial");

    // 2. Consulta comparativa: ¿Cuál queda más cerca?
    const r2 = api.resolver("¿Cuál queda más cerca?", { ahora: RELOJ });
    assert.equal(r2.lugares.length, 1);
    assert.equal(r2.lugares[0].id, "dona-maria", "El lugar elegido debe ser Doña María (el de menor distancia entre los tres)");
    assert.ok(!r2.lugares.some(l => l.id === "cassino"), "No debe introducir Cassino");
    assert.match(r2.texto, /Doña María/i);

    // 3. Consulta comparativa explícita: ¿Cuál de los tres lugares que me recomendaste originalmente queda más cerca?
    const r3 = api.resolver("¿Cuál de los tres lugares que me recomendaste originalmente queda más cerca?", { ahora: RELOJ });
    assert.equal(r3.lugares.length, 1);
    assert.equal(r3.lugares[0].id, "dona-maria");
    assert.ok(!r3.lugares.some(l => l.id === "cassino"), "No debe re-ejecutar búsqueda general ni introducir Cassino");
    assert.match(r3.texto, /Doña María/i);
    assert.match(r3.texto, /original/i);
});

test("consulta explícita de nuevas recomendaciones genera una lista nueva y actualiza el contexto", () => {
    const lugaresComida = [
        lugar({ id: "c1", nombre: "Comida Uno", categoria: "comida", coordenadas: { lat: -25.601, lng: -54.57 } }),
        lugar({ id: "c2", nombre: "Comida Dos", categoria: "comida", coordenadas: { lat: -25.602, lng: -54.57 } }),
        lugar({ id: "c3", nombre: "Comida Tres", categoria: "comida", coordenadas: { lat: -25.603, lng: -54.57 } }),
        lugar({ id: "c4", nombre: "Comida Cuatro", categoria: "comida", coordenadas: { lat: -25.604, lng: -54.57 } })
    ];
    const { api } = crearTuki({ lugares: lugaresComida });
    const r1 = api.resolver("Recomendame tres lugares para comer", { ahora: RELOJ });
    assert.equal(r1.lugares.length, 3);

    const r2 = api.resolver("Recomendame otros tres lugares", { ahora: RELOJ });
    assert.equal(r2.lugares.length, 3);
    assert.equal(r2.intencion.interes, "comida");
});

test("si existen varias listas anteriores y la referencia es ambigua, Tuki pide aclaración", () => {
    const comida = [
        lugar({ id: "com-1", nombre: "Resto Uno", categoria: "comida", coordenadas: { lat: -25.601, lng: -54.57 } }),
        lugar({ id: "com-2", nombre: "Resto Dos", categoria: "comida", coordenadas: { lat: -25.602, lng: -54.57 } })
    ];
    const naturaleza = [
        lugar({ id: "nat-1", nombre: "Parque Uno", categoria: "naturaleza", coordenadas: { lat: -25.61, lng: -54.57 } }),
        lugar({ id: "nat-2", nombre: "Parque Dos", categoria: "naturaleza", coordenadas: { lat: -25.62, lng: -54.57 } })
    ];
    const { api } = crearTuki({ lugares: [...comida, ...naturaleza] });
    api.resolver("Recomendame lugares para comer", { ahora: RELOJ });
    api.resolver("Recomendame lugares de naturaleza", { ahora: RELOJ });

    const respuesta = api.resolver("¿Cuál de esos lugares queda más cerca?", { ahora: RELOJ });
    assert.equal(respuesta.exacta, false);
    assert.match(respuesta.texto, /más de una lista|cuál de ellas/i);

    const respOriginal = api.resolver("¿Cuál de los lugares que me recomendaste originalmente queda más cerca?", { ahora: RELOJ });
    assert.equal(respOriginal.exacta, true);
    assert.equal(respOriginal.lugares[0].id, "com-1");
});

test("¿Y el segundo es más barato? compara el segundo lugar con las otras opciones del catálogo", () => {
    const lugares = [
        lugar({ id: "opcion-1", nombre: "Opción Alta", categoria: "naturaleza", nivelGasto: "alto" }),
        lugar({ id: "opcion-2", nombre: "Opción Económica", categoria: "naturaleza", nivelGasto: "economico" }),
        lugar({ id: "opcion-3", nombre: "Opción Media", categoria: "naturaleza", nivelGasto: "medio" })
    ];
    const { api } = crearTuki({ lugares });
    api.resolver("Quiero visitar naturaleza", { ahora: RELOJ });
    const respuesta = api.resolver("¿Y el segundo es más barato?", { ahora: RELOJ });

    assert.equal(respuesta.lugares[0].id, "opcion-2");
    assert.match(respuesta.texto, /Según los niveles de gasto del catálogo/);
    assert.match(respuesta.texto, /sí figura como la opción de menor gasto/);
});

test("¿Y mañana puedo ir? comprueba disponibilidad usando el contexto de mañana", () => {
    const lugarManana = lugar({ id: "manana-1", nombre: "Paseo Mañana", categoria: "naturaleza" });
    const { api, ventana } = crearTuki({ lugares: [lugarManana], disponible: (_lugar, contexto) => contexto.desplazamientoDia === 1 });
    api.resolver("Quiero visitar naturaleza", { ahora: RELOJ });
    const respuesta = api.resolver("¿Y mañana puedo ir?", { ahora: RELOJ });

    assert.equal(respuesta.lugares[0].id, "manana-1");
    assert.match(respuesta.texto, /para mañana, podés considerar Paseo Mañana/);
    assert.equal(ventana.__llamadasDisponibilidad.at(-1).contexto.desplazamientoDia, 1);
});

test("¿Y mañana? comprueba las recomendaciones previas sin exigir que se repita el tema", () => {
    const lugarManana = lugar({ id: "manana-2", nombre: "Sendero Mañana", categoria: "naturaleza" });
    const { api, ventana } = crearTuki({ lugares: [lugarManana], disponible: (_lugar, contexto) => contexto.desplazamientoDia === 1 });
    api.resolver("Quiero visitar naturaleza", { ahora: RELOJ });
    const respuesta = api.resolver("¿Y mañana?", { ahora: RELOJ });

    assert.equal(respuesta.lugares[0].id, "manana-2");
    assert.match(respuesta.texto, /para mañana, podés considerar Sendero Mañana/);
    assert.equal(ventana.__llamadasDisponibilidad.at(-1).contexto.desplazamientoDia, 1);
});

test("reiniciarSesion descarta las preferencias y el tema guardados en memoria", () => {
    const { api } = crearTuki();
    api.resolver("Quiero naturaleza con mi familia, barato", { ahora: RELOJ });
    api.reiniciarSesion();
    const respuesta = api.resolver("¿Y si llueve?", { ahora: RELOJ });

    assert.equal(respuesta.intencion.interes, "actividades");
    assert.equal(respuesta.intencion.compania, "solo");
    assert.equal(respuesta.intencion.presupuesto, "medio");
    assert.equal(respuesta.intencion.lluvia, true);
});

test("reiniciarSesion también elimina las referencias a lugares anteriores", () => {
    const lugarAnterior = lugar({ id: "anterior-1", nombre: "Lugar Anterior" });
    const { api } = crearTuki({ lugares: [lugarAnterior] });
    api.resolver("Quiero visitar naturaleza", { ahora: RELOJ });
    api.reiniciarSesion();
    const respuesta = api.resolver("¿Está abierto ese lugar?", { ahora: RELOJ });

    assert.equal(respuesta.lugares.length, 0);
    assert.match(respuesta.texto, /No tengo una recomendación anterior concreta/);
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
