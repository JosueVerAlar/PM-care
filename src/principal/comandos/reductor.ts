/**
 * `(documento, comando, ahora) -> documento`. **Puro.**
 *
 * Sin `fs`, sin `ipcMain`, sin `app`, y sin `Date.now()` ni `new Date()`: el instante
 * entra como parámetro. Eso es lo que hace que la etapa se pueda verificar sin arrancar
 * Electron, que deshacer sea un `pop` de una pila de documentos y que dentro de un año se
 * pueda reproducir exactamente qué produjo cada línea del historial.
 *
 * (Importa `rutaLegible` del módulo de historial para no duplicar el formato de `origen`.
 * Ese módulo puede hacer entrada/salida, pero el reductor no ejecuta ninguna.)
 *
 * ## Dos invariantes que se aplican aquí y no en la interfaz
 *
 * - **Sprints cerrados inmutables (regla 8).** No basta con no ofrecer el botón: también
 *   se rechaza borrar una tarea que aparece en un sprint cerrado, porque eso dejaría el
 *   sprint apuntando a una tarea inexistente y reescribiría lo que pasó.
 * - **Ids por contador persistido (regla 15).** Nunca «el máximo más uno». El contador
 *   del proyecto se avanza en el mismo documento que estrena el id, así que o se guardan
 *   los dos o no se guarda ninguno.
 *
 * ## La red de seguridad
 *
 * Antes de devolver nada, el documento resultante pasa por `validarDocumento`. Si el
 * reductor produjera algo que el esquema rechaza —una referencia rota, un contador por
 * debajo de lo usado—, el comando falla y **no se escribe**. Cuesta una validación por
 * mutación sobre un archivo de decenas de KB; es barato comparado con persistir basura.
 */

import { fechaDe } from '../../compartido/dominio/clasificar';
import { compromisoEfectivo } from '../../compartido/dominio/derivar';
import { validarDocumento } from '../../compartido/modelo/esquema';
import { siguienteId } from '../../compartido/modelo/ids';
import type {
  Documento,
  Epica,
  Historia,
  Instante,
  Proyecto,
  Sprint,
  Tarea,
} from '../../compartido/modelo/tipos';
import type { EntradaHistorial, FuenteEvento } from '../historial/registrar';
import { rutaLegible } from '../historial/registrar';
import type { Comando, NombreComando } from './tipos';

export type CodigoError =
  /** El id no existe en el documento. */
  | 'no-encontrado'
  /** La operación tocaría un sprint cerrado (regla 8). */
  | 'sprint-cerrado'
  /** El comando no tiene sentido en el estado actual: sin cambios, ya bloqueada, etc. */
  | 'invalido'
  /** El reductor produjo algo que el esquema rechaza. Es un bug nuestro; no se escribe. */
  | 'documento-invalido';

export interface ErrorComando {
  codigo: CodigoError;
  mensaje: string;
  /** Rutas del esquema, solo para `documento-invalido`. */
  detalles?: string[];
}

export type ResultadoReductor =
  | { ok: true; documento: Documento; evento: EntradaHistorial }
  | { ok: false; error: ErrorComando };

export function reducir(
  documento: Documento,
  comando: Comando,
  ahora: Instante,
  fuente: FuenteEvento = 'ui',
): ResultadoReductor {
  const doc = clonar(documento);
  const aplicado = aplicar(doc, comando, ahora, fuente);
  if (!aplicado.ok) return aplicado;

  // Red de seguridad: nada sale de aquí sin pasar el esquema completo.
  const validado = validarDocumento(aplicado.documento);
  if (!validado.ok) {
    return {
      ok: false,
      error: {
        codigo: 'documento-invalido',
        mensaje: `el comando "${comando.comando}" habría dejado el documento inválido; no se escribió nada`,
        detalles: validado.problemas.slice(0, 8).map((p) => `${p.ruta}: ${p.mensaje}`),
      },
    };
  }
  return { ok: true, documento: validado.documento, evento: aplicado.evento };
}

// --- despacho ---------------------------------------------------------------

function aplicar(
  doc: Documento,
  comando: Comando,
  ahora: Instante,
  fuente: FuenteEvento,
): ResultadoReductor {
  const anotar = (campos: CamposEvento): EntradaHistorial =>
    nuevoEvento(ahora, comando.comando, fuente, campos);

  switch (comando.comando) {
    // --- épicas ---------------------------------------------------------
    case 'crearEpica': {
      const proyecto = doc.proyectos.find((p) => p.clave === comando.proyecto);
      if (proyecto === undefined) return falta(`el proyecto "${comando.proyecto}"`);

      const emitido = siguienteId(proyecto.clave, proyecto.contadores, 'epica');
      proyecto.contadores = { ...proyecto.contadores, ...emitido.contadores };
      const epica: Epica = {
        id: emitido.id,
        titulo: comando.titulo,
        descripcion: comando.descripcion ?? null,
        planeada: naceComoPlaneada(proyecto, ahora),
        clave_externa: null,
        historias: [],
      };
      proyecto.epicas.push(epica);

      return {
        ok: true,
        documento: doc,
        evento: anotar({
          proyecto_id: proyecto.clave,
          origen: rutaLegible([proyecto.clave]),
          epica_id: epica.id,
          item_id: epica.id,
          resumen: `Épica creada: ${epica.titulo}`,
        }),
      };
    }

    case 'editarEpica': {
      const sitio = buscarEpica(doc, comando.id);
      if (sitio === null) return falta(`la épica "${comando.id}"`);
      const antes = { titulo: sitio.epica.titulo, descripcion: sitio.epica.descripcion };
      if (comando.titulo === undefined && comando.descripcion === undefined) return sinCambios();
      if (comando.titulo !== undefined) sitio.epica.titulo = comando.titulo;
      if (comando.descripcion !== undefined) sitio.epica.descripcion = comando.descripcion;

      return {
        ok: true,
        documento: doc,
        evento: anotar({
          proyecto_id: sitio.proyecto.clave,
          origen: rutaLegible([sitio.proyecto.clave]),
          epica_id: sitio.epica.id,
          item_id: sitio.epica.id,
          resumen: `Épica editada: ${sitio.epica.titulo}`,
          detalle: { antes, despues: { titulo: sitio.epica.titulo, descripcion: sitio.epica.descripcion } },
        }),
      };
    }

    case 'eliminarEpica': {
      const sitio = buscarEpica(doc, comando.id);
      if (sitio === null) return falta(`la épica "${comando.id}"`);
      const tareas = idsDeTareasDeEpica(sitio.epica);
      const cerrado = primerSprintCerradoCon(doc, tareas);
      if (cerrado !== null) return atadaASprintCerrado(cerrado, tareas);

      quitarDeSprintsAbiertos(doc, tareas);
      sitio.proyecto.epicas.splice(sitio.proyecto.epicas.indexOf(sitio.epica), 1);

      return {
        ok: true,
        documento: doc,
        evento: anotar({
          proyecto_id: sitio.proyecto.clave,
          origen: rutaLegible([sitio.proyecto.clave]),
          epica_id: sitio.epica.id,
          item_id: sitio.epica.id,
          resumen: `Épica eliminada: ${sitio.epica.titulo} (${tareas.size} tareas)`,
          detalle: { tareas: [...tareas] },
        }),
      };
    }

    // --- historias ------------------------------------------------------
    case 'crearHistoria': {
      const sitio = buscarEpica(doc, comando.epicaId);
      if (sitio === null) return falta(`la épica "${comando.epicaId}"`);

      const emitido = siguienteId(sitio.proyecto.clave, sitio.proyecto.contadores, 'historia');
      sitio.proyecto.contadores = { ...sitio.proyecto.contadores, ...emitido.contadores };
      const historia: Historia = {
        id: emitido.id,
        titulo: comando.titulo,
        descripcion: comando.descripcion ?? null,
        planeada: naceComoPlaneada(sitio.proyecto, ahora),
        clave_externa: null,
        tareas: [],
      };
      sitio.epica.historias.push(historia);

      return {
        ok: true,
        documento: doc,
        evento: anotar({
          proyecto_id: sitio.proyecto.clave,
          origen: rutaLegible([sitio.proyecto.clave, sitio.epica.titulo]),
          epica_id: sitio.epica.id,
          historia_id: historia.id,
          item_id: historia.id,
          resumen: `Historia creada: ${historia.titulo}`,
        }),
      };
    }

    case 'editarHistoria': {
      const sitio = buscarHistoria(doc, comando.id);
      if (sitio === null) return falta(`la historia "${comando.id}"`);
      if (comando.titulo === undefined && comando.descripcion === undefined) return sinCambios();
      const antes = { titulo: sitio.historia.titulo, descripcion: sitio.historia.descripcion };
      if (comando.titulo !== undefined) sitio.historia.titulo = comando.titulo;
      if (comando.descripcion !== undefined) sitio.historia.descripcion = comando.descripcion;

      return {
        ok: true,
        documento: doc,
        evento: anotar({
          proyecto_id: sitio.proyecto.clave,
          origen: rutaLegible([sitio.proyecto.clave, sitio.epica.titulo]),
          epica_id: sitio.epica.id,
          historia_id: sitio.historia.id,
          item_id: sitio.historia.id,
          resumen: `Historia editada: ${sitio.historia.titulo}`,
          detalle: { antes, despues: { titulo: sitio.historia.titulo, descripcion: sitio.historia.descripcion } },
        }),
      };
    }

    case 'eliminarHistoria': {
      const sitio = buscarHistoria(doc, comando.id);
      if (sitio === null) return falta(`la historia "${comando.id}"`);
      const tareas = new Set(sitio.historia.tareas.map((t) => t.id));
      const cerrado = primerSprintCerradoCon(doc, tareas);
      if (cerrado !== null) return atadaASprintCerrado(cerrado, tareas);

      quitarDeSprintsAbiertos(doc, tareas);
      sitio.epica.historias.splice(sitio.epica.historias.indexOf(sitio.historia), 1);

      return {
        ok: true,
        documento: doc,
        evento: anotar({
          proyecto_id: sitio.proyecto.clave,
          origen: rutaLegible([sitio.proyecto.clave, sitio.epica.titulo]),
          epica_id: sitio.epica.id,
          historia_id: sitio.historia.id,
          item_id: sitio.historia.id,
          resumen: `Historia eliminada: ${sitio.historia.titulo} (${tareas.size} tareas)`,
          detalle: { tareas: [...tareas] },
        }),
      };
    }

    // --- tareas ---------------------------------------------------------
    case 'crearTarea': {
      const sitio = buscarHistoria(doc, comando.historiaId);
      if (sitio === null) return falta(`la historia "${comando.historiaId}"`);
      const responsable = comando.responsable ?? null;
      if (responsable !== null && !doc.personas.some((p) => p.id === responsable)) {
        return falta(`la persona "${responsable}"`);
      }

      const emitido = siguienteId(sitio.proyecto.clave, sitio.proyecto.contadores, 'tarea');
      sitio.proyecto.contadores = { ...sitio.proyecto.contadores, ...emitido.contadores };
      const tarea: Tarea = {
        id: emitido.id,
        titulo: comando.titulo,
        descripcion: comando.descripcion ?? null,
        estado: 'pendiente',
        // Procedencia, no estado (regla 17): lo capturado después de cerrar la
        // planeación nace «no planeado» sin que el usuario marque nada (D4).
        planeada: naceComoPlaneada(sitio.proyecto, ahora),
        responsable,
        fecha_limite: comando.fechaLimite ?? null,
        prioridad: comando.prioridad ?? null,
        creada_en: ahora,
        hecha_en: null,
        bloqueos: [],
        clave_externa: null,
      };
      sitio.historia.tareas.push(tarea);

      return {
        ok: true,
        documento: doc,
        evento: anotar({
          proyecto_id: sitio.proyecto.clave,
          origen: rutaLegible([sitio.proyecto.clave, sitio.epica.titulo, sitio.historia.titulo]),
          epica_id: sitio.epica.id,
          historia_id: sitio.historia.id,
          item_id: tarea.id,
          resumen: `Tarea capturada: ${tarea.titulo}`,
          detalle: { planeada: tarea.planeada },
        }),
      };
    }

    case 'editarTarea': {
      const sitio = buscarTarea(doc, comando.id);
      if (sitio === null) return falta(`la tarea "${comando.id}"`);
      const { tarea } = sitio;
      const cambios: (keyof Tarea)[] = [];
      const antes = instantaneaDeTarea(tarea);

      if (comando.titulo !== undefined) { tarea.titulo = comando.titulo; cambios.push('titulo'); }
      if (comando.descripcion !== undefined) { tarea.descripcion = comando.descripcion; cambios.push('descripcion'); }
      if (comando.responsable !== undefined) {
        if (comando.responsable !== null && !doc.personas.some((p) => p.id === comando.responsable)) {
          return falta(`la persona "${comando.responsable}"`);
        }
        tarea.responsable = comando.responsable;
        cambios.push('responsable');
      }
      if (comando.prioridad !== undefined) { tarea.prioridad = comando.prioridad; cambios.push('prioridad'); }
      if (comando.fechaLimite !== undefined) { tarea.fecha_limite = comando.fechaLimite; cambios.push('fecha_limite'); }
      if (cambios.length === 0) return sinCambios();

      return {
        ok: true,
        documento: doc,
        evento: anotar({
          ...ubicacionDeTarea(sitio),
          resumen: `Tarea editada: ${tarea.titulo}`,
          detalle: { campos: cambios, antes, despues: instantaneaDeTarea(tarea) },
        }),
      };
    }

    case 'eliminarTarea': {
      const sitio = buscarTarea(doc, comando.id);
      if (sitio === null) return falta(`la tarea "${comando.id}"`);
      const soloEsta = new Set([sitio.tarea.id]);
      const cerrado = primerSprintCerradoCon(doc, soloEsta);
      if (cerrado !== null) return atadaASprintCerrado(cerrado, soloEsta);

      quitarDeSprintsAbiertos(doc, soloEsta);
      sitio.historia.tareas.splice(sitio.historia.tareas.indexOf(sitio.tarea), 1);

      return {
        ok: true,
        documento: doc,
        evento: anotar({
          ...ubicacionDeTarea(sitio),
          resumen: `Tarea eliminada: ${sitio.tarea.titulo}`,
          detalle: { estado: sitio.tarea.estado },
        }),
      };
    }

    case 'cambiarEstado': {
      const sitio = buscarTarea(doc, comando.id);
      if (sitio === null) return falta(`la tarea "${comando.id}"`);
      const { tarea } = sitio;
      const anterior = tarea.estado;
      if (anterior === comando.estado) {
        return { ok: false, error: { codigo: 'invalido', mensaje: `${tarea.id} ya está en estado "${anterior}"` } };
      }

      tarea.estado = comando.estado;
      // `hecha_en` es la marca de CUÁNDO se terminó, no una copia del estado. Reabrir una
      // tarea la borra: dejarla puesta haría que las vistas de Terminadas mostraran algo
      // que volvió a estar en curso.
      tarea.hecha_en = comando.estado === 'hecha' ? ahora : null;
      // El estado y el bloqueo son ortogonales: terminar una tarea bloqueada no cierra el
      // bloqueo solo. Lo cierra `desbloquear`, y así queda su registro histórico.

      return {
        ok: true,
        documento: doc,
        evento: anotar({
          ...ubicacionDeTarea(sitio),
          resumen: `${tarea.id}: ${anterior} → ${comando.estado}`,
          detalle: { antes: anterior, despues: comando.estado },
        }),
      };
    }

    // --- sprint ---------------------------------------------------------
    case 'moverAlSprint': {
      const sitio = buscarTarea(doc, comando.tareaId);
      if (sitio === null) return falta(`la tarea "${comando.tareaId}"`);
      const sprint = doc.sprints.find((s) => s.id === comando.sprintId);
      if (sprint === undefined) return falta(`el sprint "${comando.sprintId}"`);
      if (sprint.estado === 'cerrado') return sprintCerrado(sprint);

      const existente = sprint.items.findIndex((i) => i.tarea_id === sitio.tarea.id);
      const destino = posicionValida(comando.posicion, sprint, existente >= 0);

      if (existente >= 0) {
        if (comando.posicion === undefined || comando.posicion === null || destino === existente) {
          return { ok: false, error: { codigo: 'invalido', mensaje: `${sitio.tarea.id} ya está en ${sprint.id}` } };
        }
        const [item] = sprint.items.splice(existente, 1);
        if (item !== undefined) sprint.items.splice(destino, 0, item);
      } else {
        sprint.items.splice(destino, 0, {
          tarea_id: sitio.tarea.id,
          // `null` = «hereda de la tarea», no «sin asignar». Se materializa al cerrar.
          responsable: null,
          fecha_limite: null,
          prioridad: null,
          desenlace: null,
        });
      }

      return {
        ok: true,
        documento: doc,
        evento: anotar({
          ...ubicacionDeTarea(sitio),
          sprint_id: sprint.id,
          resumen:
            existente >= 0
              ? `${sitio.tarea.id} reordenada en ${sprint.id} (posición ${destino + 1})`
              : `${sitio.tarea.id} movida al sprint ${sprint.id}`,
          detalle: { posicion: destino },
        }),
      };
    }

    case 'sacarDelSprint': {
      const sitio = buscarTarea(doc, comando.tareaId);
      if (sitio === null) return falta(`la tarea "${comando.tareaId}"`);
      const sprint = doc.sprints.find((s) => s.id === comando.sprintId);
      if (sprint === undefined) return falta(`el sprint "${comando.sprintId}"`);
      if (sprint.estado === 'cerrado') return sprintCerrado(sprint);

      const indice = sprint.items.findIndex((i) => i.tarea_id === sitio.tarea.id);
      if (indice < 0) {
        return { ok: false, error: { codigo: 'invalido', mensaje: `${sitio.tarea.id} no está en ${sprint.id}` } };
      }
      // Se quita el item entero, no se marca. El rastro de la salida vive en el historial
      // append-only; así `items` siempre significa «lo comprometido», sin filtros.
      sprint.items.splice(indice, 1);

      return {
        ok: true,
        documento: doc,
        evento: anotar({
          ...ubicacionDeTarea(sitio),
          sprint_id: sprint.id,
          resumen: `${sitio.tarea.id} sacada del sprint ${sprint.id}`,
        }),
      };
    }

    case 'cerrarSprint': {
      const sprint = doc.sprints.find((s) => s.id === comando.sprintId);
      if (sprint === undefined) return falta(`el sprint "${comando.sprintId}"`);
      if (sprint.estado === 'cerrado') return sprintCerrado(sprint);

      const porTarea = new Map<string, Tarea>();
      for (const proyecto of doc.proyectos) {
        for (const epica of proyecto.epicas) {
          for (const historia of epica.historias) {
            for (const tarea of historia.tareas) porTarea.set(tarea.id, tarea);
          }
        }
      }

      const conteo = { completada: 0, no_terminada: 0, cancelada: 0 };
      for (const item of sprint.items) {
        const tarea = porTarea.get(item.tarea_id);
        const desenlace =
          tarea?.estado === 'hecha' ? 'completada' : tarea?.estado === 'cancelada' ? 'cancelada' : 'no_terminada';
        item.desenlace = desenlace;
        conteo[desenlace] += 1;
        // Se materializa lo heredado ANTES de congelar: a partir de aquí el sprint es
        // inmutable, y reasignar la tarea mañana no puede reescribir lo que se comprometió.
        const compromiso = compromisoEfectivo(item, tarea);
        item.responsable = compromiso.responsable;
        item.fecha_limite = compromiso.fechaLimite;
        item.prioridad = compromiso.prioridad;
      }
      sprint.estado = 'cerrado';

      return {
        ok: true,
        documento: doc,
        evento: anotar({
          sprint_id: sprint.id,
          resumen: `Sprint ${sprint.id} cerrado: ${conteo.completada} completadas, ${conteo.no_terminada} no terminadas, ${conteo.cancelada} canceladas`,
          detalle: { ...conteo, items: sprint.items.length },
        }),
      };
    }

    case 'activarSprint': {
      const sprint = doc.sprints.find((s) => s.id === comando.sprintId);
      if (sprint === undefined) return falta(`el sprint "${comando.sprintId}"`);
      if (sprint.estado === 'cerrado') return sprintCerrado(sprint);
      if (sprint.estado === 'activo') {
        return { ok: false, error: { codigo: 'invalido', mensaje: `${sprint.id} ya está activo` } };
      }
      // Solo puede haber uno activo, y no lo resolvemos cerrando el otro por nuestra
      // cuenta: cerrar un sprint fija desenlaces y es irreversible. Que lo pida el usuario.
      const otro = doc.sprints.find((s) => s.estado === 'activo');
      if (otro !== undefined) {
        return {
          ok: false,
          error: { codigo: 'invalido', mensaje: `${otro.id} sigue activo; ciérralo antes de activar ${sprint.id}` },
        };
      }
      sprint.estado = 'activo';

      return {
        ok: true,
        documento: doc,
        evento: anotar({ sprint_id: sprint.id, resumen: `Sprint ${sprint.id} activado` }),
      };
    }

    // --- bloqueos -------------------------------------------------------
    case 'bloquear': {
      const sitio = buscarTarea(doc, comando.tareaId);
      if (sitio === null) return falta(`la tarea "${comando.tareaId}"`);
      const yaBloqueada = sitio.tarea.bloqueos.some((b) => b.desbloqueada_en === null);
      if (yaBloqueada) {
        return { ok: false, error: { codigo: 'invalido', mensaje: `${sitio.tarea.id} ya tiene un bloqueo abierto` } };
      }
      // No se toca el estado: bloqueada es una bandera, no un valor del enum. La tarea
      // conserva su avance para saber a qué vuelve al desbloquearse.
      sitio.tarea.bloqueos.push({
        tipo: comando.tipo,
        motivo: comando.motivo,
        bloqueada_en: ahora,
        desbloqueada_en: null,
      });

      return {
        ok: true,
        documento: doc,
        evento: anotar({
          ...ubicacionDeTarea(sitio),
          resumen: `${sitio.tarea.id} bloqueada (${comando.tipo}): ${comando.motivo}`,
          detalle: { tipo: comando.tipo, motivo: comando.motivo, estado: sitio.tarea.estado },
        }),
      };
    }

    case 'desbloquear': {
      const sitio = buscarTarea(doc, comando.tareaId);
      if (sitio === null) return falta(`la tarea "${comando.tareaId}"`);
      const abierto = sitio.tarea.bloqueos.find((b) => b.desbloqueada_en === null);
      if (abierto === undefined) {
        return { ok: false, error: { codigo: 'invalido', mensaje: `${sitio.tarea.id} no tiene ningún bloqueo abierto` } };
      }
      // Se CIERRA, no se borra: el bloqueo pasado es el dato que explica por qué algo tardó.
      abierto.desbloqueada_en = ahora;

      return {
        ok: true,
        documento: doc,
        evento: anotar({
          ...ubicacionDeTarea(sitio),
          resumen: `${sitio.tarea.id} desbloqueada`,
          detalle: { tipo: abierto.tipo, bloqueada_en: abierto.bloqueada_en },
        }),
      };
    }

    // --- equipo ---------------------------------------------------------
    case 'editarEquipo': {
      const proyecto = doc.proyectos.find((p) => p.clave === comando.proyecto);
      if (proyecto === undefined) return falta(`el proyecto "${comando.proyecto}"`);

      const vistos = new Set<string>();
      for (const miembro of comando.miembros) {
        if (!doc.personas.some((p) => p.id === miembro.persona_id)) {
          return falta(`la persona "${miembro.persona_id}"`);
        }
        if (vistos.has(miembro.persona_id)) {
          return { ok: false, error: { codigo: 'invalido', mensaje: `"${miembro.persona_id}" aparece dos veces en el equipo` } };
        }
        vistos.add(miembro.persona_id);
      }
      const antes = proyecto.equipo.map((m) => m.persona_id);
      // El equipo NO restringe quién puede ser responsable: una tarea vieja puede apuntar
      // a alguien que ya salió, y eso es correcto. Por eso sacar a alguien no toca tareas.
      proyecto.equipo = comando.miembros.map((m) => ({ ...m }));

      return {
        ok: true,
        documento: doc,
        evento: anotar({
          proyecto_id: proyecto.clave,
          origen: rutaLegible([proyecto.clave]),
          resumen: `Equipo de ${proyecto.clave}: ${comando.miembros.length} integrantes`,
          detalle: { antes, despues: [...vistos] },
        }),
      };
    }
  }
}

// --- localización en el árbol -----------------------------------------------

interface SitioEpica { proyecto: Proyecto; epica: Epica }
interface SitioHistoria extends SitioEpica { historia: Historia }
interface SitioTarea extends SitioHistoria { tarea: Tarea }

function buscarEpica(doc: Documento, id: string): SitioEpica | null {
  for (const proyecto of doc.proyectos) {
    for (const epica of proyecto.epicas) if (epica.id === id) return { proyecto, epica };
  }
  return null;
}

function buscarHistoria(doc: Documento, id: string): SitioHistoria | null {
  for (const proyecto of doc.proyectos) {
    for (const epica of proyecto.epicas) {
      for (const historia of epica.historias) {
        if (historia.id === id) return { proyecto, epica, historia };
      }
    }
  }
  return null;
}

function buscarTarea(doc: Documento, id: string): SitioTarea | null {
  for (const proyecto of doc.proyectos) {
    for (const epica of proyecto.epicas) {
      for (const historia of epica.historias) {
        for (const tarea of historia.tareas) {
          if (tarea.id === id) return { proyecto, epica, historia, tarea };
        }
      }
    }
  }
  return null;
}

function idsDeTareasDeEpica(epica: Epica): Set<string> {
  const ids = new Set<string>();
  for (const historia of epica.historias) for (const tarea of historia.tareas) ids.add(tarea.id);
  return ids;
}

// --- sprints ----------------------------------------------------------------

/** El primer sprint CERRADO que compromete alguna de estas tareas, o `null`. */
function primerSprintCerradoCon(doc: Documento, tareas: ReadonlySet<string>): Sprint | null {
  for (const sprint of doc.sprints) {
    if (sprint.estado !== 'cerrado') continue;
    if (sprint.items.some((item) => tareas.has(item.tarea_id))) return sprint;
  }
  return null;
}

function quitarDeSprintsAbiertos(doc: Documento, tareas: ReadonlySet<string>): void {
  for (const sprint of doc.sprints) {
    if (sprint.estado === 'cerrado') continue;
    sprint.items = sprint.items.filter((item) => !tareas.has(item.tarea_id));
  }
}

/**
 * Índice de inserción saneado. Un índice fuera de rango que llegue de un arrastre no
 * puede tirar la operación: se ajusta al extremo más cercano.
 */
function posicionValida(
  posicion: number | null | undefined,
  sprint: Sprint,
  yaEsta: boolean,
): number {
  const tope = yaEsta ? Math.max(sprint.items.length - 1, 0) : sprint.items.length;
  if (posicion === undefined || posicion === null) return tope;
  return Math.min(Math.max(Math.trunc(posicion), 0), tope);
}

// --- errores ----------------------------------------------------------------

function falta(que: string): { ok: false; error: ErrorComando } {
  return { ok: false, error: { codigo: 'no-encontrado', mensaje: `no existe ${que}` } };
}

function sinCambios(): { ok: false; error: ErrorComando } {
  return { ok: false, error: { codigo: 'invalido', mensaje: 'el comando no indica ningún cambio' } };
}

function sprintCerrado(sprint: Sprint): { ok: false; error: ErrorComando } {
  return {
    ok: false,
    error: { codigo: 'sprint-cerrado', mensaje: `el sprint ${sprint.id} está cerrado y no se modifica` },
  };
}

function atadaASprintCerrado(
  sprint: Sprint,
  tareas: ReadonlySet<string>,
): { ok: false; error: ErrorComando } {
  const afectadas = sprint.items.filter((i) => tareas.has(i.tarea_id)).map((i) => i.tarea_id);
  return {
    ok: false,
    error: {
      codigo: 'sprint-cerrado',
      mensaje: `no se puede eliminar: ${afectadas.join(', ')} forma parte del sprint cerrado ${sprint.id}`,
    },
  };
}

// --- utilidades -------------------------------------------------------------

/**
 * `structuredClone` en vez de actualizaciones inmutables a mano. Es la decisión que hace
 * que el reductor quepa en la cabeza: cada caso muta un árbol que nadie más ve y el
 * documento de entrada queda intacto. Y clona los campos desconocidos del usuario sin
 * que ninguna rama tenga que acordarse de ellos (regla 14).
 */
function clonar<T>(valor: T): T {
  return structuredClone(valor);
}

/** Lo capturado después de cerrar la planeación nace «no planeado» (D4, regla 17). */
function naceComoPlaneada(proyecto: Proyecto, ahora: Instante): boolean {
  const cierre = proyecto.planeacion_cerrada_en;
  return cierre === null || fechaDe(ahora) <= cierre;
}

function instantaneaDeTarea(tarea: Tarea): Record<string, unknown> {
  return {
    titulo: tarea.titulo,
    descripcion: tarea.descripcion,
    responsable: tarea.responsable,
    prioridad: tarea.prioridad,
    fecha_limite: tarea.fecha_limite,
  };
}

// --- eventos de historial ---------------------------------------------------

interface CamposEvento {
  proyecto_id?: string | null;
  origen?: string | null;
  epica_id?: string | null;
  historia_id?: string | null;
  item_id?: string | null;
  sprint_id?: string | null;
  resumen: string;
  detalle?: Record<string, unknown> | null;
}

/** Congela dónde vivía la tarea EN ESE MOMENTO (regla 7). */
function ubicacionDeTarea(sitio: SitioTarea): CamposEvento & { resumen: string } {
  return {
    proyecto_id: sitio.proyecto.clave,
    origen: rutaLegible([sitio.proyecto.clave, sitio.epica.titulo, sitio.historia.titulo]),
    epica_id: sitio.epica.id,
    historia_id: sitio.historia.id,
    item_id: sitio.tarea.id,
    resumen: '',
  };
}

function nuevoEvento(
  ahora: Instante,
  comando: NombreComando,
  fuente: FuenteEvento,
  campos: CamposEvento,
): EntradaHistorial {
  return {
    ts: ahora,
    comando,
    fuente,
    proyecto_id: campos.proyecto_id ?? null,
    origen: campos.origen ?? null,
    epica_id: campos.epica_id ?? null,
    historia_id: campos.historia_id ?? null,
    item_id: campos.item_id ?? null,
    sprint_id: campos.sprint_id ?? null,
    resumen: campos.resumen,
    detalle: campos.detalle ?? null,
  };
}
