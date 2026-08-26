/**
 * La barra lateral: las siete vistas globales y la lista de proyectos.
 *
 * Los contadores de bloqueadas se derivan del documento, nunca se guardan. Un contador
 * en cero no se pinta: una columna de ceros entrena a no mirar la columna.
 *
 * En rail de 48 px el texto desaparece y quedan el icono (vistas) o las tres primeras
 * letras de la clave (proyectos). El contador se convierte en una insignia sobre la
 * esquina. El `title` conserva el nombre completo en ambos modos.
 */

import { useMemo } from 'react';

import { paraBacklogDelArea, paraVistaBloqueos, paraVistaTerminadas, senalesDeProyecto } from '../../compartido/dominio/clasificar';
import { sprintActivo } from '../../compartido/dominio/derivar';
import type { Documento, Fecha } from '../../compartido/modelo/tipos';
import { ContadorBloqueos } from '../componentes/Chips';
import { Icono, type NombreIcono } from '../componentes/iconos';
import { useAccionesInterfaz, type IdVistaGlobal, type Vista } from '../estado/interfaz';

interface EntradaGlobal {
  id: IdVistaGlobal;
  icono: NombreIcono;
  texto: string;
}

const GLOBALES: EntradaGlobal[] = [
  { id: 'panorama', icono: 'panorama', texto: 'Panorama' },
  { id: 'sprint', icono: 'sprint', texto: 'Sprint' },
  { id: 'bloqueos', icono: 'bloqueos', texto: 'Bloqueos' },
  { id: 'terminadas', icono: 'terminadas', texto: 'Terminadas' },
  { id: 'backlog', icono: 'backlog', texto: 'Backlog del área' },
  { id: 'carga', icono: 'carga', texto: 'Carga por persona' },
  { id: 'equipos', icono: 'equipos', texto: 'Equipos' },
];

export function BarraLateral({
  documento,
  vista,
  claveActiva,
  hoy,
}: {
  documento: Documento;
  vista: Vista | null;
  /**
   * El proyecto que se está pintando de verdad, ya resuelto contra el documento.
   * No se deduce de `vista`: al abrir la app nadie eligió nada todavía y la vista cae
   * al primer proyecto, que igual tiene que salir marcado en la lista.
   */
  claveActiva: string | null;
  hoy: Fecha;
}) {
  const { verProyecto, verGlobal } = useAccionesInterfaz();

  const bloqueosTotales = useMemo(() => paraVistaBloqueos(documento).length, [documento]);
  const activo = useMemo(() => sprintActivo(documento), [documento]);

  /** Un solo recorrido por proyecto: `senalesDeProyecto` ya trae lo que la lista pinta. */
  const proyectos = useMemo(
    () =>
      documento.proyectos
        .filter((p) => !p.archivado)
        .map((p) => ({
          clave: p.clave,
          nombre: p.nombre,
          inicial: p.clave.replace(/-/g, '').slice(0, 3),
          bloqueadas: senalesDeProyecto(documento, p.clave, hoy)?.bloqueadas ?? 0,
        })),
    [documento, hoy],
  );

  return (
    <nav className="lateral" aria-label="Vistas y proyectos">
      <div className="lat-grupo">
        <h2 className="lat-titulo">Vistas</h2>
        {GLOBALES.map((entrada) => (
          <button
            key={entrada.id}
            type="button"
            className="lat-item"
            title={entrada.texto}
            // El nombre accesible es explícito porque en rail el texto se oculta con
            // CSS: sin esto, con la lateral colapsada el botón se anunciaría vacío.
            aria-label={entrada.texto}
            aria-current={vista?.tipo === 'global' && vista.id === entrada.id}
            onClick={() => verGlobal(entrada.id)}
          >
            <span className="lat-item__icono">
              <Icono nombre={entrada.icono} />
            </span>
            <span className="lat-item__texto">
              {entrada.id === 'sprint' && activo ? activo.nombre : entrada.texto}
            </span>
            {entrada.id === 'bloqueos' && <ContadorBloqueos n={bloqueosTotales} />}
          </button>
        ))}
      </div>

      <div className="lat-sep" />

      <div className="lat-grupo">
        <h2 className="lat-titulo">Proyectos</h2>
        {proyectos.length === 0 && <p className="lat-vacio">No hay proyectos capturados.</p>}
        {proyectos.map((p) => (
          <button
            key={p.clave}
            type="button"
            className="lat-item"
            title={p.nombre}
            aria-label={`${p.clave} — ${p.nombre}`}
            aria-current={vista?.tipo !== 'global' && p.clave === claveActiva}
            onClick={() => verProyecto(p.clave)}
          >
            <span className="lat-inicial" aria-hidden="true">
              {p.inicial}
            </span>
            <span className="lat-item__texto">{p.clave}</span>
            <ContadorBloqueos n={p.bloqueadas} />
          </button>
        ))}
      </div>
    </nav>
  );
}

/**
 * Conteos reales para los marcadores de posición de las vistas globales.
 *
 * Vive aquí, junto a la lista que las nombra, para que nadie invente un número en la
 * pantalla vacía: lo que se muestra sale de los mismos selectores que E10 y E11 van a
 * usar para construir la vista de verdad.
 */
export function conteoDeVistaGlobal(documento: Documento, id: IdVistaGlobal): number | null {
  switch (id) {
    case 'bloqueos':
      return paraVistaBloqueos(documento).length;
    case 'terminadas':
      return paraVistaTerminadas(documento).length;
    case 'backlog':
      return paraBacklogDelArea(documento).length;
    case 'sprint':
      return sprintActivo(documento)?.items.length ?? 0;
    case 'panorama':
      return documento.proyectos.filter((p) => !p.archivado).length;
    case 'carga':
      return documento.personas.filter((p) => p.activa).length;
    case 'equipos':
      return documento.proyectos.filter((p) => !p.archivado).length;
  }
}
