/**
 * La vista de proyecto: tres paneles. Es el hito de E6 y el terreno de juego de E7/E14.
 *
 * Izquierda, backlog; centro, el mismo árbol filtrado a completadas; derecha, el sprint.
 * Las consultas de medio retiran primero completadas y después el sprint.
 *
 * La vista no calcula: pide `avanceDeProyecto` y `sprintActivo` al dominio y reparte.
 *
 * ## Las dos zonas de soltar, y la que a propósito no existe
 *
 * - **Árbol → sprint**: comprometer. Lo maneja `PanelSprint`.
 * - **Sprint → árbol**: sacar del sprint conservando lo escrito. Se maneja aquí, y la
 *   zona es el CUERPO del árbol, no la sección entera.
 * - **Sobre completadas, nada.** Ese panel no es zona ni origen de arrastre. Dar algo
 *   por terminado exige pasar por el estado de la tarea, no por un resbalón del ratón:
 *   ni se suelta ni se ilumina.
 */

import { useEffect, useMemo, useRef, useState } from 'react';

import {
  avanceDeProyecto,
  indexarTareas,
  sprintActivo,
  tareasDe,
} from '../../../compartido/dominio/derivar';
import type { Documento, Fecha, Proyecto } from '../../../compartido/modelo/tipos';
import { Mas } from '../../componentes/iconos';
import { Medidor } from '../../componentes/Medidor';

import { useAccionesSprint } from '../../estado/acciones-sprint';
import { useAccionesInterfaz, useInterfaz } from '../../estado/interfaz';
import { useSoloLectura } from '../../estado/mutaciones';
import { esArrastreDeTarea, TIPO_TAREA } from '../../util/arrastre';
import { useDosPaneles, useTresPaneles } from '../../util/medios';
import { Arbol } from './Arbol';
import { HojaDetalle } from './HojaDetalle';
import { Leyenda } from './Leyenda';
import { PanelAyuda } from './PanelAyuda';
import { PanelCompletadas } from './PanelCompletadas';
import { PanelSprint } from './PanelSprint';
import { PieEdicion } from './PieEdicion';

export function VistaProyecto({
  documento,
  proyecto,
  hoy,
}: {
  documento: Documento;
  proyecto: Proyecto;
  hoy: Fecha;
}) {
  const { expandidos, arrastre, detalle } = useInterfaz();
  const {
    expandir,
    colapsarTodo,
    arrastrar,
    redactar,
    verDetalle,
    irANodo,
  } = useAccionesInterfaz();

  const soloLectura = useSoloLectura();
  const dosPaneles = useDosPaneles();
  const tresPaneles = useTresPaneles();

  const sprint = useMemo(() => sprintActivo(documento, proyecto.clave), [documento, proyecto.clave]);
  const avance = useMemo(() => avanceDeProyecto(proyecto), [proyecto]);
  /**
   * El índice de tareas del documento, para que la hoja resuelva un id sin recorrer los
   * once proyectos. Se calcula aquí y no dentro de la hoja porque la hoja se monta y se
   * desmonta con cada apertura, y rehacer el índice en cada una lo pagaría el usuario en
   * el clic.
   */
  const indice = useMemo(() => indexarTareas(documento), [documento]);
  const acciones = useAccionesSprint(sprint);

  /** Ids de todo lo que se puede abrir. Sirve para el botón «Expandir todo». */
  const plegables = useMemo(() => {
    const ids: string[] = [];
    for (const epica of proyecto.epicas) {
      // Se abre si tiene historias O tareas propias (regla 18). Antes de N9 una épica de
      // un proyecto sin nivel de historia no entraba, y «Expandir todo» dejaba escondido
      // justo el trabajo que ese proyecto tiene.
      if (epica.historias.length === 0 && tareasDe(epica).length === 0) continue;
      ids.push(epica.id);
      for (const historia of epica.historias) {
        if (tareasDe(historia).length > 0) ids.push(historia.id);
      }
    }
    return ids;
  }, [proyecto]);

  const hayAlgoAbierto = expandidos.size > 0;
  const editable = !soloLectura;

  // --- zona de soltar: devolver una tarea del sprint al árbol ---------------
  const [sobre, setSobre] = useState(false);
  /** El panel `?`. No se recuerda entre visitas: una ayuda que se queda abierta estorba. */
  const [ayuda, setAyuda] = useState(false);

  // `?` abre la ayuda. Se escucha en la ventana y no en el árbol porque también sirve
  // desde el panel del sprint, y se calla dentro de un campo de texto: ahí `?` es texto.
  useEffect(() => {
    const escucha = (evento: KeyboardEvent) => {
      if (evento.key !== '?' || evento.metaKey || evento.ctrlKey) return;
      const destino = evento.target;
      if (destino instanceof HTMLElement) {
        const etiqueta = destino.tagName;
        if (etiqueta === 'INPUT' || etiqueta === 'TEXTAREA' || destino.isContentEditable) return;
      }
      evento.preventDefault();
      setAyuda(true);
    };
    window.addEventListener('keydown', escucha);
    return () => window.removeEventListener('keydown', escucha);
  }, []);
  const profundidad = useRef(0);
  const aceptaSoltar = editable && arrastre?.origen === 'sprint';

  const limpiarZona = () => {
    profundidad.current = 0;
    setSobre(false);
  };

  const zona = aceptaSoltar
    ? {
        onDragEnter: () => {
          profundidad.current += 1;
          setSobre(true);
        },
        onDragLeave: () => {
          profundidad.current -= 1;
          if (profundidad.current <= 0) limpiarZona();
        },
        onDragOver: (evento: React.DragEvent) => {
          if (!esArrastreDeTarea(evento.dataTransfer)) return;
          evento.preventDefault();
          evento.dataTransfer.dropEffect = 'move';
        },
        onDrop: (evento: React.DragEvent) => {
          evento.preventDefault();
          limpiarZona();
          arrastrar(null);
          const id = evento.dataTransfer.getData(TIPO_TAREA);
          // Sacar del sprint NO borra el compromiso: quién, para cuándo y qué hay que
          // hacer viven en la tarea, no en el item. Sacarla para redefinir la historia y
          // volver a meterla es el flujo normal, no un caso raro.
          if (id !== '') void acciones.sacar(id);
        },
      }
    : {};

  return (
    <>
      <section className="panel panel--arbol" aria-label={`Árbol de ${proyecto.clave}`}>
        {/* E14 · dos líneas. El título y el avance son lo que se LEE; los controles, lo
            que se pulsa. En una sola línea los tres controles empujaban el título hasta
            truncarlo ya con una clave de cinco letras, y el nombre del panel es
            justamente lo que dice en cuál de los tres estás. */}
        <header className="cab cab--doble">
          <div className="cab__linea">
            <h2 className="cab__titulo" title={proyecto.nombre}>
              Backlog de {proyecto.clave}
            </h2>
            <span className="crece" />
            <Medidor avance={avance} />
          </div>

          <div className="cab__linea cab__linea--controles">
            {!tresPaneles && dosPaneles && (
              <span className="cab__nota">Completadas ocultas por ancho</span>
            )}
            <span className="crece" />

            <button
              type="button"
              className="cab__accion"
              onClick={() => (hayAlgoAbierto ? colapsarTodo() : expandir(plegables))}
            >
              {hayAlgoAbierto ? 'Colapsar todo' : 'Expandir todo'}
            </button>

            {/* E13 · la ÚNICA captura que no cuelga de ninguna fila: una épica no tiene
                padre donde poner un `＋`. Es también la única acción con relleno sólido
                del panel — un solo primario a la vista, o no hay ninguno. */}
            <button
              type="button"
              className="cab__primario"
              disabled={!editable}
              title={
                editable
                  ? `Capturar una épica en ${proyecto.clave}`
                  : 'No se puede capturar en modo solo lectura.'
              }
              onClick={() => redactar({ tipo: 'capturar', clase: 'epica', padreId: proyecto.clave })}
            >
              <Mas /> Nueva épica
            </button>
          </div>
        </header>


        {/* La zona de soltar es el CUERPO del backlog, nunca el panel de completadas. */}
        <div className={`zona-arbol${sobre ? ' zona-arbol--soltar' : ''}`} {...zona}>
          <Arbol
            proyecto={proyecto}
            sprint={sprint}
            hoy={hoy}
            etiqueta={`Backlog de ${proyecto.nombre}`}
            editable={editable}
          />
        </div>

        <PieEdicion
          documento={documento}
          proyecto={proyecto}
          sprint={sprint}
          hoy={hoy}
          dosPaneles={dosPaneles}
        />

        <Leyenda editable={editable} abrirAyuda={() => setAyuda(true)} />
        {ayuda && <PanelAyuda cerrar={() => setAyuda(false)} />}
      </section>

      <PanelCompletadas proyecto={proyecto} sprint={sprint} hoy={hoy} avance={avance} />

      <PanelSprint
        documento={documento}
        sprint={sprint}
        clave={proyecto.clave}
        hoy={hoy}
        editable={!soloLectura}
        dosPaneles={dosPaneles}
      />

      {/* El detalle es modal y queda fuera de las celdas de los tres paneles. */}
      {detalle !== null && (
        <HojaDetalle
          // Remontar al cambiar de nodo. Sin la `key`, React reutiliza la instancia y con
          // ella el `useState` local del editor de descripción: abrir la tarea B después
          // de haber empezado a escribir en la A enseñaría el texto de la A dentro de la
          // B, y guardarlo lo escribiría en la B. Es la vía más corta a perder una nota.
          key={detalle.id}
          documento={documento}
          proyecto={proyecto}
          sprint={sprint}
          hoy={hoy}
          detalle={detalle}
          indice={indice}
          // En solo lectura se conserva toda la lectura y se apaga la escritura.
          editable={editable}
          cerrar={() => {
            verDetalle(null);
            // El foco vuelve a la fila de la que salió: sin esto se queda en el `body` y
            // la siguiente flecha no tiene sobre qué actuar.
            irANodo(detalle.id);
          }}
        />
      )}
    </>
  );
}
