/**
 * El reloj de tramos: quién los escribe, cuánto suman y qué se niega a contestar.
 *
 * Hasta M5 este archivo probaba un reloj anclado al sprint que **nadie alimentaba**: el
 * modelo, la validación, el cálculo y la pantalla de los tramos existían y ninguna línea
 * de la app escribía un tramo. La consecuencia medida era que `tiempoEnDesarrollo`
 * devolvía `{dias: null, tramos: 0}` para el documento entero y la vista de Tiempos decía
 * «sin tramos» a perpetuidad.
 *
 * Por eso el primer bloque de abajo no prueba una fórmula: prueba al **productor**. Un
 * reloj que suma bien sobre tramos fabricados a mano en la prueba y que en la app no
 * recibe ninguno pasa en verde y no mide nada, y esa es exactamente la forma de fallo que
 * costó esta etapa.
 *
 * Es además la métrica más fácil de falsificar sin querer del producto: un cero por «no
 * medido» hunde un promedio, un promedio de una sola tarea se lee igual de firme que uno
 * de cuarenta, y un tramo que nadie cierra acumula meses que nadie trabajó. Las tres
 * cosas se miden aquí.
 */

import { describe, expect, it } from 'vitest';

import {
  MINIMO_TAREAS_PARA_PROMEDIO,
  UMBRAL_TRAMO_OLVIDADO,
  cerradasSinMedirEnTodo,
  desglosar,
  diasPorPunto,
  esTrabajo,
  promediar,
  relojCorriendo,
  relojesCorriendo,
  resoluciones,
  resolucionDe,
  sumarEsfuerzo,
  tiempoEnDesarrollo,
  tiempoPorEquipo,
  tiempoPorPersona,
  tiempoPorProyecto,
  trabajadoContraCalendario,
  type Resolucion,
} from '../../src/compartido/dominio/duracion';
import { indexarTareas } from '../../src/compartido/dominio/derivar';
import { validarDocumento } from '../../src/compartido/modelo/esquema';
import type { Documento, EstadoTarea, Tarea, TramoTrabajo } from '../../src/compartido/modelo/tipos';
import {
  HOY,
  aplicar,
  arbolConTareas,
  exigirOk,
  reducirSinMutar,
} from '../apoyo/comandos';
import {
  unDocumento,
  unItem,
  unProyecto,
  unSprint,
  unaEpica,
  unaHistoria,
  unaPersona,
  unaTarea,
} from '../apoyo/constructores';
import { SEMILLAS, prng, unDocumentoAleatorio } from '../apoyo/generador';

const CLAVE = 'PM';

/** Un tramo escrito a mano, para las pruebas que miden la LECTURA y no al productor. */
const tramo = (
  desde: string,
  hasta: string | null,
  estado: TramoTrabajo['estado'] = 'iniciado',
): TramoTrabajo => ({ desde, hasta, estado });

const conTramos = (...tramos: TramoTrabajo[]): Tarea =>
  unaTarea({ clave: CLAVE, id: `${CLAVE}-T1`, trabajo: tramos });

/** Los tramos de `PM-T1` en un documento producido por el reductor. */
function tramosDe(doc: Documento, id = `${CLAVE}-T1`): TramoTrabajo[] {
  const ubicacion = indexarTareas(doc).get(id);
  if (ubicacion === undefined) throw new Error(`la prueba perdió ${id}`);
  return ubicacion.tarea.trabajo;
}

const instante = (dia: number, hora = '09:00:00') =>
  `2026-08-${String(dia).padStart(2, '0')}T${hora}-06:00`;

/** La resolución de la primera tarea del documento, o `null`. */
function primera(doc: Documento): Resolucion | null {
  const [ubicacion] = [...indexarTareas(doc).values()];
  return ubicacion === undefined ? null : resolucionDe(doc, ubicacion);
}

// --- 1. el productor: quién escribe los tramos ------------------------------

describe('esTrabajo — el predicado del que cuelga todo', () => {
  it('el reloj corre en desarrollo y en pruebas, y en ningún otro estado', () => {
    const corre = (['pendiente', 'iniciado', 'en_pruebas', 'terminado', 'done', 'cancelada'] as const)
      .filter((estado: EstadoTarea) => esTrabajo(estado));
    expect(corre).toEqual(['iniciado', 'en_pruebas']);
  });

  /**
   * El supuesto S1 del plan vive aquí y en ningún otro sitio. Si algún día se decide que
   * el reloj también corre en `terminado`, esta prueba es la que hay que cambiar — y el
   * `estado` que cada tramo guarda es lo que hace que ese cambio no necesite migración.
   */
  it('`terminado` DETIENE el reloj: es «lo entregué», no «lo sigo trabajando»', () => {
    expect(esTrabajo('terminado')).toBe(false);
  });
});

describe('el reductor abre y cierra los tramos (regla 21)', () => {
  const enCurso = () =>
    aplicar(arbolConTareas(1).doc, { comando: 'cambiarEstado', id: `${CLAVE}-T1`, estado: 'iniciado' }, instante(1));

  it('arrancar una tarea abre un tramo, y lo deja abierto', () => {
    expect(tramosDe(enCurso())).toEqual([
      { desde: instante(1), hasta: null, estado: 'iniciado' },
    ]);
  });

  it('una tarea recién capturada no tiene ningún tramo', () => {
    expect(tramosDe(arbolConTareas(1).doc)).toEqual([]);
  });

  it('llegar a `terminado` cierra el tramo y no abre otro', () => {
    const doc = aplicar(enCurso(), { comando: 'cambiarEstado', id: `${CLAVE}-T1`, estado: 'terminado' }, instante(2));
    expect(tramosDe(doc)).toEqual([
      { desde: instante(1), hasta: instante(2), estado: 'iniciado' },
    ]);
  });

  /**
   * **Criterio 1 de la etapa.** Los dos tramos duran un día cada uno con una semana de
   * pausa en medio: `fin − inicio` daría 10, y ese 10 es exactamente el número que esta
   * prueba existe para que no aparezca nunca.
   */
  it('iniciado → terminado → iniciado → terminado suma DOS tramos, y la duración es la suma', () => {
    let doc = arbolConTareas(1).doc;
    const guion: [EstadoTarea, number][] = [
      ['iniciado', 1],
      ['terminado', 2],
      ['iniciado', 10],
      ['terminado', 11],
    ];
    for (const [estado, dia] of guion) {
      doc = aplicar(doc, { comando: 'cambiarEstado', id: `${CLAVE}-T1`, estado }, instante(dia));
    }

    const tramos = tramosDe(doc);
    expect(tramos).toHaveLength(2);
    expect(tramos.every((t) => t.hasta !== null), 'ninguno queda abierto').toBe(true);

    const reloj = tiempoEnDesarrollo(indexarTareas(doc).get(`${CLAVE}-T1`)!.tarea);
    expect(reloj.dias, 'la SUMA de los dos tramos, no la resta de las puntas').toBe(2);
    expect(reloj.dias).not.toBe(10);
    expect(reloj.tramos).toBe(2);
  });

  /**
   * Pasar de un estado de trabajo a otro parte el tramo en dos. Es lo que hace derivable
   * el desglose desarrollo/pruebas sin migrar nada el día que se decida si el reloj corre
   * en pruebas: el dato ya está dentro de cada tramo.
   */
  it('iniciado → en_pruebas cierra el tramo de desarrollo y abre uno de pruebas', () => {
    const doc = aplicar(enCurso(), { comando: 'cambiarEstado', id: `${CLAVE}-T1`, estado: 'en_pruebas' }, instante(3));
    expect(tramosDe(doc)).toEqual([
      { desde: instante(1), hasta: instante(3), estado: 'iniciado' },
      { desde: instante(3), hasta: null, estado: 'en_pruebas' },
    ]);
  });

  it('llegar a `done` cierra el tramo: el reloj no sigue corriendo sobre algo aceptado', () => {
    const doc = aplicar(enCurso(), { comando: 'cambiarEstado', id: `${CLAVE}-T1`, estado: 'done' }, instante(4));
    expect(tramosDe(doc)[0]?.hasta).toBe(instante(4));
  });

  /**
   * Cancelar también para el reloj. Sin esto, una tarea que se descarta a mitad de camino
   * seguiría «corriendo desde hace N días» para siempre sobre trabajo que ya no se va a
   * hacer, que es justo la mentira que el umbral existe para nombrar.
   */
  it('cancelar para el reloj', () => {
    const doc = aplicar(enCurso(), { comando: 'cambiarEstado', id: `${CLAVE}-T1`, estado: 'cancelada' }, instante(4));
    expect(tramosDe(doc)[0]?.hasta).toBe(instante(4));
  });

  it('volver a `pendiente` también lo para: dejar de trabajar es dejar de trabajar', () => {
    const doc = aplicar(enCurso(), { comando: 'cambiarEstado', id: `${CLAVE}-T1`, estado: 'pendiente' }, instante(4));
    expect(tramosDe(doc)[0]?.hasta).toBe(instante(4));
  });

  it('pendiente → done no inventa ningún tramo: nadie midió ese trabajo', () => {
    const doc = aplicar(arbolConTareas(1).doc, { comando: 'cambiarEstado', id: `${CLAVE}-T1`, estado: 'done' }, instante(4));
    expect(tramosDe(doc)).toEqual([]);
    expect(tiempoEnDesarrollo(indexarTareas(doc).get(`${CLAVE}-T1`)!.tarea).dias).toBeNull();
  });

  /**
   * **Criterio 3, por el lado del productor.** El esquema rechaza dos tramos abiertos; lo
   * que se comprueba aquí es que el reductor no puede llegar a producirlos por ningún
   * camino de estados, porque cierra el anterior ANTES de abrir el siguiente.
   */
  it('ninguna secuencia de estados deja dos tramos abiertos', () => {
    const vuelta: EstadoTarea[] = [
      'iniciado', 'en_pruebas', 'iniciado', 'terminado', 'iniciado',
      'en_pruebas', 'done', 'iniciado', 'cancelada', 'pendiente', 'en_pruebas',
    ];
    let doc = arbolConTareas(1).doc;
    vuelta.forEach((estado, i) => {
      doc = aplicar(doc, { comando: 'cambiarEstado', id: `${CLAVE}-T1`, estado }, instante(i + 1));
      const abiertos = tramosDe(doc).filter((t) => t.hasta === null).length;
      expect(abiertos, `tras pasar a "${estado}"`).toBeLessThanOrEqual(1);
      expect(validarDocumento(doc).ok, `tras pasar a "${estado}"`).toBe(true);
    });
    expect(tramosDe(doc).length, 'y todos los tramos quedaron registrados').toBe(7);
  });

  /**
   * La reversibilidad con ⌘Z es regla dura del repo, y aquí no cuesta nada porque no es un
   * paso aparte: el reductor trabaja sobre una copia profunda y deshacer devuelve el
   * documento anterior entero. Lo que esta prueba defiende es esa propiedad — que abrir o
   * cerrar un tramo NO toca el documento de entrada y por tanto no puede quedarse a medias.
   */
  it('abrir un tramo no muta el documento anterior: ⌘Z lo devuelve como estaba', () => {
    const antes = enCurso();
    const abierto = tramosDe(antes)[0];
    exigirOk(
      reducirSinMutar(antes, { comando: 'cambiarEstado', id: `${CLAVE}-T1`, estado: 'terminado' }, instante(9)),
    );
    // `reducirSinMutar` ya compara el documento entero; esto nombra el campo que importa.
    expect(abierto?.hasta, 'el tramo del documento viejo sigue abierto').toBeNull();
  });

  /**
   * Descartar al cerrar el sprint cancela la tarea (regla del cierre), y por eso pasa por
   * el mismo sitio que `cambiarEstado`: es la otra transición de estado que existe en el
   * reductor, y sin esto la tarea descartada se quedaba con el reloj corriendo.
   */
  it('descartar una tarea al cerrar el sprint también para su reloj', () => {
    const base = arbolConTareas(1);
    let doc = aplicar(base.doc, { comando: 'crearSprint', clave: CLAVE, inicio: '2026-08-01', fin: '2026-08-14' });
    const sprintId = doc.sprints[0]!.id;
    doc = aplicar(doc, { comando: 'activarSprint', sprintId });
    doc = aplicar(doc, { comando: 'moverAlSprint', tareaId: `${CLAVE}-T1`, sprintId });
    doc = aplicar(doc, { comando: 'cambiarEstado', id: `${CLAVE}-T1`, estado: 'iniciado' }, instante(1));
    doc = aplicar(
      doc,
      { comando: 'cerrarSprint', sprintId, decisiones: [{ tareaId: `${CLAVE}-T1`, destino: 'descartar' }] },
      instante(14),
    );

    const tarea = indexarTareas(doc).get(`${CLAVE}-T1`)!.tarea;
    expect(tarea.estado).toBe('cancelada');
    expect(tarea.trabajo[0]?.hasta, 'el reloj no puede seguir sobre trabajo descartado').toBe(
      instante(14),
    );
  });
});

// --- 2. el esquema: un tramo abierto y solo uno -----------------------------

/** **Criterio 3.** El modelo no admite dos relojes a la vez, ni escritos a mano. */
describe('un documento con dos tramos abiertos se rechaza', () => {
  const conAbiertos = (cuantos: number) =>
    unDocumento({
      proyectos: [
        unProyecto({
          clave: CLAVE,
          tareas: [
            unaTarea({
              clave: CLAVE,
              id: `${CLAVE}-T1`,
              estado: 'iniciado',
              trabajo: Array.from({ length: cuantos }, (_, i) => tramo(instante(i + 1), null)),
            }),
          ],
        }),
      ],
    });

  it('uno abierto vale: es la tarea que está en marcha ahora mismo', () => {
    expect(validarDocumento(conAbiertos(1)).ok).toBe(true);
  });

  it('dos abiertos no: no se sabría cuál cerrar ni desde cuándo contar', () => {
    const resultado = validarDocumento(conAbiertos(2));
    expect(resultado.ok).toBe(false);
    expect(
      resultado.ok ? [] : resultado.problemas.map((p) => p.mensaje).join(' '),
    ).toContain('tramos de trabajo abiertos');
  });

  it('un tramo que termina antes de empezar tampoco pasa', () => {
    const doc = unDocumento({
      proyectos: [
        unProyecto({
          clave: CLAVE,
          tareas: [unaTarea({ clave: CLAVE, trabajo: [tramo(instante(10), instante(9))] })],
        }),
      ],
    });
    expect(validarDocumento(doc).ok).toBe(false);
  });
});

// --- 3. la lectura: sumar tramos --------------------------------------------

describe('tiempoEnDesarrollo — la SUMA, nunca `fin − inicio`', () => {
  it('suma los tramos en vez de restar el primero del último', () => {
    // Dos tramos de un día separados por una semana de pausa. `fin − inicio` daría 10.
    const reloj = tiempoEnDesarrollo(
      conTramos(tramo(instante(1), instante(2)), tramo(instante(10), instante(11))),
    );
    expect(reloj.dias).toBe(2);
    expect(reloj.tramos).toBe(2);
    expect(reloj.corriendoDesde).toBeNull();
  });

  it('el tramo abierto se devuelve aparte y NO entra en el total', () => {
    const reloj = tiempoEnDesarrollo(
      conTramos(tramo(instante(1), instante(2)), tramo(instante(10), null)),
    );
    expect(reloj.dias).toBe(1);
    expect(reloj.tramos).toBe(1);
    expect(reloj.corriendoDesde).toBe(instante(10));
  });

  /**
   * **Criterio 4.** `0` afirma «no costó tiempo»; `null` dice «no se midió». Es la misma
   * regla que el `0%` de la regla 2 y por el mismo motivo: el cero es el que engaña.
   */
  it('sin tramos cerrados devuelve null, JAMÁS cero', () => {
    expect(tiempoEnDesarrollo(unaTarea({ clave: CLAVE })).dias).toBeNull();
    expect(tiempoEnDesarrollo(conTramos(tramo(instante(10), null))).dias).toBeNull();
    expect(tiempoEnDesarrollo(unaTarea({ clave: CLAVE })).dias).not.toBe(0);
  });

  it('cuatro horas valen una fracción, no cero: si no, todo lo del día hundiría el promedio', () => {
    expect(tiempoEnDesarrollo(conTramos(tramo(instante(1, '09:00:00'), instante(1, '13:00:00')))).dias).toBe(0.2);
  });

  /** Un tramo al revés son datos editados a mano: se descarta, no se cuenta como cero. */
  it('un tramo con el final antes del inicio no baja el total ni el conteo', () => {
    const reloj = tiempoEnDesarrollo(
      conTramos(tramo(instante(1), instante(3)), tramo(instante(10), instante(9))),
    );
    expect(reloj.dias).toBe(2);
    expect(reloj.tramos).toBe(1);
  });

  describe('el desglose sale del `estado` que cada tramo guarda', () => {
    const mixta = () =>
      conTramos(
        tramo(instante(1), instante(3), 'iniciado'),
        tramo(instante(3), instante(4), 'en_pruebas'),
      );

    it('reparte el total entre desarrollo y pruebas, y las dos partes lo suman', () => {
      const reloj = tiempoEnDesarrollo(mixta());
      expect(reloj.desarrollo).toBe(2);
      expect(reloj.pruebas).toBe(1);
      expect((reloj.desarrollo ?? 0) + (reloj.pruebas ?? 0)).toBe(reloj.dias);
    });

    /** Misma regla que arriba: no probó durante cero días, es que no se midió nada ahí. */
    it('la mitad que no ocurrió es null, no cero', () => {
      const soloDesarrollo = tiempoEnDesarrollo(conTramos(tramo(instante(1), instante(2))));
      expect(soloDesarrollo.desarrollo).toBe(1);
      expect(soloDesarrollo.pruebas).toBeNull();
      expect(soloDesarrollo.pruebas).not.toBe(0);
    });
  });
});

// --- 4. el reloj corriendo --------------------------------------------------

/**
 * **Criterio 6.** Un tramo que nadie cierra crece para siempre. Se presenta como
 * «corriendo desde hace N días» y no entra en ningún promedio, ni por encima ni por
 * debajo del umbral: lo que el umbral decide es si eso describe trabajo en marcha o un
 * olvido.
 */
describe('el tramo abierto se presenta, no se promedia', () => {
  const abiertaDesde = (dia: number) =>
    unaTarea({ clave: CLAVE, id: `${CLAVE}-T1`, estado: 'iniciado', trabajo: [tramo(instante(dia), null)] });

  it('dice desde hace cuántos días corre, contra el día de quien mira', () => {
    // `HOY` es el 2026-08-26; el tramo arrancó el 20.
    expect(relojCorriendo(abiertaDesde(20), HOY)).toEqual({
      desde: instante(20),
      dias: 6,
      olvidado: true,
    });
  });

  it(`por debajo de ${UMBRAL_TRAMO_OLVIDADO} días no es un olvido: es trabajo en marcha`, () => {
    expect(relojCorriendo(abiertaDesde(24), HOY)?.olvidado).toBe(false);
  });

  it('sin tramo abierto no hay nada que presentar', () => {
    expect(relojCorriendo(conTramos(tramo(instante(1), instante(2))), HOY)).toBeNull();
  });

  it('ni el olvidado ni el reciente aportan un solo día a ningún promedio', () => {
    const doc = unDocumento({
      proyectos: [
        unProyecto({
          clave: CLAVE,
          tareas: [
            unaTarea({ clave: CLAVE, id: `${CLAVE}-T1`, estado: 'iniciado', trabajo: [tramo(instante(1), null)] }),
            unaTarea({ clave: CLAVE, id: `${CLAVE}-T2`, estado: 'iniciado', trabajo: [tramo(instante(24), null)] }),
          ],
        }),
      ],
    });
    expect(resoluciones(doc), 'ninguna está aceptada y ninguna tiene tramo cerrado').toEqual([]);
    expect(promediar(resoluciones(doc)).cuentan).toBe(0);
    expect(relojesCorriendo(doc, HOY).map((r) => r.tarea.id), 'lo más viejo primero').toEqual([
      `${CLAVE}-T1`,
      `${CLAVE}-T2`,
    ]);
  });
});

// --- 5. la resolución, ya sin sprint ----------------------------------------

describe('resolucionDe — lo que costó una tarea aceptada', () => {
  /** **Criterio 2**, y la razón de existir de toda la etapa. */
  it('una tarea cerrada FUERA de todo sprint sí tiene duración', () => {
    const tarea = unaTarea({
      clave: CLAVE,
      id: `${CLAVE}-T1`,
      estado: 'done',
      aceptada_en: instante(5),
      trabajo: [tramo(instante(1), instante(2)), tramo(instante(4), instante(5))],
    });
    const doc = unDocumento({ proyectos: [unProyecto({ clave: CLAVE, tareas: [tarea] })] });
    const resolucion = primera(doc);

    expect(resolucion?.dias, 'dos tramos de un día').toBe(2);
    expect(resolucion?.tramos).toBe(2);
    expect(resolucion?.sprintsAtravesados, 'no pasó por ninguno, y da igual').toBe(0);
  });

  it('el calendario es de punta a punta, y siempre es mayor o igual que lo trabajado', () => {
    const tarea = unaTarea({
      clave: CLAVE,
      id: `${CLAVE}-T1`,
      estado: 'done',
      trabajo: [tramo(instante(1), instante(2)), tramo(instante(10), instante(11))],
    });
    const doc = unDocumento({ proyectos: [unProyecto({ clave: CLAVE, tareas: [tarea] })] });
    const resolucion = primera(doc);
    expect(resolucion?.dias, 'trabajado').toBe(2);
    expect(resolucion?.calendario, 'del 1 al 11: la diferencia es espera, no trabajo').toBe(10);
  });

  describe('lo que NO es medible devuelve null, jamás cero', () => {
    const done = (over: Partial<Tarea>) =>
      unDocumento({
        proyectos: [
          unProyecto({
            clave: CLAVE,
            tareas: [unaTarea({ clave: CLAVE, id: `${CLAVE}-T1`, estado: 'done', ...over })],
          }),
        ],
      });

    it('una tarea aceptada sin un solo tramo — todo lo cerrado antes de que el reloj existiera', () => {
      expect(primera(done({ aceptada_en: instante(5), trabajo: [] }))).toBeNull();
    });

    it('una tarea con el reloj todavía corriendo y nada cerrado', () => {
      expect(primera(done({ trabajo: [tramo(instante(1), null)] }))).toBeNull();
    });

    it('una tarea que no está aceptada, por muchos tramos que tenga', () => {
      const doc = unDocumento({
        proyectos: [
          unProyecto({
            clave: CLAVE,
            tareas: [
              unaTarea({ clave: CLAVE, estado: 'terminado', trabajo: [tramo(instante(1), instante(2))] }),
            ],
          }),
        ],
      });
      expect(primera(doc), 'el avance se mide contra `done`, no contra `terminado`').toBeNull();
    });

    it('un tramo con instantes ilegibles no tumba el cálculo, lo deja sin medir', () => {
      expect(primera(done({ trabajo: [tramo('ayer por la tarde', 'hoy')] }))).toBeNull();
    });
  });

  /**
   * El compromiso del sprint manda sobre el responsable de la tarea: reasignar algo el mes
   * que viene no puede reescribir quién lo resolvió. Eso sobrevive intacto a que la
   * DURACIÓN ya no dependa del sprint — son dos cosas distintas y solo una murió.
   */
  it('el responsable del sprint gana sobre el de la tarea', () => {
    const tarea = unaTarea({
      clave: CLAVE,
      id: `${CLAVE}-T1`,
      estado: 'done',
      responsable: 'ana',
      trabajo: [tramo(instante(1), instante(2))],
    });
    const doc = unDocumento({
      personas: [unaPersona({ id: 'ana', nombre: 'ana' }), unaPersona({ id: 'beto', nombre: 'beto' })],
      proyectos: [
        unProyecto({
          clave: CLAVE,
          epicas: [unaEpica({ clave: CLAVE, historias: [unaHistoria({ clave: CLAVE, tareas: [tarea] })] })],
        }),
      ],
      sprints: [
        unSprint({
          id: 'S1',
          estado: 'cerrado',
          items: [unItem(`${CLAVE}-T1`, { responsable: 'beto' })],
        }),
      ],
    });
    expect(primera(doc)?.responsable).toBe('beto');
    expect(primera(doc)?.sprintsAtravesados).toBe(1);
  });

  /**
   * De los sprints que la tuvieron gana el que arrancó más tarde: el compromiso de una
   * tarea arrastrada es el del sprint en que acabó, no el del primero que la vio pasar.
   * Antes ganaba el primero del arreglo `doc.sprints`, que no es una regla sino el orden
   * en que estaban guardados — y el orden de guardado no decide quién resolvió algo.
   */
  it('en una tarea arrastrada manda el compromiso del ÚLTIMO sprint', () => {
    const tarea = unaTarea({
      clave: CLAVE,
      id: `${CLAVE}-T1`,
      estado: 'done',
      responsable: 'ana',
      trabajo: [tramo(instante(1), instante(2))],
    });
    const doc = unDocumento({
      personas: [unaPersona({ id: 'ana', nombre: 'ana' }), unaPersona({ id: 'beto', nombre: 'beto' })],
      proyectos: [unProyecto({ clave: CLAVE, tareas: [tarea] })],
      sprints: [
        unSprint({ id: 'S1', clave: CLAVE, estado: 'cerrado', inicio: '2026-07-01', fin: '2026-07-14', items: [unItem(`${CLAVE}-T1`, { responsable: 'ana' })] }),
        unSprint({ id: 'S2', clave: CLAVE, estado: 'cerrado', inicio: '2026-07-15', fin: '2026-07-28', items: [unItem(`${CLAVE}-T1`, { responsable: 'beto' })] }),
      ],
    });
    expect(primera(doc)?.responsable, 'la acabó Beto en S2').toBe('beto');
  });

  /**
   * `responsable: null` en un item significa «hereda de la tarea», no «sin asignar». Si se
   * leyera como «nadie», una tarea arrastrada a un sprint abierto perdería a su dueño al
   * entrar, que es justo cuando más falta hace saber de quién es.
   */
  it('un item sin responsable hereda el de la tarea, no la deja sin dueño', () => {
    const tarea = unaTarea({
      clave: CLAVE,
      id: `${CLAVE}-T1`,
      estado: 'done',
      responsable: 'ana',
      trabajo: [tramo(instante(1), instante(2))],
    });
    const doc = unDocumento({
      personas: [unaPersona({ id: 'ana', nombre: 'ana' })],
      proyectos: [unProyecto({ clave: CLAVE, tareas: [tarea] })],
      sprints: [
        unSprint({ id: 'S1', clave: CLAVE, estado: 'cerrado', items: [unItem(`${CLAVE}-T1`)] }),
      ],
    });
    expect(primera(doc)?.responsable).toBe('ana');
  });
});

/**
 * La regla de atribución es UNA y gobierna las dos mitades de una fila. Lo que sigue no
 * mide un número concreto: mide que el numerador y la letra chica no puedan volver a
 * separarse, que es la forma que tuvo el defecto.
 */
describe('las dos mitades de una fila usan la misma regla', () => {
  it('el corte por proyecto agrupa y descuenta por la misma clave', () => {
    const medible = (id: string, clave: string, conTramo: boolean) =>
      unaTarea({
        clave,
        id,
        estado: 'done',
        trabajo: conTramo ? [tramo(instante(1), instante(2))] : [],
      });
    const doc = unDocumento({
      proyectos: [
        unProyecto({ clave: 'UNO', tareas: [medible('UNO-T1', 'UNO', true), medible('UNO-T2', 'UNO', false)] }),
        unProyecto({ clave: 'DOS', tareas: [medible('DOS-T1', 'DOS', true)] }),
      ],
    });
    const filas = tiempoPorProyecto(doc);
    expect(filas.map((f) => [f.id, f.tiempo.cuentan, f.tiempo.sinMedir])).toEqual([
      ['UNO', 1, 1],
      ['DOS', 1, 0],
    ]);
  });

  /**
   * `tiempoPorEquipo` es `tiempoPorProyecto` filtrado por «el proyecto tiene miembros», así
   * que no puede mezclar reglas: hereda las dos mitades de la misma fila. Se comprueba en
   * vez de razonarlo, porque el día que deje de ser un filtro esto es lo que avisa.
   */
  it('el corte por equipo hereda las filas del de proyecto, sin recalcular nada', () => {
    const doc = unDocumento({
      personas: [unaPersona({ id: 'ana', nombre: 'ana' })],
      proyectos: [
        unProyecto({
          clave: 'UNO',
          equipos: [{ id: 'uno-general', nombre: 'General', miembros: [{ persona_id: 'ana', responsabilidades: [], capacidad: null }] }],
          tareas: [
            unaTarea({ clave: 'UNO', id: 'UNO-T1', estado: 'done', responsable: 'ana', trabajo: [tramo(instante(1), instante(2))] }),
            unaTarea({ clave: 'UNO', id: 'UNO-T2', estado: 'done', responsable: 'ana' }),
          ],
        }),
      ],
    });
    expect(tiempoPorEquipo(doc)).toEqual(tiempoPorProyecto(doc));
    expect(tiempoPorEquipo(doc)[0]?.tiempo).toMatchObject({ cuentan: 1, sinMedir: 1 });
  });
});

// --- 6. promedios -----------------------------------------------------------

describe('el promedio dice sobre cuántas se calculó', () => {
  const medida = (dias: number): Resolucion =>
    ({ dias, tramos: 1, tarea: unaTarea({ clave: CLAVE }) }) as Resolucion;

  it('sin medidas no hay promedio ni mediana', () => {
    expect(promediar([])).toMatchObject({ promedio: null, mediana: null, cuentan: 0 });
  });

  /**
   * **Criterio 5.** La regla que impide la mentira más fácil de todas: «14 días de
   * promedio» calculado sobre una tarea se lee igual de firme que uno sobre cuarenta.
   */
  it(`por debajo de ${MINIMO_TAREAS_PARA_PROMEDIO} tareas devuelve el conteo, no el promedio`, () => {
    const pocas = promediar([medida(2), medida(4), medida(6), medida(8)]);
    expect(pocas.promedio).toBeNull();
    expect(pocas.mediana).toBeNull();
    expect(pocas.cuentan, 'el conteo crudo SÍ se da').toBe(4);
  });

  it('con suficientes da promedio y mediana', () => {
    const bastantes = promediar([medida(1), medida(2), medida(3), medida(4), medida(100)]);
    expect(bastantes.promedio).toBe(22);
    expect(bastantes.mediana, 'la mediana aguanta la que se retomó veinte veces').toBe(3);
    expect(bastantes.masLenta?.dias).toBe(100);
  });

  it('arrastra cuántas se aceptaron sin poder medirse', () => {
    expect(promediar([medida(1)], 7).sinMedir).toBe(7);
  });
});

describe('promedios por persona y por proyecto', () => {
  /** Cinco tareas de «ana» para pasar el mínimo, y una de «beto» para no pasarlo. */
  const equipo = () => {
    const medible = (id: string, responsable: string, dias: number) =>
      unaTarea({
        clave: CLAVE,
        id,
        estado: 'done',
        responsable,
        aceptada_en: instante(20),
        trabajo: [tramo(instante(1), instante(1 + dias))],
      });
    return unDocumento({
      personas: [unaPersona({ id: 'ana', nombre: 'ana' }), unaPersona({ id: 'beto', nombre: 'beto' })],
      proyectos: [
        unProyecto({
          clave: CLAVE,
          epicas: [
            unaEpica({
              clave: CLAVE,
              historias: [
                unaHistoria({
                  clave: CLAVE,
                  tareas: [
                    ...[1, 2, 3, 4, 5].map((n) => medible(`${CLAVE}-T${n}`, 'ana', n)),
                    medible(`${CLAVE}-T6`, 'beto', 3),
                  ],
                }),
              ],
            }),
          ],
        }),
      ],
    });
  };

  it('atribuye a cada quien lo suyo', () => {
    expect(tiempoPorPersona(equipo()).map((f) => [f.id, f.tiempo.cuentan])).toEqual([
      ['ana', 5],
      ['beto', 1],
    ]);
  });

  it('quien tiene pocas no recibe promedio, solo conteo', () => {
    const beto = tiempoPorPersona(equipo()).find((f) => f.id === 'beto');
    expect(beto?.tiempo.promedio).toBeNull();
    expect(beto?.tiempo.cuentan).toBe(1);
  });

  it('el proyecto agrupa sus resoluciones y conserva su nombre', () => {
    const [fila] = tiempoPorProyecto(equipo());
    expect(fila?.id).toBe(CLAVE);
    expect(fila?.tiempo.cuentan).toBe(6);
  });

  it('un proyecto sin nada medible no aparece en la tabla', () => {
    const doc = unDocumento({
      proyectos: [unProyecto({ clave: CLAVE, tareas: [unaTarea({ clave: CLAVE, estado: 'pendiente' })] })],
    });
    expect(tiempoPorProyecto(doc)).toEqual([]);
  });

  it('resoluciones() no inventa ninguna de la nada', () => {
    expect(resoluciones(equipo())).toHaveLength(6);
  });
});

/**
 * El conteo de lo aceptado que NO se pudo medir. Sin él, «promedio sobre 5 tareas» parece
 * hablar de todo el trabajo cuando puede estar hablando de un tercio — y con el archivo
 * real del usuario va a hablar de un tercio durante meses, porque el pasado no tiene
 * tramos y no se inventa.
 */
describe('cerradasSinMedirEnTodo', () => {
  const doc = () =>
    unDocumento({
      proyectos: [
        unProyecto({
          clave: CLAVE,
          tareas: [
            unaTarea({ clave: CLAVE, id: `${CLAVE}-T1`, estado: 'done', trabajo: [tramo(instante(1), instante(2))] }),
            unaTarea({ clave: CLAVE, id: `${CLAVE}-T2`, estado: 'done', aceptada_en: instante(2), trabajo: [] }),
            unaTarea({ clave: CLAVE, id: `${CLAVE}-T3`, estado: 'done', aceptada_en: instante(2), trabajo: [] }),
            unaTarea({ clave: CLAVE, id: `${CLAVE}-T4`, estado: 'iniciado', trabajo: [tramo(instante(1), null)] }),
          ],
        }),
      ],
    });

  it('cuenta las aceptadas que no tienen ni un tramo cerrado', () => {
    expect(resoluciones(doc())).toHaveLength(1);
    expect(cerradasSinMedirEnTodo(doc()), 'T2 y T3 se cerraron sin reloj').toBe(2);
  });

  it('no cuenta lo que sigue abierto: eso no se cerró, se está haciendo', () => {
    expect(
      cerradasSinMedirEnTodo(
        unDocumento({
          proyectos: [
            unProyecto({ clave: CLAVE, tareas: [unaTarea({ clave: CLAVE, estado: 'iniciado' })] }),
          ],
        }),
      ),
    ).toBe(0);
  });
});

// --- 7. desglose y calendario sobre el conjunto -----------------------------

describe('desglosar y trabajado contra calendario', () => {
  const medida = (over: Partial<Resolucion>): Resolucion =>
    ({ dias: 1, tramos: 1, desarrollo: 1, pruebas: null, calendario: 1, tarea: unaTarea({ clave: CLAVE }), ...over }) as Resolucion;

  it('cada mitad viene con cuántas tareas la componen', () => {
    expect(
      desglosar([
        medida({ desarrollo: 2, pruebas: 1 }),
        medida({ desarrollo: 3, pruebas: null }),
      ]),
    ).toEqual({ desarrollo: 5, pruebas: 1, conDesarrollo: 2, conPruebas: 1 });
  });

  it('sin ningún tramo de pruebas la mitad es null, no cero', () => {
    const reparto = desglosar([medida({ desarrollo: 2, pruebas: null })]);
    expect(reparto.pruebas).toBeNull();
    expect(reparto.conPruebas).toBe(0);
  });

  it('el cociente se calla por debajo del mínimo, y el conteo no', () => {
    const pocas = trabajadoContraCalendario([medida({ dias: 1, calendario: 4 })]);
    expect(pocas).toMatchObject({ trabajado: 1, calendario: 4, sobre: 1, proporcion: null });
  });

  it('con suficientes da qué fracción del calendario fue trabajo', () => {
    const cinco = Array.from({ length: 5 }, () => medida({ dias: 1, calendario: 4 }));
    expect(trabajadoContraCalendario(cinco)).toEqual({
      trabajado: 5,
      calendario: 20,
      sobre: 5,
      proporcion: 0.25,
    });
  });

  it('sin calendario medible no hay cociente ni totales inventados', () => {
    expect(trabajadoContraCalendario([medida({ calendario: null })])).toEqual({
      trabajado: null,
      calendario: null,
      sobre: 0,
      proporcion: null,
    });
  });
});

// --- 8. esfuerzo ------------------------------------------------------------

describe('esfuerzo', () => {
  it('una suma sin ninguna estimación es null, no cero', () => {
    const suma = sumarEsfuerzo([unaTarea({ clave: CLAVE }), unaTarea({ clave: CLAVE })]);
    expect(suma.puntos, 'cero puntos y «sin estimar» no son lo mismo').toBeNull();
    expect(suma).toMatchObject({ estimadas: 0, total: 2 });
  });

  /** La letra chica va pegada al número: 8 pts sobre 2 de 3 tareas, nunca «8 pts». */
  it('la suma viene con cuántas la componen y cuántas faltan', () => {
    const suma = sumarEsfuerzo([
      unaTarea({ clave: CLAVE, esfuerzo: 3 }),
      unaTarea({ clave: CLAVE, esfuerzo: 5 }),
      unaTarea({ clave: CLAVE }),
    ]);
    expect(suma).toEqual({ puntos: 8, estimadas: 2, total: 3 });
  });

  it('días por punto solo mira las que tienen estimación Y tramos', () => {
    const medidas = [
      { dias: 6, tarea: unaTarea({ clave: CLAVE, esfuerzo: 3 }) },
      { dias: 4, tarea: unaTarea({ clave: CLAVE, esfuerzo: 5 }) },
      { dias: 90, tarea: unaTarea({ clave: CLAVE }) },
    ] as Resolucion[];
    // Solo dos estimadas: por debajo del mínimo NO se da el cociente, pero sí el conteo.
    expect(diasPorPunto(medidas)).toEqual({ dias: null, sobre: 2, puntos: 8 });
  });

  it('sin ninguna estimada no hay días por punto', () => {
    expect(diasPorPunto([{ dias: 5, tarea: unaTarea({ clave: CLAVE }) } as Resolucion])).toEqual({
      dias: null,
      sobre: 0,
      puntos: 0,
    });
  });

  /** Con suficientes sí, y el cociente viene con sobre cuántas se calculó (regla 3). */
  it('con cinco estimadas da el cociente, y dice sobre cuántas', () => {
    const medidas = Array.from({ length: 5 }, () => ({
      dias: 6,
      tarea: unaTarea({ clave: CLAVE, esfuerzo: 3 }),
    })) as Resolucion[];
    expect(diasPorPunto(medidas)).toEqual({ dias: 2, sobre: 5, puntos: 15 });
  });
});

// --- 9. invariantes sobre los árboles generados -----------------------------

/**
 * **Criterio 7.** Los casos escritos arriba cubren lo que se me ocurrió; esto cubre lo que
 * no. Cada afirmación de abajo, si se rompiera, haría que la vista de Tiempos enseñara un
 * número creíble y falso — que es peor que no enseñar ninguno.
 */
describe('invariantes del reloj sobre árboles generados', () => {
  const cada = (hacer: (doc: Documento, semilla: number) => void) => {
    for (const semilla of SEMILLAS) hacer(unDocumentoAleatorio(prng(semilla), semilla), semilla);
  };

  it('ninguna duración es negativa, NaN ni infinita', () => {
    cada((doc, semilla) => {
      for (const m of resoluciones(doc)) {
        expect(Number.isFinite(m.dias), `semilla ${semilla} · ${m.tarea.id}`).toBe(true);
        expect(m.dias, `semilla ${semilla} · ${m.tarea.id}`).toBeGreaterThanOrEqual(0);
      }
    });
  });

  /** Solo lo aceptado y con reloj se mide. Lo demás sería un dato inventado. */
  it('todo lo medido está aceptado y tiene al menos un tramo cerrado', () => {
    cada((doc) => {
      for (const m of resoluciones(doc)) {
        expect(m.tarea.estado).toBe('done');
        expect(m.tramos).toBeGreaterThan(0);
        expect(m.tarea.trabajo.some((t) => t.hasta !== null)).toBe(true);
      }
    });
  });

  /** La afirmación central de la etapa, sobre trescientos árboles y no sobre un caso. */
  it('`dias` es exactamente la suma de los tramos cerrados', () => {
    cada((doc, semilla) => {
      for (const m of resoluciones(doc)) {
        const aMano = m.tarea.trabajo
          .filter((t) => t.hasta !== null)
          .reduce((n, t) => n + (Date.parse(t.hasta!) - Date.parse(t.desde)) / 86_400_000, 0);
        expect(m.dias, `semilla ${semilla} · ${m.tarea.id}`).toBeCloseTo(aMano, 1);
      }
    });
  });

  /**
   * Las dos mitades se redondean por separado y el total sobre el crudo, así que la
   * identidad se sostiene a una décima y no al bit. Es una decisión: el total es el número
   * que entra a los promedios y tiene que ser fiel; el desglose es lectura. Lo que la
   * invariante prohíbe es que se separen más que eso — un desglose que no cuadra con su
   * total sería la clase de número que nadie puede verificar a ojo.
   */
  it('el desglose desarrollo/pruebas cuadra con el total, y ninguna mitad vale cero', () => {
    cada((doc, semilla) => {
      for (const m of resoluciones(doc)) {
        const mitades = (m.desarrollo ?? 0) + (m.pruebas ?? 0);
        // La diferencia se compara redondeada a décimas, que es la unidad en que los tres
        // números se presentan: sin eso la cota la decide el error binario del `+`, no la
        // regla que aquí se defiende.
        const separacion = Math.round(Math.abs(mitades - m.dias) * 10) / 10;
        expect(separacion, `semilla ${semilla} · ${m.tarea.id}`).toBeLessThanOrEqual(0.1);
        expect(m.desarrollo, `semilla ${semilla} · ${m.tarea.id}`).not.toBe(0);
        expect(m.pruebas, `semilla ${semilla} · ${m.tarea.id}`).not.toBe(0);
      }
    });
  });

  /** El calendario contiene al trabajo: lo que sobra es espera y nunca puede ser negativo. */
  it('el calendario nunca es menor que lo trabajado', () => {
    cada((doc, semilla) => {
      for (const m of resoluciones(doc)) {
        if (m.calendario === null) continue;
        expect(m.calendario, `semilla ${semilla} · ${m.tarea.id}`).toBeGreaterThanOrEqual(m.dias - 0.05);
      }
    });
  });

  /** Criterio 4, sobre volumen: una tarea sin tramos nunca produce un cero disfrazado. */
  it('ninguna tarea sin tramos cerrados devuelve 0', () => {
    cada((doc, semilla) => {
      for (const { tarea } of indexarTareas(doc).values()) {
        if (tarea.trabajo.some((t) => t.hasta !== null)) continue;
        expect(tiempoEnDesarrollo(tarea).dias, `semilla ${semilla} · ${tarea.id}`).toBeNull();
      }
    });
  });

  /** Criterio 3, sobre volumen: el generador no puede producir lo que el esquema rechaza. */
  it('ningún árbol generado trae dos tramos abiertos', () => {
    cada((doc, semilla) => {
      for (const { tarea } of indexarTareas(doc).values()) {
        expect(
          tarea.trabajo.filter((t) => t.hasta === null).length,
          `semilla ${semilla} · ${tarea.id}`,
        ).toBeLessThanOrEqual(1);
      }
      expect(validarDocumento(doc).ok, `semilla ${semilla}`).toBe(true);
    });
  });

  /**
   * Criterio 5, comprobado donde importa: que no exista NI UNA fila con promedio sobre
   * menos de cinco tareas, en ninguno de los cortes.
   */
  it('ninguna fila promedia por debajo del mínimo', () => {
    cada((doc, semilla) => {
      for (const fila of [...tiempoPorPersona(doc), ...tiempoPorProyecto(doc)]) {
        if (fila.tiempo.promedio === null) continue;
        expect(fila.tiempo.cuentan, `semilla ${semilla} · ${fila.id}`).toBeGreaterThanOrEqual(
          MINIMO_TAREAS_PARA_PROMEDIO,
        );
      }
    });
  });

  /** Criterio 6, sobre volumen: lo que corre está fuera de las medidas, siempre. */
  it('ninguna tarea con el reloj corriendo aparece entre las medidas', () => {
    cada((doc, semilla) => {
      const medidas = new Set(resoluciones(doc).map((m) => m.tarea.id));
      for (const reloj of relojesCorriendo(doc, HOY)) {
        expect(medidas.has(reloj.tarea.id), `semilla ${semilla} · ${reloj.tarea.id}`).toBe(false);
        expect(reloj.dias, `semilla ${semilla} · ${reloj.tarea.id}`).toBeGreaterThanOrEqual(0);
      }
    });
  });

  /** El corte por proyecto no puede perder ni duplicar medidas. */
  it('las filas por proyecto suman exactamente todas las resoluciones', () => {
    cada((doc, semilla) => {
      const enFilas = tiempoPorProyecto(doc).reduce((n, f) => n + f.tiempo.cuentan, 0);
      expect(enFilas, `semilla ${semilla}`).toBe(resoluciones(doc).length);
    });
  });

  /** Y las semillas tienen que traer material de verdad, o esto no mide nada. */
  it('las 300 semillas producen resoluciones medibles y relojes corriendo', () => {
    let medidas = 0;
    let corriendo = 0;
    cada((doc) => {
      medidas += resoluciones(doc).length;
      corriendo += relojesCorriendo(doc, HOY).length;
    });
    expect(medidas, 'si sale 0, el generador dejó de producir tareas aceptadas con tramos').toBeGreaterThan(50);
    expect(corriendo, 'si sale 0, la invariante del tramo abierto no está midiendo nada').toBeGreaterThan(50);
  });
});

/**
 * HALLAZGO · Las dos mitades de una fila de «por persona» cuentan poblaciones distintas.
 *
 * `tiempoPorPersona` documenta su regla de atribución sin ambigüedad: «Se atribuye a quien
 * tenía el compromiso en el sprint, no a quien figura hoy en la tarea. Reasignar algo el
 * mes que viene no puede reescribir quién lo resolvió.» Y así agrupa las resoluciones:
 * `resolucion.responsable` es `item?.responsable ?? tarea.responsable`.
 *
 * Pero la letra chica de esa MISMA fila —`sinMedir`, «cuántas aceptadas quedaron fuera del
 * cálculo»— se cuenta con la otra regla:
 *
 *     cerradasSinMedir(doc, (u) => u.tarea.responsable === id)
 *
 * mira el responsable actual de la tarea y no el del compromiso. Así que en una fila
 * conviven un numerador contado por compromiso y un pie de nota contado por asignación
 * vigente, y con solo dos tareas ya se separan: aquí Ana resolvió la medible y Beto se
 * comprometió con la que no se pudo medir, y la app dice «Ana · 1 medida · 1 sin medir» y
 * «Beto · 1 medida · 0 sin medir». Las dos frases son falsas en su mitad.
 *
 * Por qué importa y no es cosmético: `sinMedir` es lo que decide si el promedio de arriba
 * habla de todo el trabajo de esa persona o de una rebanada. Basta un puñado de tareas
 * reasignadas para que a alguien le cuelgue un «40 sin medir» que pertenece a otro, y el
 * lector concluya que su promedio no vale nada — o al revés. El corte por PROYECTO no
 * tiene el problema: ahí las dos mitades usan `ubicacion.proyecto.clave`, que es la misma
 * llave. Es solo el corte por persona.
 *
 * **Se deja en rojo a propósito.** La prueba no elige cuál de las dos reglas es la buena:
 * afirma que tienen que ser la misma, que es lo único que se puede sostener sin decidir
 * por el dueño del código. El arreglo es de una línea en cualquiera de las dos
 * direcciones, y `tests/modelo/oro-documento-reloj.json` ya congela el comportamiento
 * actual, así que al corregirlo hay que regenerarlo y el diff dirá exactamente qué se
 * movió.
 */
describe('HALLAZGO · el corte por persona mezcla dos reglas de atribución', () => {
  const t = (dia: string) => `2026-08-${dia}T09:00:00-06:00`;

  /** Ana resolvió PM-T1; el compromiso de PM-T2 —sin tramos— fue de Beto. */
  const documento = () => {
    const medible = unaTarea({
      clave: 'PM',
      id: 'PM-T1',
      estado: 'done',
      responsable: 'ana',
      aceptada_en: t('05'),
      trabajo: [{ desde: t('01'), hasta: t('03'), estado: 'iniciado' }],
    });
    const sinMedir = unaTarea({
      clave: 'PM',
      id: 'PM-T2',
      estado: 'done',
      // Sigue asignada a Ana, pero quien la cerró en el sprint fue Beto.
      responsable: 'ana',
      aceptada_en: t('06'),
    });
    return unDocumento({
      personas: [unaPersona({ id: 'ana', nombre: 'Ana' }), unaPersona({ id: 'beto', nombre: 'Beto' })],
      proyectos: [unProyecto({ clave: 'PM', tareas: [medible, sinMedir] })],
      sprints: [
        unSprint({
          estado: 'cerrado',
          clave: 'PM',
          items: [unItem('PM-T1'), unItem('PM-T2', { responsable: 'beto' })],
        }),
      ],
    });
  };

  it('la fila de una persona cuenta lo medido y lo no medido con la misma regla', () => {
    const filas = tiempoPorPersona(documento());
    const ana = filas.find((f) => f.id === 'ana');
    const beto = filas.find((f) => f.id === 'beto');

    // Control positivo: la atribución por compromiso SÍ funciona para lo medido.
    expect(ana?.tiempo.cuentan, 'Ana resolvió PM-T1').toBe(1);
    expect(beto, 'Beto no resolvió nada medible, así que no tiene fila').toBeUndefined();

    // Y aquí está el defecto: PM-T2 la cerró Beto, pero su «sin medir» cuelga de Ana
    // porque `cerradasSinMedir` mira `tarea.responsable` en vez del compromiso.
    expect(
      ana?.tiempo.sinMedir,
      'PM-T2 la cerró Beto: no puede contarse en la letra chica de Ana',
    ).toBe(0);
  });
});
