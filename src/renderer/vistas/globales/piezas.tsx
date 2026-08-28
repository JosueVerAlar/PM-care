/**
 * Las piezas que comparten las seis vistas globales.
 *
 * Existen por la razón de siempre: la causa número uno de un frontend inmantenible es el
 * séptimo botón. Bloqueos, Terminadas y Backlog agrupan y pliegan lo mismo; las seis
 * tienen cabecera, regla de orden, nota al pie y estado vacío. Escrito una vez, se corrige
 * una vez.
 *
 * **Ninguna de estas piezas calcula nada** (regla 1): reciben datos ya derivados de
 * `compartido/dominio/` y solo deciden marcas y clases.
 */

import { useId, type ReactNode } from 'react';

import { rutaDe, type UbicacionTarea } from '../../../compartido/dominio/derivar';
import { Chevron } from '../../componentes/iconos';
import { useAccionesInterfaz } from '../../estado/interfaz';

/** El panel de una vista global: ocupa el ancho de los dos paneles de proyecto. */
export function PanelGlobal({ etiqueta, children }: { etiqueta: string; children: ReactNode }) {
  return (
    <section className="panel panel--global" aria-label={etiqueta}>
      {children}
    </section>
  );
}

/**
 * La franja que dice el orden, en una frase corta.
 *
 * No es decoración: un orden que nadie explica confunde más que el alfabético, porque el
 * usuario supone que es alfabético y concluye que la app está rota.
 *
 * E13 — sobrevive en las DOS vistas donde el orden es información: Panorama, donde lo
 * elige un selector y cambia, y Bloqueos, donde el orden ES el dato. En las otras tres
 * describía una convención evidente y se borró. Las cifras que llevaba dentro no se
 * perdieron: subieron a la cabecera, donde son dato y no prosa.
 *
 * `NotaPie` vivía aquí al lado y ya no existe: diez párrafos permanentes explicando el
 * modelo a quien inventó el modelo. Lo que era regla del producto está en `CLAUDE.md`; lo
 * que era ayuda de lectura se resuelve en la propia pantalla o no se resuelve.
 */
export function ReglaOrden({ children }: { children: ReactNode }) {
  return <div className="regla-orden">{children}</div>;
}


/** El cuerpo con scroll. Siempre `flex: 1` para que el pie quede anclado abajo. */
export function Lienzo({ children }: { children: ReactNode }) {
  return <div className="lienzo">{children}</div>;
}

/**
 * Estado vacío. `queHacer` es obligatorio a propósito.
 *
 * «No hay datos» es una pared: describe la pantalla, no el siguiente paso. Cada vacío de
 * esta app dice qué hacer para que deje de estarlo, y cuando ese paso está a un clic,
 * `accion` lo pone ahí mismo.
 */
export function VacioGlobal({
  titulo,
  queHacer,
  accion,
}: {
  titulo: string;
  queHacer: ReactNode;
  accion?: { texto: string; alPulsar: () => void };
}) {
  return (
    <div className="vacio">
      <p className="vacio__titulo">{titulo}</p>
      <p className="vacio__nota">{queHacer}</p>
      {accion && (
        <button type="button" className="boton" onClick={accion.alPulsar}>
          {accion.texto}
        </button>
      )}
    </div>
  );
}

/**
 * Grupo plegable con cabecera accionable.
 *
 * El contenido se DESMONTA al plegar en vez de ocultarse con CSS: en el Backlog del área,
 * que es la única vista que puede pasar de mil filas, plegar tiene que ser la salida
 * barata de verdad, y un `display: none` sobre mil filas montadas no ahorra nada.
 */
export function GrupoPlegable({
  abierto,
  alternar,
  cabecera,
  clase,
  children,
}: {
  abierto: boolean;
  alternar: () => void;
  cabecera: ReactNode;
  clase?: string;
  children: ReactNode;
}) {
  const idContenido = useId();
  return (
    <div className={clase ?? 'grupo'}>
      <button
        type="button"
        className="grupo__cab"
        aria-expanded={abierto}
        aria-controls={idContenido}
        onClick={alternar}
      >
        <Chevron abierto={abierto} vacio={false} />
        {cabecera}
      </button>
      {abierto && <div id={idContenido}>{children}</div>}
    </div>
  );
}

/**
 * Migaja de una tarea: proyecto › épica › historia.
 *
 * Con tareas de once proyectos mezcladas, el proyecto es lo primero que la vista tiene que
 * poder saltar, así que va en tinta más fuerte que el resto del camino.
 *
 * Desde N9 la migaja puede tener un solo tramo: una tarea que cuelga del proyecto no
 * inventa una épica «General» para rellenar el hueco. `rutaDe` ya omite lo que no existe.
 */
export function MigajaTarea({ ubicacion }: { ubicacion: UbicacionTarea }) {
  const [clave, ...resto] = rutaDe(ubicacion);
  const camino = [ubicacion.proyecto.nombre, ...resto].join(' › ');
  return (
    <p className="migaja" title={camino}>
      <b>{clave}</b>
      {resto.map((tramo) => ` › ${tramo}`).join('')}
    </p>
  );
}

/**
 * «Ir a la tarea»: abre el proyecto, despliega el camino y deja el foco en la fila.
 *
 * Sin esto, cada vista global sería una lista de cosas que no se pueden tocar, y el
 * usuario tendría que reconstruir a mano dónde vive cada tarea.
 */
export function BotonIrATarea({
  ubicacion,
  clase = 'mini',
  texto = 'Ir a la tarea',
}: {
  ubicacion: UbicacionTarea;
  clase?: string;
  texto?: string;
}) {
  const { irATarea } = useAccionesInterfaz();
  const { proyecto, epica, historia, tarea } = ubicacion;
  // Los nodos que hay que desplegar para llegar a ella: ninguno si cuelga del proyecto.
  const abrir = [epica?.id, historia?.id].filter((id): id is string => id !== undefined);
  return (
    <button
      type="button"
      className={clase}
      title={`Abrir ${tarea.id} en el árbol de ${proyecto.clave}`}
      onClick={() => irATarea(proyecto.clave, abrir, tarea.id)}
    >
      {texto}
    </button>
  );
}
