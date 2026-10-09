const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const Agenda = require("../agenda-eventos.js");

const APP_SOURCE = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
const AGENDA_VACIA = { schemaVersion: 1, zonaHoraria: Agenda.ZONA_HORARIA, eventos: [] };
const AGENDA_ANTERIOR = {
    schemaVersion: 1,
    zonaHoraria: Agenda.ZONA_HORARIA,
    eventos: [{
        id: "evento-anterior",
        titulo: "Evento anterior",
        descripcion: "Evento confirmado anterior",
        categoria: "cultural",
        inicio: "2099-10-10T19:00:00-03:00",
        fin: "2099-10-10T21:00:00-03:00",
        zonaHoraria: Agenda.ZONA_HORARIA,
        lugar: null,
        organizador: null,
        fuenteUrl: "https://example.com/evento-anterior",
        precio: { estado: "desconocido", monto: null, moneda: null, fuenteUrl: null, verificadoEn: null },
        estadoVerificacion: "verificado",
        verificadoEn: "2099-10-01T12:00:00-03:00",
        estadoEditorial: "confirmado"
    }]
};

function crearIndexedDB({ valores = {}, fallaLectura = false, fallaEscritura = false } = {}) {
    const store = new Map(Object.entries(valores));
    return {
        store,
        open() {
            const request = {};
            queueMicrotask(() => {
                const db = {
                    objectStoreNames: { contains: () => true },
                    createObjectStore() {},
                    transaction() {
                        const transaction = {};
                        transaction.objectStore = () => ({
                            get(clave) {
                                const lectura = {};
                                queueMicrotask(() => {
                                    if (fallaLectura) lectura.onerror?.({ target: { error: new Error("read failed") } });
                                    else {
                                        lectura.result = store.get(clave);
                                        lectura.onsuccess?.();
                                    }
                                });
                                return lectura;
                            },
                            put(valor, clave) {
                                queueMicrotask(() => {
                                    if (fallaEscritura) transaction.onerror?.({ target: { error: new Error("write failed") } });
                                    else {
                                        store.set(clave, valor);
                                        transaction.oncomplete?.();
                                    }
                                });
                            }
                        });
                        return transaction;
                    }
                };
                request.result = db;
                request.onupgradeneeded?.();
                request.onsuccess?.();
            });
            return request;
        }
    };
}

function crearContexto({ resultadoCarga, indexedDB }) {
    const elementos = {
        "#agenda-status": { className: "", textContent: "" },
        "#agenda-list": { innerHTML: "" }
    };
    const agendaStub = { ...Agenda, cargarAgenda: async () => resultadoCarga() };
    const ventana = {
        AgendaEventos: agendaStub,
        indexedDB,
        addEventListener() {}
    };
    const contexto = {
        window: ventana,
        document: {
            readyState: "loading",
            baseURI: "https://example.test/",
            addEventListener() {},
            querySelector(selector) { return elementos[selector] || null; },
            querySelectorAll() { return []; }
        },
        navigator: { onLine: false },
        indexedDB,
        localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
        AgendaEventos: agendaStub,
        console: { ...console, info() {}, warn() {}, error() {} },
        setTimeout,
        clearTimeout,
        queueMicrotask,
        URL,
        Date,
        Intl,
        Math,
        Number,
        String,
        Boolean,
        Object,
        Array,
        Set,
        Promise
    };
    ventana.cargarPlanificador = () => Promise.resolve();
    contexto.fetch = async () => ({ ok: true, json: async () => AGENDA_VACIA });
    vm.runInNewContext(APP_SOURCE, contexto);
    return { contexto, elementos, ventana };
}

function cargaExitosa(agenda) {
    return () => ({ ok: true, agenda, eventos: agenda.eventos, error: null });
}

function cargaFallida() {
    return () => ({ ok: false, agenda: null, eventos: [], error: { codigo: "AGENDA_NO_CARGADA" } });
}

test("guarda un snapshot válido después de una carga exitosa", async () => {
    const indexedDB = crearIndexedDB();
    const { ventana } = crearContexto({ resultadoCarga: cargaExitosa(AGENDA_ANTERIOR), indexedDB });

    const resultado = await ventana.cargarAgendaInterfaz();

    assert.equal(resultado.ok, true);
    assert.deepEqual(indexedDB.store.get("agenda-snapshot"), AGENDA_ANTERIOR);
});

test("recupera la agenda guardada cuando falla la carga offline", async () => {
    const indexedDB = crearIndexedDB({ valores: { "agenda-snapshot": AGENDA_VACIA } });
    const { ventana } = crearContexto({ resultadoCarga: cargaFallida(), indexedDB });

    const resultado = await ventana.cargarAgendaInterfaz();

    assert.equal(resultado.ok, false);
    assert.equal(resultado.recuperadaOffline, true);
});

test("ignora un snapshot inválido y conserva el error de carga", async () => {
    const indexedDB = crearIndexedDB({ valores: { "agenda-snapshot": { schemaVersion: 99, eventos: [] } } });
    const { ventana, elementos } = crearContexto({ resultadoCarga: cargaFallida(), indexedDB });

    const resultado = await ventana.cargarAgendaInterfaz();

    assert.equal(resultado.ok, false);
    assert.equal(resultado.recuperadaOffline, undefined);
    assert.match(elementos["#agenda-status"].textContent, /No se pudo cargar la agenda/);
});

test("una agenda vacía no restaura datos antiguos ni sobrescribe su snapshot", async () => {
    const indexedDB = crearIndexedDB({ valores: { "agenda-snapshot": AGENDA_ANTERIOR } });
    const { ventana, elementos } = crearContexto({ resultadoCarga: cargaExitosa(AGENDA_VACIA), indexedDB });

    const resultado = await ventana.cargarAgendaInterfaz();

    assert.equal(resultado.ok, true);
    assert.equal(elementos["#agenda-list"].innerHTML, "");
    assert.deepEqual(indexedDB.store.get("agenda-snapshot"), AGENDA_ANTERIOR);
});

test("tolera errores de IndexedDB sin romper la carga ni recuperar datos inválidos", async () => {
    const escrituraFallida = crearIndexedDB({ fallaEscritura: true });
    const cargada = crearContexto({ resultadoCarga: cargaExitosa(AGENDA_VACIA), indexedDB: escrituraFallida });
    assert.equal((await cargada.ventana.cargarAgendaInterfaz()).ok, true);
    assert.equal(escrituraFallida.store.has("agenda-snapshot"), false);

    const lecturaFallida = crearIndexedDB({ fallaLectura: true });
    const offline = crearContexto({ resultadoCarga: cargaFallida(), indexedDB: lecturaFallida });
    const resultado = await offline.ventana.cargarAgendaInterfaz();
    assert.equal(resultado.ok, false);
    assert.equal(resultado.recuperadaOffline, undefined);
});
