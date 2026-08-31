/**
 * Comandos de equipo (M6, decisión N11): `crearEquipo`, `editarEquipo`, `eliminarEquipo`,
 * `moverMiembro` y `asignarEquipo`.
 *
 * Un equipo es una entidad de tres niveles —proyecto → equipos → personas con
 * responsabilidades—, no la lista de miembros de un proyecto. Lo que este archivo vigila
 * es exactamente lo que ese cambio hace posible y lo que hace peligroso:
 *
 * - Un proyecto tiene VARIOS equipos y cada comando toca el suyo. El defecto que M6
 *   cierra es que `editarEquipo` escribía siempre sobre `equipos[0]`.
 * - La misma persona vive en equipos de proyectos distintos y aparece **una sola vez** en
 *   su ficha, con las dos adscripciones.
 * - Eliminar un equipo con tareas asignadas avisa con el conteo y **no deja ninguna tarea
 *   apuntando a un id que ya no existe**.
 * - El «General» que dejó la migración se parte a mano sin perder ningún `rol`.
 * - `⌘Z` revierte cada uno: aquí se comprueba lo que eso exige del reductor —que sea puro
 *   y que el documento anterior sirva entero—, que es lo que `reducirSinMutar` afirma en
 *   cada llamada.
 */

import { describe, expect, it } from 'vitest';

import { equiposDe, responsableFueraDelEquipo } from '../../src/compartido/dominio/carga';
import { equiposParaAdmin } from '../../src/compartido/dominio/administracion';
import { validarComando } from '../../src/principal/comandos/tipos';
import type { Documento } from '../../src/compartido/modelo/tipos';
import { unDocumento } from '../apoyo/constructores';
import {
  aplicar,
  aplicarTodos,
  arbolConEquipo,
  arbolConTareas,
  arbolVacio,
  exigirError,
  exigirOk,
  exigirValido,
  reducirSinMutar,
} from '../apoyo/comandos';

/**
 * Un proyecto con dos equipos y dos personas dentro, uno en cada uno. Es la forma mínima
 * que distingue «toca el equipo correcto» de «toca el primero»: con un solo equipo las
 * dos implementaciones dan el mismo resultado y la prueba no mediría nada.
 */
function dosEquipos(): Documento {
  return aplicarTodos(arbolConTareas(2).doc, [
    { comando: 'crearPersona', nombre: 'Ana' },
    { comando: 'crearPersona', nombre: 'Beto' },
    { comando: 'crearEquipo', proyecto: 'PM', id: 'pm-frontend', nombre: 'Frontend' },
    { comando: 'crearEquipo', proyecto: 'PM', id: 'pm-backend', nombre: 'Backend' },
    {
      comando: 'editarEquipo',
      equipoId: 'pm-frontend',
      miembros: [{ persona_id: 'ana', responsabilidades: ['vistas'], capacidad: 5 }],
    },
    {
      comando: 'editarEquipo',
      equipoId: 'pm-backend',
      miembros: [{ persona_id: 'beto', responsabilidades: ['api'], capacidad: 3 }],
    },
  ]);
}

const equiposDe1 = (doc: Documento) => doc.proyectos[0]?.equipos ?? [];

// --- crearEquipo ------------------------------------------------------------

describe('crearEquipo', () => {
  it('un proyecto puede tener DOS equipos, cada uno con sus miembros', () => {
    const doc = dosEquipos();
    expect(equiposDe1(doc).map((e) => e.id)).toEqual(['pm-frontend', 'pm-backend']);
    expect(equiposDe1(doc)[0]?.miembros).toEqual([
      { persona_id: 'ana', responsabilidades: ['vistas'], capacidad: 5 },
    ]);
    expect(equiposDe1(doc)[1]?.miembros).toEqual([
      { persona_id: 'beto', responsabilidades: ['api'], capacidad: 3 },
    ]);
  });

  it('nace vacío: meter gente es otro comando, y por eso hay un solo camino a la pertenencia', () => {
    const { doc } = arbolVacio('PM');
    const { documento } = exigirOk(
      reducirSinMutar(doc, { comando: 'crearEquipo', proyecto: 'PM', id: 'pm-frontend', nombre: 'Frontend' }),
    );
    expect(equiposDe1(documento)).toEqual([{ id: 'pm-frontend', nombre: 'Frontend', miembros: [] }]);
  });

  it('el id lo escribe el usuario y no lo emite ningún contador: los contadores no se mueven', () => {
    // S5: un cuarto contador en `EsquemaContadores` sería maquinaria para diez filas.
    const { doc } = arbolVacio('PM');
    const { documento } = exigirOk(
      reducirSinMutar(doc, { comando: 'crearEquipo', proyecto: 'PM', id: 'pm-frontend', nombre: 'Frontend' }),
    );
    expect(documento.proyectos[0]?.contadores).toEqual(doc.proyectos[0]?.contadores);
  });

  it('el id repetido se rechaza nombrando el choque, aunque el otro sea de OTRO proyecto', () => {
    const uno = arbolVacio('UNO');
    const dos = arbolVacio('DOS');
    const base = { ...uno.doc, proyectos: [...uno.doc.proyectos, ...dos.doc.proyectos] };
    const conEquipo = aplicar(base, { comando: 'crearEquipo', proyecto: 'UNO', id: 'equipo-comun', nombre: 'Común' });
    const error = exigirError(
      reducirSinMutar(conEquipo, { comando: 'crearEquipo', proyecto: 'DOS', id: 'equipo-comun', nombre: 'Otro' }),
    );
    expect(error.codigo).toBe('invalido');
    expect(error.mensaje).toContain('UNO');
  });

  it('un id con mayúsculas o espacios lo rechaza el PAYLOAD, no el reductor', () => {
    // El patrón vive en el esquema del documento y se reusa en el comando: dos patrones
    // mantenidos en paralelo aceptarían aquí lo que el archivo rechaza allá.
    const resultado = validarComando({ comando: 'crearEquipo', proyecto: 'PM', id: 'PM Frontend', nombre: 'X' });
    expect(resultado.ok).toBe(false);
  });

  it('sobre un proyecto que no existe da no-encontrado', () => {
    expect(
      exigirError(
        reducirSinMutar(unDocumento(), { comando: 'crearEquipo', proyecto: 'NADA', id: 'x-uno', nombre: 'X' }),
      ).codigo,
    ).toBe('no-encontrado');
  });
});

// --- editarEquipo -----------------------------------------------------------

describe('editarEquipo', () => {
  it('escribe sobre el equipo NOMBRADO, no sobre el primero: ese era el defecto de M6', () => {
    const doc = dosEquipos();
    const { documento } = exigirOk(
      reducirSinMutar(doc, {
        comando: 'editarEquipo',
        equipoId: 'pm-backend',
        miembros: [{ persona_id: 'ana', responsabilidades: ['api'], capacidad: null }],
      }),
    );
    expect(equiposDe1(documento)[0]?.miembros).toEqual([
      { persona_id: 'ana', responsabilidades: ['vistas'], capacidad: 5 },
    ]);
    expect(equiposDe1(documento)[1]?.miembros).toEqual([
      { persona_id: 'ana', responsabilidades: ['api'], capacidad: null },
    ]);
  });

  it('renombra sin tocar la lista, y reemplaza la lista sin tocar el nombre', () => {
    const doc = dosEquipos();
    const soloNombre = exigirOk(
      reducirSinMutar(doc, { comando: 'editarEquipo', equipoId: 'pm-frontend', nombre: 'Cliente' }),
    ).documento;
    expect(equiposDe1(soloNombre)[0]?.nombre).toBe('Cliente');
    expect(equiposDe1(soloNombre)[0]?.miembros).toHaveLength(1);

    const soloLista = exigirOk(
      reducirSinMutar(doc, { comando: 'editarEquipo', equipoId: 'pm-frontend', miembros: [] }),
    ).documento;
    expect(equiposDe1(soloLista)[0]?.nombre).toBe('Frontend');
    expect(equiposDe1(soloLista)[0]?.miembros).toEqual([]);
  });

  it('un comando sin nombre ni miembros se rechaza', () => {
    expect(
      exigirError(reducirSinMutar(dosEquipos(), { comando: 'editarEquipo', equipoId: 'pm-frontend' })).codigo,
    ).toBe('invalido');
  });

  it('la misma persona puede estar en DOS equipos del mismo proyecto', () => {
    // No es un error que haya que resolver: es justo lo que vuelve ambiguo derivar el
    // equipo de una tarea del responsable, y por eso `tarea.equipo_id` es explícito.
    const doc = dosEquipos();
    const { documento } = exigirOk(
      reducirSinMutar(doc, {
        comando: 'editarEquipo',
        equipoId: 'pm-backend',
        miembros: [
          { persona_id: 'beto', responsabilidades: ['api'], capacidad: 3 },
          { persona_id: 'ana', responsabilidades: ['api'], capacidad: 2 },
        ],
      }),
    );
    exigirValido(documento);
    expect(equiposDe(documento, 'ana').map((p) => p.equipoId)).toEqual(['pm-frontend', 'pm-backend']);
  });

  it('vaciar un equipo se permite: un equipo puede quedarse sin nadie sin dejar de existir', () => {
    const { documento } = exigirOk(
      reducirSinMutar(dosEquipos(), { comando: 'editarEquipo', equipoId: 'pm-frontend', miembros: [] }),
    );
    expect(equiposDe1(documento)[0]).toEqual({ id: 'pm-frontend', nombre: 'Frontend', miembros: [] });
  });

  it('sacar a alguien del equipo NO le quita sus tareas: el equipo no restringe quién es responsable', () => {
    const doc = aplicar(dosEquipos(), { comando: 'editarTarea', id: 'PM-T1', responsable: 'ana' });
    const { documento } = exigirOk(
      reducirSinMutar(doc, { comando: 'editarEquipo', equipoId: 'pm-frontend', miembros: [] }),
    );
    expect(documento.proyectos[0]?.epicas[0]?.historias[0]?.tareas[0]?.responsable).toBe('ana');
  });

  it('rechaza a la misma persona dos veces en la lista', () => {
    const error = exigirError(
      reducirSinMutar(dosEquipos(), {
        comando: 'editarEquipo',
        equipoId: 'pm-frontend',
        miembros: [
          { persona_id: 'ana', responsabilidades: ['uno'], capacidad: null },
          { persona_id: 'ana', responsabilidades: ['dos'], capacidad: null },
        ],
      }),
    );
    expect(error.codigo).toBe('invalido');
    expect(error.mensaje).toContain('dos veces');
  });

  it('rechaza a alguien que no está en personas', () => {
    expect(
      exigirError(
        reducirSinMutar(dosEquipos(), {
          comando: 'editarEquipo',
          equipoId: 'pm-frontend',
          miembros: [{ persona_id: 'fantasma', responsabilidades: [], capacidad: null }],
        }),
      ).codigo,
    ).toBe('no-encontrado');
  });

  it('el rechazo no deja el nombre cambiado: la validación va antes de la primera mutación', () => {
    const doc = dosEquipos();
    exigirError(
      reducirSinMutar(doc, {
        comando: 'editarEquipo',
        equipoId: 'pm-frontend',
        nombre: 'Cliente',
        miembros: [{ persona_id: 'fantasma', responsabilidades: [], capacidad: null }],
      }),
    );
    expect(equiposDe1(doc)[0]?.nombre).toBe('Frontend');
  });

  it('las responsabilidades son texto libre: no hay catálogo que validar (S3)', () => {
    const { documento } = exigirOk(
      reducirSinMutar(dosEquipos(), {
        comando: 'editarEquipo',
        equipoId: 'pm-frontend',
        miembros: [{ persona_id: 'ana', responsabilidades: ['lo que sea', 'y otra cosa'], capacidad: null }],
      }),
    );
    expect(equiposDe1(documento)[0]?.miembros[0]?.responsabilidades).toEqual(['lo que sea', 'y otra cosa']);
  });

  it('sobre un equipo que no existe da no-encontrado', () => {
    expect(
      exigirError(reducirSinMutar(dosEquipos(), { comando: 'editarEquipo', equipoId: 'fantasma', miembros: [] })).codigo,
    ).toBe('no-encontrado');
  });
});

// --- eliminarEquipo ---------------------------------------------------------

describe('eliminarEquipo', () => {
  it('borra el equipo y deja intactos los demás del proyecto', () => {
    const { documento } = exigirOk(
      reducirSinMutar(dosEquipos(), { comando: 'eliminarEquipo', equipoId: 'pm-frontend' }),
    );
    expect(equiposDe1(documento).map((e) => e.id)).toEqual(['pm-backend']);
  });

  it('se lleva la pertenencia —es presente— y deja en el evento de quiénes era', () => {
    const { documento, evento } = exigirOk(
      reducirSinMutar(dosEquipos(), { comando: 'eliminarEquipo', equipoId: 'pm-frontend' }),
    );
    expect(evento.detalle).toEqual({ miembros: ['ana'] });
    expect(documento.personas.map((p) => p.id)).toEqual(['ana', 'beto']);
  });

  it('con tareas asignadas se RECHAZA, con el conteo y nombrando la alternativa', () => {
    const doc = aplicarTodos(dosEquipos(), [
      { comando: 'asignarEquipo', tareaId: 'PM-T1', equipoId: 'pm-frontend' },
      { comando: 'asignarEquipo', tareaId: 'PM-T2', equipoId: 'pm-frontend' },
    ]);
    const error = exigirError(reducirSinMutar(doc, { comando: 'eliminarEquipo', equipoId: 'pm-frontend' }));
    expect(error.codigo).toBe('invalido');
    expect(error.mensaje).toContain('2 tarea(s)');
    expect(error.mensaje).toContain('PM-T1');
    expect(error.mensaje).toContain('asignarEquipo');
  });

  it('y ninguna tarea queda apuntando a un id inexistente: el documento sigue válido', () => {
    const doc = aplicar(dosEquipos(), { comando: 'asignarEquipo', tareaId: 'PM-T1', equipoId: 'pm-frontend' });
    exigirError(reducirSinMutar(doc, { comando: 'eliminarEquipo', equipoId: 'pm-frontend' }));
    // El rechazo no escribió nada; y si algún día alguien lo convirtiera en un borrado,
    // esta comprobación del documento de partida seguiría en verde y la de abajo no.
    exigirValido(doc);
    expect(doc.proyectos[0]?.epicas[0]?.historias[0]?.tareas[0]?.equipo_id).toBe('pm-frontend');
  });

  it('cuenta también las tareas colgadas de la épica y del proyecto (N9), no solo las de la historia', () => {
    const base = aplicarTodos(dosEquipos(), [
      { comando: 'crearTarea', contenedorId: 'PM-E1', titulo: 'De la épica' },
      { comando: 'crearTarea', contenedorId: 'PM', titulo: 'Del proyecto' },
    ]);
    const doc = aplicarTodos(base, [
      { comando: 'asignarEquipo', tareaId: 'PM-T3', equipoId: 'pm-frontend' },
      { comando: 'asignarEquipo', tareaId: 'PM-T4', equipoId: 'pm-frontend' },
    ]);
    const error = exigirError(reducirSinMutar(doc, { comando: 'eliminarEquipo', equipoId: 'pm-frontend' }));
    expect(error.mensaje).toContain('2 tarea(s)');
  });

  it('tras reasignar las tareas ya se puede eliminar', () => {
    const conTarea = aplicar(dosEquipos(), { comando: 'asignarEquipo', tareaId: 'PM-T1', equipoId: 'pm-frontend' });
    const reasignada = aplicar(conTarea, { comando: 'asignarEquipo', tareaId: 'PM-T1', equipoId: 'pm-backend' });
    const { documento } = exigirOk(
      reducirSinMutar(reasignada, { comando: 'eliminarEquipo', equipoId: 'pm-frontend' }),
    );
    expect(equiposDe1(documento).map((e) => e.id)).toEqual(['pm-backend']);
    exigirValido(documento);
  });

  it('sobre un equipo que no existe da no-encontrado', () => {
    expect(
      exigirError(reducirSinMutar(dosEquipos(), { comando: 'eliminarEquipo', equipoId: 'fantasma' })).codigo,
    ).toBe('no-encontrado');
  });
});

// --- moverMiembro -----------------------------------------------------------

describe('moverMiembro', () => {
  it('mueve la ficha ENTERA: responsabilidades y capacidad viajan con la persona', () => {
    const { documento } = exigirOk(
      reducirSinMutar(dosEquipos(), {
        comando: 'moverMiembro',
        personaId: 'ana',
        desde: 'pm-frontend',
        hacia: 'pm-backend',
      }),
    );
    expect(equiposDe1(documento)[0]?.miembros).toEqual([]);
    expect(equiposDe1(documento)[1]?.miembros).toEqual([
      { persona_id: 'beto', responsabilidades: ['api'], capacidad: 3 },
      { persona_id: 'ana', responsabilidades: ['vistas'], capacidad: 5 },
    ]);
  });

  it('conserva también los campos que el usuario escribió a mano dentro del miembro (regla 14)', () => {
    const doc = dosEquipos();
    const miembro = doc.proyectos[0]?.equipos[0]?.miembros[0];
    if (miembro === undefined) throw new Error('el fixture debería traer un miembro');
    (miembro as Record<string, unknown>)['nota'] = 'la escribió el usuario';

    const { documento } = exigirOk(
      reducirSinMutar(doc, { comando: 'moverMiembro', personaId: 'ana', desde: 'pm-frontend', hacia: 'pm-backend' }),
    );
    expect(documento.proyectos[0]?.equipos[1]?.miembros[1]).toEqual({
      persona_id: 'ana',
      responsabilidades: ['vistas'],
      capacidad: 5,
      nota: 'la escribió el usuario',
    });
  });

  it('mueve entre equipos de proyectos DISTINTOS', () => {
    const uno = arbolConEquipo('uno-frontend', 'Frontend', 'UNO');
    const dos = arbolConEquipo('dos-backend', 'Backend', 'DOS');
    const base: Documento = { ...uno.doc, proyectos: [...uno.doc.proyectos, ...dos.doc.proyectos] };
    const conAna = aplicar(base, { comando: 'crearPersona', nombre: 'Ana', equipos: ['uno-frontend'] });
    const { documento } = exigirOk(
      reducirSinMutar(conAna, {
        comando: 'moverMiembro',
        personaId: 'ana',
        desde: 'uno-frontend',
        hacia: 'dos-backend',
      }),
    );
    expect(equiposDe(documento, 'ana').map((p) => p.clave)).toEqual(['DOS']);
  });

  it('si no está en el equipo de origen se rechaza y no se duplica en el destino', () => {
    const doc = dosEquipos();
    const error = exigirError(
      reducirSinMutar(doc, { comando: 'moverMiembro', personaId: 'beto', desde: 'pm-frontend', hacia: 'pm-backend' }),
    );
    expect(error.codigo).toBe('invalido');
    expect(equiposDe1(doc)[1]?.miembros).toHaveLength(1);
  });

  it('si ya está en el destino se rechaza: el esquema prohíbe el duplicado dentro de un equipo', () => {
    const doc = aplicar(dosEquipos(), {
      comando: 'editarEquipo',
      equipoId: 'pm-backend',
      miembros: [
        { persona_id: 'beto', responsabilidades: ['api'], capacidad: 3 },
        { persona_id: 'ana', responsabilidades: [], capacidad: null },
      ],
    });
    const error = exigirError(
      reducirSinMutar(doc, { comando: 'moverMiembro', personaId: 'ana', desde: 'pm-frontend', hacia: 'pm-backend' }),
    );
    expect(error.codigo).toBe('invalido');
    expect(error.mensaje).toContain('ya está');
  });

  it('origen y destino iguales se rechazan en vez de sacar y volver a meter', () => {
    expect(
      exigirError(
        reducirSinMutar(dosEquipos(), {
          comando: 'moverMiembro',
          personaId: 'ana',
          desde: 'pm-frontend',
          hacia: 'pm-frontend',
        }),
      ).codigo,
    ).toBe('invalido');
  });

  it('un equipo inexistente da no-encontrado, de los dos lados', () => {
    const doc = dosEquipos();
    expect(
      exigirError(reducirSinMutar(doc, { comando: 'moverMiembro', personaId: 'ana', desde: 'fantasma', hacia: 'pm-backend' })).codigo,
    ).toBe('no-encontrado');
    expect(
      exigirError(reducirSinMutar(doc, { comando: 'moverMiembro', personaId: 'ana', desde: 'pm-frontend', hacia: 'fantasma' })).codigo,
    ).toBe('no-encontrado');
  });
});

// --- asignarEquipo ----------------------------------------------------------

describe('asignarEquipo', () => {
  it('pone y quita el equipo de una tarea', () => {
    const conEquipo = exigirOk(
      reducirSinMutar(dosEquipos(), { comando: 'asignarEquipo', tareaId: 'PM-T1', equipoId: 'pm-backend' }),
    ).documento;
    expect(conEquipo.proyectos[0]?.epicas[0]?.historias[0]?.tareas[0]?.equipo_id).toBe('pm-backend');

    const sinEquipo = exigirOk(
      reducirSinMutar(conEquipo, { comando: 'asignarEquipo', tareaId: 'PM-T1', equipoId: null }),
    ).documento;
    expect(sinEquipo.proyectos[0]?.epicas[0]?.historias[0]?.tareas[0]?.equipo_id).toBeNull();
  });

  it('una tarea SIN responsable sí tiene equipo: es la razón de que el campo no se derive', () => {
    const { documento } = exigirOk(
      reducirSinMutar(dosEquipos(), { comando: 'asignarEquipo', tareaId: 'PM-T1', equipoId: 'pm-backend' }),
    );
    const tarea = documento.proyectos[0]?.epicas[0]?.historias[0]?.tareas[0];
    expect(tarea?.responsable).toBeNull();
    expect(tarea?.equipo_id).toBe('pm-backend');
  });

  it('el responsable NO tiene que pertenecer al equipo: se admite y se SEÑALA, no se rechaza', () => {
    const doc = aplicarTodos(dosEquipos(), [
      { comando: 'editarTarea', id: 'PM-T1', responsable: 'ana' },
      { comando: 'asignarEquipo', tareaId: 'PM-T1', equipoId: 'pm-backend' },
    ]);
    exigirValido(doc);
    const proyecto = doc.proyectos[0];
    const tarea = proyecto?.epicas[0]?.historias[0]?.tareas[0];
    if (proyecto === undefined || tarea === undefined) throw new Error('fixture incompleto');
    expect(responsableFueraDelEquipo(proyecto, tarea)).toBe(true);
  });

  it('un equipo de OTRO proyecto se rechaza diciendo de cuál es, no con "documento-invalido"', () => {
    const dos = arbolConEquipo('dos-backend', 'Backend', 'DOS');
    const base: Documento = { ...dosEquipos(), proyectos: [...dosEquipos().proyectos, ...dos.doc.proyectos] };
    const error = exigirError(
      reducirSinMutar(base, { comando: 'asignarEquipo', tareaId: 'PM-T1', equipoId: 'dos-backend' }),
    );
    expect(error.codigo).toBe('invalido');
    expect(error.mensaje).toContain('DOS');
  });

  it('un equipo que no existe en ningún sitio da "no existe"', () => {
    const error = exigirError(
      reducirSinMutar(dosEquipos(), { comando: 'asignarEquipo', tareaId: 'PM-T1', equipoId: 'fantasma' }),
    );
    expect(error.mensaje).toContain('no existe');
  });

  it('asignar el mismo equipo dos veces no produce evento: un no-cambio no se apila en deshacer', () => {
    const doc = aplicar(dosEquipos(), { comando: 'asignarEquipo', tareaId: 'PM-T1', equipoId: 'pm-backend' });
    expect(
      exigirError(reducirSinMutar(doc, { comando: 'asignarEquipo', tareaId: 'PM-T1', equipoId: 'pm-backend' })).codigo,
    ).toBe('invalido');
  });

  it('`equipoId` es obligatorio: omitirlo se rechaza en el payload, no se lee como "no tocar"', () => {
    expect(validarComando({ comando: 'asignarEquipo', tareaId: 'PM-T1' }).ok).toBe(false);
  });

  it('sobre una tarea que no existe da no-encontrado', () => {
    expect(
      exigirError(reducirSinMutar(dosEquipos(), { comando: 'asignarEquipo', tareaId: 'PM-T99', equipoId: 'pm-backend' })).codigo,
    ).toBe('no-encontrado');
  });
});

// --- los criterios de aceptación de M6 --------------------------------------

describe('la misma persona en equipos de dos proyectos distintos', () => {
  function enDos(): Documento {
    const uno = arbolConEquipo('uno-frontend', 'Frontend', 'UNO');
    const dos = arbolConEquipo('dos-backend', 'Backend', 'DOS');
    const base: Documento = { ...uno.doc, proyectos: [...uno.doc.proyectos, ...dos.doc.proyectos] };
    return aplicarTodos(base, [
      { comando: 'crearPersona', nombre: 'Ana' },
      { comando: 'editarEquipo', equipoId: 'uno-frontend', miembros: [{ persona_id: 'ana', responsabilidades: ['vistas'], capacidad: 5 }] },
      { comando: 'editarEquipo', equipoId: 'dos-backend', miembros: [{ persona_id: 'ana', responsabilidades: ['api'], capacidad: 2 }] },
    ]);
  }

  it('aparece UNA sola vez en el catálogo, con las DOS adscripciones', () => {
    const doc = enDos();
    expect(doc.personas.filter((p) => p.id === 'ana')).toHaveLength(1);
    expect(equiposDe(doc, 'ana')).toEqual([
      { equipoId: 'uno-frontend', equipo: 'Frontend', clave: 'UNO', nombre: 'Proyecto UNO', responsabilidades: ['vistas'], capacidad: 5 },
      { equipoId: 'dos-backend', equipo: 'Backend', clave: 'DOS', nombre: 'Proyecto DOS', responsabilidades: ['api'], capacidad: 2 },
    ]);
  });

  it('cada adscripción conserva SUS responsabilidades: no se mezclan ni gana la última', () => {
    const equipos = equiposDe(enDos(), 'ana');
    expect(equipos.map((e) => e.responsabilidades)).toEqual([['vistas'], ['api']]);
  });
});

describe('partir a mano el «General» que dejó la migración', () => {
  /** El estado tras migrar: un solo equipo por proyecto, con los roles convertidos. */
  function conGeneral(): Documento {
    return aplicarTodos(arbolConTareas(1).doc, [
      { comando: 'crearPersona', nombre: 'Ana' },
      { comando: 'crearPersona', nombre: 'Beto' },
      { comando: 'crearEquipo', proyecto: 'PM', id: 'pm-general', nombre: 'General' },
      {
        comando: 'editarEquipo',
        equipoId: 'pm-general',
        miembros: [
          { persona_id: 'ana', responsabilidades: ['frontend'], capacidad: 5 },
          { persona_id: 'beto', responsabilidades: ['backend'], capacidad: 3 },
        ],
      },
    ]);
  }

  it('se parte en dos sin perder ningún rol ni ninguna capacidad', () => {
    const partido = aplicarTodos(conGeneral(), [
      { comando: 'crearEquipo', proyecto: 'PM', id: 'pm-backend', nombre: 'Backend' },
      { comando: 'moverMiembro', personaId: 'beto', desde: 'pm-general', hacia: 'pm-backend' },
      { comando: 'editarEquipo', equipoId: 'pm-general', nombre: 'Frontend' },
    ]);

    expect(equiposDe1(partido)).toEqual([
      {
        id: 'pm-general',
        nombre: 'Frontend',
        miembros: [{ persona_id: 'ana', responsabilidades: ['frontend'], capacidad: 5 }],
      },
      {
        id: 'pm-backend',
        nombre: 'Backend',
        miembros: [{ persona_id: 'beto', responsabilidades: ['backend'], capacidad: 3 }],
      },
    ]);
    exigirValido(partido);
  });

  it('el id «pm-general» se queda aunque el equipo se llame Frontend: renombrar no renumera', () => {
    // Mismo criterio que la clave del proyecto y el id de la persona: el id es la
    // referencia que guarda `tarea.equipo_id`, y cambiarlo rompería lo ya clasificado.
    const conTarea = aplicar(conGeneral(), { comando: 'asignarEquipo', tareaId: 'PM-T1', equipoId: 'pm-general' });
    const renombrado = aplicar(conTarea, { comando: 'editarEquipo', equipoId: 'pm-general', nombre: 'Frontend' });
    expect(renombrado.proyectos[0]?.epicas[0]?.historias[0]?.tareas[0]?.equipo_id).toBe('pm-general');
  });
});

describe('⌘Z: el documento anterior basta para revertir cada comando nuevo', () => {
  it('ninguno de los cinco muta el documento de entrada, así que el snapshot previo sirve entero', () => {
    // La pila de deshacer son snapshots del documento (D1 del plan): revertir es volver
    // al anterior. Eso solo funciona si el reductor es puro, y `reducirSinMutar` lo
    // comprueba en cada llamada — aquí se hace explícito para los cinco de M6.
    const partida = dosEquipos();
    const comandos = [
      { comando: 'crearEquipo' as const, proyecto: 'PM', id: 'pm-datos', nombre: 'Datos' },
      { comando: 'editarEquipo' as const, equipoId: 'pm-frontend', nombre: 'Cliente' },
      { comando: 'eliminarEquipo' as const, equipoId: 'pm-backend' },
      { comando: 'moverMiembro' as const, personaId: 'ana', desde: 'pm-frontend', hacia: 'pm-backend' },
      { comando: 'asignarEquipo' as const, tareaId: 'PM-T1', equipoId: 'pm-frontend' },
    ];

    for (const comando of comandos) {
      const { documento } = exigirOk(reducirSinMutar(partida, comando));
      expect(documento, `"${comando.comando}" no cambió nada`).not.toEqual(partida);
      exigirValido(documento, comando.comando);
    }
    // Y el documento de partida sigue exactamente igual tras los cinco.
    expect(partida).toEqual(dosEquipos());
  });
});

// --- lo que la vista lee ----------------------------------------------------

describe('equiposParaAdmin: proyecto → equipos → miembros', () => {
  it('trae los dos equipos del proyecto con sus miembros y su capacidad sumada', () => {
    const [proyecto] = equiposParaAdmin(dosEquipos());
    expect(proyecto?.equipos.map((e) => e.id)).toEqual(['pm-frontend', 'pm-backend']);
    expect(proyecto?.equipos[0]?.capacidad).toEqual({ total: 5, conDato: 1, miembros: 1 });
    expect(proyecto?.equipos[0]?.miembros[0]?.nombre).toBe('Ana');
  });

  it('la capacidad de un equipo sin ningún dato es null, nunca 0', () => {
    const doc = aplicar(dosEquipos(), {
      comando: 'editarEquipo',
      equipoId: 'pm-frontend',
      miembros: [{ persona_id: 'ana', responsabilidades: [], capacidad: null }],
    });
    const [proyecto] = equiposParaAdmin(doc);
    expect(proyecto?.equipos[0]?.capacidad).toEqual({ total: null, conDato: 0, miembros: 1 });
  });

  it('la capacidad NO se persiste: es una suma, y el documento no tiene dónde guardarla', () => {
    const doc = dosEquipos();
    expect(Object.keys(doc.proyectos[0]?.equipos[0] ?? {})).toEqual(['id', 'nombre', 'miembros']);
  });

  it('cada miembro sabe en qué OTROS equipos está', () => {
    const doc = aplicar(dosEquipos(), {
      comando: 'editarEquipo',
      equipoId: 'pm-backend',
      miembros: [
        { persona_id: 'beto', responsabilidades: ['api'], capacidad: 3 },
        { persona_id: 'ana', responsabilidades: ['api'], capacidad: 2 },
      ],
    });
    const [proyecto] = equiposParaAdmin(doc);
    expect(proyecto?.equipos[0]?.miembros[0]?.otrosEquipos.map((e) => e.equipoId)).toEqual(['pm-backend']);
  });

  it('cuenta las tareas del equipo y las que se quedaron sin ninguno', () => {
    const doc = aplicar(dosEquipos(), { comando: 'asignarEquipo', tareaId: 'PM-T1', equipoId: 'pm-frontend' });
    const [proyecto] = equiposParaAdmin(doc);
    expect(proyecto?.equipos[0]?.tareas).toBe(1);
    expect(proyecto?.equipos[0]?.abiertas).toBe(1);
    expect(proyecto?.sinEquipo).toBe(1);
  });

  it('publica la señal «responsable fuera del equipo» con los ids, para poder nombrarlos', () => {
    const doc = aplicarTodos(dosEquipos(), [
      { comando: 'editarTarea', id: 'PM-T1', responsable: 'beto' },
      { comando: 'asignarEquipo', tareaId: 'PM-T1', equipoId: 'pm-frontend' },
      { comando: 'editarTarea', id: 'PM-T2', responsable: 'ana' },
      { comando: 'asignarEquipo', tareaId: 'PM-T2', equipoId: 'pm-frontend' },
    ]);
    const [proyecto] = equiposParaAdmin(doc);
    expect(proyecto?.equipos[0]?.responsablesFuera).toEqual(['PM-T1']);
  });

  it('un proyecto sin ningún equipo sale igual, con todas sus tareas en «sin equipo»', () => {
    const [proyecto] = equiposParaAdmin(arbolConTareas(2).doc);
    expect(proyecto?.equipos).toEqual([]);
    expect(proyecto?.sinEquipo).toBe(2);
  });
});

describe('responsableFueraDelEquipo', () => {
  it('una tarea sin equipo no señala a nadie: no hay nada contra qué contrastar', () => {
    const doc = aplicar(dosEquipos(), { comando: 'editarTarea', id: 'PM-T1', responsable: 'beto' });
    const proyecto = doc.proyectos[0];
    const tarea = proyecto?.epicas[0]?.historias[0]?.tareas[0];
    if (proyecto === undefined || tarea === undefined) throw new Error('fixture incompleto');
    expect(tarea.equipo_id).toBeNull();
    expect(responsableFueraDelEquipo(proyecto, tarea)).toBe(false);
  });

  it('una tarea con equipo y SIN responsable tampoco: es el caso que asignarEquipo habilita', () => {
    const doc = aplicar(dosEquipos(), { comando: 'asignarEquipo', tareaId: 'PM-T1', equipoId: 'pm-frontend' });
    const proyecto = doc.proyectos[0];
    const tarea = proyecto?.epicas[0]?.historias[0]?.tareas[0];
    if (proyecto === undefined || tarea === undefined) throw new Error('fixture incompleto');
    expect(responsableFueraDelEquipo(proyecto, tarea)).toBe(false);
  });

  it('con el responsable DENTRO del equipo es false', () => {
    const doc = aplicarTodos(dosEquipos(), [
      { comando: 'editarTarea', id: 'PM-T1', responsable: 'ana' },
      { comando: 'asignarEquipo', tareaId: 'PM-T1', equipoId: 'pm-frontend' },
    ]);
    const proyecto = doc.proyectos[0];
    const tarea = proyecto?.epicas[0]?.historias[0]?.tareas[0];
    if (proyecto === undefined || tarea === undefined) throw new Error('fixture incompleto');
    expect(responsableFueraDelEquipo(proyecto, tarea)).toBe(false);
  });

  it('sacar a alguien de su equipo enciende la señal sin tocar la tarea', () => {
    const conTarea = aplicarTodos(dosEquipos(), [
      { comando: 'editarTarea', id: 'PM-T1', responsable: 'ana' },
      { comando: 'asignarEquipo', tareaId: 'PM-T1', equipoId: 'pm-frontend' },
    ]);
    const fuera = aplicar(conTarea, { comando: 'editarEquipo', equipoId: 'pm-frontend', miembros: [] });
    const proyecto = fuera.proyectos[0];
    const tarea = proyecto?.epicas[0]?.historias[0]?.tareas[0];
    if (proyecto === undefined || tarea === undefined) throw new Error('fixture incompleto');
    expect(tarea.responsable).toBe('ana');
    expect(tarea.equipo_id).toBe('pm-frontend');
    expect(responsableFueraDelEquipo(proyecto, tarea)).toBe(true);
  });
});
