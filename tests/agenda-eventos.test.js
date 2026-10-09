const assert = require("node:assert/strict");
const test = require("node:test");
const Agenda = require("../agenda-eventos.js");

const zona = Agenda.ZONA_HORARIA;

function evento(overrides = {}) {
    return {
        id: "evento-base",
        titulo: "Evento base",
        descripcion: "Descripción breve",
        categoria: "cultural",
        inicio: "2026-10-10T19:00:00-03:00",
        fin: "2026-10-10T21:00:00-03:00",
        zonaHoraria: zona,
        lugar: { nombre: "Centro cultural", direccion: null, coordenadas: null },
        organizador: "Organizador local",
        fuenteUrl: "https://example.com/evento-base",
        precio: { estado: "desconocido", monto: null, moneda: null, fuenteUrl: null, verificadoEn: null },
        estadoVerificacion: "verificado",
        verificadoEn: "2026-10-01T12:00:00-03:00",
        estadoEditorial: "confirmado",
        ...overrides
    };
}

function agenda(eventos = []) {
    return { schemaVersion: 1, zonaHoraria: zona, eventos };
}

test("agenda vacía es válida", () => {
    assert.deepEqual(Agenda.validarAgenda(agenda()), []);
    assert.deepEqual(Agenda.obtenerEventosPublicos([], "2026-10-09T12:00:00-03:00"), []);
});

test("rechaza JSON malformado o estructura inválida", () => {
    assert.throws(() => JSON.parse("{malformado"), SyntaxError);
    assert.ok(Agenda.validarAgenda(null).length > 0);
    assert.ok(Agenda.validarAgenda({ schemaVersion: 1, zonaHoraria: zona }).some(error => error.includes("array")));
});

test("acepta un evento confirmado válido y publica sus datos", () => {
    const e = evento();
    assert.deepEqual(Agenda.validarAgenda(agenda([e])), []);
    assert.deepEqual(Agenda.obtenerEventosPublicos([e], "2026-10-09T12:00:00-03:00"), [e]);
});

test("excluye eventos pendientes, cancelados y sin fuente válida", () => {
    const pendientes = evento({ id: "pendiente", estadoEditorial: "pendiente_confirmacion", estadoVerificacion: "pendiente", verificadoEn: null, fuenteUrl: null });
    const cancelado = evento({ id: "cancelado", estadoEditorial: "cancelado" });
    const sinFuente = evento({ id: "sin-fuente", fuenteUrl: null, estadoEditorial: "pendiente_confirmacion", estadoVerificacion: "pendiente", verificadoEn: null });
    assert.deepEqual(Agenda.obtenerEventosPublicos([pendientes, cancelado, sinFuente], "2026-10-09T12:00:00-03:00"), []);
    assert.ok(Agenda.validarAgenda(agenda([pendientes])).length === 0);
    assert.deepEqual(Agenda.validarAgenda(agenda([cancelado])), []);
});

test("excluye eventos pasados, pero conserva uno ya iniciado y aún vigente", () => {
    const pasado = evento({ id: "pasado", inicio: "2026-10-09T10:00:00-03:00", fin: "2026-10-09T11:00:00-03:00" });
    const enCurso = evento({ id: "en-curso", inicio: "2026-10-09T10:00:00-03:00", fin: "2026-10-09T14:00:00-03:00" });
    const ahora = "2026-10-09T12:00:00-03:00";
    assert.deepEqual(Agenda.obtenerEventosPublicos([pasado, enCurso], ahora).map(e => e.id), ["en-curso"]);
});

test("rechaza fechas inválidas o sin zona horaria", () => {
    assert.equal(Agenda.fechaValida("2026-02-30T10:00:00-03:00"), false);
    assert.equal(Agenda.fechaValida("2026-10-10T10:00:00"), false);
    assert.ok(Agenda.validarAgenda(agenda([evento({ inicio: "2026-10-10T10:00:00" })])).length > 0);
});

test("ordena cronológicamente sin mutar el array original", () => {
    const tarde = evento({ id: "tarde", inicio: "2026-10-12T10:00:00-03:00", fin: "2026-10-12T11:00:00-03:00" });
    const temprano = evento({ id: "temprano", inicio: "2026-10-10T10:00:00-03:00", fin: "2026-10-10T11:00:00-03:00" });
    const original = [tarde, temprano];
    assert.deepEqual(Agenda.ordenarPorInicio(original).map(e => e.id), ["temprano", "tarde"]);
    assert.deepEqual(original.map(e => e.id), ["tarde", "temprano"]);
});

test("filtra por categoría e intervalo, incluyendo un evento en curso", () => {
    const cultural = evento({ id: "cultural", categoria: "cultural" });
    const feria = evento({ id: "feria", categoria: "feria", inicio: "2026-10-11T09:00:00-03:00", fin: "2026-10-11T18:00:00-03:00" });
    assert.deepEqual(Agenda.filtrarPorCategoria([cultural, feria], "feria").map(e => e.id), ["feria"]);
    assert.deepEqual(Agenda.filtrarPorFecha([cultural, feria], "2026-10-10T20:00:00-03:00", "2026-10-11T10:00:00-03:00").map(e => e.id), ["cultural", "feria"]);
});

test("tolera campos opcionales en null y no interpreta precio desconocido como gratuito", () => {
    const e = evento({ lugar: null, organizador: null, fin: null });
    assert.deepEqual(Agenda.validarAgenda(agenda([e])), []);
    assert.equal(e.precio.estado, "desconocido");
    assert.notEqual(e.precio.estado, "gratuito");
});

test("cargarAgenda devuelve errores identificables y resuelve la ruta de GitHub Pages", async () => {
    assert.equal(Agenda.resolverRutaAgenda("eventos.json", "https://marianoleivaa-86.github.io/IGUAZU-ASSIST/"), "https://marianoleivaa-86.github.io/IGUAZU-ASSIST/eventos.json");
    const cargada = await Agenda.cargarAgenda({
        base: "https://marianoleivaa-86.github.io/IGUAZU-ASSIST/",
        fetchImpl: async url => ({ ok: true, url, json: async () => agenda() })
    });
    assert.equal(cargada.ok, true);
    assert.equal(cargada.eventos.length, 0);
    const fallida = await Agenda.cargarAgenda({ fetchImpl: async () => ({ ok: true, json: async () => ({ schemaVersion: 99 }) }) });
    assert.equal(fallida.ok, false);
    assert.equal(fallida.error.codigo, "AGENDA_INVALIDA");
});
