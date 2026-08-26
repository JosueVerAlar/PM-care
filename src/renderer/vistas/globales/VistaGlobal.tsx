/**
 * El enrutador de las vistas globales.
 *
 * Seis de las siete están construidas (E9, E10 y E11). La séptima —el Sprint global,
 * transversal a los proyectos— no entraba en el alcance de estas tres etapas y sigue
 * siendo un marcador de posición **honesto**: dice qué pregunta va a contestar y el único
 * número que ya se sostiene, el que sale del mismo selector que usará la vista de verdad. No hay tabla simulada ni gráfica
 * de mentira: una pantalla que finge estar hecha se descubre tarde y cuesta más que una
 * que dice que falta.
 */

import { conteoDeVistaGlobal } from '../../armazon/BarraLateral';
import type { Documento, Fecha } from '../../../compartido/modelo/tipos';
import type { IdVistaGlobal } from '../../estado/interfaz';
import { entradaGlobal } from './registro';
import { VistaBacklog } from './VistaBacklog';
import { VistaBloqueos } from './VistaBloqueos';
import { VistaCarga } from './VistaCarga';
import { VistaEquipos } from './VistaEquipos';
import { VistaPanorama } from './VistaPanorama';
import { VistaTerminadas } from './VistaTerminadas';

export function VistaGlobal({
  id,
  documento,
  hoy,
}: {
  id: IdVistaGlobal;
  documento: Documento;
  hoy: Fecha;
}) {
  switch (id) {
    case 'panorama':
      return <VistaPanorama documento={documento} hoy={hoy} />;
    case 'bloqueos':
      return <VistaBloqueos documento={documento} hoy={hoy} />;
    case 'terminadas':
      return <VistaTerminadas documento={documento} />;
    case 'backlog':
      return <VistaBacklog documento={documento} hoy={hoy} />;
    case 'carga':
      return <VistaCarga documento={documento} hoy={hoy} />;
    case 'equipos':
      return <VistaEquipos documento={documento} />;
    case 'sprint':
      return <PorConstruir id={id} documento={documento} />;
  }
}

/** Cómo se lee el único número que la vista pendiente ya puede sostener. */
const UNIDAD: Partial<Record<IdVistaGlobal, (n: number) => string>> = {
  sprint: (n) => `${n} tarea${n === 1 ? '' : 's'} comprometida${n === 1 ? '' : 's'} en el sprint activo`,
};

function PorConstruir({ id, documento }: { id: IdVistaGlobal; documento: Documento }) {
  const entrada = entradaGlobal(id);
  const n = conteoDeVistaGlobal(documento, id);
  const unidad = UNIDAD[id];

  return (
    <section className="panel panel--global" aria-label={entrada.texto}>
      <header className="cab">
        <h2 className="cab__titulo">{entrada.texto}</h2>
      </header>
      <div className="vacio">
        <p className="vacio__titulo">Esta vista todavía no está construida</p>
        <p className="vacio__nota">{entrada.pregunta}</p>
        {n !== null && unidad !== undefined && (
          <p className="vacio__dato tabular">
            Lo único que ya se puede decir con los datos de hoy: <strong>{unidad(n)}</strong>.
          </p>
        )}
        <p className="vacio__nota">
          Mientras tanto, el sprint filtrado a un proyecto sí está: ábrelo desde cualquier
          proyecto de la barra lateral, en el panel derecho.
        </p>
        {/* No se inventa una etapa: el plan asigna el cierre de sprint a E8 y las seis
            vistas de E9–E11, pero el sprint TRANSVERSAL no tiene etapa propia. Se dice
            así en vez de prometer una fecha que nadie acordó. */}
        <p className="vacio__etapa">
          El sprint transversal a los once proyectos todavía no tiene etapa asignada en{' '}
          <code>docs/PLAN.md</code>.
        </p>
      </div>
    </section>
  );
}
