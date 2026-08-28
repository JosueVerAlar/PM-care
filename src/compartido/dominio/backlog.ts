/**
 * E10c — el cálculo del Backlog del área.
 *
 * Módulo puro. `hoy` entra como parámetro.
 *
 * Es la única vista que puede pasar de mil filas: son todas las tareas de todos los
 * proyectos, sin la ventana del sprint ni la del árbol de un proyecto. De ahí las tres
 * herramientas que la vuelven usable —alcance, agrupación y filtro de texto— y de ahí que
 * el filtrado viva aquí y no en el componente: buscar sobre mil filas dentro de un `map`
 * de JSX es exactamente cómo una vista se vuelve imposible de probar.
 *
 * ## Alcance
 *
 * - `todas` — todo lo capturado, incluidas hechas y canceladas. Es lo que hace que
 *   agrupar por estado signifique algo.
 * - `sin-comprometer` — lo abierto que NO está en el sprint activo. Es la definición útil
 *   para «¿qué podría entrar al sprint que viene?»: si incluyera lo ya comprometido, la
 *   vista repetiría el sprint y dejaría de servir para elegir.
 *
 ## Qué responsable y qué fecha se muestran
 *
 * El COMPROMISO vigente, no el campo crudo de la tarea. Los tres campos del item —quién,
 * para cuándo, con qué prioridad— en `null` significan «hereda de la tarea», así que una
 * tarea sin fecha propia sí puede estar vencida dentro del sprint activo; leer solo
 * `tarea.fecha_limite` dejaría la columna vacía y ninguna fila marcada, que es exactamente
 * lo que pasaba antes de esta corrección. Y se agrupa por el MISMO responsable que se
 * muestra: agrupar por uno y pintar el otro coloca filas bajo alguien que no las tiene.
 *
 * ## El filtro compara sin acentos y sin mayúsculas
 *
 * Quien busca «restablecimiento» no escribe la tilde de «Restablecimiento de
 * contraseñas», y un filtro que exige la tilde se siente roto. Se normaliza a NFD y se
 * quitan los diacríticos: es una comparación, no una traducción.
 */

import type { Bloqueo, Documento, EstadoTarea, Fecha, PersonaId } from '../modelo/tipos';
import {
  bloqueoAbierto,
  diasBloqueada,
  estaAbierta,
  estaEnSprint,
  mostrarProcedencia,
  todasLasTareas,
} from './clasificar';
import { compromisoEfectivo, sprintActivo, type UbicacionTarea } from './derivar';

export type AlcanceBacklog = 'todas' | 'sin-comprometer';
export type AgrupacionBacklog = 'proyecto' | 'responsable' | 'estado';

export const ALCANCE_POR_OMISION: AlcanceBacklog = 'todas';
export const AGRUPACION_POR_OMISION: AgrupacionBacklog = 'proyecto';

/** El orden en que se leen los estados. No es alfabético: es el ciclo de vida. */
const ORDEN_ESTADO: readonly EstadoTarea[] = ['iniciado', 'pendiente', 'done', 'cancelada'];

export interface FilaBacklog {
  ubicacion: UbicacionTarea;
  enSprintActivo: boolean;
  bloqueo: Bloqueo | null;
  diasDetenida: number | null;
  /** La del compromiso vigente. `null` = no hay fecha, que no es «vence hoy». */
  fechaLimite: Fecha | null;
  vencida: boolean;
  nuevo: boolean;
  /** Id del responsable vigente. `null` = sin asignar, que no es lo mismo que vacío. */
  responsableId: PersonaId | null;
  /** Nombre resuelto. Si el id no está en el catálogo se devuelve el id, nunca «—». */
  responsable: string | null;
}

export interface GrupoBacklog {
  /** Clave estable para React y para el plegado. */
  id: string;
  /** No nulo al agrupar por proyecto. */
  clave: string | null;
  /** No nulo al agrupar por responsable con persona conocida. */
  personaId: PersonaId | null;
  /** No nulo al agrupar por estado. La etiqueta en español la pone el renderer. */
  estado: EstadoTarea | null;
  /** Texto ya resuelto del encabezado cuando no lo pone una tabla de etiquetas. */
  nombre: string | null;
  filas: FilaBacklog[];
}

export interface ConteoBacklog {
  /** Filas del alcance elegido, ANTES del filtro de texto. */
  enAlcance: number;
  /** Filas después del filtro. Es lo que se pinta. */
  visibles: number;
  /** Todas las tareas del documento. El denominador honesto de la vista. */
  capturadas: number;
}

export function filasDeBacklog(
  doc: Documento,
  hoy: Fecha,
  alcance: AlcanceBacklog,
  texto: string,
): { filas: FilaBacklog[]; conteo: ConteoBacklog } {
  const activo = sprintActivo(doc);
  const nombres = new Map(doc.personas.map((persona) => [persona.id, persona.nombre]));
  const aguja = normalizar(texto);

  const todas = todasLasTareas(doc);
  const enAlcance = todas.filter((ubicacion) =>
    alcance === 'todas'
      ? true
      : estaAbierta(ubicacion.tarea) && !estaEnSprint(ubicacion.tarea.id, activo),
  );

  const filas = enAlcance
    .map((ubicacion) => {
      const { tarea } = ubicacion;
      const item = activo?.items.find((i) => i.tarea_id === tarea.id);
      // Sin item, `compromisoEfectivo` devuelve los campos de la tarea: una sola función
      // resuelve los dos casos y no hay dos maneras de leer «quién la tiene».
      const compromiso =
        item === undefined
          ? { responsable: tarea.responsable, fechaLimite: tarea.fecha_limite, prioridad: tarea.prioridad }
          : compromisoEfectivo(item, tarea);
      return {
        ubicacion,
        enSprintActivo: item !== undefined,
        bloqueo: bloqueoAbierto(tarea),
        diasDetenida: diasBloqueada(tarea, hoy),
        fechaLimite: compromiso.fechaLimite,
        vencida:
          compromiso.fechaLimite !== null && compromiso.fechaLimite < hoy && estaAbierta(tarea),
        nuevo: mostrarProcedencia(tarea),
        responsableId: compromiso.responsable,
        responsable:
          compromiso.responsable === null
            ? null
            : nombres.get(compromiso.responsable) ?? compromiso.responsable,
      };
    })
    .filter((fila) => coincide(fila, aguja));

  return {
    filas,
    conteo: { enAlcance: enAlcance.length, visibles: filas.length, capturadas: todas.length },
  };
}

export function agruparBacklog(
  filas: readonly FilaBacklog[],
  agrupacion: AgrupacionBacklog,
): GrupoBacklog[] {
  const grupos = new Map<string, GrupoBacklog>();

  for (const fila of filas) {
    const { tarea, proyecto } = fila.ubicacion;
    const id =
      agrupacion === 'proyecto'
        ? proyecto.clave
        : agrupacion === 'estado'
          ? tarea.estado
          : (fila.responsableId ?? '');

    const grupo =
      grupos.get(id) ??
      {
        id,
        clave: agrupacion === 'proyecto' ? proyecto.clave : null,
        personaId: agrupacion === 'responsable' ? fila.responsableId : null,
        estado: agrupacion === 'estado' ? tarea.estado : null,
        nombre:
          agrupacion === 'proyecto'
            ? proyecto.nombre
            : agrupacion === 'responsable'
              ? fila.responsable
              : null,
        filas: [],
      };
    grupo.filas.push(fila);
    grupos.set(id, grupo);
  }

  const lista = [...grupos.values()];

  if (agrupacion === 'estado') {
    return lista.sort((a, b) => indiceEstado(a.estado) - indiceEstado(b.estado));
  }
  if (agrupacion === 'responsable') {
    // Más carga primero: en una lista por persona, quién carga más ES el hallazgo. «Sin
    // asignar» va al final: es un hueco del documento, no una persona que compita.
    return lista.sort(
      (a, b) =>
        Number(a.personaId === null) - Number(b.personaId === null) ||
        b.filas.length - a.filas.length ||
        (a.id < b.id ? -1 : 1),
    );
  }
  // Por proyecto se conserva el orden del documento, que es el que el usuario reconoce.
  return lista;
}

/**
 * ¿Esta fila pasa el filtro? Con filtro vacío, todo pasa.
 *
 * Se busca sobre el responsable YA RESUELTO: quien teclea «jesús» espera encontrar sus
 * tareas, y el documento guarda `jesus-castillo`.
 */
function coincide(fila: FilaBacklog, aguja: string): boolean {
  if (aguja === '') return true;
  const { tarea, historia, epica, proyecto } = fila.ubicacion;
  // Los niveles que no existen (N9) no aportan texto; buscar por «SICOE» o por el título
  // sigue encontrando una tarea que cuelga directo del proyecto.
  const pajar = normalizar(
    [
      tarea.id,
      tarea.titulo,
      historia?.titulo ?? '',
      epica?.titulo ?? '',
      proyecto.clave,
      proyecto.nombre,
      fila.responsable ?? '',
    ].join(' '),
  );
  return pajar.includes(aguja);
}

/** Minúsculas y sin diacríticos. La comparación no debe exigir tildes. */
function normalizar(texto: string): string {
  return texto
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function indiceEstado(estado: EstadoTarea | null): number {
  if (estado === null) return ORDEN_ESTADO.length;
  const indice = ORDEN_ESTADO.indexOf(estado);
  return indice === -1 ? ORDEN_ESTADO.length : indice;
}
