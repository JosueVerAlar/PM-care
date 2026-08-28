/**
 * E10a — el cálculo de la vista global de Terminadas.
 *
 * Módulo puro. Sin `fs`, sin `ipc`, sin React.
 *
 * ## Registro por sprint cerrado, no lista infinita
 *
 * «¿Qué se terminó?» sin ventana de tiempo es una lista que solo crece y que nadie abre.
 * La pregunta real es de fin de mes: «¿qué cerramos en la quincena pasada?». Por eso la
 * unidad es el SPRINT CERRADO, del más reciente al más viejo, y dentro de cada uno el
 * corte es por proyecto — que es como se reporta hacia arriba.
 *
 * ## Se cuenta el desenlace congelado, no el árbol vivo
 *
 * Una tarea se cuenta en un sprint si su item quedó con `desenlace === 'completada'`. Si
 * se leyera `tarea.estado === 'hecha'`, reabrir hoy una tarea cambiaría lo que se cerró en
 * julio, y el registro dejaría de ser un registro. Los sprints cerrados son inmutables
 * (regla 8) y esta vista es su lectura.
 *
 * ## La reconciliación que evita que dos cifras parezcan mentir
 *
 * El avance de un proyecto cuenta TODAS sus tareas hechas; el registro por sprint solo
 * cuenta las que pasaron por un sprint cerrado. Las que se capturaron ya hechas —o las que
 * se cerraron sin sprint— no aparecerían en ningún sitio y la diferencia entre las dos
 * cifras parecería un error de la app. `terminadasFueraDeSprint` las nombra.
 */

import type { Documento, Instante, Sprint } from '../modelo/tipos';
import { estaHecha, paraVistaTerminadas } from './clasificar';
import { indexarTareas, sprintsCerrados, type UbicacionTarea } from './derivar';

export interface TareaTerminada {
  ubicacion: UbicacionTarea;
  /** Cuándo pasó a hecha. `null` en documentos escritos a mano: se dice, no se inventa. */
  hechaEn: Instante | null;
  /**
   * El desenlace del sprint dice «completada» pero la tarea ya no está hecha: alguien la
   * reabrió después de cerrar el sprint. Se muestra igual —el registro es inmutable— pero
   * la fila lo advierte en vez de enseñar un glifo de «hecha» que hoy es falso.
   */
  reabierta: boolean;
}

export interface ProyectoTerminadas {
  clave: string;
  nombre: string;
  tareas: TareaTerminada[];
}

export interface RegistroSprint {
  sprint: Sprint;
  /** Cuántas se cerraron en este sprint. Es la serie que el usuario llama «avance real». */
  total: number;
  porProyecto: ProyectoTerminadas[];
  /** Items que no se completaron. Se dice el número: un sprint no es solo lo que salió. */
  noCompletadas: number;
}

export interface TerminadasFuera {
  total: number;
  porProyecto: ProyectoTerminadas[];
}

/**
 * El registro completo, del sprint más reciente al más viejo.
 *
 * Un sprint cerrado sin ningún desenlace registrado se incluye igual, con total 0: es un
 * sprint que existió, y esconderlo dejaría un hueco en la serie sin explicación.
 */
export function registroDeTerminadas(doc: Documento): RegistroSprint[] {
  const indice = indexarTareas(doc);

  const registros = sprintsCerrados(doc).map((sprint) => {
    const terminadas: UbicacionTarea[] = [];
    const marcas = new Map<string, boolean>();
    let noCompletadas = 0;

    for (const item of sprint.items) {
      if (item.desenlace !== 'completada') {
        noCompletadas += 1;
        continue;
      }
      const ubicacion = indice.get(item.tarea_id);
      // Una tarea borrada después de cerrar el sprint deja el item huérfano. No se
      // inventa una fila con su id: se descuenta y se dice cuántas no se pudieron pintar.
      if (!ubicacion) continue;
      terminadas.push(ubicacion);
      marcas.set(ubicacion.tarea.id, !estaHecha(ubicacion.tarea));
    }

    const porProyecto = agruparPorProyecto(terminadas, (u) => ({
      ubicacion: u,
      hechaEn: u.tarea.hecha_en,
      reabierta: marcas.get(u.tarea.id) ?? false,
    }));

    return {
      sprint,
      total: terminadas.length,
      porProyecto,
      noCompletadas,
    };
  });

  return registros.reverse();
}

/**
 * Tareas hechas que no figuran como `completada` en ningún sprint cerrado.
 *
 * Son las que se capturaron ya hechas (el arranque de un proyecto que venía andando) y
 * las que se cerraron sin pasar por un sprint. Cuentan para el avance del proyecto y no
 * para el registro, y decirlo es lo que evita que las dos cifras parezcan contradecirse.
 */
export function terminadasFueraDeSprint(doc: Documento): TerminadasFuera {
  const registradas = new Set<string>();
  for (const sprint of sprintsCerrados(doc)) {
    for (const item of sprint.items) {
      if (item.desenlace === 'completada') registradas.add(item.tarea_id);
    }
  }

  const sueltas = paraVistaTerminadas(doc).filter((u) => !registradas.has(u.tarea.id));

  return {
    total: sueltas.length,
    porProyecto: agruparPorProyecto(sueltas, (u) => ({
      ubicacion: u,
      hechaEn: u.tarea.hecha_en,
      reabierta: false,
    })),
  };
}

/**
 * El texto pegable en un correo.
 *
 * Vive en el dominio y no en la vista porque QUÉ líneas lleva y en qué orden es la misma
 * decisión que la pantalla: si se escribiera aparte, el día que cambie el agrupado el
 * texto copiado dejaría de coincidir con lo que se ve. Lo único que entra desde fuera es
 * `formatearFecha`, porque el formato local (`18 ago`) depende de `Intl`, que es del
 * borde de presentación y no del dominio.
 */
export function textoDeTerminadas(
  encabezado: string,
  porProyecto: readonly ProyectoTerminadas[],
  formatearFecha: (instante: Instante) => string,
): string {
  const lineas: string[] = [encabezado];

  // `grupo`, no `proyecto`: es un agrupamiento de la vista, no un nodo del modelo. El
  // nombre importa porque su campo `tareas` no es el arreglo del documento (regla 18).
  for (const grupo of porProyecto) {
    lineas.push('', `${grupo.nombre} (${grupo.tareas.length})`);
    for (const terminada of grupo.tareas) {
      const fecha =
        terminada.hechaEn === null ? 'sin fecha' : formatearFecha(terminada.hechaEn);
      lineas.push(`  · ${terminada.ubicacion.tarea.id} — ${terminada.ubicacion.tarea.titulo} (${fecha})`);
    }
  }

  return lineas.join('\n');
}

/** Encabezado de un sprint para el texto copiado: `Sprint 33 · 2026-08-10 a 2026-08-21 · 5 terminadas`. */
export function encabezadoDeSprint(registro: RegistroSprint): string {
  const cuenta = registro.total === 1 ? '1 terminada' : `${registro.total} terminadas`;
  return `${registro.sprint.nombre} · ${registro.sprint.inicio} a ${registro.sprint.fin} · ${cuenta}`;
}

// --- interno ----------------------------------------------------------------

/**
 * Agrupa por proyecto conservando el orden de aparición del documento, no alfabético: el
 * usuario reconoce sus proyectos en el orden en que los tiene, y reordenarlos por nombre
 * mueve el mismo bloque de sitio en cada sprint.
 */
function agruparPorProyecto<T>(
  ubicaciones: readonly UbicacionTarea[],
  mapear: (u: UbicacionTarea) => T,
): { clave: string; nombre: string; tareas: T[] }[] {
  const grupos = new Map<string, { clave: string; nombre: string; tareas: T[] }>();
  for (const ubicacion of ubicaciones) {
    const { clave, nombre } = ubicacion.proyecto;
    const grupo = grupos.get(clave) ?? { clave, nombre, tareas: [] };
    grupo.tareas.push(mapear(ubicacion));
    grupos.set(clave, grupo);
  }
  return [...grupos.values()];
}
