# Mejoras implementadas — Iguazú Assist v3.1

## Criterio de intervención

Se mantuvo la identidad existente de Iguazú Assist: paleta oscura selva-neón, navegación inferior, asistente Tuki, catálogo cercano, planificador e interacción basada en tarjetas. Las mejoras se concentraron en resolver fricción real sin rediseñar la aplicación desde cero.

## Hallazgos principales

El catálogo tenía una cobertura visual desigual: muchos lugares sin imagen propia terminaban usando `hero-bg.jpg`, lo que hacía que restaurantes, vida nocturna, hoteles y naturaleza se vieran iguales. La aplicación tampoco tenía una forma rápida de encontrar un lugar dentro del feed ni de conservar los lugares interesantes para una visita posterior. Finalmente, el enlace profundo del detalle podía abrir una ficha vacía porque el identificador del hash llegaba como texto y no siempre coincidía con el tipo numérico del catálogo.

## Cambios realizados

| Área | Mejora |
|---|---|
| Imágenes | Resolución inteligente de imagen por categoría e intereses, con prioridad para imágenes existentes del proyecto y respaldo seguro. |
| Imágenes | Distintivo visual de categoría sobre cada miniatura para reforzar el contexto del lugar incluso cuando se reutiliza una imagen temática. |
| Feed | Búsqueda local por nombre, descripción, categoría, ubicación, intereses y etiquetas. |
| Feed | Contador dinámico de resultados y mensaje contextual cuando una búsqueda no encuentra coincidencias. |
| Favoritos | Guardado persistente en `localStorage`, con estados `Guardar` y `Guardado` en tarjetas y detalle. |
| Favoritos | Nuevo filtro `Mis favoritos` y acceso directo desde el perfil. |
| Compartir | Botón `Compartir lugar` con Web Share API y copia al portapapeles como alternativa. |
| Enlaces | Corrección de enlaces profundos `#detail/{id}` para abrir la ficha real con sus datos completos. |
| PWA | Service worker actualizado a `iguazu-assist-v11`, incluyendo catálogo, estado de circuitos y recursos visuales en caché. |
| Accesibilidad | Estados de foco visibles, objetivos táctiles más cómodos, soporte para `prefers-reduced-motion` y mejor adaptación en móvil. |
| Mantenimiento | Versión visible actualizada a `Iguazú Assist v3.1`. |

## Archivos modificados

`index.html`, `style.css`, `app.js`, `service-worker.js` y este documento de referencia.

## Verificación realizada

La sintaxis de `app.js`, `data.js` y `planificador-inteligente.js` fue validada con Node.js. También se comprobó la existencia de los recursos visuales usados por el nuevo caché PWA.

En la interfaz local se verificó que la búsqueda `cataratas` filtra correctamente cinco opciones; que el detalle del Parque Nacional Iguazú carga imagen, descripción, contactos y mapas; que el favorito cambia de estado y persiste después de recargar; que `Mis favoritos` muestra únicamente la opción guardada; que el perfil refleja el total guardado; y que un enlace profundo abre la ficha real del lugar.

La consola no mostró errores de JavaScript durante estas pruebas. El timeout de GPS observado es el comportamiento esperado del entorno de prueba sin permiso o señal GPS; la app conserva la referencia de Plaza San Martín como respaldo.

## Próximos pasos recomendados

Para una siguiente iteración convendría incorporar fotografías propias o autorizadas para los lugares que todavía usan imágenes temáticas reutilizadas, añadir una vista de galería por lugar y conectar el estado de horarios con una fuente verificada. También sería conveniente agregar pruebas automatizadas de navegación y persistencia si el proyecto evoluciona hacia una publicación con cambios frecuentes de datos.
