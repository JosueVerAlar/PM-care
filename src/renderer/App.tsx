/**
 * El armazón de la app: decide QUÉ pantalla toca y reparte el documento.
 *
 * Las cuatro fases del puente (cargando, sin puente, fallo, cargado) se resuelven aquí y
 * solo aquí; ninguna vista de abajo tiene que preguntarse si hay documento.
 *
 * Dos decisiones de resiliencia que valen por sí solas:
 *
 * - **El proyecto seleccionado se resuelve contra el documento vigente en cada render.**
 *   Se guarda una clave, no un índice ni un objeto; si el proyecto desaparece porque el
 *   usuario editó el JSON por fuera, la vista cae al primero en vez de quedarse en
 *   blanco.
 * - **Solo lectura con documento en memoria no esconde la app.** Un conflicto externo
 *   deja el documento válido: se sigue pudiendo mirar todo, con una franja arriba que
 *   dice que no se está escribiendo. Solo cuando NO hay documento la pantalla de
 *   recuperación ocupa todo.
 */

import { useMemo } from 'react';

import type { Documento, Proyecto } from '../compartido/modelo/tipos';
import { BarraHerramientas } from './armazon/BarraHerramientas';
import { BarraLateral } from './armazon/BarraLateral';
import { ProveedorAlmacen, useAccionesAlmacen, useAlmacen } from './estado/almacen';
import { ProveedorInterfaz, useAccionesInterfaz, useInterfaz } from './estado/interfaz';
import { Cargando, FalloDelPuente, SinProyectos, SinPuente } from './pantallas/Avisos';
import { SoloLectura } from './pantallas/SoloLectura';
import type { Diagnostico } from './puente/api';
import { hoyLocal, nombreSinClave } from './util/presentacion';
import { VistaGlobal } from './vistas/globales/VistaGlobal';
import { VistaProyecto } from './vistas/proyecto/VistaProyecto';

export function App() {
  return (
    <ProveedorAlmacen>
      <ProveedorInterfaz>
        <Armazon />
      </ProveedorInterfaz>
    </ProveedorAlmacen>
  );
}

function Armazon() {
  const estado = useAlmacen();
  const acciones = useAccionesAlmacen();

  switch (estado.fase) {
    case 'cargando':
      return <Cargando />;
    case 'sin-puente':
      return <SinPuente />;
    case 'fallo':
      return <FalloDelPuente mensaje={estado.mensaje} reintentar={() => void acciones.recargar()} />;
    case 'cargado':
      break;
  }

  const { documento, diagnostico, ruta } = estado.instantanea;

  // Sin documento no hay nada que pintar: la pantalla de recuperación ocupa todo. Es el
  // caso de un JSON roto, y la regla 13 exige que la app no escriba hasta que el usuario
  // decida qué hacer.
  if (documento === null) {
    return (
      <SoloLectura
        diagnostico={
          diagnostico ?? {
            motivo: 'error-lectura',
            mensaje: 'El almacén no entregó ningún documento.',
            problemas: [],
            acciones: ['reintentar', 'abrir-en-editor'],
          }
        }
        ruta={ruta}
      />
    );
  }

  return <Aplicacion documento={documento} ruta={ruta} diagnostico={diagnostico} />;
}

function Aplicacion({
  documento,
  ruta,
  diagnostico,
}: {
  documento: Documento;
  ruta: string;
  /** No nulo solo en conflicto externo: el documento vale, pero no se escribe. */
  diagnostico: Diagnostico | null;
}) {
  const { vista, lateralColapsada } = useInterfaz();
  const { alternarLateral } = useAccionesInterfaz();

  // La única lectura del reloj de toda la vista. El dominio recibe `hoy` como parámetro
  // para que «lleva 6 días bloqueada» se pueda probar sin viajar en el tiempo.
  const hoy = useMemo(() => hoyLocal(), []);

  const proyectos = documento.proyectos.filter((p: Proyecto) => !p.archivado);
  const seleccionada = vista?.tipo === 'proyecto' ? vista.clave : null;
  // Se resuelve contra el documento vigente: una clave que ya no existe cae al primero.
  const proyecto =
    proyectos.find((p: Proyecto) => p.clave === seleccionada) ?? (vista?.tipo === 'global' ? undefined : proyectos[0]);

  const titulo = vista?.tipo === 'global' ? 'PM-care' : (proyecto?.clave ?? 'PM-care');
  const subtitulo =
    vista?.tipo === 'global' || proyecto === undefined
      ? null
      : nombreSinClave(proyecto.clave, proyecto.nombre);

  return (
    <div className={`app${lateralColapsada ? ' app--rail' : ''}`}>
      <BarraHerramientas
        titulo={titulo}
        subtitulo={subtitulo}
        lateralColapsada={lateralColapsada}
        alternarLateral={alternarLateral}
        soloLectura={diagnostico !== null}
      />

      {/* Conflicto externo: el documento sigue siendo válido, así que se puede seguir
          mirando. La franja dice que no se está escribiendo y ofrece las salidas. */}
      {diagnostico !== null && <SoloLectura diagnostico={diagnostico} ruta={ruta} compacta />}

      {/* Una vista global ocupa el ancho de los dos paneles: no tiene panel hermano. */}
      <div className={`cuerpo${vista?.tipo === 'global' ? ' cuerpo--global' : ''}`}>
        <BarraLateral
          documento={documento}
          vista={vista}
          claveActiva={proyecto?.clave ?? null}
          hoy={hoy}
        />

        {vista?.tipo === 'global' ? (
          <VistaGlobal id={vista.id} documento={documento} />
        ) : proyecto === undefined ? (
          <SinProyectos ruta={ruta} />
        ) : (
          <VistaProyecto documento={documento} proyecto={proyecto} hoy={hoy} />
        )}
      </div>
    </div>
  );
}
