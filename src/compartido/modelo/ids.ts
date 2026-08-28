/**
 * Generación y parseo de ids.
 *
 * Formato: `<CLAVE>-<PREFIJO><NUMERO>` — `SICOE-T14`, `SICOE-E1`, `DGETI-WEB-H3`.
 *
 * Por qué contadores persistidos y no MAX+1 (regla 15): si se borra `SICOE-T14` y el
 * siguiente id se calcula como máximo+1, el número 14 se recicla. Cualquier referencia
 * vieja a `SICOE-T14` — en `historial.jsonl`, en un item de sprint, en una nota que el
 * usuario escribió a mano — pasa a apuntar a otra cosa sin que nada falle.
 *
 * Este módulo no importa nada. Trabaja sobre formas estructurales mínimas para que
 * `esquema.ts` pueda usarlo sin crear un ciclo con los tipos que él mismo produce.
 */

export type TipoItem = 'epica' | 'historia' | 'tarea';

export const PREFIJOS: Record<TipoItem, string> = {
  epica: 'E',
  historia: 'H',
  tarea: 'T',
};

export interface Contadores {
  epicas: number;
  historias: number;
  tareas: number;
}

/** Campo de `Contadores` que corresponde a cada tipo. */
const CAMPO_CONTADOR: Record<TipoItem, keyof Contadores> = {
  epica: 'epicas',
  historia: 'historias',
  tarea: 'tareas',
};

const POR_PREFIJO: Record<string, TipoItem> = { E: 'epica', H: 'historia', T: 'tarea' };

/**
 * Clave de proyecto: mayúsculas, dígitos y guiones internos (`SICOE`, `DGETI-WEB`).
 * Sin minúsculas ni espacios porque es el prefijo de ids que el usuario busca con Cmd-F
 * dentro del propio JSON.
 */
export const PATRON_CLAVE_PROYECTO = /^[A-Z][A-Z0-9]*(-[A-Z0-9]+)*$/;

/**
 * El prefijo de tipo y el número anclan al final, así que una clave con guiones
 * internos se parsea sin ambigüedad.
 */
const PATRON_ID = /^([A-Z][A-Z0-9]*(?:-[A-Z0-9]+)*)-([EHT])([1-9]\d*)$/;

export interface IdParseado {
  claveProyecto: string;
  tipo: TipoItem;
  numero: number;
}

export function esClaveValida(clave: string): boolean {
  return PATRON_CLAVE_PROYECTO.test(clave);
}

/** `null` si el id no tiene el formato esperado. No lanza: el usuario edita a mano. */
export function parsearId(id: string): IdParseado | null {
  const coincidencia = PATRON_ID.exec(id);
  if (!coincidencia) return null;
  const [, clave, prefijo, numero] = coincidencia;
  if (!clave || !prefijo || !numero) return null;
  const tipo = POR_PREFIJO[prefijo];
  if (!tipo) return null;
  return { claveProyecto: clave, tipo, numero: Number(numero) };
}

export function componerId(clave: string, tipo: TipoItem, numero: number): string {
  return `${clave}-${PREFIJOS[tipo]}${numero}`;
}

/** ¿Este id pertenece a este proyecto? Detecta referencias mal copiadas entre proyectos. */
export function esIdDe(id: string, clave: string): boolean {
  const parseado = parsearId(id);
  return parseado !== null && parseado.claveProyecto === clave;
}

export interface IdEmitido {
  id: string;
  contadores: Contadores;
}

/**
 * Emite el siguiente id sin mutar nada: devuelve el id y los contadores nuevos, y quien
 * llama decide cuándo persistirlos.
 *
 * Puro a propósito. Si esto mutara el proyecto en memoria, un fallo al escribir el
 * archivo dejaría el contador avanzado y el id ya consumido sin dueño.
 *
 * **La regla de numeración, y no cambia con N9: el número sale SIEMPRE del proyecto raíz,
 * nunca del padre inmediato.**
 *
 * Una tarea es `SICOE-T14` cuelgue de una historia, de una épica o del proyecto. La
 * consecuencia buscada es que **mover una tarea no la renumera**: sacarla de una historia
 * mal definida y colgarla del proyecto —que es un flujo normal, no un caso raro— deja
 * intactas todas las referencias que ya la nombran, en `historial.jsonl`, en los items de
 * sprint cerrados y en lo que el usuario haya escrito a mano.
 *
 * La alternativa —numerar por padre— haría que el id dejara de ser estable justo en la
 * operación más frecuente. No hay vuelta atrás barata: la importación de Jira va a acuñar
 * cientos de ids con esta regla.
 */
export function siguienteId(
  clave: string,
  contadores: Contadores,
  tipo: TipoItem,
): IdEmitido {
  const campo = CAMPO_CONTADOR[tipo];
  const numero = contadores[campo] + 1;
  return {
    id: componerId(clave, tipo, numero),
    contadores: { ...contadores, [campo]: numero },
  };
}

/**
 * Forma mínima que necesita la verificación de contadores.
 *
 * Las tres listas de tareas (N9) son opcionales aquí a propósito: esta interfaz la
 * cumplen también los objetos a medio construir de las pruebas, y exigirlas obligaría a
 * rellenar `tareas: []` en sitios donde no aporta nada. Lo que NO puede pasar es que una
 * lista exista y no se mire: por eso las tres se recorren abajo.
 */
export interface ArbolConIds {
  clave: string;
  contadores: Contadores;
  tareas?: readonly { id: string }[];
  epicas: readonly {
    id: string;
    tareas?: readonly { id: string }[];
    historias: readonly { id: string; tareas: readonly { id: string }[] }[];
  }[];
}

/** Mayor número ya usado por tipo dentro del proyecto. Solo para verificar contadores. */
export function maximosUsados(proyecto: ArbolConIds): Contadores {
  const max: Contadores = { epicas: 0, historias: 0, tareas: 0 };
  const anotar = (id: string, tipo: TipoItem) => {
    const parseado = parsearId(id);
    if (!parseado || parseado.tipo !== tipo) return;
    const campo = CAMPO_CONTADOR[tipo];
    if (parseado.numero > max[campo]) max[campo] = parseado.numero;
  };
  // Los tres sitios donde puede colgar una tarea (N9). Olvidar uno significa que un
  // `SICOE-T500` escrito a mano ahí no levantaría la alarma, y la app volvería a emitir
  // ese número: dos tareas vivas con el mismo id, que es el fallo que regla 15 previene.
  for (const tarea of proyecto.tareas ?? []) anotar(tarea.id, 'tarea');
  for (const epica of proyecto.epicas) {
    anotar(epica.id, 'epica');
    for (const tarea of epica.tareas ?? []) anotar(tarea.id, 'tarea');
    for (const historia of epica.historias) {
      anotar(historia.id, 'historia');
      for (const tarea of historia.tareas) anotar(tarea.id, 'tarea');
    }
  }
  return max;
}

/**
 * Comprueba que ningún contador quedó por debajo de lo ya usado.
 *
 * Escenario que esto ataja: el usuario añade `SICOE-T500` a mano y no toca
 * `contadores.tareas`, que va en 108. La app seguiría emitiendo `SICOE-T109`, y la
 * tarea número 392 volvería a ser `SICOE-T500`, duplicando un id vivo. Devuelve la
 * lista de problemas; vacía = todo bien.
 */
export function problemasDeContadores(proyecto: ArbolConIds): string[] {
  const max = maximosUsados(proyecto);
  const problemas: string[] = [];
  for (const campo of ['epicas', 'historias', 'tareas'] as const) {
    if (proyecto.contadores[campo] < max[campo]) {
      problemas.push(
        `contadores.${campo} = ${proyecto.contadores[campo]} pero ${proyecto.clave} ya usa el número ${max[campo]}`,
      );
    }
  }
  return problemas;
}
