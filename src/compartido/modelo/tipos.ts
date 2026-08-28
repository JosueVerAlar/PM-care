/**
 * Tipos del documento de PM-care.
 *
 * **No se declara ninguna interfaz a mano.** Todo sale de `esquema.ts` con `z.infer`,
 * porque un tipo y un validador mantenidos en paralelo divergen y el día que divergen
 * el compilador está tranquilo mientras la app acepta datos rotos. Este archivo es solo
 * la fachada: los nombres que importa el resto del código y el mapa de invariantes.
 *
 * Los tipos llevan una firma de índice `[k: string]: unknown` heredada del `passthrough`.
 * No es un descuido: refleja que el documento puede traer campos que el usuario escribió
 * a mano. Esos campos se conservan al reescribir por serialización, no leyéndolos por
 * nombre desde el código.
 *
 * Invariantes que el resto del código da por ciertas:
 *
 * 1. La TAREA es la única entidad con estado (regla 1). Épicas e historias nunca
 *    persisten `estado` ni `porcentaje`: se derivan en `dominio/derivar.ts`.
 * 2. Los ids son inmutables y llevan la clave del proyecto (`SICOE-T14`). Mover una
 *    historia de épica no le cambia el id. Se emiten con contadores persistidos,
 *    nunca con MAX+1 (regla 15, `modelo/ids.ts`).
 * 3. La clave del proyecto es inmutable: es el prefijo de todos sus ids.
 * 4. Los sprints viven en la raíz, no dentro del proyecto: un sprint del usuario cruza
 *    varios proyectos.
 * 5. `bloqueos` es una lista histórica en la tarea, no un valor del enum de estado.
 * 6. Un "equipo" es la lista de miembros de un proyecto. No hay entidad con identidad
 *    propia: que alguien esté en varios equipos se lee recorriendo proyectos.
 */

import type { z } from 'zod';

import type {
  EsquemaBloqueo,
  EsquemaContadores,
  EsquemaDesenlaceItem,
  EsquemaDocumento,
  EsquemaEquipo,
  EsquemaEpica,
  EsquemaEstadoSprint,
  EsquemaEstadoTarea,
  EsquemaHistoria,
  EsquemaItemSprint,
  EsquemaMiembroEquipo,
  EsquemaPersona,
  EsquemaEsfuerzo,
  EsquemaPrioridad,
  EsquemaProyecto,
  EsquemaSprint,
  EsquemaTarea,
  EsquemaTipoBloqueo,
  EsquemaTipoTarea,
  EsquemaTramoTrabajo,
} from './esquema';

/** Fecha de calendario `YYYY-MM-DD`. Se compara lexicográficamente: sin `Date`, sin zona horaria. */
export type Fecha = string;

/**
 * Marca de tiempo ISO 8601 (`2026-08-26T11:20:00-06:00`). Los eventos la usan en vez de
 * `Fecha` porque el historial necesita ordenar dos cosas ocurridas el mismo día.
 */
export type Instante = string;

/** Id de persona legible a mano: `"jesus-castillo"`. Nunca un UUID. */
export type PersonaId = string;

/** Clave inmutable de proyecto: `"SICOE"`. Prefijo de todos los ids del proyecto. */
export type ClaveProyecto = string;

/** Id de item: `"SICOE-E1"`, `"SICOE-H3"`, `"SICOE-T14"`. */
export type ItemId = string;

export type Prioridad = z.infer<typeof EsquemaPrioridad>;
/** 1 · 2 · 3 · 5 · 8. Ver `EsquemaEsfuerzo` para por qué esta escala y no otra. */
export type Esfuerzo = z.infer<typeof EsquemaEsfuerzo>;
export type EstadoTarea = z.infer<typeof EsquemaEstadoTarea>;
export type TipoTarea = z.infer<typeof EsquemaTipoTarea>;
export type TipoBloqueo = z.infer<typeof EsquemaTipoBloqueo>;
export type EstadoSprint = z.infer<typeof EsquemaEstadoSprint>;
export type DesenlaceItem = z.infer<typeof EsquemaDesenlaceItem>;

export type Persona = z.infer<typeof EsquemaPersona>;
export type MiembroEquipo = z.infer<typeof EsquemaMiembroEquipo>;
export type Equipo = z.infer<typeof EsquemaEquipo>;
export type TramoTrabajo = z.infer<typeof EsquemaTramoTrabajo>;
export type Bloqueo = z.infer<typeof EsquemaBloqueo>;
export type Tarea = z.infer<typeof EsquemaTarea>;
export type Historia = z.infer<typeof EsquemaHistoria>;
export type Epica = z.infer<typeof EsquemaEpica>;
export type Contadores = z.infer<typeof EsquemaContadores>;
export type Proyecto = z.infer<typeof EsquemaProyecto>;
export type ItemSprint = z.infer<typeof EsquemaItemSprint>;
export type Sprint = z.infer<typeof EsquemaSprint>;
export type Documento = z.infer<typeof EsquemaDocumento>;
