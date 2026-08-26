/**
 * Bitácora append-only `historial.jsonl` (regla 7).
 *
 * Un JSON por línea, nunca se reescribe, nunca se reordena. Es el único archivo del
 * almacén que crece sin fin y el único cuya corrupción no impide usar la app: si una
 * línea no parsea se salta.
 *
 * ## Por qué `proyecto_id` y `origen` van DESNORMALIZADOS
 *
 * La tentación es guardar solo `item_id` y resolver el resto contra el documento al
 * generar un reporte. Eso hace que la historia se reescriba sola: el día que una historia
 * se mueve de épica, todos los eventos viejos de sus tareas empiezan a decir que
 * ocurrieron en la épica nueva. «En julio trabajé sobre Regularización» pasa a ser falso
 * sin que nadie tocara el historial.
 *
 * Por eso cada evento congela dónde estaba la cosa CUANDO PASÓ: `proyecto_id` y `origen`
 * —la ruta legible `SICOE › Épica › Historia`— más los ids de contenedor por si algún día
 * hace falta agrupar por máquina. Cuesta unos bytes por línea y es lo que hace que el
 * archivo valga algo dentro de un año.
 */

import { promises as fs } from 'node:fs';
import * as path from 'node:path';

import type { Instante } from '../../compartido/modelo/tipos';
import { anexarLinea } from '../almacen/escritura-atomica';

/** De dónde vino la mutación. Sirve para separar lo que hizo el usuario de lo que hizo la app. */
export type FuenteEvento = 'ui' | 'sistema' | 'migracion' | 'restauracion';

export interface EntradaHistorial {
  /** Instante ISO. Primero en el objeto para que el archivo se lea a ojo. */
  ts: Instante;
  /** Nombre del comando (`moverAlSprint`) o del evento de sistema (`restaurarRespaldo`). */
  comando: string;
  fuente: FuenteEvento;
  /** Congelado: clave del proyecto al que pertenecía lo tocado. */
  proyecto_id: string | null;
  /** Congelado: ruta legible en el árbol, `"SICOE › Regularización › Grupos"`. */
  origen: string | null;
  epica_id: string | null;
  historia_id: string | null;
  /** Épica, historia o tarea sobre la que actuó el comando. */
  item_id: string | null;
  sprint_id: string | null;
  /** Una frase para leer el archivo sin decodificar el detalle. */
  resumen: string;
  /** Antes/después del comando. `null` cuando no aporta nada. */
  detalle: Record<string, unknown> | null;
}

/** Separador de la ruta legible. Se fija aquí para que todos los eventos usen el mismo. */
export const SEPARADOR_RUTA = ' › ';

export function rutaLegible(segmentos: readonly (string | null | undefined)[]): string | null {
  const limpios = segmentos.filter((s): s is string => typeof s === 'string' && s !== '');
  return limpios.length === 0 ? null : limpios.join(SEPARADOR_RUTA);
}

/**
 * Una línea, sin saltos internos. `JSON.stringify` ya escapa cualquier `\n` que traiga un
 * título, así que la invariante «una línea = un evento» no depende de que nadie escriba
 * raro.
 */
export function serializar(entrada: EntradaHistorial): string {
  return JSON.stringify(entrada);
}

/**
 * Anexa eventos. No lanza hacia arriba: perder una línea de bitácora no puede impedir
 * que se guarde el documento, que es lo que de verdad importa. Devuelve el error para
 * que quien llama lo pueda mostrar.
 */
export async function registrar(
  rutaHistorial: string,
  entradas: readonly EntradaHistorial[],
): Promise<{ ok: true } | { ok: false; mensaje: string }> {
  if (entradas.length === 0) return { ok: true };
  try {
    await fs.mkdir(path.dirname(rutaHistorial), { recursive: true });
    await anexarLinea(rutaHistorial, entradas.map(serializar).join('\n'));
    return { ok: true };
  } catch (error) {
    return { ok: false, mensaje: error instanceof Error ? error.message : String(error) };
  }
}

export interface HistorialLeido {
  entradas: EntradaHistorial[];
  /** Cuántas líneas no parsearon. Una al final es normal tras un crash durante el append. */
  ilegibles: number;
}

/**
 * Lee el historial saltando lo ilegible. No valida el contenido contra un esquema: son
 * eventos de versiones pasadas de la app y rechazarlos borraría historia.
 */
export async function leerHistorial(rutaHistorial: string): Promise<HistorialLeido> {
  const crudo = await fs.readFile(rutaHistorial, 'utf8').catch(() => '');
  const entradas: EntradaHistorial[] = [];
  let ilegibles = 0;
  for (const linea of crudo.split('\n')) {
    if (linea.trim() === '') continue;
    try {
      entradas.push(JSON.parse(linea) as EntradaHistorial);
    } catch {
      ilegibles += 1;
    }
  }
  return { entradas, ilegibles };
}
