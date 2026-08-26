/**
 * El puente hacia el proceso principal, tipado.
 *
 * `electron/preload.ts` expone la API con `contextBridge` y sus `invoke` devuelven
 * `Promise<any>`: el preload no puede importar los tipos del almacén porque con
 * `sandbox: true` su `require` solo resuelve unos pocos módulos de Electron. Aquí se
 * declara el contrato REAL — el que devuelven los manejadores de
 * `src/principal/ipc/manejadores.ts` — para que el renderer no trabaje con `any`.
 *
 * Los tipos se importan del proceso principal con `import type`. Con
 * `verbatimModuleSyntax` esos imports se borran al compilar, así que ni un byte de
 * `node:fs` entra al bundle del renderer; lo que queda es un único contrato en vez de
 * dos declaraciones que divergen. Si mañana cambia la forma de `InstantaneaAlmacen`,
 * este archivo deja de compilar, que es exactamente lo que debe pasar.
 */

import type {
  Diagnostico,
  InstantaneaAlmacen,
  RespuestaComando,
} from '../../principal/almacen/repositorio';
import type { Respaldo } from '../../principal/almacen/respaldos';
import type { Comando } from '../../principal/comandos/tipos';

export type { Comando, Diagnostico, InstantaneaAlmacen, Respaldo, RespuestaComando };

/** Forma de fallo genérica: cualquier canal puede devolverla si el manejador lanza. */
export interface Fallo {
  ok: false;
  codigo: string;
  mensaje: string;
  detalles?: string[];
}

export type Resultado = { ok: true } | Fallo;

export interface ApiPmCare {
  cargar(): Promise<InstantaneaAlmacen>;
  /**
   * Aplica UN comando con nombre (regla 9). Montado desde E5 aunque la interfaz de E6
   * sea de solo lectura: es el camino por el que E7 va a viajar, y dejarlo tipado ahora
   * evita que la primera mutación lo improvise.
   */
  aplicar(comando: Comando): Promise<RespuestaComando>;
  guardarAhora(): Promise<unknown>;
  deshacer(): Promise<RespuestaComando>;
  respaldos(): Promise<Respaldo[]>;
  restaurar(nombre: string): Promise<RespuestaComando>;
  reintentar(): Promise<InstantaneaAlmacen>;
  abrirEnEditor(): Promise<Resultado>;
  revelar(): Promise<Resultado>;
  version(): Promise<string>;
  /** Avisos que empuja el proceso principal. Devuelve la función para desuscribir. */
  alCambiarEstado(escucha: (instantanea: InstantaneaAlmacen) => void): () => void;
}

declare global {
  interface Window {
    /** Opcional a propósito: en un navegador suelto no existe, y hay que poder decirlo. */
    pmcare?: ApiPmCare;
  }
}

/**
 * El puente, o `null` si no está.
 *
 * Nunca se lanza: abrir `http://localhost:5173` en Safari sin Electron es un accidente
 * normal durante el desarrollo, y merece una pantalla que lo explique en vez de una
 * ventana en blanco con un error en la consola.
 */
export function puente(): ApiPmCare | null {
  return typeof window !== 'undefined' && window.pmcare ? window.pmcare : null;
}

/** Texto de un error desconocido. `catch` recibe `unknown`, no `Error`. */
export function mensajeDeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
