// @vitest-environment jsdom
/**
 * La ceremonia de cerrar y de eliminar un proyecto.
 *
 * Es la ruta más peligrosa de la app: eliminar es la ÚNICA mutación que `⌘Z` no puede
 * revertir una vez escrita en disco. Y desde que el disparador vive en dos sitios —el `⋯`
 * de la lateral y la pantalla de Administración— el riesgo real ya no es que el flujo esté
 * mal: es que existan dos copias y una pierda una salvaguarda sin que nadie lo note.
 *
 * Por eso estas pruebas van contra el componente COMPARTIDO. Si mañana alguien vuelve a
 * escribir la ceremonia dentro de una vista, estas pruebas seguirán pasando sobre el
 * componente viejo y no dirán nada — así que hay además una que comprueba que las dos
 * entradas apuntan aquí.
 */

import { readFileSync } from 'node:fs';
import * as path from 'node:path';

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import { DialogoProyecto } from '../../src/renderer/componentes/DialogoProyecto';
import { ProveedorAlmacen } from '../../src/renderer/estado/almacen';
import { ProveedorInterfaz } from '../../src/renderer/estado/interfaz';
import { unDocumento, unProyecto, unaEpica, unaHistoria, unaTarea } from '../apoyo/constructores';
import type { Documento, Proyecto } from '../../src/compartido/modelo/tipos';

const CLAVE = 'PM';

afterEach(cleanup);

// `<dialog>` no está implementado en jsdom. Se le pone el mínimo para que el componente
// pueda llamar `showModal()` sin reventar; lo que se mide es el contenido, no el modal.
beforeAll(() => {
  if (!HTMLDialogElement.prototype.showModal) {
    HTMLDialogElement.prototype.showModal = function abrir(this: HTMLDialogElement) {
      this.open = true;
    };
    HTMLDialogElement.prototype.close = function cerrar(this: HTMLDialogElement) {
      this.open = false;
    };
  }
});

function documentoCon(proyecto: Proyecto): Documento {
  return unDocumento({ proyectos: [proyecto] });
}

const conTareas = () =>
  unProyecto({
    clave: CLAVE,
    epicas: [
      unaEpica({
        clave: CLAVE,
        historias: [
          unaHistoria({
            clave: CLAVE,
            tareas: [unaTarea({ clave: CLAVE }), unaTarea({ clave: CLAVE })],
          }),
        ],
      }),
    ],
  });

function montar(proyecto: Proyecto, accion: 'cerrar' | 'eliminar', cerrar = () => undefined) {
  const documento = documentoCon(proyecto);
  return render(
    <ProveedorAlmacen>
      <ProveedorInterfaz>
        <DialogoProyecto
          documento={documento}
          proyecto={proyecto}
          accion={accion}
          cerrar={cerrar}
        />
      </ProveedorInterfaz>
    </ProveedorAlmacen>,
  );
}

describe('cerrar un proyecto', () => {
  /** Cerrar es reversible y el texto lo dice: es lo que lo distingue de eliminar. */
  it('promete que se puede reabrir, y cuenta lo que conserva', () => {
    const { container } = montar(conTareas(), 'cerrar');
    expect(container.textContent).toMatch(/Se puede reabrir cuando quieras/);
    expect(container.textContent).toMatch(/2 tareas/);
  });

  it('no pide escribir nada: no hay fricción donde no hace falta', () => {
    montar(conTareas(), 'cerrar');
    expect(screen.queryByRole('textbox')).toBeNull();
  });
});

describe('eliminar un proyecto', () => {
  /**
   * La salvaguarda que no puede perderse: el botón nace inerte y solo se enciende con la
   * clave escrita exacta. Si esto se rompe, un doble clic distraído borra un año.
   */
  it('el botón nace deshabilitado', () => {
    montar(conTareas(), 'eliminar');
    expect(screen.getByRole('button', { name: /para siempre/ })).toHaveProperty('disabled', true);
  });

  it('sigue deshabilitado con la clave a medias', () => {
    montar(conTareas(), 'eliminar');
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'P' } });
    expect(screen.getByRole('button', { name: /para siempre/ })).toHaveProperty('disabled', true);
  });

  it('se habilita con la clave completa, y admite minúsculas', () => {
    montar(conTareas(), 'eliminar');
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'pm' } });
    expect(screen.getByRole('button', { name: /para siempre/ })).toHaveProperty('disabled', false);
  });

  it('una clave parecida pero distinta NO lo habilita', () => {
    montar(conTareas(), 'eliminar');
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'PMM' } });
    expect(screen.getByRole('button', { name: /para siempre/ })).toHaveProperty('disabled', true);
  });

  /** El texto dice qué se pierde en objetos contables, no «se borra todo». */
  it('enumera lo que se pierde', () => {
    const { container } = montar(conTareas(), 'eliminar');
    expect(container.textContent).toMatch(/1 épica/);
    expect(container.textContent).toMatch(/2 tareas/);
    expect(container.textContent).toMatch(/No hay deshacer desde la app/);
  });

  it('un proyecto sin nada lo dice en vez de enumerar ceros', () => {
    const { container } = montar(unProyecto({ clave: CLAVE, epicas: [] }), 'eliminar');
    expect(container.textContent).toMatch(/sin nada capturado/);
    expect(container.textContent).not.toMatch(/0 tareas/);
  });

  it('cancelar cierra sin tocar nada', () => {
    let cerrado = false;
    montar(conTareas(), 'eliminar', () => {
      cerrado = true;
    });
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(cerrado).toBe(true);
  });
});

/**
 * Que la ceremonia siga siendo UNA. Lee el código fuente: si alguien vuelve a escribir la
 * confirmación dentro de una vista, las pruebas de arriba seguirían pasando sobre el
 * componente compartido sin enterarse de la copia.
 */
describe('la ceremonia no se duplica', () => {
  const raiz = path.resolve(__dirname, '..', '..', 'src', 'renderer');
  const leer = (relativa: string) => readFileSync(path.join(raiz, relativa), 'utf8');

  it('solo `DialogoProyecto` manda `eliminarProyecto`', () => {
    for (const archivo of [
      'vistas/administracion/SeccionProyectos.tsx',
      'armazon/BarraLateral.tsx',
      'App.tsx',
    ]) {
      expect(leer(archivo), `${archivo} no puede mandar el comando por su cuenta`).not.toMatch(
        /comando: 'eliminarProyecto'/,
      );
    }
    expect(leer('componentes/DialogoProyecto.tsx')).toMatch(/comando: 'eliminarProyecto'/);
  });

  /** Las dos entradas abren la MISMA ceremonia, y se ve porque despachan lo mismo. */
  it('las dos entradas piden la ceremonia en vez de pintarla', () => {
    expect(leer('armazon/BarraLateral.tsx')).toMatch(/preguntarProyecto/);
    expect(leer('vistas/administracion/SeccionProyectos.tsx')).toMatch(/preguntarProyecto/);
  });

  /** La confirmación viaja al comando: es la última capa antes del disco. */
  it('el comando lleva la clave escrita, no solo la pantalla', () => {
    expect(leer('componentes/DialogoProyecto.tsx')).toMatch(/confirmacion: escrito/);
  });
});
