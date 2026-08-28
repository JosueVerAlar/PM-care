/**
 * Cuánto se tardó en resolver una tarea, y los promedios que salen de ahí.
 *
 * ## El reloj, y por qué es este
 *
 * Decisión del usuario: **el tiempo corre desde que arranca el sprint hasta que él marca
 * la tarea como completada.** No desde que la tarea se creó ni desde que pasó a «en
 * curso»: desde el compromiso.
 *
 * Con un matiz que no cambia la regla sino que la protege. Una tarea metida al sprint a
 * mitad de la quincena no puede cargar con los días en que ni siquiera estaba
 * comprometida, así que el arranque se topa:
 *
 *     inicio = max(sprint.inicio, item.comprometida_en)
 *
 * Para la tarea que estuvo desde el arranque —el caso normal— las dos expresiones dan lo
 * mismo. Para la que entró el día 8 de una quincena, la diferencia son siete días que no
 * existieron.
 *
 * ## Qué NO se puede contestar, y no se disimula
 *
 * - Una tarea que se cerró **fuera de todo sprint** no tiene duración: `null`, jamás `0`.
 *   Con la forma de trabajar del usuario esto va a pasar seguido, y por eso todo promedio
 *   dice sobre cuántas se calculó.
 * - Una tarea que pasó por **tres sprints** se mide contra el sprint en el que se cerró, no
 *   contra el primero. Sumar los tres contaría como trabajo el tiempo en que estuvo
 *   esperando en una cola. El arrastre no se pierde: se cuenta aparte, en sprints, que es
 *   su unidad natural.
 * - **Nada de esto es reconstruible hacia atrás.** Lo cerrado antes de que existieran
 *   `comprometida_en` y este módulo no tiene duración y no la va a tener nunca.
 *
 * Puro: recibe el documento y devuelve números. Sin React, sin disco, sin reloj.
 */

import { fechaDe } from './clasificar';
import { indexarTareas, type UbicacionTarea } from './derivar';
import type {
  Documento,
  Instante,
  PersonaId,
  Sprint,
  Tarea,
} from '../modelo/tipos';

/** Bajo este número de tareas, un promedio es ruido con formato de dato. */
export const MINIMO_TAREAS_PARA_PROMEDIO = 5;

const MS_POR_DIA = 86_400_000;

/**
 * Días entre dos instantes, con un decimal.
 *
 * A diferencia de `diasEntre`, que cuenta días de CALENDARIO para responder «¿cuántos
 * días lleva quieto?», aquí interesa el transcurso real: una tarea cerrada en cuatro
 * horas dura 0.2 días, no 0 y no 1. Redondear a días enteros haría que todo lo resuelto
 * el mismo día valiera cero y hundiría cualquier promedio.
 */
function diasEntreInstantes(desde: Instante, hasta: Instante): number | null {
  const a = Date.parse(desde);
  const b = Date.parse(hasta);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  // Un cierre anterior al arranque significa datos editados a mano en desorden. No se
  // corrige inventando un cero: se declara no calculable, que es lo que es.
  if (b < a) return null;
  return Math.round(((b - a) / MS_POR_DIA) * 10) / 10;
}

/** La resolución de UNA tarea, con todo lo que hace falta para explicarla. */
export interface Resolucion {
  tarea: Tarea;
  /** El sprint en el que se cerró. */
  sprint: Sprint;
  /** Días desde el arranque efectivo hasta `hecha_en`. */
  dias: number;
  /** Quién la cerró: el responsable del item si lo hay, si no el de la tarea. */
  responsable: PersonaId | null;
  clave: string;
  /**
   * Por cuántos sprints pasó antes de cerrarse, este incluido. `1` es lo normal; `3`
   * significa que se arrastró dos veces, y eso NO está dentro de `dias`.
   */
  sprintsAtravesados: number;
}

/** El `-06:00`, el `+02:00` o el `Z` con el que se escribió un instante. */
const DESPLAZAMIENTO = /(Z|[+-]\d{2}:\d{2})$/;

/**
 * El arranque de un sprint como instante, en el MISMO huso que la referencia.
 *
 * El sprint guarda `inicio` como fecha suelta (`2026-08-24`), sin hora ni huso. Construir
 * el instante como `2026-08-24T00:00:00` a secas lo interpretaría en la zona de la
 * máquina, y entonces la misma tarea duraría distinto según dónde se abriera la app —seis
 * horas de diferencia entre este Mac y un servidor en UTC, en silencio y sin fallar—.
 * Tomando el desplazamiento del instante contra el que se va a restar, la cuenta se hace
 * entera dentro del huso en que el usuario trabaja.
 *
 * Sin referencia utilizable se cae a `Z`: es arbitrario, pero es explícito y estable, que
 * es justo lo que la zona de la máquina no es.
 */
function arranqueDelSprint(sprint: Sprint, referencia: Instante): Instante {
  const huso = DESPLAZAMIENTO.exec(referencia)?.[1] ?? 'Z';
  return `${sprint.inicio}T00:00:00${huso}`;
}

/**
 * El instante en que el reloj empieza a correr para esta tarea en este sprint.
 *
 * La regla es «desde que arranca el sprint», y el tope solo existe para la tarea que se
 * metió DÍAS después. Por eso se compara por día de calendario y no por instante: una
 * tarea comprometida a las nueve de la mañana del primer día cuenta desde el arranque —o
 * el reloj le regalaría nueve horas por haberla capturado temprano, que es justo lo
 * contrario de lo que uno quiere premiar—. La que entró el día 8 sí empieza el día 8.
 */
function arranqueEfectivo(
  sprint: Sprint,
  comprometidaEn: Instante | null,
  referencia: Instante,
): Instante {
  const inicio = arranqueDelSprint(sprint, referencia);
  if (comprometidaEn === null) return inicio;
  if (fechaDe(comprometidaEn) <= sprint.inicio) return inicio;
  return comprometidaEn;
}

/**
 * En qué sprint se cerró la tarea.
 *
 * El que la tenía comprometida y ya había arrancado cuando se marcó hecha. Si varios
 * cumplen —una tarea arrastrada— gana el que arrancó más tarde: es el sprint durante el
 * cual se cerró de verdad.
 */
function sprintDelCierre(doc: Documento, tareaId: string, hechaEn: Instante): Sprint | null {
  let elegido: Sprint | null = null;
  for (const sprint of doc.sprints) {
    if (!sprint.items.some((item) => item.tarea_id === tareaId)) continue;
    if (sprint.inicio > fechaDe(hechaEn)) continue;
    if (elegido === null || sprint.inicio > elegido.inicio) elegido = sprint;
  }
  return elegido;
}

/**
 * La resolución de una tarea, o `null` si no es calculable.
 *
 * Devuelve `null` —nunca un cero— en los tres casos honestos: no está hecha, no tiene
 * `hecha_en`, o se cerró sin haber pasado por ningún sprint.
 */
export function resolucionDe(doc: Documento, ubicacion: UbicacionTarea): Resolucion | null {
  const { tarea } = ubicacion;
  if (tarea.estado !== 'hecha' || tarea.hecha_en === null) return null;

  const sprint = sprintDelCierre(doc, tarea.id, tarea.hecha_en);
  if (sprint === null) return null;

  const item = sprint.items.find((i) => i.tarea_id === tarea.id);
  const dias = diasEntreInstantes(
    // La referencia de huso es el cierre: es el instante contra el que se va a restar.
    arranqueEfectivo(sprint, item?.comprometida_en ?? null, tarea.hecha_en),
    tarea.hecha_en,
  );
  if (dias === null) return null;

  return {
    tarea,
    sprint,
    dias,
    // El compromiso manda sobre la tarea: es quien se llevó ESE sprint.
    responsable: item?.responsable ?? tarea.responsable,
    clave: ubicacion.proyecto.clave,
    sprintsAtravesados: doc.sprints.filter((s) => s.items.some((i) => i.tarea_id === tarea.id)).length,
  };
}

/** Todas las resoluciones calculables del documento. */
export function resoluciones(doc: Documento): Resolucion[] {
  const salida: Resolucion[] = [];
  for (const ubicacion of indexarTareas(doc).values()) {
    const resolucion = resolucionDe(doc, ubicacion);
    if (resolucion !== null) salida.push(resolucion);
  }
  return salida;
}

/**
 * Un promedio y lo que hace falta para creérselo.
 *
 * `promedio` es `null` por debajo del mínimo, y entonces solo vale `cuentan`. Sin esto,
 * «14.0 días de promedio» calculado sobre una sola tarea se lee igual de firme que uno
 * calculado sobre cuarenta, y es la forma más fácil de mentir con un número real.
 */
export interface Promedio {
  /** Días, con un decimal. `null` si no hay suficientes para que signifique algo. */
  promedio: number | null;
  /** La del medio. Aguanta mejor una tarea que se quedó seis meses abierta. */
  mediana: number | null;
  /** Sobre cuántas tareas se calculó. */
  cuentan: number;
  /** Cuántas se cerraron sin poder medirse. Es la letra chica del promedio. */
  sinMedir: number;
  masLenta: Resolucion | null;
}

const VACIO: Promedio = {
  promedio: null,
  mediana: null,
  cuentan: 0,
  sinMedir: 0,
  masLenta: null,
};

export function promediar(medidas: readonly Resolucion[], sinMedir = 0): Promedio {
  if (medidas.length === 0) return { ...VACIO, sinMedir };

  const dias = medidas.map((m) => m.dias).sort((a, b) => a - b);
  const suma = dias.reduce((a, b) => a + b, 0);
  const mitad = Math.floor(dias.length / 2);
  const mediana =
    dias.length % 2 === 1 ? dias[mitad]! : ((dias[mitad - 1]! + dias[mitad]!) / 2);

  const bastantes = medidas.length >= MINIMO_TAREAS_PARA_PROMEDIO;
  return {
    promedio: bastantes ? Math.round((suma / dias.length) * 10) / 10 : null,
    mediana: bastantes ? Math.round(mediana * 10) / 10 : null,
    cuentan: medidas.length,
    sinMedir,
    masLenta: medidas.reduce((peor, m) => (peor === null || m.dias > peor.dias ? m : peor), null as Resolucion | null),
  };
}

/** Una fila de la tabla de tiempos: quién o qué, y su promedio. */
export interface FilaTiempo {
  id: string;
  nombre: string;
  tiempo: Promedio;
}

/** Cuántas tareas se cerraron sin poder medirse, para dar la letra chica del promedio. */
function cerradasSinMedir(doc: Documento, incluye: (u: UbicacionTarea) => boolean): number {
  let n = 0;
  for (const ubicacion of indexarTareas(doc).values()) {
    if (ubicacion.tarea.estado !== 'hecha' || !incluye(ubicacion)) continue;
    if (resolucionDe(doc, ubicacion) === null) n += 1;
  }
  return n;
}

/**
 * Tiempo medio de resolución por persona.
 *
 * Se atribuye a quien tenía el compromiso en el sprint donde se cerró, no a quien figura
 * hoy en la tarea: reasignar algo el mes que viene no puede reescribir quién lo resolvió.
 */
export function tiempoPorPersona(doc: Documento): FilaTiempo[] {
  const nombres = new Map(doc.personas.map((p) => [p.id, p.nombre]));
  const porPersona = new Map<PersonaId, Resolucion[]>();

  for (const resolucion of resoluciones(doc)) {
    if (resolucion.responsable === null) continue;
    const lista = porPersona.get(resolucion.responsable) ?? [];
    lista.push(resolucion);
    porPersona.set(resolucion.responsable, lista);
  }

  return [...porPersona.entries()]
    .map(([id, medidas]) => ({
      id,
      // Un id que ya no está en el catálogo se enseña tal cual, nunca se esconde: la
      // tarea existió y su tiempo también (misma decisión que `nombreDePersona`).
      nombre: nombres.get(id) ?? id,
      tiempo: promediar(
        medidas,
        cerradasSinMedir(doc, (u) => u.tarea.responsable === id),
      ),
    }))
    .sort((a, b) => b.tiempo.cuentan - a.tiempo.cuentan);
}

/** Tiempo medio de resolución por proyecto. */
export function tiempoPorProyecto(doc: Documento): FilaTiempo[] {
  const porClave = new Map<string, Resolucion[]>();
  for (const resolucion of resoluciones(doc)) {
    const lista = porClave.get(resolucion.clave) ?? [];
    lista.push(resolucion);
    porClave.set(resolucion.clave, lista);
  }

  return doc.proyectos
    .filter((proyecto) => porClave.has(proyecto.clave))
    .map((proyecto) => ({
      id: proyecto.clave,
      nombre: proyecto.nombre,
      tiempo: promediar(
        porClave.get(proyecto.clave) ?? [],
        cerradasSinMedir(doc, (u) => u.proyecto.clave === proyecto.clave),
      ),
    }));
}

/**
 * Tiempo medio por equipo.
 *
 * «Equipo» es el conjunto de personas adscritas a un proyecto, así que una tarea cuenta
 * para el equipo del proyecto en que vive. La misma persona puede estar en varios equipos
 * —Jesús Alberto está en SICOE y en Infraestructura— y su tiempo cuenta en cada uno por
 * las tareas de ese proyecto, no dos veces por la misma tarea.
 */
export function tiempoPorEquipo(doc: Documento): FilaTiempo[] {
  return tiempoPorProyecto(doc).filter((fila) => {
    const proyecto = doc.proyectos.find((p) => p.clave === fila.id);
    return proyecto !== undefined && proyecto.equipo.length > 0;
  });
}

// --- esfuerzo ---------------------------------------------------------------

/**
 * Una suma de esfuerzo, con su letra chica pegada.
 *
 * Nunca se devuelve el total a secas. `34 pts` sobre veinte tareas de las que catorce no
 * están estimadas es un número inventado con formato de dato, y es exactamente la misma
 * mentira que el `0%` de la regla 2.
 */
export interface Esfuerzos {
  /** Suma de los estimados. `null` si no hay ninguno: cero puntos y «sin estimar» no son
   *  lo mismo, y el cero es el que engaña. */
  puntos: number | null;
  estimadas: number;
  total: number;
}

export function sumarEsfuerzo(tareas: readonly Tarea[]): Esfuerzos {
  let puntos = 0;
  let estimadas = 0;
  for (const tarea of tareas) {
    if (tarea.esfuerzo === null) continue;
    puntos += tarea.esfuerzo;
    estimadas += 1;
  }
  return { puntos: estimadas === 0 ? null : puntos, estimadas, total: tareas.length };
}

/**
 * Días por punto de esfuerzo: cuánto tarda de verdad lo que se estimó en 3.
 *
 * Solo sobre las tareas que tienen las DOS cosas —estimación y duración—. Es lo que
 * permite ver si la escala de alguien está calibrada, y la única lectura honesta de
 * comparar estimado contra real: describe lo que pasó, no promete lo que va a pasar.
 */
export function diasPorPunto(medidas: readonly Resolucion[]): number | null {
  let dias = 0;
  let puntos = 0;
  for (const m of medidas) {
    if (m.tarea.esfuerzo === null) continue;
    dias += m.dias;
    puntos += m.tarea.esfuerzo;
  }
  if (puntos === 0) return null;
  return Math.round((dias / puntos) * 10) / 10;
}
