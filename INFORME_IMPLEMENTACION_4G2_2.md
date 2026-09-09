# INFORME DE IMPLEMENTACIÓN 4G.2.2

## 1. Veredicto

**IMPLEMENTACIÓN COMPLETADA CON OBSERVACIONES**.

La separación funcional entre estado vivo y snapshot quedó implementada en el planificador. La observación principal es que el repositorio ya contenía cambios preexistentes fuera del alcance de esta etapa y `git diff --check` global continúa detectando espacios finales en esos cambios ajenos.

## 2. Diagnóstico previo

El estado vivo estaba representado principalmente por `climaActual` y `AppState.userCoords`. `construirContextoAhora()` ya leía esos valores y construía objetos nuevos para clima y coordenadas. `generarPlan()` almacenaba el contexto en `itinerarioContexto.contextoPlan`, pero el contexto de generación conservaba referencias anidadas compartidas con `contextoAhora`, especialmente en estructuras de ubicación, preferencias y horas climáticas.

El GPS actualizaba `AppState.userCoords` mediante `aplicarUbicacionGps()` y el clima se actualizaba mediante `aplicarClimaCargado()`. No se encontró regeneración automática del itinerario desde esos callbacks. El origen ya generado se mantenía en `itinerarioContexto.origenCoords`.

## 3. Problemas encontrados

### Riesgo

El contexto de generación se construía mediante propagación superficial. Aunque el clima principal se copiaba con spread, sus elementos de `horas`, las coordenadas y estructuras anidadas podían conservar referencias mutables compartidas entre el contexto actual y el contexto usado por el itinerario.

### Bug potencial

`cambiarActividad()` filtraba usando `contextoPlan`, pero calculaba el puntaje con `itinerarioContexto` completo. Esto dejaba abierta una lectura indirecta de valores del contenedor general en vez de usar explícitamente el snapshot.

### Deuda técnica

El repositorio tiene cambios previos y no relacionados en `app.js`, `data.js`, `index.html`, `icon.svg`, `service-worker.js`, `style.css` y varios archivos de recursos. No fueron modificados por esta implementación.

### No problema

La actualización de GPS no asignaba automáticamente `itinerarioContexto.origenCoords`, y la actualización meteorológica reemplazaba `climaActual` sin asignar directamente el clima al snapshot existente. No se cambió esa lógica porque ya respetaba el contrato requerido.

## 4. Cambios realizados

### `planificador-inteligente.js`

Se agregó `crearSnapshotContextoPlan(contextoAhora, contextoPlan)`, una función mínima que crea una copia independiente del contexto de generación. La copia conserva la estructura existente y separa el objeto climático, sus elementos horarios, las coordenadas de ubicación, las preferencias y `origenCoords`.

En `generarPlan()` se crea `snapshotPlan` después de construir el contexto de generación y se guarda como `itinerarioContexto.contextoPlan`. El origen guardado en `itinerarioContexto.origenCoords` también se toma de una copia del snapshot.

En `cambiarActividad()` el cálculo de puntaje ahora recibe `contextoPlan` directamente, preservando el uso del snapshot sin capturar clima, GPS u hora viva nuevos.

No se modificaron `app.js`, `service-worker.js`, el catálogo, el scoring, los pesos temporales ni la interfaz.

## 5. Contrato live/snapshot resultante

```text
ESTADO VIVO
    ↓
AppState.userCoords
climaActual
estado GPS
estado de carga meteorológica
    ↓
puede cambiar durante la vida de la aplicación

SNAPSHOT
    ↓
itinerarioContexto.contextoPlan
itinerarioContexto.origenCoords
horaReal / horaTextoReal
horaInicioPlan / horaInicioPlanTexto
contexto climático
preferencias de generación
    ↓
permanece estable durante ese itinerario
```

Una actualización posterior de `AppState.userCoords` o `climaActual` no reescribe el snapshot. Una llamada explícita posterior a `generarPlan()` puede crear un nuevo snapshot.

## 6. Flujo de generación

```text
estado vivo actual
→ construirContextoAhora()
→ construir contexto de generación
→ crear snapshot independiente
→ generar itinerario
→ guardar contexto en itinerarioContexto
```

## 7. Flujo posterior

```text
estado vivo cambia
→ snapshot NO cambia
→ itinerario existente NO se regenera
```

## 8. Validación

| Prueba | Resultado | Evidencia |
| --- | --- | --- |
| Sintaxis | PASS | `node --check planificador-inteligente.js` terminó con código 0 y sin salida de error. |
| `git diff --check` | FAIL global / PASS no demostrado para todo el repositorio | La ejecución global detectó espacios finales en cambios preexistentes de `data.js`, `icon.svg`, `service-worker.js` y `style.css`. |
| Separación live/snapshot | PASS estático | `crearSnapshotContextoPlan()` copia clima, horas, ubicación, preferencias y origen. |
| Snapshot climático | PASS estático | `climaSnapshot` y sus elementos horarios se copian al crear el plan. |
| GPS/origen | PASS estático | `origenCoords` se guarda desde el snapshot; `aplicarUbicacionGps()` sólo actualiza `AppState.userCoords`. |
| Contexto temporal | PASS estático | `horaReal`, `horaInicioPlan` y sus textos se calculan durante la generación y no tienen escrituras desde GPS/clima. |
| `cambiarActividad()` | PASS estático | Usa `itinerarioContexto.contextoPlan` para viabilidad, secuencia y puntaje. |
| No regeneración automática | PASS estático | No se agregaron listeners ni llamadas a `generarPlan()` desde callbacks de GPS o clima. |
| Nueva generación | PASS estático | Cada llamada explícita a `generarPlan()` reconstruye contexto y snapshot. |
| Maps | PASS estático | El enlace usa `itinerarioContexto.origenCoords`. |
| Regresión 4G.1 | PASS estático parcial | No se tocaron catálogo, reglas temporales, exclusiones ni pesos; no se ejecutó una prueba integral de interfaz. |

## 9. Criterios de aceptación

- CA-01 PASS
- CA-02 PASS
- CA-03 PASS
- CA-04 PASS
- CA-05 PASS
- CA-06 PASS
- CA-07 PASS
- CA-08 PASS
- CA-09 PASS
- CA-10 PASS
- CA-11 PASS
- CA-12 PASS
- CA-13 PASS estático
- CA-14 PASS estático
- CA-15 PASS
- CA-16 PASS
- CA-17 PASS
- CA-18 PASS para los cambios realizados en esta etapa
- CA-19 PASS estático
- CA-20 PASS

## 10. Archivos modificados

### Modificado por esta implementación

- `planificador-inteligente.js`
- `INFORME_IMPLEMENTACION_4G2_2.md`

### No modificados por esta implementación

- `app.js`
- `service-worker.js`
- `data.js`
- `index.html`
- `style.css`
- `icon.svg`
- Catálogo y recursos existentes

El estado Git mostró cambios previos en varios de esos archivos; no se atribuyen a 4G.2.2.

## 11. Riesgos restantes

La validación dinámica en navegador no se ejecutó, por lo que no se afirma un PASS dinámico para GPS, clima o interacción de cambio de actividad. La copia implementada es deliberadamente limitada a datos serializables que forman parte del contexto actual; no copia funciones ni introduce módulos nuevos.

## 12. Pruebas no ejecutadas

### NO VERIFICABLE DINÁMICAMENTE

No se ejecutó una simulación reproducible en navegador para cambiar clima, GPS y reloj después de generar el itinerario. Tampoco se ejecutó una prueba integral de `cambiarActividad()` con DOM y catálogo real.

### FALLÓ

La ejecución global de `git diff --check` falló por espacios finales en cambios preexistentes de otros archivos. No se atribuye ese fallo al cambio funcional de esta etapa.

## 13. Fuera de alcance detectado

La política de actualización de GPS/clima sin regeneración automática corresponde a 4G.2.3 y no se implementó aquí. Cualquier ampliación posterior del ciclo de vida, persistencia o actualización explícita del itinerario corresponde a etapas posteriores, incluida 4G.2.4 si así lo define el plan del proyecto.

## 14. Veredicto final

**4G.2.2 APROBADA CON OBSERVACIONES**.

La propiedad central queda garantizada en el código modificado:

```text
ESTADO VIVO ≠ SNAPSHOT
GPS actual ≠ origen congelado del itinerario
climaActual ≠ snapshot climático del itinerario
hora actual ≠ hora de inicio congelada del itinerario
```

La única observación operativa es la presencia de cambios y espacios finales preexistentes en otros archivos del repositorio, además de la falta de una prueba dinámica de navegador en esta ejecución.

---

**Fin del informe.**
