/**
 * Comandos de persona. Los de equipo viven en `equipos.test.ts`.
 *
 * Tres reglas, y las tres viven en el reductor porque si vivieran en las vistas la
 * próxima pantalla que se escriba se olvidará de aplicarlas:
 *
 * - El id se deriva del nombre UNA vez, al alta, y ya no se toca nunca: es lo que
 *   guardan `tarea.responsable` y los items de los sprints cerrados.
 * - A una persona desactivada no se le asigna trabajo nuevo por NINGUNA ruta.
 * - Una persona con historia no se elimina, se desactiva.
 */

import { describe, expect, it } from 'vitest';

import { reducir } from '../../src/principal/comandos/reductor';
import { validarComando } from '../../src/principal/comandos/tipos';
import type { Documento } from '../../src/compartido/modelo/tipos';
import { unDocumento, unItem, unSprint } from '../apoyo/constructores';
import {
  aplicar,
  aplicarTodos,
  arbolConEquipo,
  arbolConTareas,
  arbolVacio,
  copiaProfunda,
  exigirError,
  exigirOk,
  reducirSinMutar,
} from '../apoyo/comandos';

/** El id que el reductor le da a una persona recién dada de alta con ese nombre. */
function idDe(nombre: string, previos: readonly string[] = []): string {
  const doc = aplicarTodos(
    unDocumento(),
    previos.map((n) => ({ comando: 'crearPersona' as const, nombre: n })),
  );
  const { documento } = exigirOk(reducir(doc, { comando: 'crearPersona', nombre }, '2026-08-26T11:20:00-06:00'));
  const ultima = documento.personas[documento.personas.length - 1];
  if (ultima === undefined) throw new Error('no se dio de alta a nadie');
  return ultima.id;
}

// --- derivación del id ------------------------------------------------------

describe('crearPersona — el id se deriva del nombre', () => {
  it('"Ana García Núñez" da "ana-garcia-nunez": sin acentos, sin ñ y sin mayúsculas', () => {
    expect(idDe('Ana García Núñez')).toBe('ana-garcia-nunez');
  });

  it('los acentos se quitan por descomposición, no por una tabla que siempre olvida una letra', () => {
    expect(idDe('Jesús Álvarez Íñiguez Öhman Çelik')).toBe('jesus-alvarez-iniguez-ohman-celik');
  });

  it('la puntuación y los espacios de más se colapsan en un solo guion, sin guiones en los extremos', () => {
    expect(idDe('  José  Luis   Pérez-Gómez, Jr.  ')).toBe('jose-luis-perez-gomez-jr');
  });

  it('un nombre sin una sola letra latina da "persona", y el nombre real se conserva intacto', () => {
    const { documento } = exigirOk(
      reducirSinMutar(unDocumento(), { comando: 'crearPersona', nombre: '李四' }),
    );
    expect(documento.personas[0]?.id).toBe('persona');
    expect(documento.personas[0]?.nombre).toBe('李四');
  });

  it('un nombre que es solo puntuación también cae en "persona" en vez de dar id vacío', () => {
    expect(idDe('???')).toBe('persona');
  });

  it('los dígitos sí son parte del id: "Ana 2" da "ana-2"', () => {
    expect(idDe('Ana 2')).toBe('ana-2');
  });
});

describe('crearPersona — desempate del id', () => {
  it('el segundo "Ana García" es "ana-garcia-2": la primera no lleva sufijo porque no hay «primera»', () => {
    expect(idDe('Ana García', ['Ana García'])).toBe('ana-garcia-2');
  });

  it('el tercero es -3, no -2 otra vez', () => {
    expect(idDe('Ana García', ['Ana García', 'Ana García'])).toBe('ana-garcia-3');
  });

  it('el desempate mira el id ya tomado, no el nombre: "Ana Garcia" sin acento también choca', () => {
    expect(idDe('Ana Garcia', ['Ana García'])).toBe('ana-garcia-2');
  });

  it('dos nombres sin letras latinas se numeran igual: "persona" y luego "persona-2"', () => {
    expect(idDe('李四', ['王五'])).toBe('persona-2');
  });

  it('un id ocupado a mano en el JSON tampoco se pisa', () => {
    const doc = unDocumento({
      personas: [{ id: 'ana-garcia', nombre: 'Quien sea', activa: true, clave_externa: null }],
    });
    const { documento } = exigirOk(
      reducirSinMutar(doc, { comando: 'crearPersona', nombre: 'Ana García' }),
    );
    expect(documento.personas[1]?.id).toBe('ana-garcia-2');
  });

  it('el hueco no se recicla: si existe ana-garcia y ana-garcia-2, la tercera es -3 aunque falte la 2ª persona real', () => {
    const doc = unDocumento({
      personas: [
        { id: 'ana-garcia', nombre: 'Ana García', activa: true, clave_externa: null },
        { id: 'ana-garcia-2', nombre: 'Ana García', activa: false, clave_externa: null },
      ],
    });
    const { documento } = exigirOk(
      reducirSinMutar(doc, { comando: 'crearPersona', nombre: 'Ana García' }),
    );
    expect(documento.personas[2]?.id).toBe('ana-garcia-3');
  });
});

describe('crearPersona — alta', () => {
  it('nace activa y sin clave externa', () => {
    const { documento } = exigirOk(
      reducirSinMutar(unDocumento(), { comando: 'crearPersona', nombre: 'Ana' }),
    );
    expect(documento.personas[0]).toEqual({
      id: 'ana',
      nombre: 'Ana',
      activa: true,
      clave_externa: null,
    });
  });

  it('puede nacer ya metida en unos equipos, sin un segundo comando', () => {
    const { doc } = arbolConEquipo('pm-frontend', 'Frontend');
    const { documento } = exigirOk(
      reducirSinMutar(doc, { comando: 'crearPersona', nombre: 'Ana', equipos: ['pm-frontend'] }),
    );
    expect(documento.proyectos[0]?.equipos[0]?.miembros).toEqual([
      { persona_id: 'ana', responsabilidades: [], capacidad: null },
    ]);
  });

  it('son ids de EQUIPO, no claves de proyecto: adscribir "a SICOE" ya no dice a cuál', () => {
    const { doc } = arbolConEquipo('pm-frontend', 'Frontend');
    const error = exigirError(
      reducirSinMutar(doc, { comando: 'crearPersona', nombre: 'Ana', equipos: ['pm'] }),
    );
    expect(error.codigo).toBe('no-encontrado');
    expect(error.mensaje).toContain('equipo');
  });

  it('si uno de los equipos no existe, no se da de alta a nadie', () => {
    const { doc } = arbolConEquipo('pm-frontend', 'Frontend');
    const error = exigirError(
      reducirSinMutar(doc, {
        comando: 'crearPersona',
        nombre: 'Ana',
        equipos: ['pm-frontend', 'fantasma'],
      }),
    );
    expect(error.codigo).toBe('no-encontrado');
    expect(doc.personas).toEqual([]);
  });
});

// --- editarPersona ----------------------------------------------------------

describe('editarPersona', () => {
  it('el id NO se puede cambiar: no existe el campo, así que mandarlo se RECHAZA', () => {
    // Igual que con la clave del proyecto, la garantía es estructural: `.strict()` sobre
    // un esquema que no tiene el campo. Si esto se ignorara en silencio, un renderer con
    // un bug creería haber renombrado a alguien.
    const resultado = validarComando({ comando: 'editarPersona', id: 'ana', idNuevo: 'ana-2' });
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) {
      expect(resultado.problemas.map((p) => p.mensaje).join(' ')).toContain('idNuevo');
    }
  });

  it('corregir el nombre NO regenera el id: los sprints cerrados siguen diciendo de quién fue el trabajo', () => {
    const doc = aplicar(unDocumento(), { comando: 'crearPersona', nombre: 'Ana Garcia' });
    const { documento } = exigirOk(
      reducirSinMutar(doc, { comando: 'editarPersona', id: 'ana-garcia', nombre: 'Ana García Núñez' }),
    );
    expect(documento.personas[0]?.id).toBe('ana-garcia');
    expect(documento.personas[0]?.nombre).toBe('Ana García Núñez');
  });

  it('el id sigue apuntando a las tareas de siempre después de corregir el nombre', () => {
    const { doc, historiaId, clave } = arbolConTareas(0);
    const conPersona = aplicar(doc, { comando: 'crearPersona', nombre: 'Ana' });
    const conTarea = aplicar(conPersona, {
      comando: 'crearTarea',
      contenedorId: historiaId,
      titulo: 'T',
      responsable: 'ana',
    });
    const { documento } = exigirOk(
      reducirSinMutar(conTarea, { comando: 'editarPersona', id: 'ana', nombre: 'Ana Renombrada' }),
    );
    const tarea = documento.proyectos[0]?.epicas[0]?.historias[0]?.tareas[0];
    expect(tarea?.id).toBe(`${clave}-T1`);
    expect(tarea?.responsable).toBe('ana');
  });

  it('NO tiene campo de equipos: la adscripción se escribe desde el equipo y aquí se RECHAZA', () => {
    // La garantía es estructural, igual que la de `idNuevo`: `.strict()` sobre un esquema
    // que no tiene el campo. Con dos caminos para el mismo dato —la persona y el equipo—
    // el día que discreparan no habría forma de saber cuál miente, y este era además el
    // camino pobre: una lista de ids no sabe con qué responsabilidades entra alguien.
    const resultado = validarComando({ comando: 'editarPersona', id: 'ana', equipos: ['pm-frontend'] });
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) {
      expect(resultado.problemas.map((p) => p.mensaje).join(' ')).toContain('equipos');
    }
  });

  it('un comando sin nombre se rechaza', () => {
    const doc = aplicar(unDocumento(), { comando: 'crearPersona', nombre: 'Ana' });
    expect(exigirError(reducirSinMutar(doc, { comando: 'editarPersona', id: 'ana' })).codigo).toBe(
      'invalido',
    );
  });

  it('sobre alguien que no existe da no-encontrado', () => {
    expect(
      exigirError(
        reducirSinMutar(unDocumento(), { comando: 'editarPersona', id: 'nadie', nombre: 'X' }),
      ).codigo,
    ).toBe('no-encontrado');
  });
});

// --- desactivar y reactivar -------------------------------------------------

describe('desactivarPersona', () => {
  it('la marca inactiva y la saca de los equipos, que son el presente', () => {
    const { doc } = arbolConEquipo('pm-frontend', 'Frontend');
    const dentro = aplicar(doc, { comando: 'crearPersona', nombre: 'Ana', equipos: ['pm-frontend'] });
    const { documento } = exigirOk(
      reducirSinMutar(dentro, { comando: 'desactivarPersona', id: 'ana' }),
    );
    expect(documento.personas[0]?.activa).toBe(false);
    expect(documento.proyectos[0]?.equipos[0]?.miembros).toEqual([]);
  });

  it('NO toca ni una de sus tareas: su historia es suya y sigue diciendo su nombre', () => {
    const { doc: arbol, historiaId } = arbolConTareas(0);
    const doc = aplicar(arbol, { comando: 'crearEquipo', proyecto: 'PM', id: 'pm-frontend', nombre: 'Frontend' });
    const conPersona = aplicar(doc, { comando: 'crearPersona', nombre: 'Ana', equipos: ['pm-frontend'] });
    const conTarea = aplicar(conPersona, {
      comando: 'crearTarea',
      contenedorId: historiaId,
      titulo: 'T',
      responsable: 'ana',
    });
    const { documento } = exigirOk(
      reducirSinMutar(conTarea, { comando: 'desactivarPersona', id: 'ana' }),
    );
    expect(documento.proyectos[0]?.epicas[0]?.historias[0]?.tareas[0]?.responsable).toBe('ana');
  });

  it('NO toca ni un item de sprint, ni abierto ni cerrado', () => {
    const doc = unDocumento({
      personas: [{ id: 'ana', nombre: 'Ana', activa: true, clave_externa: null }],
      proyectos: arbolConTareas(1).doc.proyectos,
      sprints: [
        unSprint({
          id: 'S-junio',
          estado: 'cerrado',
          inicio: '2026-06-01',
          fin: '2026-06-14',
          items: [unItem('PM-T1', { responsable: 'ana', desenlace: 'completada' })],
        }),
      ],
    });
    const { documento } = exigirOk(
      reducirSinMutar(doc, { comando: 'desactivarPersona', id: 'ana' }),
    );
    expect(documento.sprints).toEqual(doc.sprints);
  });

  it('de qué equipos salió queda en el evento POR ID, así que la baja es reversible a mano', () => {
    // Por id de equipo y no por clave de proyecto: con Frontend y Backend en el mismo
    // proyecto, "salió de PM" no dice de cuál de los dos, y el detalle deja de servir
    // para volver a meterla donde estaba — que es lo único para lo que existe.
    const { doc } = arbolConEquipo('pm-frontend', 'Frontend');
    const dentro = aplicar(doc, { comando: 'crearPersona', nombre: 'Ana', equipos: ['pm-frontend'] });
    const { evento } = exigirOk(reducirSinMutar(dentro, { comando: 'desactivarPersona', id: 'ana' }));
    expect(evento.detalle).toEqual({ equipos: ['pm-frontend'] });
  });

  it('desactivar dos veces se rechaza', () => {
    const doc = aplicar(unDocumento(), { comando: 'crearPersona', nombre: 'Ana' });
    const fuera = aplicar(doc, { comando: 'desactivarPersona', id: 'ana' });
    expect(
      exigirError(reducirSinMutar(fuera, { comando: 'desactivarPersona', id: 'ana' })).codigo,
    ).toBe('invalido');
  });
});

describe('reactivarPersona', () => {
  it('vuelve a estar activa', () => {
    const doc = aplicarTodos(unDocumento(), [
      { comando: 'crearPersona', nombre: 'Ana' },
      { comando: 'desactivarPersona', id: 'ana' },
    ]);
    const { documento } = exigirOk(reducirSinMutar(doc, { comando: 'reactivarPersona', id: 'ana' }));
    expect(documento.personas[0]?.activa).toBe(true);
  });

  it('NO vuelve sola a sus equipos anteriores: en cuáles está hoy es una decisión de hoy', () => {
    const { doc } = arbolConEquipo('pm-frontend', 'Frontend');
    const ciclo = aplicarTodos(doc, [
      { comando: 'crearPersona', nombre: 'Ana', equipos: ['pm-frontend'] },
      { comando: 'desactivarPersona', id: 'ana' },
    ]);
    const { documento } = exigirOk(reducirSinMutar(ciclo, { comando: 'reactivarPersona', id: 'ana' }));
    expect(documento.proyectos[0]?.equipos[0]?.miembros).toEqual([]);
  });

  it('reactivar a quien ya está activa se rechaza', () => {
    const doc = aplicar(unDocumento(), { comando: 'crearPersona', nombre: 'Ana' });
    expect(
      exigirError(reducirSinMutar(doc, { comando: 'reactivarPersona', id: 'ana' })).codigo,
    ).toBe('invalido');
  });

  it('tras reactivar sí se le puede volver a asignar trabajo', () => {
    const { doc, historiaId } = arbolConTareas(0);
    const ciclo = aplicarTodos(doc, [
      { comando: 'crearPersona', nombre: 'Ana' },
      { comando: 'desactivarPersona', id: 'ana' },
      { comando: 'reactivarPersona', id: 'ana' },
    ]);
    const { documento } = exigirOk(
      reducirSinMutar(ciclo, { comando: 'crearTarea', contenedorId: historiaId, titulo: 'T', responsable: 'ana' }),
    );
    expect(documento.proyectos[0]?.epicas[0]?.historias[0]?.tareas[0]?.responsable).toBe('ana');
  });
});

// --- no se asigna trabajo a quien está desactivada --------------------------

describe('a una persona desactivada no se le asigna trabajo nuevo por NINGUNA ruta', () => {
  /** Árbol con `ana` desactivada y `beto` activa. */
  function conAnaFuera(): { doc: Documento; historiaId: string; tareaId: string } {
    const { doc, historiaId, clave } = arbolConTareas(0);
    const conGente = aplicarTodos(doc, [
      { comando: 'crearPersona', nombre: 'Ana' },
      { comando: 'crearPersona', nombre: 'Beto' },
    ]);
    const conTarea = aplicar(conGente, { comando: 'crearTarea', contenedorId: historiaId, titulo: 'T' });
    const conEquipo = aplicar(conTarea, { comando: 'crearEquipo', proyecto: clave, id: 'pm-frontend', nombre: 'Frontend' });
    const fuera = aplicar(conEquipo, { comando: 'desactivarPersona', id: 'ana' });
    return { doc: fuera, historiaId, tareaId: `${clave}-T1` };
  }

  it('ruta 1 — crearTarea con responsable desactivado se rechaza', () => {
    const { doc, historiaId } = conAnaFuera();
    const error = exigirError(
      reducirSinMutar(doc, { comando: 'crearTarea', contenedorId: historiaId, titulo: 'X', responsable: 'ana' }),
    );
    expect(error.codigo).toBe('invalido');
    expect(error.mensaje).toContain('reactivarPersona');
  });

  it('ruta 1 — y la tarea NO se crea: el rechazo no puede dejar media captura', () => {
    const { doc, historiaId } = conAnaFuera();
    exigirError(
      reducirSinMutar(doc, { comando: 'crearTarea', contenedorId: historiaId, titulo: 'X', responsable: 'ana' }),
    );
    expect(doc.proyectos[0]?.epicas[0]?.historias[0]?.tareas).toHaveLength(1);
    expect(doc.proyectos[0]?.contadores.tareas).toBe(1);
  });

  it('ruta 2 — editarTarea asignándole la tarea se rechaza', () => {
    const { doc, tareaId } = conAnaFuera();
    const error = exigirError(
      reducirSinMutar(doc, { comando: 'editarTarea', id: tareaId, responsable: 'ana' }),
    );
    expect(error.codigo).toBe('invalido');
    expect(error.mensaje).toContain('reactivarPersona');
  });

  it('ruta 2 — el rechazo no deja aplicados los otros campos del mismo comando', () => {
    const { doc, tareaId } = conAnaFuera();
    exigirError(
      reducirSinMutar(doc, {
        comando: 'editarTarea',
        id: tareaId,
        titulo: 'Título nuevo',
        responsable: 'ana',
      }),
    );
    expect(doc.proyectos[0]?.epicas[0]?.historias[0]?.tareas[0]?.titulo).toBe('T');
  });

  it('ruta 3 — editarEquipo metiéndola al equipo se rechaza', () => {
    const { doc } = conAnaFuera();
    const error = exigirError(
      reducirSinMutar(doc, {
        comando: 'editarEquipo',
        equipoId: 'pm-frontend',
        miembros: [{ persona_id: 'ana', responsabilidades: [], capacidad: null }],
      }),
    );
    expect(error.codigo).toBe('invalido');
    expect(error.mensaje).toContain('reactivarPersona');
  });

  it('ruta 3 — basta una desactivada en la lista para tumbar el equipo entero', () => {
    const { doc } = conAnaFuera();
    exigirError(
      reducirSinMutar(doc, {
        comando: 'editarEquipo',
        equipoId: 'pm-frontend',
        miembros: [
          { persona_id: 'beto', responsabilidades: [], capacidad: null },
          { persona_id: 'ana', responsabilidades: [], capacidad: null },
        ],
      }),
    );
    expect(doc.proyectos[0]?.equipos[0]?.miembros).toEqual([]);
  });

  it('ruta 4 — moverMiembro hacia otro equipo tampoco la mete', () => {
    // Es alcanzable pese a que desactivar la saca de todos: el usuario edita el JSON a
    // mano (regla 14) y puede dejar a alguien inactivo dentro de un equipo.
    const { doc } = conAnaFuera();
    const conDos = aplicar(doc, { comando: 'crearEquipo', proyecto: 'PM', id: 'pm-backend', nombre: 'Backend' });
    const conAnaDentro = copiaProfunda(conDos);
    conAnaDentro.proyectos[0]?.equipos[0]?.miembros.push({
      persona_id: 'ana',
      responsabilidades: [],
      capacidad: null,
    });
    const error = exigirError(
      reducirSinMutar(conAnaDentro, {
        comando: 'moverMiembro',
        personaId: 'ana',
        desde: 'pm-frontend',
        hacia: 'pm-backend',
      }),
    );
    expect(error.codigo).toBe('invalido');
    expect(error.mensaje).toContain('reactivarPersona');
  });

  it('a alguien ACTIVO sí se le asigna por las tres rutas: el rechazo mide la bandera, no otra cosa', () => {
    const { doc, historiaId, tareaId } = conAnaFuera();
    exigirOk(reducirSinMutar(doc, { comando: 'crearTarea', contenedorId: historiaId, titulo: 'X', responsable: 'beto' }));
    exigirOk(reducirSinMutar(doc, { comando: 'editarTarea', id: tareaId, responsable: 'beto' }));
    exigirOk(
      reducirSinMutar(doc, {
        comando: 'editarEquipo',
        equipoId: 'pm-frontend',
        miembros: [{ persona_id: 'beto', responsabilidades: [], capacidad: null }],
      }),
    );
  });

  it('una persona que no existe se rechaza como no-encontrado, no como desactivada', () => {
    const { doc, historiaId } = conAnaFuera();
    const error = exigirError(
      reducirSinMutar(doc, { comando: 'crearTarea', contenedorId: historiaId, titulo: 'X', responsable: 'fantasma' }),
    );
    expect(error.codigo).toBe('no-encontrado');
  });
});

describe('quitar el responsable siempre se permite', () => {
  it('responsable: null sobre una tarea de alguien activo', () => {
    const { doc, historiaId, clave } = arbolConTareas(0);
    const conAsignada = aplicarTodos(doc, [
      { comando: 'crearPersona', nombre: 'Ana' },
      { comando: 'crearTarea', contenedorId: historiaId, titulo: 'T', responsable: 'ana' },
    ]);
    const { documento } = exigirOk(
      reducirSinMutar(conAsignada, { comando: 'editarTarea', id: `${clave}-T1`, responsable: null }),
    );
    expect(documento.proyectos[0]?.epicas[0]?.historias[0]?.tareas[0]?.responsable).toBeNull();
  });

  it('responsable: null aunque quien estaba ya se haya DESACTIVADO — si no, la tarea quedaría atrapada', () => {
    const { doc, historiaId, clave } = arbolConTareas(0);
    const conAsignada = aplicarTodos(doc, [
      { comando: 'crearPersona', nombre: 'Ana' },
      { comando: 'crearTarea', contenedorId: historiaId, titulo: 'T', responsable: 'ana' },
      { comando: 'desactivarPersona', id: 'ana' },
    ]);
    const { documento } = exigirOk(
      reducirSinMutar(conAsignada, { comando: 'editarTarea', id: `${clave}-T1`, responsable: null }),
    );
    expect(documento.proyectos[0]?.epicas[0]?.historias[0]?.tareas[0]?.responsable).toBeNull();
  });

  it('crearTarea sin responsable no consulta a nadie', () => {
    const { doc, historiaId } = arbolConTareas(0);
    const { documento } = exigirOk(
      reducirSinMutar(doc, { comando: 'crearTarea', contenedorId: historiaId, titulo: 'T', responsable: null }),
    );
    expect(documento.proyectos[0]?.epicas[0]?.historias[0]?.tareas[0]?.responsable).toBeNull();
  });
});

// --- eliminarPersona --------------------------------------------------------

describe('eliminarPersona — se bloquea si tiene historia, y remite a desactivarPersona', () => {
  it('se elimina si de verdad no la nombra nada', () => {
    const doc = aplicar(unDocumento(), { comando: 'crearPersona', nombre: 'Ana' });
    const { documento } = exigirOk(reducirSinMutar(doc, { comando: 'eliminarPersona', id: 'ana' }));
    expect(documento.personas).toEqual([]);
  });

  it('la pertenencia a un equipo NO bloquea: es presente, no historia — y se retira sola', () => {
    const { doc } = arbolConEquipo('pm-frontend', 'Frontend');
    const dentro = aplicar(doc, { comando: 'crearPersona', nombre: 'Ana', equipos: ['pm-frontend'] });
    const { documento, evento } = exigirOk(
      reducirSinMutar(dentro, { comando: 'eliminarPersona', id: 'ana' }),
    );
    expect(documento.personas).toEqual([]);
    expect(documento.proyectos[0]?.equipos[0]?.miembros).toEqual([]);
    expect(evento.detalle).toEqual({ equipos: ['pm-frontend'] });
  });

  it('se bloquea si es responsable de una tarea viva', () => {
    const { doc, historiaId } = arbolConTareas(0);
    const conTarea = aplicarTodos(doc, [
      { comando: 'crearPersona', nombre: 'Ana' },
      { comando: 'crearTarea', contenedorId: historiaId, titulo: 'T', responsable: 'ana' },
    ]);
    const error = exigirError(reducirSinMutar(conTarea, { comando: 'eliminarPersona', id: 'ana' }));
    expect(error.codigo).toBe('invalido');
    expect(error.mensaje).toContain('PM-T1');
  });

  it('el rechazo remite a desactivarPersona, que es lo que el usuario quería de verdad', () => {
    const { doc, historiaId } = arbolConTareas(0);
    const conTarea = aplicarTodos(doc, [
      { comando: 'crearPersona', nombre: 'Ana' },
      { comando: 'crearTarea', contenedorId: historiaId, titulo: 'T', responsable: 'ana' },
    ]);
    const error = exigirError(reducirSinMutar(conTarea, { comando: 'eliminarPersona', id: 'ana' }));
    expect(error.mensaje).toContain('desactivarPersona');
  });

  it('se bloquea si aparece en un item de sprint ABIERTO', () => {
    const doc = unDocumento({
      personas: [{ id: 'ana', nombre: 'Ana', activa: true, clave_externa: null }],
      proyectos: arbolConTareas(1).doc.proyectos,
      sprints: [unSprint({ id: 'S-1', estado: 'activo', items: [unItem('PM-T1', { responsable: 'ana' })] })],
    });
    const error = exigirError(reducirSinMutar(doc, { comando: 'eliminarPersona', id: 'ana' }));
    expect(error.codigo).toBe('invalido');
    expect(error.mensaje).toContain('S-1');
  });

  it('se bloquea si aparece SOLO en un sprint CERRADO, aunque hoy ninguna tarea sea suya', () => {
    // El caso que de verdad importa: la tarea se reasignó a Beto, así que nada del
    // presente la nombra. Lo único que la nombra es el registro de lo que pasó en junio.
    const doc = unDocumento({
      personas: [
        { id: 'ana', nombre: 'Ana', activa: true, clave_externa: null },
        { id: 'beto', nombre: 'Beto', activa: true, clave_externa: null },
      ],
      proyectos: copiaProfunda(arbolConTareas(1).doc.proyectos),
      sprints: [
        unSprint({
          id: 'S-junio',
          estado: 'cerrado',
          inicio: '2026-06-01',
          fin: '2026-06-14',
          items: [unItem('PM-T1', { responsable: 'ana', desenlace: 'completada' })],
        }),
      ],
    });
    const tarea = doc.proyectos[0]?.epicas[0]?.historias[0]?.tareas[0];
    if (tarea === undefined) throw new Error('fixture sin tarea');
    tarea.responsable = 'beto';

    const error = exigirError(reducirSinMutar(doc, { comando: 'eliminarPersona', id: 'ana' }));
    expect(error.codigo).toBe('invalido');
    expect(error.mensaje).toContain('S-junio');
    expect(error.mensaje).toContain('no se reescribe');
  });

  it('tras el rechazo el sprint cerrado queda intacto', () => {
    const doc = unDocumento({
      personas: [{ id: 'ana', nombre: 'Ana', activa: true, clave_externa: null }],
      proyectos: arbolConTareas(1).doc.proyectos,
      sprints: [
        unSprint({
          id: 'S-junio',
          estado: 'cerrado',
          inicio: '2026-06-01',
          fin: '2026-06-14',
          items: [unItem('PM-T1', { responsable: 'ana', desenlace: 'completada' })],
        }),
      ],
    });
    const antes = copiaProfunda(doc);
    exigirError(reducirSinMutar(doc, { comando: 'eliminarPersona', id: 'ana' }));
    expect(doc).toEqual(antes);
  });

  it('estar desactivada no basta para poder eliminarla: la historia pesa más que la bandera', () => {
    const { doc, historiaId } = arbolConTareas(0);
    const conTarea = aplicarTodos(doc, [
      { comando: 'crearPersona', nombre: 'Ana' },
      { comando: 'crearTarea', contenedorId: historiaId, titulo: 'T', responsable: 'ana' },
      { comando: 'desactivarPersona', id: 'ana' },
    ]);
    expect(
      exigirError(reducirSinMutar(conTarea, { comando: 'eliminarPersona', id: 'ana' })).codigo,
    ).toBe('invalido');
  });

  it('quitarle el responsable a la tarea sí la libera: la protección mide referencias, no historia difusa', () => {
    const { doc, historiaId, clave } = arbolConTareas(0);
    const conTarea = aplicarTodos(doc, [
      { comando: 'crearPersona', nombre: 'Ana' },
      { comando: 'crearTarea', contenedorId: historiaId, titulo: 'T', responsable: 'ana' },
    ]);
    const liberada = aplicar(conTarea, {
      comando: 'editarTarea',
      id: `${clave}-T1`,
      responsable: null,
    });
    const { documento } = exigirOk(
      reducirSinMutar(liberada, { comando: 'eliminarPersona', id: 'ana' }),
    );
    expect(documento.personas).toEqual([]);
  });

  it('eliminar a quien no existe da no-encontrado', () => {
    expect(
      exigirError(reducirSinMutar(unDocumento(), { comando: 'eliminarPersona', id: 'nadie' }))
        .codigo,
    ).toBe('no-encontrado');
  });
});
