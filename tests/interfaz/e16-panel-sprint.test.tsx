// @vitest-environment jsdom

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { filasDeSprint } from '../../src/compartido/dominio/sprint';
import { TarjetaSprint } from '../../src/renderer/componentes/TarjetaSprint';
import { ProveedorAlmacen } from '../../src/renderer/estado/almacen';
import { ProveedorInterfaz } from '../../src/renderer/estado/interfaz';
import { FormularioSprint } from '../../src/renderer/vistas/proyecto/FormularioSprint';
import { PanelSprint } from '../../src/renderer/vistas/proyecto/PanelSprint';
import { unDocumento, unItem, unProyecto, unSprint, unaTarea } from '../apoyo/constructores';

afterEach(cleanup);

function envolver(nodo: React.ReactNode) {
  return <ProveedorAlmacen><ProveedorInterfaz>{nodo}</ProveedorInterfaz></ProveedorAlmacen>;
}

function tarjeta() {
  const tarea = unaTarea({ clave: 'PM', id: 'PM-T104', titulo: 'Preparar entrega' });
  const proyecto = unProyecto({ clave: 'PM', tareas: [tarea] });
  const sprint = unSprint({ id: 'PM-S1', clave: 'PM', items: [unItem(tarea.id)] });
  const documento = unDocumento({ proyectos: [proyecto], sprints: [sprint] });
  return { fila: filasDeSprint(documento, sprint, '2026-08-31')[0]!, sprint, documento };
}

function montarTarjeta() {
  const { fila } = tarjeta();
  const editar = vi.fn();
  const sacar = vi.fn();
  const vista = render(<TarjetaSprint fila={fila} mostrarProyecto={false} arrastrando={false}
    acciones={{ editar, sacar }} formulario={null} />);
  return { ...vista, editar, sacar };
}

function formulario(documento = unDocumento({ proyectos: [unProyecto({ clave: 'PM' })] }), sprint?: ReturnType<typeof unSprint>) {
  return render(envolver(<FormularioSprint documento={documento} clave="PM" hoy="2026-08-31"
    {...(sprint ? { sprint } : {})} cerrar={vi.fn()} />));
}

describe('E16 · los cinco defectos del panel del sprint', () => {
  it('mantiene visible la puerta de acciones sin hover', () => {
    montarTarjeta();
    expect(screen.getByRole('combobox', { name: 'Acciones de PM-T104' })).toBeTruthy();
    const css = readFileSync(path.resolve(process.cwd(), 'src/renderer/estilos/edicion.css'), 'utf8');
    const cuerpo = /\.tarjeta__menu\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
    expect(cuerpo).not.toMatch(/visibility:\s*hidden|display:\s*none/);
  });

  it('nombra la tarea concreta en vez de decir «Más»', () => {
    montarTarjeta();
    expect(screen.getByRole('combobox', { name: 'Acciones de PM-T104' })).toBeTruthy();
    expect(screen.queryByLabelText('Más')).toBeNull();
  });

  it('ofrece dos ítems y deja sacar al fondo en su propio grupo', () => {
    const { container } = montarTarjeta();
    const grupos = [...container.querySelectorAll('optgroup')];
    const items = [...container.querySelectorAll('option')].slice(1);
    // DOS, no tres: «Editar» y «Completar» son el mismo destino con distinto verbo, y
    // ofrecer los dos obliga a elegir entre dos nombres de la misma cosa.
    expect(items).toHaveLength(2);
    expect(items.at(-1)?.textContent).toContain('Sacar del sprint');
    expect(grupos.at(-1)?.label).toBe('Cuidado');
    expect(grupos.at(-1)?.querySelectorAll('option')).toHaveLength(1);
  });

  it('no anuncia teclas que la tarjeta no escucha', () => {
    const { container } = montarTarjeta();
    // La tarjeta del sprint no tiene manejador de teclado. La regla 19 pide la tecla al
    // lado porque menú y teclado comparten implementación, no para escribir un atajo que
    // al pulsarlo no hace nada.
    for (const item of [...container.querySelectorAll('option')]) {
      expect(item.textContent).not.toContain(' · ');
    }
  });

  it('solo sacar recorre la ruta de confirmación', () => {
    const { editar, sacar } = montarTarjeta();
    const menu = screen.getByRole('combobox', { name: 'Acciones de PM-T104' });
    fireEvent.change(menu, { target: { value: 'editar' } });
    expect(editar).toHaveBeenCalledOnce();
    expect(sacar).not.toHaveBeenCalled();
    fireEvent.change(menu, { target: { value: 'sacar' } });
    expect(sacar).toHaveBeenCalledOnce();
  });

  it('deshabilita el envío sin fin y escribe la razón', () => {
    formulario();
    expect((screen.getByRole('button', { name: 'Crear sprint' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('Elige una fecha de fin para continuar.')).toBeTruthy();
  });

  it('deshabilita el envío con solape y deja el aviso junto a las fechas', () => {
    const proyecto = unProyecto({ clave: 'PM' });
    const existente = unSprint({ clave: 'PM', nombre: 'Sprint vigente', inicio: '2026-09-01', fin: '2026-09-15', estado: 'planeado' });
    formulario(unDocumento({ proyectos: [proyecto], sprints: [existente] }));
    fireEvent.change(screen.getByLabelText('Fin'), { target: { value: '2026-09-10' } });
    expect((screen.getByRole('button', { name: 'Crear sprint' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/Se solapa con Sprint vigente/).closest('.form-sprint__fechas')).toBeTruthy();
  });

  it('deja un solo primario cuando el formulario está abierto', () => {
    const documento = unDocumento({ proyectos: [unProyecto({ clave: 'PM' })] });
    const { container } = render(envolver(<PanelSprint documento={documento} sprint={undefined} clave="PM" hoy="2026-08-31" editable dosPaneles />));
    fireEvent.click(screen.getByRole('button', { name: 'Crear el primer sprint de PM' }));
    expect(container.querySelectorAll('.boton-solido')).toHaveLength(1);
  });

  it('enfoca Inicio al crear y Fin al editar un sprint activo', () => {
    const primera = formulario();
    expect(document.activeElement).toBe(screen.getByLabelText('Inicio'));
    primera.unmount();
    const activo = unSprint({ clave: 'PM', estado: 'activo' });
    formulario(unDocumento({ proyectos: [unProyecto({ clave: 'PM' })], sprints: [activo] }), activo);
    expect((screen.getByLabelText('Inicio') as HTMLInputElement).disabled).toBe(true);
    expect(document.activeElement).toBe(screen.getByLabelText('Fin'));
  });

  it('Escape cierra y devuelve el foco fuera del body', async () => {
    const documento = unDocumento({ proyectos: [unProyecto({ clave: 'PM' })] });
    render(envolver(<PanelSprint documento={documento} sprint={undefined} clave="PM" hoy="2026-08-31" editable dosPaneles />));
    const puerta = screen.getByRole('button', { name: 'Crear el primer sprint de PM' });
    puerta.focus();
    fireEvent.click(puerta);
    fireEvent.keyDown(screen.getByLabelText('Inicio'), { key: 'Escape' });
    expect(screen.queryByRole('button', { name: 'Crear sprint' })).toBeNull();
    await waitFor(() => expect(document.activeElement).not.toBe(document.body));
  });

  it('conserva la regresión de pistas duras contra el suelo del panel', () => {
    const prueba = readFileSync(path.resolve(process.cwd(), 'tests/estilos/sprint-angosto.test.ts'), 'utf8');
    expect(prueba).toContain('baseFecha * 2 + separacion + rellenoHorizontal');
  });
});
