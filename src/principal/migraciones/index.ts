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
 * La entrada 1→2 es la primera que ejercita este andamio. Se mantiene como un solo salto
 * porque separar cambios que nacen juntos multiplicaría estados intermedios que nunca
 * existieron como formato escrito por la aplicación.
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
export const MIGRACIONES: readonly Migracion[] = [
  {
    desde: 1,
    hasta: 2,
    descripcion: 'Añade sprints por proyecto, reloj por tramos, equipos y el flujo de seis estados',
    migrar(crudo) {
      const proyectos: Record<string, unknown>[] = arreglo(crudo['proyectos']).map((valor) => {
        const proyecto = objeto(valor);
        const clave = typeof proyecto['clave'] === 'string' ? proyecto['clave'] : '';
        const miembros = arreglo(proyecto['equipo']).map((valorMiembro) => {
          const miembro = objeto(valorMiembro);
          const rol = miembro['rol'];
          const { rol: _rol, ...resto } = miembro;
          return {
            ...resto,
            responsabilidades: typeof rol === 'string' ? [rol] : [],
            capacidad: null,
          };
        });
        const { equipo: _equipo, ...resto } = proyecto;
        const equiposExistentes = arreglo(proyecto['equipos']);
        return {
          ...resto,
          equipos: equiposExistentes.length > 0
            ? equiposExistentes
            : [{ id: `${clave.toLowerCase()}-general`, nombre: 'General', miembros }],
          tareas: migrarTareas(arreglo(proyecto['tareas'])),
          epicas: arreglo(proyecto['epicas']).map(migrarEpica),
        };
      });

      const claves = new Set(proyectos.map((p) => p['clave']).filter((v): v is string => typeof v === 'string'));
      const sprints = arreglo(crudo['sprints']).map((valor) => {
        const sprint = objeto(valor);
        const tocadas = new Set(
          arreglo(sprint['items'])
            .map((item) => objeto(item)['tarea_id'])
            .filter((id): id is string => typeof id === 'string')
            .map((id) => [...claves].find((clave) => id.startsWith(`${clave}-`)))
            .filter((clave): clave is string => clave !== undefined),
        );
        const claveExistente = sprint['clave'];
        const clave = Object.hasOwn(sprint, 'clave') && (typeof claveExistente === 'string' || claveExistente === null)
          ? claveExistente
          : tocadas.size === 1 ? [...tocadas][0] : null;
        return { ...sprint, clave };
      });
      return { ...crudo, proyectos, sprints };
    },
  },
];

function objeto(valor: unknown): Record<string, unknown> {
  return valor !== null && typeof valor === 'object' && !Array.isArray(valor)
    ? (valor as Record<string, unknown>)
    : {};
}

function arreglo(valor: unknown): unknown[] {
  return Array.isArray(valor) ? valor : [];
}

function migrarTareas(valores: unknown[]): Record<string, unknown>[] {
  return valores.map((valor) => {
    const tarea = objeto(valor);
    const estado = tarea['estado'] === 'en_curso' ? 'iniciado' : tarea['estado'] === 'hecha' ? 'done' : tarea['estado'];
    const { aceptada_en: hechaEn, ...resto } = tarea;
    return {
      ...resto,
      estado,
      trabajo: [],
      aceptada_en: hechaEn ?? tarea['aceptada_en'] ?? null,
      tipo: 'trabajo',
      equipo_id: null,
      criterios: null,
    };
  });
}

function migrarEpica(valor: unknown): Record<string, unknown> {
  const epica = objeto(valor);
  return {
    ...epica,
    tareas: migrarTareas(arreglo(epica['tareas'])),
    historias: arreglo(epica['historias']).map((valorHistoria) => {
      const historia = objeto(valorHistoria);
      return { ...historia, tareas: migrarTareas(arreglo(historia['tareas'])) };
    }),
  };
}

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
