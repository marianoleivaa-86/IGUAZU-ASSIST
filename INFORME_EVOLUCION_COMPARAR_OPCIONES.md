# Informe de evolución — Comparar opciones

## Objetivo

Se incorporó una capa compacta de **“⚖️ Comparar opciones”** dentro de “¿Qué hago ahora?”. La función permite revisar las recomendaciones que ya fueron calculadas y distinguir la opción con mayor conveniencia contextual, sin crear un segundo planificador ni modificar el itinerario.

## Arquitectura utilizada

El comparador consume `ultimasRecomendacionesAhora`, que se actualiza con los candidatos ya filtrados, puntuados y limitados por `generarRecomendacionesAhora()`. No ejecuta `generarPlan()`, no vuelve a calcular `calcularPuntaje()`, no altera el scoring 4G y no modifica `itinerarioActual`, Mis Planes o Sorpréndeme.

La comparación reutiliza los motivos, el estado operativo, las coordenadas, el clima y las preferencias explícitas actuales. La opción destacada es el primer candidato, que continúa siendo el de mayor puntaje contextual existente.

## Archivos modificados

| Archivo | Cambio |
| --- | --- |
| `planificador-inteligente.js` | Conservación de las recomendaciones actuales y agregado del botón, el estado de candidatos y la vista comparativa. |
| `style.css` | Estilos mobile-first para botón, encabezado, tarjetas, indicadores y opción destacada. |
| `INFORME_EVOLUCION_COMPARAR_OPCIONES.md` | Documentación de esta evolución, pruebas y limitaciones. |

No se modificaron `data.js`, `service-worker.js`, `manifest.json`, Sorpréndeme, `cambiarActividad()`, Mis Planes ni las funciones centrales del motor 4G.

## Comportamiento implementado

El botón **“⚖️ Comparar opciones”** aparece sólo cuando existen al menos dos recomendaciones visibles. La comparación muestra entre dos y cinco opciones disponibles en el resultado actual. Cada tarjeta puede incluir nombre, imagen sólo si el catálogo ya la proporciona, estado operativo, distancia, precio, compatibilidad climática, coincidencia con un interés explícito, duración, detalle y Maps.

La primera tarjeta se identifica como **“⭐ Mejor opción para vos ahora”** y explica brevemente el motivo reutilizando la explicación existente. Las otras tarjetas se presentan como alternativas. Los datos ausentes se omiten o se reemplazan por **“Consultar información disponible”**; no se inventan distancias, precios ni condiciones climáticas.

Las preferencias se obtienen mediante `obtenerPreferenciasAhora()` y `obtenerInteresesAhoraExplicitos()`. Por lo tanto, no se usa `AppState.interes` heredado como prueba de una selección actual y no se muestra coincidencia de intereses sin una selección explícita.

## Funciones reutilizadas

Se conservaron `generarRecomendacionesAhora()`, `esCandidatoValido()`, `calcularPuntaje()`, `obtenerEstadoOperativoLugar()`, `obtenerPreferenciasAhora()`, `obtenerInteresesAhoraExplicitos()`, `mostrarDetalle()` y el patrón existente de enlaces a Google Maps.

## Pruebas y resultados

| Prueba | Resultado | Observación |
| --- | --- | --- |
| `node --check app.js` | PASS | Sintaxis válida; no modificado en esta evolución. |
| `node --check data.js` | PASS | Sintaxis válida; catálogo no modificado. |
| `node --check planificador-inteligente.js` | PASS | Sintaxis válida. |
| `node --check service-worker.js` | PASS | Sintaxis válida; no modificado. |
| Botón sólo con al menos dos opciones | PASS por inspección | Se renderiza con `candidatos.length >= 2`. |
| Comparación de recomendaciones existentes | PASS por inspección | Consume `ultimasRecomendacionesAhora`; no recalcula el motor. |
| Mejor opción contextual | PASS por inspección | Usa el primer candidato ya ordenado por score contextual. |
| Estado operativo, distancia, precio y clima | PASS por inspección | Indicadores dependen únicamente de datos existentes. |
| Preferencias explícitas | PASS por inspección | Sólo muestra coincidencia cuando el helper devuelve intereses explícitos. |
| Detalle y Maps | PASS por inspección | Conserva los mecanismos existentes. |
| No mutación de itinerario, Mis Planes o Sorpréndeme | PASS por inspección | El comparador sólo renderiza y navega a acciones existentes. |
| Pruebas interactivas en navegador | NO VERIFICABLE | No hubo una sesión de navegador operable en esta ejecución. |

## Limitaciones reales

No fue posible abrir la interfaz en un navegador operativo para ejecutar los tests interactivos de selección, comparación, detalle y Maps. Por esa razón, esos casos no se declaran como PASS observado. La validación disponible es sintáctica y estática sobre los flujos implementados.

## Veredicto final

**IMPLEMENTACIÓN APROBADA CON OBSERVACIONES.**

La comparación quedó integrada como extensión natural de “¿Qué hago ahora?”, reutiliza las recomendaciones y el contexto existentes, conserva la separación con Sorpréndeme y no introduce un segundo sistema de scoring ni mutaciones de planes.

## Corrección visual de encabezados duplicados

Se corrigió exclusivamente la presentación de la interfaz. El título **“⭐ Mejor opción ahora”** queda a cargo del encabezado de su grupo y se eliminó la repetición dentro de la primera tarjeta. Al abrir la comparación, el botón de apertura se oculta y permanece un único encabezado **“⚖️ Comparar opciones”** con su subtítulo **“Elegí según lo que más te importe ahora.”**. La tarjeta **“⭐ Mejor opción para vos ahora”**, las recomendaciones, los indicadores, Detalle y Maps permanecen sin cambios funcionales.

La corrección no modifica scoring, contexto, estado operativo, GPS, clima, preferencias, itinerario, Mis Planes, Sorpréndeme ni `cambiarActividad()`.

### Validación de la corrección visual

| Comprobación | Resultado |
| --- | --- |
| `node --check app.js` | PASS |
| `node --check data.js` | PASS |
| `node --check planificador-inteligente.js` | PASS |
| `node --check service-worker.js` | PASS |
| Un solo encabezado “⭐ Mejor opción ahora” en el grupo principal | PASS por inspección estática |
| Un solo encabezado “⚖️ Comparar opciones” al abrir el comparador | PASS por inspección estática: el botón se oculta al abrir la vista |
| Tarjeta “⭐ Mejor opción para vos ahora” | PASS por inspección: se conserva |
| Cinco recomendaciones, Detalle y Maps | PASS por inspección: no se alteró el render de candidatos ni acciones |
| Comprobación visual en navegador | NO VERIFICABLE: no hubo una sesión de navegador operable |
