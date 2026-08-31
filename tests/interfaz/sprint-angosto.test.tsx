// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { ProveedorAlmacen } from '../../src/renderer/estado/almacen';
import { ProveedorInterfaz } from '../../src/renderer/estado/interfaz';
import { PanelSprint } from '../../src/renderer/vistas/proyecto/PanelSprint';
import { unDocumento, unProyecto, unSprint } from '../apoyo/constructores';

afterEach(cleanup);

function datos(conHistorial: boolean) {
  const proyecto = unProyecto({
    clave: 'PM',
    contadores: { epicas: 0, historias: 0, tareas: 0, sprints: 6 },
  });
  const documento = unDocumento({
    proyectos: [proyecto],
    sprints: conHistorial ? [unSprint({
      id: 'PM-S6', clave: 'PM', nombre: 'Sprint 6', estado: 'cerrado',
      inicio: '2026-08-01', fin: '2026-08-15',
    })] : [],
  });
  return documento;
}

function montarPanel(dosPaneles = true, conHistorial = false) {
  const documento = datos(conHistorial);
  return render(
    <ProveedorAlmacen><ProveedorInterfaz>
      <PanelSprint documento={documento} sprint={undefined} clave="PM" hoy="2026-08-31" editable dosPaneles={dosPaneles} />
    </ProveedorInterfaz></ProveedorAlmacen>,
  );
}

function abrirFormulario(): void {
  fireEvent.click(screen.getByRole('button', { name: /Crear el (primer|siguiente) sprint/ }));
}

describe('E15 · formulario de sprint angosto', () => {
  it('conserva etiquetas y un envío accesible para el ratón', () => {
    montarPanel();
    abrirFormulario();
    expect(screen.getByLabelText('Nombre')).toBeTruthy();
    expect(screen.getByLabelText('Inicio')).toBeTruthy();
    expect(screen.getByLabelText('Fin')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Crear sprint' })).toBeTruthy();
  });

  it('anuncia el nombre resultante sin usar placeholder', () => {
    montarPanel();
    abrirFormulario();
    const nombre = screen.getByLabelText('Nombre') as HTMLInputElement;
    expect(nombre.placeholder).toBe('');
    expect(screen.getByText('Si lo dejas vacío, se llamará Sprint 7')).toBeTruthy();
  });

  it('recalcula la duración contra el fin vigente', () => {
    montarPanel(true, true);
    abrirFormulario();
    expect(screen.getByText(/15 días elegidos/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Fin'), { target: { value: '2026-09-30' } });
    expect(screen.getByText(/30 días elegidos/)).toBeTruthy();
    expect(screen.queryByText(/^15 días elegidos/)).toBeNull();
  });

  it('conserva lo tecleado al cruzar al layout de un panel', () => {
    const documento = datos(false);
    const vista = render(
      <ProveedorAlmacen><ProveedorInterfaz>
        <PanelSprint documento={documento} sprint={undefined} clave="PM" hoy="2026-08-31" editable dosPaneles />
      </ProveedorInterfaz></ProveedorAlmacen>,
    );
    abrirFormulario();
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Quincena crítica' } });
    vista.rerender(
      <ProveedorAlmacen><ProveedorInterfaz>
        <PanelSprint documento={documento} sprint={undefined} clave="PM" hoy="2026-08-31" editable dosPaneles={false} />
      </ProveedorInterfaz></ProveedorAlmacen>,
    );
    expect((screen.getByLabelText('Nombre') as HTMLInputElement).value).toBe('Quincena crítica');
  });
});
