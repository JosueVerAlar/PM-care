/**
 * Predicados de tarea y selectores de cada vista.
 *
 * Todo lo que depende de "hoy" recibe la fecha como parámetro, así que aquí no hay
 * relojes falsos ni viajes en el tiempo: la fecha es un dato más de la tabla.
 */

import { describe, expect, it } from 'vitest';

import {
  bloqueoAbierto,
  diasBloqueada,
  diasEntre,
  estaAbierta,
  estaBloqueada,
  estaEnSprint,
  estaHecha,
  estaVencida,
  fechaDe,
  fueArrastrada,
  idsDelSprint,
  mediana,
  mostrarProcedencia,
  paraBacklogDelArea,
  paraSprintDeProyecto,
  paraVistaBloqueos,
  paraVistaSprint,
  paraVistaTerminadas,
  senalesDeProyecto,
  sprintsQueLaTocaron,
  todasLasTareas,
  venceHoy,
} from '../../src/compartido/dominio/clasificar';
import { sprintActivo } from '../../src/compartido/dominio/derivar';
import {
  unBloqueo,
  unDocumento,
  unItem,
  unProyecto,
  unSprint,
  unaEpica,
  unaHistoria,
  unaTarea,
} from '../apoyo/constructores';

const HOY = '2026-08-26';

// --- fechas -----------------------------------------------------------------

describe('fechas', () => {
  it('fechaDe recorta el instante ISO a su día de calendario', () => {
    expect(fechaDe('2026-08-26T11:20:00-06:00')).toBe('2026-08-26');
  });

  it('el mismo día da 0 días, no 1', () => {
    expect(diasEntre(HOY, HOY)).toBe(0);
  });

  it('cuenta días completos entre dos fechas', () => {
    expect(diasEntre('2026-08-20', '2026-08-26')).toBe(6);
  });

  it('cruza el cambio de mes sin perder un día', () => {
    expect(diasEntre('2026-07-31', '2026-08-01')).toBe(1);
  });

  it('cruza el 29 de febrero de un año bisiesto', () => {
    expect(diasEntre('2028-02-28', '2028-03-01')).toBe(2);
  });

  it('cruza el cambio de horario de verano sin descuadrarse (todo va en UTC)', () => {
    // En México el cambio ya no existe, pero el dato puede venir de cualquier lado: si
    // esto usara la hora local, aquí saldría 0 o 2.
    expect(diasEntre('2026-03-07', '2026-03-09')).toBe(2);
  });

  it('una fecha ilegible da 0 en vez de NaN: la vista muestra un 0, no "NaN días"', () => {
    expect(diasEntre('no-es-fecha', HOY)).toBe(0);
    expect(Number.isNaN(diasEntre('no-es-fecha', HOY))).toBe(false);
  });

  it('el orden invertido da negativo: no se protege sola contra fechas al revés', () => {
    expect(diasEntre('2026-08-26', '2026-08-20')).toBe(-6);
  });
});

// --- predicados de tarea ----------------------------------------------------

describe('predicados de estado', () => {
  it('pendiente y en_curso están abiertas', () => {
    expect(estaAbierta(unaTarea({ estado: 'pendiente' }))).toBe(true);
    expect(estaAbierta(unaTarea({ estado: 'en_curso' }))).toBe(true);
  });

  it('hecha no está abierta', () => {
    expect(estaAbierta(unaTarea({ estado: 'hecha' }))).toBe(false);
  });

  it('cancelada no está abierta: no cuenta para la carga de nadie', () => {
    expect(estaAbierta(unaTarea({ estado: 'cancelada' }))).toBe(false);
  });

  it('estaHecha solo con estado hecha, nunca por porcentaje', () => {
    expect(estaHecha(unaTarea({ estado: 'hecha' }))).toBe(true);
    expect(estaHecha(unaTarea({ estado: 'cancelada' }))).toBe(false);
  });
});

describe('bloqueo: bandera con historial, no estado', () => {
  it('sin bloqueos no está bloqueada', () => {
    expect(estaBloqueada(unaTarea())).toBe(false);
    expect(bloqueoAbierto(unaTarea())).toBeNull();
  });

  it('un bloqueo sin desbloquear la deja bloqueada', () => {
    expect(estaBloqueada(unaTarea({ bloqueos: [unBloqueo()] }))).toBe(true);
  });

  it('un bloqueo ya cerrado no la deja bloqueada, pero se conserva en el historial', () => {
    const tarea = unaTarea({ bloqueos: [unBloqueo({ desbloqueada_en: '2026-08-22T09:00:00-06:00' })] });
    expect(estaBloqueada(tarea)).toBe(false);
    expect(tarea.bloqueos).toHaveLength(1);
  });

  it('bloqueada conserva su propio estado: sigue siendo en_curso', () => {
    const tarea = unaTarea({ estado: 'en_curso', bloqueos: [unBloqueo()] });
    expect(estaBloqueada(tarea)).toBe(true);
    expect(tarea.estado).toBe('en_curso');
    expect(estaAbierta(tarea)).toBe(true);
  });

  it('con un cerrado y uno abierto devuelve el abierto', () => {
    const tarea = unaTarea({
      bloqueos: [
        unBloqueo({ motivo: 'viejo', desbloqueada_en: '2026-08-01T09:00:00-06:00' }),
        unBloqueo({ motivo: 'vigente' }),
      ],
    });
    expect(bloqueoAbierto(tarea)?.motivo).toBe('vigente');
  });

  it('bloqueada y hecha a la vez: el modelo lo permite y sale en las dos vistas', () => {
    // Hallazgo, no capricho: cerrar una tarea no cierra su bloqueo, así que la misma
    // tarea aparece en Bloqueos y en Terminadas. Ver el reporte de E4.
    const tarea = unaTarea({ estado: 'hecha', bloqueos: [unBloqueo()] });
    expect(estaBloqueada(tarea)).toBe(true);
    expect(estaHecha(tarea)).toBe(true);
  });

  it('diasBloqueada es null cuando no está bloqueada', () => {
    expect(diasBloqueada(unaTarea(), HOY)).toBeNull();
  });

  it('diasBloqueada cuenta desde el día del bloqueo', () => {
    const tarea = unaTarea({ bloqueos: [unBloqueo({ bloqueada_en: '2026-08-20T10:00:00-06:00' })] });
    expect(diasBloqueada(tarea, HOY)).toBe(6);
  });

  it('bloqueada hoy mismo: 0 días, no 1', () => {
    const tarea = unaTarea({ bloqueos: [unBloqueo({ bloqueada_en: `${HOY}T08:00:00-06:00` })] });
    expect(diasBloqueada(tarea, HOY)).toBe(0);
  });

  it('con la fecha de bloqueo en el futuro devuelve negativo: nadie lo tapa', () => {
    const tarea = unaTarea({ bloqueos: [unBloqueo({ bloqueada_en: '2026-09-02T10:00:00-06:00' })] });
    expect(diasBloqueada(tarea, HOY)).toBe(-7);
  });
});

describe('vencimiento', () => {
  it('sin fecha límite no hay vencida: quieta y atrasada no son lo mismo', () => {
    expect(estaVencida(unaTarea({ fecha_limite: null }), HOY)).toBe(false);
  });

  it('la fecha de ayer con la tarea abierta sí vence', () => {
    expect(estaVencida(unaTarea({ fecha_limite: '2026-08-25' }), HOY)).toBe(true);
  });

  it('la fecha de hoy no está vencida todavía', () => {
    expect(estaVencida(unaTarea({ fecha_limite: HOY }), HOY)).toBe(false);
  });

  it('una tarea hecha con fecha pasada no cuenta como vencida', () => {
    expect(estaVencida(unaTarea({ fecha_limite: '2026-01-01', estado: 'hecha' }), HOY)).toBe(false);
  });

  it('una tarea cancelada con fecha pasada no cuenta como vencida', () => {
    expect(estaVencida(unaTarea({ fecha_limite: '2026-01-01', estado: 'cancelada' }), HOY)).toBe(false);
  });

  it('venceHoy solo con la fecha de hoy exacta y la tarea abierta', () => {
    expect(venceHoy(unaTarea({ fecha_limite: HOY }), HOY)).toBe(true);
    expect(venceHoy(unaTarea({ fecha_limite: '2026-08-25' }), HOY)).toBe(false);
    expect(venceHoy(unaTarea({ fecha_limite: HOY, estado: 'hecha' }), HOY)).toBe(false);
  });

  it('vencida y venceHoy son excluyentes: ninguna tarea puede ser las dos', () => {
    for (const fecha of ['2026-08-25', HOY, '2026-08-27']) {
      const tarea = unaTarea({ fecha_limite: fecha });
      expect(estaVencida(tarea, HOY) && venceHoy(tarea, HOY), fecha).toBe(false);
    }
  });
});

describe('procedencia: emergente es de dónde viene, no en qué estado está (regla 17)', () => {
  it('una tarea planeada nunca pinta la banda', () => {
    expect(mostrarProcedencia(unaTarea({ planeada: true, estado: 'pendiente' }))).toBe(false);
  });

  it('una emergente abierta pinta la banda', () => {
    expect(mostrarProcedencia(unaTarea({ planeada: false, estado: 'en_curso' }))).toBe(true);
  });

  it('una emergente YA CERRADA no pinta la banda: verde, no amarillo', () => {
    expect(mostrarProcedencia(unaTarea({ planeada: false, estado: 'hecha' }))).toBe(false);
  });

  it.fails('BUG: una emergente CANCELADA tampoco debería pintar la banda — también está cerrada', () => {
    // `mostrarProcedencia` solo excluye `hecha`, pero su propio comentario dice "solo
    // mientras la tarea siga abierta". Una cancelada está cerrada. Esta prueba queda en
    // xfail estricto: cuando el bug se arregle, vitest la marca en rojo por pasar y hay
    // que quitarle el `.fails`.
    expect(mostrarProcedencia(unaTarea({ planeada: false, estado: 'cancelada' }))).toBe(false);
  });
});

// --- documento de trabajo para los selectores -------------------------------

/**
 * Un documento pequeño pero completo: dos proyectos, un sprint cerrado y uno activo,
 * una bloqueada, una vencida, una emergente y una arrastrada.
 */
function documentoDePrueba() {
  const t1 = unaTarea({ id: 'PRUEBA-T1', estado: 'en_curso', responsable: 'ana', fecha_limite: '2026-08-25' });
  const t2 = unaTarea({ id: 'PRUEBA-T2', estado: 'pendiente', responsable: 'ana', bloqueos: [unBloqueo()] });
  const t3 = unaTarea({ id: 'PRUEBA-T3', estado: 'hecha', responsable: 'beto' });
  const t4 = unaTarea({ id: 'PRUEBA-T4', estado: 'cancelada' });
  const t5 = unaTarea({ id: 'PRUEBA-T5', estado: 'pendiente', planeada: false });
  const o1 = unaTarea({ id: 'OTRO-T1', clave: 'OTRO', estado: 'pendiente', responsable: 'beto' });

  const proyecto = unProyecto({
    clave: 'PRUEBA',
    nombre: 'Proyecto de prueba',
    epicas: [
      unaEpica({
        id: 'PRUEBA-E1',
        titulo: 'Épica uno',
        historias: [
          unaHistoria({ id: 'PRUEBA-H1', titulo: 'Historia uno', tareas: [t1, t2, t3] }),
          unaHistoria({ id: 'PRUEBA-H2', titulo: 'Historia dos', tareas: [t4, t5] }),
        ],
      }),
    ],
  });
  const otro = unProyecto({
    clave: 'OTRO',
    nombre: 'Otro proyecto',
    epicas: [unaEpica({ id: 'OTRO-E1', historias: [unaHistoria({ id: 'OTRO-H1', tareas: [o1] })] })],
  });

  const doc = unDocumento({
    personas: [],
    proyectos: [proyecto, otro],
    sprints: [
      unSprint({
        id: 'S-VIEJO',
        estado: 'cerrado',
        inicio: '2026-08-10',
        fin: '2026-08-23',
        items: [unItem('PRUEBA-T1', { desenlace: 'no_terminada' })],
      }),
      unSprint({
        id: 'S-ACTIVO',
        estado: 'activo',
        items: [unItem('PRUEBA-T1'), unItem('PRUEBA-T2'), unItem('OTRO-T1')],
      }),
    ],
  });
  return { doc, activo: sprintActivo(doc) };
}

describe('recorrido y pertenencia a sprint', () => {
  it('todasLasTareas recorre los dos proyectos', () => {
    expect(todasLasTareas(documentoDePrueba().doc)).toHaveLength(6);
  });

  it('idsDelSprint conserva el orden del array, que ES la prioridad', () => {
    const { activo } = documentoDePrueba();
    expect(idsDelSprint(activo)).toEqual(['PRUEBA-T1', 'PRUEBA-T2', 'OTRO-T1']);
  });

  it('sin sprint, idsDelSprint da lista vacía en vez de reventar', () => {
    expect(idsDelSprint(undefined)).toEqual([]);
  });

  it('una tarea sin sprint no está en ninguno', () => {
    const { doc, activo } = documentoDePrueba();
    expect(estaEnSprint('PRUEBA-T5', activo)).toBe(false);
    expect(sprintsQueLaTocaron(doc, 'PRUEBA-T5')).toHaveLength(0);
    expect(fueArrastrada(doc, 'PRUEBA-T5')).toBe(false);
  });

  it('estaEnSprint con sprint indefinido es false, no una excepción', () => {
    expect(estaEnSprint('PRUEBA-T1', undefined)).toBe(false);
  });

  it('arrastrada = la misma tarea en más de un sprint, y se deriva, no se marca', () => {
    const { doc } = documentoDePrueba();
    expect(sprintsQueLaTocaron(doc, 'PRUEBA-T1').map((s) => s.id)).toEqual(['S-VIEJO', 'S-ACTIVO']);
    expect(fueArrastrada(doc, 'PRUEBA-T1')).toBe(true);
    expect(fueArrastrada(doc, 'PRUEBA-T2')).toBe(false);
  });

  it('una tarea que no existe no está arrastrada ni en ningún sprint', () => {
    const { doc } = documentoDePrueba();
    expect(fueArrastrada(doc, 'PRUEBA-T404')).toBe(false);
  });
});

describe('selectores por vista', () => {
  it('Bloqueos: solo lo que tiene un bloqueo abierto, de todos los proyectos', () => {
    const { doc } = documentoDePrueba();
    expect(paraVistaBloqueos(doc).map((u) => u.tarea.id)).toEqual(['PRUEBA-T2']);
  });

  it('Terminadas: solo las hechas; las canceladas no son terminadas', () => {
    const { doc } = documentoDePrueba();
    expect(paraVistaTerminadas(doc).map((u) => u.tarea.id)).toEqual(['PRUEBA-T3']);
  });

  it('Backlog del área: lo abierto que NO está comprometido en el sprint activo', () => {
    const { doc } = documentoDePrueba();
    expect(paraBacklogDelArea(doc).map((u) => u.tarea.id)).toEqual(['PRUEBA-T5']);
  });

  it('Backlog: haber estado en un sprint cerrado no saca a una tarea del backlog', () => {
    const { doc } = documentoDePrueba();
    // PRUEBA-T1 está en el cerrado y en el activo: la excluye el activo, no el cerrado.
    const sinActivo = unDocumento({ ...doc, sprints: doc.sprints.filter((s) => s.estado === 'cerrado') });
    expect(paraBacklogDelArea(sinActivo).map((u) => u.tarea.id)).toContain('PRUEBA-T1');
  });

  it('Backlog: sin sprint activo, todo lo abierto es backlog', () => {
    const { doc } = documentoDePrueba();
    const sinSprints = unDocumento({ ...doc, sprints: [] });
    expect(paraBacklogDelArea(sinSprints)).toHaveLength(4);
  });

  it('Sprint: los items salen en el orden del array, resueltos a su ubicación', () => {
    const { doc, activo } = documentoDePrueba();
    expect(paraVistaSprint(doc, activo).map((f) => f.ubicacion.tarea.id)).toEqual([
      'PRUEBA-T1',
      'PRUEBA-T2',
      'OTRO-T1',
    ]);
  });

  it('Sprint: sin sprint, lista vacía', () => {
    expect(paraVistaSprint(documentoDePrueba().doc, undefined)).toEqual([]);
  });

  it('Sprint: un item que apunta a una tarea inexistente se descarta sin tumbar la vista', () => {
    const { doc, activo } = documentoDePrueba();
    const roto = unSprint({ ...activo, items: [...(activo?.items ?? []), unItem('PRUEBA-T404')] });
    const filas = paraVistaSprint(doc, roto);
    expect(filas).toHaveLength(3);
    expect(filas.map((f) => f.ubicacion.tarea.id)).not.toContain('PRUEBA-T404');
  });

  it('Sprint del proyecto: filtra al panel derecho de esa clave', () => {
    const { doc, activo } = documentoDePrueba();
    expect(paraSprintDeProyecto(doc, activo, 'OTRO').map((f) => f.ubicacion.tarea.id)).toEqual(['OTRO-T1']);
  });

  it('Sprint del proyecto: una clave que no existe da lista vacía', () => {
    const { doc, activo } = documentoDePrueba();
    expect(paraSprintDeProyecto(doc, activo, 'NOEXISTE')).toEqual([]);
  });
});

describe('senalesDeProyecto', () => {
  it('un proyecto que no existe da null, no un objeto en ceros', () => {
    expect(senalesDeProyecto(documentoDePrueba().doc, 'NOEXISTE', HOY)).toBeNull();
  });

  it('cuenta bloqueadas, vencidas, emergentes abiertas y comprometidas en el sprint', () => {
    const { doc } = documentoDePrueba();
    const senales = senalesDeProyecto(doc, 'PRUEBA', HOY);
    expect(senales).toMatchObject({
      clave: 'PRUEBA',
      bloqueadas: 1,
      vencidas: 1,
      noPlaneadasAbiertas: 1,
      enSprintActivo: 2,
    });
  });

  it('el avance de las señales excluye la cancelada del denominador', () => {
    const senales = senalesDeProyecto(documentoDePrueba().doc, 'PRUEBA', HOY);
    expect(senales?.avance.hojas).toBe(4);
    expect(senales?.avance.canceladas).toBe(1);
  });

  it('un proyecto vacío da avance null y todo en cero, sin NaN', () => {
    const doc = unDocumento({ proyectos: [unProyecto({ clave: 'VACIO' })] });
    const senales = senalesDeProyecto(doc, 'VACIO', HOY);
    expect(senales?.avance.pct).toBeNull();
    expect(senales?.bloqueadas).toBe(0);
  });

  it('una emergente ya cerrada no cuenta como emergente abierta', () => {
    const doc = unDocumento({
      proyectos: [
        unProyecto({
          clave: 'PRUEBA',
          epicas: [
            unaEpica({
              historias: [
                unaHistoria({
                  tareas: [
                    unaTarea({ planeada: false, estado: 'hecha' }),
                    unaTarea({ planeada: false, estado: 'cancelada' }),
                  ],
                }),
              ],
            }),
          ],
        }),
      ],
    });
    expect(senalesDeProyecto(doc, 'PRUEBA', HOY)?.noPlaneadasAbiertas).toBe(0);
  });
});

describe('mediana', () => {
  it('serie vacía: null, no 0', () => {
    expect(mediana([])).toBeNull();
  });

  it('un solo valor es su propia mediana', () => {
    expect(mediana([7])).toBe(7);
  });

  it('serie impar: el de en medio', () => {
    expect(mediana([5, 1, 3])).toBe(3);
  });

  it('serie par: el promedio de los dos centrales', () => {
    expect(mediana([1, 2, 3, 4])).toBe(2.5);
  });

  it('ordena numéricamente, no como texto: [2, 10] da 6, no 6 por casualidad de cadenas', () => {
    expect(mediana([10, 2])).toBe(6);
    expect(mediana([1, 2, 10])).toBe(2);
  });

  it('no muta la serie que recibe', () => {
    const serie = [3, 1, 2];
    mediana(serie);
    expect(serie).toEqual([3, 1, 2]);
  });

  it('admite ceros y negativos sin confundirlos con "sin datos"', () => {
    expect(mediana([0, 0, 0])).toBe(0);
    expect(mediana([-4, -2])).toBe(-3);
  });
});
