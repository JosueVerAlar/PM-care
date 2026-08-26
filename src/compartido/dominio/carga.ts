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
import {
  compromisoEfectivo,
  indexarTareas,
  sprintActivo,
  sprintsCerrados,
  type UbicacionTarea,
} from './derivar';
import { estaAbierta, estaBloqueada, estaEnSprint, mediana } from './clasificar';

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

/**
 * Reparto de las tareas ABIERTAS de alguien entre proyectos, en todo el documento.
 *
 * Es distinto de `CargaEnSprint`, y la diferencia importa: el sprint es lo que se
 * comprometió para esta quincena, y esto es la cola entera. Una persona con 4 en el sprint
 * y 26 fuera no está tranquila, y una vista que solo enseñara el sprint lo diría.
 *
 * Manda el COMPROMISO vigente: dentro del sprint activo, el responsable del item gana
 * sobre el de la tarea; fuera del sprint no hay item del que heredar y manda la tarea.
 */
export interface RepartoAbierto {
  total: number;
  /** De mayor a menor. Los tramos de la barra salen de aquí, en este orden. */
  porProyecto: { clave: string; nombre: string; abiertas: number }[];
  /** La señal de dispersión: entre cuántos proyectos está repartida la cola. */
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
  /**
   * Toda la cola abierta, dentro y fuera del sprint. Es lo que mide la barra de la vista
   * de Carga: el sprint solo es la parte comprometida de esto.
   */
  abiertas: RepartoAbierto;
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

/**
 * Índice `id de persona -> nombre`.
 *
 * Vive en el dominio y no en la capa de presentación porque la respuesta a «¿y si el id
 * no está en el catálogo?» es una decisión de datos, no de estilo: se devuelve el id tal
 * cual, nunca «—» ni una cadena vacía. Una tarea puede apuntar a alguien que ya no está
 * en `personas` (regla 14: el usuario edita el JSON a mano), y esconder ese id haría
 * desaparecer de la vista justo la tarea que hay que revisar.
 */
export function nombresDePersonas(doc: Documento): Map<PersonaId, string> {
  return new Map(doc.personas.map((persona) => [persona.id, persona.nombre]));
}

export function nombreDePersona(
  nombres: ReadonlyMap<PersonaId, string>,
  personaId: PersonaId | null,
): string | null {
  if (personaId === null) return null;
  return nombres.get(personaId) ?? personaId;
}

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

  const carga = cargaEnSprintDe(indice, activo, personaId, hoy);

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
    abiertas: repartoAbiertoDe(indice, activo, personaId),
    enSprint: carga,
    abiertasFueraDelSprint,
    historial: historialDe(doc, persona.id),
  };
}

/**
 * La carga comprometida en un sprint para un responsable.
 *
 * `responsable === null` no significa «cualquiera»: significa las tareas del sprint que
 * NADIE tiene asignadas. Es una fila real de la vista —un compromiso sin dueño sigue
 * siendo un compromiso— y esconderla haría que los conteos por persona no sumaran el
 * sprint.
 */
function cargaEnSprintDe(
  indice: ReadonlyMap<string, UbicacionTarea>,
  activo: Sprint | undefined,
  responsable: PersonaId | null,
  hoy: Fecha,
): CargaEnSprint {
  const porProyecto = new Map<string, CargaEnProyecto>();
  const carga: CargaEnSprint = { ...CARGA_VACIA, porProyecto: [] };

  if (activo) {
    for (const item of activo.items) {
      const ubicacion = indice.get(item.tarea_id);
      if (!ubicacion) continue;
      // El compromiso del item manda; en `null` hereda el de la tarea.
      const compromiso = compromisoEfectivo(item, ubicacion.tarea);
      if (compromiso.responsable !== responsable) continue;

      const { tarea, proyecto } = ubicacion;
      carga.total += 1;
      if (estaAbierta(tarea)) carga.abiertas += 1;
      if (tarea.estado === 'hecha') carga.hechas += 1;
      if (estaBloqueada(tarea)) carga.bloqueadas += 1;
      // La fecha sale del MISMO compromiso que el responsable: si el item la fija, una
      // tarea sin fecha propia sí puede estar vencida dentro de este sprint.
      if (compromiso.fechaLimite !== null && compromiso.fechaLimite < hoy && estaAbierta(tarea))
        carga.vencidas += 1;

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

  return carga;
}

/**
 * Toda la cola abierta de alguien, repartida por proyecto. `null` = sin responsable.
 *
 * Manda el COMPROMISO vigente: para una tarea que está en el sprint activo, el
 * responsable del item gana sobre el de la tarea (`compromisoEfectivo`). Leer solo
 * `tarea.responsable` haría que una tarea reasignada dentro del sprint siguiera contando
 * en la barra de quien ya no la tiene.
 */
function repartoAbiertoDe(
  indice: ReadonlyMap<string, UbicacionTarea>,
  activo: Sprint | undefined,
  responsable: PersonaId | null,
): RepartoAbierto {
  const porProyecto = new Map<string, { clave: string; nombre: string; abiertas: number }>();
  const items = new Map((activo?.items ?? []).map((item) => [item.tarea_id, item]));
  let total = 0;

  for (const { tarea, proyecto } of indice.values()) {
    const item = items.get(tarea.id);
    const quien = item === undefined ? tarea.responsable : compromisoEfectivo(item, tarea).responsable;
    if (quien !== responsable) continue;
    if (!estaAbierta(tarea)) continue;
    total += 1;
    const fila =
      porProyecto.get(proyecto.clave) ?? { clave: proyecto.clave, nombre: proyecto.nombre, abiertas: 0 };
    fila.abiertas += 1;
    porProyecto.set(proyecto.clave, fila);
  }

  const lista = [...porProyecto.values()].sort(
    (a, b) => b.abiertas - a.abiertas || (a.clave < b.clave ? -1 : 1),
  );
  return { total, porProyecto: lista, proyectosDistintos: lista.length };
}

/**
 * Las tareas que no tienen responsable.
 *
 * No es una persona y no se pinta como tal: es un hueco del documento. Va siempre al
 * final de la lista y sin historial, porque «cuántas cerró en sprints anteriores» no
 * significa nada para nadie.
 */
export interface CargaSinAsignar {
  abiertas: RepartoAbierto;
  enSprint: CargaEnSprint;
}

export function cargaSinAsignar(doc: Documento, hoy: Fecha): CargaSinAsignar {
  const indice = indexarTareas(doc);
  const activo = sprintActivo(doc);
  return {
    abiertas: repartoAbiertoDe(indice, activo, null),
    enSprint: cargaEnSprintDe(indice, activo, null, hoy),
  };
}

export type OrdenCarga = 'total' | 'dispersion';

/**
 * Ordena para pintar. No filtra a las personas sin carga: que alguien del equipo aparezca
 * con cero es información —está libre—, y quitarlo dejaría la vista contando solo a los
 * que ya se ven agobiados.
 *
 * Las personas inactivas caen al final: siguen apareciendo porque pueden arrastrar tareas
 * abiertas de antes, y esconderlas escondería justo ese problema.
 */
export function ordenarCargas(
  cargas: readonly CargaPersona[],
  orden: OrdenCarga,
): CargaPersona[] {
  return cargas.slice().sort((a, b) => {
    if (a.activa !== b.activa) return a.activa ? -1 : 1;
    if (orden === 'dispersion') {
      return (
        b.abiertas.proyectosDistintos - a.abiertas.proyectosDistintos ||
        b.abiertas.total - a.abiertas.total ||
        a.nombre.localeCompare(b.nombre, 'es')
      );
    }
    return b.abiertas.total - a.abiertas.total || a.nombre.localeCompare(b.nombre, 'es');
  });
}

/**
 * La carga más alta de la lista. Es el único referente de la barra: se compara a las
 * personas entre sí, nunca contra una capacidad que la app no conoce.
 *
 * `null` cuando nadie tiene nada abierto: con máximo 0 no hay proporción que dibujar, y
 * pintar barras de ancho cero sería peor que no pintarlas.
 */
export function cargaMaxima(cargas: readonly { abiertas: RepartoAbierto }[]): number | null {
  let maximo = 0;
  for (const carga of cargas) maximo = Math.max(maximo, carga.abiertas.total);
  return maximo === 0 ? null : maximo;
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

/**
 * La misma relación leída desde la PERSONA: en qué proyectos está y con qué rol en cada
 * uno.
 *
 * Es la mitad que la rejilla de equipos no puede enseñar. Con las personas repartidas en
 * tarjetas por proyecto, que alguien esté en tres equipos con tres roles distintos queda
 * disuelto en tres sitios y no se ve nunca; y es justo el dato que decide si a esa persona
 * se le puede pedir algo más.
 *
 * No se duplica ningún dato: se recorre `proyecto.equipo`, que sigue siendo la única
 * fuente. El orden es por número de proyectos descendente — quien está en más equipos es
 * el hallazgo.
 */
export interface PersonaEnEquipos {
  personaId: PersonaId;
  nombre: string;
  activa: boolean;
  equipos: PertenenciaEquipo[];
  /** Tareas abiertas suyas en todo el documento. El costo real de estar en varios sitios. */
  abiertas: number;
}

export function personasEnEquipos(doc: Documento): PersonaEnEquipos[] {
  const indice = indexarTareas(doc);
  const activo = sprintActivo(doc);

  return doc.personas
    .map((persona) => ({
      personaId: persona.id,
      nombre: persona.nombre,
      activa: persona.activa,
      equipos: equiposDe(doc, persona.id),
      abiertas: repartoAbiertoDe(indice, activo, persona.id).total,
    }))
    .sort(
      (a, b) =>
        Number(b.activa) - Number(a.activa) ||
        b.equipos.length - a.equipos.length ||
        b.abiertas - a.abiertas ||
        a.nombre.localeCompare(b.nombre, 'es'),
    );
}
