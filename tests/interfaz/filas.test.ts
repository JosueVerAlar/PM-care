/**
 * Qué filas ve el usuario en el árbol, y en qué orden.
 *
 * Es la primera prueba de interfaz del proyecto y no monta un DOM: `construirFilas` se
 * sacó de `Arbol.tsx` justamente para que la decisión de QUÉ SE VE se pueda medir con
 * datos. Lo que sigue sin cubrirse es cómo se pinta cada fila; eso viene después.
 *
 * El caso que motiva el archivo es N9 (regla 18): en el Jira real, cinco de los once
 * proyectos no tienen nivel de historia, y las 12 tareas abiertas de Infraestructura
 * cuelgan directamente de una épica. Antes de esto, el árbol no las pintaba: el usuario
 * habría abierto el proyecto y visto una épica vacía.
 */

import { describe, expect, it } from 'vitest';

import { construirFilas } from '../../src/renderer/vistas/proyecto/filas';
import { estaHecha } from '../../src/compartido/dominio/clasificar';
import {
  unProyecto,
  unaEpica,
  unaHistoria,
  unaTarea,
} from '../apoyo/constructores';

const CLAVE = 'PM';

/** Ids en el orden en que se pintan. Es lo que se lee de arriba abajo. */
const ids = (filas: ReturnType<typeof construirFilas>) => filas.map((f) => f.id);
const niveles = (filas: ReturnType<typeof construirFilas>) =>
  filas.map((f) => `${f.id}:${f.nivel}`);

/** Todo abierto: lo que importa aquí es la forma del árbol, no el plegado. */
const TODO = (...ids: string[]) => new Set(ids);

describe('construirFilas · el árbol clásico de tres niveles', () => {
  const tarea = unaTarea({ clave: CLAVE, id: 'PM-T1' });
  const historia = unaHistoria({ clave: CLAVE, id: 'PM-H1', tareas: [tarea] });
  const epica = unaEpica({ clave: CLAVE, id: 'PM-E1', historias: [historia] });
  const proyecto = unProyecto({ clave: CLAVE, epicas: [epica] });

  it('colapsado solo enseña las épicas', () => {
    expect(ids(construirFilas(proyecto, undefined, new Set()))).toEqual(['PM-E1']);
  });

  it('abierto enseña los tres niveles, con su nivel ARIA', () => {
    const filas = construirFilas(proyecto, undefined, TODO('PM-E1', 'PM-H1'));
    expect(niveles(filas)).toEqual(['PM-E1:1', 'PM-H1:2', 'PM-T1:3']);
  });

  it('una épica sin nada debajo no es expandible', () => {
    const vacia = unProyecto({ clave: CLAVE, epicas: [unaEpica({ clave: CLAVE, id: 'PM-E9' })] });
    const [fila] = construirFilas(vacia, undefined, new Set());
    expect(fila?.tipo === 'epica' && fila.expandible).toBe(false);
  });
});

describe('construirFilas · regla 18 · la jerarquía es opcional', () => {
  /**
   * La forma real de Infraestructura: una épica, ninguna historia, tres tareas colgando.
   */
  const infra = () =>
    unProyecto({
      clave: CLAVE,
      epicas: [
        unaEpica({
          clave: CLAVE,
          id: 'PM-E1',
          historias: [],
          tareas: [
            unaTarea({ clave: CLAVE, id: 'PM-T1' }),
            unaTarea({ clave: CLAVE, id: 'PM-T2' }),
          ],
        }),
      ],
    });

  it('una épica con tareas propias SÍ es expandible', () => {
    const [fila] = construirFilas(infra(), undefined, new Set());
    expect(fila?.tipo === 'epica' && fila.expandible).toBe(true);
  });

  it('las tareas de la épica se pintan al nivel 2, donde estarían sus historias', () => {
    const filas = construirFilas(infra(), undefined, TODO('PM-E1'));
    expect(niveles(filas)).toEqual(['PM-E1:1', 'PM-T1:2', 'PM-T2:2']);
  });

  it('su padre es la épica, y no fingen tener historia', () => {
    const [, primera] = construirFilas(infra(), undefined, TODO('PM-E1'));
    expect(primera?.tipo).toBe('tarea');
    if (primera?.tipo === 'tarea') {
      expect(primera.padre).toBe('PM-E1');
      expect(primera.historia).toBeNull();
      expect(primera.epica?.id).toBe('PM-E1');
    }
  });

  /** La forma de PULSO: trabajo continuo, sin una sola épica. */
  const continuo = () =>
    unProyecto({
      clave: CLAVE,
      epicas: [],
      tareas: [
        unaTarea({ clave: CLAVE, id: 'PM-T1' }),
        unaTarea({ clave: CLAVE, id: 'PM-T2' }),
      ],
    });

  it('un proyecto sin épicas enseña sus tareas al nivel 1, sin plegar nada', () => {
    const filas = construirFilas(continuo(), undefined, new Set());
    expect(niveles(filas)).toEqual(['PM-T1:1', 'PM-T2:1']);
  });

  it('el padre de una tarea suelta es la CLAVE del proyecto, que es lo que espera el comando', () => {
    const [primera] = construirFilas(continuo(), undefined, new Set());
    if (primera?.tipo === 'tarea') {
      expect(primera.padre).toBe(CLAVE);
      expect(primera.orden.padre).toBe(CLAVE);
      expect(primera.epica).toBeNull();
    }
  });

  /**
   * El orden dentro de un contenedor: primero lo que agrupa, después lo suelto. Es la
   * convención del Finder —carpetas antes que archivos— y evita que una tarea suelta
   * separe visualmente dos historias hermanas.
   */
  it('lo que agrupa va antes que lo suelto, en los dos niveles', () => {
    const mixto = unProyecto({
      clave: CLAVE,
      epicas: [
        unaEpica({
          clave: CLAVE,
          id: 'PM-E1',
          historias: [unaHistoria({ clave: CLAVE, id: 'PM-H1', tareas: [unaTarea({ clave: CLAVE, id: 'PM-T1' })] })],
          tareas: [unaTarea({ clave: CLAVE, id: 'PM-T2' })],
        }),
      ],
      tareas: [unaTarea({ clave: CLAVE, id: 'PM-T3' })],
    });
    const filas = construirFilas(mixto, undefined, TODO('PM-E1', 'PM-H1'));
    expect(niveles(filas)).toEqual(['PM-E1:1', 'PM-H1:2', 'PM-T1:3', 'PM-T2:2', 'PM-T3:1']);
  });

  /**
   * `aria-posinset` / `aria-setsize`: quien oye «2 de 2» tiene que poder contar dos filas
   * en ese nivel. Una tarea suelta del proyecto es hermana de las épicas, no un caso
   * aparte, así que entra en la misma cuenta.
   */
  it('las tareas sueltas cuentan como hermanas de las épicas para el anuncio', () => {
    const mixto = unProyecto({
      clave: CLAVE,
      epicas: [unaEpica({ clave: CLAVE, id: 'PM-E1' })],
      tareas: [unaTarea({ clave: CLAVE, id: 'PM-T1' })],
    });
    const filas = construirFilas(mixto, undefined, new Set());
    expect(filas.map((f) => `${f.posicion}/${f.hermanos}`)).toEqual(['1/2', '2/2']);
  });

  /**
   * El índice de reordenar sale de la lista REAL, no de la pintada: es lo que se manda en
   * el comando. Con un filtro activo las dos cuentas difieren, y confundirlas movería la
   * tarea a un sitio que el usuario no señaló.
   */
  it('el índice de orden es el del documento, aunque el filtro esconda hermanas', () => {
    const proyecto = unProyecto({
      clave: CLAVE,
      epicas: [],
      tareas: [
        unaTarea({ clave: CLAVE, id: 'PM-T1', estado: 'pendiente' }),
        unaTarea({ clave: CLAVE, id: 'PM-T2', estado: 'hecha' }),
      ],
    });
    const filas = construirFilas(proyecto, undefined, new Set(), estaHecha);
    expect(ids(filas)).toEqual(['PM-T2']);
    const [sola] = filas;
    if (sola?.tipo === 'tarea') {
      expect(sola.orden.indice, 'la posición real, no la filtrada').toBe(1);
      expect(sola.orden.hermanos).toBe(2);
      expect(sola.posicion, 'lo que se anuncia sí es la cuenta filtrada').toBe(1);
    }
  });

  it('un filtro que no deja nada deja el árbol vacío, no una épica fantasma', () => {
    const filas = construirFilas(infra(), undefined, TODO('PM-E1'), estaHecha);
    expect(filas).toEqual([]);
  });
});
