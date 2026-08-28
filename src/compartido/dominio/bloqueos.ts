/**
 * E9 — el cálculo de la vista global de Bloqueos.
 *
 * Módulo puro, igual que `derivar.ts` y `clasificar.ts`: sin `fs`, sin `ipc`, sin React,
 * y con `hoy` como parámetro.
 *
 * ## Por qué se agrupa por TIPO y no por proyecto
 *
 * Con once proyectos y un puñado de bloqueos, agrupar por proyecto da seis grupos de una
 * fila: mucha cabecera, ninguna acción nueva. El TIPO junta lo que se destraba con el
 * MISMO movimiento — todo lo que espera una decisión se resuelve en una reunión, todo lo
 * que espera un permiso se resuelve en una petición. Por eso el criterio por omisión es
 * `tipo`; `proyecto` sigue disponible porque a veces la pregunta sí es «¿qué tiene atorado
 * SICOE?».
 *
 * ## Por qué el orden es el hallazgo
 *
 * Las filas van por días detenido descendente, y los GRUPOS por los días de su fila más
 * vieja — no por cuántas filas tienen. Un grupo de una tarea detenida 21 días importa más
 * que uno de cuatro detenidas dos días, y ordenar por tamaño lo escondería.
 */

import type { Bloqueo, Documento, Fecha, TipoBloqueo } from '../modelo/tipos';
import {
  bloqueoAbierto,
  diasBloqueada,
  estaEnSprint,
  mostrarProcedencia,
  paraVistaBloqueos,
} from './clasificar';
import { sprintsActivos, type UbicacionTarea } from './derivar';

/** Una tarea atorada, con todo lo que la fila muestra ya resuelto. */
export interface FilaBloqueo {
  ubicacion: UbicacionTarea;
  /** El bloqueo VIGENTE. Nunca uno cerrado: los cerrados son historia, no trabajo. */
  bloqueo: Bloqueo;
  /** Días detenida, contra `hoy`. Es lo que ordena la vista entera. */
  dias: number;
  /** Procedencia (canal 2), independiente del estado y del bloqueo. */
  nuevo: boolean;
  /** ¿Está comprometida en el sprint activo? Un bloqueo dentro del sprint corre prisa. */
  enSprintActivo: boolean;
}

export type CriterioBloqueos = 'tipo' | 'proyecto';

export const CRITERIO_POR_OMISION: CriterioBloqueos = 'tipo';

export interface GrupoBloqueos {
  /** Clave estable para React y para el plegado: el tipo, o la clave del proyecto. */
  id: string;
  /** No nulo al agrupar por tipo. La ETIQUETA en español la pone el renderer. */
  tipo: TipoBloqueo | null;
  /** No nulo al agrupar por proyecto. */
  clave: string | null;
  nombre: string | null;
  filas: FilaBloqueo[];
  /** Días de la fila más vieja del grupo. Es lo que ordena los grupos entre sí. */
  diasMaximo: number;
}

export interface ResumenBloqueos {
  total: number;
  /** `null` sin bloqueos: no es 0 días, es que no hay nada que contar. */
  diasMaximo: number | null;
  /** En cuántos proyectos distintos. «9 bloqueos» en uno solo es otra historia. */
  proyectos: number;
  /** Cuántos están comprometidos en el sprint activo. */
  enSprintActivo: number;
}

/**
 * Todas las tareas con bloqueo vigente, ordenadas por días detenido descendente.
 *
 * Una tarea sin bloqueo abierto no llega aquí (`paraVistaBloqueos` ya filtró), así que el
 * `bloqueoAbierto` no nulo está garantizado; el `continue` es defensa contra que alguien
 * llame a esto con un documento sin validar, no un caso esperado.
 */
export function filasDeBloqueos(doc: Documento, hoy: Fecha): FilaBloqueo[] {
  const activo = sprintsActivos(doc)[0];
  const filas: FilaBloqueo[] = [];

  for (const ubicacion of paraVistaBloqueos(doc)) {
    const bloqueo = bloqueoAbierto(ubicacion.tarea);
    if (bloqueo === null) continue;
    filas.push({
      ubicacion,
      bloqueo,
      dias: diasBloqueada(ubicacion.tarea, hoy) ?? 0,
      nuevo: mostrarProcedencia(ubicacion.tarea),
      enSprintActivo: estaEnSprint(ubicacion.tarea.id, activo),
    });
  }

  // Desempate por id: sin él, dos bloqueos del mismo día se reordenan solos entre
  // renders y la lista parpadea sin que nada haya cambiado.
  return filas.sort((a, b) => b.dias - a.dias || comparar(a.ubicacion.tarea.id, b.ubicacion.tarea.id));
}

export function agruparBloqueos(
  doc: Documento,
  hoy: Fecha,
  criterio: CriterioBloqueos,
): GrupoBloqueos[] {
  const filas = filasDeBloqueos(doc, hoy);
  const grupos = new Map<string, GrupoBloqueos>();

  for (const fila of filas) {
    const porTipo = criterio === 'tipo';
    const id = porTipo ? fila.bloqueo.tipo : fila.ubicacion.proyecto.clave;
    const grupo =
      grupos.get(id) ??
      {
        id,
        tipo: porTipo ? fila.bloqueo.tipo : null,
        clave: porTipo ? null : fila.ubicacion.proyecto.clave,
        nombre: porTipo ? null : fila.ubicacion.proyecto.nombre,
        filas: [],
        diasMaximo: 0,
      };
    grupo.filas.push(fila);
    // `filas` ya viene ordenada descendente, así que la primera de cada grupo es la más
    // vieja: el máximo se puede tomar sin volver a recorrer.
    if (grupo.filas.length === 1) grupo.diasMaximo = fila.dias;
    grupos.set(id, grupo);
  }

  return [...grupos.values()].sort((a, b) => b.diasMaximo - a.diasMaximo || comparar(a.id, b.id));
}

export function resumenDeBloqueos(filas: readonly FilaBloqueo[]): ResumenBloqueos {
  const proyectos = new Set<string>();
  let diasMaximo: number | null = null;
  let enSprintActivo = 0;

  for (const fila of filas) {
    proyectos.add(fila.ubicacion.proyecto.clave);
    if (diasMaximo === null || fila.dias > diasMaximo) diasMaximo = fila.dias;
    if (fila.enSprintActivo) enSprintActivo += 1;
  }

  return { total: filas.length, diasMaximo, proyectos: proyectos.size, enSprintActivo };
}

function comparar(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
