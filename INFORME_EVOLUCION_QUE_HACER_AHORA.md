# Informe de evolución funcional — ¿Qué hago ahora?

## 1. Objetivo

Se implementó una función contextual llamada **“¿Qué hago ahora?”** en Iguazú Assist. La función recomienda entre cero y cinco actividades compatibles con el momento actual sin regenerar el itinerario completo ni modificar automáticamente un plan guardado.

La recomendación utiliza la hora, el horario operativo, el clima, la ubicación disponible, las preferencias del usuario, el presupuesto, el tiempo elegido y las actividades que ya integran el itinerario actual.

## 2. Inspección breve

La inspección confirmó que la aplicación ya disponía de los contratos requeridos. La hora se obtiene mediante `contextoDeAhora()` y `obtenerFechaHoraContexto()`. El clima se mantiene en `climaActual` y se carga mediante la integración existente. La ubicación se administra desde `AppState.userCoords`, con GPS y fallback existentes.

El planificador ya contiene las funciones `estaAbiertoEnHorario()`, `evaluarViabilidadLugar()`, `esCompatibleTemporalmente()`, `esCompatibleDuranteBloque()`, `esCandidatoValido()` y `calcularPuntaje()`. Estas funciones se reutilizaron para no crear un segundo motor. El renderizado reutiliza el detalle existente y enlaces de Google Maps.

También se confirmó que `itinerarioContexto`, `cambiarActividad()` y el bloque “Mis planes” ya estaban integrados. La nueva función sólo consulta el estado actual y excluye actividades que ya están en `itinerarioActual`.

## 3. Archivos modificados

| Archivo | Cambio |
| --- | --- |
| `index.html` | Se agregó el botón visible “¿Qué hago ahora?” y el contenedor de recomendaciones dentro del planificador existente. |
| `planificador-inteligente.js` | Se agregó la capa contextual que construye el contexto, filtra candidatos, reutiliza el scoring, genera motivos y renderiza hasta cinco recomendaciones. |
| `style.css` | Se agregaron estilos responsive para el botón y las tarjetas contextuales. |
| `INFORME_EVOLUCION_QUE_HACER_AHORA.md` | Se documentó la implementación, integración y validación. |

No se modificaron `service-worker.js` ni `manifest.json`. Tampoco se creó una fuente de datos paralela.

## 4. Funcionalidad implementada

El botón **“¿Qué hago ahora?”** abre la vista existente del planificador y muestra recomendaciones contextuales. La acción no llama a `generarPlan()`.

Cada recomendación muestra nombre, categoría, horario, precio o tarifa a consultar, motivo y acciones para **Ver detalle** y **Cómo llegar**. La primera tarjeta se destaca como **“Mejor opción ahora”**.

La explicación se construye a partir de factores reales. Puede indicar compatibilidad temporal, coincidencia con intereses, disponibilidad bajo techo durante lluvia, distancia GPS y compatibilidad presupuestaria.

La lista se limita a cinco resultados. Cuando no hay candidatos válidos, la interfaz informa que hay pocas opciones compatibles en lugar de inventar actividades.

## 5. Factores utilizados

| Factor | Implementación |
| --- | --- |
| Hora actual | Se obtiene mediante `contextoDeAhora()` y no se hardcodea. |
| Horario operativo | Se valida con `evaluarViabilidadLugar()` y `estaAbiertoEnHorario()`. También se respetan rangos que cruzan medianoche. |
| Clima | Se reutiliza `climaActual`. La lluvia favorece opciones interiores mediante el scoring existente. El clima desconocido no agrega penalizaciones artificiales. |
| Ubicación | Se utiliza `AppState.userCoords` cuando está disponible. Si no hay coordenadas, se omiten las distancias y la función continúa. |
| Preferencias | Se reutilizan intereses, compañía, presupuesto y duración del planificador. |
| Actividades del plan | Se excluyen las actividades presentes en `itinerarioActual`. Esto también cubre planes recuperados desde “Mis planes”. |
| Scoring | Se reutiliza `calcularPuntaje()` con una pequeña bonificación contextual por cercanía y variedad. |
| Maps | Se reutiliza el patrón existente de enlaces a Google Maps mediante búsqueda por nombre y dirección. |

## 6. Integración con 4G

La función no crea un segundo planificador. Su flujo es una consulta contextual sobre el catálogo existente.

El filtro principal llama a `esCandidatoValido()`. Esa función conserva la validación de categoría, planificabilidad, clima, intereses, horario, bloque temporal, presupuesto y compañía.

El orden se calcula mediante `calcularPuntaje()`. La nueva capa sólo agrega una bonificación pequeña por cercanía cuando existe GPS y una preferencia menor por lugares destacados. La distancia no reemplaza las validaciones de horario ni de preferencias.

No se modifica `itinerarioContexto`. La recomendación tampoco ejecuta `cambiarActividad()` ni cambia `itinerarioActual` de forma implícita.

## 7. Integración con Mis Planes

Si existe un plan actual o un plan recuperado, sus actividades se excluyen de las recomendaciones. Esta exclusión se realiza leyendo `itinerarioActual` y comparando IDs o nombres.

La función no actualiza, guarda ni elimina planes. Una recomendación contextual sólo puede abrir el detalle o Maps. Por lo tanto, no altera un snapshot persistido ni rompe el vínculo entre `AppState.currentPlanId`, `itinerarioContexto` e “Mis planes”.

La integración de “Agregar al plan” no se incorporó porque habría requerido una modificación adicional del itinerario. Se priorizaron las acciones seguras de detalle y Maps, tal como permite el alcance solicitado.

## 8. Pruebas

| Prueba | Resultado | Observaciones |
| --- | --- | --- |
| `node --check app.js` | PASS | Sintaxis válida. |
| `node --check data.js` | PASS | Sintaxis válida. |
| `node --check planificador-inteligente.js` | PASS | Sintaxis válida. |
| `node --check service-worker.js` | PASS | Sintaxis válida; el archivo no fue modificado. |
| Acceso visible desde inicio | PASS OBSERVADO | El botón apareció en la cabecera principal. |
| Apertura de “¿Qué hago ahora?” | PASS OBSERVADO | Abrió el planificador existente y mostró el bloque contextual. |
| Mañana con buen clima | PASS OBSERVADO | Con interés Naturaleza se mostraron cinco recomendaciones diurnas. |
| Tarde | PASS OBSERVADO | El filtro temporal se aplicó; con interés Noche no se mostraron actividades incompatibles. |
| Noche | PASS OBSERVADO | Con interés Noche se recomendaron Lablón y Casino cuando correspondía. |
| Madrugada | PASS OBSERVADO | Se mostraron sólo actividades con horario operativo compatible. |
| Lluvia | PASS OBSERVADO | A las 20:00 con interés Comida se mostraron Aqva Restaurant y Doña María Restaurante. |
| Sin GPS | PASS OBSERVADO | Se generaron recomendaciones sin mostrar distancias inventadas. |
| Con GPS | PASS OBSERVADO | Se calcularon distancias cuando hubo coordenadas disponibles. |
| Actividad ya incluida | PASS OBSERVADO | Lablón se excluyó cuando ya estaba en `itinerarioActual`. |
| Ver detalle | PASS OBSERVADO | Una recomendación abrió la vista de detalle existente. |
| Google Maps | PASS OBSERVADO | Las tarjetas generaron enlaces mediante el patrón existente. |
| Generación normal de itinerario | PASS OBSERVADO | Se generó un itinerario diurno de tres paradas con sus enlaces Maps. |
| `cambiarActividad()` | PASS OBSERVADO | La función permaneció disponible después de agregar el bloque. |
| Mis Planes | PASS OBSERVADO | El panel y sus controles permanecieron disponibles. |
| Consola en navegador | PASS OBSERVADO | No se observaron errores de la función nueva. |
| Service Worker mediante `file://` | NO VERIFICABLE | El navegador rechazó el registro por usar origen `null`; es una limitación del protocolo de prueba, no un cambio en el Service Worker. |

## 9. Regresión

La generación normal siguió utilizando el motor existente. `cambiarActividad()` continuó disponible y no fue reemplazada. El estado de favoritos no se modificó. El detalle y los enlaces Maps se reutilizaron. La persistencia de “Mis Planes” permaneció en sus funciones existentes.

La prueba nocturna confirmó que Lablón y Casino pueden aparecer como candidatos cuando el contexto lo permite. La función no los muestra cuando la combinación de horario, preferencias y operación no produce candidatos válidos.

## 10. Riesgos y observaciones

La cantidad de recomendaciones puede ser menor que tres cuando no existen candidatos compatibles con el horario, preferencias, clima o disponibilidad. En ese caso se muestra un mensaje de limitación y no se inventan alternativas.

El navegador de prueba se abrió mediante `file://`. Por ese motivo el registro del Service Worker produjo el error esperado para un origen `null`. No se modificó la PWA para ocultar ese comportamiento.

La acción **Agregar al plan** quedó fuera de esta primera integración. La función ofrece detalle y Maps sin mutar itinerarios ni snapshots. Esto reduce el riesgo de alterar planes guardados de forma accidental.

## 11. Corrección puntual de motivos explicativos

Se ajustó únicamente `planificador-inteligente.js` para que “¿Qué hago ahora?” no atribuya intereses que el usuario no seleccionó. El valor predeterminado `naturaleza` ya no se considera una preferencia explícita para los motivos contextuales; la frase **“❤️ Coincide con tus intereses”** sólo se emite cuando existe una selección explícita y la actividad coincide realmente con ella. También se reemplazó la etiqueta temporal ambigua **“Coincide con mañana”** por formulaciones ancladas al momento actual, como **“Buena opción para esta mañana”** o **“Adecuada para este horario”**.

La lógica restante se conservó: recomendaciones, estado operativo, clima, GPS/distancias, presupuesto, compañía, tiempo disponible, exclusión de actividades del itinerario, detalle, Maps, Sorpréndeme, generación normal, `cambiarActividad()` y Mis Planes.

### Corrección posterior: estado de preferencias explícitas

La causa adicional detectada fue que `AppState.interes` podía conservar una selección anterior y se utilizaba como indicio de una preferencia explícita actual. Además, Sorpréndeme leía directamente las opciones visualmente seleccionadas, aunque esa selección podía corresponder al valor inicial del formulario.

Se corrigió `planificador-inteligente.js` para que `interesesAhoraSeleccionadosExplicitamente` sólo se active ante una acción actual del usuario —clic, Enter o barra espaciadora sobre una opción de interés—. `obtenerInteresesAhoraExplicitos()` devuelve `[]` mientras no exista esa acción, sin consultar `AppState.interes`; después de una selección explícita devuelve únicamente la opción actualmente seleccionada. ¿Qué hago ahora? y Sorpréndeme consumen el mismo estado corregido.

| Validación | Resultado |
| --- | --- |
| `node --check planificador-inteligente.js` | PASS |
| Sin intereses explícitos | PASS por inspección: no se genera el motivo de intereses; se priorizan horario, disponibilidad, clima, distancia y presupuesto cuando están disponibles. |
| Preferencia explícita | PASS por inspección: el motivo sólo se agrega si la preferencia coincide con la actividad. |
| Contexto actual | PASS por inspección: no se usa “Coincide con mañana”; la mañana se expresa como “esta mañana”. |
| Estado heredado (`AppState.interes = "noche"`) | PASS por inspección: no participa en `obtenerInteresesAhoraExplicitos()` y el resultado permanece `[]` sin acción actual. |
| Sorpréndeme sin/con selección explícita | PASS por inspección: usa el mismo helper; no afirma coincidencia sin acción y puede afirmarla después de una selección compatible. |
| Regresión funcional | PASS por inspección: no se modificaron los flujos de recomendaciones, detalle, Maps, Sorpréndeme, generación normal, `cambiarActividad()` ni Mis Planes. |
| Prueba interactiva en navegador | NO VERIFICABLE en esta ejecución: no se contó con una sesión de navegador operable para repetir los casos A–D. |

## 12. Veredicto

**IMPLEMENTACIÓN APROBADA CON OBSERVACIONES.**

“¿Qué hago ahora?” quedó integrada como una capa contextual pequeña sobre el motor 4G existente. Utiliza hora, clima, GPS, preferencias, presupuesto, tiempo disponible y actividades ya incluidas. Respeta horarios operativos, evita duplicar actividades del plan actual y conserva la compatibilidad con itinerarios, `cambiarActividad()`, favoritos, Maps y “Mis Planes”.

## 13. Evolución funcional 4G — recomendación contextual explicable

La interfaz evolucionó sin crear un segundo planificador ni modificar el scoring. El primer candidato conserva la jerarquía visual **“⭐ Mejor opción ahora”** y ahora se presenta dentro de un bloque propio con la etiqueta **“¿Por qué esta?”**. La explicación reutiliza los motivos verificables existentes: estado operativo, horario actual, clima, distancia GPS, presupuesto y preferencias explícitas sólo cuando corresponden.

Las siguientes tres recomendaciones válidas se agrupan como **“Otras opciones ahora”**. Si existe un quinto resultado, se conserva en un bloque adicional de opciones compatibles. Se mantiene el límite de cinco resultados, la exclusión del itinerario y el filtrado central mediante `esCandidatoValido()` y `obtenerEstadoOperativoLugar()`. Las tarjetas conservan **Ver detalle** y **Cómo llegar**; no se agregó una acción que mute planes ni ejecute `generarPlan()`.

La selección de la mejor opción sigue siendo la del mayor puntaje contextual ya calculado, con los ajustes existentes de cercanía y destacado. No se modificaron la diversidad o memoria de Sorpréndeme, GPS, clima, estado operativo, Mis Planes, `cambiarActividad()` ni el motor 4G.

### Archivos modificados en esta evolución

| Archivo | Cambio |
| --- | --- |
| `planificador-inteligente.js` | Reorganización acotada del render de recomendaciones: mejor opción, explicación “¿Por qué esta?”, alternativas y opciones restantes. Se conservaron filtros, scoring, motivos y acciones existentes. |
| `style.css` | Estilos mínimos para la jerarquía visual de grupos y la etiqueta de explicación, manteniendo el diseño mobile-first existente. |
| `INFORME_EVOLUCION_QUE_HACER_AHORA.md` | Registro de la evolución, diagnóstico, implementación y validaciones. |

### Validación de esta evolución

| Prueba | Resultado | Observaciones |
| --- | --- | --- |
| `node --check app.js` | PASS | Sintaxis válida; archivo no modificado en esta evolución. |
| `node --check data.js` | PASS | Sintaxis válida; catálogo no modificado. |
| `node --check planificador-inteligente.js` | PASS | Sintaxis válida. |
| `node --check service-worker.js` | PASS | Sintaxis válida; archivo no modificado. |
| Mejor opción ahora | PASS por inspección | El candidato con mayor puntaje sigue siendo el primero y recibe el bloque destacado. |
| Explicación contextual | PASS por inspección | Se renderizan los motivos reales existentes; sin preferencias explícitas no se afirma coincidencia de intereses. |
| Otras opciones | PASS por inspección | Se muestran hasta tres alternativas válidas y se conserva un quinto resultado en “Más opciones compatibles”. |
| Estado operativo | PASS por inspección | Se conserva `obtenerEstadoOperativoLugar()` y la presentación de disponible, condicional o no confirmada. |
| GPS y clima | PASS por inspección | Se mantienen distancia sólo con coordenadas válidas y los motivos climáticos existentes. |
| Detalle y Maps | PASS por inspección | Se conservaron los botones y enlaces existentes. |
| Regresión | PASS por inspección | No se alteraron generación normal, `cambiarActividad()`, Mis Planes, Sorpréndeme, favoritos, GPS, clima ni catálogo. |
| Pruebas interactivas 1–9 | NO VERIFICABLES | No hubo una sesión de navegador operable en esta ejecución; no se inventan resultados visuales o de interacción. |

El resultado queda **APROBADO CON OBSERVACIONES**: la evolución está implementada sobre la arquitectura existente y la limitación pendiente es repetir las pruebas interactivas en un navegador operativo.

## 14. Corrección quirúrgica del registro de selección explícita

La prueba adicional confirmó que tocar una opción visual podía dejar `obtenerInteresesAhoraExplicitos()` en `[]`. La causa estaba en el listener delegado sobre `document` registrado durante la fase de burbujeo: otro manejador de la interfaz podía detener la propagación antes de que el registro explícito recibiera el evento.

Se ajustó únicamente `planificador-inteligente.js` para registrar los eventos `click` y teclado (`Enter`/`Space`) en fase de captura. Así, una interacción real sobre `.planner-option[data-interest]` activa el estado explícito antes de que otros manejadores procesen o detengan el evento. La lectura posterior de `.selected` sigue respetando el comportamiento visual y la semántica actual de selección, mientras que el valor inicial, `AppState.interes`, la apertura de funciones y el render inicial siguen sin activar preferencias explícitas.

### Validación de la corrección

| Comprobación | Resultado |
| --- | --- |
| `node --check app.js` | PASS |
| `node --check data.js` | PASS |
| `node --check planificador-inteligente.js` | PASS |
| `node --check service-worker.js` | PASS |
| Sin interacción actual | PASS por inspección: el indicador inicia en `false` y el helper devuelve `[]`. |
| Click sobre Naturaleza o Noche | PASS por inspección: captura el evento real y luego lee la opción `.selected` actual. |
| Enter/Space sobre una opción | PASS por inspección: se registra en captura y conserva el manejador de teclado existente. |
| Cambio de selección | PASS por inspección: se leen únicamente las opciones actualmente `.selected`; no se conserva una preferencia vieja. |
| ¿Qué hago ahora? / Sorpréndeme | PASS por inspección: ambos consumen el mismo helper explícito. |
| Navegador real | NO VERIFICABLE en esta ejecución: no hubo una sesión de navegador operable para ejecutar los tests interactivos. |

## Referencias

[1]: https://open-meteo.com/ "Open-Meteo — servicio de datos meteorológicos utilizado por la aplicación"
