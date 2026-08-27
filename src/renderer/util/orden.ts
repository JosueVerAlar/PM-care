/**
 * Reordenar dentro del árbol: dónde está un nodo entre sus hermanas y qué comando lo
 * mueve. Aritmética pura, sin React y sin IPC, para que la parte que se equivoca sola
 * —los índices— se pueda leer de un vistazo y probar aparte.
 *
 * ## Las tres cuentas que hay que tener claras
 *
 * 1. **`aIndice` se cuenta YA SIN el elemento que se mueve.** Llevar la primera de cinco
 *    al final es `4`, no `5`. Es la semántica del `splice` del reductor: primero sale de
 *    su sitio, después entra en el nuevo.
 * 2. **Un arrastre no señala una posición, señala un HUECO.** Soltar en la mitad de
 *    arriba de la tercera hermana quiere decir «antes de la tercera» (hueco 2); en la
 *    mitad de abajo, «después» (hueco 3). Los huecos van de 0 a n, y se cuentan sobre la
 *    lista COMPLETA, con el elemento arrastrado todavía dentro. `destinoDesdeHueco`
 *    traduce de una cuenta a la otra, y es la única línea donde vive esa diferencia.
 * 3. **Dos huecos distintos dejan el elemento donde estaba**: el de antes y el de después
 *    de sí mismo. Es el desenlace más común de un arrastre —se levanta y se suelta casi
 *    en el sitio— y aquí es `quieto`, no un error: ni se dibuja línea, ni se manda
 *    comando, ni se apila un «deshacer» que no deshace nada.
 *
 * El campo de padre (`padre`) es redundante con el id y aun así viaja: es la afirmación
 * «creo que esto cuelga de aquí». Si el árbol de la pantalla y el documento discrepan, el
 * reductor rechaza en vez de reordenar en otro sitio. Ver `comandoDeOrden`.
 */

import type { ClaseNodo } from '../estado/interfaz';
import type { Comando } from '../puente/api';

/** Dónde vive un nodo entre sus hermanas. Todo lo que hace falta para moverlo. */
export interface Ubicacion {
  clase: ClaseNodo;
  id: string;
  /**
   * El padre AFIRMADO: la clave del proyecto para una épica, el id de la épica para una
   * historia, el id de la historia para una tarea.
   */
  padre: string;
  /** Índice actual en la lista REAL del documento, nunca en la lista filtrada que se pinta. */
  indice: number;
  /** Cuántas hermanas hay contándose a sí misma. */
  hermanos: number;
}

/** Con una sola hermana no hay nada que reordenar. */
export function reordenable(ubicacion: Ubicacion): boolean {
  return ubicacion.hermanos > 1;
}

/**
 * ¿Son hermanas? Mismo nivel y mismo padre.
 *
 * Es la única relación que el reductor admite: **mover entre padres no existe**. Por eso
 * esta función no decide un mensaje de error, decide qué filas son destino: una historia
 * arrastrada no ilumina nada fuera de su épica, así que el gesto imposible ni se ofrece.
 */
export function sonHermanas(a: Ubicacion, b: Ubicacion): boolean {
  return a.clase === b.clase && a.padre === b.padre;
}

/** De un hueco (0..n, sobre la lista completa) al `aIndice` que espera el comando. */
export function destinoDesdeHueco(desde: number, hueco: number): number {
  return hueco > desde ? hueco - 1 : hueco;
}

/** El comando pide un índice dentro de la lista sin el elemento: 0 .. hermanos-1. */
export function limitarDestino(ubicacion: Ubicacion, aIndice: number): number {
  return Math.min(Math.max(Math.trunc(aIndice), 0), Math.max(ubicacion.hermanos - 1, 0));
}

/** ¿Este destino lo deja donde ya estaba? Entonces no hay nada que mandar. */
export function quieto(ubicacion: Ubicacion, aIndice: number): boolean {
  return limitarDestino(ubicacion, aIndice) === ubicacion.indice;
}

/**
 * El comando de reordenar que corresponde al nivel.
 *
 * Los tres tienen la misma forma —padre afirmado, id, destino— con tres nombres de campo
 * distintos, y es a propósito: `proyecto` (clave, no id) para la épica, `epicaId` para la
 * historia, `historiaId` para la tarea. Concentrarlo aquí es lo que evita que la tercera
 * pantalla que reordene algo mande `proyectoId` y descubra el error en tiempo de ejecución.
 */
export function comandoDeOrden(ubicacion: Ubicacion, aIndice: number): Comando {
  switch (ubicacion.clase) {
    case 'epica':
      return { comando: 'reordenarEpica', proyecto: ubicacion.padre, epicaId: ubicacion.id, aIndice };
    case 'historia':
      return {
        comando: 'reordenarHistoria',
        epicaId: ubicacion.padre,
        historiaId: ubicacion.id,
        aIndice,
      };
    case 'tarea':
      return {
        comando: 'reordenarTarea',
        historiaId: ubicacion.padre,
        tareaId: ubicacion.id,
        aIndice,
      };
  }
}
