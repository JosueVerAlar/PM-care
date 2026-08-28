/**
 * La vista de proyecto: dos paneles. Es el hito de E6 y el terreno de juego de E7.
 *
 * Izquierda, el árbol de tres niveles con su leyenda. Derecha, el sprint activo filtrado
 * a este proyecto. «Terminadas» es una PESTAÑA de este panel, no un tercer panel: bajo
 * 1040 px el sprint ya no cabe y un tercero no cabría nunca.
 *
 * La vista no calcula: pide `avanceDeProyecto` y `sprintActivo` al dominio y reparte.
 *
 * ## Las dos zonas de soltar, y la que a propósito no existe
 *
 * - **Árbol → sprint**: comprometer. Lo maneja `PanelSprint`.
 * - **Sprint → árbol**: sacar del sprint conservando lo escrito. Se maneja aquí, y la
 *   zona es el CUERPO del árbol, no la sección entera.
 * - **Sobre «Terminadas», nada.** La pestaña vive en la cabecera del panel, que queda
 *   fuera de la zona; y con la pestaña activa el cuerpo tampoco acepta nada. Dar algo
 *   por terminado exige pasar por el estado de la tarea, no por un resbalón del ratón:
 *   ni se suelta ni se ilumina.
 */

import { useMemo, useRef, useState } from 'react';

import { avanceDeProyecto, sprintActivo, tareasDe } from '../../../compartido/dominio/derivar';
import { estaHecha } from '../../../compartido/dominio/clasificar';
import type { Documento, Fecha, Proyecto } from '../../../compartido/modelo/tipos';
import { Mas } from '../../componentes/iconos';
import { Medidor } from '../../componentes/Medidor';

import { useAccionesSprint } from '../../estado/acciones-sprint';
import { useAccionesInterfaz, useInterfaz } from '../../estado/interfaz';
import { useSoloLectura } from '../../estado/mutaciones';
import { esArrastreDeTarea, TIPO_TAREA } from '../../util/arrastre';
import { useDosPaneles } from '../../util/medios';
import { Arbol } from './Arbol';
import { Leyenda } from './Leyenda';
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
  const { expandidos, pestana, soloEsteProyecto, arrastre } = useInterfaz();
  const { expandir, colapsarTodo, cambiarPestana, cambiarAlcanceSprint, arrastrar, redactar } =
    useAccionesInterfaz();

  const soloLectura = useSoloLectura();
  const dosPaneles = useDosPaneles();

  const sprint = useMemo(() => sprintActivo(documento), [documento]);
  const avance = useMemo(() => avanceDeProyecto(proyecto), [proyecto]);
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
  // La pestaña «Terminadas» es un registro de lo que pasó, no un sitio donde se opera.
  const editable = !soloLectura && pestana === 'backlog';

  // --- zona de soltar: devolver una tarea del sprint al árbol ---------------
  const [sobre, setSobre] = useState(false);
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
        <header className="cab">
          <h2 className="cab__titulo" title={proyecto.nombre}>
            {pestana === 'backlog' ? 'Backlog' : 'Terminadas'} de {proyecto.clave}
          </h2>
          <span className="crece" />

          <div className="alternador" role="group" aria-label="Qué se muestra del árbol">
            <button
              type="button"
              aria-pressed={pestana === 'backlog'}
              onClick={() => cambiarPestana('backlog')}
            >
              En backlog
            </button>
            <button
              type="button"
              aria-pressed={pestana === 'terminadas'}
              onClick={() => cambiarPestana('terminadas')}
            >
              Terminadas
            </button>
          </div>

          <Medidor avance={avance} />

          <button
            type="button"
            className="cab__accion"
            onClick={() => (hayAlgoAbierto ? colapsarTodo() : expandir(plegables))}
          >
            {hayAlgoAbierto ? 'Colapsar todo' : 'Expandir todo'}
          </button>

          {/* E13 · la ÚNICA captura que no cuelga de ninguna fila: una épica no tiene
              padre donde poner un `＋`. Es también la única acción con relleno sólido del
              panel — un solo primario a la vista, o no hay ninguno. */}
          <button
            type="button"
            className="cab__primario"
            disabled={!editable}
            title={
              editable
                ? `Capturar una épica en ${proyecto.clave}`
                : 'Aquí no se captura: la pestaña Terminadas es un registro, y en solo lectura no se escribe.'
            }
            onClick={() => redactar({ tipo: 'capturar', clase: 'epica', padreId: proyecto.clave })}
          >
            <Mas /> Nueva épica
          </button>
        </header>


        {/* La zona de soltar es el CUERPO, no la sección: así la pestaña «Terminadas»,
            que vive en la cabecera, nunca es un destino. */}
        <div className={`zona-arbol${sobre ? ' zona-arbol--soltar' : ''}`} {...zona}>
          <Arbol
            proyecto={proyecto}
            sprint={sprint}
            hoy={hoy}
            // `estaHecha` es una función importada: su identidad no cambia entre renders,
            // así que el `useMemo` del árbol no se invalida en cada tecla.
            {...(pestana === 'terminadas' ? { predicado: estaHecha } : {})}
            etiqueta={`${pestana === 'backlog' ? 'Backlog' : 'Tareas terminadas'} de ${proyecto.nombre}`}
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

        <Leyenda editable={editable} />
      </section>

      <PanelSprint
        documento={documento}
        sprint={sprint}
        clave={proyecto.clave}
        soloEsteProyecto={soloEsteProyecto}
        cambiarAlcance={cambiarAlcanceSprint}
        hoy={hoy}
        editable={!soloLectura}
        dosPaneles={dosPaneles}
      />
    </>
  );
}
