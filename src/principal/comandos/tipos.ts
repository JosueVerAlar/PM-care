/**
 * La unión discriminada de comandos (regla 9).
 *
 * Cada mutación es un objeto con nombre y sus datos mínimos. El renderer nunca manda el
 * documento —ni un pedazo de él—, manda «qué quiere que pase». Eso es lo que permite que
 * la bitácora tenga sentido, que deshacer sea posible y que un bug de la interfaz no
 * pueda reescribir el archivo entero.
 *
 * Los esquemas son `strict`, al revés que los del documento. No es incoherencia: el
 * documento lo edita un humano a mano y sus campos desconocidos se conservan (regla 14);
 * un payload de IPC lo produce nuestro propio renderer y un campo que no esperamos ahí
 * solo puede ser un bug o algo peor. Los tipos siguen saliendo de Zod con `z.infer`.
 *
 * Convención de los comandos de edición: **campo ausente = no tocar; campo en `null` =
 * borrar el valor**. Sin esa distinción no hay forma de quitarle el responsable a una
 * tarea sin mandar todos los demás campos.
 */

import { z } from 'zod';

import {
  EsquemaEstadoTarea,
  EsquemaItemSprint,
  EsquemaMiembroEquipo,
  EsquemaPrioridad,
  EsquemaTipoBloqueo,
} from '../../compartido/modelo/esquema';

const Id = z.string().min(1);
const Titulo = z.string().min(1);
const Descripcion = z.string().nullable();
const Responsable = z.string().nullable();

/**
 * Se toma del esquema del documento en vez de repetir el patrón `YYYY-MM-DD`: dos
 * validadores de fecha mantenidos en paralelo divergen igual que un tipo y su esquema.
 */
const FechaLimite = EsquemaItemSprint.shape.fecha_limite;

// --- árbol: épicas ----------------------------------------------------------

const CrearEpica = z
  .object({
    comando: z.literal('crearEpica'),
    /** Clave del proyecto. El id lo emite el contador del proyecto, nunca lo manda el cliente. */
    proyecto: z.string().min(1),
    titulo: Titulo,
    descripcion: Descripcion.optional(),
  })
  .strict();

const EditarEpica = z
  .object({
    comando: z.literal('editarEpica'),
    id: Id,
    titulo: Titulo.optional(),
    descripcion: Descripcion.optional(),
  })
  .strict();

const EliminarEpica = z.object({ comando: z.literal('eliminarEpica'), id: Id }).strict();

// --- árbol: historias -------------------------------------------------------

const CrearHistoria = z
  .object({
    comando: z.literal('crearHistoria'),
    epicaId: Id,
    titulo: Titulo,
    descripcion: Descripcion.optional(),
  })
  .strict();

const EditarHistoria = z
  .object({
    comando: z.literal('editarHistoria'),
    id: Id,
    titulo: Titulo.optional(),
    descripcion: Descripcion.optional(),
  })
  .strict();

const EliminarHistoria = z.object({ comando: z.literal('eliminarHistoria'), id: Id }).strict();

// --- árbol: tareas ----------------------------------------------------------

const CrearTarea = z
  .object({
    comando: z.literal('crearTarea'),
    historiaId: Id,
    titulo: Titulo,
    descripcion: Descripcion.optional(),
    responsable: Responsable.optional(),
    prioridad: EsquemaPrioridad.nullable().optional(),
    fechaLimite: FechaLimite.optional(),
  })
  .strict();

const EditarTarea = z
  .object({
    comando: z.literal('editarTarea'),
    id: Id,
    titulo: Titulo.optional(),
    descripcion: Descripcion.optional(),
    responsable: Responsable.optional(),
    prioridad: EsquemaPrioridad.nullable().optional(),
    fechaLimite: FechaLimite.optional(),
  })
  .strict();

const EliminarTarea = z.object({ comando: z.literal('eliminarTarea'), id: Id }).strict();

/**
 * Comando propio y no un `editarTarea` con un campo más: es la mutación más frecuente de
 * la app, la que dispara flush inmediato y la que la bitácora tiene que poder contar sin
 * comparar dos objetos.
 */
const CambiarEstado = z
  .object({ comando: z.literal('cambiarEstado'), id: Id, estado: EsquemaEstadoTarea })
  .strict();

// --- sprint -----------------------------------------------------------------

const MoverAlSprint = z
  .object({
    comando: z.literal('moverAlSprint'),
    tareaId: Id,
    sprintId: Id,
    /** Posición en `items` (el orden ES la prioridad). Ausente = al final. */
    posicion: z.number().int().nonnegative().nullable().optional(),
  })
  .strict();

const SacarDelSprint = z
  .object({ comando: z.literal('sacarDelSprint'), tareaId: Id, sprintId: Id })
  .strict();

const CerrarSprint = z.object({ comando: z.literal('cerrarSprint'), sprintId: Id }).strict();

const ActivarSprint = z.object({ comando: z.literal('activarSprint'), sprintId: Id }).strict();

// --- bloqueos ---------------------------------------------------------------

const Bloquear = z
  .object({
    comando: z.literal('bloquear'),
    tareaId: Id,
    tipo: EsquemaTipoBloqueo,
    motivo: z.string().min(1),
  })
  .strict();

const Desbloquear = z.object({ comando: z.literal('desbloquear'), tareaId: Id }).strict();

// --- equipo -----------------------------------------------------------------

/**
 * Reemplaza la lista completa del equipo de un proyecto. Un equipo son cuatro personas:
 * mandar la lista entera es más simple y más fácil de deshacer que tres comandos de alta,
 * baja y cambio de rol, y sigue sin ser «mandar el documento».
 */
const EditarEquipo = z
  .object({
    comando: z.literal('editarEquipo'),
    proyecto: z.string().min(1),
    miembros: z.array(EsquemaMiembroEquipo),
  })
  .strict();

// --- la unión ---------------------------------------------------------------

export const EsquemaComando = z.discriminatedUnion('comando', [
  CrearEpica,
  EditarEpica,
  EliminarEpica,
  CrearHistoria,
  EditarHistoria,
  EliminarHistoria,
  CrearTarea,
  EditarTarea,
  EliminarTarea,
  CambiarEstado,
  MoverAlSprint,
  SacarDelSprint,
  CerrarSprint,
  ActivarSprint,
  Bloquear,
  Desbloquear,
  EditarEquipo,
]);

export type Comando = z.infer<typeof EsquemaComando>;
export type NombreComando = Comando['comando'];

/**
 * Comandos que provocan flush inmediato en vez de esperar el debounce de 500 ms.
 *
 * El criterio es «¿duele perder esto si la app se cierra en el próximo medio segundo?».
 * Cambiar de estado y crear o eliminar algo duelen: son las acciones tras las que el
 * usuario cierra la ventana dando por hecho que quedó guardado. Editar un título no,
 * porque casi siempre viene seguido de más tecleo.
 */
const INMEDIATOS = new Set<NombreComando>([
  'cambiarEstado',
  'crearEpica',
  'crearHistoria',
  'crearTarea',
  'eliminarEpica',
  'eliminarHistoria',
  'eliminarTarea',
  'cerrarSprint',
  'activarSprint',
]);

export function requiereFlushInmediato(comando: Comando): boolean {
  return INMEDIATOS.has(comando.comando);
}

export interface PayloadInvalido {
  ruta: string;
  mensaje: string;
}

export type ResultadoPayload =
  | { ok: true; comando: Comando }
  | { ok: false; problemas: PayloadInvalido[] };

/** Valida un payload que llegó por IPC. No lanza: el manejador responde con el detalle. */
export function validarComando(valor: unknown): ResultadoPayload {
  const resultado = EsquemaComando.safeParse(valor);
  if (resultado.success) return { ok: true, comando: resultado.data };
  return {
    ok: false,
    problemas: resultado.error.issues.map((incidencia) => ({
      ruta: incidencia.path.map((s) => String(s)).join('.') || '(raíz)',
      mensaje: incidencia.message,
    })),
  };
}
