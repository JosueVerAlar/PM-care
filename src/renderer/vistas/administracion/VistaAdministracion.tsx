/**
 * E12b — Administración: el enrutador de sus tres secciones.
 *
 * Es UNA vista con tres secciones y no tres vistas globales más. La diferencia importa:
 * las de arriba de la barra lateral son de **consulta** —contestan una pregunta sobre el
 * trabajo— y estas tres **editan el catálogo** del que todas las demás dependen. Mezclarlas
 * en la misma lista habría hecho que «Equipos (consulta)» y «Equipos (edición)» fueran dos
 * entradas vecinas indistinguibles.
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
