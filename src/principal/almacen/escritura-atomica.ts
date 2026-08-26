/**
 * Escritura atómica: temporal hermano + `fsync` + `rename` (regla 6).
 *
 * ## Qué garantiza y qué no — el límite honesto
 *
 * `rename(2)` dentro del MISMO sistema de archivos es atómico: cualquier lector ve el
 * contenido viejo completo o el nuevo completo, nunca una mezcla. Por eso el temporal
 * nace en el directorio del destino y no en `os.tmpdir()`: un rename entre volúmenes no
 * es un rename, es copiar y borrar, y ahí sí hay un instante con el archivo a medias.
 *
 * `fsync` vacía los datos del descriptor hacia el disco. **En macOS eso llega a la caché
 * del dispositivo, no al medio físico**: la garantía real frente a un corte de corriente
 * exigiría `F_FULLFSYNC`, que Node no expone por ninguna API. Así que lo que este módulo
 * promete es «el archivo nunca queda a medias» —frente a un crash del proceso, un kill,
 * un cierre forzado— y **no** «sobrevive a un apagón». No prometas lo segundo en la
 * interfaz.
 *
 * ## Los temporales huérfanos se barren, nunca se recuperan
 *
 * Un `.tmp-*` que sobrevivió a un crash es, por construcción, contenido que no llegó a
 * ser válido: si hubiera llegado, el rename ya lo habría convertido en el documento.
 * Intentar «rescatarlo» es exactamente el fallo caro de esta etapa — sustituir el
 * archivo bueno del usuario por una escritura que nunca terminó.
 */

import { promises as fs } from 'node:fs';
import type { FileHandle } from 'node:fs/promises';
import * as path from 'node:path';

import { esTemporal, nombreTemporal } from './rutas';

/** Distingue dos escrituras del mismo proceso. Monótono, nunca se reinicia. */
let contadorTemporales = 0;

/**
 * Escribe `contenido` en `destino` sin que exista un instante en que `destino` esté a
 * medias. Nunca hace `writeFile` sobre el destino.
 */
export async function escribirAtomico(destino: string, contenido: string): Promise<void> {
  const directorio = path.dirname(destino);
  contadorTemporales += 1;
  const temporal = path.join(directorio, nombreTemporal(process.pid, contadorTemporales));

  let descriptor: FileHandle | null = null;
  try {
    // 'wx' falla si el temporal ya existe: preferimos reventar antes que pisar el
    // temporal de otra escritura en vuelo.
    descriptor = await fs.open(temporal, 'wx', 0o600);
    await descriptor.writeFile(contenido, 'utf8');
    await descriptor.sync();
    await descriptor.close();
    descriptor = null;
    await fs.rename(temporal, destino);
  } catch (error) {
    if (descriptor !== null) await descriptor.close().catch(() => undefined);
    await fs.rm(temporal, { force: true }).catch(() => undefined);
    throw error;
  }

  // El rename ya es visible para cualquier lector; esto solo lo empuja hacia el disco.
  // Best-effort a propósito: en los sistemas donde abrir un directorio falla, la
  // atomicidad no depende de esto.
  await sincronizarDirectorio(directorio);
}

/**
 * Anexa una línea con `fsync`. Lo usa el historial: append-only, un JSON por línea.
 *
 * Un append no es atómico como el rename, así que un crash puede dejar la ÚLTIMA línea
 * truncada. Es aceptable porque el lector del historial descarta líneas ilegibles y
 * ninguna otra cosa depende de ellas; el documento, que sí importa, va por rename.
 */
export async function anexarLinea(ruta: string, linea: string): Promise<void> {
  const descriptor = await fs.open(ruta, 'a', 0o600);
  try {
    await descriptor.writeFile(linea.endsWith('\n') ? linea : `${linea}\n`, 'utf8');
    await descriptor.sync();
  } finally {
    await descriptor.close();
  }
}

/**
 * Borra los `.tmp-*` que quedaron de una escritura interrumpida. Se llama al arrancar.
 * Devuelve los nombres borrados para que el arranque los pueda anotar.
 */
export async function barrerTemporales(directorio: string): Promise<string[]> {
  const entradas = await fs.readdir(directorio).catch(() => [] as string[]);
  const borrados: string[] = [];
  for (const nombre of entradas) {
    if (!esTemporal(nombre)) continue;
    await fs.rm(path.join(directorio, nombre), { force: true }).catch(() => undefined);
    borrados.push(nombre);
  }
  return borrados;
}

async function sincronizarDirectorio(directorio: string): Promise<void> {
  let descriptor: FileHandle | null = null;
  try {
    descriptor = await fs.open(directorio, 'r');
    await descriptor.sync();
  } catch {
    // Sin efecto observable en la atomicidad. Se ignora.
  } finally {
    if (descriptor !== null) await descriptor.close().catch(() => undefined);
  }
}
