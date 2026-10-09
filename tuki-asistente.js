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
let tukiAgendaPromise = null;
let tukiAgendaEventos = [];
let tukiAgendaError = null;

function tukiText(key, fallback) {
    return window.I18n?.t(key, fallback) || fallback;
}

function tukiPlaceText(lugar, campo, fallback = "") {
    return window.I18n?.placeText(lugar, campo) || lugar?.[campo] || fallback;
}

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

function detectarCategoriaAgendaTuki(texto) {
    const categorias = [
        ["recital", ["recital", "musica en vivo", "musica", "banda", "concierto"]],
        ["feria", ["feria", "emprendedor", "emprendedores", "artesanos"]],
        ["cultural", ["cultural", "cultura", "teatro", "danza"]],
        ["deportivo", ["deportivo", "deporte", "carrera", "torneo"]],
        ["exposicion", ["exposicion", "muestra", "galeria"]],
        ["fiesta_popular", ["fiesta popular", "fiesta", "celebracion"]],
        ["encuentro_autos", ["encuentro de autos", "encuentro autos", "autos"]],
        ["encuentro_motos", ["encuentro de motos", "encuentro motos", "motos"]],
        ["festival", ["festival", "carnaval"]]
    ];
    return categorias.find(([, terminos]) => consultaTukiIncluye(texto, terminos))?.[0] || null;
}

function interpretarConsultaAgendaTuki(textoNormalizado) {
    const texto = normalizarConsultaTuki(textoNormalizado);
    const categoria = detectarCategoriaAgendaTuki(texto);
    const periodo = consultaTukiIncluye(texto, ["manana", "mañana"])
        ? "manana"
        : consultaTukiIncluye(texto, ["fin de semana", "fin de semana largo"])
            ? "fin_de_semana"
            : consultaTukiIncluye(texto, ["esta noche", "hoy a la noche", "esta noche"])
                ? "noche"
                : consultaTukiIncluye(texto, ["hoy", "ahora"])
                    ? "hoy"
                    : consultaTukiIncluye(texto, ["proximamente", "próximamente", "proximo", "próximo"])
                        ? "proximos"
                        : null;
    const marcadorAgenda = consultaTukiIncluye(texto, [
        "evento", "eventos", "agenda", "cartelera", "programacion", "programación",
        "recital", "musica en vivo", "feria", "emprendedor", "cultural", "deportivo",
        "exposicion", "fiesta", "festival", "autos", "motos"
    ]);
    const preguntaPeriodo = consultaTukiIncluye(texto, ["que hay", "qué hay", "que se hace", "qué se hace"]);
    const consultaAgenda = Boolean(marcadorAgenda || (periodo && preguntaPeriodo) || (periodo === "noche" && consultaTukiIncluye(texto, ["actividad", "actividades"])));
    return {
        esAgenda: consultaAgenda,
        periodo: periodo || "proximos",
        categoria,
        parque: consultaTukiIncluye(texto, ["parque nacional", "parque iguazu", "parque iguazú"])
    };
}

function interpretarConsultaTuki(consulta) {
    const texto = normalizarConsultaTuki(consulta);
    const agenda = interpretarConsultaAgendaTuki(texto);
    const intencion = {
        texto,
        esAgenda: agenda.esAgenda,
        agendaPeriodo: agenda.periodo,
        agendaCategoria: agenda.categoria,
        agendaParque: agenda.parque,
        interes: null,
        compania: AppState.compania || "solo",
        presupuesto: AppState.presupuesto || "medio",
        tiempo: AppState.tiempo || "medio día",
        ahora: consultaTukiIncluye(texto, ["ahora", "abierto", "abiertos", "en este momento"]),
        manana: consultaTukiIncluye(texto, ["mañana", "manana"]),
        lluvia: consultaTukiIncluye(texto, ["llueve", "lluvia", "lloviendo", "mojar"]),
        cerca: consultaTukiIncluye(texto, ["cerca", "cercano", "cercanos", "a pie", "caminando"]),
        consultaHorario: consultaTukiIncluye(texto, ["horario", "abre", "cierra", "abierto", "abiertos"]),
        consultaPrecio: consultaTukiIncluye(texto, ["precio", "cuesta", "cuanto", "sale", "tarifa", "presupuesto", "economico", "barato"]),
        ambigua: false
    };

    if (consultaTukiIncluye(texto, ["comer", "como", "comida", "restaurant", "restaurante", "almorzar", "cenar", "gastronomia"])) {
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
    const contexto = window.contextoDeAhora();

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

function respuestaConversacionalTuki(textoNormalizado) {
    const texto = String(textoNormalizado || "").trim();
    const respuesta = (mensaje, lugares = []) => ({
        texto: mensaje,
        lugares,
        contexto: null,
        intencion: null,
        fuenteUbicacion: null,
        exacta: true,
        conversacional: true
    });

    if (/^(hola( tuki)?|buen dia|buenas( tardes| noches)?|hey|que tal)$/.test(texto)) {
        return respuesta(tukiText("tukiHello", "¡Hola! 👋 Soy Tuki, tu asistente para descubrir Puerto Iguazú. ¿Querés que te recomiende qué hacer, dónde comer o qué visitar?"));
    }

    if (/^(gracias|muchas gracias|genial|perfecto|excelente)$/.test(texto)) {
        return respuesta(tukiText("tukiThanks", "¡De nada! Cuando quieras, puedo ayudarte a descubrir otro lugar o armar un plan en Iguazú."));
    }

    if (/^(quien sos|que sos|que haces|para que servis|sos un chatbot)$/.test(texto)) {
        return respuesta(tukiText("tukiWho", "Soy Tuki, el asistente turístico de Iguazú Assist. Puedo ayudarte a encontrar lugares, actividades, comida, información del clima y armar planes para Puerto Iguazú."));
    }

    if (/^(ayuda|que puedo preguntar|que podes hacer|como te uso)$/.test(texto)) {
        return respuesta(tukiText("tukiHelp", "Podés preguntarme qué hacer, dónde comer, qué visitar, qué hay cerca, qué opciones hay con lluvia o pedirme una recomendación para algunas horas."));
    }

    return null;
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
    return window.PlanificadorAPI.esLugarValidoParaItinerario(lugar) && TUKI_CATEGORIAS_TURISTICAS.includes(lugar.categoria);
}

function precioTukiEstaConfirmado(lugar) {
    return lugar?.precio?.estado === "confirmado" && (
        Number.isFinite(Number(lugar.precio.monto)) ||
        (lugar.precio.tarifas && typeof lugar.precio.tarifas === "object")
    );
}

function construirAvisoPrecioNoConfirmadoTuki(lugar) {
    return `No tengo un precio actualizado confirmado para ${tukiPlaceText(lugar, "nombre", lugar.nombre)}. Te recomiendo verificar la tarifa y las condiciones en la fuente oficial antes de ir.`;
}

function obtenerOpcionesComidaTuki(intencion, contexto, soloEconomicas = false, filtrarDisponibilidad = true) {
    return lugaresReales
        .filter(esActividadTuristicaTuki)
        .filter(lugar => lugar.categoria === "comida")
        .filter(lugar => !soloEconomicas || lugar.nivelGasto === "economico" || lugar.gratuito === true)
        .filter(lugar => !filtrarDisponibilidad || window.estaDisponibleDurantePlan(lugar, contexto))
        .filter(lugar => lugar.aptoPara && lugar.aptoPara.includes(intencion.compania))
        .map(lugar => ({ lugar, distancia: calcularDistanciaKm((AppState.userCoords || CONFIG_APP.coordenadasCentro).lat, (AppState.userCoords || CONFIG_APP.coordenadasCentro).lng, lugar.coordenadas.lat, lugar.coordenadas.lng) }))
        .sort((a, b) => a.distancia - b.distancia)
        .slice(0, 3)
        .map(item => ({ ...item.lugar, distanciaTuki: item.distancia }));
}

function ejecutarConClimaTuki(lluviaForzada, callback) {
    const planificador = window.PlanificadorAPI;
    if (!planificador || !lluviaForzada || planificador.climaActual.lluvia) return callback();

    const climaAnterior = { ...planificador.climaActual };
    planificador.climaActual = {
        ...planificador.climaActual,
        estado: "listo",
        descripcion: "Escenario con lluvia",
        lluvia: true,
        icono: "🌧️"
    };

    try {
        return callback();
    } finally {
        planificador.climaActual = climaAnterior;
    }
}

function obtenerRecomendacionesAmpliasTuki(intencion, contexto) {
    return lugaresReales
        .filter(esActividadTuristicaTuki)
        .filter(lugar => !intencion.lluvia || lugar.alAireLibre !== true)
        .filter(lugar => window.estaDisponibleDurantePlan(lugar, contexto))
        .filter(lugar => window.PlanificadorAPI.esCompatibleConPresupuesto(lugar, intencion.presupuesto))
        .filter(lugar => lugar.aptoPara && lugar.aptoPara.includes(intencion.compania))
        .map(lugar => ({
            lugar,
            puntaje: window.calcularPuntaje(lugar, contexto, intencion.compania, lugar.categoria)
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
        .filter(lugar => window.estaDisponibleDurantePlan(lugar, contexto))
        .filter(lugar => window.PlanificadorAPI.esCompatibleConPresupuesto(lugar, intencion.presupuesto))
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

const TUKI_ZONA_AGENDA = "America/Argentina/Buenos_Aires";

function partesFechaAgendaTuki(fecha) {
    const partes = new Intl.DateTimeFormat("en-CA", {
        timeZone: TUKI_ZONA_AGENDA,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hourCycle: "h23"
    }).formatToParts(new Date(fecha));
    return Object.fromEntries(partes.map(parte => [parte.type, Number(parte.value)]));
}

function medianocheAgendaTuki(anio, mes, dia) {
    let instante = Date.UTC(anio, mes - 1, dia);
    for (let intento = 0; intento < 3; intento += 1) {
        const partes = partesFechaAgendaTuki(instante);
        const representado = Date.UTC(partes.year, partes.month - 1, partes.day, partes.hour, partes.minute, partes.second);
        const deseado = Date.UTC(anio, mes - 1, dia);
        instante += deseado - representado;
    }
    return instante;
}

function intervaloAgendaTuki(periodo, ahora = new Date()) {
    const partes = partesFechaAgendaTuki(ahora);
    const inicioHoy = medianocheAgendaTuki(partes.year, partes.month, partes.day);
    const diaActual = new Date(Date.UTC(partes.year, partes.month - 1, partes.day)).getUTCDay();
    const siguienteDia = (dias) => {
        const fecha = new Date(Date.UTC(partes.year, partes.month - 1, partes.day + dias));
        return medianocheAgendaTuki(fecha.getUTCFullYear(), fecha.getUTCMonth() + 1, fecha.getUTCDate());
    };

    if (periodo === "hoy") return { desde: inicioHoy, hasta: siguienteDia(1), etiqueta: "hoy" };
    if (periodo === "manana") return { desde: siguienteDia(1), hasta: siguienteDia(2), etiqueta: "mañana" };
    if (periodo === "noche") return { desde: inicioHoy + 18 * 60 * 60 * 1000, hasta: siguienteDia(1) + 5 * 60 * 60 * 1000, etiqueta: "esta noche" };
    if (periodo === "fin_de_semana") {
        const diasHastaSabado = diaActual === 0 ? -1 : diaActual === 6 ? 0 : 6 - diaActual;
        const inicio = siguienteDia(diasHastaSabado);
        return { desde: inicio, hasta: siguienteDia(diasHastaSabado + 2), etiqueta: "este fin de semana" };
    }
    return { desde: new Date(ahora).getTime(), hasta: new Date(ahora).getTime() + 14 * 24 * 60 * 60 * 1000, etiqueta: "próximamente" };
}

async function cargarAgendaParaTuki() {
    if (tukiAgendaPromise) return tukiAgendaPromise;
    if (!window.AgendaEventos?.cargarAgenda) {
        tukiAgendaError = { codigo: "MOTOR_NO_DISPONIBLE" };
        return { ok: false, eventos: [], error: tukiAgendaError };
    }
    tukiAgendaPromise = window.AgendaEventos.cargarAgenda({ base: document.baseURI })
        .then(resultado => {
            if (!resultado.ok) {
                tukiAgendaError = resultado.error || { codigo: "AGENDA_NO_CARGADA" };
                tukiAgendaEventos = [];
                return resultado;
            }
            tukiAgendaError = null;
            tukiAgendaEventos = Array.isArray(resultado.eventos) ? resultado.eventos : [];
            return resultado;
        })
        .catch(error => {
            tukiAgendaError = error;
            tukiAgendaEventos = [];
            return { ok: false, eventos: [], error };
        });
    return tukiAgendaPromise;
}

function eventoCoincideParqueTuki(evento) {
    const lugar = evento?.lugar && typeof evento.lugar === "object" ? evento.lugar : {};
    const texto = normalizarConsultaTuki([
        evento?.titulo,
        evento?.descripcion,
        lugar.nombre,
        lugar.direccion
    ].filter(Boolean).join(" "));
    return texto.includes("parque nacional") || texto.includes("parque iguazu");
}

function consultarAgendaTuki(intencion, ahora = new Date()) {
    if (tukiAgendaError) {
        const sinConexion = typeof navigator !== "undefined" && navigator.onLine === false;
        return {
            texto: sinConexion
                ? "No pude consultar la agenda sin conexión. Cuando recuperes señal, podés abrir Agenda y volver a intentarlo."
                : "No pude consultar la agenda local en este momento. El resto de mis recomendaciones turísticas sigue disponible.",
            eventos: [], contexto: null, intencion, exacta: false, error: tukiAgendaError
        };
    }
    const publicos = window.AgendaEventos.obtenerEventosPublicos(tukiAgendaEventos, ahora);
    const intervalo = intervaloAgendaTuki(intencion.agendaPeriodo, ahora);
    let eventos = intencion.agendaPeriodo === "proximos"
        ? publicos
        : window.AgendaEventos.filtrarPorFecha(publicos, new Date(intervalo.desde).toISOString(), new Date(intervalo.hasta).toISOString());
    if (intencion.agendaCategoria) eventos = window.AgendaEventos.filtrarPorCategoria(eventos, intencion.agendaCategoria);
    if (intencion.agendaParque) eventos = eventos.filter(eventoCoincideParqueTuki);
    eventos = window.AgendaEventos.ordenarPorInicio(eventos).slice(0, 5);
    if (!eventos.length) {
        return {
            texto: `No tengo eventos confirmados cargados en la Agenda para ${intervalo.etiqueta}. Eso se refiere a la agenda de la aplicación, no a que no haya actividades en toda la ciudad. También podés explorar los atractivos turísticos permanentes.`,
            eventos: [], contexto: null, intencion, exacta: false
        };
    }
    return {
        texto: `Encontré ${eventos.length === 1 ? "un evento confirmado" : `${eventos.length} eventos confirmados`} para ${intervalo.etiqueta}. Te dejo los datos y la fuente original:`,
        eventos, contexto: null, intencion, exacta: true
    };
}

function resolverConsultaTuki(consulta, opciones = {}) {
    const intencion = interpretarConsultaTuki(consulta);
    const conversacional = respuestaConversacionalTuki(intencion.texto);
    if (conversacional) return conversacional;

    if (intencion.esAgenda) return consultarAgendaTuki(intencion, opciones.ahora || new Date());

    const contexto = construirContextoTuki(intencion);
    const consultaEntradaCataratas = intencion.consultaPrecio &&
        consultaTukiIncluye(intencion.texto, ["cataratas"]) &&
        consultaTukiIncluye(intencion.texto, ["entrar", "entrada", "ingreso"]);
    const lugarMencionado = consultaEntradaCataratas
        ? lugaresReales.find(lugar => lugar.nombre === "Parque Nacional Iguazú")
        : buscarLugarMencionadoTuki(intencion.texto) || (
            intencion.consultaPrecio && consultaTukiIncluye(intencion.texto, ["cataratas", "tren ecologico", "tren ecológico"])
                ? lugaresReales.find(lugar => lugar.nombre === "Parque Nacional Iguazú")
                : null
        );

    if (lugarMencionado) {
        const disponibilidad = obtenerEstadoDisponibilidad(lugarMencionado, contexto.horaNumero, contexto.diaSemana);
        const horario = lugarMencionado.horario || "No tengo un horario confirmado";
        const precio = lugarMencionado.precio?.texto || lugarMencionado.precioTexto || "No tengo un precio confirmado";
        if (intencion.consultaPrecio && !precioTukiEstaConfirmado(lugarMencionado)) {
            return {
                texto: construirAvisoPrecioNoConfirmadoTuki(lugarMencionado),
                lugares: [lugarMencionado],
                contexto,
                intencion,
                fuenteUbicacion: null,
                exacta: false
            };
        }
        const datoPrincipal = intencion.consultaPrecio
            ? `El precio informado es: ${precio}. Fuente oficial: ${lugarMencionado.precio.fuente || "consultar sitio oficial"}.`
            : intencion.consultaHorario
                ? `El horario informado es: ${horario}. ${disponibilidad.texto}.`
                : `${tukiPlaceText(lugarMencionado, "descripcion", lugarMencionado.descripcion)}`;

        return {
            texto: `Según mi catálogo, ${tukiPlaceText(lugarMencionado, "nombre", lugarMencionado.nombre)}: ${datoPrincipal}`,
            lugares: [lugarMencionado],
            contexto,
            intencion,
            fuenteUbicacion: null,
            exacta: true
        };
    }

    if (intencion.interes === "comida") {
        const comida = obtenerOpcionesComidaTuki(intencion, contexto, intencion.presupuesto === "economico");
        if (comida.length > 0) {
            return {
                texto: intencion.presupuesto === "economico"
                    ? "Encontré estas opciones gastronómicas económicas o accesibles confirmadas en el catálogo:"
                    : "Encontré estas opciones gastronómicas compatibles en el catálogo:",
                lugares: comida,
                contexto,
                intencion,
                fuenteUbicacion: null,
                exacta: true
            };
        }

        const alternativasComida = obtenerOpcionesComidaTuki(intencion, contexto, false, false);
        const aviso = intencion.presupuesto === "economico"
            ? "No encontré restaurantes con precio económico confirmado cerca. El catálogo solo tiene opciones gastronómicas de precio medio o superior; te las muestro como alternativa, no como opciones económicas."
            : "No encontré una opción gastronómica compatible y disponible en este momento.";
        return {
            texto: aviso,
            lugares: alternativasComida,
            contexto,
            intencion,
            fuenteUbicacion: null,
            exacta: false
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
    const resultado = ejecutarConClimaTuki(intencion.lluvia, () => window.PlanificadorAPI.construirPlanConFallback({
        interes,
        tiempo: intencion.tiempo,
        compania: intencion.compania,
        presupuesto: intencion.presupuesto,
        limiteHoras: window.PlanificadorAPI.horasDisponibles(intencion.tiempo),
        ahora: contexto
    }));

    if (!Array.isArray(resultado?.lugares) || resultado.lugares.length === 0) {
        // Último respaldo: usar únicamente experiencias reales y planificables del
        // catálogo, aunque no cumplan todos los filtros de horario/clima. Así Tuki
        // siempre entrega una salida útil sin inventar recomendaciones.
        const respaldoCatalogo = lugaresReales
            .filter(esActividadTuristicaTuki)
            .sort((a, b) => Number(b.prioridad || 0) - Number(a.prioridad || 0))
            .slice(0, 1);

        if (respaldoCatalogo.length > 0) {
            return {
                texto: "No encontré una coincidencia exacta para todos tus criterios. Te dejo una experiencia real del catálogo para que puedas revisar sus horarios y condiciones:",
                lugares: respaldoCatalogo,
                contexto: resultado?.contextoPlan || contexto,
                intencion,
                fuenteUbicacion: null,
                exacta: false
            };
        }

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
                const nombre = tukiPlaceText(lugar, "nombre", "Lugar sin nombre");
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
                            <strong>${escapar(nombre)}</strong>
                            <span>${escapar(`${distancia}${gasto} · ${horario}`)}</span>
                        </span>
                        <span class="tuki-place-arrow" aria-hidden="true">›</span>
                    </button>
                `;
            }).join("")}
        </div>
    `;
}

function crearTarjetasAgendaTuki(eventos) {
    if (!Array.isArray(eventos) || eventos.length === 0) return "";
    return `
        <div class="tuki-recommendations">
            ${eventos.map(evento => {
                const lugar = evento.lugar && typeof evento.lugar === "object" ? evento.lugar : null;
                const lugarTexto = [lugar?.nombre, lugar?.direccion].filter(Boolean).join(" · ");
                const precio = evento.precio?.estado === "gratuito"
                    ? "Gratis confirmado"
                    : evento.precio?.estado === "confirmado" && Number.isFinite(evento.precio.monto)
                        ? `${evento.precio.moneda || ""} ${evento.precio.monto}`.trim()
                        : null;
                const fecha = new Intl.DateTimeFormat("es-AR", {
                    timeZone: evento.zonaHoraria || TUKI_ZONA_AGENDA,
                    dateStyle: "medium",
                    timeStyle: "short"
                }).format(new Date(evento.inicio));
                return `
                    <article class="tuki-place-card tuki-agenda-card">
                        <span class="tuki-place-icon" aria-hidden="true">📆</span>
                        <span class="tuki-place-info">
                            <strong>${escapar(evento.titulo)}</strong>
                            <span>🗓️ ${escapar(fecha)}${evento.fin ? `–${escapar(new Intl.DateTimeFormat("es-AR", { timeZone: evento.zonaHoraria || TUKI_ZONA_AGENDA, timeStyle: "short" }).format(new Date(evento.fin)))} hs` : ""}</span>
                            ${lugarTexto ? `<span>📍 ${escapar(lugarTexto)}</span>` : ""}
                            ${precio ? `<span>🎟️ ${escapar(precio)}</span>` : ""}
                        </span>
                        <a class="tuki-place-arrow" href="${escapar(evento.fuenteUrl)}" target="_blank" rel="noopener noreferrer" aria-label="Ver fuente oficial">↗</a>
                    </article>
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
            <p>${escapar(respuesta.texto || tukiText("tukiNoExact", "No encontré una respuesta exacta, pero puedo ayudarte con actividades, comida, clima y lugares cercanos."))}</p>
            ${crearTarjetasTuki(respuesta.lugares || [], respuesta.contexto)}
            ${crearTarjetasAgendaTuki(respuesta.eventos || [])}
        </div>
    `;
    conversacion.appendChild(mensaje);
    conversacion.scrollTop = conversacion.scrollHeight;
}

function actualizarContextoVisualTuki() {
    if (typeof window.contextoDeAhora !== "function") return;
    const contexto = window.contextoDeAhora();
    const clima = window.PlanificadorAPI?.climaActual;
    const tiempo = document.querySelector("#tuki-context-time");
    const climaTexto = document.querySelector("#tuki-context-weather");
    const hora = Math.floor(contexto.horaNumero);
    const minutos = Math.round((contexto.horaNumero % 1) * 60);
    const hora24 = `${String(hora).padStart(2, "0")}:${String(minutos).padStart(2, "0")}`;
    if (tiempo) tiempo.innerText = `${hora24} hs · ${contexto.momento}`;
    if (climaTexto) climaTexto.innerText = clima?.estado === "cargando" ? tukiText("searching", "Buscando…") : (clima?.descripcion || tukiText("localWeather", "Clima local"));
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

async function responderConsultaTuki(consulta) {
    let respuesta;
    try {
        await window.cargarPlanificador();
        const intencion = interpretarConsultaTuki(consulta);
        if (intencion.esAgenda) await cargarAgendaParaTuki();
        respuesta = resolverConsultaTuki(consulta);
    } catch (error) {
    console.error("Tuki no pudo resolver la consulta.", error);
    console.error("ERROR REAL DE TUKI:", error?.message, error?.stack);

    respuesta = {
            texto: tukiText("tukiError", "No pude completar la recomendación en este momento. Probá nuevamente o elegí otro horario."),
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

    try {
        agregarMensajeUsuarioTuki(texto);
        const intencion = interpretarConsultaTuki(texto);

        if (intencion.cerca && !AppState.userCoords && !TukiUIState.esperandoUbicacion) {
            TukiUIState.esperandoUbicacion = true;
            agregarRespuestaTuki({
                texto: tukiText("searchingLocation", "Estoy buscando tu ubicación. Si el GPS no está disponible, usaré la Plaza San Martín como referencia segura."),
                lugares: []
            });
            obtenerUbicacionUsuario(() => {
                TukiUIState.esperandoUbicacion = false;
                void responderConsultaTuki(texto);
            });
            return null;
        }

        void responderConsultaTuki(texto);
        return null;
    } catch (error) {
        console.error("Tuki no pudo procesar la consulta.", error);
        const respuestaFallback = {
            texto: tukiText("tukiStillAvailable", "Tuki sigue disponible, pero no pudo procesar esa consulta. Probá preguntarme por actividades, comida, clima o lugares cercanos."),
            lugares: [],
            contexto: null,
            intencion: null,
            fuenteUbicacion: null,
            exacta: false
        };
        agregarRespuestaTuki(respuestaFallback);
        return respuestaFallback;
    }
}

window.addEventListener("iguazu-language-changed", () => {
    actualizarContextoVisualTuki();
    actualizarControlSonidoTuki();
});

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

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initTukiAsistente, { once: true });
} else {
    initTukiAsistente();
}

window.TukiAsistente = {
    abrir: abrirTuki,
    cerrar: cerrarTuki,
    enviar: enviarConsultaTuki,
    interpretar: interpretarConsultaTuki,
    resolver: resolverConsultaTuki,
    agenda: {
        interpretar: interpretarConsultaAgendaTuki,
        intervalo: intervaloAgendaTuki,
        consultar: consultarAgendaTuki,
        cargar: cargarAgendaParaTuki
    }
};
