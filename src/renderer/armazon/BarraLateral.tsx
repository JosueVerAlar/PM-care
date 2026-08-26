/**
 * La barra lateral: las siete vistas globales, la lista de proyectos y las tres secciones
 * de Administración.
 *
 * Los contadores de bloqueadas se derivan del documento, nunca se guardan. Un contador
 * en cero no se pinta: una columna de ceros entrena a no mirar la columna.
 *
 * En rail de 48 px el texto desaparece y quedan el icono (vistas) o las tres primeras
 * letras de la clave (proyectos). El contador se convierte en una insignia sobre la
 * esquina. El `title` conserva el nombre completo en ambos modos.
 */

import { useMemo } from 'react';

import { paraVistaBloqueos, senalesDeProyecto } from '../../compartido/dominio/clasificar';
import { sprintActivo } from '../../compartido/dominio/derivar';
import type { Documento, Fecha } from '../../compartido/modelo/tipos';
import { ContadorBloqueos } from '../componentes/Chips';
import { Icono } from '../componentes/iconos';
import { useAccionesInterfaz, type Vista } from '../estado/interfaz';
import { SECCIONES_ADMIN } from '../vistas/administracion/VistaAdministracion';
import { GLOBALES } from '../vistas/globales/registro';

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
  const { verProyecto, verGlobal, verAdmin } = useAccionesInterfaz();

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
    <nav className="lateral" aria-label="Vistas, proyectos y administración">
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
            // `!== 'global'` no basta desde E8: con la pantalla de cierre abierta ninguna
            // fila de proyecto es la actual, y marcar una anunciaría al lector de pantalla
            // un sitio donde el usuario no está.
            aria-current={
              (vista === null || vista.tipo === 'proyecto') && p.clave === claveActiva
            }
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

      <div className="lat-sep" />

      {/* Administración va al final y en su propio grupo: no es una vista de consulta más,
          es donde se edita el catálogo del que dependen todas las de arriba. */}
      <div className="lat-grupo">
        <h2 className="lat-titulo">Administración</h2>
        {SECCIONES_ADMIN.map((seccion) => (
          <button
            key={seccion.id}
            type="button"
            className="lat-item"
            title={`Administrar ${seccion.texto.toLowerCase()}`}
            aria-label={`Administración · ${seccion.texto}`}
            aria-current={vista?.tipo === 'admin' && vista.seccion === seccion.id}
            onClick={() => verAdmin(seccion.id)}
          >
            <span className="lat-item__icono">
              <Icono nombre={seccion.icono} />
            </span>
            <span className="lat-item__texto">{seccion.texto}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}
