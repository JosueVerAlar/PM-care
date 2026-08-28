/**
 * Constructores de datos de prueba.
 *
 * Existen para que cada prueba diga solo lo que le importa: `unaTarea({ estado: 'hecha' })`
 * y nada más. Todo lo demás sale de un valor por defecto válido, así que añadir un campo
 * obligatorio al esquema rompe este archivo y no las ciento y pico pruebas.
 *
 * Los ids se emiten con un contador de módulo para que dos entidades construidas en la
 * misma prueba nunca colisionen: la validación cruzada rechaza ids duplicados y un
 * duplicado accidental se leería como un fallo del código bajo prueba.
 *
 * Regla del archivo: los constructores producen documentos VÁLIDOS por defecto. Lo
 * inválido se construye rompiendo algo a propósito y a la vista, en la prueba que lo usa.
 */

import { maximosUsados } from '../../src/compartido/modelo/ids';
import { ESQUEMA_VERSION } from '../../src/compartido/modelo/version';
import type {
  Bloqueo,
  Documento,
  Epica,
  EstadoTarea,
  Historia,
  ItemSprint,
  MiembroEquipo,
  Persona,
  Proyecto,
  Sprint,
  Tarea,
} from '../../src/compartido/modelo/tipos';

/** Clave por defecto. Los ids llevan el prefijo del proyecto o la validación cruzada falla. */
export const CLAVE = 'PRUEBA';

let secuencia = 0;
function siguiente(): number {
  secuencia += 1;
  return secuencia;
}

/** Solo para las pruebas que afirman sobre ids concretos. La unicidad no depende de esto. */
export function reiniciarSecuencia(): void {
  secuencia = 0;
}

type Con<T> = Partial<T> & { clave?: string };

export function unaTarea(over: Con<Tarea> = {}): Tarea {
  const { clave = CLAVE, ...resto } = over;
  const n = siguiente();
  return {
    id: `${clave}-T${n}`,
    titulo: `Tarea ${n}`,
    descripcion: null,
    estado: 'pendiente',
    planeada: true,
    responsable: null,
    fecha_limite: null,
    prioridad: null,
    esfuerzo: null,
    creada_en: null,
    hecha_en: null,
    bloqueos: [],
    clave_externa: null,
    ...resto,
  };
}

export function unaHistoria(over: Con<Historia> = {}): Historia {
  const { clave = CLAVE, ...resto } = over;
  const n = siguiente();
  return {
    id: `${clave}-H${n}`,
    titulo: `Historia ${n}`,
    descripcion: null,
    planeada: true,
    clave_externa: null,
    tareas: [],
    ...resto,
  };
}

export function unaEpica(over: Con<Epica> = {}): Epica {
  const { clave = CLAVE, ...resto } = over;
  const n = siguiente();
  return {
    id: `${clave}-E${n}`,
    titulo: `Épica ${n}`,
    descripcion: null,
    planeada: true,
    clave_externa: null,
    historias: [],
    // N9: una épica también puede llevar tareas colgadas sin historia de por medio.
    tareas: [],
    ...resto,
  };
}

/**
 * Los contadores se derivan del árbol salvo que la prueba los fije: un contador por
 * debajo de lo ya usado es un documento inválido (regla 15) y no es lo que casi ninguna
 * prueba quiere ejercer.
 */
export function unProyecto(over: Partial<Proyecto> = {}): Proyecto {
  const clave = (over.clave as string | undefined) ?? CLAVE;
  const epicas = (over.epicas as Epica[] | undefined) ?? [];
  // N9: las tareas sueltas cuentan para los contadores igual que las de una historia.
  const sueltas = (over.tareas as Proyecto['tareas'] | undefined) ?? [];
  const base: Proyecto = {
    clave,
    nombre: `Proyecto ${clave}`,
    descripcion: null,
    prioridad: null,
    archivado: false,
    cerrado_en: null,
    planeacion_cerrada_en: null,
    contadores: {
      ...maximosUsados({
        clave,
        contadores: { epicas: 0, historias: 0, tareas: 0 },
        epicas,
        tareas: sueltas,
      }),
    },
    equipo: [],
    epicas,
    /** N9: tareas colgadas del proyecto, sin épica. El caso de un trabajo continuo. */
    tareas: [],
    clave_externa: null,
  };
  return { ...base, ...over };
}

export function unaPersona(over: Partial<Persona> = {}): Persona {
  const n = siguiente();
  return {
    id: `persona-${n}`,
    nombre: `Persona ${n}`,
    activa: true,
    clave_externa: null,
    ...over,
  };
}

export function unMiembro(personaId: string, rol: string | null = null): MiembroEquipo {
  return { persona_id: personaId, rol };
}

export function unItem(tareaId: string, over: Partial<ItemSprint> = {}): ItemSprint {
  return {
    tarea_id: tareaId,
    responsable: null,
    fecha_limite: null,
    prioridad: null,
    comprometida_en: null,
    desenlace: null,
    ...over,
  };
}

export function unSprint(over: Partial<Sprint> = {}): Sprint {
  const n = siguiente();
  return {
    id: `S-${n}`,
    nombre: `Sprint ${n}`,
    inicio: '2026-08-24',
    fin: '2026-08-30',
    estado: 'activo',
    items: [],
    ...over,
  };
}

export function unDocumento(over: Partial<Documento> = {}): Documento {
  return {
    esquema_version: ESQUEMA_VERSION,
    usuario: null,
    personas: [],
    proyectos: [],
    sprints: [],
    ...over,
  };
}

// --- atajos de forma --------------------------------------------------------

/** `unBloqueo()` sigue abierto; con `desbloqueada_en` ya se cerró. */
export function unBloqueo(over: Partial<Bloqueo> = {}): Bloqueo {
  return {
    tipo: 'dependencia',
    motivo: 'Esperando al proveedor',
    bloqueada_en: '2026-08-20T10:00:00-06:00',
    desbloqueada_en: null,
    ...over,
  };
}

/** Una tarea por estado de la lista. El atajo para las tablas de conteo. */
export function tareasConEstados(estados: readonly EstadoTarea[], clave = CLAVE): Tarea[] {
  return estados.map((estado) => unaTarea({ estado, clave }));
}

/** `unaHistoriaCon(['hecha', 'pendiente'])`. Historia vacía con `[]`. */
export function unaHistoriaCon(estados: readonly EstadoTarea[], clave = CLAVE): Historia {
  return unaHistoria({ clave, tareas: tareasConEstados(estados, clave) });
}

/**
 * `unaEpicaCon([['hecha'], []])` — una épica de dos historias, la segunda vacía.
 * Es la forma en la que se escriben casi todos los casos límite del avance.
 */
export function unaEpicaCon(porHistoria: readonly (readonly EstadoTarea[])[], clave = CLAVE): Epica {
  return unaEpica({ clave, historias: porHistoria.map((estados) => unaHistoriaCon(estados, clave)) });
}

/** Repite un estado n veces. Para los conteos grandes: `repetir('hecha', 199)`. */
export function repetir(estado: EstadoTarea, veces: number): EstadoTarea[] {
  return Array.from({ length: veces }, () => estado);
}
