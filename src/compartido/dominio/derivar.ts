/**
 * Cálculo derivado: avance y estado heredado de los contenedores.
 *
 * Módulo puro. Sin React, sin `node:fs`, sin Electron y sin `Date.now()`: lo que dependa
 * de "hoy" recibe la fecha como parámetro. Es lo que lo hace testeable y lo que permite
 * que el mismo código corra en el proceso principal y en el renderer.
 *
 * Nada de lo que se calcula aquí se persiste jamás (regla 1).
 */

import type {
  Documento,
  Epica,
  Fecha,
  Historia,
  ItemId,
  ItemSprint,
  PersonaId,
  Prioridad,
  Proyecto,
  Sprint,
  Tarea,
} from '../modelo/tipos';

export interface Avance {
  /** Tareas hoja contables: total menos canceladas. Es el denominador de `pct`. */
  hojas: number;
  hechas: number;
  enCurso: number;
  pendientes: number;
  /** Fuera del denominador. Se expone para que la vista pueda decir "3 canceladas". */
  canceladas: number;
  /** `null` cuando no hay tareas contables (regla 2). Nunca 0, nunca NaN. */
  pct: number | null;
}

/** Etiquetas en pantalla: Sin desglosar · Pendiente · En movimiento · Hecha. */
export type EstadoDerivado = 'sin_desglosar' | 'pendiente' | 'en_movimiento' | 'hecha';

export const AVANCE_VACIO: Avance = {
  hojas: 0,
  hechas: 0,
  enCurso: 0,
  pendientes: 0,
  canceladas: 0,
  pct: null,
};

/**
 * Por debajo de este número de tareas el porcentaje engaña más de lo que informa: "50%"
 * sobre dos tareas es ruido. Se muestra "1 de 2" y se omite el % (regla 3).
 */
export const MINIMO_TAREAS_PARA_PCT = 5;

export function mostrarPct(avance: Avance): boolean {
  return avance.pct !== null && avance.hojas >= MINIMO_TAREAS_PARA_PCT;
}

/**
 * Cuenta un conjunto de tareas hoja. Las canceladas quedan fuera del denominador.
 *
 * El porcentaje se redondea pero se topa en 99 mientras quede algo abierto: 199 de 200
 * redondea a 100, y una barra al 100% junto a un estado "en movimiento" se lee como un
 * error de la app. El 100 se reserva para `hechas === hojas` (reglas 4 y 5).
 */
export function contarTareas(tareas: readonly Tarea[]): Avance {
  let hechas = 0;
  let enCurso = 0;
  let pendientes = 0;
  let canceladas = 0;

  for (const tarea of tareas) {
    switch (tarea.estado) {
      case 'hecha':
        hechas += 1;
        break;
      case 'en_curso':
        enCurso += 1;
        break;
      case 'pendiente':
        pendientes += 1;
        break;
      case 'cancelada':
        canceladas += 1;
        break;
    }
  }

  const hojas = hechas + enCurso + pendientes;
  const pct =
    hojas === 0 ? null : hechas === hojas ? 100 : Math.min(99, Math.round((hechas / hojas) * 100));

  return { hojas, hechas, enCurso, pendientes, canceladas, pct };
}

/**
 * Todas las tareas hoja de una épica, aplanadas.
 *
 * Se aplana a propósito: el avance de una épica se calcula sobre el agregado de sus
 * hojas, no promediando los porcentajes de sus historias (regla 5). Tres historias de
 * una tarea cada una con una hecha dan 33%; promediando 100/0/0 saldría el mismo número
 * por casualidad, pero con 2/1/1 tareas ya no coincide, y ese es el caso normal.
 */
export function tareasDeEpica(epica: Epica): Tarea[] {
  const tareas: Tarea[] = [];
  for (const historia of epica.historias) tareas.push(...historia.tareas);
  return tareas;
}

export function tareasDeProyecto(proyecto: Proyecto): Tarea[] {
  const tareas: Tarea[] = [];
  for (const epica of proyecto.epicas) {
    for (const historia of epica.historias) tareas.push(...historia.tareas);
  }
  return tareas;
}

export function avanceDeHistoria(historia: Historia): Avance {
  return contarTareas(historia.tareas);
}

export function avanceDeEpica(epica: Epica): Avance {
  return contarTareas(tareasDeEpica(epica));
}

export function avanceDeProyecto(proyecto: Proyecto): Avance {
  return contarTareas(tareasDeProyecto(proyecto));
}

/**
 * Estado heredado de un contenedor. Se deriva siempre; nunca se persiste.
 *
 * "En movimiento" es exactamente `hojas > 0 && (hechas + enCurso) > 0 && hechas < hojas`.
 *
 * Límite conocido: un contenedor cuyas tareas están todas canceladas da `hojas === 0` y
 * por tanto `sin_desglosar`. La vista distingue ese caso mirando `avance.canceladas > 0`;
 * no se añade un quinto estado porque la paleta validada solo soporta cuatro.
 */
export function estadoDerivado(avance: Avance): EstadoDerivado {
  if (avance.hojas === 0) return 'sin_desglosar';
  if (avance.hechas === avance.hojas) return 'hecha';
  if (avance.hechas + avance.enCurso > 0) return 'en_movimiento';
  return 'pendiente';
}

// --- índice y ubicación -----------------------------------------------------

/** Dónde vive una tarea. */
export interface UbicacionTarea {
  tarea: Tarea;
  historia: Historia;
  epica: Epica;
  proyecto: Proyecto;
}

/**
 * Índice `id de tarea -> ubicación`, construido una vez por render.
 *
 * Los sprints viven en la raíz y solo guardan `tarea_id`: sin este índice, pintar un
 * sprint de 20 items recorrería el árbol de los 11 proyectos 20 veces.
 */
export function indexarTareas(doc: Documento): Map<ItemId, UbicacionTarea> {
  const indice = new Map<ItemId, UbicacionTarea>();
  for (const proyecto of doc.proyectos) {
    for (const epica of proyecto.epicas) {
      for (const historia of epica.historias) {
        for (const tarea of historia.tareas) {
          indice.set(tarea.id, { tarea, historia, epica, proyecto });
        }
      }
    }
  }
  return indice;
}

/** Migaja de una tarea: `["SICOE", "Regularización", "Grupos de regularización"]`. */
export function rutaDe(ubicacion: UbicacionTarea): string[] {
  return [ubicacion.proyecto.clave, ubicacion.epica.titulo, ubicacion.historia.titulo];
}

// --- compromiso de sprint ---------------------------------------------------

export interface Compromiso {
  responsable: PersonaId | null;
  fechaLimite: Fecha | null;
  prioridad: Prioridad | null;
}

/**
 * Qué se comprometió para esta tarea en este sprint.
 *
 * Los campos del item en `null` significan "hereda de la tarea", no "sin asignar"; se
 * materializan al cerrar el sprint, que a partir de entonces es inmutable (regla 8).
 *
 * Sin esta indirección pasa una de dos cosas malas: o el dato solo vive en el item y
 * sacar la tarea del sprint para redefinirla lo pierde, o solo vive en la tarea y
 * reasignarla mañana reescribe la historia de los sprints ya cerrados.
 */
export function compromisoEfectivo(item: ItemSprint, tarea: Tarea | undefined): Compromiso {
  return {
    responsable: item.responsable ?? tarea?.responsable ?? null,
    fechaLimite: item.fecha_limite ?? tarea?.fecha_limite ?? null,
    prioridad: item.prioridad ?? tarea?.prioridad ?? null,
  };
}

/** El sprint activo, o `undefined`. El esquema garantiza que hay a lo sumo uno. */
export function sprintActivo(doc: Documento): Sprint | undefined {
  return doc.sprints.find((sprint) => sprint.estado === 'activo');
}

/** Sprints cerrados, del más viejo al más nuevo. */
export function sprintsCerrados(doc: Documento): Sprint[] {
  return doc.sprints
    .filter((sprint) => sprint.estado === 'cerrado')
    .slice()
    .sort((a, b) => (a.inicio < b.inicio ? -1 : a.inicio > b.inicio ? 1 : 0));
}
