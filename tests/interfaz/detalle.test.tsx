// @vitest-environment jsdom
/**
 * La hoja de detalle, y la puerta que la abre.
 *
 * Dos contratos distintos, y por eso dos bloques:
 *
 * 1. **La puerta.** El título de una fila es un `<button>` que abre el detalle, y el
 *    resto de la fila sigue plegando. Ese reparto es lo único que cambió de un gesto que
 *    el usuario ya tenía aprendido, así que se afirma a los dos lados: que el título abra
 *    Y que el chevron NO abra. Una prueba que solo mirara lo primero dejaría pasar la
 *    regresión que de verdad duele — que abrir el detalle se coma el plegado.
 *
 * 2. **Lo que la hoja enseña.** Descripción, criterios, bloqueos y tramos existían en el
 *    esquema sin ningún sitio donde verse. Se comprueba que se pinten y —lo más fácil de
 *    romper— que lo AUSENTE se nombre en vez de rellenarse con un cero o un guion.
 */

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { indexarTareas } from '../../src/compartido/dominio/derivar';
import type { Documento, Proyecto, Tarea } from '../../src/compartido/modelo/tipos';
import { ProveedorAlmacen } from '../../src/renderer/estado/almacen';
import { ProveedorInterfaz, useInterfaz } from '../../src/renderer/estado/interfaz';
import { Arbol } from '../../src/renderer/vistas/proyecto/Arbol';
import { HojaDetalle } from '../../src/renderer/vistas/proyecto/HojaDetalle';
import {
  unBloqueo,
  unDocumento,
  unItem,
  unProyecto,
  unSprint,
  unaEpica,
  unaHistoria,
  unaTarea,
} from '../apoyo/constructores';

const CLAVE = 'PM';
const HOY = '2026-08-27';

afterEach(cleanup);

/** Escribe en el DOM qué nodo tiene abierto el detalle. Es lo que la prueba interroga. */
function Sonda() {
  const { detalle } = useInterfaz();
  return <p data-testid="sonda">{detalle === null ? 'ninguno' : `${detalle.clase}:${detalle.id}`}</p>;
}

function montarArbol(proyecto: Proyecto) {
  return render(
    <ProveedorAlmacen>
      <ProveedorInterfaz>
        <Arbol proyecto={proyecto} sprint={undefined} hoy={HOY} etiqueta="Backlog" editable={false} />
        <Sonda />
      </ProveedorInterfaz>
    </ProveedorAlmacen>,
  );
}

const sonda = () => screen.getByTestId('sonda').textContent;

describe('la puerta al detalle', () => {
  const proyecto = () =>
    unProyecto({
      clave: CLAVE,
      epicas: [
        unaEpica({
          clave: CLAVE,
          id: 'PM-E1',
          titulo: 'Portabilidad',
          historias: [
            unaHistoria({
              clave: CLAVE,
              id: 'PM-H1',
              titulo: 'Tarea 1',
              tareas: [unaTarea({ clave: CLAVE, id: 'PM-T1', titulo: 'Sub tarea para la historia' })],
            }),
          ],
        }),
      ],
    });

  it('el título de una épica es un botón y abre su detalle', () => {
    montarArbol(proyecto());
    expect(sonda()).toBe('ninguno');
    fireEvent.click(screen.getByRole('button', { name: 'Portabilidad' }));
    expect(sonda()).toBe('epica:PM-E1');
  });

  it('el título de una tarea abre el detalle de la tarea, no el de su historia', () => {
    montarArbol(proyecto());
    // Abrir la épica y la historia para que la tarea se pinte.
    fireEvent.click(screen.getByRole('button', { name: 'Portabilidad' }).closest('[role="treeitem"]')!);
    fireEvent.click(screen.getByRole('button', { name: 'Tarea 1' }).closest('[role="treeitem"]')!);
    fireEvent.click(screen.getByRole('button', { name: 'Sub tarea para la historia' }));
    expect(sonda()).toBe('tarea:PM-T1');
  });

  /**
   * La regresión que de verdad importa: el clic en la fila —fuera del título— tiene que
   * seguir plegando y NO abrir nada. Si esto se rompe, cada intento de plegar una épica
   * abre una hoja encima del sprint.
   */
  it('el clic en el cuerpo de la fila pliega y no abre el detalle', () => {
    montarArbol(proyecto());
    const fila = screen.getAllByRole('treeitem')[0]!;
    expect(fila.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(fila);
    expect(fila.getAttribute('aria-expanded')).toBe('true');
    expect(sonda()).toBe('ninguno');
  });

  it('la tecla D sobre la fila enfocada abre su detalle', () => {
    montarArbol(proyecto());
    const fila = screen.getAllByRole('treeitem')[0]!;
    fireEvent.focus(fila);
    fireEvent.keyDown(fila, { key: 'd' });
    expect(sonda()).toBe('epica:PM-E1');
  });
});

describe('lo que la hoja enseña', () => {
  function montarHoja(
    proyecto: Proyecto,
    id: string,
    clase: 'epica' | 'historia' | 'tarea',
    editable = false,
  ) {
    const documento: Documento = unDocumento({ proyectos: [proyecto] });
    return render(
      <ProveedorAlmacen>
        <ProveedorInterfaz>
          <HojaDetalle
            documento={documento}
            proyecto={proyecto}
            sprint={undefined}
            hoy={HOY}
            detalle={{ id, clase }}
            indice={indexarTareas(documento)}
            editable={editable}
            cerrar={() => {}}
          />
        </ProveedorInterfaz>
      </ProveedorAlmacen>,
    );
  }

  it('una tarea enseña su descripción, sus criterios y el motivo entero del bloqueo', () => {
    const tarea = unaTarea({
      clave: CLAVE,
      id: 'PM-T1',
      titulo: 'Migrar el padrón',
      descripcion: 'Sacar el padrón de la base vieja y validarlo contra el acta.',
      criterios: 'Cero registros huérfanos.',
      bloqueos: [unBloqueo({ motivo: 'Falta el respaldo de la base de 2019' })],
    });
    montarHoja(unProyecto({ clave: CLAVE, tareas: [tarea] }), 'PM-T1', 'tarea');

    expect(screen.getByText(/Sacar el padrón de la base vieja/)).toBeTruthy();
    expect(screen.getByText('Cero registros huérfanos.')).toBeTruthy();
    // Dos veces: la tira del bloqueo ABIERTO arriba, y su renglón en el historial. Las
    // dos son legítimas y por eso se cuentan en vez de exigir una.
    expect(screen.getAllByText(/Falta el respaldo de la base de 2019/).length).toBe(2);
  });

  /**
   * Regla 23 y regla 2 aplicadas a la ficha: sin estimar y sin responsable son estados
   * NORMALES, y se dicen con palabras. Un `0` o un `—` se leerían como datos.
   */
  it('lo que no está definido se nombra, no se rellena con un guion', () => {
    montarHoja(
      unProyecto({ clave: CLAVE, tareas: [unaTarea({ clave: CLAVE, id: 'PM-T1' })] }),
      'PM-T1',
      'tarea',
    );
    expect(screen.getByText('sin estimar')).toBeTruthy();
    expect(screen.getAllByText('sin definir').length).toBeGreaterThan(0);
    expect(screen.getByText('Sin descripción.')).toBeTruthy();
    expect(screen.queryByText('—')).toBeNull();
  });

  it('una épica lista sus historias y, aparte, las tareas que le cuelgan sin historia', () => {
    const proyecto = unProyecto({
      clave: CLAVE,
      epicas: [
        unaEpica({
          clave: CLAVE,
          id: 'PM-E1',
          titulo: 'Habilitación de red',
          historias: [unaHistoria({ clave: CLAVE, id: 'PM-H1', titulo: 'Cableado' })],
          tareas: [unaTarea({ clave: CLAVE, id: 'PM-T1', titulo: 'Inventario de servidores' })],
        }),
      ],
    });
    const { container } = montarHoja(proyecto, 'PM-E1', 'epica');

    expect(screen.getByText('Cableado')).toBeTruthy();
    expect(screen.getByText('Inventario de servidores')).toBeTruthy();
    const secciones = [...container.querySelectorAll('.detalle__seccion-titulo')].map(
      (n) => n.textContent,
    );
    expect(secciones).toContain('Historias · 1');
    expect(secciones).toContain('Tareas sueltas · 1');
  });

  /** Borrar el nodo con la hoja abierta no puede dejar una ficha con un id fantasma. */
  it('un nodo que ya no existe no pinta nada', () => {
    const { container } = montarHoja(unProyecto({ clave: CLAVE }), 'PM-T99', 'tarea');
    expect(container.querySelector('.panel--detalle')).toBeNull();
  });

  it('el detalle de una historia sin tareas dice que está sin desglosar', () => {
    const proyecto = unProyecto({
      clave: CLAVE,
      epicas: [
        unaEpica({
          clave: CLAVE,
          id: 'PM-E1',
          historias: [unaHistoria({ clave: CLAVE, id: 'PM-H1', titulo: 'Cableado', tareas: [] })],
        }),
      ],
    });
    montarHoja(proyecto, 'PM-H1', 'historia');
    expect(screen.getByText(/nadie ha escrito sus tareas/)).toBeTruthy();
    expect(within(screen.getByLabelText('Detalle de PM-H1')).queryByText('0%')).toBeNull();
  });
});

describe('lo que la hoja deja hacer', () => {
  const conTramos = () =>
    unaTarea({
      clave: CLAVE,
      id: 'PM-T1',
      estado: 'iniciado',
      trabajo: [
        { desde: '2026-08-01T09:00:00-06:00', hasta: '2026-08-02T09:00:00-06:00', estado: 'iniciado' },
        { desde: '2026-08-10T09:00:00-06:00', hasta: '2026-08-11T09:00:00-06:00', estado: 'iniciado' },
      ],
    });

  function montar(editable: boolean) {
    const proyecto = unProyecto({ clave: CLAVE, tareas: [conTramos()] });
    const documento: Documento = unDocumento({ proyectos: [proyecto] });
    return render(
      <ProveedorAlmacen>
        <ProveedorInterfaz>
          <HojaDetalle
            documento={documento}
            proyecto={proyecto}
            sprint={undefined}
            hoy={HOY}
            detalle={{ id: 'PM-T1', clase: 'tarea' }}
            indice={indexarTareas(documento)}
            editable={editable}
            cerrar={() => {}}
          />
        </ProveedorInterfaz>
      </ProveedorAlmacen>,
    );
  }

  /**
   * Regla 21: la duración es la SUMA de los tramos. Los dos tramos duran un día cada uno
   * con una semana de pausa en medio: `fin − inicio` daría 10 días, y ese 10 es
   * exactamente el número que esta prueba existe para que no aparezca.
   */
  it('el tiempo en desarrollo suma los tramos y no resta dos fechas', () => {
    montar(false);
    expect(screen.getByText(/2 días · 2 tramos/)).toBeTruthy();
    expect(screen.queryByText(/10 días/)).toBeNull();
  });

  /** Regla 19: elegir un estado CONCRETO vive en el detalle, no en la fila. */
  it('con permiso de escritura ofrece los cinco estados y marca el vigente', () => {
    montar(true);
    const grupo = screen.getByRole('group', { name: 'Estado de PM-T1' });
    const botones = within(grupo).getAllByRole('button');
    expect(botones.map((b) => b.textContent)).toEqual([
      'Pendiente',
      'Iniciado',
      'En pruebas',
      'Terminado',
      'Done',
      'Cancelar',
    ]);
    expect(within(grupo).getByRole('button', { name: 'Iniciado' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
  });

  it('en solo lectura no se ofrece ningún estado', () => {
    montar(false);
    expect(screen.queryByRole('group', { name: 'Estado de PM-T1' })).toBeNull();
  });
});

/**
 * Las dos secciones que M5 estrenó en la hoja: «Tiempo en desarrollo» y «Resolución».
 *
 * Son las que traducen el reloj de tramos a palabras, y por eso son las que pueden
 * mentir de las tres formas que la regla 21 prohíbe: pintar un `0` donde no hubo medida,
 * sumar el tramo abierto, y dar un total sin decir de cuántos tramos sale. Lo que se
 * afirma abajo son esas tres cosas y sus ausencias, que es donde el fallo se esconde:
 * una sección que no se pinta no rompe nada y no se ve.
 */
describe('el reloj de tramos en la hoja', () => {
  const t = (f: string, h: string) => `2026-08-${f}T${h}:00:00-06:00`;

  /** Monta la hoja de UNA tarea, con los sprints que la prueba necesite. */
  function montarTarea(tarea: Tarea, sprints: Documento['sprints'] = []) {
    const proyecto = unProyecto({ clave: CLAVE, tareas: [tarea] });
    const documento: Documento = unDocumento({ proyectos: [proyecto], sprints });
    return render(
      <ProveedorAlmacen>
        <ProveedorInterfaz>
          <HojaDetalle
            documento={documento}
            proyecto={proyecto}
            sprint={undefined}
            hoy={HOY}
            detalle={{ id: tarea.id, clase: 'tarea' }}
            indice={indexarTareas(documento)}
            editable={false}
            cerrar={() => {}}
          />
        </ProveedorInterfaz>
      </ProveedorAlmacen>,
    );
  }

  /** El texto de una sección por su título, para no afirmar sobre la hoja entera. */
  function seccion(titulo: string): string {
    const encabezados = [...document.querySelectorAll('.detalle__seccion-titulo')];
    const encontrado = encabezados.find((h) => (h.textContent ?? '').startsWith(titulo));
    if (encontrado === undefined) throw new Error(`no hay sección «${titulo}»`);
    return (encontrado.parentElement as HTMLElement).textContent ?? '';
  }

  const tituloDeSecciones = () =>
    [...document.querySelectorAll('.detalle__seccion-titulo')].map((n) => n.textContent);

  // --- «Tiempo en desarrollo» -----------------------------------------------

  /**
   * La regla dura, en la pantalla: `null` es «no se midió», nunca «costó cero».
   *
   * Es el caso NORMAL del archivo del usuario, no el raro: los tramos empiezan a existir
   * con M5 y todo lo cerrado antes llega sin uno solo. Un `0 días` aquí afirmaría que ese
   * trabajo no costó tiempo, que es la misma mentira que el `0 %` de la regla 2.
   */
  it('sin tramos dice que no se midió, y no escribe ningún cero', () => {
    montarTarea(unaTarea({ clave: CLAVE, id: 'PM-T1', estado: 'done', aceptada_en: t('20', '09') }));
    const texto = seccion('Tiempo en desarrollo');
    expect(texto).toMatch(/Sin tramos cerrados/);
    expect(texto).toMatch(/No significa cero trabajo/);
    expect(texto).not.toMatch(/\b0([.,]\d)?\s*días?\b/);
    expect(texto).not.toMatch(/NaN/);
  });

  /** Un total sin su conteo de tramos es un número suelto: `2` significa que se retomó. */
  it('el total va con cuántos tramos lo componen', () => {
    montarTarea(
      unaTarea({
        clave: CLAVE,
        id: 'PM-T1',
        estado: 'done',
        trabajo: [
          { desde: t('01', '09'), hasta: t('02', '09'), estado: 'iniciado' },
          { desde: t('10', '09'), hasta: t('11', '09'), estado: 'iniciado' },
        ],
      }),
    );
    expect(seccion('Tiempo en desarrollo')).toMatch(/2 días · 2 tramos/);
  });

  /**
   * El desglose sale del `estado` que cada tramo guarda —por eso lo guarda—, y la mitad
   * que no existe se NOMBRA. Un `0 días` de pruebas diría «se probó y no costó nada»
   * cuando lo cierto es que esa tarea nunca pasó por pruebas.
   */
  it('el desglose nombra la mitad que no se midió en vez de ponerle un cero', () => {
    montarTarea(
      unaTarea({
        clave: CLAVE,
        id: 'PM-T1',
        estado: 'iniciado',
        trabajo: [{ desde: t('01', '09'), hasta: t('03', '09'), estado: 'iniciado' }],
      }),
    );
    const texto = seccion('Tiempo en desarrollo');
    expect(texto).toMatch(/Desarrollo 2 días/);
    expect(texto).toMatch(/sin pruebas medidas/);
    expect(texto).not.toMatch(/pruebas 0/);
  });

  it('y con las dos mitades medidas las da las dos', () => {
    montarTarea(
      unaTarea({
        clave: CLAVE,
        id: 'PM-T1',
        estado: 'done',
        trabajo: [
          { desde: t('01', '09'), hasta: t('03', '09'), estado: 'iniciado' },
          { desde: t('05', '09'), hasta: t('06', '09'), estado: 'en_pruebas' },
        ],
      }),
    );
    const texto = seccion('Tiempo en desarrollo');
    expect(texto).toMatch(/Desarrollo 2 días/);
    expect(texto).toMatch(/pruebas 1 día/);
  });

  /**
   * El tramo abierto: se presenta como «corriendo desde hace N días» y se dice, con
   * palabras, que NO entra en el total.
   *
   * El total de esta tarea es 1 día —el tramo cerrado— aunque el abierto lleve 17 días
   * corriendo. Si el abierto se sumara, el total diría 18 y crecería solo un día más cada
   * día: la mentira de calendario que este reloj existe para no dar.
   */
  it('el tramo abierto se presenta aparte y se declara fuera del total', () => {
    montarTarea(
      unaTarea({
        clave: CLAVE,
        id: 'PM-T1',
        estado: 'iniciado',
        trabajo: [
          { desde: t('01', '09'), hasta: t('02', '09'), estado: 'iniciado' },
          { desde: t('10', '09'), hasta: null, estado: 'iniciado' },
        ],
      }),
    );
    const texto = seccion('Tiempo en desarrollo');
    expect(texto).toMatch(/1 día · 1 tramo/);
    expect(texto).toMatch(/Corriendo desde hace 17 días/);
    expect(texto).toMatch(/No entra\s+en el total/);
    expect(texto).not.toMatch(/18 días/);
  });

  /** Cada tramo se puede auditar a mano: el abierto se dice «corriendo», no con un final. */
  it('lista los tramos y al abierto no le inventa un final', () => {
    montarTarea(
      unaTarea({
        clave: CLAVE,
        id: 'PM-T1',
        estado: 'en_pruebas',
        trabajo: [
          { desde: t('01', '09'), hasta: t('02', '09'), estado: 'iniciado' },
          { desde: t('10', '09'), hasta: null, estado: 'en_pruebas' },
        ],
      }),
    );
    const renglones = [...document.querySelectorAll('.detalle__tramos li')].map(
      (li) => li.textContent ?? '',
    );
    expect(renglones).toHaveLength(2);
    expect(renglones[0]).toMatch(/Iniciado$/);
    expect(renglones[1]).toMatch(/corriendo/);
    expect(renglones[1]).toMatch(/En pruebas$/);
  });

  // --- «Resolución» ---------------------------------------------------------

  /**
   * Lo que COSTÓ contra lo que TARDÓ. La diferencia es espera —cola, bloqueo, revisión
   * ajena— y el reloj que murió en M5 la contaba como trabajo.
   */
  it('la resolución da los días trabajados junto a los de calendario', () => {
    montarTarea(
      unaTarea({
        clave: CLAVE,
        id: 'PM-T1',
        estado: 'done',
        aceptada_en: t('12', '09'),
        trabajo: [
          { desde: t('01', '09'), hasta: t('02', '09'), estado: 'iniciado' },
          { desde: t('10', '09'), hasta: t('11', '09'), estado: 'iniciado' },
        ],
      }),
    );
    const texto = seccion('Resolución');
    expect(texto).toMatch(/2 días trabajados/);
    expect(texto).toMatch(/10 días de calendario/);
  });

  /**
   * Regla 4 y regla 21: la resolución mide lo ACEPTADO. `terminado` es «lo entregué», no
   * «lo acepto», y una sección de resolución sobre algo que nadie aceptó afirmaría que el
   * trabajo cerró cuando lo que falta es justo quien lo revisa.
   */
  it('no hay resolución sin `done`, aunque haya tramos que sumar', () => {
    montarTarea(
      unaTarea({
        clave: CLAVE,
        id: 'PM-T1',
        estado: 'terminado',
        trabajo: [{ desde: t('01', '09'), hasta: t('03', '09'), estado: 'iniciado' }],
      }),
    );
    // Control positivo: el tiempo SÍ se mide, así que la ausencia de la resolución no es
    // que la tarea no tenga tramos.
    expect(seccion('Tiempo en desarrollo')).toMatch(/2 días · 1 tramo/);
    expect(tituloDeSecciones()).not.toContain('Resolución');
  });

  /** Aceptada sin un solo tramo: no hay nada que resolver en días, y no se inventa un 0. */
  it('tampoco hay resolución sin un solo tramo cerrado', () => {
    montarTarea(
      unaTarea({ clave: CLAVE, id: 'PM-T1', estado: 'done', aceptada_en: t('20', '09') }),
    );
    expect(tituloDeSecciones()).not.toContain('Resolución');
  });

  /**
   * La duración ya NO depende del sprint (regla 21): una tarea cerrada fuera de todo
   * sprint sí tiene duración, y era uno de los tres defectos que M5 mató.
   */
  it('una tarea cerrada fuera de todo sprint sí se resuelve, y no nombra ningún sprint', () => {
    montarTarea(
      unaTarea({
        clave: CLAVE,
        id: 'PM-T1',
        estado: 'done',
        aceptada_en: t('03', '09'),
        trabajo: [{ desde: t('01', '09'), hasta: t('03', '09'), estado: 'iniciado' }],
      }),
    );
    const texto = seccion('Resolución');
    expect(texto).toMatch(/2 días trabajados/);
    expect(texto).not.toMatch(/sprint/i);
  });

  /**
   * El arrastre se cuenta en sprints, que es su unidad, y se dice que NO está dentro de
   * los días: sin esa frase el lector suma dos magnitudes distintas.
   */
  it('el arrastre se cuenta en sprints y se declara fuera de los días', () => {
    const tarea = unaTarea({
      clave: CLAVE,
      id: 'PM-T1',
      estado: 'done',
      aceptada_en: t('12', '09'),
      trabajo: [{ desde: t('01', '09'), hasta: t('02', '09'), estado: 'iniciado' }],
    });
    montarTarea(tarea, [
      unSprint({ estado: 'cerrado', clave: null, items: [unItem('PM-T1')] }),
      unSprint({ estado: 'cerrado', clave: null, items: [unItem('PM-T1')] }),
    ]);
    const texto = seccion('Resolución');
    expect(texto).toMatch(/Pasó por 2 sprints/);
    expect(texto).toMatch(/no está dentro de los días/);
  });
});
