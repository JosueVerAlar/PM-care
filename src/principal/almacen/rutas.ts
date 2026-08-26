/**
 * Dónde viven los archivos del almacén.
 *
 * Un solo lugar decide rutas y nombres (CLAUDE.md: «si el usuario decide otra ruta, se
 * cambia en un solo lugar»). Ningún otro módulo compone rutas a mano ni conoce los
 * nombres de archivo.
 *
 * Este módulo no importa `electron`: recibe el `userData` como parámetro. Así el almacén
 * completo se puede ejercitar desde Node puro en un directorio temporal, que es lo que
 * hacen los guiones de verificación de esta etapa.
 */

import * as path from 'node:path';

export const NOMBRE_DOCUMENTO = 'datos.json';
export const NOMBRE_HISTORIAL = 'historial.jsonl';
export const NOMBRE_RESPALDOS = 'respaldos';

/**
 * Escotilla para apuntar el almacén a otro directorio (D2 del plan: `userData` por
 * omisión, ruta configurable). Es también lo que permite que las pruebas corran sobre un
 * directorio temporal sin tocar `datos/` del repositorio.
 */
export const VARIABLE_DIRECTORIO = 'PMCARE_DIRECTORIO_DATOS';

export interface RutasAlmacen {
  /** Directorio que contiene el documento. El temporal de escritura nace aquí dentro. */
  directorio: string;
  documento: string;
  historial: string;
  respaldos: string;
}

export function rutasEn(directorio: string): RutasAlmacen {
  return {
    directorio,
    documento: path.join(directorio, NOMBRE_DOCUMENTO),
    historial: path.join(directorio, NOMBRE_HISTORIAL),
    respaldos: path.join(directorio, NOMBRE_RESPALDOS),
  };
}

/**
 * Directorio de datos efectivo. `userData` por omisión; la variable de entorno gana si
 * trae algo. Se resuelve a absoluta para que un `cwd` distinto no mueva el almacén.
 */
export function directorioDeDatos(
  userData: string,
  entorno: NodeJS.ProcessEnv = process.env,
): string {
  const configurado = entorno[VARIABLE_DIRECTORIO];
  if (configurado && configurado.trim() !== '') return path.resolve(configurado.trim());
  return userData;
}

// --- temporales de escritura atómica ----------------------------------------

/**
 * Prefijo de los temporales. Empieza con punto para que no aparezcan en Finder si el
 * usuario abre la carpeta, y para que un `datos-*.json` suyo nunca se confunda con uno.
 */
export const PREFIJO_TEMPORAL = '.tmp-';

/**
 * `.tmp-<pid>-<n>`: el pid distingue dos instancias de la app corriendo a la vez y `n`
 * distingue dos escrituras de la misma instancia. Sin el pid, dos procesos podrían
 * elegir el mismo nombre y uno le renombraría el temporal al otro por debajo.
 */
export function nombreTemporal(pid: number, n: number): string {
  return `${PREFIJO_TEMPORAL}${pid}-${n}`;
}

export function esTemporal(nombre: string): boolean {
  return nombre.startsWith(PREFIJO_TEMPORAL);
}
