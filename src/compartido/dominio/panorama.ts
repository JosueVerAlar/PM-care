/**
 * E10b — el cálculo del Panorama.
 *
 * Módulo puro. `hoy` entra como parámetro.
 *
 * ## El orden ES el hallazgo
 *
 * La vista contesta «¿a cuál le tengo que meter mano hoy?», así que ordenarla
 * alfabéticamente sería tirar la respuesta. El orden por omisión es ATENCIÓN REQUERIDA:
 * primero los proyectos con bloqueos abiertos, por los días del bloqueo más viejo;
 * después el resto, por días sin movimiento. Y la regla se escribe en pantalla: un orden
 * que nadie explica confunde más que el alfabético.
 *
 * ## Qué NO calcula este módulo
 *
 * No hay índice de salud, ni velocidad, ni fecha estimada de término. Sin estimaciones de
 * esfuerzo esos números son invención con cara de dato. Lo único que se deriva de más es
 * «días sin movimiento», y solo porque sale de marcas de tiempo que el documento sí tiene.
 *
 * ## «Sin movimiento» es lo que la app puede ver, y se dice así
 *
 * El último movimiento de un proyecto es la marca de tiempo más reciente entre las que
 * quedan escritas en sus tareas: cuándo se capturó una, cuándo se dio por hecha, cuándo se
 * bloqueó o se desbloqueó. NO incluye editar un título ni mover algo al sprint — eso vive
 * en `historial.jsonl`, que esta capa no lee. Un proyecto sin ninguna marca devuelve
 * `null`, no 0: «no sé desde cuándo» y «se movió hoy» no son lo mismo.
 */

import type { Documento, Fecha, Instante, Proyecto } from '../modelo/tipos';
import { diasBloqueada, diasEntre, estaAbierta, fechaDe, senalesDeProyecto } from './clasificar';
import { avanceDeProyecto, tareasDeProyecto, type Avance } from './derivar';

export type OrdenPanorama = 'atencion' | 'quieto' | 'nombre';

export const ORDEN_POR_OMISION: OrdenPanorama = 'atencion';

export interface TarjetaPanorama {
  clave: string;
  nombre: string;
  avance: Avance;
  /** Pendientes y en curso. Las canceladas no cuentan para nada (CLAUDE.md). */
  abiertas: number;
  bloqueadas: number;
  vencidas: number;
  noPlaneadasAbiertas: number;
  enSprintActivo: number;
  /** Días desde la última marca de tiempo del proyecto. `null` = no hay ninguna. */
  quieto: number | null;
  /** Días del bloqueo abierto más viejo. `null` = no hay bloqueos abiertos. */
  bloqueoMasViejo: number | null;
  /**
   * ¿Hay algo capturado? Un proyecto sin épicas no es un proyecto al 0 %: es un proyecto
   * del que PM-care no sabe nada. Va como ficha, no como tarjeta con avance inventado.
   */
  capturado: boolean;
}

export interface Panorama {
  /**
   * Las dos secciones del orden por atención. Con cualquier otro orden van vacías y la
   * lista entera viaja en `unicaLista`: son dos formas distintas de leer la misma
   * rejilla, y mezclarlas obligaría a la vista a decidir cuál pinta.
   */
  conBloqueos: TarjetaPanorama[];
  sinBloqueos: TarjetaPanorama[];
  unicaLista: TarjetaPanorama[] | null;
  /** Proyectos sin nada capturado. Siempre al final, en su propia sección de fichas. */
  sinCapturar: TarjetaPanorama[];
  /** Cuántos proyectos activos hay en total, capturados o no. */
  total: number;
}

/**
 * La marca de tiempo más reciente que el proyecto deja ver. `null` si no hay ninguna.
 *
 * Se comparan las cadenas ISO completas. Todas las marcas del documento se escriben con el
 * mismo desfase horario (es una app de una sola máquina), así que el orden lexicográfico
 * coincide con el cronológico; si algún día conviven zonas distintas, el error máximo es
 * de horas sobre una métrica que se muestra en días.
 */
export function ultimoMovimiento(proyecto: Proyecto): Instante | null {
  let ultimo: Instante | null = null;
  const anotar = (marca: Instante | null) => {
    if (marca !== null && (ultimo === null || marca > ultimo)) ultimo = marca;
  };

  for (const tarea of tareasDeProyecto(proyecto)) {
    anotar(tarea.creada_en);
    anotar(tarea.hecha_en);
    for (const bloqueo of tarea.bloqueos) {
      anotar(bloqueo.bloqueada_en);
      anotar(bloqueo.desbloqueada_en);
    }
  }

  return ultimo;
}

export function diasSinMovimiento(proyecto: Proyecto, hoy: Fecha): number | null {
  const ultimo = ultimoMovimiento(proyecto);
  if (ultimo === null) return null;
  return Math.max(0, diasEntre(fechaDe(ultimo), hoy));
}

export function tarjetaDeProyecto(
  doc: Documento,
  proyecto: Proyecto,
  hoy: Fecha,
): TarjetaPanorama {
  const senales = senalesDeProyecto(doc, proyecto.clave, hoy);
  const avance = senales?.avance ?? avanceDeProyecto(proyecto);

  let bloqueoMasViejo: number | null = null;
  let abiertas = 0;
  for (const tarea of tareasDeProyecto(proyecto)) {
    if (estaAbierta(tarea)) abiertas += 1;
    const dias = diasBloqueada(tarea, hoy);
    if (dias !== null && (bloqueoMasViejo === null || dias > bloqueoMasViejo)) {
      bloqueoMasViejo = dias;
    }
  }

  return {
    clave: proyecto.clave,
    nombre: proyecto.nombre,
    avance,
    abiertas,
    bloqueadas: senales?.bloqueadas ?? 0,
    vencidas: senales?.vencidas ?? 0,
    noPlaneadasAbiertas: senales?.noPlaneadasAbiertas ?? 0,
    enSprintActivo: senales?.enSprintActivo ?? 0,
    quieto: diasSinMovimiento(proyecto, hoy),
    bloqueoMasViejo,
    capturado: proyecto.epicas.length > 0,
  };
}

/**
 * El panorama completo. Los proyectos archivados quedan fuera: `archivado` responde a «no
 * me lo pintes», y esta es justo la pantalla de la que se querían ir.
 */
export function panorama(doc: Documento, hoy: Fecha, orden: OrdenPanorama): Panorama {
  const tarjetas = doc.proyectos
    .filter((proyecto) => !proyecto.archivado)
    .map((proyecto) => tarjetaDeProyecto(doc, proyecto, hoy));

  const sinCapturar = tarjetas.filter((t) => !t.capturado);
  const capturados = tarjetas.filter((t) => t.capturado);

  if (orden === 'nombre') {
    return {
      conBloqueos: [],
      sinBloqueos: [],
      unicaLista: capturados.slice().sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')),
      sinCapturar,
      total: tarjetas.length,
    };
  }

  if (orden === 'quieto') {
    return {
      conBloqueos: [],
      sinBloqueos: [],
      unicaLista: capturados.slice().sort(porQuieto),
      sinCapturar,
      total: tarjetas.length,
    };
  }

  return {
    conBloqueos: capturados
      .filter((t) => t.bloqueadas > 0)
      .sort((a, b) => (b.bloqueoMasViejo ?? 0) - (a.bloqueoMasViejo ?? 0) || porQuieto(a, b)),
    sinBloqueos: capturados.filter((t) => t.bloqueadas === 0).sort(porQuieto),
    unicaLista: null,
    sinCapturar,
    total: tarjetas.length,
  };
}

/**
 * Más quieto primero. Un proyecto SIN marcas de tiempo no se cuela arriba fingiendo estar
 * abandonado ni se hunde fingiendo estar fresco: va al final del grupo, que es donde
 * corresponde a lo que no se sabe.
 */
function porQuieto(a: TarjetaPanorama, b: TarjetaPanorama): number {
  if (a.quieto === null && b.quieto === null) return a.clave < b.clave ? -1 : 1;
  if (a.quieto === null) return 1;
  if (b.quieto === null) return -1;
  return b.quieto - a.quieto || (a.clave < b.clave ? -1 : 1);
}
