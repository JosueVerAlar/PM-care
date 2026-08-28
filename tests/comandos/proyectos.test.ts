/**
 * Comandos de proyecto: alta, edición, cierre, reapertura y eliminación.
 *
 * Las dos reglas que este archivo defiende y que no viven en ninguna pantalla:
 *
 * - Un proyecto con rastro en un sprint CERRADO no se elimina (regla 8). Borrarlo
 *   cambiaría lo que ese sprint dice que pasó sin que nadie lo hubiera tocado.
 * - Cerrar CONSERVA todo: ni una tarea, ni un item de sprint, ni un contador.
 *
 * Cada `it` protege una de ellas o una de sus fronteras. Si el nombre en rojo no basta
 * para saber qué se rompió, el nombre está mal escrito.
 */

import { describe, expect, it } from 'vitest';

import { reducir } from '../../src/principal/comandos/reductor';
import { validarComando } from '../../src/principal/comandos/tipos';
import {
  unDocumento,
  unItem,
  unProyecto,
  unSprint,
  unaEpica,
  unaHistoria,
  unaTarea,
} from '../apoyo/constructores';
import {
  AHORA,
  HOY,
  aplicar,
  arbolConTareas,
  copiaProfunda,
  exigirError,
  exigirOk,
  reducirSinMutar,
} from '../apoyo/comandos';

// --- crearProyecto ----------------------------------------------------------

describe('crearProyecto', () => {
  it('nace vivo, sin archivar y con los contadores en cero', () => {
    const { documento } = exigirOk(
      reducir(unDocumento(), { comando: 'crearProyecto', clave: 'SICOE', nombre: 'SICOE' }, AHORA),
    );
    const proyecto = documento.proyectos[0];
    expect(proyecto).toMatchObject({
      clave: 'SICOE',
      nombre: 'SICOE',
      archivado: false,
      cerrado_en: null,
      planeacion_cerrada_en: null,
      contadores: { epicas: 0, historias: 0, tareas: 0, sprints: 0 },
      equipos: [],
      epicas: [],
    });
  });

  it('rechaza una clave repetida: dos proyectos iguales harían que SICOE-T14 fuera dos tareas', () => {
    const doc = aplicar(unDocumento(), { comando: 'crearProyecto', clave: 'SICOE', nombre: 'Uno' });
    const error = exigirError(
      reducirSinMutar(doc, { comando: 'crearProyecto', clave: 'SICOE', nombre: 'Otro' }),
    );
    expect(error.codigo).toBe('invalido');
    expect(error.mensaje).toContain('SICOE');
  });

  it('el payload rechaza una clave en minúsculas: la clave es el prefijo de ids que se buscan a mano', () => {
    expect(validarComando({ comando: 'crearProyecto', clave: 'sicoe', nombre: 'X' }).ok).toBe(false);
  });
});

// --- editarProyecto ---------------------------------------------------------

describe('editarProyecto', () => {
  it('regla 15: no existe campo para cambiar la clave, así que mandarlo se RECHAZA', () => {
    // La protección no es "se ignora": es que el payload no valida. Con `.strict()` un
    // renderer que intentara renombrar la clave recibe un error, no un cambio silencioso.
    const resultado = validarComando({
      comando: 'editarProyecto',
      clave: 'SICOE',
      claveNueva: 'SICOE2',
    });
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) {
      // Zod señala la clave desconocida en el mensaje, no en la ruta: la ruta es la raíz
      // del objeto porque el campo no pertenece al esquema y no tiene sitio propio.
      expect(resultado.problemas.map((p) => p.mensaje).join(' ')).toContain('claveNueva');
    }
  });

  it('regla 15: tampoco cuela un segundo campo "clave" con otro nombre de estilo del documento', () => {
    expect(
      validarComando({ comando: 'editarProyecto', clave: 'SICOE', nombre: 'X', clave_nueva: 'Y' }).ok,
    ).toBe(false);
  });

  it('cambia el nombre sin tocar la clave ni el árbol', () => {
    const { doc, clave } = arbolConTareas(2);
    const { documento } = exigirOk(
      reducirSinMutar(doc, { comando: 'editarProyecto', clave, nombre: 'Nombre nuevo' }),
    );
    expect(documento.proyectos[0]?.nombre).toBe('Nombre nuevo');
    expect(documento.proyectos[0]?.clave).toBe(clave);
    expect(documento.proyectos[0]?.epicas).toEqual(doc.proyectos[0]?.epicas);
  });

  it('campo ausente = no tocar: editar solo el nombre deja la descripción como estaba', () => {
    const doc = aplicar(unDocumento(), {
      comando: 'crearProyecto',
      clave: 'PM',
      nombre: 'Uno',
      descripcion: 'la de siempre',
    });
    const { documento } = exigirOk(
      reducirSinMutar(doc, { comando: 'editarProyecto', clave: 'PM', nombre: 'Dos' }),
    );
    expect(documento.proyectos[0]?.descripcion).toBe('la de siempre');
  });

  it('campo en null = borrar: la descripción se puede vaciar sin mandar los demás campos', () => {
    const doc = aplicar(unDocumento(), {
      comando: 'crearProyecto',
      clave: 'PM',
      nombre: 'Uno',
      descripcion: 'sobra',
    });
    const { documento } = exigirOk(
      reducirSinMutar(doc, { comando: 'editarProyecto', clave: 'PM', descripcion: null }),
    );
    expect(documento.proyectos[0]?.descripcion).toBeNull();
    expect(documento.proyectos[0]?.nombre).toBe('Uno');
  });

  it('un comando sin ningún campo que cambiar se rechaza en vez de generar un evento vacío', () => {
    const { doc, clave } = arbolConTareas(1);
    const error = exigirError(reducirSinMutar(doc, { comando: 'editarProyecto', clave }));
    expect(error.codigo).toBe('invalido');
  });

  it('sobre un proyecto que no existe da no-encontrado', () => {
    const error = exigirError(
      reducirSinMutar(unDocumento(), { comando: 'editarProyecto', clave: 'NADA', nombre: 'X' }),
    );
    expect(error.codigo).toBe('no-encontrado');
  });
});

// --- cerrarProyecto ---------------------------------------------------------

describe('cerrarProyecto', () => {
  it('marca la fecha y archiva, y NADA más: el resto del documento queda idéntico', () => {
    // Se compara el documento ENTERO, no solo el proyecto: la tentación al cerrar es dar
    // por canceladas las tareas que quedaron abiertas, y eso es inventarse un desenlace.
    const tareaHecha = unaTarea({ clave: 'PM', estado: 'done', responsable: 'ana' });
    const tareaAbierta = unaTarea({ clave: 'PM', estado: 'iniciado', responsable: 'ana' });
    const proyecto = unProyecto({
      clave: 'PM',
      epicas: [
        unaEpica({
          clave: 'PM',
          historias: [unaHistoria({ clave: 'PM', tareas: [tareaHecha, tareaAbierta] })],
        }),
      ],
      equipo: [{ persona_id: 'ana', responsabilidades: ['todo'], capacidad: null }],
    });
    const doc = unDocumento({
      personas: [{ id: 'ana', nombre: 'Ana', activa: true, clave_externa: null }],
      proyectos: [proyecto],
      sprints: [
        unSprint({ id: 'S-abierto', estado: 'activo', items: [unItem(tareaAbierta.id)] }),
        unSprint({
          id: 'S-cerrado',
          estado: 'cerrado',
          inicio: '2026-07-01',
          fin: '2026-07-14',
          items: [unItem(tareaHecha.id, { desenlace: 'completada', responsable: 'ana' })],
        }),
      ],
    });

    const esperado = copiaProfunda(doc);
    const proyectoEsperado = esperado.proyectos[0];
    if (proyectoEsperado === undefined) throw new Error('fixture sin proyecto');
    proyectoEsperado.cerrado_en = HOY;
    proyectoEsperado.archivado = true;

    const { documento } = exigirOk(reducirSinMutar(doc, { comando: 'cerrarProyecto', clave: 'PM' }));
    expect(documento).toEqual(esperado);
  });

  it('cerrar no cambia ni un estado de tarea: el dato honesto es «cerró con 1 sin terminar»', () => {
    const { doc, clave, historiaId } = arbolConTareas(0);
    const conTareas = aplicar(doc, { comando: 'crearTarea', contenedorId: historiaId, titulo: 'Sin terminar' });
    const { documento, evento } = exigirOk(
      reducirSinMutar(conTareas, { comando: 'cerrarProyecto', clave }),
    );
    const tarea = documento.proyectos[0]?.epicas[0]?.historias[0]?.tareas[0];
    expect(tarea?.estado).toBe('pendiente');
    expect(evento.detalle).toMatchObject({ tareas_abiertas: 1 });
  });

  it('cerrar no saca las tareas del sprint abierto: eso lo decide el usuario a mano', () => {
    const { doc, clave, historiaId } = arbolConTareas(0);
    const conTarea = aplicar(doc, { comando: 'crearTarea', contenedorId: historiaId, titulo: 'T' });
    const conSprint = aplicar(
      { ...conTarea, sprints: [unSprint({ id: 'S-1', estado: 'activo' })] },
      { comando: 'moverAlSprint', tareaId: `${clave}-T1`, sprintId: 'S-1' },
    );
    const { documento } = exigirOk(reducirSinMutar(conSprint, { comando: 'cerrarProyecto', clave }));
    expect(documento.sprints[0]?.items.map((i) => i.tarea_id)).toEqual([`${clave}-T1`]);
  });

  it('la fecha de cierre es el día del instante recibido, no el reloj de la máquina', () => {
    const { doc, clave } = arbolConTareas(0);
    const { documento } = exigirOk(
      reducir(doc, { comando: 'cerrarProyecto', clave }, '2019-01-02T23:59:59-06:00'),
    );
    expect(documento.proyectos[0]?.cerrado_en).toBe('2019-01-02');
  });

  it('cerrar dos veces se rechaza: el segundo cierre reescribiría la fecha del primero', () => {
    const { doc, clave } = arbolConTareas(0);
    const cerrado = aplicar(doc, { comando: 'cerrarProyecto', clave });
    const error = exigirError(reducirSinMutar(cerrado, { comando: 'cerrarProyecto', clave }));
    expect(error.codigo).toBe('invalido');
    expect(error.mensaje).toContain(HOY);
  });
});

// --- reabrirProyecto --------------------------------------------------------

describe('reabrirProyecto', () => {
  it('deshace el cierre: quita la fecha y desarchiva', () => {
    const { doc, clave } = arbolConTareas(1);
    const cerrado = aplicar(doc, { comando: 'cerrarProyecto', clave });
    const { documento } = exigirOk(reducirSinMutar(cerrado, { comando: 'reabrirProyecto', clave }));
    expect(documento.proyectos[0]).toMatchObject({ cerrado_en: null, archivado: false });
  });

  it('cerrar y reabrir devuelve el documento exactamente a como estaba', () => {
    const { doc, clave } = arbolConTareas(3);
    const ida = aplicar(doc, { comando: 'cerrarProyecto', clave });
    const vuelta = aplicar(ida, { comando: 'reabrirProyecto', clave });
    expect(vuelta).toEqual(copiaProfunda(doc));
  });

  it('un proyecto solo archivado (sin cerrar) también se reabre: archivar no es cerrar', () => {
    const { doc, clave } = arbolConTareas(0);
    const archivado = copiaProfunda(doc);
    const proyecto = archivado.proyectos[0];
    if (proyecto === undefined) throw new Error('fixture sin proyecto');
    proyecto.archivado = true;
    const { documento } = exigirOk(
      reducirSinMutar(archivado, { comando: 'reabrirProyecto', clave }),
    );
    expect(documento.proyectos[0]?.archivado).toBe(false);
  });

  it('reabrir lo que nunca se cerró se rechaza', () => {
    const { doc, clave } = arbolConTareas(0);
    expect(exigirError(reducirSinMutar(doc, { comando: 'reabrirProyecto', clave })).codigo).toBe(
      'invalido',
    );
  });
});

// --- eliminarProyecto -------------------------------------------------------

describe('eliminarProyecto — confirmación', () => {
  it('sin la clave repetida en "confirmacion" no borra nada', () => {
    const { doc, clave } = arbolConTareas(2);
    const error = exigirError(
      reducirSinMutar(doc, { comando: 'eliminarProyecto', clave, confirmacion: 'otra' }),
    );
    expect(error.codigo).toBe('invalido');
    expect(error.mensaje).toContain('confirmacion');
  });

  it('la confirmación distingue mayúsculas: "pm" no confirma "PM"', () => {
    const { doc } = arbolConTareas(1, 'PM');
    expect(
      exigirError(
        reducirSinMutar(doc, { comando: 'eliminarProyecto', clave: 'PM', confirmacion: 'pm' }),
      ).codigo,
    ).toBe('invalido');
  });

  it('la confirmación se comprueba ANTES de buscar el proyecto: una clave que no existe tampoco pasa', () => {
    const error = exigirError(
      reducirSinMutar(unDocumento(), {
        comando: 'eliminarProyecto',
        clave: 'NADA',
        confirmacion: 'X',
      }),
    );
    expect(error.codigo).toBe('invalido');
  });

  it('con la confirmación correcta se lleva el proyecto entero', () => {
    const { doc, clave } = arbolConTareas(3);
    const { documento, evento } = exigirOk(
      reducirSinMutar(doc, { comando: 'eliminarProyecto', clave, confirmacion: clave }),
    );
    expect(documento.proyectos).toEqual([]);
    expect(evento.resumen).toContain('3 tareas');
  });

  it('borrar un proyecto no toca a los demás', () => {
    const uno = arbolConTareas(2, 'UNO');
    const dos = arbolConTareas(2, 'DOS');
    const dosProyectos = { ...uno.doc, proyectos: [...uno.doc.proyectos, ...dos.doc.proyectos] };
    const { documento } = exigirOk(
      reducirSinMutar(dosProyectos, {
        comando: 'eliminarProyecto',
        clave: 'UNO',
        confirmacion: 'UNO',
      }),
    );
    expect(documento.proyectos.map((p) => p.clave)).toEqual(['DOS']);
    expect(documento.proyectos[0]?.epicas[0]?.historias[0]?.tareas).toHaveLength(2);
  });

  it('sus tareas salen de los sprints ABIERTOS, que sí son del presente', () => {
    const { doc, clave } = arbolConTareas(2);
    const conSprint = { ...doc, sprints: [unSprint({ id: 'S-1', estado: 'activo' })] };
    const comprometido = aplicar(conSprint, {
      comando: 'moverAlSprint',
      tareaId: `${clave}-T1`,
      sprintId: 'S-1',
    });
    const { documento } = exigirOk(
      reducirSinMutar(comprometido, { comando: 'eliminarProyecto', clave, confirmacion: clave }),
    );
    expect(documento.sprints[0]?.items).toEqual([]);
    expect(documento.sprints[0]?.estado).toBe('activo');
  });
});

describe('eliminarProyecto — regla 8: no se reescribe lo que un sprint cerrado dice que pasó', () => {
  /** Proyecto con dos tareas, una de ellas comprometida en un sprint ya cerrado. */
  function conHistoriaCerrada(): { doc: ReturnType<typeof unDocumento>; clave: string } {
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
    return { doc: conSprint, clave };
  }

  it('se RECHAZA eliminar un proyecto cuyas tareas están en un sprint cerrado', () => {
    const { doc, clave } = conHistoriaCerrada();
    const error = exigirError(
      reducirSinMutar(doc, { comando: 'eliminarProyecto', clave, confirmacion: clave }),
    );
    expect(error.codigo).toBe('sprint-cerrado');
  });

  it('el rechazo nombra el sprint y las tareas: sin eso el usuario no sabe qué lo bloquea', () => {
    const { doc, clave } = conHistoriaCerrada();
    const error = exigirError(
      reducirSinMutar(doc, { comando: 'eliminarProyecto', clave, confirmacion: clave }),
    );
    expect(error.mensaje).toContain('S-junio');
    expect(error.mensaje).toContain(`${clave}-T1`);
  });

  it('el rechazo remite a cerrarProyecto, que es la salida real del usuario', () => {
    const { doc, clave } = conHistoriaCerrada();
    const error = exigirError(
      reducirSinMutar(doc, { comando: 'eliminarProyecto', clave, confirmacion: clave }),
    );
    expect(error.mensaje).toContain('cerrarProyecto');
  });

  it('tras el rechazo el sprint cerrado sigue diciendo lo mismo: «12 de 20» no pasa a «12 de 14»', () => {
    const { doc, clave } = conHistoriaCerrada();
    const antes = copiaProfunda(doc.sprints);
    exigirError(reducirSinMutar(doc, { comando: 'eliminarProyecto', clave, confirmacion: clave }));
    expect(doc.sprints).toEqual(antes);
    expect(doc.proyectos).toHaveLength(1);
  });

  it('basta UNA tarea del proyecto en el sprint cerrado para bloquear el borrado entero', () => {
    const { doc, clave } = arbolConTareas(20);
    const conSprint = {
      ...doc,
      sprints: [
        unSprint({
          id: 'S-junio',
          estado: 'cerrado',
          inicio: '2026-06-01',
          fin: '2026-06-14',
          items: [unItem(`${clave}-T7`, { desenlace: 'no_terminada' })],
        }),
      ],
    };
    expect(
      exigirError(
        reducirSinMutar(conSprint, { comando: 'eliminarProyecto', clave, confirmacion: clave }),
      ).codigo,
    ).toBe('sprint-cerrado');
  });

  it('un sprint cerrado que solo compromete tareas de OTRO proyecto no bloquea nada', () => {
    const victima = arbolConTareas(1, 'UNO');
    const ajeno = arbolConTareas(1, 'DOS');
    const doc = {
      ...victima.doc,
      proyectos: [...victima.doc.proyectos, ...ajeno.doc.proyectos],
      sprints: [
        unSprint({
          id: 'S-junio',
          estado: 'cerrado',
          inicio: '2026-06-01',
          fin: '2026-06-14',
          items: [unItem('DOS-T1', { desenlace: 'completada' })],
        }),
      ],
    };
    const { documento } = exigirOk(
      reducirSinMutar(doc, { comando: 'eliminarProyecto', clave: 'UNO', confirmacion: 'UNO' }),
    );
    expect(documento.proyectos.map((p) => p.clave)).toEqual(['DOS']);
    expect(documento.sprints[0]?.items).toHaveLength(1);
  });

  it('un proyecto sin tareas comprometidas se elimina aunque existan sprints cerrados', () => {
    const { doc, clave } = arbolConTareas(2);
    const conSprintVacio = {
      ...doc,
      sprints: [
        unSprint({ id: 'S-junio', estado: 'cerrado', inicio: '2026-06-01', fin: '2026-06-14' }),
      ],
    };
    const { documento } = exigirOk(
      reducirSinMutar(conSprintVacio, { comando: 'eliminarProyecto', clave, confirmacion: clave }),
    );
    expect(documento.proyectos).toEqual([]);
  });

  it('la alternativa funciona: lo que no se puede eliminar sí se puede cerrar', () => {
    const { doc, clave } = conHistoriaCerrada();
    const { documento } = exigirOk(reducirSinMutar(doc, { comando: 'cerrarProyecto', clave }));
    expect(documento.proyectos[0]?.cerrado_en).toBe(HOY);
    expect(documento.sprints).toEqual(doc.sprints);
  });
});
