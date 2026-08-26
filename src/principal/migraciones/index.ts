/**
 * Cadena de migraciones por versión de esquema.
 *
 * Cada migración sube exactamente UNA versión (`n` -> `n+1`) y trabaja sobre el JSON
 * crudo, no sobre el tipo `Documento`. Es deliberado: `Documento` es siempre la forma de
 * la versión ACTUAL, y una migración que lo usara como entrada estaría tipando el pasado
 * con la forma del presente — mentira que el compilador no puede detectar y que se
 * descubre cuando la migración borra un campo que ya no existe en el tipo.
 *
 * Reglas de la casa para escribir una migración:
 *
 * 1. Nunca borra un campo que no entiende. `passthrough` (regla 14) llega hasta aquí:
 *    si la v1 tenía notas del usuario, la v2 las conserva.
 * 2. Es pura y determinista. Sin `Date.now()`, sin `fs`: lo que necesite fecha la recibe.
 * 3. Antes de escribir el resultado, el almacén guarda `pre-migracion-*`, exento de
 *    rotación. Una migración que sale mal tiene que ser reversible a mano.
 *
 * Hoy la cadena está vacía porque `ESQUEMA_VERSION === 1` y no hay nada anterior. El
 * andamio existe igual: el día que haya v2 no se improvisa el mecanismo, se añade una
 * entrada al arreglo.
 */

import { ESQUEMA_VERSION, VERSION_MINIMA_SOPORTADA } from '../../compartido/modelo/version';

export interface Migracion {
  desde: number;
  hasta: number;
  /** Descripción para la bitácora y para la pantalla que avisa antes de reescribir. */
  descripcion: string;
  migrar(crudo: Record<string, unknown>, ahora: string): Record<string, unknown>;
}

/** Ordenadas por `desde`. Un hueco en la cadena hace fallar `planDeMigracion`. */
export const MIGRACIONES: readonly Migracion[] = [];

export type PlanMigracion =
  | { ok: true; pasos: readonly Migracion[] }
  | { ok: false; motivo: string };

/**
 * Pasos para llevar `desde` hasta `ESQUEMA_VERSION`. Lista vacía = ya está al día.
 *
 * Falla en vez de improvisar cuando falta un eslabón: reescribir un documento saltándose
 * una migración es exactamente cómo se pierde la estructura que esa migración iba a
 * mover.
 */
export function planDeMigracion(desde: number): PlanMigracion {
  if (!Number.isInteger(desde) || desde < 1) {
    return { ok: false, motivo: `versión de esquema no válida: ${String(desde)}` };
  }
  if (desde > ESQUEMA_VERSION) {
    return {
      ok: false,
      motivo: `el documento declara la versión ${desde} y esta app escribe la ${ESQUEMA_VERSION}`,
    };
  }
  if (desde < VERSION_MINIMA_SOPORTADA) {
    return {
      ok: false,
      motivo: `la versión ${desde} es anterior a la más vieja migrable (${VERSION_MINIMA_SOPORTADA})`,
    };
  }

  const pasos: Migracion[] = [];
  let actual = desde;
  while (actual < ESQUEMA_VERSION) {
    const paso = MIGRACIONES.find((m) => m.desde === actual);
    if (paso === undefined) {
      return { ok: false, motivo: `falta la migración de la versión ${actual} a la ${actual + 1}` };
    }
    pasos.push(paso);
    actual = paso.hasta;
  }
  return { ok: true, pasos };
}

export type ResultadoMigracion =
  | { ok: true; crudo: Record<string, unknown>; aplicadas: readonly Migracion[] }
  | { ok: false; motivo: string };

/**
 * Aplica la cadena completa. No valida el resultado contra Zod: eso lo hace el almacén
 * justo después, y si falla el documento migrado NO se escribe y se entra en solo
 * lectura con el `pre-migracion-*` intacto.
 */
export function migrar(crudo: Record<string, unknown>, ahora: string): ResultadoMigracion {
  const version = crudo['esquema_version'];
  if (typeof version !== 'number') {
    return { ok: false, motivo: 'el documento no declara `esquema_version` numérica' };
  }
  const plan = planDeMigracion(version);
  if (!plan.ok) return { ok: false, motivo: plan.motivo };

  let actual = crudo;
  for (const paso of plan.pasos) {
    actual = paso.migrar(actual, ahora);
    actual = { ...actual, esquema_version: paso.hasta };
  }
  return { ok: true, crudo: actual, aplicadas: plan.pasos };
}
