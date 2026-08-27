/**
 * Arrastre nativo de HTML5, sin librería.
 *
 * ## Por qué nativo y no `@dnd-kit/core` (decisión D3)
 *
 * El argumento de `ux` era doble: el arrastre nativo no da teclado y su imagen fantasma
 * es incontrolable. Los dos puntos se caen mirando lo que E7 tiene que construir.
 *
 * - **Teclado.** El encargo ya exige `S` como vía PRINCIPAL, no como alternativa. El
 *   sensor de teclado de dnd-kit implementa la metáfora de arrastre (levantar, mover con
 *   flechas, soltar), que aquí sería *peor*: el destino es una zona única, no una
 *   posición entre iguales. Comprar 30 KB por una interacción que además no vamos a usar
 *   no se sostiene.
 * - **Imagen fantasma.** Sí es controlable: `setDragImage(nodo, x, y)` acepta cualquier
 *   elemento. Lo incontrolable es la instantánea POR OMISIÓN de la fila entera, y eso es
 *   justo lo que `chipDeArrastre` sustituye por un chip de 1 línea.
 * - Y un tercero que decide: por debajo de 1040 px el panel del sprint no se pinta
 *   (`base.css`), así que **ahí no hay arrastre posible con ninguna librería**. La ruta
 *   de teclado no es un extra accesible, es la única que funciona en ventana angosta, y
 *   no la trae ningún paquete.
 *
 * Coste real de ir nativo, para que quede escrito: hay que llamar a `preventDefault()` en
 * `dragover` para que `drop` llegue a dispararse, y `dragenter`/`dragleave` se disparan
 * también al cruzar los hijos de la zona, así que el resaltado necesita un contador de
 * profundidad. Son las dos líneas de abajo.
 */

/**
 * Tipo MIME propio. Con uno propio, `dataTransfer.types` distingue durante `dragover`
 * un arrastre nuestro de un archivo que alguien soltó desde el Finder — y el payload no
 * se puede leer hasta `drop`, así que el tipo es lo único que hay para decidir.
 */
export const TIPO_TAREA = 'application/x-pmcare-tarea';

/**
 * Tipo MIME del OTRO arrastre: reordenar dentro del árbol (regla 10, segundo párrafo).
 *
 * Son dos gestos distintos sobre las mismas filas y no se mezclan **en ninguna capa**:
 * empiezan en sitios distintos (el asa contra el cuerpo de la fila), viajan con tipos
 * MIME distintos, y por eso ninguna zona de soltar puede confundirlos. El panel del
 * sprint pregunta por `TIPO_TAREA` y una épica arrastrada para priorizar no lo lleva:
 * aunque el cursor pase por encima, el panel ni se ilumina ni acepta nada. Y al revés,
 * una tarea arrastrada hacia el sprint no dibuja ninguna línea de inserción en el árbol.
 *
 * Que el tipo sea consultable durante `dragover` —el dato no lo es— es justo lo que
 * permite que esa decisión se tome antes de soltar, que es cuando el usuario mira.
 */
export const TIPO_ORDEN = 'application/x-pmcare-orden';

/** ¿Este arrastre es nuestro? Se puede preguntar en `dragover`, a diferencia del dato. */
export function esArrastreDeTarea(dt: DataTransfer | null): boolean {
  return dt !== null && [...dt.types].includes(TIPO_TAREA);
}

/** ¿Es el arrastre de reordenar? Misma pregunta, el otro gesto. */
export function esArrastreDeOrden(dt: DataTransfer | null): boolean {
  return dt !== null && [...dt.types].includes(TIPO_ORDEN);
}

/**
 * Sustituye la instantánea por omisión (la fila translúcida entera) por un chip.
 *
 * El nodo tiene que estar en el documento y ser visible en el momento de la llamada, así
 * que se inserta fuera de pantalla y se retira en el siguiente tic: el navegador ya
 * capturó el mapa de bits para entonces.
 */
export function chipDeArrastre(evento: React.DragEvent, texto: string): void {
  const chip = document.createElement('div');
  chip.className = 'fantasma-arrastre';
  chip.textContent = texto;
  document.body.appendChild(chip);
  evento.dataTransfer.setDragImage(chip, 12, 14);
  window.setTimeout(() => chip.remove(), 0);
}
