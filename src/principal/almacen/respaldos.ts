/**
 * Respaldos rotativos (regla 6).
 *
 * ## Cuándo se hace un respaldo
 *
 * **Uno por sesión de app y uno por día de calendario**, no uno por escritura. Con
 * debounce de 500 ms una tarde de trabajo son cientos de escrituras; un respaldo por
 * cada una llena el disco de copias casi idénticas y, peor, empuja fuera de la ventana
 * de retención el único estado al que el usuario querría volver: cómo estaba el archivo
 * *ayer*.
 *
 * El respaldo se toma ANTES de la primera escritura de la sesión/del día, copiando el
 * archivo tal como está en disco. Es decir: un respaldo es siempre un estado que ya
 * estuvo completo y validado, nunca lo que estamos a punto de escribir.
 *
 * ## Qué se rota y qué no
 *
 * Rotan `sesion-*` y `dia-*`, que se generan solos y por tanto pueden crecer sin fin.
 * **Quedan exentos `pre-migracion-*` y `corrupto-*`**: los produce un evento raro y
 * significativo, y son justo las copias que alguien va a buscar meses después. Que las
 * borre la rotación automática convertiría el respaldo en un adorno.
 */

import { promises as fs } from 'node:fs';
import * as path from 'node:path';

import type { Instante } from '../../compartido/modelo/tipos';
import { escribirAtomico } from './escritura-atomica';
import type { RutasAlmacen } from './rutas';

export type ClaseRespaldo = 'sesion' | 'dia' | 'pre-migracion' | 'corrupto';

export const PREFIJOS: Record<ClaseRespaldo, string> = {
  sesion: 'sesion-',
  dia: 'dia-',
  'pre-migracion': 'pre-migracion-',
  corrupto: 'corrupto-',
};

/** Clases que la rotación puede borrar. Las demás son permanentes por decisión. */
export const ROTABLES: ClaseRespaldo[] = ['sesion', 'dia'];

export interface Retencion {
  sesion: number;
  dia: number;
}

/**
 * Cotas acotadas y explícitas. 12 sesiones cubren un par de semanas de uso normal; 45
 * días cubren un mes y medio, que es el horizonte real de «¿cuándo se rompió esto?».
 */
export const RETENCION_POR_OMISION: Retencion = { sesion: 12, dia: 45 };

export interface Respaldo {
  nombre: string;
  ruta: string;
  clase: ClaseRespaldo;
  /** Lo que va después del prefijo, sin `.json`. Ordena lexicográfico = cronológico. */
  marca: string;
  bytes: number;
}

/**
 * Marca compacta y ordenable: `2026-08-26T142530`. Sin dos puntos, porque un nombre de
 * archivo con `:` es un campo minado al copiarlo a otro sistema de archivos.
 */
export function marcaDeInstante(instante: Instante): string {
  const fecha = instante.slice(0, 10);
  const hora = instante.slice(11, 19).replace(/:/g, '');
  return hora === '' ? fecha : `${fecha}T${hora}`;
}

export function nombreRespaldo(clase: ClaseRespaldo, marca: string): string {
  return `${PREFIJOS[clase]}${marca}.json`;
}

function claseDe(nombre: string): ClaseRespaldo | null {
  // `pre-migracion-` antes que nada más por si algún prefijo futuro fuera prefijo de otro.
  const clases: ClaseRespaldo[] = ['pre-migracion', 'corrupto', 'sesion', 'dia'];
  for (const clase of clases) {
    if (nombre.startsWith(PREFIJOS[clase]) && nombre.endsWith('.json')) return clase;
  }
  return null;
}

export async function listarRespaldos(directorioRespaldos: string): Promise<Respaldo[]> {
  const entradas = await fs.readdir(directorioRespaldos).catch(() => [] as string[]);
  const respaldos: Respaldo[] = [];
  for (const nombre of entradas) {
    const clase = claseDe(nombre);
    if (clase === null) continue;
    const ruta = path.join(directorioRespaldos, nombre);
    const info = await fs.stat(ruta).catch(() => null);
    if (info === null || !info.isFile()) continue;
    respaldos.push({
      nombre,
      ruta,
      clase,
      marca: nombre.slice(PREFIJOS[clase].length, -'.json'.length),
      bytes: info.size,
    });
  }
  // Del más reciente al más viejo: es el orden en que se ofrecen para restaurar.
  return respaldos.sort((a, b) => (a.marca < b.marca ? 1 : a.marca > b.marca ? -1 : 0));
}

/**
 * Copia el documento actual a un respaldo de esa clase y marca. `null` si no hay
 * documento que copiar o si ese respaldo ya existe (no se rehace: la gracia del respaldo
 * de sesión es conservar el estado de ANTES, no el más reciente).
 *
 * Se copia leyendo y reescribiendo con `escribirAtomico`, no con `copyFile`: un crash a
 * mitad de un `copyFile` deja un respaldo truncado, y un respaldo truncado es peor que
 * ninguno porque parece utilizable.
 */
export async function copiarComo(
  rutas: RutasAlmacen,
  clase: ClaseRespaldo,
  marca: string,
): Promise<string | null> {
  const nombre = nombreRespaldo(clase, marca);
  const destino = path.join(rutas.respaldos, nombre);

  const yaEsta = await fs.stat(destino).then(() => true, () => false);
  if (yaEsta) return null;

  const contenido = await fs.readFile(rutas.documento, 'utf8').catch(() => null);
  if (contenido === null) return null;

  await fs.mkdir(rutas.respaldos, { recursive: true });
  await escribirAtomico(destino, contenido);
  return nombre;
}

/**
 * Garantiza el respaldo de esta sesión y el de este día. Idempotente: llamarla antes de
 * cada escritura cuesta dos `stat` y no hace nada el 99% de las veces.
 *
 * `marcaSesion` la fija el arranque de la app y no cambia mientras viva el proceso.
 */
export async function respaldarSiHaceFalta(
  rutas: RutasAlmacen,
  marcaSesion: string,
  hoy: string,
): Promise<string[]> {
  const creados: string[] = [];
  const sesion = await copiarComo(rutas, 'sesion', marcaSesion);
  if (sesion !== null) creados.push(sesion);
  const dia = await copiarComo(rutas, 'dia', hoy);
  if (dia !== null) creados.push(dia);
  return creados;
}

/**
 * Deja a lo sumo `retencion[clase]` respaldos de cada clase rotable, borrando los más
 * viejos. Devuelve los nombres borrados.
 */
export async function rotar(
  directorioRespaldos: string,
  retencion: Retencion = RETENCION_POR_OMISION,
): Promise<string[]> {
  const todos = await listarRespaldos(directorioRespaldos);
  const borrados: string[] = [];
  for (const clase of ROTABLES) {
    const cota = clase === 'sesion' ? retencion.sesion : retencion.dia;
    // `listarRespaldos` ya viene del más reciente al más viejo.
    const sobrantes = todos.filter((r) => r.clase === clase).slice(Math.max(cota, 0));
    for (const respaldo of sobrantes) {
      await fs.rm(respaldo.ruta, { force: true }).catch(() => undefined);
      borrados.push(respaldo.nombre);
    }
  }
  return borrados;
}
