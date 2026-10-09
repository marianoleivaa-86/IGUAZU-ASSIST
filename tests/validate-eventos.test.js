const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const archivo = path.join(__dirname, "..", "eventos.json");
const zona = "America/Argentina/Buenos_Aires";
const categorias = new Set([
    "recital", "festival", "carnaval", "fiesta_popular", "feria",
    "encuentro_autos", "encuentro_motos", "cultural", "deportivo",
    "exposicion", "espectaculo", "otro"
]);

function fechaValida(valor) {
    if (typeof valor !== "string") return false;
    const m = valor.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(Z|([+-])(\d{2}):(\d{2}))$/);
    if (!m) return false;
    const [anio, mes, dia, hora, minuto, segundo] = m.slice(1, 7).map(Number);
    const bisiesto = anio % 4 === 0 && (anio % 100 !== 0 || anio % 400 === 0);
    const dias = [31, bisiesto ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    if (mes < 1 || mes > 12 || dia < 1 || dia > dias[mes - 1]) return false;
    if (hora > 23 || minuto > 59 || segundo > 59) return false;
    if (m[8] && (Number(m[9]) > 14 || Number(m[10]) > 59 || (Number(m[9]) === 14 && Number(m[10]) !== 0))) return false;
    return Number.isFinite(Date.parse(valor));
}

function urlValida(valor) {
    if (typeof valor !== "string" || !valor.trim()) return false;
    try { return ["https:", "http:"].includes(new URL(valor).protocol); }
    catch { return false; }
}

function validarPrecio(precio, n, errores) {
    const p = `eventos[${n}].precio`;
    if (!precio || typeof precio !== "object" || Array.isArray(precio)) {
        errores.push(`${p} debe ser un objeto.`);
        return;
    }
    if (!["desconocido", "pendiente_verificacion", "confirmado", "gratuito"].includes(precio.estado)) {
        errores.push(`${p}.estado no es válido.`);
        return;
    }
    if (["desconocido", "pendiente_verificacion"].includes(precio.estado)) {
        if (precio.monto !== null || precio.moneda !== null) errores.push(`${p}: un precio desconocido/pendiente debe tener monto y moneda null.`);
        return;
    }

    const gratuito = precio.estado === "gratuito";
    if (gratuito ? precio.monto !== 0 : (!Number.isFinite(precio.monto) || precio.monto <= 0)) {
        errores.push(`${p}: el monto no coincide con su estado; monto 0 solo se admite como gratuito.`);
    }
    if (!gratuito && !/^[A-Z]{3}$/.test(precio.moneda || "")) errores.push(`${p}: falta moneda ISO de tres letras.`);
    if (gratuito && precio.moneda !== null && !/^[A-Z]{3}$/.test(precio.moneda)) errores.push(`${p}: moneda debe ser null o código ISO de tres letras.`);
    if (!urlValida(precio.fuenteUrl)) errores.push(`${p}: precio confirmado/gratuito requiere fuente HTTP(S).`);
    if (!fechaValida(precio.verificadoEn)) errores.push(`${p}: precio confirmado/gratuito requiere verificadoEn ISO 8601.`);
}

function validarEvento(e, n) {
    const errores = [];
    const p = `eventos[${n}]`;
    if (!e || typeof e !== "object" || Array.isArray(e)) return [`${p} debe ser un objeto.`];
    const requeridos = ["id", "titulo", "descripcion", "categoria", "inicio", "fin", "zonaHoraria", "lugar", "organizador", "fuenteUrl", "precio", "estadoVerificacion", "verificadoEn", "estadoEditorial"];
    for (const campo of requeridos) if (!Object.hasOwn(e, campo)) errores.push(`${p}.${campo} es obligatorio (null si es opcional).`);

    if (typeof e.id !== "string" || !e.id.trim()) errores.push(`${p}.id debe ser texto no vacío.`);
    if (typeof e.titulo !== "string" || !e.titulo.trim()) errores.push(`${p}.titulo debe ser texto no vacío.`);
    if (typeof e.descripcion !== "string") errores.push(`${p}.descripcion debe ser texto.`);
    if (!categorias.has(e.categoria)) errores.push(`${p}.categoria no es válida.`);
    if (e.zonaHoraria !== zona) errores.push(`${p}.zonaHoraria debe ser ${zona}.`);
    if (!fechaValida(e.inicio)) errores.push(`${p}.inicio debe ser ISO 8601 con zona explícita.`);
    if (e.fin !== null && !fechaValida(e.fin)) errores.push(`${p}.fin debe ser ISO 8601 con zona explícita o null.`);
    if (fechaValida(e.inicio) && fechaValida(e.fin) && Date.parse(e.fin) < Date.parse(e.inicio)) errores.push(`${p}.fin no puede ser anterior a inicio.`);

    if (e.lugar !== null) {
        if (!e.lugar || typeof e.lugar !== "object" || Array.isArray(e.lugar)) errores.push(`${p}.lugar debe ser objeto o null.`);
        else {
            for (const campo of ["nombre", "direccion"]) if (e.lugar[campo] != null && e.lugar[campo] !== "" && typeof e.lugar[campo] !== "string") errores.push(`${p}.lugar.${campo} debe ser texto o null.`);
            const c = e.lugar.coordenadas;
            if (c != null && (!Number.isFinite(c.lat) || c.lat < -90 || c.lat > 90 || !Number.isFinite(c.lng) || c.lng < -180 || c.lng > 180)) errores.push(`${p}.lugar.coordenadas debe tener lat [-90,90] y lng [-180,180].`);
        }
    }
    if (e.organizador != null && e.organizador !== "" && typeof e.organizador !== "string") errores.push(`${p}.organizador debe ser texto o null.`);
    if (e.fuenteUrl != null && e.fuenteUrl !== "" && !urlValida(e.fuenteUrl)) errores.push(`${p}.fuenteUrl debe ser HTTP(S) o null.`);
    if (!["pendiente", "verificado"].includes(e.estadoVerificacion)) errores.push(`${p}.estadoVerificacion no es válido.`);
    if (e.verificadoEn !== null && !fechaValida(e.verificadoEn)) errores.push(`${p}.verificadoEn debe ser ISO 8601 con zona o null.`);
    if (e.estadoVerificacion === "verificado" && !fechaValida(e.verificadoEn)) errores.push(`${p}: un evento verificado requiere verificadoEn.`);
    if (!["pendiente_confirmacion", "confirmado", "cancelado"].includes(e.estadoEditorial)) errores.push(`${p}.estadoEditorial no es válido.`);
    if (["confirmado", "cancelado"].includes(e.estadoEditorial)) {
        if (!urlValida(e.fuenteUrl)) errores.push(`${p}: confirmado/cancelado requiere fuente HTTP(S).`);
        if (!fechaValida(e.verificadoEn)) errores.push(`${p}: confirmado/cancelado requiere fecha de verificación.`);
        if (e.estadoVerificacion !== "verificado") errores.push(`${p}: confirmado/cancelado requiere estadoVerificacion verificado.`);
    }
    validarPrecio(e.precio, n, errores);
    return errores;
}

function validarAgenda(agenda) {
    if (!agenda || typeof agenda !== "object" || Array.isArray(agenda)) return ["La raíz debe ser un objeto JSON."];
    const errores = [];
    if (agenda.schemaVersion !== 1) errores.push("schemaVersion debe ser 1.");
    if (agenda.zonaHoraria !== zona) errores.push(`zonaHoraria debe ser ${zona}.`);
    if (!Array.isArray(agenda.eventos)) return [...errores, "eventos debe ser un array."];
    const ids = new Set();
    agenda.eventos.forEach((e, n) => {
        if (typeof e?.id === "string" && e.id.trim()) {
            if (ids.has(e.id)) errores.push(`ID duplicado: ${e.id}.`);
            ids.add(e.id);
        }
        errores.push(...validarEvento(e, n));
    });
    return errores;
}

function proximosConfirmados(eventos, ahora) {
    return eventos.filter(e => e.estadoEditorial === "confirmado" && fechaValida(e.fin || e.inicio) && Date.parse(e.fin || e.inicio) >= ahora);
}

// Fixtures FICTICIOS solo en memoria para las pruebas: no se guardan en eventos.json ni se muestran al público.
function eventoFicticio(overrides = {}) {
    return {
        id: "FICTICIO-NO-PUBLICAR-001",
        titulo: "Evento ficticio de prueba (no publicar)",
        descripcion: "Fixture inventado exclusivamente para validar el esquema.",
        categoria: "recital",
        inicio: "2099-06-10T19:00:00-03:00",
        fin: "2099-06-10T21:00:00-03:00",
        zonaHoraria: zona,
        lugar: { nombre: null, direccion: null, coordenadas: null },
        organizador: null,
        fuenteUrl: null,
        precio: { estado: "desconocido", monto: null, moneda: null, fuenteUrl: null, verificadoEn: null },
        estadoVerificacion: "pendiente",
        verificadoEn: null,
        estadoEditorial: "pendiente_confirmacion",
        ...overrides
    };
}
const agendaCon = eventos => ({ schemaVersion: 1, zonaHoraria: zona, eventos });

test("eventos.json es válido y no contiene ejemplos ficticios", () => {
    const agenda = JSON.parse(fs.readFileSync(archivo, "utf8"));
    assert.deepEqual(validarAgenda(agenda), []);
    assert.deepEqual(agenda.eventos, []);
});

test("permite nulos en campos opcionales", () => {
    assert.deepEqual(validarAgenda(agendaCon([eventoFicticio({ fin: null, lugar: null })])), []);
});

test("rechaza IDs duplicados", () => {
    const a = eventoFicticio();
    const b = eventoFicticio({ titulo: "Otro fixture ficticio" });
    assert.ok(validarAgenda(agendaCon([a, b])).some(error => error.includes("ID duplicado")));
});

test("rechaza fechas inválidas y final anterior al inicio", () => {
    assert.ok(validarAgenda(agendaCon([eventoFicticio({ inicio: "2099-02-30T19:00:00-03:00" })])).some(error => error.includes("inicio debe ser")));
    assert.ok(validarAgenda(agendaCon([eventoFicticio({ inicio: "2099-06-10T21:00:00-03:00", fin: "2099-06-10T19:00:00-03:00" })])).some(error => error.includes("no puede ser anterior")));
});

test("confirmado requiere fuente y fecha de verificación", () => {
    const incompleto = eventoFicticio({ estadoEditorial: "confirmado", estadoVerificacion: "verificado" });
    const errores = validarAgenda(agendaCon([incompleto]));
    assert.ok(errores.some(error => error.includes("requiere fuente")));
    assert.ok(errores.some(error => error.includes("requiere fecha de verificación")));
    const completo = eventoFicticio({ estadoEditorial: "confirmado", estadoVerificacion: "verificado", fuenteUrl: "https://example.invalid/fuente-ficticia", verificadoEn: "2099-06-01T12:00:00-03:00" });
    assert.deepEqual(validarAgenda(agendaCon([completo])), []);
});

test("precio desconocido no se interpreta como gratuito", () => {
    const e = eventoFicticio();
    assert.deepEqual(validarAgenda(agendaCon([e])), []);
    e.precio.monto = 0;
    assert.ok(validarAgenda(agendaCon([e])).some(error => error.includes("desconocido/pendiente")));
});

test("gratuito requiere monto cero, fuente y verificación", () => {
    const e = eventoFicticio({ precio: { estado: "gratuito", monto: 0, moneda: null, fuenteUrl: "https://example.invalid/precio-ficticio", verificadoEn: "2099-06-01T12:00:00-03:00" } });
    assert.deepEqual(validarAgenda(agendaCon([e])), []);
    e.precio.fuenteUrl = null;
    assert.ok(validarAgenda(agendaCon([e])).some(error => error.includes("requiere fuente")));
});

test("cancelados y pendientes no aparecen como próximos confirmados", () => {
    const confirmado = eventoFicticio({ estadoEditorial: "confirmado", estadoVerificacion: "verificado", fuenteUrl: "https://example.invalid/fuente-ficticia", verificadoEn: "2099-06-01T12:00:00-03:00" });
    const cancelado = eventoFicticio({ id: "FICTICIO-CANCELADO-NO-PUBLICAR", estadoEditorial: "cancelado", estadoVerificacion: "verificado", fuenteUrl: "https://example.invalid/cancelacion-ficticia", verificadoEn: "2099-06-02T12:00:00-03:00" });
    const ahora = Date.parse("2099-06-01T00:00:00-03:00");
    assert.deepEqual(proximosConfirmados([confirmado, cancelado], ahora).map(e => e.id), [confirmado.id]);
});
