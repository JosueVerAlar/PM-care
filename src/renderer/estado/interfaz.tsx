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
 */

import { createContext, useContext, useMemo, useReducer, type ReactNode } from 'react';

/** Las siete vistas globales del plan. Marcadores de posición hasta E10 y E11. */
export type IdVistaGlobal =
  | 'panorama'
  | 'sprint'
  | 'bloqueos'
  | 'terminadas'
  | 'backlog'
  | 'carga'
  | 'equipos';

export type Vista =
  | { tipo: 'proyecto'; clave: string }
  | { tipo: 'global'; id: IdVistaGlobal };

/** «Terminadas» es una PESTAÑA del panel del árbol, no un tercer panel (CLAUDE.md). */
export type PestanaArbol = 'backlog' | 'terminadas';

export interface EstadoInterfaz {
  /** `null` = todavía no se eligió nada; quien pinta cae al primer proyecto. */
  vista: Vista | null;
  /** Ids de épica e historia abiertos. Colapsado por omisión: solo se ven las épicas. */
  expandidos: ReadonlySet<string>;
  pestana: PestanaArbol;
  /** Conmutador del panel derecho: «Solo este proyecto» contra «Todo el sprint». */
  soloEsteProyecto: boolean;
  lateralColapsada: boolean;
}

type AccionInterfaz =
  | { tipo: 'verProyecto'; clave: string }
  | { tipo: 'verGlobal'; id: IdVistaGlobal }
  | { tipo: 'alternarNodo'; id: string }
  | { tipo: 'expandir'; ids: readonly string[] }
  | { tipo: 'colapsarTodo' }
  | { tipo: 'pestana'; pestana: PestanaArbol }
  | { tipo: 'alcanceSprint'; soloEsteProyecto: boolean }
  | { tipo: 'alternarLateral' };

const INICIAL: EstadoInterfaz = {
  vista: null,
  expandidos: new Set(),
  pestana: 'backlog',
  soloEsteProyecto: true,
  lateralColapsada: false,
};

function reducir(estado: EstadoInterfaz, accion: AccionInterfaz): EstadoInterfaz {
  switch (accion.tipo) {
    case 'verProyecto': {
      if (estado.vista?.tipo === 'proyecto' && estado.vista.clave === accion.clave) return estado;
      // Cambiar de proyecto reinicia el plegado y la pestaña: los ids expandidos son de
      // otro árbol, y arrastrarlos deja la vista nueva en un estado que nadie pidió.
      return {
        ...estado,
        vista: { tipo: 'proyecto', clave: accion.clave },
        expandidos: new Set(),
        pestana: 'backlog',
      };
    }
    case 'verGlobal':
      if (estado.vista?.tipo === 'global' && estado.vista.id === accion.id) return estado;
      return { ...estado, vista: { tipo: 'global', id: accion.id } };

    case 'alternarNodo': {
      const expandidos = new Set(estado.expandidos);
      if (!expandidos.delete(accion.id)) expandidos.add(accion.id);
      return { ...estado, expandidos };
    }
    case 'expandir':
      return { ...estado, expandidos: new Set(accion.ids) };
    case 'colapsarTodo':
      return estado.expandidos.size === 0 ? estado : { ...estado, expandidos: new Set() };

    case 'pestana':
      return estado.pestana === accion.pestana ? estado : { ...estado, pestana: accion.pestana };
    case 'alcanceSprint':
      return estado.soloEsteProyecto === accion.soloEsteProyecto
        ? estado
        : { ...estado, soloEsteProyecto: accion.soloEsteProyecto };
    case 'alternarLateral':
      return { ...estado, lateralColapsada: !estado.lateralColapsada };
  }
}

export interface AccionesInterfaz {
  verProyecto(clave: string): void;
  verGlobal(id: IdVistaGlobal): void;
  alternarNodo(id: string): void;
  expandir(ids: readonly string[]): void;
  colapsarTodo(): void;
  cambiarPestana(pestana: PestanaArbol): void;
  cambiarAlcanceSprint(soloEsteProyecto: boolean): void;
  alternarLateral(): void;
}

const ContextoInterfaz = createContext<EstadoInterfaz | null>(null);
const ContextoAccionesInterfaz = createContext<AccionesInterfaz | null>(null);

export function ProveedorInterfaz({ children }: { children: ReactNode }) {
  const [estado, despachar] = useReducer(reducir, INICIAL);

  const acciones = useMemo<AccionesInterfaz>(
    () => ({
      verProyecto: (clave) => despachar({ tipo: 'verProyecto', clave }),
      verGlobal: (id) => despachar({ tipo: 'verGlobal', id }),
      alternarNodo: (id) => despachar({ tipo: 'alternarNodo', id }),
      expandir: (ids) => despachar({ tipo: 'expandir', ids }),
      colapsarTodo: () => despachar({ tipo: 'colapsarTodo' }),
      cambiarPestana: (pestana) => despachar({ tipo: 'pestana', pestana }),
      cambiarAlcanceSprint: (soloEsteProyecto) =>
        despachar({ tipo: 'alcanceSprint', soloEsteProyecto }),
      alternarLateral: () => despachar({ tipo: 'alternarLateral' }),
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
