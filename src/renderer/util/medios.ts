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

const CONSULTA = `(min-width: ${ANCHO_DOS_PANELES + 1}px)`;

function suscribir(alCambiar: () => void): () => void {
  if (typeof window === 'undefined' || !window.matchMedia) return () => {};
  const lista = window.matchMedia(CONSULTA);
  lista.addEventListener('change', alCambiar);
  return () => lista.removeEventListener('change', alCambiar);
}

function leer(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return true;
  return window.matchMedia(CONSULTA).matches;
}

/**
 * ¿Se están pintando los dos paneles?
 *
 * `useSyncExternalStore` y no `useState` + efecto: el valor se lee en el mismo render en
 * que React lo necesita, así que no hay un primer pintado con el valor equivocado que
 * monte el formulario en el panel oculto y lo mueva un tic después.
 */
export function useDosPaneles(): boolean {
  return useSyncExternalStore(suscribir, leer, () => true);
}
