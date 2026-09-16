/*
 * IGUAZÚ ASSIST — Infraestructura de idioma
 * Traduce únicamente strings fijos de interfaz; el catálogo de data.js queda intacto.
 */
(function () {
    const STORAGE_KEY = "iguazu-assist-language";
    const SUPPORTED = ["es", "en", "pt"];
    const DICTIONARY = {
        es: {
            languageLabel: "Idioma",
            languageOptionEs: "ES",
            languageOptionEn: "EN",
            languageOptionPt: "PT",
            tukiEyebrow: "Guía de Puerto Iguazú",
            brandTagline: "TU GUÍA INTELIGENTE EN IGUAZÚ",
            heroQuestion: "¿Qué querés hacer hoy?",
            installApp: "📲 Instalar app",
            now: "🧭 ¿Qué hago ahora?",
            surprise: "🦜 Sorpréndeme",
            weatherTitle: "Clima en Iguazú",
            nearbyTitle: "Opciones Cerca Tuyo",
            nearbyDescription: "Ordenados por distancia GPS real y estado de apertura en tiempo real.",
            refreshGps: "Actualizar GPS",
            gpsFallback: "📍 Usando Plaza San Martín como referencia — activá tu ubicación para distancias más precisas.",
            retryGps: "Reintentar GPS",
            offlineReady: "📶 Abrí la app una vez con conexión para dejarla lista para usar sin señal.",
            searchPlaceholder: "Buscar lugares, comida, paseos…",
            loadingOptions: "Cargando opciones…",
            filters: "Filtros de búsqueda",
            all: "Todos",
            favorites: "Mis favoritos",
            openNow: "Abiertos ahora",
            walking: "A pie (< 1.5 km)",
            fairsShopping: "Ferias y Compras",
            free: "Gratis",
            nature: "Naturaleza",
            eat: "Comer",
            cultureWalks: "Cultura y Paseos",
            night: "Noche",
            mobility: "Movilidad",
            accommodation: "Alojamiento",
            explore: "Explorar Iguazú",
            exploreDescription: "Descubrí atractivos, gastronomía y experiencias por categoría.",
            backHome: "← Volver al inicio",
            back: "← Volver",
            chatWithTuki: "Chateá con Tuki",
            closeAssistant: "Cerrar asistente",
            nowInIguazu: "Ahora en Iguazú",
            localWeather: "Clima local",
            verifiedCatalog: "Catálogo verificado",
            suggestedQuestions: "Preguntas sugeridas",
            quickNow: "Ahora",
            quickRain: "Si llueve",
            quickEat: "Dónde comer",
            quickNear: "Cerca mío",
            tukiInputLabel: "Escribí tu consulta turística",
            tukiPlaceholder: "Ej.: ¿Qué puedo hacer esta noche?",
            sendToTuki: "Enviar consulta a Tuki",
            send: "Enviar",
            ambience: "Ambiente",
            volumeLabel: "Volumen del ambiente de Misiones",
            soundActive: "Sonido activo",
            soundOn: "Activar sonido",
            navigation: "Navegación principal",
            home: "Inicio",
            plans: "Mis Planes",
            profile: "Perfil",
            openPlanner: "Abrir planificador general",
            plannerTitle: "Armemos tu experiencia en Iguazú",
            plannerDescription: "Contanos tus preferencias y Tuki construirá el mejor itinerario personalizado para hoy.",
            savedPlans: "📅 Mis planes",
            savedPlansDescription: "Guardá tus itinerarios para volver a abrirlos sin generarlos de nuevo.",
            update: "↻ Actualizar",
            tukiGreeting: "¡Hola! Soy Tuki. Escribime lo que necesitás y te respondo con recomendaciones concretas según la hora, el clima, la distancia y tu presupuesto.",
            tukiHello: "¡Hola! 👋 Soy Tuki, tu asistente para descubrir Puerto Iguazú. ¿Querés que te recomiende qué hacer, dónde comer o qué visitar?",
            tukiThanks: "¡De nada! Cuando quieras, puedo ayudarte a descubrir otro lugar o armar un plan en Iguazú.",
            tukiWho: "Soy Tuki, el asistente turístico de Iguazú Assist. Puedo ayudarte a encontrar lugares, actividades, comida, información del clima y armar planes para Puerto Iguazú.",
            tukiHelp: "Podés preguntarme qué hacer, dónde comer, qué visitar, qué hay cerca, qué opciones hay con lluvia o pedirme una recomendación para algunas horas.",
            tukiNoExact: "No encontré una respuesta exacta, pero puedo ayudarte con actividades, comida, clima y lugares cercanos.",
            tukiError: "No pude completar la recomendación en este momento. Probá nuevamente o elegí otro horario.",
            tukiStillAvailable: "Tuki sigue disponible, pero no pudo procesar esa consulta. Probá preguntarme por actividades, comida, clima o lugares cercanos.",
            searchingLocation: "Estoy buscando tu ubicación. Si el GPS no está disponible, usaré la Plaza San Martín como referencia segura.",
            tukiUnavailable: "No encontré una actividad turística planificable y disponible para esas condiciones. Probá con otro horario o una duración diferente.",
            noLocation: "No se encontró ubicación",
            searching: "Buscando…"
        },
        en: {
            languageLabel: "Language",
            languageOptionEs: "ES",
            languageOptionEn: "EN",
            languageOptionPt: "PT",
            tukiEyebrow: "Puerto Iguazú guide",
            brandTagline: "YOUR SMART GUIDE TO IGUAZÚ",
            heroQuestion: "What would you like to do today?",
            installApp: "📲 Install app",
            now: "🧭 What should I do now?",
            surprise: "🦜 Surprise me",
            weatherTitle: "Weather in Iguazú",
            nearbyTitle: "Options Near You",
            nearbyDescription: "Sorted by real GPS distance and live opening status.",
            refreshGps: "Refresh GPS",
            gpsFallback: "📍 Using Plaza San Martín as reference — enable your location for more precise distances.",
            retryGps: "Retry GPS",
            offlineReady: "📶 Open the app once online to make it ready for offline use.",
            searchPlaceholder: "Search places, food, walks…",
            loadingOptions: "Loading options…",
            filters: "Search filters",
            all: "All",
            favorites: "My favorites",
            openNow: "Open now",
            walking: "Walking (< 1.5 km)",
            fairsShopping: "Markets & Shopping",
            free: "Free",
            nature: "Nature",
            eat: "Food",
            cultureWalks: "Culture & Walks",
            night: "Nightlife",
            mobility: "Mobility",
            accommodation: "Accommodation",
            explore: "Explore Iguazú",
            exploreDescription: "Discover attractions, food and experiences by category.",
            backHome: "← Back home",
            back: "← Back",
            chatWithTuki: "Chat with Tuki",
            closeAssistant: "Close assistant",
            nowInIguazu: "Now in Iguazú",
            localWeather: "Local weather",
            verifiedCatalog: "Verified catalog",
            suggestedQuestions: "Suggested questions",
            quickNow: "Now",
            quickRain: "If it rains",
            quickEat: "Where to eat",
            quickNear: "Near me",
            tukiInputLabel: "Write your tourism question",
            tukiPlaceholder: "E.g.: What can I do tonight?",
            sendToTuki: "Send question to Tuki",
            send: "Send",
            ambience: "Ambience",
            volumeLabel: "Missiones ambience volume",
            soundActive: "Sound on",
            soundOn: "Turn sound on",
            navigation: "Main navigation",
            home: "Home",
            plans: "My Plans",
            profile: "Profile",
            openPlanner: "Open main planner",
            plannerTitle: "Let’s plan your Iguazú experience",
            plannerDescription: "Tell us your preferences and Tuki will build the best itinerary for today.",
            savedPlans: "📅 My plans",
            savedPlansDescription: "Save itineraries to reopen them without generating them again.",
            update: "↻ Refresh",
            tukiGreeting: "Hi! I’m Tuki. Tell me what you need and I’ll answer with concrete recommendations based on time, weather, distance and budget.",
            tukiHello: "Hi! 👋 I’m Tuki, your guide to Puerto Iguazú. Would you like a recommendation for things to do, places to eat or sights to visit?",
            tukiThanks: "You’re welcome! Whenever you like, I can help you discover another place or build a plan in Iguazú.",
            tukiWho: "I’m Tuki, Iguazú Assist’s tourism assistant. I can help you find places, activities, food, weather information and plans for Puerto Iguazú.",
            tukiHelp: "Ask me what to do, where to eat, what to visit, what is nearby, what to do in the rain or for a recommendation for a few hours.",
            tukiNoExact: "I couldn’t find an exact answer, but I can help with activities, food, weather and nearby places.",
            tukiError: "I couldn’t complete the recommendation right now. Please try again or choose another time.",
            tukiStillAvailable: "Tuki is still available, but couldn’t process that question. Try asking about activities, food, weather or nearby places.",
            searchingLocation: "I’m looking for your location. If GPS is unavailable, I’ll use Plaza San Martín as a safe reference.",
            tukiUnavailable: "I couldn’t find a plannable activity available for those conditions. Try another time or duration.",
            noLocation: "Location not found",
            searching: "Searching…"
        },
        pt: {
            languageLabel: "Idioma",
            languageOptionEs: "ES",
            languageOptionEn: "EN",
            languageOptionPt: "PT",
            tukiEyebrow: "Guia de Puerto Iguazú",
            brandTagline: "SEU GUIA INTELIGENTE EM IGUAZÚ",
            heroQuestion: "O que você quer fazer hoje?",
            installApp: "📲 Instalar app",
            now: "🧭 O que fazer agora?",
            surprise: "🦜 Surpreenda-me",
            weatherTitle: "Clima em Iguazú",
            nearbyTitle: "Opções Perto de Você",
            nearbyDescription: "Ordenadas pela distância GPS real e pelo status de funcionamento em tempo real.",
            refreshGps: "Atualizar GPS",
            gpsFallback: "📍 Usando a Plaza San Martín como referência — ative sua localização para distâncias mais precisas.",
            retryGps: "Tentar GPS novamente",
            offlineReady: "📶 Abra o app uma vez conectado para deixá-lo pronto para uso offline.",
            searchPlaceholder: "Buscar lugares, comida, passeios…",
            loadingOptions: "Carregando opções…",
            filters: "Filtros de busca",
            all: "Todos",
            favorites: "Meus favoritos",
            openNow: "Abertos agora",
            walking: "A pé (< 1,5 km)",
            fairsShopping: "Feiras e Compras",
            free: "Grátis",
            nature: "Natureza",
            eat: "Comer",
            cultureWalks: "Cultura e Passeios",
            night: "Noite",
            mobility: "Mobilidade",
            accommodation: "Hospedagem",
            explore: "Explorar Iguazú",
            exploreDescription: "Descubra atrações, gastronomia e experiências por categoria.",
            backHome: "← Voltar ao início",
            back: "← Voltar",
            chatWithTuki: "Converse com Tuki",
            closeAssistant: "Fechar assistente",
            nowInIguazú: "Agora em Iguazú",
            nowInIguazu: "Agora em Iguazú",
            localWeather: "Clima local",
            verifiedCatalog: "Catálogo verificado",
            suggestedQuestions: "Perguntas sugeridas",
            quickNow: "Agora",
            quickRain: "Se chover",
            quickEat: "Onde comer",
            quickNear: "Perto de mim",
            tukiInputLabel: "Escreva sua pergunta turística",
            tukiPlaceholder: "Ex.: O que posso fazer esta noite?",
            sendToTuki: "Enviar pergunta para Tuki",
            send: "Enviar",
            ambience: "Ambiente",
            volumeLabel: "Volume do ambiente de Misiones",
            soundActive: "Som ativo",
            soundOn: "Ativar som",
            navigation: "Navegação principal",
            home: "Início",
            plans: "Meus Planos",
            profile: "Perfil",
            openPlanner: "Abrir planejador geral",
            plannerTitle: "Vamos montar sua experiência em Iguazú",
            plannerDescription: "Conte suas preferências e Tuki criará o melhor itinerário personalizado para hoje.",
            savedPlans: "📅 Meus planos",
            savedPlansDescription: "Salve seus itinerários para reabri-los sem gerá-los novamente.",
            update: "↻ Atualizar",
            tukiGreeting: "Olá! Sou Tuki. Escreva o que você precisa e responderei com recomendações concretas conforme horário, clima, distância e orçamento.",
            tukiHello: "Olá! 👋 Sou Tuki, seu assistente para descobrir Puerto Iguazú. Quer uma recomendação do que fazer, onde comer ou o que visitar?",
            tukiThanks: "De nada! Quando quiser, posso ajudar você a descobrir outro lugar ou montar um plano em Iguazú.",
            tukiWho: "Sou Tuki, o assistente turístico do Iguazú Assist. Posso ajudar a encontrar lugares, atividades, comida, informações do clima e montar planos para Puerto Iguazú.",
            tukiHelp: "Pergunte o que fazer, onde comer, o que visitar, o que há por perto, opções para dias de chuva ou peça uma recomendação para algumas horas.",
            tukiNoExact: "Não encontrei uma resposta exata, mas posso ajudar com atividades, comida, clima e lugares próximos.",
            tukiError: "Não consegui concluir a recomendação agora. Tente novamente ou escolha outro horário.",
            tukiStillAvailable: "Tuki continua disponível, mas não conseguiu processar essa pergunta. Pergunte sobre atividades, comida, clima ou lugares próximos.",
            searchingLocation: "Estou procurando sua localização. Se o GPS não estiver disponível, usarei a Plaza San Martín como referência segura.",
            tukiUnavailable: "Não encontrei uma atividade turística planejável disponível para essas condições. Tente outro horário ou duração.",
            noLocation: "Localização não encontrada",
            searching: "Buscando…"
        }
    };

    let current = "es";
    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (SUPPORTED.includes(saved)) current = saved;
    } catch (error) { /* storage optional */ }

    function translate(key, fallback = key) {
        return DICTIONARY[current]?.[key] ?? DICTIONARY.es[key] ?? fallback;
    }

    function placeText(lugar, campo) {
        const original = lugar?.[campo];
        const translated = window.PLACE_TRANSLATIONS?.[lugar?.id]?.[current]?.[campo];
        return translated ?? original ?? "";
    }

    function apply(root = document) {
        document.documentElement.lang = current;
        root.querySelectorAll?.("[data-i18n]").forEach(element => {
            const value = translate(element.dataset.i18n, element.textContent);
            if (element.dataset.i18nHtml === "true") element.innerHTML = value;
            else element.textContent = value;
        });
        root.querySelectorAll?.("[data-i18n-placeholder]").forEach(element => {
            element.placeholder = translate(element.dataset.i18nPlaceholder, element.placeholder);
        });
        root.querySelectorAll?.("[data-i18n-aria-label]").forEach(element => {
            element.setAttribute("aria-label", translate(element.dataset.i18nAriaLabel, element.getAttribute("aria-label") || ""));
        });
        root.querySelectorAll?.("[data-i18n-title]").forEach(element => {
            element.setAttribute("title", translate(element.dataset.i18nTitle, element.getAttribute("title") || ""));
        });
        const selector = document.querySelector("#language-select");
        if (selector) {
            selector.value = current;
            selector.setAttribute("aria-label", translate("languageLabel"));
            selector.title = translate("languageLabel");
        }
        window.dispatchEvent(new CustomEvent("iguazu-language-changed", { detail: { language: current } }));
    }

    function setLanguage(language) {
        if (!SUPPORTED.includes(language)) return current;
        current = language;
        try { localStorage.setItem(STORAGE_KEY, current); } catch (error) { /* storage optional */ }
        apply();
        return current;
    }

    function init() {
        const selector = document.querySelector("#language-select");
        selector?.addEventListener("change", event => setLanguage(event.target.value));
        apply();
    }

    window.I18n = Object.freeze({ get language() { return current; }, supported: SUPPORTED.slice(), t: translate, placeText, setLanguage, apply, init });
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
    else init();
})();
