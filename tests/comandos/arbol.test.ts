/**
 * Comandos del árbol: épicas, historias, tareas, estado y bloqueos.
 *
 * Lo que se defiende aquí, además de que cada comando haga lo suyo:
 *
 * - **Los ids no se reciclan** (regla 15). El contador solo sube, y borrar no lo baja.
 * - **Bloqueada NO es un estado**: es una bandera con historial que convive con el
 *   estado propio de la tarea.
 * - Borrar algo que un sprint cerrado compromete se rechaza en los tres niveles.
 */

import { describe, expect, it } from 'vitest';

import { reducir } from '../../src/principal/comandos/reductor';
import { validarComando } from '../../src/principal/comandos/tipos';
import { unDocumento, unItem, unSprint } from '../apoyo/constructores';
import {
  AHORA,
  aplicar,
  aplicarTodos,
  arbolConTareas,
  arbolVacio,
  copiaProfunda,
  exigirError,
  exigirOk,
  reducirSinMutar,
} from '../apoyo/comandos';

// --- ids y contadores (regla 15) --------------------------------------------

describe('regla 15: los contadores solo suben y los ids no se reciclan', () => {
  it('crear tres tareas, borrar dos y crear otra: la nueva es T4, nunca un id ya usado', () => {
    const { doc, historiaId, clave } = arbolConTareas(3);
    const borradas = aplicarTodos(doc, [
      { comando: 'eliminarTarea', id: `${clave}-T2` },
      { comando: 'eliminarTarea', id: `${clave}-T3` },
    ]);
    const { documento } = exigirOk(
      reducirSinMutar(borradas, { comando: 'crearTarea', contenedorId: historiaId, titulo: 'La cuarta' }),
    );
    const ids = documento.proyectos[0]?.epicas[0]?.historias[0]?.tareas.map((t) => t.id);
    expect(ids).toEqual([`${clave}-T1`, `${clave}-T4`]);
  });

  it('borrar no baja el contador: sigue en 3 con una sola tarea viva', () => {
    const { doc, clave } = arbolConTareas(3);
    const borradas = aplicarTodos(doc, [
      { comando: 'eliminarTarea', id: `${clave}-T2` },
      { comando: 'eliminarTarea', id: `${clave}-T3` },
    ]);
    expect(borradas.proyectos[0]?.contadores.tareas).toBe(3);
    expect(borradas.proyectos[0]?.epicas[0]?.historias[0]?.tareas).toHaveLength(1);
  });

  it('borrar TODAS las tareas tampoco devuelve el contador a cero', () => {
    const { doc, clave, historiaId } = arbolConTareas(2);
    const vacia = aplicarTodos(doc, [
      { comando: 'eliminarTarea', id: `${clave}-T1` },
      { comando: 'eliminarTarea', id: `${clave}-T2` },
    ]);
    expect(vacia.proyectos[0]?.contadores.tareas).toBe(2);
    const { documento } = exigirOk(
      reducirSinMutar(vacia, { comando: 'crearTarea', contenedorId: historiaId, titulo: 'X' }),
    );
    expect(documento.proyectos[0]?.epicas[0]?.historias[0]?.tareas[0]?.id).toBe(`${clave}-T3`);
  });

  it('eliminar la HISTORIA entera tampoco recicla el número de sus tareas', () => {
    const { doc, clave, epicaId } = arbolConTareas(2);
    const sinHistoria = aplicar(doc, { comando: 'eliminarHistoria', id: `${clave}-H1` });
    const conOtra = aplicar(sinHistoria, { comando: 'crearHistoria', epicaId, titulo: 'Otra' });
    const { documento } = exigirOk(
      reducirSinMutar(conOtra, { comando: 'crearTarea', contenedorId: `${clave}-H2`, titulo: 'X' }),
    );
    expect(documento.proyectos[0]?.epicas[0]?.historias[0]?.id).toBe(`${clave}-H2`);
    expect(documento.proyectos[0]?.epicas[0]?.historias[0]?.tareas[0]?.id).toBe(`${clave}-T3`);
  });

  it('los tres contadores son independientes: crear tareas no mueve el de épicas', () => {
    const { doc } = arbolConTareas(5);
    expect(doc.proyectos[0]?.contadores).toEqual({ epicas: 1, historias: 1, tareas: 5 });
  });

  it('cada proyecto lleva su propio contador: los ids de uno no adelantan los del otro', () => {
    const uno = arbolConTareas(3, 'UNO');
    const dos = arbolVacio('DOS');
    const juntos = { ...uno.doc, proyectos: [...uno.doc.proyectos, ...dos.doc.proyectos] };
    const { documento } = exigirOk(
      reducirSinMutar(juntos, { comando: 'crearTarea', contenedorId: 'DOS-H1', titulo: 'X' }),
    );
    expect(documento.proyectos[1]?.epicas[0]?.historias[0]?.tareas[0]?.id).toBe('DOS-T1');
  });

  it('el id lleva la clave de SU proyecto, no la del otro', () => {
    const uno = arbolVacio('UNO');
    const dos = arbolVacio('DOS');
    const juntos = { ...uno.doc, proyectos: [...uno.doc.proyectos, ...dos.doc.proyectos] };
    const { documento } = exigirOk(
      reducirSinMutar(juntos, { comando: 'crearEpica', proyecto: 'DOS', titulo: 'X' }),
    );
    expect(documento.proyectos[1]?.epicas[1]?.id).toBe('DOS-E2');
  });
});

// --- épicas -----------------------------------------------------------------

describe('crearEpica', () => {
  it('nace vacía, con el id del contador y sin campos derivados (regla 1)', () => {
    const { doc, clave } = arbolVacio();
    const { documento } = exigirOk(
      reducirSinMutar(doc, { comando: 'crearEpica', proyecto: clave, titulo: 'Segunda' }),
    );
    const epica = documento.proyectos[0]?.epicas[1];
    expect(epica).toEqual({
      id: `${clave}-E2`,
      titulo: 'Segunda',
      descripcion: null,
      planeada: true,
      clave_externa: null,
      historias: [],
      // N9: las dos formas de colgarle trabajo nacen a la vez; ninguna es la excepción.
      tareas: [],
    });
    expect(Object.keys(epica ?? {})).not.toContain('estado');
    expect(Object.keys(epica ?? {})).not.toContain('porcentaje');
  });

  it('sobre un proyecto que no existe da no-encontrado', () => {
    expect(
      exigirError(
        reducirSinMutar(unDocumento(), { comando: 'crearEpica', proyecto: 'NADA', titulo: 'X' }),
      ).codigo,
    ).toBe('no-encontrado');
  });
});

describe('editarEpica', () => {
  it('cambia el título sin tocar el id ni las historias', () => {
    const { doc, epicaId } = arbolConTareas(2);
    const { documento } = exigirOk(
      reducirSinMutar(doc, { comando: 'editarEpica', id: epicaId, titulo: 'Renombrada' }),
    );
    expect(documento.proyectos[0]?.epicas[0]?.id).toBe(epicaId);
    expect(documento.proyectos[0]?.epicas[0]?.titulo).toBe('Renombrada');
    expect(documento.proyectos[0]?.epicas[0]?.historias[0]?.tareas).toHaveLength(2);
  });

  it('un comando sin campos se rechaza', () => {
    const { doc, epicaId } = arbolVacio();
    expect(exigirError(reducirSinMutar(doc, { comando: 'editarEpica', id: epicaId })).codigo).toBe(
      'invalido',
    );
  });
});

describe('eliminarEpica', () => {
  it('se lleva sus historias y sus tareas', () => {
    const { doc, epicaId } = arbolConTareas(3);
    const { documento, evento } = exigirOk(
      reducirSinMutar(doc, { comando: 'eliminarEpica', id: epicaId }),
    );
    expect(documento.proyectos[0]?.epicas).toEqual([]);
    expect(evento.resumen).toContain('3 tareas');
  });

  it('regla 8: se rechaza si una de sus tareas está en un sprint cerrado', () => {
    const { doc, epicaId, clave } = arbolConTareas(2);
    const conSprint = {
      ...doc,
      sprints: [
        unSprint({
          id: 'S-junio',
          estado: 'cerrado',
          inicio: '2026-06-01',
          fin: '2026-06-14',
          items: [unItem(`${clave}-T2`, { desenlace: 'no_terminada' })],
        }),
      ],
    };
    const error = exigirError(reducirSinMutar(conSprint, { comando: 'eliminarEpica', id: epicaId }));
    expect(error.codigo).toBe('sprint-cerrado');
    expect(error.mensaje).toContain('S-junio');
  });

  it('sus tareas salen de los sprints abiertos', () => {
    const { doc, epicaId, clave } = arbolConTareas(1);
    const conSprint = aplicar(
      { ...doc, sprints: [unSprint({ id: 'S-1', estado: 'activo' })] },
      { comando: 'moverAlSprint', tareaId: `${clave}-T1`, sprintId: 'S-1' },
    );
    const { documento } = exigirOk(
      reducirSinMutar(conSprint, { comando: 'eliminarEpica', id: epicaId }),
    );
    expect(documento.sprints[0]?.items).toEqual([]);
  });
});

// --- historias --------------------------------------------------------------

describe('crearHistoria', () => {
  it('cuelga de su épica con el id del contador del proyecto', () => {
    const { doc, epicaId, clave } = arbolVacio();
    const { documento } = exigirOk(
      reducirSinMutar(doc, { comando: 'crearHistoria', epicaId, titulo: 'Segunda' }),
    );
    expect(documento.proyectos[0]?.epicas[0]?.historias.map((h) => h.id)).toEqual([
      `${clave}-H1`,
      `${clave}-H2`,
    ]);
  });

  it('nace sin tareas: una historia declarada y sin desglosar es un estado legítimo (regla 2)', () => {
    const { doc, epicaId } = arbolVacio();
    const { documento } = exigirOk(
      reducirSinMutar(doc, { comando: 'crearHistoria', epicaId, titulo: 'X' }),
    );
    expect(documento.proyectos[0]?.epicas[0]?.historias[1]?.tareas).toEqual([]);
  });

  it('sobre una épica que no existe da no-encontrado', () => {
    const { doc } = arbolVacio();
    expect(
      exigirError(reducirSinMutar(doc, { comando: 'crearHistoria', epicaId: 'PM-E9', titulo: 'X' }))
        .codigo,
    ).toBe('no-encontrado');
  });
});

describe('eliminarHistoria', () => {
  it('se lleva sus tareas y deja la épica en pie', () => {
    const { doc, clave } = arbolConTareas(2);
    const { documento } = exigirOk(
      reducirSinMutar(doc, { comando: 'eliminarHistoria', id: `${clave}-H1` }),
    );
    expect(documento.proyectos[0]?.epicas[0]?.historias).toEqual([]);
    expect(documento.proyectos[0]?.epicas).toHaveLength(1);
  });

  it('regla 8: se rechaza si una de sus tareas está en un sprint cerrado', () => {
    const { doc, clave } = arbolConTareas(2);
    const conSprint = {
      ...doc,
      sprints: [
        unSprint({
          id: 'S-junio',
          estado: 'cerrado',
          inicio: '2026-06-01',
          fin: '2026-06-14',
          items: [unItem(`${clave}-T1`, { desenlace: 'completada' })],
        }),
      ],
    };
    expect(
      exigirError(reducirSinMutar(conSprint, { comando: 'eliminarHistoria', id: `${clave}-H1` }))
        .codigo,
    ).toBe('sprint-cerrado');
  });
});

// --- tareas -----------------------------------------------------------------

describe('crearTarea', () => {
  it('nace pendiente, sin bloqueos y con la fecha de creación del instante recibido', () => {
    const { doc, historiaId, clave } = arbolVacio();
    const { documento } = exigirOk(
      reducirSinMutar(doc, { comando: 'crearTarea', contenedorId: historiaId, titulo: 'Nueva' }),
    );
    expect(documento.proyectos[0]?.epicas[0]?.historias[0]?.tareas[0]).toEqual({
      id: `${clave}-T1`,
      titulo: 'Nueva',
      descripcion: null,
      estado: 'pendiente',
      planeada: true,
      responsable: null,
      fecha_limite: null,
      prioridad: null,
      creada_en: AHORA,
      // Sin estimar: `null` es lo normal, no un hueco por llenar.
      esfuerzo: null,
      // El anclaje del reloj vive en la TAREA desde MA, no en el item del sprint: si
      // viviera en el item, sacarla para redefinirla y volver a meterla lo reiniciaría.
      comprometida_en: null,
      hecha_en: null,
      bloqueos: [],
      clave_externa: null,
    });
  });

  it('regla 17: lo capturado DESPUÉS de cerrar la planeación nace no planeado', () => {
    const { doc, historiaId } = arbolVacio();
    const conCierre = copiaProfunda(doc);
    const proyecto = conCierre.proyectos[0];
    if (proyecto === undefined) throw new Error('fixture sin proyecto');
    proyecto.planeacion_cerrada_en = '2026-08-01';

    const { documento } = exigirOk(
      reducirSinMutar(conCierre, { comando: 'crearTarea', contenedorId: historiaId, titulo: 'Emergente' }),
    );
    expect(documento.proyectos[0]?.epicas[0]?.historias[0]?.tareas[0]?.planeada).toBe(false);
  });

  it('regla 17: frontera — lo capturado EL MISMO DÍA del cierre sigue siendo planeado', () => {
    const { doc, historiaId } = arbolVacio();
    const conCierre = copiaProfunda(doc);
    const proyecto = conCierre.proyectos[0];
    if (proyecto === undefined) throw new Error('fixture sin proyecto');
    proyecto.planeacion_cerrada_en = '2026-08-26';

    const { documento } = exigirOk(
      reducirSinMutar(conCierre, { comando: 'crearTarea', contenedorId: historiaId, titulo: 'Justo hoy' }),
    );
    expect(documento.proyectos[0]?.epicas[0]?.historias[0]?.tareas[0]?.planeada).toBe(true);
  });

  it('regla 17: sin planeación cerrada todo nace planeado — degradación segura', () => {
    const { doc, historiaId } = arbolVacio();
    const { documento } = exigirOk(
      reducirSinMutar(doc, { comando: 'crearTarea', contenedorId: historiaId, titulo: 'X' }),
    );
    expect(documento.proyectos[0]?.epicas[0]?.historias[0]?.tareas[0]?.planeada).toBe(true);
  });

  it('acepta responsable, prioridad y fecha límite de una vez', () => {
    const { doc, historiaId } = arbolVacio();
    const conPersona = aplicar(doc, { comando: 'crearPersona', nombre: 'Ana' });
    const { documento } = exigirOk(
      reducirSinMutar(conPersona, {
        comando: 'crearTarea',
        contenedorId: historiaId,
        titulo: 'X',
        responsable: 'ana',
        prioridad: 'alta',
        fechaLimite: '2026-09-30',
      }),
    );
    expect(documento.proyectos[0]?.epicas[0]?.historias[0]?.tareas[0]).toMatchObject({
      responsable: 'ana',
      prioridad: 'alta',
      fecha_limite: '2026-09-30',
    });
  });

  it('el payload rechaza una fecha límite que no sea YYYY-MM-DD', () => {
    const { doc, historiaId } = arbolVacio();
    expect(
      reducir(doc, { comando: 'crearTarea', contenedorId: historiaId, titulo: 'X' }, AHORA).ok,
    ).toBe(true);
    // La forma de la fecha la ataja el esquema del payload, antes de llegar al reductor.
    expect(
      validarComando({ comando: 'crearTarea', contenedorId: historiaId, titulo: 'X', fechaLimite: '30/09/2026' })
        .ok,
    ).toBe(false);
  });
});

describe('editarTarea', () => {
  it('campo ausente = no tocar, campo en null = borrar', () => {
    const { doc, historiaId, clave } = arbolVacio();
    const conTarea = aplicar(doc, {
      comando: 'crearTarea',
      contenedorId: historiaId,
      titulo: 'X',
      descripcion: 'una nota',
      prioridad: 'alta',
    });
    const { documento } = exigirOk(
      reducirSinMutar(conTarea, { comando: 'editarTarea', id: `${clave}-T1`, prioridad: null }),
    );
    const tarea = documento.proyectos[0]?.epicas[0]?.historias[0]?.tareas[0];
    expect(tarea?.prioridad).toBeNull();
    expect(tarea?.descripcion).toBe('una nota');
  });

  it('NO cambia el estado: para eso está cambiarEstado, que es el comando que la bitácora cuenta', () => {
    const { doc, clave } = arbolConTareas(1);
    const enCurso = aplicar(doc, {
      comando: 'cambiarEstado',
      id: `${clave}-T1`,
      estado: 'en_curso',
    });
    const { documento } = exigirOk(
      reducirSinMutar(enCurso, { comando: 'editarTarea', id: `${clave}-T1`, titulo: 'Otro' }),
    );
    expect(documento.proyectos[0]?.epicas[0]?.historias[0]?.tareas[0]?.estado).toBe('en_curso');
  });

  it('el evento lleva la lista de campos tocados y el antes/después', () => {
    const { doc, clave } = arbolConTareas(1);
    const { evento } = exigirOk(
      reducirSinMutar(doc, { comando: 'editarTarea', id: `${clave}-T1`, titulo: 'Nuevo' }),
    );
    expect(evento.detalle).toMatchObject({ campos: ['titulo'] });
    expect((evento.detalle as { antes: { titulo: string } }).antes.titulo).toBe('Tarea 1');
  });

  it('un comando sin campos se rechaza', () => {
    const { doc, clave } = arbolConTareas(1);
    expect(
      exigirError(reducirSinMutar(doc, { comando: 'editarTarea', id: `${clave}-T1` })).codigo,
    ).toBe('invalido');
  });
});

describe('eliminarTarea', () => {
  it('regla 8: se rechaza si la tarea está en un sprint cerrado', () => {
    const { doc, clave } = arbolConTareas(1);
    const conSprint = {
      ...doc,
      sprints: [
        unSprint({
          id: 'S-junio',
          estado: 'cerrado',
          inicio: '2026-06-01',
          fin: '2026-06-14',
          items: [unItem(`${clave}-T1`, { desenlace: 'completada' })],
        }),
      ],
    };
    const error = exigirError(
      reducirSinMutar(conSprint, { comando: 'eliminarTarea', id: `${clave}-T1` }),
    );
    expect(error.codigo).toBe('sprint-cerrado');
    expect(error.mensaje).toContain(`${clave}-T1`);
  });

  it('sí se elimina si solo está en sprints abiertos, y sale de sus items', () => {
    const { doc, clave } = arbolConTareas(2);
    const conSprint = aplicar(
      { ...doc, sprints: [unSprint({ id: 'S-1', estado: 'activo' })] },
      { comando: 'moverAlSprint', tareaId: `${clave}-T1`, sprintId: 'S-1' },
    );
    const { documento } = exigirOk(
      reducirSinMutar(conSprint, { comando: 'eliminarTarea', id: `${clave}-T1` }),
    );
    expect(documento.sprints[0]?.items).toEqual([]);
    expect(documento.proyectos[0]?.epicas[0]?.historias[0]?.tareas).toHaveLength(1);
  });

  it('el evento conserva en qué estado murió', () => {
    const { doc, clave } = arbolConTareas(1);
    const enCurso = aplicar(doc, { comando: 'cambiarEstado', id: `${clave}-T1`, estado: 'en_curso' });
    const { evento } = exigirOk(
      reducirSinMutar(enCurso, { comando: 'eliminarTarea', id: `${clave}-T1` }),
    );
    expect(evento.detalle).toEqual({ estado: 'en_curso' });
  });
});

// --- cambiarEstado ----------------------------------------------------------

describe('cambiarEstado', () => {
  it('pasar a hecha sella hecha_en con el instante recibido', () => {
    const { doc, clave } = arbolConTareas(1);
    const { documento } = exigirOk(
      reducirSinMutar(doc, { comando: 'cambiarEstado', id: `${clave}-T1`, estado: 'hecha' }),
    );
    const tarea = documento.proyectos[0]?.epicas[0]?.historias[0]?.tareas[0];
    expect(tarea?.estado).toBe('hecha');
    expect(tarea?.hecha_en).toBe(AHORA);
  });

  it('reabrir una tarea BORRA hecha_en: si no, Terminadas mostraría algo que volvió a estar en curso', () => {
    const { doc, clave } = arbolConTareas(1);
    const ciclo = aplicarTodos(doc, [
      { comando: 'cambiarEstado', id: `${clave}-T1`, estado: 'hecha' },
      { comando: 'cambiarEstado', id: `${clave}-T1`, estado: 'en_curso' },
    ]);
    const tarea = ciclo.proyectos[0]?.epicas[0]?.historias[0]?.tareas[0];
    expect(tarea?.hecha_en).toBeNull();
  });

  it('cancelar tampoco deja hecha_en puesta', () => {
    const { doc, clave } = arbolConTareas(1);
    const ciclo = aplicarTodos(doc, [
      { comando: 'cambiarEstado', id: `${clave}-T1`, estado: 'hecha' },
      { comando: 'cambiarEstado', id: `${clave}-T1`, estado: 'cancelada' },
    ]);
    expect(ciclo.proyectos[0]?.epicas[0]?.historias[0]?.tareas[0]?.hecha_en).toBeNull();
  });

  it('cambiar al estado que ya tenía se rechaza: no hay nada que contar en la bitácora', () => {
    const { doc, clave } = arbolConTareas(1);
    const error = exigirError(
      reducirSinMutar(doc, { comando: 'cambiarEstado', id: `${clave}-T1`, estado: 'pendiente' }),
    );
    expect(error.codigo).toBe('invalido');
  });

  it('el payload rechaza "bloqueada" como estado: es una bandera, no un valor del enum', () => {
    expect(validarComando({ comando: 'cambiarEstado', id: 'PM-T1', estado: 'bloqueada' }).ok).toBe(
      false,
    );
  });

  it('el evento dice de dónde a dónde, que es lo que la bitácora necesita sin comparar objetos', () => {
    const { doc, clave } = arbolConTareas(1);
    const { evento } = exigirOk(
      reducirSinMutar(doc, { comando: 'cambiarEstado', id: `${clave}-T1`, estado: 'en_curso' }),
    );
    expect(evento.resumen).toBe(`${clave}-T1: pendiente → en_curso`);
    expect(evento.detalle).toEqual({ antes: 'pendiente', despues: 'en_curso' });
  });

  it('el evento congela dónde vivía la tarea (regla 7): proyecto, ruta legible y contenedores', () => {
    const { doc, clave, epicaId, historiaId } = arbolConTareas(1);
    const { evento } = exigirOk(
      reducirSinMutar(doc, { comando: 'cambiarEstado', id: `${clave}-T1`, estado: 'hecha' }),
    );
    expect(evento).toMatchObject({
      proyecto_id: clave,
      origen: 'PM › Épica › Historia',
      epica_id: epicaId,
      historia_id: historiaId,
      item_id: `${clave}-T1`,
      ts: AHORA,
      fuente: 'ui',
    });
  });
});

// --- bloqueos ---------------------------------------------------------------

describe('bloquear y desbloquear — bandera, no estado', () => {
  it('bloquear NO cambia el estado: la tarea conserva su avance para saber a qué vuelve', () => {
    const { doc, clave } = arbolConTareas(1);
    const enCurso = aplicar(doc, { comando: 'cambiarEstado', id: `${clave}-T1`, estado: 'en_curso' });
    const { documento } = exigirOk(
      reducirSinMutar(enCurso, {
        comando: 'bloquear',
        tareaId: `${clave}-T1`,
        tipo: 'dependencia',
        motivo: 'Falta el acceso',
      }),
    );
    const tarea = documento.proyectos[0]?.epicas[0]?.historias[0]?.tareas[0];
    expect(tarea?.estado).toBe('en_curso');
    expect(tarea?.bloqueos).toEqual([
      {
        tipo: 'dependencia',
        motivo: 'Falta el acceso',
        bloqueada_en: AHORA,
        desbloqueada_en: null,
      },
    ]);
  });

  it('dos bloqueos abiertos a la vez se rechazan: no se sabría cuál cierra el desbloqueo', () => {
    const { doc, clave } = arbolConTareas(1);
    const bloqueada = aplicar(doc, {
      comando: 'bloquear',
      tareaId: `${clave}-T1`,
      tipo: 'externo',
      motivo: 'uno',
    });
    const error = exigirError(
      reducirSinMutar(bloqueada, {
        comando: 'bloquear',
        tareaId: `${clave}-T1`,
        tipo: 'otro',
        motivo: 'dos',
      }),
    );
    expect(error.codigo).toBe('invalido');
  });

  it('desbloquear CIERRA el bloqueo, no lo borra: es el dato que explica por qué algo tardó', () => {
    const { doc, clave } = arbolConTareas(1);
    const bloqueada = aplicar(doc, {
      comando: 'bloquear',
      tareaId: `${clave}-T1`,
      tipo: 'decision',
      motivo: 'Esperando a dirección',
    });
    const { documento } = exigirOk(
      reducirSinMutar(bloqueada, { comando: 'desbloquear', tareaId: `${clave}-T1` }),
    );
    const bloqueos = documento.proyectos[0]?.epicas[0]?.historias[0]?.tareas[0]?.bloqueos;
    expect(bloqueos).toHaveLength(1);
    expect(bloqueos?.[0]).toMatchObject({ motivo: 'Esperando a dirección', desbloqueada_en: AHORA });
  });

  it('tras desbloquear se puede volver a bloquear, y la lista guarda los dos episodios', () => {
    const { doc, clave } = arbolConTareas(1);
    const ciclo = aplicarTodos(doc, [
      { comando: 'bloquear', tareaId: `${clave}-T1`, tipo: 'externo', motivo: 'primero' },
      { comando: 'desbloquear', tareaId: `${clave}-T1` },
      { comando: 'bloquear', tareaId: `${clave}-T1`, tipo: 'informacion', motivo: 'segundo' },
    ]);
    const bloqueos = ciclo.proyectos[0]?.epicas[0]?.historias[0]?.tareas[0]?.bloqueos;
    expect(bloqueos?.map((b) => b.motivo)).toEqual(['primero', 'segundo']);
    expect(bloqueos?.filter((b) => b.desbloqueada_en === null)).toHaveLength(1);
  });

  it('desbloquear sin bloqueo abierto se rechaza', () => {
    const { doc, clave } = arbolConTareas(1);
    expect(
      exigirError(reducirSinMutar(doc, { comando: 'desbloquear', tareaId: `${clave}-T1` })).codigo,
    ).toBe('invalido');
  });

  it('terminar una tarea bloqueada NO cierra el bloqueo solo: son ortogonales', () => {
    const { doc, clave } = arbolConTareas(1);
    const bloqueada = aplicar(doc, {
      comando: 'bloquear',
      tareaId: `${clave}-T1`,
      tipo: 'externo',
      motivo: 'x',
    });
    const { documento } = exigirOk(
      reducirSinMutar(bloqueada, { comando: 'cambiarEstado', id: `${clave}-T1`, estado: 'hecha' }),
    );
    const tarea = documento.proyectos[0]?.epicas[0]?.historias[0]?.tareas[0];
    expect(tarea?.estado).toBe('hecha');
    expect(tarea?.bloqueos[0]?.desbloqueada_en).toBeNull();
  });

  it('el payload exige un motivo: un bloqueo sin motivo no explica nada dentro de un mes', () => {
    expect(
      validarComando({ comando: 'bloquear', tareaId: 'PM-T1', tipo: 'otro', motivo: '' }).ok,
    ).toBe(false);
  });
});
