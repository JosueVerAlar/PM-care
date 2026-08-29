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
  /**
   * Contenedores DESCENDIENTES que nadie ha desglosado todavía: historias sin ninguna
   * tarea, y —para un proyecto— también épicas sin ninguna historia.
   *
   * No es un conteo de tareas como el resto de los campos; por eso lleva "contenedores"
   * en el nombre y no se suma a `hojas`. Un contenedor sin desglosar no aporta hojas
   * justamente porque no se sabe cuántas serán, y ese "no se sabe" es el dato.
   *
   * Nunca se cuenta a sí mismo: una épica sin historias tiene 0 aquí y `hojas === 0`,
   * que ya la deja en `sin_desglosar`. Esto mide lo que le falta planear a un contenedor
   * que por lo demás ya parece terminado (regla 2).
   *
   * Se expone para que la vista pueda escribir «6/6 · 1 sin desglosar»: negar el verde
   * sin decir por qué sería peor que el defecto que arregla.
   */
  contenedoresSinDesglosar: number;
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
  contenedoresSinDesglosar: 0,
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
 *
 * `contenedoresSinDesglosar` no se puede deducir de una lista plana de tareas —lo que
 * falta por desglosar es justo lo que no está en la lista—, así que lo aporta quien sí
 * ve el árbol. Por omisión 0: un conjunto suelto de tareas (los items de un sprint, la
 * carga de una persona) no tiene contenedores debajo y no hay nada que le falte planear.
 */
export function contarTareas(
  tareas: readonly Tarea[],
  contenedoresSinDesglosar = 0,
): Avance {
  let hechas = 0;
  let enCurso = 0;
  let pendientes = 0;
  let canceladas = 0;

  for (const tarea of tareas) {
    switch (tarea.estado) {
      case 'done':
        hechas += 1;
        break;
      case 'iniciado':
      case 'en_pruebas':
      case 'terminado':
        enCurso += 1;
        break;
      case 'pendiente':
        pendientes += 1;
        break;
      case 'cancelada':
        canceladas += 1;
        break;
      default: {
        const estadoNoContado: never = tarea.estado;
        throw new Error(`Estado de tarea no contado: ${String(estadoNoContado)}`);
      }
    }
  }

  const hojas = hechas + enCurso + pendientes;
  const pct =
    hojas === 0 ? null : hechas === hojas ? 100 : Math.min(99, Math.round((hechas / hojas) * 100));

  return { hojas, hechas, enCurso, pendientes, canceladas, pct, contenedoresSinDesglosar };
}

/** Cualquier nodo que pueda tener tareas colgando directamente (N9). */
export type Contenedor = Proyecto | Epica | Historia;

/**
 * **La única puerta de acceso a las tareas propias de un nodo.**
 *
 * N9 dejó que una tarea cuelgue de una historia, de una épica o del proyecto: tres sitios
 * donde vivir. El precio de esa flexibilidad es que cualquier función que itere
 * `nodo.tareas` a mano puede recordar dos de los tres y perder las del tercero en
 * silencio — no falla, solo deja de contar. Por eso el acceso está centralizado aquí:
 * **nadie más en el proyecto escribe `.tareas` directamente**, ni el dominio, ni el
 * reductor, ni las vistas.
 *
 * Devuelve las tareas PROPIAS, no las del subárbol. Para el agregado están
 * `tareasDeEpica` y `tareasDeProyecto`, construidos encima de esto.
 */
export function tareasDe(nodo: Contenedor): readonly Tarea[] {
  return nodo.tareas;
}

/**
 * Todas las tareas hoja de una épica, aplanadas: las suyas más las de sus historias.
 *
 * Se aplana a propósito: el avance de una épica se calcula sobre el agregado de sus
 * hojas, no promediando los porcentajes de sus historias (regla 5). Tres historias de
 * una tarea cada una con una hecha dan 33%; promediando 100/0/0 saldría el mismo número
 * por casualidad, pero con 2/1/1 tareas ya no coincide, y ese es el caso normal.
 */
export function tareasDeEpica(epica: Epica): Tarea[] {
  const tareas: Tarea[] = [...tareasDe(epica)];
  for (const historia of epica.historias) tareas.push(...tareasDe(historia));
  return tareas;
}

export function tareasDeProyecto(proyecto: Proyecto): Tarea[] {
  const tareas: Tarea[] = [...tareasDe(proyecto)];
  for (const epica of proyecto.epicas) tareas.push(...tareasDeEpica(epica));
  return tareas;
}

/**
 * "Sin desglosar" es literalmente NO TENER HIJOS, no "no tener hojas contables".
 *
 * La distinción importa en un caso real: una historia con dos tareas canceladas también
 * da `hojas === 0`, pero esa sí se desglosó — se desglosó y luego se descartó el trabajo.
 * No falta planearla, así que no debe impedir que su épica se declare terminada. La que
 * lo impide es la historia que nadie ha abierto todavía: ahí no se sabe si lo que falta
 * son dos tareas o veinte.
 */
export function sinDesglosarDeEpica(epica: Epica): number {
  let cuantos = 0;
  for (const historia of epica.historias) if (tareasDe(historia).length === 0) cuantos += 1;
  return cuantos;
}

/** ¿Este nodo no tiene absolutamente nada debajo? Es lo que significa «sin desglosar». */
function vacia(epica: Epica): boolean {
  return epica.historias.length === 0 && tareasDe(epica).length === 0;
}

/**
 * Cuenta los dos niveles: épicas sin ninguna historia e historias sin ninguna tarea.
 *
 * Una épica con tres historias vacías aporta 3, no 1 ni 4: ella sí está desglosada
 * —tiene historias—, y lo que falta por planear son sus tres historias. El número que
 * la vista enseña es "cuántas cosas hay que abrir", y son tres.
 */
export function sinDesglosarDeProyecto(proyecto: Proyecto): number {
  let cuantos = 0;
  for (const epica of proyecto.epicas) {
    // Una épica con tareas colgadas de ella y sin historias SÍ está desglosada (N9): el
    // trabajo está a la vista, solo que sin un nivel intermedio que nadie necesitaba.
    if (vacia(epica)) cuantos += 1;
    else cuantos += sinDesglosarDeEpica(epica);
  }
  return cuantos;
}

/** Una historia solo tiene tareas debajo, y una tarea no se desglosa: siempre 0. */
export function avanceDeHistoria(historia: Historia): Avance {
  return contarTareas(tareasDe(historia), 0);
}

export function avanceDeEpica(epica: Epica): Avance {
  return contarTareas(tareasDeEpica(epica), sinDesglosarDeEpica(epica));
}

export function avanceDeProyecto(proyecto: Proyecto): Avance {
  return contarTareas(tareasDeProyecto(proyecto), sinDesglosarDeProyecto(proyecto));
}

/**
 * Estado heredado de un contenedor. Se deriva siempre; nunca se persiste.
 *
 * "En movimiento" es exactamente
 * `hojas > 0 && (hechas + enCurso) > 0 && (hechas < hojas || contenedoresSinDesglosar > 0)`.
 *
 * ## Por qué `hecha` exige que no quede nada sin desglosar
 *
 * Una épica con sus 6 tareas cerradas y una historia que nadie ha abierto NO está
 * terminada: está terminada *hasta donde alguien se ha molestado en planearla*. Declararla
 * `hecha` es la misma mentira que pintar `0 %` en un contenedor vacío, y la regla 2 la
 * prohíbe por el mismo motivo — una historia sin tareas no significa que no haya trabajo,
 * significa que nadie lo ha desglosado todavía. El verde ahí esconde justo lo que hay que
 * hacer a continuación: abrir esa historia.
 *
 * Cae en `en_movimiento` y no en un estado nuevo: hay avance real y no está terminado, que
 * es exactamente lo que ese valor significa. La paleta validada solo soporta cuatro
 * estados, y un quinto obligaría a rehacer la validación de contraste y daltonismo para
 * decir algo que el conteo ya dice mejor. Lo que la vista pinta al lado —«6/6 · 1 sin
 * desglosar»— es lo que informa; el color solo tiene que dejar de mentir.
 *
 * Límite conocido: un contenedor cuyas tareas están todas canceladas da `hojas === 0` y
 * por tanto `sin_desglosar`. La vista distingue ese caso mirando `avance.canceladas > 0`;
 * tampoco ahí se añade un quinto estado.
 */
export function estadoDerivado(avance: Avance): EstadoDerivado {
  if (avance.hojas === 0) return 'sin_desglosar';
  if (avance.hechas === avance.hojas && avance.contenedoresSinDesglosar === 0) return 'hecha';
  if (avance.hechas + avance.enCurso > 0) return 'en_movimiento';
  return 'pendiente';
}

// --- índice y ubicación -----------------------------------------------------

/**
 * Dónde vive una tarea.
 *
 * `historia` y `epica` son opcionales desde N9: la jerarquía organiza, no es requisito.
 * Una tarea de Infraestructura puede colgar del proyecto sin nada de por medio, y el
 * `null` lo dice en el tipo para que ninguna vista lo descubra en ejecución.
 *
 * `proyecto` nunca es nulo: toda tarea pertenece a un proyecto, y su id lo lleva escrito.
 */
export interface UbicacionTarea {
  tarea: Tarea;
  historia: Historia | null;
  epica: Epica | null;
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
    // Los tres sitios donde una tarea puede colgar (N9), de menos a más profundo.
    for (const tarea of tareasDe(proyecto)) {
      indice.set(tarea.id, { tarea, historia: null, epica: null, proyecto });
    }
    for (const epica of proyecto.epicas) {
      for (const tarea of tareasDe(epica)) {
        indice.set(tarea.id, { tarea, historia: null, epica, proyecto });
      }
      for (const historia of epica.historias) {
        for (const tarea of tareasDe(historia)) {
          indice.set(tarea.id, { tarea, historia, epica, proyecto });
        }
      }
    }
  }
  return indice;
}

/**
 * Migaja de una tarea: `["SICOE", "Regularización", "Grupos de regularización"]`.
 *
 * Desde N9 puede tener uno, dos o tres tramos. Se omiten los niveles que no existen en
 * vez de rellenarlos con «—» o con una épica inventada: una migaja de un solo tramo dice
 * la verdad —esta tarea cuelga del proyecto— y una con un hueco no dice nada.
 */
export function rutaDe(ubicacion: UbicacionTarea): string[] {
  const ruta = [ubicacion.proyecto.clave];
  if (ubicacion.epica) ruta.push(ubicacion.epica.titulo);
  if (ubicacion.historia) ruta.push(ubicacion.historia.titulo);
  return ruta;
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

/** El sprint activo de una serie concreta; `null` nombra la serie transversal legada. */
export function sprintActivo(doc: Documento, clave: string | null): Sprint | undefined {
  const propio = doc.sprints.find((sprint) => sprint.estado === 'activo' && sprint.clave === clave);
  // Un transversal legado sigue siendo visible desde cada proyecto mientras ese proyecto
  // no tenga uno propio; ocultarlo rompería la lectura de documentos v1 ya migrados.
  return propio ?? (clave === null
    ? undefined
    : doc.sprints.find((sprint) => sprint.estado === 'activo' && sprint.clave === null));
}

/** Todos los activos del documento para las vistas generales, sin fingir que son uno. */
export function sprintsActivos(doc: Documento): Sprint[] {
  return doc.sprints.filter((sprint) => sprint.estado === 'activo');
}

/** Sprints cerrados, del más viejo al más nuevo. */
export function sprintsCerrados(doc: Documento): Sprint[] {
  return doc.sprints
    .filter((sprint) => sprint.estado === 'cerrado')
    .slice()
    .sort((a, b) => (a.inicio < b.inicio ? -1 : a.inicio > b.inicio ? 1 : 0));
}
