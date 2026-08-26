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

import { diasEntre, fechaDe } from '../../compartido/dominio/clasificar';
import type { Compromiso } from '../../compartido/dominio/derivar';
import { compromisoEfectivo } from '../../compartido/dominio/derivar';
import { validarDocumento } from '../../compartido/modelo/esquema';
import { siguienteId } from '../../compartido/modelo/ids';
import type {
  Documento,
  Epica,
  Fecha,
  Historia,
  Instante,
  ItemSprint,
  Persona,
  Proyecto,
  Sprint,
  Tarea,
} from '../../compartido/modelo/tipos';
import type { EntradaHistorial, FuenteEvento } from '../historial/registrar';
import { rutaLegible } from '../historial/registrar';
import type { Comando, DestinoAlCerrar, NombreComando } from './tipos';

/**
 * Los desenlaces que emite el cierre. Es un subconjunto de `DesenlaceItem`: `no_terminada`
 * quedó fuera a propósito —lo escribía el cierre viejo y ya no se produce, aunque se
 * sigue leyendo— y por eso el conteo del evento no lo lleva.
 */
type DesenlaceDeCierre = 'completada' | 'arrastrada' | 'devuelta' | 'descartada' | 'cancelada';

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
    // --- proyectos ------------------------------------------------------
    case 'crearProyecto': {
      // La unicidad de la clave se comprueba aquí y no en el esquema del payload porque
      // hace falta el documento entero para saberlo. Y hace falta comprobarla: dos
      // proyectos con la misma clave harían que `SICOE-T14` fuera dos tareas distintas.
      const chocando = doc.proyectos.find((p) => p.clave === comando.clave);
      if (chocando !== undefined) {
        return invalido(`ya existe un proyecto con la clave "${comando.clave}": ${chocando.nombre}`);
      }

      const proyecto: Proyecto = {
        clave: comando.clave,
        nombre: comando.nombre,
        descripcion: comando.descripcion ?? null,
        prioridad: comando.prioridad ?? null,
        archivado: false,
        cerrado_en: null,
        planeacion_cerrada_en: null,
        // Arranca en cero y de ahí solo sube (regla 15). Nunca se recalcula.
        contadores: { epicas: 0, historias: 0, tareas: 0 },
        equipo: [],
        epicas: [],
        clave_externa: null,
      };
      doc.proyectos.push(proyecto);

      return {
        ok: true,
        documento: doc,
        evento: anotar({
          proyecto_id: proyecto.clave,
          origen: rutaLegible([proyecto.clave]),
          resumen: `Proyecto creado: ${proyecto.clave} — ${proyecto.nombre}`,
        }),
      };
    }

    case 'editarProyecto': {
      const proyecto = doc.proyectos.find((p) => p.clave === comando.clave);
      if (proyecto === undefined) return falta(`el proyecto "${comando.clave}"`);
      if (
        comando.nombre === undefined &&
        comando.descripcion === undefined &&
        comando.prioridad === undefined
      ) {
        return sinCambios();
      }
      // `clave` viene solo para localizar el proyecto: el comando no tiene ningún campo
      // que la cambie, y esa ausencia ES la garantía de inmutabilidad (regla 15). Lo que
      // el usuario ve y corrige es `nombre`.
      const antes = instantaneaDeProyecto(proyecto);
      if (comando.nombre !== undefined) proyecto.nombre = comando.nombre;
      if (comando.descripcion !== undefined) proyecto.descripcion = comando.descripcion;
      if (comando.prioridad !== undefined) proyecto.prioridad = comando.prioridad;

      return {
        ok: true,
        documento: doc,
        evento: anotar({
          proyecto_id: proyecto.clave,
          origen: rutaLegible([proyecto.clave]),
          resumen: `Proyecto editado: ${proyecto.clave} — ${proyecto.nombre}`,
          detalle: { antes, despues: instantaneaDeProyecto(proyecto) },
        }),
      };
    }

    case 'cerrarProyecto': {
      const proyecto = doc.proyectos.find((p) => p.clave === comando.clave);
      if (proyecto === undefined) return falta(`el proyecto "${comando.clave}"`);
      if (proyecto.cerrado_en !== null) {
        return invalido(`${proyecto.clave} ya está cerrado desde ${proyecto.cerrado_en}`);
      }

      // Cerrar NO toca ni una tarea. La tentación es marcar como canceladas las que
      // quedaron pendientes «porque el proyecto ya terminó», y eso es inventarse un
      // desenlace: el dato honesto es que el proyecto se cerró con 7 tareas sin hacer.
      // Tampoco toca los sprints: los cerrados son inmutables (regla 8) y los abiertos
      // siguen mostrando lo comprometido hasta que el usuario lo saque a mano.
      proyecto.cerrado_en = fechaDe(ahora);
      // Cerrar implica archivar. Al revés no: un proyecto pausado se archiva sin cerrarse.
      proyecto.archivado = true;
      const abiertas = contarTareas(proyecto, (t) => t.estado !== 'hecha' && t.estado !== 'cancelada');

      return {
        ok: true,
        documento: doc,
        evento: anotar({
          proyecto_id: proyecto.clave,
          origen: rutaLegible([proyecto.clave]),
          resumen: `Proyecto cerrado: ${proyecto.clave} (${abiertas} tareas quedaron sin terminar)`,
          detalle: { cerrado_en: proyecto.cerrado_en, tareas_abiertas: abiertas },
        }),
      };
    }

    case 'reabrirProyecto': {
      const proyecto = doc.proyectos.find((p) => p.clave === comando.clave);
      if (proyecto === undefined) return falta(`el proyecto "${comando.clave}"`);
      if (proyecto.cerrado_en === null && !proyecto.archivado) {
        return invalido(`${proyecto.clave} no está cerrado`);
      }
      const desde = proyecto.cerrado_en;
      proyecto.cerrado_en = null;
      proyecto.archivado = false;

      return {
        ok: true,
        documento: doc,
        evento: anotar({
          proyecto_id: proyecto.clave,
          origen: rutaLegible([proyecto.clave]),
          resumen: `Proyecto reabierto: ${proyecto.clave}`,
          detalle: { estaba_cerrado_desde: desde },
        }),
      };
    }

    case 'eliminarProyecto': {
      if (comando.confirmacion !== comando.clave) {
        return invalido(
          `para eliminar "${comando.clave}" hay que repetir su clave en "confirmacion"; llegó "${comando.confirmacion}"`,
        );
      }
      const proyecto = doc.proyectos.find((p) => p.clave === comando.clave);
      if (proyecto === undefined) return falta(`el proyecto "${comando.clave}"`);

      const tareas = idsDeTareasDeProyecto(proyecto);
      const cerrado = primerSprintCerradoCon(doc, tareas);
      if (cerrado !== null) return proyectoConHistoriaCerrada(proyecto, cerrado, tareas);

      quitarDeSprintsAbiertos(doc, tareas);
      doc.proyectos.splice(doc.proyectos.indexOf(proyecto), 1);

      return {
        ok: true,
        documento: doc,
        evento: anotar({
          // El evento conserva la clave y el nombre aunque el proyecto ya no exista: es
          // lo único que quedará para explicar por qué el historial de antes de esta
          // línea habla de un proyecto que no está en el documento.
          proyecto_id: proyecto.clave,
          origen: rutaLegible([proyecto.clave]),
          resumen: `Proyecto eliminado: ${proyecto.clave} — ${proyecto.nombre} (${proyecto.epicas.length} épicas, ${tareas.size} tareas)`,
          detalle: { nombre: proyecto.nombre, tareas: [...tareas] },
        }),
      };
    }

    // --- personas -------------------------------------------------------
    case 'crearPersona': {
      // Alta sin ceremonia: el id se deriva del nombre y el choque se resuelve solo. Al
      // usuario no se le pregunta por un identificador que no le importa y que además no
      // podrá cambiar nunca.
      const id = idDePersonaDesdeNombre(comando.nombre, new Set(doc.personas.map((p) => p.id)));
      const persona: Persona = {
        id,
        nombre: comando.nombre,
        activa: true,
        clave_externa: null,
      };
      doc.personas.push(persona);

      const equipos = comando.equipos ?? [];
      const asignado = fijarEquiposDe(doc, persona.id, equipos);
      if (!asignado.ok) return { ok: false, error: asignado.error };

      return {
        ok: true,
        documento: doc,
        evento: anotar({
          resumen: `Persona dada de alta: ${persona.nombre} (${persona.id})`,
          detalle: { equipos: asignado.despues },
        }),
      };
    }

    case 'editarPersona': {
      const persona = doc.personas.find((p) => p.id === comando.id);
      if (persona === undefined) return falta(`la persona "${comando.id}"`);
      if (comando.nombre === undefined && comando.equipos === undefined) return sinCambios();

      // Corregir el nombre NO regenera el id. El id ya está copiado en cada
      // `tarea.responsable` y en cada item de sprint —incluidos los cerrados—, así que
      // recalcularlo aquí reescribiría de quién fue el trabajo del mes pasado. Que el id
      // se derive del nombre es una comodidad del alta, no una relación que se mantenga.
      const antes = { nombre: persona.nombre, equipos: equiposDe(doc, persona.id) };
      if (comando.nombre !== undefined) persona.nombre = comando.nombre;

      if (comando.equipos !== undefined) {
        if (!persona.activa && comando.equipos.length > 0) {
          return invalido(
            `${persona.id} está desactivada; reactívala con "reactivarPersona" antes de meterla a un equipo`,
          );
        }
        const asignado = fijarEquiposDe(doc, persona.id, comando.equipos);
        if (!asignado.ok) return { ok: false, error: asignado.error };
      }

      return {
        ok: true,
        documento: doc,
        evento: anotar({
          resumen: `Persona editada: ${persona.nombre} (${persona.id})`,
          detalle: { antes, despues: { nombre: persona.nombre, equipos: equiposDe(doc, persona.id) } },
        }),
      };
    }

    case 'desactivarPersona': {
      const persona = doc.personas.find((p) => p.id === comando.id);
      if (persona === undefined) return falta(`la persona "${comando.id}"`);
      if (!persona.activa) return invalido(`${persona.id} ya está inactiva`);

      persona.activa = false;
      // Se le quita la pertenencia a los equipos, pero NO se toca ni una de sus tareas ni
      // un solo item de sprint: su historia es suya y sigue diciendo su nombre.
      //
      // Por qué sacarla de los equipos en vez de dejarla y confiar en que cada vista
      // filtre por `activa`: el equipo de un proyecto significa "quién está dedicado a
      // esto HOY", que es exactamente lo que deja de ser cierto. Si el dato se quedara,
      // la invariante viviría repartida en cada pantalla y la primera que se olvidara del
      // filtro volvería a ofrecerla en un desplegable. De qué equipos salió queda en el
      // detalle del evento, así que la baja es reversible a mano.
      const salioDe = equiposDe(doc, persona.id);
      const vaciado = fijarEquiposDe(doc, persona.id, []);
      if (!vaciado.ok) return { ok: false, error: vaciado.error };

      return {
        ok: true,
        documento: doc,
        evento: anotar({
          resumen: `Persona desactivada: ${persona.nombre} (${persona.id})`,
          detalle: { equipos: salioDe },
        }),
      };
    }

    case 'reactivarPersona': {
      const persona = doc.personas.find((p) => p.id === comando.id);
      if (persona === undefined) return falta(`la persona "${comando.id}"`);
      if (persona.activa) return invalido(`${persona.id} ya está activa`);
      persona.activa = true;
      // No vuelve sola a sus equipos anteriores: a qué proyectos se dedica ahora es una
      // decisión de hoy, no la restauración de cómo estaba hace seis meses. Se la mete
      // con `editarPersona` o `editarEquipo`.

      return {
        ok: true,
        documento: doc,
        evento: anotar({ resumen: `Persona reactivada: ${persona.nombre} (${persona.id})` }),
      };
    }

    case 'eliminarPersona': {
      const persona = doc.personas.find((p) => p.id === comando.id);
      if (persona === undefined) return falta(`la persona "${comando.id}"`);

      const ataduras = referenciasAPersona(doc, persona.id);
      if (ataduras.length > 0) {
        return {
          ok: false,
          error: {
            codigo: 'invalido',
            mensaje: `no se puede eliminar a ${persona.id}: ${ataduras.join('; ')}. Usa "desactivarPersona": deja de recibir trabajo nuevo y su historia se conserva`,
          },
        };
      }

      // Llegar aquí significa que nadie la nombra en ninguna tarea ni en ningún sprint.
      // Solo puede quedarle pertenencia a equipos, que es estado del presente y no
      // registro histórico: se retira aquí porque el esquema exige que todo `persona_id`
      // de un equipo exista, y queda anotada en el evento.
      const salioDe = equiposDe(doc, persona.id);
      const vaciado = fijarEquiposDe(doc, persona.id, []);
      if (!vaciado.ok) return { ok: false, error: vaciado.error };
      doc.personas.splice(doc.personas.indexOf(persona), 1);

      return {
        ok: true,
        documento: doc,
        evento: anotar({
          resumen: `Persona eliminada: ${persona.nombre} (${persona.id})`,
          detalle: { equipos: salioDe },
        }),
      };
    }

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
      if (responsable !== null) {
        const problema = noAsignable(doc, responsable);
        if (problema !== null) return { ok: false, error: problema };
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
        if (comando.responsable !== null) {
          // Quitar el responsable (`null`) siempre se puede, incluso si quien estaba ya
          // se desactivó: lo que se prohíbe es ponerle trabajo nuevo a alguien inactivo.
          const problema = noAsignable(doc, comando.responsable);
          if (problema !== null) return { ok: false, error: problema };
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
      // Antes de quitar el item, lo comprometido en él se vuelca a la tarea. Sacar
      // tareas del sprint para redefinir la historia y volver a meterlas es flujo
      // normal, no excepción: si el responsable o la fecha vivían solo en el item,
      // el `splice` los borraría en silencio. Solo se vuelca lo que la tarea no
      // tiene ya; la tarea nunca pierde un dato propio.
      const saliente = sprint.items[indice];
      if (saliente !== undefined) {
        volcarCompromiso(sitio.tarea, compromisoEfectivo(saliente, sitio.tarea));
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

      // 1. Las decisiones se validan ENTERAS antes de tocar nada. Media ceremonia
      //    aplicada es lo peor que puede pasar aquí: el sprint quedaría cerrado —y por
      //    tanto inmutable— con las tareas del final sin destino.
      const decisiones = new Map<string, DestinoAlCerrar>();
      for (const decision of comando.decisiones ?? []) {
        if (decisiones.has(decision.tareaId)) {
          return invalido(
            `"${decision.tareaId}" aparece dos veces en las decisiones de cierre de ${sprint.id}`,
          );
        }
        if (!sprint.items.some((i) => i.tarea_id === decision.tareaId)) {
          return invalido(
            `"${decision.tareaId}" no está comprometida en ${sprint.id}: no hay nada que decidir sobre ella`,
          );
        }
        // Se rechaza en vez de ignorarse: una decisión sobre algo ya terminado solo puede
        // venir de una pantalla que se desincronizó, y aplicarla a medias sería mentir.
        const estado = porTarea.get(decision.tareaId)?.estado;
        if (estado === 'hecha' || estado === 'cancelada') {
          return invalido(
            `${decision.tareaId} ya está "${estado}"; su desenlace no se decide al cerrar ${sprint.id}`,
          );
        }
        decisiones.set(decision.tareaId, decision.destino);
      }

      // 2. Desenlace de cada item y materialización de lo heredado.
      const conteo: Record<DesenlaceDeCierre, number> = {
        completada: 0,
        arrastrada: 0,
        devuelta: 0,
        descartada: 0,
        cancelada: 0,
      };
      const paraArrastrar: ItemSprint[] = [];
      for (const item of sprint.items) {
        const tarea = porTarea.get(item.tarea_id);
        const compromiso = compromisoEfectivo(item, tarea);
        let desenlace: DesenlaceDeCierre;

        if (tarea?.estado === 'hecha') {
          // Lo terminado no se toca ni se decide: se constata.
          desenlace = 'completada';
        } else if (tarea?.estado === 'cancelada') {
          // Ya estaba cancelada antes del cierre; no hubo decisión que registrar.
          desenlace = 'cancelada';
        } else {
          const destino = decisiones.get(item.tarea_id) ?? 'siguiente';
          if (destino === 'siguiente') {
            desenlace = 'arrastrada';
            // Se copian los valores PROPIOS del item, antes de materializar: un `null`
            // aquí sigue significando «hereda de la tarea», que es lo correcto en un
            // sprint todavía abierto. El compromiso efectivo es el mismo, y reasignar la
            // tarea mañana se propaga al sprint nuevo como en cualquier item vivo.
            paraArrastrar.push({
              tarea_id: item.tarea_id,
              responsable: item.responsable,
              fecha_limite: item.fecha_limite,
              prioridad: item.prioridad,
              desenlace: null,
            });
          } else {
            // `backlog` y `descartar` sacan la tarea del ciclo, así que aquí aplica lo
            // mismo que en `sacarDelSprint`: lo que vivía SOLO en el item se vuelca a la
            // tarea antes de que el item quede congelado. Si no, el responsable o la
            // fecha que el usuario escribió en el sprint desaparecerían de la vista.
            volcarCompromiso(tarea, compromiso);
            desenlace = destino === 'backlog' ? 'devuelta' : 'descartada';
            if (destino === 'descartar' && tarea !== undefined) {
              // «Ya no aplica» es una afirmación sobre la TAREA, no sobre el sprint. Si
              // solo la sacáramos del sprint volvería al backlog como pendiente y seguiría
              // contando en todos los denominadores, en la carga de su responsable y en el
              // Backlog del área: justo lo que el usuario acaba de decir que ya no existe.
              // Cancelada es el valor que el modelo ya tiene para «esto no cuenta» y es
              // reversible con `cambiarEstado`; el desenlace `descartada` conserva que la
              // decisión se tomó en este cierre.
              tarea.estado = 'cancelada';
            }
          }
        }

        item.desenlace = desenlace;
        conteo[desenlace] += 1;
        // Se materializa lo heredado ANTES de congelar: a partir de aquí el sprint es
        // inmutable, y reasignar la tarea mañana no puede reescribir lo que se comprometió.
        item.responsable = compromiso.responsable;
        item.fecha_limite = compromiso.fechaLimite;
        item.prioridad = compromiso.prioridad;
      }

      // 3. El sprint siguiente se resuelve —y solo se crea— si de verdad hay algo que
      //    arrastrar. Cerrar no debe dejar sprints vacíos de recuerdo.
      let siguiente: Sprint | null = null;
      let creadoElSiguiente = false;
      if (paraArrastrar.length > 0) {
        const resolucion = resolverSprintSiguiente(doc, sprint, comando.siguienteSprintId);
        if (!resolucion.ok) return resolucion;
        siguiente = resolucion.destino;
        creadoElSiguiente = resolucion.creado;
        // Entran ARRIBA y en su orden: «enviar al próximo sprint como prioridad». El
        // orden del array ES la prioridad, y lo que se arrastra es deuda: se ve primero.
        // Lo que ya estuviera planeado ahí no se duplica ni se reordena.
        const nuevos = paraArrastrar.filter(
          (item) => !siguiente?.items.some((i) => i.tarea_id === item.tarea_id),
        );
        siguiente.items.unshift(...nuevos);
      }

      sprint.estado = 'cerrado';

      // El resumen se lee a ojo en `historial.jsonl`, así que concuerda en número y solo
      // menciona lo que de verdad pasó.
      const partes = [cuenta(conteo.completada, 'completada')];
      if (conteo.arrastrada > 0) {
        partes.push(`${cuenta(conteo.arrastrada, 'arrastrada')} a ${siguiente?.id}`);
      }
      if (conteo.devuelta > 0) partes.push(`${cuenta(conteo.devuelta, 'devuelta')} al backlog`);
      if (conteo.descartada > 0) partes.push(cuenta(conteo.descartada, 'descartada'));
      if (conteo.cancelada > 0) partes.push(`${cuenta(conteo.cancelada, 'cancelada')} de antes`);

      return {
        ok: true,
        documento: doc,
        evento: anotar({
          sprint_id: sprint.id,
          resumen: `Sprint ${sprint.id} cerrado: ${partes.join(', ')}`,
          detalle: {
            ...conteo,
            items: sprint.items.length,
            siguiente_sprint: siguiente?.id ?? null,
            siguiente_sprint_creado: creadoElSiguiente,
          },
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
        const problema = noAsignable(doc, miembro.persona_id);
        if (problema !== null) return { ok: false, error: problema };
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

function idsDeTareasDeProyecto(proyecto: Proyecto): Set<string> {
  const ids = new Set<string>();
  for (const epica of proyecto.epicas) {
    for (const id of idsDeTareasDeEpica(epica)) ids.add(id);
  }
  return ids;
}

function contarTareas(proyecto: Proyecto, cumple: (tarea: Tarea) => boolean): number {
  let total = 0;
  for (const epica of proyecto.epicas) {
    for (const historia of epica.historias) {
      for (const tarea of historia.tareas) if (cumple(tarea)) total += 1;
    }
  }
  return total;
}

// --- personas ---------------------------------------------------------------

/**
 * Nadie asigna trabajo nuevo a una persona desactivada. Devuelve el error o `null`.
 *
 * La comprobación vive aquí y no en las vistas por la misma razón que las demás
 * invariantes del reductor: si viviera en cada pantalla, la próxima pantalla que se
 * escriba se olvidará. `activa: false` significa exactamente esto —conserva su historia,
 * no recibe nada nuevo—, y "esto" tiene que ser una sola línea de código, no una
 * costumbre.
 */
function noAsignable(doc: Documento, personaId: string): ErrorComando | null {
  const persona = doc.personas.find((p) => p.id === personaId);
  if (persona === undefined) {
    return { codigo: 'no-encontrado', mensaje: `no existe la persona "${personaId}"` };
  }
  if (!persona.activa) {
    return {
      codigo: 'invalido',
      mensaje: `${persona.id} (${persona.nombre}) está desactivada; reactívala con "reactivarPersona" antes de asignarle nada`,
    };
  }
  return null;
}

/** Claves de los proyectos en cuyo equipo aparece la persona. */
function equiposDe(doc: Documento, personaId: string): string[] {
  return doc.proyectos
    .filter((proyecto) => proyecto.equipo.some((m) => m.persona_id === personaId))
    .map((proyecto) => proyecto.clave);
}

type ResultadoEquipos =
  | { ok: true; despues: string[] }
  | { ok: false; error: ErrorComando };

/**
 * Deja a la persona exactamente en los equipos de `claves` y en ninguno más.
 *
 * Es la relación equipo↔persona escrita desde el lado de la persona; `editarEquipo` la
 * escribe desde el lado del proyecto. Las dos tocan el mismo array porque un equipo no
 * es una entidad aparte: ES `proyecto.equipo`. Duplicar la pertenencia en un segundo
 * lugar para que cada vista tuviera "su" copia es justo lo que haría que un día no
 * coincidieran.
 *
 * Donde la persona YA era miembro no se toca nada: su `rol` es un dato que esta lista no
 * conoce y no tiene por qué borrar.
 */
function fijarEquiposDe(doc: Documento, personaId: string, claves: readonly string[]): ResultadoEquipos {
  const deseadas: string[] = [];
  for (const clave of claves) {
    if (!doc.proyectos.some((p) => p.clave === clave)) {
      return { ok: false, error: { codigo: 'no-encontrado', mensaje: `no existe el proyecto "${clave}"` } };
    }
    if (!deseadas.includes(clave)) deseadas.push(clave);
  }

  for (const proyecto of doc.proyectos) {
    const indice = proyecto.equipo.findIndex((m) => m.persona_id === personaId);
    const debeEstar = deseadas.includes(proyecto.clave);
    if (debeEstar && indice < 0) proyecto.equipo.push({ persona_id: personaId, rol: null });
    else if (!debeEstar && indice >= 0) proyecto.equipo.splice(indice, 1);
  }
  return { ok: true, despues: deseadas };
}

/**
 * Todo lo que dejaría de tener sentido si la persona desapareciera del documento, en
 * frases listas para mostrar. Vacío = se puede eliminar.
 *
 * Mira las tareas vivas y **todos** los items de sprint, cerrados incluidos. Ese segundo
 * caso es el que importa: un sprint cerrado guarda el responsable materializado, y es un
 * registro de lo que pasó (regla 8). Borrar a la persona lo dejaría apuntando a un id
 * que ya no existe, y el esquema lo rechazaría —así que el comando fallaría igual, pero
 * con un "documento-invalido" que no le explica nada a nadie.
 *
 * La pertenencia a equipos NO se cuenta: es estado del presente, no historia.
 */
function referenciasAPersona(doc: Documento, personaId: string): string[] {
  const razones: string[] = [];

  const tareas: string[] = [];
  for (const proyecto of doc.proyectos) {
    for (const epica of proyecto.epicas) {
      for (const historia of epica.historias) {
        for (const tarea of historia.tareas) {
          if (tarea.responsable === personaId) tareas.push(tarea.id);
        }
      }
    }
  }
  if (tareas.length > 0) {
    razones.push(`es responsable de ${tareas.length} tarea(s) (${muestra(tareas)})`);
  }

  const cerrados: string[] = [];
  const abiertos: string[] = [];
  for (const sprint of doc.sprints) {
    if (!sprint.items.some((item) => item.responsable === personaId)) continue;
    (sprint.estado === 'cerrado' ? cerrados : abiertos).push(sprint.id);
  }
  if (cerrados.length > 0) {
    razones.push(`aparece como responsable en el sprint cerrado ${muestra(cerrados)}, que no se reescribe`);
  }
  if (abiertos.length > 0) {
    razones.push(`aparece como responsable en el sprint ${muestra(abiertos)}`);
  }
  return razones;
}

/** Los primeros tres ids y cuántos más. Un mensaje de error no es un volcado. */
function muestra(ids: readonly string[]): string {
  const primeros = ids.slice(0, 3).join(', ');
  return ids.length > 3 ? `${primeros} y ${ids.length - 3} más` : primeros;
}

/**
 * Id legible derivado del nombre: "Ana García" → `ana-garcia`.
 *
 * Se quitan los acentos con NFD en vez de con una tabla de reemplazos porque una tabla
 * escrita a mano siempre acaba sin la letra que hacía falta. La 'ñ' se descompone igual
 * y queda como 'n'; es lo correcto para un id que se teclea y se busca con Cmd-F.
 *
 * El choque se resuelve con un sufijo numérico y sin preguntar: dos "Ana García" son un
 * caso real y raro, y frenar un alta para que el usuario invente un identificador es
 * justo la ceremonia que se quiere evitar. Empieza en `-2` porque `ana-garcia-1` daría a
 * entender que hay un "primero" y la primera no lleva sufijo.
 */
function idDePersonaDesdeNombre(nombre: string, tomados: ReadonlySet<string>): string {
  const base =
    nombre
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') ||
    // Un nombre sin una sola letra latina (`"李四"`, `"???"`) no produce id; se le da uno
    // genérico y el bucle de abajo lo numera. El nombre real se conserva intacto.
    'persona';

  if (!tomados.has(base)) return base;
  for (let sufijo = 2; ; sufijo += 1) {
    const candidato = `${base}-${sufijo}`;
    if (!tomados.has(candidato)) return candidato;
  }
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

// --- sprint: volcado y sprint siguiente -------------------------------------

/**
 * Vuelca en la tarea lo que estaba comprometido en el item. **Solo rellena huecos**: la
 * tarea nunca pierde un dato propio, así que llamarlo de más es inofensivo.
 *
 * Lo usan los dos caminos por los que una tarea deja de estar comprometida —sacarla de un
 * sprint abierto y cerrarlo con destino `backlog` o `descartar`—, y son el mismo problema:
 * si el responsable o la fecha vivían solo en el item, quitarlos de la vista los perdería.
 */
function volcarCompromiso(tarea: Tarea | undefined, compromiso: Compromiso): void {
  if (tarea === undefined) return;
  if (tarea.responsable === null && compromiso.responsable !== null) {
    tarea.responsable = compromiso.responsable;
  }
  if (tarea.fecha_limite === null && compromiso.fechaLimite !== null) {
    tarea.fecha_limite = compromiso.fechaLimite;
  }
  if (tarea.prioridad === null && compromiso.prioridad !== null) {
    tarea.prioridad = compromiso.prioridad;
  }
}

/** `1 completada`, `3 completadas`. Todos los desenlaces son femeninos y regulares. */
function cuenta(n: number, singular: string): string {
  return `${n} ${singular}${n === 1 ? '' : 's'}`;
}

type ResolucionSiguiente =
  | { ok: true; destino: Sprint; creado: boolean }
  | { ok: false; error: ErrorComando };

/**
 * A dónde van las tareas arrastradas. Crea el sprint si hace falta (y lo empuja al
 * documento), siempre `planeado`.
 *
 * **Por qué se crea `planeado` y no `activo`.** Dos razones, y la segunda es dura:
 * (a) el usuario dijo que cerrar y planear son actos distintos —el sprint siguiente casi
 * nunca está listo el día que se cierra el anterior—, y (b) el documento admite un solo
 * sprint `activo`: cerrar un sprint PLANEADO mientras otro sigue activo es legal (ver
 * `cerrarSprint`), así que activar el destino por nuestra cuenta dejaría dos activos y el
 * esquema tumbaría el cierre entero. Activar es un comando aparte, de un clic.
 *
 * Sin `siguienteSprintId` se toma **el primer sprint `planeado` por fecha de inicio**: si
 * el usuario ya planeó el siguiente, arrastrar ahí es lo que espera, y crear otro le
 * dejaría dos sprints donde había uno. Es el mismo criterio, literalmente, que
 * `siguienteSprintPlaneado` en `compartido/dominio/cierre.ts`, que es lo que la pantalla
 * de cierre NOMBRA antes de pulsar el botón; si los dos lados eligieran distinto, el
 * botón prometería un sprint y el reductor usaría otro.
 *
 * Un sprint `activo` no entra como destino por omisión aunque no esté cerrado: meterle
 * el arrastre a la quincena que ya está corriendo cambia un compromiso vigente que nadie
 * pidió cambiar. Si el usuario lo quiere, lo nombra con `siguienteSprintId` y se acepta.
 */
function resolverSprintSiguiente(
  doc: Documento,
  cerrando: Sprint,
  pedido: string | undefined,
): ResolucionSiguiente {
  if (pedido !== undefined) {
    if (pedido === cerrando.id) {
      return invalido(`${cerrando.id} no puede ser su propio sprint siguiente`);
    }
    const existente = doc.sprints.find((s) => s.id === pedido);
    if (existente !== undefined) {
      // Arrastrar a un sprint ya cerrado reescribiría lo que pasó (regla 8).
      if (existente.estado === 'cerrado') return sprintCerrado(existente);
      return { ok: true, destino: existente, creado: false };
    }
    return { ok: true, destino: crearSprintSiguiente(doc, cerrando, pedido), creado: true };
  }

  const yaPlaneado = doc.sprints
    .filter((s) => s.id !== cerrando.id && s.estado === 'planeado')
    .sort((a, b) => (a.inicio < b.inicio ? -1 : a.inicio > b.inicio ? 1 : 0))[0];
  if (yaPlaneado !== undefined) return { ok: true, destino: yaPlaneado, creado: false };

  const nuevo = crearSprintSiguiente(doc, cerrando, idSprintLibre(doc, cerrando.id));
  return { ok: true, destino: nuevo, creado: true };
}

/** Añade al documento el sprint que continúa a `anterior`. Nace vacío y `planeado`. */
function crearSprintSiguiente(doc: Documento, anterior: Sprint, id: string): Sprint {
  const inicio = primerDiaHabil(sumarDias(anterior.fin, 1));
  const nuevo: Sprint = {
    id,
    // El nombre sigue la serie del anterior ("Sprint 34" → "Sprint 35"). Si no la tiene,
    // el id es mejor nombre que uno inventado: al menos coincide con lo que se busca.
    nombre: siguienteDeLaSerie(anterior.nombre) ?? id,
    inicio,
    // Misma duración que el que se cierra: la cadencia del usuario es el único dato que
    // tenemos, y no hay comando para corregir fechas de sprint. Nada de inventar dos
    // semanas «porque sí».
    fin: sumarDias(inicio, Math.max(diasEntre(anterior.inicio, anterior.fin), 0)),
    estado: 'planeado',
    items: [],
  };
  doc.sprints.push(nuevo);
  return nuevo;
}

/** Id libre para el sprint siguiente, avanzando la serie del anterior: `S-2026-34` → `-35`. */
function idSprintLibre(doc: Documento, base: string): string {
  const usados = new Set(doc.sprints.map((s) => s.id));
  let candidato = siguienteDeLaSerie(base) ?? `${base}-2`;
  for (let intento = 0; usados.has(candidato) && intento < 1000; intento += 1) {
    candidato = siguienteDeLaSerie(candidato) ?? `${candidato}-2`;
  }
  return candidato;
}

/** `"Sprint 34"` → `"Sprint 35"`, `"S-2026-09"` → `"S-2026-10"`. `null` si no acaba en número. */
function siguienteDeLaSerie(texto: string): string | null {
  const coincidencia = /^(.*?)(\d+)$/.exec(texto);
  if (coincidencia === null) return null;
  const [, prefijo, numero] = coincidencia;
  if (prefijo === undefined || numero === undefined) return null;
  return `${prefijo}${String(Number(numero) + 1).padStart(numero.length, '0')}`;
}

const MS_POR_DIA = 86_400_000;

/** Aritmética de calendario sobre una fecha dada. No consulta el reloj: sigue siendo puro. */
function sumarDias(fecha: Fecha, dias: number): Fecha {
  const base = Date.parse(`${fecha}T00:00:00Z`);
  if (Number.isNaN(base)) return fecha;
  return new Date(base + dias * MS_POR_DIA).toISOString().slice(0, 10);
}

/**
 * Corre el arranque al lunes si cayó en fin de semana. Es la única heurística de
 * calendario de la app y se limita a esto: los sprints del usuario van de lunes a
 * viernes, y sin comando para editar fechas de sprint, un sprint que arranca en sábado
 * solo se corrige a mano en el JSON.
 */
function primerDiaHabil(fecha: Fecha): Fecha {
  const dia = new Date(`${fecha}T00:00:00Z`).getUTCDay();
  if (dia === 6) return sumarDias(fecha, 2);
  if (dia === 0) return sumarDias(fecha, 1);
  return fecha;
}

// --- errores ----------------------------------------------------------------

function falta(que: string): { ok: false; error: ErrorComando } {
  return { ok: false, error: { codigo: 'no-encontrado', mensaje: `no existe ${que}` } };
}

function sinCambios(): { ok: false; error: ErrorComando } {
  return { ok: false, error: { codigo: 'invalido', mensaje: 'el comando no indica ningún cambio' } };
}

function invalido(mensaje: string): { ok: false; error: ErrorComando } {
  return { ok: false, error: { codigo: 'invalido', mensaje } };
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

/**
 * Se prohíbe eliminar un proyecto que dejó rastro en un sprint CERRADO. La alternativa
 * es `cerrarProyecto`, que conserva todo y lo saca de la vista diaria.
 *
 * Por qué prohibir y no convertirlo en lápida:
 *
 * Un sprint cerrado es el único registro de qué se comprometió y qué salió en un periodo
 * concreto: es de donde sale "el avance real del mes pasado" (regla 8). Sus items apuntan
 * a tareas por id. Si eliminar el proyecto se llevara esas tareas, ese número cambiaría
 * solo y en silencio —hoy dice 12 de 20, mañana 12 de 14 porque catorce desaparecieron—,
 * y sin que nadie hubiera tocado el sprint. Eso no es borrar un proyecto: es reescribir
 * el pasado.
 *
 * La lápida (dejar el proyecto vacío conservando clave y título para que los ids sigan
 * resolviendo) suena a término medio y es lo peor de las dos: el registro histórico
 * necesita el TÍTULO DE CADA TAREA, no el del proyecto, así que un sprint cerrado pasaría
 * a listar seis filas sin nombre. Un histórico que ya no se puede leer no conserva nada;
 * solo esconde que se perdió.
 *
 * Así que un proyecto con historia no se elimina, se cierra. Lo eliminable es lo que
 * nunca llegó a pasar: el proyecto creado con la clave equivocada, la prueba de ayer.
 * Y esa es exactamente la misma regla que ya rige para `eliminarTarea`, `eliminarEpica`
 * y `eliminarHistoria`; aquí solo se aplica al bloque entero.
 */
function proyectoConHistoriaCerrada(
  proyecto: Proyecto,
  sprint: Sprint,
  tareas: ReadonlySet<string>,
): { ok: false; error: ErrorComando } {
  const afectadas = sprint.items.filter((i) => tareas.has(i.tarea_id)).map((i) => i.tarea_id);
  return {
    ok: false,
    error: {
      codigo: 'sprint-cerrado',
      mensaje: `no se puede eliminar ${proyecto.clave}: ${afectadas.length} de sus tareas (${muestra(afectadas)}) forman parte del sprint cerrado ${sprint.id} y borrarlas cambiaría lo que ese sprint dice que pasó. Ciérralo con "cerrarProyecto": conserva toda su historia y sale de la vista diaria`,
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

function instantaneaDeProyecto(proyecto: Proyecto): Record<string, unknown> {
  return {
    nombre: proyecto.nombre,
    descripcion: proyecto.descripcion,
    prioridad: proyecto.prioridad,
  };
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
