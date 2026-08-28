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

export interface EntradaGlobal {
  id: IdVistaGlobal;
  icono: NombreIcono;
  texto: string;
  pregunta: string;
}

export const GLOBALES: readonly EntradaGlobal[] = [
  {
    id: 'panorama',
    icono: 'panorama',
    texto: 'Panorama',
    pregunta: '¿A cuál de los proyectos le tengo que meter mano hoy?',
  },
  {
    id: 'sprint',
    icono: 'sprint',
    texto: 'Sprint',
    pregunta: 'Todo lo comprometido esta quincena, cruzando los proyectos.',
  },
  {
    id: 'bloqueos',
    icono: 'bloqueos',
    texto: 'Bloqueos',
    pregunta: '¿Qué está atorado, desde hace cuánto y qué lo destraba?',
  },
  {
    id: 'terminadas',
    icono: 'terminadas',
    texto: 'Terminadas',
    pregunta: '¿Qué se cerró en cada sprint? Es el registro que se copia a fin de mes.',
  },
  {
    id: 'backlog',
    icono: 'backlog',
    texto: 'Backlog del área',
    pregunta: 'Todas las tareas capturadas, agrupables y filtrables.',
  },
  {
    id: 'carga',
    icono: 'carga',
    texto: 'Carga por persona',
    pregunta: 'Cuánto trae cada quien y entre cuántos proyectos está repartido.',
  },
  {
    id: 'tiempos',
    icono: 'tiempos',
    texto: 'Tiempos',
    pregunta: '¿Cuánto se tarda en cerrar una tarea, y quién arrastra las más lentas?',
  },
  {
    id: 'equipos',
    icono: 'equipos',
    texto: 'Equipos',
    pregunta: 'Quién está en cada proyecto y con qué rol.',
  },
];

/**
 * Lo que la barra lateral lista, que NO es todo el registro.
 *
 * N7 · **la frecuencia de uso decide la jerarquía de navegación, no la importancia
 * organizacional.** «Equipos» se consulta una vez al mes; cada entrada que no es diaria
 * diluye a las que sí lo son, y esta además aparecía dos veces en la misma barra —una en
 * Vistas y otra en Administración—. La vista sigue existiendo y sigue siendo alcanzable:
 * lo que se quitó es su sitio en el mapa mental de la app.
 */
export const EN_LATERAL: readonly EntradaGlobal[] = GLOBALES.filter(
  (entrada) => entrada.id !== 'equipos',
);

const POR_ID = new Map(GLOBALES.map((entrada) => [entrada.id, entrada]));

export function entradaGlobal(id: IdVistaGlobal): EntradaGlobal {
  const entrada = POR_ID.get(id);
  // Inalcanzable: `IdVistaGlobal` y esta tabla son el mismo conjunto y el compilador lo
  // comprueba en cada `Record`. El fallo explícito evita devolver `undefined` en silencio
  // si algún día se añade un id y se olvida la entrada.
  if (!entrada) throw new Error(`Vista global sin entrada en el registro: ${id}`);
  return entrada;
}
