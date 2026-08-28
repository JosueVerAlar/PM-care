/**
 * Estado de INTERFAZ, deliberadamente fuera del reductor del documento.
 *
 * Qué está expandido, qué vista se mira, qué pestaña y qué filtro. Nada de esto se
 * persiste ni viaja por IPC. Si viviera en el reductor de datos, colapsar una épica
 * entraría por la misma ruta que una mutación y despertaría el ciclo de guardado.
 *
 * El proyecto seleccionado se guarda como CLAVE, no como objeto ni como índice: un
 * documento que se recarga desde disco trae proyectos nuevos, y una referencia a un
 * objeto viejo o un índice desplazado dejarían la pantalla mirando otra cosa. Quien
 * pinta resuelve la clave contra el documento vigente y cae al primer proyecto si ya no
 * existe.
 *
 * ## E7 — lo que se añade aquí y lo que NO
 *
 * Aquí vive **qué formulario está abierto**, **qué se está arrastrando**, **qué nodo
 * tiene el foco del árbol** y **qué confirmación está pendiente**. Todo eso lo comparten
 * dos paneles hermanos, así que tiene que estar por encima de los dos.
 *
 * Aquí NO vive el **texto** de ningún formulario (regla 3). Cada campo guarda lo que se
 * teclea en un `useState` local del componente que lo pinta: si cada tecla despachara a
 * este reductor, cada tecla volvería a renderizar la app entera, y si además entrara al
 * reductor de datos, cada tecla despertaría el ciclo de persistencia.
 */

import { createContext, useContext, useMemo, useReducer, type ReactNode } from 'react';

/** Las vistas globales. «Tiempos» se sumó con el reloj de resolución. */
export type IdVistaGlobal =
  | 'panorama'
  | 'sprint'
  | 'bloqueos'
  | 'terminadas'
  | 'backlog'
  | 'carga'
  | 'tiempos';

/**
 * Las tres secciones de Administración (E12).
 *
 * Son secciones de UNA vista y no tres vistas globales más: las tres editan el mismo
 * catálogo —proyectos, personas y la relación entre ambos— y el usuario entra a
 * «administrar», no a «ver equipos». Meterlas en `IdVistaGlobal` las habría mezclado en la
 * lista de vistas de consulta, que es justo lo contrario de lo que son.
 */
export type SeccionAdmin = 'proyectos' | 'personas' | 'equipos';

/** Las vistas a las que se llega desde la barra lateral. Son a las que se puede volver. */
export type VistaSimple =
  | { tipo: 'proyecto'; clave: string }
  | { tipo: 'global'; id: IdVistaGlobal }
  | { tipo: 'admin'; seccion: SeccionAdmin };

export type Vista =
  | VistaSimple
  /**
   * E8 — el cierre de sprint es una VISTA COMPLETA, no un modal. Catorce decisiones no
   * caben en un cuadro de 400 px sin que el usuario pierda de vista lo que ya decidió, y
   * si cerrar cuesta, se deja de cerrar: todo se acumula en el sprint uno.
   *
   * Lleva el `sprintId` y no un booleano porque la pantalla tiene que seguir existiendo
   * DESPUÉS del cierre para enseñar el resumen, y para entonces ese sprint ya no es el
   * activo: buscarlo por «el activo» dejaría la pantalla en blanco justo al terminar.
   *
   * `regreso` es de dónde vino, para que «Cancelar» devuelva al usuario a la pantalla que
   * estaba mirando y no a un proyecto elegido por nosotros. `null` = todavía no había
   * elegido nada, y entonces se vuelve al primer proyecto igual que al arrancar.
   */
  | { tipo: 'cierre'; sprintId: string; regreso: VistaSimple | null };

/** ¿La vista ocupa el ancho de los dos paneles? Ninguna de estas tiene panel hermano. */
export function esVistaAncha(vista: Vista | null): boolean {
  return (
    vista !== null &&
    (vista.tipo === 'global' || vista.tipo === 'cierre' || vista.tipo === 'admin')
  );
}

/** «Terminadas» es una PESTAÑA del panel del árbol, no un tercer panel (CLAUDE.md). */
export type PestanaArbol = 'backlog' | 'terminadas';

/** Los tres niveles del árbol. Se usa para saber qué comando toca sin `instanceof`. */
export type ClaseNodo = 'epica' | 'historia' | 'tarea';

/**
 * Qué se está redactando ahora mismo. Es UNO a la vez a propósito: dos formularios
 * abiertos compiten por el foco y por la tecla Enter, y el usuario acaba escribiendo el
 * motivo de un bloqueo dentro del título de otra cosa.
 */
export type Redaccion =
  /** Los tres campos del compromiso, dentro de la tarjeta del sprint. */
  | { tipo: 'compromiso'; tareaId: string }
  /** Renombrar en línea, dentro de la propia fila del árbol. */
  | { tipo: 'titulo'; id: string; clase: ClaseNodo }
  /** Capturar. `padreId` es la clave del proyecto, el id de la épica o el de la historia. */
  | { tipo: 'capturar'; clase: ClaseNodo; padreId: string }
  /** Bandera de bloqueo con su nota obligatoria. */
  | { tipo: 'bloqueo'; tareaId: string }
  /**
   * E12 — capturar una tarea directamente en el Sprint global, sin pasar por el árbol.
   *
   * Comparte el mismo hueco que los demás formularios a propósito: si el usuario está
   * escribiendo un compromiso y abre esta captura, el compromiso se cierra en vez de
   * quedar los dos peleándose por Enter.
   */
  | { tipo: 'capturaSprint' };

/**
 * Un arrastre en curso. Se guarda además del `dataTransfer` del navegador porque el
 * payload de `dataTransfer` **no se puede leer durante `dragover`** (solo en `drop`), y
 * sin saber qué se arrastra no se puede decidir si una zona se ilumina o no.
 */
export interface Arrastre {
  tareaId: string;
  origen: 'arbol' | 'sprint';
}

/**
 * La ÚNICA confirmación de la app: borrar un contenedor con hijos. Lleva el conteo
 * porque «Borrar E3» y «Borrar E3 y sus 12 tareas» son dos preguntas distintas.
 */
export interface Confirmacion {
  clase: 'epica' | 'historia';
  id: string;
  titulo: string;
  tareas: number;
}

export interface EstadoInterfaz {
  /** `null` = todavía no se eligió nada; quien pinta cae al primer proyecto. */
  vista: Vista | null;
  /** Ids de épica e historia abiertos. Colapsado por omisión: solo se ven las épicas. */
  expandidos: ReadonlySet<string>;
  pestana: PestanaArbol;
  /** Conmutador del panel derecho: «Solo este proyecto» contra «Todo el sprint». */
  soloEsteProyecto: boolean;
  lateralColapsada: boolean;

  // --- E12 · Sprint global ---------------------------------------------
  /**
   * Conmutador de la vista global: «Solo lo mío» contra «Todo el sprint». **Arranca
   * activo.** Con once proyectos y cinco personas, el sprint sin filtrar deja de ser «mi
   * semana» y pasa a ser «la semana del área»: se abre y ya no se sabe qué te toca a ti.
   */
  soloMio: boolean;
  /**
   * Quién es «yo». `null` = todavía nadie lo eligió, y entonces quien pinta usa
   * `personaPorOmision` contra el documento vigente — mismo criterio que el proyecto
   * seleccionado, que se guarda como clave y se resuelve al pintar. El día que el esquema
   * tenga un campo de identidad, esto se convierte en su valor inicial y deja de deducirse.
   */
  yo: string | null;

  // --- E7 --------------------------------------------------------------
  /**
   * Nodo del árbol elegido por el usuario. `null` = nadie tocó nada todavía, y entonces
   * NO hay selección aunque sí haya parada de tabulador (ver `Arbol.tsx`).
   */
  nodoActivo: string | null;
  /**
   * Nonce de «devuélvele el foco al DOM». Se incrementa cuando el foco tiene que MOVERSE
   * de verdad (flechas, cerrar un formulario), y no cuando el nodo activo cambia porque
   * el navegador ya enfocó algo. Sin esta distinción, cada `onFocus` provocaría un
   * `.focus()` y el foco quedaría atrapado en el árbol.
   */
  focoArbol: number;
  /**
   * Nonce de «pasa a la fila siguiente». Lo pide quien cierra un formulario tras
   * confirmarlo; lo resuelve el árbol, que es el único que sabe qué fila viene después
   * —depende de qué está plegado y de qué pestaña se mira—. Así la cadena de mover diez
   * tareas es `S · Enter · S · Enter…` sin una flecha por medio.
   */
  siguienteArbol: number;
  redaccion: Redaccion | null;
  arrastre: Arrastre | null;
  confirmacion: Confirmacion | null;
  /** Último fallo de un comando. Se avisa y se puede reintentar; nunca se revierte nada. */
  aviso: string | null;
  /**
   * Última persona a la que se le asignó algo en esta sesión. Es el valor por omisión del
   * campo «Quién lo hace»: mover diez tareas al sprint casi siempre es asignárselas a la
   * misma persona, y escribirlo diez veces es lo que hace que se deje de escribir.
   */
  ultimaPersona: string | null;
  /**
   * Lo que se acaba de borrar y todavía se puede recuperar de un clic.
   *
   * Eliminar es la única mutación que no deja rastro en pantalla de lo que había: el resto
   * se ven porque el dato cambia a la vista. Ofrecer «Deshacer» en el momento es lo que
   * permite que la app no pregunte «¿seguro?» en cada borrado — la confirmación se reserva
   * para lo que se lleva hijos por delante, y para todo lo demás basta con poder volver.
   */
  revertible: string | null;
}

/*
 * Aquí vivía `pilaDeshacer`: una lista de etiquetas que el renderer mantenía en paralelo
 * a la pila real del proceso principal. Se borró porque eran dos pilas que podían
 * separarse: una escritura fallida no crece la de allá y sí crecía la de aquí, y desde
 * ese instante el menú nombraba un paso distinto del que iba a revertir, en silencio y
 * para siempre. El nombre lo da ahora `instantanea.etiquetaDeshacer`, que sale del mismo
 * evento que apiló el documento: una sola fuente, imposible de descuadrar.
 */


type AccionInterfaz =
  | { tipo: 'verProyecto'; clave: string }
  | { tipo: 'irATarea'; clave: string; abrir: readonly string[]; tareaId: string }
  | { tipo: 'verGlobal'; id: IdVistaGlobal }
  | { tipo: 'verAdmin'; seccion: SeccionAdmin }
  | { tipo: 'alcanceMio'; soloMio: boolean }
  | { tipo: 'elegirYo'; personaId: string | null }
  | { tipo: 'verCierre'; sprintId: string }
  | { tipo: 'salirDelCierre' }
  | { tipo: 'alternarNodo'; id: string }
  | { tipo: 'expandir'; ids: readonly string[] }
  | { tipo: 'colapsarTodo' }
  | { tipo: 'pestana'; pestana: PestanaArbol }
  | { tipo: 'alcanceSprint'; soloEsteProyecto: boolean }
  | { tipo: 'alternarLateral' }
  | { tipo: 'enfocarNodo'; id: string }
  | { tipo: 'irANodo'; id: string }
  | { tipo: 'irASiguiente' }
  | { tipo: 'redactar'; redaccion: Redaccion | null }
  | { tipo: 'arrastrar'; arrastre: Arrastre | null }
  | { tipo: 'confirmar'; confirmacion: Confirmacion | null }
  | { tipo: 'avisar'; aviso: string | null }
  | { tipo: 'recordarPersona'; personaId: string | null }
  | { tipo: 'ofrecerDeshacer'; que: string | null };


const INICIAL: EstadoInterfaz = {
  vista: null,
  expandidos: new Set(),
  pestana: 'backlog',
  soloEsteProyecto: true,
  lateralColapsada: false,
  soloMio: true,
  yo: null,
  nodoActivo: null,
  focoArbol: 0,
  siguienteArbol: 0,
  redaccion: null,
  arrastre: null,
  confirmacion: null,
  aviso: null,
  ultimaPersona: null,
  revertible: null,
};


function reducir(estado: EstadoInterfaz, accion: AccionInterfaz): EstadoInterfaz {
  switch (accion.tipo) {
    case 'verProyecto': {
      if (estado.vista?.tipo === 'proyecto' && estado.vista.clave === accion.clave) return estado;
      // Cambiar de proyecto reinicia el plegado y la pestaña: los ids expandidos son de
      // otro árbol, y arrastrarlos deja la vista nueva en un estado que nadie pidió. Con
      // la misma razón se cierra lo que hubiera abierto: un formulario apuntando a una
      // tarea de otro proyecto no se puede pintar en ningún sitio.
      return {
        ...estado,
        vista: { tipo: 'proyecto', clave: accion.clave },
        expandidos: new Set(),
        pestana: 'backlog',
        nodoActivo: null,
        redaccion: null,
        arrastre: null,
      };
    }
    /**
     * E9–E11 — «Ir a la tarea» desde una vista global.
     *
     * Es UNA acción y no tres despachos encadenados porque los tres pasos son
     * indivisibles: cambiar de proyecto RESETEA el plegado, así que expandir en un
     * despacho aparte dependería de que llegara después, y bastaría una reordenación
     * para que la tarea quedara enterrada bajo una épica cerrada.
     *
     * La pestaña se fuerza a «backlog» aunque la tarea esté hecha: esa pestaña pinta el
     * árbol entero, y «Terminadas» filtra. Llegar a una tarea y no verla porque la
     * pestaña la esconde es peor que no ofrecer el salto.
     */
    case 'irATarea':
      return {
        ...estado,
        vista: { tipo: 'proyecto', clave: accion.clave },
        expandidos: new Set(accion.abrir),
        pestana: 'backlog',
        nodoActivo: accion.tareaId,
        // El nonce mueve el foco de verdad: el usuario venía de otra pantalla y el
        // teclado tiene que aterrizar en la fila, no en el principio del árbol.
        focoArbol: estado.focoArbol + 1,
        redaccion: null,
        arrastre: null,
      };

    case 'verGlobal':
      if (estado.vista?.tipo === 'global' && estado.vista.id === accion.id) return estado;
      return { ...estado, vista: { tipo: 'global', id: accion.id }, redaccion: null, arrastre: null };

    case 'verAdmin':
      if (estado.vista?.tipo === 'admin' && estado.vista.seccion === accion.seccion) return estado;
      // Se cierra lo que hubiera abierto por la misma razón de siempre: un formulario que
      // apunta a una tarjeta del sprint no se puede pintar en una pantalla sin tarjetas.
      return {
        ...estado,
        vista: { tipo: 'admin', seccion: accion.seccion },
        redaccion: null,
        arrastre: null,
      };

    case 'alcanceMio':
      return estado.soloMio === accion.soloMio ? estado : { ...estado, soloMio: accion.soloMio };
    case 'elegirYo':
      return estado.yo === accion.personaId ? estado : { ...estado, yo: accion.personaId };

    case 'verCierre': {
      if (estado.vista?.tipo === 'cierre' && estado.vista.sprintId === accion.sprintId) return estado;
      // Entrar dos veces al cierre no debe encadenar regresos: el punto de partida sigue
      // siendo la última vista NORMAL, no la pantalla de cierre anterior.
      const regreso = estado.vista?.tipo === 'cierre' ? estado.vista.regreso : estado.vista;
      // Se cierra lo que hubiera abierto: un formulario de compromiso apuntando a una
      // tarjeta del sprint no se puede pintar en una pantalla que ya no tiene tarjetas.
      return {
        ...estado,
        vista: { tipo: 'cierre', sprintId: accion.sprintId, regreso },
        redaccion: null,
        arrastre: null,
      };
    }
    case 'salirDelCierre':
      if (estado.vista?.tipo !== 'cierre') return estado;
      return { ...estado, vista: estado.vista.regreso };

    case 'alternarNodo': {
      const expandidos = new Set(estado.expandidos);
      if (!expandidos.delete(accion.id)) expandidos.add(accion.id);
      return { ...estado, expandidos };
    }
    case 'expandir':
      return { ...estado, expandidos: new Set([...estado.expandidos, ...accion.ids]) };
    case 'colapsarTodo':
      return estado.expandidos.size === 0 ? estado : { ...estado, expandidos: new Set() };

    case 'pestana':
      // La pestaña «Terminadas» no admite edición ni arrastre: cerrar lo abierto al
      // cambiar evita un formulario colgado sobre una fila que ya no se pinta.
      return estado.pestana === accion.pestana
        ? estado
        : { ...estado, pestana: accion.pestana, redaccion: null, arrastre: null };
    case 'alcanceSprint':
      return estado.soloEsteProyecto === accion.soloEsteProyecto
        ? estado
        : { ...estado, soloEsteProyecto: accion.soloEsteProyecto };
    case 'alternarLateral':
      return { ...estado, lateralColapsada: !estado.lateralColapsada };

    case 'enfocarNodo':
      // Viene de un `onFocus` real del DOM: se anota quién manda, pero NO se pide mover
      // el foco (ya está movido).
      return estado.nodoActivo === accion.id ? estado : { ...estado, nodoActivo: accion.id };
    case 'irANodo':
      return { ...estado, nodoActivo: accion.id, focoArbol: estado.focoArbol + 1 };
    case 'irASiguiente':
      return { ...estado, siguienteArbol: estado.siguienteArbol + 1 };

    case 'redactar':
      return { ...estado, redaccion: accion.redaccion };
    case 'arrastrar':
      return { ...estado, arrastre: accion.arrastre };
    case 'confirmar':
      return { ...estado, confirmacion: accion.confirmacion };
    case 'avisar':
      return estado.aviso === accion.aviso ? estado : { ...estado, aviso: accion.aviso };
    case 'recordarPersona':
      return { ...estado, ultimaPersona: accion.personaId };
    case 'ofrecerDeshacer':
      return estado.revertible === accion.que ? estado : { ...estado, revertible: accion.que };
  }
}


export interface AccionesInterfaz {
  verProyecto(clave: string): void;
  /**
   * Abre el proyecto, despliega el camino hasta la tarea y le pone el foco. `abrir` son
   * los ids de la épica y de la historia que la contienen.
   */
  irATarea(clave: string, abrir: readonly string[], tareaId: string): void;
  verGlobal(id: IdVistaGlobal): void;
  /** Abre una de las tres secciones de Administración. */
  verAdmin(seccion: SeccionAdmin): void;
  /** Conmutador «Solo lo mío / Todo el sprint» de la vista global. */
  cambiarAlcanceMio(soloMio: boolean): void;
  /** Corrige quién es «yo». `null` vuelve a la persona deducida del documento. */
  elegirYo(personaId: string | null): void;
  /** Abre la pantalla de cierre de ese sprint. Todavía no cierra nada. */
  verCierre(sprintId: string): void;
  /** Vuelve a la vista desde la que se entró al cierre. */
  salirDelCierre(): void;
  alternarNodo(id: string): void;
  expandir(ids: readonly string[]): void;
  colapsarTodo(): void;
  cambiarPestana(pestana: PestanaArbol): void;
  cambiarAlcanceSprint(soloEsteProyecto: boolean): void;
  alternarLateral(): void;
  /** El DOM ya movió el foco aquí. Solo se anota. */
  enfocarNodo(id: string): void;
  /** Mueve el foco del árbol a este nodo de verdad. */
  irANodo(id: string): void;
  /** Pide al árbol que baje una fila desde la activa. */
  irASiguiente(): void;
  redactar(redaccion: Redaccion | null): void;
  arrastrar(arrastre: Arrastre | null): void;
  confirmar(confirmacion: Confirmacion | null): void;
  avisar(aviso: string | null): void;
  recordarPersona(personaId: string | null): void;
  /** Ofrece recuperar lo que se acaba de borrar. `null` retira la oferta. */
  ofrecerDeshacer(que: string | null): void;
}


const ContextoInterfaz = createContext<EstadoInterfaz | null>(null);
const ContextoAccionesInterfaz = createContext<AccionesInterfaz | null>(null);

export function ProveedorInterfaz({ children }: { children: ReactNode }) {
  const [estado, despachar] = useReducer(reducir, INICIAL);

  const acciones = useMemo<AccionesInterfaz>(
    () => ({
      verProyecto: (clave) => despachar({ tipo: 'verProyecto', clave }),
      irATarea: (clave, abrir, tareaId) => despachar({ tipo: 'irATarea', clave, abrir, tareaId }),
      verGlobal: (id) => despachar({ tipo: 'verGlobal', id }),
      verAdmin: (seccion) => despachar({ tipo: 'verAdmin', seccion }),
      cambiarAlcanceMio: (soloMio) => despachar({ tipo: 'alcanceMio', soloMio }),
      elegirYo: (personaId) => despachar({ tipo: 'elegirYo', personaId }),
      verCierre: (sprintId) => despachar({ tipo: 'verCierre', sprintId }),
      salirDelCierre: () => despachar({ tipo: 'salirDelCierre' }),
      alternarNodo: (id) => despachar({ tipo: 'alternarNodo', id }),
      expandir: (ids) => despachar({ tipo: 'expandir', ids }),
      colapsarTodo: () => despachar({ tipo: 'colapsarTodo' }),
      cambiarPestana: (pestana) => despachar({ tipo: 'pestana', pestana }),
      cambiarAlcanceSprint: (soloEsteProyecto) =>
        despachar({ tipo: 'alcanceSprint', soloEsteProyecto }),
      alternarLateral: () => despachar({ tipo: 'alternarLateral' }),
      enfocarNodo: (id) => despachar({ tipo: 'enfocarNodo', id }),
      irANodo: (id) => despachar({ tipo: 'irANodo', id }),
      irASiguiente: () => despachar({ tipo: 'irASiguiente' }),
      redactar: (redaccion) => despachar({ tipo: 'redactar', redaccion }),
      arrastrar: (arrastre) => despachar({ tipo: 'arrastrar', arrastre }),
      confirmar: (confirmacion) => despachar({ tipo: 'confirmar', confirmacion }),
      avisar: (aviso) => despachar({ tipo: 'avisar', aviso }),
      recordarPersona: (personaId) => despachar({ tipo: 'recordarPersona', personaId }),
      ofrecerDeshacer: (que) => despachar({ tipo: 'ofrecerDeshacer', que }),
    }),
    [],
  );

  return (
    <ContextoAccionesInterfaz.Provider value={acciones}>
      <ContextoInterfaz.Provider value={estado}>{children}</ContextoInterfaz.Provider>
    </ContextoAccionesInterfaz.Provider>
  );
}

export function useInterfaz(): EstadoInterfaz {
  const estado = useContext(ContextoInterfaz);
  if (estado === null) throw new Error('useInterfaz fuera de <ProveedorInterfaz>');
  return estado;
}

export function useAccionesInterfaz(): AccionesInterfaz {
  const acciones = useContext(ContextoAccionesInterfaz);
  if (acciones === null) throw new Error('useAccionesInterfaz fuera de <ProveedorInterfaz>');
  return acciones;
}
