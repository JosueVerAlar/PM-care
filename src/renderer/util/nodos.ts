/**
 * Búsqueda de nodos del árbol por id, dentro de UN proyecto.
 *
 * Los componentes no calculan (regla 2): el avance, los estados derivados y los
 * selectores de cada vista salen enteros de `src/compartido/dominio/`. Esto no es
 * cálculo, es localización — el equivalente renderer de `buscarEpica`/`buscarHistoria`
 * del reductor, que viven en el proceso principal y no se pueden importar desde aquí sin
 * arrastrar Zod y el historial al bundle.
 *
 * Si esto crece más allá de «encuéntrame el nodo y su ruta», el sitio correcto es
 * `compartido/dominio/`, y hay que pedírselo a `backend`. Hoy son dos recorridos.
 */

import { tareasDe } from '../../compartido/dominio/derivar';
import type { Epica, Historia, Proyecto, Tarea } from '../../compartido/modelo/tipos';

export interface NodoEpica {
  clase: 'epica';
  epica: Epica;
}
export interface NodoHistoria {
  clase: 'historia';
  epica: Epica;
  historia: Historia;
}
export interface NodoTarea {
  clase: 'tarea';
  /** `null` cuando la tarea cuelga del proyecto (regla 18). */
  epica: Epica | null;
  /** `null` cuando cuelga de una épica o del proyecto. */
  historia: Historia | null;
  tarea: Tarea;
}

export type Nodo = NodoEpica | NodoHistoria | NodoTarea;

/** Dónde está este id dentro del proyecto, o `null` si no está. */
export function buscarNodo(proyecto: Proyecto, id: string): Nodo | null {
  for (const epica of proyecto.epicas) {
    if (epica.id === id) return { clase: 'epica', epica };
    for (const historia of epica.historias) {
      if (historia.id === id) return { clase: 'historia', epica, historia };
      for (const tarea of tareasDe(historia)) {
        if (tarea.id === id) return { clase: 'tarea', epica, historia, tarea };
      }
    }
    // Tareas colgadas de la épica, sin historia (regla 18).
    for (const tarea of tareasDe(epica)) {
      if (tarea.id === id) return { clase: 'tarea', epica, historia: null, tarea };
    }
  }
  // Y las del propio proyecto.
  for (const tarea of tareasDe(proyecto)) {
    if (tarea.id === id) return { clase: 'tarea', epica: null, historia: null, tarea };
  }
  return null;
}

/** Migaja legible de un nodo: `["SICOE", "Regularización", "Grupos"]`. */
export function rutaDeNodo(proyecto: Proyecto, nodo: Nodo): string[] {
  switch (nodo.clase) {
    case 'epica':
      return [proyecto.clave, nodo.epica.titulo];
    case 'historia':
      return [proyecto.clave, nodo.epica.titulo, nodo.historia.titulo];
    case 'tarea': {
      // Se omiten los niveles que no existen; nunca se rellenan con un hueco.
      const ruta = [proyecto.clave];
      if (nodo.epica) ruta.push(nodo.epica.titulo);
      if (nodo.historia) ruta.push(nodo.historia.titulo);
      return [...ruta, nodo.tarea.titulo];
    }
  }
}

/** El título que se ve del nodo, sea del nivel que sea. */
export function tituloDeNodo(nodo: Nodo): string {
  switch (nodo.clase) {
    case 'epica':
      return nodo.epica.titulo;
    case 'historia':
      return nodo.historia.titulo;
    case 'tarea':
      return nodo.tarea.titulo;
  }
}
