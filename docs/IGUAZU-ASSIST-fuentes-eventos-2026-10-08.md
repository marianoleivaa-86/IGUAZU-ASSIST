# IGUAZÚ ASSIST — Fuentes y flujo editorial de eventos

**Última comprobación:** 8 de octubre de 2026, 23:58 ART (UTC−03:00).

**Alcance:** preparación de un procedimiento manual, económico y verificable para cargar eventos de Puerto Iguazú. En esta etapa no se modificó la aplicación ni se agregó ningún evento a `eventos.json`.

## Conclusión ejecutiva

La fuente pública más útil para **descubrir** actividades es el [Calendario de Escapadas del Ministerio de Turismo de Misiones](https://misiones.tur.ar/escapadas/). Tiene una página de calendario, enlaces a organizadores y publicaciones fechadas por día. Sin embargo, mezcla localidades de toda la provincia y también incluye experiencias permanentes; no alcanza por sí solo para confirmar un evento de Puerto Iguazú.

La [Municipalidad de Puerto Iguazú / Dirección de Cultura](https://www.iguazu.gob.ar/cultura/) es la fuente institucional prioritaria para eventos municipales. La página consultada enumera tipos de eventos y ofrece contacto, pero no funciona como agenda fechada actualizada. Sus publicaciones oficiales y la confirmación directa del área de Cultura deben prevalecer.

[Iguazú Argentina](https://iguazuargentina.com/), junto con su [canal oficial de tickets](https://tickets.iguazuargentina.com/), es la fuente primaria para actividades que organiza dentro del Parque Nacional Iguazú. La disponibilidad puede ser variable y las fechas deben cotejarse en el canal de tickets u operador antes de publicarlas.

**Resultado editorial:** no hay en esta revisión un origen único con registros estructurados, licencia de republicación y confirmación suficiente para poblar automáticamente la agenda. Se recomienda mantener un snapshot manual curado en `eventos.json`, con la URL original y la fecha de verificación, sin scraping agresivo ni servicios pagos.

## Fuentes comprobadas

| Fuente | Qué publica y qué datos aporta | RSS/API y observación técnica | Cómo usarla | Limitaciones y condiciones |
|---|---|---|---|---|
| [Municipalidad — Cultura](https://www.iguazu.gob.ar/cultura/) | Describe objetivos de la Dirección de Cultura y enumera **Carnavales, Semana Santa Culturales, Julio Culturales y Aniversario de Iguazú**. La página también publica el teléfono de Cultura: `(03757) 415-358` y horarios de atención. | [RSS municipal](https://www.iguazu.gob.ar/feed/) respondió HTTP 200, `application/rss+xml`, con `lastBuildDate` del 6/10/2026. No se observó `Access-Control-Allow-Origin` en la comprobación. El [REST de tipos públicos](https://www.iguazu.gob.ar/wp-json/wp/v2/types?context=view) respondió HTTP 200 y CORS para el origen de GitHub Pages probado; expone `post` y `page`, pero no un tipo público específico `evento`. | Usar la página y las publicaciones municipales para detectar y confirmar agenda local. Si faltan sede, horario o vigencia, consultar a Cultura antes de publicar. | No es un calendario fechado en la página consultada. RSS/REST no implican autorización para republicar textos, fotos o cartelería. El contenido editorial debe abrirse y verificarse completo. |
| [Calendario de Escapadas — Turismo Misiones](https://misiones.tur.ar/escapadas/) | Se presenta como calendario de próximos eventos y acontecimientos programados de toda Misiones. Puede enlazar organizadores y páginas de actividades. La página indicaba **última actualización: 5/10/2026**. | [RSS](https://misiones.tur.ar/feed/) respondió HTTP 200, XML, con `lastBuildDate` del 8/10/2026. El [REST de publicaciones](https://misiones.tur.ar/wp-json/wp/v2/posts?per_page=1&_fields=id,date,modified,link,title) respondió HTTP 200 y CORS para el origen probado; la publicación más reciente observada fue `26 Diciembre 2026`. | Usar como detector provincial. Abrir la publicación diaria y seguir el enlace del organizador; conservar solo candidatos cuya localidad sea Puerto Iguazú y cuya fecha siga vigente. | Mezcla localidades, eventos y experiencias permanentes. La categoría o publicación provincial no demuestra por sí misma que un evento local esté confirmado. Se observaron enlaces editoriales que deben revisarse manualmente. No se encontró licencia general de republicación. |
| [Iguazú Argentina — Eventos Culturales](https://iguazuargentina.com/experiencias/eventos-culturales/) | Describe una experiencia de arte, música y comunidad en el Parque Nacional que ocurre **algunos fines de semana**. Indica espectáculos, gastronomía, entrada libre con aporte solidario y transporte gratuito desde Puerto Iguazú. Ofrece [consulta por WhatsApp](https://wa.me/5493757447021). | Página HTML pública. No se identificó API pública de agenda. Es apta para lectura y enlace humano; no debe asumirse que se puede consultar desde la PWA mediante `fetch`. | Fuente primaria para sus propios eventos. Confirmar fecha, horario, condiciones y disponibilidad mediante el operador antes de completar un evento. | La ficha no fija una fecha concreta. “Algunos fines de semana” no alcanza para `estadoEditorial: confirmado`. No copiar imágenes ni descripciones extensas sin autorización. |
| [Tickets Iguazú Argentina](https://tickets.iguazuargentina.com/) | El catálogo observado muestra **Atardecer en Cataratas** y **Paseo de Luna Llena**, ambos con “Múltiples fechas”, y enlaza a sus fichas del Parque Nacional. Las fichas pueden aportar fechas, horarios, tarifas y condiciones disponibles para compra. | Sitio HTML público, HTTP 200 en la comprobación. No se observó CORS en la respuesta consultada y no se identificó una API pública documentada. | Usar para cotejar disponibilidad actual y enlazar al canal oficial. Verificar que la fecha concreta siga seleccionable antes de publicarla. | “Múltiples fechas” no es una fecha de evento. La disponibilidad, el precio y las condiciones pueden cambiar por clima, seguridad u operación. No automatizar compras ni asumir que una ficha vieja sigue vigente. |
| [Visit Iguazú / ITUREM](https://visitiguazu.travel/) | Portal institucional de orientación turística: alojamientos, agencias, gastronomía, atractivos, tarifas y novedades. Identifica contacto institucional y ofrece blog, prensa y redes oficiales. | No se observó una agenda fechada normalizada en la portada consultada ni un tipo de evento público documentado. | Usar como contexto, descubrimiento y enlace a información institucional; seguir hasta la fuente del organizador cuando una novedad anuncie una actividad. | No confundir atractivos permanentes, horarios de servicios o noticias generales con eventos programados. Es fuente complementaria para la agenda. |
| [Secretaría de Estado de Cultura de Misiones](https://cultura.misiones.gob.ar/) | Publica noticias y muestras culturales provinciales con fecha editorial, localidad y, a veces, sede y organizador. La portada comprobada mostraba noticias del 2 al 8/10/2026, principalmente de otras localidades. | Sitio y [noticias](https://cultura.misiones.gob.ar/noticias/) públicos. No se identificó un calendario específico de Puerto Iguazú ni un tipo de evento normalizado. | Usar como fuente complementaria para detectar propuestas culturales; confirmar siempre que el lugar sea Puerto Iguazú y que la convocatoria siga vigente. | Cobertura provincial, no agenda exclusiva de Iguazú. Una fecha de publicación no equivale a la fecha del evento. |

### Canales sociales y ticketeras

Las cuentas municipales y de organizadores pueden ser las más recientes para cambios de horario, cancelaciones o convocatorias. Se deben revisar manualmente, conservar el enlace de la publicación completa y cotejar la identidad del organizador. No se propone scraping de Facebook o Instagram: el acceso automatizado está sujeto a permisos y condiciones de Meta, y una publicación visible en un buscador no es suficiente como fuente de confirmación.

Las ticketeras como Passline pueden servir para descubrir o contrastar un evento con entradas, pero no deben ser la única fuente. Hay que resolver contradicciones entre encabezado, descripción, programa, productor, fecha y sede con el organizador.

## Esquema actual que debe respetarse

El archivo `eventos.json` debe conservar esta raíz:

```json
{
  "schemaVersion": 1,
  "zonaHoraria": "America/Argentina/Buenos_Aires",
  "eventos": []
}
```

Cada elemento del array `eventos` debe contener estas claves obligatorias:

```text
id, titulo, descripcion, categoria, inicio, fin, zonaHoraria,
lugar, organizador, fuenteUrl, precio, estadoVerificacion,
verificadoEn, estadoEditorial
```

### Reglas relevantes del validador

- `zonaHoraria` debe ser exactamente `America/Argentina/Buenos_Aires`.
- `inicio` debe ser una fecha ISO 8601 válida con zona explícita, por ejemplo `-03:00`.
- `fin` puede ser `null`; si tiene valor, no puede ser anterior a `inicio`.
- `lugar` y `organizador` pueden ser `null`, pero las claves deben existir.
- `fuenteUrl` debe ser HTTP(S) para un evento confirmado o cancelado.
- `estadoVerificacion` solo admite `pendiente` o `verificado`.
- `verificadoEn` debe ser una fecha ISO con zona cuando el evento está verificado.
- `estadoEditorial` admite `pendiente_confirmacion`, `confirmado` o `cancelado`.
- Un evento `confirmado` requiere fuente HTTP(S), `verificadoEn` y `estadoVerificacion: verificado`.
- `categoria` debe ser una de: `recital`, `festival`, `carnaval`, `fiesta_popular`, `feria`, `encuentro_autos`, `encuentro_motos`, `cultural`, `deportivo`, `exposicion`, `espectaculo` u `otro`.
- `precio` siempre es un objeto. `desconocido` o `pendiente_verificacion` usa `monto: null` y `moneda: null`; nunca debe convertirse en gratuito por inferencia.
- Un precio `gratuito` solo se publica si la fuente y la verificación del precio también son HTTP(S) y fecha válida.

El motor `AgendaEventos.obtenerEventosPublicos()` excluye de la agenda los eventos que no sean confirmados, que no tengan fuente HTTP(S) o que ya hayan finalizado.

## Flujo editorial manual recomendado

1. **Descubrir:** revisar el calendario de Misiones, las publicaciones municipales, Cultura Misiones, Visit Iguazú y canales del organizador.
2. **Abrir la fuente primaria:** no confirmar a partir de un snippet, una tarjeta agregadora, una publicación vieja o solo la agenda provincial. Seguir el enlace hasta Municipio, organizador, venue, Iguazú Argentina o canal de tickets.
3. **Comprobar localidad:** confirmar que la actividad sea en Puerto Iguazú o, para el caso del Parque, dentro del área correspondiente. Excluir Posadas, Montecarlo, Foz do Iguaçu y Ciudad del Este aunque aparezcan bajo búsquedas regionales.
4. **Comprobar datos mínimos:** título, fecha, hora o rango inequívoco, lugar, organizador y URL directa. No completar datos faltantes por inferencia.
5. **Crear el registro:** usar la zona horaria argentina, fecha ISO con offset explícito y la categoría admitida más precisa.
6. **Precio:** guardar `desconocido` si no está confirmado; guardar `gratuito` solo cuando la fuente indique gratuidad y la verificación del precio sea suficiente.
7. **Publicar:** usar `estadoEditorial: confirmado` únicamente con fuente primaria válida, `estadoVerificacion: verificado` y `verificadoEn` actualizado. Si falta algo, dejar el registro fuera del snapshot público o usar `pendiente_confirmacion` en una rama de trabajo, nunca en la agenda publicada.
8. **Validar antes de guardar:** ejecutar `node --test tests/*.test.js` y revisar que `eventos.json` siga siendo JSON válido. No agregar fixtures de prueba al archivo público.
9. **Revisar vigencia:** volver a comprobar al incorporarlo, 72 horas antes, 24 horas antes y el mismo día si depende del clima, entradas, seguridad o logística. No marcar cancelado solo porque desapareció una publicación; buscar confirmación del organizador.
10. **Después del evento:** dejar que el motor lo excluya por fecha finalizada o archivarlo en una futura política separada, conservando la trazabilidad editorial fuera del archivo público si hiciera falta.

## Mantenimiento económico

- Una revisión manual diaria de lunes a viernes basta para detectar novedades en las fuentes institucionales.
- Los eventos ya confirmados requieren revalidación especial a 72 h y 24 h; las actividades del Parque o al aire libre requieren comprobación el mismo día.
- El snapshot local en `eventos.json` conserva funcionamiento offline y no necesita API, servidor, credenciales ni dependencia paga.
- Si en el futuro se automatiza el descubrimiento, debe limitarse a un lector de RSS/REST permitido en un entorno controlado y producir candidatos para revisión humana; no debe publicar directamente.

## Eventos incorporados en esta etapa

**Ninguno.** `eventos.json` continúa vacío porque la investigación no reemplaza la confirmación editorial de cada evento y no se encontró una ficha única que autorizara cargar un evento actual de Puerto Iguazú sin cotejo adicional.

## Comprobaciones ejecutadas

- Lectura directa de las seis fuentes principales indicadas arriba.
- Comprobación HTTP de RSS municipal y provincial: HTTP 200.
- Comprobación HTTP de REST WordPress municipal y provincial: HTTP 200; el REST respondió CORS para `https://marianoleivaa-86.github.io` en esta revisión.
- El RSS municipal mostró `lastBuildDate` del 6/10/2026; el RSS provincial, del 8/10/2026.
- El REST provincial devolvió como publicación más reciente observada `26 Diciembre 2026`; esto no prueba localidad ni confirmación del evento.
- `node --test tests/*.test.js`: se ejecuta al cierre de la etapa.
- `git diff --check`: se ejecuta al cierre de la etapa.

**Nota:** CORS, RSS, REST, contenidos, fechas y disponibilidad son observaciones de esta comprobación y pueden cambiar. CORS permite una lectura técnica, no concede derechos de republicación ni convierte el contenido editorial en un contrato estable.
