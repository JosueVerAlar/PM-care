import { describe, expect, it } from 'vitest';

import { reducir } from '../../src/principal/comandos/reductor';
import { validarDocumento } from '../../src/compartido/modelo/esquema';
import type { Documento } from '../../src/compartido/modelo/tipos';
import { sprintsActivos } from '../../src/compartido/dominio/derivar';
import { filasDeSprint, filasDeSprints } from '../../src/compartido/dominio/sprint';
import { unDocumento, unItem, unProyecto, unSprint, unaTarea } from '../apoyo/constructores';
import { AHORA, exigirError, exigirOk } from '../apoyo/comandos';

/** Fixture imprescindible: dos proyectos y dos sprints activos válidos al mismo tiempo. */
function dosProyectosActivos(): Documento {
  const tareaUno = unaTarea({ clave: 'UNO', id: 'UNO-T1' });
  const tareaDos = unaTarea({ clave: 'DOS', id: 'DOS-T1' });
  return unDocumento({
    proyectos: [
      unProyecto({ clave: 'UNO', tareas: [tareaUno], contadores: { epicas: 0, historias: 0, tareas: 1, sprints: 1 } }),
      unProyecto({ clave: 'DOS', tareas: [tareaDos], contadores: { epicas: 0, historias: 0, tareas: 1, sprints: 2 } }),
    ],
    sprints: [
      unSprint({ id: 'UNO-S1', clave: 'UNO', estado: 'activo', items: [unItem('UNO-T1')] }),
      unSprint({ id: 'DOS-S1', clave: 'DOS', estado: 'activo', items: [unItem('DOS-T1')] }),
    ],
  });
}

describe('sprints independientes por proyecto', () => {
  it('el fixture con dos activos simultáneos valida completo', () => {
    expect(validarDocumento(dosProyectosActivos()).ok).toBe(true);
  });

  it('activar el segundo proyecto no apaga ni bloquea el primero', () => {
    const doc = dosProyectosActivos();
    doc.sprints[1]!.estado = 'planeado';
    const resultado = exigirOk(reducir(doc, { comando: 'activarSprint', sprintId: 'DOS-S1' }, AHORA));
    expect(resultado.documento.sprints.map((s) => s.estado)).toEqual(['activo', 'activo']);
  });

  it('cerrar UNO no arrastra su tarea al planeado de DOS', () => {
    const doc = dosProyectosActivos();
    doc.sprints[1]!.estado = 'planeado';
    const resultado = exigirOk(reducir(doc, { comando: 'cerrarSprint', sprintId: 'UNO-S1' }, AHORA));
    expect(resultado.documento.sprints.find((s) => s.id === 'DOS-S1')?.items).toEqual([unItem('DOS-T1')]);
    expect(resultado.documento.sprints.some((s) => s.clave === 'UNO' && s.estado === 'planeado')).toBe(true);
  });

  it('rechaza mover una tarea a un sprint de otra clave', () => {
    const error = exigirError(reducir(dosProyectosActivos(), { comando: 'moverAlSprint', tareaId: 'UNO-T1', sprintId: 'DOS-S1' }, AHORA));
    expect(error.codigo).toBe('invalido');
  });

  it('rechaza un siguiente explícito de otra clave', () => {
    const error = exigirError(reducir(dosProyectosActivos(), { comando: 'cerrarSprint', sprintId: 'UNO-S1', siguienteSprintId: 'DOS-S1' }, AHORA));
    expect(error.codigo).toBe('invalido');
  });
});

describe('edición y eliminación de sprint', () => {
  it('rechaza inicio activo y acepta fin activo', () => {
    const doc = dosProyectosActivos();
    expect(exigirError(reducir(doc, { comando: 'editarSprint', sprintId: 'UNO-S1', inicio: '2026-08-25' }, AHORA)).codigo).toBe('invalido');
    expect(exigirOk(reducir(doc, { comando: 'editarSprint', sprintId: 'UNO-S1', fin: '2026-09-01' }, AHORA)).documento.sprints[0]?.fin).toBe('2026-09-01');
  });

  it.each([{ nombre: 'Otro' }, { inicio: '2026-08-20' }, { fin: '2026-09-01' }])('un cerrado rechaza editar $nombre$inicio$fin', (cambio) => {
    const doc = dosProyectosActivos();
    doc.sprints[0]!.estado = 'cerrado';
    const error = exigirError(reducir(doc, { comando: 'editarSprint', sprintId: 'UNO-S1', ...cambio }, AHORA));
    expect(error.codigo).toBe('sprint-cerrado');
  });

  it('no elimina un planeado con items', () => {
    const doc = dosProyectosActivos();
    doc.sprints[0]!.estado = 'planeado';
    expect(exigirError(reducir(doc, { comando: 'eliminarSprint', sprintId: 'UNO-S1' }, AHORA)).codigo).toBe('invalido');
  });
});

/**
 * La numeración sigue el CONTADOR del proyecto, no la serie del nombre anterior.
 *
 * Es el caso que el usuario nombró: «es fácil perder la cuenta cuando llevas varios
 * sprints». Quien bautiza uno «Quincena de septiembre» rompía la serie y el siguiente se
 * quedaba sin número — caía al id.
 */
describe('el nombre propuesto sigue la cuenta del proyecto', () => {
  const conProyecto = () =>
    unDocumento({ proyectos: [unProyecto({ clave: 'UNO', epicas: [] })] });

  const crear = (doc: Documento, inicio: string, fin: string, nombre?: string) =>
    exigirOk(reducir(doc, { comando: 'crearSprint', clave: 'UNO', inicio, fin, nombre }, AHORA)).documento;

  it('el primero se llama «Sprint 1»', () => {
    const doc = crear(conProyecto(), '2027-01-04', '2027-01-17');
    expect(doc.sprints[0]?.nombre).toBe('Sprint 1');
  });

  it('la cuenta sigue aunque el anterior tenga nombre propio', () => {
    let doc = crear(conProyecto(), '2027-01-04', '2027-01-17', 'Quincena de septiembre');
    doc = crear(doc, '2027-02-01', '2027-02-14');
    expect(doc.sprints[1]?.nombre, 'antes caía al id por no poder seguir la serie').toBe('Sprint 2');
  });

  /** El contador no se recicla (regla 15): el hueco de uno eliminado no se reutiliza. */
  it('eliminar un sprint no devuelve su número', () => {
    let doc = crear(conProyecto(), '2027-01-04', '2027-01-17');
    doc = crear(doc, '2027-02-01', '2027-02-14');
    const segundo = doc.sprints[1]!.id;
    doc = exigirOk(reducir(doc, { comando: 'eliminarSprint', sprintId: segundo }, AHORA)).documento;
    doc = crear(doc, '2027-03-01', '2027-03-14');
    expect(doc.sprints[1]?.nombre).toBe('Sprint 3');
  });

  it('el nombre explícito manda siempre', () => {
    const doc = crear(conProyecto(), '2027-01-04', '2027-01-17', 'Arranque');
    expect(doc.sprints[0]?.nombre).toBe('Arranque');
  });
});

/**
 * La retrospectiva: la única excepción a la regla 8, y mide exactamente un campo de ancho.
 *
 * Se escribe DESPUÉS de cerrar porque así ocurre — la retro es una reunión de uno o dos
 * días más tarde. Obligar a escribirla en el momento de pulsar «cerrar» es la forma de
 * que se quede vacía siempre.
 */
describe('la retrospectiva de un sprint cerrado', () => {
  const conSprint = (estado: 'planeado' | 'activo' | 'cerrado') =>
    unDocumento({
      // El contador tiene que reflejar el id que ya se usó: un `UNO-S1` con el contador
      // en cero es un documento inválido, y con razón — la app volvería a emitir ese id.
      proyectos: [unProyecto({ clave: 'UNO', epicas: [], contadores: { epicas: 0, historias: 0, tareas: 0, sprints: 1 } })],
      sprints: [unSprint({ id: 'UNO-S1', clave: 'UNO', estado })],
    });

  const escribir = (doc: Documento, texto: string | null) =>
    reducir(doc, { comando: 'escribirRetrospectiva', sprintId: 'UNO-S1', texto }, AHORA);

  it('se escribe sobre uno cerrado', () => {
    const doc = exigirOk(escribir(conSprint('cerrado'), 'Nos faltó QA')).documento;
    expect(doc.sprints[0]?.retrospectiva).toBe('Nos faltó QA');
  });

  /** Una retro a mitad de sprint habla de algo que todavía está cambiando. */
  it('se rechaza sobre uno activo y sobre uno planeado', () => {
    expect(exigirError(escribir(conSprint('activo'), 'x')).codigo).toBe('invalido');
    expect(exigirError(escribir(conSprint('planeado'), 'x')).codigo).toBe('invalido');
  });

  it('se puede reescribir: una retro se corrige', () => {
    let doc = exigirOk(escribir(conSprint('cerrado'), 'Primera')).documento;
    doc = exigirOk(reducir(doc, { comando: 'escribirRetrospectiva', sprintId: 'UNO-S1', texto: 'Corregida' }, AHORA)).documento;
    expect(doc.sprints[0]?.retrospectiva).toBe('Corregida');
  });

  /** Vacío y `null` son lo mismo, o una vista pintaría una nota en blanco creyendo que hay algo. */
  it('el texto vacío se guarda como null, no como cadena vacía', () => {
    let doc = exigirOk(escribir(conSprint('cerrado'), 'Algo')).documento;
    doc = exigirOk(reducir(doc, { comando: 'escribirRetrospectiva', sprintId: 'UNO-S1', texto: '   ' }, AHORA)).documento;
    expect(doc.sprints[0]?.retrospectiva).toBeNull();
  });

  /**
   * Lo que la excepción NO abre: escribir la retro no puede convertirse en la puerta por
   * la que se corrige el nombre o las fechas de un sprint cerrado.
   */
  it('no toca ningún otro campo del sprint cerrado', () => {
    const antes = conSprint('cerrado');
    const original = JSON.parse(JSON.stringify(antes.sprints[0]));
    const doc = exigirOk(escribir(antes, 'Una nota')).documento;
    const { retrospectiva: _r, ...resto } = doc.sprints[0] as Record<string, unknown>;
    const { retrospectiva: _o, ...restoOriginal } = original as Record<string, unknown>;
    expect(resto).toEqual(restoOriginal);
  });

  it('`editarSprint` sigue rechazado sobre un cerrado, retro o no', () => {
    const doc = exigirOk(escribir(conSprint('cerrado'), 'Nota')).documento;
    expect(
      exigirError(reducir(doc, { comando: 'editarSprint', sprintId: 'UNO-S1', nombre: 'Otro' }, AHORA)).codigo,
    ).toBe('sprint-cerrado');
  });
});

/**
 * La vista global del sprint, cuando hay más de un sprint abierto.
 *
 * El defecto que esto fija: la vista tomaba `sprintsActivos(doc)[0]` y pintaba solo ese.
 * Con sprint abierto en dos proyectos, el segundo no se veía — y no parecía «sin
 * comprometer», parecía que sus tareas no existían.
 */
describe('filasDeSprints agrega todos los sprints activos', () => {
  it('trae las tareas de los dos proyectos, no solo las del primero', () => {
    const doc = dosProyectosActivos();
    const filas = filasDeSprints(doc, sprintsActivos(doc), '2026-08-27');
    expect(filas.map((f) => f.ubicacion.tarea.id).sort()).toEqual(['DOS-T1', 'UNO-T1']);
  });

  /** Sin esto, «Sacar del sprint» mandaría el id del sprint de otro proyecto. */
  it('cada fila sabe de qué sprint sale', () => {
    const doc = dosProyectosActivos();
    const filas = filasDeSprints(doc, sprintsActivos(doc), '2026-08-27');
    const porTarea = new Map(filas.map((f) => [f.ubicacion.tarea.id, f.sprint.id]));
    expect(porTarea.get('UNO-T1')).toBe('UNO-S1');
    expect(porTarea.get('DOS-T1')).toBe('DOS-S1');
  });

  it('filasDeSprint sigue devolviendo solo el sprint que se le pasa', () => {
    const doc = dosProyectosActivos();
    const soloUno = filasDeSprint(doc, doc.sprints[0], '2026-08-27');
    expect(soloUno.map((f) => f.ubicacion.tarea.id)).toEqual(['UNO-T1']);
  });

  it('sin sprints activos no hay filas, y no revienta', () => {
    const doc = dosProyectosActivos();
    expect(filasDeSprints(doc, [], '2026-08-27')).toEqual([]);
    expect(filasDeSprint(doc, undefined, '2026-08-27')).toEqual([]);
  });
});
