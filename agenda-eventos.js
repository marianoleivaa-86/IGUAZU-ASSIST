/*
 * IGUAZÚ ASSIST — Motor independiente de agenda
 *
 * No depende de la interfaz ni de fuentes externas. Se puede cargar como
 * CommonJS en Node o como script clásico en el navegador.
 */
(function (root, factory) {
    if (typeof module === "object" && module.exports) {
        module.exports = factory();
    } else {
        root.AgendaEventos = factory();
    }
}(typeof globalThis !== "undefined" ? globalThis : this, function () {
    "use strict";

    const ZONA_HORARIA = "America/Argentina/Buenos_Aires";
    const ESTADOS_EDITORIALES = new Set(["pendiente_confirmacion", "confirmado", "cancelado"]);
    const CATEGORIAS = new Set([
        "recital", "festival", "carnaval", "fiesta_popular", "feria",
        "encuentro_autos", "encuentro_motos", "cultural", "deportivo",
        "exposicion", "espectaculo", "otro"
    ]);

    class AgendaEventosError extends Error {
        constructor(codigo, mensaje, causa = null) {
            super(mensaje);
            this.name = "AgendaEventosError";
            this.codigo = codigo;
            this.causa = causa;
        }
    }

    function esObjeto(valor) {
        return Boolean(valor) && typeof valor === "object" && !Array.isArray(valor);
    }

    function urlValida(valor) {
        if (typeof valor !== "string" || !valor.trim()) return false;
        try {
            return ["http:", "https:"].includes(new URL(valor).protocol);
        } catch (_) {
            return false;
        }
    }

    function fechaValida(valor) {
        if (typeof valor !== "string") return false;
        const partes = valor.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(Z|([+-])(\d{2}):(\d{2}))$/);
        if (!partes) return false;
        const [anio, mes, dia, hora, minuto, segundo] = partes.slice(1, 7).map(Number);
        const bisiesto = anio % 4 === 0 && (anio % 100 !== 0 || anio % 400 === 0);
        const diasPorMes = [31, bisiesto ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
        if (mes < 1 || mes > 12 || dia < 1 || dia > diasPorMes[mes - 1]) return false;
        if (hora > 23 || minuto > 59 || segundo > 59) return false;
        if (partes[8] && (Number(partes[9]) > 14 || Number(partes[10]) > 59 || (Number(partes[9]) === 14 && Number(partes[10]) !== 0))) return false;
        return Number.isFinite(Date.parse(valor));
    }

    function instante(valor) {
        return fechaValida(valor) ? Date.parse(valor) : NaN;
    }

    function validarPrecio(precio, ruta, errores) {
        if (!esObjeto(precio)) {
            errores.push(`${ruta}.precio debe ser un objeto.`);
            return;
        }
        const estados = new Set(["desconocido", "pendiente_verificacion", "confirmado", "gratuito"]);
        if (!estados.has(precio.estado)) errores.push(`${ruta}.precio.estado no es válido.`);
        if (["desconocido", "pendiente_verificacion"].includes(precio.estado)) {
            if (precio.monto !== null || precio.moneda !== null) {
                errores.push(`${ruta}.precio desconocido/pendiente debe tener monto y moneda null.`);
            }
            return;
        }
        const esGratuito = precio.estado === "gratuito";
        if (esGratuito ? precio.monto !== 0 : (!Number.isFinite(precio.monto) || precio.monto <= 0)) {
            errores.push(`${ruta}.precio.monto no coincide con su estado.`);
        }
        if (!esGratuito && !/^[A-Z]{3}$/.test(precio.moneda || "")) {
            errores.push(`${ruta}.precio.moneda debe ser un código ISO de tres letras.`);
        }
        if (esGratuito && precio.moneda !== null && !/^[A-Z]{3}$/.test(precio.moneda)) {
            errores.push(`${ruta}.precio.moneda debe ser null o un código ISO de tres letras.`);
        }
        if (!urlValida(precio.fuenteUrl)) errores.push(`${ruta}.precio requiere fuenteUrl HTTP(S).`);
        if (!fechaValida(precio.verificadoEn)) errores.push(`${ruta}.precio requiere verificadoEn con zona explícita.`);
    }

    function validarEvento(evento, indice) {
        const ruta = `eventos[${indice}]`;
        const errores = [];
        if (!esObjeto(evento)) return [`${ruta} debe ser un objeto.`];
        ["id", "titulo", "descripcion", "categoria", "inicio", "fin", "zonaHoraria", "lugar", "organizador", "fuenteUrl", "precio", "estadoVerificacion", "verificadoEn", "estadoEditorial"]
            .forEach(campo => {
                if (!Object.prototype.hasOwnProperty.call(evento, campo)) errores.push(`${ruta}.${campo} es obligatorio.`);
            });
        if (typeof evento.id !== "string" || !evento.id.trim()) errores.push(`${ruta}.id debe ser texto no vacío.`);
        if (typeof evento.titulo !== "string" || !evento.titulo.trim()) errores.push(`${ruta}.titulo debe ser texto no vacío.`);
        if (typeof evento.descripcion !== "string") errores.push(`${ruta}.descripcion debe ser texto.`);
        if (!CATEGORIAS.has(evento.categoria)) errores.push(`${ruta}.categoria no es válida.`);
        if (evento.zonaHoraria !== ZONA_HORARIA) errores.push(`${ruta}.zonaHoraria debe ser ${ZONA_HORARIA}.`);
        if (!fechaValida(evento.inicio)) errores.push(`${ruta}.inicio debe ser ISO 8601 con zona explícita.`);
        if (evento.fin !== null && !fechaValida(evento.fin)) errores.push(`${ruta}.fin debe ser ISO 8601 con zona explícita o null.`);
        if (fechaValida(evento.inicio) && fechaValida(evento.fin) && instante(evento.fin) < instante(evento.inicio)) {
            errores.push(`${ruta}.fin no puede ser anterior a inicio.`);
        }
        if (evento.lugar !== null && !esObjeto(evento.lugar)) errores.push(`${ruta}.lugar debe ser objeto o null.`);
        if (evento.organizador !== null && typeof evento.organizador !== "string") errores.push(`${ruta}.organizador debe ser texto o null.`);
        if (evento.fuenteUrl !== null && evento.fuenteUrl !== "" && !urlValida(evento.fuenteUrl)) errores.push(`${ruta}.fuenteUrl debe ser HTTP(S) o null.`);
        if (!["pendiente", "verificado"].includes(evento.estadoVerificacion)) errores.push(`${ruta}.estadoVerificacion no es válido.`);
        if (evento.verificadoEn !== null && !fechaValida(evento.verificadoEn)) errores.push(`${ruta}.verificadoEn debe ser ISO 8601 o null.`);
        if (evento.estadoVerificacion === "verificado" && !fechaValida(evento.verificadoEn)) errores.push(`${ruta} verificado requiere verificadoEn.`);
        if (!ESTADOS_EDITORIALES.has(evento.estadoEditorial)) errores.push(`${ruta}.estadoEditorial no es válido.`);
        if (["confirmado", "cancelado"].includes(evento.estadoEditorial)) {
            if (!urlValida(evento.fuenteUrl)) errores.push(`${ruta} confirmado/cancelado requiere fuenteUrl HTTP(S).`);
            if (!fechaValida(evento.verificadoEn)) errores.push(`${ruta} confirmado/cancelado requiere verificadoEn.`);
            if (evento.estadoVerificacion !== "verificado") errores.push(`${ruta} confirmado/cancelado requiere estadoVerificacion verificado.`);
        }
        validarPrecio(evento.precio, ruta, errores);
        return errores;
    }

    function validarAgenda(agenda) {
        if (!esObjeto(agenda)) return ["La raíz debe ser un objeto JSON."];
        const errores = [];
        if (agenda.schemaVersion !== 1) errores.push("schemaVersion debe ser 1.");
        if (agenda.zonaHoraria !== ZONA_HORARIA) errores.push(`zonaHoraria debe ser ${ZONA_HORARIA}.`);
        if (!Array.isArray(agenda.eventos)) return [...errores, "eventos debe ser un array."];
        const ids = new Set();
        agenda.eventos.forEach((evento, indice) => {
            if (typeof evento?.id === "string" && evento.id.trim()) {
                if (ids.has(evento.id)) errores.push(`ID duplicado: ${evento.id}.`);
                ids.add(evento.id);
            }
            errores.push(...validarEvento(evento, indice));
        });
        return errores;
    }

    function normalizarAhora(ahora) {
        const fecha = ahora instanceof Date ? ahora : new Date(ahora);
        return Number.isFinite(fecha.getTime()) ? fecha.getTime() : Date.now();
    }

    function obtenerEventosPublicos(eventos, ahora = new Date()) {
        if (!Array.isArray(eventos)) return [];
        const limite = normalizarAhora(ahora);
        return eventos.filter(evento => {
            if (!esObjeto(evento) || evento.estadoEditorial !== "confirmado" || !urlValida(evento.fuenteUrl)) return false;
            const inicio = instante(evento.inicio);
            const fin = evento.fin === null ? inicio : instante(evento.fin);
            return Number.isFinite(inicio) && Number.isFinite(fin) && fin >= limite;
        });
    }

    function filtrarPorFecha(eventos, desde = null, hasta = null) {
        if (!Array.isArray(eventos)) return [];
        const minimo = desde == null ? -Infinity : instante(desde);
        const maximo = hasta == null ? Infinity : instante(hasta);
        if (Number.isNaN(minimo) || Number.isNaN(maximo)) return [];
        return eventos.filter(evento => {
            const inicio = instante(evento?.inicio);
            const fin = evento?.fin === null ? inicio : instante(evento?.fin);
            if (!Number.isFinite(inicio) || !Number.isFinite(fin)) return false;
            return inicio <= maximo && fin >= minimo;
        });
    }

    function filtrarPorCategoria(eventos, categoria) {
        if (!Array.isArray(eventos) || typeof categoria !== "string") return [];
        return eventos.filter(evento => evento?.categoria === categoria);
    }

    function ordenarPorInicio(eventos) {
        if (!Array.isArray(eventos)) return [];
        return [...eventos].sort((a, b) => instante(a?.inicio) - instante(b?.inicio));
    }

    function resolverRutaAgenda(ruta = "eventos.json", base = null) {
        const baseUri = base || (typeof document !== "undefined" ? document.baseURI : null);
        if (!baseUri) return ruta;
        return new URL(ruta, baseUri).toString();
    }

    async function cargarAgenda({ ruta = "eventos.json", base = null, fetchImpl = null } = {}) {
        const fetchFuncion = fetchImpl || (typeof fetch === "function" ? fetch : null);
        if (!fetchFuncion) {
            return { ok: false, agenda: null, eventos: [], error: new AgendaEventosError("FETCH_NO_DISPONIBLE", "No hay una función fetch disponible.") };
        }
        const url = resolverRutaAgenda(ruta, base);
        try {
            const respuesta = await fetchFuncion(url, { headers: { Accept: "application/json" } });
            if (!respuesta || !respuesta.ok) {
                throw new AgendaEventosError("HTTP_AGENDA", `No se pudo cargar la agenda (HTTP ${respuesta?.status ?? "desconocido"}).`);
            }
            const agenda = await respuesta.json();
            const errores = validarAgenda(agenda);
            if (errores.length) {
                throw new AgendaEventosError("AGENDA_INVALIDA", `La agenda no es válida: ${errores.join(" ")}`);
            }
            return { ok: true, agenda, eventos: agenda.eventos, error: null };
        } catch (error) {
            const identificable = error instanceof AgendaEventosError
                ? error
                : new AgendaEventosError("AGENDA_NO_CARGADA", "No se pudo leer eventos.json.", error);
            return { ok: false, agenda: null, eventos: [], error: identificable };
        }
    }

    return Object.freeze({
        ZONA_HORARIA,
        AgendaEventosError,
        fechaValida,
        urlValida,
        validarAgenda,
        validarEvento,
        obtenerEventosPublicos,
        filtrarPorFecha,
        filtrarPorCategoria,
        ordenarPorInicio,
        resolverRutaAgenda,
        cargarAgenda
    });
}));
