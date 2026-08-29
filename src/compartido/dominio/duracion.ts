/**
 * El reloj de tramos: cuánto se TRABAJÓ en una tarea, y los promedios que salen de ahí.
 *
 * ## Qué murió aquí en M5, y por qué
 *
 * Hasta esta etapa la duración se anclaba al sprint: `aceptada_en` menos
 * `max(sprint.inicio, item.comprometida_en)`. Tres funciones sostenían ese anclaje
 * —`arranqueDelSprint`, `arranqueEfectivo` y `sprintDelCierre`— y con ellas se van los
 * tres defectos que producía:
 *
 * 1. **Atribuía a un sprint cierres de semanas después.** Una tarea que salió del sprint
 *    y se terminó tres semanas más tarde devolvía veintitantos días: un número creíble y
 *    falso, que es peor que no dar ninguno. El parche fue exigir que el sprint
 *    *contuviera* el cierre, y el parche dejó fuera de la medición todo lo demás.
 * 2. **`sprint.inicio` es una fecha suelta, sin hora ni huso.** Convertirla en instante
 *    obligaba a adivinar el desplazamiento, y la misma tarea duraba distinto según dónde
 *    se abriera la app. Un tramo, en cambio, nace ya escrito como instante con su huso.
 * 3. **Cerrar fuera de todo sprint no daba duración.** Con la forma de trabajar del
 *    usuario ese es el caso frecuente, no el raro: la métrica hablaba de una rebanada del
 *    trabajo y se leía como si hablara de todo.
 *
 * ## El reloj que queda (regla 21)
 *
 * La tarea guarda `trabajo: { desde, hasta, estado }[]`. El reductor —único escritor, en
 * `cambiarEstado`— abre un tramo al entrar en un estado de trabajo y lo cierra al salir.
 * **La duración es la SUMA de los tramos cerrados, nunca `fin − inicio`** y nunca depende
 * de un sprint. De ese dato salen las tres lecturas que nacen con esta etapa:
 *
 * - la **suma** de tramos, que es la duración;
 * - el **desglose** desarrollo / pruebas, derivado del `estado` que cada tramo guarda —por
 *   eso lo guarda: el día que se decida si el reloj corre en `en_pruebas` no hay que
 *   migrar nada, se cambia la lectura;
 * - el **tiempo trabajado contra el de calendario**, que es la diferencia entre lo que
 *   costó y lo que tardó. Esa diferencia es espera, y el reloj viejo la contaba como
 *   trabajo porque era lo único que sabía medir.
 *
 * ## Lo que se sigue negando a contestar
 *
 * - Sin tramos cerrados: `null`, **jamás `0`**. Un cero afirma «no costó tiempo»; `null`
 *   dice «no se midió», que es lo que pasa con todo lo cerrado antes de que existiera
 *   este reloj. Nada de esto es reconstruible hacia atrás y no se inventa.
 * - **El tramo abierto no se suma nunca.** Una tarea olvidada en `iniciado` tres meses
 *   diría «tres meses de trabajo», que es la misma mentira de calendario que todo esto
 *   existe para evitar. Se presenta aparte, como «corriendo desde hace N días».
 * - Ningún promedio por debajo de `MINIMO_TAREAS_PARA_PROMEDIO`, y todos dicen sobre
 *   cuántas tareas se calcularon.
 *
 * Puro: recibe el documento y devuelve números. Sin React, sin disco y sin reloj — `hoy`
 * entra como parámetro en las dos funciones que no pueden pasar sin él.
 */

import { diasEntre, fechaDe } from './clasificar';
import { indexarTareas, type UbicacionTarea } from './derivar';
import type {
  Documento,
  EstadoTarea,
  Fecha,
  Instante,
  PersonaId,
  Sprint,
  Tarea,
  TramoTrabajo,
} from '../modelo/tipos';

/** Bajo este número de tareas, un promedio es ruido con formato de dato. */
export const MINIMO_TAREAS_PARA_PROMEDIO = 5;

/**
 * Días que puede llevar corriendo un tramo abierto antes de darlo por olvidado.
 *
 * Una semana laboral. Por debajo de eso «corriendo» es lo normal —es trabajo en marcha—;
 * por encima ya no describe a alguien trabajando sino a alguien que cambió de tarea sin
 * mover el estado, y esos son los tramos que crecerían para siempre. Ni los olvidados ni
 * los otros entran a ningún promedio: la distinción solo decide cómo se presentan.
 */
export const UMBRAL_TRAMO_OLVIDADO = 5;

/** Los estados en los que el reloj corre, tal como el esquema los admite en un tramo. */
export type EstadoConReloj = TramoTrabajo['estado'];

/** ¿Corre el reloj en este estado? Regla 21: corre en desarrollo y en pruebas. */
export function esTrabajo(estado: EstadoTarea): estado is EstadoConReloj {
  return estado === 'iniciado' || estado === 'en_pruebas';
}

const MS_POR_DIA = 86_400_000;

/** Un número de días a un decimal. Media jornada importa; media hora no. */
function aUnDecimal(dias: number): number {
  return Math.round(dias * 10) / 10;
}

/**
 * Días entre dos instantes, SIN redondear. `null` si no son medibles.
 *
 * El crudo existe porque una suma de tramos redondeados no es el redondeo de la suma: dos
 * tramos de cuatro horas valen 0.2 cada uno redondeados y 0.4 sumados, cuando lo real es
 * 0.3, y con diez tramos el error inventado es medio día. **Se suma en crudo y se redondea
 * una sola vez, al final**, que es la regla de siempre: el redondeo es presentación.
 */
function diasCrudos(desde: Instante, hasta: Instante): number | null {
  const a = Date.parse(desde);
  const b = Date.parse(hasta);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  // Un final anterior al inicio significa datos editados a mano en desorden. No se corrige
  // inventando un cero: se declara no calculable, que es lo que es.
  if (b < a) return null;
  return (b - a) / MS_POR_DIA;
}

/**
 * Días entre dos instantes, con un decimal.
 *
 * A diferencia de `diasEntre`, que cuenta días de CALENDARIO para responder «¿cuántos
 * días lleva quieto?», aquí interesa el transcurso real: una tarea trabajada cuatro horas
 * dura 0.2 días, no 0 y no 1. Redondear a días enteros haría que todo lo hecho el mismo
 * día valiera cero y hundiría cualquier promedio.
 */
function diasEntreInstantes(desde: Instante, hasta: Instante): number | null {
  const crudo = diasCrudos(desde, hasta);
  return crudo === null ? null : aUnDecimal(crudo);
}

// --- el reloj de UNA tarea --------------------------------------------------

/**
 * El tiempo en desarrollo de UNA tarea: la SUMA de sus tramos cerrados.
 *
 * `desarrollo` y `pruebas` son `null` —no `0`— cuando no hubo ningún tramo de ese tipo:
 * una tarea que nunca pasó por pruebas no probó durante cero días, es que no se midió.
 */
export interface TiempoEnDesarrollo {
  /** Suma de los tramos CERRADOS, en días con un decimal. `null` = ninguno medible. */
  dias: number | null;
  /** Cuántos tramos cerrados la componen. Un total sin su conteo es un número suelto. */
  tramos: number;
  /** La parte que se pasó en `iniciado`. */
  desarrollo: number | null;
  /** La parte que se pasó en `en_pruebas`. */
  pruebas: number | null;
  /** Arranque del tramo que sigue corriendo, si lo hay. NUNCA entra en `dias`. */
  corriendoDesde: Instante | null;
}

export function tiempoEnDesarrollo(tarea: Tarea): TiempoEnDesarrollo {
  let tramos = 0;
  let desarrollo: number | null = null;
  let pruebas: number | null = null;
  let corriendoDesde: Instante | null = null;

  for (const tramo of tarea.trabajo) {
    if (tramo.hasta === null) {
      corriendoDesde = tramo.desde;
      continue;
    }
    // `null` = tramo en desorden (editado a mano). Se descarta, no se corrige con un cero:
    // un cero se sumaría y bajaría el total sin que nadie lo note.
    const dias = diasCrudos(tramo.desde, tramo.hasta);
    if (dias === null) continue;
    tramos += 1;
    if (tramo.estado === 'en_pruebas') pruebas = (pruebas ?? 0) + dias;
    else desarrollo = (desarrollo ?? 0) + dias;
  }

  if (tramos === 0) {
    return { dias: null, tramos: 0, desarrollo: null, pruebas: null, corriendoDesde };
  }
  return {
    // El total se redondea sobre el crudo, no sobre las mitades ya redondeadas: es el
    // número que entra en todos los promedios y es el que tiene que ser fiel. La
    // consecuencia aceptada es que `desarrollo + pruebas` puede diferir del total en una
    // décima; el desglose es lectura, el total es la medida.
    dias: aUnDecimal((desarrollo ?? 0) + (pruebas ?? 0)),
    tramos,
    desarrollo: desarrollo === null ? null : aUnDecimal(desarrollo),
    pruebas: pruebas === null ? null : aUnDecimal(pruebas),
    corriendoDesde,
  };
}

/**
 * El tramo que sigue corriendo, medido contra el día de quien mira.
 *
 * Vive fuera de `tiempoEnDesarrollo` a propósito: un tramo abierto no tiene final, así
 * que la única forma de darle un número es consultar un reloj, y `tiempoEnDesarrollo`
 * tiene que dar lo mismo hoy que mañana. Aquí el reloj entra como parámetro y se ve.
 */
export interface RelojCorriendo {
  desde: Instante;
  /** Días de calendario que lleva abierto. No es tiempo trabajado y no se suma a nada. */
  dias: number;
  /** Por encima del umbral: no describe trabajo en marcha, describe un olvido. */
  olvidado: boolean;
}

export function relojCorriendo(tarea: Tarea, hoy: Fecha): RelojCorriendo | null {
  const abierto = tarea.trabajo.find((tramo) => tramo.hasta === null);
  if (abierto === undefined) return null;
  const dias = diasEntre(fechaDe(abierto.desde), hoy);
  return { desde: abierto.desde, dias, olvidado: dias > UMBRAL_TRAMO_OLVIDADO };
}

/** Una tarea con el reloj corriendo, con lo que hace falta para nombrarla en pantalla. */
export interface Corriendo extends RelojCorriendo {
  tarea: Tarea;
  clave: string;
}

/**
 * Todo lo que tiene el reloj corriendo ahora mismo, lo más viejo primero.
 *
 * Nada de esto entra en ningún promedio —no hay tramo cerrado que sumar—, y esa es
 * justamente la razón de listarlo aparte: si no se enseñara, una tarea olvidada tres
 * meses en `iniciado` sería invisible en la única pantalla que mide tiempo.
 */
export function relojesCorriendo(doc: Documento, hoy: Fecha): Corriendo[] {
  const salida: Corriendo[] = [];
  for (const ubicacion of indexarTareas(doc).values()) {
    const reloj = relojCorriendo(ubicacion.tarea, hoy);
    if (reloj === null) continue;
    salida.push({ ...reloj, tarea: ubicacion.tarea, clave: ubicacion.proyecto.clave });
  }
  return salida.sort((a, b) => b.dias - a.dias);
}

// --- lo medido de todo el documento -----------------------------------------

/** Lo que costó una tarea cerrada, con todo lo que hace falta para explicarlo. */
export interface Resolucion {
  tarea: Tarea;
  /** Días TRABAJADOS: la suma de los tramos cerrados. Nunca `fin − inicio`. */
  dias: number;
  /** Cuántos tramos la componen. `2` significa que se retomó una vez. */
  tramos: number;
  desarrollo: number | null;
  pruebas: number | null;
  /**
   * Días de calendario del arranque del primer tramo al final del último. Siempre `>=
   * dias`, y la diferencia entre los dos es espera, no trabajo.
   */
  calendario: number | null;
  /** Quién la cerró: el responsable del item del sprint si lo hay, si no el de la tarea. */
  responsable: PersonaId | null;
  clave: string;
  /**
   * Por cuántos sprints pasó, si pasó por alguno. `0` es normal y ya no impide medir: el
   * reloj no depende del sprint. `3` significa que se arrastró dos veces, y ese arrastre
   * NO está dentro de `dias` — se cuenta en sprints, que es su unidad natural.
   */
  sprintsAtravesados: number;
}

/** El primer arranque y el último final de los tramos cerrados de una tarea. */
function ventanaDeTramos(tarea: Tarea): { desde: Instante; hasta: Instante } | null {
  let desde: Instante | null = null;
  let hasta: Instante | null = null;
  for (const tramo of tarea.trabajo) {
    if (tramo.hasta === null) continue;
    if (diasCrudos(tramo.desde, tramo.hasta) === null) continue;
    // Por extremos y no por posición: un archivo editado a mano puede traerlos desordenados.
    if (desde === null || tramo.desde < desde) desde = tramo.desde;
    if (hasta === null || tramo.hasta > hasta) hasta = tramo.hasta;
  }
  return desde === null || hasta === null ? null : { desde, hasta };
}

/**
 * A quién se le atribuye una tarea: **manda el compromiso del sprint**, y el campo de la
 * tarea es el respaldo. Reasignar algo el mes que viene no puede reescribir quién lo hizo.
 *
 * La regla vive aquí, en una sola función, porque tiene que gobernar **las dos mitades de
 * la misma fila**. Mientras fueron dos expresiones se separaron: el numerador de
 * `tiempoPorPersona` («cuántas resolvió») usaba el compromiso y su letra chica («cuántas
 * quedaron sin medir») usaba `tarea.responsable`, así que las dos frases de una fila
 * hablaban de personas distintas. A quien le reasignaran una tarea le colgaba un «sin
 * medir» que era de otro —y `sinMedir` es justamente lo que dice si el promedio de arriba
 * habla de todo el trabajo de alguien o de una rebanada de él.
 *
 * Dos matices, y los dos son el mismo criterio de «compromiso vigente»:
 *
 * - De los sprints que la tuvieron gana **el que arrancó más tarde**. El compromiso de una
 *   tarea arrastrada es el del sprint en que acabó, no el del primero que la vio pasar.
 *   (Antes ganaba el primero del arreglo, que no es una regla: es el orden en que estaban
 *   guardados.)
 * - Un item con `responsable: null` significa «hereda de la tarea», no «sin asignar», así
 *   que ahí se cae al campo de la tarea en vez de dejarla sin dueño.
 */
function responsableAtribuido(doc: Documento, tarea: Tarea): PersonaId | null {
  let ultimo: Sprint | null = null;
  for (const sprint of doc.sprints) {
    if (!sprint.items.some((i) => i.tarea_id === tarea.id)) continue;
    if (ultimo === null || sprint.inicio > ultimo.inicio) ultimo = sprint;
  }
  return ultimo?.items.find((i) => i.tarea_id === tarea.id)?.responsable ?? tarea.responsable;
}

/**
 * Lo que costó una tarea, o `null` si no es medible.
 *
 * Dos condiciones y ninguna más: que esté **aceptada** —el avance se mide contra `done`—
 * y que tenga **al menos un tramo cerrado**. Ya no hace falta un sprint que la contenga,
 * y por eso una tarea cerrada fuera de todo sprint por fin tiene duración.
 *
 * `aceptada_en` tampoco es requisito: da la fecha del `done`, no la duración, y una tarea
 * a la que le falte —pasa con las editadas a mano— sigue teniendo tramos que sumar.
 */
export function resolucionDe(doc: Documento, ubicacion: UbicacionTarea): Resolucion | null {
  const { tarea } = ubicacion;
  if (tarea.estado !== 'done') return null;

  const reloj = tiempoEnDesarrollo(tarea);
  if (reloj.dias === null) return null;

  const ventana = ventanaDeTramos(tarea);

  return {
    tarea,
    dias: reloj.dias,
    tramos: reloj.tramos,
    desarrollo: reloj.desarrollo,
    pruebas: reloj.pruebas,
    calendario: ventana === null ? null : diasEntreInstantes(ventana.desde, ventana.hasta),
    responsable: responsableAtribuido(doc, tarea),
    clave: ubicacion.proyecto.clave,
    sprintsAtravesados: doc.sprints.filter((s) => s.items.some((i) => i.tarea_id === tarea.id)).length,
  };
}

/** Todas las resoluciones medibles del documento. */
export function resoluciones(doc: Documento): Resolucion[] {
  const salida: Resolucion[] = [];
  for (const ubicacion of indexarTareas(doc).values()) {
    const resolucion = resolucionDe(doc, ubicacion);
    if (resolucion !== null) salida.push(resolucion);
  }
  return salida;
}

// --- promedios --------------------------------------------------------------

/**
 * Un promedio y lo que hace falta para creérselo.
 *
 * `promedio` es `null` por debajo del mínimo, y entonces solo vale `cuentan`. Sin esto,
 * «14.0 días de promedio» calculado sobre una sola tarea se lee igual de firme que uno
 * calculado sobre cuarenta, y es la forma más fácil de mentir con un número real.
 */
export interface Promedio {
  /** Días trabajados, con un decimal. `null` si no hay suficientes para significar algo. */
  promedio: number | null;
  /** La del medio. Aguanta mejor una tarea que se quedó seis meses abierta. */
  mediana: number | null;
  /** Sobre cuántas tareas se calculó. */
  cuentan: number;
  /** Cuántas se aceptaron sin un solo tramo que medir. Es la letra chica del promedio. */
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
    promedio: bastantes ? aUnDecimal(suma / dias.length) : null,
    mediana: bastantes ? aUnDecimal(mediana) : null,
    cuentan: medidas.length,
    sinMedir,
    masLenta: medidas.reduce((peor, m) => (peor === null || m.dias > peor.dias ? m : peor), null as Resolucion | null),
  };
}

/**
 * En qué se fue el tiempo medido: desarrollar o probar.
 *
 * Cada mitad viene con cuántas tareas la componen, y por lo mismo de siempre: un total sin
 * su conteo no deja distinguir «se prueba poco» de «casi nada pasó por pruebas».
 */
export interface Desglose {
  desarrollo: number | null;
  pruebas: number | null;
  conDesarrollo: number;
  conPruebas: number;
}

export function desglosar(medidas: readonly Resolucion[]): Desglose {
  let desarrollo: number | null = null;
  let pruebas: number | null = null;
  let conDesarrollo = 0;
  let conPruebas = 0;
  for (const m of medidas) {
    if (m.desarrollo !== null) { desarrollo = (desarrollo ?? 0) + m.desarrollo; conDesarrollo += 1; }
    if (m.pruebas !== null) { pruebas = (pruebas ?? 0) + m.pruebas; conPruebas += 1; }
  }
  return {
    desarrollo: desarrollo === null ? null : aUnDecimal(desarrollo),
    pruebas: pruebas === null ? null : aUnDecimal(pruebas),
    conDesarrollo,
    conPruebas,
  };
}

/**
 * Tiempo trabajado contra tiempo de calendario.
 *
 * `trabajado` es la suma de los tramos; `calendario` es lo que tardaron de punta a punta.
 * Lo que sobra del segundo es espera —cola, bloqueo, revisión ajena—, y el reloj viejo la
 * contaba como trabajo porque calendario era lo único que sabía medir.
 *
 * `proporcion` no se da por debajo del mínimo: un cociente sobre dos tareas describe
 * cuáles tocaron, no cómo trabaja nadie.
 */
export interface TrabajadoContraCalendario {
  trabajado: number | null;
  calendario: number | null;
  /** Sobre cuántas tareas. Va SIEMPRE al lado del número (regla 3). */
  sobre: number;
  /** Fracción del calendario que sí fue trabajo, en `[0, 1]`. */
  proporcion: number | null;
}

export function trabajadoContraCalendario(
  medidas: readonly Resolucion[],
): TrabajadoContraCalendario {
  let trabajado = 0;
  let calendario = 0;
  let sobre = 0;
  for (const m of medidas) {
    if (m.calendario === null) continue;
    trabajado += m.dias;
    calendario += m.calendario;
    sobre += 1;
  }
  if (sobre === 0) return { trabajado: null, calendario: null, sobre: 0, proporcion: null };
  return {
    trabajado: aUnDecimal(trabajado),
    calendario: aUnDecimal(calendario),
    sobre,
    // Un calendario de cero días —todo cerrado el mismo instante— no divide: sería
    // infinito, y «infinito por ciento trabajado» no dice nada de nadie.
    proporcion:
      sobre >= MINIMO_TAREAS_PARA_PROMEDIO && calendario > 0
        ? Math.round((trabajado / calendario) * 100) / 100
        : null,
  };
}

/** Una fila de la tabla de tiempos: quién o qué, y su promedio. */
export interface FilaTiempo {
  id: string;
  nombre: string;
  tiempo: Promedio;
}

/**
 * Cuántas tareas se aceptaron sin un solo tramo que medir.
 *
 * Con el archivo del usuario este número va a ser casi todo al principio: los tramos
 * empiezan a existir hoy y el pasado no se inventa. Ocultarlo haría que el promedio
 * pareciera hablar de todo su trabajo cuando habla de lo que se cerró desde M5.
 */
function cerradasSinMedir(doc: Documento, incluye: (u: UbicacionTarea) => boolean): number {
  let n = 0;
  for (const ubicacion of indexarTareas(doc).values()) {
    if (ubicacion.tarea.estado !== 'done' || !incluye(ubicacion)) continue;
    if (resolucionDe(doc, ubicacion) === null) n += 1;
  }
  return n;
}

/**
 * Tiempo medio de trabajo por persona.
 *
 * Se atribuye a quien tenía el compromiso en el sprint, no a quien figura hoy en la
 * tarea: reasignar algo el mes que viene no puede reescribir quién lo resolvió.
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
        // La MISMA regla que agrupó el numerador, y por eso sale de la misma función: dos
        // expresiones que dicen lo mismo son dos expresiones que algún día dejan de decirlo.
        cerradasSinMedir(doc, (u) => responsableAtribuido(doc, u.tarea) === id),
      ),
    }))
    .sort((a, b) => b.tiempo.cuentan - a.tiempo.cuentan);
}

/** Tiempo medio de trabajo por proyecto. */
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
    return proyecto !== undefined && proyecto.equipos.flatMap((equipo) => equipo.miembros).length > 0;
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
 * Días trabajados por punto de esfuerzo: cuánto cuesta de verdad lo que se estimó en 3.
 *
 * Solo sobre las tareas que tienen las DOS cosas —estimación y tramos—. Es lo que permite
 * ver si la escala de alguien está calibrada, y ahora mide trabajo y no calendario, que
 * es lo único que hace comparable un 3 con otro 3.
 */
export interface DiasPorPunto {
  /** `null` por debajo del mínimo: un cociente sobre una tarea no calibra nada. */
  dias: number | null;
  /** Sobre cuántas tareas se calculó. Va SIEMPRE al lado del número (regla 3). */
  sobre: number;
  puntos: number;
}

export function diasPorPunto(medidas: readonly Resolucion[]): DiasPorPunto {
  let dias = 0;
  let puntos = 0;
  let sobre = 0;
  for (const m of medidas) {
    if (m.tarea.esfuerzo === null) continue;
    dias += m.dias;
    puntos += m.tarea.esfuerzo;
    sobre += 1;
  }
  if (puntos === 0) return { dias: null, sobre: 0, puntos: 0 };
  return {
    // El mismo mínimo que los promedios, y por lo mismo: con dos tareas el cociente dice
    // más de cuáles tocaron que de cómo está calibrada la escala.
    dias: sobre >= MINIMO_TAREAS_PARA_PROMEDIO ? aUnDecimal(dias / puntos) : null,
    sobre,
    puntos,
  };
}

/** Cuántas tareas se aceptaron en todo el documento sin un solo tramo que medir. */
export function cerradasSinMedirEnTodo(doc: Documento): number {
  return cerradasSinMedir(doc, () => true);
}
