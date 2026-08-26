/**
 * Nombres de canal, en un solo lugar.
 *
 * Un nombre de canal escrito a mano en dos archivos es un fallo silencioso: el `invoke`
 * se queda esperando para siempre y no hay error en ninguna consola. Aquí están todos,
 * y el preload los comprueba contra estos tipos en tiempo de compilación.
 *
 * ## Por qué el preload NO importa este módulo en tiempo de ejecución
 *
 * Con `sandbox: true` el `require` del preload es un polirelleno que solo resuelve
 * `electron`, `events`, `timers` y `url`: un `require` relativo a este archivo falla al
 * arrancar. Por eso el preload REPITE los literales, pero tipados contra `MapaCanales`,
 * así que renombrar un canal aquí rompe la compilación del preload en vez de romper la
 * app en producción.
 *
 * Convención: `dominio:accion`. Nada de `fs:*` — la superficie expuesta al renderer es de
 * dominio, no de sistema de archivos (regla 12).
 */

export const CANALES = {
  /** Estado actual del almacén: documento, modo y diagnóstico. */
  cargar: 'almacen:cargar',
  /** Aplica UN comando con nombre. Nunca recibe el documento (regla 9). */
  aplicar: 'almacen:aplicar',
  /** Vacía la cola de escritura ya. */
  guardarAhora: 'almacen:guardar-ahora',
  deshacer: 'almacen:deshacer',
  respaldos: 'almacen:respaldos',
  /** Recibe el NOMBRE de un respaldo del listado, jamás una ruta. */
  restaurar: 'almacen:restaurar',
  /** Vuelve a leer el archivo desde cero tras arreglarlo a mano. */
  reintentar: 'almacen:reintentar',
  /** Abre el archivo con el editor por omisión del sistema. Sin argumentos. */
  abrirEnEditor: 'almacen:abrir-en-editor',
  /** Muestra el archivo en Finder. Sin argumentos. */
  revelar: 'almacen:revelar',
  version: 'app:version',
} as const;

/** Avisos que el proceso principal empuja al renderer. */
export const EVENTOS = {
  /** El estado del almacén cambió por algo que el renderer no pidió. */
  estado: 'almacen:estado',
} as const;

export type MapaCanales = typeof CANALES;
export type MapaEventos = typeof EVENTOS;
export type NombreCanal = MapaCanales[keyof MapaCanales];
