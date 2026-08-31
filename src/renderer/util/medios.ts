/**
 * Consultas de medio, leídas desde React.
 *
 * Existe por una razón concreta: por debajo de 1040 px `base.css` esconde el panel del
 * sprint (`.panel--sprint { display: none }`). Un formulario montado dentro de una
 * tarjeta de ese panel sería inalcanzable — no se puede enfocar lo que no se pinta—, así
 * que el formulario de compromiso necesita SABER si su casa está visible para mudarse al
 * pie del árbol cuando no lo está.
 *
 * Se lee el mismo umbral que el CSS. Duplicarlo es feo; la alternativa —medir el ancho
 * del panel con un observador— es peor: depende de que el panel exista para preguntar si
 * el panel existe.
 */

import { useSyncExternalStore } from 'react';

/** El umbral duro de E0: por debajo, un solo panel. Idéntico al `@media` de `base.css`. */
export const ANCHO_DOS_PANELES = 1040;
/** Por debajo, la columna de completadas deja sitio al backlog y al sprint. */
export const ANCHO_TRES_PANELES = 1320;

function consulta(ancho: number): string {
  return `(min-width: ${ancho + 1}px)`;
}

function suscribir(ancho: number, alCambiar: () => void): () => void {
  if (typeof window === 'undefined' || !window.matchMedia) return () => {};
  const lista = window.matchMedia(consulta(ancho));
  lista.addEventListener('change', alCambiar);
  return () => lista.removeEventListener('change', alCambiar);
}

function leer(ancho: number): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return true;
  return window.matchMedia(consulta(ancho)).matches;
}

/**
 * ¿Se están pintando los dos paneles?
 *
 * `useSyncExternalStore` y no `useState` + efecto: el valor se lee en el mismo render en
 * que React lo necesita, así que no hay un primer pintado con el valor equivocado que
 * monte el formulario en el panel oculto y lo mueva un tic después.
 */
export function useDosPaneles(): boolean {
  return useSyncExternalStore(
    (alCambiar) => suscribir(ANCHO_DOS_PANELES, alCambiar),
    () => leer(ANCHO_DOS_PANELES),
    () => true,
  );
}

/** ¿Se están pintando backlog, completadas y sprint a la vez? */
export function useTresPaneles(): boolean {
  return useSyncExternalStore(
    (alCambiar) => suscribir(ANCHO_TRES_PANELES, alCambiar),
    () => leer(ANCHO_TRES_PANELES),
    () => true,
  );
}
