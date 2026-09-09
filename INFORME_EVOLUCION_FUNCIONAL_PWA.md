# INFORME DE EVOLUCIÓN FUNCIONAL — IGUAZÚ ASSIST

## 1. Objetivo

Evolucionar Iguazú Assist después de la consolidación 4G/PWA, priorizando utilidad turística inmediata sin reescribir la arquitectura existente ni crear un sistema paralelo. La intervención se concentró en que el itinerario generado sea más fácil de entender, conservar y compartir.

Se preservaron el contexto vivo, el contexto congelado del plan, el motor de selección, `cambiarActividad()`, favoritos, Maps, clima, GPS fallback y el Service Worker existente.

## 2. Estado inicial

La aplicación ya contaba con generación de itinerarios, preferencias, presupuesto, duración, categorías, contexto temporal y climático, GPS con fallback, favoritos persistentes, filtros, detalle de lugares, enlaces a Google Maps, cambio de actividad, PWA offline, datos turísticos, Tuki y planificación contextual.

La inspección breve confirmó que el render del plan ya mostraba horarios, duración, motivos humanos de recomendación, conectores de traslado, Maps y cambio de actividad. También confirmó que favoritos y compartir lugar ya existían en el detalle. Por eso no se duplicaron esas funciones.

El estado Git inicial contenía modificaciones y archivos no versionados preexistentes, incluyendo cambios en `app.js`, `data.js`, `icon.svg`, `index.html`, `planificador-inteligente.js`, `service-worker.js`, `style.css` y varios informes/assets. No se hizo reset, clean, checkout, restore ni commit.

## 3. Inspección breve

### Funcionalidades ya implementadas

El planificador ya congelaba `itinerarioContexto`, `contextoPlan`, origen, clima y hora de generación. `cambiarActividad()` trabajaba sobre el itinerario existente, evaluaba una propuesta completa, evitaba duplicados y conservaba el contexto congelado. Las tarjetas ya mostraban el horario calculado, duración, tipo de parada, clima/contexto, motivo, detalle, reemplazo y Maps.

El catálogo ya utilizaba datos existentes para descripción, horario, duración, precio, ubicación, coordenadas, categoría y enlaces. El sistema de favoritos persistía mediante `localStorage`, y el detalle ya ofrecía compartir el lugar mediante Web Share API o portapapeles.

### Incompletitudes de mayor impacto

El resultado del plan no tenía una acción explícita para compartir el itinerario completo. Además, las tarjetas del plan no exponían juntos y de forma inmediata el precio disponible, la distancia desde el origen y la ubicación; el turista tenía que entrar al detalle para reunir esa información.

### Decisión

Se eligieron dos mejoras pequeñas y de alto impacto:

1. **Compartir mi plan**, con Web Share API y fallback a portapapeles.
2. **Resumen útil por parada**, reutilizando datos existentes de precio, distancia y ubicación.

No se tocaron el Service Worker, el manifest, el modelo de datos ni la lógica de selección.

## 4. Mejoras seleccionadas

### 4.1 Compartir el plan completo

**Problema.** El usuario podía compartir un lugar individual, pero no el itinerario generado como secuencia temporal.

**Solución.** Se añadió `construirTextoPlanCompartible()` y `compartirPlan()` al módulo del planificador. El texto incluye el título, cada parada con su hora y la firma de Iguazú Assist. Se prioriza `navigator.share()` y, si no está disponible, se copia el texto mediante `navigator.clipboard.writeText()`.

**Archivos modificados.** `planificador-inteligente.js` y `style.css`.

**Impacto.** El turista puede enviar o guardar el plan sin backend, cuentas ni dependencias externas nuevas.

### 4.2 Información útil visible en cada tarjeta

**Problema.** Precio, distancia y ubicación no estaban agrupados en la tarjeta del itinerario.

**Solución.** Cada tarjeta ahora muestra, cuando los datos existen, precio o “Consultar tarifa”, distancia desde `itinerarioContexto.origenCoords` y ubicación/dirección. Los valores se obtienen del objeto turístico existente; no se inventan precios, horarios ni servicios.

**Archivos modificados.** `planificador-inteligente.js` y `style.css`.

**Impacto.** El usuario puede decidir si una parada le conviene sin abandonar el flujo del plan.

## 5. Cambios realizados

Se implementaron los siguientes cambios controlados:

- Se añadió la construcción de texto legible del itinerario.
- Se añadió compartir mediante Web Share API.
- Se añadió fallback a copiar al portapapeles.
- Se añadió el botón **“Compartir mi plan”** en el encabezado del resultado.
- Se añadieron metadatos de precio, distancia y ubicación a las tarjetas.
- Se añadieron estilos responsive para la nueva fila de compartir y los metadatos.
- Se expusieron las funciones de compartir en `window` para conectarlas con el markup existente.

No se modificaron `service-worker.js`, `manifest.json`, `data.js`, `app.js` ni `index.html`. No se modificó la cache `iguazu-assist-v21`.

## 6. Pruebas técnicas

Se ejecutaron las comprobaciones obligatorias:

```text
node --check app.js                         PASS
node --check data.js                        PASS
node --check planificador-inteligente.js   PASS
node --check service-worker.js              PASS
```

También se ejecutó `git diff --check` sobre los archivos modificados. Reportó whitespace trailing en líneas históricas de `style.css` —líneas 16, 22, 26 y 31—. El archivo ya estaba modificado antes de esta etapa y el alcance prohibía corregir whitespace histórico no relacionado. No se hizo limpieza general.

Para la prueba funcional se utilizó navegador sandbox real con un servidor HTTP temporal de Python. Debido a que la cache HTTP/Service Worker de la prueba PWA anterior ocultaba inicialmente el JavaScript nuevo, se utilizó un segundo servidor temporal en el puerto 8001 con cabecera `Cache-Control: no-store`. Esto fue una condición del entorno de prueba y no una modificación de la aplicación.

## 7. Pruebas funcionales

### A–D. Abrir, seleccionar preferencias y generar

**PASS.** La aplicación abrió en navegador real. Se accedió a la vista del planificador, se ejecutó `generarPlan()` y el resultado quedó visible con tres paradas, horarios, duración, clima y recorrido Maps.

### E–F. Cambiar una actividad y conservar el resto

**PASS.** El itinerario inicial fue `[3, 40, 25]`. Después de `cambiarActividad(0)`, pasó a `[30, 40, 25]`. El resto de la secuencia permaneció igual, se mantuvo la referencia de `itinerarioContexto.contextoPlan` y los IDs finales fueron únicos.

### G–I. Favorito, recarga y persistencia

**PASS.** Se marcó como favorito la primera opción desde el navegador. Antes del clic, `aria-pressed` era `false`; después, `true`. Tras recargar la aplicación, la misma tarjeta mostró `aria-pressed=true` y la etiqueta “Quitar … de favoritos”. Se observó la clave local `iguazu-assist-favorites`.

### J. Compartir plan

**PASS CONTROLADO EN NAVEGADOR.** La función quedó disponible y produjo este texto real:

```text
🌴 Mi plan en Iguazú
09:03 hs — Jardín de los Colibríes
10:09 hs — Mirador y Paseo Panorámico del Río Iguazú
11:18 hs — Costanera Eduardo Arrabal
Armado con Iguazú Assist
```

El navegador sandbox no ofreció una hoja nativa de Web Share para completar un envío externo; por eso se verificó la construcción del payload y la existencia del botón, no un envío a una aplicación externa.

### K. Maps

**PASS.** Las tarjetas conservaron sus enlaces individuales a Google Maps y el resultado conservó el botón de recorrido completo.

### L. Versión móvil

**PASS OBSERVADO.** La aplicación se abrió en el viewport móvil del navegador sandbox y mantuvo la navegación inferior, las tarjetas, el scroll vertical y los botones de acción. No se realizó una matriz completa de dispositivos físicos.

## 8. Regresión

| Área | Resultado | Evidencia |
|---|---|---|
| Generación | PASS | `generarPlan()` produjo un itinerario visible con tres paradas. |
| Cambio de actividad | PASS | Sustituyó una parada y conservó las restantes. |
| Contexto congelado | PASS | La referencia de `itinerarioContexto.contextoPlan` se conservó durante el cambio. |
| Clima | PASS OBSERVADO | El plan mostró clima online y no se bloqueó. |
| GPS fallback | PASS OBSERVADO | La consola registró timeout; la aplicación continuó usando el fallback. |
| Favoritos | PASS | Marcado y persistencia después de recarga comprobados en navegador. |
| Filtros | PASS OBSERVADO | Los filtros existentes siguieron presentes y operativos en la interfaz cargada. |
| Detalle | PASS OBSERVADO | Los botones “Ver detalle” siguieron presentes en tarjetas. |
| Maps | PASS | Enlaces individuales y recorrido completo presentes. |
| Navegación | PASS OBSERVADO | Inicio, planificador, navegación inferior y regreso permanecieron disponibles. |
| PWA | PASS OBSERVADO | No se modificó el Service Worker ni el manifest; la carga se ejecutó bajo HTTP y el SW se registró. |

No se observó una regresión introducida por los cambios de esta etapa.

## 9. Problemas encontrados

No se identificó un bug reproducible del producto.

Durante la primera prueba, el navegador cargó una copia anterior de `planificador-inteligente.js` desde la caché PWA/HTTP y no expuso las nuevas funciones. Esto se comprobó consultando el archivo servido con `fetch()` y se resolvió usando un servidor temporal `no-store` en otro puerto. No se modificó el Service Worker ni se alteró la aplicación para ocultar el problema.

El `diff --check` reportó whitespace trailing histórico en `style.css`. No se corrigió porque ya existía fuera del alcance funcional y la instrucción pedía distinguirlo de cambios nuevos.

## 10. Problemas no verificables

- No se completó un envío real mediante la hoja nativa de Web Share, porque el navegador sandbox no ofrece un destinatario externo; se verificó el payload y el fallback disponible.
- No se ejecutó una matriz de dispositivos físicos reales; la prueba móvil se realizó en viewport móvil del navegador.
- No se sometió la nueva interfaz a una prueba offline independiente en esta etapa; se preservó el Service Worker existente y no se tocó su cache.
- No se verificó una navegación externa efectiva a Google Maps, porque ello depende del servicio externo; sí se verificaron los href generados.

## 11. Estado Git

El estado Git final conserva todos los cambios y archivos preexistentes observados al inicio. Los cambios funcionales de esta etapa son:

```text
M  planificador-inteligente.js
M  style.css
?? INFORME_EVOLUCION_FUNCIONAL_PWA.md
```

Las demás entradas de `git status --short` corresponden al estado preexistente de la tarea anterior y no fueron revertidas. No se hizo commit.

No hubo cambios en:

- `service-worker.js`;
- `manifest.json`;
- `data.js`;
- `app.js`;
- `index.html`;
- historial Git;
- cache persistente del proyecto.

## 12. Riesgos residuales

- La acción de compartir depende de que el navegador soporte Web Share o portapapeles; en un navegador sin ambos mecanismos sólo se muestra una indicación al usuario.
- La distancia se muestra sólo cuando existen coordenadas válidas; en otro caso se deriva al detalle para consultar ubicación.
- Los precios se muestran desde los datos existentes y pueden indicar “Consultar tarifa”; no se agregaron precios no verificados.
- La prueba de compartir no incluyó el envío a una aplicación externa.
- La prueba móvil fue de viewport, no de una flota de dispositivos físicos.
- La cache PWA v21 no fue versionada porque esta mejora no requería cambiar el Service Worker bajo las reglas de esta etapa.

## 13. Próximas oportunidades

Las siguientes mejoras pueden evaluarse en una etapa posterior, sin incorporarlas ahora:

1. Añadir una vista compacta de resumen diario con agrupación visual por mañana, tarde y noche.
2. Incorporar una acción de compartir también en la navegación de “Mis Planes” cuando exista persistencia de itinerarios.
3. Añadir pruebas automatizadas de interfaz para favorito, cambio de actividad y fallback de compartir.
4. Validar la experiencia en dispositivos físicos y con lectores de pantalla.
5. Ejecutar una actualización PWA real sólo cuando exista una nueva versión funcional que justifique cambiar la cache.

## 14. Veredicto

Las mejoras implementadas son pequeñas, compatibles con la arquitectura existente y aumentan la utilidad directa del plan turístico. La generación, el cambio de actividad, los favoritos, Maps y el contexto existente conservaron su comportamiento en las pruebas realizadas. El compartir plan quedó implementado con fallback, aunque el envío nativo externo no pudo verificarse en el navegador sandbox.

**IMPLEMENTACIÓN APROBADA CON OBSERVACIONES**


## 15. Ajuste de catálogo nocturno — Lablón y Casino Iguazú

La inspección confirmó que **Lablón** ya existía en `data.js` como `Leblon Disco & Lounge`, con categoría `noche`, horario nocturno estructurado, ubicación, dirección, coordenadas, datos de precio, `planificable: true` y compatibilidad con el detalle, favoritos, Maps y `cambiarActividad()`. Se corrigió únicamente su nombre visible a **“Lablón Disco & Lounge”**; no se duplicó el registro ni se alteró el algoritmo 4G.

**Casino Iguazú** no existía en el catálogo. Se incorporó un único registro con ID propio, categoría `noche`, intereses nocturnos, horario estructurado de 10:00 a 04:00 con aviso de confirmación de variaciones, ubicación y dirección verificables, descripción, teléfono, sitio web, tarifa no inventada, `planificable: true`, tipo horario `nocturno` y datos de operación compatibles con el esquema existente. No se agregaron coordenadas no verificadas; Google Maps utiliza la dirección del registro.

Las pruebas en navegador real verificaron que ambos registros tienen categoría `noche`, `tipoHorario: "nocturno"`, son viables a las 23:00 y pasan `esCandidatoValido()` con interés nocturno, presupuesto medio y compañía individual. Se generó un plan nocturno visible que incluyó **Lablón Disco & Lounge** y **Casino Iguazú**, manteniendo IDs únicos. También se ejecutó `cambiarActividad()` partiendo alternativamente de cada uno: Lablón fue reemplazado por Casino y Casino por Lablón, conservando la longitud del itinerario y sin duplicados.

Las comprobaciones técnicas ejecutadas fueron `node --check data.js` y `node --check planificador-inteligente.js`, ambas con resultado **PASS**. No se modificaron `service-worker.js` ni `manifest.json`.
