// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { VistaBacklog } from '../../src/renderer/vistas/globales/VistaBacklog';
import { ProveedorInterfaz } from '../../src/renderer/estado/interfaz';
import { unDocumento, unItem, unProyecto, unSprint, unaTarea } from '../apoyo/constructores';

afterEach(cleanup);

describe('la marca de compromiso en el backlog del área', () => {
  it('mantiene la tarea comprometida en el DOM y la distingue como parte del sprint', () => {
    const tarea = unaTarea({ clave: 'PM', id: 'PM-T1', titulo: 'Preparar entrega' });
    const documento = unDocumento({
      proyectos: [unProyecto({ clave: 'PM', tareas: [tarea] })],
      sprints: [unSprint({ id: 'S-1', items: [unItem(tarea.id)] })],
    });

    const { container } = render(
      <ProveedorInterfaz>
        <VistaBacklog documento={documento} hoy="2026-08-27" />
      </ProveedorInterfaz>,
    );

    expect(screen.getByText('Preparar entrega')).toBeTruthy();
    expect(screen.getByText('En sprint')).toBeTruthy();
    expect(container.querySelector('.fila-backlog--en-sprint')).not.toBeNull();
  });
});
