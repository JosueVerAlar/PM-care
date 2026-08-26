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
  tareasDeEpica,
  tareasDeProyecto,
} from '../../src/compartido/dominio/derivar';
import { validarDocumento } from '../../src/compartido/modelo/esquema';
import type { Documento, Epica } from '../../src/compartido/modelo/tipos';
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
      tareasConEstados(['hecha', 'hecha', 'en_curso', 'pendiente', 'cancelada']),
    );
    expect(avance).toEqual({ hojas: 4, hechas: 2, enCurso: 1, pendientes: 1, canceladas: 1, pct: 50 });
  });

  it('regla 5: las canceladas quedan fuera del denominador', () => {
    const sinCancelar = contarTareas(tareasConEstados(['hecha', 'pendiente']));
    const conCancelada = contarTareas(tareasConEstados(['hecha', 'pendiente', 'cancelada']));
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
    const avance = contarTareas(tareasConEstados(['hecha', 'hecha', 'cancelada']));
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

  it('un estado desconocido no se cuenta en ninguna casilla y desaparece del denominador', () => {
    // El esquema rechaza este documento; solo llega aquí quien llame sin validar. Se deja
    // escrito para que el día que alguien lo vea en pantalla sepa por qué la tarea "no está".
    const rara = unaTarea({ estado: 'zombie' as never });
    const avance = contarTareas([unaTarea({ estado: 'hecha' }), rara]);
    expect(avance.hojas).toBe(1);
    expect(avance.hechas + avance.enCurso + avance.pendientes + avance.canceladas).toBe(1);
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
    const epica = unaEpicaCon([['hecha', 'pendiente'], []]);
    const avance = avanceDeEpica(epica);
    expect(avance.hojas).toBe(2);
    expect(avance.pct).toBe(50);
  });
});

// --- el 100% y el verde -----------------------------------------------------

describe('regla 4: verde solo si el estado es hecha, jamás por redondeo', () => {
  it('199 de 200 hechas: el porcentaje se topa en 99 aunque redondee a 100', () => {
    const avance = contarTareas(
      tareasConEstados([...repetir('hecha', 199), ...repetir('en_curso', 1)]),
    );
    expect(Math.round((199 / 200) * 100)).toBe(100); // el redondeo crudo sí cruza
    expect(avance.pct).toBe(99);
    expect(avance.pct).not.toBe(100);
  });

  it('199 de 200 hechas: el estado derivado sigue en movimiento, no hecha', () => {
    const avance = contarTareas(
      tareasConEstados([...repetir('hecha', 199), ...repetir('en_curso', 1)]),
    );
    expect(estadoDerivado(avance)).toBe('en_movimiento');
    expect(estadoDerivado(avance)).not.toBe('hecha');
  });

  it('estadoDerivado decide por el conteo, no por el pct: un 100 con hojas abiertas no es verde', () => {
    // Hoy `contarTareas` topa el pct en 99 y por eso los dos criterios coinciden. Esta
    // prueba desacopla las dos cosas: `estadoDerivado` recibe un avance cualquiera y no
    // debe fiarse del número que traiga. Sin ella, cambiar la condición a `pct === 100`
    // pasa desapercibido hasta el día que alguien quite el tope.
    const mentiroso: Avance = { hojas: 200, hechas: 199, enCurso: 1, pendientes: 0, canceladas: 0, pct: 100 };
    expect(estadoDerivado(mentiroso)).toBe('en_movimiento');
    expect(estadoDerivado(mentiroso)).not.toBe('hecha');
  });

  it('estadoDerivado tampoco cree en un pct null cuando el conteo dice que está todo hecho', () => {
    const mentiroso: Avance = { hojas: 3, hechas: 3, enCurso: 0, pendientes: 0, canceladas: 0, pct: null };
    expect(estadoDerivado(mentiroso)).toBe('hecha');
  });

  it('200 de 200 hechas: ahora sí, 100 y hecha', () => {
    const avance = contarTareas(tareasConEstados(repetir('hecha', 200)));
    expect(avance.pct).toBe(100);
    expect(estadoDerivado(avance)).toBe('hecha');
  });

  it('el 100 se alcanza si y solo si hechas === hojas, para cualquier tamaño', () => {
    for (const total of [1, 2, 5, 7, 33, 200, 201, 999]) {
      const casiTodas = contarTareas(
        tareasConEstados([...repetir('hecha', total - 1), ...repetir('pendiente', 1)]),
      );
      const todas = contarTareas(tareasConEstados(repetir('hecha', total)));
      expect(casiTodas.pct, `${total - 1} de ${total}`).not.toBe(100);
      expect(todas.pct, `${total} de ${total}`).toBe(100);
    }
  });

  it('una emergente sin cerrar entre puras hechas deja el contenedor en movimiento', () => {
    const epica = unaEpica({
      historias: [
        unaHistoriaCon(repetir('hecha', 4)),
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
        unaHistoriaCon(repetir('hecha', 4)),
        unaHistoria({ tareas: [unaTarea({ estado: 'hecha', planeada: false })] }),
      ],
    });
    const avance = avanceDeEpica(epica);
    expect(avance.pct).toBe(100);
    expect(estadoDerivado(avance)).toBe('hecha');
  });

  it('una emergente cancelada entre puras hechas tampoco impide el verde', () => {
    const epica = unaEpica({
      historias: [
        unaHistoriaCon(repetir('hecha', 4)),
        unaHistoria({ tareas: [unaTarea({ estado: 'cancelada', planeada: false })] }),
      ],
    });
    expect(estadoDerivado(avanceDeEpica(epica))).toBe('hecha');
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
    unaEpicaCon([['hecha', 'pendiente'], ['pendiente'], ['pendiente']]);

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
      ['hecha', 'pendiente', 'pendiente'],
      ['hecha', 'pendiente', 'pendiente'],
      ['hecha', 'pendiente', 'pendiente'],
    ]);
    const hijos = epica.historias.map((h) => avanceDeHistoria(h).pct);
    expect(hijos).toEqual([33, 33, 33]);
    expect(hijos.reduce<number>((suma, pct) => suma + (pct ?? 0), 0)).toBe(99);
    expect(avanceDeEpica(epica).pct).toBe(33);
  });

  it('una historia vacía no arrastra el promedio: no cuenta ni como 0 ni como 100', () => {
    const conVacia = unaEpicaCon([['hecha', 'hecha', 'pendiente', 'pendiente'], []]);
    const sinVacia = unaEpicaCon([['hecha', 'hecha', 'pendiente', 'pendiente']]);
    expect(avanceDeEpica(conVacia).pct).toBe(avanceDeEpica(sinVacia).pct);
    expect(avanceDeEpica(conVacia).pct).toBe(50);
  });

  it('el proyecto agrega las hojas de todas sus épicas, no promedia épicas', () => {
    const proyecto = unProyecto({
      epicas: [unaEpicaCon([['hecha', 'pendiente', 'pendiente']]), unaEpicaCon([['hecha']])],
    });
    // Agregado: 2 de 4 = 50. Promedio de épicas: (33 + 100)/2 = 67.
    expect(avanceDeProyecto(proyecto).pct).toBe(50);
    expect(avanceDeProyecto(proyecto).pct).not.toBe(67);
  });

  it('tareasDeEpica aplana todas las hojas de todas las historias', () => {
    const epica = unaEpicaCon([['hecha', 'pendiente'], [], ['cancelada']]);
    expect(tareasDeEpica(epica)).toHaveLength(3);
  });

  it('tareasDeProyecto aplana todas las hojas de todas las épicas', () => {
    const proyecto = unProyecto({ epicas: [unaEpicaCon([['hecha']]), unaEpicaCon([[], ['pendiente', 'pendiente']])] });
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
    expect(estadoDerivado(contarTareas(tareasConEstados(['en_curso', 'pendiente', 'pendiente'])))).toBe(
      'en_movimiento',
    );
  });

  it('una hecha entre pendientes: en_movimiento', () => {
    expect(estadoDerivado(contarTareas(tareasConEstados(['hecha', 'pendiente', 'pendiente'])))).toBe(
      'en_movimiento',
    );
  });

  it('todas hechas: hecha', () => {
    expect(estadoDerivado(contarTareas(tareasConEstados(repetir('hecha', 3))))).toBe('hecha');
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
      ['hecha', 'pendiente'],
      ['en_curso', 'pendiente'],
      ['pendiente'],
      ['hecha'],
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
    expect(mostrarPct(contarTareas(tareasConEstados(['hecha', 'pendiente', 'pendiente', 'pendiente'])))).toBe(
      false,
    );
  });

  it('con 5 hojas exactas ya se muestra', () => {
    const avance = contarTareas(tareasConEstados([...repetir('hecha', 1), ...repetir('pendiente', 4)]));
    expect(avance.hojas).toBe(5);
    expect(mostrarPct(avance)).toBe(true);
  });

  it('sin hojas nunca se muestra, aunque haya canceladas de sobra', () => {
    expect(mostrarPct(contarTareas(tareasConEstados(repetir('cancelada', 9))))).toBe(false);
  });

  it('las canceladas no empujan por encima del umbral', () => {
    const avance = contarTareas(
      tareasConEstados([...repetir('hecha', 2), ...repetir('pendiente', 2), ...repetir('cancelada', 5)]),
    );
    expect(avance.hojas).toBe(4);
    expect(mostrarPct(avance)).toBe(false);
  });

  it('todo avance lleva su conteo crudo al lado del pct: hojas y hechas son números', () => {
    for (const avance of [AVANCE_VACIO, contarTareas(tareasConEstados(repetir('hecha', 7)))]) {
      expect(Number.isInteger(avance.hojas)).toBe(true);
      expect(Number.isInteger(avance.hechas)).toBe(true);
    }
  });

  it('AVANCE_VACIO es el cero del tipo: todo en 0 y pct null', () => {
    expect(AVANCE_VACIO).toEqual({ hojas: 0, hechas: 0, enCurso: 0, pendientes: 0, canceladas: 0, pct: null });
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
    expect(sprintActivo(unDocumento())).toBeUndefined();
  });

  it('un sprint planeado no es el activo', () => {
    const doc = unDocumento({ sprints: [unSprint({ estado: 'planeado' })] });
    expect(sprintActivo(doc)).toBeUndefined();
  });

  it('encuentra el activo entre cerrados y planeados', () => {
    const doc = unDocumento({
      sprints: [
        unSprint({ id: 'S-1', estado: 'cerrado', inicio: '2026-07-01', fin: '2026-07-14' }),
        unSprint({ id: 'S-2', estado: 'activo' }),
        unSprint({ id: 'S-3', estado: 'planeado', inicio: '2026-09-01', fin: '2026-09-14' }),
      ],
    });
    expect(sprintActivo(doc)?.id).toBe('S-2');
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
        expect(estadoDerivado(avance) === 'hecha', donde).toBe(
          avance.hojas > 0 && avance.hechas === avance.hojas,
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

  it('regla 3: las hojas del padre son la suma de las hojas de sus hijos', () => {
    for (const semilla of SEMILLAS) {
      const { proyecto } = contenedores(semilla);
      let hojasDelProyecto = 0;
      for (const epica of proyecto.epicas) {
        const suma = epica.historias.reduce((acc, h) => acc + avanceDeHistoria(h).hojas, 0);
        expect(avanceDeEpica(epica).hojas, `semilla ${semilla} · ${epica.id}`).toBe(suma);
        hojasDelProyecto += suma;
      }
      expect(avanceDeProyecto(proyecto).hojas, `semilla ${semilla} · proyecto`).toBe(hojasDelProyecto);
    }
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

  it('el sprint activo del fixture es único y sus items apuntan a tareas que existen', () => {
    const activo = sprintActivo(doc);
    expect(activo).toBeDefined();
    expect(doc.sprints.filter((s) => s.estado === 'activo')).toHaveLength(1);
    const indice = indexarTareas(doc);
    for (const item of activo?.items ?? []) {
      expect(indice.has(item.tarea_id), item.tarea_id).toBe(true);
    }
  });
});
