/**
 * E8 — el cálculo de la pantalla de cierre de sprint.
 *
 * Módulo puro, igual que `derivar.ts` y `clasificar.ts`: sin `fs`, sin `ipc`, sin React,
 * y con `hoy` como parámetro. Existe porque la regla 2 de CLAUDE.md no admite que una
 * vista reparta tareas en bloques, cuente destinos o decida a qué sprint pasan: eso es
 * dominio, y una pantalla que lo calcula en su propio `map` es una pantalla que no se
 * puede probar sin montar React.
 *
 * ## El reparto en bloques, y por qué son cuatro y no tres
 *
 * La pantalla enseña tres: terminadas, sin terminar y bloqueadas. Pero el sprint puede
 * llevar tareas CANCELADAS, y esas no son «sin terminar»: no piden decisión porque ya se
 * decidieron. Se separan en un cuarto bloque que solo informa, y NO viajan en
 * `decisiones`: el contrato dice que el desenlace de lo ya terminado y lo ya cancelado
 * «no se decide, se constata», y el reductor rechaza una decisión sobre ellas. Meterlas
 * al montón de lo indeciso habría sido peor todavía, porque el destino por omisión
 * —«pasa al siguiente sprint»— habría resucitado algo que el usuario mató.
 *
 * Una tarea BLOQUEADA que además está hecha va a «terminadas»: se terminó, y preguntar
 * si sigue detenida sobre algo cerrado no significa nada. El bloqueo abierto solo manda
 * el reparto mientras la tarea siga abierta.
 *
 * ## Los destinos
 *
 * `siguiente` es el destino por omisión y no se guarda: `destinoDe` lo devuelve para
 * toda fila que no esté en el mapa. Así «no tocar nada y pulsar el botón» es exactamente
 * lo que el usuario espera, y el mapa de la interfaz solo lleva las EXCEPCIONES.
 */

import type {
  Bloqueo,
  Documento,
  Fecha,
  ItemSprint,
  Sprint,
} from '../modelo/tipos';
import {
  bloqueoAbierto,
  diasBloqueada,
  estaBloqueada,
  mostrarProcedencia,
  paraVistaSprint,
  sprintsQueLaTocaron,
} from './clasificar';
import { compromisoEfectivo, type Compromiso, type UbicacionTarea } from './derivar';

/**
 * Qué pasa con una tarea que no terminó. Son los tres valores del contrato de
 * `cerrarSprint` acordado con backend; las etiquetas de pantalla viven en el renderer.
 */
export type DestinoCierre = 'siguiente' | 'backlog' | 'descartar';

/** Lo que ocurre si el usuario no toca nada. El contrato lo asume igual del otro lado. */
export const DESTINO_POR_OMISION: DestinoCierre = 'siguiente';

export const DESTINOS: readonly DestinoCierre[] = ['siguiente', 'backlog', 'descartar'];

/** Una fila del cierre: el item, su tarea, y todo lo que la fila muestra ya resuelto. */
export interface FilaCierre {
  item: ItemSprint;
  ubicacion: UbicacionTarea;
  /** El del item si lo tiene, el de la tarea si no. Nunca uno de los dos por su cuenta. */
  compromiso: Compromiso;
  /** Bloqueo vigente, o `null`. Lleva el motivo original, que es lo que la fila enseña. */
  bloqueo: Bloqueo | null;
  /** Días detenida. `null` si no está bloqueada. */
  diasDetenida: number | null;
  /**
   * Sprints por los que ha pasado, este incluido. `> 1` = arrastrada, y ese es el número
   * que se pinta como «2.º» o «3.º sprint». Se deriva de los sprints, no se guarda.
   */
  pasos: number;
  /** ¿La fila pide una decisión de destino? Las terminadas no. */
  decide: boolean;
  /** ¿Se pinta la marca de procedencia? Es un canal aparte del estado (regla 17). */
  nuevo: boolean;
}

export interface BloquesCierre {
  sprint: Sprint;
  terminadas: FilaCierre[];
  sinTerminar: FilaCierre[];
  /** Abiertas y con bloqueo vigente. Bloque propio: la nota original tiene que verse. */
  bloqueadas: FilaCierre[];
  /** Ya se decidieron. Solo se informan: su desenlace se constata, no se decide. */
  canceladas: FilaCierre[];
  /** Lo que pide decisión, en el orden en que se lee la pantalla. Sin canceladas. */
  aDecidir: FilaCierre[];
  /** Items comprometidos en el sprint. Es el denominador de «N de M». */
  total: number;
}

function filaDe(doc: Documento, item: ItemSprint, ubicacion: UbicacionTarea, hoy: Fecha): FilaCierre {
  const { tarea } = ubicacion;
  return {
    item,
    ubicacion,
    compromiso: compromisoEfectivo(item, tarea),
    bloqueo: bloqueoAbierto(tarea),
    diasDetenida: diasBloqueada(tarea, hoy),
    pasos: sprintsQueLaTocaron(doc, tarea.id).length,
    decide: tarea.estado !== 'done',
    nuevo: mostrarProcedencia(tarea),
  };
}

/**
 * Reparte los items del sprint en los bloques de la pantalla de cierre.
 *
 * El orden dentro de cada bloque es el de `items`, que ES la prioridad del sprint: la
 * pantalla no reordena por su cuenta lo que el usuario ordenó arrastrando.
 */
export function bloquesDeCierre(doc: Documento, sprint: Sprint, hoy: Fecha): BloquesCierre {
  const terminadas: FilaCierre[] = [];
  const sinTerminar: FilaCierre[] = [];
  const bloqueadas: FilaCierre[] = [];
  const canceladas: FilaCierre[] = [];

  for (const { item, ubicacion } of paraVistaSprint(doc, sprint)) {
    const fila = filaDe(doc, item, ubicacion, hoy);
    const { estado } = ubicacion.tarea;
    if (estado === 'done') terminadas.push(fila);
    else if (estado === 'cancelada') canceladas.push(fila);
    else if (estaBloqueada(ubicacion.tarea)) bloqueadas.push(fila);
    else sinTerminar.push(fila);
  }

  return {
    sprint,
    terminadas,
    sinTerminar,
    bloqueadas,
    canceladas,
    aDecidir: [...sinTerminar, ...bloqueadas],
    total: terminadas.length + sinTerminar.length + bloqueadas.length + canceladas.length,
  };
}

/** Las excepciones que el usuario marcó. Lo que no está aquí vale `siguiente`. */
export type MapaDestinos = ReadonlyMap<string, DestinoCierre>;

/** El destino vigente de una fila: lo que el usuario marcó, o el de por omisión. */
export function destinoDe(fila: FilaCierre, destinos: MapaDestinos): DestinoCierre {
  return destinos.get(fila.ubicacion.tarea.id) ?? DESTINO_POR_OMISION;
}

export interface ResumenDecisiones {
  /** Ya terminadas: van al registro del sprint cerrado, no a ningún destino. */
  terminadas: number;
  /** Ya canceladas: tampoco se deciden. Se cuentan aparte para no inflar «descartar». */
  canceladas: number;
  siguiente: number;
  backlog: number;
  descartar: number;
  /**
   * De las que pasan al siguiente sprint, las que van sin nadie detrás. Se devuelven las
   * filas y no un conteo: el aviso del pie ofrece arreglarlo, y para eso hace falta saber
   * cuál es la primera.
   */
  sinResponsable: FilaCierre[];
  total: number;
}

/** Cuenta lo que va a pasar. Es lo que dice el botón primario antes de pulsarlo. */
export function resumirDecisiones(bloques: BloquesCierre, destinos: MapaDestinos): ResumenDecisiones {
  const resumen: ResumenDecisiones = {
    terminadas: bloques.terminadas.length,
    canceladas: bloques.canceladas.length,
    siguiente: 0,
    backlog: 0,
    descartar: 0,
    sinResponsable: [],
    total: bloques.total,
  };

  for (const fila of bloques.aDecidir) {
    const destino = destinoDe(fila, destinos);
    if (destino === 'siguiente') {
      resumen.siguiente += 1;
      if (fila.compromiso.responsable === null) resumen.sinResponsable.push(fila);
    } else if (destino === 'backlog') resumen.backlog += 1;
    else resumen.descartar += 1;
  }

  return resumen;
}

export interface DecisionCierre {
  tareaId: string;
  destino: DestinoCierre;
}

/**
 * Las decisiones que viajan en el comando.
 *
 * Se mandan TODAS las que piden decisión, incluidas las que quedaron en el destino por
 * omisión. El contrato permite omitirlas —lo que no se nombra vale `siguiente`—, pero
 * mandarlas explícitas hace que la línea del historial y el `deshacer` describan lo que
 * el usuario vio en pantalla, no lo que el reductor supuso.
 *
 * Lo que NO viaja: las terminadas y las canceladas. Su desenlace se constata, y el
 * reductor rechaza el comando entero si aparece una decisión sobre ellas.
 */
export function decisionesParaComando(bloques: BloquesCierre, destinos: MapaDestinos): DecisionCierre[] {
  return bloques.aDecidir.map((fila) => ({
    tareaId: fila.ubicacion.tarea.id,
    destino: destinoDe(fila, destinos),
  }));
}

/**
 * A qué sprint pasarían las tareas de destino `siguiente`.
 *
 * El primer sprint ya `planeado`, por fecha de inicio — el mismo criterio que el reductor
 * aplica cuando se omite `siguienteSprintId`. Se elige aquí de todos modos para que lo
 * que la pantalla NOMBRA («pasan al Sprint 35») y lo que el comando PIDE sean la misma
 * cosa; si el criterio se quedara solo del otro lado, el botón podría prometer un sprint
 * y el reductor usar otro.
 *
 * `undefined` si no hay ninguno: entonces el comando viaja sin `siguienteSprintId`, el
 * contrato dice que se crea, y la pantalla lo anuncia como «un sprint nuevo» en vez de
 * inventarle un nombre que todavía no existe.
 */
export function siguienteSprintPlaneado(doc: Documento, sprint: Sprint): Sprint | undefined {
  return primerSprintPlaneado(doc, sprint.id, sprint.clave);
}

/**
 * El primer sprint `planeado` por fecha de inicio, o `undefined`.
 *
 * Sirve para dos cosas y por eso está separado: elegir el destino del cierre, y saber qué
 * sprint se puede activar cuando NO hay ninguno activo. Ese segundo caso es el estado en
 * el que queda la app justo después de cerrar, y sin una forma de salir de él el usuario
 * se queda sin sprint y sin manera de empezar el siguiente.
 */
export function primerSprintPlaneado(
  doc: Documento,
  excepto?: string,
  clave?: string | null,
): Sprint | undefined {
  return doc.sprints
    .filter((s) => s.id !== excepto && s.estado === 'planeado' && (clave === undefined || s.clave === clave))
    .sort((a, b) => (a.inicio < b.inicio ? -1 : a.inicio > b.inicio ? 1 : 0))[0];
}

/**
 * Lo que quedó escrito en el sprint cerrado, por desenlace.
 *
 * Los nombres son los del modelo (`item.desenlace`), no los de los destinos que mandamos:
 * el sprint cerrado es el registro, y lo que el resumen cuenta es el registro.
 */
export interface ResumenCierre {
  sprint: Sprint;
  completadas: number;
  /** Pasaron al sprint siguiente. */
  arrastradas: number;
  /** Volvieron al backlog. */
  devueltas: number;
  /** «Ya no aplica»: la tarea quedó cancelada por decisión de este cierre. */
  descartadas: number;
  /** Ya estaban canceladas antes del cierre. No hubo decisión que registrar. */
  canceladas: number;
  /**
   * Desenlace del cierre viejo, anterior a la ceremonia. Se cuenta aparte en vez de
   * sumarlo a otro montón: un documento escrito hace tres meses no debe hacer que el
   * resumen mienta sobre a dónde fue nada.
   */
  sinDecidir: number;
  /** El sprint que recibió lo arrastrado, si algo pasó. Se descubre en el documento. */
  destino: Sprint | undefined;
  /** Cuántas de las arrastradas aparecen de verdad en `destino`. */
  pasaron: number;
}

/**
 * El resumen de lo que acaba de ocurrir, leído del documento POSTERIOR al cierre.
 *
 * No se construye con lo que mandamos: se lee lo que quedó. Si el reductor hizo algo
 * distinto de lo que pedimos, el resumen lo dice en vez de repetirle al usuario su propia
 * intención. Devuelve `null` si el sprint no existe o no quedó cerrado, que es la señal
 * de que la pantalla debe seguir mostrando las decisiones.
 */
export function resumenTrasCierre(doc: Documento, sprintId: string): ResumenCierre | null {
  const sprint = doc.sprints.find((s) => s.id === sprintId);
  if (sprint === undefined || sprint.estado !== 'cerrado') return null;

  let completadas = 0;
  let arrastradas = 0;
  let devueltas = 0;
  let descartadas = 0;
  let canceladas = 0;
  let sinDecidir = 0;
  const arrastradasIds = new Set<string>();
  for (const item of sprint.items) {
    switch (item.desenlace) {
      case 'completada':
        completadas += 1;
        break;
      case 'arrastrada':
        arrastradas += 1;
        arrastradasIds.add(item.tarea_id);
        break;
      case 'devuelta':
        devueltas += 1;
        break;
      case 'descartada':
        descartadas += 1;
        break;
      case 'cancelada':
        canceladas += 1;
        break;
      default:
        // `no_terminada` (cierre viejo) y `null` (no debería pasar en un cerrado).
        sinDecidir += 1;
    }
  }

  // El destino se DESCUBRE: el sprint no cerrado que de verdad recibió lo arrastrado. Así
  // la pantalla nombra el sprint real —lo hayamos elegido nosotros o lo haya creado el
  // reductor— sin dar por hecha ninguna de las dos cosas.
  let destino: Sprint | undefined;
  let pasaron = 0;
  for (const otro of doc.sprints) {
    if (otro.id === sprintId || otro.estado === 'cerrado') continue;
    const cuantas = otro.items.filter((item) => arrastradasIds.has(item.tarea_id)).length;
    if (cuantas > pasaron) {
      destino = otro;
      pasaron = cuantas;
    }
  }

  return {
    sprint,
    completadas,
    arrastradas,
    devueltas,
    descartadas,
    canceladas,
    sinDecidir,
    destino,
    pasaron,
  };
}
