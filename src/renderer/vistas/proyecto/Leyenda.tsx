/**
 * La leyenda al pie del árbol.
 *
 * Existe porque los tres canales visuales solo funcionan si se sabe leerlos, y porque el
 * color de estado nunca viaja solo: aquí cada glifo aparece con su nombre. La nota final
 * dice en una línea las dos cosas que más se malinterpretan del tablero — que el bloqueo
 * es bandera y no estado, y que las canceladas no entran en ningún denominador.
 *
 * Desde E7 lleva además la fila de atajos. No es adorno ni ayuda opcional: `S` es la vía
 * PRINCIPAL para comprometer una tarea —y la única cuando la ventana es angosta y el
 * panel del sprint no se pinta—, así que tiene que estar a la vista de quien todavía no
 * lo sabe. Se oculta en la pestaña «Terminadas», donde ninguno de esos atajos aplica.
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

const ATAJOS: { tecla: string; que: string }[] = [
  { tecla: 'S', que: 'al sprint' },
  { tecla: 'Espacio', que: 'estado' },
  { tecla: 'Enter', que: 'renombrar' },
  { tecla: 'N', que: 'capturar' },
  { tecla: 'B', que: 'bloqueo' },
  { tecla: 'C', que: 'cancelar' },
  { tecla: '⌫', que: 'eliminar' },
  { tecla: '⌘Z', que: 'deshacer' },
];

export function Leyenda({ editable }: { editable: boolean }) {
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

      {editable && (
        <p className="leyenda__atajos" aria-label="Atajos de teclado sobre la fila enfocada">
          {ATAJOS.map(({ tecla, que }) => (
            <span className="leyenda__atajo" key={tecla}>
              <kbd>{tecla}</kbd> {que}
            </span>
          ))}
        </p>
      )}

      <span className="leyenda__nota">
        El bloqueo es bandera, no estado: la tarea conserva su glifo. Los contenedores
        derivan el suyo; las canceladas no cuentan.
      </span>
    </footer>
  );
}
