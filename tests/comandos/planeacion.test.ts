/**
 * Planeación e identidad: `cerrarPlaneacion`, `reabrirPlaneacion` y `fijarUsuario`.
 *
 * Los tres tocan campos que parecen banderas y no lo son. Lo que se congela aquí:
 *
 * - **`planeada` es procedencia, no estado** (regla 17). Se decide en el momento de la
 *   captura y nadie la reescribe hacia atrás: reabrir la planeación NO reclasifica lo
 *   que se capturó mientras estuvo cerrada.
 * - **El límite del cierre es de un día completo y es de gracia**: lo capturado el mismo
 *   día del cierre sigue contando como planeado. La misma regla vive en el reductor
 *   (`naceComoPlaneada`) y en `dominio/sprint.ts` (`capturaNaceNoPlaneada`), que es lo
 *   que el formulario usa para AVISAR antes de capturar. Si las dos divergen, el
 *   formulario promete una procedencia y el reductor escribe otra — hay una prueba que
 *   las compara sobre la misma matriz de fechas y se pone roja el día que se separen.
 * - **`crearTarea` usa `??` y no `||`** para el `planeada` explícito, así que un `false`
 *   mandado a propósito tiene que sobrevivir. Con `||` se convertiría en `true` en
 *   silencio y se perdería justo la señal de trabajo emergente que el campo existe para
 *   registrar.
 * - **Dos clases de referencia a una persona.** Una que cita historia (`responsable` de
 *   una tarea, de un item de sprint) PROHÍBE el borrado. Una que solo dice cómo están las
 *   cosas hoy (`usuario`, la pertenencia a equipos) se SUELTA sola. Es la distinción de
 *   fondo y las dos mitades se prueban juntas: sin el contraste, cualquiera de las dos
 *   parece una inconsistencia.
 */

import { describe, expect, it } from 'vitest';

import { capturaNaceNoPlaneada } from '../../src/compartido/dominio/sprint';
import { validarDocumento } from '../../src/compartido/modelo/esquema';
import type { Documento, Fecha, Instante, Tarea } from '../../src/compartido/modelo/tipos';
import { reducir } from '../../src/principal/comandos/reductor';
import { requiereFlushInmediato, validarComando } from '../../src/principal/comandos/tipos';
import { unDocumento, unItem, unSprint } from '../apoyo/constructores';
import {
  AHORA,
  HOY,
  aplicar,
  aplicarTodos,
  arbolVacio,
  copiaProfunda,
  exigirError,
  exigirOk,
  exigirValido,
  reducirSinMutar,
} from '../apoyo/comandos';

const CLAVE = 'PM';
const HISTORIA = 'PM-H1';

/** Instante de un día cualquiera a las once de la mañana. */
const alMediodia = (fecha: Fecha): Instante => `${fecha}T11:20:00-06:00`;

const tareas = (doc: Documento): Tarea[] =>
  doc.proyectos[0]?.epicas[0]?.historias[0]?.tareas ?? [];

const procedencias = (doc: Documento): [string, boolean][] =>
  tareas(doc).map((t) => [t.titulo, t.planeada]);

// --- cerrarPlaneacion --------------------------------------------------------

describe('cerrarPlaneacion', () => {
  it('fija la marca en el DÍA del instante recibido, no en el instante completo', () => {
    const { doc } = arbolVacio(CLAVE);
    expect(doc.proyectos[0]?.planeacion_cerrada_en).toBeNull();

    const { documento } = exigirOk(
      reducirSinMutar(doc, { comando: 'cerrarPlaneacion', proyecto: CLAVE }),
    );
    expect(documento.proyectos[0]?.planeacion_cerrada_en).toBe(HOY);
  });

  it('no toca NI UNA tarea existente: eso es justamente lo que significa «esto es lo planeado»', () => {
    const { doc } = arbolVacio(CLAVE);
    const conTareas = aplicarTodos(doc, [
      { comando: 'crearTarea', contenedorId: HISTORIA, titulo: 'Uno' },
      { comando: 'crearTarea', contenedorId: HISTORIA, titulo: 'Dos', planeada: false },
      { comando: 'cambiarEstado', id: 'PM-T1', estado: 'done' },
    ]);

    const { documento } = exigirOk(
      reducirSinMutar(conTareas, { comando: 'cerrarPlaneacion', proyecto: CLAVE }),
    );
    // El documento entero, salvo el único campo que este comando existe para escribir.
    const esperado = copiaProfunda(conTareas);
    esperado.proyectos[0]!.planeacion_cerrada_en = HOY;
    expect(documento).toEqual(esperado);
  });

  it('el doble cierre se rechaza y dice desde cuándo estaba cerrada', () => {
    const { doc } = arbolVacio(CLAVE);
    const cerrada = aplicar(doc, { comando: 'cerrarPlaneacion', proyecto: CLAVE });

    const error = exigirError(
      reducirSinMutar(cerrada, { comando: 'cerrarPlaneacion', proyecto: CLAVE }, alMediodia('2026-09-10')),
    );
    expect(error.codigo).toBe('invalido');
    expect(error.mensaje).toContain(`ya está cerrada desde ${HOY}`);
  });

  it('un segundo cierre rechazado no mueve la fecha original', () => {
    // Si el rechazo llegara después de escribir, la marca saltaría un mes hacia adelante
    // y todo lo capturado en medio pasaría a contarse como planeado.
    const { doc } = arbolVacio(CLAVE);
    const cerrada = aplicar(doc, { comando: 'cerrarPlaneacion', proyecto: CLAVE });
    const antes = copiaProfunda(cerrada);

    const resultado = reducir(
      cerrada,
      { comando: 'cerrarPlaneacion', proyecto: CLAVE },
      alMediodia('2026-09-10'),
    );
    expect(resultado.ok).toBe(false);
    expect(cerrada).toEqual(antes);
    expect(cerrada.proyectos[0]?.planeacion_cerrada_en).toBe(HOY);
  });

  it('sobre un proyecto que no existe da no-encontrado', () => {
    const { doc } = arbolVacio(CLAVE);
    const error = exigirError(
      reducirSinMutar(doc, { comando: 'cerrarPlaneacion', proyecto: 'FANTASMA' }),
    );
    expect(error.codigo).toBe('no-encontrado');
  });

  it('el evento cuenta cuántas tareas quedaron del lado planeado', () => {
    const { doc } = arbolVacio(CLAVE);
    const conTareas = aplicarTodos(doc, [
      { comando: 'crearTarea', contenedorId: HISTORIA, titulo: 'Uno' },
      { comando: 'crearTarea', contenedorId: HISTORIA, titulo: 'Dos' },
      { comando: 'crearTarea', contenedorId: HISTORIA, titulo: 'Coló', planeada: false },
    ]);
    const { evento } = exigirOk(
      reducirSinMutar(conTareas, { comando: 'cerrarPlaneacion', proyecto: CLAVE }),
    );
    expect(evento.proyecto_id).toBe(CLAVE);
    expect(evento.detalle).toMatchObject({ planeacion_cerrada_en: HOY, tareas_planeadas: 2 });
    expect(evento.resumen).toContain('2 tareas');
  });

  it('cerrar la planeación de un proyecto no toca la de otro', () => {
    const uno = arbolVacio('PM');
    const otro = arbolVacio('OTRO');
    const doc: Documento = { ...uno.doc, proyectos: [...uno.doc.proyectos, ...otro.doc.proyectos] };

    const { documento } = exigirOk(
      reducirSinMutar(doc, { comando: 'cerrarPlaneacion', proyecto: 'PM' }),
    );
    expect(documento.proyectos[0]?.planeacion_cerrada_en).toBe(HOY);
    expect(documento.proyectos[1]?.planeacion_cerrada_en).toBeNull();
  });

  it('cerrar la planeación y cerrar el PROYECTO son campos distintos y no se contagian', () => {
    const { doc } = arbolVacio(CLAVE);
    const conPlaneacion = aplicar(doc, { comando: 'cerrarPlaneacion', proyecto: CLAVE });
    expect(conPlaneacion.proyectos[0]?.cerrado_en).toBeNull();
    expect(conPlaneacion.proyectos[0]?.archivado).toBe(false);
  });
});

// --- reabrirPlaneacion -------------------------------------------------------

describe('reabrirPlaneacion', () => {
  it('devuelve la marca a null', () => {
    const { doc } = arbolVacio(CLAVE);
    const cerrada = aplicar(doc, { comando: 'cerrarPlaneacion', proyecto: CLAVE });

    const { documento } = exigirOk(
      reducirSinMutar(cerrada, { comando: 'reabrirPlaneacion', proyecto: CLAVE }),
    );
    expect(documento.proyectos[0]?.planeacion_cerrada_en).toBeNull();
  });

  it('reabrir lo que no está cerrado se rechaza', () => {
    const { doc } = arbolVacio(CLAVE);
    const error = exigirError(
      reducirSinMutar(doc, { comando: 'reabrirPlaneacion', proyecto: CLAVE }),
    );
    expect(error.codigo).toBe('invalido');
    expect(error.mensaje).toContain('no está cerrada');
  });

  it('reabrir dos veces: la segunda se rechaza', () => {
    const { doc } = arbolVacio(CLAVE);
    const ida = aplicarTodos(doc, [
      { comando: 'cerrarPlaneacion', proyecto: CLAVE },
      { comando: 'reabrirPlaneacion', proyecto: CLAVE },
    ]);
    expect(exigirError(reducirSinMutar(ida, { comando: 'reabrirPlaneacion', proyecto: CLAVE })).codigo).toBe(
      'invalido',
    );
  });

  it('NO reclasifica: lo capturado mientras estuvo cerrada conserva su planeada false', () => {
    // La prueba central de este comando. Reabrir no sabe CUÁLES de esas tareas se
    // marcaron mal, así que «corregirlas» arrasaría con las que fueron emergentes de
    // verdad.
    const { doc } = arbolVacio(CLAVE);
    const cerrada = aplicar(doc, { comando: 'cerrarPlaneacion', proyecto: CLAVE });
    const conColada = aplicar(
      cerrada,
      { comando: 'crearTarea', contenedorId: HISTORIA, titulo: 'Se coló' },
      alMediodia('2026-09-01'),
    );
    expect(tareas(conColada)[0]?.planeada).toBe(false);

    const { documento } = exigirOk(
      reducirSinMutar(conColada, { comando: 'reabrirPlaneacion', proyecto: CLAVE }, alMediodia('2026-09-02')),
    );
    expect(tareas(documento)[0]?.planeada).toBe(false);
  });

  it('reabrir deja el documento idéntico salvo la marca: ni una tarea cambia de nada', () => {
    const { doc } = arbolVacio(CLAVE);
    const cerrada = aplicar(doc, { comando: 'cerrarPlaneacion', proyecto: CLAVE });
    const conTareas = aplicarTodos(
      cerrada,
      [
        { comando: 'crearTarea', contenedorId: HISTORIA, titulo: 'Coló una' },
        { comando: 'crearTarea', contenedorId: HISTORIA, titulo: 'Coló otra' },
        { comando: 'cambiarEstado', id: 'PM-T1', estado: 'iniciado' },
      ],
      alMediodia('2026-09-01'),
    );

    const { documento } = exigirOk(
      reducirSinMutar(conTareas, { comando: 'reabrirPlaneacion', proyecto: CLAVE }, alMediodia('2026-09-02')),
    );
    const esperado = copiaProfunda(conTareas);
    esperado.proyectos[0]!.planeacion_cerrada_en = null;
    expect(documento).toEqual(esperado);
  });

  it('el evento dice desde cuándo estaba cerrada y cuántas quedaron sin reclasificar', () => {
    const { doc } = arbolVacio(CLAVE);
    const cerrada = aplicar(doc, { comando: 'cerrarPlaneacion', proyecto: CLAVE });
    const conColadas = aplicarTodos(
      cerrada,
      [
        { comando: 'crearTarea', contenedorId: HISTORIA, titulo: 'A' },
        { comando: 'crearTarea', contenedorId: HISTORIA, titulo: 'B' },
      ],
      alMediodia('2026-09-01'),
    );
    const { evento } = exigirOk(
      reducirSinMutar(conColadas, { comando: 'reabrirPlaneacion', proyecto: CLAVE }, alMediodia('2026-09-02')),
    );
    expect(evento.detalle).toMatchObject({ estaba_cerrada_desde: HOY, tareas_no_planeadas: 2 });
    expect(evento.resumen).toContain('sin reclasificar: 2 tareas');
  });

  it('tras reabrir, lo NUEVO vuelve a nacer planeado: la regla futura sí cambia', () => {
    // El contraste de «no reclasifica»: reabrir no reescribe el pasado, pero sí cambia
    // lo que pasa de aquí en adelante. Sin esta mitad, la prueba anterior sería
    // compatible con un comando que no hiciera absolutamente nada.
    const { doc } = arbolVacio(CLAVE);
    const reabierta = aplicarTodos(doc, [
      { comando: 'cerrarPlaneacion', proyecto: CLAVE },
      { comando: 'reabrirPlaneacion', proyecto: CLAVE },
    ]);
    const conNueva = aplicar(
      reabierta,
      { comando: 'crearTarea', contenedorId: HISTORIA, titulo: 'Después de reabrir' },
      alMediodia('2026-09-05'),
    );
    expect(tareas(conNueva)[0]?.planeada).toBe(true);
  });
});

// --- la cadena completa ------------------------------------------------------

describe('cerrar → capturar → reabrir → capturar: cada tarea con la procedencia de su momento', () => {
  it('las cuatro capturas conservan lo que eran cuando se capturaron', () => {
    const { doc } = arbolVacio(CLAVE);

    // 1. Planeando todavía: lo capturado ahora es lo previsto.
    const planeando = aplicar(
      doc,
      { comando: 'crearTarea', contenedorId: HISTORIA, titulo: '1 · durante la planeación' },
      alMediodia('2026-08-20'),
    );

    // 2. Se cierra la planeación el 26.
    const cerrada = aplicar(planeando, { comando: 'cerrarPlaneacion', proyecto: CLAVE }, AHORA);

    // 3. Lo que se cuela el 1 de septiembre: emergente.
    const colada = aplicar(
      cerrada,
      { comando: 'crearTarea', contenedorId: HISTORIA, titulo: '2 · se coló con la planeación cerrada' },
      alMediodia('2026-09-01'),
    );

    // 4. El 5 se decide que en realidad se seguía planeando y se reabre.
    const reabierta = aplicar(colada, { comando: 'reabrirPlaneacion', proyecto: CLAVE }, alMediodia('2026-09-05'));

    // 5. Lo capturado después vuelve a ser planeado.
    const final = aplicar(
      reabierta,
      { comando: 'crearTarea', contenedorId: HISTORIA, titulo: '3 · con la planeación reabierta' },
      alMediodia('2026-09-06'),
    );

    expect(procedencias(final)).toEqual([
      ['1 · durante la planeación', true],
      ['2 · se coló con la planeación cerrada', false],
      ['3 · con la planeación reabierta', true],
    ]);
    exigirValido(final, 'tras la cadena completa de planeación');
  });

  it('y un segundo cierre vuelve a marcar emergente lo que venga: la mecánica es reutilizable', () => {
    const { doc } = arbolVacio(CLAVE);
    const final = aplicarTodos(
      aplicarTodos(
        aplicarTodos(doc, [{ comando: 'cerrarPlaneacion', proyecto: CLAVE }], alMediodia('2026-08-26')),
        [
          { comando: 'crearTarea', contenedorId: HISTORIA, titulo: 'A · emergente' },
          { comando: 'reabrirPlaneacion', proyecto: CLAVE },
          { comando: 'crearTarea', contenedorId: HISTORIA, titulo: 'B · planeada' },
          { comando: 'cerrarPlaneacion', proyecto: CLAVE },
        ],
        alMediodia('2026-09-01'),
      ),
      [{ comando: 'crearTarea', contenedorId: HISTORIA, titulo: 'C · emergente otra vez' }],
      alMediodia('2026-09-02'),
    );

    expect(procedencias(final)).toEqual([
      ['A · emergente', false],
      ['B · planeada', true],
      ['C · emergente otra vez', false],
    ]);
  });
});

// --- crearTarea con `planeada` explícito -------------------------------------

describe('crearTarea acepta planeada explícito, y es `??` — no `||`', () => {
  it('un `false` explícito SOBREVIVE en un proyecto que nunca cerró su planeación', () => {
    // La prueba que mata el `||`. Con `comando.planeada || naceComoPlaneada(...)`, este
    // `false` se convertiría en `true` y la captura directa en el sprint —la mejor señal
    // de trabajo emergente que tiene el producto— se perdería entera en todos los
    // proyectos que no cerraron su planeación.
    const { doc } = arbolVacio(CLAVE);
    expect(doc.proyectos[0]?.planeacion_cerrada_en).toBeNull();

    const { documento } = exigirOk(
      reducirSinMutar(doc, {
        comando: 'crearTarea',
        contenedorId: HISTORIA,
        titulo: 'Capturada directo en el sprint',
        planeada: false,
      }),
    );
    expect(tareas(documento)[0]?.planeada).toBe(false);
  });

  it('un `true` explícito gana con la planeación ya cerrada: la corrección va en los dos sentidos', () => {
    const { doc } = arbolVacio(CLAVE);
    const cerrada = aplicar(doc, { comando: 'cerrarPlaneacion', proyecto: CLAVE });

    const { documento } = exigirOk(
      reducirSinMutar(
        cerrada,
        { comando: 'crearTarea', contenedorId: HISTORIA, titulo: 'Sí estaba en el plan', planeada: true },
        alMediodia('2026-09-15'),
      ),
    );
    expect(tareas(documento)[0]?.planeada).toBe(true);
  });

  it('ausente = lo decide el proyecto, en los dos sentidos', () => {
    const { doc } = arbolVacio(CLAVE);
    const abierta = aplicar(doc, { comando: 'crearTarea', contenedorId: HISTORIA, titulo: 'Sin cerrar' });
    expect(tareas(abierta)[0]?.planeada).toBe(true);

    const cerrada = aplicar(doc, { comando: 'cerrarPlaneacion', proyecto: CLAVE });
    const despues = aplicar(
      cerrada,
      { comando: 'crearTarea', contenedorId: HISTORIA, titulo: 'Con la planeación cerrada' },
      alMediodia('2026-09-15'),
    );
    expect(tareas(despues)[0]?.planeada).toBe(false);
  });

  it('el evento distingue si la procedencia la puso el usuario o la fecha', () => {
    const { doc } = arbolVacio(CLAVE);
    const explicita = exigirOk(
      reducirSinMutar(doc, {
        comando: 'crearTarea',
        contenedorId: HISTORIA,
        titulo: 'Emergente a mano',
        planeada: false,
      }),
    ).evento;
    expect(explicita.detalle).toMatchObject({ planeada: false, explicita: true });

    const implicita = exigirOk(
      reducirSinMutar(doc, { comando: 'crearTarea', contenedorId: HISTORIA, titulo: 'Normal' }),
    ).evento;
    expect(implicita.detalle).toMatchObject({ planeada: true, explicita: false });
  });

  it('el payload NO acepta null: dos formas de decir «ausente» son dos ramas que divergen', () => {
    const conNull = validarComando({
      comando: 'crearTarea',
      contenedorId: HISTORIA,
      titulo: 'X',
      planeada: null,
    });
    expect(conNull.ok).toBe(false);

    const sinCampo = validarComando({ comando: 'crearTarea', contenedorId: HISTORIA, titulo: 'X' });
    expect(sinCampo.ok).toBe(true);
  });

  it('editarTarea no puede cambiar la procedencia: no es un campo editable', () => {
    // `planeada` es un hecho del momento de la captura; si se pudiera editar, la
    // no-reclasificación de `reabrirPlaneacion` sería una formalidad sin efecto.
    const resultado = validarComando({ comando: 'editarTarea', id: 'PM-T1', planeada: true });
    expect(resultado.ok).toBe(false);
  });
});

// --- el límite del mismo día, y las DOS funciones que lo dicen ---------------

describe('el día del cierre es de gracia: lo capturado ese mismo día sigue siendo planeado', () => {
  it('capturar el MISMO día del cierre da planeada true', () => {
    const { doc } = arbolVacio(CLAVE);
    const cerrada = aplicar(doc, { comando: 'cerrarPlaneacion', proyecto: CLAVE }, alMediodia('2026-08-26'));
    // Más tarde, el mismo día.
    const mismoDia = aplicar(
      cerrada,
      { comando: 'crearTarea', contenedorId: HISTORIA, titulo: 'Por la tarde del mismo día' },
      `2026-08-26T23:59:00-06:00`,
    );
    expect(tareas(mismoDia)[0]?.planeada).toBe(true);
  });

  it('capturar al día SIGUIENTE ya da planeada false: el límite está donde se dijo', () => {
    const { doc } = arbolVacio(CLAVE);
    const cerrada = aplicar(doc, { comando: 'cerrarPlaneacion', proyecto: CLAVE }, alMediodia('2026-08-26'));
    const alDiaSiguiente = aplicar(
      cerrada,
      { comando: 'crearTarea', contenedorId: HISTORIA, titulo: 'A la mañana siguiente' },
      `2026-08-27T00:01:00-06:00`,
    );
    expect(tareas(alDiaSiguiente)[0]?.planeada).toBe(false);
  });

  it('capturar ANTES del cierre —un JSON editado a mano con fecha futura— también es planeado', () => {
    const { doc } = arbolVacio(CLAVE);
    const conFuturo: Documento = {
      ...doc,
      proyectos: [{ ...doc.proyectos[0]!, planeacion_cerrada_en: '2026-12-31' }],
    };
    const capturada = aplicar(
      conFuturo,
      { comando: 'crearTarea', contenedorId: HISTORIA, titulo: 'Antes del cierre' },
      alMediodia('2026-09-01'),
    );
    expect(tareas(capturada)[0]?.planeada).toBe(true);
  });

  /**
   * La regla vive en dos archivos: `naceComoPlaneada` en el reductor, que ESCRIBE, y
   * `capturaNaceNoPlaneada` en `dominio/sprint.ts`, que la interfaz usa para AVISAR antes
   * de capturar. No se pueden unificar sin que el dominio dependa del proceso principal,
   * así que lo que queda es comprobar que dicen lo mismo — y comprobarlo aquí, contra el
   * reductor de verdad, no contra una copia de la regla escrita en la prueba.
   *
   * El día que alguien mueva el límite en un archivo y no en el otro, esta prueba se pone
   * roja con la fecha exacta en la que dejaron de coincidir.
   */
  it('el reductor y dominio/sprint.ts coinciden en TODA la frontera, día por día', () => {
    const cierres: (Fecha | null)[] = [null, '2026-08-26'];
    const dias: Fecha[] = [
      '2026-08-24',
      '2026-08-25',
      '2026-08-26', // el día del cierre: el de gracia
      '2026-08-27', // el primero que ya no lo es
      '2026-08-28',
      '2026-09-30',
    ];

    let comparadas = 0;
    for (const cierre of cierres) {
      const { doc } = arbolVacio(CLAVE);
      const conCierre: Documento = {
        ...doc,
        proyectos: [{ ...doc.proyectos[0]!, planeacion_cerrada_en: cierre }],
      };
      for (const dia of dias) {
        const capturada = aplicar(
          conCierre,
          { comando: 'crearTarea', contenedorId: HISTORIA, titulo: `Capturada el ${dia}` },
          alMediodia(dia),
        );
        const escribioNoPlaneada = tareas(capturada)[0]?.planeada === false;
        const anuncioNoPlaneada = capturaNaceNoPlaneada(conCierre.proyectos[0]!, dia);
        expect(
          escribioNoPlaneada,
          `cierre=${cierre ?? 'null'} captura=${dia}: el formulario anuncia ` +
            `${anuncioNoPlaneada ? 'NO planeada' : 'planeada'} y el reductor escribió ` +
            `${escribioNoPlaneada ? 'NO planeada' : 'planeada'}`,
        ).toBe(anuncioNoPlaneada);
        comparadas += 1;
      }
    }
    // Sin esto, un bucle que no entrara nunca dejaría la prueba verde sin comparar nada.
    expect(comparadas).toBe(cierres.length * dias.length);
  });

  it('y la frontera comparada no es trivial: dentro de esa matriz hay de los dos resultados', () => {
    const proyecto = { ...arbolVacio(CLAVE).doc.proyectos[0]!, planeacion_cerrada_en: '2026-08-26' as Fecha };
    expect(capturaNaceNoPlaneada(proyecto, '2026-08-26')).toBe(false);
    expect(capturaNaceNoPlaneada(proyecto, '2026-08-27')).toBe(true);
  });
});

// --- fijarUsuario ------------------------------------------------------------

describe('fijarUsuario', () => {
  /** Documento con dos personas activas y ninguna fijada. */
  function conPersonas(): Documento {
    return aplicarTodos(unDocumento(), [
      { comando: 'crearPersona', nombre: 'Ana García' },
      { comando: 'crearPersona', nombre: 'Beto Ruiz' },
    ]);
  }

  it('fija a una persona activa', () => {
    const { documento, evento } = exigirOk(
      reducirSinMutar(conPersonas(), { comando: 'fijarUsuario', id: 'ana-garcia' }),
    );
    expect(documento.usuario).toBe('ana-garcia');
    expect(evento.detalle).toMatchObject({ antes: null, despues: 'ana-garcia' });
    expect(evento.resumen).toContain('Ana García (ana-garcia)');
  });

  it('cambiar de una persona a otra deja constancia del antes', () => {
    const conAna = aplicar(conPersonas(), { comando: 'fijarUsuario', id: 'ana-garcia' });
    const { documento, evento } = exigirOk(
      reducirSinMutar(conAna, { comando: 'fijarUsuario', id: 'beto-ruiz' }),
    );
    expect(documento.usuario).toBe('beto-ruiz');
    expect(evento.detalle).toMatchObject({ antes: 'ana-garcia', despues: 'beto-ruiz' });
  });

  it('null lo borra: la app vuelve a no saber quién la usa, sin editar el JSON', () => {
    const conAna = aplicar(conPersonas(), { comando: 'fijarUsuario', id: 'ana-garcia' });
    const { documento, evento } = exigirOk(
      reducirSinMutar(conAna, { comando: 'fijarUsuario', id: null }),
    );
    expect(documento.usuario).toBeNull();
    expect(evento.resumen).toContain('sin fijar');
  });

  it('a alguien DESACTIVADO se rechaza, y el mensaje dice cómo desatascarse', () => {
    const doc = aplicar(conPersonas(), { comando: 'desactivarPersona', id: 'ana-garcia' });
    const error = exigirError(reducirSinMutar(doc, { comando: 'fijarUsuario', id: 'ana-garcia' }));
    expect(error.codigo).toBe('invalido');
    expect(error.mensaje).toContain('está desactivada');
    expect(error.mensaje).toContain('reactivarPersona');
  });

  it('a alguien que no existe da no-encontrado, que es otro diagnóstico', () => {
    const error = exigirError(
      reducirSinMutar(conPersonas(), { comando: 'fijarUsuario', id: 'nadie' }),
    );
    expect(error.codigo).toBe('no-encontrado');
  });

  it('fijar a quien ya está fijado se rechaza: no hay nada que apilar ni que contar', () => {
    const conAna = aplicar(conPersonas(), { comando: 'fijarUsuario', id: 'ana-garcia' });
    const error = exigirError(reducirSinMutar(conAna, { comando: 'fijarUsuario', id: 'ana-garcia' }));
    expect(error.codigo).toBe('invalido');
    expect(error.mensaje).toContain('no indica ningún cambio');
  });

  it('poner null cuando ya estaba en null también se rechaza', () => {
    const error = exigirError(reducirSinMutar(conPersonas(), { comando: 'fijarUsuario', id: null }));
    expect(error.codigo).toBe('invalido');
  });

  it('el id es obligatorio y nullable: no hay «ausente = no tocar» en este comando', () => {
    expect(validarComando({ comando: 'fijarUsuario' }).ok).toBe(false);
    expect(validarComando({ comando: 'fijarUsuario', id: null }).ok).toBe(true);
    expect(validarComando({ comando: 'fijarUsuario', id: '' }).ok).toBe(false);
  });

  it('fijar al usuario no toca a las personas ni al resto del documento', () => {
    const doc = conPersonas();
    const { documento } = exigirOk(
      reducirSinMutar(doc, { comando: 'fijarUsuario', id: 'beto-ruiz' }),
    );
    const esperado = copiaProfunda(doc);
    esperado.usuario = 'beto-ruiz';
    expect(documento).toEqual(esperado);
  });

  it('cerrar la planeación y fijar el usuario exigen vaciado inmediato', () => {
    // Los dos cambian cómo se comporta la app entera; perderlos por medio segundo dejaría
    // al usuario capturando con una regla distinta de la que cree.
    expect(requiereFlushInmediato({ comando: 'cerrarPlaneacion', proyecto: CLAVE })).toBe(true);
    expect(requiereFlushInmediato({ comando: 'reabrirPlaneacion', proyecto: CLAVE })).toBe(true);
    expect(requiereFlushInmediato({ comando: 'fijarUsuario', id: null })).toBe(true);
  });
});

// --- las dos clases de referencia a una persona ------------------------------

describe('una referencia que cita historia prohíbe el borrado; una que dice el presente se suelta', () => {
  /** Ana es el usuario de la app y no tiene ninguna atadura histórica. */
  function anaEsElUsuario(): Documento {
    return aplicarTodos(unDocumento(), [
      { comando: 'crearPersona', nombre: 'Ana García' },
      { comando: 'crearPersona', nombre: 'Beto Ruiz' },
      { comando: 'fijarUsuario', id: 'ana-garcia' },
    ]);
  }

  it('DESACTIVAR a quien es el usuario lo suelta en vez de bloquear, y el documento sigue válido', () => {
    const doc = anaEsElUsuario();
    const { documento, evento } = exigirOk(
      reducirSinMutar(doc, { comando: 'desactivarPersona', id: 'ana-garcia' }),
    );
    expect(documento.usuario).toBeNull();
    expect(documento.personas.find((p) => p.id === 'ana-garcia')?.activa).toBe(false);
    // Sigue en el documento con toda su historia: la baja no la borra.
    expect(documento.personas.map((p) => p.id)).toEqual(['ana-garcia', 'beto-ruiz']);
    expect(evento.detalle).toMatchObject({ era_usuario: true });
    exigirValido(documento, 'tras soltar al usuario por desactivación');
  });

  it('ELIMINAR a quien es el usuario también lo suelta, y el documento sigue válido', () => {
    const doc = anaEsElUsuario();
    const { documento, evento } = exigirOk(
      reducirSinMutar(doc, { comando: 'eliminarPersona', id: 'ana-garcia' }),
    );
    expect(documento.usuario).toBeNull();
    expect(documento.personas.map((p) => p.id)).toEqual(['beto-ruiz']);
    expect(evento.detalle).toMatchObject({ era_usuario: true });
    exigirValido(documento, 'tras soltar al usuario por eliminación');
  });

  it('ser el usuario NO cuenta como atadura: no es lo que impide el borrado', () => {
    // Si `usuario` contara entre las razones de `referenciasAPersona`, este comando se
    // rechazaría y el usuario tendría que adivinar que hay que desfijarse a sí mismo
    // antes de borrarse.
    const resultado = reducirSinMutar(anaEsElUsuario(), { comando: 'eliminarPersona', id: 'ana-garcia' });
    expect(resultado.ok).toBe(true);
  });

  it('en cambio, ser responsable de una tarea SÍ prohíbe el borrado', () => {
    const { doc } = arbolVacio(CLAVE);
    const conAna = aplicarTodos(doc, [
      { comando: 'crearPersona', nombre: 'Ana García' },
      { comando: 'crearTarea', contenedorId: HISTORIA, titulo: 'Suya', responsable: 'ana-garcia' },
      { comando: 'fijarUsuario', id: 'ana-garcia' },
    ]);
    const error = exigirError(reducirSinMutar(conAna, { comando: 'eliminarPersona', id: 'ana-garcia' }));
    expect(error.codigo).toBe('invalido');
    expect(error.mensaje).toContain('es responsable de 1 tarea');
    expect(error.mensaje).toContain('desactivarPersona');
  });

  it('y aparecer en un sprint CERRADO también: eso no se reescribe (regla 8)', () => {
    const base = aplicarTodos(unDocumento(), [{ comando: 'crearPersona', nombre: 'Ana García' }]);
    const doc: Documento = {
      ...base,
      usuario: 'ana-garcia',
      proyectos: [],
      sprints: [
        unSprint({
          id: 'S-33',
          estado: 'cerrado',
          items: [],
        }),
      ],
    };
    // El item se inyecta a mano porque no hay tarea: lo que se prueba es la referencia
    // del sprint, no la del árbol.
    doc.sprints[0]!.items = [{ ...unItem('PM-T1', { responsable: 'ana-garcia' }) }];

    const error = exigirError(reducirSinMutar(doc, { comando: 'eliminarPersona', id: 'ana-garcia' }));
    expect(error.codigo).toBe('invalido');
    expect(error.mensaje).toContain('sprint cerrado');
    // Y el campo `usuario` sigue apuntándola: el rechazo no dejó nada a medias.
    expect(doc.usuario).toBe('ana-garcia');
  });

  it('desactivar a quien NO es el usuario no toca el campo ni anota era_usuario', () => {
    const doc = anaEsElUsuario();
    const { documento, evento } = exigirOk(
      reducirSinMutar(doc, { comando: 'desactivarPersona', id: 'beto-ruiz' }),
    );
    expect(documento.usuario).toBe('ana-garcia');
    expect(evento.detalle).not.toHaveProperty('era_usuario');
  });

  it('reactivar NO devuelve el usuario: hay que volver a fijarlo a propósito', () => {
    const doc = anaEsElUsuario();
    const vuelta = aplicarTodos(doc, [
      { comando: 'desactivarPersona', id: 'ana-garcia' },
      { comando: 'reactivarPersona', id: 'ana-garcia' },
    ]);
    expect(vuelta.usuario).toBeNull();
    // Y ahora sí se puede volver a fijar, porque está activa otra vez.
    expect(aplicar(vuelta, { comando: 'fijarUsuario', id: 'ana-garcia' }).usuario).toBe('ana-garcia');
  });

  it('el esquema NO defiende la invariante «el usuario está activo»: la sostiene el reductor', () => {
    // Se documenta porque cambia dónde hay que mirar si algún día falla: un documento con
    // el usuario desactivado pasa el validador sin una queja. La única barrera es que
    // `fijarUsuario` lo rechace y que `desactivarPersona` lo suelte, y las dos mitades
    // están probadas arriba.
    const doc = anaEsElUsuario();
    const aMano = copiaProfunda(doc);
    aMano.personas[0]!.activa = false;
    expect(validarDocumento(aMano).ok).toBe(true);

    // Lo que el esquema sí rechaza es un usuario que no existe en personas.
    const fantasma = copiaProfunda(doc);
    fantasma.usuario = 'nadie';
    const resultado = validarDocumento(fantasma);
    expect(resultado.ok).toBe(false);
    if (resultado.ok) return;
    expect(resultado.problemas.map((p) => p.ruta)).toContain('usuario');
  });
});
