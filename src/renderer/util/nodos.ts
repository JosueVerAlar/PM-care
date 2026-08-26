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
  epica: Epica;
  historia: Historia;
  tarea: Tarea;
}

export type Nodo = NodoEpica | NodoHistoria | NodoTarea;

/** Dónde está este id dentro del proyecto, o `null` si no está. */
export function buscarNodo(proyecto: Proyecto, id: string): Nodo | null {
  for (const epica of proyecto.epicas) {
    if (epica.id === id) return { clase: 'epica', epica };
    for (const historia of epica.historias) {
      if (historia.id === id) return { clase: 'historia', epica, historia };
      for (const tarea of historia.tareas) {
        if (tarea.id === id) return { clase: 'tarea', epica, historia, tarea };
      }
    }
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
    case 'tarea':
      return [proyecto.clave, nodo.epica.titulo, nodo.historia.titulo, nodo.tarea.titulo];
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
