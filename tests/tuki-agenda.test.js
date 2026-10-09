const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const Agenda = require("../agenda-eventos.js");

const zona = Agenda.ZONA_HORARIA;
const reloj = new Date("2026-10-09T12:00:00-03:00");

function evento(overrides = {}) {
    return {
        id: "evento-tuki",
        titulo: "Evento cultural de Iguazú",
        descripcion: "Actividad confirmada",
        categoria: "cultural",
        inicio: "2026-10-09T19:00:00-03:00",
        fin: "2026-10-09T21:00:00-03:00",
        zonaHoraria: zona,
        lugar: { nombre: "Centro cultural", direccion: null, coordenadas: null },
        organizador: "Organizador local",
        fuenteUrl: "https://example.com/evento-tuki",
        precio: { estado: "desconocido", monto: null, moneda: null, fuenteUrl: null, verificadoEn: null },
        estadoVerificacion: "verificado",
        verificadoEn: "2026-10-01T12:00:00-03:00",
        estadoEditorial: "confirmado",
        ...overrides
    };
}

function crearTuki({ eventos = [], error = null } = {}) {
    const agendaStub = {
        ...Agenda,
        cargarAgenda: async () => error
            ? { ok: false, eventos: [], error }
            : { ok: true, eventos, error: null }
    };
    const ventana = {
        AgendaEventos: agendaStub,
        I18n: { t: (_key, fallback) => fallback },
        addEventListener() {},
        setTimeout,
        PlanificadorAPI: {}
    };
    const contexto = {
        window: ventana,
        document: {
            readyState: "loading",
            baseURI: "https://marianoleivaa-86.github.io/IGUAZU-ASSIST/",
            addEventListener() {},
            querySelector() { return null; },
            querySelectorAll() { return []; },
            body: { classList: { add() {}, remove() {} } }
        },
        navigator: { onLine: true },
        AppState: { compania: "solo", presupuesto: "medio", tiempo: "medio día" },
        lugaresReales: [],
        CONFIG_APP: { coordenadasCentro: { lat: -25.6, lng: -54.57 } },
        escapar: texto => String(texto ?? ""),
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
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, "..", "tuki-asistente.js"), "utf8"), contexto);
    return contexto.window.TukiAsistente;
}

async function cargar(api) {
    await api.agenda.cargar();
    return api;
}

test("reconoce hoy, mañana, noche, fin de semana y categorías de agenda", () => {
    const api = crearTuki();
    assert.equal(api.agenda.interpretar("¿Qué eventos hay hoy?").esAgenda, true);
    assert.equal(api.agenda.interpretar("¿Qué hay mañana?").periodo, "manana");
    assert.equal(api.agenda.interpretar("¿Hay actividades para esta noche?").periodo, "noche");
    assert.equal(api.agenda.interpretar("¿Qué hay el fin de semana?").periodo, "fin_de_semana");
    assert.equal(api.agenda.interpretar("¿Hay recitales o música en vivo?").categoria, "recital");
    assert.equal(api.agenda.interpretar("Busco una feria de emprendedores").categoria, "feria");
});

test("calcula intervalos con zona horaria argentina y reloj controlable", () => {
    const api = crearTuki();
    const iso = intervalo => [new Date(intervalo.desde).toISOString(), new Date(intervalo.hasta).toISOString()];
    assert.deepEqual(iso(api.agenda.intervalo("hoy", reloj)), ["2026-10-09T03:00:00.000Z", "2026-10-10T03:00:00.000Z"]);
    assert.deepEqual(iso(api.agenda.intervalo("manana", reloj)), ["2026-10-10T03:00:00.000Z", "2026-10-11T03:00:00.000Z"]);
    assert.deepEqual(iso(api.agenda.intervalo("fin_de_semana", reloj)), ["2026-10-10T03:00:00.000Z", "2026-10-12T03:00:00.000Z"]);
});

test("no confunde una consulta turística general con una consulta de eventos", () => {
    const api = crearTuki();
    assert.equal(api.interpretar("¿Qué puedo hacer hoy?").esAgenda, false);
    assert.equal(api.interpretar("¿Dónde comer cerca?").esAgenda, false);
});

test("devuelve eventos confirmados dentro del período y excluye pendientes o cancelados", async () => {
    const api = await cargar(crearTuki({ eventos: [
        evento({ id: "hoy", inicio: "2026-10-09T19:00:00-03:00", fin: "2026-10-09T21:00:00-03:00" }),
        evento({ id: "pendiente", estadoEditorial: "pendiente_confirmacion", estadoVerificacion: "pendiente", fuenteUrl: null, verificadoEn: null }),
        evento({ id: "cancelado", estadoEditorial: "cancelado" }),
        evento({ id: "manana", categoria: "feria", inicio: "2026-10-10T10:00:00-03:00", fin: "2026-10-10T12:00:00-03:00" })
    ] }));
    const respuesta = api.resolver("¿Qué eventos hay hoy?", { ahora: reloj });
    assert.deepEqual(respuesta.eventos.map(item => item.id), ["hoy"]);
    assert.match(respuesta.texto, /fuente/i);

    const manana = api.resolver("¿Qué ferias hay mañana?", { ahora: reloj });
    assert.deepEqual(manana.eventos.map(item => item.id), ["manana"]);
});

test("agenda vacía diferencia correctamente la ausencia de eventos cargados", async () => {
    const api = await cargar(crearTuki());
    const respuesta = api.resolver("¿Qué eventos hay hoy?", { ahora: reloj });
    assert.equal(Array.from(respuesta.eventos).length, 0);
    assert.match(respuesta.texto, /agenda de la aplicación/i);
});

test("diferencia el error de carga de la agenda", async () => {
    const api = await cargar(crearTuki({ error: { codigo: "AGENDA_NO_CARGADA" } }));
    const respuesta = api.resolver("¿Qué hay este fin de semana?", { ahora: reloj });
    assert.equal(Array.from(respuesta.eventos).length, 0);
    assert.match(respuesta.texto, /No pude consultar la agenda local/i);
});
