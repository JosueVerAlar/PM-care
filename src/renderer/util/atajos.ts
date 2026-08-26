/**
 * Reglas compartidas del teclado.
 *
 * Una sola función, pero decide en tres sitios distintos (el árbol, el atajo global de
 * deshacer y el pie de edición) y equivocarse en uno se nota enseguida: escribir «s» en
 * el motivo de un bloqueo mandaría la tarea al sprint.
 */

/**
 * ¿El evento nació dentro de un campo de texto?
 *
 * Mientras se escribe, las teclas son texto y no atajos — incluido `⌘Z`, que dentro de
 * un `<input>` es el deshacer del propio campo y tiene que seguir siéndolo. Un `<select>`
 * cuenta: sus flechas le pertenecen.
 */
export function enCampoDeTexto(destino: EventTarget | null): boolean {
  if (!(destino instanceof HTMLElement)) return false;
  if (destino.isContentEditable) return true;
  const etiqueta = destino.tagName;
  return etiqueta === 'INPUT' || etiqueta === 'TEXTAREA' || etiqueta === 'SELECT';
}

/** `⌘Z` de macOS. `⇧⌘Z` (rehacer) se deja pasar: no existe rehacer y no se inventa. */
export function esDeshacer(evento: KeyboardEvent): boolean {
  return evento.metaKey && !evento.shiftKey && !evento.altKey && evento.key.toLowerCase() === 'z';
}

/** Una letra suelta, sin modificadores: el formato de los atajos del árbol. */
export function letraSuelta(evento: React.KeyboardEvent, letra: string): boolean {
  if (evento.metaKey || evento.ctrlKey || evento.altKey) return false;
  return evento.key.toLowerCase() === letra;
}
