/**
 * La ceremonia de cierre de sprint: `cerrarSprint` con `decisiones`.
 *
 * `sprint.test.ts` cubre el cierre como comando (desenlaces que salen del estado,
 * materialización, inmutabilidad posterior). Este archivo cubre lo que la ceremonia
 * añadió encima, que es donde está el riesgo:
 *
 * - **Los tres destinos hacen tres cosas distintas al DOCUMENTO**, no solo al desenlace
 *   del item: `descartar` cancela la tarea, `backlog` y `descartar` vuelcan el compromiso
 *   que vivía solo en el item, y `siguiente` la pasa al sprint que sigue.
 * - **Las decisiones se validan enteras antes de tocar nada.** Medio cierre aplicado
 *   dejaría el sprint cerrado —y por tanto inmutable, regla 8— con las últimas tareas sin
 *   destino. Por eso la atomicidad se comprueba con el DOCUMENTO ENTERO y no con un
 *   campo: un rechazo que ya canceló una tarea es exactamente el fallo que se busca.
 * - **El sprint siguiente nace `planeado`, nunca activo.** El documento solo admite un
 *   activo (esquema), así que crearlo activo haría fallar el cierre —con
 *   `documento-invalido`— en un escenario perfectamente legítimo: cerrar un sprint
 *   planeado mientras otro sigue corriendo.
 */

import { describe, expect, it } from 'vitest';

import { sprintsQueLaTocaron } from '../../src/compartido/dominio/clasificar';
import type { Documento, Persona, Sprint, Tarea } from '../../src/compartido/modelo/tipos';
import { reducir } from '../../src/principal/comandos/reductor';
import { validarComando } from '../../src/principal/comandos/tipos';
import {
  AHORA,
  copiaProfunda,
  exigirError,
  exigirOk,
  exigirValido,
  reducirSinMutar,
} from '../apoyo/comandos';
import {
  unDocumento,
  unaEpica,
  unaHistoria,
  unaPersona,
  unProyecto,
  unSprint,
  unaTarea,
  unItem,
} from '../apoyo/constructores';

const CLAVE = 'PM';

/** Un proyecto con las tareas dadas colgando de una épica y una historia. */
function unProyectoCon(tareas: Tarea[], clave = CLAVE) {
  return unProyecto({
    clave,
    epicas: [unaEpica({ clave, historias: [unaHistoria({ clave, tareas })] })],
  });
}

/** El sprint que se cierra en casi todo el archivo: activo, del 24-ago al 4-sep. */
function sprintCon(ids: readonly string[], over: Partial<Sprint> = {}): Sprint {
  return unSprint({
    id: 'S-34',
    nombre: 'Sprint 34',
    estado: 'activo',
    inicio: '2026-08-24',
    fin: '2026-09-04',
    items: ids.map((id) => unItem(id)),
    ...over,
  });
}

function docCon(tareas: Tarea[], sprints: Sprint[], personas: Persona[] = []): Documento {
  const doc = unDocumento({ personas, proyectos: [unProyectoCon(tareas)], sprints });
  exigirValido(doc, 'fixture de la ceremonia de cierre');
  return doc;
}

/** Las tareas del primer proyecto, indexadas por id. */
function tareasDe(doc: Documento, indiceProyecto = 0): Map<string, Tarea> {
  const mapa = new Map<string, Tarea>();
  for (const epica of doc.proyectos[indiceProyecto]?.epicas ?? []) {
    for (const historia of epica.historias) {
      for (const tarea of historia.tareas) mapa.set(tarea.id, tarea);
    }
  }
  return mapa;
}

const sprintDe = (doc: Documento, id: string): Sprint | undefined =>
  doc.sprints.find((s) => s.id === id);

const idsDeItems = (sprint: Sprint | undefined): string[] =>
  sprint?.items.map((i) => i.tarea_id) ?? [];

// --- los tres destinos ------------------------------------------------------

describe('cerrarSprint — los tres destinos', () => {
  /** Hecha, cancelada y tres abiertas para repartir entre los tres destinos. */
  function conCincoTareas(): Documento {
    return docCon(
      [
        unaTarea({ id: 'PM-T1', clave: CLAVE, estado: 'hecha' }),
        unaTarea({ id: 'PM-T2', clave: CLAVE, estado: 'en_curso' }),
        unaTarea({ id: 'PM-T3', clave: CLAVE, estado: 'pendiente' }),
        unaTarea({ id: 'PM-T4', clave: CLAVE, estado: 'pendiente' }),
        unaTarea({ id: 'PM-T5', clave: CLAVE, estado: 'cancelada' }),
      ],
      [sprintCon(['PM-T1', 'PM-T2', 'PM-T3', 'PM-T4', 'PM-T5'])],
    );
  }

  it('los tres destinos y los dos constatados, en un solo cierre', () => {
    const { documento } = exigirOk(
      reducirSinMutar(conCincoTareas(), {
        comando: 'cerrarSprint',
        sprintId: 'S-34',
        decisiones: [
          { tareaId: 'PM-T2', destino: 'siguiente' },
          { tareaId: 'PM-T3', destino: 'backlog' },
          { tareaId: 'PM-T4', destino: 'descartar' },
        ],
      }),
    );
    expect(sprintDe(documento, 'S-34')?.items.map((i) => i.desenlace)).toEqual([
      'completada',
      'arrastrada',
      'devuelta',
      'descartada',
      'cancelada',
    ]);
  });

  it('descartar CANCELA la tarea: «ya no aplica» es una afirmación sobre la tarea', () => {
    // Si solo la sacara del sprint, volvería al backlog como pendiente y seguiría contando
    // en todos los denominadores y en la carga de su responsable.
    const { documento } = exigirOk(
      reducirSinMutar(conCincoTareas(), {
        comando: 'cerrarSprint',
        sprintId: 'S-34',
        decisiones: [
          { tareaId: 'PM-T2', destino: 'backlog' },
          { tareaId: 'PM-T3', destino: 'backlog' },
          { tareaId: 'PM-T4', destino: 'descartar' },
        ],
      }),
    );
    const tareas = tareasDe(documento);
    expect(tareas.get('PM-T4')?.estado).toBe('cancelada');
    // Y solo esa: las otras dos decisiones no tocan el estado de nadie.
    expect(tareas.get('PM-T2')?.estado).toBe('en_curso');
    expect(tareas.get('PM-T3')?.estado).toBe('pendiente');
    expect(tareas.get('PM-T1')?.estado).toBe('hecha');
  });

  it('backlog saca del ciclo sin cancelar y sin pasar a ningún otro sprint', () => {
    const { documento } = exigirOk(
      reducirSinMutar(conCincoTareas(), {
        comando: 'cerrarSprint',
        sprintId: 'S-34',
        decisiones: [
          { tareaId: 'PM-T2', destino: 'backlog' },
          { tareaId: 'PM-T3', destino: 'backlog' },
          { tareaId: 'PM-T4', destino: 'backlog' },
        ],
      }),
    );
    expect(tareasDe(documento).get('PM-T2')?.estado).toBe('en_curso');
    // Sin nada que arrastrar no se crea sprint siguiente: cerrar no deja sprints de recuerdo.
    expect(documento.sprints).toHaveLength(1);
  });

  it('siguiente pasa la tarea al sprint que sigue, y ahí llega sin desenlace', () => {
    const { documento } = exigirOk(
      reducirSinMutar(conCincoTareas(), {
        comando: 'cerrarSprint',
        sprintId: 'S-34',
        decisiones: [
          { tareaId: 'PM-T2', destino: 'siguiente' },
          { tareaId: 'PM-T3', destino: 'backlog' },
          { tareaId: 'PM-T4', destino: 'descartar' },
        ],
      }),
    );
    const siguiente = sprintDe(documento, 'S-35');
    expect(idsDeItems(siguiente)).toEqual(['PM-T2']);
    expect(siguiente?.items[0]?.desenlace).toBeNull();
  });

  it('lo que no se nombra va a siguiente: cerrar sin tocar nada hace lo normal', () => {
    const { documento } = exigirOk(
      reducirSinMutar(conCincoTareas(), {
        comando: 'cerrarSprint',
        sprintId: 'S-34',
        decisiones: [{ tareaId: 'PM-T3', destino: 'backlog' }],
      }),
    );
    expect(sprintDe(documento, 'S-34')?.items.map((i) => i.desenlace)).toEqual([
      'completada',
      'arrastrada', // PM-T2, no nombrada
      'devuelta',
      'arrastrada', // PM-T4, no nombrada
      'cancelada',
    ]);
    expect(idsDeItems(sprintDe(documento, 'S-35'))).toEqual(['PM-T2', 'PM-T4']);
  });

  it('sin el campo decisiones, todo lo abierto se arrastra', () => {
    const { documento } = exigirOk(
      reducirSinMutar(conCincoTareas(), { comando: 'cerrarSprint', sprintId: 'S-34' }),
    );
    expect(idsDeItems(sprintDe(documento, 'S-35'))).toEqual(['PM-T2', 'PM-T3', 'PM-T4']);
  });

  it('un array de decisiones VACÍO se comporta igual que omitirlo', () => {
    // El MISMO documento de partida en los dos: los constructores numeran los títulos con
    // un contador de módulo, y dos fixtures distintos no serían comparables.
    const doc = conCincoTareas();
    const conArray = exigirOk(
      reducirSinMutar(doc, { comando: 'cerrarSprint', sprintId: 'S-34', decisiones: [] }),
    ).documento;
    const sinCampo = exigirOk(
      reducirSinMutar(doc, { comando: 'cerrarSprint', sprintId: 'S-34' }),
    ).documento;
    expect(conArray).toEqual(sinCampo);
  });

  it('un sprint SIN pendientes se cierra sin decisiones y no crea sprint siguiente', () => {
    const doc = docCon(
      [
        unaTarea({ id: 'PM-T1', clave: CLAVE, estado: 'hecha' }),
        unaTarea({ id: 'PM-T2', clave: CLAVE, estado: 'cancelada' }),
      ],
      [sprintCon(['PM-T1', 'PM-T2'])],
    );
    const { documento } = exigirOk(
      reducirSinMutar(doc, { comando: 'cerrarSprint', sprintId: 'S-34' }),
    );
    expect(documento.sprints).toHaveLength(1);
    expect(sprintDe(documento, 'S-34')?.estado).toBe('cerrado');
    expect(sprintDe(documento, 'S-34')?.items.map((i) => i.desenlace)).toEqual([
      'completada',
      'cancelada',
    ]);
  });
});

// --- el compromiso que vivía solo en el item --------------------------------

describe('cerrarSprint — devuelta y descartada vuelcan el compromiso a la tarea', () => {
  const personas = [unaPersona({ id: 'ana', nombre: 'Ana' }), unaPersona({ id: 'beto', nombre: 'Beto' })];

  /** La tarea nace pelada; el compromiso solo existe en el item del sprint. */
  function soloEnElItem(): Documento {
    return docCon(
      [
        unaTarea({ id: 'PM-T1', clave: CLAVE, estado: 'pendiente' }),
        unaTarea({ id: 'PM-T2', clave: CLAVE, estado: 'pendiente' }),
        unaTarea({ id: 'PM-T3', clave: CLAVE, estado: 'pendiente' }),
      ],
      [
        sprintCon([], {
          items: [
            unItem('PM-T1', { responsable: 'ana', fecha_limite: '2026-09-30', prioridad: 'alta' }),
            unItem('PM-T2', { responsable: 'ana', fecha_limite: '2026-09-30', prioridad: 'alta' }),
            unItem('PM-T3', { responsable: 'ana', fecha_limite: '2026-09-30', prioridad: 'alta' }),
          ],
        }),
      ],
      personas,
    );
  }

  it('al backlog: lo que solo vivía en el item se vuelca a la tarea antes de congelarla', () => {
    const { documento } = exigirOk(
      reducirSinMutar(soloEnElItem(), {
        comando: 'cerrarSprint',
        sprintId: 'S-34',
        decisiones: [
          { tareaId: 'PM-T1', destino: 'backlog' },
          { tareaId: 'PM-T2', destino: 'backlog' },
          { tareaId: 'PM-T3', destino: 'backlog' },
        ],
      }),
    );
    expect(tareasDe(documento).get('PM-T1')).toMatchObject({
      responsable: 'ana',
      fecha_limite: '2026-09-30',
      prioridad: 'alta',
    });
  });

  it('al descartar también se vuelca: la tarea queda cancelada, pero con lo que se le escribió', () => {
    const { documento } = exigirOk(
      reducirSinMutar(soloEnElItem(), {
        comando: 'cerrarSprint',
        sprintId: 'S-34',
        decisiones: [
          { tareaId: 'PM-T1', destino: 'descartar' },
          { tareaId: 'PM-T2', destino: 'descartar' },
          { tareaId: 'PM-T3', destino: 'descartar' },
        ],
      }),
    );
    expect(tareasDe(documento).get('PM-T2')).toMatchObject({
      estado: 'cancelada',
      responsable: 'ana',
      fecha_limite: '2026-09-30',
      prioridad: 'alta',
    });
  });

  it('el volcado no pisa lo que la tarea ya tenía: su dato manda', () => {
    const doc = docCon(
      [unaTarea({ id: 'PM-T1', clave: CLAVE, estado: 'pendiente', responsable: 'ana' })],
      [sprintCon([], { items: [unItem('PM-T1', { responsable: 'beto', fecha_limite: '2026-09-30' })] })],
      personas,
    );
    const { documento } = exigirOk(
      reducirSinMutar(doc, {
        comando: 'cerrarSprint',
        sprintId: 'S-34',
        decisiones: [{ tareaId: 'PM-T1', destino: 'backlog' }],
      }),
    );
    const tarea = tareasDe(documento).get('PM-T1');
    expect(tarea?.responsable).toBe('ana'); // el suyo
    expect(tarea?.fecha_limite).toBe('2026-09-30'); // este no lo tenía: lo hereda
    // Y el item congelado registra lo que de verdad se comprometió: el del item.
    expect(sprintDe(documento, 'S-34')?.items[0]?.responsable).toBe('beto');
  });

  it('lo ARRASTRADO no se vuelca a la tarea: viaja crudo al sprint siguiente', () => {
    // Es la diferencia de fondo entre los destinos. `backlog` y `descartar` sacan la tarea
    // del ciclo, así que el dato tiene que aterrizar en ella o se pierde. Lo arrastrado
    // sigue vivo en un item, y ahí `null` sigue significando «hereda de la tarea»:
    // volcarlo congelaría hoy una herencia que mañana el usuario puede querer cambiar.
    const { documento } = exigirOk(
      reducirSinMutar(soloEnElItem(), {
        comando: 'cerrarSprint',
        sprintId: 'S-34',
        decisiones: [
          { tareaId: 'PM-T1', destino: 'siguiente' },
          { tareaId: 'PM-T2', destino: 'siguiente' },
          { tareaId: 'PM-T3', destino: 'siguiente' },
        ],
      }),
    );
    expect(tareasDe(documento).get('PM-T1')?.responsable).toBeNull();
    expect(sprintDe(documento, 'S-35')?.items[0]).toMatchObject({
      tarea_id: 'PM-T1',
      responsable: 'ana',
      fecha_limite: '2026-09-30',
      prioridad: 'alta',
      desenlace: null,
    });
    // El item que se congela sí lleva el compromiso materializado.
    expect(sprintDe(documento, 'S-34')?.items[0]?.responsable).toBe('ana');
  });

  it('lo arrastrado que solo heredaba de la tarea llega al siguiente heredando todavía', () => {
    const doc = docCon(
      [unaTarea({ id: 'PM-T1', clave: CLAVE, estado: 'pendiente', responsable: 'ana' })],
      [sprintCon(['PM-T1'])],
      personas,
    );
    const { documento } = exigirOk(
      reducirSinMutar(doc, { comando: 'cerrarSprint', sprintId: 'S-34' }),
    );
    // En el sprint nuevo sigue en null = «pregúntale a la tarea»; reasignarla se propaga.
    expect(sprintDe(documento, 'S-35')?.items[0]?.responsable).toBeNull();
    // En el cerrado quedó materializado: reasignar mañana no reescribe lo que pasó.
    expect(sprintDe(documento, 'S-34')?.items[0]?.responsable).toBe('ana');
  });
});

// --- rechazos ---------------------------------------------------------------

describe('cerrarSprint — una decisión inválida rechaza el comando ENTERO', () => {
  function conMezcla(): Documento {
    return docCon(
      [
        unaTarea({ id: 'PM-T1', clave: CLAVE, estado: 'hecha' }),
        unaTarea({ id: 'PM-T2', clave: CLAVE, estado: 'pendiente' }),
        unaTarea({ id: 'PM-T3', clave: CLAVE, estado: 'cancelada' }),
        // Existe en el proyecto pero NO está comprometida en el sprint.
        unaTarea({ id: 'PM-T4', clave: CLAVE, estado: 'pendiente' }),
      ],
      [sprintCon(['PM-T1', 'PM-T2', 'PM-T3'])],
    );
  }

  it('una decisión sobre una tarea HECHA se rechaza, no se ignora', () => {
    const error = exigirError(
      reducirSinMutar(conMezcla(), {
        comando: 'cerrarSprint',
        sprintId: 'S-34',
        decisiones: [{ tareaId: 'PM-T1', destino: 'backlog' }],
      }),
    );
    expect(error.codigo).toBe('invalido');
    expect(error.mensaje).toContain('PM-T1');
    expect(error.mensaje).toContain('hecha');
  });

  it('una decisión sobre una tarea CANCELADA se rechaza', () => {
    const error = exigirError(
      reducirSinMutar(conMezcla(), {
        comando: 'cerrarSprint',
        sprintId: 'S-34',
        decisiones: [{ tareaId: 'PM-T3', destino: 'siguiente' }],
      }),
    );
    expect(error.codigo).toBe('invalido');
    expect(error.mensaje).toContain('cancelada');
  });

  it('un tareaId repetido se rechaza aunque los dos destinos coincidan', () => {
    // Repetir con el MISMO destino es el caso amable, y también se rechaza: dos filas
    // para la misma tarea solo salen de una pantalla desincronizada, y adivinar cuál vale
    // es peor que decir que no.
    const error = exigirError(
      reducirSinMutar(conMezcla(), {
        comando: 'cerrarSprint',
        sprintId: 'S-34',
        decisiones: [
          { tareaId: 'PM-T2', destino: 'backlog' },
          { tareaId: 'PM-T2', destino: 'backlog' },
        ],
      }),
    );
    expect(error.codigo).toBe('invalido');
    expect(error.mensaje).toContain('dos veces');
  });

  it('una tarea que existe pero no está en el sprint se rechaza', () => {
    const error = exigirError(
      reducirSinMutar(conMezcla(), {
        comando: 'cerrarSprint',
        sprintId: 'S-34',
        decisiones: [{ tareaId: 'PM-T4', destino: 'backlog' }],
      }),
    );
    expect(error.codigo).toBe('invalido');
    expect(error.mensaje).toContain('PM-T4');
  });

  it('un tareaId que no existe en ningún proyecto se rechaza igual', () => {
    const error = exigirError(
      reducirSinMutar(conMezcla(), {
        comando: 'cerrarSprint',
        sprintId: 'S-34',
        decisiones: [{ tareaId: 'PM-T99', destino: 'siguiente' }],
      }),
    );
    expect(error.codigo).toBe('invalido');
  });

  it('el sprint no puede ser su propio siguiente', () => {
    const error = exigirError(
      reducirSinMutar(conMezcla(), {
        comando: 'cerrarSprint',
        sprintId: 'S-34',
        siguienteSprintId: 'S-34',
      }),
    );
    expect(error.codigo).toBe('invalido');
  });

  it('regla 8: arrastrar hacia un sprint CERRADO se rechaza', () => {
    const doc = docCon(
      [unaTarea({ id: 'PM-T1', clave: CLAVE, estado: 'pendiente' })],
      [
        sprintCon(['PM-T1']),
        unSprint({ id: 'S-33', nombre: 'Sprint 33', estado: 'cerrado', inicio: '2026-07-27', fin: '2026-08-07' }),
      ],
    );
    const error = exigirError(
      reducirSinMutar(doc, {
        comando: 'cerrarSprint',
        sprintId: 'S-34',
        siguienteSprintId: 'S-33',
      }),
    );
    expect(error.codigo).toBe('sprint-cerrado');
  });

  it('ESLABÓN: un destino que el contrato no conoce no llega ni al reductor', () => {
    // La defensa vive una capa más arriba: el enum del payload. Sin esta prueba, la
    // invariante «solo tres destinos» no la sostiene nadie de forma visible.
    const resultado = validarComando({
      comando: 'cerrarSprint',
      sprintId: 'S-34',
      decisiones: [{ tareaId: 'PM-T2', destino: 'papelera' }],
    });
    expect(resultado.ok).toBe(false);
  });
});

// --- atomicidad -------------------------------------------------------------

describe('cerrarSprint — atomicidad: o entero o nada', () => {
  /**
   * Documento completo, comprobado campo por campo con `toEqual` contra su copia previa.
   *
   * La comprobación por un campo suelto («la tarea sigue pendiente») deja pasar el fallo
   * real: que la mitad de las decisiones ya se aplicaron. Aquí se compara el documento
   * entero, y además se nombran las tres huellas concretas que dejaría medio cierre.
   */
  function exigirIntacto(doc: Documento, antes: Documento): void {
    expect(doc).toEqual(antes);
    expect(sprintDe(doc, 'S-34')?.estado).toBe('activo');
    expect(sprintDe(doc, 'S-34')?.items.every((i) => i.desenlace === null)).toBe(true);
    expect(doc.sprints).toHaveLength(antes.sprints.length);
  }

  /** Tres válidas y una inválida al final: si se aplicara en orden, las tres primeras ya estarían. */
  function conUnaInvalidaAlFinal(): Documento {
    return docCon(
      [
        unaTarea({ id: 'PM-T1', clave: CLAVE, estado: 'pendiente' }),
        unaTarea({ id: 'PM-T2', clave: CLAVE, estado: 'pendiente' }),
        unaTarea({ id: 'PM-T3', clave: CLAVE, estado: 'en_curso' }),
        unaTarea({ id: 'PM-T4', clave: CLAVE, estado: 'hecha' }),
      ],
      [sprintCon(['PM-T1', 'PM-T2', 'PM-T3', 'PM-T4'])],
    );
  }

  it('una decisión inválida entre varias válidas no deja NADA aplicado', () => {
    const doc = conUnaInvalidaAlFinal();
    const antes = copiaProfunda(doc);

    const error = exigirError(
      reducir(
        doc,
        {
          comando: 'cerrarSprint',
          sprintId: 'S-34',
          decisiones: [
            { tareaId: 'PM-T1', destino: 'descartar' }, // cancelaría la tarea
            { tareaId: 'PM-T2', destino: 'backlog' },
            { tareaId: 'PM-T3', destino: 'siguiente' }, // crearía el sprint siguiente
            { tareaId: 'PM-T4', destino: 'backlog' }, // ← inválida: está hecha
          ],
        },
        AHORA,
      ),
    );
    expect(error.codigo).toBe('invalido');
    exigirIntacto(doc, antes);
    // Las tres huellas que dejaría medio cierre, nombradas una a una.
    expect(tareasDe(doc).get('PM-T1')?.estado).toBe('pendiente');
    expect(doc.sprints.map((s) => s.id)).toEqual(['S-34']);
  });

  it('el rechazo tardío por el sprint destino tampoco deja nada aplicado', () => {
    // Este rechazo ocurre DESPUÉS de repartir desenlaces y de cancelar lo descartado: es
    // el caso en que un reductor que trabajara sobre el documento vivo dejaría el
    // estropicio a la vista.
    const doc = docCon(
      [
        unaTarea({ id: 'PM-T1', clave: CLAVE, estado: 'pendiente' }),
        unaTarea({ id: 'PM-T2', clave: CLAVE, estado: 'pendiente' }),
      ],
      [
        sprintCon(['PM-T1', 'PM-T2']),
        unSprint({ id: 'S-33', nombre: 'Sprint 33', estado: 'cerrado', inicio: '2026-07-27', fin: '2026-08-07' }),
      ],
    );
    const antes = copiaProfunda(doc);

    exigirError(
      reducir(
        doc,
        {
          comando: 'cerrarSprint',
          sprintId: 'S-34',
          siguienteSprintId: 'S-33',
          decisiones: [
            { tareaId: 'PM-T1', destino: 'descartar' },
            { tareaId: 'PM-T2', destino: 'siguiente' },
          ],
        },
        AHORA,
      ),
    );
    exigirIntacto(doc, antes);
    expect(tareasDe(doc).get('PM-T1')?.estado).toBe('pendiente');
  });

  it('un cierre que pasa tampoco muta el documento de entrada: la pila de deshacer depende de eso', () => {
    const doc = conUnaInvalidaAlFinal();
    const antes = copiaProfunda(doc);
    exigirOk(
      reducir(
        doc,
        {
          comando: 'cerrarSprint',
          sprintId: 'S-34',
          decisiones: [{ tareaId: 'PM-T1', destino: 'descartar' }],
        },
        AHORA,
      ),
    );
    exigirIntacto(doc, antes);
  });

  it('DESHACER: el documento previo apilado es exactamente el de antes del cierre', () => {
    // Así apila el repositorio: guarda la referencia al documento anterior y la restaura.
    // Que eso funcione depende de que el reductor no comparta ni una referencia con lo
    // que devuelve; si compartiera el array de items, cerrar mutaría el snapshot.
    const doc = conUnaInvalidaAlFinal();
    const referencia = copiaProfunda(doc);
    const pilaDeshacer: Documento[] = [];

    const previo = doc;
    const { documento: cerrado } = exigirOk(
      reducir(previo, { comando: 'cerrarSprint', sprintId: 'S-34' }, AHORA),
    );
    pilaDeshacer.push(previo);

    // Se toca el documento resultante como lo haría cualquier comando posterior.
    cerrado.sprints[0]!.items[0]!.desenlace = 'devuelta';
    cerrado.sprints.push(unSprint({ id: 'S-99', nombre: 'Sprint 99', estado: 'planeado' }));

    const deshecho = pilaDeshacer.pop();
    expect(deshecho).toEqual(referencia);
  });
});

// --- el sprint siguiente ----------------------------------------------------

describe('cerrarSprint — el sprint siguiente', () => {
  function conUnaPendiente(sprints?: Sprint[]): Documento {
    return docCon(
      [
        unaTarea({ id: 'PM-T1', clave: CLAVE, estado: 'pendiente' }),
        unaTarea({ id: 'PM-T2', clave: CLAVE, estado: 'pendiente' }),
        unaTarea({ id: 'PM-T3', clave: CLAVE, estado: 'pendiente' }),
      ],
      sprints ?? [sprintCon(['PM-T1'])],
    );
  }

  it('se crea con el id y el nombre de la serie, la misma duración y estado planeado', () => {
    const { documento, evento } = exigirOk(
      reducirSinMutar(conUnaPendiente(), { comando: 'cerrarSprint', sprintId: 'S-34' }),
    );
    expect(sprintDe(documento, 'S-35')).toMatchObject({
      id: 'S-35',
      nombre: 'Sprint 35',
      // 4-sep es viernes; el día siguiente cae en sábado y se corre al lunes.
      inicio: '2026-09-07',
      // Misma duración que el que se cierra (11 días), no dos semanas inventadas.
      fin: '2026-09-18',
      estado: 'planeado',
    });
    expect(evento.detalle).toMatchObject({ siguiente_sprint: 'S-35', siguiente_sprint_creado: true });
  });

  it('nace PLANEADO, nunca activo: si naciera activo, este cierre legítimo fallaría', () => {
    // El escenario: hay un sprint corriendo y se cierra otro que quedó planeado. Con dos
    // activos el esquema rechaza el documento y el comando muere con `documento-invalido`.
    const doc = docCon(
      [unaTarea({ id: 'PM-T1', clave: CLAVE, estado: 'pendiente' })],
      [
        sprintCon(['PM-T1'], { estado: 'planeado' }),
        unSprint({ id: 'S-40', nombre: 'Sprint 40', estado: 'activo', inicio: '2026-09-21', fin: '2026-10-02' }),
      ],
    );
    const { documento } = exigirOk(
      reducirSinMutar(doc, { comando: 'cerrarSprint', sprintId: 'S-34' }),
    );
    expect(sprintDe(documento, 'S-35')?.estado).toBe('planeado');
    expect(documento.sprints.filter((s) => s.estado === 'activo').map((s) => s.id)).toEqual(['S-40']);
  });

  it('cerrar el ACTIVO deja el documento sin ninguno: activar es otro acto', () => {
    const { documento } = exigirOk(
      reducirSinMutar(conUnaPendiente(), { comando: 'cerrarSprint', sprintId: 'S-34' }),
    );
    expect(documento.sprints.filter((s) => s.estado === 'activo')).toEqual([]);
  });

  it('si ya hay un planeado se usa ese y no se crea ninguno', () => {
    const doc = conUnaPendiente([
      sprintCon(['PM-T1']),
      unSprint({ id: 'S-35', nombre: 'Sprint 35', estado: 'planeado', inicio: '2026-09-07', fin: '2026-09-18' }),
    ]);
    const { documento, evento } = exigirOk(
      reducirSinMutar(doc, { comando: 'cerrarSprint', sprintId: 'S-34' }),
    );
    expect(documento.sprints).toHaveLength(2);
    expect(idsDeItems(sprintDe(documento, 'S-35'))).toEqual(['PM-T1']);
    expect(evento.detalle).toMatchObject({ siguiente_sprint_creado: false });
  });

  it('lo arrastrado entra ARRIBA del siguiente y en su orden: el array ES la prioridad', () => {
    const doc = conUnaPendiente([
      sprintCon(['PM-T1', 'PM-T2']),
      unSprint({
        id: 'S-35',
        nombre: 'Sprint 35',
        estado: 'planeado',
        inicio: '2026-09-07',
        fin: '2026-09-18',
        items: [unItem('PM-T3')],
      }),
    ]);
    const { documento } = exigirOk(
      reducirSinMutar(doc, { comando: 'cerrarSprint', sprintId: 'S-34' }),
    );
    expect(idsDeItems(sprintDe(documento, 'S-35'))).toEqual(['PM-T1', 'PM-T2', 'PM-T3']);
  });

  it('el orden del arrastre es el del sprint que se cierra, no el del árbol', () => {
    const doc = conUnaPendiente([sprintCon(['PM-T3', 'PM-T1', 'PM-T2'])]);
    const { documento } = exigirOk(
      reducirSinMutar(doc, { comando: 'cerrarSprint', sprintId: 'S-34' }),
    );
    expect(idsDeItems(sprintDe(documento, 'S-35'))).toEqual(['PM-T3', 'PM-T1', 'PM-T2']);
  });

  it('lo que ya estaba planeado en el siguiente no se duplica ni se reordena ni se pisa', () => {
    const personas = [unaPersona({ id: 'ana', nombre: 'Ana' })];
    const doc = unDocumento({
      personas,
      proyectos: [
        unProyectoCon([
          unaTarea({ id: 'PM-T1', clave: CLAVE, estado: 'pendiente' }),
          unaTarea({ id: 'PM-T2', clave: CLAVE, estado: 'pendiente' }),
        ]),
      ],
      sprints: [
        sprintCon(['PM-T1', 'PM-T2']),
        unSprint({
          id: 'S-35',
          nombre: 'Sprint 35',
          estado: 'planeado',
          inicio: '2026-09-07',
          fin: '2026-09-18',
          // PM-T2 ya estaba planeada ahí, con su propio compromiso escrito.
          items: [unItem('PM-T2', { responsable: 'ana', prioridad: 'alta' })],
        }),
      ],
    });
    exigirValido(doc, 'fixture de arrastre a un planeado preexistente');

    const { documento } = exigirOk(
      reducirSinMutar(doc, { comando: 'cerrarSprint', sprintId: 'S-34' }),
    );
    const siguiente = sprintDe(documento, 'S-35');
    expect(idsDeItems(siguiente)).toEqual(['PM-T1', 'PM-T2']);
    expect(siguiente?.items.filter((i) => i.tarea_id === 'PM-T2')).toHaveLength(1);
    // El item que ya estaba conserva lo suyo: el cierre no lo recrea vacío.
    expect(siguiente?.items[1]).toMatchObject({ responsable: 'ana', prioridad: 'alta' });
  });

  it('con varios planeados se usa el de inicio más temprano, no el primero del array', () => {
    const doc = conUnaPendiente([
      sprintCon(['PM-T1']),
      unSprint({ id: 'S-36', nombre: 'Sprint 36', estado: 'planeado', inicio: '2026-09-21', fin: '2026-10-02' }),
      unSprint({ id: 'S-35', nombre: 'Sprint 35', estado: 'planeado', inicio: '2026-09-07', fin: '2026-09-18' }),
    ]);
    const { documento } = exigirOk(
      reducirSinMutar(doc, { comando: 'cerrarSprint', sprintId: 'S-34' }),
    );
    expect(idsDeItems(sprintDe(documento, 'S-35'))).toEqual(['PM-T1']);
    expect(idsDeItems(sprintDe(documento, 'S-36'))).toEqual([]);
  });

  it('siguienteSprintId manda sobre el criterio por omisión', () => {
    const doc = conUnaPendiente([
      sprintCon(['PM-T1']),
      unSprint({ id: 'S-35', nombre: 'Sprint 35', estado: 'planeado', inicio: '2026-09-07', fin: '2026-09-18' }),
      unSprint({ id: 'S-36', nombre: 'Sprint 36', estado: 'planeado', inicio: '2026-09-21', fin: '2026-10-02' }),
    ]);
    const { documento } = exigirOk(
      reducirSinMutar(doc, {
        comando: 'cerrarSprint',
        sprintId: 'S-34',
        siguienteSprintId: 'S-36',
      }),
    );
    expect(idsDeItems(sprintDe(documento, 'S-36'))).toEqual(['PM-T1']);
    expect(idsDeItems(sprintDe(documento, 'S-35'))).toEqual([]);
  });

  it('un siguienteSprintId que no existe se crea con ESE id, y planeado', () => {
    const { documento } = exigirOk(
      reducirSinMutar(conUnaPendiente(), {
        comando: 'cerrarSprint',
        sprintId: 'S-34',
        siguienteSprintId: 'S-2026-Q4',
      }),
    );
    expect(sprintDe(documento, 'S-2026-Q4')).toMatchObject({ id: 'S-2026-Q4', estado: 'planeado' });
    expect(idsDeItems(sprintDe(documento, 'S-2026-Q4'))).toEqual(['PM-T1']);
  });
});

// --- la cadena completa -----------------------------------------------------

describe('cerrarSprint — la cadena: cerrar, heredar, volver a cerrar', () => {
  it('el contador de arrastres DERIVADO llega a 3 en la tercera vuelta', () => {
    // «Cuántos sprints lleva arrastrándose» no se persiste: se cuenta en cuántos sprints
    // aparece la tarea. Esta es la prueba de que el cierre alimenta esa cuenta sin
    // ayuda de ningún campo, vuelta tras vuelta.
    const doc = docCon(
      [unaTarea({ id: 'PM-T1', clave: CLAVE, estado: 'pendiente' })],
      [sprintCon(['PM-T1'])],
    );
    expect(sprintsQueLaTocaron(doc, 'PM-T1')).toHaveLength(1);

    const vuelta1 = exigirOk(reducirSinMutar(doc, { comando: 'cerrarSprint', sprintId: 'S-34' })).documento;
    expect(sprintsQueLaTocaron(vuelta1, 'PM-T1').map((s) => s.id)).toEqual(['S-34', 'S-35']);

    const vuelta2 = exigirOk(
      reducirSinMutar(vuelta1, { comando: 'cerrarSprint', sprintId: 'S-35' }),
    ).documento;
    expect(sprintsQueLaTocaron(vuelta2, 'PM-T1').map((s) => s.id)).toEqual(['S-34', 'S-35', 'S-36']);
    expect(sprintsQueLaTocaron(vuelta2, 'PM-T1')).toHaveLength(3);

    // El tercer sprint sigue vivo y la tarea sigue pendiente: nadie la cerró por cansancio.
    expect(sprintDe(vuelta2, 'S-36')?.estado).toBe('planeado');
    expect(tareasDe(vuelta2).get('PM-T1')?.estado).toBe('pendiente');
  });

  it('cada vuelta deja su desenlace escrito y los sprintes anteriores intactos', () => {
    const doc = docCon(
      [unaTarea({ id: 'PM-T1', clave: CLAVE, estado: 'pendiente' })],
      [sprintCon(['PM-T1'])],
    );
    const vuelta1 = exigirOk(reducirSinMutar(doc, { comando: 'cerrarSprint', sprintId: 'S-34' })).documento;
    const cerradoAntes = copiaProfunda(sprintDe(vuelta1, 'S-34'));

    const vuelta2 = exigirOk(
      reducirSinMutar(vuelta1, { comando: 'cerrarSprint', sprintId: 'S-35' }),
    ).documento;

    expect(sprintDe(vuelta2, 'S-34')).toEqual(cerradoAntes);
    expect(sprintDe(vuelta2, 'S-34')?.items[0]?.desenlace).toBe('arrastrada');
    expect(sprintDe(vuelta2, 'S-35')?.items[0]?.desenlace).toBe('arrastrada');
    expect(sprintDe(vuelta2, 'S-36')?.items[0]?.desenlace).toBeNull();
  });

  it('la cadena se corta cuando la tarea se descarta: no aparece en un cuarto sprint', () => {
    const doc = docCon(
      [unaTarea({ id: 'PM-T1', clave: CLAVE, estado: 'pendiente' })],
      [sprintCon(['PM-T1'])],
    );
    const vuelta1 = exigirOk(reducirSinMutar(doc, { comando: 'cerrarSprint', sprintId: 'S-34' })).documento;
    const vuelta2 = exigirOk(
      reducirSinMutar(vuelta1, {
        comando: 'cerrarSprint',
        sprintId: 'S-35',
        decisiones: [{ tareaId: 'PM-T1', destino: 'descartar' }],
      }),
    ).documento;

    expect(sprintsQueLaTocaron(vuelta2, 'PM-T1')).toHaveLength(2);
    expect(vuelta2.sprints.map((s) => s.id)).toEqual(['S-34', 'S-35']);
    expect(tareasDe(vuelta2).get('PM-T1')?.estado).toBe('cancelada');
  });
});

// --- aislamiento ------------------------------------------------------------

describe('cerrarSprint — no toca lo que no está en el sprint', () => {
  /** Dos proyectos; el sprint solo compromete tareas del primero. */
  function conDosProyectos(): Documento {
    const doc = unDocumento({
      personas: [unaPersona({ id: 'ana', nombre: 'Ana' })],
      proyectos: [
        unProyectoCon([
          unaTarea({ id: 'PM-T1', clave: 'PM', estado: 'pendiente' }),
          unaTarea({ id: 'PM-T2', clave: 'PM', estado: 'pendiente' }),
          unaTarea({ id: 'PM-T3', clave: 'PM', estado: 'pendiente' }),
        ]),
        unProyectoCon(
          [
            // Mismos estados y mismo perfil que las del sprint: si el cierre se guiara por
            // el estado de la tarea en vez de por los items, estas caerían también.
            unaTarea({ id: 'OTRO-T1', clave: 'OTRO', estado: 'pendiente', responsable: 'ana' }),
            unaTarea({ id: 'OTRO-T2', clave: 'OTRO', estado: 'en_curso' }),
            unaTarea({ id: 'OTRO-T3', clave: 'OTRO', estado: 'hecha' }),
          ],
          'OTRO',
        ),
      ],
      sprints: [sprintCon(['PM-T1', 'PM-T2', 'PM-T3'])],
    });
    exigirValido(doc, 'fixture de dos proyectos');
    return doc;
  }

  it('el proyecto ajeno queda idéntico, con los tres destinos en juego', () => {
    const doc = conDosProyectos();
    const ajenoAntes = copiaProfunda(doc.proyectos[1]);
    const { documento } = exigirOk(
      reducirSinMutar(doc, {
        comando: 'cerrarSprint',
        sprintId: 'S-34',
        decisiones: [
          { tareaId: 'PM-T1', destino: 'siguiente' },
          { tareaId: 'PM-T2', destino: 'backlog' },
          { tareaId: 'PM-T3', destino: 'descartar' },
        ],
      }),
    );
    expect(documento.proyectos[1]).toEqual(ajenoAntes);
  });

  it('una tarea del mismo proyecto que no está comprometida tampoco se toca', () => {
    const doc = docCon(
      [
        unaTarea({ id: 'PM-T1', clave: CLAVE, estado: 'pendiente' }),
        unaTarea({ id: 'PM-T2', clave: CLAVE, estado: 'pendiente' }),
      ],
      [sprintCon(['PM-T1'])],
    );
    const { documento } = exigirOk(
      reducirSinMutar(doc, {
        comando: 'cerrarSprint',
        sprintId: 'S-34',
        decisiones: [{ tareaId: 'PM-T1', destino: 'descartar' }],
      }),
    );
    expect(tareasDe(documento).get('PM-T2')?.estado).toBe('pendiente');
    expect(tareasDe(documento).get('PM-T1')?.estado).toBe('cancelada');
  });

  it('cerrar ARRASTRANDO solo escribe en el sprint destino: un tercero abierto queda igual', () => {
    // Restaura la intención que se perdió al adaptar el contrato. En `sprint.test.ts`
    // existía «cerrar un sprint no toca a los otros sprints»; la ceremonia hizo falsa esa
    // afirmación en general —el arrastre escribe en otro sprint— y la prueba se estrechó a
    // «cerrar SIN nada que arrastrar no toca a los otros». El caso que dejó de vigilarse es
    // justo el que ahora tiene riesgo: con arrastre de por medio, ningún sprint distinto
    // del destino puede cambiar.
    const doc = docCon(
      [unaTarea({ id: 'PM-T1', clave: CLAVE, estado: 'pendiente' })],
      [
        sprintCon(['PM-T1']),
        unSprint({ id: 'S-35', nombre: 'Sprint 35', estado: 'planeado', inicio: '2026-09-07', fin: '2026-09-18' }),
        unSprint({ id: 'S-40', nombre: 'Sprint 40', estado: 'planeado', inicio: '2026-10-05', fin: '2026-10-16' }),
        unSprint({
          id: 'S-33',
          nombre: 'Sprint 33',
          estado: 'cerrado',
          inicio: '2026-07-27',
          fin: '2026-08-07',
          items: [unItem('PM-T1', { desenlace: 'arrastrada' })],
        }),
      ],
    );
    const tercerosAntes = copiaProfunda([doc.sprints[2], doc.sprints[3]]);

    const { documento } = exigirOk(
      reducirSinMutar(doc, { comando: 'cerrarSprint', sprintId: 'S-34' }),
    );
    expect(idsDeItems(sprintDe(documento, 'S-35'))).toEqual(['PM-T1']); // el destino sí
    expect([sprintDe(documento, 'S-40'), sprintDe(documento, 'S-33')]).toEqual(tercerosAntes);
  });

  it('un sprint hermano abierto que comparte tarea no se toca al cerrar el otro', () => {
    const doc = docCon(
      [unaTarea({ id: 'PM-T1', clave: CLAVE, estado: 'pendiente' })],
      [
        sprintCon(['PM-T1']),
        unSprint({
          id: 'S-40',
          nombre: 'Sprint 40',
          estado: 'planeado',
          inicio: '2026-10-05',
          fin: '2026-10-16',
          items: [unItem('PM-T1')],
        }),
      ],
    );
    const { documento } = exigirOk(
      reducirSinMutar(doc, {
        comando: 'cerrarSprint',
        sprintId: 'S-34',
        decisiones: [{ tareaId: 'PM-T1', destino: 'backlog' }],
      }),
    );
    // El item del hermano sigue vivo y sin desenlace: cerrar S-34 no decide por S-40.
    expect(sprintDe(documento, 'S-40')).toEqual(doc.sprints[1]);
  });

  it('descartar cancela la tarea pero NO la saca de otro sprint donde ya estaba planeada', () => {
    // Comportamiento vigente, congelado con reservas. «Ya no aplica» cancela la tarea, y
    // eso basta para sacarla de los denominadores y de la carga de su responsable —las
    // canceladas se excluyen de todo—, pero el item que otro sprint abierto ya tenía
    // apuntando a ella sigue ahí. El usuario verá una tarea cancelada listada en el sprint
    // siguiente hasta que la saque a mano. No lo arreglo aquí: es una decisión de producto
    // (¿limpiar los items ajenos es «tocar un sprint que no se está cerrando»?).
    const doc = docCon(
      [unaTarea({ id: 'PM-T1', clave: CLAVE, estado: 'pendiente' })],
      [
        sprintCon(['PM-T1']),
        unSprint({
          id: 'S-40',
          nombre: 'Sprint 40',
          estado: 'planeado',
          inicio: '2026-10-05',
          fin: '2026-10-16',
          items: [unItem('PM-T1')],
        }),
      ],
    );
    const { documento } = exigirOk(
      reducirSinMutar(doc, {
        comando: 'cerrarSprint',
        sprintId: 'S-34',
        decisiones: [{ tareaId: 'PM-T1', destino: 'descartar' }],
      }),
    );
    expect(tareasDe(documento).get('PM-T1')?.estado).toBe('cancelada');
    expect(idsDeItems(sprintDe(documento, 'S-40'))).toEqual(['PM-T1']);
  });
});
