/**
 * El registro de las vistas globales: su nombre, su icono y la pregunta que contestan.
 *
 * Vive fuera de la barra lateral porque tres sitios necesitan lo mismo —la lateral para
 * listarlas, la barra superior para titular la que está abierta, y el enrutador para
 * etiquetar el panel—, y tres tablas paralelas se desincronizan en cuanto alguien
 * renombra una vista.
 *
 * La `pregunta` no es adorno: es lo que la vista promete contestar, y se enseña en su
 * estado vacío. Una pantalla vacía que no dice para qué existe no se vuelve a abrir.
 */

import type { NombreIcono } from '../../componentes/iconos';
import type { IdVistaGlobal } from '../../estado/interfaz';

/**
 * Los grupos de la barra lateral, nombrados por lo que se va a HACER en ellos.
 *
 * Antes eran «Vistas» y «Administración»: dos etiquetas que dicen de qué categoría es algo
 * en vez de qué hay dentro. «Administración» además dejó de ser cierta al fusionarse
 * Equipos — ya no es «donde se edita el catálogo», porque se edita desde su propia
 * pantalla. Una etiqueta vaga no cuesta un clic más: cuesta abrir dos grupos para
 * averiguar en cuál estaba lo que se buscaba.
 */
export type GrupoLateral = 'hoy' | 'registro' | 'gente';

export interface EntradaGlobal {
  id: IdVistaGlobal;
  icono: NombreIcono;
  texto: string;
  pregunta: string;
  /** Dónde vive en la lateral. Ver `GrupoLateral`. */
  grupo: GrupoLateral;
}

export const GLOBALES: readonly EntradaGlobal[] = [
  {
    id: 'panorama',
    icono: 'panorama',
    texto: 'Panorama',
    pregunta: '¿A cuál de los proyectos le tengo que meter mano hoy?',
    grupo: 'hoy',
  },
  {
    id: 'sprint',
    icono: 'sprint',
    texto: 'Sprint',
    pregunta: 'Todo lo comprometido esta quincena, cruzando los proyectos.',
    grupo: 'hoy',
  },
  {
    id: 'bloqueos',
    icono: 'bloqueos',
    texto: 'Bloqueos',
    pregunta: '¿Qué está atorado, desde hace cuánto y qué lo destraba?',
    grupo: 'hoy',
  },
  {
    id: 'terminadas',
    icono: 'terminadas',
    texto: 'Terminadas',
    pregunta: '¿Qué se cerró en cada sprint? Es el registro que se copia a fin de mes.',
    grupo: 'registro',
  },
  {
    id: 'backlog',
    icono: 'backlog',
    texto: 'Backlog del área',
    pregunta: 'Todas las tareas capturadas, agrupables y filtrables.',
    grupo: 'registro',
  },
  {
    id: 'carga',
    icono: 'carga',
    texto: 'Carga por persona',
    pregunta: 'Cuánto trae cada quien y entre cuántos proyectos está repartido.',
    grupo: 'gente',
  },
  {
    id: 'tiempos',
    icono: 'tiempos',
    texto: 'Tiempos',
    pregunta: '¿Cuánto se tarda en cerrar una tarea, y quién arrastra las más lentas?',
    grupo: 'registro',
  },
];

const POR_ID = new Map(GLOBALES.map((entrada) => [entrada.id, entrada]));

export function entradaGlobal(id: IdVistaGlobal): EntradaGlobal {
  const entrada = POR_ID.get(id);
  // Inalcanzable: `IdVistaGlobal` y esta tabla son el mismo conjunto y el compilador lo
  // comprueba en cada `Record`. El fallo explícito evita devolver `undefined` en silencio
  // si algún día se añade un id y se olvida la entrada.
  if (!entrada) throw new Error(`Vista global sin entrada en el registro: ${id}`);
  return entrada;
}
