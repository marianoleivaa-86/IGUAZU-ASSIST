const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function cargarCatalogo() {
    const fuente = fs.readFileSync(path.join(__dirname, "..", "data.js"), "utf8");
    const contexto = { console, Date, Intl, Math, Number, String, Boolean, Object, Array, Set };
    vm.runInNewContext(fuente, contexto, { filename: "data.js" });
    return vm.runInNewContext("lugaresReales", contexto);
}

const CANDIDATOS = [
    { id: 56, nombre: "Centro de Eventos y Convenciones del Iguazú", direccion: /Tres Fronteras 780/i },
    { id: 57, nombre: "Centro de Convenciones Iryapú", direccion: /Selva Iryapú/i },
    { id: 58, nombre: "La Cabaña de los Muñecos", direccion: /Tres Fronteras 434/i },
    { id: 59, nombre: "La BarCasa", direccion: /Franja Ecológica y Flor de Lapacho/i }
];

test("incorpora los cuatro lugares candidatos sin duplicar sus identificadores", () => {
    const lugares = cargarCatalogo();
    const ids = new Set(lugares.map(lugar => lugar.id));
    const nombres = new Set(lugares.map(lugar => lugar.nombre));

    assert.equal(ids.size, lugares.length);
    for (const candidato of CANDIDATOS) {
        const lugar = lugares.find(item => item.id === candidato.id);
        assert.ok(lugar, `falta el registro ${candidato.nombre}`);
        assert.equal(lugar.nombre, candidato.nombre);
        assert.equal(lugar.categoria, "actividades");
        assert.equal(lugar.planificable, false);
        assert.match(lugar.direccion, candidato.direccion);
        assert.ok(nombres.has(candidato.nombre));
    }
});

test("los nuevos registros no inventan coordenadas, horarios ni precios confirmados", () => {
    const lugares = cargarCatalogo();
    for (const candidato of CANDIDATOS) {
        const lugar = lugares.find(item => item.id === candidato.id);
        assert.equal(lugar.coordenadas, null);
        assert.equal(lugar.rangoHorario, null);
        assert.equal(lugar.precio.estado, "desconocido");
        assert.equal(lugar.precio.monto, null);
        assert.equal(lugar.gratuito, null);
        assert.equal(lugar.operacion.disponibilidad, "desconocida");
    }
});

test("no incorpora Mirador Escondido como un registro separado", () => {
    const lugares = cargarCatalogo();
    assert.equal(lugares.some(lugar => /mirador escondido/i.test(lugar.nombre)), false);
    assert.equal(lugares.filter(lugar => lugar.id === 40).length, 1);
});
