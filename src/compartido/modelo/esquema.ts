/**
 * Esquema Zod del documento. **Única fuente de verdad de los tipos**: `tipos.ts` los
 * deriva de aquí con `z.infer`, nunca los mantiene en paralelo.
 *
 * Dos decisiones que gobiernan todo este archivo:
 *
 * - `passthrough`, nunca `strict` (regla 14). El usuario abre el JSON y escribe notas
 *   suyas. `strict` las rechazaría y `strip` se las comería en silencio al guardar.
 * - Los campos que alguien escribiendo a mano puede olvidar llevan `.default(...)`, así
 *   omitirlos es cómodo y la salida sigue siendo no-opcional. Lo que NO lleva default es
 *   lo que no se puede inventar sin adivinar: id, título, clave, estado.
 *
 * La validación cruzada (referencias, unicidad, contadores) va en un `superRefine` sobre
 * el documento completo, no repartida por entidad: una referencia rota solo se ve con el
 * documento entero delante.
 *
 * Nota de convención: las CLAVES del documento van en `snake_case` porque son formato de
 * datos que el usuario lee y edita a mano — igual que `proyecto_id` y `origen` en
 * `historial.jsonl` (regla 7). El código TypeScript sigue siendo `camelCase`.
 */

import { z } from 'zod';

import { PATRON_CLAVE_PROYECTO, esIdDe, parsearId, problemasDeContadores } from './ids';
import { ESQUEMA_VERSION } from './version';

const PATRON_FECHA = /^\d{4}-\d{2}-\d{2}$/;
const PATRON_ID_PERSONA = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** Fecha de calendario. Se compara lexicográficamente: sin `Date`, sin zona horaria. */
const EsquemaFecha = z.string().regex(PATRON_FECHA, 'se espera una fecha YYYY-MM-DD');

/**
 * Marca de tiempo ISO 8601. No se valida con `datetime()` estricto porque el usuario
 * puede escribir la hora local sin zona y eso no debería tumbar la app.
 */
const EsquemaInstante = z.string().min(1);

export const EsquemaPrioridad = z.enum(['alta', 'media', 'baja']);

/**
 * Estado de una tarea. `bloqueada` NO está aquí a propósito: el bloqueo es ortogonal al
 * avance — una tarea bloqueada estaba en curso y se atoró, y conserva ese avance. Vive
 * en `Tarea.bloqueos` como lista histórica.
 */
export const EsquemaEstadoTarea = z.enum(['pendiente', 'en_curso', 'hecha', 'cancelada']);

export const EsquemaTipoBloqueo = z.enum([
  'dependencia',
  'externo',
  'decision',
  'informacion',
  'otro',
]);

export const EsquemaEstadoSprint = z.enum(['planeado', 'activo', 'cerrado']);

/**
 * Qué pasó con una tarea en un sprint. Se fija al cerrarlo; mientras el sprint está
 * abierto es `null`.
 *
 * Los cuatro primeros son los que emite hoy la ceremonia de cierre: lo terminado
 * (`completada`) y las tres salidas que el usuario decide para lo que no se terminó —
 * pasa al sprint siguiente (`arrastrada`), vuelve al backlog (`devuelta`) o ya no aplica
 * (`descartada`).
 *
 * **`arrastrada` es el desenlace del item, no el contador de arrastres.** «Cuántos
 * sprints lleva arrastrándose» se sigue derivando de en cuántos sprints aparece la tarea
 * (`sprintsQueLaTocaron`), nunca de un número persistido que se desincronizaría en cuanto
 * alguien sacara la tarea de un sprint.
 *
 * Los dos últimos son historia y se conservan porque hay documentos escritos antes de que
 * existiera la ceremonia (regla 14: lo que el usuario ya tiene no se rompe):
 *
 * - `no_terminada` — lo que emitía el cierre viejo, cuando no había decisión que tomar.
 *   Ningún comando lo escribe ya; sigue siendo válido al leer.
 * - `cancelada` — la tarea YA estaba cancelada cuando se cerró el sprint. No es lo mismo
 *   que `descartada`: ahí no hubo decisión de cierre que registrar, solo un hecho previo.
 */
export const EsquemaDesenlaceItem = z.enum([
  'completada',
  'arrastrada',
  'devuelta',
  'descartada',
  'no_terminada',
  'cancelada',
]);

export const EsquemaPersona = z
  .object({
    /** Id legible a mano: `"jesus-castillo"`. Nunca un UUID. */
    id: z.string().regex(PATRON_ID_PERSONA, 'id de persona en minúsculas y guiones: "ana-garcia"'),
    nombre: z.string().min(1),
    /** Fuera del equipo actual pero conservada porque aparece en tareas históricas. */
    activa: z.boolean().default(true),
    /** Reservado para la futura importación de Jira. */
    clave_externa: z.string().nullable().default(null),
  })
  .passthrough();

/**
 * Pertenencia de una persona al equipo de un proyecto.
 *
 * No hay entidad `Equipo` con identidad propia: un equipo ES la lista de miembros de un
 * proyecto. Que alguien esté en varios equipos (Jesús Alberto en SICOE e Infraestructura)
 * se lee recorriendo proyectos, no duplicando la relación en dos lugares.
 *
 * El equipo NO restringe quién puede ser responsable de una tarea: una tarea vieja puede
 * apuntar a alguien que ya salió del equipo, y eso es correcto.
 */
export const EsquemaMiembroEquipo = z
  .object({
    persona_id: z.string().min(1),
    /** Texto libre a propósito: "backend", "vistas", "QA". No es un enum que mantener. */
    rol: z.string().nullable().default(null),
  })
  .passthrough();

export const EsquemaBloqueo = z
  .object({
    tipo: EsquemaTipoBloqueo,
    motivo: z.string().min(1),
    bloqueada_en: EsquemaInstante,
    /** `null` = sigue bloqueada. */
    desbloqueada_en: EsquemaInstante.nullable().default(null),
  })
  .passthrough();

export const EsquemaTarea = z
  .object({
    id: z.string().min(1),
    titulo: z.string().min(1),
    descripcion: z.string().nullable().default(null),
    estado: EsquemaEstadoTarea,
    /**
     * Procedencia, no estado (regla 17): una tarea no planeada puede estar pendiente,
     * en curso o bloqueada. La marca el proyecto según `planeacion_cerrada_en`.
     */
    planeada: z.boolean().default(true),
    /**
     * Valor vigente y fuente de verdad. Sacar la tarea de un sprint para redefinirla no
     * lo borra: el item del sprint nunca fue el dueño de este campo.
     */
    responsable: z.string().nullable().default(null),
    fecha_limite: EsquemaFecha.nullable().default(null),
    prioridad: EsquemaPrioridad.nullable().default(null),
    /** Nullable: una tarea escrita a mano no debería tumbar la app por omitirla. */
    creada_en: EsquemaInstante.nullable().default(null),
    /** Cuándo pasó a `hecha`. Las métricas que lo necesiten ignoran las que no lo tengan. */
    hecha_en: EsquemaInstante.nullable().default(null),
    /** Lista histórica, no un flag. Vacía = nunca se bloqueó. */
    bloqueos: z.array(EsquemaBloqueo).default([]),
    /** Clave en Jira (`"SICOE-104"`). Reservado para la importación. */
    clave_externa: z.string().nullable().default(null),
  })
  .passthrough()
  .superRefine((tarea, ctx) => {
    // Dos bloqueos abiertos a la vez no significan nada: no se sabría cuál se cierra al
    // desbloquear, ni desde cuándo contar los días bloqueada.
    const abiertos = tarea.bloqueos.filter((bloqueo) => bloqueo.desbloqueada_en === null).length;
    if (abiertos > 1) {
      ctx.addIssue({
        code: 'custom',
        path: ['bloqueos'],
        message: `${tarea.id}: hay ${abiertos} bloqueos abiertos a la vez; cierra los anteriores con "desbloqueada_en"`,
      });
    }
  });

export const EsquemaHistoria = z
  .object({
    id: z.string().min(1),
    titulo: z.string().min(1),
    descripcion: z.string().nullable().default(null),
    planeada: z.boolean().default(true),
    clave_externa: z.string().nullable().default(null),
    /** Puede estar vacío: historia declarada pero sin desglosar. Avance `null`, no 0%. */
    tareas: z.array(EsquemaTarea).default([]),
  })
  .passthrough();

export const EsquemaEpica = z
  .object({
    id: z.string().min(1),
    titulo: z.string().min(1),
    descripcion: z.string().nullable().default(null),
    planeada: z.boolean().default(true),
    clave_externa: z.string().nullable().default(null),
    /** Puede estar vacío: épica declarada pero sin desglosar. */
    historias: z.array(EsquemaHistoria).default([]),
  })
  .passthrough();

/** Contadores persistidos por proyecto. Solo suben; nunca se recalculan como MAX+1. */
export const EsquemaContadores = z
  .object({
    epicas: z.number().int().nonnegative().default(0),
    historias: z.number().int().nonnegative().default(0),
    tareas: z.number().int().nonnegative().default(0),
  })
  .passthrough();

export const EsquemaProyecto = z
  .object({
    /** Inmutable: es el prefijo de todos los ids del proyecto. */
    clave: z
      .string()
      .regex(PATRON_CLAVE_PROYECTO, 'clave en mayúsculas, sin espacios: "SICOE", "DGETI-WEB"'),
    nombre: z.string().min(1),
    descripcion: z.string().nullable().default(null),
    /**
     * Captura manual. Sin esto, en el Panorama "abandonado" y "de baja prioridad" se ven
     * idénticos: el tablero solo sabe decir qué está quieto, no qué importa.
     */
    prioridad: EsquemaPrioridad.nullable().default(null),
    /**
     * ¿Fuera de la vista diaria? Responde a "no me lo pintes", no a "ya terminó". Un
     * proyecto pausado sin fecha de conclusión se archiva igual.
     */
    archivado: z.boolean().default(false),
    /**
     * Fecha en que el proyecto CONCLUYÓ. `null` = sigue vivo.
     *
     * Es un campo aparte de `archivado` y no un enum de estado porque las dos preguntas
     * son distintas y ninguna se deriva de la otra: `archivado` es "sácalo de mi vista"
     * y `cerrado_en` es "cuándo terminó". Cerrar implica archivar (lo hace
     * `cerrarProyecto`); archivar no implica cerrar.
     *
     * Y ninguno de los dos es eliminar: cerrar CONSERVA toda la historia del proyecto —
     * sus tareas siguen ahí, y los sprints cerrados que las comprometieron siguen
     * apuntando a algo real (regla 8). Ver `eliminarProyecto` en el reductor.
     *
     * Aditivo con `.default(null)`: los documentos escritos antes de que este campo
     * existiera siguen validando sin tocarlos.
     */
    cerrado_en: EsquemaFecha.nullable().default(null),
    /**
     * Fecha en que se pulsó "Cerrar planeación inicial". Lo capturado después nace
     * `planeada: false`. `null` = nunca se cerró, así que todo es planeado y el código de
     * color simplemente no aparece: degradación segura.
     */
    planeacion_cerrada_en: EsquemaFecha.nullable().default(null),
    contadores: EsquemaContadores.default({ epicas: 0, historias: 0, tareas: 0 }),
    equipo: z.array(EsquemaMiembroEquipo).default([]),
    epicas: z.array(EsquemaEpica).default([]),
    clave_externa: z.string().nullable().default(null),
  })
  .passthrough();

/**
 * Compromiso de una tarea dentro de un sprint.
 *
 * `responsable`, `fecha_limite` y `prioridad` en `null` significan "hereda de la tarea",
 * no "sin asignar"; se materializan al cerrar el sprint. Sin esta indirección pasa una de
 * dos cosas malas: o el dato solo vive en el item y sacar la tarea del sprint lo pierde
 * —y sacar para redefinir es un flujo normal—, o solo vive en la tarea y reasignarla
 * mañana reescribe la historia de los sprints ya cerrados.
 *
 * Sacar una tarea del sprint quita el item del array; el rastro de la salida vive en el
 * historial append-only, no aquí. Así `items` siempre significa "lo comprometido", sin
 * filtros por medio.
 */
export const EsquemaItemSprint = z
  .object({
    tarea_id: z.string().min(1),
    responsable: z.string().nullable().default(null),
    fecha_limite: EsquemaFecha.nullable().default(null),
    prioridad: EsquemaPrioridad.nullable().default(null),
    /** `null` mientras el sprint no esté cerrado. */
    desenlace: EsquemaDesenlaceItem.nullable().default(null),
  })
  .passthrough();

export const EsquemaSprint = z
  .object({
    id: z.string().min(1),
    nombre: z.string().min(1),
    inicio: EsquemaFecha,
    fin: EsquemaFecha,
    estado: EsquemaEstadoSprint,
    /**
     * El orden del array ES la prioridad dentro del sprint. No hay campo `orden`: dos
     * fuentes de orden divergen en cuanto alguien arrastra una fila.
     */
    items: z.array(EsquemaItemSprint).default([]),
  })
  .passthrough()
  .superRefine((sprint, ctx) => {
    if (sprint.fin < sprint.inicio) {
      ctx.addIssue({
        code: 'custom',
        path: ['fin'],
        message: `${sprint.id}: la fecha de fin (${sprint.fin}) es anterior al inicio (${sprint.inicio})`,
      });
    }
  });

/**
 * Se separa la forma de la validación cruzada para que `validacionesCruzadas` pueda
 * tipar su parámetro sin referirse al esquema que la contiene.
 */
const FormaDocumento = z
  .object({
    esquema_version: z.number().int().positive(),
    personas: z.array(EsquemaPersona).default([]),
    proyectos: z.array(EsquemaProyecto).default([]),
    /** En la raíz: un sprint del usuario cruza proyectos. A lo sumo uno `activo`. */
    sprints: z.array(EsquemaSprint).default([]),
  })
  .passthrough();

export const EsquemaDocumento = FormaDocumento.superRefine(validacionesCruzadas);

// --- validación cruzada -----------------------------------------------------

function validacionesCruzadas(
  doc: z.infer<typeof FormaDocumento>,
  ctx: z.RefinementCtx,
): void {
  const anotar = (path: (string | number)[], message: string) =>
    ctx.addIssue({ code: 'custom', path, message });

  const personas = new Set<string>();
  doc.personas.forEach((persona, i) => {
    if (personas.has(persona.id)) anotar(['personas', i, 'id'], `persona duplicada: ${persona.id}`);
    personas.add(persona.id);
  });
  const personaConocida = (id: string | null) => id === null || personas.has(id);

  const claves = new Set<string>();
  const idsDeTarea = new Set<string>();
  const idsVistos = new Set<string>();

  doc.proyectos.forEach((proyecto, p) => {
    const rutaProyecto: (string | number)[] = ['proyectos', p];
    if (claves.has(proyecto.clave)) {
      anotar([...rutaProyecto, 'clave'], `clave de proyecto duplicada: ${proyecto.clave}`);
    }
    claves.add(proyecto.clave);

    proyecto.equipo.forEach((miembro, m) => {
      const ruta = [...rutaProyecto, 'equipo', m, 'persona_id'];
      if (!personas.has(miembro.persona_id)) {
        anotar(
          ruta,
          `${proyecto.clave}: el equipo referencia a "${miembro.persona_id}", que no está en personas`,
        );
      }
      if (proyecto.equipo.findIndex((otro) => otro.persona_id === miembro.persona_id) !== m) {
        anotar(ruta, `${proyecto.clave}: "${miembro.persona_id}" aparece dos veces en el equipo`);
      }
    });

    // El id de cada item debe llevar la clave de SU proyecto. Copiar y pegar una historia
    // de un proyecto a otro sin renombrar deja ids que dicen pertenecer a otro sitio, y a
    // partir de ahí las referencias del historial apuntan a la nada.
    const revisarId = (id: string, ruta: (string | number)[]) => {
      if (idsVistos.has(id)) anotar(ruta, `id duplicado en el documento: ${id}`);
      idsVistos.add(id);
      if (parsearId(id) === null) {
        anotar(ruta, `id con formato inesperado: "${id}" (se espera ${proyecto.clave}-T1)`);
      } else if (!esIdDe(id, proyecto.clave)) {
        anotar(ruta, `"${id}" está dentro de ${proyecto.clave} pero su prefijo dice otro proyecto`);
      }
    };

    proyecto.epicas.forEach((epica, e) => {
      revisarId(epica.id, [...rutaProyecto, 'epicas', e, 'id']);
      epica.historias.forEach((historia, h) => {
        const rutaHistoria = [...rutaProyecto, 'epicas', e, 'historias', h];
        revisarId(historia.id, [...rutaHistoria, 'id']);
        historia.tareas.forEach((tarea, t) => {
          const rutaTarea = [...rutaHistoria, 'tareas', t];
          revisarId(tarea.id, [...rutaTarea, 'id']);
          idsDeTarea.add(tarea.id);
          if (!personaConocida(tarea.responsable)) {
            anotar(
              [...rutaTarea, 'responsable'],
              `${tarea.id}: responsable "${tarea.responsable}" no está en personas`,
            );
          }
        });
      });
    });

    // Sin esto la app volvería a emitir un id que ya existe y machacaría datos vivos.
    for (const problema of problemasDeContadores(proyecto)) {
      anotar([...rutaProyecto, 'contadores'], problema);
    }
  });

  const idsSprint = new Set<string>();
  let activos = 0;
  doc.sprints.forEach((sprint, s) => {
    const rutaSprint: (string | number)[] = ['sprints', s];
    if (idsSprint.has(sprint.id)) anotar([...rutaSprint, 'id'], `sprint duplicado: ${sprint.id}`);
    idsSprint.add(sprint.id);
    if (sprint.estado === 'activo') activos += 1;

    const enEsteSprint = new Set<string>();
    sprint.items.forEach((item, i) => {
      const ruta = [...rutaSprint, 'items', i, 'tarea_id'];
      if (!idsDeTarea.has(item.tarea_id)) {
        anotar(ruta, `${sprint.id}: la tarea "${item.tarea_id}" no existe en ningún proyecto`);
      }
      if (enEsteSprint.has(item.tarea_id)) {
        anotar(ruta, `${sprint.id}: la tarea "${item.tarea_id}" está dos veces en el mismo sprint`);
      }
      enEsteSprint.add(item.tarea_id);
      if (!personaConocida(item.responsable)) {
        anotar(
          [...rutaSprint, 'items', i, 'responsable'],
          `${sprint.id}: responsable "${item.responsable}" no está en personas`,
        );
      }
    });
  });

  if (activos > 1) {
    // "El sprint activo" es singular en toda la interfaz; dos romperían la vista de carga.
    anotar(['sprints'], `hay ${activos} sprints con estado "activo"; solo puede haber uno`);
  }
}

// --- API de validación ------------------------------------------------------

export interface ProblemaValidacion {
  /** Ruta legible dentro del JSON: `proyectos[0].epicas[2].tareas[1].id`. */
  ruta: string;
  mensaje: string;
}

export type ResultadoValidacion =
  | { ok: true; documento: z.infer<typeof EsquemaDocumento> }
  | { ok: false; problemas: ProblemaValidacion[] };

/**
 * Valida sin lanzar. La pantalla de solo lectura (regla 13) necesita la lista completa
 * de problemas con su ruta, no la primera excepción.
 */
export function validarDocumento(valor: unknown): ResultadoValidacion {
  const resultado = EsquemaDocumento.safeParse(valor);
  if (resultado.success) return { ok: true, documento: resultado.data };
  return {
    ok: false,
    problemas: resultado.error.issues.map((incidencia) => ({
      ruta: formatearRuta(incidencia.path),
      mensaje: incidencia.message,
    })),
  };
}

function formatearRuta(ruta: readonly PropertyKey[]): string {
  if (ruta.length === 0) return '(raíz)';
  return ruta
    .map((segmento) => (typeof segmento === 'number' ? `[${segmento}]` : `.${String(segmento)}`))
    .join('')
    .replace(/^\./, '');
}

/**
 * Documento mínimo válido. No lo usa el arranque: con un JSON ilegible se entra en solo
 * lectura (regla 13), nunca con documento vacío. Sirve para el primer arranque real —
 * cuando todavía no existe archivo — y para las pruebas.
 */
export function documentoVacio(): z.infer<typeof EsquemaDocumento> {
  return {
    esquema_version: ESQUEMA_VERSION,
    personas: [],
    proyectos: [],
    sprints: [],
  };
}
