# Informe de evolución — Acciones rápidas

## Objetivo

Se incorporó una capa compacta de **⚡ Acciones rápidas** en las recomendaciones de “¿Qué hago ahora?” y en la tarjeta de “Sorpréndeme”. La capa permite acceder a capacidades existentes sin crear nuevos sistemas de navegación, favoritos, planes, reservas o mapas.

## Arquitectura y funciones reutilizadas

Las acciones reutilizan `mostrarDetalle()`, el patrón existente de enlaces a Google Maps, `alternarFavorito()`, `esLugarFavorito()` y `obtenerEstadoOperativoLugar()`. Los datos de contacto, sitio oficial, precio, horario y operación se leen únicamente del catálogo y del contexto ya disponible.

La acción **Agregar al plan** no modifica el itinerario: valida que la experiencia sea planificable, evita duplicados y, si no existe un itinerario activo, informa que primero debe generarse un plan. Cuando existe un plan, informa que la incorporación debe realizarse desde el flujo del planificador para evitar una mutación no confirmada. No se ejecuta `generarPlan()` ni se crea un plan silenciosamente.

## Comportamiento implementado

Las tarjetas muestran, cuando corresponda:

- **📍 Cómo llegar**, mediante Google Maps existente;
- **ℹ️ Ver detalle**, mediante la vista existente;
- **📅 Agregar al plan**, con validación segura y respuesta honesta;
- **♡/♥ Favorito**, mediante el almacenamiento existente;
- **📞 Contactar**, sólo con teléfono o WhatsApp real del catálogo;
- **🌐 Sitio oficial**, sólo con una URL HTTP/HTTPS existente;
- **🎟️ Consultar / reservar**, sólo cuando el estado operativo requiere reserva o coordinación.

No se presentan coordenadas, teléfonos, URLs, disponibilidad ni reservas inventadas. Las acciones de Maps y detalle permanecen disponibles aunque no haya GPS, porque utilizan nombre y dirección como ya hacía la aplicación.

## Archivos modificados

| Archivo | Cambio |
| --- | --- |
| `planificador-inteligente.js` | Helpers de acciones rápidas e integración en tarjetas de “¿Qué hago ahora?” y “Sorpréndeme”. |
| `style.css` | Chips mobile-first para la zona de acciones rápidas. |
| `INFORME_EVOLUCION_ACCIONES_RAPIDAS.md` | Documentación de implementación y pruebas. |

No se modificaron `app.js`, `data.js`, `service-worker.js` ni `manifest.json`.

## Validaciones

| Prueba | Resultado | Observación |
| --- | --- | --- |
| `node --check app.js` | PASS | Sintaxis válida; archivo no modificado. |
| `node --check data.js` | PASS | Sintaxis válida; catálogo no modificado. |
| `node --check planificador-inteligente.js` | PASS | Sintaxis válida. |
| `node --check service-worker.js` | PASS | Sintaxis válida; archivo no modificado. |
| Maps y detalle | PASS por inspección | Se reutilizan los enlaces y funciones existentes. |
| Favoritos | PASS por inspección | Usa `alternarFavorito()` y `esLugarFavorito()`; no crea almacenamiento paralelo. |
| Agregar al plan sin itinerario | PASS por inspección | No crea plan; informa que primero debe generarse uno. |
| Duplicados y planificabilidad | PASS por inspección | Se valida antes de informar la acción. |
| Contacto y sitio oficial | PASS por inspección | Sólo se renderizan con datos utilizables existentes. |
| Reserva/coordinación | PASS por inspección | Se basa en `obtenerEstadoOperativoLugar()` y no afirma disponibilidad confirmada. |
| Sorpréndeme | PASS por inspección | Se agregan acciones sin modificar selección, diversidad, memoria, scoring o contexto. |
| Pruebas interactivas de navegador | NO VERIFICABLE | No hubo una sesión de navegador operable para pulsar las acciones y comprobar persistencia visual. |

## Limitaciones

La incorporación directa a un itinerario activo no está expuesta por una función segura existente en la arquitectura actual. Para evitar una mutación peligrosa, la acción no modifica planes y deriva al flujo normal del planificador. La validación interactiva de clics, favoritos persistentes, teléfono, URLs y Maps queda pendiente de una sesión de navegador operable.

## Veredicto

**IMPLEMENTACIÓN APROBADA CON OBSERVACIONES.**

Las acciones rápidas quedaron integradas como una capa de acceso a capacidades existentes, respetando datos reales, estado operativo y los módulos cerrados del proyecto.

