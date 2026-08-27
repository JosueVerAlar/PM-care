/**
 * La leyenda al pie del árbol.
 *
 * Existe porque los tres canales visuales solo funcionan si se sabe leerlos, y porque el
 * color de estado nunca viaja solo: aquí cada glifo aparece con su nombre.
 *
 * Lleva además la fila de atajos. No es adorno ni ayuda opcional: es lo único que dice
 * qué tecla hace qué, y el usuario pidió expresamente conservarlo. Se oculta en la
 * pestaña «Terminadas», donde ninguno de esos atajos aplica.
 *
 * ## E13 — lo que se fue
 *
 * Los dos renglones de nota que explicaban el MODELO —que el bloqueo es bandera y no
 * estado, que las canceladas no cuentan, que se arrastra por el texto y por el asa—. Las
 * dos primeras son reglas del producto y no cambian por leerlas cada día; la tercera hacía
 * falta solo porque el asa estaba escondida, y ahora se ve. Un texto se queda si nombra un
 * control o una tecla; se va si explica una regla.
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
  // El equivalente por teclado del arrastre por el asa. Va en la leyenda por lo mismo que
  // `S`: el asa solo se ve al pasar por encima, y en ventana angosta arrastrar no es una
  // opción cómoda. Quien no descubra el asa tiene que poder reordenar igual.
  { tecla: '⌥↑↓', que: 'reordenar' },
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

    </footer>

  );
}
