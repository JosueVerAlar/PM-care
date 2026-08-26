/**
 * `src/compartido/dominio/cierre.ts` — el cálculo de la pantalla de cierre.
 *
 * Módulo puro y sin una sola prueba hasta ahora. Lo que este archivo protege:
 *
 * - **El reparto en bloques es una decisión de dominio, no de la vista.** Sobre todo las
 *   dos esquinas que no se leen del código de un vistazo: una tarea hecha *y* bloqueada,
 *   y una cancelada que NO pide decisión aunque siga abierta la pregunta de qué hacer
 *   con ella.
 * - **Lo que la pantalla promete y lo que el comando pide son la misma cosa.** Por eso
 *   hay pruebas de ESLABÓN que componen las dos capas: `decisionesParaComando` alimenta
 *   al reductor de verdad, y `siguienteSprintPlaneado` se compara con el sprint que el
 *   reductor elige de verdad. Probar cada lado por su cuenta deja pasar justamente el
 *   fallo que importa: que los dos criterios se separen.
 * - **`resumenTrasCierre` lee lo que QUEDÓ**, incluidos documentos viejos con
 *   `no_terminada`, sin romperse ni contar de más.
 */

import { describe, expect, it } from 'vitest';

import {
  DESTINOS,
  DESTINO_POR_OMISION,
  bloquesDeCierre,
  decisionesParaComando,
  destinoDe,
  primerSprintPlaneado,
  resumenTrasCierre,
  resumirDecisiones,
  siguienteSprintPlaneado,
  type DestinoCierre,
  type MapaDestinos,
} from '../../src/compartido/dominio/cierre';
import { validarDocumento } from '../../src/compartido/modelo/esquema';
import type {
  Documento,
  Persona,
  Sprint,
  Tarea,
} from '../../src/compartido/modelo/tipos';
import { reducir } from '../../src/principal/comandos/reductor';
import { validarComando } from '../../src/principal/comandos/tipos';
import { AHORA, HOY, exigirOk, exigirValido } from '../apoyo/comandos';
import {
  unBloqueo,
  unDocumento,
  unaEpica,
  unaHistoria,
  unaPersona,
  unProyecto,
  unSprint,
  unaTarea,
  unItem,
} from '../apoyo/constructores';

const CLAVE = 'PM';

/** Documento de un solo proyecto con las tareas dadas. Se exige válido: un fixture roto mentiría. */
function docCon(tareas: Tarea[], sprints: Sprint[], personas: Persona[] = []): Documento {
  const doc = unDocumento({
    personas,
    proyectos: [
      unProyecto({
        clave: CLAVE,
        epicas: [unaEpica({ clave: CLAVE, historias: [unaHistoria({ clave: CLAVE, tareas })] })],
      }),
    ],
    sprints,
  });
  exigirValido(doc, 'fixture de cierre');
  return doc;
}

const idsDe = (filas: { ubicacion: { tarea: Tarea } }[]): string[] =>
  filas.map((f) => f.ubicacion.tarea.id);

/** El sprint que se cierra en casi todas las pruebas de bloques. */
function sprintCon(ids: readonly string[], over: Partial<Sprint> = {}): Sprint {
  return unSprint({
    id: 'S-34',
    nombre: 'Sprint 34',
    estado: 'activo',
    inicio: '2026-08-24',
    fin: '2026-09-04',
    items: ids.map((id) => unItem(id)),
    ...over,
  });
}

// --- bloquesDeCierre --------------------------------------------------------

describe('bloquesDeCierre — el reparto en bloques', () => {
  /** Una por bloque, comprometidas en ese orden. */
  function cuatroBloques(): Documento {
    const tareas = [
      unaTarea({ id: 'PM-T1', clave: CLAVE, estado: 'hecha' }),
      unaTarea({ id: 'PM-T2', clave: CLAVE, estado: 'en_curso' }),
      unaTarea({ id: 'PM-T3', clave: CLAVE, estado: 'pendiente', bloqueos: [unBloqueo()] }),
      unaTarea({ id: 'PM-T4', clave: CLAVE, estado: 'cancelada' }),
    ];
    return docCon(tareas, [sprintCon(['PM-T1', 'PM-T2', 'PM-T3', 'PM-T4'])]);
  }

  it('reparte cada item según el estado de SU tarea, no según el item', () => {
    const doc = cuatroBloques();
    const bloques = bloquesDeCierre(doc, doc.sprints[0]!, HOY);
    expect(idsDe(bloques.terminadas)).toEqual(['PM-T1']);
    expect(idsDe(bloques.sinTerminar)).toEqual(['PM-T2']);
    expect(idsDe(bloques.bloqueadas)).toEqual(['PM-T3']);
    expect(idsDe(bloques.canceladas)).toEqual(['PM-T4']);
  });

  it('una tarea HECHA y además BLOQUEADA cae en terminadas, no en bloqueadas', () => {
    // La esquina que el código resuelve por el orden de los `else if` y que ninguna
    // prueba fijaba. Preguntar si algo terminado sigue detenido no significa nada, así
    // que el estado gana sobre la bandera. Queda congelado: si algún día el bloqueo
    // abierto pasa a mandar, esta prueba es la que avisa.
    const tareas = [
      unaTarea({ id: 'PM-T1', clave: CLAVE, estado: 'hecha', bloqueos: [unBloqueo()] }),
    ];
    const doc = docCon(tareas, [sprintCon(['PM-T1'])]);
    const bloques = bloquesDeCierre(doc, doc.sprints[0]!, HOY);

    expect(idsDe(bloques.terminadas)).toEqual(['PM-T1']);
    expect(bloques.bloqueadas).toEqual([]);
    // Y el bloqueo abierto sigue viajando en la fila: se pinta, aunque no reparta.
    expect(bloques.terminadas[0]?.bloqueo?.motivo).toBe('Esperando al proveedor');
    expect(bloques.terminadas[0]?.diasDetenida).toBe(6);
    // No pide decisión: el reductor rechaza una decisión sobre algo ya hecho.
    expect(bloques.terminadas[0]?.decide).toBe(false);
    expect(bloques.aDecidir).toEqual([]);
  });

  it('una CANCELADA y bloqueada cae en canceladas: lo ya decidido gana sobre la bandera', () => {
    const tareas = [
      unaTarea({ id: 'PM-T1', clave: CLAVE, estado: 'cancelada', bloqueos: [unBloqueo()] }),
    ];
    const doc = docCon(tareas, [sprintCon(['PM-T1'])]);
    const bloques = bloquesDeCierre(doc, doc.sprints[0]!, HOY);
    expect(idsDe(bloques.canceladas)).toEqual(['PM-T1']);
    expect(bloques.bloqueadas).toEqual([]);
  });

  it('un bloqueo YA CERRADO no manda: la tarea vuelve a «sin terminar»', () => {
    const tareas = [
      unaTarea({
        id: 'PM-T1',
        clave: CLAVE,
        estado: 'en_curso',
        bloqueos: [unBloqueo({ desbloqueada_en: '2026-08-25T09:00:00-06:00' })],
      }),
    ];
    const doc = docCon(tareas, [sprintCon(['PM-T1'])]);
    const bloques = bloquesDeCierre(doc, doc.sprints[0]!, HOY);
    expect(idsDe(bloques.sinTerminar)).toEqual(['PM-T1']);
    expect(bloques.bloqueadas).toEqual([]);
    expect(bloques.sinTerminar[0]?.bloqueo).toBeNull();
    expect(bloques.sinTerminar[0]?.diasDetenida).toBeNull();
  });

  it('aDecidir son las sin terminar y las bloqueadas, en ese orden y sin canceladas', () => {
    const doc = cuatroBloques();
    const bloques = bloquesDeCierre(doc, doc.sprints[0]!, HOY);
    expect(idsDe(bloques.aDecidir)).toEqual(['PM-T2', 'PM-T3']);
  });

  it('el orden dentro de cada bloque es el de items, que ES la prioridad del sprint', () => {
    const tareas = [
      unaTarea({ id: 'PM-T1', clave: CLAVE, estado: 'pendiente' }),
      unaTarea({ id: 'PM-T2', clave: CLAVE, estado: 'pendiente' }),
      unaTarea({ id: 'PM-T3', clave: CLAVE, estado: 'pendiente' }),
    ];
    // El array del sprint va al revés que el árbol a propósito: si el reparto ordenara
    // por el árbol, esta prueba se pondría roja.
    const doc = docCon(tareas, [sprintCon(['PM-T3', 'PM-T1', 'PM-T2'])]);
    const bloques = bloquesDeCierre(doc, doc.sprints[0]!, HOY);
    expect(idsDe(bloques.sinTerminar)).toEqual(['PM-T3', 'PM-T1', 'PM-T2']);
  });

  it('total es la suma de los cuatro bloques, canceladas incluidas: es el denominador de «N de M»', () => {
    const doc = cuatroBloques();
    const bloques = bloquesDeCierre(doc, doc.sprints[0]!, HOY);
    expect(bloques.total).toBe(4);
    expect(
      bloques.terminadas.length +
        bloques.sinTerminar.length +
        bloques.bloqueadas.length +
        bloques.canceladas.length,
    ).toBe(bloques.total);
  });

  it('un sprint sin items da los cuatro bloques vacíos y total 0, nunca NaN', () => {
    const doc = docCon([unaTarea({ id: 'PM-T1', clave: CLAVE })], [sprintCon([])]);
    const bloques = bloquesDeCierre(doc, doc.sprints[0]!, HOY);
    expect(bloques.terminadas).toEqual([]);
    expect(bloques.sinTerminar).toEqual([]);
    expect(bloques.bloqueadas).toEqual([]);
    expect(bloques.canceladas).toEqual([]);
    expect(bloques.aDecidir).toEqual([]);
    expect(bloques.total).toBe(0);
    expect(bloques.sprint).toBe(doc.sprints[0]);
  });

  it('la fila lleva el compromiso EFECTIVO: lo del item gana, y lo que falta lo pone la tarea', () => {
    const personas = [
      unaPersona({ id: 'ana', nombre: 'Ana' }),
      unaPersona({ id: 'beto', nombre: 'Beto' }),
    ];
    const tareas = [
      unaTarea({
        id: 'PM-T1',
        clave: CLAVE,
        estado: 'pendiente',
        responsable: 'ana',
        prioridad: 'baja',
        fecha_limite: '2026-10-01',
      }),
    ];
    const doc = docCon(
      tareas,
      [sprintCon([], { items: [unItem('PM-T1', { responsable: 'beto', prioridad: 'alta' })] })],
      personas,
    );
    const fila = bloquesDeCierre(doc, doc.sprints[0]!, HOY).sinTerminar[0];
    expect(fila?.compromiso).toEqual({
      responsable: 'beto', // el del item
      prioridad: 'alta', // el del item
      fechaLimite: '2026-10-01', // el item no la tiene: la pone la tarea
    });
  });

  it('pasos cuenta los sprints por los que pasó, este incluido: es el «3.er sprint» de la fila', () => {
    const tareas = [unaTarea({ id: 'PM-T1', clave: CLAVE, estado: 'pendiente' })];
    const doc = docCon(tareas, [
      unSprint({
        id: 'S-32',
        nombre: 'Sprint 32',
        estado: 'cerrado',
        inicio: '2026-07-13',
        fin: '2026-07-24',
        items: [unItem('PM-T1', { desenlace: 'arrastrada' })],
      }),
      unSprint({
        id: 'S-33',
        nombre: 'Sprint 33',
        estado: 'cerrado',
        inicio: '2026-07-27',
        fin: '2026-08-07',
        items: [unItem('PM-T1', { desenlace: 'arrastrada' })],
      }),
      sprintCon(['PM-T1']),
    ]);
    const bloques = bloquesDeCierre(doc, doc.sprints[2]!, HOY);
    expect(bloques.sinTerminar[0]?.pasos).toBe(3);
  });

  it('nuevo marca la procedencia (regla 17), que es un canal aparte del estado', () => {
    const tareas = [
      unaTarea({ id: 'PM-T1', clave: CLAVE, estado: 'pendiente', planeada: false }),
      unaTarea({ id: 'PM-T2', clave: CLAVE, estado: 'pendiente', planeada: true }),
      // Emergente pero ya cerrada: la marca es de lo que sigue vivo.
      unaTarea({ id: 'PM-T3', clave: CLAVE, estado: 'hecha', planeada: false }),
    ];
    const doc = docCon(tareas, [sprintCon(['PM-T1', 'PM-T2', 'PM-T3'])]);
    const bloques = bloquesDeCierre(doc, doc.sprints[0]!, HOY);
    expect(bloques.sinTerminar.map((f) => f.nuevo)).toEqual([true, false]);
    expect(bloques.terminadas[0]?.nuevo).toBe(false);
  });

  it('decide vale true en las canceladas aunque no estén en aDecidir: queda documentado', () => {
    // Comportamiento vigente, no aprobación. `decide` se calcula como «no está hecha», así
    // que una cancelada lo lleva en true pese a que su desenlace se constata y el reductor
    // rechaza cualquier decisión sobre ella. Hoy nadie lo lee en el renderer; si alguien
    // empieza a usarlo para pintar el selector de destino, pintaría uno que el reductor
    // rechaza. Esta prueba es la que se pone roja el día que se corrija.
    const doc = docCon([unaTarea({ id: 'PM-T1', clave: CLAVE, estado: 'cancelada' })], [
      sprintCon(['PM-T1']),
    ]);
    const bloques = bloquesDeCierre(doc, doc.sprints[0]!, HOY);
    expect(bloques.canceladas[0]?.decide).toBe(true);
    expect(bloques.aDecidir).toEqual([]);
  });
});

// --- destinoDe --------------------------------------------------------------

describe('destinoDe — lo no nombrado va a siguiente', () => {
  const doc = docCon(
    [
      unaTarea({ id: 'PM-T1', clave: CLAVE, estado: 'pendiente' }),
      unaTarea({ id: 'PM-T2', clave: CLAVE, estado: 'pendiente' }),
    ],
    [sprintCon(['PM-T1', 'PM-T2'])],
  );
  const bloques = bloquesDeCierre(doc, doc.sprints[0]!, HOY);

  it('el destino por omisión es siguiente, y es uno de los tres del contrato', () => {
    expect(DESTINO_POR_OMISION).toBe('siguiente');
    expect(DESTINOS).toEqual(['siguiente', 'backlog', 'descartar']);
  });

  it('una fila que no está en el mapa vale siguiente: el mapa solo lleva EXCEPCIONES', () => {
    expect(destinoDe(bloques.aDecidir[0]!, new Map())).toBe('siguiente');
  });

  it('lo que el usuario marcó gana', () => {
    const destinos: MapaDestinos = new Map<string, DestinoCierre>([['PM-T2', 'descartar']]);
    expect(destinoDe(bloques.aDecidir[0]!, destinos)).toBe('siguiente');
    expect(destinoDe(bloques.aDecidir[1]!, destinos)).toBe('descartar');
  });
});

// --- resumirDecisiones ------------------------------------------------------

describe('resumirDecisiones — lo que dice el botón antes de pulsarlo', () => {
  /** Hecha, cancelada y tres abiertas, una por destino. */
  function conLosCincoCasos(): { doc: Documento; destinos: MapaDestinos } {
    const tareas = [
      unaTarea({ id: 'PM-T1', clave: CLAVE, estado: 'hecha' }),
      unaTarea({ id: 'PM-T2', clave: CLAVE, estado: 'cancelada' }),
      unaTarea({ id: 'PM-T3', clave: CLAVE, estado: 'en_curso' }),
      unaTarea({ id: 'PM-T4', clave: CLAVE, estado: 'pendiente' }),
      unaTarea({ id: 'PM-T5', clave: CLAVE, estado: 'pendiente' }),
    ];
    const doc = docCon(tareas, [
      sprintCon(['PM-T1', 'PM-T2', 'PM-T3', 'PM-T4', 'PM-T5']),
    ]);
    const destinos: MapaDestinos = new Map<string, DestinoCierre>([
      ['PM-T4', 'backlog'],
      ['PM-T5', 'descartar'],
    ]);
    return { doc, destinos };
  }

  it('cuenta los tres destinos y deja lo constatado en su propia casilla', () => {
    const { doc, destinos } = conLosCincoCasos();
    const resumen = resumirDecisiones(bloquesDeCierre(doc, doc.sprints[0]!, HOY), destinos);
    expect(resumen).toMatchObject({
      terminadas: 1,
      canceladas: 1,
      siguiente: 1,
      backlog: 1,
      descartar: 1,
      total: 5,
    });
  });

  it('las cinco casillas suman el total: ninguna tarea se cuenta dos veces ni se pierde', () => {
    const { doc, destinos } = conLosCincoCasos();
    const r = resumirDecisiones(bloquesDeCierre(doc, doc.sprints[0]!, HOY), destinos);
    expect(r.terminadas + r.canceladas + r.siguiente + r.backlog + r.descartar).toBe(r.total);
  });

  it('un mapa vacío manda TODO lo abierto a siguiente, y lo constatado no se mueve', () => {
    const { doc } = conLosCincoCasos();
    const r = resumirDecisiones(bloquesDeCierre(doc, doc.sprints[0]!, HOY), new Map());
    expect(r).toMatchObject({ terminadas: 1, canceladas: 1, siguiente: 3, backlog: 0, descartar: 0 });
  });

  it('sinResponsable son solo las que pasan al siguiente sprint, en el orden de la pantalla', () => {
    const personas = [unaPersona({ id: 'ana', nombre: 'Ana' })];
    const tareas = [
      unaTarea({ id: 'PM-T1', clave: CLAVE, estado: 'pendiente' }), // sin nadie → siguiente
      unaTarea({ id: 'PM-T2', clave: CLAVE, estado: 'pendiente', responsable: 'ana' }),
      unaTarea({ id: 'PM-T3', clave: CLAVE, estado: 'pendiente' }), // sin nadie, pero al backlog
      unaTarea({ id: 'PM-T4', clave: CLAVE, estado: 'pendiente' }), // sin nadie → siguiente
    ];
    const doc = docCon(tareas, [sprintCon(['PM-T1', 'PM-T2', 'PM-T3', 'PM-T4'])], personas);
    const destinos: MapaDestinos = new Map<string, DestinoCierre>([['PM-T3', 'backlog']]);
    const r = resumirDecisiones(bloquesDeCierre(doc, doc.sprints[0]!, HOY), destinos);
    expect(idsDe(r.sinResponsable)).toEqual(['PM-T1', 'PM-T4']);
  });

  it('un responsable que solo vive en el item ya cuenta: nadie avisa de lo que sí tiene dueño', () => {
    const personas = [unaPersona({ id: 'ana', nombre: 'Ana' })];
    const tareas = [unaTarea({ id: 'PM-T1', clave: CLAVE, estado: 'pendiente' })];
    const doc = docCon(
      tareas,
      [sprintCon([], { items: [unItem('PM-T1', { responsable: 'ana' })] })],
      personas,
    );
    const r = resumirDecisiones(bloquesDeCierre(doc, doc.sprints[0]!, HOY), new Map());
    expect(r.sinResponsable).toEqual([]);
    expect(r.siguiente).toBe(1);
  });
});

// --- decisionesParaComando --------------------------------------------------

describe('decisionesParaComando — lo que viaja en el comando', () => {
  function conTodo(): Documento {
    const tareas = [
      unaTarea({ id: 'PM-T1', clave: CLAVE, estado: 'hecha' }),
      unaTarea({ id: 'PM-T2', clave: CLAVE, estado: 'cancelada' }),
      unaTarea({ id: 'PM-T3', clave: CLAVE, estado: 'en_curso' }),
      unaTarea({ id: 'PM-T4', clave: CLAVE, estado: 'pendiente', bloqueos: [unBloqueo()] }),
    ];
    return docCon(tareas, [sprintCon(['PM-T1', 'PM-T2', 'PM-T3', 'PM-T4'])]);
  }

  it('manda TODAS las que piden decisión, incluidas las que quedaron en la omisión', () => {
    const doc = conTodo();
    const bloques = bloquesDeCierre(doc, doc.sprints[0]!, HOY);
    const destinos: MapaDestinos = new Map<string, DestinoCierre>([['PM-T4', 'backlog']]);
    expect(decisionesParaComando(bloques, destinos)).toEqual([
      { tareaId: 'PM-T3', destino: 'siguiente' },
      { tareaId: 'PM-T4', destino: 'backlog' },
    ]);
  });

  it('nunca manda una terminada ni una cancelada: el reductor rechazaría el comando entero', () => {
    const doc = conTodo();
    const decisiones = decisionesParaComando(bloquesDeCierre(doc, doc.sprints[0]!, HOY), new Map());
    expect(decisiones.map((d) => d.tareaId)).not.toContain('PM-T1');
    expect(decisiones.map((d) => d.tareaId)).not.toContain('PM-T2');
  });

  it('un sprint sin nada pendiente produce una lista vacía, no una decisión inventada', () => {
    const doc = docCon([unaTarea({ id: 'PM-T1', clave: CLAVE, estado: 'hecha' })], [
      sprintCon(['PM-T1']),
    ]);
    expect(decisionesParaComando(bloquesDeCierre(doc, doc.sprints[0]!, HOY), new Map())).toEqual([]);
  });

  it('ESLABÓN: lo que produce pasa el validador de payload y el reductor lo acepta', () => {
    // La prueba que ninguna de las dos capas da por su cuenta. Si mañana el módulo puro
    // empieza a mandar una decisión sobre una hecha, o un `tareaId` repetido, o un
    // destino que el enum no conoce, se ve AQUÍ y no en la pantalla del usuario.
    const doc = conTodo();
    const bloques = bloquesDeCierre(doc, doc.sprints[0]!, HOY);
    const destinos: MapaDestinos = new Map<string, DestinoCierre>([['PM-T4', 'descartar']]);

    const payload = {
      comando: 'cerrarSprint',
      sprintId: doc.sprints[0]!.id,
      decisiones: decisionesParaComando(bloques, destinos),
    };
    const validado = validarComando(payload);
    if (!validado.ok) {
      throw new Error(
        `el payload de la pantalla no pasa el validador:\n  ${validado.problemas
          .map((p) => `${p.ruta}: ${p.mensaje}`)
          .join('\n  ')}`,
      );
    }
    const { documento } = exigirOk(reducir(doc, validado.comando, AHORA));
    expect(documento.sprints[0]?.estado).toBe('cerrado');
    expect(documento.sprints[0]?.items.map((i) => i.desenlace)).toEqual([
      'completada',
      'cancelada',
      'arrastrada',
      'descartada',
    ]);
  });
});

// --- siguienteSprintPlaneado / primerSprintPlaneado -------------------------

describe('siguienteSprintPlaneado — la pantalla nombra el sprint que el comando usará', () => {
  function conPlaneados(): Documento {
    return docCon(
      [unaTarea({ id: 'PM-T1', clave: CLAVE, estado: 'pendiente' })],
      [
        sprintCon(['PM-T1']),
        // Fuera de orden en el array a propósito: manda la fecha de inicio, no la posición.
        unSprint({ id: 'S-36', nombre: 'Sprint 36', estado: 'planeado', inicio: '2026-09-21', fin: '2026-10-02' }),
        unSprint({ id: 'S-35', nombre: 'Sprint 35', estado: 'planeado', inicio: '2026-09-07', fin: '2026-09-18' }),
      ],
    );
  }

  it('elige el primer planeado por fecha de INICIO, no por posición en el array', () => {
    const doc = conPlaneados();
    expect(siguienteSprintPlaneado(doc, doc.sprints[0]!)?.id).toBe('S-35');
  });

  it('no se elige a sí mismo aunque el que se cierra esté planeado', () => {
    const doc = docCon(
      [unaTarea({ id: 'PM-T1', clave: CLAVE, estado: 'pendiente' })],
      [sprintCon(['PM-T1'], { estado: 'planeado' })],
    );
    expect(siguienteSprintPlaneado(doc, doc.sprints[0]!)).toBeUndefined();
  });

  it('undefined si no hay planeados: ni un activo ni un cerrado sirven de destino', () => {
    const doc = docCon(
      [unaTarea({ id: 'PM-T1', clave: CLAVE, estado: 'pendiente' })],
      [
        sprintCon(['PM-T1']),
        unSprint({ id: 'S-33', nombre: 'Sprint 33', estado: 'cerrado', inicio: '2026-07-27', fin: '2026-08-07' }),
      ],
    );
    expect(siguienteSprintPlaneado(doc, doc.sprints[0]!)).toBeUndefined();
  });

  it('primerSprintPlaneado sin «excepto» los mira todos, y no reordena el documento', () => {
    const doc = conPlaneados();
    const ordenAntes = doc.sprints.map((s) => s.id);
    expect(primerSprintPlaneado(doc)?.id).toBe('S-35');
    expect(doc.sprints.map((s) => s.id)).toEqual(ordenAntes);
  });

  it('ESLABÓN: es el mismo sprint que el reductor usa de verdad al cerrar', () => {
    // Los dos criterios están escritos por separado —uno en el dominio, otro en el
    // reductor—. Si se separan, el botón promete un sprint y el cierre usa otro.
    const doc = conPlaneados();
    const anunciado = siguienteSprintPlaneado(doc, doc.sprints[0]!);
    const { documento } = exigirOk(
      reducir(doc, { comando: 'cerrarSprint', sprintId: 'S-34' }, AHORA),
    );
    const usado = documento.sprints.find((s) => s.items.some((i) => i.tarea_id === 'PM-T1' && i.desenlace === null));
    expect(usado?.id).toBe(anunciado?.id);
    expect(documento.sprints).toHaveLength(3); // no creó ninguno: usó el que ya existía
  });
});

// --- resumenTrasCierre ------------------------------------------------------

describe('resumenTrasCierre — se lee lo que QUEDÓ, no lo que pedimos', () => {
  it('null si el sprint no existe', () => {
    const doc = docCon([unaTarea({ id: 'PM-T1', clave: CLAVE })], [sprintCon(['PM-T1'])]);
    expect(resumenTrasCierre(doc, 'S-99')).toBeNull();
  });

  it('null si el sprint sigue abierto: la pantalla debe seguir mostrando las decisiones', () => {
    const doc = docCon([unaTarea({ id: 'PM-T1', clave: CLAVE })], [sprintCon(['PM-T1'])]);
    expect(resumenTrasCierre(doc, 'S-34')).toBeNull();
    const planeado = docCon([unaTarea({ id: 'PM-T1', clave: CLAVE })], [
      sprintCon(['PM-T1'], { estado: 'planeado' }),
    ]);
    expect(resumenTrasCierre(planeado, 'S-34')).toBeNull();
  });

  it('cuenta cada desenlace en su casilla', () => {
    const tareas = [
      unaTarea({ id: 'PM-T1', clave: CLAVE, estado: 'hecha' }),
      unaTarea({ id: 'PM-T2', clave: CLAVE, estado: 'pendiente' }),
      unaTarea({ id: 'PM-T3', clave: CLAVE, estado: 'pendiente' }),
      unaTarea({ id: 'PM-T4', clave: CLAVE, estado: 'cancelada' }),
      unaTarea({ id: 'PM-T5', clave: CLAVE, estado: 'cancelada' }),
    ];
    const doc = docCon(tareas, [
      sprintCon([], {
        estado: 'cerrado',
        items: [
          unItem('PM-T1', { desenlace: 'completada' }),
          unItem('PM-T2', { desenlace: 'arrastrada' }),
          unItem('PM-T3', { desenlace: 'devuelta' }),
          unItem('PM-T4', { desenlace: 'descartada' }),
          unItem('PM-T5', { desenlace: 'cancelada' }),
        ],
      }),
    ]);
    expect(resumenTrasCierre(doc, 'S-34')).toMatchObject({
      completadas: 1,
      arrastradas: 1,
      devueltas: 1,
      descartadas: 1,
      canceladas: 1,
      sinDecidir: 0,
    });
  });

  it('un documento VIEJO con no_terminada no rompe y no infla ninguna otra casilla', () => {
    // `no_terminada` es lo que escribía el cierre anterior a la ceremonia. Sigue siendo
    // válido al leer (regla 14) y tiene que caer en `sinDecidir`, no sumarse a
    // «devueltas» ni a «descartadas»: un documento de hace tres meses no puede hacer que
    // el resumen mienta sobre a dónde fue nada.
    const tareas = [
      unaTarea({ id: 'PM-T1', clave: CLAVE, estado: 'hecha' }),
      unaTarea({ id: 'PM-T2', clave: CLAVE, estado: 'pendiente' }),
      unaTarea({ id: 'PM-T3', clave: CLAVE, estado: 'en_curso' }),
    ];
    const doc = docCon(tareas, [
      sprintCon([], {
        estado: 'cerrado',
        items: [
          unItem('PM-T1', { desenlace: 'completada' }),
          unItem('PM-T2', { desenlace: 'no_terminada' }),
          unItem('PM-T3', { desenlace: 'no_terminada' }),
        ],
      }),
    ]);
    // El fixture es un documento válido de verdad: el esquema todavía admite el valor.
    expect(validarDocumento(doc).ok).toBe(true);

    const resumen = resumenTrasCierre(doc, 'S-34');
    expect(resumen).toMatchObject({
      completadas: 1,
      arrastradas: 0,
      devueltas: 0,
      descartadas: 0,
      canceladas: 0,
      sinDecidir: 2,
    });
    // Y no inventa destino: `no_terminada` no arrastró nada a ningún lado.
    expect(resumen?.destino).toBeUndefined();
    expect(resumen?.pasaron).toBe(0);
  });

  it('un desenlace null dentro de un cerrado también cae en sinDecidir, sin romperse', () => {
    const doc = docCon([unaTarea({ id: 'PM-T1', clave: CLAVE, estado: 'pendiente' })], [
      sprintCon([], { estado: 'cerrado', items: [unItem('PM-T1')] }),
    ]);
    expect(resumenTrasCierre(doc, 'S-34')).toMatchObject({ sinDecidir: 1, completadas: 0 });
  });

  it('descubre el sprint que de verdad recibió lo arrastrado y cuántas llegaron', () => {
    const tareas = [
      unaTarea({ id: 'PM-T1', clave: CLAVE, estado: 'pendiente' }),
      unaTarea({ id: 'PM-T2', clave: CLAVE, estado: 'pendiente' }),
    ];
    const doc = docCon(tareas, [
      sprintCon([], {
        estado: 'cerrado',
        items: [
          unItem('PM-T1', { desenlace: 'arrastrada' }),
          unItem('PM-T2', { desenlace: 'arrastrada' }),
        ],
      }),
      unSprint({
        id: 'S-35',
        nombre: 'Sprint 35',
        estado: 'planeado',
        inicio: '2026-09-07',
        fin: '2026-09-18',
        items: [unItem('PM-T1'), unItem('PM-T2')],
      }),
    ]);
    const resumen = resumenTrasCierre(doc, 'S-34');
    expect(resumen?.destino?.id).toBe('S-35');
    expect(resumen?.pasaron).toBe(2);
  });

  it('un sprint CERRADO nunca se nombra como destino, aunque tenga la misma tarea dentro', () => {
    const tareas = [unaTarea({ id: 'PM-T1', clave: CLAVE, estado: 'pendiente' })];
    const doc = docCon(tareas, [
      sprintCon([], { estado: 'cerrado', items: [unItem('PM-T1', { desenlace: 'arrastrada' })] }),
      unSprint({
        id: 'S-33',
        nombre: 'Sprint 33',
        estado: 'cerrado',
        inicio: '2026-07-27',
        fin: '2026-08-07',
        items: [unItem('PM-T1', { desenlace: 'arrastrada' })],
      }),
    ]);
    const resumen = resumenTrasCierre(doc, 'S-34');
    expect(resumen?.arrastradas).toBe(1);
    expect(resumen?.destino).toBeUndefined();
    expect(resumen?.pasaron).toBe(0);
  });

  it('ESLABÓN: sobre el documento que devuelve el reductor, el resumen cuadra con el evento', () => {
    const tareas = [
      unaTarea({ id: 'PM-T1', clave: CLAVE, estado: 'hecha' }),
      unaTarea({ id: 'PM-T2', clave: CLAVE, estado: 'pendiente' }),
      unaTarea({ id: 'PM-T3', clave: CLAVE, estado: 'pendiente' }),
      unaTarea({ id: 'PM-T4', clave: CLAVE, estado: 'pendiente' }),
      unaTarea({ id: 'PM-T5', clave: CLAVE, estado: 'cancelada' }),
    ];
    const doc = docCon(tareas, [sprintCon(['PM-T1', 'PM-T2', 'PM-T3', 'PM-T4', 'PM-T5'])]);
    const { documento, evento } = exigirOk(
      reducir(
        doc,
        {
          comando: 'cerrarSprint',
          sprintId: 'S-34',
          decisiones: [
            { tareaId: 'PM-T3', destino: 'backlog' },
            { tareaId: 'PM-T4', destino: 'descartar' },
          ],
        },
        AHORA,
      ),
    );
    const resumen = resumenTrasCierre(documento, 'S-34');
    expect(resumen).toMatchObject({
      completadas: 1,
      arrastradas: 1,
      devueltas: 1,
      descartadas: 1,
      canceladas: 1,
      sinDecidir: 0,
      pasaron: 1,
    });
    expect(resumen?.destino?.id).toBe(evento.detalle?.['siguiente_sprint']);
  });
});
