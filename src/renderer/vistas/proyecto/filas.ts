/**
 * Qué filas se ven en el árbol, y en qué orden. Puro: sin React, sin DOM, sin contextos.
 *
 * Vive fuera de `Arbol.tsx` a propósito. Es la lógica con más casos límite de toda la
 * interfaz —tres formas de colgar una tarea (regla 18), el filtro por pestaña, la
 * numeración que se anuncia y la que se manda en un comando— y sacarla del componente es
 * lo que permite probarla con datos, sin montar un DOM ni cuatro proveedores.
 *
 * **Se renderiza una lista PLANA**, no un árbol anidado: es lo que permite que las
 * flechas del teclado sean un `indice ± 1` en vez de un recorrido, y lo que deja la
 * puerta abierta a virtualizar. El marcado sigue siendo un árbol accesible gracias a
 * `aria-level`, `aria-posinset` y `aria-setsize`, que es el patrón plano que ARIA admite.
 */

import {
  avanceDeEpica,
  avanceDeHistoria,
  tareasDe,
  tareasDeEpica,
  type Avance,
} from '../../../compartido/dominio/derivar';
import { estaBloqueada, estaEnSprint } from '../../../compartido/dominio/clasificar';
import type {
  Epica,
  Historia,
  Proyecto,
  Sprint,
  Tarea,
} from '../../../compartido/modelo/tipos';
import type { Ubicacion } from '../../util/orden';

/**
 * Una fila ya resuelta: todo lo que hace falta para pintarla, sin volver a calcular.
 *
 * `posicion` / `hermanos` son lo que se ANUNCIA (`aria-posinset`), y salen de la lista
 * filtrada: quien oye «3 de 4» tiene que poder contar cuatro filas. `orden`, en cambio,
 * sale de la lista REAL del documento, porque es lo que se va a mandar en un comando. En
 * la pestaña «Terminadas» las dos cuentas difieren —y ahí reordenar está apagado, que es
 * justamente por lo que no se pueden mezclar.
 */
export type Fila =
  | {
      tipo: 'epica';
      id: string;
      nivel: 1;
      padre: null;
      posicion: number;
      hermanos: number;
      orden: Ubicacion;
      epica: Epica;
      avance: Avance;
      bloqueadas: number;
      expandible: boolean;
    }
  | {
      tipo: 'historia';
      id: string;
      nivel: 2;
      padre: string;
      posicion: number;
      hermanos: number;
      orden: Ubicacion;
      epica: Epica;
      historia: Historia;
      avance: Avance;
      bloqueadas: number;
      expandible: boolean;
    }
  | {
      tipo: 'tarea';
      id: string;
      /**
       * 3 bajo una historia, 2 bajo una épica, 1 colgada del proyecto (regla 18). No es
       * decoración: `aria-level` sale de aquí, y la sangría con él.
       */
      nivel: 1 | 2 | 3;
      /** Id de la historia o de la épica que la contiene, o la CLAVE del proyecto. */
      padre: string;
      posicion: number;
      hermanos: number;
      orden: Ubicacion;
      /** `null` cuando cuelga de una épica o del proyecto: no falta el dato, no lo hay. */
      historia: Historia | null;
      epica: Epica | null;
      tarea: Tarea;
      enSprint: boolean;
    };

export function construirFilas(
  proyecto: Proyecto,
  sprint: Sprint | undefined,
  expandidos: ReadonlySet<string>,
  predicado?: (tarea: Tarea) => boolean,
): Fila[] {
  const filas: Fila[] = [];

  /**
   * Las tareas visibles de un contenedor, y las de verdad.
   *
   * `visibles` es lo que se pinta y lo que se anuncia con `aria-posinset`; `reales` es la
   * lista del documento, que es sobre la que se manda un comando de reordenar. En la
   * pestaña «Terminadas» las dos difieren, y ahí reordenar está apagado — que es
   * justamente por lo que no se pueden confundir.
   */
  const tareasVisibles = (contenedor: Parameters<typeof tareasDe>[0]) => {
    const reales = tareasDe(contenedor);
    return { reales, visibles: predicado ? reales.filter(predicado) : [...reales] };
  };

  /** Una fila de tarea, colgada de donde cuelgue (regla 18). */
  const filaDeTarea = (
    tarea: Tarea,
    nivel: 1 | 2 | 3,
    padre: string,
    posicion: number,
    hermanos: number,
    reales: readonly Tarea[],
    epica: Epica | null,
    historia: Historia | null,
  ): Fila => ({
    tipo: 'tarea',
    id: tarea.id,
    nivel,
    padre,
    posicion,
    hermanos,
    orden: {
      clase: 'tarea',
      id: tarea.id,
      padre,
      indice: reales.indexOf(tarea),
      hermanos: reales.length,
    },
    epica,
    historia,
    tarea,
    enSprint: estaEnSprint(tarea.id, sprint),
  });

  // Con predicado se ocultan los contenedores que no aportan ninguna hoja visible: una
  // pestaña «Terminadas» llena de épicas vacías no informa de nada. Sin predicado se
  // muestran TODAS, incluidas las que no tienen historias: ahí «sin desglosar» es
  // justamente el dato.
  const epicas = predicado
    ? proyecto.epicas.filter((e) => tareasDeEpica(e).some(predicado))
    : proyecto.epicas;

  // Las tareas sueltas del proyecto son hermanas de las épicas: mismo nivel, misma cuenta
  // de `aria-setsize`. Van DESPUÉS, como los archivos después de las carpetas en Finder.
  const sueltas = tareasVisibles(proyecto);
  const hermanosRaiz = epicas.length + sueltas.visibles.length;

  epicas.forEach((epica, i) => {
    const historias = predicado
      ? epica.historias.filter((h) => tareasDe(h).some(predicado))
      : epica.historias;
    const directas = tareasVisibles(epica);

    filas.push({
      tipo: 'epica',
      id: epica.id,
      nivel: 1,
      padre: null,
      posicion: i + 1,
      hermanos: hermanosRaiz,
      // El padre afirmado de una épica es la CLAVE del proyecto, no un id: un proyecto
      // tiene clave, y así lo llaman ya `crearEpica` y `editarEquipo`.
      orden: {
        clase: 'epica',
        id: epica.id,
        padre: proyecto.clave,
        indice: proyecto.epicas.indexOf(epica),
        hermanos: proyecto.epicas.length,
      },
      epica,
      // Siempre sobre TODAS las hojas de la épica, nunca sobre las filtradas.
      avance: avanceDeEpica(epica),
      bloqueadas: tareasDeEpica(epica).filter(estaBloqueada).length,
      // Se abre si tiene historias O tareas propias: una épica de un proyecto sin nivel
      // de historia —cinco de los once en el Jira real— es expandible por sus tareas.
      expandible: historias.length > 0 || directas.visibles.length > 0,
    });

    if (!expandidos.has(epica.id)) return;

    const hijosDeEpica = historias.length + directas.visibles.length;

    historias.forEach((historia, j) => {
      const suyas = tareasVisibles(historia);

      filas.push({
        tipo: 'historia',
        id: historia.id,
        nivel: 2,
        padre: epica.id,
        posicion: j + 1,
        hermanos: hijosDeEpica,
        orden: {
          clase: 'historia',
          id: historia.id,
          padre: epica.id,
          indice: epica.historias.indexOf(historia),
          hermanos: epica.historias.length,
        },
        epica,
        historia,
        avance: avanceDeHistoria(historia),
        bloqueadas: tareasDe(historia).filter(estaBloqueada).length,
        expandible: suyas.visibles.length > 0,
      });

      if (suyas.visibles.length === 0 || !expandidos.has(historia.id)) return;

      suyas.visibles.forEach((tarea, k) => {
        filas.push(
          filaDeTarea(tarea, 3, historia.id, k + 1, suyas.visibles.length, suyas.reales, epica, historia),
        );
      });
    });

    // Las tareas propias de la épica, después de sus historias y al mismo nivel que ellas.
    directas.visibles.forEach((tarea, j) => {
      filas.push(
        filaDeTarea(
          tarea,
          2,
          epica.id,
          historias.length + j + 1,
          hijosDeEpica,
          directas.reales,
          epica,
          null,
        ),
      );
    });
  });

  // Y las del proyecto, al final y al nivel de las épicas.
  sueltas.visibles.forEach((tarea, i) => {
    filas.push(
      filaDeTarea(
        tarea,
        1,
        proyecto.clave,
        epicas.length + i + 1,
        hermanosRaiz,
        sueltas.reales,
        null,
        null,
      ),
    );
  });

  return filas;
}
