# INFORME DE IMPLEMENTACIÓN — CONTINUIDAD PWA

## 1. Objetivo

Reducir el riesgo de que una actualización de Iguazú Assist combine generaciones incompatibles de HTML, JavaScript, CSS, datos y assets, preservando el funcionamiento offline y los contratos 4G ya aprobados. La implementación se limitó al mecanismo del Service Worker.

## 2. Problema detectado

La auditoría previa identificó estrategias distintas: Network First para HTML, JavaScript y JSON, y Cache First con actualización individual para CSS e imágenes. Con un cache versionado manualmente y sin coordinación de clientes, una publicación podía dejar HTML, código y assets de generaciones diferentes. El riesgo es demostrable por el lifecycle y las estrategias actuales; no se afirmó que una mezcla concreta hubiera sido observada en producción.

## 3. Arquitectura anterior

`service-worker.js` usaba `iguazu-assist-v20`, precacheaba recursos críticos, ejecutaba `skipWaiting()` en `install`, ejecutaba `clients.claim()` en `activate`, y diferenciaba el fetch entre assets estáticos y HTML/JS/JSON. Los assets podían devolverse desde caché vieja inmediatamente mientras se actualizaban en segundo plano; el resto intentaba red primero.

## 4. Riesgo de desincronización

El riesgo era real porque el cache no representaba explícitamente un conjunto inmutable por versión durante el fetch. Además, `skipWaiting()` y `clients.claim()` permitían que un worker nuevo tomara control mientras podía existir una pestaña abierta con recursos anteriores en memoria. La falta de hash o revision manifest no era por sí sola el problema principal; el problema era la entrega individual y la activación no coordinada.

## 5. Solución elegida

Se eligió la solución mínima basada sólo en `service-worker.js`:

1. Cambiar el nombre del conjunto a `iguazu-assist-v21`.
2. Mantener el precache explícito de los recursos locales críticos existentes.
3. Mantener `cache.addAll()` como operación all-or-nothing para que la instalación no se considere lista si falla el conjunto crítico.
4. Eliminar `skipWaiting()` y `clients.claim()` para permitir el lifecycle seguro normal y evitar tomar control inmediato de clientes existentes.
5. Hacer que las solicitudes locales se resuelvan primero desde el mismo cache versionado; sólo las solicitudes no precacheadas completan desde red y se guardan en ese mismo cache.
6. Conservar el fallback de navegación a `./index.html` y el fallback de cache para solicitudes locales.
7. Mantener sin cambios las dependencias externas, el motor, los datos, el CSS, el manifest y la interfaz.

## 6. Justificación de minimalidad

El cambio no requiere hash, sistema de build, manifest de revisiones, query strings ni modificaciones de `index.html`, `app.js` o la lógica de negocio. Un nombre nuevo de cache crea un conjunto separado; `addAll()` lo prepara antes de que el worker pueda activarse; y la política cache-first unificada evita que el worker activo sustituya silenciosamente recursos precacheados por una generación distinta. La activación diferida evita forzar el reemplazo de clientes existentes.

La garantía depende de que el despliegue publique el Service Worker y sus recursos críticos como un conjunto disponible. No se pretende resolver con código del worker una publicación físicamente parcial del servidor.

## 7. Archivos modificados

**Modificado por esta implementación:**

- `service-worker.js`.

**No modificados por esta implementación:**

- `index.html`.
- `app.js`.
- `data.js`.
- `planificador-inteligente.js`.
- `style.css`.
- `manifest.json`.
- Catálogo y assets.

Los demás cambios observados en Git eran preexistentes.

## 8. Cambios exactos

- `CACHE_NAME`: de `iguazu-assist-v20` a `iguazu-assist-v21`.
- Se mantuvo la lista explícita de 20 recursos críticos/locales del precache.
- `install`: se eliminó la llamada a `self.skipWaiting()`.
- `activate`: se eliminó la llamada a `self.clients.claim()` y se mantuvo la eliminación de caches con nombre diferente.
- `fetch`: se reemplazaron las dos estrategias diferenciadas por una lectura del cache `CACHE_NAME` común; la red sólo atiende misses y los guarda en ese mismo cache.
- Se mantuvo la exclusión de solicitudes externas.
- Se mantuvo el fallback de navegación a `./index.html`.

No se modificó la lógica del planificador, clima, GPS, snapshot, scoring, filtros, Maps, datos o interfaz.

## 9. Versionado del cache

El cache activo queda versionado como `iguazu-assist-v21`. El cambio de nombre hace que el navegador prepare un nuevo cache separado antes de activar el worker nuevo. La activación elimina caches con otro nombre después de la instalación exitosa del nuevo worker.

No se agregó hash ni cache busting individual porque el conjunto versionado y la lectura unificada del cache son suficientes para esta modificación mínima. El número de versión continúa siendo manual y debe cambiarse deliberadamente en futuras publicaciones.

## 10. Precache

La lista sigue siendo explícita y no incluye informes Markdown ni archivos de desarrollo. Incluye:

- `index.html`;
- `style.css`;
- `data.js`;
- `app.js`;
- `planificador-inteligente.js`;
- `manifest.json`;
- `circuitos-estado.json`;
- iconos;
- assets visuales críticos usados por la interfaz.

**Prueba ejecutada y aprobada:** un verificador temporal comprobó que los 20 recursos declarados en el precache existen físicamente.

## 11. Install

`install` abre el cache nuevo y ejecuta `cache.addAll(ARCHIVOS_CACHE)`. Si falla un recurso crítico, la promesa falla y el worker no se considera instalado correctamente. Esto evita declarar lista una versión con un conjunto crítico incompleto. No se implementó recuperación parcial.

**Prueba funcional controlada y aprobada:** el arnés temporal confirmó la creación del cache v21 y la presencia de `index.html`, `style.css` y `app.js`.

## 12. Activate

`activate` elimina caches cuyo nombre sea diferente de `iguazu-assist-v21`. Ya no fuerza `clients.claim()`. El worker nuevo espera el lifecycle normal en lugar de tomar control inmediato de una pestaña existente.

**Prueba funcional controlada y aprobada:** el arnés confirmó la eliminación de `iguazu-assist-v20` y que no se invocan `clients.claim()` ni `skipWaiting()`.

## 13. Fetch

Las solicitudes locales se procesan contra el cache versionado v21. Si existe una respuesta, se devuelve esa respuesta. Si no existe, se intenta red; una respuesta básica 200 se guarda en el mismo cache. Ante error, la navegación busca `./index.html` y otras solicitudes buscan su entrada cacheada.

Esta política evita que un recurso crítico ya precacheado sea sustituido silenciosamente por una respuesta de otra generación durante la vida del conjunto. Las solicitudes externas siguen sin ser interceptadas.

**Prueba funcional controlada y aprobada:** una solicitud precacheada de `app.js` se resolvió desde el cache sin llamada de red; una solicitud externa no fue interceptada.

## 14. Actualización

La secuencia prevista es:

```text
usuario con versión A
→ se detecta el Service Worker B
→ B instala su cache v21 mediante addAll
→ A continúa controlando clientes existentes durante el lifecycle normal
→ B se activa cuando corresponde
→ caches antiguas se eliminan en activate
→ nuevas aperturas usan el conjunto v21
```

La eliminación de `skipWaiting()` y `clients.claim()` prioriza no interrumpir una pestaña activa. No existe notificación ni reload automático; la aplicación no agrega UI ni coordinación de actualización en esta etapa.

La verificación completa de pestañas, navegador y actualización real quedó **NO VERIFICABLE** en este entorno.

## 15. Offline

El precache conserva los recursos críticos y el fallback de navegación. La estrategia unificada devuelve recursos locales desde el mismo conjunto cacheado, por lo que no degrada el diseño offline estático previo.

**PASS ESTÁTICO:** la lista del worker contiene los recursos críticos.

**PASS funcional controlado:** el arnés confirmó respuesta desde cache para un recurso precacheado.

**NO VERIFICABLE:** primera apertura offline, recarga offline y uso completo de la interfaz en navegador desconectado.

## 16. Fallback

Se conserva el fallback de navegación a `./index.html`. Para un recurso local no precacheado se devuelve su entrada del mismo cache si existe; si no existe y la red falla, no se fabrica una respuesta genérica. El fallback meteorológico de Open-Meteo permanece en `planificador-inteligente.js` sin modificaciones.

## 17. Coherencia HTML/JS/CSS/assets

El cambio reduce el riesgo de mezcla durante la vida de un conjunto porque todos los recursos locales se buscan primero en el mismo cache v21 y el worker nuevo no toma control inmediato de clientes existentes. La instalación prepara el conjunto crítico antes de la activación.

El riesgo no queda demostrable como cero en todos los escenarios: una página ya cargada puede conservar memoria de la versión anterior hasta recargar, y una publicación física incompleta del servidor puede impedir instalar B. La validación E2E U4–U12 es necesaria para demostrar el comportamiento real del navegador.

## 18. Pruebas U1–U12

| ID | Escenario | Resultado | Evidencia o limitación |
|---|---|---|---|
| U1 | Instalación online | NO VERIFICABLE | No se ejecutó navegador real con Application/Service Workers. |
| U2 | Primera apertura offline | NO VERIFICABLE | No se controló navegador con red desactivada. |
| U3 | Recarga offline | NO VERIFICABLE | No se controló navegador con red desactivada. |
| U4 | Nueva versión del Service Worker | NO VERIFICABLE | No se publicó una segunda versión en navegador real. |
| U5 | Pestaña abierta | NO VERIFICABLE | No se observaron clientes reales durante actualización. |
| U6 | Cerrar y reabrir | NO VERIFICABLE | No se ejecutó ciclo real de cierre/reapertura. |
| U7 | Coherencia HTML/JS/CSS | PASS ESTÁTICO | Cache unificado, precache explícito y lifecycle no forzado. |
| U8 | Assets nuevos | PASS ESTÁTICO | 20 recursos declarados existen y se sirven desde v21. |
| U9 | Cache antigua | PASS | Arnés controlado eliminó v20 durante activate. |
| U10 | Error de red | PASS ESTÁTICO | Fallback de navegación y cache preservados; red real no simulada en navegador. |
| U11 | Instalación incompleta | PASS ESTÁTICO | `addAll()` rechaza el conjunto si falla un recurso; no hay recuperación parcial. |
| U12 | Recuperación | NO VERIFICABLE | No se observó una actualización/recuperación real en navegador. |

El arnés funcional controlado ejecutado fue:

```text
PASS: Service Worker install/activate/fetch, precache coherente y lifecycle seguro
```

La primera ejecución del arnés falló por un stub temporal que comparaba una URL absoluta con una clave relativa; se corrigió sólo el stub y la segunda ejecución pasó. No fue un fallo del Service Worker.

## 19. Regresión 4G.1

**PASS ESTÁTICO.** Sólo se modificó `service-worker.js`; no se tocó `generarPlan()`, scoring, filtros ni duración. La prueba funcional completa de la aplicación en navegador quedó **NO VERIFICABLE**.

## 20. Regresión 4G.2.1

**PASS ESTÁTICO.** No se modificó `cambiarActividad()` ni su lógica. Sus archivos locales permanecen en precache. Interacción real offline: **NO VERIFICABLE**.

## 21. Regresión 4G.2.2

**PASS ESTÁTICO.** No se modificaron `climaActual`, `AppState.userCoords`, `itinerarioContexto`, `contextoPlan`, `contextoAhora` ni el snapshot.

## 22. Regresión 4G.2.3

**PASS ESTÁTICO.** Se preservan precache, fallback de navegación y fallback de clima; se cambia exclusivamente la entrega de recursos locales para coherencia. La validación PWA real sigue **NO VERIFICABLE**.

## 23. Regresión 4G.2.4

**PASS ESTÁTICO.** No se modificó `planificador-inteligente.js` ni el arnés `window.__iguazuTesting`. No se repitieron sus pruebas específicas.

## 24. Problemas encontrados

1. El riesgo arquitectónico de versiones mezcladas confirmado por la auditoría previa era explotable en el diseño anterior.
2. El `diff --check` global continúa reportando whitespace heredado en archivos preexistentes no relacionados; no se corrigió.
3. El primer arnés temporal del Service Worker tenía una incompatibilidad de normalización de URL en el stub; se corrigió el stub, no el producto.
4. Las pruebas E2E reales de navegador no pudieron ejecutarse en este entorno.

## 25. Problemas no corregidos por estar fuera de alcance

- Whitespace final heredado en `data.js`, `icon.svg` y `style.css`.
- Ausencia de una suite E2E formal.
- Persistencia durable de itinerarios.
- Dependencias externas de Open-Meteo, Google Fonts, Google Maps y GPS.
- Cualquier modificación de lógica de negocio o del planificador.

## 26. Limitaciones de las pruebas

No se instaló Playwright, Puppeteer ni Cypress. No se ejecutó Chrome/Edge controlado con DevTools Application, Network Offline, Cache Storage ni múltiples pestañas. Por eso U1–U6 y U12 son **NO VERIFICABLES**, y U10/U11 se validaron estáticamente o mediante lifecycle simulado en Node, no como comportamiento de navegador real.

## 27. Estado de Git

Estado inicial antes de implementar: siete archivos productivos modificados y varios informes/assets nuevos preexistentes. Después de implementar, el único archivo productivo con cambio adicional atribuible a esta tarea es `service-worker.js`; los demás cambios permanecen preexistentes.

El nuevo informe `INFORME_IMPLEMENTACION_CONTINUIDAD_PWA_4G.md` es el único archivo creado por esta tarea. No se modificaron informes históricos.

El diff específico de `service-worker.js` quedó limpio mediante `git diff --check -- service-worker.js`. El diff global continúa fallando por whitespace heredado fuera del alcance.

## 28. Riesgos residuales

- La versión del cache sigue siendo manual y debe incrementarse en cada publicación coherente.
- Una pestaña ya cargada mantiene sus scripts en memoria hasta la recarga normal.
- No existe aviso visual de una nueva versión disponible.
- La coherencia depende de publicar el conjunto crítico de recursos de forma disponible para `addAll()`.
- El comportamiento E2E de instalación, actualización y recuperación aún no tiene evidencia de navegador real.
- La eliminación amplia de caches con nombres distintos podría afectar otro uso bajo el mismo scope si existiera.

## 29. Pendientes

La siguiente etapa oficial continúa **NO DOCUMENTADA**; no se inventó `4G.2.5`. Pendientes técnicos de validación:

1. Ejecutar U1–U12 en Chromium/Edge con DevTools.
2. Probar dos publicaciones reales del Service Worker y observar clientes existentes.
3. Confirmar Cache Storage, recarga offline, cierre/reapertura y recuperación.
4. Decidir posteriormente si se requiere notificación/reload coordinado o automatización E2E.

## 30. Veredicto

# APROBADA CON OBSERVACIONES

La implementación mínima del Service Worker es sintácticamente válida, mantiene el precache crítico y el fallback, reduce el riesgo de sustituir recursos críticos por generaciones distintas y evita forzar la toma de control de clientes existentes. No se modificó la lógica del planificador ni los contratos 4G anteriores.

La aprobación queda con observaciones porque las pruebas E2E reales de navegador, offline, pestañas y actualización no fueron verificables en este entorno; el versionado sigue siendo manual; y el diff global conserva whitespace heredado no relacionado. La candidata queda implementada, pero la siguiente etapa oficial numerada permanece **NO DOCUMENTADA**.
