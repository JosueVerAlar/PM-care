// @vitest-environment jsdom

import { useRef, useState } from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { avanceDeProyecto, indexarTareas } from '../../src/compartido/dominio/derivar';
import type { Documento, Proyecto } from '../../src/compartido/modelo/tipos';
import { ProveedorAlmacen } from '../../src/renderer/estado/almacen';
import { ProveedorInterfaz } from '../../src/renderer/estado/interfaz';
import { Arbol } from '../../src/renderer/vistas/proyecto/Arbol';
import { HojaDetalle } from '../../src/renderer/vistas/proyecto/HojaDetalle';
import { PanelCompletadas } from '../../src/renderer/vistas/proyecto/PanelCompletadas';
import { unDocumento, unProyecto, unaEpica, unaHistoria, unaTarea } from '../apoyo/constructores';

const HOY = '2026-08-31';
afterEach(cleanup);

function montarPanel(proyecto: Proyecto) {
  return render(<ProveedorAlmacen><ProveedorInterfaz>
    <PanelCompletadas proyecto={proyecto} sprint={undefined} hoy={HOY} avance={avanceDeProyecto(proyecto)} />
  </ProveedorInterfaz></ProveedorAlmacen>);
}

describe('la columna de completadas', () => {
  it('convive con backlog y sprint sin alternador de pestaña', () => {
    const proyecto = unProyecto({ tareas: [unaTarea({ estado: 'done' })] });
    render(<ProveedorAlmacen><ProveedorInterfaz>
      <section aria-label="Backlog"><Arbol proyecto={proyecto} sprint={undefined} hoy={HOY} etiqueta="Backlog" editable={false} /></section>
      <PanelCompletadas proyecto={proyecto} sprint={undefined} hoy={HOY} avance={avanceDeProyecto(proyecto)} />
      <section aria-label="Sprint" />
    </ProveedorInterfaz></ProveedorAlmacen>);
    expect(screen.getAllByLabelText('Backlog')).toHaveLength(2);
    expect(screen.getByLabelText(`Completadas de ${proyecto.clave}`)).toBeTruthy();
    expect(screen.getByLabelText('Sprint')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Terminadas' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'En backlog' })).toBeNull();
  });

  it('solo pinta tareas en done, no las entregadas en terminado', () => {
    montarPanel(unProyecto({ tareas: [
      unaTarea({ titulo: 'Aceptada', estado: 'done' }),
      unaTarea({ titulo: 'Entregada', estado: 'terminado' }),
    ] }));
    expect(screen.getByText('Aceptada')).toBeTruthy();
    expect(screen.queryByText('Entregada')).toBeNull();
  });

  it('el predicado no contamina el conteo: dos hechas de cinco siguen siendo 2/5', () => {
    const proyecto = unProyecto({ epicas: [unaEpica({ titulo: 'Parcial', tareas: [
      unaTarea({ estado: 'done' }), unaTarea({ estado: 'done' }), unaTarea(), unaTarea(), unaTarea(),
    ] })] });
    montarPanel(proyecto);
    const fila = screen.getByText('Parcial').closest('[role="treeitem"]')!;
    expect(fila.textContent).toContain('2/5');
    expect(fila.textContent).not.toContain('2/2');
  });

  it('seis de seis con una historia vacía no es completada y explica lo sin desglosar', () => {
    const proyecto = unProyecto({ epicas: [unaEpica({ titulo: 'Incompleta', historias: [
      unaHistoria({ tareas: Array.from({ length: 6 }, () => unaTarea({ estado: 'done' })) }),
      unaHistoria({ titulo: 'Pendiente de abrir' }),
    ] })] });
    montarPanel(proyecto);
    const fila = screen.getByText('Incompleta').closest('[role="treeitem"]')!;
    expect(fila.getAttribute('data-derivado')).not.toBe('hecha');
    expect(fila.textContent).toMatch(/6\/6.*1 sin desglosar/);
  });

  it('es un registro sin captura, reordenamiento, menús ni filas arrastrables', () => {
    const proyecto = unProyecto({ epicas: [unaEpica({ titulo: 'Cerrada', historias: [
      unaHistoria({ titulo: 'Con abiertas', tareas: [
        unaTarea({ titulo: 'Aceptada', estado: 'done' }), unaTarea({ titulo: 'Abierta' }),
      ] }),
    ] })] });
    const { container } = montarPanel(proyecto);
    const panel = screen.getByLabelText(`Completadas de ${proyecto.clave}`);
    // Por NOMBRE ACCESIBLE, no por el carácter «＋»: el botón se pinta con un SVG, así
    // que buscar el glifo pasa en verde aunque el botón esté ahí. Ese fue el defecto.
    expect(within(panel).queryByRole('button', { name: /Capturar|tecla N/ })).toBeNull();
    expect(within(panel).queryByRole('button', { name: /Acciones de/ })).toBeNull();
    // «Al sprint · N» manda tareas al sprint: escribe, y aquí no se escribe.
    expect(within(panel).queryByRole('button', { name: /Al sprint/ })).toBeNull();
    expect(within(panel).queryByTitle(/Mandar al sprint/)).toBeNull();
    expect(container.querySelector('[draggable="true"]')).toBeNull();
  });

  it('muestra un estado vacío propio cuando nada llegó a done', () => {
    montarPanel(unProyecto({ tareas: [unaTarea({ estado: 'terminado' })] }));
    // La clave sale del proyecto, no escrita a mano: con once proyectos, un texto fijo
    // le diría a diez de ellos el nombre de otro.
    expect(screen.getByText(/Nada aceptado todavía en PRUEBA/)).toBeTruthy();
  });

  it('pinta tareas sueltas aceptadas al nivel uno sin exigir épicas', () => {
    montarPanel(unProyecto({ epicas: [], tareas: [unaTarea({ titulo: 'Suelta', estado: 'done' })] }));
    expect(screen.getByText('Suelta').closest('[role="treeitem"]')?.getAttribute('aria-level')).toBe('1');
  });

  it('el detalle es modal, Escape lo cierra y devuelve el foco a su fila', () => {
    const tarea = unaTarea({ titulo: 'Abrir detalle', estado: 'done' });
    const proyecto = unProyecto({ tareas: [tarea] });
    const documento: Documento = unDocumento({ proyectos: [proyecto] });
    function Caso() {
      const [abierto, setAbierto] = useState(false);
      const fila = useRef<HTMLButtonElement>(null);
      return <>
        <button ref={fila} type="button" onClick={() => setAbierto(true)}>Fila de origen</button>
        {abierto && <HojaDetalle documento={documento} proyecto={proyecto} sprint={undefined} hoy={HOY}
          detalle={{ id: tarea.id, clase: 'tarea' }} indice={indexarTareas(documento)} editable={false}
          cerrar={() => { setAbierto(false); fila.current?.focus(); }} />}
      </>;
    }
    render(<ProveedorAlmacen><ProveedorInterfaz><Caso /></ProveedorInterfaz></ProveedorAlmacen>);
    const fila = screen.getByRole('button', { name: 'Fila de origen' });
    fireEvent.click(fila);
    const dialogo = screen.getByRole('dialog');
    expect(dialogo.getAttribute('aria-modal')).toBe('true');
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(fila);
  });
});
