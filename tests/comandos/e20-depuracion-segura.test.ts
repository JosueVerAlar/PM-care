import { describe, expect, it } from 'vitest';

import { sprintsCerradosAfectados } from '../../src/compartido/dominio/derivar';
import { validarDocumento } from '../../src/compartido/modelo/esquema';
import { reducirSinMutar, exigirError, exigirOk, arbolConTareas, aplicar } from '../apoyo/comandos';
import { unItem, unSprint } from '../apoyo/constructores';

function conSprintCerrado(cantidad = 2) {
  const { doc, clave } = arbolConTareas(cantidad);
  doc.proyectos[0]!.contadores.sprints = 10;
  const sprint = unSprint({
    id: 'PM-S9',
    nombre: 'Sprint 9',
    estado: 'cerrado',
    clave,
    items: Array.from({ length: cantidad }, (_, indice) => unItem(`${clave}-T${indice + 1}`, {
      desenlace: indice === 0 ? 'completada' : 'devuelta',
      responsable: indice === 0 ? 'ana' : null,
      fecha_limite: indice === 0 ? '2026-08-31' : null,
    })),
  });
  return { doc: { ...doc, sprints: [sprint] }, clave };
}

describe('E20 · depuración segura', () => {
  it('1. una tarea done suelta se borra sin confirmación', () => {
    const { doc, clave } = arbolConTareas(1);
    const done = aplicar(doc, { comando: 'cambiarEstado', id: `${clave}-T1`, estado: 'done' });
    expect(exigirOk(reducirSinMutar(done, { comando: 'eliminarTarea', id: `${clave}-T1` })).documento.proyectos[0]?.epicas[0]?.historias[0]?.tareas).toEqual([]);
  });

  it('2. una tarea de sprint abierto se borra sin confirmación y sale del sprint', () => {
    const { doc, clave } = arbolConTareas(1);
    doc.proyectos[0]!.contadores.sprints = 1;
    const abierto = { ...doc, sprints: [unSprint({ id: 'PM-S1', clave, items: [unItem(`${clave}-T1`)] })] };
    expect(exigirOk(reducirSinMutar(abierto, { comando: 'eliminarTarea', id: `${clave}-T1` })).documento.sprints[0]?.items).toEqual([]);
  });

  it('3. el dominio no pide la fuerte para un contenedor con hijos sin sprint cerrado', () => {
    const { doc, clave } = arbolConTareas(2);
    expect(sprintsCerradosAfectados(doc, `${clave}-E1`)).toEqual([]);
  });

  it('4. sin confirmación conserva exactamente el rechazo vigente', () => {
    const { doc, clave } = conSprintCerrado(1);
    const sin = exigirError(reducirSinMutar(doc, { comando: 'eliminarTarea', id: `${clave}-T1` }));
    const mal = exigirError(reducirSinMutar(doc, { comando: 'eliminarTarea', id: `${clave}-T1`, confirmacion: 'Confirmar' }));
    expect(sin.codigo).toBe('sprint-cerrado');
    expect(mal).toEqual(sin);
  });

  it.each(['Confirmar', 'confirmar ', ''])('5. %j no atraviesa la guarda', (confirmacion) => {
    const { doc, clave } = conSprintCerrado(1);
    expect(exigirError(reducirSinMutar(doc, { comando: 'eliminarTarea', id: `${clave}-T1`, confirmacion })).codigo).toBe('sprint-cerrado');
  });

  it('6. confirmar borra tarea e item cerrado', () => {
    const { doc, clave } = conSprintCerrado(1);
    const salida = exigirOk(reducirSinMutar(doc, { comando: 'eliminarTarea', id: `${clave}-T1`, confirmacion: 'confirmar' }));
    expect(salida.documento.sprints[0]?.items).toEqual([]);
    expect(salida.documento.proyectos[0]?.epicas[0]?.historias[0]?.tareas).toEqual([]);
  });

  it('7. el documento resultante valida sin items huérfanos', () => {
    const { doc, clave } = conSprintCerrado(1);
    const salida = exigirOk(reducirSinMutar(doc, { comando: 'eliminarTarea', id: `${clave}-T1`, confirmacion: 'confirmar' }));
    expect(validarDocumento(salida.documento).ok).toBe(true);
  });

  it('8. el historial conserva sprint, desenlace, responsable y fecha', () => {
    const { doc, clave } = conSprintCerrado(1);
    const { evento } = exigirOk(reducirSinMutar(doc, { comando: 'eliminarTarea', id: `${clave}-T1`, confirmacion: 'confirmar' }));
    expect(evento.detalle).toMatchObject({ items_sprints_cerrados: [{ sprint_id: 'PM-S9', tarea_id: `${clave}-T1`, desenlace: 'completada', responsable: 'ana', fecha: '2026-08-31' }] });
  });

  it.each([
    ['eliminarEpica', 'E1'],
    ['eliminarHistoria', 'H1'],
  ] as const)('9. %s retira todas sus tareas de todos los cerrados', (comando, sufijo) => {
    const { doc, clave } = conSprintCerrado(2);
    const segundo = unSprint({ ...doc.sprints[0]!, id: 'PM-S10', nombre: 'Sprint 10' });
    const multi = { ...doc, sprints: [...doc.sprints, segundo] };
    const salida = exigirOk(reducirSinMutar(multi, { comando, id: `${clave}-${sufijo}`, confirmacion: 'confirmar' }));
    expect(salida.documento.sprints.every((sprint) => sprint.items.length === 0)).toBe(true);
    expect((salida.evento.detalle as { items_sprints_cerrados: unknown[] }).items_sprints_cerrados).toHaveLength(4);
  });

  it('10. borrar no baja el contador ni recicla el id', () => {
    const { doc, clave } = conSprintCerrado(1);
    const borrado = exigirOk(reducirSinMutar(doc, { comando: 'eliminarTarea', id: `${clave}-T1`, confirmacion: 'confirmar' })).documento;
    expect(borrado.proyectos[0]?.contadores.tareas).toBe(1);
    const creado = aplicar(borrado, { comando: 'crearTarea', contenedorId: `${clave}-H1`, titulo: 'Nueva' });
    expect(creado.proyectos[0]?.epicas[0]?.historias[0]?.tareas[0]?.id).toBe(`${clave}-T2`);
  });

  it('11. el cálculo puro nombra todos y solo los cerrados afectados', () => {
    const { doc, clave } = conSprintCerrado(1);
    const abierto = unSprint({ id: 'PM-S11', nombre: 'Sprint 11', clave, items: [unItem(`${clave}-T1`)] });
    expect(sprintsCerradosAfectados({ ...doc, sprints: [...doc.sprints, abierto] }, `${clave}-T1`).map((s) => s.id)).toEqual(['PM-S9']);
  });

  it('12. confirmar no abre ninguna otra mutación de un sprint cerrado', () => {
    const { doc } = conSprintCerrado(1);
    for (const comando of [
      { comando: 'editarSprint' as const, sprintId: 'PM-S9', nombre: 'Otro', confirmacion: 'confirmar' },
      { comando: 'sacarDelSprint' as const, sprintId: 'PM-S9', tareaId: 'PM-T1', confirmacion: 'confirmar' },
    ]) {
      expect(reducirSinMutar(doc, comando as never).ok).toBe(false);
    }
  });
});
