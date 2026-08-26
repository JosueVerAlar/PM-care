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
 *
 * ## E7 — lo que se resuelve aquí y en ningún otro sitio
 *
 * - **`⌘Z`.** Un solo escucha en `window`, no uno por panel. La pila de 20 vive en el
 *   proceso principal y se vacía ante un cambio externo del archivo; aquí solo se llama.
 * - **La única confirmación de la app.** El diálogo se monta arriba del todo para que sea
 *   modal de verdad, y quien pide borrar solo publica la intención en el estado de
 *   interfaz.
 * - **A dónde va «Capturar».** El botón de la barra y la tecla `N` del árbol tienen que
 *   apuntar al mismo sitio, así que el destino se calcula una vez, aquí.
 */

import { useCallback, useEffect, useMemo } from 'react';

import type { Documento, Proyecto } from '../compartido/modelo/tipos';
import { BarraHerramientas } from './armazon/BarraHerramientas';
import { BarraLateral } from './armazon/BarraLateral';
import { DialogoConfirmar } from './componentes/DialogoConfirmar';
import { ProveedorAlmacen, useAccionesAlmacen, useAlmacen } from './estado/almacen';
import {
  esVistaAncha,
  ProveedorInterfaz,
  useAccionesInterfaz,
  useInterfaz,
  type ClaseNodo,
} from './estado/interfaz';
import { usePuedeDeshacer, useMutar, useSoloLectura } from './estado/mutaciones';
import { Cargando, FalloDelPuente, SinProyectos, SinPuente } from './pantallas/Avisos';
import { SoloLectura } from './pantallas/SoloLectura';
import type { Diagnostico } from './puente/api';
import { enCampoDeTexto, esDeshacer } from './util/atajos';
import { buscarNodo } from './util/nodos';
import { hoyLocal, nombreSinClave } from './util/presentacion';
import { VistaCierre } from './vistas/cierre/VistaCierre';
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

/** «1 tarea» / «12 tareas». Sin el singular roto que delata una plantilla. */
function cuentaTareas(n: number): string {
  return n === 1 ? '1 tarea' : `${n} tareas`;
}

/** A dónde iría una captura ahora mismo, según lo que esté seleccionado en el árbol. */
interface DestinoCaptura {
  clase: ClaseNodo;
  padreId: string;
  /** Frase para el `title` del botón: «una tarea en Grupos de regularización». */
  que: string;
}

function destinoDeCaptura(proyecto: Proyecto, nodoActivo: string | null): DestinoCaptura {
  const nodo = nodoActivo === null ? null : buscarNodo(proyecto, nodoActivo);
  if (nodo === null) {
    return { clase: 'epica', padreId: proyecto.clave, que: `una épica en ${proyecto.clave}` };
  }
  if (nodo.clase === 'epica') {
    return { clase: 'historia', padreId: nodo.epica.id, que: `una historia en ${nodo.epica.titulo}` };
  }
  // Desde una historia o desde una tarea se captura una TAREA en esa historia: la tarea
  // es la hoja, así que «dentro de una tarea» no existe.
  return { clase: 'tarea', padreId: nodo.historia.id, que: `una tarea en ${nodo.historia.titulo}` };
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
  const { vista, lateralColapsada, nodoActivo, aviso, confirmacion } = useInterfaz();
  const { alternarLateral, redactar, avisar, confirmar } = useAccionesInterfaz();
  const { deshacer } = useAccionesAlmacen();
  const puedeDeshacer = usePuedeDeshacer();
  const soloLectura = useSoloLectura();
  const mutar = useMutar();

  // La única lectura del reloj de toda la vista. El dominio recibe `hoy` como parámetro
  // para que «lleva 6 días bloqueada» se pueda probar sin viajar en el tiempo.
  const hoy = useMemo(() => hoyLocal(), []);

  const proyectos = documento.proyectos.filter((p: Proyecto) => !p.archivado);
  const seleccionada = vista?.tipo === 'proyecto' ? vista.clave : null;
  // Las vistas anchas (globales y el cierre de sprint) no tienen proyecto: no se cae al
  // primero por ellas, o la barra superior anunciaría un proyecto que nadie está mirando.
  const ancha = esVistaAncha(vista);
  // Se resuelve contra el documento vigente: una clave que ya no existe cae al primero.
  const proyecto =
    proyectos.find((p: Proyecto) => p.clave === seleccionada) ?? (ancha ? undefined : proyectos[0]);

  const titulo = ancha ? 'PM-care' : (proyecto?.clave ?? 'PM-care');
  const subtitulo =
    ancha || proyecto === undefined ? null : nombreSinClave(proyecto.clave, proyecto.nombre);

  // --- ⌘Z ------------------------------------------------------------------
  const alDeshacer = useCallback(() => {
    void (async () => {
      const respuesta = await deshacer();
      if (!respuesta.ok) avisar(`Deshacer: ${respuesta.mensaje}`);
      else avisar(null);
    })();
  }, [avisar, deshacer]);

  useEffect(() => {
    const escucha = (evento: KeyboardEvent) => {
      if (!esDeshacer(evento)) return;
      // Dentro de un campo de texto, ⌘Z es el deshacer del propio campo y tiene que
      // seguir siéndolo: quitarle al usuario el deshacer de lo que está tecleando para
      // revertirle en su lugar una tarea del sprint sería un desastre.
      if (enCampoDeTexto(evento.target)) return;
      evento.preventDefault();
      alDeshacer();
    };
    window.addEventListener('keydown', escucha);
    return () => window.removeEventListener('keydown', escucha);
  }, [alDeshacer]);

  // --- «Capturar» ----------------------------------------------------------
  const destino = proyecto === undefined ? null : destinoDeCaptura(proyecto, nodoActivo);
  const puedeCapturar = destino !== null && !soloLectura && !ancha;

  return (
    <div className={`app${lateralColapsada ? ' app--rail' : ''}`}>
      <BarraHerramientas
        titulo={titulo}
        subtitulo={subtitulo}
        lateralColapsada={lateralColapsada}
        alternarLateral={alternarLateral}
        soloLectura={diagnostico !== null}
        puedeDeshacer={puedeDeshacer && !soloLectura}
        deshacer={alDeshacer}
        capturar={
          puedeCapturar && destino !== null
            ? () => redactar({ tipo: 'capturar', clase: destino.clase, padreId: destino.padreId })
            : null
        }
        queSeCaptura={destino?.que ?? null}
      />

      {/* Conflicto externo: el documento sigue siendo válido, así que se puede seguir
          mirando. La franja dice que no se está escribiendo y ofrece las salidas. */}
      {diagnostico !== null && <SoloLectura diagnostico={diagnostico} ruta={ruta} compacta />}

      {/* Un comando que falló NO revierte nada (regla 5): el documento en memoria es el
          que devolvió el proceso principal, y lo que el usuario tecleó sigue en su
          formulario. Aquí solo se cuenta lo que pasó. */}
      {aviso !== null && (
        <div className="franja-aviso" role="alert">
          <span className="franja-aviso__texto">{aviso}</span>
          <span className="crece" />
          <span className="franja-aviso__nota">No se escribió nada. Puedes volver a intentarlo.</span>
          <button type="button" className="boton-texto" onClick={() => avisar(null)}>
            Cerrar
          </button>
        </div>
      )}

      {/* Una vista global ocupa el ancho de los dos paneles: no tiene panel hermano. */}
      <div className={`cuerpo${ancha ? ' cuerpo--global' : ''}`}>
        <BarraLateral
          documento={documento}
          vista={vista}
          claveActiva={proyecto?.clave ?? null}
          hoy={hoy}
        />

        {vista?.tipo === 'global' ? (
          <VistaGlobal id={vista.id} documento={documento} />
        ) : vista?.tipo === 'cierre' ? (
          <VistaCierre documento={documento} sprintId={vista.sprintId} hoy={hoy} />
        ) : proyecto === undefined ? (
          <SinProyectos ruta={ruta} />
        ) : (
          <VistaProyecto documento={documento} proyecto={proyecto} hoy={hoy} />
        )}
      </div>

      {confirmacion !== null && (
        <DialogoConfirmar
          titulo={`Borrar ${confirmacion.id}`}
          detalle={`«${confirmacion.titulo}» se lleva ${cuentaTareas(confirmacion.tareas)} por delante. ⌘Z lo revierte mientras la pila no se vacíe.`}
          // El conteo va en el BOTÓN, no solo en el texto: es lo último que se lee antes
          // de pulsar, y es la diferencia entre «Borrar E3» y saber qué cuesta.
          accion={`Borrar ${confirmacion.id} y sus ${cuentaTareas(confirmacion.tareas)}`}
          cancelar={() => confirmar(null)}
          confirmar={() => {
            const objetivo = confirmacion;
            confirmar(null);
            void mutar(
              objetivo.clase === 'epica'
                ? { comando: 'eliminarEpica', id: objetivo.id }
                : { comando: 'eliminarHistoria', id: objetivo.id },
              `Eliminar ${objetivo.id}`,
            );
          }}
        />
      )}
    </div>
  );
}
