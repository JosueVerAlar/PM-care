/**
 * Detección de cambios externos del archivo (regla 16).
 *
 * ## Por qué se vigila el DIRECTORIO y no el archivo
 *
 * `fs.watch('datos.json')` se ata al inodo. Nuestra propia escritura atómica termina en
 * un `rename`, que sustituye el inodo: a partir de la primera vez que guardamos, el watch
 * sigue mirando un archivo que ya no es el documento y deja de avisar para siempre. No es
 * un caso raro que podría pasar — nos lo autoinfligimos en cada guardado. Vigilando el
 * directorio, el rename es justamente uno de los eventos que llegan.
 *
 * ## Por qué esto NO es la garantía
 *
 * `fs.watch` es best-effort: coalesce eventos, puede perderlos bajo carga y en algunos
 * sistemas de archivos en red simplemente no dispara. Sirve para AVISAR pronto. Lo que de
 * verdad protege el archivo del usuario es el `stat` inmediatamente antes de cada
 * escritura, en `repositorio.ts`. Si esta clase entera fallara, seguiríamos sin pisar un
 * cambio externo; solo lo descubriríamos más tarde.
 *
 * ## Supresión de los eventos propios
 *
 * Cada guardado nuestro dispara el watcher. Se distingue comparando la huella
 * (`mtime` + tamaño) con la que guardamos justo después de escribir: si coincide, el
 * evento es nuestro y se ignora.
 */

import { promises as fs, watch, type FSWatcher } from 'node:fs';
import * as path from 'node:path';

import { NOMBRE_DOCUMENTO } from './rutas';

export interface Huella {
  mtimeMs: number;
  bytes: number;
}

/** `null` = el archivo no existe. Es un estado normal antes del primer guardado. */
export async function huellaDe(ruta: string): Promise<Huella | null> {
  try {
    const info = await fs.stat(ruta);
    return { mtimeMs: info.mtimeMs, bytes: info.size };
  } catch {
    return null;
  }
}

export function mismaHuella(a: Huella | null, b: Huella | null): boolean {
  if (a === null || b === null) return a === b;
  return a.mtimeMs === b.mtimeMs && a.bytes === b.bytes;
}

/**
 * Ventana de reposo tras el último evento. `fs.watch` emite varios por una sola
 * modificación (un editor de texto escribe, trunca y renombra); sin esto, guardar desde
 * Vim dispararía tres avisos de conflicto.
 */
const REPOSO_MS = 250;

export interface OpcionesVigilante {
  /** Directorio que contiene el documento. */
  directorio: string;
  /** La huella de lo último que escribimos nosotros. Se consulta en cada evento. */
  huellaPropia: () => Huella | null;
  /** Se llama solo cuando el cambio NO es nuestro. */
  alCambioExterno: (huella: Huella | null) => void;
}

export class Vigilante {
  private observador: FSWatcher | null = null;
  private temporizador: NodeJS.Timeout | null = null;

  constructor(private readonly opciones: OpcionesVigilante) {}

  iniciar(): void {
    if (this.observador !== null) return;
    try {
      this.observador = watch(this.opciones.directorio, { persistent: false }, (_tipo, nombre) => {
        // `nombre` puede llegar null en algunos sistemas: entonces se revisa igual, que es
        // el lado seguro. Un aviso de más solo cuesta un `stat`.
        if (nombre !== null && path.basename(nombre.toString()) !== NOMBRE_DOCUMENTO) return;
        this.programarRevision();
      });
      // Un watcher que muere no puede tumbar la app: se pierde el aviso temprano, no la
      // protección, que vive en el `stat` previo a escribir.
      this.observador.on('error', () => this.detener());
    } catch {
      this.observador = null;
    }
  }

  detener(): void {
    if (this.temporizador !== null) {
      clearTimeout(this.temporizador);
      this.temporizador = null;
    }
    this.observador?.close();
    this.observador = null;
  }

  private programarRevision(): void {
    if (this.temporizador !== null) clearTimeout(this.temporizador);
    this.temporizador = setTimeout(() => {
      this.temporizador = null;
      void this.revisar();
    }, REPOSO_MS);
  }

  private async revisar(): Promise<void> {
    const actual = await huellaDe(path.join(this.opciones.directorio, NOMBRE_DOCUMENTO));
    if (mismaHuella(actual, this.opciones.huellaPropia())) return;
    this.opciones.alCambioExterno(actual);
  }
}
