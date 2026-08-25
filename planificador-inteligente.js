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

    itinerarioContexto = { interes, tiempo, compania, presupuesto, limiteHoras, ahora };

    const planificarParaManana = ahora.esNocturnoTardio && (
        interes === "naturaleza" || interes === "fauna" || interes === "paseos"
    );

    const categoriasComplementarias = {
        naturaleza: ["comida"],
        fauna: ["comida", "actividades"],
        compras: ["comida", "actividades"],
        tres_paises: ["comida", "noche"],
        paseos: ["comida", "compras"],
        actividades: ["comida"],
        comida: ["actividades", "noche", "compras"],
        noche: ["comida"]
    }[interes] || ["comida"];

    const limiteParaPrincipales = (tiempo !== "1-2 horas" && tiempo !== "unas horas")
        ? limiteHoras - 1.5
        : limiteHoras;
    let horasAcumuladas = 0;

    // 1. Filtrar candidatos afines y compatibles con presupuesto
    let candidatos = lugaresReales
        .filter(l => l.categoria === interes || (l.intereses && l.intereses.includes(interes)))
        .filter(l => esCompatibleConPresupuesto(l, presupuesto))
        .filter(l => l.aptoPara && l.aptoPara.includes(compania))
        .map(lugar => ({
            lugar,
            puntaje: calcularPuntaje(lugar, planificarParaManana ? { momento: "mañana" } : ahora, compania, interes)
        }))
        .sort((a, b) => b.puntaje - a.puntaje);

    if (candidatos.length === 0) {
        candidatos = lugaresReales
            .filter(l => esCompatibleConPresupuesto(l, presupuesto))
            .map(lugar => ({
                lugar,
                puntaje: calcularPuntaje(lugar, ahora, compania, interes)
            }))
            .sort((a, b) => b.puntaje - a.puntaje);
    }

    // 2. Seleccionar paradas principales acumulando tiempo
    const seleccionados = [];
    candidatos.forEach(({ lugar }) => {
        const duracion = lugar.duracionHoras || 2;
        if (horasAcumuladas + duracion <= limiteParaPrincipales || seleccionados.length === 0) {
            seleccionados.push(lugar);
            horasAcumuladas += duracion;
        }
    });

    const cantidadPrincipales = seleccionados.length;

    // 3. Agregar parada complementaria si hay tiempo disponible (ej. Gastronomía)
    if (tiempo !== "1-2 horas" && categoriasComplementarias.length > 0) {
        const nombresUsados = seleccionados.map(s => s.nombre);
        const complementos = lugaresReales
            .filter(l => categoriasComplementarias.includes(l.categoria) && !nombresUsados.includes(l.nombre))
            .filter(l => esCompatibleConPresupuesto(l, presupuesto))
            .map(lugar => ({
                lugar,
                puntaje: calcularPuntaje(lugar, ahora, compania, lugar.categoria)
            }))
            .sort((a, b) => b.puntaje - a.puntaje);

        if (complementos.length > 0 && (horasAcumuladas + (complementos[0].lugar.duracionHoras || 1.5) <= limiteHoras)) {
            seleccionados.push(complementos[0].lugar);
            horasAcumuladas += (complementos[0].lugar.duracionHoras || 1.5);
        }
    }

    itinerarioActual = seleccionados;

    // 4. Renderizar el resultado
    renderizarItinerario(seleccionados, cantidadPrincipales, planificarParaManana);
}

// ========================================================
// RENDERIZADO DEL ITINERARIO Y MÉTRICAS
// ========================================================

function renderizarItinerario(lugares, cantidadPrincipales, planificarParaManana) {
    const contenedor = document.querySelector("#plan-result");
    if (!contenedor) return;

    if (!lugares || lugares.length === 0) {
        contenedor.innerHTML = `
            <div style="text-align: center; padding: 24px;">
                <div style="font-size: 44px; margin-bottom: 10px;">🦜</div>
                <h3>Estamos buscando más alternativas</h3>
                <p style="color: var(--color-text-muted);">Probá seleccionando un presupuesto más amplio o una duración diferente.</p>
            </div>
        `;
        contenedor.classList.remove("hidden");
        return;
    }

    const { tiempo, compania, presupuesto, ahora } = itinerarioContexto;

    let minutosInicio = 10 * 60; // 10:00 AM
    let avisoHorario = "";

    if (planificarParaManana) {
        minutosInicio = 9 * 60; // 09:00 AM
        avisoHorario = "🌙 Son más de las 20:00 hs y los parques naturales ya cerraron por hoy. Armamos tu plan optimizado para comenzar mañana a primera hora (09:00 hs).";
    } else {
        const horaActualMinutos = Math.floor(ahora.horaNumero * 60);
        if (horaActualMinutos >= 8 * 60 && horaActualMinutos < 21 * 60) {
            minutosInicio = Math.min(horaActualMinutos + 30, 20 * 60);
            avisoHorario = `⏱️ Plan generado a las ${ahora.horaTexto} hs, adaptado a tus tiempos.`;
        }
    }

    let minutosRecorrido = minutosInicio;
    let duracionTotalHoras = 0;

    const tarjetasHtml = lugares.map((lugar, index) => {
        const esComplemento = index >= cantidadPrincipales;
        const tipoEtiqueta = esComplemento ? "➕ Parada recomendada" : "⭐ Parada principal";
        const horaInicioStr = formatearMinutosAHorario(minutosRecorrido);
        const motivo = generarMotivoRecomendacion(lugar, ahora, compania);

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

    // Plan B SOLO si llueve
    let planBHtml = "";
    if (climaActual.lluvia) {
        const nombresUsados = lugares.map(l => l.nombre);
        const opcionesCubiertas = lugaresReales
            .filter(l => !l.alAireLibre && !nombresUsados.includes(l.nombre))
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

    contenedor.innerHTML = `
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

    let candidatos = lugaresReales
        .filter(l => (l.categoria === categoriaBuscada || (l.intereses && l.intereses.includes(categoriaBuscada))) && !nombresUsados.includes(l.nombre))
        .filter(l => esCompatibleConPresupuesto(l, presupuesto));

    if (candidatos.length === 0) {
        candidatos = lugaresReales
            .filter(l => !nombresUsados.includes(l.nombre))
            .filter(l => esCompatibleConPresupuesto(l, presupuesto));
    }

    if (candidatos.length > 0) {
        candidatos.sort((a, b) => (b.prioridad || 5) - (a.prioridad || 5));
        const reemplazo = candidatos[0];

        itinerarioActual[indice] = reemplazo;
        renderizarItinerario(itinerarioActual, itinerarioActual.length, false);
        if (typeof mostrarToast === "function") {
            mostrarToast(`🔄 Reemplazado por: ${reemplazo.nombre}`);
        }
    } else {
        alert("No encontramos otra alternativa diferente disponible para este horario y presupuesto.");
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
