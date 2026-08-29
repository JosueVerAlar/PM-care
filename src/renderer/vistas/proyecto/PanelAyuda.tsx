/**
 * El panel `?` — la única puerta a lo que la pantalla no dice sola.
 *
 * Nace de una queja concreta: «hay muchos comentarios en la app, quítalos y solo deja lo
 * explicativo; qué teclas hacen qué acción». La poda de texto permanente dejó fuera cosas
 * que sí hacían falta a veces, y esto es donde viven — **a petición, no todos los días**.
 *
 * ## Por qué el atajo se queda aquí y no en el pie
 *
 * La lista de atajos vivía en la leyenda: nueve teclas que hay que leer enteras para
 * encontrar una, en un pie que se mira una vez y nunca más. Desde que existe el menú `⋯`
 * de cada fila, cada tecla aparece **al lado de la acción que ejecuta**, que es donde se
 * aprende sin buscarla. Lo que queda aquí es la referencia completa para quien la quiera
 * de golpe, y una segunda sección que la leyenda no podía dar: cómo se LEE el árbol.
 *
 * Se abre con `?` y se cierra con `Escape` o pulsando fuera. No hay estado que guardar: un
 * panel de ayuda que recuerda si estaba abierto es un panel de ayuda que estorba.
 */

import { useEffect, useRef } from 'react';

interface Atajo {
  tecla: string;
  que: string;
}

const SOBRE_LA_FILA: readonly Atajo[] = [
  { tecla: 'Espacio', que: 'Cambia el estado de la tarea. Sobre un contenedor, lo pliega.' },
  { tecla: 'S', que: 'Manda la tarea al sprint. Sobre una historia, manda las suyas en lote.' },
  { tecla: 'N', que: 'Captura dentro de esta fila.' },
  { tecla: 'F2', que: 'Renombra. Enter también, sobre una tarea.' },
  { tecla: 'B', que: 'Pone o quita la bandera de bloqueo.' },
  { tecla: 'C', que: 'Cancela la tarea, o la revive.' },
  { tecla: '⌫', que: 'Elimina.' },
];

const MOVERSE: readonly Atajo[] = [
  { tecla: '↑ ↓', que: 'Fila anterior y siguiente.' },
  { tecla: '← →', que: 'Plegar y desplegar. Sobre una fila abierta, → entra.' },
  { tecla: 'Inicio · Fin', que: 'Primera y última fila.' },
  { tecla: '⌥↑ ⌥↓', que: 'Sube o baja la fila entre sus hermanas.' },
  { tecla: '⌥Inicio · ⌥Fin', que: 'La manda al extremo.' },
  { tecla: '⌘Z', que: 'Deshace lo último. Dentro de un campo de texto deshace el texto.' },
];

/**
 * Cómo se lee el árbol. Son las reglas del producto que el color no puede decir solo, y
 * las que más se preguntan al volver después de una semana.
 */
const COMO_SE_LEE: readonly { que: string; dice: string }[] = [
  {
    que: 'Sin desglosar',
    dice: 'El contenedor no tiene nada debajo. No es 0 %: es que nadie lo ha abierto todavía, y no se sabe si falta una tarea o veinte.',
  },
  {
    que: 'Verde',
    dice: 'Todas sus tareas contables cerraron Y no queda nada sin desglosar. Nunca sale de que un porcentaje redondee a 100.',
  },
  {
    que: 'Banda amarilla',
    dice: 'Procedencia, no estado: se capturó después de cerrar la planeación del proyecto. Convive con cualquier estado.',
  },
  {
    que: 'Bloqueada',
    dice: 'Es una bandera, no un estado. La tarea conserva el suyo —pendiente o en curso— para saber a qué volver al destrabarla.',
  },
  {
    que: 'Canceladas',
    dice: 'Salen de todos los denominadores. Una historia con dos canceladas sí se desglosó: se desglosó y se descartó el trabajo.',
  },
  {
    que: 'El porcentaje',
    dice: 'Sale de contar tareas, nunca de promediar hijos, y siempre viene con su conteo crudo al lado. Con menos de cinco tareas solo va el conteo.',
  },
];

export function PanelAyuda({ cerrar }: { cerrar: () => void }) {
  const dialogo = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // El foco entra al panel: sin esto, `Escape` no llega y quien navega con teclado
    // abriría una ayuda que no puede ni leer ni cerrar.
    dialogo.current?.focus();
  }, []);

  return (
    <div
      className="capa-ayuda"
      // Pulsar fuera cierra. Es ayuda, no un formulario: no hay nada que perder al salir.
      onClick={cerrar}
    >
      <div
        ref={dialogo}
        className="ayuda"
        role="dialog"
        aria-modal="true"
        aria-label="Cómo se usa y cómo se lee"
        tabIndex={-1}
        onClick={(evento) => evento.stopPropagation()}
        onKeyDown={(evento) => {
          if (evento.key === 'Escape') {
            evento.stopPropagation();
            cerrar();
          }
        }}
      >
        <header className="ayuda__cab">
          <h2 className="ayuda__titulo">Cómo se usa</h2>
          <button type="button" className="boton-texto" onClick={cerrar}>
            Cerrar
          </button>
        </header>

        <div className="ayuda__cuerpo">
          <section className="ayuda__seccion">
            <h3 className="ayuda__sub">Sobre la fila con el foco</h3>
            <dl className="ayuda__lista">
              {SOBRE_LA_FILA.map(({ tecla, que }) => (
                <div className="ayuda__par" key={tecla}>
                  <dt>
                    <kbd>{tecla}</kbd>
                  </dt>
                  <dd>{que}</dd>
                </div>
              ))}
            </dl>
            <p className="ayuda__nota">
              Todas están también en el menú <span aria-hidden="true">⋯</span> de cada fila,
              al lado de lo que hacen.
            </p>
            {/* `D` va aparte y no en la lista de arriba: esa lista promete estar entera
                en el `⋯`, y el detalle NO está ahí — ese menú ya llega a los ocho ítems
                que la regla 19 pone de techo. Prometerlo sería mentir en pantalla. */}
            <p className="ayuda__nota">
              <kbd>D</kbd> —o un clic en el título de la fila— abre el detalle: descripción,
              criterios, bloqueos y tiempos. No está en el <span aria-hidden="true">⋯</span>.
            </p>
          </section>

          <section className="ayuda__seccion">
            <h3 className="ayuda__sub">Moverse</h3>
            <dl className="ayuda__lista">
              {MOVERSE.map(({ tecla, que }) => (
                <div className="ayuda__par" key={tecla}>
                  <dt>
                    <kbd>{tecla}</kbd>
                  </dt>
                  <dd>{que}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section className="ayuda__seccion ayuda__seccion--ancha">
            <h3 className="ayuda__sub">Cómo se lee</h3>
            <dl className="ayuda__lista">
              {COMO_SE_LEE.map(({ que, dice }) => (
                <div className="ayuda__par" key={que}>
                  <dt className="ayuda__que">{que}</dt>
                  <dd>{dice}</dd>
                </div>
              ))}
            </dl>
          </section>
        </div>
      </div>
    </div>
  );
}
