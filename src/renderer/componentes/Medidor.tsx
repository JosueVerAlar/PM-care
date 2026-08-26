/**
 * El medidor de avance. Es el componente donde se cumplen o se rompen las reglas 2 y 3.
 *
 *   - Contenedor sin tareas contables -> «sin desglosar». Nunca `0 %`, nunca `NaN`.
 *   - Ningún porcentaje sin su conteo crudo al lado. La barra ES la representación del
 *     porcentaje, y siempre lleva el `hechas/hojas` pegado a la derecha.
 *   - Sin barra por debajo del mínimo de tareas: lo decide `mostrarPct`, no esta vista.
 *
 * Todo el cálculo llega ya hecho en un `Avance` de `compartido/dominio/derivar.ts`. Este
 * archivo no suma, no divide y no redondea.
 */

import { mostrarPct, type Avance } from '../../compartido/dominio/derivar';

function descripcion(avance: Avance): string {
  const base = `${avance.hechas} de ${avance.hojas} tareas hechas`;
  const pct = avance.pct === null ? '' : ` (${avance.pct} %)`;
  const canceladas =
    avance.canceladas > 0
      ? ` · ${avance.canceladas} cancelada${avance.canceladas === 1 ? '' : 's'}, fuera del conteo`
      : '';
  return base + pct + canceladas;
}

/**
 * Texto del caso vacío. Se distingue «nunca se desglosó» de «todo lo que había se
 * canceló»: `derivar` da `hojas === 0` en ambos, pero decirle «sin desglosar» a una
 * historia cuyas tres tareas se cancelaron es mentira.
 */
function textoVacio(avance: Avance): string {
  if (avance.canceladas === 0) return 'sin desglosar';
  return avance.canceladas === 1 ? '1 cancelada' : `${avance.canceladas} canceladas`;
}

export interface PropsMedidor {
  avance: Avance;
  /**
   * `false` en las historias: su columna solo lleva el conteo. La barra se reserva para
   * el nivel de épica y los resúmenes, donde el agregado es grande y significa algo.
   */
  conBarra?: boolean;
}

export function Medidor({ avance, conBarra = true }: PropsMedidor) {
  if (avance.hojas === 0) {
    return (
      <span className="sin-desglosar" title={`Sin tareas contables. ${descripcion(avance)}`}>
        {textoVacio(avance)}
      </span>
    );
  }

  const conteo = `${avance.hechas}/${avance.hojas}`;

  if (!conBarra || !mostrarPct(avance)) {
    return (
      <span className="conteo-solo" title={descripcion(avance)}>
        {conteo}
      </span>
    );
  }

  return (
    <span className="medidor" title={descripcion(avance)}>
      <span className="medidor__pista">
        <span className="medidor__relleno" style={{ width: `${avance.pct ?? 0}%` }} />
      </span>
      <span className="medidor__conteo">{conteo}</span>
    </span>
  );
}
