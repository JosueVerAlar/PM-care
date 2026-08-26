/**
 * El árbol de tres niveles: épica -> historia -> tarea.
 *
 * **Un solo componente con un predicado por panel** (PLAN, E6), nunca tres árboles
 * copiados. La pestaña «Terminadas» es este mismo árbol con `predicado = estaHecha`.
 *
 * Dos decisiones que no son obvias:
 *
 * 1. **El predicado filtra lo que se PINTA, jamás lo que se CUENTA.** El avance de una
 *    épica sale siempre de todas sus hojas (`avanceDeEpica`), aunque la pestaña esté
 *    mostrando solo las terminadas. Si el filtro entrara al denominador, «Terminadas»
 *    diría 11/11 en todas partes.
 * 2. **Se renderiza una lista PLANA de filas visibles**, no un árbol anidado. Es lo que
 *    permite que las flechas del teclado sean un `indice ± 1` en vez de un recorrido, y
 *    lo que deja la puerta abierta a virtualizar si algún proyecto crece de más. El
 *    marcado sigue siendo un árbol accesible gracias a `aria-level`, `aria-posinset` y
 *    `aria-setsize`, que es el patrón plano que ARIA admite.
 *
 * Colapsado por omisión: al abrir un proyecto solo se ven sus épicas.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  avanceDeEpica,
  avanceDeHistoria,
  estadoDerivado,
  tareasDeEpica,
  type Avance,
} from '../../../compartido/dominio/derivar';
import {
  bloqueoAbierto,
  diasBloqueada,
  estaBloqueada,
  estaEnSprint,
  mostrarProcedencia,
} from '../../../compartido/dominio/clasificar';
import type { Epica, Fecha, Historia, Proyecto, Sprint, Tarea } from '../../../compartido/modelo/tipos';
import { ChipBloqueo, ChipNeutro, ChipNuevo, ContadorBloqueos } from '../../componentes/Chips';
import { Chevron, Glifo } from '../../componentes/iconos';
import { Medidor } from '../../componentes/Medidor';
import {
  etiquetaDerivada,
  etiquetaDeTarea,
  formaDerivada,
  formaDeTarea,
} from '../../util/presentacion';

/** Una fila ya resuelta: todo lo que hace falta para pintarla, sin volver a calcular. */
type Fila =
  | {
      tipo: 'epica';
      id: string;
      nivel: 1;
      padre: null;
      posicion: number;
      hermanos: number;
      epica: Epica;
      avance: Avance;
      bloqueadas: number;
      expandible: boolean;
    }
  | {
      tipo: 'historia';
      id: string;
      nivel: 2;
      padre: string;
      posicion: number;
      hermanos: number;
      historia: Historia;
      avance: Avance;
      bloqueadas: number;
      expandible: boolean;
    }
  | {
      tipo: 'tarea';
      id: string;
      nivel: 3;
      padre: string;
      posicion: number;
      hermanos: number;
      tarea: Tarea;
      enSprint: boolean;
    };

export interface PropsArbol {
  proyecto: Proyecto;
  /** El sprint activo, para marcar qué tareas ya están comprometidas. */
  sprint: Sprint | undefined;
  hoy: Fecha;
  expandidos: ReadonlySet<string>;
  alternar: (id: string) => void;
  /** Qué tareas se pintan. Ausente = todas. Nunca afecta a los conteos. */
  predicado?: (tarea: Tarea) => boolean;
  etiqueta: string;
}

export function Arbol({
  proyecto,
  sprint,
  hoy,
  expandidos,
  alternar,
  predicado,
  etiqueta,
}: PropsArbol) {
  const filas = useMemo(
    () => construirFilas(proyecto, sprint, expandidos, predicado),
    [proyecto, sprint, expandidos, predicado],
  );

  // --- foco recorrible (roving tabindex) -----------------------------------
  // Un solo elemento del árbol es tabulable; dentro, las flechas mandan. Es el patrón
  // que exige ARIA para `role="tree"` y lo que evita 300 paradas de tabulador.
  const [activo, setActivo] = useState<string | null>(null);
  const nodos = useRef(new Map<string, HTMLDivElement | null>());
  const debeEnfocar = useRef(false);

  const idsVisibles = filas.map((f) => f.id);
  /** Dónde está la parada de tabulador. Siempre hay una: la primera fila si nadie tocó nada. */
  const activoVigente =
    activo !== null && idsVisibles.includes(activo) ? activo : (idsVisibles[0] ?? null);
  /**
   * Y si esa parada cuenta como SELECCIÓN. Al abrir un proyecto no hay nada seleccionado:
   * pintar la primera épica resaltada sugiere que el usuario la eligió, y en E7 esa fila
   * será el destino de las acciones. La distinción cuesta un booleano y evita el bug.
   */
  const haySeleccion = activo !== null && idsVisibles.includes(activo);

  useEffect(() => {
    if (!debeEnfocar.current || activoVigente === null) return;
    debeEnfocar.current = false;
    nodos.current.get(activoVigente)?.focus();
  }, [activoVigente]);

  const mover = useCallback(
    (id: string) => {
      debeEnfocar.current = true;
      setActivo(id);
    },
    [],
  );

  const alTeclado = useCallback(
    (evento: React.KeyboardEvent<HTMLDivElement>) => {
      if (activoVigente === null) return;
      const indice = filas.findIndex((f) => f.id === activoVigente);
      if (indice < 0) return;
      const fila = filas[indice];
      if (fila === undefined) return;

      const expandible = fila.tipo !== 'tarea' && fila.expandible;
      const abierto = expandible && expandidos.has(fila.id);
      const irA = (n: number) => {
        const destino = filas[n];
        if (destino !== undefined) mover(destino.id);
      };

      switch (evento.key) {
        case 'ArrowDown':
          evento.preventDefault();
          irA(Math.min(indice + 1, filas.length - 1));
          break;
        case 'ArrowUp':
          evento.preventDefault();
          irA(Math.max(indice - 1, 0));
          break;
        case 'ArrowRight':
          evento.preventDefault();
          if (expandible && !abierto) alternar(fila.id);
          else if (abierto) irA(indice + 1);
          break;
        case 'ArrowLeft':
          evento.preventDefault();
          if (abierto) alternar(fila.id);
          else if (fila.padre !== null) mover(fila.padre);
          break;
        case 'Home':
          evento.preventDefault();
          irA(0);
          break;
        case 'End':
          evento.preventDefault();
          irA(filas.length - 1);
          break;
        case 'Enter':
        case ' ':
          if (expandible) {
            evento.preventDefault();
            alternar(fila.id);
          }
          break;
        default:
          break;
      }
    },
    [activoVigente, alternar, expandidos, filas, mover],
  );

  if (filas.length === 0) {
    return (
      <div className="arbol arbol--vacio">
        <p className="vacio__titulo">Nada que mostrar aquí</p>
        <p className="vacio__nota">
          {predicado
            ? 'Este proyecto todavía no tiene ninguna tarea terminada.'
            : 'Este proyecto no tiene épicas capturadas.'}
        </p>
      </div>
    );
  }

  return (
    // El manejador de teclado vive en el contenedor: el evento sube desde la fila
    // enfocada, así que no hay que registrar 300 escuchas.
    <div className="arbol" role="tree" aria-label={etiqueta} onKeyDown={alTeclado}>
      {filas.map((fila) => (
        <FilaArbol
          key={fila.id}
          fila={fila}
          hoy={hoy}
          expandido={fila.tipo !== 'tarea' && expandidos.has(fila.id)}
          activo={fila.id === activoVigente}
          seleccionado={haySeleccion && fila.id === activoVigente}
          alternar={alternar}
          enfocar={mover}
          registrar={(nodo) => {
            if (nodo === null) nodos.current.delete(fila.id);
            else nodos.current.set(fila.id, nodo);
          }}
        />
      ))}
    </div>
  );
}

// --- construcción de la lista plana -----------------------------------------

function construirFilas(
  proyecto: Proyecto,
  sprint: Sprint | undefined,
  expandidos: ReadonlySet<string>,
  predicado?: (tarea: Tarea) => boolean,
): Fila[] {
  const filas: Fila[] = [];

  // Con predicado se ocultan los contenedores que no aportan ninguna hoja visible: una
  // pestaña «Terminadas» llena de épicas vacías no informa de nada. Sin predicado se
  // muestran TODAS, incluidas las que no tienen historias: ahí «sin desglosar» es
  // justamente el dato.
  const epicas = predicado
    ? proyecto.epicas.filter((e) => tareasDeEpica(e).some(predicado))
    : proyecto.epicas;

  epicas.forEach((epica, i) => {
    const historias = predicado
      ? epica.historias.filter((h) => h.tareas.some(predicado))
      : epica.historias;

    filas.push({
      tipo: 'epica',
      id: epica.id,
      nivel: 1,
      padre: null,
      posicion: i + 1,
      hermanos: epicas.length,
      epica,
      // Siempre sobre TODAS las hojas de la épica, nunca sobre las filtradas.
      avance: avanceDeEpica(epica),
      bloqueadas: tareasDeEpica(epica).filter(estaBloqueada).length,
      expandible: historias.length > 0,
    });

    if (historias.length === 0 || !expandidos.has(epica.id)) return;

    historias.forEach((historia, j) => {
      const tareas = predicado ? historia.tareas.filter(predicado) : historia.tareas;

      filas.push({
        tipo: 'historia',
        id: historia.id,
        nivel: 2,
        padre: epica.id,
        posicion: j + 1,
        hermanos: historias.length,
        historia,
        avance: avanceDeHistoria(historia),
        bloqueadas: historia.tareas.filter(estaBloqueada).length,
        expandible: tareas.length > 0,
      });

      if (tareas.length === 0 || !expandidos.has(historia.id)) return;

      tareas.forEach((tarea, k) => {
        filas.push({
          tipo: 'tarea',
          id: tarea.id,
          nivel: 3,
          padre: historia.id,
          posicion: k + 1,
          hermanos: tareas.length,
          tarea,
          enSprint: estaEnSprint(tarea.id, sprint),
        });
      });
    });
  });

  return filas;
}

// --- la fila ----------------------------------------------------------------

interface PropsFila {
  fila: Fila;
  hoy: Fecha;
  expandido: boolean;
  /** Es la parada de tabulador del árbol. */
  activo: boolean;
  /** El usuario la eligió de verdad. */
  seleccionado: boolean;
  alternar: (id: string) => void;
  enfocar: (id: string) => void;
  registrar: (nodo: HTMLDivElement | null) => void;
}

function FilaArbol({
  fila,
  hoy,
  expandido,
  activo,
  seleccionado,
  alternar,
  enfocar,
  registrar,
}: PropsFila) {
  const comunes = {
    ref: registrar,
    role: 'treeitem' as const,
    tabIndex: activo ? 0 : -1,
    'aria-level': fila.nivel,
    'aria-posinset': fila.posicion,
    'aria-setsize': fila.hermanos,
    'aria-selected': seleccionado,
    onFocus: () => enfocar(fila.id),
  };

  if (fila.tipo === 'tarea') {
    const { tarea } = fila;
    const bloqueo = bloqueoAbierto(tarea);
    const clases = ['fila', 'fila--tarea'];
    // Canal 2: la banda de procedencia. Solo mientras la tarea siga abierta.
    if (mostrarProcedencia(tarea)) clases.push('fila--nuevo');
    if (fila.enSprint) clases.push('fila--en-sprint');
    if (tarea.estado === 'cancelada') clases.push('fila--cancelada');

    return (
      <div {...comunes} className={clases.join(' ')} onClick={() => enfocar(tarea.id)}>
        <Chevron abierto={false} vacio />
        {/* Canal 1: el estado, en la forma del glifo. El bloqueo NO lo sustituye. */}
        <Glifo forma={formaDeTarea(tarea.estado)} etiqueta={etiquetaDeTarea(tarea.estado)} />
        <span className="fila__texto" title={tarea.titulo}>
          {tarea.titulo}
        </span>
        {/* Canal 3: la bandera de bloqueo, junto al glifo y nunca en su lugar. */}
        {bloqueo && (
          <ChipBloqueo diasBloqueada={diasBloqueada(tarea, hoy) ?? 0} motivo={bloqueo.motivo} />
        )}
        {mostrarProcedencia(tarea) && <ChipNuevo />}
        {fila.enSprint && <ChipNeutro texto="en el sprint" titulo="Comprometida en el sprint activo" />}
        <span className="clave">{tarea.id}</span>
      </div>
    );
  }

  const esEpica = fila.tipo === 'epica';
  const titulo = esEpica ? fila.epica.titulo : fila.historia.titulo;
  const derivado = estadoDerivado(fila.avance);

  return (
    <div
      {...comunes}
      className={`fila fila--${fila.tipo}`}
      aria-expanded={fila.expandible ? expandido : undefined}
      onClick={() => {
        enfocar(fila.id);
        if (fila.expandible) alternar(fila.id);
      }}
    >
      <Chevron abierto={expandido} vacio={!fila.expandible} />
      {/* Estado DERIVADO: mismas formas, otros nombres. Nunca se persiste. */}
      <Glifo forma={formaDerivada(derivado)} etiqueta={etiquetaDerivada(derivado)} />
      <span className="fila__texto" title={titulo}>
        {titulo}
      </span>
      <ContadorBloqueos n={fila.bloqueadas} />
      <Medidor avance={fila.avance} conBarra={esEpica} />
      <span className="clave">{fila.id}</span>
    </div>
  );
}
