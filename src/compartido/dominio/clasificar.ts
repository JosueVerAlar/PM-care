/**
 * Predicados y selectores de cada vista.
 *
 * Módulo puro, igual que `derivar.ts`: la fecha de hoy entra siempre como parámetro
 * (`hoy: Fecha`, formato `YYYY-MM-DD`). Nunca se llama a `Date.now()` aquí dentro, para
 * que "esta tarea está vencida" se pueda probar sin viajar en el tiempo.
 *
 * Las fechas de calendario se comparan como cadenas: `YYYY-MM-DD` ordena
 * lexicográficamente igual que cronológicamente, y así no entra ninguna zona horaria a
 * decidir si algo venció ayer o hoy.
 */

import type { Bloqueo, Documento, Fecha, Instante, ItemSprint, Sprint, Tarea } from '../modelo/tipos';
import {
  type Avance,
  type UbicacionTarea,
  avanceDeProyecto,
  indexarTareas,
  sprintActivo,
} from './derivar';

// --- fechas -----------------------------------------------------------------

/** La parte de calendario de un instante ISO. `2026-08-26T11:20:00-06:00` -> `2026-08-26`. */
export function fechaDe(instante: Instante): Fecha {
  return instante.slice(0, 10);
}

/**
 * Días de calendario entre dos fechas, `desde` incluido. Usa `Date` solo como aritmética
 * de calendario sobre valores dados: no consulta el reloj, así que la función sigue
 * siendo pura.
 */
export function diasEntre(desde: Fecha, hasta: Fecha): number {
  const MS_POR_DIA = 86_400_000;
  const a = Date.parse(`${desde}T00:00:00Z`);
  const b = Date.parse(`${hasta}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.round((b - a) / MS_POR_DIA);
}

// --- predicados de tarea ----------------------------------------------------

/** Está abierta: cuenta para la carga de alguien. Cancelada no cuenta para nada. */
export function estaAbierta(tarea: Tarea): boolean {
  return tarea.estado === 'pendiente' || tarea.estado === 'en_curso';
}

export function estaHecha(tarea: Tarea): boolean {
  return tarea.estado === 'hecha';
}

/** El bloqueo vigente, o `null`. El esquema garantiza que no hay dos abiertos a la vez. */
export function bloqueoAbierto(tarea: Tarea): Bloqueo | null {
  return tarea.bloqueos.find((bloqueo) => bloqueo.desbloqueada_en === null) ?? null;
}

/**
 * Bloqueada es ortogonal al estado: la tarea sigue siendo `en_curso` o `pendiente` y
 * conserva su avance. Por eso esto es un predicado y no un valor del enum.
 */
export function estaBloqueada(tarea: Tarea): boolean {
  return bloqueoAbierto(tarea) !== null;
}

/** Días que lleva atorada. `null` si no está bloqueada. */
export function diasBloqueada(tarea: Tarea, hoy: Fecha): number | null {
  const bloqueo = bloqueoAbierto(tarea);
  if (!bloqueo) return null;
  return diasEntre(fechaDe(bloqueo.bloqueada_en), hoy);
}

/**
 * Vencida = tenía fecha y ya pasó, y sigue abierta.
 *
 * Sin `fecha_limite` no existe "atrasada", solo "quieta": son cosas distintas y el
 * tablero no debe confundirlas.
 */
export function estaVencida(tarea: Tarea, hoy: Fecha): boolean {
  return tarea.fecha_limite !== null && tarea.fecha_limite < hoy && estaAbierta(tarea);
}

export function venceHoy(tarea: Tarea, hoy: Fecha): boolean {
  return tarea.fecha_limite === hoy && estaAbierta(tarea);
}

/**
 * ¿Se pinta la marca de procedencia? Solo mientras la tarea siga abierta: la banda
 * desaparece al cerrarse, porque a fin de mes lo interesante es cuánto de lo que quedó
 * abierto no estaba planeado, no repintar de amarillo lo que ya se cerró.
 */
export function mostrarProcedencia(tarea: Tarea): boolean {
  return !tarea.planeada && tarea.estado !== 'hecha';
}

// --- recorrido --------------------------------------------------------------

/** Todas las tareas del documento con su ubicación. Base de las vistas transversales. */
export function todasLasTareas(doc: Documento): UbicacionTarea[] {
  return [...indexarTareas(doc).values()];
}

/** Ids de tarea comprometidos en un sprint, en el orden del array (que es la prioridad). */
export function idsDelSprint(sprint: Sprint | undefined): string[] {
  return sprint ? sprint.items.map((item) => item.tarea_id) : [];
}

export function estaEnSprint(tareaId: string, sprint: Sprint | undefined): boolean {
  return sprint !== undefined && sprint.items.some((item) => item.tarea_id === tareaId);
}

/**
 * Arrastrada: la misma tarea aparece en más de un sprint.
 *
 * Se deriva en vez de guardarse. Un campo `arrastrada` obligaría al usuario a marcarlo
 * al cerrar el sprint, y se le olvidaría; además mentiría en cuanto una tarea entrara,
 * saliera para redefinirse y volviera.
 */
export function sprintsQueLaTocaron(doc: Documento, tareaId: string): Sprint[] {
  return doc.sprints.filter((sprint) => sprint.items.some((item) => item.tarea_id === tareaId));
}

export function fueArrastrada(doc: Documento, tareaId: string): boolean {
  return sprintsQueLaTocaron(doc, tareaId).length > 1;
}

// --- selectores por vista ---------------------------------------------------

/** Vista Bloqueos: todo lo atorado, de los 11 proyectos, sin filtrar por sprint. */
export function paraVistaBloqueos(doc: Documento): UbicacionTarea[] {
  return todasLasTareas(doc).filter((u) => estaBloqueada(u.tarea));
}

/** Vista Terminadas (y su pestaña dentro de un proyecto). */
export function paraVistaTerminadas(doc: Documento): UbicacionTarea[] {
  return todasLasTareas(doc).filter((u) => estaHecha(u.tarea));
}

/**
 * Backlog del área: lo que está abierto y NO está comprometido en el sprint activo.
 *
 * Es la definición útil para "qué podría entrar al sprint". Si incluyera lo ya
 * comprometido, la vista repetiría el sprint y dejaría de servir para elegir.
 */
export function paraBacklogDelArea(doc: Documento): UbicacionTarea[] {
  const activo = sprintActivo(doc);
  return todasLasTareas(doc).filter((u) => estaAbierta(u.tarea) && !estaEnSprint(u.tarea.id, activo));
}

export interface FilaSprint {
  item: ItemSprint;
  ubicacion: UbicacionTarea;
}

/**
 * Vista Sprint: los items en el orden del array, resueltos a su ubicación.
 *
 * Un item cuya tarea no existe se descarta aquí en silencio a propósito: el esquema ya
 * rechaza ese documento antes de llegar a esta función, así que si aparece es porque
 * alguien llamó a esto con datos sin validar, y romper la vista no lo arregla.
 */
export function paraVistaSprint(
  doc: Documento,
  sprint: Sprint | undefined,
): FilaSprint[] {
  if (!sprint) return [];
  const indice = indexarTareas(doc);
  const filas: FilaSprint[] = [];
  for (const item of sprint.items) {
    const ubicacion = indice.get(item.tarea_id);
    if (ubicacion) filas.push({ item, ubicacion });
  }
  return filas;
}

/** Sprint filtrado a un proyecto: el panel derecho de la vista de proyecto. */
export function paraSprintDeProyecto(
  doc: Documento,
  sprint: Sprint | undefined,
  clave: string,
): FilaSprint[] {
  return paraVistaSprint(doc, sprint).filter((fila) => fila.ubicacion.proyecto.clave === clave);
}

/**
 * Señales de un proyecto para el Panorama.
 *
 * Sirven para ORDENAR los 11 proyectos, no para adornar uno. No hay índice de salud ni
 * fecha estimada: el tablero prioriza atención, no pronostica.
 */
export interface SenalesProyecto {
  clave: string;
  nombre: string;
  avance: Avance;
  bloqueadas: number;
  vencidas: number;
  /** Abiertas y no planeadas. Contra la mediana de los 11 es donde el número dice algo. */
  noPlaneadasAbiertas: number;
  /** Cuántas tareas de este proyecto están comprometidas en el sprint activo. */
  enSprintActivo: number;
}

export function senalesDeProyecto(doc: Documento, clave: string, hoy: Fecha): SenalesProyecto | null {
  const proyecto = doc.proyectos.find((p) => p.clave === clave);
  if (!proyecto) return null;
  const activo = sprintActivo(doc);

  let bloqueadas = 0;
  let vencidas = 0;
  let noPlaneadasAbiertas = 0;
  let enSprintActivo = 0;

  for (const epica of proyecto.epicas) {
    for (const historia of epica.historias) {
      for (const tarea of historia.tareas) {
        if (estaBloqueada(tarea)) bloqueadas += 1;
        if (estaVencida(tarea, hoy)) vencidas += 1;
        if (!tarea.planeada && estaAbierta(tarea)) noPlaneadasAbiertas += 1;
        if (estaEnSprint(tarea.id, activo)) enSprintActivo += 1;
      }
    }
  }

  return {
    clave: proyecto.clave,
    nombre: proyecto.nombre,
    avance: avanceDeProyecto(proyecto),
    bloqueadas,
    vencidas,
    noPlaneadasAbiertas,
    enSprintActivo,
  };
}

/**
 * Mediana de una serie de números. `null` con serie vacía.
 *
 * Vive aquí porque el Panorama compara cada proyecto contra la mediana de los 11: una
 * referencia interna es honesta, un umbral inventado ("más del 30% emergente es malo")
 * no lo es.
 */
export function mediana(valores: readonly number[]): number | null {
  if (valores.length === 0) return null;
  const ordenados = valores.slice().sort((a, b) => a - b);
  const medio = Math.floor(ordenados.length / 2);
  const alto = ordenados[medio];
  const bajo = ordenados[medio - 1];
  if (alto === undefined) return null; // inalcanzable: ya comprobamos que hay valores
  return ordenados.length % 2 === 1 || bajo === undefined ? alto : (bajo + alto) / 2;
}
