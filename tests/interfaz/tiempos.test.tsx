// @vitest-environment jsdom
/**
 * La vista de Tiempos, montada en un DOM.
 *
 * `tests/dominio/duracion.test.ts` dice qué NÚMERO sale del reloj de tramos; esto dice qué
 * llega a la pantalla, que no es lo mismo: un `null` correcto pintado como `0` es la
 * mentira que la regla 21 existe para prohibir, y el dominio no puede detectarla.
 *
 * Las tres reglas duras que se vigilan aquí, y por qué son estas y no otras:
 *
 * 1. **Duración `null`, jamás `0`.** «No se midió» y «no costó tiempo» son afirmaciones
 *    opuestas y el `0` es la que engaña. Con el archivo del usuario casi todo lo cerrado
 *    es del primer tipo, así que este es el caso normal y no el raro.
 * 2. **Ningún promedio de menos de cinco tareas se muestra, y todos dicen sobre cuántas
 *    se calcularon.** «14 d» sobre una tarea se lee igual de firme que sobre cuarenta.
 * 3. **Un tramo abierto se presenta aparte y no entra en ningún promedio.** Si entrara,
 *    una tarea olvidada en `iniciado` crecería un día por cada día que pase sin que nadie
 *    la toque, que es exactamente el calendario disfrazado de trabajo que M5 mató.
 *
 * El fixture es el mismo documento sintético que congela `tests/modelo`: así los números
 * que esta prueba espera están explicados en un solo sitio y no se copian a mano.
 */

import { readFileSync } from 'node:fs';
import * as path from 'node:path';

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { validarDocumento } from '../../src/compartido/modelo/esquema';
import type { Documento } from '../../src/compartido/modelo/tipos';
import { ProveedorAlmacen } from '../../src/renderer/estado/almacen';
import { ProveedorInterfaz } from '../../src/renderer/estado/interfaz';
import { VistaTiempos } from '../../src/renderer/vistas/globales/VistaTiempos';
import { unDocumento, unProyecto, unaTarea } from '../apoyo/constructores';

const HOY = '2026-08-27';

afterEach(cleanup);

/** El hermano sintético del archivo de oro: el único documento del repo que tiene tramos. */
const CON_RELOJ: Documento = (() => {
  const crudo: unknown = JSON.parse(
    // Bajo jsdom `import.meta.url` es una URL http, no un archivo: se resuelve desde la
    // raíz del repositorio, que es donde vitest arranca.
    readFileSync(path.resolve(process.cwd(), 'tests/modelo/fixtures/documento-reloj.json'), 'utf8'),
  );
  const resultado = validarDocumento(crudo);
  if (!resultado.ok) throw new Error('el fixture del reloj no valida');
  return resultado.documento as Documento;
})();

function montar(documento: Documento) {
  return render(
    <ProveedorAlmacen>
      <ProveedorInterfaz>
        <VistaTiempos documento={documento} hoy={HOY} />
      </ProveedorInterfaz>
    </ProveedorAlmacen>,
  );
}

/** La tabla del corte vigente; la de relojes corriendo se distingue por su encabezado. */
function tablaDe(encabezado: string): HTMLElement {
  const tabla = screen
    .getAllByRole('table')
    .find((t) => within(t).queryByRole('columnheader', { name: encabezado }) !== null);
  if (tabla === undefined) throw new Error(`no hay tabla con la columna «${encabezado}»`);
  return tabla;
}

const filaDe = (tabla: HTMLElement, nombre: string | RegExp) =>
  within(tabla).getByRole('rowheader', { name: nombre }).closest('tr') as HTMLTableRowElement;

describe('cuando no hay nada que medir', () => {
  /**
   * Regla 21: sin tramos cerrados la respuesta es «no se midió», no «cero». Un `0 d` aquí
   * afirmaría que el trabajo del usuario no costó tiempo.
   */
  it('no pinta un cero: dice que el pasado no se inventa', () => {
    const { container } = montar(
      unDocumento({
        proyectos: [
          unProyecto({
            clave: 'VACIO',
            tareas: [unaTarea({ clave: 'VACIO', estado: 'done', aceptada_en: '2026-08-01T09:00:00-06:00' })],
          }),
        ],
      }),
    );
    expect(screen.getByText(/Todavía no hay ningún tiempo que medir/)).toBeTruthy();
    expect(container.textContent).not.toMatch(/0(\.0)?\s*d\b/);
    expect(container.textContent).not.toMatch(/NaN/);
  });

  /**
   * «No hay nada» y «lo que cerraste es anterior al reloj» son diagnósticos distintos, y
   * solo el segundo es accionable. La distinción vive en el conteo de aceptadas sin medir.
   */
  it('distingue «todavía no empiezas» de «se cerró antes del reloj»', () => {
    montar(
      unDocumento({
        proyectos: [
          unProyecto({
            clave: 'VACIO',
            tareas: [unaTarea({ clave: 'VACIO', estado: 'done', aceptada_en: '2026-08-01T09:00:00-06:00' })],
          }),
        ],
      }),
    );
    expect(screen.getByText(/1 tarea aceptada/)).toBeTruthy();
  });

  /**
   * El vacío no puede tragarse los relojes que sí están corriendo: si lo hiciera, una
   * tarea olvidada tres meses en `iniciado` sería invisible en la única pantalla que
   * habla de tiempo, y sería invisible justo por estar olvidada.
   */
  it('aun sin medidas, enseña los relojes que corren', () => {
    montar(
      unDocumento({
        proyectos: [
          unProyecto({
            clave: 'VACIO',
            tareas: [
              unaTarea({
                clave: 'VACIO',
                id: 'VACIO-T9',
                estado: 'iniciado',
                trabajo: [{ desde: '2026-08-10T09:00:00-06:00', hasta: null, estado: 'iniciado' }],
              }),
            ],
          }),
        ],
      }),
    );
    expect(screen.getByText(/Todavía no hay ningún tiempo que medir/)).toBeTruthy();
    const tabla = tablaDe('Corriendo desde hace');
    expect(within(tabla).getByRole('rowheader', { name: /VACIO-T9/ })).toBeTruthy();
  });
});

describe('el resumen no da un número sin su letra chica', () => {
  it('el promedio va con cuántas tareas lo componen', () => {
    montar(CON_RELOJ);
    // 10 medibles: por encima del mínimo, así que sí se promedia.
    expect(screen.getByText('1.7 d')).toBeTruthy();
    expect(screen.getByText(/10 tareas medidas/)).toBeTruthy();
  });

  /** Lo aceptado que no se pudo medir decide si el promedio habla de todo o de una parte. */
  it('dice cuántas aceptadas quedaron fuera del cálculo', () => {
    const { container } = montar(CON_RELOJ);
    expect(container.textContent).toMatch(/1 tarea aceptada sin medir/);
  });

  /** El desglose sale del `estado` que cada tramo guarda, y cada mitad va con su conteo. */
  it('el desglose desarrollo/pruebas trae sobre cuántas tareas se calculó cada mitad', () => {
    const { container } = montar(CON_RELOJ);
    expect(container.textContent).toMatch(/Desarrollo 15\.9 d sobre 10 tareas/);
    expect(container.textContent).toMatch(/Pruebas 1\.5 d sobre 3 tareas/);
  });

  /** Lo que sobra del calendario es espera, no trabajo. El cociente va con su población. */
  it('el cociente trabajado/calendario va con sobre cuántas tareas', () => {
    const { container } = montar(CON_RELOJ);
    expect(screen.getByText('55%')).toBeTruthy();
    expect(container.textContent).toMatch(/del calendario fue trabajo · sobre 10 tareas/);
  });

  /**
   * Por debajo del mínimo el cociente se calla igual que el promedio: sobre dos tareas
   * describe cuáles tocaron, no cómo trabaja nadie.
   */
  it('con menos de cinco medidas no hay cociente ni promedio, y se explica por qué', () => {
    const soloPoco: Documento = {
      ...CON_RELOJ,
      proyectos: CON_RELOJ.proyectos.filter((p) => p.clave === 'POCO'),
      sprints: [],
    };
    const { container } = montar(soloPoco);
    expect(container.textContent).toMatch(/Con menos de 5 tareas medidas no se promedia/);
    expect(container.textContent).not.toMatch(/del calendario fue trabajo/);
    // El conteo crudo sí se da: es el dato que sí se puede afirmar.
    expect(screen.getByText(/2 tareas medidas/)).toBeTruthy();
  });
});

describe('los relojes corriendo van aparte y no entran en ningún promedio', () => {
  it('lista los cuatro abiertos, el más viejo primero', () => {
    montar(CON_RELOJ);
    const tabla = tablaDe('Corriendo desde hace');
    const claves = within(tabla)
      .getAllByRole('rowheader')
      .map((th) => (th.textContent ?? '').split(' ·')[0]);
    expect(claves).toEqual(['RELOJ-T10', 'RELOJ-T11', 'RELOJ-T9', 'RELOJ-T13']);
  });

  /**
   * Regla 21: por encima del umbral el tramo ya no describe trabajo en marcha sino un
   * olvido, y se presenta como «corriendo desde hace N días». El número de días es el
   * hecho; no hay alarma ni semáforo, que sería inventar un umbral de «mal».
   */
  it('el que pasó el umbral se presenta por sus días y se nombra sin moverse', () => {
    montar(CON_RELOJ);
    const tabla = tablaDe('Corriendo desde hace');
    const olvidada = filaDe(tabla, /RELOJ-T10/);
    expect(olvidada.textContent).toMatch(/17 días/);
    expect(olvidada.textContent).toMatch(/sin moverse/);

    // Y el que no lo pasó dice los días y NADA más: no es un olvido, es trabajo en marcha.
    const enMarcha = filaDe(tabla, /RELOJ-T9/);
    expect(enMarcha.textContent).toMatch(/2 días/);
    expect(enMarcha.textContent).not.toMatch(/sin moverse/);
  });

  /** La leyenda de la tabla dice, con palabras, por qué nada de esto se suma. */
  it('la tabla declara que no entra en ningún promedio', () => {
    montar(CON_RELOJ);
    const tabla = tablaDe('Corriendo desde hace');
    expect(tabla.querySelector('caption')?.textContent).toMatch(/No entran en\s+ningún promedio/);
  });

  /**
   * La aserción que de verdad protege la regla: **el tramo abierto no está en el total.**
   *
   * `RELOJ-T13` está aceptada, tiene un tramo cerrado de 1 día y otro abierto desde el 26.
   * Aparece en las dos tablas —mide 1 día y además tiene el reloj corriendo— y su promedio
   * de proyecto no puede haberse movido por el abierto. Si alguien sumara el tramo abierto
   * contra `hoy`, el promedio de RELOJ subiría y esta comparación se rompe.
   */
  it('lo abierto no se cuela en el promedio de su proyecto', () => {
    montar(CON_RELOJ);
    const corriendo = tablaDe('Corriendo desde hace');
    expect(within(corriendo).getByRole('rowheader', { name: /RELOJ-T13/ })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Por proyecto' }));
    // 8 medibles en RELOJ y 1.8 d de promedio. El tramo abierto de T13 lleva ya un día
    // corriendo: si entrara al total, este número subiría y la comparación se rompe.
    const fila = filaDe(tablaDe('Promedio'), /Reloj de tramos/);
    expect(fila.textContent).toMatch(/1\.8 d/);
  });
});

describe('la tabla de cortes se calla lo que no puede afirmar', () => {
  it('el corte por persona no promedia a quien tiene menos de cinco medidas', () => {
    montar(CON_RELOJ);
    const tabla = tablaDe('Promedio');

    // Ana llega al mínimo: se promedia, y el conteo va al lado (regla 3).
    const ana = filaDe(tabla, /Ana López/);
    const suyas = [...ana.querySelectorAll('td')].map((td) => (td.textContent ?? '').trim());
    expect(suyas[0], 'promedio').toBe('1.9 d');
    expect(suyas[2], 'medidas').toBe('6');

    // Beto no llega: promedio y mediana dicen «—» y se explica por qué al pasar el ratón.
    // Se miran las celdas por posición y no el texto de la fila entera, porque «La más
    // lenta» SÍ trae un número —y debe traerlo—: es una tarea concreta y medida, no un
    // promedio, y el conteo crudo es justo lo que la regla pide en su lugar.
    const beto = filaDe(tabla, /Beto Ruiz/);
    const celdas = [...beto.querySelectorAll('td')].map((td) => (td.textContent ?? '').trim());
    expect(celdas[0], 'promedio').toBe('—');
    expect(celdas[1], 'mediana').toBe('—');
    expect(celdas[2], 'medidas').toBe('2');
    const callada = beto.querySelector('.tabla-tiempos__pocas');
    expect(callada?.getAttribute('title')).toMatch(/Menos de 5 tareas medidas/);
  });

  /**
   * La letra chica de cada fila: cuántas aceptadas de esa persona no se pudieron medir.
   *
   * Se afirma sobre las DOS filas a propósito, porque la mitad interesante es la negativa.
   * `RELOJ-T6` es el caso que el fixture trae preparado: está asignada hoy a Ana, pero el
   * compromiso del sprint fue de Beto. Su «sin medir» tiene que colgar de Beto —la misma
   * regla con la que se cuenta lo medido de la columna de al lado— y no de quien la tiene
   * asignada ahora. Esta prueba nació afirmando lo contrario porque describía el defecto:
   * las dos mitades de una fila se contaban con reglas distintas.
   */
  it('cada fila dice cuántas quedaron sin medir, con la misma regla que cuenta lo medido', () => {
    montar(CON_RELOJ);
    const tabla = tablaDe('Promedio');
    expect(
      filaDe(tabla, /Beto Ruiz/).textContent,
      'RELOJ-T6 la cerró Beto en el sprint',
    ).toMatch(/1 sin medir/);
    expect(
      filaDe(tabla, /Ana López/).textContent,
      'y no se le cuelga a quien solo la tiene asignada hoy',
    ).not.toMatch(/sin medir/);
  });

  /**
   * «Por equipo» es el conjunto de personas adscritas a un proyecto: un proyecto sin
   * equipo capturado no tiene equipo del que hablar, y se dice en vez de inventarle uno.
   */
  it('el corte por equipo deja fuera al proyecto sin equipo capturado', () => {
    montar(CON_RELOJ);
    fireEvent.click(screen.getByRole('button', { name: 'Por proyecto' }));
    // Control positivo: por proyecto están los dos. Sin él, «POCO no aparece» pasaría
    // igual con una tabla vacía.
    expect(within(tablaDe('Promedio')).getAllByRole('rowheader')).toHaveLength(2);

    fireEvent.click(screen.getByRole('button', { name: 'Por equipo' }));
    const equipos = within(tablaDe('Promedio'))
      .getAllByRole('rowheader')
      .map((th) => (th.textContent ?? '').trim());
    expect(equipos).toEqual(['Reloj de tramos · 1 sin medir']);
  });
});

describe('el alternador de cortes', () => {
  it('anuncia cuál está vigente con aria-pressed, no solo con color', () => {
    montar(CON_RELOJ);
    const grupo = screen.getByRole('group', { name: /Cómo agrupar los tiempos/ });
    const pulsados = within(grupo)
      .getAllByRole('button')
      .filter((b) => b.getAttribute('aria-pressed') === 'true')
      .map((b) => b.textContent);
    expect(pulsados).toEqual(['Por persona']);
  });
});
