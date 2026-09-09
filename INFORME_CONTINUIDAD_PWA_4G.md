# INFORME DE CONTINUIDAD PWA / OFFLINE

## 1. Objetivo

Auditar la continuidad técnica de Iguazú Assist después de 4G.2.4, con foco en PWA, Service Worker, Cache API, funcionamiento offline, actualización de recursos, coherencia entre HTML/JavaScript/CSS/assets y pruebas reproducibles. Esta sesión fue exclusivamente de auditoría. No se modificó código productivo, no se actualizaron versiones, no se instalaron dependencias y no se crearon tests dentro del proyecto.

## 2. Documentación previa revisada

Se revisaron los documentos disponibles relacionados con 4G, PWA, offline, caché y continuidad:

- `INFORME_4G2_4.md`.
- `INFORME_AUDITORIA_4G2_3.md`.
- `INFORME_IMPLEMENTACION_4G2_2.md`.
- `INFORME_AUDITORIA_FINAL.md`.
- `MEJORAS_IGUAZU_ASIST.md`.

No se encontró un documento independiente suficiente para confirmar formalmente 4G.1, 4G.2 ni una etapa posterior numerada. Las observaciones heredadas más relevantes son la falta de pruebas dinámicas reales de navegador/offline y el riesgo de versiones mixtas entre recursos con estrategias de caché diferentes.

## 3. Arquitectura actual de la PWA

La aplicación es una PWA vanilla servida desde un directorio relativo. `index.html` carga primero `style.css`, referencia `manifest.json`, favicon y Apple touch icon, incorpora fuentes de Google y al final carga, en este orden, `data.js`, `app.js` y `planificador-inteligente.js`. El mismo documento registra `./service-worker.js` durante `window.load` con el scope por defecto del directorio.

El flujo de dependencias observado es:

```text
index.html
  ├── style.css
  ├── manifest.json
  ├── icon.jpg
  ├── Google Fonts (externo)
  ├── data.js ─────────────┐
  ├── app.js                ├── lógica y catálogo local
  └── planificador-inteligente.js
                              ├── clima Open-Meteo (externo, no bloqueante)
                              ├── GPS del navegador
                              └── imágenes/JSON locales

service-worker.js
  ├── precache de HTML/CSS/JS/JSON/manifest/assets
  ├── Cache First para assets estáticos
  └── Network First para HTML/JS/JSON/navegación
```

## 4. Inventario de recursos

| Recurso | Referenciado por | Precacheado | Runtime cache | Dependencia de red | Fallback offline | Riesgo de obsolescencia |
|---|---|---:|---:|---:|---|---|
| `index.html` | navegador | Sí | Sí, al responder red | No para arranque después de precache | `./index.html` en navegación | Medio |
| `app.js` | `index.html` | Sí | Sí | No para lógica local después de precache | Entrada cacheada | Medio |
| `data.js` | `index.html`/`app.js` | Sí | Sí | No | Entrada cacheada | Medio |
| `planificador-inteligente.js` | `index.html` | Sí | Sí | Open-Meteo sólo para clima | Entrada cacheada; clima desconocido/cacheado | Medio |
| `style.css` | `index.html` | Sí | Sí | Google Fonts opcional | CSS cacheado | Alto por Cache First |
| `manifest.json` | `index.html` | Sí | Sí | No | Cacheado | Medio |
| `service-worker.js` | registro del navegador | No es recurso de `ARCHIVOS_CACHE` | Actualización propia del navegador | Red para detectar nueva versión | Depende del ciclo del navegador | Alto por versión manual |
| `circuitos-estado.json` | planificador | Sí | Sí | No bloqueante | Cacheado | Medio |
| `icon.svg` | `manifest.json` | Sí | Sí | No | Cacheado | Alto por Cache First |
| `icon.jpg` | `index.html` | Sí | Sí | No | Cacheado | Alto por Cache First |
| `tuki-branch-transparent.png` | `index.html` | Sí | Sí | No | Cacheado | Alto por Cache First |
| `tuki-avatar.jpg` | `index.html`/navegación | Sí | Sí | No | Cacheado | Alto por Cache First |
| `tuki-branch.jpg` | `app.js` | Sí | Sí | No | Cacheado | Alto por Cache First |
| `hero-bg.jpg` | CSS/app fallback | Sí | Sí | No | Cacheado | Alto por Cache First |
| `img_aqva.jpg` | `app.js`/categorías | Sí | Sí | No | Cacheado | Alto por Cache First |
| `img_casanova.jpg` | `app.js`/categorías | Sí | Sí | No | Cacheado | Alto por Cache First |
| `img_cataratas.jpg` | `app.js`/categorías | Sí | Sí | No | Cacheado | Alto por Cache First |
| `img_hito.jpg` | `app.js`/categorías | Sí | Sí | No | Cacheado | Alto por Cache First |
| `img_mirador.jpg` | `app.js`/categorías | Sí | Sí | No | Cacheado | Alto por Cache First |
| `img_saintgeorge.jpg` | `app.js`/categorías | Sí | Sí | No | Cacheado | Alto por Cache First |
| `hero-art.svg` | No se identificó referencia en los archivos inspeccionados | No | No | No | Ninguno | No funcionalmente demostrado |
| Google Fonts | `index.html`/CSS | No | No | Sí | Fallback de fuentes del sistema | Bajo, visual |
| Open-Meteo | `planificador-inteligente.js` | No | No | Sí | Clima cacheado o `desconocido` | No bloqueante |
| Google Maps | URLs generadas por la app | No | No | Sí para abrir/navegar | No aplica al arranque | Funcional externo |

El inventario del Service Worker incluye los recursos críticos locales observados. La existencia de un asset local no implica por sí sola que sea funcionalmente necesario: el caso de `hero-art.svg` no fue identificado como referencia activa durante esta inspección.

## 5. Auditoría del Service Worker

### Instalación

`install` abre `CACHE_NAME = "iguazu-assist-v20"` y ejecuta `cache.addAll(ARCHIVOS_CACHE)`. La promesa está encadenada a `event.waitUntil`, seguida de `self.skipWaiting()` sólo si el `addAll` termina correctamente. Un fallo de cualquier recurso puede rechazar `addAll` y hacer fallar la instalación completa. Aunque Cache API puede haber recibido entradas antes del fallo, el Service Worker no se considera instalado correctamente; no existe recuperación parcial explícita.

### Activación

`activate` obtiene todas las claves de caché y elimina cualquier nombre distinto de `iguazu-assist-v20`; después ejecuta `self.clients.claim()`. La política es amplia: podría eliminar caches de otro uso bajo el mismo scope. No se observó una lista histórica de nombres en el código que permita distinguir caches huérfanas por aplicación.

### Fetch

Sólo se interceptan solicitudes cuyo URL comienza con `self.location.origin`. Las solicitudes externas no son gestionadas por este worker.

Para assets estáticos —imágenes, SVG, CSS, fuentes y formatos equivalentes— se usa **Cache First con actualización en segundo plano**: si hay respuesta cacheada se devuelve inmediatamente y se intenta actualizar desde red; si no hay cache, se usa la respuesta de red y se guarda cuando es válida.

Para HTML, JavaScript, JSON y el resto de solicitudes locales se usa **Network First**: se intenta red primero, se cachea una respuesta básica 200 y, si falla, se devuelve `./index.html` para navegación o la entrada cacheada correspondiente para otros recursos.

No se usa `stale-while-revalidate` con esa denominación ni existe una cola de actualización o recuperación transaccional de un conjunto de recursos.

## 6. Estrategia de caché

La estrategia es funcional por recurso, pero no atómica por versión. HTML, JS y JSON intentan red primero; CSS e imágenes pueden servir una entrada anterior inmediatamente mientras actualizan en segundo plano. El resultado puede ser una combinación temporal de recursos de generaciones distintas, particularmente si el servidor publica cambios parciales o si el navegador conserva una página ya cargada.

El precache cubre el arranque local principal. La Cache API no persiste preferencias ni itinerarios por sí misma; el Service Worker sólo conserva respuestas de recursos.

## 7. Versionado

El único versionado explícito del cache es:

```js
const CACHE_NAME = "iguazu-assist-v20"
```

No se identificó `CACHE_VERSION`, hash de contenido, revision manifest, query `?v=`, filename versionado ni generación automática del nombre a partir de archivos. Si cambia `app.js`, `data.js`, `planificador-inteligente.js`, `style.css`, `index.html` o un asset pero no se cambia manualmente `CACHE_NAME`, no existe invalidación coordinada por conjunto.

Cuando sí cambia `CACHE_NAME`, el nuevo worker crea otra caché durante `install` y el `activate` elimina las caches con nombres diferentes. Eso invalida nombres anteriores, pero no garantiza que una página ya abierta y sus dependencias en memoria se actualicen de forma atómica.

## 8. Actualización

El navegador detecta cambios del Service Worker mediante su ciclo normal de actualización al volver a comprobar `./service-worker.js`; el código de la aplicación no registra una llamada explícita a `registration.update()`.

El nuevo worker utiliza `skipWaiting()` y `clients.claim()`, por lo que puede activarse y tomar control sin esperar necesariamente a que se cierren todas las pestañas. No existe notificación al usuario, listener de `updatefound`, espera de confirmación ni recarga automática. Una página ya cargada conserva en memoria sus scripts anteriores hasta que se recarga.

Ventajas: activación rápida y control inmediato de clientes. Riesgos: activación sin coordinación con una página abierta, mezcla temporal de recursos y ausencia de señal visible para que el usuario recargue o confirme una actualización.

## 9. Coherencia HTML/JS/CSS/assets

La arquitectura actual **permite riesgo de desincronización**:

- HTML, JS y JSON se actualizan individualmente mediante Network First.
- CSS e imágenes se sirven Cache First con actualización individual.
- El cache name no se deriva automáticamente del contenido.
- No existe un manifest de revisiones ni un commit de recursos atómico.
- Una página abierta puede conservar HTML y scripts antiguos aun después de que el worker nuevo se active.

Por tanto, los escenarios `HTML nuevo + JS/CSS viejo` y `HTML viejo + JS/CSS nuevo` son técnicamente posibles durante publicaciones o actualizaciones parciales. No se observó evidencia de que actualmente hayan ocurrido en ejecución real, pero el diseño no los impide.

Consecuencias potenciales: funciones no encontradas, IDs no coincidentes, clases visuales faltantes, referencias a assets ausentes, degradación visual o errores de inicialización. La severidad arquitectónica es **MEDIO/ALTO**, no un fallo crítico demostrado de arranque en el estado actual.

## 10. Offline

### Offline de navegación

**PASS ESTÁTICO.** El precache incluye `./index.html` y la rama de navegación en el fallback devuelve `./index.html` cuando falla la red.

### Offline de recursos

**PASS ESTÁTICO.** HTML, CSS, JavaScript, JSON, manifest, iconos e imágenes críticas listadas por el Service Worker están incluidos en `ARCHIVOS_CACHE`.

### Offline funcional

**NO VERIFICABLE.** En esta sesión no se ejecutó una prueba de navegador con DevTools/Network/Cache Storage desconectando la red, ni existe un runner E2E declarado en el proyecto. La presencia de precache y fallbacks demuestra el diseño estático, no el comportamiento funcional observado en un navegador.

La aplicación puede continuar con catálogo y motor locales una vez cargados. Clima, GPS y apertura de Maps tienen dependencias externas o del dispositivo y degradan de forma distinta.

## 11. Fallback

Para navegación local, una falla de red devuelve `./index.html` desde cache. Para solicitudes locales no navegacionales, devuelve la respuesta cacheada correspondiente si existe. Si no existe cache y falla la red, la promesa puede quedar rechazada; no hay una respuesta offline genérica para un recurso local ausente.

El fallback meteorológico es independiente del Service Worker: `cargarClimaActual()` intenta Open-Meteo y, ante error, conserva clima cacheado o aplica estado `desconocido`. Esto no bloquea conceptualmente el motor de planificación.

## 12. Recursos críticos

**Críticos para arrancar tras precache:** `index.html`, `style.css`, `data.js`, `app.js`, `planificador-inteligente.js`, `manifest.json`, iconos y assets visuales referenciados. Todos figuran en `ARCHIVOS_CACHE` salvo el propio `service-worker.js`, cuya actualización depende del navegador y no de ese precache.

**Importantes para funciones concretas:** `circuitos-estado.json` para estado remoto/local de circuitos; las imágenes para fidelidad visual; Google Fonts para tipografía no esencial.

**Opcionales o externos:** Open-Meteo para información meteorológica actual; Google Maps para abrir navegación; Google Fonts como mejora visual; assets no identificados como usados, como `hero-art.svg`.

## 13. Recursos no cacheados

| Recurso no cacheado | Clasificación | Efecto offline |
|---|---|---|
| Open-Meteo | Importante, no crítico | Clima actual no disponible; se usa cache/fallback desconocido |
| Google Fonts | Opcional | Fallback tipográfico del sistema |
| Google Maps | Importante para navegación externa | El itinerario y la URL pueden generarse; abrir Maps requiere red |
| `service-worker.js` como entrada de `ARCHIVOS_CACHE` | Crítico para detectar actualizaciones, no para una página ya controlada | El ciclo de actualización del navegador requiere comprobación de red o su mecanismo propio |
| `hero-art.svg` | No se confirmó como recurso usado | Sin impacto demostrado |

No se clasifican las dependencias externas naturales como bugs por el solo hecho de requerir red.

## 14. Dependencias externas

- **Open-Meteo:** fetch de clima actual y pronóstico horario; tiene catch y fallback.
- **Google Fonts:** dependencia visual no bloqueante; el CSS tiene fuentes de respaldo.
- **Google Maps:** navegación externa; no es necesaria para generar un itinerario ni una URL local.
- **GPS del navegador:** disponibilidad dependiente del dispositivo, permisos y señal; la app usa coordenadas guardadas o Plaza San Martín como fallback.

## 15. Open-Meteo

El estado meteorológico vivo se guarda en `localStorage` bajo `iguazu-assist-weather` con TTL de 20 minutos. Si existe cache, se muestra mientras se intenta refrescar. Si el fetch falla, se conserva el dato cacheado; si no existe, se aplica `estado: "desconocido"`, temperatura nula y valores conservadores. `construirContextoAhora()` expone `disponible: false` y valores meteorológicos desconocidos sin forzar una excepción de generación.

El snapshot de generación se separa del estado vivo mediante `crearSnapshotContextoPlan()`, conforme al contrato validado en 4G.2.2. La auditoría confirma **PASS ESTÁTICO** y no modifica esa lógica. Ejecución funcional en navegador offline: **NO VERIFICABLE**.

## 16. Google Maps

La aplicación construye enlaces locales con el lugar y/o coordenadas. Esa construcción no requiere una llamada de red y el itinerario permanece disponible. La carga del sitio de Maps y la navegación externa sí requieren conexión. Esto es una dependencia funcional externa esperable, no un bug de la PWA.

## 17. Persistencia

| Dato | Mecanismo | Persistencia observada |
|---|---|---|
| Clima | `localStorage` | Último clima con TTL |
| Coordenadas | `localStorage` | Última ubicación válida |
| Favoritos | `localStorage` | IDs de favoritos |
| Recursos PWA | Cache API | Respuestas controladas por Service Worker |
| Itinerario actual | Memoria JavaScript | No se identificó persistencia durable |
| Contexto del itinerario | Memoria JavaScript | Vive mientras la página mantiene el estado |
| Modo de prueba temporal | Memoria JavaScript | No persiste; se restaura al finalizar el arnés |
| IndexedDB | No identificado | No usado |
| `sessionStorage` | No identificado como mecanismo principal | No usado en el flujo auditado |

No se observó riesgo de que GPS o clima reescriban retroactivamente el snapshot del itinerario. La pérdida del itinerario al cerrar/recargar es una limitación de persistencia, no una regresión demostrada de 4G.2.2.

## 18. Pruebas E2E posibles

Con un navegador Chromium/Edge y DevTools podrían ejecutarse manualmente U1–U12 usando Application, Service Workers, Cache Storage y Network/Offline. Un runner como Playwright, Puppeteer o Cypress sería necesario para automatización reproducible de instalación, actualización, control de pestañas y matrices de red; no se instaló ni se agregó ninguno.

En esta sesión no se ejecutó un navegador E2E controlado. Por ello se distinguen estrictamente las pruebas estáticas de las no verificables.

## 19. Matriz de pruebas

| ID | Escenario | Método | Resultado esperado | Ejecutable ahora | Riesgo |
|---|---|---|---|---|---|
| U1 | Instalación online | Navegador/DevTools | PWA instala y carga | NO VERIFICABLE | Medio |
| U2 | Primera apertura offline | Navegador/Network Offline | Carga desde cache | NO VERIFICABLE | Alto |
| U3 | Recarga offline | Navegador/Network Offline | Continúa funcionando | NO VERIFICABLE | Alto |
| U4 | Nueva versión SW | Navegador/Application | Actualización correcta | NO VERIFICABLE | Alto |
| U5 | Pestaña abierta | Navegador/Application | Control y recarga coherentes | NO VERIFICABLE | Alto |
| U6 | Reapertura | Navegador | Nueva versión disponible | NO VERIFICABLE | Medio |
| U7 | HTML/JS desincronizados | Análisis estático | No debe ocurrir | FAIL | Alto |
| U8 | Assets nuevos | Análisis estático | Versión coherente | FAIL | Medio/Alto |
| U9 | Cache antigua | DevTools | Cache anterior eliminada | PASS ESTÁTICO | Medio |
| U10 | Error de red | Análisis de código/DevTools | Recuperación correcta | PASS ESTÁTICO; ejecución NO VERIFICABLE | Medio |
| U11 | Instalación incompleta | Simulación de fallo de recurso | Comportamiento seguro | NO VERIFICABLE | Medio |
| U12 | Recuperación | Navegador | PWA recuperable | NO VERIFICABLE | Alto |

Los estados `FAIL` de U7 y U8 son hallazgos de diseño estático: el sistema permite la condición de versiones mezcladas; no significan que una desincronización haya sido observada en producción.

## 20. Hallazgos

1. El Service Worker tiene precache y fallbacks adecuados para el arranque local.
2. La estrategia de assets es Cache First con actualización individual; HTML/JS/JSON usan Network First.
3. `CACHE_NAME` está versionado manualmente como `v20`, sin hash, revision manifest ni cache busting por recurso.
4. `skipWaiting()` y `clients.claim()` fuerzan una actualización rápida, pero no existe aviso ni recarga coordinada.
5. La coherencia de una versión completa no está garantizada.
6. Open-Meteo tiene fallback y no bloquea conceptualmente la generación.
7. GPS dispone de última ubicación y fallback local.
8. Maps se degrada de forma natural a navegación externa no disponible sin red.
9. No hay evidencia de pruebas funcionales E2E offline ejecutadas en esta auditoría.
10. No se encontró una etapa oficial numerada posterior a 4G.2.4.

## 21. Riesgos

| Riesgo | Severidad | Estado |
|---|---|---|
| Mezcla de HTML/JS/CSS/assets de generaciones distintas | Alto | Riesgo real de arquitectura, no observado dinámicamente |
| Página abierta con scripts antiguos tras activación de nuevo SW | Alto | Posible por ciclo normal de página y ausencia de reload coordinado |
| Assets visuales viejos servidos por Cache First | Medio | Posible hasta actualización de fondo |
| Instalación rechazada por un recurso que falla en `addAll` | Medio | Posible; no hay recuperación parcial explícita |
| Eliminación amplia de caches ajenas bajo el mismo scope | Medio | Posible según entorno de despliegue |
| Clima sin red | Bajo/Medio | Degradación controlada por cache/desconocido |
| Maps sin red | Bajo | Limitación externa esperable |
| Fuentes sin red | Bajo | Degradación visual esperable |

## 22. Bugs reales

### Alto — FAIL estático

**Coherencia de versiones no garantizada.** La combinación de Cache First para assets, Network First para HTML/JS/JSON y `CACHE_NAME` manual permite recursos de generaciones diferentes. Puede producir referencias rotas o comportamiento incoherente después de una actualización parcial. El bug es arquitectónico y está demostrado por el código; no se observó una instancia dinámica.

### Medio — FAIL estático

**Ausencia de actualización coordinada de clientes existentes.** `skipWaiting()` y `clients.claim()` activan el worker, pero la página ya cargada conserva scripts en memoria y no hay notificación ni recarga coordinada. Esto amplía la ventana de mezcla de versiones.

### Medio — PASS ESTÁTICO con riesgo

**Instalación all-or-nothing sin recuperación parcial.** `cache.addAll()` puede fallar como operación de instalación si un recurso no responde. No se clasifica como fallo observado porque no se ejecutó una simulación de instalación incompleta.

No se encontró un bug crítico demostrado que impida el arranque de la PWA con los recursos precacheados actuales.

## 23. Mejoras opcionales

No son bugs bloqueantes ni deben convertirse automáticamente en etapas:

- agregar revisión/hash de recursos;
- agregar notificación de actualización disponible;
- persistir itinerarios si el producto lo requiere;
- automatizar pruebas E2E con Playwright/Puppeteer/Cypress;
- incorporar fotos propias o autorizadas;
- mejorar la política de caches compartidas por scope.

## 24. Necesidad de implementación

**SÍ — CAMBIO MÍNIMO**, pero no debe ejecutarse en esta auditoría.

La evidencia indica que antes de declarar una continuidad PWA robusta hace falta una etapa de implementación enfocada exclusivamente en coherencia de versiones y actualización coordinada. No hace falta modificar 4G.1, `generarPlan()`, `cambiarActividad()`, snapshot, clima ni GPS para resolver el riesgo principal.

## 25. Cambios mínimos propuestos

| Archivo | Cambio | Motivo | Riesgo | Forma de validación |
|---|---|---|---|---|
| `service-worker.js` | Adoptar versionado coordinado o revisión de conjunto y una política de actualización explícita | Evitar mezclar generaciones | Medio/Alto | U4–U12 con DevTools y navegador |
| `index.html` | Sólo si la política elegida requiere señal/reload controlado | Informar o coordinar actualización de clientes | Medio | U5/U6/U12 |
| Infraestructura de despliegue, si existe | Publicación atómica de HTML, JS, CSS y assets | Evitar que Network First reciba conjuntos parciales | Medio/Alto | U7/U8/U10 |
| Tests fuera del producto | Crear automatización E2E en una etapa posterior | Reproducir instalación, offline y actualización | Bajo para producción; requiere alcance propio | U1–U12 automatizadas |

No se implementó ninguno de estos cambios.

## 26. Regresión 4G.1

**PASS ESTÁTICO.** El Service Worker sólo entrega recursos y no altera scoring, duración, filtros, exclusiones ni la función `generarPlan()`. La regresión funcional completa en navegador es **NO VERIFICABLE**.

## 27. Regresión 4G.2.1

**PASS ESTÁTICO.** `cambiarActividad()` y sus datos locales quedan disponibles en el precache; el Service Worker no modifica su lógica. La interacción offline real es **NO VERIFICABLE**.

## 28. Regresión 4G.2.2

**PASS ESTÁTICO.** La auditoría no modifica ni mezcla `climaActual`, `AppState.userCoords`, `itinerarioContexto.contextoPlan` u `origenCoords`. La separación live/snapshot documentada se conserva.

## 29. Regresión 4G.2.3

**PASS ESTÁTICO con observación.** Se confirma precache, fallback de navegación, Network First para recursos de código/datos, Cache First para assets y fallback meteorológico. La instalación, navegación offline, recarga offline, actualización real y recuperación online son **NO VERIFICABLES**.

## 30. Regresión 4G.2.4

**PASS ESTÁTICO.** El arnés `window.__iguazuTesting`, el contexto temporal de prueba y la separación de clima/contexto no son tocados por esta auditoría. La prueba reproducible previamente documentada continúa siendo la evidencia válida; no se repitió.

## 31. Siguiente etapa recomendada

```text
SIGUIENTE ETAPA OFICIAL:
NO DOCUMENTADA

CANDIDATA TÉCNICA:
Implementación mínima de coherencia de versiones y actualización coordinada de PWA/Service Worker, seguida por validación E2E U1–U12.
```

No se asigna número 4G inventado. La etapa candidata debe definir como mínimo:

- **Objetivo:** impedir o detectar mezclas de generaciones y validar actualización/offline.
- **Alcance:** Service Worker, política de versionado, publicación coordinada y pruebas E2E; no lógica del planificador.
- **Pruebas:** U1–U12, con separación entre PASS, PASS ESTÁTICO, FAIL y NO VERIFICABLE.
- **Criterios de aceptación:** instalación, navegación offline, recuperación, actualización con pestaña abierta/cerrada, eliminación de cache anterior y coherencia HTML/JS/CSS/assets.
- **Veredicto:** sólo después de ejecutar las pruebas posibles y documentar las no verificables.

## 32. Estado de Git

Se ejecutaron únicamente los controles solicitados:

```text
git status --short
git diff --stat
```

El estado observado antes de crear este informe ya contenía siete archivos modificados y archivos nuevos de etapas previas. El informe `INFORME_CONTINUIDAD_PWA_4G.md` es el único archivo creado durante esta auditoría y no es código productivo.

Estado de cambios productivos preexistentes:

- Modificados: `app.js`, `data.js`, `icon.svg`, `index.html`, `planificador-inteligente.js`, `service-worker.js`, `style.css`.
- Nuevos preexistentes: `INFORME_4G2_4.md`, `INFORME_AUDITORIA_4G2_3.md`, `INFORME_AUDITORIA_FINAL.md`, `INFORME_IMPLEMENTACION_4G2_2.md`, `MEJORAS_IGUAZU_ASIST.md`, `circuitos-estado.json`, `hero-art.svg`, `hero-bg.jpg`, `icon.jpg`, `img_aqva.jpg`, `img_casanova.jpg`, `img_cataratas.jpg`, `img_hito.jpg`, `img_mirador.jpg`, `img_saintgeorge.jpg`, `tuki-avatar.jpg`, `tuki-branch-transparent.png`, `tuki-branch.jpg`, `tuki.svg`.

La auditoría no modificó código ni archivos preexistentes, no corrigió whitespace, no hizo reset/checkout/clean y no agregó dependencias. Resultado administrativo: **SIN CAMBIOS de producto**.

## 33. Veredicto

# APTO CON OBSERVACIONES

La PWA tiene una base offline estática razonable: recursos críticos precacheados, fallback de navegación, fallback meteorológico y datos locales. Sin embargo, la coherencia entre generaciones no está garantizada por el diseño actual y las pruebas funcionales de navegador/offline/actualización no fueron verificables en esta sesión. Se identifican riesgos reales de versiones mixtas, pero no un fallo crítico de arranque demostrado.

La siguiente etapa oficial permanece **NO DOCUMENTADA**. La continuación técnicamente más coherente es una etapa aún no numerada de implementación mínima de coherencia de versiones/actualización coordinada, seguida de pruebas E2E U1–U12. No se implementó esa candidata.
