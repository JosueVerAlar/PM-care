/**
 * El árbol: épica -> historia -> tarea, con los niveles que el proyecto tenga.
 *
 * La jerarquía es opcional (regla 18): una tarea puede colgar de una historia, de una
 * épica o del proyecto. En el Jira real cinco de los once proyectos no tienen nivel de
 * historia, así que no es un caso raro. Qué filas existen y en qué orden lo decide
 * `filas.ts`, que es puro y está probado aparte.
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
 *     ⌥↑ ⌥↓     subir o bajar entre hermanas · ⌥Inicio / ⌥Fin a los extremos
 *
 * **`S` no es la alternativa accesible del arrastre: es la vía principal.** Por debajo de
 * 1040 px el panel del sprint no se pinta y arrastrar es imposible con cualquier
 * librería; ahí `S` es lo único que hay. Ver `util/arrastre.ts`.
 *
 * ## E13 — el `＋` de cada contenedor
 *
 * `N` era el único camino cómodo para capturar, y una tecla que nada en pantalla menciona
 * no es un atajo: es un requisito de memoria. Cada épica y cada historia llevan ahora su
 * propio `＋`, **visible siempre**, con el destino escrito en su nombre accesible y la
 * tecla al lado. `N` no cambia y pasa a ser lo que debía ser: la vía rápida de quien ya
 * se la sabe.
 *
 * La tarea NO lo lleva: es la hoja, son dos tercios de las filas y las más estrechas.
 * Una tarea hermana se captura desde el `＋` de su historia o con `N` sobre ella.
 *
 * El botón se queda —en gris— cuando no se puede escribir. Si desapareciera, el árbol
 * entero cambiaría de forma al entrar y salir de solo lectura o de la pestaña
 * «Terminadas», y un control que se esconde no enseña que la función existe.
 *
 * ## Los dos arrastres
, y cómo se distinguen sin adivinar (regla 10)
 *
 * Sobre las mismas filas conviven dos gestos que quieren decir cosas distintas: mandar
 * una tarea AL SPRINT y REORDENAR dentro del árbol. Que se distingan no se resuelve con
 * un aviso ni con una tecla modificadora, sino haciendo que empiecen en sitios distintos:
 *
 * - **Se agarra el CUERPO de la fila → al sprint.** Solo las tareas, como en E7.
 * - **Se agarra el ASA (los seis puntos, al principio del renglón) → reordenar.** En los
 *   tres niveles, y siempre entre hermanas.
 *
 * Cada gesto viaja con su propio tipo MIME, así que ninguna zona puede confundirlos: el
 * panel del sprint no se ilumina durante un reordenamiento, y el árbol no dibuja ninguna
 * línea de inserción mientras se arrastra algo hacia el sprint. **En cualquier instante
 * hay un solo juego de destinos encendido**, y es el del gesto que se empezó.
 *
 * Y lo que no se puede hacer, no se ofrece: como **mover entre padres no existe** en el
 * reductor, solo aceptan el soltar las filas hermanas de lo que se arrastra. Sobre
 * cualquier otra el cursor dice que no y no aparece ninguna línea, en vez de dejar soltar
 * para contestar con un error.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  avanceDeEpica,
  avanceDeHistoria,
  estadoDerivado,
  tareasDe,
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
import { Asa, Chevron, Glifo, Mas } from '../../componentes/iconos';
import { Medidor } from '../../componentes/Medidor';

import { useAccionesOrden } from '../../estado/acciones-orden';
import { useAccionesSprint } from '../../estado/acciones-sprint';
import { useAccionesInterfaz, useInterfaz } from '../../estado/interfaz';
import { useMutar } from '../../estado/mutaciones';
import { enCampoDeTexto, letraSuelta } from '../../util/atajos';
import { chipDeArrastre, esArrastreDeOrden, TIPO_ORDEN, TIPO_TAREA } from '../../util/arrastre';
import { construirFilas, type Fila } from './filas';
import {
  destinoDesdeHueco,
  quieto,
  reordenable,
  sonHermanas,
  type Ubicacion,
} from '../../util/orden';
import {
  cuenta,
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

/** Un arrastre no señala una posición, señala un HUECO: el de arriba o el de abajo. */
type Borde = 'antes' | 'despues';

/** Todo lo que una fila necesita saber del gesto de reordenar. Un solo prop, no seis. */
interface GestoOrden {
  /** `false` en «Terminadas» y en solo lectura: ni asa, ni destinos, ni nada. */
  activo: boolean;
  /** Qué se está moviendo ahora mismo, o `null`. */
  moviendo: Fila | null;
  iniciar(fila: Fila): void;
  terminar(): void;
  sobre(destino: Ubicacion, borde: Borde): void;
  soltar(destino: Ubicacion, borde: Borde): void;
}

/** En qué mitad de la fila está el cursor. Arriba es «antes»; abajo, «después». */
function bordeDe(evento: React.DragEvent): Borde {
  const caja = evento.currentTarget.getBoundingClientRect();
  return evento.clientY < caja.top + caja.height / 2 ? 'antes' : 'despues';
}

function tituloDeFila(fila: Fila): string {
  switch (fila.tipo) {
    case 'epica':
      return fila.epica.titulo;
    case 'historia':
      return fila.historia.titulo;
    case 'tarea':
      return fila.tarea.titulo;
  }
}

/**
 * Qué se lleva consigo este nodo. `null` si no se lleva nada (una tarea, o un contenedor
 * vacío). No es adorno: la rama entera viajando con la épica es LO QUE SE PIDIÓ, y en el
 * chip del arrastre y en el anuncio es donde se puede comprobar sin abrir nada.
 */
function resumenDeRama(fila: Fila): string | null {
  if (fila.tipo === 'epica') {
    const historias = fila.epica.historias.length;
    const tareas = tareasDeEpica(fila.epica).length;
    if (historias === 0) {
      // Una épica sin historias pero con tareas propias (regla 18) SÍ se lleva algo. Antes
      // de N9 esto devolvía `null` y el chip del arrastre decía que no movía nada.
      return tareas === 0 ? null : cuenta(tareas, 'tarea', 'tareas');
    }
    return `${cuenta(historias, 'historia', 'historias')} y ${cuenta(tareas, 'tarea', 'tareas')}`;
  }
  if (fila.tipo === 'historia') {
    const tareas = tareasDe(fila.historia).length;
    return tareas === 0 ? null : cuenta(tareas, 'tarea', 'tareas');
  }
  return null;
}

/** El chip que va en el cursor: qué se mueve y cuánto se mueve con ello. */
function etiquetaDeArrastre(fila: Fila): string {
  const rama = resumenDeRama(fila);
  return rama === null ? tituloDeFila(fila) : `${tituloDeFila(fila)} · ${rama}`;
}

function anuncioDeOrden(fila: Fila, aIndice: number): string {
  const rama = resumenDeRama(fila);
  const base = `${tituloDeFila(fila)}: posición ${aIndice + 1} de ${fila.orden.hermanos}`;
  return rama === null ? base : `${base}, con ${rama}`;
}

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
    expandir,
    irANodo,
    redactar,
    confirmar,
    avisar,
  } = useAccionesInterfaz();

  const mutar = useMutar();
  const acciones = useAccionesSprint(sprint);
  const accionesOrden = useAccionesOrden();

  const filas = useMemo(
    () => construirFilas(proyecto, sprint, expandidos, predicado),
    [proyecto, sprint, expandidos, predicado],
  );

  // --- reordenar: el arrastre que NO sale del árbol --------------------------
  /**
   * Vive en un `useState` local y no en el estado de interfaz a propósito. Nadie fuera
   * del árbol necesita saber que se está reordenando —y que el panel del sprint no lo
   * sepa es exactamente lo que garantiza que no se ilumine mientras se prioriza—. El
   * arrastre al sprint sí está allá arriba porque lo comparten dos paneles hermanos.
   */
  const [moviendo, setMoviendo] = useState<Fila | null>(null);
  /** Dónde caería al soltar. `null` mientras el hueco señalado no cambie nada. */
  const [indicador, setIndicador] = useState<{ id: string; borde: Borde } | null>(null);
  /**
   * Lo último que se movió, dicho en palabras. Un reordenamiento que solo se ve no existe
   * para quien navega con lector de pantalla, y entre cinco épicas parecidas tampoco es
   * evidente para quien mira. Dice además cuánto viajó con ella: es la promesa del gesto.
   */
  const [anuncio, setAnuncio] = useState('');

  const limpiarOrden = useCallback(() => {
    setMoviendo(null);
    setIndicador(null);
  }, []);

  const reordenar = useCallback(
    async (fila: Fila, aIndice: number) => {
      const final = await accionesOrden.mover(fila.orden, aIndice);
      // `null` = no había nada que mover. Ni se anuncia ni se avisa: no pasó nada.
      if (final !== null) setAnuncio(anuncioDeOrden(fila, final));
    },
    [accionesOrden],
  );

  const sobrevolarOrden = useCallback(
    (destino: Ubicacion, borde: Borde) => {
      if (moviendo === null) return;
      const hueco = borde === 'antes' ? destino.indice : destino.indice + 1;
      // Los dos huecos que rodean al elemento lo dejan donde estaba. No se dibuja línea:
      // así se ve ANTES de soltar que ahí no va a pasar nada, en vez de descubrirlo con
      // un error después.
      const nada = quieto(moviendo.orden, destinoDesdeHueco(moviendo.orden.indice, hueco));
      setIndicador((previo) => {
        if (nada) return null;
        if (previo !== null && previo.id === destino.id && previo.borde === borde) return previo;
        return { id: destino.id, borde };
      });
    },
    [moviendo],
  );

  const soltarOrden = useCallback(
    async (destino: Ubicacion, borde: Borde) => {
      const fila = moviendo;
      limpiarOrden();
      if (fila === null) return;
      const hueco = borde === 'antes' ? destino.indice : destino.indice + 1;
      await reordenar(fila, destinoDesdeHueco(fila.orden.indice, hueco));
    },
    [limpiarOrden, moviendo, reordenar],
  );

  const gesto = useMemo<GestoOrden>(
    () => ({
      // En «Terminadas» el árbol está filtrado: las posiciones que se ven no son las del
      // documento, así que ahí no se reordena. Es la misma bandera que apaga el resto.
      activo: editable,
      moviendo,
      iniciar: setMoviendo,
      terminar: limpiarOrden,
      sobre: sobrevolarOrden,
      soltar: soltarOrden,
    }),
    [editable, limpiarOrden, moviendo, sobrevolarOrden, soltarOrden],
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
        fila.tipo === 'epica' ? tareasDeEpica(fila.epica).length : tareasDe(fila.historia).length;
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
          redactar({ tipo: 'capturar', clase: 'tarea', padreId: fila.id });
          break;
        case 'tarea':
          // Desde una tarea se captura una HERMANA, no una hija: la tarea es la hoja. Su
          // contenedor puede ser una historia, una épica o el proyecto (regla 18), y
          // `fila.padre` ya lo nombra sin tener que preguntar de qué clase es.
          redactar({ tipo: 'capturar', clase: 'tarea', padreId: fila.padre });
          break;
      }
    },
    [redactar],
  );

  /**
   * Lo que hace el `＋` de la fila, que es un poco más que la tecla `N`.
   *
   * `N` se pulsa sobre la fila que ya tiene el foco; el `＋` se pulsa con el ratón sobre
   * una fila cualquiera, así que primero la marca como la elegida —o el árbol seguiría
   * resaltando otra mientras se captura aquí— y la DESPLIEGA. Desplegar es la mitad de la
   * queja que originó esto: se pedía capturar dentro de algo que estaba cerrado y no se
   * veía dónde iba a caer lo nuevo.
   */
  const capturarConBoton = useCallback(
    (fila: Fila) => {
      enfocarNodo(fila.id);
      if (fila.tipo !== 'tarea' && fila.expandible) expandir([fila.id]);
      capturarEn(fila);
    },
    [capturarEn, enfocarNodo, expandir],
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

      /**
       * `⌥` convierte las cuatro teclas de moverse en las cuatro de MOVER: es el
       * equivalente por teclado del arrastre por el asa, y la única forma de reordenar
       * por debajo de 1040 px, donde arrastrar deja de ser cómodo y el panel hermano ni
       * se pinta. En el tope no hace nada —no se envuelve al otro extremo— porque
       * `mover` rechaza el destino que deja el nodo donde estaba.
       */
      const reordenarA = (aIndice: number) => {
        evento.preventDefault();
        if (editable) void reordenar(fila, aIndice);
      };

      switch (evento.key) {
        case 'ArrowDown':
          if (evento.altKey) return reordenarA(fila.orden.indice + 1);
          evento.preventDefault();
          irA(Math.min(indice + 1, filas.length - 1));
          return;
        case 'ArrowUp':
          if (evento.altKey) return reordenarA(fila.orden.indice - 1);
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
          // «Esta épica va primero» es literalmente lo que el usuario pidió poder hacer
          // de un solo gesto. Con el teclado son dos teclas.
          if (evento.altKey) return reordenarA(0);
          evento.preventDefault();
          irA(0);
          return;
        case 'End':
          if (evento.altKey) return reordenarA(fila.orden.hermanos - 1);
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
      reordenar,
    ],
  );

  if (filas.length === 0) {
    return (
      <div className="arbol arbol--vacio">
        <p className="vacio__titulo">Nada que mostrar aquí</p>
        <p className="vacio__nota">
          {predicado
            ? 'Este proyecto todavía no tiene ninguna tarea terminada.'
            : 'Este proyecto todavía no tiene nada capturado.'}
        </p>
        {/* Un estado vacío sin salida obliga a buscar la acción en otra parte de la
            pantalla. Las dos opciones se ofrecen aquí porque las dos son legítimas
            (regla 18): un proyecto puede empezar por una épica o por una tarea suelta, y
            cuál de las dos es lo normal depende del proyecto, no de la app. */}
        {!predicado && editable && (
          <div className="vacio__acciones">
            <button
              type="button"
              className="cab__primario"
              onClick={() =>
                redactar({ tipo: 'capturar', clase: 'epica', padreId: proyecto.clave })
              }
            >
              <Mas /> Nueva épica
            </button>
            <button
              type="button"
              className="cab__accion"
              title={`Una tarea colgada de ${proyecto.clave}, sin épica`}
              onClick={() =>
                redactar({ tipo: 'capturar', clase: 'tarea', padreId: proyecto.clave })
              }
            >
              <Mas /> Nueva tarea suelta
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <>
      {/* El manejador de teclado vive en el contenedor: el evento sube desde la fila
          enfocada, así que no hay que registrar 300 escuchas. */}
      <div
        className="arbol"
        role="tree"
        aria-label={etiqueta}
        onKeyDown={alTeclado}
        // Sacar el cursor del árbol apaga la línea de inserción. Se mira `relatedTarget`
        // en vez de llevar un contador de profundidad: aquí basta con saber si el destino
        // sigue dentro, y `dragover` la vuelve a encender en cuanto se entra a una fila.
        onDragLeave={(evento) => {
          const destino = evento.relatedTarget;
          if (destino instanceof Node && evento.currentTarget.contains(destino)) return;
          setIndicador(null);
        }}
      >
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
            orden={gesto}
            indicador={indicador !== null && indicador.id === fila.id ? indicador.borde : null}
            alternar={alternar}
            enfocar={enfocarNodo}
            capturar={capturarConBoton}
            cambiarEstado={cambiarEstado}

            registrar={(nodo) => {
              if (nodo === null) nodos.current.delete(fila.id);
              else nodos.current.set(fila.id, nodo);
            }}
          />
        ))}
      </div>
      {/* Fuera del `role="tree"`: un párrafo suelto no es un `treeitem` válido. */}
      <p className="solo-lectores" role="status" aria-live="polite">
        {anuncio}
      </p>
    </>
  );
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
  orden: GestoOrden;
  /** Dónde pintar la línea de inserción en ESTA fila, si toca. */
  indicador: Borde | null;
  alternar: (id: string) => void;
  enfocar: (id: string) => void;
  /** Abre la captura dentro de esta fila. Solo lo usan las que pueden tener hijos. */
  capturar: (fila: Fila) => void;
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
  orden,
  indicador,
  alternar,
  enfocar,
  capturar,
  cambiarEstado,
  registrar,
}: PropsFila) {

  const { arrastre } = useInterfaz();
  const { arrastrar } = useAccionesInterfaz();

  /** Solo aceptan soltar las HERMANAS: mover entre padres no existe, así que no se ofrece. */
  const esDestino = orden.moviendo !== null && sonHermanas(orden.moviendo.orden, fila.orden);
  const moviendoEsta = orden.moviendo?.id === fila.id;

  const zonaOrden = esDestino
    ? {
        onDragOver: (evento: React.DragEvent) => {
          if (!esArrastreDeOrden(evento.dataTransfer)) return;
          // Sin este `preventDefault` el navegador nunca dispara `drop`.
          evento.preventDefault();
          evento.dataTransfer.dropEffect = 'move';
          orden.sobre(fila.orden, bordeDe(evento));
        },
        onDrop: (evento: React.DragEvent) => {
          evento.preventDefault();
          void orden.soltar(fila.orden, bordeDe(evento));
        },
      }
    : {};

  const comunes = {
    ref: registrar,
    role: 'treeitem' as const,
    tabIndex: activo ? 0 : -1,
    'aria-level': fila.nivel,
    'aria-posinset': fila.posicion,
    'aria-setsize': fila.hermanos,
    'aria-selected': seleccionado,
    'data-inserta': indicador ?? undefined,
    onFocus: () => enfocar(fila.id),
    ...zonaOrden,
  };

  /**
   * El asa. Ocupa su hueco SIEMPRE —aunque esté vacía— para que la columna del chevron
   * no baile entre pestañas ni entre filas que se pueden reordenar y filas que no.
   */
  const asa = (
    <span
      className="asa"
      aria-hidden="true"
      draggable={orden.activo && reordenable(fila.orden)}
      title={`Arrastra para reordenar entre sus ${fila.orden.hermanos} hermanas · ⌥↑ ⌥↓`}
      // Sin esto, agarrar el asa de una épica la plegaría de paso.
      onClick={(evento) => evento.stopPropagation()}
      onDragStart={(evento) => {
        // Este arrastre NO es el del sprint: se corta aquí para que el `onDragStart` de
        // la fila —que es el que compromete una tarea— no llegue a enterarse.
        evento.stopPropagation();
        evento.dataTransfer.setData(TIPO_ORDEN, fila.id);
        evento.dataTransfer.effectAllowed = 'move';
        chipDeArrastre(evento, etiquetaDeArrastre(fila));
        orden.iniciar(fila);
      }}
      onDragEnd={() => orden.terminar()}
    >
      {orden.activo && reordenable(fila.orden) && <Asa />}
    </span>
  );

  if (fila.tipo === 'tarea') {
    const { tarea } = fila;
    const bloqueo = bloqueoAbierto(tarea);
    const arrastrable = editable && acciones.admiteSprint(tarea);
    const clases = ['fila', 'fila--tarea'];
    // Canal 2: la banda de procedencia. Solo mientras la tarea siga abierta.
    if (mostrarProcedencia(tarea)) clases.push('fila--nuevo');
    if (fila.enSprint) clases.push('fila--en-sprint');
    if (tarea.estado === 'cancelada') clases.push('fila--cancelada');
    if (arrastre?.tareaId === tarea.id || moviendoEsta) clases.push('fila--arrastrando');

    return (
      <div
        {...comunes}
        className={clases.join(' ')}
        // El estado, disponible para el tema sin tener que leer la clase del glifo.
        data-estado={tarea.estado}
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
        {asa}
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
        {/* El esfuerzo, cuando lo hay. Sin estimar NO pinta nada: un «—» en cada una de
            trescientas filas sería ruido en la columna más estrecha del árbol, y «sin
            estimar» es el estado normal, no una falta que haya que señalar. */}
        {tarea.esfuerzo !== null && (
          <span className="esfuerzo tabular" title={`Esfuerzo ${tarea.esfuerzo}`}>
            {tarea.esfuerzo}
          </span>
        )}
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
  // El destino, dicho entero: el `＋` de la barra superior obligaba a mirar un `title`
  // para saber dónde iba a caer lo nuevo, y ese era medio problema.
  const queCaptura = esEpica ? `Nueva historia en «${titulo}»` : `Nueva tarea en «${titulo}»`;

  // El botón de lote de la historia: mandar sus tareas abiertas de una vez. Es la forma
  // de meter «una historia entera» sin romper la regla 10 — no se arrastra la historia,
  // se mandan sus tareas.
  const historiaDelLote = fila.tipo === 'historia' && editable ? fila.historia : null;
  const lote = historiaDelLote === null ? [] : acciones.loteDe(historiaDelLote);

  const clases = ['fila', `fila--${fila.tipo}`];
  if (moviendoEsta) clases.push('fila--arrastrando');

  return (
    <div
      {...comunes}
      className={clases.join(' ')}
      /**
       * ENGANCHE DEL ESTADO DERIVADO (E13).
       *
       * `hecha` en una épica significa que todas sus tareas cerraron, y el usuario pidió
       * que eso se vea en la fila entera y no solo en el glifo de 14 px. El cálculo ya lo
       * daba; lo que faltaba era que la fila lo dijera. El tratamiento visual lo entrega
       * `diseno` con el rediseño de tema: aquí queda el gancho —un atributo, no una
       * clase de color— para que se aplique sin tocar este archivo.
       *
       * La advertencia que va con él: con varias épicas terminadas, un bloque verde
       * sólido por cada una convierte el panel en un semáforo y hace que lo TERMINADO,
       * que ya no pide ninguna decisión, grite más que lo pendiente. Lo que se pinte aquí
       * tiene que recular, no destacar.
       */
      data-derivado={derivado}
      aria-expanded={fila.expandible ? expandido : undefined}
      onClick={() => {
        enfocar(fila.id);
        if (fila.expandible && !editandoTitulo) alternar(fila.id);
      }}
    >
      {asa}
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
      {/* E13 · la acción, pegada a la cosa sobre la que actúa. Sin parada de tabulador
          propia: el árbol tiene una sola y 300 filas × 1 botón serían 300 más. */}
      <button
        type="button"
        className="fila__mas"
        tabIndex={-1}
        disabled={!editable}
        title={
          editable
            ? `${queCaptura} · tecla N`
            : `${queCaptura}: no disponible en esta pestaña ni en solo lectura`
        }
        aria-label={editable ? `${queCaptura} · tecla N` : `${queCaptura} (no disponible)`}
        onClick={(evento) => {
          evento.stopPropagation();
          capturar(fila);
        }}
      >
        <Mas />
      </button>
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
