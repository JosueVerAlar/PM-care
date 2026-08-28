/**
 * El reloj de resolución y los promedios que salen de él.
 *
 * Es la métrica más fácil de falsificar sin querer del producto: un cero por «no
 * calculable» hunde un promedio, un promedio de una sola tarea se lee igual de firme que
 * uno de cuarenta, y una tarea arrastrada por tres sprints puede acumular semanas que
 * nadie trabajó. Las tres cosas se miden aquí.
 */

import { describe, expect, it } from 'vitest';

import {
  diasPorPunto,
  MINIMO_TAREAS_PARA_PROMEDIO,
  promediar,
  resoluciones,
  resolucionDe,
  cerradasSinMedirEnTodo,
  sumarEsfuerzo,
  tiempoPorPersona,
  tiempoPorProyecto,
  type Resolucion,
} from '../../src/compartido/dominio/duracion';
import { indexarTareas } from '../../src/compartido/dominio/derivar';
import {
  unDocumento,
  unItem,
  unProyecto,
  unSprint,
  unaEpica,
  unaHistoria,
  unaPersona,
  unaTarea,
} from '../apoyo/constructores';
import { SEMILLAS, prng, unDocumentoAleatorio } from '../apoyo/generador';
import type { Documento, Tarea } from '../../src/compartido/modelo/tipos';

const CLAVE = 'PM';

/** Un documento de un proyecto, un sprint y las tareas que se le pasen. */
function conSprint(
  tareas: readonly Tarea[],
  sprint: { inicio: string; fin: string; items: ReturnType<typeof unItem>[]; estado?: 'planeado' | 'activo' | 'cerrado' },
  personas: string[] = [],
): Documento {
  return unDocumento({
    personas: personas.map((id) => unaPersona({ id, nombre: id })),
    proyectos: [
      unProyecto({
        clave: CLAVE,
        epicas: [
          unaEpica({ clave: CLAVE, historias: [unaHistoria({ clave: CLAVE, tareas: [...tareas] })] }),
        ],
      }),
    ],
    sprints: [
      unSprint({
        id: 'S1',
        inicio: sprint.inicio,
        fin: sprint.fin,
        estado: sprint.estado ?? 'cerrado',
        items: sprint.items,
      }),
    ],
  });
}

/** La resolución de la primera tarea del documento, o `null`. */
function primera(doc: Documento): Resolucion | null {
  const [ubicacion] = [...indexarTareas(doc).values()];
  return ubicacion === undefined ? null : resolucionDe(doc, ubicacion);
}

const hecha = (id: string, hechaEn: string | null, over: Partial<Tarea> = {}) =>
  unaTarea({ clave: CLAVE, id, estado: 'hecha', hecha_en: hechaEn, ...over });

describe('el reloj corre desde que arranca el sprint', () => {
  it('una tarea comprometida desde el arranque cuenta los días del sprint', () => {
    const doc = conSprint([hecha(`${CLAVE}-T1`, '2026-08-28T17:00:00-06:00')], {
      inicio: '2026-08-24',
      fin: '2026-09-06',
      items: [unItem(`${CLAVE}-T1`, { comprometida_en: '2026-08-24T09:00:00-06:00' })],
    });
    // Del 24 a las 00:00 al 28 a las 17:00 son 4.7 días.
    expect(primera(doc)?.dias).toBe(4.7);
  });

  /**
   * El matiz que protege la regla del usuario sin cambiarla: una tarea metida el día 8 no
   * puede cargar con los siete días en que ni existía el compromiso.
   */
  it('una tarea metida a mitad del sprint NO carga los días anteriores', () => {
    const doc = conSprint([hecha(`${CLAVE}-T1`, '2026-09-02T00:00:00-06:00')], {
      inicio: '2026-08-24',
      fin: '2026-09-06',
      items: [unItem(`${CLAVE}-T1`, { comprometida_en: '2026-08-31T00:00:00-06:00' })],
    });
    expect(primera(doc)?.dias, 'del 31 al 2, no del 24 al 2').toBe(2);
  });

  /**
   * Al revés no: planear la quincena por adelantado es normal, y ahí manda el arranque
   * del sprint, que es literalmente lo que el usuario pidió.
   */
  it('un compromiso anterior al arranque no adelanta el reloj', () => {
    const doc = conSprint([hecha(`${CLAVE}-T1`, '2026-08-26T00:00:00-06:00')], {
      inicio: '2026-08-24',
      fin: '2026-09-06',
      items: [unItem(`${CLAVE}-T1`, { comprometida_en: '2026-08-10T00:00:00-06:00' })],
    });
    expect(primera(doc)?.dias).toBe(2);
  });

  /** Los items escritos antes de que el campo existiera: se cae al arranque, sin romper. */
  it('sin `comprometida_en` cuenta desde el arranque del sprint', () => {
    const doc = conSprint([hecha(`${CLAVE}-T1`, '2026-08-26T00:00:00-06:00')], {
      inicio: '2026-08-24',
      fin: '2026-09-06',
      items: [unItem(`${CLAVE}-T1`)],
    });
    expect(primera(doc)?.dias).toBe(2);
  });

  /**
   * Cuatro horas no son cero días. Redondear a enteros haría que todo lo resuelto el
   * mismo día valiera cero y hundiría cualquier promedio.
   */
  it('lo cerrado el mismo día vale una fracción, no cero', () => {
    const doc = conSprint([hecha(`${CLAVE}-T1`, '2026-08-24T06:00:00-06:00')], {
      inicio: '2026-08-24',
      fin: '2026-09-06',
      items: [unItem(`${CLAVE}-T1`, { comprometida_en: '2026-08-24T00:00:00-06:00' })],
    });
    expect(primera(doc)?.dias).toBe(0.3);
  });
});

describe('lo que NO es calculable devuelve null, jamás cero', () => {
  const sprint = { inicio: '2026-08-24', fin: '2026-09-06', items: [unItem(`${CLAVE}-T1`)] };

  it('una tarea que no está hecha', () => {
    const doc = conSprint([unaTarea({ clave: CLAVE, id: `${CLAVE}-T1`, estado: 'en_curso' })], sprint);
    expect(primera(doc)).toBeNull();
  });

  it('una tarea hecha sin `hecha_en` — pasa con las editadas a mano', () => {
    expect(primera(conSprint([hecha(`${CLAVE}-T1`, null)], sprint))).toBeNull();
  });

  /** El caso más frecuente con la forma de trabajar del usuario: cerró sin comprometerla. */
  it('una tarea cerrada sin haber pasado por ningún sprint', () => {
    const doc = conSprint([hecha(`${CLAVE}-T1`, '2026-08-26T00:00:00-06:00')], {
      ...sprint,
      items: [],
    });
    expect(primera(doc)).toBeNull();
  });

  it('una tarea cerrada ANTES de que el sprint arrancara', () => {
    const doc = conSprint([hecha(`${CLAVE}-T1`, '2026-08-01T00:00:00-06:00')], sprint);
    expect(primera(doc), 'el sprint arrancó el 24; no pudo cerrarse en él').toBeNull();
  });

  it('un `hecha_en` ilegible no tumba el cálculo del resto', () => {
    const doc = conSprint([hecha(`${CLAVE}-T1`, 'ayer por la tarde')], sprint);
    expect(primera(doc)).toBeNull();
  });
});

describe('una tarea arrastrada se mide contra el sprint donde se cerró', () => {
  const arrastrada = () =>
    unDocumento({
      proyectos: [
        unProyecto({
          clave: CLAVE,
          epicas: [
            unaEpica({
              clave: CLAVE,
              historias: [
                unaHistoria({
                  clave: CLAVE,
                  tareas: [hecha(`${CLAVE}-T1`, '2026-09-09T00:00:00-06:00')],
                }),
              ],
            }),
          ],
        }),
      ],
      sprints: [
        unSprint({ id: 'S1', inicio: '2026-08-10', fin: '2026-08-23', estado: 'cerrado', items: [unItem(`${CLAVE}-T1`)] }),
        unSprint({ id: 'S2', inicio: '2026-08-24', fin: '2026-09-06', estado: 'cerrado', items: [unItem(`${CLAVE}-T1`)] }),
        unSprint({ id: 'S3', inicio: '2026-09-07', fin: '2026-09-20', estado: 'activo', items: [unItem(`${CLAVE}-T1`)] }),
      ],
    });

  it('cuenta desde el último sprint, no desde el primero', () => {
    const resolucion = primera(arrastrada());
    expect(resolucion?.sprint.id).toBe('S3');
    expect(resolucion?.dias, 'del 7 al 9, no del 10 de agosto').toBe(2);
  });

  /** El arrastre no se pierde: se cuenta en sprints, que es su unidad. */
  it('el arrastre se cuenta aparte, en sprints', () => {
    expect(primera(arrastrada())?.sprintsAtravesados).toBe(3);
  });
});

describe('el promedio dice sobre cuántas se calculó', () => {
  const medida = (dias: number): Resolucion =>
    ({ dias, tarea: unaTarea({ clave: CLAVE }) }) as Resolucion;

  it('sin medidas no hay promedio ni mediana', () => {
    expect(promediar([])).toMatchObject({ promedio: null, mediana: null, cuentan: 0 });
  });

  /**
   * La regla que impide la mentira más fácil de todas: «14 días de promedio» calculado
   * sobre una tarea se lee igual de firme que uno calculado sobre cuarenta.
   */
  it(`por debajo de ${MINIMO_TAREAS_PARA_PROMEDIO} tareas devuelve el conteo, no el promedio`, () => {
    const pocas = promediar([medida(2), medida(4), medida(6), medida(8)]);
    expect(pocas.promedio).toBeNull();
    expect(pocas.mediana).toBeNull();
    expect(pocas.cuentan, 'el conteo crudo SÍ se da').toBe(4);
  });

  it('con suficientes da promedio y mediana', () => {
    const bastantes = promediar([medida(1), medida(2), medida(3), medida(4), medida(100)]);
    expect(bastantes.promedio).toBe(22);
    expect(bastantes.mediana, 'la mediana aguanta la que se quedó abierta medio año').toBe(3);
    expect(bastantes.masLenta?.dias).toBe(100);
  });

  it('arrastra cuántas se cerraron sin poder medirse', () => {
    expect(promediar([medida(1)], 7).sinMedir).toBe(7);
  });
});

describe('promedios por persona y por proyecto', () => {
  /** Cinco tareas de «ana» para pasar el mínimo, y una de «beto» para no pasarlo. */
  const equipo = () => {
    const tareas = [
      ...[1, 2, 3, 4, 5].map((n) =>
        hecha(`${CLAVE}-T${n}`, `2026-08-2${n}T00:00:00-06:00`, { responsable: 'ana' }),
      ),
      hecha(`${CLAVE}-T6`, '2026-08-26T00:00:00-06:00', { responsable: 'beto' }),
    ];
    return conSprint(
      tareas,
      {
        inicio: '2026-08-20',
        fin: '2026-09-02',
        items: tareas.map((t) => unItem(t.id)),
      },
      ['ana', 'beto'],
    );
  };

  it('atribuye a cada quien lo suyo', () => {
    const filas = tiempoPorPersona(equipo());
    expect(filas.map((f) => [f.id, f.tiempo.cuentan])).toEqual([
      ['ana', 5],
      ['beto', 1],
    ]);
  });

  it('quien tiene pocas no recibe promedio, solo conteo', () => {
    const beto = tiempoPorPersona(equipo()).find((f) => f.id === 'beto');
    expect(beto?.tiempo.promedio).toBeNull();
    expect(beto?.tiempo.cuentan).toBe(1);
  });

  /**
   * El compromiso del sprint manda sobre el responsable de la tarea: reasignar algo el mes
   * que viene no puede reescribir quién lo resolvió.
   */
  it('el responsable del sprint gana sobre el de la tarea', () => {
    const doc = conSprint(
      [hecha(`${CLAVE}-T1`, '2026-08-26T00:00:00-06:00', { responsable: 'ana' })],
      {
        inicio: '2026-08-24',
        fin: '2026-09-06',
        items: [unItem(`${CLAVE}-T1`, { responsable: 'beto' })],
      },
      ['ana', 'beto'],
    );
    expect(primera(doc)?.responsable).toBe('beto');
  });

  it('el proyecto agrupa sus resoluciones y conserva su nombre', () => {
    const [fila] = tiempoPorProyecto(equipo());
    expect(fila?.id).toBe(CLAVE);
    expect(fila?.tiempo.cuentan).toBe(6);
  });

  it('un proyecto sin nada medible no aparece en la tabla', () => {
    const doc = conSprint([unaTarea({ clave: CLAVE, estado: 'pendiente' })], {
      inicio: '2026-08-24',
      fin: '2026-09-06',
      items: [],
    });
    expect(tiempoPorProyecto(doc)).toEqual([]);
  });

  it('resoluciones() no inventa ninguna de la nada', () => {
    expect(resoluciones(equipo())).toHaveLength(6);
  });
});

describe('esfuerzo', () => {
  it('una suma sin ninguna estimación es null, no cero', () => {
    const suma = sumarEsfuerzo([unaTarea({ clave: CLAVE }), unaTarea({ clave: CLAVE })]);
    expect(suma.puntos, 'cero puntos y «sin estimar» no son lo mismo').toBeNull();
    expect(suma).toMatchObject({ estimadas: 0, total: 2 });
  });

  /** La letra chica va pegada al número: 8 pts sobre 2 de 3 tareas, nunca «8 pts». */
  it('la suma viene con cuántas la componen y cuántas faltan', () => {
    const suma = sumarEsfuerzo([
      unaTarea({ clave: CLAVE, esfuerzo: 3 }),
      unaTarea({ clave: CLAVE, esfuerzo: 5 }),
      unaTarea({ clave: CLAVE }),
    ]);
    expect(suma).toEqual({ puntos: 8, estimadas: 2, total: 3 });
  });

  it('días por punto solo mira las que tienen estimación Y duración', () => {
    const medidas = [
      { dias: 6, tarea: unaTarea({ clave: CLAVE, esfuerzo: 3 }) },
      { dias: 4, tarea: unaTarea({ clave: CLAVE, esfuerzo: 5 }) },
      { dias: 90, tarea: unaTarea({ clave: CLAVE }) },
    ] as Resolucion[];
    // Solo dos estimadas: por debajo del mínimo NO se da el cociente, pero sí el conteo.
    expect(diasPorPunto(medidas)).toEqual({ dias: null, sobre: 2, puntos: 8 });
  });

  it('sin ninguna estimada no hay días por punto', () => {
    expect(diasPorPunto([{ dias: 5, tarea: unaTarea({ clave: CLAVE }) } as Resolucion])).toEqual({
      dias: null,
      sobre: 0,
      puntos: 0,
    });
  });

  /** Con suficientes sí, y el cociente viene con sobre cuántas se calculó (regla 3). */
  it('con cinco estimadas da el cociente, y dice sobre cuántas', () => {
    const medidas = Array.from({ length: 5 }, () => ({
      dias: 6,
      tarea: unaTarea({ clave: CLAVE, esfuerzo: 3 }),
    })) as Resolucion[];
    expect(diasPorPunto(medidas)).toEqual({ dias: 2, sobre: 5, puntos: 15 });
  });
});

/**
 * El huso horario, que es de donde salió el único fallo real de este módulo.
 *
 * El sprint guarda `inicio` como fecha suelta, sin hora ni huso. Construir el arranque
 * como `2026-08-24T00:00:00` a secas lo interpretaba en la zona de la MÁQUINA: la misma
 * tarea duraba seis horas distintas según dónde se abriera la app, sin fallar y sin
 * avisar. Ahora el huso sale del instante contra el que se resta.
 */
describe('el huso sale de los datos, no de la máquina', () => {
  const enHuso = (huso: string) =>
    conSprint([hecha(`${CLAVE}-T1`, `2026-08-26T12:00:00${huso}`)], {
      inicio: '2026-08-24',
      fin: '2026-09-06',
      items: [unItem(`${CLAVE}-T1`)],
    });

  it('da lo mismo escrito en -06:00 que en +02:00 que en Z', () => {
    const dias = ['-06:00', '+02:00', 'Z'].map((huso) => primera(enHuso(huso))?.dias);
    expect(new Set(dias).size, 'los tres tienen que dar el MISMO número').toBe(1);
    expect(dias[0], 'del 24 a las 00:00 al 26 a mediodía').toBe(2.5);
  });

  /** Comprometida temprano el primer día: cuenta desde el arranque, no desde las 09:00. */
  it('un compromiso del mismo día del arranque no recorta horas', () => {
    const doc = conSprint([hecha(`${CLAVE}-T1`, '2026-08-28T17:00:00-06:00')], {
      inicio: '2026-08-24',
      fin: '2026-09-06',
      items: [unItem(`${CLAVE}-T1`, { comprometida_en: '2026-08-24T09:00:00-06:00' })],
    });
    expect(primera(doc)?.dias, 'del 24 a las 00:00, no de las 09:00').toBe(4.7);
  });
});

/**
 * Invariantes sobre los 300 árboles generados.
 *
 * Los casos escritos a mano cubren lo que se me ocurrió; esto cubre lo que no. Las cuatro
 * afirmaciones de abajo son las que, si se rompieran, harían que la vista de Tiempos
 * enseñara un número creíble y falso — que es peor que no enseñar nada.
 */
describe('invariantes del reloj sobre árboles generados', () => {
  it('ninguna duración es negativa, NaN ni infinita', () => {
    for (const semilla of SEMILLAS) {
      const doc = unDocumentoAleatorio(prng(semilla), semilla);
      for (const medida of resoluciones(doc)) {
        expect(Number.isFinite(medida.dias), `semilla ${semilla} · ${medida.tarea.id}`).toBe(true);
        expect(medida.dias, `semilla ${semilla} · ${medida.tarea.id}`).toBeGreaterThanOrEqual(0);
      }
    }
  });

  /** Solo lo cerrado se mide. Una tarea abierta con duración sería un dato inventado. */
  it('todo lo medido está hecho y tiene fecha de cierre', () => {
    for (const semilla of SEMILLAS) {
      const doc = unDocumentoAleatorio(prng(semilla), semilla);
      for (const medida of resoluciones(doc)) {
        expect(medida.tarea.estado).toBe('hecha');
        expect(medida.tarea.hecha_en).not.toBeNull();
      }
    }
  });

  /**
   * La regla del mínimo, comprobada donde importa: que no exista NI UNA fila con promedio
   * sobre menos de cinco tareas, en ninguno de los tres cortes.
   */
  it('ninguna fila promedia por debajo del mínimo', () => {
    for (const semilla of SEMILLAS) {
      const doc = unDocumentoAleatorio(prng(semilla), semilla);
      for (const fila of [...tiempoPorPersona(doc), ...tiempoPorProyecto(doc)]) {
        if (fila.tiempo.promedio === null) continue;
        expect(fila.tiempo.cuentan, `semilla ${semilla} · ${fila.id}`).toBeGreaterThanOrEqual(
          MINIMO_TAREAS_PARA_PROMEDIO,
        );
      }
    }
  });

  /** El corte por proyecto no puede perder ni duplicar medidas. */
  it('las filas por proyecto suman exactamente todas las resoluciones', () => {
    for (const semilla of SEMILLAS) {
      const doc = unDocumentoAleatorio(prng(semilla), semilla);
      const enFilas = tiempoPorProyecto(doc).reduce((n, f) => n + f.tiempo.cuentan, 0);
      expect(enFilas, `semilla ${semilla}`).toBe(resoluciones(doc).length);
    }
  });

  /** Y las semillas tienen que traer material de verdad, o esto no mide nada. */
  it('las 300 semillas producen resoluciones medibles', () => {
    const total = SEMILLAS.reduce(
      (n, semilla) => n + resoluciones(unDocumentoAleatorio(prng(semilla), semilla)).length,
      0,
    );
    expect(total, 'si sale 0, el generador dejó de producir tareas cerradas en sprint').toBeGreaterThan(100);
  });
});

/**
 * El defecto que encontró la revisión: un sprint que solo hubiera EMPEZADO antes del cierre
 * se quedaba con la tarea, aunque el cierre ocurriera semanas después de que el sprint
 * terminara. Devolvía veintitantos días — un número creíble y falso, que es peor que no dar
 * ninguno.
 */
describe('el sprint tiene que CONTENER el cierre, no solo haber empezado antes', () => {
  const cerradaFuera = (estadoSprint: 'cerrado' | 'activo') =>
    conSprint([hecha(`${CLAVE}-T1`, '2026-09-20T00:00:00-06:00')], {
      inicio: '2026-08-24',
      fin: '2026-09-06',
      estado: estadoSprint,
      items: [unItem(`${CLAVE}-T1`)],
    });

  it('cerrada dos semanas DESPUÉS de que el sprint terminara: no es medible', () => {
    expect(primera(cerradaFuera('cerrado')), 'serían 27 días que nadie comprometió').toBeNull();
  });

  /**
   * La excepción: el sprint que sigue abierto y se pasó de su fecha de fin. Ahí el cierre
   * SÍ ocurrió dentro del sprint — la fecha de fin solo era una intención.
   */
  it('un sprint abierto que se pasó de su fecha SÍ mide', () => {
    expect(primera(cerradaFuera('activo'))?.dias).toBe(27);
  });

  it('cerrada dentro de la ventana se mide normal', () => {
    const doc = conSprint([hecha(`${CLAVE}-T1`, '2026-09-06T00:00:00-06:00')], {
      inicio: '2026-08-24',
      fin: '2026-09-06',
      items: [unItem(`${CLAVE}-T1`)],
    });
    expect(primera(doc)?.dias).toBe(13);
  });

  /**
   * Una arrastrada que se cierra fuera del último sprint no cae al anterior: los dos
   * quedan descartados y el resultado es `null`, no una medida contra un sprint viejo.
   */
  it('no cae al sprint anterior cuando el último tampoco la contiene', () => {
    const doc = unDocumento({
      proyectos: [
        unProyecto({
          clave: CLAVE,
          epicas: [
            unaEpica({
              clave: CLAVE,
              historias: [
                unaHistoria({ clave: CLAVE, tareas: [hecha(`${CLAVE}-T1`, '2026-10-01T00:00:00-06:00')] }),
              ],
            }),
          ],
        }),
      ],
      sprints: [
        unSprint({ id: 'S1', inicio: '2026-08-10', fin: '2026-08-23', estado: 'cerrado', items: [unItem(`${CLAVE}-T1`)] }),
        unSprint({ id: 'S2', inicio: '2026-08-24', fin: '2026-09-06', estado: 'cerrado', items: [unItem(`${CLAVE}-T1`)] }),
      ],
    });
    expect(primera(doc)).toBeNull();
  });
});

/**
 * El conteo de lo cerrado que NO se pudo medir. Sin él, «promedio sobre 5 tareas» parece
 * hablar de todo el trabajo cuando puede estar hablando de un tercio.
 */
describe('cerradasSinMedirEnTodo', () => {
  it('cuenta las hechas que ningún sprint contiene', () => {
    const doc = conSprint(
      [
        hecha(`${CLAVE}-T1`, '2026-08-26T00:00:00-06:00'),
        hecha(`${CLAVE}-T2`, '2026-08-26T00:00:00-06:00'),
        hecha(`${CLAVE}-T3`, '2026-08-26T00:00:00-06:00'),
      ],
      { inicio: '2026-08-24', fin: '2026-09-06', items: [unItem(`${CLAVE}-T1`)] },
    );
    expect(resoluciones(doc)).toHaveLength(1);
    expect(cerradasSinMedirEnTodo(doc), 'T2 y T3 nunca pasaron por el sprint').toBe(2);
  });

  it('no cuenta lo que sigue abierto', () => {
    const doc = conSprint([unaTarea({ clave: CLAVE, estado: 'en_curso' })], {
      inicio: '2026-08-24',
      fin: '2026-09-06',
      items: [],
    });
    expect(cerradasSinMedirEnTodo(doc)).toBe(0);
  });
});
