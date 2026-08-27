/**
 * Reordenar el árbol, en un solo sitio.
 *
 * Arrastrar por el asa, `⌥↑` y `⌥Inicio` tienen que hacer EXACTAMENTE lo mismo, por la
 * misma razón que `S` y soltar en el sprint comparten `acciones-sprint.ts`: si hay dos
 * implementaciones, el teclado acaba siendo un atajo de segunda que hace algo parecido.
 * Aquí hay una y tres formas de llamarla.
 *
 * ## Qué garantiza este módulo, además de mandar el comando
 *
 * - **Soltar donde estaba no es un error.** Se comprueba antes de mandar nada
 *   (`quieto`), y por si el documento cambió bajo los pies entre el arrastre y el envío,
 *   el rechazo del reductor viaja marcado como inocuo y no pinta ninguna franja roja.
 * - **El foco sigue al nodo movido.** Con el teclado es indispensable: cuatro `⌥↑`
 *   seguidos sobre la misma épica solo funcionan si tras cada uno el foco sigue en ella,
 *   y no en la fila que ahora ocupa ese sitio.
 * - **Devuelve la posición final** para que quien llamó pueda anunciarla. Un movimiento
 *   que solo se ve no existe para quien navega con lector de pantalla, y en una lista de
 *   cinco épicas idénticas de un vistazo tampoco es evidente para quien mira.
 *
 * Lo que NO hace, porque es del reductor y está probado allí: mover la rama. Las
 * historias y las tareas viajan con su épica porque cuelgan de ella, no porque alguien
 * las arrastre aparte (regla 10).
 */

import { useCallback, useMemo } from 'react';

import {
  comandoDeOrden,
  limitarDestino,
  quieto,
  reordenable,
  type Ubicacion,
} from '../util/orden';
import { useAccionesInterfaz } from './interfaz';
import { useMutar } from './mutaciones';

/**
 * El rechazo «ya está en la posición N» del reductor.
 *
 * Se reconoce por el texto y no por un código propio: `invalido` lo comparten rechazos
 * que sí hay que contar —arrastrar entre padres distintos, sin ir más lejos—, así que un
 * `codigo === 'invalido'` a secas se tragaría también esos. Es frágil a propósito y de
 * forma acotada: la defensa real es no mandar el comando (`quieto`), y si algún día el
 * reductor cambia el texto, lo peor que pasa es que vuelva a verse un aviso que hoy se
 * calla — nunca al revés, que sería tragarse un error de verdad.
 */
function yaEstabaAhi(fallo: { codigo: string; mensaje: string }): boolean {
  return fallo.codigo === 'invalido' && fallo.mensaje.includes('ya está en la posición');
}

export interface AccionesOrden {
  /**
   * Mueve el nodo a `aIndice`, contado ya sin él. Devuelve el índice final si se movió,
   * o `null` si no había nada que mover (mismo sitio, sin hermanas, o el comando falló).
   */
  mover(ubicacion: Ubicacion, aIndice: number): Promise<number | null>;
}

export function useAccionesOrden(): AccionesOrden {
  const mutar = useMutar();
  const { irANodo } = useAccionesInterfaz();

  const mover = useCallback(
    async (ubicacion: Ubicacion, aIndice: number) => {
      if (!reordenable(ubicacion)) return null;
      const destino = limitarDestino(ubicacion, aIndice);
      // El desenlace más común de un arrastre: se levanta y se suelta casi donde estaba.
      if (quieto(ubicacion, destino)) return null;

      const ok = await mutar(
        comandoDeOrden(ubicacion, destino),
        `Reordenar ${ubicacion.id}`,
        yaEstabaAhi,
      );
      if (!ok) return null;
      // El id no cambia al reordenar (regla 15), así que el foco puede volver al mismo
      // nodo aunque la fila viva ahora en otro sitio de la lista.
      irANodo(ubicacion.id);
      return destino;
    },
    [irANodo, mutar],
  );

  return useMemo(() => ({ mover }), [mover]);
}
