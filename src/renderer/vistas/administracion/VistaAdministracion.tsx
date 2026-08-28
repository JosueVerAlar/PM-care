/**
 * E12b — Administración: el enrutador de sus tres secciones.
 *
 * Es UNA vista con tres secciones y no tres vistas globales más. Proyectos y Personas
 * editan el catálogo, mientras Equipos reúne la consulta y la edición de la relación entre
 * ambos. Mantenerla aquí evita dos destinos indistinguibles para el mismo dato.
 *
 * El panel ocupa el ancho de los dos paneles de proyecto, igual que las vistas globales:
 * ninguna de las tres secciones tiene panel hermano.
 */

import type { Documento } from '../../../compartido/modelo/tipos';
import type { SeccionAdmin } from '../../estado/interfaz';
import { PanelGlobal } from '../globales/piezas';
import { SeccionEquipos } from './SeccionEquipos';
import { SeccionPersonas } from './SeccionPersonas';
import { SeccionProyectos } from './SeccionProyectos';

export interface EntradaAdmin {
  id: SeccionAdmin;
  icono: 'proyectos' | 'personas' | 'equipos';
  texto: string;
}

/**
 * El registro de las tres secciones. Vive aquí, junto al enrutador, por la misma razón que
 * el de las vistas globales: la barra lateral y el título de la barra superior leen esta
 * tabla, y tres tablas paralelas se desincronizan en cuanto alguien renombra una.
 */
export const SECCIONES_ADMIN: readonly EntradaAdmin[] = [
  { id: 'proyectos', icono: 'proyectos', texto: 'Proyectos' },
  { id: 'personas', icono: 'personas', texto: 'Personas' },
  { id: 'equipos', icono: 'equipos', texto: 'Equipos' },
];

export function entradaAdmin(id: SeccionAdmin): EntradaAdmin {
  const entrada = SECCIONES_ADMIN.find((seccion) => seccion.id === id);
  // Inalcanzable: `SeccionAdmin` y esta tabla son el mismo conjunto. El fallo explícito
  // evita devolver `undefined` en silencio si algún día se añade una y se olvida la fila.
  if (!entrada) throw new Error(`Sección de administración sin entrada: ${id}`);
  return entrada;
}

export function VistaAdministracion({
  seccion,
  documento,
}: {
  seccion: SeccionAdmin;
  documento: Documento;
}) {
  return (
    <PanelGlobal etiqueta={`Administración · ${entradaAdmin(seccion).texto}`}>
      {seccion === 'proyectos' && <SeccionProyectos documento={documento} />}
      {seccion === 'personas' && <SeccionPersonas documento={documento} />}
      {seccion === 'equipos' && <SeccionEquipos documento={documento} />}
    </PanelGlobal>
  );
}
