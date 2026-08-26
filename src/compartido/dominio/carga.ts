/**
 * Carga por persona: vista transversal a los 11 proyectos.
 *
 * **Lo que este módulo NO responde, dicho aquí para que nadie construya encima de una
 * promesa falsa:** no puede decir "¿le da tiempo de hacer todo eso en el sprint?". Eso
 * exige estimaciones de esfuerzo, y el modelo no las tiene ni las va a inventar. Un
 * "está al 120% de capacidad" calculado contando tareas es un número inventado con cara
 * de dato, y esos son los que se acaban usando para decidir.
 *
 * Lo que sí sostiene, y es lo que se expone:
 *   1. Cuánta carga tiene alguien: cuántas tareas abiertas se le comprometieron.
 *   2. Cuánta dispersión: entre cuántos proyectos distintos está repartida esa carga.
 *      Con un ejecutor, tocar 5 proyectos en un sprint no es problema de capacidad sino
 *      de cambio de contexto, y eso sí se ve contando.
 *   3. Con qué se compara: cuántas cerró esa misma persona en sprints anteriores. Es su
 *      propio historial, no un estándar externo.
 *
 * Módulo puro: `hoy` entra como parámetro.
 */

import type { Documento, Fecha, PersonaId, Sprint } from '../modelo/tipos';
import { compromisoEfectivo, indexarTareas, sprintActivo, sprintsCerrados } from './derivar';
import { estaAbierta, estaBloqueada, estaEnSprint, estaVencida, mediana } from './clasificar';

/**
 * Por debajo de este número de sprints cerrados la mediana no significa nada y no se
 * muestra. Dos puntos no son una serie.
 */
export const MINIMO_SPRINTS_PARA_MEDIANA = 3;

export interface CargaEnProyecto {
  clave: string;
  nombre: string;
  /** Tareas de este proyecto comprometidas a la persona en el sprint activo. */
  total: number;
  abiertas: number;
}

export interface CargaEnSprint {
  total: number;
  abiertas: number;
  hechas: number;
  bloqueadas: number;
  vencidas: number;
  porProyecto: CargaEnProyecto[];
  /** La señal de dispersión: entre cuántos proyectos está repartida la carga. */
  proyectosDistintos: number;
}

export interface CerradasEnSprint {
  sprintId: string;
  nombre: string;
  cerradas: number;
}

export interface HistorialPersona {
  /** Solo sprints cerrados que registraron desenlaces. Del más viejo al más nuevo. */
  porSprint: CerradasEnSprint[];
  /** `null` con menos de `MINIMO_SPRINTS_PARA_MEDIANA` sprints con datos. */
  medianaCerradas: number | null;
}

export interface PertenenciaEquipo {
  clave: string;
  nombre: string;
  rol: string | null;
}

export interface CargaPersona {
  personaId: PersonaId;
  nombre: string;
  activa: boolean;
  /** Los equipos de los que forma parte. Una persona puede estar en varios. */
  equipos: PertenenciaEquipo[];
  enSprint: CargaEnSprint;
  /**
   * Tareas abiertas que le pertenecen y NO están en el sprint activo. Es el resto de la
   * cola: sin esto, "tiene 4 tareas" se lee tranquilizador aunque arrastre otras treinta.
   */
  abiertasFueraDelSprint: number;
  historial: HistorialPersona;
}

const CARGA_VACIA: CargaEnSprint = {
  total: 0,
  abiertas: 0,
  hechas: 0,
  bloqueadas: 0,
  vencidas: 0,
  porProyecto: [],
  proyectosDistintos: 0,
};

/** En qué equipos está una persona. Se lee recorriendo proyectos: no se duplica el dato. */
export function equiposDe(doc: Documento, personaId: PersonaId): PertenenciaEquipo[] {
  const equipos: PertenenciaEquipo[] = [];
  for (const proyecto of doc.proyectos) {
    const miembro = proyecto.equipo.find((m) => m.persona_id === personaId);
    if (miembro) {
      equipos.push({ clave: proyecto.clave, nombre: proyecto.nombre, rol: miembro.rol });
    }
  }
  return equipos;
}

/** Carga de todas las personas, en el orden en que están declaradas en el documento. */
export function cargaPorPersona(doc: Documento, hoy: Fecha): CargaPersona[] {
  const cargas: CargaPersona[] = [];
  for (const persona of doc.personas) {
    const carga = cargaDe(doc, persona.id, hoy);
    if (carga) cargas.push(carga);
  }
  return cargas;
}

export function cargaDe(doc: Documento, personaId: PersonaId, hoy: Fecha): CargaPersona | null {
  const persona = doc.personas.find((p) => p.id === personaId);
  if (!persona) return null;

  const indice = indexarTareas(doc);
  const activo = sprintActivo(doc);

  // --- carga en el sprint activo
  const porProyecto = new Map<string, CargaEnProyecto>();
  const carga: CargaEnSprint = { ...CARGA_VACIA, porProyecto: [] };

  if (activo) {
    for (const item of activo.items) {
      const ubicacion = indice.get(item.tarea_id);
      if (!ubicacion) continue;
      // El responsable del item manda; en `null` hereda el de la tarea.
      if (compromisoEfectivo(item, ubicacion.tarea).responsable !== personaId) continue;

      const { tarea, proyecto } = ubicacion;
      carga.total += 1;
      if (estaAbierta(tarea)) carga.abiertas += 1;
      if (tarea.estado === 'hecha') carga.hechas += 1;
      if (estaBloqueada(tarea)) carga.bloqueadas += 1;
      if (estaVencida(tarea, hoy)) carga.vencidas += 1;

      const fila =
        porProyecto.get(proyecto.clave) ??
        { clave: proyecto.clave, nombre: proyecto.nombre, total: 0, abiertas: 0 };
      fila.total += 1;
      if (estaAbierta(tarea)) fila.abiertas += 1;
      porProyecto.set(proyecto.clave, fila);
    }
  }

  carga.porProyecto = [...porProyecto.values()].sort((a, b) => b.total - a.total);
  // Dispersión: solo cuentan los proyectos donde todavía queda algo abierto. Un proyecto
  // ya cerrado en este sprint no le sigue costando cambios de contexto.
  carga.proyectosDistintos = carga.porProyecto.filter((f) => f.abiertas > 0).length;

  // --- la cola de fuera del sprint
  let abiertasFueraDelSprint = 0;
  for (const { tarea } of indice.values()) {
    if (tarea.responsable !== personaId) continue;
    if (!estaAbierta(tarea)) continue;
    if (estaEnSprint(tarea.id, activo)) continue;
    abiertasFueraDelSprint += 1;
  }

  return {
    personaId: persona.id,
    nombre: persona.nombre,
    activa: persona.activa,
    equipos: equiposDe(doc, persona.id),
    enSprint: carga,
    abiertasFueraDelSprint,
    historial: historialDe(doc, persona.id),
  };
}

/**
 * Cuántas cerró en cada sprint anterior.
 *
 * Se cuenta el `desenlace` congelado del item, no el estado actual de la tarea: si se
 * leyera el árbol vivo, reabrir una tarea hoy cambiaría lo que cerró en marzo. Esa es la
 * misma razón por la que el historial desnormaliza sus campos.
 *
 * Un sprint cerrado sin ningún desenlace registrado se descarta en vez de contarse como
 * cero: un cero falso hunde la mediana y hace parecer que la persona no cierra nada.
 */
export function historialDe(doc: Documento, personaId: PersonaId): HistorialPersona {
  const indice = indexarTareas(doc);
  const porSprint: CerradasEnSprint[] = [];

  for (const sprint of sprintsCerrados(doc)) {
    if (!sprint.items.some((item) => item.desenlace !== null)) continue;
    let cerradas = 0;
    for (const item of sprint.items) {
      if (item.desenlace !== 'completada') continue;
      const ubicacion = indice.get(item.tarea_id);
      if (compromisoEfectivo(item, ubicacion?.tarea).responsable === personaId) cerradas += 1;
    }
    porSprint.push({ sprintId: sprint.id, nombre: sprint.nombre, cerradas });
  }

  const medianaCerradas =
    porSprint.length >= MINIMO_SPRINTS_PARA_MEDIANA
      ? mediana(porSprint.map((s) => s.cerradas))
      : null;

  return { porSprint, medianaCerradas };
}

/**
 * Dispersión del sprint completo: cuántos proyectos distintos toca.
 *
 * Es la métrica del sprint, no de una persona. Con un solo ejecutor, un sprint que toca
 * 8 de 11 proyectos no tiene un problema de carga sino de cambio de contexto.
 */
export function dispersionDelSprint(doc: Documento, sprint: Sprint | undefined): number {
  if (!sprint) return 0;
  const indice = indexarTareas(doc);
  const claves = new Set<string>();
  for (const item of sprint.items) {
    const ubicacion = indice.get(item.tarea_id);
    if (ubicacion) claves.add(ubicacion.proyecto.clave);
  }
  return claves.size;
}

/**
 * Vista Equipos: la conformación de cada proyecto, con los nombres resueltos.
 *
 * `sinRegistrar` son personas con tareas abiertas en el proyecto que no están en su
 * equipo. No es un error del documento — el responsable de una tarea vieja puede haber
 * salido del equipo — pero es justo lo que la pantalla de conformación existe para
 * revisar.
 */
export interface ConformacionEquipo {
  clave: string;
  nombre: string;
  miembros: { personaId: PersonaId; nombre: string; rol: string | null; abiertas: number }[];
  sinRegistrar: { personaId: PersonaId; nombre: string; abiertas: number }[];
}

export function conformacionDeEquipos(doc: Documento): ConformacionEquipo[] {
  const nombres = new Map(doc.personas.map((p) => [p.id, p.nombre]));

  return doc.proyectos.map((proyecto) => {
    const abiertasPor = new Map<PersonaId, number>();
    for (const epica of proyecto.epicas) {
      for (const historia of epica.historias) {
        for (const tarea of historia.tareas) {
          if (tarea.responsable === null || !estaAbierta(tarea)) continue;
          abiertasPor.set(tarea.responsable, (abiertasPor.get(tarea.responsable) ?? 0) + 1);
        }
      }
    }

    const enEquipo = new Set(proyecto.equipo.map((m) => m.persona_id));
    const miembros = proyecto.equipo.map((m) => ({
      personaId: m.persona_id,
      nombre: nombres.get(m.persona_id) ?? m.persona_id,
      rol: m.rol,
      abiertas: abiertasPor.get(m.persona_id) ?? 0,
    }));

    const sinRegistrar = [...abiertasPor.entries()]
      .filter(([personaId]) => !enEquipo.has(personaId))
      .map(([personaId, abiertas]) => ({
        personaId,
        nombre: nombres.get(personaId) ?? personaId,
        abiertas,
      }));

    return { clave: proyecto.clave, nombre: proyecto.nombre, miembros, sinRegistrar };
  });
}
