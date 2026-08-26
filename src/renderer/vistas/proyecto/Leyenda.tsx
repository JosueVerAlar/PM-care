/**
 * La leyenda al pie del árbol.
 *
 * Existe porque los tres canales visuales solo funcionan si se sabe leerlos, y porque el
 * color de estado nunca viaja solo: aquí cada glifo aparece con su nombre. La nota final
 * dice en una línea las dos cosas que más se malinterpretan del tablero — que el bloqueo
 * es bandera y no estado, y que las canceladas no entran en ningún denominador.
 */

import { ChipNeutro } from '../../componentes/Chips';
import { CuadroBloqueo, Glifo, type FormaEstado } from '../../componentes/iconos';

const ESTADOS: { forma: FormaEstado; etiqueta: string }[] = [
  { forma: 'pendiente', etiqueta: 'Pendiente' },
  { forma: 'curso', etiqueta: 'En curso' },
  { forma: 'hecha', etiqueta: 'Hecha' },
  { forma: 'cancelada', etiqueta: 'Cancelada' },
  { forma: 'sindesglosar', etiqueta: 'Sin desglosar' },
];

export function Leyenda() {
  return (
    <footer className="leyenda" aria-label="Leyenda">
      {ESTADOS.map(({ forma, etiqueta }) => (
        <span className="leyenda__item" key={forma}>
          <Glifo forma={forma} etiqueta={etiqueta} />
          <span aria-hidden="true">{etiqueta}</span>
        </span>
      ))}
      <span className="leyenda__item">
        <span className="leyenda__banda" aria-hidden="true" />
        No planeado
      </span>
      <span className="leyenda__item">
        <span className="chip chip--bloqueo">
          <CuadroBloqueo />
          Bloqueada
        </span>
      </span>
      <span className="leyenda__item">
        <ChipNeutro texto="en el sprint" />
      </span>
      <span className="leyenda__nota">
        El bloqueo es bandera, no estado: la tarea conserva su glifo. Los contenedores
        derivan el suyo; las canceladas no cuentan.
      </span>
    </footer>
  );
}
