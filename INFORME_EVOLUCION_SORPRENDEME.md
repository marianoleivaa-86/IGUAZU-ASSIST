# Informe de evolución funcional — Sorpréndeme inteligente

## Veredicto ejecutivo

**Sorpréndeme fue evolucionado sin rehacerlo desde cero ni crear un segundo motor de planificación.** La selección ahora filtra primero la validez contextual, reutiliza el scoring 4G existente, favorece una categoría diferente cuando hay alternativas suficientemente buenas y aplica azar únicamente al final.

La función continúa siendo independiente de la generación normal de itinerarios, “¿Qué hago ahora?”, “Mis Planes” y `cambiarActividad()`. No modifica el itinerario ni guarda planes automáticamente.

## 1. Objetivo

El objetivo fue convertir **🦜 Sorpréndeme** en una recomendación contextual con variedad controlada. La función debe sugerir una experiencia válida para el momento actual, evitar repeticiones inmediatas y explicar la elección con factores reales.

La evolución conserva la ficha existente con nombre, horario, disponibilidad, precio, detalle completo, Google Maps y el botón **🔄 Sorpréndeme otra vez**.

## 2. Diagnóstico del comportamiento anterior

La implementación anterior ya respetaba algunos horarios y condiciones climáticas, pero su filtro no reutilizaba de forma completa `esCandidatoValido()`. Tampoco excluía explícitamente las actividades presentes en `itinerarioActual` o en el contexto de un plan recuperado.

El orden anterior agregaba `Math.random()` al score de todos los candidatos durante el sorteo. Esto permitía que una opción menos conveniente compitiera de forma demasiado amplia con opciones mejor contextualizadas.

La repetición inmediata se controlaba únicamente mediante `ultimaSorpresaId`. No se guardaba la categoría anterior para favorecer diversidad. La ficha mostraba factores correctos, pero no una frase principal natural de Tuki separada de esos indicadores.

## 3. Cambios realizados

La selección fue reemplazada por un flujo de cinco capas:

| Capa | Comportamiento |
| --- | --- |
| Validez | Descarta categorías no planificables, lugares no planificables, lugares cerrados, reservas o coordinaciones no confirmadas y opciones incompatibles con clima, momento, bloque temporal, presupuesto o compañía. |
| Exclusión | Descarta actividades presentes en `itinerarioActual`, actividades presentes en `itinerarioContexto` y el lugar actualmente abierto en detalle. |
| Contexto | Reutiliza hora, momento, clima, GPS, preferencias, compañía, presupuesto y tiempo disponible. |
| Score | Reutiliza `calcularPuntaje()` y agrega sólo una bonificación moderada para una categoría distinta de la sorpresa anterior. |
| Sorpresa | Elige aleatoriamente únicamente entre candidatos cercanos al mejor score y, cuando existen, de una categoría diferente a la anterior. |

El azar ya no se usa para ordenar todo el catálogo válido. Se utiliza sólo después de la validación, el contexto, el score y la diversidad.

## 4. Arquitectura utilizada

La función continúa en `planificador-inteligente.js` mediante `window.generarSorpresa`. Se reutilizan las siguientes funciones existentes:

- `construirContextoAhora()`;
- `contextoDeAhora()`;
- `esCandidatoValido()`;
- `evaluarViabilidadLugar()`;
- `estaAbiertoEnHorario()` mediante la evaluación existente;
- `esCompatibleConClima()`;
- `esCompatibleTemporalmente()`;
- `esCompatibleDuranteBloque()`;
- `calcularPuntaje()`;
- `mostrarDetalle()`;
- `AppState.userCoords`;
- `itinerarioActual`;
- `itinerarioContexto`.

No se modificaron las funciones de generación normal, `cambiarActividad()`, favoritos, clima, GPS, Maps ni la persistencia de “Mis Planes”.

## 5. Lógica de selección

El contexto se construye desde las preferencias actualmente seleccionadas. Cuando no hay preferencias seleccionadas, se utiliza el interés configurado en `AppState` sin inventar una preferencia adicional.

Cuando hay GPS real, el score conserva la cercanía mediante `origenCoords`. Cuando no hay GPS, `origenCoords` se establece como `null` para Sorpréndeme y no se usa la distancia como factor. La recomendación continúa funcionando.

Cuando el clima está disponible, el filtro y el score priorizan opciones compatibles. Durante lluvia se favorecen las opciones techadas que ya están marcadas en los datos. Cuando el clima es desconocido, se mantienen horario, preferencias, presupuesto, compañía y tiempo como señales disponibles.

Las opciones que requieren reserva o coordinación previa sin confirmación son descartadas por `evaluarViabilidadLugar()`. Los horarios que cruzan medianoche continúan resolviéndose mediante el motor horario existente.

## 6. Lógica de diversidad

La diversidad se implementa con el estado mínimo necesario: `ultimaSorpresaId` y `ultimaSorpresaCategoria`. No se crea un historial infinito.

Después de obtener el score contextual, se calcula el mejor score del conjunto. Sólo se consideran candidatas buenas las opciones que se encuentran dentro de una diferencia moderada respecto de ese máximo.

Si hay candidatas buenas de una categoría distinta a la anterior, se elige dentro de ese subconjunto. Si no hay ninguna, se conserva el conjunto de candidatas buenas original. Esto evita forzar una categoría que no sea válida.

La diversidad no puede convertir una opción inválida en válida. Sólo opera después de que el motor 4G aprobó la actividad.

## 7. Manejo de “Sorpréndeme otra vez”

El botón sigue llamando a `generarSorpresa()` y no genera un itinerario. La nueva ejecución excluye la última sorpresa cuando existe otra opción válida.

Si hay candidatos alternativos, se selecciona una opción diferente. Si sólo existe un candidato válido, se muestra nuevamente y se presenta una explicación específica:

> “Tuki no encontró otra opción igual de buena ahora mismo, así que te propone esta nuevamente.”

La función no guarda automáticamente la sorpresa en “Mis Planes” y no modifica un plan guardado.

## 8. Personalidad de Tuki y separación de factores

La ficha ahora separa la explicación principal de los indicadores objetivos.

La frase principal se construye sólo con señales disponibles, por ejemplo:

- clima favorable o necesidad de resguardo;
- cercanía real;
- apertura actual;
- compatibilidad nocturna;
- coincidencia con intereses.

Debajo permanecen los factores objetivos, como **Cerca de vos**, **Abierto ahora**, **Buena opción con lluvia**, **Ideal para este clima**, **Alternativa gratuita** y compatibilidad presupuestaria.

No se genera una frase que afirme datos ausentes. Por ejemplo, sin GPS no se afirma que el lugar está cerca. Sin clima no se afirma que la actividad es ideal para el clima.

## 9. Integración con planes recuperados

La exclusión consulta tanto `itinerarioActual` como `itinerarioContexto.actividades` o `itinerarioContexto.itinerario` cuando esas estructuras están disponibles.

Al abrir un plan recuperado, las actividades existentes permanecen fuera de la selección de Sorpréndeme. La función no cambia `itinerarioActual`, no cambia `itinerarioContexto` y no altera el `currentPlanId`.

## 10. Archivos modificados

| Archivo | Modificación |
| --- | --- |
| `planificador-inteligente.js` | Se incorporó selección contextual por capas, diversidad, exclusión de itinerario y explicación natural de Tuki. Se añadió `ultimaSorpresaCategoria`. |
| `style.css` | Se agregaron estilos mínimos para el icono, título, cita de Tuki, factores, estado vacío y comportamiento responsive. |
| `INFORME_EVOLUCION_SORPRENDEME.md` | Se documentó la evolución, arquitectura, pruebas, limitaciones y veredicto. |

No se modificaron `index.html`, `app.js`, `data.js`, `service-worker.js` ni `manifest.json` en esta evolución.

## 11. Pruebas realizadas

| Prueba | Resultado | Evidencia observada |
| --- | --- | --- |
| `node --check app.js` | PASS | Sintaxis válida. |
| `node --check data.js` | PASS | Sintaxis válida. |
| `node --check planificador-inteligente.js` | PASS | Sintaxis válida. |
| `node --check service-worker.js` | PASS | Sintaxis válida. |
| Sorpréndeme de día | PASS OBSERVADO | Recomendó Costanera Eduardo Arrabal con explicación de clima, apertura e interés. |
| Sorpréndeme de noche | PASS OBSERVADO | Recomendó Lablón Disco & Lounge con señales de cercanía, apertura y compatibilidad nocturna. |
| Sorpréndeme de madrugada | PASS OBSERVADO | Recomendó Casino Iguazú, una opción nocturna válida. No devolvió lugares cerrados. |
| Lluvia | PASS OBSERVADO | Recomendó Aqva Restaurant y explicó que permite resguardarse. |
| Sin GPS | PASS OBSERVADO | Funcionó sin mostrar badge de distancia. |
| Sin clima | PASS OBSERVADO | Continuó recomendando mediante horario, preferencias y otros factores. |
| Con preferencias | PASS OBSERVADO | Naturaleza, Noche, Comida y otros intereses afectaron la selección. |
| Ficha completa | PASS OBSERVADO | La tarjeta mantuvo el botón existente para `mostrarDetalle()`. |
| Google Maps | PASS OBSERVADO | La tarjeta mantuvo el enlace de Google Maps. |
| Generación normal | PASS PREVIO | La generación normal de itinerarios continuó funcionando en la validación anterior. |
| `cambiarActividad()` | PASS PREVIO | La función continuó disponible en la validación anterior. |
| “Mis Planes” | PASS PREVIO | El panel y la persistencia continuaron disponibles en la validación anterior. |
| Repetición inmediata | IMPLEMENTADO, PRUEBA INTERACTIVA PENDIENTE | La memoria acotada conserva hasta tres IDs recientes y excluye la última opción cuando hay alternativas de calidad. |
| Plan recuperado | IMPLEMENTADO, PRUEBA INTERACTIVA PENDIENTE | El código excluye las actividades de `itinerarioActual` y `itinerarioContexto`; la prueba interactiva quedó pendiente por la indisponibilidad temporal del navegador. |

## 12. Ajuste de diversidad y trazabilidad de Tuki

La prueba real informó la secuencia **Costanera → Paseo de la Identidad → Costanera → Paseo de la Identidad → Costanera** con cinco pulsaciones consecutivas. La causa era que la implementación sólo evitaba el último ID y podía volver a elegir el primer lugar después de que quedara fuera de la exclusión inmediata.

La solución mantiene el score contextual y crea una memoria de sesión limitada a las tres recomendaciones más recientes. La selección ya no reduce primero todo el universo a `mejorPuntaje - 8`. Primero agrupa los candidatos válidos por tipo de experiencia y ordena los grupos por su mejor score contextual. Después prioriza un grupo que no figure entre los tres grupos recientes. Dentro del grupo elegido selecciona las mejores candidatas según el scoring 4G y aplica azar sólo entre opciones cercanas al mejor score de ese grupo.

La penalización de diversidad es secundaria. Una categoría diferente no puede entrar si su score queda fuera del umbral de calidad contextual. Si no existe una alternativa razonable, el algoritmo puede volver a una opción previa.

Los grupos mínimos distinguen paseo urbano, gastronomía, fauna/naturaleza, entretenimiento nocturno, aventura, compras, naturaleza, actividades y tres países. Costanera, Mirador, Paseo de la Identidad y equivalentes urbanos comparten el grupo `paseo_urbano`, por lo que la memoria no trata esos lugares como experiencias completamente distintas.

### Trazabilidad diagnóstica

Se agregó temporalmente una interfaz de testing en `window.obtenerDiagnosticoSorpresa()` y `window.configurarDiagnosticoSorpresa({ recientesTipos, recientesIds })`. Cada ejecución registra el último ID, categoría y tipo, las memorias de IDs y tipos, los grupos disponibles después de los filtros, la cantidad de candidatos por grupo, el mejor score de cada grupo, los grupos excluidos por memoria y el grupo finalmente seleccionado.

La selección aplica una condición explícita: si existe al menos un grupo cuyo tipo no está en `sorpresasRecientesTipos`, el grupo elegido proviene exclusivamente de ese conjunto. Por lo tanto, con `sorpresasRecientesTipos = ["paseo_urbano"]`, Costanera, Mirador y Paseo de la Identidad quedan fuera siempre que exista otro grupo válido. La memoria no se reinicializa dentro de `window.generarSorpresa` y no utiliza `localStorage`.

La causa que debe confirmarse con la traza de navegador es si el estado recibido contiene realmente `paseo_urbano` o si el grupo llega con otro tipo, si no hay grupos alternativos después de los filtros, o si la página está ejecutando una versión anterior del script. La traza permite distinguir esos casos antes de atribuir el problema al scoring.

También se corrigió la trazabilidad de intereses. La explicación de Tuki ya no toma el fallback de `obtenerInteresesPlan()` como una preferencia explícita. Sólo menciona que algo “coincide con lo que te interesa” cuando existe una opción seleccionada en `.planner-option.selected` y el lugar coincide con ella. Sin una selección explícita, la explicación utiliza únicamente clima, apertura, distancia, noche u otros datos comprobables.

Los cambios de este ajuste quedaron limitados a `planificador-inteligente.js`. No se modificaron `index.html`, `app.js`, `data.js`, `service-worker.js`, `manifest.json`, Mis Planes, GPS, clima, Maps ni la generación normal.

La matriz previa confirmó día, noche, madrugada, lluvia, sin GPS, sin clima, ficha completa y Maps. En este ajuste final se ejecutaron las validaciones de sintaxis y se dejó disponible la trazabilidad temporal. No se pudo ejecutar la prueba obligatoria de cinco pulsaciones ni la segunda prueba con preferencias porque el subsistema de navegador seguía deshabilitado por el ciclo de crash. Por lo tanto, este informe no declara la diversidad final como validada en navegador.

## 13. Limitaciones reales

La prueba interactiva final de repetición y plan recuperado no pudo completarse después de que el subsistema de navegador reportara un ciclo de crash y quedara deshabilitado temporalmente. La implementación fue validada por inspección del flujo y por sintaxis, pero esas dos comprobaciones deben repetirse cuando el navegador vuelva a estar disponible.

La disponibilidad real depende de los horarios y datos existentes en `data.js`. Sorpréndeme no inventa lugares, tarifas, horarios ni estados operativos.

La función conserva el comportamiento de origen `file://` de la PWA. El Service Worker puede ser rechazado por el navegador cuando la aplicación se abre con origen `null`; esto no se modificó porque el alcance prohíbe tocar `service-worker.js` sin necesidad técnica.

## 14. Veredicto final

**AJUSTE IMPLEMENTADO; DIVERSIDAD FINAL PENDIENTE DE VALIDACIÓN INTERACTIVA.**

Sorpréndeme conserva la inteligencia contextual existente. Ahora selecciona por grupos de experiencia después del scoring y favorece tipos distintos sin degradar la calidad. Tuki sólo atribuye intereses cuando existe una preferencia explícita y compatible. La validación final no puede declararse completa hasta ejecutar las cinco pulsaciones obligatorias y la prueba con preferencias en navegador real.

## Referencias

[1]: https://open-meteo.com/ "Open-Meteo — fuente meteorológica integrada por la aplicación"
