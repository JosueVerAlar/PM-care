/**
 * Lo que la pantalla de Administración necesita saber, calculado fuera de ella.
 *
 * Módulo puro. Aquí no se decide NADA: el reductor sigue siendo el único que dice si un
 * proyecto se puede eliminar o si una persona se puede borrar, y sus mensajes de rechazo
 * se muestran tal cual. Lo que hay aquí es lo que la pantalla tiene que poder ENUMERAR
 * antes de que el usuario pulse: cuánto trabajo se lleva por delante un borrado, en qué
 * equipos está cada quien, y qué personas quedan disponibles para un equipo.
 *
 * Esa distinción importa. Duplicar aquí la condición de rechazo del reductor daría dos
 * verdades que divergen en cuanto una cambie; contar lo que hay dentro de un proyecto no
 * es duplicar una regla, es describir el documento.
 */

import type { Documento, Fecha, MiembroEquipo, PersonaId, Proyecto } from '../modelo/tipos';
import { estaAbierta } from './clasificar';
import { equiposDe, type PertenenciaEquipo } from './carga';
import { contarTareas, type Avance } from './derivar';

// --- proyectos --------------------------------------------------------------

/** Qué hay dentro de un proyecto. Es lo que se pierde si se elimina. */
export interface ContenidoProyecto {
  epicas: number;
  historias: number;
  tareas: number;
  avance: Avance;
  /** Sprints —de cualquier estado— en los que aparece alguna de sus tareas. */
  sprints: number;
  /**
   * Sprints CERRADOS que contienen tareas suyas. Es el motivo por el que el reductor
   * rechaza eliminarlo: borrarlas reescribiría lo que ese sprint dice que pasó (regla 8).
   */
  sprintsCerrados: number;
  /** Cuántas de sus tareas viven en un sprint cerrado. */
  tareasEnSprintsCerrados: number;
}

export function contenidoDeProyecto(doc: Documento, proyecto: Proyecto): ContenidoProyecto {
  let historias = 0;
  const ids = new Set<string>();
  const tareas = [];
  for (const epica of proyecto.epicas) {
    historias += epica.historias.length;
    for (const historia of epica.historias) {
      for (const tarea of historia.tareas) {
        ids.add(tarea.id);
        tareas.push(tarea);
      }
    }
  }

  let sprints = 0;
  let sprintsCerrados = 0;
  const enCerrados = new Set<string>();
  for (const sprint of doc.sprints) {
    const suyas = sprint.items.filter((item) => ids.has(item.tarea_id));
    if (suyas.length === 0) continue;
    sprints += 1;
    if (sprint.estado !== 'cerrado') continue;
    sprintsCerrados += 1;
    for (const item of suyas) enCerrados.add(item.tarea_id);
  }

  return {
    epicas: proyecto.epicas.length,
    historias,
    tareas: ids.size,
    avance: contarTareas(tareas),
    sprints,
    sprintsCerrados,
    tareasEnSprintsCerrados: enCerrados.size,
  };
}

export interface FilaProyectoAdmin {
  clave: string;
  nombre: string;
  /** Las tres primeras letras, igual que en la barra lateral. Decorativo. */
  sigla: string;
  cerradoEn: Fecha | null;
  archivado: boolean;
  contenido: ContenidoProyecto;
  /** Nombres de quienes están en su equipo, para la línea de metadatos. */
  equipo: string[];
}

/**
 * Los proyectos partidos en dos listas: activos y cerrados.
 *
 * La separación no es cosmética. **Eliminar no existe en una fila activa**: para borrar
 * un proyecto hay que cerrarlo antes, y eso convierte «cerrar» y «eliminar» en dos gestos
 * separados en el tiempo en vez de dos botones vecinos que el pulgar confunde.
 *
 * Un proyecto archivado sin `cerrado_en` cuenta como cerrado a efectos de esta pantalla:
 * `cerrarProyecto` archiva además de cerrar, y `reabrirProyecto` acepta cualquiera de las
 * dos condiciones, así que la lista tiene que leerlas igual que el reductor.
 */
export interface ProyectosAdmin {
  activos: FilaProyectoAdmin[];
  cerrados: FilaProyectoAdmin[];
}

export function proyectosParaAdmin(doc: Documento): ProyectosAdmin {
  const nombres = new Map(doc.personas.map((persona) => [persona.id, persona.nombre]));

  const filas = doc.proyectos.map<FilaProyectoAdmin>((proyecto) => ({
    clave: proyecto.clave,
    nombre: proyecto.nombre,
    sigla: proyecto.clave.replace(/-/g, '').slice(0, 3),
    cerradoEn: proyecto.cerrado_en,
    archivado: proyecto.archivado,
    contenido: contenidoDeProyecto(doc, proyecto),
    equipo: proyecto.equipo.map((m) => nombres.get(m.persona_id) ?? m.persona_id),
  }));

  return {
    activos: filas.filter((fila) => fila.cerradoEn === null && !fila.archivado),
    cerrados: filas.filter((fila) => fila.cerradoEn !== null || fila.archivado),
  };
}

/**
 * Clave propuesta desde el nombre: primera palabra, sin acentos, en mayúsculas.
 *
 * Es solo una propuesta y el campo queda editable: **la clave es inmutable en cuanto se
 * crea el proyecto** —prefija todos sus ids (`SICOE-T14`) y aparece en cada línea del
 * historial—, así que el momento de corregirla es ahora y ninguno después.
 *
 * Si la propuesta choca con una clave existente se devuelve igual: quien decide es el
 * reductor, y enseñar aquí una clave distinta de la que se tecleó confundiría más.
 */
export function claveSugerida(nombre: string): string {
  const limpio = nombre
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9 ]/g, ' ')
    .trim();
  if (limpio === '') return '';
  // Seis caracteres: es lo que cabe cómodo en un id (`SICOE-T14`) y en la sigla de la
  // barra lateral. El usuario la puede alargar o acortar antes de crear; después, nunca.
  return (limpio.split(/\s+/)[0] ?? '').slice(0, 6).toUpperCase();
}

// --- personas ---------------------------------------------------------------

/**
 * Con qué está atada una persona al documento.
 *
 * Se calcula para poder DECIRLO en la pantalla («tiene 12 tareas y aparece en 3 sprints
 * cerrados»), no para decidir: si el usuario pulsa eliminar de todos modos, quien
 * responde es el reductor y su mensaje se muestra tal cual.
 */
export interface AtadurasPersona {
  tareas: number;
  sprints: number;
  sprintsCerrados: number;
}

export interface FilaPersonaAdmin {
  id: PersonaId;
  nombre: string;
  activa: boolean;
  /** Dos iniciales para el cuadrito. Decorativo: siempre va con el nombre al lado. */
  iniciales: string;
  equipos: PertenenciaEquipo[];
  /** Tareas abiertas de las que es responsable, en todo el documento. */
  abiertas: number;
  ataduras: AtadurasPersona;
  /** `true` si nada la nombra: es la única a la que eliminar no le va a doler. */
  sinHistoria: boolean;
}

export function personasParaAdmin(doc: Documento): FilaPersonaAdmin[] {
  return doc.personas
    .map<FilaPersonaAdmin>((persona) => {
      let tareas = 0;
      let abiertas = 0;
      for (const proyecto of doc.proyectos) {
        for (const epica of proyecto.epicas) {
          for (const historia of epica.historias) {
            for (const tarea of historia.tareas) {
              if (tarea.responsable !== persona.id) continue;
              tareas += 1;
              if (estaAbierta(tarea)) abiertas += 1;
            }
          }
        }
      }

      let sprints = 0;
      let sprintsCerrados = 0;
      for (const sprint of doc.sprints) {
        if (!sprint.items.some((item) => item.responsable === persona.id)) continue;
        sprints += 1;
        if (sprint.estado === 'cerrado') sprintsCerrados += 1;
      }

      const ataduras = { tareas, sprints, sprintsCerrados };
      return {
        id: persona.id,
        nombre: persona.nombre,
        activa: persona.activa,
        iniciales: iniciales(persona.nombre),
        equipos: equiposDe(doc, persona.id),
        abiertas,
        ataduras,
        sinHistoria: tareas === 0 && sprints === 0,
      };
    })
    .sort(
      (a, b) =>
        Number(b.activa) - Number(a.activa) ||
        b.equipos.length - a.equipos.length ||
        a.nombre.localeCompare(b.nombre, 'es'),
    );
}

/**
 * Id que va a recibir una persona nueva, para poder enseñarlo en el alta.
 *
 * El usuario no lo elige —es una comodidad, no una decisión— pero sí lo va a ver en el
 * archivo de datos y en el historial, así que la pantalla lo anticipa. El id definitivo lo
 * emite el reductor; si esta cuenta y aquella difirieran, manda aquella.
 */
export function idSugerido(nombre: string, existentes: ReadonlySet<string>): string {
  const base =
    nombre
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .split('-')
      .filter(Boolean)
      .slice(0, 2)
      .join('-') || 'persona';

  if (!existentes.has(base)) return base;
  let n = 2;
  while (existentes.has(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
}

// --- equipos ----------------------------------------------------------------

/**
 * Quién puede sumarse al equipo de un proyecto.
 *
 * **Las personas son un catálogo global y los equipos se arman por proyecto tomando de
 * ahí** (decisión del usuario). Añadir a alguien a un proyecto es elegirlo de esta lista,
 * nunca volver a darlo de alta: la misma persona está en varios equipos, con rol distinto
 * en cada uno.
 *
 * Solo se ofrecen las activas: el reductor rechaza meter a una desactivada a un equipo, y
 * ofrecer algo que va a fallar es peor que no ofrecerlo.
 */
export function disponiblesParaEquipo(
  doc: Documento,
  clave: string,
): { id: PersonaId; nombre: string }[] {
  const proyecto = doc.proyectos.find((p) => p.clave === clave);
  const dentro = new Set(proyecto?.equipo.map((m) => m.persona_id) ?? []);
  return doc.personas
    .filter((persona) => persona.activa && !dentro.has(persona.id))
    .map((persona) => ({ id: persona.id, nombre: persona.nombre }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
}

/**
 * El equipo de un proyecto tal cual está en el documento, listo para editar y reenviar.
 *
 * Se copian los miembros **enteros**, no `{persona_id, rol}`: `EsquemaMiembroEquipo` es
 * `passthrough` y el usuario edita el JSON a mano (regla 14). Si esta pantalla
 * reconstruyera cada miembro con los dos campos que conoce, cualquier nota suya dentro de
 * un miembro desaparecería en el primer cambio de rol — en silencio, que es lo peor.
 */
export type MiembroEditable = MiembroEquipo;

export function equipoDe(doc: Documento, clave: string): MiembroEditable[] {
  const proyecto = doc.proyectos.find((p) => p.clave === clave);
  return (proyecto?.equipo ?? []).map((miembro) => ({ ...miembro }));
}

/** Dos iniciales. Decorativo: nunca sustituye al nombre. */
export function iniciales(nombre: string): string {
  return nombre
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((parte) => parte[0] ?? '')
    .join('')
    .toUpperCase();
}
