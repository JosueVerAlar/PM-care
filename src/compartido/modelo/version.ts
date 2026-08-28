/**
 * Versión del esquema del documento.
 *
 * El campo `esquema_version` vive en la raíz del JSON para que sea lo primero que se
 * lee y lo primero que se decide: qué hacemos con este archivo antes de intentar
 * validarlo contra un esquema que quizá no le corresponde.
 */

/** Versión que escribe esta build. Súbela en el mismo commit que cambie la forma del documento. */
export const ESQUEMA_VERSION = 2;

/** Versión más vieja que esta build sabe leer y migrar hacia adelante. */
export const VERSION_MINIMA_SOPORTADA = 1;

export type EstadoVersion =
  /** Coincide con `ESQUEMA_VERSION`: se abre normal. */
  | 'actual'
  /** Vieja pero migrable: se abre, se migra y se avisa antes de reescribir. */
  | 'migrable'
  /** Anterior a lo que esta build sabe migrar. Solo lectura. */
  | 'obsoleta'
  /** Escrita por una build más nueva. Solo lectura, sin excepción. */
  | 'futura'
  /** Ausente, no numérica o no entera: el archivo no es un documento de PM-care. */
  | 'invalida';

export function estadoDeVersion(valor: unknown): EstadoVersion {
  if (typeof valor !== 'number' || !Number.isInteger(valor) || valor < 1) return 'invalida';
  if (valor === ESQUEMA_VERSION) return 'actual';
  if (valor > ESQUEMA_VERSION) return 'futura';
  if (valor < VERSION_MINIMA_SOPORTADA) return 'obsoleta';
  return 'migrable';
}

/**
 * Regla dura: solo escribimos sobre un documento cuya versión entendemos por completo.
 *
 * Abrir un documento v2 con una build v1 y guardarlo tira la estructura que la v1 no
 * conoce. `passthrough` conserva campos desconocidos dentro de objetos conocidos, pero
 * no salva una entidad nueva que la v1 ni siquiera lee. Y es exactamente el caso que
 * va a ocurrir: el usuario versiona este archivo con git y lo abre desde donde sea.
 */
export function permiteEscritura(estado: EstadoVersion): boolean {
  return estado === 'actual' || estado === 'migrable';
}

/** Mensaje para la pantalla de solo lectura. Sin jerga: dice qué pasó y qué hacer. */
export function explicarVersion(estado: EstadoVersion, valor: unknown): string {
  switch (estado) {
    case 'actual':
      return `Versión de esquema ${ESQUEMA_VERSION}.`;
    case 'migrable':
      return `El archivo usa la versión ${String(valor)} y esta app escribe la ${ESQUEMA_VERSION}. Se migrará al guardar.`;
    case 'obsoleta':
      return `El archivo usa la versión ${String(valor)}, anterior a la más vieja que esta app sabe leer (${VERSION_MINIMA_SOPORTADA}). Se abre en solo lectura.`;
    case 'futura':
      return `El archivo fue escrito por una versión más nueva de PM-care (esquema ${String(valor)}, esta app escribe la ${ESQUEMA_VERSION}). Se abre en solo lectura para no borrar datos que esta versión no entiende.`;
    case 'invalida':
      return 'El archivo no declara un `esquema_version` válido. Puede no ser un documento de PM-care.';
  }
}
