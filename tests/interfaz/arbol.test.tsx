// @vitest-environment jsdom
/**
 * El árbol, montado de verdad en un DOM.
 *
 * `filas.test.ts` dice qué filas EXISTEN; esto dice que se pintan y que se anuncian bien.
 * Es la primera prueba del proyecto que renderiza React, y cubre justo el hueco que
 * `docs/REDISENO-UX.md` §2.1 señalaba: cero cobertura de interfaz.
 *
 * Lo que se comprueba es lo que un lector de pantalla oiría —`role`, `aria-level`,
 * `aria-posinset`— y no clases de CSS: el marcado accesible es el contrato estable, la
 * hoja de estilos no.
 */

import { readFileSync } from 'node:fs';
import * as path from 'node:path';

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { Arbol } from '../../src/renderer/vistas/proyecto/Arbol';
import { Leyenda } from '../../src/renderer/vistas/proyecto/Leyenda';
import { PanelAyuda } from '../../src/renderer/vistas/proyecto/PanelAyuda';
import { ProveedorAlmacen } from '../../src/renderer/estado/almacen';
import { ProveedorInterfaz } from '../../src/renderer/estado/interfaz';
import { unProyecto, unaEpica, unaHistoria, unaTarea } from '../apoyo/constructores';
import { validarDocumento } from '../../src/compartido/modelo/esquema';
import type { Proyecto } from '../../src/compartido/modelo/tipos';

const CLAVE = 'PM';
const HOY = '2026-08-27';

afterEach(cleanup);

function montar(proyecto: Proyecto) {
  return render(
    <ProveedorAlmacen>
      <ProveedorInterfaz>
        <Arbol
          proyecto={proyecto}
          sprint={undefined}
          hoy={HOY}
          etiqueta="Backlog"
          editable={false}
        />
      </ProveedorInterfaz>
    </ProveedorAlmacen>,
  );
}

/** Cada fila del árbol, en el orden en que se pinta. */
const filas = () => screen.getAllByRole('treeitem');

describe('el árbol se pinta', () => {
  it('un proyecto clásico enseña sus épicas y nada más, colapsado', () => {
    montar(
      unProyecto({
        clave: CLAVE,
        epicas: [
          unaEpica({
            clave: CLAVE,
            id: 'PM-E1',
            titulo: 'Autenticación',
            historias: [unaHistoria({ clave: CLAVE, id: 'PM-H1', tareas: [unaTarea({ clave: CLAVE })] })],
          }),
        ],
      }),
    );
    expect(filas()).toHaveLength(1);
    expect(within(filas()[0]!).getByText('Autenticación')).toBeTruthy();
  });

  /**
   * El caso de Infraestructura, que es la razón de N9: épica sin historias, tres tareas
   * colgando. **Antes de esto el usuario veía una épica y nada dentro.**
   */
  it('una épica sin historias pinta sus tareas propias al abrirla', () => {
    montar(
      unProyecto({
        clave: CLAVE,
        epicas: [
          unaEpica({
            clave: CLAVE,
            id: 'PM-E1',
            titulo: 'Habilitación de red',
            historias: [],
            tareas: [
              unaTarea({ clave: CLAVE, id: 'PM-T1', titulo: 'Inventario de servidores' }),
              unaTarea({ clave: CLAVE, id: 'PM-T2', titulo: 'Matriz de comunicación' }),
            ],
          }),
        ],
      }),
    );

    // La épica se anuncia como expandible: sin esto, el teclado no ofrece abrirla.
    const epica = filas()[0]!;
    expect(epica.getAttribute('aria-expanded')).toBe('false');

    fireEvent.click(epica);
    expect(epica.getAttribute('aria-expanded')).toBe('true');
    expect(filas()).toHaveLength(3);
    expect(screen.getByText('Inventario de servidores')).toBeTruthy();
    expect(screen.getByText('Matriz de comunicación')).toBeTruthy();
  });

  /** El caso de PULSO: trabajo continuo, sin una sola épica. */
  it('un proyecto sin épicas pinta sus tareas sueltas al nivel 1, sin abrir nada', () => {
    montar(
      unProyecto({
        clave: CLAVE,
        epicas: [],
        tareas: [
          unaTarea({ clave: CLAVE, id: 'PM-T1', titulo: 'Definir los indicadores' }),
          unaTarea({ clave: CLAVE, id: 'PM-T2', titulo: 'Levantar el tablero' }),
        ],
      }),
    );
    expect(filas()).toHaveLength(2);
    expect(filas()[0]!.getAttribute('aria-level')).toBe('1');
    expect(screen.getByText('Definir los indicadores')).toBeTruthy();
  });

  /**
   * Lo que oye quien no ve la sangría. Una tarea suelta es hermana de las épicas, así que
   * «2 de 2» tiene que cuadrar con las dos filas que hay en pantalla.
   */
  it('anuncia nivel y posición coherentes con lo que hay en pantalla', () => {
    montar(
      unProyecto({
        clave: CLAVE,
        epicas: [unaEpica({ clave: CLAVE, id: 'PM-E1', titulo: 'Una épica' })],
        tareas: [unaTarea({ clave: CLAVE, id: 'PM-T1', titulo: 'Una tarea suelta' })],
      }),
    );
    expect(
      filas().map((f) => [
        f.getAttribute('aria-level'),
        f.getAttribute('aria-posinset'),
        f.getAttribute('aria-setsize'),
      ]),
    ).toEqual([
      ['1', '1', '2'],
      ['1', '2', '2'],
    ]);
  });

  /**
   * Regla 2: un contenedor sin tareas dice «sin desglosar», nunca `0%`. Es la regla que
   * más fácil se rompe al tocar el árbol, y ninguna prueba la miraba EN PANTALLA.
   */
  it('una épica vacía dice «sin desglosar» y no pinta ningún porcentaje', () => {
    const { container } = montar(
      unProyecto({ clave: CLAVE, epicas: [unaEpica({ clave: CLAVE, id: 'PM-E1', titulo: 'Vacía' })] }),
    );
    // Aparece más de una vez —lo que se ve y lo que se anuncia—; lo que importa es que
    // esté, no cuántas veces.
    expect(screen.getAllByText(/sin desglosar/i).length).toBeGreaterThan(0);
    expect(container.textContent).not.toMatch(/0\s*%/);
    expect(container.textContent).not.toMatch(/NaN/);
  });
});

/**
 * La prueba que de verdad contesta «¿funciona?»: el documento con el que la app arranca,
 * pintado. No un caso construido para pasar, sino las tarjetas que están hoy en el Jira.
 */
describe('el árbol con los datos reales de la semilla', () => {
  const doc = (() => {
    const crudo: unknown = JSON.parse(
      // `import.meta.url` bajo jsdom es una URL http, no un archivo: se resuelve desde
      // la raíz del repositorio, que es donde vitest arranca.
      readFileSync(path.resolve(process.cwd(), 'datos/semilla.json'), 'utf8'),
    );
    const resultado = validarDocumento(crudo);
    if (!resultado.ok) throw new Error('la semilla no valida');
    return resultado.documento;
  })();

  const proyecto = (clave: string) => {
    const encontrado = doc.proyectos.find((p) => p.clave === clave);
    if (!encontrado) throw new Error(`falta ${clave} en la semilla`);
    return encontrado as Proyecto;
  };

  it('Infraestructura: la épica real abre y enseña sus tres tareas de Jira', () => {
    montar(proyecto('IN'));
    const epica = filas()[0]!;
    expect(within(epica).getByText(/Habilitación de red/)).toBeTruthy();

    fireEvent.click(epica);
    expect(filas()).toHaveLength(4);
    expect(screen.getByText('Inventario de servidores')).toBeTruthy();
    expect(screen.getByText(/Matriz de comunicación/)).toBeTruthy();
    expect(screen.getByText(/Decidir y estandarizar/)).toBeTruthy();
  });

  it('PULSO: sus dos tareas sueltas se ven sin tener que abrir nada', () => {
    montar(proyecto('PULSO'));
    expect(filas()).toHaveLength(2);
    expect(screen.getByText(/Definir los indicadores/)).toBeTruthy();
  });

  /** Un proyecto todavía sin capturar no puede pintar filas fantasma. */
  it('un proyecto vacío no pinta ninguna fila', () => {
    montar(proyecto('SICOE'));
    expect(screen.queryAllByRole('treeitem')).toHaveLength(0);
  });
});

describe('el estado vacío ofrece salida', () => {
  /**
   * Un proyecto recién dado de alta. Antes solo decía «no tiene épicas capturadas» y
   * obligaba a buscar el botón en la cabecera; y con N9 esa frase además era falsa —un
   * proyecto puede empezar por una tarea suelta.
   */
  it('un proyecto sin nada ofrece las dos formas de empezar', () => {
    render(
      <ProveedorAlmacen>
        <ProveedorInterfaz>
          <Arbol
            proyecto={unProyecto({ clave: CLAVE, epicas: [] })}
            sprint={undefined}
            hoy={HOY}
            etiqueta="Backlog"
            editable
          />
        </ProveedorInterfaz>
      </ProveedorAlmacen>,
    );
    expect(screen.getByRole('button', { name: /Nueva épica/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Nueva tarea suelta/ })).toBeTruthy();
  });

  /** En «Terminadas» y en solo lectura no se captura: el vacío ahí es un registro. */
  it('sin permiso de escritura no ofrece ningún botón', () => {
    montar(unProyecto({ clave: CLAVE, epicas: [] }));
    expect(screen.queryByRole('button', { name: /Nueva/ })).toBeNull();
  });
});

describe('el esfuerzo en la fila', () => {
  const conEsfuerzo = (esfuerzo: 1 | 2 | 3 | 5 | 8 | null) =>
    unProyecto({
      clave: CLAVE,
      epicas: [],
      tareas: [unaTarea({ clave: CLAVE, id: 'PM-T1', titulo: 'Una tarea', esfuerzo })],
    });

  it('una tarea estimada enseña su número', () => {
    montar(conEsfuerzo(5));
    expect(screen.getByTitle('Esfuerzo 5').textContent).toBe('5');
  });

  /**
   * «Sin estimar» es el estado normal, no una falta. Un «—» en cada una de trescientas
   * filas sería ruido en la columna más estrecha del árbol.
   */
  it('una tarea sin estimar no pinta nada en su lugar', () => {
    const { container } = montar(conEsfuerzo(null));
    expect(container.querySelector('.esfuerzo')).toBeNull();
  });
});

describe('la clave se copia, no se lee (N6)', () => {
  const conTarea = () =>
    unProyecto({
      clave: CLAVE,
      epicas: [],
      tareas: [unaTarea({ clave: CLAVE, id: 'PM-T1', titulo: 'Una tarea' })],
    });

  /**
   * Sigue en el DOM aunque el CSS la mantenga invisible: quien navega con teclado la
   * revela con el foco, y un lector de pantalla tiene que poder anunciarla siempre.
   */
  it('es un botón que ofrece copiar, no un texto muerto', () => {
    montar(conTarea());
    const boton = screen.getByRole('button', { name: 'PM-T1' });
    expect(boton.title).toContain('Copiar');
  });

  /** Conserva su columna: si el hueco desapareciera, el título temblaría al pasar el ratón. */
  it('ocupa su sitio aunque esté invisible', () => {
    const { container } = montar(conTarea());
    expect(container.querySelector('.clave')).not.toBeNull();
  });
});

describe('el menú ⋯ de la fila', () => {
  const conTarea = () =>
    unProyecto({
      clave: CLAVE,
      epicas: [],
      tareas: [unaTarea({ clave: CLAVE, id: 'PM-T1', titulo: 'Una tarea' })],
    });

  function montarEditable(proyecto: ReturnType<typeof unProyecto>) {
    return render(
      <ProveedorAlmacen>
        <ProveedorInterfaz>
          <Arbol proyecto={proyecto} sprint={undefined} hoy={HOY} etiqueta="Backlog" editable />
        </ProveedorInterfaz>
      </ProveedorAlmacen>,
    );
  }

  /**
   * El nombre accesible es específico a propósito: un `⋯` no dice nada por sí mismo, y
   * «Más» lo dejaría igual de mudo para quien no ve el icono.
   */
  it('se nombra por la fila a la que pertenece, no «Más»', () => {
    montarEditable(conTarea());
    expect(screen.getByRole('combobox', { name: 'Acciones de PM-T1' })).toBeTruthy();
  });

  /** El techo de ocho es duro: el noveno ítem significa una función que nadie pidió. */
  it('nunca ofrece más de ocho acciones', () => {
    montarEditable(conTarea());
    const menu = screen.getByRole('combobox', { name: 'Acciones de PM-T1' });
    const acciones = menu.querySelectorAll('option[value]:not([value=""])');
    expect(acciones.length).toBeLessThanOrEqual(8);
    expect(acciones.length).toBeGreaterThan(0);
  });

  /** Cada acción trae su tecla al lado: es lo que permitió borrar la leyenda de atajos. */
  it('cada acción dice con qué tecla se hace', () => {
    montarEditable(conTarea());
    const menu = screen.getByRole('combobox', { name: 'Acciones de PM-T1' });
    for (const opcion of menu.querySelectorAll('option[value]:not([value=""])')) {
      expect(opcion.textContent, opcion.textContent ?? '').toMatch(/ · .+$/);
    }
  });

  /** «Marcar en curso» nombra lo que va a pasar, no «Cambiar estado». */
  it('el estado se nombra por su destino', () => {
    montarEditable(conTarea());
    expect(screen.getByRole('option', { name: /Marcar en curso/ })).toBeTruthy();
  });

  /** Eliminar vive solo, al fondo, en su propio grupo. */
  it('lo destructivo va aparte de lo benigno', () => {
    const { container } = montarEditable(conTarea());
    const grupos = [...container.querySelectorAll('optgroup')].map((g) => g.label);
    expect(grupos[grupos.length - 1]).toBe('Cuidado');
    const ultimo = container.querySelector('optgroup:last-of-type option');
    expect(ultimo?.textContent).toMatch(/^Eliminar/);
  });

  /** En «Terminadas» y en solo lectura no se opera: el menú no existe. */
  it('sin permiso de escritura no hay menú', () => {
    montar(conTarea());
    expect(screen.queryByRole('combobox', { name: /Acciones/ })).toBeNull();
  });

  /**
   * Con una sola hermana no hay entre quiénes reordenar. Ofrecerlo enseñaría que el menú
   * miente sobre lo que puede hacer.
   */
  it('no ofrece subir ni bajar cuando la fila es hija única', () => {
    montarEditable(conTarea());
    expect(screen.queryByRole('option', { name: /Subir/ })).toBeNull();
  });

  it('con hermanas sí las ofrece', () => {
    montarEditable(
      unProyecto({
        clave: CLAVE,
        epicas: [],
        tareas: [
          unaTarea({ clave: CLAVE, id: 'PM-T1' }),
          unaTarea({ clave: CLAVE, id: 'PM-T2' }),
        ],
      }),
    );
    expect(screen.getAllByRole('option', { name: /Subir/ }).length).toBe(2);
  });
});

describe('el panel de ayuda', () => {
  /**
   * La puerta se ve siempre. Un panel que solo se abre con una tecla que nada menciona no
   * es ayuda: es otro requisito de memoria, que es lo que la leyenda de atajos tapaba.
   */
  it('la leyenda ofrece un botón visible, no solo la tecla', () => {
    render(
      <ProveedorAlmacen>
        <ProveedorInterfaz>
          <Leyenda editable abrirAyuda={() => undefined} />
        </ProveedorInterfaz>
      </ProveedorAlmacen>,
    );
    expect(screen.getByRole('button', { name: /Teclas y cómo se lee/ })).toBeTruthy();
  });

  it('en solo lectura no ofrece la puerta: ahí no hay teclas que usar', () => {
    render(
      <ProveedorAlmacen>
        <ProveedorInterfaz>
          <Leyenda editable={false} abrirAyuda={() => undefined} />
        </ProveedorInterfaz>
      </ProveedorAlmacen>,
    );
    expect(screen.queryByRole('button', { name: /Teclas y cómo se lee/ })).toBeNull();
  });

  it('el panel es un diálogo con nombre y trae las dos secciones', () => {
    render(<PanelAyuda cerrar={() => undefined} />);
    expect(screen.getByRole('dialog', { name: /Cómo se usa y cómo se lee/ })).toBeTruthy();
    expect(screen.getByText('Sobre la fila con el foco')).toBeTruthy();
    expect(screen.getByText('Cómo se lee')).toBeTruthy();
  });

  /** Las reglas duras que el color no puede decir solo tienen que estar escritas aquí. */
  it('explica «sin desglosar» sin llamarlo 0 %', () => {
    const { container } = render(<PanelAyuda cerrar={() => undefined} />);
    expect(screen.getByText('Sin desglosar')).toBeTruthy();
    expect(container.textContent).toMatch(/No es 0 %/);
  });

  it('Escape cierra', () => {
    let cerrado = false;
    render(<PanelAyuda cerrar={() => { cerrado = true; }} />);
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(cerrado).toBe(true);
  });
});
