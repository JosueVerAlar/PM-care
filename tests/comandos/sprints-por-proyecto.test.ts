import { describe, expect, it } from 'vitest';

import { reducir } from '../../src/principal/comandos/reductor';
import { validarDocumento } from '../../src/compartido/modelo/esquema';
import type { Documento } from '../../src/compartido/modelo/tipos';
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
