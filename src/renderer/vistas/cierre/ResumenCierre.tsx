/**
 * E8 — el final del cierre. **Cerrar y planear son dos actos.**
 *
 * El cierre termina aquí, en una frase que dice qué pasó, y no encadena la planeación del
 * sprint siguiente. Si el cierre desembocara directo en el tablero del sprint nuevo, la
 * ceremonia no tendría final: el usuario que solo quería cerrar se encontraría planeando,
 * y el que quería planear no sabría si el cierre llegó a guardarse.
 *
 * Todo lo que se dice sale del documento POSTERIOR al cierre (`resumenTrasCierre`), no de
 * lo que mandamos. Si el reductor hizo algo distinto de lo que pedimos, el resumen lo
 * cuenta en vez de repetirle al usuario su propia intención.
 *
 * Deshacer: la pila vive en el proceso principal y `⌘Z` revierte el cierre ENTERO, que
 * era un solo comando. En cuanto el sprint deja de estar cerrado, `VistaCierre` vuelve
 * sola a la pantalla de decisiones — este componente no guarda ninguna copia del estado
 * que pudiera quedarse desincronizada.
 */

import { resumenTrasCierre } from '../../../compartido/dominio/cierre';
import type { Documento } from '../../../compartido/modelo/tipos';
import { useAccionesAlmacen } from '../../estado/almacen';
import { useAccionesInterfaz } from '../../estado/interfaz';
import { useMutar, usePuedeDeshacer, useSoloLectura } from '../../estado/mutaciones';
import { fechaCorta } from '../../util/presentacion';

/** «1 tarea» / «9 tareas». Sin el singular roto que delata una plantilla. */
function tareas(n: number): string {
  return n === 1 ? '1 tarea' : `${n} tareas`;
}

function Cuenta({ etiqueta, n, siempre = false }: { etiqueta: string; n: number; siempre?: boolean }) {
  if (n === 0 && !siempre) return null;
  return (
    <div>
      <dt>{etiqueta}</dt>
      <dd className="tabular">{n}</dd>
    </div>
  );
}

export function ResumenCierre({ documento, sprintId }: { documento: Documento; sprintId: string }) {
  const { salirDelCierre, avisar } = useAccionesInterfaz();
  const { deshacer } = useAccionesAlmacen();
  const puedeDeshacer = usePuedeDeshacer();
  const soloLectura = useSoloLectura();
  const mutar = useMutar();

  const resumen = resumenTrasCierre(documento, sprintId);
  if (resumen === null) return null; // `VistaCierre` ya decidió que este sprint está cerrado

  const { sprint, completadas, arrastradas, devueltas, descartadas, canceladas, sinDecidir } =
    resumen;
  const { destino, pasaron } = resumen;

  /**
   * Planear es el acto siguiente, y lo pide el usuario. Si el sprint destino todavía está
   * `planeado` hay que activarlo, y el botón lo DICE: la app no activa sprints por su
   * cuenta al cerrar otro.
   */
  const planear = () => {
    if (destino === undefined) return;
    void (async () => {
      if (destino.estado === 'planeado') {
        const ok = await mutar(
          { comando: 'activarSprint', sprintId: destino.id },
          `Activar ${destino.nombre}`,
        );
        if (!ok) return;
      }
      // Al tablero: la planeación se hace arrastrando en la vista de proyecto, que es
      // donde ya vive. Esta pantalla no duplica ese trabajo.
      salirDelCierre();
    })();
  };

  return (
    <section className="panel panel--cierre" aria-label={`${sprint.nombre} cerrado`}>
      <header className="cab">
        <h2 className="cab__titulo">
          {sprint.nombre} cerrado · {fechaCorta(sprint.inicio)}–{fechaCorta(sprint.fin)}
        </h2>
        <span className="crece" />
        <button type="button" className="cab__accion" onClick={salirDelCierre}>
          Volver
        </button>
      </header>

      <div className="cierre-hecho">
        <p className="cierre-hecho__titulo">
          {sprint.nombre} cerrado. {tareas(completadas)} al registro
          {destino !== undefined && pasaron > 0
            ? `, ${pasaron} ${pasaron === 1 ? 'pasó' : 'pasaron'} a ${destino.nombre}`
            : arrastradas > 0
              ? `, ${tareas(arrastradas)} arrastrada${arrastradas === 1 ? '' : 's'}`
              : ''}
          .
        </p>

        {/* Un desenlace por columna, con su conteo crudo y sin porcentajes (regla 4).
            Los montones que están en cero no se pintan: una fila de ceros entrena a no
            mirar la fila, y entonces el 3 tampoco se ve. Las completadas y las que pasan
            van siempre, aunque sean cero: son las dos cifras de las que trata el cierre. */}
        <dl className="cierre-hecho__cuentas">
          <Cuenta etiqueta="Completadas" n={completadas} siempre />
          <Cuenta etiqueta={destino ? `A ${destino.nombre}` : 'Arrastradas'} n={arrastradas} siempre />
          <Cuenta etiqueta="Al backlog" n={devueltas} />
          <Cuenta etiqueta="Ya no aplican" n={descartadas} />
          <Cuenta etiqueta="Ya canceladas" n={canceladas} />
          <Cuenta etiqueta="Sin decidir (cierre viejo)" n={sinDecidir} />
        </dl>

        <p className="cierre-hecho__nota">
          {sprint.nombre} es inmutable a partir de ahora: sus desenlaces, responsables y
          fechas quedaron congelados y ningún comando los toca.{' '}
          {arrastradas > 0 && pasaron !== arrastradas
            ? `Ojo: el sprint registra ${arrastradas} arrastradas pero solo ${pasaron} aparecen en el destino.`
            : arrastradas === 0
              ? 'Nada pasó al siguiente sprint, así que no se creó ninguno.'
              : ''}
          {descartadas > 0 &&
            ` ${descartadas === 1 ? 'La tarea de «ya no aplica» quedó cancelada y sale' : `Las ${descartadas} tareas de «ya no aplica» quedaron canceladas y salen`} de todos los conteos; un cambio de estado lo revierte si hiciera falta.`}
        </p>

        <div className="cierre-hecho__acciones">
          {destino !== undefined && (
            <button
              type="button"
              className="boton-solido"
              disabled={soloLectura}
              onClick={planear}
              title="Cerrar y planear son dos actos: este es el segundo, y lo pides tú."
            >
              {destino.estado === 'planeado'
                ? `Activar ${destino.nombre} y planearlo`
                : `Ir a planear ${destino.nombre}`}
            </button>
          )}
          <button type="button" className="boton-texto" onClick={salirDelCierre}>
            Ahora no
          </button>
          <span className="crece" />
          <button
            type="button"
            className="boton-texto"
            disabled={!puedeDeshacer || soloLectura}
            title={
              puedeDeshacer
                ? 'El cierre fue un solo comando: esto revierte el cierre entero, no una tarea.'
                : 'No hay nada que deshacer. La pila se vacía si el archivo cambia por fuera.'
            }
            onClick={() =>
              void (async () => {
                const respuesta = await deshacer();
                if (!respuesta.ok) avisar(`Deshacer el cierre: ${respuesta.mensaje}`);
                else avisar(null);
              })()
            }
          >
            Deshacer el cierre
          </button>
        </div>
      </div>
    </section>
  );
}
