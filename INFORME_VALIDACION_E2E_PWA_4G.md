# INFORME DE VALIDACIÓN E2E — PWA IGUAZÚ ASSIST

## 1. Objetivo

Obtener evidencia real de navegador sobre la carga online de Iguazú Assist, el registro y control del Service Worker, la presencia del cache versionado, la regresión funcional básica del motor 4G y las condiciones que no pudieron ejecutarse por falta de control directo de Network Offline, DevTools Application y publicación de una segunda versión.

La ejecución fue exclusivamente de prueba, observación y documentación. No se modificó código, Service Worker, HTML, JavaScript, CSS, datos, manifest, configuración ni historial Git.

## 2. Estado inicial

El estado Git inicial registrado antes de las pruebas contenía modificaciones y archivos no versionados preexistentes. Los cambios productivos modificados eran:

- `app.js`;
- `data.js`;
- `icon.svg`;
- `index.html`;
- `planificador-inteligente.js`;
- `service-worker.js`;
- `style.css`.

También existían como no versionados informes históricos, assets y `INFORME_SIGUIENTE_ETAPA_4G.md`, todos anteriores a esta validación.

No se hizo `reset`, `clean`, `checkout`, revert, commit, instalación de dependencias ni modificación de archivos del proyecto.

## 3. Navegador utilizado

Se utilizó el navegador sandbox controlado disponible mediante las herramientas de navegador de la sesión. El navegador se identificó como Chromium/Chrome compatible con Service Workers y Cache Storage.

## 4. Versión del navegador

La información observada desde `navigator.userAgent` fue:

```text
Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36; Manus-User/1.0
```

La versión reportada por el user agent es **Chrome 151.0.0.0**. Plataforma observada: `Linux x86_64`.

## 5. Servidor/URL utilizada

Se utilizó temporalmente el servidor HTTP integrado de Python, sin instalar dependencias ni modificar el proyecto.

```text
URL utilizada: http://127.0.0.1:8000/
Puerto: 8000
Navegador: Chromium/Chrome sandbox
Transporte: HTTP local
```

El servidor sólo entregó los archivos existentes del proyecto durante las pruebas.

## 6. Service Worker observado

En la primera carga online se observó:

- registro activo de `http://127.0.0.1:8000/service-worker.js`;
- alcance `http://127.0.0.1:8000/`;
- estado `activated`;
- ausencia de worker `waiting` o `installing` en la carga observada.

La primera página cargada todavía no estaba controlada porque el Service Worker actual no utiliza `clients.claim()`. Después de recargar la aplicación, el controlador observado fue:

```text
http://127.0.0.1:8000/service-worker.js
```

Esto es consistente con el lifecycle normal esperado tras una activación sin `clients.claim()`.

## 7. Cache Storage observado

En el navegador se observó exactamente una cache:

```text
iguazu-assist-v21
```

No se observó `iguazu-assist-v20`.

La cache v21 contenía **20 entradas**. La consulta se realizó desde el contexto de la página mediante `caches.keys()` y `caches.open()`; no fue una inferencia a partir del código.

## 8. Recursos críticos

Se confirmó en Cache Storage la presencia de los recursos críticos principales:

- `/`;
- `/index.html`;
- `/style.css`;
- `/data.js`;
- `/app.js`;
- `/planificador-inteligente.js`;
- `/manifest.json`;
- `/circuitos-estado.json`;
- `/service-worker.js` no forma parte de las 20 entradas precacheadas observadas;
- `/icon.svg` y `/icon.jpg`;
- assets visuales de Tuki, hero y categorías.

La comprobación explícita confirmó que `index.html`, `style.css`, `data.js`, `app.js`, `planificador-inteligente.js` y `manifest.json` estaban presentes.

## 9. U1 — Instalación online

**Resultado: PASS**

### Evidencia

La aplicación cargó online en `http://127.0.0.1:8000/`, mostró la interfaz principal y el catálogo. El navegador registró el Service Worker, observó el estado `activated` y encontró `iguazu-assist-v21` con 20 entradas. Después de una recarga, el Service Worker pasó a controlar la página.

La consola registró el mensaje de registro del Service Worker y no presentó errores de JavaScript durante la carga.

## 10. U2 — Primera apertura offline

**Resultado: NO VERIFICABLE**

No se dispuso de una acción de navegador que permitiera activar `Network → Offline` ni de control directo de una segunda pestaña con la red realmente desconectada. No se convirtió la presencia del precache en un PASS E2E.

La existencia del cache se documenta como evidencia de preparación online, no como prueba de primera apertura offline.

## 11. U3 — Recarga offline

**Resultado: NO VERIFICABLE**

No se pudo ejecutar una recarga con Network Offline realmente activado desde DevTools. La recarga online observada confirmó control posterior del Service Worker, pero no demuestra recarga sin red.

## 12. Prueba funcional offline

**Resultado: NO VERIFICABLE**

No se pudo desconectar la red en el navegador controlado. Por tanto, no se afirma PASS E2E para:

- generación de itinerario offline;
- cambio de actividad offline;
- navegación offline;
- uso offline con Open-Meteo no disponible.

## 13. U4 — Actualización

**Resultado: NO VERIFICABLE**

No se publicó ni se introdujo una segunda versión real del Service Worker. La instrucción prohíbe modificar `service-worker.js` o cambiar versiones para fabricar la prueba.

Se observó el worker actual v21 activo, pero no el ciclo real versión anterior → nuevo worker → nuevo cache → instalación → activación.

## 14. U5 — Pestaña abierta

**Resultado: NO VERIFICABLE**

No fue posible provocar una actualización real mientras una pestaña existente permanecía abierta. Por ello no se observó un estado `waiting` durante una actualización ni se pudo comprobar E2E la coexistencia de clientes.

La primera carga sin `controller`, seguida de una carga controlada después de recargar, es una observación de lifecycle inicial; no reemplaza una prueba de actualización con dos generaciones.

## 15. U6 — Cierre/reapertura

**Resultado: NO VERIFICABLE**

No existió una actualización real previa que permitiera comprobar cierre, reapertura y adopción de una nueva generación. La recarga de la misma URL confirmó control por v21, pero no demuestra el ciclo de cierre/reapertura posterior a una actualización real.

## 16. U7 — Coherencia HTML/JS/CSS

**Resultado: PASS ESTÁTICO**

### Evidencia

En el navegador, la aplicación cargó y ejecutó simultáneamente la interfaz, el catálogo, el planificador, el CSS y los assets desde el conjunto actualmente disponible. Cache Storage mostró los recursos críticos en `iguazu-assist-v21`.

No existió una publicación N+1 ni un conjunto anterior y nuevo simultáneo que permitiera demostrar la ausencia de mezcla entre generaciones durante una actualización. Por esa razón el resultado se limita a PASS ESTÁTICO y no a PASS E2E de actualización.

## 17. U8 — Assets nuevos

**Resultado: NO VERIFICABLE**

No existió una publicación real con assets nuevos durante esta ejecución. Los assets actuales cargaron desde la aplicación y estaban presentes en el cache observado, pero no fue posible comparar un asset de una generación nueva con una generación anterior.

## 18. U9 — Cache antigua

**Resultado: PASS ESTÁTICO**

Cache Storage mostró `iguazu-assist-v21` y no mostró `iguazu-assist-v20`. Sin embargo, no se ejecutó durante esta sesión una activación real de una nueva versión que produjera la eliminación observable de v20. Por ello se clasifica como PASS ESTÁTICO, no como PASS E2E de transición.

## 19. U10 — Error de red

**Resultado: NO VERIFICABLE**

No se pudo activar Network Offline desde el navegador controlado. No se observó la secuencia real de navegación, fallback, uso de recursos locales y comportamiento meteorológico con red desconectada.

## 20. U11 — Instalación incompleta

**Resultado: NO VERIFICABLE**

No se pudo bloquear de forma controlada un recurso crítico durante una instalación real del Service Worker sin modificar archivos ni configuración. La propiedad de `cache.addAll()` está documentada estáticamente en informes previos, pero no se convierte en PASS E2E.

## 21. U12 — Recuperación

**Resultado: NO VERIFICABLE**

No se pudo ejecutar la secuencia completa online → offline → fallo → online → recarga → recuperación con Network Offline controlado. No se afirma recuperación E2E.

## 22. Regresión 4G

| Área | Resultado | Evidencia |
|---|---|---|
| Generación de itinerario | PASS | En navegador controlado, `generarPlan()` produjo el itinerario `[3, 40, 25]` y el contenedor de resultado quedó visible. |
| `cambiarActividad()` | PASS | En navegador controlado, sustituyó el primer elemento: `[3, 40, 25]` pasó a `[30, 40, 25]`, conservó la longitud y no produjo duplicados. |
| Snapshot | PASS | Se alteraron temporalmente `AppState.userCoords`, `AppState.gpsActive` y `climaActual` en la consola; el snapshot conservó hora, origen y temperatura originales. Los valores vivos fueron restaurados inmediatamente. |
| Contexto temporal | PASS ESTÁTICO | El contexto generado expuso `horaReal`, `horaInicioPlan` y campos temporales; no se ejecutó el arnés temporal específico de 4G.2.4 en esta sesión. |
| Contexto climático | PASS | El badge mostró clima online y el planificador generó sin error con el estado observado. El caso offline no fue verificable. |
| GPS | PASS | El navegador no proporcionó posición GPS; la aplicación mostró el timeout y conservó el fallback de Plaza San Martín con coordenadas `{-25.5979, -54.5742}`. |
| Offline | NO VERIFICABLE | No fue posible activar Network Offline. |
| Clima fallback | NO VERIFICABLE | No fue posible ejecutar el fallo de red meteorológico en modo offline real. |
| Maps | PASS | Se observaron 55 enlaces visibles a Google Maps en el DOM después de cargar la aplicación. |

La regresión online de generación y cambio de actividad fue ejecutada en navegador real, no en Node ni en un stub externo.

## 23. Errores de consola

No se observaron errores críticos de JavaScript durante la carga online ni durante la generación/cambio de actividad.

Mensajes observados:

- log de registro del Service Worker;
- mensaje informativo de GPS no disponible por `Timeout expired`.

El timeout de GPS fue tratado como condición esperable del entorno, porque la aplicación conservó el fallback y continuó funcionando. No se clasificó como bug del producto.

## 24. Errores de red

No se ejecutó una desconexión real de red, por lo que no existe una matriz E2E de requests offline.

Durante la carga online, la aplicación se mostró funcional y el clima se representó en la interfaz. Las dependencias externas de clima, fuentes y Maps no fueron sometidas a Network Offline controlado.

## 25. Evidencias

La evidencia textual obtenida durante esta ejecución fue:

1. URL online local cargada correctamente: `http://127.0.0.1:8000/`.
2. Título observado: `Iguazú Assist — Tu Guía Inteligente en Iguazú`.
3. Service Worker activo: `http://127.0.0.1:8000/service-worker.js`.
4. Estado observado: `activated`.
5. Controlador después de recarga: `http://127.0.0.1:8000/service-worker.js`.
6. Cache observada: `iguazu-assist-v21`.
7. Entradas de cache observadas: 20.
8. Recursos críticos presentes: sí.
9. Generación online: itinerario `[3, 40, 25]`.
10. Cambio de actividad: itinerario `[30, 40, 25]`.
11. IDs únicos después del cambio: sí.
12. Enlaces Maps visibles: 55.
13. Snapshot sin cambios después de alterar temporalmente estado vivo: sí.
14. Captura de pantalla de la carga online: `/home/ubuntu/screenshots/127_0_0_1_2026-09-06_04-47-48_1233.webp`.

No se conservaron capturas de modo offline, actualización, worker waiting ni eliminación transicional del cache antiguo porque esas pruebas no pudieron ejecutarse.

## 26. Limitaciones

1. El navegador sandbox permitió navegación y ejecución de JavaScript en el contexto de la página, pero no expuso controles directos para activar DevTools `Network → Offline`.
2. No se pudo abrir y coordinar una segunda pestaña real durante una actualización del Service Worker.
3. No se pudo publicar una segunda versión real sin modificar `service-worker.js`, cambiar versiones o alterar archivos, acciones prohibidas por el alcance.
4. No se pudo bloquear un recurso crítico durante `install` mediante DevTools.
5. La validación funcional realizada fue online; no debe extrapolarse a offline.
6. La captura contiene la representación visual del navegador, pero no sustituye una captura de DevTools Application/Cache Storage.

## 27. Pruebas NO VERIFICABLES

| ID | Prueba | Resultado | Motivo |
|---|---|---|---|
| U2 | Primera apertura offline | NO VERIFICABLE | Sin control de Network Offline |
| U3 | Recarga offline | NO VERIFICABLE | Sin control de Network Offline |
| Prueba funcional offline | NO VERIFICABLE | Sin desconexión real |
| U4 | Nueva versión SW | NO VERIFICABLE | No se publicó una segunda versión |
| U5 | Pestaña abierta | NO VERIFICABLE | No se observó actualización real multi-cliente |
| U6 | Cerrar/reabrir | NO VERIFICABLE | No hubo actualización N+1 previa |
| U8 | Assets nuevos | NO VERIFICABLE | No hubo publicación con assets nuevos |
| U10 | Error de red | NO VERIFICABLE | Sin Network Offline |
| U11 | Instalación incompleta | NO VERIFICABLE | No se pudo bloquear un recurso durante install |
| U12 | Recuperación | NO VERIFICABLE | Sin secuencia offline/online controlada |
| Regresión clima fallback | NO VERIFICABLE | No se pudo simular fallo de red real |

## 28. Bugs reproducibles

No se identificó un **BUG REPRODUCIBLE** del producto en las pruebas que sí pudieron ejecutarse.

El timeout de GPS fue reproducible/observado como condición del entorno, pero no produjo una falla: la aplicación conservó el fallback de Plaza San Martín, renderizó el feed y permitió generar el itinerario.

No se clasifica como bug el hecho de que las pruebas offline, de actualización y de instalación incompleta no hayan podido ejecutarse, porque corresponde a una limitación del entorno de validación.

## 29. Riesgos residuales

- La instalación online y el cache v21 fueron observados, pero no se demostró la primera apertura ni la recarga offline.
- No existe evidencia E2E de una actualización real a una segunda versión.
- No se comprobó con navegador la coexistencia de una pestaña abierta y un worker nuevo en estado `waiting`.
- No se demostró E2E la eliminación de v20 durante una activación real; sólo se observó el estado actual sin v20.
- No se comprobó la recuperación después de una pérdida real de red.
- La coherencia observada corresponde al conjunto actual; la coherencia durante una transición de versiones permanece sin evidencia real.

## 30. Estado final de Git

El estado Git final se comparó con el estado inicial mediante `git status --short` después de las pruebas.

El único cambio nuevo permitido por esta ejecución es:

```text
?? INFORME_VALIDACION_E2E_PWA_4G.md
```

Los archivos modificados y no versionados restantes coinciden con el estado inicial preexistente. No hubo cambios en:

- Service Worker;
- HTML;
- JavaScript;
- CSS;
- datos;
- manifest;
- configuración del proyecto;
- historial Git.

El servidor HTTP temporal quedó fuera del proyecto y no alteró archivos.

## 31. Veredicto

La validación online y la regresión funcional básica del motor 4G produjeron evidencia real favorable. Se confirmó registro/activación/control posterior del Service Worker, cache v21 con 20 recursos, generación de itinerario, cambio de actividad, preservación del snapshot, fallback GPS y enlaces Maps.

Sin embargo, las pruebas críticas de primera apertura offline, recarga offline, error de red, actualización real, pestaña abierta, cierre/reapertura, instalación incompleta y recuperación no pudieron ejecutarse con las capacidades disponibles. No corresponde convertirlas en PASS por inferencia.

**VALIDACIÓN E2E APROBADA CON OBSERVACIONES**
