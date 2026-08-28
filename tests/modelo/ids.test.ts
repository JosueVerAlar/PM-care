/**
 * Emisión y parseo de ids con contadores persistidos (regla 15).
 *
 * Lo que estas pruebas defienden en una línea: un número emitido no se recicla nunca,
 * aunque se borre lo que lo llevaba. Si algún día alguien "simplifica" esto a MAX+1, más
 * de una prueba de aquí se pone en rojo.
 */

import { describe, expect, it } from 'vitest';

import {
  type Contadores,
  PATRON_CLAVE_PROYECTO,
  PREFIJOS,
  componerId,
  esClaveValida,
  esIdDe,
  maximosUsados,
  parsearId,
  problemasDeContadores,
  siguienteId,
} from '../../src/compartido/modelo/ids';

const EN_CERO: Contadores = { epicas: 0, historias: 0, tareas: 0, sprints: 0 };

// --- forma del id -----------------------------------------------------------

describe('componerId y PREFIJOS', () => {
  it('cada tipo tiene su letra: E, H, T, S', () => {
    // `S` entró con los sprints por proyecto: `idSprintLibre` derivaba el id del anterior
    // y comprobaba colisiones contra los que existían — MAX+1 disfrazado, que la regla 15
    // prohíbe porque `historial.jsonl` ya guarda `sprint_id` y el número se reciclaría.
    expect(PREFIJOS).toEqual({ epica: 'E', historia: 'H', tarea: 'T', sprint: 'S' });
  });

  it('compone la forma CLAVE-LetraNúmero', () => {
    expect(componerId('SICOE', 'tarea', 14)).toBe('SICOE-T14');
    expect(componerId('SICOE', 'epica', 1)).toBe('SICOE-E1');
    expect(componerId('DGETI-WEB', 'historia', 3)).toBe('DGETI-WEB-H3');
  });

  it('componer y parsear son inversos', () => {
    expect(parsearId(componerId('DGETI-WEB', 'tarea', 108))).toEqual({
      claveProyecto: 'DGETI-WEB',
      tipo: 'tarea',
      numero: 108,
    });
  });
});

describe('parsearId', () => {
  it('parsea una clave simple', () => {
    expect(parsearId('SICOE-T14')).toEqual({ claveProyecto: 'SICOE', tipo: 'tarea', numero: 14 });
  });

  it('una clave con guiones internos se parsea sin ambigüedad', () => {
    expect(parsearId('DGETI-WEB-H3')).toEqual({ claveProyecto: 'DGETI-WEB', tipo: 'historia', numero: 3 });
  });

  it('admite números de varios dígitos', () => {
    expect(parsearId('SICOE-T1024')?.numero).toBe(1024);
  });

  it('no lanza con basura: devuelve null porque el usuario edita a mano', () => {
    for (const malo of ['', 'SICOE', 'SICOE-', 'SICOE-T', 'T14', 'sicoe-t14', 'SICOE T14', '-T1']) {
      expect(() => parsearId(malo)).not.toThrow();
      expect(parsearId(malo), malo).toBeNull();
    }
  });

  it('rechaza el número cero y los ceros a la izquierda: no hay dos formas de escribir el mismo id', () => {
    expect(parsearId('SICOE-T0')).toBeNull();
    expect(parsearId('SICOE-T014')).toBeNull();
  });

  it('rechaza una letra de tipo que no existe', () => {
    expect(parsearId('SICOE-X1')).toBeNull();
  });

  it('rechaza el número negativo y el decimal', () => {
    expect(parsearId('SICOE-T-1')).toBeNull();
    expect(parsearId('SICOE-T1.5')).toBeNull();
  });

  it('rechaza espacios alrededor: un id con espacio no es el mismo id', () => {
    expect(parsearId(' SICOE-T1')).toBeNull();
    expect(parsearId('SICOE-T1 ')).toBeNull();
  });
});

describe('esClaveValida', () => {
  it('acepta mayúsculas, dígitos y guiones internos', () => {
    for (const buena of ['SICOE', 'INFRA', 'DGETI-WEB', 'A', 'P2', 'A-B-C']) {
      expect(esClaveValida(buena), buena).toBe(true);
    }
  });

  it('rechaza minúsculas, espacios, acentos, guion al final y arranque con dígito', () => {
    for (const mala of ['sicoe', 'SI COE', 'PEDAGOGÍA', 'SICOE-', '-SICOE', '2SICOE', '', 'SICOE_WEB']) {
      expect(esClaveValida(mala), mala).toBe(false);
    }
  });

  it('el patrón exportado es el mismo que usa el esquema', () => {
    expect(PATRON_CLAVE_PROYECTO.test('DGETI-WEB')).toBe(true);
  });
});

describe('esIdDe', () => {
  it('reconoce el id de su propio proyecto', () => {
    expect(esIdDe('SICOE-T14', 'SICOE')).toBe(true);
  });

  it('detecta la referencia mal copiada de otro proyecto', () => {
    expect(esIdDe('SICOE-T14', 'INFRA')).toBe(false);
  });

  it('no se deja engañar por un prefijo que solo empieza igual', () => {
    expect(esIdDe('SICOE-WEB-T1', 'SICOE')).toBe(false);
    expect(esIdDe('SICOE-T1', 'SICOE-WEB')).toBe(false);
  });

  it('un id ilegible no pertenece a ningún proyecto', () => {
    expect(esIdDe('basura', 'SICOE')).toBe(false);
  });
});

// --- emisión ----------------------------------------------------------------

describe('siguienteId', () => {
  it('desde cero emite el número 1, no el 0', () => {
    expect(siguienteId('SICOE', EN_CERO, 'tarea')).toEqual({
      id: 'SICOE-T1',
      contadores: { epicas: 0, historias: 0, tareas: 1, sprints: 0 },
    });
  });

  it('cada tipo mueve solo su propio contador', () => {
    const contadores = { epicas: 4, historias: 9, tareas: 108, sprints: 3 };
    const base = { ...contadores };
    expect(siguienteId('SICOE', contadores, 'epica').contadores).toEqual({ ...base, epicas: 5 });
    expect(siguienteId('SICOE', contadores, 'historia').contadores).toEqual({ ...base, historias: 10 });
    expect(siguienteId('SICOE', contadores, 'tarea').contadores).toEqual({ ...base, tareas: 109 });
    // El cuarto contador se comporta como los otros tres: es lo que hace que un sprint
    // borrado no recicle su número, que es el motivo entero de que exista.
    expect(siguienteId('SICOE', contadores, 'sprint').contadores).toEqual({ ...base, sprints: 4 });
  });

  it('es puro: no muta los contadores que recibe', () => {
    const contadores = { epicas: 1, historias: 1, tareas: 1 };
    siguienteId('SICOE', contadores, 'tarea');
    expect(contadores).toEqual({ epicas: 1, historias: 1, tareas: 1 });
  });

  it('llamarlo dos veces sin persistir devuelve el MISMO id: el que llama decide cuándo guardar', () => {
    // Es la propiedad que evita que un fallo al escribir deje un id consumido sin dueño.
    expect(siguienteId('SICOE', EN_CERO, 'tarea').id).toBe(siguienteId('SICOE', EN_CERO, 'tarea').id);
  });

  it('encadenando los contadores salen ids consecutivos y sin repetir', () => {
    let contadores = EN_CERO;
    const emitidos: string[] = [];
    for (let i = 0; i < 5; i += 1) {
      const emitido = siguienteId('SICOE', contadores, 'tarea');
      emitidos.push(emitido.id);
      contadores = emitido.contadores;
    }
    expect(emitidos).toEqual(['SICOE-T1', 'SICOE-T2', 'SICOE-T3', 'SICOE-T4', 'SICOE-T5']);
    expect(new Set(emitidos).size).toBe(5);
  });

  it('regla 15: borrar la última tarea NO recicla su número', () => {
    // Contador en 14 con las tareas 1..14; se borra la 14. El siguiente id es el 15.
    const trasBorrar = siguienteId('SICOE', { epicas: 0, historias: 0, tareas: 14 }, 'tarea');
    expect(trasBorrar.id).toBe('SICOE-T15');
    // MAX+1 sobre el árbol vivo (que ya solo llega a 13) habría devuelto SICOE-T14.
    expect(trasBorrar.id).not.toBe('SICOE-T14');
  });

  it('el id emitido pertenece al proyecto que lo pidió', () => {
    expect(esIdDe(siguienteId('DGETI-WEB', EN_CERO, 'historia').id, 'DGETI-WEB')).toBe(true);
  });
});

// --- verificación de contadores ---------------------------------------------

/** Árbol mínimo con la forma que pide `maximosUsados`. */
function arbol(clave: string, contadores: Contadores, ids: { epica: string; historias: { id: string; tareas: string[] }[] }[]) {
  return {
    clave,
    contadores,
    epicas: ids.map((e) => ({
      id: e.epica,
      historias: e.historias.map((h) => ({ id: h.id, tareas: h.tareas.map((id) => ({ id })) })),
    })),
  };
}

describe('maximosUsados', () => {
  it('un proyecto vacío no usa ningún número', () => {
    expect(maximosUsados(arbol('SICOE', EN_CERO, []))).toEqual(EN_CERO);
  });

  it('toma el mayor de cada tipo, no el último ni el primero', () => {
    const proyecto = arbol('SICOE', EN_CERO, [
      { epica: 'SICOE-E3', historias: [{ id: 'SICOE-H7', tareas: ['SICOE-T50', 'SICOE-T2'] }] },
      { epica: 'SICOE-E1', historias: [{ id: 'SICOE-H2', tareas: ['SICOE-T9'] }] },
    ]);
    expect(maximosUsados(proyecto)).toEqual({ epicas: 3, historias: 7, tareas: 50, sprints: 0 });
  });

  it('ignora los ids ilegibles en vez de reventar', () => {
    const proyecto = arbol('SICOE', EN_CERO, [
      { epica: 'basura', historias: [{ id: 'SICOE-H1', tareas: ['tampoco'] }] },
    ]);
    expect(maximosUsados(proyecto)).toEqual({ epicas: 0, historias: 1, tareas: 0, sprints: 0 });
  });

  it('no confunde tipos: una tarea colocada donde va una épica no sube el contador de épicas', () => {
    const proyecto = arbol('SICOE', EN_CERO, [{ epica: 'SICOE-T99', historias: [] }]);
    expect(maximosUsados(proyecto).epicas).toBe(0);
  });
});

describe('problemasDeContadores', () => {
  it('sin problemas devuelve lista vacía', () => {
    const proyecto = arbol('SICOE', { epicas: 1, historias: 1, tareas: 1 }, [
      { epica: 'SICOE-E1', historias: [{ id: 'SICOE-H1', tareas: ['SICOE-T1'] }] },
    ]);
    expect(problemasDeContadores(proyecto)).toEqual([]);
  });

  it('el contador igual a lo usado es correcto: el límite es "por debajo", no "distinto"', () => {
    const proyecto = arbol('SICOE', { epicas: 0, historias: 0, tareas: 5 }, [
      { epica: 'SICOE-E1', historias: [{ id: 'SICOE-H1', tareas: ['SICOE-T5'] }] },
    ]);
    expect(problemasDeContadores(proyecto).filter((p) => p.includes('tareas'))).toEqual([]);
  });

  it('atrapa el caso real: el usuario escribe SICOE-T500 a mano y no toca el contador', () => {
    const proyecto = arbol('SICOE', { epicas: 1, historias: 1, tareas: 108 }, [
      { epica: 'SICOE-E1', historias: [{ id: 'SICOE-H1', tareas: ['SICOE-T500'] }] },
    ]);
    expect(problemasDeContadores(proyecto)).toEqual([
      'contadores.tareas = 108 pero SICOE ya usa el número 500',
    ]);
  });

  it('reporta los tres tipos a la vez, no solo el primero', () => {
    const proyecto = arbol('SICOE', EN_CERO, [
      { epica: 'SICOE-E2', historias: [{ id: 'SICOE-H2', tareas: ['SICOE-T2'] }] },
    ]);
    expect(problemasDeContadores(proyecto)).toHaveLength(3);
  });

  it('un contador muy por encima no es problema: son ids emitidos y luego borrados', () => {
    const proyecto = arbol('SICOE', { epicas: 99, historias: 99, tareas: 999 }, [
      { epica: 'SICOE-E1', historias: [{ id: 'SICOE-H1', tareas: ['SICOE-T1'] }] },
    ]);
    expect(problemasDeContadores(proyecto)).toEqual([]);
  });

  it('un id de otro proyecto colado dentro SÍ sube el contador exigido, con un mensaje que nombra al proyecto equivocado', () => {
    // `maximosUsados` no mira la clave, solo el tipo y el número. El documento ya es
    // inválido por el prefijo cruzado, así que esto no deja pasar nada malo; lo que hace
    // es añadir un segundo mensaje que dice "SICOE ya usa el número 9" cuando el 9 es de
    // INFRA. Queda fijado para que nadie lo lea como un error de contadores real.
    const proyecto = arbol('SICOE', EN_CERO, [{ epica: 'INFRA-E9', historias: [] }]);
    expect(problemasDeContadores(proyecto)).toEqual([
      'contadores.epicas = 0 pero SICOE ya usa el número 9',
    ]);
  });
});
