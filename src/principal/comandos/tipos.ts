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
  EsquemaProyecto,
  EsquemaTipoBloqueo,
} from '../../compartido/modelo/esquema';

const Id = z.string().min(1);
const Titulo = z.string().min(1);
const Descripcion = z.string().nullable();
const Responsable = z.string().nullable();

/**
 * Clave de proyecto. Se toma del esquema del documento por la misma razón que
 * `FechaLimite`: un segundo patrón de clave mantenido aquí divergiría del de allá, y el
 * día que divergiera esta capa aceptaría claves que el documento rechaza.
 */
const Clave = EsquemaProyecto.shape.clave;

/**
 * Claves de los proyectos a los que una persona está dedicada.
 *
 * Un "equipo" no es una entidad con identidad propia: ES la lista de miembros de un
 * proyecto (ver `EsquemaMiembroEquipo`). Así que "los equipos de una persona" son las
 * claves de los proyectos donde aparece, y esta lista es la relación vista desde el otro
 * extremo que `editarEquipo`.
 *
 * Es la lista COMPLETA, no un delta: ausente = no tocar sus equipos, `[]` = sacarla de
 * todos. Mismo criterio que el resto de comandos de edición.
 */
const Equipos = z.array(Clave);

/**
 * Se toma del esquema del documento en vez de repetir el patrón `YYYY-MM-DD`: dos
 * validadores de fecha mantenidos en paralelo divergen igual que un tipo y su esquema.
 */
const FechaLimite = EsquemaItemSprint.shape.fecha_limite;

// --- proyectos --------------------------------------------------------------

/**
 * La clave la elige el usuario y es lo único del proyecto que jamás cambia: es el
 * prefijo de todos sus ids (`SICOE-T14`), así que renombrarla dejaría cada id, cada item
 * de sprint y cada línea del historial apuntando a un proyecto que ya no se llama así.
 * Por eso se valida el formato aquí y la unicidad en el reductor, que es quien ve el
 * documento entero.
 */
const CrearProyecto = z
  .object({
    comando: z.literal('crearProyecto'),
    clave: Clave,
    nombre: Titulo,
    descripcion: Descripcion.optional(),
    prioridad: EsquemaPrioridad.nullable().optional(),
  })
  .strict();

/**
 * `clave` identifica el proyecto; **no existe un campo para cambiarla**. No es un olvido:
 * es la garantía estructural de la inmutabilidad. Si algún día alguien quiere renombrar
 * un proyecto, el campo que edita es `nombre`.
 */
const EditarProyecto = z
  .object({
    comando: z.literal('editarProyecto'),
    clave: Clave,
    nombre: Titulo.optional(),
    descripcion: Descripcion.optional(),
    prioridad: EsquemaPrioridad.nullable().optional(),
  })
  .strict();

/** Concluido. Conserva absolutamente todo; solo sale de la vista diaria. */
const CerrarProyecto = z.object({ comando: z.literal('cerrarProyecto'), clave: Clave }).strict();

const ReabrirProyecto = z.object({ comando: z.literal('reabrirProyecto'), clave: Clave }).strict();

/**
 * Borra el proyecto y todo su árbol. Es la única operación de la app que destruye trabajo
 * en bloque, así que pide la clave DOS veces: `confirmacion` tiene que ser idéntica a
 * `clave`.
 *
 * No es ceremonia de interfaz metida en el contrato por gusto. El reductor es la última
 * capa antes del disco, y aquí un `eliminarProyecto` disparado por un bug de la vista
 * —una tecla en la fila equivocada, un id mal enlazado— no puede llevarse un año de
 * capturas. Un comando que borra 200 tareas tiene que ser imposible de emitir por
 * accidente, no solo difícil de pulsar.
 */
const EliminarProyecto = z
  .object({
    comando: z.literal('eliminarProyecto'),
    clave: Clave,
    /** Debe coincidir exactamente con `clave`. */
    confirmacion: z.string().min(1),
  })
  .strict();

// --- personas ---------------------------------------------------------------

/**
 * Alta sin ceremonia: el nombre y nada más. El id legible (`ana-garcia`) lo deriva el
 * reductor del nombre, y si choca con uno existente lo resuelve solo — no se le pregunta
 * al usuario por un identificador que no le importa.
 */
const CrearPersona = z
  .object({
    comando: z.literal('crearPersona'),
    nombre: Titulo,
    /** Opcional: darla de alta ya dedicada a unos proyectos, sin un segundo comando. */
    equipos: Equipos.optional(),
  })
  .strict();

/**
 * `id` identifica; tampoco hay campo para cambiarlo. El id de la persona es la referencia
 * que guardan `tarea.responsable` y el `responsable` de cada item de sprint —incluidos
 * los de los sprints CERRADOS (regla 8)—, así que renombrarlo reescribiría de quién fue
 * el trabajo del mes pasado. Se corrige el `nombre`, que es lo que se muestra.
 */
const EditarPersona = z
  .object({
    comando: z.literal('editarPersona'),
    id: Id,
    nombre: Titulo.optional(),
    equipos: Equipos.optional(),
  })
  .strict();

/** Sigue en el documento y en toda su historia; deja de recibir asignaciones nuevas. */
const DesactivarPersona = z
  .object({ comando: z.literal('desactivarPersona'), id: Id })
  .strict();

/**
 * El inverso de `desactivarPersona`, igual que `reabrirProyecto` lo es de `cerrarProyecto`.
 * No estaba en el encargo; se añade porque sin él una desactivación por error solo se
 * revierte editando el JSON a mano, y `deshacer` es una pila en memoria que no sobrevive
 * a cerrar la app.
 */
const ReactivarPersona = z
  .object({ comando: z.literal('reactivarPersona'), id: Id })
  .strict();

/** Solo si no tiene NADA asignado, ni en el presente ni en la historia. Ver el reductor. */
const EliminarPersona = z.object({ comando: z.literal('eliminarPersona'), id: Id }).strict();

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

/**
 * Qué se hace con una tarea que el sprint no terminó.
 *
 * - `siguiente` — pasa al sprint siguiente conservando su compromiso. Es el valor por
 *   omisión: cerrar sin decir nada tiene que hacer lo que el usuario describió como
 *   normal, no dejarle las tareas huérfanas.
 * - `backlog` — sale del ciclo y se queda en su historia, disponible para replanearse.
 * - `descartar` — «ya no aplica». Cancela la tarea; ver el reductor para el porqué.
 */
export const EsquemaDestinoAlCerrar = z.enum(['siguiente', 'backlog', 'descartar']);

export type DestinoAlCerrar = z.infer<typeof EsquemaDestinoAlCerrar>;

const DecisionDeCierre = z
  .object({ tareaId: Id, destino: EsquemaDestinoAlCerrar })
  .strict();

/**
 * La ceremonia de cierre completa, en **un solo comando**.
 *
 * Es un comando y no una secuencia de `sacarDelSprint` + `moverAlSprint` + `cerrarSprint`
 * por una razón concreta: deshacer. Cerrar un sprint de diez tareas y que `deshacer`
 * revirtiera solo la última sería peor que no tener deshacer, porque el usuario creería
 * que volvió atrás. Un comando = un documento en la pila = un `deshacer` que devuelve
 * exactamente al estado anterior al cierre.
 *
 * - `decisiones` es opcional y parcial: **lo que no se nombra va a `siguiente`**. Un
 *   sprint sin nada pendiente se cierra sin mandar nada.
 * - `siguienteSprintId` nombra a dónde van las de `siguiente`. Si no existe, el reductor
 *   lo crea `planeado` (no lo activa: cerrar y planear son dos actos distintos). Si se
 *   omite, se usa el siguiente sprint no cerrado que ya estuviera planeado, y si no hay
 *   ninguno se crea.
 *
 * Las tareas ya terminadas o ya canceladas no se nombran aquí: su desenlace no se decide,
 * se constata. El reductor rechaza una decisión sobre ellas en vez de ignorarla.
 */
const CerrarSprint = z
  .object({
    comando: z.literal('cerrarSprint'),
    sprintId: Id,
    decisiones: z.array(DecisionDeCierre).optional(),
    siguienteSprintId: Id.optional(),
  })
  .strict();

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
 *
 * Con esto ya se cubre «crear un equipo y a qué proyecto está dedicado»: un equipo no es
 * una entidad que se cree, es la lista de miembros de un proyecto, así que crearlo es
 * mandar este comando sobre un proyecto que todavía no tiene ninguno. No hace falta un
 * `crearEquipo`; lo que faltaba era la relación vista desde la persona, y eso lo añade
 * el campo `equipos` de `crearPersona` / `editarPersona`.
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
  CrearProyecto,
  EditarProyecto,
  CerrarProyecto,
  ReabrirProyecto,
  EliminarProyecto,
  CrearPersona,
  EditarPersona,
  DesactivarPersona,
  ReactivarPersona,
  EliminarPersona,
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
  // Altas, bajas y cambios de ciclo de vida: todas son acciones tras las que el usuario
  // da por hecho que quedó guardado y se va. `editarProyecto` y `editarPersona` no están
  // porque son tecleo de un nombre, igual que editar un título.
  'crearProyecto',
  'cerrarProyecto',
  'reabrirProyecto',
  'eliminarProyecto',
  'crearPersona',
  'desactivarPersona',
  'reactivarPersona',
  'eliminarPersona',
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
