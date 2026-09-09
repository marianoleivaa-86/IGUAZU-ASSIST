# Informe final de auditoría — IGUAZÚ ASSIST

**Proyecto intervenido:** `C:\Iguazú-Ahora`  
**Fecha:** 2 de septiembre de 2026  
**Objetivo:** dejar la aplicación lista para pruebas reales sin rehacerla ni modificar su diseño general.

## 1. Catálogo exacto

El catálogo actual contiene **52 registros**. Los IDs son únicos y deliberadamente no consecutivos:

```text
1, 2, 3, 4, 25, 30, 34, 24, 6, 26, 7, 27, 28, 8, 31, 9,
29, 10, 32, 39, 11, 12, 13, 37, 14, 15, 16, 35, 36, 38,
17, 18, 19, 20, 21, 22, 23, 40, 41, 42, 43, 44, 45, 46, 47,
48, 49, 50, 51, 54, 53, 55
```

La distribución por categoría base es la siguiente. **Compras** se recupera además mediante intereses y etiquetas, por lo que no depende exclusivamente de la categoría base `actividades`.

| Categoría base | Registros |
|---|---:|
| actividades | 24 |
| alojamiento | 3 |
| comida | 7 |
| movilidad | 3 |
| naturaleza | 9 |
| noche | 6 |
| **Total** | **52** |

La auditoría no encontró nombres duplicados, IDs duplicados, campos obligatorios incompletos ni candidatos de San Ignacio, Apóstoles, Posadas, Oberá o Wanda. El catálogo permanece enfocado en Puerto Iguazú, Parque Nacional Iguazú, Área Cataratas, Costanera, Hito Tres Fronteras, Selva Iryapú, cultura local, gastronomía, compras, aventura, naturaleza y vida nocturna.

## 2. Control de eliminaciones y altas

Se confirmó que no existen referencias activas a los tres registros retirados: **Salto del Turista**, **Paseo Ecológico en Balsas (Parque Nacional)** y **Hotel Costanera Pleno Centro**. También se confirmó la presencia de los dos registros agregados: **Experiencia Cultura Guaraní de Tupã Lodge** y **Pesca y Punto Iguazú**.

Las fichas comunitarias no fueron eliminadas del catálogo: siguen disponibles para consulta, detalle y ubicación aproximada cuando corresponde, pero no se ofrecen como paradas automáticas.

## 3. Correcciones de datos

Las cinco comunidades mbya auditadas —Yasy Porá, Yryapú, Fortín Mbororé, Miri Marangatu e Ita Poty Miri— permanecen con `planificable: false`, coordenadas `null` y sin rangos horarios fijos. Sus textos indican coordinación, autorización, reserva previa o consulta de disponibilidad. La misma política se aplica a Tupã Lodge y Pesca y Punto.

También se corrigieron **Iglesia Santa María del Iguazú**, **Traslados al Aeropuerto** y **Dirección Municipal de Patrimonio Histórico**: cuando el texto de la ficha indica consultar agenda, turnos o disponibilidad, ya no se presentan rangos horarios rígidos. Pesca y Punto conserva únicamente la referencia publicada por el portal municipal y muestra la tarifa y el horario como datos a confirmar.

El auditor de entradas del planificador encontró **37 lugares planificables** y ningún caso con duración, rango horario o número inválido. Las fichas no planificables pueden tener duración desconocida sin romper el sistema.

## 4. Cambios en `planificador-inteligente.js`

El planificador valida intereses, compañía, presupuesto, tiempo disponible, momento del día, clima, lluvia, tormenta, horario de apertura por bloque, duración y traslados. Excluye explícitamente las categorías `movilidad` y `alojamiento`, además de cualquier registro con `planificable: false`.

Las defensas numéricas convierten valores inciertos mediante fallbacks finitos y evitan `NaN`, `undefined`, `Infinity`, divisiones inválidas y duraciones no positivas. Un registro con `duracionHoras: null` o `rangoHorario: null` se trata como dato desconocido de forma segura y no rompe el cálculo.

Con lluvia o tormenta se descartan experiencias declaradas al aire libre. Con buen clima se priorizan opciones exteriores. El motor verifica la permanencia completa dentro del horario cargado y evita lugares cerrados, repetidos, incompatibles con el momento o fuera del presupuesto seleccionado.

## 5. Cambios en `app.js`

Las tarjetas y fichas muestran, cuando existe el dato, nombre, descripción, duración, momento recomendado, costo, condición exterior/techada, horario y coordinación. Si el dato no es verificable, se muestra **Consultar disponibilidad**, **Consultar tarifa** o **Requiere coordinación**.

La configuración de categorías ahora incluye una entrada específica para **Compras**, con título y descripción propios. La búsqueda semántica de Compras incluye lugares con intereses o etiquetas de compras aunque su categoría base sea `actividades`.

## 6. Identidad y branding

No se encontraron apariciones de **IGUAZÚ ASISTIR**, **IGUAZU ASISTIR** ni variantes equivalentes en los archivos visibles auditados. El banner mantiene su diseño, tipografía, tamaño, posición, colores, imágenes, animaciones, sonidos y Tuki; únicamente se conserva el nombre correcto **IGUAZÚ ASSIST / Iguazú Assist**. El manifest, el título, los metadatos y la versión visible usan la identidad correcta.

## 7. Clima y fallback

La integración con Open-Meteo continúa activa con caché y fallback offline. La matriz comprobó clima seco, lluvia y tormenta. La tormenta fuerte devolvió cero paradas de naturaleza en el escenario restrictivo, sin lanzar errores ni recomendar exteriores incompatibles. Cuando no hay conexión, el planificador conserva el contexto de fallback existente.

## 8. “Sorpréndeme”

“Sorpréndeme” respeta clima, momento, horarios cargados, presupuesto contextual, `planificable: false` y categorías excluidas. No selecciona registros retirados, cerrados o inexistentes. Si no encuentra una propuesta responsable, muestra un mensaje explicativo en vez de inventar una alternativa.

## 9. Google Maps

Se verificaron **57 enlaces visibles** de Google Maps y todos contienen una consulta válida. Las fichas con coordenadas confiables usan coordenadas; las fichas comunitarias sin coordenadas, como Yryapú, usan búsqueda por nombre, ubicación y punto de encuentro coordinado. No se generan URLs vacías ni se intenta leer latitud o longitud de un objeto `null`.

## 10. PWA y caché

`manifest.json` conserva nombre, nombre corto, descripción, alcance, modo standalone y categorías de turismo. `service-worker.js` utiliza `iguazu-assist-v16`, precarga los archivos principales y elimina cachés antiguas durante la activación. La versión visible queda en **v3.3**. En la prueba local fue necesario limpiar una caché anterior para observar los archivos nuevos; después de hacerlo, la PWA cargó 52 opciones y la tarjeta Compras funcionó correctamente.

## 11. Pruebas ejecutadas

Se ejecutaron comprobaciones de sintaxis para `data.js`, `planificador-inteligente.js` y `app.js`, auditoría integral del catálogo, auditoría de entradas del planificador y una matriz de 13 escenarios: naturaleza con clima seco, familia con lluvia, noche con clima seco, dos horas con presupuesto económico, cuatro horas en pareja, día completo de naturaleza, cultura, aventura, lluvia fuerte, datos nulos, experiencia `planificable: false`, “Sorpréndeme” y Compras.

| Control | Resultado |
|---|---:|
| Registros | 52 |
| IDs duplicados | 0 |
| Nombres duplicados | 0 |
| Candidatos fuera del ámbito de Iguazú | 0 |
| Campos incompletos obligatorios | 0 |
| Inconsistencias de datos auditadas | 0 |
| Escenarios de matriz | 13/13 |
| Errores `NaN`, `undefined` o `Infinity` | 0 |
| IDs repetidos en itinerarios | 0 |
| Comunidades incluidas por error en itinerarios | 0 |
| Enlaces de Maps inválidos | 0 |
| Resultados de Compras | 5 |

## 12. Archivos modificados

| Archivo | Estado |
|---|---|
| `data.js` | Catálogo, fichas sensibles, horarios desconocidos, utilidades de categorías. |
| `planificador-inteligente.js` | Ya contenía la refactorización contextual validada; se verificó con la matriz completa. |
| `app.js` | Metadatos de tarjetas/fichas y configuración específica de Compras. |
| `index.html` | Tarjeta Compras y versión visible v3.3; sin cambios cosméticos generales. |
| `service-worker.js` | Caché v16 para cargar recursos nuevos. |

No se instalaron dependencias, no se rehizo la aplicación y no se modificaron CSS, imágenes, logo, animaciones ni sonidos.

## 13. Problemas restantes

No quedan problemas bloqueantes detectados por esta auditoría. La disponibilidad de comercios, eventos, tarifas, horarios de vuelos, reservas y experiencias comunitarias sigue siendo dinámica; por eso la app mantiene mensajes de consulta y coordinación en las fichas correspondientes. Ese comportamiento es intencional y debe conservarse durante las pruebas reales.

## Resumen solicitado

```text
CATÁLOGO: OK
PLANIFICADOR: OK
CLIMA: OK
SORPRÉNDEME: OK
MAPAS: OK
PWA: OK
NOMBRE "IGUAZÚ ASSIST": OK
ERRORES NaN/undefined: NO
DUPLICADOS: NO
LUGARES FUERA DE IGUAZÚ: NO
REFERENCIAS ROTAS: NO
```

## Referencias

[1]: https://misiones.tur.ar/iguazu/ "Ministerio de Turismo de Misiones — Iguazú"
[2]: https://visitiguazu.travel/atractivos/ "Ente Municipal de Turismo — Atractivos de Puerto Iguazú"
[3]: https://visitiguazu.travel/atractivos/salto-mbocay-2/ "Visit Iguazú — Salto Mbocay"
[4]: https://visitiguazu.travel/atractivos/natural/pesca-y-punto-iguazu/ "Visit Iguazú — Pesca y Punto Iguazú"
[5]: https://visitiguazu.travel/atractivos/cultural/experiencia-cultura-guarani-un-encuentro-con-las-raices-de-misiones/ "Visit Iguazú — Experiencia Cultura Guaraní"
[6]: https://misiones.tur.ar/huella-guarani/ "Misiones Turismo — Huella Guaraní"
[7]: https://open-meteo.com/en/docs "Open-Meteo — Weather API documentation"
