import { estaHecha } from '../../../compartido/dominio/clasificar';
import { tareasDeProyecto, type Avance } from '../../../compartido/dominio/derivar';
import type { Documento, Fecha, Proyecto, Sprint } from '../../../compartido/modelo/tipos';
import { Medidor } from '../../componentes/Medidor';
import { Arbol } from './Arbol';

export function PanelCompletadas({
  documento,
  proyecto,
  sprint,
  hoy,
  avance,
}: {
  documento?: Documento;
  proyecto: Proyecto;
  sprint: Sprint | undefined;
  hoy: Fecha;
  avance: Avance;
}) {
  const hayCompletadas = tareasDeProyecto(proyecto).some(estaHecha);

  return (
    <section className="panel panel--completadas" aria-label={`Completadas de ${proyecto.clave}`}>
      <header className="cab">
        <h2 className="cab__titulo">Completadas</h2>
        <span className="crece" />
        <Medidor avance={avance} />
      </header>
      {hayCompletadas ? (
        <Arbol
          documento={documento}
          proyecto={proyecto}
          sprint={sprint}
          hoy={hoy}
          predicado={estaHecha}
          etiqueta={`Tareas completadas de ${proyecto.nombre}`}
          editable={false}
        />
      ) : (
        <div className="arbol arbol--vacio">
          Nada aceptado todavía en {proyecto.clave}. Una tarea aparece aquí cuando llega a{' '}
          <em>done</em>, no cuando alguien la da por entregada.
        </div>
      )}
    </section>
  );
}
