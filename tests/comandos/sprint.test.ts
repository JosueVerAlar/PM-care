/**
 * Comandos de sprint: mover, sacar, activar y cerrar.
 *
 * Las dos cosas que este archivo existe para proteger:
 *
 * - **Sacar una tarea del sprint no borra lo que el usuario escribió.** Sacar para
 *   redefinir la historia y volver a meterla es el flujo normal, no un caso raro; si el
 *   item fuera el dueño del responsable o de la fecha, el usuario perdería su trabajo
 *   cada vez que reorganiza.
 * - **Un sprint cerrado no se toca nunca más** (regla 8), ni de frente ni de lado.
 */

import { describe, expect, it } from 'vitest';

import { compromisoEfectivo } from '../../src/compartido/dominio/derivar';
import { reducir } from '../../src/principal/comandos/reductor';
import { unItem, unSprint } from '../apoyo/constructores';
import type { Documento } from '../../src/compartido/modelo/tipos';
import {
  AHORA,
  aplicar,
  aplicarTodos,
  arbolConTareas,
  copiaProfunda,
  exigirError,
  exigirOk,
  reducirSinMutar,
} from '../apoyo/comandos';

/** Árbol con `cuantas` tareas y un sprint `S-1` activo y vacío. */
function conSprint(cuantas: number, estado: 'planeado' | 'activo' = 'activo'): Documento {
  const { doc } = arbolConTareas(cuantas);
  return { ...doc, sprints: [unSprint({ id: 'S-1', estado })] };
}

/** El mismo, con las tareas 1..n ya comprometidas en orden. */
function comprometido(cuantas: number): Documento {
  return aplicarTodos(
    conSprint(cuantas),
    Array.from({ length: cuantas }, (_, i) => ({
      comando: 'moverAlSprint' as const,
      tareaId: `PM-T${i + 1}`,
      sprintId: 'S-1',
    })),
  );
}

const ids = (doc: Documento): (string | undefined)[] =>
  doc.sprints[0]?.items.map((i) => i.tarea_id) ?? [];

// --- moverAlSprint ----------------------------------------------------------

describe('moverAlSprint', () => {
  it('el item nace heredando: responsable, fecha y prioridad en null significan «pregúntale a la tarea»', () => {
    const doc = conSprint(1);
    const { documento } = exigirOk(
      reducirSinMutar(doc, { comando: 'moverAlSprint', tareaId: 'PM-T1', sprintId: 'S-1' }),
    );
    expect(documento.sprints[0]?.items[0]).toEqual({
      tarea_id: 'PM-T1',
      responsable: null,
      fecha_limite: null,
      prioridad: null,
      // El anclaje del reloj: SÍ se sella al entrar, y no hereda de la tarea.
      comprometida_en: AHORA,
      desenlace: null,
    });
  });

  it('sin posición entra al final: el orden del array ES la prioridad', () => {
    expect(ids(comprometido(3))).toEqual(['PM-T1', 'PM-T2', 'PM-T3']);
  });

  it('con posición 0 entra arriba del todo', () => {
    const doc = aplicarTodos(conSprint(3), [
      { comando: 'moverAlSprint', tareaId: 'PM-T1', sprintId: 'S-1' },
      { comando: 'moverAlSprint', tareaId: 'PM-T2', sprintId: 'S-1' },
      { comando: 'moverAlSprint', tareaId: 'PM-T3', sprintId: 'S-1', posicion: 0 },
    ]);
    expect(ids(doc)).toEqual(['PM-T3', 'PM-T1', 'PM-T2']);
  });

  it('una posición fuera de rango se ajusta al extremo en vez de tirar el arrastre', () => {
    const doc = aplicarTodos(conSprint(2), [
      { comando: 'moverAlSprint', tareaId: 'PM-T1', sprintId: 'S-1' },
      { comando: 'moverAlSprint', tareaId: 'PM-T2', sprintId: 'S-1', posicion: 99 },
    ]);
    expect(ids(doc)).toEqual(['PM-T1', 'PM-T2']);
  });

  it('reordena una tarea que ya estaba, sin duplicarla', () => {
    const doc = comprometido(3);
    const { documento } = exigirOk(
      reducirSinMutar(doc, {
        comando: 'moverAlSprint',
        tareaId: 'PM-T3',
        sprintId: 'S-1',
        posicion: 0,
      }),
    );
    expect(ids(documento)).toEqual(['PM-T3', 'PM-T1', 'PM-T2']);
    expect(documento.sprints[0]?.items).toHaveLength(3);
  });

  it('reordenar conserva lo que el item ya tenía escrito, no lo recrea vacío', () => {
    const doc = copiaProfunda(comprometido(2));
    const item = doc.sprints[0]?.items[1];
    if (item === undefined) throw new Error('fixture sin item');
    item.fecha_limite = '2026-09-01';

    const { documento } = exigirOk(
      reducirSinMutar(doc, {
        comando: 'moverAlSprint',
        tareaId: 'PM-T2',
        sprintId: 'S-1',
        posicion: 0,
      }),
    );
    expect(documento.sprints[0]?.items[0]).toMatchObject({
      tarea_id: 'PM-T2',
      fecha_limite: '2026-09-01',
    });
  });

  it('volver a mandarla al mismo sitio se rechaza en vez de duplicar el item', () => {
    const doc = comprometido(2);
    const error = exigirError(
      reducirSinMutar(doc, { comando: 'moverAlSprint', tareaId: 'PM-T1', sprintId: 'S-1' }),
    );
    expect(error.codigo).toBe('invalido');
    expect(error.mensaje).toContain('ya está');
  });

  it('regla 8: mover algo a un sprint CERRADO se rechaza', () => {
    const doc = conSprint(1, 'activo');
    const cerrado = { ...doc, sprints: [unSprint({ id: 'S-1', estado: 'cerrado' })] };
    const error = exigirError(
      reducirSinMutar(cerrado, { comando: 'moverAlSprint', tareaId: 'PM-T1', sprintId: 'S-1' }),
    );
    expect(error.codigo).toBe('sprint-cerrado');
  });

  it('una tarea que no existe da no-encontrado, no un item huérfano', () => {
    expect(
      exigirError(
        reducirSinMutar(conSprint(1), { comando: 'moverAlSprint', tareaId: 'PM-T9', sprintId: 'S-1' }),
      ).codigo,
    ).toBe('no-encontrado');
  });

  it('un sprint que no existe da no-encontrado', () => {
    expect(
      exigirError(
        reducirSinMutar(conSprint(1), { comando: 'moverAlSprint', tareaId: 'PM-T1', sprintId: 'S-9' }),
      ).codigo,
    ).toBe('no-encontrado');
  });

  it('regla 10: solo se arrastran tareas — el payload no admite el id de una historia como tal', () => {
    // El comando solo conoce `tareaId`; mandar el id de una historia se resuelve como
    // «no existe esa tarea», que es exactamente lo que debe pasar.
    expect(
      exigirError(
        reducirSinMutar(conSprint(1), { comando: 'moverAlSprint', tareaId: 'PM-H1', sprintId: 'S-1' }),
      ).codigo,
    ).toBe('no-encontrado');
  });

  it('la misma tarea puede estar en dos sprints ABIERTOS: eso es lo que hace visible el arrastre', () => {
    const base = conSprint(1);
    const dos = {
      ...base,
      sprints: [
        ...base.sprints,
        unSprint({ id: 'S-2', estado: 'planeado', inicio: '2026-09-01', fin: '2026-09-14' }),
      ],
    };
    const doc = aplicarTodos(dos, [
      { comando: 'moverAlSprint', tareaId: 'PM-T1', sprintId: 'S-1' },
      { comando: 'moverAlSprint', tareaId: 'PM-T1', sprintId: 'S-2' },
    ]);
    expect(doc.sprints[0]?.items).toHaveLength(1);
    expect(doc.sprints[1]?.items).toHaveLength(1);
  });
});

// --- sacarDelSprint ---------------------------------------------------------

describe('sacarDelSprint — conserva lo escrito', () => {
  it('quita el item del array: «items» siempre significa lo comprometido, sin filtros', () => {
    const doc = comprometido(2);
    const { documento } = exigirOk(
      reducirSinMutar(doc, { comando: 'sacarDelSprint', tareaId: 'PM-T1', sprintId: 'S-1' }),
    );
    expect(ids(documento)).toEqual(['PM-T2']);
  });

  it('los datos propios quedan intactos y solo se añade la custodia temporal del reloj', () => {
    // Este es el flujo real: se saca del sprint para redefinir la historia y se vuelve a
    // meter. Si sacar borrara el responsable, el usuario lo perdería cada vez.
    const { doc, historiaId } = arbolConTareas(0);
    const conGente = aplicar(doc, { comando: 'crearPersona', nombre: 'Ana' });
    const conTarea = aplicar(conGente, {
      comando: 'crearTarea',
      contenedorId: historiaId,
      titulo: 'Con todo escrito',
      descripcion: 'lo que hay que hacer',
      responsable: 'ana',
      prioridad: 'alta',
      fechaLimite: '2026-09-30',
    });
    const enSprint = aplicar(
      { ...conTarea, sprints: [unSprint({ id: 'S-1', estado: 'activo' })] },
      { comando: 'moverAlSprint', tareaId: 'PM-T1', sprintId: 'S-1' },
    );
    const antes = enSprint.proyectos[0]?.epicas[0]?.historias[0]?.tareas[0];
    const origen = enSprint.sprints[0]?.items[0]?.comprometida_en;

    const { documento } = exigirOk(
      reducirSinMutar(enSprint, { comando: 'sacarDelSprint', tareaId: 'PM-T1', sprintId: 'S-1' }),
    );
    const despues = documento.proyectos[0]?.epicas[0]?.historias[0]?.tareas[0];
    expect(despues).toEqual({ ...antes, comprometida_en: origen });
  });

  it('el compromiso que vivía SOLO en el item se vuelca a la tarea al sacarla', () => {
    // El hueco que dejaba la prueba anterior: ahí el responsable y la fecha estaban en la
    // TAREA, así que quitar el item no los tocaba. Cuando viven solo en el ITEM —porque se
    // fijaron al comprometerla— el `splice` se los llevaba en silencio. Es pérdida de
    // datos en el flujo más frecuente del usuario: sacar para redefinir y volver a meter.
    const { doc, historiaId } = arbolConTareas(0);
    const conGente = aplicar(doc, { comando: 'crearPersona', nombre: 'Ana' });
    const conTarea = aplicar(conGente, {
      comando: 'crearTarea',
      contenedorId: historiaId,
      titulo: 'Sin compromiso propio',
    });
    // La tarea nace sin responsable ni fecha; el compromiso solo existe en el item.
    const enSprint: Documento = {
      ...conTarea,
      sprints: [
        unSprint({
          id: 'S-1',
          estado: 'activo',
          items: [unItem('PM-T1', { responsable: 'ana', fecha_limite: '2026-09-30' })],
        }),
      ],
    };
    const previa = enSprint.proyectos[0]?.epicas[0]?.historias[0]?.tareas[0];
    expect(previa?.responsable).toBeNull();
    expect(previa?.fecha_limite).toBeNull();

    const { documento } = exigirOk(
      reducirSinMutar(enSprint, { comando: 'sacarDelSprint', tareaId: 'PM-T1', sprintId: 'S-1' }),
    );

    const tarea = documento.proyectos[0]?.epicas[0]?.historias[0]?.tareas[0];
    expect(tarea?.responsable).toBe('ana');
    expect(tarea?.fecha_limite).toBe('2026-09-30');
  });

  it('al volcar no pisa un dato propio de la tarea: el suyo manda', () => {
    const { doc, historiaId } = arbolConTareas(0);
    const conGente = aplicarTodos(doc, [
      { comando: 'crearPersona', nombre: 'Ana' },
      { comando: 'crearPersona', nombre: 'Beto' },
    ]);
    const conTarea = aplicar(conGente, {
      comando: 'crearTarea',
      contenedorId: historiaId,
      titulo: 'Con responsable propio',
      responsable: 'ana',
    });
    const enSprint: Documento = {
      ...conTarea,
      sprints: [
        unSprint({
          id: 'S-1',
          estado: 'activo',
          items: [unItem('PM-T1', { responsable: 'beto', fecha_limite: '2026-09-30' })],
        }),
      ],
    };

    const { documento } = exigirOk(
      reducirSinMutar(enSprint, { comando: 'sacarDelSprint', tareaId: 'PM-T1', sprintId: 'S-1' }),
    );

    const tarea = documento.proyectos[0]?.epicas[0]?.historias[0]?.tareas[0];
    expect(tarea?.responsable).toBe('ana');          // el suyo, no el del item
    expect(tarea?.fecha_limite).toBe('2026-09-30');  // este sí lo hereda: no tenía
  });

  it('la PRIORIDAD también se vuelca: el volcado son los tres campos del compromiso, no dos', () => {
    // Hueco de las dos pruebas anteriores: las dos miran responsable y fecha límite, así
    // que quitar la línea de `prioridad` del volcado no ponía roja ninguna. Y la prioridad
    // es la que ordena el backlog del área: perderla al sacar del sprint manda la tarea al
    // fondo de una lista donde el usuario ya no la busca.
    const { doc, historiaId } = arbolConTareas(0);
    const conTarea = aplicar(doc, { comando: 'crearTarea', contenedorId: historiaId, titulo: 'Sin prioridad propia' });
    const enSprint: Documento = {
      ...conTarea,
      sprints: [
        unSprint({ id: 'S-1', estado: 'activo', items: [unItem('PM-T1', { prioridad: 'alta' })] }),
      ],
    };
    const { documento } = exigirOk(
      reducirSinMutar(enSprint, { comando: 'sacarDelSprint', tareaId: 'PM-T1', sprintId: 'S-1' }),
    );
    expect(documento.proyectos[0]?.epicas[0]?.historias[0]?.tareas[0]?.prioridad).toBe('alta');
  });

  it('tras el volcado, la ida y vuelta conserva el COMPROMISO, aunque el documento cambie', () => {
    // La prueba de ida y vuelta que ya existe usa tareas sin nada escrito, así que el
    // volcado no entra en juego y el documento vuelve idéntico. Cuando el compromiso vivía
    // solo en el item, el viaje lo MUEVE de sitio: el item vuelve en null —«hereda de la
    // tarea»— y el dato ahora vive en la tarea. Lo que tiene que sobrevivir es el valor
    // efectivo, no la forma; congelarlo aquí evita que alguien «arregle» el documento
    // haciendo que el item se recree con lo de antes y duplicando la fuente de verdad.
    const { doc, historiaId } = arbolConTareas(0);
    const conGente = aplicar(doc, { comando: 'crearPersona', nombre: 'Ana' });
    const conTarea = aplicar(conGente, { comando: 'crearTarea', contenedorId: historiaId, titulo: 'T' });
    const enSprint: Documento = {
      ...conTarea,
      sprints: [
        unSprint({
          id: 'S-1',
          estado: 'activo',
          items: [unItem('PM-T1', { responsable: 'ana', fecha_limite: '2026-09-30', prioridad: 'alta' })],
        }),
      ],
    };
    const antes = compromisoEfectivo(
      enSprint.sprints[0]!.items[0]!,
      enSprint.proyectos[0]?.epicas[0]?.historias[0]?.tareas[0],
    );

    const ida = aplicar(enSprint, { comando: 'sacarDelSprint', tareaId: 'PM-T1', sprintId: 'S-1' });
    const vuelta = aplicar(ida, { comando: 'moverAlSprint', tareaId: 'PM-T1', sprintId: 'S-1' });

    const item = vuelta.sprints[0]?.items[0];
    const tarea = vuelta.proyectos[0]?.epicas[0]?.historias[0]?.tareas[0];
    expect(compromisoEfectivo(item!, tarea)).toEqual(antes);
    // El item vuelve heredando: el dato ya no vive por duplicado.
    expect(item).toMatchObject({ responsable: null, fecha_limite: null, prioridad: null });
  });

  it('sacar y volver a meter conserva comprometida_en: el reloj no vuelve a empezar', () => {
    const origen = '2026-08-25T09:30:00-06:00';
    const doc = copiaProfunda(comprometido(1));
    const itemInicial = doc.sprints[0]?.items[0];
    if (itemInicial === undefined) throw new Error('fixture sin item');
    itemInicial.comprometida_en = origen;

    const fuera = aplicar(doc, { comando: 'sacarDelSprint', tareaId: 'PM-T1', sprintId: 'S-1' });
    const tareaFuera = fuera.proyectos[0]?.epicas[0]?.historias[0]?.tareas[0];
    expect(tareaFuera?.comprometida_en).toBe(origen);

    const deVuelta = aplicar(fuera, { comando: 'moverAlSprint', tareaId: 'PM-T1', sprintId: 'S-1' });
    expect(deVuelta.sprints[0]?.items[0]?.comprometida_en).toBe(origen);
    expect(deVuelta.proyectos[0]?.epicas[0]?.historias[0]?.tareas[0]?.comprometida_en).toBeNull();
  });

  it('tampoco toca el estado ni el historial de bloqueos', () => {
    const doc = comprometido(1);
    const trabajada = aplicarTodos(doc, [
      { comando: 'cambiarEstado', id: 'PM-T1', estado: 'en_curso' },
      { comando: 'bloquear', tareaId: 'PM-T1', tipo: 'externo', motivo: 'proveedor' },
    ]);
    const { documento } = exigirOk(
      reducirSinMutar(trabajada, { comando: 'sacarDelSprint', tareaId: 'PM-T1', sprintId: 'S-1' }),
    );
    const tarea = documento.proyectos[0]?.epicas[0]?.historias[0]?.tareas[0];
    expect(tarea?.estado).toBe('en_curso');
    expect(tarea?.bloqueos).toHaveLength(1);
  });

  it('sacar y volver a meter deja el documento como estaba, salvo el orden que el usuario decidió', () => {
    const doc = comprometido(2);
    const ida = aplicar(doc, { comando: 'sacarDelSprint', tareaId: 'PM-T1', sprintId: 'S-1' });
    const vuelta = aplicar(ida, {
      comando: 'moverAlSprint',
      tareaId: 'PM-T1',
      sprintId: 'S-1',
      posicion: 0,
    });
    expect(vuelta).toEqual(copiaProfunda(doc));
  });

  it('no toca a las demás tareas del sprint', () => {
    const doc = comprometido(3);
    const { documento } = exigirOk(
      reducirSinMutar(doc, { comando: 'sacarDelSprint', tareaId: 'PM-T2', sprintId: 'S-1' }),
    );
    expect(ids(documento)).toEqual(['PM-T1', 'PM-T3']);
  });

  it('sacar algo que no está en ese sprint se rechaza', () => {
    const doc = comprometido(1);
    const otra = aplicar(doc, { comando: 'crearTarea', contenedorId: 'PM-H1', titulo: 'Fuera' });
    expect(
      exigirError(
        reducirSinMutar(otra, { comando: 'sacarDelSprint', tareaId: 'PM-T2', sprintId: 'S-1' }),
      ).codigo,
    ).toBe('invalido');
  });

  it('regla 8: sacar algo de un sprint CERRADO se rechaza', () => {
    const { doc } = arbolConTareas(1);
    const cerrado = {
      ...doc,
      sprints: [
        unSprint({
          id: 'S-junio',
          estado: 'cerrado',
          inicio: '2026-06-01',
          fin: '2026-06-14',
          items: [unItem('PM-T1', { desenlace: 'completada' })],
        }),
      ],
    };
    expect(
      exigirError(
        reducirSinMutar(cerrado, { comando: 'sacarDelSprint', tareaId: 'PM-T1', sprintId: 'S-junio' }),
      ).codigo,
    ).toBe('sprint-cerrado');
  });
});

// --- activarSprint ----------------------------------------------------------

describe('activarSprint', () => {
  it('un planeado pasa a activo', () => {
    const doc = conSprint(0, 'planeado');
    const { documento } = exigirOk(
      reducirSinMutar(doc, { comando: 'activarSprint', sprintId: 'S-1' }),
    );
    expect(documento.sprints[0]?.estado).toBe('activo');
  });

  it('solo puede haber uno activo, y el otro NO se cierra por nuestra cuenta: cerrar es irreversible', () => {
    const base = conSprint(0, 'activo');
    const dos = {
      ...base,
      sprints: [
        ...base.sprints,
        unSprint({ id: 'S-2', estado: 'planeado', inicio: '2026-09-01', fin: '2026-09-14' }),
      ],
    };
    const error = exigirError(reducirSinMutar(dos, { comando: 'activarSprint', sprintId: 'S-2' }));
    expect(error.codigo).toBe('invalido');
    expect(error.mensaje).toContain('S-1');
    expect(dos.sprints[0]?.estado).toBe('activo');
  });

  it('activar el que ya está activo se rechaza', () => {
    expect(
      exigirError(reducirSinMutar(conSprint(0), { comando: 'activarSprint', sprintId: 'S-1' }))
        .codigo,
    ).toBe('invalido');
  });

  it('regla 8: un sprint cerrado no se reactiva', () => {
    const { doc } = arbolConTareas(0);
    const cerrado = { ...doc, sprints: [unSprint({ id: 'S-1', estado: 'cerrado' })] };
    expect(
      exigirError(reducirSinMutar(cerrado, { comando: 'activarSprint', sprintId: 'S-1' })).codigo,
    ).toBe('sprint-cerrado');
  });
});

// --- cerrarSprint -----------------------------------------------------------

describe('cerrarSprint — el desenlace sale del estado de cada tarea', () => {
  /** Sprint con cuatro tareas, una por estado, comprometidas en orden. */
  function conLosCuatroEstados(): Documento {
    return aplicarTodos(comprometido(4), [
      { comando: 'cambiarEstado', id: 'PM-T1', estado: 'hecha' },
      { comando: 'cambiarEstado', id: 'PM-T2', estado: 'en_curso' },
      { comando: 'cambiarEstado', id: 'PM-T3', estado: 'cancelada' },
    ]);
  }

  it('lo terminado queda registrado como completada', () => {
    const { documento } = exigirOk(
      reducirSinMutar(conLosCuatroEstados(), { comando: 'cerrarSprint', sprintId: 'S-1' }),
    );
    expect(documento.sprints[0]?.items[0]).toMatchObject({
      tarea_id: 'PM-T1',
      desenlace: 'completada',
    });
  });

  it('lo que quedó en curso o pendiente se arrastra por omisión, sin inventarle otro desenlace', () => {
    // Antes esto era `no_terminada` para las dos. Con la ceremonia de cierre el destino
    // por omisión es `siguiente`, así que el desenlace de lo no terminado que nadie
    // decide es `arrastrada`. Lo que NO cambia y es lo que esta prueba cuida: el
    // desenlace de lo terminado y lo cancelado sigue saliendo del estado de la tarea, no
    // de ninguna decisión.
    const { documento } = exigirOk(
      reducirSinMutar(conLosCuatroEstados(), { comando: 'cerrarSprint', sprintId: 'S-1' }),
    );
    expect(documento.sprints[0]?.items.map((i) => i.desenlace)).toEqual([
      'completada',
      'arrastrada',
      'cancelada',
      'arrastrada',
    ]);
  });

  it('el resumen cuenta las casillas', () => {
    const { evento } = exigirOk(
      reducirSinMutar(conLosCuatroEstados(), { comando: 'cerrarSprint', sprintId: 'S-1' }),
    );
    expect(evento.detalle).toMatchObject({
      completada: 1,
      arrastrada: 2,
      cancelada: 1,
      items: 4,
    });
  });

  it('cerrar NO cambia el estado de ninguna tarea: el desenlace es del item, no de la tarea', () => {
    const doc = conLosCuatroEstados();
    const antes = copiaProfunda(doc.proyectos);
    const { documento } = exigirOk(reducirSinMutar(doc, { comando: 'cerrarSprint', sprintId: 'S-1' }));
    expect(documento.proyectos).toEqual(antes);
  });

  it('un sprint vacío se cierra sin problema: comprometer nada también es un dato', () => {
    const { documento } = exigirOk(
      reducirSinMutar(conSprint(0), { comando: 'cerrarSprint', sprintId: 'S-1' }),
    );
    expect(documento.sprints[0]?.estado).toBe('cerrado');
    expect(documento.sprints[0]?.items).toEqual([]);
  });
});

describe('cerrarSprint — materializa lo heredado antes de congelar', () => {
  it('el responsable heredado se copia al item: reasignar mañana no reescribirá lo comprometido', () => {
    const { doc, historiaId } = arbolConTareas(0);
    const preparado = aplicarTodos(doc, [
      { comando: 'crearPersona', nombre: 'Ana' },
      { comando: 'crearPersona', nombre: 'Beto' },
      { comando: 'crearTarea', contenedorId: historiaId, titulo: 'T', responsable: 'ana', prioridad: 'alta', fechaLimite: '2026-09-30' },
    ]);
    const enSprint = aplicar(
      { ...preparado, sprints: [unSprint({ id: 'S-1', estado: 'activo' })] },
      { comando: 'moverAlSprint', tareaId: 'PM-T1', sprintId: 'S-1' },
    );
    expect(enSprint.sprints[0]?.items[0]?.responsable).toBeNull();

    const cerrado = aplicar(enSprint, { comando: 'cerrarSprint', sprintId: 'S-1' });
    expect(cerrado.sprints[0]?.items[0]).toMatchObject({
      responsable: 'ana',
      prioridad: 'alta',
      fecha_limite: '2026-09-30',
    });

    const reasignada = aplicar(cerrado, {
      comando: 'editarTarea',
      id: 'PM-T1',
      responsable: 'beto',
    });
    expect(reasignada.sprints[0]?.items[0]?.responsable).toBe('ana');
  });

  it('lo que el item ya tenía escrito gana sobre lo de la tarea: el compromiso fue ese', () => {
    const { doc, historiaId } = arbolConTareas(0);
    const preparado = aplicarTodos(doc, [
      { comando: 'crearPersona', nombre: 'Ana' },
      { comando: 'crearPersona', nombre: 'Beto' },
      { comando: 'crearTarea', contenedorId: historiaId, titulo: 'T', responsable: 'ana' },
    ]);
    const enSprint = copiaProfunda(
      aplicar(
        { ...preparado, sprints: [unSprint({ id: 'S-1', estado: 'activo' })] },
        { comando: 'moverAlSprint', tareaId: 'PM-T1', sprintId: 'S-1' },
      ),
    );
    const item = enSprint.sprints[0]?.items[0];
    if (item === undefined) throw new Error('fixture sin item');
    item.responsable = 'beto';

    const { documento } = exigirOk(
      reducirSinMutar(enSprint, { comando: 'cerrarSprint', sprintId: 'S-1' }),
    );
    expect(documento.sprints[0]?.items[0]?.responsable).toBe('beto');
  });

  it('sin nada que heredar el item se queda en null, no se inventa un responsable', () => {
    const { documento } = exigirOk(
      reducirSinMutar(comprometido(1), { comando: 'cerrarSprint', sprintId: 'S-1' }),
    );
    expect(documento.sprints[0]?.items[0]?.responsable).toBeNull();
  });
});

describe('cerrarSprint — después queda inmutable (regla 8)', () => {
  /**
   * Un sprint recién cerrado con dos tareas dentro.
   *
   * Las dos se cierran con destino `backlog` a propósito: este bloque prueba la
   * inmutabilidad del sprint cerrado, y con el destino por omisión (`siguiente`) el
   * cierre crearía además el sprint siguiente y metería ahí las dos tareas, que es ruido
   * para lo que aquí se comprueba. El destino de cada tarea lo cubre el bloque de la
   * ceremonia de cierre.
   */
  function yaCerrado(): Documento {
    return aplicar(comprometido(2), {
      comando: 'cerrarSprint',
      sprintId: 'S-1',
      decisiones: [
        { tareaId: 'PM-T1', destino: 'backlog' },
        { tareaId: 'PM-T2', destino: 'backlog' },
      ],
    });
  }

  it('cerrarlo otra vez se rechaza: el segundo cierre recalcularía los desenlaces', () => {
    const doc = yaCerrado();
    expect(
      exigirError(reducirSinMutar(doc, { comando: 'cerrarSprint', sprintId: 'S-1' })).codigo,
    ).toBe('sprint-cerrado');
  });

  it('un desenlace ya fijado no cambia aunque la tarea cambie de estado después', () => {
    const doc = yaCerrado();
    expect(doc.sprints[0]?.items[0]?.desenlace).toBe('devuelta');
    const terminada = aplicar(doc, { comando: 'cambiarEstado', id: 'PM-T1', estado: 'hecha' });
    expect(terminada.sprints[0]?.items[0]?.desenlace).toBe('devuelta');
  });

  it('ningún comando de sprint lo toca: mover, sacar y activar se rechazan los tres', () => {
    const doc = yaCerrado();
    for (const comando of [
      { comando: 'moverAlSprint', tareaId: 'PM-T1', sprintId: 'S-1' },
      { comando: 'sacarDelSprint', tareaId: 'PM-T1', sprintId: 'S-1' },
      { comando: 'activarSprint', sprintId: 'S-1' },
      { comando: 'cerrarSprint', sprintId: 'S-1' },
    ] as const) {
      expect(exigirError(reducirSinMutar(doc, comando)).codigo, comando.comando).toBe(
        'sprint-cerrado',
      );
    }
  });

  it('tampoco lo tocan de lado: borrar la tarea, su historia, su épica o su proyecto se rechazan', () => {
    const doc = yaCerrado();
    for (const comando of [
      { comando: 'eliminarTarea', id: 'PM-T1' },
      { comando: 'eliminarHistoria', id: 'PM-H1' },
      { comando: 'eliminarEpica', id: 'PM-E1' },
      { comando: 'eliminarProyecto', clave: 'PM', confirmacion: 'PM' },
    ] as const) {
      expect(exigirError(reducirSinMutar(doc, comando)).codigo, comando.comando).toBe(
        'sprint-cerrado',
      );
    }
  });

  it('editar la tarea sí se permite y no toca el item ya congelado', () => {
    const doc = yaCerrado();
    const antes = copiaProfunda(doc.sprints);
    const { documento } = exigirOk(
      reducirSinMutar(doc, { comando: 'editarTarea', id: 'PM-T1', titulo: 'Otro título' }),
    );
    expect(documento.sprints).toEqual(antes);
  });

  it('una tarea no terminada se arrastra a un sprint nuevo sin tocar el cerrado', () => {
    const doc = yaCerrado();
    const conNuevo = {
      ...doc,
      sprints: [
        ...doc.sprints,
        unSprint({ id: 'S-2', estado: 'planeado', inicio: '2026-09-01', fin: '2026-09-14' }),
      ],
    };
    const antes = copiaProfunda(conNuevo.sprints[0]);
    const { documento } = exigirOk(
      reducirSinMutar(conNuevo, { comando: 'moverAlSprint', tareaId: 'PM-T1', sprintId: 'S-2' }),
    );
    expect(documento.sprints[0]).toEqual(antes);
    expect(documento.sprints[1]?.items.map((i) => i.tarea_id)).toEqual(['PM-T1']);
  });

  it('un sprint que no existe da no-encontrado', () => {
    expect(
      exigirError(reducirSinMutar(conSprint(0), { comando: 'cerrarSprint', sprintId: 'S-9' }))
        .codigo,
    ).toBe('no-encontrado');
  });

  it('cerrar un sprint PLANEADO se permite: se puede dar por terminado lo que nunca se activó', () => {
    // Documenta el comportamiento vigente, que no es obvio: el reductor solo rechaza el
    // estado `cerrado`. Si algún día se decide exigir que pase por `activo`, esta prueba
    // es la que avisa de que el contrato cambió.
    const { documento } = exigirOk(
      reducirSinMutar(conSprint(0, 'planeado'), { comando: 'cerrarSprint', sprintId: 'S-1' }),
    );
    expect(documento.sprints[0]?.estado).toBe('cerrado');
  });

  it('cerrar sin nada que arrastrar no toca a los otros sprints', () => {
    // El cierre solo escribe en otro sprint cuando de verdad arrastra algo hacia él, y
    // eso es lo único que puede tocarlo. Aquí la única tarea vuelve al backlog, así que
    // el sprint planeado tiene que quedar byte por byte como estaba.
    const base = comprometido(1);
    const dos = {
      ...base,
      sprints: [
        ...base.sprints,
        unSprint({ id: 'S-2', estado: 'planeado', inicio: '2026-09-01', fin: '2026-09-14' }),
      ],
    };
    const { documento } = exigirOk(
      reducirSinMutar(dos, {
        comando: 'cerrarSprint',
        sprintId: 'S-1',
        decisiones: [{ tareaId: 'PM-T1', destino: 'backlog' }],
      }),
    );
    expect(documento.sprints[1]).toEqual(dos.sprints[1]);
  });
});
