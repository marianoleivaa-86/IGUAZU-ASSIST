/**
 * IGUAZÚ ASSIST — Tuki, asistente turístico local
 *
 * Interpreta consultas frecuentes sin servicios externos y reutiliza el catálogo,
 * los horarios, el clima, la ubicación y el Plan B del planificador.
 */

const TukiUIState = {
    abierto: false,
    ultimoFoco: null,
    esperandoUbicacion: false,
    burbujaTimer: null
};

const TUKI_CATEGORIAS_TURISTICAS = ["naturaleza", "actividades", "noche", "comida"];

function normalizarConsultaTuki(texto) {
    return String(texto || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9ñ\s]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function consultaTukiIncluye(texto, terminos) {
    return terminos.some(termino => texto.includes(termino));
}

function interpretarConsultaTuki(consulta) {
    const texto = normalizarConsultaTuki(consulta);
    const intencion = {
        texto,
        interes: null,
        compania: AppState.compania || "solo",
        presupuesto: AppState.presupuesto || "medio",
        tiempo: AppState.tiempo || "medio día",
        ahora: consultaTukiIncluye(texto, ["ahora", "abierto", "abiertos", "en este momento"]),
        manana: consultaTukiIncluye(texto, ["mañana", "manana"]),
        lluvia: consultaTukiIncluye(texto, ["llueve", "lluvia", "lloviendo", "mojar"]),
        cerca: consultaTukiIncluye(texto, ["cerca", "cercano", "cercanos", "a pie", "caminando"]),
        consultaHorario: consultaTukiIncluye(texto, ["horario", "abre", "cierra", "abierto", "abiertos"]),
        consultaPrecio: consultaTukiIncluye(texto, ["precio", "cuesta", "tarifa", "presupuesto", "economico", "barato"]),
        ambigua: false
    };

    if (consultaTukiIncluye(texto, ["comer", "comida", "restaurant", "restaurante", "almorzar", "cenar", "gastronomia"])) {
        intencion.interes = "comida";
    } else if (consultaTukiIncluye(texto, ["tomar algo", "tragos", "bar", "cerveza", "cerveceria", "noche", "nocturno"])) {
        intencion.interes = "noche";
    } else if (consultaTukiIncluye(texto, ["compras", "comprar", "feria", "artesanias", "regalos"])) {
        intencion.interes = "compras";
    } else if (consultaTukiIncluye(texto, ["animales", "aves", "fauna", "tucan", "pajaros"])) {
        intencion.interes = "fauna";
    } else if (consultaTukiIncluye(texto, ["tres paises", "3 paises", "frontera", "hito"])) {
        intencion.interes = "tres_paises";
    } else if (consultaTukiIncluye(texto, ["cataratas", "naturaleza", "selva", "sendero", "cascada"])) {
        intencion.interes = "naturaleza";
    } else if (consultaTukiIncluye(texto, ["pasear", "paseo", "caminar", "visitar"])) {
        intencion.interes = "paseos";
    } else if (consultaTukiIncluye(texto, ["hacer", "actividad", "actividades", "recomenda", "plan"])) {
        intencion.interes = "actividades";
    }

    if (consultaTukiIncluye(texto, ["pareja", "romantico", "romantica", "novio", "novia"])) {
        intencion.compania = "pareja";
    } else if (consultaTukiIncluye(texto, ["chicos", "niños", "ninos", "hijos", "nenes"])) {
        intencion.compania = "niños";
    } else if (consultaTukiIncluye(texto, ["familia", "familiar"])) {
        intencion.compania = "familia";
    } else if (consultaTukiIncluye(texto, ["amigos", "grupo"])) {
        intencion.compania = "amigos";
    } else if (consultaTukiIncluye(texto, ["solo", "sola"])) {
        intencion.compania = "solo";
    }

    if (consultaTukiIncluye(texto, ["poco presupuesto", "economico", "economica", "barato", "gratis", "gratuito"])) {
        intencion.presupuesto = "economico";
    } else if (consultaTukiIncluye(texto, ["sin limite", "alto presupuesto", "premium"])) {
        intencion.presupuesto = "alto";
    }

    if (consultaTukiIncluye(texto, ["dos horas", "2 horas", "2 hs", "una hora", "1 hora", "1 hs"])) {
        intencion.tiempo = "1-2 horas";
    } else if (consultaTukiIncluye(texto, ["unas horas", "3 horas", "3 hs"])) {
        intencion.tiempo = "unas horas";
    } else if (consultaTukiIncluye(texto, ["todo el dia", "día completo", "dia completo"])) {
        intencion.tiempo = "todo el día";
    }

    if (!intencion.interes && !intencion.ahora && !intencion.cerca && !intencion.consultaHorario) {
        intencion.ambigua = true;
        intencion.interes = "actividades";
    }

    return intencion;
}

function construirContextoTuki(intencion) {
    const contexto = contextoDeAhora();

    if (intencion.manana) {
        return {
            ...contexto,
            momento: "mañana",
            horaNumero: 9,
            horaTexto: "09:00",
            diaSemana: (contexto.diaSemana + 1) % 7,
            desplazamientoDia: 1
        };
    }

    if (intencion.interes === "noche" && contexto.horaNumero >= 6 && contexto.horaNumero < 18) {
        return {
            ...contexto,
            momento: "noche",
            horaNumero: 20,
            horaTexto: "20:00",
            desplazamientoDia: 0
        };
    }

    return { ...contexto, desplazamientoDia: 0 };
}

function buscarLugarMencionadoTuki(textoNormalizado) {
    return lugaresReales.find(lugar => {
        const nombre = normalizarConsultaTuki(lugar.nombre);
        if (nombre.length >= 5 && textoNormalizado.includes(nombre)) return true;
        const palabrasClave = nombre.split(" ").filter(palabra => palabra.length >= 6);
        return palabrasClave.length > 0 && palabrasClave.every(palabra => textoNormalizado.includes(palabra));
    }) || null;
}

function esActividadTuristicaTuki(lugar) {
    return esLugarValidoParaItinerario(lugar) && TUKI_CATEGORIAS_TURISTICAS.includes(lugar.categoria);
}

function ejecutarConClimaTuki(lluviaForzada, callback) {
    if (!lluviaForzada || climaActual.lluvia) return callback();

    const climaAnterior = { ...climaActual };
    climaActual = {
        ...climaActual,
        estado: "listo",
        descripcion: "Escenario con lluvia",
        lluvia: true,
        icono: "🌧️"
    };

    try {
        return callback();
    } finally {
        climaActual = climaAnterior;
    }
}

function obtenerRecomendacionesAmpliasTuki(intencion, contexto) {
    return lugaresReales
        .filter(esActividadTuristicaTuki)
        .filter(lugar => !intencion.lluvia || lugar.alAireLibre !== true)
        .filter(lugar => estaDisponibleDurantePlan(lugar, contexto))
        .filter(lugar => esCompatibleConPresupuesto(lugar, intencion.presupuesto))
        .filter(lugar => lugar.aptoPara && lugar.aptoPara.includes(intencion.compania))
        .map(lugar => ({
            lugar,
            puntaje: calcularPuntaje(lugar, contexto, intencion.compania, lugar.categoria)
        }))
        .sort((a, b) => b.puntaje - a.puntaje)
        .slice(0, 3)
        .map(item => item.lugar);
}

function obtenerRecomendacionesCercanasTuki(intencion, contexto) {
    const origen = AppState.userCoords || CONFIG_APP.coordenadasCentro;

    return lugaresReales
        .filter(esActividadTuristicaTuki)
        .filter(lugar => lugar.coordenadas && typeof lugar.coordenadas.lat === "number")
        .filter(lugar => !intencion.lluvia || lugar.alAireLibre !== true)
        .filter(lugar => estaDisponibleDurantePlan(lugar, contexto))
        .filter(lugar => esCompatibleConPresupuesto(lugar, intencion.presupuesto))
        .filter(lugar => lugar.aptoPara && lugar.aptoPara.includes(intencion.compania))
        .map(lugar => ({
            lugar,
            distancia: calcularDistanciaKm(origen.lat, origen.lng, lugar.coordenadas.lat, lugar.coordenadas.lng)
        }))
        .filter(item => item.distancia <= 10)
        .sort((a, b) => a.distancia - b.distancia)
        .slice(0, 3)
        .map(item => ({ ...item.lugar, distanciaTuki: item.distancia }));
}

function resolverConsultaTuki(consulta) {
    const intencion = interpretarConsultaTuki(consulta);
    const contexto = construirContextoTuki(intencion);
    const lugarMencionado = buscarLugarMencionadoTuki(intencion.texto);

    if (lugarMencionado) {
        const disponibilidad = obtenerEstadoDisponibilidad(lugarMencionado, contexto.horaNumero, contexto.diaSemana);
        const horario = lugarMencionado.horario || "No tengo un horario confirmado";
        const precio = lugarMencionado.precio || "No tengo un precio confirmado";
        const datoPrincipal = intencion.consultaPrecio
            ? `El precio informado es: ${precio}.`
            : intencion.consultaHorario
                ? `El horario informado es: ${horario}. ${disponibilidad.texto}.`
                : `${lugarMencionado.descripcion}`;

        return {
            texto: `Según mi catálogo, ${lugarMencionado.nombre}: ${datoPrincipal}`,
            lugares: [lugarMencionado],
            contexto,
            intencion,
            fuenteUbicacion: null,
            exacta: true
        };
    }

    if (intencion.cerca) {
        const lugares = obtenerRecomendacionesCercanasTuki(intencion, contexto);
        if (lugares.length > 0) {
            const referencia = AppState.gpsActive ? "tu ubicación GPS" : "la Plaza San Martín";
            return {
                texto: `Tomé ${referencia} como referencia. Estas son las mejores opciones cercanas y disponibles que tengo confirmadas:`,
                lugares,
                contexto,
                intencion,
                fuenteUbicacion: referencia,
                exacta: true
            };
        }
    }

    if (!intencion.interes && (intencion.ahora || intencion.consultaHorario)) {
        const lugares = obtenerRecomendacionesAmpliasTuki(intencion, contexto);
        if (lugares.length > 0) {
            return {
                texto: intencion.lluvia
                    ? "Para este momento y con lluvia, prioricé lugares cubiertos que figuran disponibles en el catálogo."
                    : "Estas opciones figuran disponibles para este momento en mi catálogo:",
                lugares,
                contexto,
                intencion,
                fuenteUbicacion: null,
                exacta: true
            };
        }
    }

    const interes = intencion.interes || "actividades";
    const resultado = ejecutarConClimaTuki(intencion.lluvia, () => construirPlanConFallback({
        interes,
        tiempo: intencion.tiempo,
        compania: intencion.compania,
        presupuesto: intencion.presupuesto,
        limiteHoras: horasDisponibles(intencion.tiempo),
        ahora: contexto
    }));

    if (!Array.isArray(resultado?.lugares) || resultado.lugares.length === 0) {
        return {
            texto: "No encontré una actividad turística planificable y disponible para esas condiciones. Probá con otro horario o una duración diferente.",
            lugares: [],
            contexto: resultado?.contextoPlan || contexto,
            intencion,
            fuenteUbicacion: null,
            exacta: false
        };
    }

    let textoRespuesta = "Encontré estas propuestas en el catálogo de Iguazú.";
    if (intencion.lluvia) {
        textoRespuesta = "Si llueve, conviene priorizar opciones cubiertas. Estas son las alternativas válidas que encontré:";
    } else if (intencion.manana) {
        textoRespuesta = `Para mañana desde las ${resultado.contextoPlan.horaTexto} hs, te recomiendo estas opciones:`;
    } else if (interes === "comida") {
        textoRespuesta = `Para comer, encontré estas opciones compatibles desde las ${resultado.contextoPlan.horaTexto} hs:`;
    } else if (interes === "noche") {
        textoRespuesta = `Para disfrutar la noche, estas propuestas figuran compatibles desde las ${resultado.contextoPlan.horaTexto} hs:`;
    } else if (intencion.ambigua) {
        textoRespuesta = "No pude identificar una condición exacta en tu pregunta. Igual, te propongo estas experiencias válidas para empezar:";
    }

    if (resultado.adaptacion.activa && resultado.adaptacion.mensaje) {
        textoRespuesta += ` ${resultado.adaptacion.mensaje}`;
    }

    return {
        texto: textoRespuesta,
        lugares: resultado.lugares.slice(0, 3),
        contexto: resultado.contextoPlan,
        intencion,
        fuenteUbicacion: null,
        exacta: !resultado.adaptacion.activa && !intencion.ambigua
    };
}

function crearTarjetasTuki(lugares, contexto) {
    if (!Array.isArray(lugares) || lugares.length === 0) return "";

    return `
        <div class="tuki-recommendations">
            ${lugares.map(lugar => {
                const distancia = Number.isFinite(lugar.distanciaTuki)
                    ? `${formatearDistancia(lugar.distanciaTuki)} · `
                    : "";
                const horario = lugar.horario || "Horario no confirmado";
                const gasto = lugar.gratuito
                    ? "Gratuito"
                    : lugar.nivelGasto === "economico" ? "Económico" : lugar.nivelGasto === "alto" ? "Gasto alto" : "Gasto medio";

                return `
                    <button class="tuki-place-card" type="button" data-tuki-place="${escaparAttr(lugar.nombre)}">
                        <span class="tuki-place-icon" aria-hidden="true">${lugar.icono}</span>
                        <span class="tuki-place-info">
                            <strong>${escapar(lugar.nombre)}</strong>
                            <span>${escapar(`${distancia}${gasto} · ${horario}`)}</span>
                        </span>
                        <span class="tuki-place-arrow" aria-hidden="true">›</span>
                    </button>
                `;
            }).join("")}
        </div>
    `;
}

function agregarMensajeUsuarioTuki(texto) {
    const conversacion = document.querySelector("#tuki-conversation");
    if (!conversacion) return;

    const mensaje = document.createElement("article");
    mensaje.className = "tuki-message tuki-message-user";
    mensaje.innerHTML = `<div class="tuki-message-body"><p>${escapar(texto)}</p></div>`;
    conversacion.appendChild(mensaje);
    conversacion.scrollTop = conversacion.scrollHeight;
}

function agregarRespuestaTuki(respuesta) {
    const conversacion = document.querySelector("#tuki-conversation");
    if (!conversacion) return;

    const mensaje = document.createElement("article");
    mensaje.className = "tuki-message tuki-message-assistant";
    mensaje.innerHTML = `
        <div class="tuki-message-avatar" aria-hidden="true">🦜</div>
        <div class="tuki-message-body">
            <p>${escapar(respuesta.texto || "No encontré una respuesta exacta, pero puedo ayudarte con actividades, comida, clima y lugares cercanos.")}</p>
            ${crearTarjetasTuki(respuesta.lugares || [], respuesta.contexto)}
        </div>
    `;
    conversacion.appendChild(mensaje);
    conversacion.scrollTop = conversacion.scrollHeight;
}

function actualizarContextoVisualTuki() {
    const contexto = contextoDeAhora();
    const tiempo = document.querySelector("#tuki-context-time");
    const clima = document.querySelector("#tuki-context-weather");
    const hora = Math.floor(contexto.horaNumero);
    const minutos = Math.round((contexto.horaNumero % 1) * 60);
    const hora24 = `${String(hora).padStart(2, "0")}:${String(minutos).padStart(2, "0")}`;
    if (tiempo) tiempo.innerText = `${hora24} hs · ${contexto.momento}`;
    if (clima) clima.innerText = climaActual.estado === "cargando" ? "Clima consultando" : climaActual.descripcion;
}

function actualizarControlSonidoTuki() {
    if (typeof actualizarControlesAudio === "function") {
        actualizarControlesAudio();
        return;
    }
    const boton = document.querySelector("#tuki-sound-toggle");
    const volumen = document.querySelector("#tuki-volume");
    if (boton) {
        boton.innerText = AppState.audioActivo ? "Sonido activo" : "Activar sonido";
        boton.classList.toggle("active", AppState.audioActivo);
        boton.setAttribute("aria-pressed", String(AppState.audioActivo));
    }
    if (volumen) volumen.value = String(AppState.volumenAmbiente);
}

function abrirTuki() {
    const panel = document.querySelector("#tuki-panel");
    const backdrop = document.querySelector("#tuki-backdrop");
    const fab = document.querySelector("#tuki-fab");
    const input = document.querySelector("#tuki-input");
    if (!fab || !panel || !backdrop) return;
    const anterior = document.querySelector("#tuki-fab-bubble");
    if (anterior) anterior.remove();
    if (TukiUIState.burbujaTimer) clearTimeout(TukiUIState.burbujaTimer);
    TukiUIState.ultimoFoco = document.activeElement;
    TukiUIState.abierto = true;
    panel.classList.add("open");
    panel.setAttribute("aria-hidden", "false");
    backdrop.classList.remove("hidden");
    backdrop.setAttribute("aria-hidden", "false");
    fab.setAttribute("aria-expanded", "true");
    document.body.classList.add("tuki-open");
    actualizarContextoVisualTuki();
    actualizarControlSonidoTuki();
    window.setTimeout(() => input?.focus(), 180);
}

function cerrarTuki() {
    const panel = document.querySelector("#tuki-panel");
    const backdrop = document.querySelector("#tuki-backdrop");
    const fab = document.querySelector("#tuki-fab");
    if (!panel || !backdrop || !fab) return;

    TukiUIState.abierto = false;
    panel.classList.remove("open");
    panel.setAttribute("aria-hidden", "true");
    backdrop.classList.add("hidden");
    backdrop.setAttribute("aria-hidden", "true");
    fab.setAttribute("aria-expanded", "false");
    document.body.classList.remove("tuki-open");
    if (TukiUIState.ultimoFoco && typeof TukiUIState.ultimoFoco.focus === "function") {
        TukiUIState.ultimoFoco.focus();
    }
}

function responderConsultaTuki(consulta) {
    let respuesta;
    try {
        respuesta = resolverConsultaTuki(consulta);
    } catch (error) {
        console.error("Tuki no pudo resolver la consulta.", error);
        respuesta = {
            texto: "No pude completar la recomendación en este momento. Probá nuevamente o elegí otro horario.",
            lugares: [],
            contexto: null,
            intencion: null,
            fuenteUbicacion: null,
            exacta: false
        };
    }
    agregarRespuestaTuki(respuesta);
    return respuesta;
}

function enviarConsultaTuki(consulta) {
    const texto = String(consulta || "").trim();
    if (!texto || TukiUIState.esperandoUbicacion) return null;

    agregarMensajeUsuarioTuki(texto);
    const intencion = interpretarConsultaTuki(texto);

    if (intencion.cerca && !AppState.userCoords && !TukiUIState.esperandoUbicacion) {
        TukiUIState.esperandoUbicacion = true;
        agregarRespuestaTuki({
            texto: "Estoy buscando tu ubicación. Si el GPS no está disponible, usaré la Plaza San Martín como referencia segura.",
            lugares: []
        });
        obtenerUbicacionUsuario(() => {
            TukiUIState.esperandoUbicacion = false;
            responderConsultaTuki(texto);
        });
        return null;
    }

    return responderConsultaTuki(texto);
}

function initTukiAsistente() {
    const fab = document.querySelector("#tuki-fab");
    const close = document.querySelector("#tuki-close");
    const backdrop = document.querySelector("#tuki-backdrop");
    const form = document.querySelector("#tuki-form");
    const input = document.querySelector("#tuki-input");
    const conversacion = document.querySelector("#tuki-conversation");
    const soundToggle = document.querySelector("#tuki-sound-toggle");
    const volumen = document.querySelector("#tuki-volume");

    if (!fab || !close || !backdrop || !form || !input || !conversacion) return;

    fab.addEventListener("click", abrirTuki);
    close.addEventListener("click", cerrarTuki);
    backdrop.addEventListener("click", cerrarTuki);

    document.querySelectorAll("[data-tuki-question]").forEach(boton => {
        boton.addEventListener("click", () => enviarConsultaTuki(boton.dataset.tukiQuestion));
    });

    form.addEventListener("submit", evento => {
        evento.preventDefault();
        const consulta = input.value.trim();
        if (!consulta) return;
        input.value = "";
        input.style.height = "auto";
        enviarConsultaTuki(consulta);
    });

    input.addEventListener("keydown", evento => {
        if (evento.key === "Enter" && !evento.shiftKey) {
            evento.preventDefault();
            form.requestSubmit();
        }
    });

    input.addEventListener("input", () => {
        input.style.height = "auto";
        input.style.height = `${Math.min(input.scrollHeight, 110)}px`;
    });

    conversacion.addEventListener("click", evento => {
        const tarjeta = evento.target.closest("[data-tuki-place]");
        if (!tarjeta) return;
        const nombre = tarjeta.dataset.tukiPlace;
        cerrarTuki();
        mostrarDetalle(nombre);
    });

    document.addEventListener("keydown", evento => {
        if (evento.key === "Escape" && TukiUIState.abierto) cerrarTuki();
    });

    if (soundToggle) {
        soundToggle.addEventListener("click", () => {
            const controlPrincipal = document.querySelector("#audio-toggle");
            if (controlPrincipal) controlPrincipal.click();
            actualizarControlSonidoTuki();
        });
    }

    if (volumen) {
        volumen.addEventListener("input", () => SoundFX.setAmbientVolume(volumen.value));
    }

    actualizarControlSonidoTuki();
}

document.addEventListener("DOMContentLoaded", initTukiAsistente);

window.TukiAsistente = {
    abrir: abrirTuki,
    cerrar: cerrarTuki,
    enviar: enviarConsultaTuki,
    interpretar: interpretarConsultaTuki,
    resolver: resolverConsultaTuki
};
