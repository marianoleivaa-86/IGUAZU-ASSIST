# INFORME DE AUDITORÍA 4G.2.3

## 1. Veredicto

# APTO CON OBSERVACIONES

La arquitectura actual tiene una base suficiente para continuidad offline del núcleo local, pero no garantiza coherencia atómica de versiones entre HTML, JavaScript, CSS y assets durante una actualización. Las pruebas funcionales de navegador offline y actualización no pudieron ejecutarse en este entorno.

## 2. Resumen ejecutivo

El Service Worker instala un precache completo de los recursos locales principales, elimina cachés con nombres antiguos, usa `skipWaiting()` y ejecuta `clients.claim()`. El catálogo y el motor de planificación están cacheados, y el fallo de Open-Meteo se transforma en clima cacheado o desconocido sin bloquear conceptualmente `generarPlan()`.

El riesgo principal es **medio**: CSS e imágenes utilizan `Cache First` con actualización individual, mientras HTML, JS y JSON utilizan `Network First`. Sin una invalidación coordinada por conjunto de recursos, puede existir una combinación temporal de versiones distintas. La instalación, recarga offline, generación offline, cambio de actividad offline y actualización real del SW quedaron **NO VERIFICABLES**.

## 3. Inventario real de recursos

| Recurso | Referenciado por | Local/externo | Necesario offline | Precacheado | Estrategia |
| --- | --- | --- | ---: | ---: | --- |
| `index.html` | navegación y aplicación | Local | Sí | Sí | Network First |
| `app.js` | `index.html` | Local | Sí | Sí | Network First |
| `data.js` | `index.html` | Local | Sí | Sí | Network First |
| `planificador-inteligente.js` | `index.html` | Local | Sí | Sí | Network First |
| `style.css` | `index.html` | Local | Sí | Sí | Cache First |
| `manifest.json` | `index.html` | Local | Sí | Sí | Network First |
| `circuitos-estado.json` | planificador | Local | No bloqueante | Sí | Network First |
| `icon.svg` | manifest | Local | Sí para icono PWA | Sí | Cache First |
| `icon.jpg` | favicon y Apple touch icon | Local | Visual/PWA | Sí | Cache First |
| `hero-bg.jpg` | HTML, CSS, fallback de app | Local | Visual | Sí | Cache First |
| `tuki-branch-transparent.png` | `index.html` | Local | Visual | Sí | Cache First |
| `tuki-avatar.jpg` | HTML y navegación | Local | Visual | Sí | Cache First |
| `tuki-branch.jpg` | `app.js` | Local | Visual | Sí | Cache First |
| `img_aqva.jpg` | `app.js` | Local | Visual | Sí | Cache First |
| `img_casanova.jpg` | `app.js` | Local | Visual | Sí | Cache First |
| `img_cataratas.jpg` | `app.js` | Local | Visual | Sí | Cache First |
| `img_hito.jpg` | `app.js` | Local | Visual | Sí | Cache First |
| `img_mirador.jpg` | `app.js` | Local | Visual | Sí | Cache First |
| `img_saintgeorge.jpg` | `app.js` | Local | Visual | Sí | Cache First |
| Google Fonts | HTML y CSS | Externo | No bloqueante | No | Red externa |
| Open-Meteo | `planificador-inteligente.js` | Externo | No | No | Fetch externo con catch |
| Google Maps | enlaces generados | Externo | No para generar URL | No | Apertura externa |

Los archivos locales enumerados por el Service Worker existen en el repositorio. No se inventaron recursos adicionales. No se identificaron fuentes locales.

## 4. Arquitectura del Service Worker

`service-worker.js` define `CACHE_NAME = "iguazu-assist-v20"` y una lista `ARCHIVOS_CACHE` con la raíz, HTML, CSS, JavaScript, JSON, manifest, iconos e imágenes.

### Instalación

Existe `install` con `event.waitUntil` y `cache.addAll(ARCHIVOS_CACHE)`. Un único recurso fallido puede hacer fallar la promesa completa de `addAll`, dejando la instalación incompleta. No existe recuperación parcial específica.

Después del precache se ejecuta `self.skipWaiting()`.

### Activación

Existe `activate` con `event.waitUntil`, `caches.keys()`, eliminación de toda caché cuyo nombre sea distinto del actual y `self.clients.claim()`.

La eliminación es amplia: elimina cualquier caché ajena al nombre actual, incluidas cachés que pudieran pertenecer a otra versión o aplicación bajo el mismo scope. En el repositorio auditado no se observaron nombres históricos adicionales.

### Fetch

Sólo se interceptan URLs del mismo origen. Las solicitudes externas no son gestionadas por este worker.

## 5. Estrategias de caché

| Tipo | Estrategia real | Evaluación |
| --- | --- | --- |
| HTML/navegación | Network First; fallback a `./index.html` | Permite carga offline después de precache. |
| JavaScript | Network First; fallback a entrada cacheada | Adecuada para continuidad local. |
| JSON local | Network First; fallback a caché | Adecuada para catálogo/estado cacheado. |
| CSS | Cache First + actualización en segundo plano | Offline funcional, pero actualización individual. |
| Imágenes/SVG | Cache First + actualización en segundo plano | Offline funcional, pero puede mezclar versiones. |
| Fuentes | No hay fuentes locales; Google Fonts externa | Degrada a fallback del sistema offline. |
| APIs externas | No interceptadas | Requieren su propio manejo de error. |

Las estrategias son funcionales por separado, pero no garantizan que todos los recursos pertenezcan a una misma versión.

## 6. Versionado

La versión se identifica únicamente mediante:

```js
const CACHE_NAME = "iguazu-assist-v20"
```

No hay mecanismo automático para cambiar ese nombre cuando cambia `app.js`, `data.js`, `planificador-inteligente.js`, `index.html`, `style.css` o un asset. Si cambia un archivo pero no cambia `CACHE_NAME`, la actualización depende de la estrategia de fetch y de la respuesta individual de cada recurso.

Si cambia `CACHE_NAME`, el nuevo worker crea una caché nueva y `activate` elimina las cachés cuyos nombres no coincidan. Esto funciona como invalidación por nombre, pero no como garantía de atomicidad de recursos.

Sí es posible que el navegador continúe utilizando código JavaScript antiguo temporalmente: una página ya abierta conserva sus scripts en memoria y las entradas cacheadas se actualizan individualmente.

## 7. Riesgo de versiones mixtas

**Severidad: MEDIO.**

El siguiente escenario es posible durante una actualización:

```text
index.html versión N
app.js versión N o N-1 según red/caché
planificador-inteligente.js versión N o N-1 según red/caché
data.js versión N o N-1 según red/caché
style.css versión N-1 servido inmediatamente desde Cache First
imágenes N-1 mientras se revalidan en segundo plano
```

`skipWaiting()` y `clients.claim()` reducen la permanencia del worker antiguo, pero no actualizan atómicamente una página ya cargada ni sus dependencias. El nombre global de caché sólo cambia si se modifica manualmente.

No se identificó un bloqueador estático que impida cargar el motor, pero la coherencia de versión no está garantizada.

## 8. Instalación y actualización

### Hecho

- El registro ocurre en `index.html` durante `window.load`.
- Existe `install` con `waitUntil`.
- Existe `activate` con limpieza de cachés.
- Existe `skipWaiting()`.
- Existe `clients.claim()`.

### Verificado estáticamente

El flujo esperado de instalación y activación está presente en el código.

### No verificable

No se pudo observar en navegador real:

- instalación efectiva;
- activación efectiva;
- control de la página por el nuevo worker;
- actualización real de HTML, JS, CSS y assets;
- recarga posterior sin red;
- ausencia de mezclas durante una actualización.

No existe `registration.update()` explícito. Esto no se clasifica por sí solo como fallo, porque el navegador realiza su ciclo normal de actualización del Service Worker.

## 9. Pruebas offline

No fue posible ejecutar DevTools o un navegador controlado para desconectar la red sin modificar el repositorio. Por tanto, carga offline, navegación offline, catálogo offline y planificación offline son **NO VERIFICABLES funcionalmente**.

La inspección estática confirma que los recursos necesarios están precacheados y que existen fallbacks de fetch.

## 10. Generación offline

**PASS ESTÁTICO.**

`data.js`, `app.js` y `planificador-inteligente.js` están incluidos en el precache. El catálogo se encuentra localmente y el motor no requiere Open-Meteo para disponer de lugares.

`cargarClimaActual()` captura el fallo de red y asigna clima cacheado o estado `desconocido`. `construirContextoAhora()` conserva `disponible: false` y valores meteorológicos desconocidos sin lanzar una excepción que bloquee conceptualmente la generación.

La generación real con la interfaz desconectada es **NO VERIFICABLE**.

## 11. `cambiarActividad()` offline

**PASS ESTÁTICO.**

La función trabaja con `itinerarioActual`, `itinerarioContexto`, `contextoPlan` y `lugaresReales`, todos disponibles desde los archivos locales precacheados. No llama a `generarPlan()`, GPS, clima ni APIs externas. Valida candidato, duplicados y secuencia antes de mutar.

El reemplazo real y su render en modo offline son **NO VERIFICABLES**.

## 12. GPS offline

**PASS ESTÁTICO.**

La aplicación usa `localStorage` para guardar y restaurar coordenadas. Si no hay coordenadas guardadas, usa el centro de referencia. Si el GPS falla, conserva la última ubicación o utiliza el fallback.

`AppState.userCoords` puede cambiar, pero no se observó una llamada automática a `generarPlan()` ni una escritura automática de `itinerarioContexto.origenCoords` desde los callbacks GPS.

El comportamiento real con permisos, GPS y desconexión es **NO VERIFICABLE**.

## 13. Clima offline

### Clima cacheado

Se lee desde `localStorage` y se aplica como dato cacheado.

### Sin clima cacheado

Se asigna estado `desconocido`, temperatura `null`, lluvia falsa, lluvia próxima falsa, tormenta falsa, icono fallback y horas vacías.

### Open-Meteo sin respuesta

El `catch` conserva el clima cacheado si existe; de lo contrario, aplica el estado desconocido. No se observó dependencia dura que bloquee `generarPlan()`.

### Snapshot existente

El Service Worker no modifica objetos de aplicación. La separación de 4G.2.2 copia el clima y las horas dentro del snapshot de generación. No se observó reconstrucción retroactiva del itinerario por una actualización o fallo de Open-Meteo.

Resultado: **PASS ESTÁTICO**; ejecución funcional offline: **NO VERIFICABLE**.

## 14. Recuperación online

El flujo estáticamente previsto es que las solicitudes locales vuelvan a intentar red mediante `Network First`, mientras que assets Cache First lanzan una actualización de fondo cuando existe una respuesta cacheada.

No se pudo verificar funcionalmente la secuencia offline → recuperación de red → recarga → actualización de recursos. Resultado: **NO VERIFICABLE**.

## 15. Manifest

El manifest contiene valores coherentes con la estructura auditada:

- `name`: `Iguazú Assist`.
- `short_name`: `Iguazú Assist`.
- `start_url`: `./index.html`.
- `scope`: `./`.
- `display`: `standalone`.
- `theme_color`: `#168052`.
- `background_color`: `#0d4a2b`.
- icono `icon.svg`, existente y precacheado.

El JSON fue parseado correctamente con Node. `start_url` y `scope` son compatibles con la aplicación servida desde su directorio.

Resultado: **PASS ESTÁTICO**.

## 16. Recursos dinámicos

### Open-Meteo

No está precacheado ni interceptado por ser externo. Tiene fallback de clima cacheado o desconocido. Afecta información meteorológica, no el arranque del motor.

### Google Fonts

No están precacheadas ni interceptadas. Offline puede cambiar la tipografía a los fallbacks declarados en CSS. Es una degradación visual.

### Google Maps

La URL se construye localmente y puede generarse offline; la apertura y carga de Google Maps normalmente requiere conexión externa.

### Assets locales dinámicos

`app.js` puede seleccionar `hero-bg.jpg`, `img_aqva.jpg`, `img_casanova.jpg`, `img_cataratas.jpg`, `img_hito.jpg`, `img_mirador.jpg`, `img_saintgeorge.jpg` y `tuki-branch.jpg`. Todos están listados en el precache y existen.

## 17. Google Maps

**PASS ESTÁTICO para generar URL.**

La aplicación puede construir enlaces de Maps con coordenadas y lugares sin requerir una llamada de red durante la generación. La navegación a Google Maps es externa y no se espera que funcione sin conexión. Esto no es un fallo offline de la PWA.

## 18. Regresión 4G.1

**PASS ESTÁTICO.**

El Service Worker no contiene lógica de scoring, duración, filtros, exclusiones, contexto temporal ni Maps. `generarPlan()` sigue siendo el flujo principal observado. El motor y catálogo están precacheados. No se observó `generarPlan4G()`.

La regresión funcional completa queda **NO VERIFICABLE**.

## 19. Regresión 4G.2.1

**PASS ESTÁTICO.**

`cambiarActividad()` conserva el itinerario, usa el contexto snapshot, evita `generarPlan()`, valida la propuesta, evita duplicados y cambia de forma atómica. Los recursos necesarios están en el precache.

La interacción real offline queda **NO VERIFICABLE**.

## 20. Regresión 4G.2.2

**PASS ESTÁTICO.**

El Service Worker sólo entrega recursos y no contiene lógica que mezcle estado vivo con snapshot. Se conserva la separación:

```text
climaActual                  ≠ clima congelado del snapshot
AppState.userCoords          ≠ itinerarioContexto.origenCoords
estado vivo                  ≠ contexto de generación
```

Una nueva generación explícita puede capturar el estado actual; una actualización de clima o GPS no reconstruye retroactivamente el itinerario existente.

## 21. Matriz de pruebas

| Prueba | Resultado | Tipo | Evidencia |
| --- | --- | --- | --- |
| SW instala | PASS ESTÁTICO | estática | `install`, `waitUntil`, `cache.addAll` |
| SW activa | PASS ESTÁTICO | estática | `activate`, `caches.keys`, `clients.claim` |
| Recursos críticos cacheados | PASS ESTÁTICO | estática | Lista del SW y existencia de archivos |
| HTML offline | PASS ESTÁTICO | estática | Fallback a `./index.html` |
| JS offline | PASS ESTÁTICO | estática | JS crítico precacheado y fallback |
| CSS offline | PASS ESTÁTICO | estática | CSS precacheado |
| Catálogo offline | PASS ESTÁTICO | estática | `data.js` precacheado |
| Generación offline | NO VERIFICABLE | funcional no ejecutada | No se controló navegador offline |
| Clima desconocido offline | PASS ESTÁTICO | estática | `catch` y estado desconocido |
| Cambio de actividad offline | NO VERIFICABLE | funcional no ejecutada | No se controló navegador offline |
| GPS offline | PASS ESTÁTICO | estática | `localStorage` y fallback |
| Recuperación online | NO VERIFICABLE | funcional no ejecutada | No se pudo reconectar y observar |
| Actualización SW | NO VERIFICABLE | funcional no ejecutada | No se instaló una versión N+1 real |
| Eliminación cache antigua | PASS ESTÁTICO | estática | Elimina nombres distintos de `CACHE_NAME` |
| Coherencia HTML/JS | FAIL ESTÁTICO | estática | No existe garantía atómica entre recursos |
| Coherencia CSS/JS | FAIL ESTÁTICO | estática | Estrategias distintas y actualización individual |
| Assets dinámicos | PASS ESTÁTICO | estática | Assets locales listados y existentes |
| Manifest | PASS ESTÁTICO | estática | JSON válido y rutas coherentes |
| Maps URL offline | PASS ESTÁTICO | estática | URL construible sin red |
| No regeneración GPS | PASS ESTÁTICO | estática | No se observó llamada automática |
| No regeneración clima | PASS ESTÁTICO | estática | `catch` no llama a `generarPlan()` |
| Snapshot preservado | PASS ESTÁTICO | estática | SW no modifica estado; snapshot independiente |

## 22. Hallazgos críticos

No se identificaron hallazgos críticos por inspección estática. Los recursos locales críticos enumerados por el Service Worker existen.

## 23. Hallazgos altos

No se identificaron hallazgos altos por inspección estática. No se observó una regresión que impida conceptualmente ejecutar el motor local sin clima.

## 24. Hallazgos medios

### M-01 — Riesgo de versiones mixtas

- **Evidencia:** `Cache First` para CSS/imágenes y `Network First` para HTML/JS/JSON.
- **Impacto:** puede servirse HTML/JS/CSS/assets de generaciones diferentes durante una actualización.
- **Archivo:** `service-worker.js`.
- **Recomendación:** resolver en una etapa de implementación posterior con una política de versionado y actualización coherente.

### M-02 — Invalidación dependiente de cambio manual de `CACHE_NAME`

- **Evidencia:** `iguazu-assist-v20` es fijo.
- **Impacto:** cambios de código sin cambio del nombre no forman una nueva unidad de caché.
- **Archivo:** `service-worker.js`.
- **Recomendación:** definir una política explícita de versionado antes de cerrar la implementación posterior.

## 25. Hallazgos bajos

### B-01 — No existe `registration.update()` explícito

La detección queda delegada al ciclo normal del navegador. No es un bloqueador.

### B-02 — Google Fonts no está disponible offline

La UI utiliza fuentes fallback locales del sistema. El impacto es visual, no funcional.

## 26. Deuda técnica

- No existe garantía transaccional de que HTML, JS, CSS y assets correspondan a la misma versión.
- No hay prueba automatizada de navegador para instalación, actualización y modo offline.
- El conjunto crítico se actualiza por recurso y no por release coherente.
- Las dependencias externas no tienen una experiencia offline equivalente, aunque no bloquean el motor local.

## 27. Riesgos pendientes

- Que una actualización entregue temporalmente una combinación incompatible de archivos.
- Que un usuario mantenga una pestaña antigua con scripts en memoria después de instalar un nuevo worker.
- Que la instalación falle completa si un recurso de `addAll` no está disponible.
- Que la tipografía remota no cargue offline.
- Que la funcionalidad de Maps externa no esté disponible sin red.

## 28. Recomendaciones para 4G.2.4

- Resolver formalmente el versionado conjunto de HTML, JavaScript, CSS, JSON y assets.
- Definir criterios funcionales de actualización y recarga después de instalar el nuevo worker.
- Ejecutar pruebas reales de instalación, desconexión, generación offline, `cambiarActividad()`, recuperación online y actualización.
- Mantener intactos los contratos de `generarPlan()`, snapshot/live, scoring, duración, exclusiones y Maps.
- No comenzar por cambios en catálogo, estilos o arquitectura; el hallazgo principal está en la política de caché/versionado.

## 29. Archivos modificados

```text
Archivos modificados por esta auditoría:
NINGUNO
```

El informe es el único artefacto generado para documentar la auditoría. El estado Git observado ya contenía cambios previos en `app.js`, `data.js`, `icon.svg`, `index.html`, `planificador-inteligente.js`, `service-worker.js`, `style.css` y varios recursos. No fueron revertidos ni modificados durante esta auditoría.

## 30. Veredicto final

# APTO CON OBSERVACIONES

La arquitectura actual de IGUAZÚ ASSIST responde a la pregunta arquitectónica así:

> **¿La arquitectura actual garantiza continuidad funcional del itinerario y coherencia de recursos entre online, offline y actualización del Service Worker?**

**SÍ, CON OBSERVACIONES.**

La continuidad local y la separación live/snapshot están respaldadas estáticamente. La coherencia estricta de versiones durante actualización no está garantizada por la estrategia actual, y las pruebas funcionales de navegador no pudieron ejecutarse. Por esas razones no corresponde declarar `CERRADA`.

No se implementó ninguna corrección.

---

**Fin del informe.**
