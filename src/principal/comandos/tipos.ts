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
  EsquemaEsfuerzo,
  EsquemaPrioridad,
  EsquemaProyecto,
  EsquemaSprint,
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

// --- planeación inicial -----------------------------------------------------

/**
 * Fija `planeacion_cerrada_en` al día de hoy: **lo capturado a partir de aquí nace
 * marcado como no planeado**, sin que el usuario tenga que acordarse de marcar nada.
 *
 * Es la puerta que le faltaba a una mecánica que el modelo ya soportaba: el campo existía
 * y `crearTarea` lo consultaba, pero ningún comando lo escribía, así que un proyecto que
 * nunca cerró su planeación marcaba todo como planeado y no había forma de forzarlo.
 *
 * El campo se llama `proyecto` y no `clave` porque así lo pidió el contrato acordado con
 * `frontend`. Nótese que los comandos del ciclo de vida del proyecto (`cerrarProyecto`,
 * `reabrirProyecto`) usan `clave`; si algún día se unifican, se unifican los dos lados a
 * la vez.
 *
 * **Límite conocido, y es de un día:** la marca es una FECHA, y `crearTarea` considera
 * planeado todo lo capturado *hasta* esa fecha inclusive. Así que cerrar la planeación
 * hoy no marca lo que se capture hoy mismo por la tarde; eso empieza mañana. Para el
 * mismo día está `planeada` explícito en `crearTarea`.
 */
const CerrarPlaneacion = z
  .object({ comando: z.literal('cerrarPlaneacion'), proyecto: Clave })
  .strict();

/**
 * Vuelve a dejar `planeacion_cerrada_en` en `null`: se estaba planeando todavía.
 *
 * **No reclasifica nada.** Las tareas capturadas mientras la planeación estuvo cerrada
 * conservan su `planeada: false`. Ver el reductor para el argumento completo; en corto:
 * `planeada` es un hecho del momento de la captura (regla 17, procedencia y no estado) y
 * reescribirlo hacia atrás borraría el único dato que distingue lo previsto de lo que se
 * coló.
 */
const ReabrirPlaneacion = z
  .object({ comando: z.literal('reabrirPlaneacion'), proyecto: Clave })
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

// --- usuario de la app ------------------------------------------------------

/**
 * Dice cuál de las personas es quien usa esta copia de la app. Es lo que responde «¿a
 * quién se refiere *mío*?» en el conmutador «Solo lo mío» del Sprint global.
 *
 * `id` es OBLIGATORIO y nullable, al revés que los campos de los comandos de edición: no
 * hay «ausente = no tocar» que valga en un comando cuyo único trabajo es tocar este
 * campo. `null` lo borra —la app vuelve a no saber quién la usa— y es la forma de
 * deshacerlo a mano sin editar el JSON.
 *
 * La persona tiene que existir y estar activa; ver el reductor.
 */
const FijarUsuario = z
  .object({ comando: z.literal('fijarUsuario'), id: Id.nullable() })
  .strict();

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

/**
 * Índice de destino en la lista del padre, **contado sobre la lista ya sin el elemento que
 * se mueve**: llevar la primera de cinco épicas al final es `aIndice: 4`, no `5`. Es la
 * misma cuenta que hace `moverAlSprint` con un item que ya está en el sprint, y es la que
 * sale sola de una interfaz de arrastre que pinta huecos ENTRE filas.
 *
 * Aquí se exige entero y no negativo; **pasarse por arriba no se rechaza, se topa** al
 * último hueco (ver `indiceDeDestino` en el reductor). La asimetría es deliberada: un
 * arrastre puede calcular un índice de más por un píxel al soltar al final de la lista, y
 * eso tiene que funcionar. Un `-1` o un `NaN`, en cambio, no los produce ningún arrastre
 * bien formado —son el centinela de un `findIndex` que no encontró nada, o una división
 * rota—, así que ahí sí conviene el rechazo ruidoso.
 */
const AIndice = z.number().int().nonnegative();

/**
 * Cambia el orden de una épica dentro de su proyecto. **Es el comando que prioriza.**
 *
 * ## La rama entera se mueve con la épica, por construcción
 *
 * La épica ES un elemento de `proyecto.epicas[]` y sus historias —y las tareas de cada
 * historia— cuelgan de ella. Mover el elemento mueve el subárbol completo porque no hay
 * nada más que mover: no existe ninguna lista paralela de historias, ni un índice de
 * tareas por proyecto, ni un orden persistido aparte del propio anidamiento.
 *
 * **Esa garantía es el encargo, no un efecto secundario.** El usuario pidió «arrastrar el
 * orden una sola vez con todas sus historias y las tareas o subtareas». El día que a
 * alguien le tiente aplanar el árbol para acelerar una vista —una lista de historias en la
 * raíz del proyecto con un `epica_id`, un mapa de tareas por id— este comando deja de
 * cumplir lo que promete y hay que reescribirlo entero. Si ese día llega, se cambia esto
 * primero y a conciencia, no de pasada.
 *
 * `proyecto` es redundante con `epicaId` (los ids son únicos en todo el documento y el
 * reductor sabría encontrar la épica sin él) y aun así se pide: es la afirmación «creo que
 * esta épica cuelga de este proyecto». Si no coincide, el comando se rechaza en vez de
 * reordenar en otro sitio. Y es lo que separa esto de «mover entre padres», que no existe.
 */
const ReordenarEpica = z
  .object({
    comando: z.literal('reordenarEpica'),
    /** Clave del proyecto. Mismo nombre de campo que en `crearEpica` y `editarEquipo`. */
    proyecto: z.string().min(1),
    epicaId: Id,
    aIndice: AIndice,
  })
  .strict();

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

/**
 * Cambia el orden de una historia dentro de su épica. Se lleva sus tareas por el mismo
 * motivo estructural que `reordenarEpica` se lleva la rama: cuelgan de ella.
 *
 * `epicaId` es la afirmación de padre, igual que `proyecto` allá: reordenar nunca saca a
 * una historia de su épica.
 */
const ReordenarHistoria = z
  .object({
    comando: z.literal('reordenarHistoria'),
    epicaId: Id,
    historiaId: Id,
    aIndice: AIndice,
  })
  .strict();

// --- árbol: tareas ----------------------------------------------------------

const CrearTarea = z
  .object({
    comando: z.literal('crearTarea'),
    /**
     * Dónde nace: el id de una historia, el de una épica, o la CLAVE del proyecto
     * (regla 18). Se llamaba `historiaId` cuando ese era el único sitio posible.
     */
    contenedorId: Id,
    titulo: Titulo,
    descripcion: Descripcion.optional(),
    responsable: Responsable.optional(),
    prioridad: EsquemaPrioridad.nullable().optional(),
    fechaLimite: FechaLimite.optional(),
    esfuerzo: EsquemaEsfuerzo.nullable().optional(),
    /**
     * Fuerza la procedencia en vez de dejar que la decida `planeacion_cerrada_en`.
     *
     * **Ausente = la decide el proyecto**, que es el caso normal y el que hace que la
     * mecánica funcione sin que el usuario se acuerde de nada. Presente = el usuario (o
     * la vista) sabe algo que la fecha no sabe:
     *
     * - `false` en un proyecto que nunca cerró su planeación: **la captura directa en el
     *   sprint**. Algo que entra al sprint sin haber pasado por el backlog no estaba
     *   contemplado, por definición, y es la mejor señal de trabajo emergente que tiene
     *   el producto. Sin este campo, esa señal se perdía entera en los proyectos que no
     *   cerraron su planeación.
     * - `true` con la planeación ya cerrada: algo que SÍ estaba en el plan y se capturó
     *   tarde. Existe la dirección contraria porque la corrección honesta va en los dos
     *   sentidos; un campo que solo permite marcar «emergente» acabaría usándose para
     *   contar lo que a uno le conviene.
     *
     * No es `nullable`: `null` no significaría nada distinto de «ausente» y tener dos
     * formas de decir lo mismo es cómo se escriben dos ramas que divergen.
     */
    planeada: z.boolean().optional(),
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
    /** `null` explícito borra la estimación; omitirlo la deja como está. */
    esfuerzo: EsquemaEsfuerzo.nullable().optional(),
  })
  .strict();

const EliminarTarea = z.object({ comando: z.literal('eliminarTarea'), id: Id }).strict();

/**
 * Cambia el orden de una tarea dentro de su historia.
 *
 * **No toca ningún sprint.** El orden del árbol y el orden de `sprint.items` son dos cosas
 * distintas: el primero dice cómo está organizado el trabajo, el segundo qué se
 * comprometió y en qué prioridad. Reordenar aquí no reordena allá, y `moverAlSprint` con
 * `posicion` sigue siendo el único comando que toca el orden del sprint.
 */
const ReordenarTarea = z
  .object({
    comando: z.literal('reordenarTarea'),
    /**
     * El contenedor donde vive la tarea: el id de una historia, el de una épica, o la
     * CLAVE del proyecto (regla 18). Se llamaba `historiaId` cuando ese era el único
     * sitio posible; el nombre cambió con N9 para que no mienta.
     */
    contenedorId: Id,
    tareaId: Id,
    aIndice: AIndice,
  })
  .strict();

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

const CrearSprint = z.object({
  comando: z.literal('crearSprint'),
  clave: Clave,
  nombre: Titulo.optional(),
  inicio: EsquemaSprint.shape.inicio,
  fin: EsquemaSprint.shape.fin,
}).strict();

const EditarSprint = z.object({
  comando: z.literal('editarSprint'),
  sprintId: Id,
  nombre: Titulo.optional(),
  inicio: EsquemaSprint.shape.inicio.optional(),
  fin: EsquemaSprint.shape.fin.optional(),
}).strict();

/**
 * La retrospectiva: el ÚNICO comando que toca un sprint cerrado.
 *
 * Va aparte de `editarSprint` a propósito, y no como un campo más suyo. `editarSprint`
 * está prohibido sobre un sprint cerrado, y si la retro viajara dentro habría que abrirle
 * la puerta al comando entero — con el nombre y las fechas colándose por ella. Un comando
 * propio permite que la guarda sea la contraria a la de todos los demás: éste **exige**
 * que el sprint esté cerrado.
 *
 * `null` borra la retro. Un texto vacío también, normalizado en el reductor: dos formas de
 * decir «no hay» son dos formas de que una vista pinte una nota en blanco.
 */
const EscribirRetrospectiva = z
  .object({
    comando: z.literal('escribirRetrospectiva'),
    sprintId: Id,
    texto: z.string().nullable(),
  })
  .strict();

const EliminarSprint = z.object({ comando: z.literal('eliminarSprint'), sprintId: Id }).strict();
const DesactivarSprint = z.object({ comando: z.literal('desactivarSprint'), sprintId: Id }).strict();

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
  CerrarPlaneacion,
  ReabrirPlaneacion,
  CrearPersona,
  EditarPersona,
  DesactivarPersona,
  ReactivarPersona,
  EliminarPersona,
  FijarUsuario,
  CrearEpica,
  EditarEpica,
  EliminarEpica,
  ReordenarEpica,
  CrearHistoria,
  EditarHistoria,
  EliminarHistoria,
  ReordenarHistoria,
  CrearTarea,
  EditarTarea,
  EliminarTarea,
  ReordenarTarea,
  CambiarEstado,
  MoverAlSprint,
  SacarDelSprint,
  CerrarSprint,
  ActivarSprint,
  CrearSprint,
  EditarSprint,
  EliminarSprint,
  DesactivarSprint,
  EscribirRetrospectiva,
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
 *
 * Los tres `reordenar*` quedan FUERA por lo mismo que editar un título: priorizar es una
 * ráfaga de arrastres seguidos, no un acto que termine en «listo, cierro». Dejarlos al
 * debounce hace además que diez arrastres seguidos se anexen a la bitácora en una sola
 * escritura en vez de diez.
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
  'crearSprint',
  'eliminarSprint',
  'desactivarSprint',
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
  // Cerrar la planeación cambia cómo nace TODO lo que se capture después; perderlo por
  // medio segundo dejaría al usuario capturando con una regla distinta de la que cree.
  'cerrarPlaneacion',
  'reabrirPlaneacion',
  // Se fija una vez en la vida de la app. Que no sobreviva a cerrar la ventana es
  // exactamente el problema que este campo viene a resolver.
  'fijarUsuario',
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
