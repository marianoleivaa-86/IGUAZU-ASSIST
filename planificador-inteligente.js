/**
 * IGUAZÚ ASSIST — Motor de Recomendaciones y Planificador Inteligente Avanzado
 * 
 * Evalúa en tiempo real: clima (Open-Meteo), momento del día, horarios de apertura,
 * presupuesto, compañía (incluyendo niños), duración, alternativas y función Sorpréndeme.
 */

// ========================================================
// ESTADO DEL PLANIFICADOR Y CLIMA
// ========================================================
let climaActual = {
    estado: "cargando",
    descripcion: "Consultando clima…",
    temperatura: 25,
    lluvia: false,
    icono: "🌤️"
};

let itinerarioActual = [];
let itinerarioContexto = {};
let ultimaSorpresaId = null;
let itinerarioAdaptacion = { activa: false, nivel: "exacto", mensaje: "", criteriosRelajados: [] };

const URL_CLIMA_IGUAZU = "https://api.open-meteo.com/v1/forecast?latitude=-25.5972&longitude=-54.5786&current=temperature_2m,weather_code,precipitation&timezone=America%2FArgentina%2FBuenos_Aires";

const NIVELES_DE_GASTO = {
    economico: 1,
    medio: 2,
    alto: 3
};

// ========================================================
// INTEGRACIÓN DEL CLIMA EN TIEMPO REAL (OPEN-METEO)
// ========================================================

function interpretarClima(codigo, temperatura) {
    const esLluvia = [51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99].includes(codigo);
    let texto = "Parcialmente nublado";
    let icono = "🌤️";

    if (codigo === 0) {
        texto = "Despejado";
        icono = "☀️";
    } else if ([1, 2, 3].includes(codigo)) {
        texto = "Nuboso";
        icono = "🌥️";
    } else if ([45, 48].includes(codigo)) {
        texto = "Con niebla";
        icono = "🌫️";
    } else if ([95, 96, 99].includes(codigo)) {
        texto = "Tormentas eléctricas";
        icono = "⛈️";
    } else if (esLluvia) {
        texto = "Lluvia";
        icono = "🌧️";
    }

    const tempRedondeada = Math.round(temperatura);

    return {
        estado: "listo",
        descripcion: `${texto} · ${tempRedondeada} °C`,
        temperatura: tempRedondeada,
        lluvia: esLluvia,
        icono: icono
    };
}

async function cargarClimaActual() {
    const weatherIcon = document.querySelector("#weather-icon");
    const weatherTemp = document.querySelector("#weather-temp");
    const assistantText = document.querySelector("#assistant-text");

    try {
        const respuesta = await fetch(URL_CLIMA_IGUAZU);
        if (!respuesta.ok) throw new Error("Fallo en API de clima");
        const datos = await respuesta.json();

        climaActual = interpretarClima(datos.current.weather_code, datos.current.temperature_2m);

        if (weatherIcon && weatherTemp) {
            weatherIcon.innerText = climaActual.icono;
            weatherTemp.innerText = `${climaActual.temperatura}°C ${climaActual.descripcion.split(" · ")[0]}`;
        }

        if (assistantText) {
            if (climaActual.lluvia) {
                assistantText.innerText = `🌧️ Está lloviendo en Iguazú (${climaActual.temperatura}°C). Tuki prioriza opciones cubiertas como el Duty Free, Icebar y gastronomía regional.`;
            } else if (climaActual.temperatura >= 30) {
                assistantText.innerText = `☀️ Día cálido en Iguazú (${climaActual.temperatura}°C). Excelente para Cataratas y paseos náuticos. Recomendamos hidratación y protector solar.`;
            } else {
                assistantText.innerText = `🌤️ Clima agradable en Iguazú (${climaActual.temperatura}°C). Excelente momento para recorrer la selva y las Cataratas.`;
            }
        }

    } catch (error) {
        climaActual = { estado: "error", descripcion: "Clima templado · 25 °C", temperatura: 25, lluvia: false, icono: "🌤️" };
        if (weatherTemp) weatherTemp.innerText = "Puerto Iguazú";
    }
}

cargarClimaActual();

// ========================================================
// CONTEXTO TEMPORAL Y HORAS DISPONIBLES
// ========================================================

function contextoDeAhora() {
    const ahora = new Date();
    const hora = ahora.getHours() + (ahora.getMinutes() / 60);
    let momento = "noche";
    let esNocturnoTardio = false;

    if (hora >= 6 && hora < 12) momento = "mañana";
    else if (hora >= 12 && hora < 15) momento = "mediodía";
    else if (hora >= 15 && hora < 18) momento = "tarde";
    else if (hora >= 18 && hora < 20) momento = "atardecer";
    else {
        momento = "noche";
        if (hora >= 20 || hora < 6) {
            esNocturnoTardio = true;
        }
    }

    return {
        momento,
        horaNumero: hora,
        horaTexto: ahora.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" }),
        diaSemana: ahora.getDay(),
        esNocturnoTardio
    };
}

function horasDisponibles(tiempo) {
    if (tiempo === "1-2 horas") return 2;
    if (tiempo === "unas horas") return 3;
    if (tiempo === "medio día") return 5;
    if (tiempo === "todo el día") return 8;
    if (tiempo === "varios días") return 10;
    return 5;
}

function esCompatibleConPresupuesto(lugar, presupuestoElegido) {
    const nivelUsuario = NIVELES_DE_GASTO[presupuestoElegido] || 2;
    const nivelLugar = NIVELES_DE_GASTO[lugar.nivelGasto] || 1;
    return nivelUsuario >= nivelLugar;
}

function calcularPuntaje(lugar, contexto, compania, interes) {
    let score = lugar.prioridad || 5;

    // Coincidencia con interés principal
    if (lugar.categoria === interes || (lugar.intereses && lugar.intereses.includes(interes))) {
        score += 16;
    }

    // Adaptación por clima
    if (climaActual.lluvia) {
        if (lugar.alAireLibre) score -= 14;
        else score += 12;
    } else {
        if (lugar.alAireLibre) score += 4;
    }

    // Momento del día adecuado
    if (lugar.momentos && lugar.momentos.includes(contexto.momento)) {
        score += 12;
    } else {
        score -= 4;
    }

    // Apto para el grupo de viaje
    if (lugar.aptoPara && lugar.aptoPara.includes(compania)) {
        score += 18;
    }

    // Factor comercial moderado
    if (lugar.destacado) score += 3;
    if (lugar.prioridadComercial) score += Math.min(lugar.prioridadComercial * 2, 6);

    return score;
}

function generarMotivoRecomendacion(lugar, contexto, compania) {
    if (climaActual.lluvia && !lugar.alAireLibre) {
        return "🌧️ Opción cubierta ideal para el clima de hoy";
    }
    if (lugar.destacado) {
        return "⭐ Experiencia imperdible recomendada en Iguazú";
    }
    if (contexto.momento === "noche" && (lugar.categoria === "noche" || lugar.categoria === "comida")) {
        return "🌙 Abierto y perfecto para disfrutar esta noche";
    }
    if (compania === "niños" || compania === "familia") {
        return "👨‍👩‍👧‍👦 Excelente propuesta para disfrutar en familia";
    }
    if (compania === "pareja") {
        return "❤️ Ideal para compartir en pareja";
    }
    return "📍 Seleccionado especialmente según tus preferencias y tiempo";
}

const RELACIONES_DE_INTERES = {
    naturaleza: ["fauna", "paseos", "actividades"],
    fauna: ["naturaleza", "actividades", "paseos"],
    compras: ["actividades", "paseos", "comida"],
    tres_paises: ["actividades", "paseos", "noche"],
    paseos: ["actividades", "naturaleza", "compras"],
    actividades: ["paseos", "compras", "naturaleza"],
    comida: ["noche", "actividades", "compras"],
    noche: ["comida", "actividades"]
};

const CATEGORIAS_NO_TURISTICAS_PARA_RESPALDO = ["movilidad", "alojamiento"];

function esLugarValidoParaItinerario(lugar) {
    return Boolean(
        lugar &&
        lugar.nombre &&
        lugar.categoria &&
        lugar.icono &&
        lugar.descripcion &&
        (lugar.direccion || lugar.ubicacion)
    );
}

function coincideConInteres(lugar, interes) {
    return lugar.categoria === interes || (Array.isArray(lugar.intereses) && lugar.intereses.includes(interes));
}

function esCompatibleConClima(lugar) {
    return !climaActual.lluvia || lugar.alAireLibre !== true;
}

function obtenerDuracionPlan(lugar) {
    const duracion = Number(lugar && lugar.duracionHoras);
    return Number.isFinite(duracion) && duracion > 0 ? duracion : 2;
}

function estaDisponibleDurantePlan(lugar, contexto, duracion = obtenerDuracionPlan(lugar)) {
    if (!lugar || !contexto || typeof estaAbiertoEnHorario !== "function") return false;
    if (!estaAbiertoEnHorario(lugar, contexto.horaNumero, contexto.diaSemana)) return false;

    const rangos = Array.isArray(lugar.rangosHorarios) && lugar.rangosHorarios.length > 0
        ? lugar.rangosHorarios
        : lugar.rangoHorario ? [lugar.rangoHorario] : [];

    if (rangos.length === 0) return true;

    return rangos.some(rango => {
        if (!rango || !Number.isFinite(rango.apertura) || !Number.isFinite(rango.cierre)) return false;
        if (rango.apertura === 0 && rango.cierre === 24) return true;

        let cierre = rango.cierre;
        if (cierre <= rango.apertura) cierre += 24;

        let inicio = contexto.horaNumero;
        if (cierre > 24 && inicio < rango.apertura) inicio += 24;

        return inicio >= rango.apertura && inicio + duracion <= cierre;
    });
}

function momentoParaHoraPlan(hora) {
    if (hora >= 6 && hora < 12) return "mañana";
    if (hora >= 12 && hora < 15) return "mediodía";
    if (hora >= 15 && hora < 18) return "tarde";
    if (hora >= 18 && hora < 20) return "atardecer";
    return "noche";
}

function crearContextosDeBusqueda(ahora, interes) {
    const contextos = [];
    const horaActual = Number.isFinite(ahora.horaNumero) ? ahora.horaNumero : 12;
    const horaInicial = Math.ceil((horaActual + 0.25) * 2) / 2;

    // Buscar desde el próximo bloque de media hora hasta 36 horas después.
    for (let paso = 0; paso <= 72; paso += 1) {
        const horaAbsoluta = horaInicial + (paso * 0.5);
        const desplazamientoDia = Math.floor(horaAbsoluta / 24);
        const horaNumero = horaAbsoluta % 24;

        // No proponer salidas de madrugada salvo que el interés elegido sea vida nocturna.
        if (interes !== "noche" && horaNumero < 7) continue;

        const minutos = Math.round((horaNumero % 1) * 60);
        const horas = Math.floor(horaNumero);
        contextos.push({
            ...ahora,
            momento: momentoParaHoraPlan(horaNumero),
            horaNumero,
            horaTexto: `${String(horas).padStart(2, "0")}:${String(minutos).padStart(2, "0")}`,
            diaSemana: (ahora.diaSemana + desplazamientoDia) % 7,
            desplazamientoDia
        });
    }

    return contextos;
}

function obtenerCandidatosPlan(interes, presupuesto, compania, contexto, opciones = {}) {
    const {
        relajarCompania = false,
        relajarPresupuesto = false,
        modoInteres = "exacto",
        excluirNombres = []
    } = opciones;
    const excluidos = new Set(excluirNombres);
    const interesesRelacionados = RELACIONES_DE_INTERES[interes] || ["actividades", "comida"];
    const categoriasPrincipales = ["naturaleza", "comida", "actividades", "noche"];

    return lugaresReales
        .filter(esLugarValidoParaItinerario)
        .filter(lugar => !CATEGORIAS_NO_TURISTICAS_PARA_RESPALDO.includes(lugar.categoria))
        .filter(lugar => !excluidos.has(lugar.nombre))
        .filter(lugar => {
            if (modoInteres === "exacto") {
                return categoriasPrincipales.includes(interes)
                    ? lugar.categoria === interes
                    : coincideConInteres(lugar, interes);
            }
            if (modoInteres === "relacionado") {
                return interesesRelacionados.some(relacionado => coincideConInteres(lugar, relacionado));
            }
            return !CATEGORIAS_NO_TURISTICAS_PARA_RESPALDO.includes(lugar.categoria);
        })
        .filter(esCompatibleConClima)
        .filter(lugar => estaDisponibleDurantePlan(lugar, contexto))
        .filter(lugar => relajarPresupuesto || esCompatibleConPresupuesto(lugar, presupuesto))
        .filter(lugar => relajarCompania || (Array.isArray(lugar.aptoPara) && lugar.aptoPara.includes(compania)))
        .map(lugar => ({
            lugar,
            puntaje: calcularPuntaje(lugar, contexto, compania, interes)
        }))
        .sort((a, b) => b.puntaje - a.puntaje)
        .map(item => item.lugar);
}

function construirPlanConFallback({ interes, tiempo, compania, presupuesto, limiteHoras, ahora }) {
    const contextos = crearContextosDeBusqueda(ahora, interes);
    const puedeRelajarCompania = compania !== "familia" && compania !== "niños";
    const etapas = [
        {
            nivel: "exacto",
            opciones: {},
            criteriosRelajados: [],
            mensaje: ""
        },
        ...(puedeRelajarCompania ? [{
            nivel: "compania",
            opciones: { relajarCompania: true },
            criteriosRelajados: ["compañía"],
            mensaje: "Para esas condiciones no encontré una coincidencia perfecta. Tuki mantuvo el tipo de actividad, el horario y el presupuesto, y adaptó la preferencia de compañía."
        }] : []),
        {
            nivel: "presupuesto",
            opciones: { relajarCompania: puedeRelajarCompania, relajarPresupuesto: true },
            criteriosRelajados: puedeRelajarCompania ? ["compañía", "presupuesto"] : ["presupuesto"],
            mensaje: "Para esas condiciones no encontré una opción perfecta. Tuki mantuvo el tipo de actividad y un horario válido, y amplió el rango de presupuesto para ofrecerte una alternativa."
        },
        {
            nivel: "interes-relacionado",
            opciones: { relajarCompania: puedeRelajarCompania, relajarPresupuesto: true, modoInteres: "relacionado" },
            criteriosRelajados: puedeRelajarCompania ? ["compañía", "presupuesto", "preferencia secundaria"] : ["presupuesto", "preferencia secundaria"],
            mensaje: "Para esas condiciones no encontré una opción perfecta, pero Tuki te propone una alternativa turística cercana, segura y compatible con el horario."
        },
        {
            nivel: "respaldo-seguro",
            opciones: { relajarCompania: puedeRelajarCompania, relajarPresupuesto: true, modoInteres: "cualquiera" },
            criteriosRelajados: puedeRelajarCompania ? ["compañía", "presupuesto", "preferencia"] : ["presupuesto", "preferencia"],
            mensaje: "Tuki activó la recomendación de respaldo: una experiencia turística válida, disponible y adecuada para no dejarte sin propuesta."
        }
    ];

    for (const etapa of etapas) {
        for (let indiceContexto = 0; indiceContexto < contextos.length; indiceContexto += 1) {
            const contexto = contextos[indiceContexto];
            const candidatos = obtenerCandidatosPlan(interes, presupuesto, compania, contexto, etapa.opciones);
            if (candidatos.length === 0) continue;

            const seleccionados = [];
            let horasAcumuladas = 0;
            let duracionAdaptada = false;

            candidatos.forEach(lugar => {
                const duracion = obtenerDuracionPlan(lugar);
                const contextoParada = {
                    ...contexto,
                    horaNumero: (contexto.horaNumero + horasAcumuladas) % 24,
                    momento: momentoParaHoraPlan((contexto.horaNumero + horasAcumuladas) % 24)
                };
                const entraEnTiempo = horasAcumuladas + duracion <= limiteHoras;

                if (entraEnTiempo && estaDisponibleDurantePlan(lugar, contextoParada, duracion)) {
                    seleccionados.push(lugar);
                    horasAcumuladas += duracion;
                }
            });

            // Si ninguna opción entra exactamente en la duración elegida, conservar una
            // alternativa válida y explicar la adaptación en vez de devolver un array vacío.
            if (seleccionados.length === 0) {
                const alternativaMasBreve = [...candidatos]
                    .sort((a, b) => obtenerDuracionPlan(a) - obtenerDuracionPlan(b))[0];
                if (alternativaMasBreve) {
                    seleccionados.push(alternativaMasBreve);
                    horasAcumuladas = obtenerDuracionPlan(alternativaMasBreve);
                    duracionAdaptada = horasAcumuladas > limiteHoras;
                }
            }

            if (seleccionados.length > 0) {
                const horarioAdaptado = indiceContexto > 0;
                const esOtroDia = contexto.desplazamientoDia > 0;
                const mensajeHorario = horarioAdaptado
                    ? ` No había una opción compatible para comenzar de inmediato; el plan se programó ${esOtroDia ? "para mañana" : "para hoy"} a las ${contexto.horaTexto} hs.`
                    : "";
                const mensajeDuracion = duracionAdaptada
                    ? " La alternativa más breve disponible supera levemente el tiempo elegido."
                    : "";
                const mensajeBase = etapa.mensaje || (horarioAdaptado
                    ? "Tuki mantuvo tus preferencias y adaptó únicamente el horario para ofrecerte una opción válida."
                    : duracionAdaptada ? "Tuki mantuvo tus preferencias y eligió la alternativa válida más breve." : "");

                return {
                    lugares: seleccionados,
                    cantidadPrincipales: seleccionados.length,
                    contextoPlan: contexto,
                    horasAcumuladas,
                    planificarParaManana: esOtroDia,
                    adaptacion: {
                        activa: etapa.nivel !== "exacto" || horarioAdaptado || duracionAdaptada,
                        nivel: horarioAdaptado && etapa.nivel === "exacto"
                            ? "horario"
                            : duracionAdaptada && etapa.nivel === "exacto" ? "duracion" : etapa.nivel,
                        mensaje: `${mensajeBase}${mensajeHorario}${mensajeDuracion}`.trim(),
                        criteriosRelajados: [
                            ...etapa.criteriosRelajados,
                            ...(horarioAdaptado ? ["horario de inicio"] : []),
                            ...(duracionAdaptada ? ["duración"] : [])
                        ]
                    }
                };
            }
        }
    }

    return {
        lugares: [],
        cantidadPrincipales: 0,
        contextoPlan: contextos[0] || ahora,
        horasAcumuladas: 0,
        planificarParaManana: false,
        adaptacion: {
            activa: true,
            nivel: "catalogo-no-disponible",
            mensaje: "Tuki no pudo obtener una actividad válida del catálogo en este momento. Revisá la conexión y volvé a intentarlo.",
            criteriosRelajados: []
        }
    };
}

function agregarComplementoCompatible(resultado, interes, presupuesto, compania, limiteHoras, tiempo) {
    if (!resultado.lugares.length || tiempo === "1-2 horas") return resultado;

    const categorias = RELACIONES_DE_INTERES[interes] || ["comida"];
    const nombresUsados = resultado.lugares.map(lugar => lugar.nombre);
    const horaComplemento = (resultado.contextoPlan.horaNumero + resultado.horasAcumuladas) % 24;
    const contextoComplemento = {
        ...resultado.contextoPlan,
        horaNumero: horaComplemento,
        momento: momentoParaHoraPlan(horaComplemento)
    };

    for (const categoria of categorias) {
        const candidatos = obtenerCandidatosPlan(categoria, presupuesto, compania, contextoComplemento, {
            excluirNombres: nombresUsados
        });
        const complemento = candidatos.find(lugar =>
            resultado.horasAcumuladas + obtenerDuracionPlan(lugar) <= limiteHoras
        );

        if (complemento) {
            resultado.lugares.push(complemento);
            resultado.horasAcumuladas += obtenerDuracionPlan(complemento);
            return resultado;
        }
    }

    return resultado;
}

// ========================================================
// GENERACIÓN DEL PLAN INTELIGENTE
// ========================================================

function generarPlan() {
    if (typeof SoundFX !== "undefined") {
        SoundFX.play("plan");
    }

    const interes = AppState.interes || "naturaleza";
    const tiempo = AppState.tiempo || "medio día";
    const compania = AppState.compania || "solo";
    const presupuesto = AppState.presupuesto || "medio";

    const limiteHoras = horasDisponibles(tiempo);
    const ahora = contextoDeAhora();

    let resultado = construirPlanConFallback({ interes, tiempo, compania, presupuesto, limiteHoras, ahora });
    resultado = agregarComplementoCompatible(resultado, interes, presupuesto, compania, limiteHoras, tiempo);

    itinerarioAdaptacion = resultado.adaptacion;
    itinerarioContexto = {
        interes,
        tiempo,
        compania,
        presupuesto,
        limiteHoras,
        ahora,
        contextoPlan: resultado.contextoPlan,
        adaptacion: resultado.adaptacion
    };
    itinerarioActual = resultado.lugares;

    renderizarItinerario(resultado.lugares, resultado.cantidadPrincipales, resultado.planificarParaManana);
}

// ========================================================
// RENDERIZADO DEL ITINERARIO Y MÉTRICAS
// ========================================================

function renderizarItinerario(lugares, cantidadPrincipales, planificarParaManana) {
    const contenedor = document.querySelector("#plan-result");
    if (!contenedor) return;

    if (!lugares || lugares.length === 0) {
        const ahora = itinerarioContexto.ahora || contextoDeAhora();
        const respaldo = construirPlanConFallback({
            interes: itinerarioContexto.interes || "actividades",
            tiempo: itinerarioContexto.tiempo || "medio día",
            compania: itinerarioContexto.compania || "solo",
            presupuesto: itinerarioContexto.presupuesto || "medio",
            limiteHoras: itinerarioContexto.limiteHoras || 5,
            ahora
        });

        if (respaldo.lugares.length > 0) {
            lugares = respaldo.lugares;
            cantidadPrincipales = respaldo.cantidadPrincipales;
            planificarParaManana = respaldo.planificarParaManana;
            itinerarioActual = respaldo.lugares;
            itinerarioContexto.contextoPlan = respaldo.contextoPlan;
            itinerarioContexto.adaptacion = respaldo.adaptacion;
            itinerarioAdaptacion = respaldo.adaptacion;
        } else {
            contenedor.innerHTML = `
                <div style="text-align: center; padding: 24px;">
                    <div style="font-size: 44px; margin-bottom: 10px;">🦜</div>
                    <h3>Tuki sigue acá para ayudarte</h3>
                    <p style="color: var(--color-text-muted);">No pudimos leer el catálogo turístico. Recargá la aplicación para recuperar las recomendaciones guardadas.</p>
                </div>
            `;
            contenedor.classList.remove("hidden");
            return;
        }
    }

    const { tiempo, compania, presupuesto, ahora } = itinerarioContexto;
    const contextoPlan = itinerarioContexto.contextoPlan || ahora;
    const adaptacion = itinerarioContexto.adaptacion || itinerarioAdaptacion;

    let minutosInicio = Math.round((contextoPlan.horaNumero || 10) * 60);
    let avisoHorario = "";

    if (planificarParaManana) {
        avisoHorario = `🌙 Las opciones compatibles ya no están disponibles hoy. Armamos tu plan para mañana a las ${contextoPlan.horaTexto} hs.`;
    } else {
        avisoHorario = contextoPlan.horaNumero > ahora.horaNumero + 0.25
            ? `⏱️ Plan programado para hoy a las ${contextoPlan.horaTexto} hs, cuando hay opciones compatibles abiertas.`
            : `⏱️ Plan generado a las ${ahora.horaTexto} hs, adaptado a tus tiempos.`;
    }

    let minutosRecorrido = minutosInicio;
    let duracionTotalHoras = 0;

    const tarjetasHtml = lugares.map((lugar, index) => {
        const esComplemento = index >= cantidadPrincipales;
        const tipoEtiqueta = esComplemento ? "➕ Parada recomendada" : "⭐ Parada principal";
        const horaInicioStr = formatearMinutosAHorario(minutosRecorrido);
        const motivo = generarMotivoRecomendacion(lugar, contextoPlan, compania);

        duracionTotalHoras += (lugar.duracionHoras || 2);
        minutosRecorrido += Math.round((lugar.duracionHoras || 2) * 60);

        const indoorBadge = lugar.alAireLibre ? "🌿 Al aire libre" : "🏛️ Techado / Interior";
        const queryMaps = encodeURIComponent(`${lugar.nombre}, ${lugar.direccion || lugar.ubicacion}`);

        return `
            <article class="plan-card">
                <div class="plan-card-number">${index + 1}</div>
                <div class="plan-card-icon">${lugar.icono}</div>
                <div class="plan-card-info">
                    <div class="plan-card-meta">
                        <span class="plan-time-tag">${horaInicioStr}</span>
                        <span class="plan-type-tag">${tipoEtiqueta}</span>
                        <span class="tag-badge" style="font-size:10.5px;">${indoorBadge}</span>
                    </div>
                    <h4>${escapar(lugar.nombre)}</h4>
                    <div class="plan-card-reason">${motivo}</div>
                    <p>${escapar(lugar.descripcion)}</p>
                    
                    <div class="plan-card-actions">
                        <button class="btn-card-action primary" onclick="mostrarDetalle('${escaparAttr(lugar.nombre)}')">
                            ⭐ Ver detalle
                        </button>
                        <button class="btn-card-action" onclick="cambiarActividad(${index}, '${escaparAttr(lugar.nombre)}')">
                            🔄 Cambiar por otra
                        </button>
                        <a class="btn-card-action" href="https://www.google.com/maps/search/?api=1&query=${queryMaps}" target="_blank" rel="noopener noreferrer">
                            📍 Cómo llegar
                        </a>
                    </div>
                </div>
            </article>
        `;
    }).join("");

    // Enlace multiruta Google Maps con waypoints
    const destinos = lugares.map(l => encodeURIComponent(`${l.nombre}, ${l.direccion || l.ubicacion}`));
    let enlaceGoogleMaps = "";
    if (destinos.length === 1) {
        enlaceGoogleMaps = `https://www.google.com/maps/search/?api=1&query=${destinos[0]}`;
    } else if (destinos.length > 1) {
        const origen = destinos[0];
        const destinoFinal = destinos[destinos.length - 1];
        const waypoints = destinos.slice(1, -1).join("%7C");
        enlaceGoogleMaps = `https://www.google.com/maps/dir/?api=1&origin=${origen}&destination=${destinoFinal}${waypoints ? `&waypoints=${waypoints}` : ""}`;
    }

    // Alternativas cubiertas adicionales para lluvia, siempre válidas para el horario y el perfil.
    let planBHtml = "";
    if (climaActual.lluvia) {
        const nombresUsados = lugares.map(l => l.nombre);
        const opcionesCubiertas = lugaresReales
            .filter(esLugarValidoParaItinerario)
            .filter(l => !l.alAireLibre && !nombresUsados.includes(l.nombre))
            .filter(l => esCompatibleConPresupuesto(l, presupuesto))
            .filter(l => l.aptoPara && l.aptoPara.includes(compania))
            .filter(l => estaDisponibleDurantePlan(l, contextoPlan))
            .sort((a, b) => calcularPuntaje(b, contextoPlan, compania, b.categoria) - calcularPuntaje(a, contextoPlan, compania, a.categoria))
            .slice(0, 2);

        if (opcionesCubiertas.length > 0) {
            const itemsB = opcionesCubiertas.map(l => `
                <article class="plan-card" style="margin-top: 10px; cursor: pointer;" onclick="mostrarDetalle('${escaparAttr(l.nombre)}')">
                    <div class="plan-card-icon">${l.icono}</div>
                    <div class="plan-card-info">
                        <span class="plan-time-tag" style="background:#e0f2fe; color:#0369a1;">🌧️ Alternativa bajo techo</span>
                        <h4>${escapar(l.nombre)}</h4>
                        <p>${escapar(l.descripcion)}</p>
                        <span class="tag-badge">📍 ${escapar(l.ubicacion)}</span>
                    </div>
                </article>
            `).join("");

            planBHtml = `
                <div class="plan-b-section">
                    <div class="plan-b-header">
                        <span>🌧️</span>
                        <h4>Plan B para la lluvia</h4>
                    </div>
                    <p style="font-size:13.5px; color:var(--color-text-muted); margin-bottom:10px;">
                        Por precipitaciones en Iguazú, también podés sumar estas opciones techadas:
                    </p>
                    ${itemsB}
                </div>
            `;
        }
    }

    const textoPresupuesto = presupuesto === "economico" ? "Económico" : presupuesto === "medio" ? "Medio" : "Flexible / Sin límite";
    const textoCompania = compania === "solo" ? "Solo" : compania === "pareja" ? "En Pareja" : compania === "familia" ? "En Familia" : compania === "niños" ? "Con Niños" : "Con Amigos";
    const avisoAdaptacionHtml = adaptacion && adaptacion.activa ? `
        <div class="plan-adaptation-notice" role="status">
            <span class="plan-adaptation-icon">🦜</span>
            <p><strong>Tuki adaptó tu propuesta.</strong> ${escapar(adaptacion.mensaje)}</p>
        </div>
    ` : "";

    contenedor.innerHTML = `
        ${avisoAdaptacionHtml}
        <div class="plan-result-header">
            <div class="plan-title-row">
                <h3>🌴 Tu Itinerario en Iguazú</h3>
                <span class="metric-pill" style="background:#fef3c7; color:#92400e; border-color:#fde68a;">
                    ${climaActual.icono} ${climaActual.descripcion}
                </span>
            </div>
            <p style="font-size:14px; color:var(--color-text-muted); margin-bottom: 10px;">${avisoHorario}</p>
            
            <div class="plan-metrics-bar">
                <span class="metric-pill">⏱️ ~${duracionTotalHoras} horas</span>
                <span class="metric-pill">👥 ${textoCompania}</span>
                <span class="metric-pill">💰 ${textoPresupuesto}</span>
                <span class="metric-pill">📍 ${lugares.length} paradas</span>
            </div>
        </div>

        <div class="plan-places-list">
            ${tarjetasHtml}
        </div>

        ${planBHtml}

        <button class="map-route-btn" onclick="window.open('${enlaceGoogleMaps}', '_blank')">
            🗺️ VER RECORRIDO COMPLETO EN GOOGLE MAPS
        </button>
    `;

    contenedor.classList.remove("hidden");
    contenedor.scrollIntoView({ behavior: "smooth", block: "start" });
}

// ========================================================
// 🔄 FUNCIONALIDAD: CAMBIAR UNA ACTIVIDAD DEL PLAN
// ========================================================

function cambiarActividad(indice, nombreActual) {
    if (typeof SoundFX !== "undefined") {
        SoundFX.play("cambio");
    }

    const { interes, presupuesto, compania } = itinerarioContexto;
    const lugarActual = itinerarioActual[indice];
    if (!lugarActual) return;

    const categoriaBuscada = lugarActual.categoria || interes;
    const nombresUsados = itinerarioActual.map(l => l.nombre);
    const contextoBase = itinerarioContexto.contextoPlan || itinerarioContexto.ahora || contextoDeAhora();
    const horasPrevias = itinerarioActual
        .slice(0, indice)
        .reduce((total, lugar) => total + obtenerDuracionPlan(lugar), 0);
    const horaActividad = (contextoBase.horaNumero + horasPrevias) % 24;
    const contextoActividad = {
        ...contextoBase,
        horaNumero: horaActividad,
        momento: momentoParaHoraPlan(horaActividad)
    };
    const puedeRelajarCompania = compania !== "familia" && compania !== "niños";

    let candidatos = obtenerCandidatosPlan(categoriaBuscada, presupuesto, compania, contextoActividad, {
        excluirNombres: nombresUsados
    });

    if (candidatos.length === 0 && puedeRelajarCompania) {
        candidatos = obtenerCandidatosPlan(categoriaBuscada, presupuesto, compania, contextoActividad, {
            excluirNombres: nombresUsados,
            relajarCompania: true
        });
    }

    if (candidatos.length === 0) {
        candidatos = obtenerCandidatosPlan(categoriaBuscada, presupuesto, compania, contextoActividad, {
            excluirNombres: nombresUsados,
            relajarCompania: puedeRelajarCompania,
            relajarPresupuesto: true
        });
    }

    if (candidatos.length === 0) {
        candidatos = obtenerCandidatosPlan(categoriaBuscada, presupuesto, compania, contextoActividad, {
            excluirNombres: nombresUsados,
            relajarCompania: puedeRelajarCompania,
            relajarPresupuesto: true,
            modoInteres: "relacionado"
        });
    }

    if (candidatos.length > 0) {
        const reemplazo = candidatos[0];

        itinerarioActual[indice] = reemplazo;
        const esParaManana = (itinerarioContexto.contextoPlan && itinerarioContexto.ahora)
            ? itinerarioContexto.contextoPlan.diaSemana !== itinerarioContexto.ahora.diaSemana
            : false;
        renderizarItinerario(itinerarioActual, itinerarioActual.length, esParaManana);
        if (typeof mostrarToast === "function") {
            mostrarToast(`🔄 Reemplazado por: ${reemplazo.nombre}`);
        }
    } else {
        const mensaje = `Tuki no encontró otra alternativa segura y disponible; mantuvo ${nombreActual || lugarActual.nombre} en tu plan.`;
        if (typeof mostrarToast === "function") mostrarToast(`🦜 ${mensaje}`);
        else console.info(mensaje);
    }
}

// ========================================================
// ✨ FUNCIONALIDAD "SORPRÉNDEME" (1-CLIC)
// ========================================================

window.generarSorpresa = function () {
    if (typeof SoundFX !== "undefined") {
        SoundFX.play("shimmer");
    }

    const contenedor = document.querySelector("#surprise-container");
    if (!contenedor) return;

    const ahora = contextoDeAhora();
    const coords = AppState.userCoords || CONFIG_APP.coordenadasCentro;

    // Filtrar opciones abiertas y apropiadas
    let candidatos = lugaresReales.filter(lugar => {
        if (ultimaSorpresaId && lugar.id === ultimaSorpresaId && lugaresReales.length > 1) {
            return false;
        }
        if (climaActual.lluvia && lugar.alAireLibre && !lugar.destacado) {
            return false;
        }
        return estaAbiertoEnHorario(lugar, ahora.horaNumero, ahora.diaSemana);
    });

    if (candidatos.length === 0) {
        candidatos = lugaresReales.filter(l => l.id !== ultimaSorpresaId);
    }

    // Ordenar con aleatoriedad ponderada por prioridad
    candidatos.sort((a, b) => {
        const scoreA = (a.prioridad || 5) + Math.random() * 6;
        const scoreB = (b.prioridad || 5) + Math.random() * 6;
        return scoreB - scoreA;
    });

    const sorpresa = candidatos[0] || lugaresReales[0];
    ultimaSorpresaId = sorpresa.id;

    // Calcular distancia si tiene coordenadas
    let distanciaTexto = "";
    if (sorpresa.coordenadas && typeof sorpresa.coordenadas.lat === "number") {
        const km = calcularDistanciaKm(coords.lat, coords.lng, sorpresa.coordenadas.lat, sorpresa.coordenadas.lng);
        distanciaTexto = formatearDistancia(km);
    }

    let motivoTuki = `Está abierto ahora (${sorpresa.horario}), es una experiencia muy valorada en Iguazú y el clima actual (${climaActual.descripcion}) acompaña.`;
    if (climaActual.lluvia) {
        motivoTuki = `Como está lloviendo en Iguazú, Tuki eligió esta opción techada y climatizada para disfrutar sin mojarte.`;
    } else if (ahora.momento === "noche") {
        motivoTuki = `Es un excelente plan nocturno abierto ahora en Puerto Iguazú.`;
    }

    const queryMaps = encodeURIComponent(`${sorpresa.nombre}, ${sorpresa.direccion || sorpresa.ubicacion}`);
    const badgeGasto = sorpresa.nivelGasto === "economico" ? "💰 Económico" : sorpresa.nivelGasto === "medio" ? "💵 Medio" : "💎 Alto";

    contenedor.innerHTML = `
        <div style="font-size: 64px; margin-bottom: 8px;">${sorpresa.icono}</div>
        <h2 style="font-size: 26px; font-weight: 900; color: var(--color-primary-dark); margin-bottom: 6px;">
            ${escapar(sorpresa.nombre)}
        </h2>
        
        <div class="tags-row" style="justify-content: center; margin-bottom: 14px;">
            ${distanciaTexto ? `<span class="distance-badge">📍 ${distanciaTexto}</span>` : ""}
            <span class="open-badge open">🟢 Abierto ahora</span>
            <span class="tag-badge">${badgeGasto}</span>
            <span class="tag-badge">🕐 ${escapar(sorpresa.horario)}</span>
        </div>

        <div class="surprise-rationale">
            <strong>🦜 Por qué Tuki lo eligió:</strong><br>
            ${motivoTuki}
        </div>

        <p style="font-size: 14px; color: var(--color-text-muted); margin-bottom: 20px; line-height: 1.5;">
            ${escapar(sorpresa.descripcion)}
        </p>

        <div class="surprise-actions-row">
            <button class="btn-card-action primary" style="padding:14px; justify-content:center;" onclick="mostrarDetalle('${escaparAttr(sorpresa.nombre)}')">
                ⭐ Ver Ficha Completa
            </button>
            <a class="btn-card-action" style="padding:14px; justify-content:center;" href="https://www.google.com/maps/search/?api=1&query=${queryMaps}" target="_blank" rel="noopener noreferrer">
                📍 Cómo Llegar
            </a>
        </div>

        <button class="btn-another-surprise" style="width: 100%; margin-top: 14px;" onclick="generarSorpresa()">
            🔄 Sorpréndeme otra vez
        </button>
    `;
};

// ========================================================
// FORMATEO DE HORARIOS
// ========================================================

function formatearMinutosAHorario(minutosTotales) {
    let horas = Math.floor(minutosTotales / 60);
    let mins = minutosTotales % 60;

    if (horas >= 24) horas -= 24;

    const hh = String(horas).padStart(2, "0");
    const mm = String(mins).padStart(2, "0");
    return `${hh}:${mm} hs`;
}
