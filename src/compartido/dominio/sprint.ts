/**
 * El sprint listo para pintar: una fila por item, con todo lo derivado ya resuelto.
 *
 * Módulo puro, igual que sus vecinos: `hoy` entra como parámetro y aquí no se llama al
 * reloj. Existe porque el sprint se pinta en DOS sitios —el panel derecho de un proyecto
 * y la vista global transversal— y hasta ahora cada uno resolvía por su cuenta el
 * responsable efectivo, los días de bloqueo, si venció y por cuántos sprints ha pasado la
 * tarea. Dos copias de un cálculo son dos oportunidades de que digan cosas distintas
 * sobre la misma tarjeta.
 *
 * `paraVistaSprint` (en `clasificar.ts`) sigue siendo el selector crudo: qué items hay y
 * dónde vive cada tarea. Esto es la capa de encima, la que la vista consume sin calcular
 * nada (regla: ningún cálculo en componentes).
 */

import type {
  Bloqueo,
  Documento,
  Fecha,
  ItemSprint,
  PersonaId,
  Proyecto,
  Sprint,
} from '../modelo/tipos';
import {
  bloqueoAbierto,
  diasBloqueada,
  diasEntre,
  estaAbierta,
  mostrarProcedencia,
  paraVistaSprint,
} from './clasificar';
import {
  compromisoEfectivo,
  contarTareas,
  rutaDe,
  type Avance,
  type Compromiso,
  type UbicacionTarea,
  tareasDe,
} from './derivar';

/** Una tarjeta del sprint con todo lo que la tarjeta enseña, ya calculado. */
export interface FilaSprintVista {
  item: ItemSprint;
  ubicacion: UbicacionTarea;
  /** El item manda; en `null` hereda de la tarea. Nunca se lee uno de los dos solo. */
  compromiso: Compromiso;
  /** Id y nombre resueltos del responsable efectivo. `null` = nadie se hizo cargo. */
  responsable: { id: PersonaId; nombre: string } | null;
  bloqueo: Bloqueo | null;
  /** Días que lleva atorada. `0` si no está bloqueada; la vista mira `bloqueo` primero. */
  dias: number;
  /** Procedencia (regla 17), no estado: se pinta como banda y chip, nunca como glifo. */
  noPlaneada: boolean;
  vencida: boolean;
  /**
   * Por cuántos sprints ha pasado esta tarea. `> 1` es «arrastrada», y se deriva de los
   * sprints que la contienen: no hay ningún campo `arrastrada` que alguien tenga que
   * acordarse de marcar.
   */
  pasos: number;
  /** `["SICOE", "Módulo de usuarios", "Datos y contraseña"]`. */
  ruta: string[];
}

/**
 * Las filas del sprint, en el orden del array de items (que ES la prioridad).
 *
 * El mapa `tarea -> nº de sprints` se construye de una pasada sobre todos los sprints en
 * vez de preguntar por tarea: con 20 items y 30 sprints, lo segundo son 600 recorridos
 * por render.
 */
export function filasDeSprint(
  doc: Documento,
  sprint: Sprint | undefined,
  hoy: Fecha,
): FilaSprintVista[] {
  const nombres = new Map(doc.personas.map((persona) => [persona.id, persona.nombre]));

  const pasosPorTarea = new Map<string, number>();
  for (const otro of doc.sprints) {
    for (const item of otro.items) {
      pasosPorTarea.set(item.tarea_id, (pasosPorTarea.get(item.tarea_id) ?? 0) + 1);
    }
  }

  return paraVistaSprint(doc, sprint).map(({ item, ubicacion }) => {
    const { tarea } = ubicacion;
    const compromiso = compromisoEfectivo(item, tarea);
    const bloqueo = bloqueoAbierto(tarea);

    return {
      item,
      ubicacion,
      compromiso,
      responsable:
        compromiso.responsable === null
          ? null
          : {
              id: compromiso.responsable,
              nombre: nombres.get(compromiso.responsable) ?? compromiso.responsable,
            },
      bloqueo,
      dias: diasBloqueada(tarea, hoy) ?? 0,
      noPlaneada: mostrarProcedencia(tarea),
      // Vencida se mide contra el compromiso EFECTIVO, no contra `tarea.fecha_limite`:
      // cuando el item trae fecha propia, la de la tarea es la vieja y encender el rojo
      // por ella marcaría como atrasado algo que se replaneó a propósito.
      vencida:
        compromiso.fechaLimite !== null && compromiso.fechaLimite < hoy && estaAbierta(tarea),
      pasos: pasosPorTarea.get(tarea.id) ?? 1,
      ruta: rutaDe(ubicacion),
    };
  });
}

/** El sprint filtrado a un proyecto: el panel derecho de la vista de proyecto. */
export function filasDeProyecto(
  filas: readonly FilaSprintVista[],
  clave: string,
): FilaSprintVista[] {
  return filas.filter((fila) => fila.ubicacion.proyecto.clave === clave);
}

/**
 * El sprint filtrado a una persona: «solo lo mío» de la vista global.
 *
 * Se filtra por el responsable EFECTIVO, no por `tarea.responsable`: si el item del
 * sprint reasignó la tarea para esta quincena, lo que manda es esa reasignación. Con
 * `personaId === null` no se filtra nada, porque no saber quién eres no puede vaciar la
 * pantalla.
 */
export function filasDePersona(
  filas: readonly FilaSprintVista[],
  personaId: PersonaId | null,
): FilaSprintVista[] {
  if (personaId === null) return [...filas];
  return filas.filter((fila) => fila.responsable?.id === personaId);
}

export interface ResumenSprint {
  avance: Avance;
  bloqueadas: number;
  noPlaneadas: number;
  vencidas: number;
  /** Sin responsable o sin fecha: el compromiso está a medias y se dice, no se rellena. */
  incompletas: number;
}

export function resumirSprint(filas: readonly FilaSprintVista[]): ResumenSprint {
  return {
    avance: contarTareas(filas.map((fila) => fila.ubicacion.tarea)),
    bloqueadas: filas.filter((fila) => fila.bloqueo !== null).length,
    noPlaneadas: filas.filter((fila) => fila.noPlaneada).length,
    vencidas: filas.filter((fila) => fila.vencida).length,
    incompletas: filas.filter(
      (fila) => fila.responsable === null || fila.compromiso.fechaLimite === null,
    ).length,
  };
}

/**
 * Por qué día del sprint vamos. `null` si el sprint todavía no empezó.
 *
 * Es un dato de calendario, no un pronóstico: dice cuánto queda de plazo, nunca cuánto
 * falta de trabajo. La app no estima (CLAUDE.md: sin burndown, sin velocidad, sin fecha
 * estimada de término). `dia` se topa en `dias` cuando el sprint ya se pasó de su fin:
 * «día 14 de 10» se lee como un error de la app.
 */
export interface ProgresoSprint {
  dia: number;
  dias: number;
  /** El sprint ya pasó su fecha de fin y sigue abierto. */
  vencido: boolean;
}

export function progresoDelSprint(sprint: Sprint, hoy: Fecha): ProgresoSprint | null {
  const dias = diasEntre(sprint.inicio, sprint.fin) + 1;
  if (dias <= 0) return null;
  const transcurrido = diasEntre(sprint.inicio, hoy) + 1;
  if (transcurrido < 1) return null;
  return { dia: Math.min(transcurrido, dias), dias, vencido: transcurrido > dias };
}

/**
 * Quién es «yo» mientras el documento no lo diga.
 *
 * El esquema no tiene campo para la identidad del usuario, y «Solo lo mío» necesita una
 * persona o no puede arrancar activo. Se deduce de lo que sí hay: **la persona activa que
 * está en más equipos, prefiriendo a quien lleve un rol de liderazgo**. Es exactamente el
 * perfil de quien usa esta app (un líder técnico con once proyectos), y en cuanto se
 * equivoque el usuario la cambia en la propia vista: es una suposición de arranque, no un
 * dato que se guarde en ningún sitio.
 *
 * Devuelve `null` sin personas activas, y entonces el filtro no se ofrece.
 */
export function personaPorOmision(doc: Documento): PersonaId | null {
  const candidatos = doc.personas
    .filter((persona) => persona.activa)
    .map((persona) => {
      let equipos = 0;
      let lidera = 0;
      for (const proyecto of doc.proyectos) {
        if (proyecto.archivado) continue;
        const miembro = proyecto.equipos.flatMap((equipo) => equipo.miembros).find((m) => m.persona_id === persona.id);
        if (miembro === undefined) continue;
        equipos += 1;
        if (miembro.responsabilidades.some((responsabilidad) => /l[ií]der/i.test(responsabilidad))) lidera += 1;
      }
      return { id: persona.id, nombre: persona.nombre, equipos, lidera };
    })
    .filter((candidato) => candidato.equipos > 0)
    .sort(
      (a, b) =>
        b.lidera - a.lidera ||
        b.equipos - a.equipos ||
        a.nombre.localeCompare(b.nombre, 'es'),
    );

  return candidatos[0]?.id ?? null;
}

// --- capturar directo en el sprint ------------------------------------------

/**
 * A dónde puede caer una tarea capturada desde el sprint.
 *
 * El sprint guarda `tarea_id` y nada más: la tarea vive en el árbol de su proyecto. Así
 * que capturar aquí es elegir DÓNDE va a vivir, y por eso el destino se ofrece explícito
 * en vez de inventar una épica «Varios».
 *
 * Desde N9 el destino puede ser una historia, una épica o el proyecto entero (regla 18).
 * Ofrecer solo historias dejaba sin ningún destino a los cinco proyectos que no tienen
 * ese nivel: el diálogo decía «no hay dónde capturar» en un Jira lleno de trabajo.
 */
export interface DestinoCaptura {
  /** Historia, épica o CLAVE del proyecto: lo que espera `crearTarea`. */
  contenedorId: string;
  /** Clave del proyecto. Es lo que agrupa el desplegable. */
  clave: string;
  proyecto: string;
  /** Los niveles que EXISTEN. `null` no es un dato que falte: es un nivel que no hay. */
  epica: string | null;
  historia: string | null;
  /** Lo que le va a pasar a la tarea al nacer. Se dice ANTES de capturar. */
  naceNoPlaneada: boolean;
  planeacionCerradaEn: Fecha | null;
}

export function destinosDeCaptura(doc: Documento, hoy: Fecha): DestinoCaptura[] {
  const destinos: DestinoCaptura[] = [];
  for (const proyecto of doc.proyectos) {
    // Un proyecto archivado o cerrado no recibe trabajo nuevo: ofrecerlo aquí sería
    // invitar a meter una tarea en algo que ya salió de la vista diaria.
    if (proyecto.archivado || proyecto.cerrado_en !== null) continue;
    const naceNoPlaneada = capturaNaceNoPlaneada(proyecto, hoy);
    const comun = {
      clave: proyecto.clave,
      proyecto: proyecto.nombre,
      naceNoPlaneada,
      planeacionCerradaEn: proyecto.planeacion_cerrada_en,
    };

    // De más hondo a menos: la historia es el destino más preciso y va primero en la
    // lista, que es la que el desplegable enseña en orden.
    for (const epica of proyecto.epicas) {
      for (const historia of epica.historias) {
        destinos.push({
          ...comun,
          contenedorId: historia.id,
          epica: epica.titulo,
          historia: historia.titulo,
        });
      }
      destinos.push({ ...comun, contenedorId: epica.id, epica: epica.titulo, historia: null });
    }
    // El proyecto entero: el único destino de un trabajo continuo sin épicas.
    destinos.push({ ...comun, contenedorId: proyecto.clave, epica: null, historia: null });
  }
  return destinos;
}

/**
 * ¿Una tarea capturada hoy en este proyecto nace marcada como NO planeada?
 *
 * Es la misma regla que aplica el reductor al crear una tarea (D4, regla 17): lo
 * capturado después de cerrar la planeación no estaba contemplado. Aquí se repite para
 * poder DECIRLO antes de capturar —un formulario que no avisa de que va a marcar algo es
 * un formulario que sorprende—, pero la marca la sigue poniendo el reductor: esto no
 * decide nada, solo anticipa.
 *
 * **Límite conocido:** un proyecto que nunca cerró su planeación
 * (`planeacion_cerrada_en === null`) marca todo como planeado, incluida una captura hecha
 * directamente en el sprint. Con los comandos que hay hoy no se puede forzar lo
 * contrario: ni `crearTarea` acepta `planeada`, ni existe un comando que cierre la
 * planeación de un proyecto.
 */
export function capturaNaceNoPlaneada(proyecto: Proyecto, hoy: Fecha): boolean {
  const cierre = proyecto.planeacion_cerrada_en;
  return cierre !== null && hoy > cierre;
}

/** Ids de las tareas de una historia. Sirve para localizar la que se acaba de crear. */
export function idsDeContenedor(doc: Documento, contenedorId: string): Set<string> {
  const ids = new Set<string>();
  for (const proyecto of doc.proyectos) {
    // Los tres contenedores posibles (regla 18). La CLAVE del proyecto identifica al
    // proyecto mismo, igual que en `crearTarea`.
    if (proyecto.clave === contenedorId) {
      for (const tarea of tareasDe(proyecto)) ids.add(tarea.id);
      continue;
    }
    for (const epica of proyecto.epicas) {
      if (epica.id === contenedorId) {
        for (const tarea of tareasDe(epica)) ids.add(tarea.id);
        continue;
      }
      for (const historia of epica.historias) {
        if (historia.id !== contenedorId) continue;
        for (const tarea of tareasDe(historia)) ids.add(tarea.id);
      }
    }
  }
  return ids;
}

/**
 * La tarea que apareció en el contenedor entre dos documentos.
 *
 * El comando `crearTarea` responde con el documento nuevo pero no con el id que emitió, y
 * el id lo decide el contador del proyecto: adivinarlo desde el renderer sería replicar
 * `siguienteId` y equivocarse el día que cambie. Se compara y ya.
 */
export function tareaRecienCreada(
  doc: Documento,
  contenedorId: string,
  idsPrevios: ReadonlySet<string>,
): string | null {
  for (const id of idsDeContenedor(doc, contenedorId)) {
    if (!idsPrevios.has(id)) return id;
  }
  return null;
}
