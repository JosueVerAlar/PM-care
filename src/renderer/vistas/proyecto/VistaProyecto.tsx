/**
 * La vista de proyecto: dos paneles. Es el hito de E6.
 *
 * Izquierda, el árbol de tres niveles con su leyenda. Derecha, el sprint activo filtrado
 * a este proyecto. «Terminadas» es una PESTAÑA de este panel, no un tercer panel: bajo
 * 1040 px el sprint ya no cabe y un tercero no cabría nunca.
 *
 * La vista no calcula: pide `avanceDeProyecto` y `sprintActivo` al dominio y reparte.
 */

import { useMemo } from 'react';

import { avanceDeProyecto, sprintActivo } from '../../../compartido/dominio/derivar';
import { estaHecha } from '../../../compartido/dominio/clasificar';
import type { Documento, Fecha, Proyecto } from '../../../compartido/modelo/tipos';
import { Medidor } from '../../componentes/Medidor';
import { useAccionesInterfaz, useInterfaz } from '../../estado/interfaz';
import { Arbol } from './Arbol';
import { Leyenda } from './Leyenda';
import { PanelSprint } from './PanelSprint';

export function VistaProyecto({
  documento,
  proyecto,
  hoy,
}: {
  documento: Documento;
  proyecto: Proyecto;
  hoy: Fecha;
}) {
  const { expandidos, pestana, soloEsteProyecto } = useInterfaz();
  const { alternarNodo, expandir, colapsarTodo, cambiarPestana, cambiarAlcanceSprint } =
    useAccionesInterfaz();

  const sprint = useMemo(() => sprintActivo(documento), [documento]);
  const avance = useMemo(() => avanceDeProyecto(proyecto), [proyecto]);

  /** Ids de todo lo que se puede abrir. Sirve para el botón «Expandir todo». */
  const plegables = useMemo(() => {
    const ids: string[] = [];
    for (const epica of proyecto.epicas) {
      if (epica.historias.length === 0) continue;
      ids.push(epica.id);
      for (const historia of epica.historias) {
        if (historia.tareas.length > 0) ids.push(historia.id);
      }
    }
    return ids;
  }, [proyecto]);

  const hayAlgoAbierto = expandidos.size > 0;

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
        </header>

        <Arbol
          proyecto={proyecto}
          sprint={sprint}
          hoy={hoy}
          expandidos={expandidos}
          alternar={alternarNodo}
          // `estaHecha` es una función importada: su identidad no cambia entre renders,
          // así que el `useMemo` del árbol no se invalida en cada tecla.
          {...(pestana === 'terminadas' ? { predicado: estaHecha } : {})}
          etiqueta={`${pestana === 'backlog' ? 'Backlog' : 'Tareas terminadas'} de ${proyecto.nombre}`}
        />

        <Leyenda />
      </section>

      <PanelSprint
        documento={documento}
        sprint={sprint}
        clave={proyecto.clave}
        soloEsteProyecto={soloEsteProyecto}
        cambiarAlcance={cambiarAlcanceSprint}
        hoy={hoy}
      />
    </>
  );
}
