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
 * - **El menú Edición ▸ Deshacer** (E13). El ítem vive en el proceso principal, pero lo
 *   que hace y cómo se llama se deciden aquí: es el mismo `alDeshacer` de `⌘Z`, para que
 *   el menú y la tecla no puedan divergir nunca.
 *
 * ## E13 — lo que YA NO se resuelve aquí
 *
 * «A dónde va Capturar» era un cálculo de esta pantalla porque el botón vivía en la barra
 * superior y tenía que adivinar el destino desde la selección del árbol. Ahora cada `＋`
 * está pegado a su contenedor y sabe su destino sin preguntarle a nadie, así que el
 * cálculo desapareció en vez de mudarse.
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
  type SeccionAdmin,
} from './estado/interfaz';
import { usePuedeDeshacer, useMutar, useSoloLectura } from './estado/mutaciones';

import { Cargando, FalloDelPuente, SinProyectos, SinPuente } from './pantallas/Avisos';
import { SoloLectura } from './pantallas/SoloLectura';
import { puente, type Diagnostico } from './puente/api';
import { enCampoDeTexto, esDeshacer } from './util/atajos';
import { hoyLocal, nombreSinClave } from './util/presentacion';

import { entradaAdmin, VistaAdministracion } from './vistas/administracion/VistaAdministracion';
import { VistaCierre } from './vistas/cierre/VistaCierre';
import { entradaGlobal } from './vistas/globales/registro';
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

/**
 * Lo que cada sección de Administración promete, para la barra superior.
 *
 * Vive aquí y no en `SECCIONES_ADMIN` porque es texto de la BARRA, igual que
 * `entradaGlobal(...).pregunta` lo es para las vistas globales: la tabla de secciones la
 * lee también la lateral, donde una frase entera no cabe.
 */
const SUBTITULO_ADMIN: Record<SeccionAdmin, string> = {
  proyectos: 'Alta, cierre y eliminación. La clave se fija al crear y no se cambia nunca.',
  personas: 'El catálogo global. Dar de baja es el camino normal; eliminar, la excepción.',
  equipos: 'Quién está en cada proyecto y con qué rol. Los miembros salen del catálogo.',
};

/** «1 tarea» / «12 tareas». Sin el singular roto que delata una plantilla. */
function cuentaTareas(n: number): string {
  return n === 1 ? '1 tarea' : `${n} tareas`;
}

/**
 * Cómo se llama, en el menú, lo que se va a deshacer.
 *
 * [HIG] pide «Deshacer capturar SICOE-T14» y no «Deshacer»: sin el objeto, el ítem no
 * deja predecir qué va a pasar. El texto sale del `contexto` con el que se mandó el
 * comando —«Capturar historia», «Eliminar SICOE-T14»—, en minúscula porque va detrás del
 * verbo. Sin etiqueta el ítem se queda con su nombre corto: la pila del proceso principal
 * manda sobre si está habilitado, y esto solo lo NOMBRA.
 */
function etiquetaDeshacer(pila: readonly string[], puede: boolean): string | null {
  if (!puede) return null;
  const ultima = pila[pila.length - 1];
  if (ultima === undefined || ultima === '') return null;
  return ultima.charAt(0).toLowerCase() + ultima.slice(1);
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
  const { vista, lateralColapsada, aviso, confirmacion, pilaDeshacer } = useInterfaz();
  const { alternarLateral, avisar, confirmar, desapilarDeshacer, vaciarDeshacer } =
    useAccionesInterfaz();
  const { deshacer } = useAccionesAlmacen();
  const soloLectura = useSoloLectura();
  // Con el archivo en conflicto no se escribe nada, tampoco al revés: el ítem del menú va
  // en gris igual que iba el botón que ocupaba la barra hasta E13.
  const puedeDeshacer = usePuedeDeshacer() && !soloLectura;
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

  // La barra superior nombra lo que se está mirando. En una vista global eso es la vista,
  // no «PM-care»: con seis pantallas transversales, un título genérico deja de decir dónde
  // está uno en cuanto se cambia de vista dos veces.
  const titulo =
    vista?.tipo === 'global'
      ? entradaGlobal(vista.id).texto
      : vista?.tipo === 'admin'
        ? `Administración · ${entradaAdmin(vista.seccion).texto}`
        : ancha
          ? 'PM-care'
          : (proyecto?.clave ?? 'PM-care');
  const subtitulo =
    vista?.tipo === 'global'
      ? entradaGlobal(vista.id).pregunta
      : vista?.tipo === 'admin'
        ? SUBTITULO_ADMIN[vista.seccion]
        : ancha || proyecto === undefined
          ? null
          : nombreSinClave(proyecto.clave, proyecto.nombre);

  // --- ⌘Z y el menú Edición ------------------------------------------------
  const alDeshacer = useCallback(() => {
    void (async () => {
      const respuesta = await deshacer();
      if (!respuesta.ok) {
        avisar(`Deshacer: ${respuesta.mensaje}`);
        return;
      }
      avisar(null);
      // Ese paso ya no está en la pila del proceso principal: su nombre tampoco.
      desapilarDeshacer();
    })();
  }, [avisar, desapilarDeshacer, deshacer]);


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

  /**
   * El ítem del menú Edición: lo ejecuta el proceso principal, lo hace ESTE `alDeshacer`.
   *
   * Sin esto el menú de macOS traería el `role: 'undo'` por omisión —el deshacer del campo
   * de texto enfocado— en el sitio donde se busca el de la app, que es un «Deshacer» que
   * hace otra cosa. El acelerador `⌘Z` se pinta en el menú pero NO se registra
   * (`registerAccelerator: false` en el proceso principal), así que la tecla la sigue
   * atendiendo el escucha de arriba con su excepción para los campos de texto.
   */
  useEffect(() => puente()?.alPedirDeshacer(alDeshacer), [alDeshacer]);

  /** Qué dice el ítem y si está vivo. La pila del proceso principal es la que manda. */
  const etiqueta = etiquetaDeshacer(pilaDeshacer, puedeDeshacer);
  useEffect(() => {
    puente()?.publicarDeshacer({ puede: puedeDeshacer, etiqueta });
  }, [etiqueta, puedeDeshacer]);

  // La pila de allá se vacía sola ante un cambio externo del archivo (regla 16). Cuando
  // eso pasa, los nombres de aquí ya no describen nada que se pueda revertir.
  useEffect(() => {
    if (!puedeDeshacer) vaciarDeshacer();
  }, [puedeDeshacer, vaciarDeshacer]);


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
          <VistaGlobal id={vista.id} documento={documento} hoy={hoy} />
        ) : vista?.tipo === 'admin' ? (
          <VistaAdministracion seccion={vista.seccion} documento={documento} />
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
