/**
 * La leyenda al pie del árbol.
 *
 * Existe porque los tres canales visuales solo funcionan si se sabe leerlos, y porque el
 * color de estado nunca viaja solo: aquí cada glifo aparece con su nombre.
 *
 * ## Lo que se fue de aquí, y a dónde
 *
 * La fila de nueve atajos. Era lo ÚNICO que decía qué tecla hace qué, y por eso no se pudo
 * quitar antes. Ahora cada tecla aparece dentro del menú `⋯` de la fila, al lado de la
 * acción que ejecuta —que es donde se aprende sin buscarla— y la referencia completa vive
 * en el panel `?`. Una lista de nueve teclas en un pie se lee una vez y nunca más.
 *
 * Queda el glosario, que es otra cosa: los canales visuales solo funcionan si se sabe
 * leerlos, y esto es lo único que traduce un glifo a una palabra sin abrir nada.
 *
 * Antes se fueron los dos renglones que explicaban el MODELO —que el bloqueo es bandera y
 * no estado, que las canceladas no cuentan—. No desaparecieron: están en «Cómo se lee» del
 * panel `?`, que es donde se consultan cuando hacen falta en vez de leerse cada día.
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

export function Leyenda({ editable, abrirAyuda }: { editable: boolean; abrirAyuda: () => void }) {
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
        <>
          <span className="crece" />
          {/* La puerta a la ayuda se ve siempre: un panel que solo se abre con una tecla
              que nada menciona no es ayuda, es otro requisito de memoria. */}
          <button
            type="button"
            className="leyenda__ayuda"
            title="Teclas y cómo se lee el árbol (?)"
            onClick={abrirAyuda}
          >
            <span aria-hidden="true">?</span>
            <span className="solo-lectores">Teclas y cómo se lee el árbol</span>
          </button>
        </>
      )}

    </footer>

  );
}
