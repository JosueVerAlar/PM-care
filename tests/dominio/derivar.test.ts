/**
 * Cálculo derivado: la tabla de casos límite.
 *
 * Cada `it` protege una regla nombrada. Si alguien afloja el cálculo, el nombre de la
 * prueba que se pone en rojo debe bastar para saber qué invariante se rompió, sin abrir
 * el archivo.
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  AVANCE_VACIO,
  MINIMO_TAREAS_PARA_PCT,
  type Avance,
  avanceDeEpica,
  avanceDeHistoria,
  avanceDeProyecto,
  compromisoEfectivo,
  contarTareas,
  estadoDerivado,
  indexarTareas,
  mostrarPct,
  rutaDe,
  sprintActivo,
  sprintsCerrados,
  tareasDe,
  tareasDeEpica,
  tareasDeProyecto,
} from '../../src/compartido/dominio/derivar';
import { validarDocumento } from '../../src/compartido/modelo/esquema';
import type { Documento, Epica, Proyecto } from '../../src/compartido/modelo/tipos';
import {
  repetir,
  tareasConEstados,
  unDocumento,
  unItem,
  unProyecto,
  unSprint,
  unaEpica,
  unaEpicaCon,
  unaHistoria,
  unaHistoriaCon,
  unaTarea,
} from '../apoyo/constructores';
import { SEMILLAS, prng, unDocumentoAleatorio, unProyectoAleatorio } from '../apoyo/generador';

// --- conteo crudo -----------------------------------------------------------

describe('contarTareas', () => {
  it('reparte cada estado en su casilla y no inventa ninguna', () => {
    const avance = contarTareas(
      tareasConEstados([
        'done',
        'done',
        'iniciado',
        'en_pruebas',
        'terminado',
        'pendiente',
        'cancelada',
      ]),
    );
    expect(avance).toEqual({
      hojas: 6,
      hechas: 2,
      enCurso: 3,
      pendientes: 1,
      canceladas: 1,
      pct: 33,
      // Una lista suelta de tareas no tiene contenedores debajo: nada que desglosar.
      contenedoresSinDesglosar: 0,
    });
  });

  it('regla 5: las canceladas quedan fuera del denominador', () => {
    const sinCancelar = contarTareas(tareasConEstados(['done', 'pendiente']));
    const conCancelada = contarTareas(tareasConEstados(['done', 'pendiente', 'cancelada']));
    expect(conCancelada.hojas).toBe(sinCancelar.hojas);
    expect(conCancelada.pct).toBe(sinCancelar.pct);
    expect(conCancelada.canceladas).toBe(1);
  });

  it('regla 5: cinco canceladas y nada más no forman denominador — pct null, no 0%', () => {
    const avance = contarTareas(tareasConEstados(repetir('cancelada', 5)));
    expect(avance.hojas).toBe(0);
    expect(avance.canceladas).toBe(5);
    expect(avance.pct).toBeNull();
  });

  it('regla 5: una cancelada no impide que el resto cuente como completo', () => {
    const avance = contarTareas(tareasConEstados(['done', 'done', 'cancelada']));
    expect(avance.pct).toBe(100);
    expect(estadoDerivado(avance)).toBe('hecha');
  });

  it('regla 2: división entre cero — lista vacía da null, jamás NaN ni la cadena "NaN"', () => {
    const avance = contarTareas([]);
    expect(avance.pct).toBeNull();
    expect(avance.pct).not.toBe(0);
    expect(Number.isNaN(avance.pct as unknown as number)).toBe(false);
    expect(String(avance.pct)).not.toBe('NaN');
  });

  it('un estado desconocido no puede desaparecer del denominador en silencio', () => {
    // El esquema lo rechaza y el `never` rompe la compilación al ampliar el enum. Este
    // caso conserva además una defensa explícita para quien eluda el tipo y la validación.
    const rara = unaTarea({ estado: 'zombie' as never });
    expect(() => contarTareas([unaTarea({ estado: 'done' }), rara])).toThrow(
      'Estado de tarea no contado: zombie',
    );
  });

  it('cuatro tareas del defecto dan una aceptada de cuatro, no una de dos', () => {
    const avance = contarTareas(
      tareasConEstados(['done', 'pendiente', 'en_pruebas', 'terminado']),
    );
    expect(avance.hojas).toBe(4);
    expect(avance.enCurso).toBe(2);
    expect(avance.pct).toBe(25);
  });
});

// --- contenedores vacíos ----------------------------------------------------

describe('contenedores sin tareas (regla 2)', () => {
  it('una épica sin historias da pct null y estado sin_desglosar', () => {
    const avance = avanceDeEpica(unaEpica());
    expect(avance.pct).toBeNull();
    expect(avance.hojas).toBe(0);
    expect(estadoDerivado(avance)).toBe('sin_desglosar');
  });

  it('una historia sin tareas da pct null, nunca 0', () => {
    const avance = avanceDeHistoria(unaHistoria());
    expect(avance.pct).toBeNull();
    expect(avance.pct).not.toBe(0);
  });

  it('una épica con historias todas vacías sigue dando pct null', () => {
    const avance = avanceDeEpica(unaEpicaCon([[], [], []]));
    expect(avance.pct).toBeNull();
    expect(estadoDerivado(avance)).toBe('sin_desglosar');
  });

  it('un proyecto sin épicas da pct null', () => {
    expect(avanceDeProyecto(unProyecto()).pct).toBeNull();
  });

  it('una historia vacía junto a otra con tareas no aporta al denominador', () => {
    const epica = unaEpicaCon([['done', 'pendiente'], []]);
    const avance = avanceDeEpica(epica);
    expect(avance.hojas).toBe(2);
    expect(avance.pct).toBe(50);
  });
});

// --- el 100% y el verde -----------------------------------------------------

describe('regla 4: verde solo si el estado es hecha, jamás por redondeo', () => {
  it('terminado sigue esperando aceptación: no es verde ni sube el porcentaje', () => {
    const avance = contarTareas(tareasConEstados(['done', 'terminado']));
    expect(avance.pct).toBe(50);
    expect(estadoDerivado(avance)).toBe('en_movimiento');
  });
  it('199 de 200 hechas: el porcentaje se topa en 99 aunque redondee a 100', () => {
    const avance = contarTareas(
      tareasConEstados([...repetir('done', 199), ...repetir('iniciado', 1)]),
    );
    expect(Math.round((199 / 200) * 100)).toBe(100); // el redondeo crudo sí cruza
    expect(avance.pct).toBe(99);
    expect(avance.pct).not.toBe(100);
  });

  it('199 de 200 hechas: el estado derivado sigue en movimiento, no hecha', () => {
    const avance = contarTareas(
      tareasConEstados([...repetir('done', 199), ...repetir('iniciado', 1)]),
    );
    expect(estadoDerivado(avance)).toBe('en_movimiento');
    expect(estadoDerivado(avance)).not.toBe('hecha');
  });

  it('estadoDerivado decide por el conteo, no por el pct: un 100 con hojas abiertas no es verde', () => {
    // Hoy `contarTareas` topa el pct en 99 y por eso los dos criterios coinciden. Esta
    // prueba desacopla las dos cosas: `estadoDerivado` recibe un avance cualquiera y no
    // debe fiarse del número que traiga. Sin ella, cambiar la condición a `pct === 100`
    // pasa desapercibido hasta el día que alguien quite el tope.
    const mentiroso: Avance = { hojas: 200, hechas: 199, enCurso: 1, pendientes: 0, canceladas: 0, pct: 100, contenedoresSinDesglosar: 0 };
    expect(estadoDerivado(mentiroso)).toBe('en_movimiento');
    expect(estadoDerivado(mentiroso)).not.toBe('hecha');
  });

  it('estadoDerivado tampoco cree en un pct null cuando el conteo dice que está todo hecho', () => {
    const mentiroso: Avance = { hojas: 3, hechas: 3, enCurso: 0, pendientes: 0, canceladas: 0, pct: null, contenedoresSinDesglosar: 0 };
    expect(estadoDerivado(mentiroso)).toBe('hecha');
  });

  it('200 de 200 hechas: ahora sí, 100 y hecha', () => {
    const avance = contarTareas(tareasConEstados(repetir('done', 200)));
    expect(avance.pct).toBe(100);
    expect(estadoDerivado(avance)).toBe('hecha');
  });

  it('el 100 se alcanza si y solo si hechas === hojas, para cualquier tamaño', () => {
    for (const total of [1, 2, 5, 7, 33, 200, 201, 999]) {
      const casiTodas = contarTareas(
        tareasConEstados([...repetir('done', total - 1), ...repetir('pendiente', 1)]),
      );
      const todas = contarTareas(tareasConEstados(repetir('done', total)));
      expect(casiTodas.pct, `${total - 1} de ${total}`).not.toBe(100);
      expect(todas.pct, `${total} de ${total}`).toBe(100);
    }
  });

  it('una emergente sin cerrar entre puras hechas deja el contenedor en movimiento', () => {
    const epica = unaEpica({
      historias: [
        unaHistoriaCon(repetir('done', 4)),
        unaHistoria({ tareas: [unaTarea({ estado: 'pendiente', planeada: false })] }),
      ],
    });
    const avance = avanceDeEpica(epica);
    expect(avance.pct).toBe(80);
    expect(estadoDerivado(avance)).toBe('en_movimiento');
  });

  it('una emergente YA CERRADA entre puras hechas deja el contenedor hecho (verde, no amarillo)', () => {
    const epica = unaEpica({
      historias: [
        unaHistoriaCon(repetir('done', 4)),
        unaHistoria({ tareas: [unaTarea({ estado: 'done', planeada: false })] }),
      ],
    });
    const avance = avanceDeEpica(epica);
    expect(avance.pct).toBe(100);
    expect(estadoDerivado(avance)).toBe('hecha');
  });

  it('una emergente cancelada entre puras hechas tampoco impide el verde', () => {
    const epica = unaEpica({
      historias: [
        unaHistoriaCon(repetir('done', 4)),
        unaHistoria({ tareas: [unaTarea({ estado: 'cancelada', planeada: false })] }),
      ],
    });
    expect(estadoDerivado(avanceDeEpica(epica))).toBe('hecha');
  });
});

// --- lo que falta por desglosar ---------------------------------------------

describe('regla 2: una historia sin desglosar impide el verde de su épica', () => {
  /**
   * El defecto que esta sección arregla: la épica tenía sus tareas cerradas y una historia
   * que nadie había abierto, y se pintaba «Completa». Es la misma mentira que un `0 %` en
   * un contenedor vacío — una historia sin tareas no dice que no haya trabajo, dice que
   * nadie lo ha desglosado todavía— y esconde justo lo siguiente que hay que hacer.
   */
  const epicaDelDefecto = () =>
    unaEpicaCon([['done', 'done', 'done'], ['done', 'done', 'done'], []]);

  it('6 de 6 hechas con una historia vacía NO es hecha', () => {
    const avance = avanceDeEpica(epicaDelDefecto());
    expect(avance.hechas).toBe(6);
    expect(avance.hojas).toBe(6);
    expect(estadoDerivado(avance)).not.toBe('hecha');
  });

  it('cae en en_movimiento, no en un quinto estado: hay avance y no está terminado', () => {
    expect(estadoDerivado(avanceDeEpica(epicaDelDefecto()))).toBe('en_movimiento');
  });

  it('el avance dice CUÁNTAS faltan, para poder escribir «6/6 · 1 sin desglosar»', () => {
    // Negar el verde sin explicar por qué sería peor que el defecto: la vista necesita el
    // número, no solo la ausencia de color.
    expect(avanceDeEpica(epicaDelDefecto()).contenedoresSinDesglosar).toBe(1);
  });

  it('el pct sigue siendo 100 y eso está bien: el que deja de mentir es el estado', () => {
    // Bajarlo a 99 sería inventar un avance (regla 5: el pct sale del agregado de las
    // hojas, y una historia sin desglosar no tiene hojas que agregar). El caso es
    // exactamente el que la regla 4 anticipa: pct 100 y aun así nada de verde.
    const avance = avanceDeEpica(epicaDelDefecto());
    expect(avance.pct).toBe(100);
    expect(estadoDerivado(avance)).not.toBe('hecha');
  });

  it('dos historias vacías cuentan dos, no una', () => {
    const epica = unaEpicaCon([['done', 'done'], [], []]);
    expect(avanceDeEpica(epica).contenedoresSinDesglosar).toBe(2);
  });

  it('sin historias vacías el conteo es 0 y el verde llega igual que antes', () => {
    const epica = unaEpicaCon([['done', 'done'], ['done']]);
    const avance = avanceDeEpica(epica);
    expect(avance.contenedoresSinDesglosar).toBe(0);
    expect(estadoDerivado(avance)).toBe('hecha');
  });

  it('una historia DESGLOSADA y luego cancelada entera no cuenta como sin desglosar', () => {
    // Aquí está el riesgo de pasarse de estricto. Esta historia sí se planeó; lo que se
    // decidió fue no hacerla. No falta abrir nada, así que la épica sí está terminada.
    const epica = unaEpicaCon([['done', 'done', 'done'], ['cancelada', 'cancelada']]);
    const avance = avanceDeEpica(epica);
    expect(avance.hojas).toBe(3);
    expect(avance.canceladas).toBe(2);
    expect(avance.contenedoresSinDesglosar).toBe(0);
    expect(estadoDerivado(avance)).toBe('hecha');
  });

  it('una historia nunca se cuenta a sí misma: sus hijos son tareas, y una tarea no se desglosa', () => {
    expect(avanceDeHistoria(unaHistoria()).contenedoresSinDesglosar).toBe(0);
    expect(avanceDeHistoria(unaHistoriaCon(['done'])).contenedoresSinDesglosar).toBe(0);
  });

  it('la épica sin historias no se cuenta a sí misma: ya es sin_desglosar por no tener hojas', () => {
    const avance = avanceDeEpica(unaEpica());
    expect(avance.contenedoresSinDesglosar).toBe(0);
    expect(estadoDerivado(avance)).toBe('sin_desglosar');
  });

  it('con todo pendiente y una historia vacía sigue siendo pendiente, no en_movimiento', () => {
    // Lo que falta por desglosar quita el verde; no inventa movimiento donde no lo hay.
    const epica = unaEpicaCon([['pendiente', 'pendiente'], []]);
    expect(estadoDerivado(avanceDeEpica(epica))).toBe('pendiente');
  });

  it('el proyecto cuenta los dos niveles: épicas sin historias e historias sin tareas', () => {
    const proyecto = unProyecto({
      epicas: [
        unaEpica(), // sin historias: cuenta 1
        unaEpicaCon([['done'], [], []]), // dos historias vacías: cuentan 2
      ],
    });
    const avance = avanceDeProyecto(proyecto);
    expect(avance.contenedoresSinDesglosar).toBe(3);
    expect(estadoDerivado(avance)).toBe('en_movimiento');
  });

  it('una épica con tres historias vacías aporta 3 al proyecto, no 1: lo que falta abrir son tres', () => {
    const proyecto = unProyecto({ epicas: [unaEpicaCon([[], [], []])] });
    expect(avanceDeProyecto(proyecto).contenedoresSinDesglosar).toBe(3);
  });

  it('un conjunto suelto de tareas (sprint, carga) nunca se vuelve estricto: contenedores 0', () => {
    // `contarTareas` la usan sprint.ts y administracion.ts sobre listas planas. Ahí no hay
    // contenedores debajo y no debe aparecer un "sin desglosar" de la nada.
    expect(contarTareas(tareasConEstados(repetir('done', 3))).contenedoresSinDesglosar).toBe(0);
    expect(estadoDerivado(contarTareas(tareasConEstados(repetir('done', 3))))).toBe('hecha');
  });
});

// --- agregado contra promedio ----------------------------------------------

/** El promedio de los hijos: lo que la regla 3 prohíbe. Solo existe para contrastarlo. */
function promedioDeHistorias(epica: Epica): number | null {
  const pcts = epica.historias
    .map((historia) => avanceDeHistoria(historia).pct)
    .filter((pct): pct is number => pct !== null);
  if (pcts.length === 0) return null;
  return Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length);
}

describe('regla 3: el pct de la épica es el agregado de sus hojas, no el promedio de sus historias', () => {
  /**
   * Historias de tamaño desigual: 2 tareas (1 hecha), 1 tarea, 1 tarea.
   * Agregado 1/4 = 25. Promedio de hijos (50 + 0 + 0)/3 = 17. Si coincidieran, la prueba
   * no mediría nada — por eso lo primero que hace es exigir que difieran.
   */
  const epicaDesigual = () =>
    unaEpicaCon([['done', 'pendiente'], ['pendiente'], ['pendiente']]);

  it('el caso construido de verdad distingue agregado de promedio', () => {
    const epica = epicaDesigual();
    expect(promedioDeHistorias(epica)).not.toBe(avanceDeEpica(epica).pct);
  });

  it('la épica vale el agregado (25%), no el promedio de sus historias (17%)', () => {
    const epica = epicaDesigual();
    expect(avanceDeEpica(epica).pct).toBe(25);
    expect(avanceDeEpica(epica).pct).not.toBe(promedioDeHistorias(epica));
  });

  it('tres historias al 33% no hacen una épica al 99%: la suma de los hijos no es el padre', () => {
    const epica = unaEpicaCon([
      ['done', 'pendiente', 'pendiente'],
      ['done', 'pendiente', 'pendiente'],
      ['done', 'pendiente', 'pendiente'],
    ]);
    const hijos = epica.historias.map((h) => avanceDeHistoria(h).pct);
    expect(hijos).toEqual([33, 33, 33]);
    expect(hijos.reduce<number>((suma, pct) => suma + (pct ?? 0), 0)).toBe(99);
    expect(avanceDeEpica(epica).pct).toBe(33);
  });

  it('una historia vacía no arrastra el promedio: no cuenta ni como 0 ni como 100', () => {
    const conVacia = unaEpicaCon([['done', 'done', 'pendiente', 'pendiente'], []]);
    const sinVacia = unaEpicaCon([['done', 'done', 'pendiente', 'pendiente']]);
    expect(avanceDeEpica(conVacia).pct).toBe(avanceDeEpica(sinVacia).pct);
    expect(avanceDeEpica(conVacia).pct).toBe(50);
  });

  it('el proyecto agrega las hojas de todas sus épicas, no promedia épicas', () => {
    const proyecto = unProyecto({
      epicas: [unaEpicaCon([['done', 'pendiente', 'pendiente']]), unaEpicaCon([['done']])],
    });
    // Agregado: 2 de 4 = 50. Promedio de épicas: (33 + 100)/2 = 67.
    expect(avanceDeProyecto(proyecto).pct).toBe(50);
    expect(avanceDeProyecto(proyecto).pct).not.toBe(67);
  });

  it('tareasDeEpica aplana todas las hojas de todas las historias', () => {
    const epica = unaEpicaCon([['done', 'pendiente'], [], ['cancelada']]);
    expect(tareasDeEpica(epica)).toHaveLength(3);
  });

  it('tareasDeProyecto aplana todas las hojas de todas las épicas', () => {
    const proyecto = unProyecto({ epicas: [unaEpicaCon([['done']]), unaEpicaCon([[], ['pendiente', 'pendiente']])] });
    expect(tareasDeProyecto(proyecto)).toHaveLength(3);
  });
});

// --- estado derivado --------------------------------------------------------

describe('estadoDerivado', () => {
  it('sin hojas: sin_desglosar', () => {
    expect(estadoDerivado(contarTareas([]))).toBe('sin_desglosar');
  });

  it('todas pendientes: pendiente', () => {
    expect(estadoDerivado(contarTareas(tareasConEstados(repetir('pendiente', 4))))).toBe('pendiente');
  });

  it('una en curso entre pendientes: en_movimiento', () => {
    expect(estadoDerivado(contarTareas(tareasConEstados(['iniciado', 'pendiente', 'pendiente'])))).toBe(
      'en_movimiento',
    );
  });

  it('una hecha entre pendientes: en_movimiento', () => {
    expect(estadoDerivado(contarTareas(tareasConEstados(['done', 'pendiente', 'pendiente'])))).toBe(
      'en_movimiento',
    );
  });

  it('todas hechas: hecha', () => {
    expect(estadoDerivado(contarTareas(tareasConEstados(repetir('done', 3))))).toBe('hecha');
  });

  it('límite conocido: todo cancelado se lee sin_desglosar, y canceladas > 0 lo distingue de vacío', () => {
    const todoCancelado = contarTareas(tareasConEstados(repetir('cancelada', 3)));
    const vacio = contarTareas([]);
    expect(estadoDerivado(todoCancelado)).toBe('sin_desglosar');
    expect(estadoDerivado(vacio)).toBe('sin_desglosar');
    expect(todoCancelado.canceladas).toBeGreaterThan(0);
    expect(vacio.canceladas).toBe(0);
  });

  it('cumple su definición ejecutable: hojas > 0 && (hechas + enCurso) > 0 && hechas < hojas', () => {
    const enMovimiento = (a: Avance) => a.hojas > 0 && a.hechas + a.enCurso > 0 && a.hechas < a.hojas;
    for (const estados of [
      ['done', 'pendiente'],
      ['iniciado', 'pendiente'],
      ['pendiente'],
      ['done'],
      [],
      ['cancelada'],
    ] as const) {
      const avance = contarTareas(tareasConEstados(estados));
      expect(estadoDerivado(avance) === 'en_movimiento', estados.join('+') || '(vacío)').toBe(
        enMovimiento(avance),
      );
    }
  });
});

// --- mostrar el porcentaje --------------------------------------------------

describe('mostrarPct: ningún porcentaje se muestra sin su conteo crudo', () => {
  it('el umbral es 5 tareas', () => {
    expect(MINIMO_TAREAS_PARA_PCT).toBe(5);
  });

  it('con 4 hojas no se muestra el porcentaje: "1 de 4" informa y "25%" engaña', () => {
    expect(mostrarPct(contarTareas(tareasConEstados(['done', 'pendiente', 'pendiente', 'pendiente'])))).toBe(
      false,
    );
  });

  it('con 5 hojas exactas ya se muestra', () => {
    const avance = contarTareas(tareasConEstados([...repetir('done', 1), ...repetir('pendiente', 4)]));
    expect(avance.hojas).toBe(5);
    expect(mostrarPct(avance)).toBe(true);
  });

  it('sin hojas nunca se muestra, aunque haya canceladas de sobra', () => {
    expect(mostrarPct(contarTareas(tareasConEstados(repetir('cancelada', 9))))).toBe(false);
  });

  it('las canceladas no empujan por encima del umbral', () => {
    const avance = contarTareas(
      tareasConEstados([...repetir('done', 2), ...repetir('pendiente', 2), ...repetir('cancelada', 5)]),
    );
    expect(avance.hojas).toBe(4);
    expect(mostrarPct(avance)).toBe(false);
  });

  it('todo avance lleva su conteo crudo al lado del pct: hojas y hechas son números', () => {
    for (const avance of [AVANCE_VACIO, contarTareas(tareasConEstados(repetir('done', 7)))]) {
      expect(Number.isInteger(avance.hojas)).toBe(true);
      expect(Number.isInteger(avance.hechas)).toBe(true);
    }
  });

  it('AVANCE_VACIO es el cero del tipo: todo en 0 y pct null', () => {
    expect(AVANCE_VACIO).toEqual({
      hojas: 0,
      hechas: 0,
      enCurso: 0,
      pendientes: 0,
      canceladas: 0,
      pct: null,
      contenedoresSinDesglosar: 0,
    });
    expect(mostrarPct(AVANCE_VACIO)).toBe(false);
  });
});

// --- índice y ruta ----------------------------------------------------------

describe('indexarTareas y rutaDe', () => {
  const doc = () =>
    unDocumento({
      proyectos: [
        unProyecto({
          clave: 'PRUEBA',
          epicas: [unaEpica({ titulo: 'Regularización', historias: [unaHistoria({ titulo: 'Grupos', tareas: [unaTarea({ id: 'PRUEBA-T900' })] })] })],
        }),
      ],
    });

  it('indexa todas las tareas del árbol por su id', () => {
    expect(indexarTareas(doc()).get('PRUEBA-T900')?.tarea.id).toBe('PRUEBA-T900');
  });

  it('un documento sin proyectos da un índice vacío, no revienta', () => {
    expect(indexarTareas(unDocumento()).size).toBe(0);
  });

  it('la ruta es proyecto, épica, historia — en ese orden', () => {
    const ubicacion = indexarTareas(doc()).get('PRUEBA-T900');
    expect(ubicacion && rutaDe(ubicacion)).toEqual(['PRUEBA', 'Regularización', 'Grupos']);
  });

  it('con ids duplicados el índice se queda con la última y la primera desaparece', () => {
    // No es una decisión del índice, es lo que hace un Map. Por eso el esquema tiene que
    // rechazar los duplicados antes: aquí ya no hay forma de notarlo.
    const documento = unDocumento({
      proyectos: [
        unProyecto({
          epicas: [
            unaEpica({
              historias: [
                unaHistoria({ tareas: [unaTarea({ id: 'PRUEBA-T1', titulo: 'primera' })] }),
                unaHistoria({ tareas: [unaTarea({ id: 'PRUEBA-T1', titulo: 'segunda' })] }),
              ],
            }),
          ],
        }),
      ],
    });
    const indice = indexarTareas(documento);
    expect(indice.size).toBe(1);
    expect(indice.get('PRUEBA-T1')?.tarea.titulo).toBe('segunda');
  });
});

// --- compromiso de sprint ---------------------------------------------------

describe('compromisoEfectivo', () => {
  const tarea = () =>
    unaTarea({ responsable: 'ana', fecha_limite: '2026-08-30', prioridad: 'alta' });

  it('un null en el item significa heredar de la tarea, no desasignar', () => {
    expect(compromisoEfectivo(unItem('PRUEBA-T1'), tarea())).toEqual({
      responsable: 'ana',
      fechaLimite: '2026-08-30',
      prioridad: 'alta',
    });
  });

  it('lo que el item declara manda sobre la tarea', () => {
    const item = unItem('PRUEBA-T1', { responsable: 'beto', fecha_limite: '2026-09-01', prioridad: 'baja' });
    expect(compromisoEfectivo(item, tarea())).toEqual({
      responsable: 'beto',
      fechaLimite: '2026-09-01',
      prioridad: 'baja',
    });
  });

  it('con la tarea inexistente devuelve nulls en vez de reventar', () => {
    expect(compromisoEfectivo(unItem('PRUEBA-T404'), undefined)).toEqual({
      responsable: null,
      fechaLimite: null,
      prioridad: null,
    });
  });

  it('con la tarea inexistente conserva lo que el propio item declaró', () => {
    expect(compromisoEfectivo(unItem('PRUEBA-T404', { responsable: 'beto' }), undefined).responsable).toBe(
      'beto',
    );
  });
});

// --- sprints ----------------------------------------------------------------

describe('sprintActivo y sprintsCerrados', () => {
  it('sin sprints no hay activo', () => {
    expect(sprintActivo(unDocumento(), null)).toBeUndefined();
  });

  it('un sprint planeado no es el activo', () => {
    const doc = unDocumento({ sprints: [unSprint({ estado: 'planeado' })] });
    expect(sprintActivo(doc, null)).toBeUndefined();
  });

  it('encuentra el activo entre cerrados y planeados', () => {
    const doc = unDocumento({
      sprints: [
        unSprint({ id: 'S-1', estado: 'cerrado', inicio: '2026-07-01', fin: '2026-07-14' }),
        unSprint({ id: 'S-2', estado: 'activo' }),
        unSprint({ id: 'S-3', estado: 'planeado', inicio: '2026-09-01', fin: '2026-09-14' }),
      ],
    });
    expect(sprintActivo(doc, null)?.id).toBe('S-2');
  });

  it('los cerrados salen del más viejo al más nuevo aunque el array esté desordenado', () => {
    const doc = unDocumento({
      sprints: [
        unSprint({ id: 'S-C', estado: 'cerrado', inicio: '2026-08-01', fin: '2026-08-14' }),
        unSprint({ id: 'S-A', estado: 'cerrado', inicio: '2026-06-01', fin: '2026-06-14' }),
        unSprint({ id: 'S-B', estado: 'cerrado', inicio: '2026-07-01', fin: '2026-07-14' }),
      ],
    });
    expect(sprintsCerrados(doc).map((s) => s.id)).toEqual(['S-A', 'S-B', 'S-C']);
  });

  it('regla 8: ordenar los cerrados no reordena el documento', () => {
    const doc = unDocumento({
      sprints: [
        unSprint({ id: 'S-C', estado: 'cerrado', inicio: '2026-08-01', fin: '2026-08-14' }),
        unSprint({ id: 'S-A', estado: 'cerrado', inicio: '2026-06-01', fin: '2026-06-14' }),
      ],
    });
    sprintsCerrados(doc);
    expect(doc.sprints.map((s) => s.id)).toEqual(['S-C', 'S-A']);
  });

  it('los planeados no se cuelan entre los cerrados', () => {
    const doc = unDocumento({
      sprints: [unSprint({ id: 'S-P', estado: 'planeado', inicio: '2026-01-01', fin: '2026-01-14' })],
    });
    expect(sprintsCerrados(doc)).toHaveLength(0);
  });
});

// --- invariantes sobre árboles generados ------------------------------------

describe('invariantes sobre 300 árboles generados', () => {
  /** Recorre cada contenedor del proyecto con una etiqueta legible para el fallo. */
  function contenedores(semilla: number) {
    const proyecto = unProyectoAleatorio(prng(semilla));
    const filas: { donde: string; avance: Avance }[] = [
      { donde: `semilla ${semilla} · proyecto`, avance: avanceDeProyecto(proyecto) },
    ];
    for (const epica of proyecto.epicas) {
      filas.push({ donde: `semilla ${semilla} · ${epica.id}`, avance: avanceDeEpica(epica) });
      for (const historia of epica.historias) {
        filas.push({ donde: `semilla ${semilla} · ${historia.id}`, avance: avanceDeHistoria(historia) });
      }
    }
    return { proyecto, filas };
  }

  it('el pct nunca es NaN y siempre es null o un entero de 0 a 100', () => {
    for (const semilla of SEMILLAS) {
      for (const { donde, avance } of contenedores(semilla).filas) {
        if (avance.pct === null) continue;
        expect(Number.isNaN(avance.pct), donde).toBe(false);
        expect(Number.isInteger(avance.pct), donde).toBe(true);
        expect(avance.pct, donde).toBeGreaterThanOrEqual(0);
        expect(avance.pct, donde).toBeLessThanOrEqual(100);
      }
    }
  });

  it('regla 2: pct es null exactamente cuando no hay hojas', () => {
    for (const semilla of SEMILLAS) {
      for (const { donde, avance } of contenedores(semilla).filas) {
        expect(avance.pct === null, donde).toBe(avance.hojas === 0);
      }
    }
  });

  it('regla 4: pct === 100 exactamente cuando hechas === hojas y hay hojas', () => {
    for (const semilla of SEMILLAS) {
      for (const { donde, avance } of contenedores(semilla).filas) {
        expect(avance.pct === 100, donde).toBe(avance.hojas > 0 && avance.hechas === avance.hojas);
        // El pct sigue dependiendo solo de las hojas —no hay forma honesta de meter en un
        // porcentaje lo que nadie ha desglosado—, pero el VERDE además exige que no quede
        // ningún contenedor sin abrir. Aquí es donde los dos criterios dejan de coincidir,
        // que es justamente lo que la regla 4 quiere: el color no lo decide el número.
        expect(estadoDerivado(avance) === 'hecha', donde).toBe(
          avance.hojas > 0 && avance.hechas === avance.hojas && avance.contenedoresSinDesglosar === 0,
        );
      }
    }
  });

  it('regla 5: las hojas son hechas + enCurso + pendientes, y las canceladas nunca entran', () => {
    for (const semilla of SEMILLAS) {
      for (const { donde, avance } of contenedores(semilla).filas) {
        expect(avance.hojas, donde).toBe(avance.hechas + avance.enCurso + avance.pendientes);
        expect(avance.hechas, donde).toBeLessThanOrEqual(avance.hojas);
      }
    }
  });

  /**
   * Desde N9 un contenedor tiene dos clases de hojas: las de sus hijos y las suyas
   * propias. La invariante es la misma —el padre es la suma, nunca el promedio— pero la
   * suma incluye lo que cuelga directamente de él. Si `tareasDe` olvidara uno de los tres
   * sitios, estas 300 semillas lo verían: el padre contaría menos que sus hijos.
   */
  it('regla 3: las hojas del padre son la suma de las de sus hijos MÁS las suyas', () => {
    for (const semilla of SEMILLAS) {
      const { proyecto } = contenedores(semilla);
      let hojasDelProyecto = contarTareas(tareasDe(proyecto)).hojas;
      for (const epica of proyecto.epicas) {
        const suma =
          epica.historias.reduce((acc, h) => acc + avanceDeHistoria(h).hojas, 0) +
          contarTareas(tareasDe(epica)).hojas;
        expect(avanceDeEpica(epica).hojas, `semilla ${semilla} · ${epica.id}`).toBe(suma);
        hojasDelProyecto += suma;
      }
      expect(avanceDeProyecto(proyecto).hojas, `semilla ${semilla} · proyecto`).toBe(hojasDelProyecto);
    }
  });

  /**
   * La red de N9 sobre datos generados: que los árboles traigan de verdad las tres formas.
   * Sin esto, las invariantes de arriba podrían estar pasando sobre 300 árboles clásicos.
   */
  it('las 300 semillas incluyen tareas colgadas de épica y de proyecto', () => {
    let deEpica = 0;
    let deProyecto = 0;
    for (const semilla of SEMILLAS) {
      const { proyecto } = contenedores(semilla);
      if (tareasDe(proyecto).length > 0) deProyecto += 1;
      if (proyecto.epicas.some((e) => tareasDe(e).length > 0)) deEpica += 1;
    }
    expect(deEpica, 'ninguna épica generada lleva tareas directas').toBeGreaterThan(0);
    expect(deProyecto, 'ningún proyecto generado lleva tareas sueltas').toBeGreaterThan(0);
  });

  it('todo documento que produce el generador es válido: si no, las invariantes medirían ruido', () => {
    for (const semilla of SEMILLAS.slice(0, 60)) {
      const resultado = validarDocumento(unDocumentoAleatorio(prng(semilla), semilla));
      expect(
        resultado.ok ? [] : resultado.problemas.map((p) => `${p.ruta}: ${p.mensaje}`),
        `semilla ${semilla}`,
      ).toEqual([]);
    }
  });
});

// --- el fixture real --------------------------------------------------------

describe('datos/ejemplo.json', () => {
  const crudo: unknown = JSON.parse(
    readFileSync(new URL('../../datos/ejemplo.json', import.meta.url), 'utf8'),
  );
  const resultado = validarDocumento(crudo);
  if (!resultado.ok) throw new Error(`el fixture no valida: ${JSON.stringify(resultado.problemas)}`);
  const doc: Documento = resultado.documento;

  it('valida contra el esquema', () => {
    expect(resultado.ok).toBe(true);
  });

  it('ningún contenedor real produce NaN', () => {
    for (const proyecto of doc.proyectos) {
      expect(Number.isNaN(avanceDeProyecto(proyecto).pct as number), proyecto.clave).toBe(false);
      for (const epica of proyecto.epicas) {
        expect(Number.isNaN(avanceDeEpica(epica).pct as number), epica.id).toBe(false);
        for (const historia of epica.historias) {
          expect(Number.isNaN(avanceDeHistoria(historia).pct as number), historia.id).toBe(false);
        }
      }
    }
  });

  it('la épica real sin historias (SICOE-E5) da pct null', () => {
    const epica = doc.proyectos.flatMap((p) => p.epicas).find((e) => e.id === 'SICOE-E5');
    expect(epica?.historias).toHaveLength(0);
    expect(avanceDeEpica(epica as Epica).pct).toBeNull();
  });

  it('la cancelada real de SICOE-E4 está fuera del denominador', () => {
    const epica = doc.proyectos.flatMap((p) => p.epicas).find((e) => e.id === 'SICOE-E4');
    const avance = avanceDeEpica(epica as Epica);
    expect(avance.canceladas).toBe(1);
    expect(avance.hojas).toBe(12);
    expect(tareasDeEpica(epica as Epica)).toHaveLength(13);
  });

  it('AVISO: ninguna épica del fixture distingue agregado de promedio, así que el fixture NO protege la regla 3', () => {
    // Si algún día una épica real sí los distingue, esta prueba se pone en rojo y hay que
    // cambiarla por una que use esa épica. Mientras tanto, la regla 3 solo la protegen los
    // casos construidos de más arriba. SICOE-E4 da 58 por los dos caminos.
    for (const epica of doc.proyectos.flatMap((p) => p.epicas)) {
      expect(promedioDeHistorias(epica), epica.id).toBe(avanceDeEpica(epica).pct);
    }
  });

  it('SICOE-E1 tiene exactamente una historia sin desglosar: SICOE-H3', () => {
    const epica = doc.proyectos.flatMap((p) => p.epicas).find((e) => e.id === 'SICOE-E1');
    expect(epica?.historias.filter((h) => h.tareas.length === 0).map((h) => h.id)).toEqual([
      'SICOE-H3',
    ]);
    expect(avanceDeEpica(epica as Epica).contenedoresSinDesglosar).toBe(1);
  });

  it('el proyecto SICOE cuenta 2 sin desglosar: la épica SICOE-E5 vacía y la historia SICOE-H3', () => {
    const proyecto = doc.proyectos.find((p) => p.clave === 'SICOE');
    expect(avanceDeProyecto(proyecto as Proyecto).contenedoresSinDesglosar).toBe(2);
  });

  it('el fixture NO contiene todavía el caso del defecto: ninguna épica real cambia de estado', () => {
    // Se deja escrito a propósito. Hoy ninguna épica del fixture tiene todas sus tareas
    // hechas Y una historia sin desglosar, así que estos datos NO protegen la corrección:
    // lo hacen los casos construidos de arriba. Si algún día el fixture sí produce ese
    // caso, esta prueba se pone en rojo y hay que cambiarla por una que lo use.
    for (const proyecto of doc.proyectos) {
      for (const epica of proyecto.epicas) {
        const avance = avanceDeEpica(epica);
        expect(avance.hechas === avance.hojas && avance.contenedoresSinDesglosar > 0, epica.id).toBe(
          false,
        );
      }
    }
  });

  it('el defecto sí es alcanzable con estos datos: cerrar las 5 tareas de SICOE-E1 no la pone verde', () => {
    // Reproducción sobre el árbol real, con una copia en memoria: `datos/` no se toca.
    // Antes de la corrección esta épica se declaraba «hecha» con SICOE-H3 sin abrir.
    const original = doc.proyectos.flatMap((p) => p.epicas).find((e) => e.id === 'SICOE-E1') as Epica;
    const cerrada: Epica = {
      ...original,
      historias: original.historias.map((historia) => ({
        ...historia,
        tareas: historia.tareas.map((tarea) => ({ ...tarea, estado: 'done' as const })),
      })),
    };
    const avance = avanceDeEpica(cerrada);
    expect(avance.hechas).toBe(5);
    expect(avance.hojas).toBe(5);
    expect(avance.contenedoresSinDesglosar).toBe(1);
    expect(estadoDerivado(avance)).toBe('en_movimiento');
    expect(estadoDerivado(avance)).not.toBe('hecha');
  });

  it('no se pasa de estricto: INFRA-E2, terminada de verdad, sigue en hecha', () => {
    const epica = doc.proyectos.flatMap((p) => p.epicas).find((e) => e.id === 'INFRA-E2');
    const avance = avanceDeEpica(epica as Epica);
    expect(avance.contenedoresSinDesglosar).toBe(0);
    expect(estadoDerivado(avance)).toBe('hecha');
  });

  it('el sprint activo del fixture es único y sus items apuntan a tareas que existen', () => {
    const activo = sprintActivo(doc, null);
    expect(activo).toBeDefined();
    expect(doc.sprints.filter((s) => s.estado === 'activo')).toHaveLength(1);
    const indice = indexarTareas(doc);
    for (const item of activo?.items ?? []) {
      expect(indice.has(item.tarea_id), item.tarea_id).toBe(true);
    }
  });
});
