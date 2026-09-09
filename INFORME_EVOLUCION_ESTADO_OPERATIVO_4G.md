# Evolución 4G — Estado operativo y confianza de datos

## Veredicto ejecutivo

Se incorporó una única capa central para distinguir entre experiencias **disponibles**, **condicionales**, **cerradas** y de disponibilidad **desconocida**. La capa reutiliza el catálogo y las funciones horarias existentes, no inventa datos y se integra con el flujo actual de Planificador 4G, ¿Qué hago ahora? y Sorpréndeme.

La experiencia cerrada deja de ser candidata válida. Una experiencia condicional puede recomendarse, pero se identifica como tal. Una experiencia desconocida no se presenta como abierta; se muestra como disponibilidad no confirmada.

## 1. Arquitectura utilizada

La implementación se realizó prioritariamente en `planificador-inteligente.js`. Se reutilizan `detectarOperacionLugar()`, `estaAbiertoEnHorario()`, `evaluarMadrugadaNocturna()`, `esCandidatoValido()` y `calcularPuntaje()`.

No se creó un segundo catálogo, un segundo sistema horario, un scraper, una API falsa ni una fuente externa de disponibilidad. La nueva capa lee únicamente los datos que ya existen en cada lugar y el contexto 4G actual.

## 2. Función central

La función central implementada es:

```js
obtenerEstadoOperativoLugar(lugar, contexto)
```

Devuelve una estructura con:

| Campo | Significado |
| --- | --- |
| `estado` | `disponible`, `condicional`, `cerrado` o `desconocido`. |
| `abierto` | `true`, `false` o `null` según el resultado horario. |
| `confianza` | `alta`, `media` o `baja`, basada sólo en la calidad de los datos existentes. |
| `requiereReserva` | Indica una reserva requerida o pendiente en la operación del catálogo. |
| `requiereCoordinacion` | Indica una coordinación requerida o pendiente. |
| `motivo` | Explicación trazable para lógica y UI. |
| `fuenteDato` | Indica si se usó horario estructurado o datos operativos del catálogo. |
| `actualizado` | Usa el valor existente en el catálogo, o `null` cuando no existe. |

La función queda expuesta como `window.obtenerEstadoOperativoLugar()` para permitir pruebas y reutilización.

## 3. Reglas de estado

Una experiencia es **disponible** cuando posee un horario estructurado, `estaAbiertoEnHorario()` confirma que está abierta y no existe una condición operativa pendiente.

Una experiencia es **cerrada** cuando el horario estructurado determina que está cerrada o el catálogo marca explícitamente `disponibilidad: "no_disponible"`.

Una experiencia es **condicional** cuando requiere reserva o coordinación. La condición no se convierte en disponibilidad inmediata aunque el horario indique que el lugar está abierto.

Una experiencia es **desconocida** cuando no hay horario estructurado suficiente y tampoco existe información operativa que permita afirmar apertura o cierre. Desconocida no significa cerrada.

## 4. Reglas de confianza

La confianza es deliberadamente sencilla. Es **alta** cuando el horario estructurado confirma apertura o cierre en el contexto actual. Es **media** cuando existe una condición operativa explícita o un estado de catálogo que no permite afirmar disponibilidad inmediata. Es **baja** cuando la información estructurada no alcanza para determinar apertura.

El campo `actualizado` no se inventa. Si no existe una fecha de actualización en los datos del lugar, devuelve `null`.

## 5. Integración con 4G

`evaluarViabilidadLugar()` utiliza ahora la capa central. Mantiene la regla de que los lugares no planificables no son viables y descarta los estados `cerrado`. Permite que estados `condicional` y `desconocido` continúen en funciones generales si superan el resto de las reglas contextuales.

El scoring 4G no fue reemplazado ni se modificaron arbitrariamente sus pesos. La prioridad operativa queda aplicada antes de compatibilidad temporal, clima, preferencias, compañía, presupuesto, distancia y diversidad.

La compatibilidad climática, temporal, presupuestaria, de compañía, GPS, itinerario actual y plan recuperado continúa delegada a las funciones existentes.

## 6. Integración con ¿Qué hago ahora?

Las recomendaciones existentes consultan `obtenerEstadoOperativoLugar()` y muestran una indicación breve en lenguaje natural:

| Estado | Presentación |
| --- | --- |
| Disponible | `🟢 Disponible ahora` |
| Condicional | `🟡 Requiere reserva/coordinación` |
| Desconocido | `⚪ Disponibilidad no confirmada` |
| Cerrado | No entra en candidatos válidos. |

Los motivos de la tarjeta también reflejan apertura confirmada, condición pendiente o incertidumbre. No se muestra lenguaje técnico de confianza al usuario.

## 7. Integración con Sorpréndeme

Sorpréndeme conserva la memoria de las últimas tres experiencias, la memoria de tipos, la diversidad por grupos, el scoring 4G, el contexto de clima, GPS, intereses, compañía y presupuesto, la exclusión del itinerario y la exclusión del detalle abierto.

La nueva capa reemplaza la interpretación binaria anterior. Una sorpresa disponible se muestra como `🟢 Disponible ahora`. Una sorpresa condicional se muestra como `🟡 Requiere reserva/coordinación`. Una sorpresa desconocida se muestra como `⚪ Disponibilidad no confirmada`.

Una experiencia cerrada no entra como candidata. La explicación de Tuki sólo afirma “está abierto ahora” cuando el estado central es `disponible`. Para estados condicionales o desconocidos utiliza el motivo correspondiente.

## 8. Archivos modificados

| Archivo | Cambio |
| --- | --- |
| `planificador-inteligente.js` | Capa central de estado operativo, integración con viabilidad, Sorpréndeme y ¿Qué hago ahora? |
| `INFORME_EVOLUCION_ESTADO_OPERATIVO_4G.md` | Informe técnico de esta evolución. |

No se modificaron `data.js`, `app.js`, `index.html`, `style.css`, `service-worker.js` ni `manifest.json`.

## 9. Validaciones realizadas

| Validación | Resultado |
| --- | --- |
| `node --check app.js` | PASS |
| `node --check data.js` | PASS |
| `node --check planificador-inteligente.js` | PASS |
| `node --check service-worker.js` | PASS |
| Integridad del archivo principal | PASS |
| Integridad del informe | PASS |
| Prueba interactiva de Planificador | Pendiente de navegador disponible |
| Prueba interactiva de ¿Qué hago ahora? | Pendiente de navegador disponible |
| Prueba interactiva de Sorpréndeme | Pendiente de navegador disponible |
| Prueba de cinco clics de diversidad | Pendiente de navegador disponible |
| Prueba de experiencia abierta, cerrada, condicional y desconocida | Pendiente de navegador disponible |

## 10. Limitaciones

El navegador de pruebas no estuvo disponible durante esta etapa por el ciclo de crash informado en la etapa anterior. Por eso no se afirma que la matriz funcional interactiva haya sido completada. La validación realizada en esta etapa es de sintaxis, integridad y revisión del flujo de integración.

La capa no puede inferir disponibilidad real si el catálogo no contiene horario estructurado o una condición operativa suficiente. En esos casos comunica incertidumbre. Tampoco inventa actualización, reservas, teléfonos, precios o estados en tiempo real.

## 11. Veredicto final

**IMPLEMENTACIÓN COMPLETADA CON VALIDACIÓN INTERACTIVA PENDIENTE.**

IGUAZÚ ASSIST ahora separa la afirmación “sé que está abierto” de “sé que está cerrado”, “requiere una condición” y “no tengo datos suficientes para afirmarlo”. La evolución fortalece el motor 4G sin rehacerlo y mantiene la selección contextual y la diversidad de Sorpréndeme.

## Referencias

[1]: https://open-meteo.com/ "Open-Meteo — fuente meteorológica integrada por la aplicación"
