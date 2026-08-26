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
 *
 * ## E7 — el teclado ES la interfaz
 *
 * Con una fila enfocada:
 *
 *     ↑ ↓ ← →   moverse y plegar          Inicio / Fin   extremos
 *     S         mandar la tarea al sprint y abrir su compromiso
 *     Espacio   cambiar el estado de la tarea (plegar, en un contenedor)
 *     Enter     renombrar la tarea (plegar, en un contenedor) · F2 renombra cualquiera
 *     N         capturar dentro de esta fila
 *     B         bandera de bloqueo (o quitarla)
 *     C         cancelar la tarea, o revivirla
 *     ⌫         eliminar
 *
 * **`S` no es la alternativa accesible del arrastre: es la vía principal.** Por debajo de
 * 1040 px el panel del sprint no se pinta y arrastrar es imposible con cualquier
 * librería; ahí `S` es lo único que hay. Ver `util/arrastre.ts`.
 *
 * Solo se arrastran TAREAS (regla 10): las épicas y las historias no llevan `draggable`,
 * así que intentar arrastrarlas no es que falle, es que no empieza.
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
import type {
  Epica,
  EstadoTarea,
  Fecha,
  Historia,
  Proyecto,
  Sprint,
  Tarea,
} from '../../../compartido/modelo/tipos';
import { ChipBloqueo, ChipNeutro, ChipNuevo, ContadorBloqueos } from '../../componentes/Chips';
import { Chevron, Glifo } from '../../componentes/iconos';
import { Medidor } from '../../componentes/Medidor';
import { useAccionesSprint } from '../../estado/acciones-sprint';
import { useAccionesInterfaz, useInterfaz } from '../../estado/interfaz';
import { useMutar } from '../../estado/mutaciones';
import { enCampoDeTexto, letraSuelta } from '../../util/atajos';
import { chipDeArrastre, TIPO_TAREA } from '../../util/arrastre';
import {
  etiquetaDerivada,
  etiquetaDeTarea,
  formaDerivada,
  formaDeTarea,
} from '../../util/presentacion';

/**
 * El ciclo de un clic (o de `Espacio`). `cancelada` NO está: se llega con `C`, porque
 * cancelar no es un paso más del avance sino salirse de él, y tropezarse con ella
 * pulsando Espacio de más sería sacar la tarea de todos los denominadores sin querer.
 */
const CICLO: Record<EstadoTarea, EstadoTarea> = {
  pendiente: 'en_curso',
  en_curso: 'hecha',
  hecha: 'pendiente',
  cancelada: 'pendiente',
};

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
      epica: Epica;
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
      historia: Historia;
      tarea: Tarea;
      enSprint: boolean;
    };

export interface PropsArbol {
  proyecto: Proyecto;
  /** El sprint activo, para marcar qué tareas ya están comprometidas. */
  sprint: Sprint | undefined;
  hoy: Fecha;
  /** Qué tareas se pintan. Ausente = todas. Nunca afecta a los conteos. */
  predicado?: (tarea: Tarea) => boolean;
  etiqueta: string;
  /**
   * `false` en la pestaña «Terminadas» y en modo solo lectura: ni arrastre, ni atajos que
   * escriban, ni botones. La pestaña de terminadas es un registro de lo que pasó, no un
   * sitio donde se opera.
   */
  editable: boolean;
}

export function Arbol({ proyecto, sprint, hoy, predicado, etiqueta, editable }: PropsArbol) {
  const { expandidos, nodoActivo, focoArbol, siguienteArbol, redaccion } = useInterfaz();
  const {
    alternarNodo: alternar,
    enfocarNodo,
    irANodo,
    redactar,
    confirmar,
    avisar,
  } = useAccionesInterfaz();
  const mutar = useMutar();
  const acciones = useAccionesSprint(sprint);

  const filas = useMemo(
    () => construirFilas(proyecto, sprint, expandidos, predicado),
    [proyecto, sprint, expandidos, predicado],
  );

  // --- foco recorrible (roving tabindex) -----------------------------------
  // Un solo elemento del árbol es tabulable; dentro, las flechas mandan. Es el patrón
  // que exige ARIA para `role="tree"` y lo que evita 300 paradas de tabulador.
  const nodos = useRef(new Map<string, HTMLDivElement | null>());

  const idsVisibles = filas.map((f) => f.id);
  /** Dónde está la parada de tabulador. Siempre hay una: la primera fila si nadie tocó nada. */
  const activoVigente =
    nodoActivo !== null && idsVisibles.includes(nodoActivo) ? nodoActivo : (idsVisibles[0] ?? null);
  /**
   * Y si esa parada cuenta como SELECCIÓN. Al abrir un proyecto no hay nada seleccionado:
   * pintar la primera épica resaltada sugiere que el usuario la eligió, y las acciones de
   * E7 se aplican justamente sobre «lo seleccionado». La distinción cuesta un booleano y
   * evita que `⌫` borre algo que nadie eligió.
   */
  const haySeleccion = nodoActivo !== null && idsVisibles.includes(nodoActivo);

  /**
   * El foco del DOM solo se mueve cuando alguien lo PIDE (`irANodo` incrementa el nonce),
   * nunca porque el nodo activo haya cambiado: si no, cada `onFocus` provocaría un
   * `.focus()` y el foco quedaría atrapado dentro del árbol para siempre.
   */
  const ultimoFoco = useRef(focoArbol);
  useEffect(() => {
    if (ultimoFoco.current === focoArbol) return;
    ultimoFoco.current = focoArbol;
    if (activoVigente !== null) nodos.current.get(activoVigente)?.focus();
  }, [activoVigente, focoArbol]);

  /**
   * E9–E11: llegar desde una vista global con «Ir a la tarea».
   *
   * El nonce de arriba no sirve para este caso: el árbol se MONTA de cero al cambiar de
   * pantalla, así que `ultimoFoco` nace ya igualado y el efecto sale por la primera línea.
   * Aquí se enfoca al montar, y solo si alguien fijó un nodo activo explícitamente —abrir
   * un proyecto por la barra lateral lo deja en `null`, así que este efecto no le roba el
   * foco a nadie al arrancar.
   */
  const montado = useRef(false);
  useEffect(() => {
    if (montado.current) return;
    montado.current = true;
    if (nodoActivo !== null) nodos.current.get(nodoActivo)?.focus();
    // Solo al montar: las dependencias vacías son la intención, no un olvido.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * «Baja una fila», pedido desde fuera del árbol. Lo resuelve aquí porque el árbol es el
   * único que conoce el orden vigente de las filas: qué está plegado y qué pestaña se
   * mira cambian cuál es «la siguiente». Es lo que permite encadenar `S · Enter · S ·
   * Enter` sobre las tareas de una historia sin una flecha por medio.
   */
  const ultimoSiguiente = useRef(siguienteArbol);
  useEffect(() => {
    if (ultimoSiguiente.current === siguienteArbol) return;
    ultimoSiguiente.current = siguienteArbol;
    if (activoVigente === null) return;
    const indice = filas.findIndex((f) => f.id === activoVigente);
    const destino = filas[indice + 1] ?? filas[indice];
    if (destino !== undefined) irANodo(destino.id);
  }, [activoVigente, filas, irANodo, siguienteArbol]);

  const editandoTitulo = redaccion?.tipo === 'titulo' ? redaccion.id : null;

  // --- acciones de una fila -------------------------------------------------

  const eliminar = useCallback(
    (fila: Fila) => {
      if (fila.tipo === 'tarea') {
        // Sin hijos que llevarse por delante no hay pregunta: deshacer es más barato.
        void mutar({ comando: 'eliminarTarea', id: fila.id }, `Eliminar ${fila.id}`);
        return;
      }
      const tareas =
        fila.tipo === 'epica' ? tareasDeEpica(fila.epica).length : fila.historia.tareas.length;
      if (tareas === 0) {
        void mutar(
          fila.tipo === 'epica'
            ? { comando: 'eliminarEpica', id: fila.id }
            : { comando: 'eliminarHistoria', id: fila.id },
          `Eliminar ${fila.id}`,
        );
        return;
      }
      confirmar({
        clase: fila.tipo,
        id: fila.id,
        titulo: fila.tipo === 'epica' ? fila.epica.titulo : fila.historia.titulo,
        tareas,
      });
    },
    [confirmar, mutar],
  );

  const capturarEn = useCallback(
    (fila: Fila) => {
      switch (fila.tipo) {
        case 'epica':
          redactar({ tipo: 'capturar', clase: 'historia', padreId: fila.id });
          break;
        case 'historia':
        case 'tarea':
          // Desde una tarea se captura una HERMANA, no una hija: la tarea es la hoja.
          redactar({ tipo: 'capturar', clase: 'tarea', padreId: fila.historia.id });
          break;
      }
    },
    [redactar],
  );

  const alternarBloqueo = useCallback(
    (tarea: Tarea) => {
      if (estaBloqueada(tarea)) {
        void mutar({ comando: 'desbloquear', tareaId: tarea.id }, `Desbloquear ${tarea.id}`);
        return;
      }
      // Bloquear SIEMPRE pasa por el formulario: la nota de qué la detiene es obligatoria
      // y es la única fricción intencional de la app.
      redactar({ tipo: 'bloqueo', tareaId: tarea.id });
    },
    [mutar, redactar],
  );

  const cambiarEstado = useCallback(
    (tarea: Tarea, estado: EstadoTarea) => {
      if (estado === tarea.estado) return;
      void mutar({ comando: 'cambiarEstado', id: tarea.id, estado }, `Cambiar estado de ${tarea.id}`);
    },
    [mutar],
  );

  const alTeclado = useCallback(
    (evento: React.KeyboardEvent<HTMLDivElement>) => {
      // Mientras se escribe, las teclas son texto: el campo de renombrar vive dentro de
      // una fila y sus eventos suben hasta aquí.
      if (enCampoDeTexto(evento.target)) return;
      if (activoVigente === null) return;
      const indice = filas.findIndex((f) => f.id === activoVigente);
      if (indice < 0) return;
      const fila = filas[indice];
      if (fila === undefined) return;

      const expandible = fila.tipo !== 'tarea' && fila.expandible;
      const abierto = expandible && expandidos.has(fila.id);
      const irA = (n: number) => {
        const destino = filas[n];
        if (destino !== undefined) irANodo(destino.id);
      };

      switch (evento.key) {
        case 'ArrowDown':
          evento.preventDefault();
          irA(Math.min(indice + 1, filas.length - 1));
          return;
        case 'ArrowUp':
          evento.preventDefault();
          irA(Math.max(indice - 1, 0));
          return;
        case 'ArrowRight':
          evento.preventDefault();
          if (expandible && !abierto) alternar(fila.id);
          else if (abierto) irA(indice + 1);
          return;
        case 'ArrowLeft':
          evento.preventDefault();
          if (abierto) alternar(fila.id);
          else if (fila.padre !== null) irANodo(fila.padre);
          return;
        case 'Home':
          evento.preventDefault();
          irA(0);
          return;
        case 'End':
          evento.preventDefault();
          irA(filas.length - 1);
          return;
        case 'Enter':
          evento.preventDefault();
          if (!editable) return;
          // En un contenedor Enter pliega (lo que ya hacía en E6); en una tarea, donde no
          // hacía nada, renombra.
          if (expandible) alternar(fila.id);
          else redactar({ tipo: 'titulo', id: fila.id, clase: fila.tipo });
          return;
        case ' ':
          evento.preventDefault();
          if (fila.tipo !== 'tarea') {
            if (expandible) alternar(fila.id);
          } else if (editable) {
            cambiarEstado(fila.tarea, CICLO[fila.tarea.estado]);
          }
          return;
        case 'F2':
          evento.preventDefault();
          if (editable) redactar({ tipo: 'titulo', id: fila.id, clase: fila.tipo });
          return;
        case 'Delete':
        case 'Backspace':
          evento.preventDefault();
          if (editable && haySeleccion) eliminar(fila);
          return;
        default:
          break;
      }

      if (!editable) return;

      if (letraSuelta(evento, 's')) {
        evento.preventDefault();
        if (fila.tipo === 'tarea') {
          if (acciones.admiteSprint(fila.tarea)) void acciones.mover(fila.tarea);
          else if (fila.enSprint) avisar(`${fila.tarea.id} ya está en el sprint.`);
        } else if (fila.tipo === 'historia') {
          void acciones.moverLote(fila.historia);
        } else {
          // Regla 10: una épica no se manda al sprint. Se dice, no se ignora en silencio.
          avisar('Solo las tareas entran al sprint. Abre la épica y manda sus historias.');
        }
        return;
      }
      if (letraSuelta(evento, 'n')) {
        evento.preventDefault();
        capturarEn(fila);
        return;
      }
      if (letraSuelta(evento, 'b')) {
        evento.preventDefault();
        if (fila.tipo === 'tarea') alternarBloqueo(fila.tarea);
        return;
      }
      if (letraSuelta(evento, 'c')) {
        evento.preventDefault();
        if (fila.tipo === 'tarea') {
          cambiarEstado(fila.tarea, fila.tarea.estado === 'cancelada' ? 'pendiente' : 'cancelada');
        }
      }
    },
    [
      acciones,
      activoVigente,
      alternar,
      alternarBloqueo,
      avisar,
      cambiarEstado,
      capturarEn,
      editable,
      eliminar,
      expandidos,
      filas,
      haySeleccion,
      irANodo,
      redactar,
    ],
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
          editable={editable}
          editandoTitulo={editandoTitulo === fila.id}
          acciones={acciones}
          alternar={alternar}
          enfocar={enfocarNodo}
          cambiarEstado={cambiarEstado}
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
        epica,
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
          historia,
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
  editable: boolean;
  editandoTitulo: boolean;
  acciones: ReturnType<typeof useAccionesSprint>;
  alternar: (id: string) => void;
  enfocar: (id: string) => void;
  cambiarEstado: (tarea: Tarea, estado: EstadoTarea) => void;
  registrar: (nodo: HTMLDivElement | null) => void;
}

function FilaArbol({
  fila,
  hoy,
  expandido,
  activo,
  seleccionado,
  editable,
  editandoTitulo,
  acciones,
  alternar,
  enfocar,
  cambiarEstado,
  registrar,
}: PropsFila) {
  const { arrastre } = useInterfaz();
  const { arrastrar } = useAccionesInterfaz();

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
    const arrastrable = editable && acciones.admiteSprint(tarea);
    const clases = ['fila', 'fila--tarea'];
    // Canal 2: la banda de procedencia. Solo mientras la tarea siga abierta.
    if (mostrarProcedencia(tarea)) clases.push('fila--nuevo');
    if (fila.enSprint) clases.push('fila--en-sprint');
    if (tarea.estado === 'cancelada') clases.push('fila--cancelada');
    if (arrastre?.tareaId === tarea.id) clases.push('fila--arrastrando');

    return (
      <div
        {...comunes}
        className={clases.join(' ')}
        draggable={arrastrable}
        onDragStart={(evento) => {
          evento.dataTransfer.setData(TIPO_TAREA, tarea.id);
          evento.dataTransfer.effectAllowed = 'move';
          chipDeArrastre(evento, tarea.titulo);
          arrastrar({ tareaId: tarea.id, origen: 'arbol' });
        }}
        onDragEnd={() => arrastrar(null)}
        onClick={() => enfocar(tarea.id)}
      >
        <Chevron abierto={false} vacio />
        {/* Canal 1: el estado, en la forma del glifo. El bloqueo NO lo sustituye. */}
        {editable ? (
          <button
            type="button"
            className="glifo glifo--boton"
            // El árbol tiene UNA parada de tabulador (roving tabindex); este botón no
            // puede abrir 300 más. Se llega con Espacio sobre la fila.
            tabIndex={-1}
            title={`${etiquetaDeTarea(tarea.estado)} · clic para pasar a ${etiquetaDeTarea(CICLO[tarea.estado])}`}
            onClick={(evento) => {
              evento.stopPropagation();
              cambiarEstado(tarea, CICLO[tarea.estado]);
            }}
          >
            <Glifo forma={formaDeTarea(tarea.estado)} etiqueta={etiquetaDeTarea(tarea.estado)} />
          </button>
        ) : (
          <Glifo forma={formaDeTarea(tarea.estado)} etiqueta={etiquetaDeTarea(tarea.estado)} />
        )}

        {editandoTitulo ? (
          <CampoTitulo id={tarea.id} valor={tarea.titulo} clase="tarea" />
        ) : (
          <span className="fila__texto" title={tarea.titulo}>
            {tarea.titulo}
          </span>
        )}

        {/* Canal 3: la bandera de bloqueo, junto al glifo y nunca en su lugar. */}
        {bloqueo && (
          <ChipBloqueo diasBloqueada={diasBloqueada(tarea, hoy) ?? 0} motivo={bloqueo.motivo} />
        )}
        {mostrarProcedencia(tarea) && <ChipNuevo />}
        {fila.enSprint && <ChipNeutro texto="en el sprint" titulo="Comprometida en el sprint activo" />}
        {arrastrable && (
          <button
            type="button"
            className="fila__accion"
            tabIndex={-1}
            title={`Mandar ${tarea.id} al sprint (S)`}
            onClick={(evento) => {
              evento.stopPropagation();
              void acciones.mover(tarea);
            }}
          >
            Al sprint
          </button>
        )}
        <span className="clave">{tarea.id}</span>
      </div>
    );
  }

  const esEpica = fila.tipo === 'epica';
  const titulo = esEpica ? fila.epica.titulo : fila.historia.titulo;
  const derivado = estadoDerivado(fila.avance);
  // El botón de lote de la historia: mandar sus tareas abiertas de una vez. Es la forma
  // de meter «una historia entera» sin romper la regla 10 — no se arrastra la historia,
  // se mandan sus tareas.
  const historiaDelLote = fila.tipo === 'historia' && editable ? fila.historia : null;
  const lote = historiaDelLote === null ? [] : acciones.loteDe(historiaDelLote);

  return (
    <div
      {...comunes}
      className={`fila fila--${fila.tipo}`}
      aria-expanded={fila.expandible ? expandido : undefined}
      onClick={() => {
        enfocar(fila.id);
        if (fila.expandible && !editandoTitulo) alternar(fila.id);
      }}
    >
      <Chevron abierto={expandido} vacio={!fila.expandible} />
      {/* Estado DERIVADO: mismas formas, otros nombres. Nunca se persiste. */}
      <Glifo forma={formaDerivada(derivado)} etiqueta={etiquetaDerivada(derivado)} />

      {editandoTitulo ? (
        <CampoTitulo id={fila.id} valor={titulo} clase={fila.tipo} />
      ) : (
        <span className="fila__texto" title={titulo}>
          {titulo}
        </span>
      )}

      <ContadorBloqueos n={fila.bloqueadas} />
      {historiaDelLote !== null && lote.length > 0 && (
        <button
          type="button"
          className="fila__accion"
          tabIndex={-1}
          title={`Mandar al sprint las ${lote.length} tareas abiertas de esta historia (S)`}
          onClick={(evento) => {
            evento.stopPropagation();
            void acciones.moverLote(historiaDelLote);
          }}
        >
          Al sprint · {lote.length}
        </button>
      )}
      <Medidor avance={fila.avance} conBarra={esEpica} />
      <span className="clave">{fila.id}</span>
    </div>
  );
}

// --- renombrar en línea -----------------------------------------------------

/**
 * Renombrar dentro de la propia fila.
 *
 * Aquí `Escape` SÍ cancela, al revés que en el formulario de compromiso: renombrar
 * REEMPLAZA un texto que ya existe, y cancelar significa «deja el que estaba», que sigue
 * en el documento. En el compromiso no hay nada que restaurar, así que cancelar solo
 * podría significar tirar lo tecleado — y eso no se hace (regla 5).
 */
function CampoTitulo({
  id,
  valor,
  clase,
}: {
  id: string;
  valor: string;
  clase: 'epica' | 'historia' | 'tarea';
}) {
  const mutar = useMutar();
  const { redactar, irANodo } = useAccionesInterfaz();
  const [texto, setTexto] = useState(valor);
  const campo = useRef<HTMLInputElement>(null);

  useEffect(() => {
    campo.current?.select();
  }, []);

  const cerrar = () => {
    redactar(null);
    irANodo(id);
  };

  const guardar = async () => {
    const limpio = texto.trim();
    // Un título vacío no es un título: se sale sin tocar nada, que es lo que el usuario
    // habría querido al borrarlo todo y pulsar Enter.
    if (limpio === '' || limpio === valor) return cerrar();
    const comando =
      clase === 'epica'
        ? ({ comando: 'editarEpica', id, titulo: limpio } as const)
        : clase === 'historia'
          ? ({ comando: 'editarHistoria', id, titulo: limpio } as const)
          : ({ comando: 'editarTarea', id, titulo: limpio } as const);
    if (await mutar(comando, `Renombrar ${id}`)) cerrar();
  };

  return (
    <input
      ref={campo}
      className="fila__campo"
      value={texto}
      aria-label={`Título de ${id}`}
      onChange={(e) => setTexto(e.target.value)}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter') {
          e.preventDefault();
          void guardar();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          cerrar();
        }
      }}
      onBlur={() => void guardar()}
    />
  );
}
