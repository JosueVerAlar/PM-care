/**
 * Los tres comandos que reordenan el árbol: `reordenarEpica`, `reordenarHistoria` y
 * `reordenarTarea` (regla 10).
 *
 * Lo que se congela aquí no es «el splice funciona», sino las cuatro promesas del
 * contrato, que son las que se rompen sin hacer ruido:
 *
 * 1. **`aIndice` es la posición final contada ya SIN el elemento que se mueve.** Llevar
 *    la primera de cinco al final es `4`. Es la cuenta que sale de una interfaz de
 *    arrastre que pinta huecos ENTRE filas, y la que distingue este comando de uno que
 *    inserta «antes del que hoy ocupa ese índice».
 * 2. **Se topa por arriba, se rechaza por abajo.** Un arrastre puede pedir `5` en una
 *    lista de cinco por un píxel; nunca produce `-1`, `1.5` ni `NaN`.
 * 3. **El padre se exige aunque sea redundante con el id.** Es la afirmación «creo que
 *    esto cuelga de aquí»: si no coincide, se rechaza en vez de reordenar en otro sitio.
 * 4. **Reordenar no cambia ningún hecho.** Ni ids, ni estados, ni marcas de tiempo, ni
 *    items de sprint, ni el orden de los hermanos que no se movieron. Por eso se compara
 *    el DOCUMENTO ENTERO contra el de entrada con un solo `splice` aplicado a mano, y no
 *    campo por campo: un campo por campo solo defiende lo que alguien se acordó de mirar.
 *
 * Y por eso mismo reordenar se permite en proyectos cerrados y archivados, y no cuenta
 * como movimiento del proyecto en el Panorama.
 */

import { describe, expect, it } from 'vitest';

import { diasSinMovimiento } from '../../src/compartido/dominio/panorama';
import type { Documento } from '../../src/compartido/modelo/tipos';
import { reducir } from '../../src/principal/comandos/reductor';
import { requiereFlushInmediato, validarComando } from '../../src/principal/comandos/tipos';
import type { Comando } from '../../src/principal/comandos/tipos';
import { unDocumento, unItem, unSprint } from '../apoyo/constructores';
import {
  AHORA,
  aplicar,
  aplicarTodos,
  copiaProfunda,
  exigirError,
  exigirOk,
  reducirSinMutar,
} from '../apoyo/comandos';

// --- montaje ----------------------------------------------------------------

const CLAVE = 'PM';

/**
 * Un proyecto con la forma pedida, construido **por comandos**: los ids son los que la
 * app emitiría de verdad y los contadores quedan donde el reductor los deja.
 *
 * `forma[i][j]` = cuántas tareas tiene la historia `j` de la épica `i`. Los contadores
 * son del PROYECTO, no del padre, así que las historias de la segunda épica siguen
 * numerando donde quedaron las de la primera: `[[0], [0]]` da `PM-H1` y `PM-H2`.
 */
function arbol(forma: readonly (readonly number[])[], clave = CLAVE): Documento {
  const comandos: Comando[] = [{ comando: 'crearProyecto', clave, nombre: `Proyecto ${clave}` }];
  let epicas = 0;
  let historias = 0;
  let tareas = 0;
  for (const porHistoria of forma) {
    epicas += 1;
    comandos.push({ comando: 'crearEpica', proyecto: clave, titulo: `Épica ${epicas}` });
    for (const cuantas of porHistoria) {
      historias += 1;
      comandos.push({
        comando: 'crearHistoria',
        epicaId: `${clave}-E${epicas}`,
        titulo: `Historia ${historias}`,
      });
      for (let t = 0; t < cuantas; t += 1) {
        tareas += 1;
        comandos.push({
          comando: 'crearTarea',
          contenedorId: `${clave}-H${historias}`,
          titulo: `Tarea ${tareas}`,
        });
      }
    }
  }
  return aplicarTodos(unDocumento(), comandos);
}

/** `n` épicas sin historias: el caso mínimo para hablar solo de orden. */
const epicasSueltas = (n: number): Documento => arbol(Array.from({ length: n }, () => []));

const idsEpicas = (doc: Documento): string[] => doc.proyectos[0]?.epicas.map((e) => e.id) ?? [];
const idsHistorias = (doc: Documento, epica = 0): string[] =>
  doc.proyectos[0]?.epicas[epica]?.historias.map((h) => h.id) ?? [];
const idsTareas = (doc: Documento, epica = 0, historia = 0): string[] =>
  doc.proyectos[0]?.epicas[epica]?.historias[historia]?.tareas.map((t) => t.id) ?? [];

/**
 * El documento que DEBERÍA salir: el de entrada con **un solo elemento reubicado** en la
 * lista del padre y absolutamente nada más tocado.
 *
 * Es lo que convierte «reordenar no toca nada más» en una aserción de una línea sobre el
 * documento completo —contadores, marcas de tiempo, sprints, campos desconocidos— en vez
 * de una lista de campos que alguien tuvo que acordarse de mirar.
 */
function soloReubicando(
  antes: Documento,
  lista: (doc: Documento) => { id: string }[],
  desde: number,
  hasta: number,
): Documento {
  const esperado = copiaProfunda(antes);
  const arreglo = lista(esperado);
  const movido = arreglo[desde];
  if (movido === undefined) throw new Error(`la prueba pide mover el índice ${desde}, que no existe`);
  arreglo.splice(desde, 1);
  arreglo.splice(hasta, 0, movido);
  return esperado;
}

// --- 1. qué significa `aIndice` ---------------------------------------------

describe('aIndice es la posición final contada YA SIN el elemento que se mueve', () => {
  it('llevar la primera de cinco épicas al final es 4, no 5', () => {
    const doc = epicasSueltas(5);
    const { documento } = exigirOk(
      reducirSinMutar(doc, { comando: 'reordenarEpica', proyecto: CLAVE, epicaId: 'PM-E1', aIndice: 4 }),
    );
    expect(idsEpicas(documento)).toEqual(['PM-E2', 'PM-E3', 'PM-E4', 'PM-E5', 'PM-E1']);
  });

  it('bajar UNA posición no es una operación vacía: de 0 a 1 intercambia con la vecina', () => {
    // El caso que separa este contrato del otro candidato razonable —«insertar antes de
    // quien hoy ocupa ese índice»—, con el que bajar del 0 al 1 no movería nada.
    const doc = epicasSueltas(5);
    const { documento } = exigirOk(
      reducirSinMutar(doc, { comando: 'reordenarEpica', proyecto: CLAVE, epicaId: 'PM-E1', aIndice: 1 }),
    );
    expect(idsEpicas(documento)).toEqual(['PM-E2', 'PM-E1', 'PM-E3', 'PM-E4', 'PM-E5']);
  });

  it('mover hacia abajo desde el medio: la segunda de cinco al índice 3', () => {
    const doc = epicasSueltas(5);
    const { documento } = exigirOk(
      reducirSinMutar(doc, { comando: 'reordenarEpica', proyecto: CLAVE, epicaId: 'PM-E2', aIndice: 3 }),
    );
    expect(idsEpicas(documento)).toEqual(['PM-E1', 'PM-E3', 'PM-E4', 'PM-E2', 'PM-E5']);
  });

  it('mover hacia arriba desde el medio: la cuarta de cinco al índice 1', () => {
    const doc = epicasSueltas(5);
    const { documento } = exigirOk(
      reducirSinMutar(doc, { comando: 'reordenarEpica', proyecto: CLAVE, epicaId: 'PM-E4', aIndice: 1 }),
    );
    expect(idsEpicas(documento)).toEqual(['PM-E1', 'PM-E4', 'PM-E2', 'PM-E3', 'PM-E5']);
  });

  it('la última al principio con aIndice 0', () => {
    const doc = epicasSueltas(5);
    const { documento } = exigirOk(
      reducirSinMutar(doc, { comando: 'reordenarEpica', proyecto: CLAVE, epicaId: 'PM-E5', aIndice: 0 }),
    );
    expect(idsEpicas(documento)).toEqual(['PM-E5', 'PM-E1', 'PM-E2', 'PM-E3', 'PM-E4']);
  });

  it('el tope EXACTO (largo - 1) es un índice legítimo, no un caso topado', () => {
    // `aIndice: 4` en cinco elementos tiene que pasar por la puerta principal. Si algún
    // día el tope se equivocara en uno, aquí se vería como un rechazo «ya está en la
    // posición 5» en vez de como un reordenamiento.
    const doc = epicasSueltas(5);
    const resultado = reducirSinMutar(doc, {
      comando: 'reordenarEpica',
      proyecto: CLAVE,
      epicaId: 'PM-E3',
      aIndice: 4,
    });
    const { documento, evento } = exigirOk(resultado);
    expect(idsEpicas(documento)).toEqual(['PM-E1', 'PM-E2', 'PM-E4', 'PM-E5', 'PM-E3']);
    expect(evento.detalle?.hasta).toBe(4);
  });

  it('las historias cuentan la misma cuenta dentro de su épica', () => {
    const doc = arbol([[0, 0, 0, 0]]);
    const { documento } = exigirOk(
      reducirSinMutar(doc, {
        comando: 'reordenarHistoria',
        epicaId: 'PM-E1',
        historiaId: 'PM-H1',
        aIndice: 3,
      }),
    );
    expect(idsHistorias(documento)).toEqual(['PM-H2', 'PM-H3', 'PM-H4', 'PM-H1']);
  });

  it('las tareas cuentan la misma cuenta dentro de su historia', () => {
    const doc = arbol([[4]]);
    const { documento } = exigirOk(
      reducirSinMutar(doc, {
        comando: 'reordenarTarea',
        contenedorId: 'PM-H1',
        tareaId: 'PM-T1',
        aIndice: 3,
      }),
    );
    expect(idsTareas(documento)).toEqual(['PM-T2', 'PM-T3', 'PM-T4', 'PM-T1']);
  });
});

// --- 2. fuera de rango: se topa arriba, se rechaza abajo ---------------------

describe('índice fuera de rango: el reductor topa por arriba', () => {
  it('aIndice 5 en una lista de cinco hace exactamente lo mismo que aIndice 4', () => {
    const doc = epicasSueltas(5);
    const topado = exigirOk(
      reducirSinMutar(doc, { comando: 'reordenarEpica', proyecto: CLAVE, epicaId: 'PM-E1', aIndice: 5 }),
    ).documento;
    const exacto = exigirOk(
      reducirSinMutar(doc, { comando: 'reordenarEpica', proyecto: CLAVE, epicaId: 'PM-E1', aIndice: 4 }),
    ).documento;
    expect(topado).toEqual(exacto);
    expect(idsEpicas(topado)).toEqual(['PM-E2', 'PM-E3', 'PM-E4', 'PM-E5', 'PM-E1']);
  });

  it('un índice absurdo (999) también se topa al último hueco: no se distingue de un off-by-one', () => {
    const doc = epicasSueltas(3);
    const { documento, evento } = exigirOk(
      reducirSinMutar(doc, { comando: 'reordenarEpica', proyecto: CLAVE, epicaId: 'PM-E1', aIndice: 999 }),
    );
    expect(idsEpicas(documento)).toEqual(['PM-E2', 'PM-E3', 'PM-E1']);
    expect(evento.detalle?.hasta).toBe(2);
  });

  it('el tope vale en los tres niveles', () => {
    const doc = arbol([[3, 0, 0]]);
    const conHistoria = exigirOk(
      reducirSinMutar(doc, {
        comando: 'reordenarHistoria',
        epicaId: 'PM-E1',
        historiaId: 'PM-H1',
        aIndice: 40,
      }),
    ).documento;
    expect(idsHistorias(conHistoria)).toEqual(['PM-H2', 'PM-H3', 'PM-H1']);

    const conTarea = exigirOk(
      reducirSinMutar(doc, {
        comando: 'reordenarTarea',
        contenedorId: 'PM-H1',
        tareaId: 'PM-T1',
        aIndice: 40,
      }),
    ).documento;
    expect(idsTareas(conTarea)).toEqual(['PM-T2', 'PM-T3', 'PM-T1']);
  });
});

describe('el esquema del payload rechaza lo que ningún arrastre bien formado produce', () => {
  const noProducibles: readonly (readonly [string, number])[] = [
    ['negativo', -1],
    ['el centinela de un findIndex que no encontró nada', -1],
    ['fraccionario', 1.5],
    ['NaN', Number.NaN],
    ['infinito', Number.POSITIVE_INFINITY],
  ];

  for (const [nombre, aIndice] of noProducibles) {
    it(`reordenarEpica con aIndice ${nombre} se rechaza en el esquema, antes del reductor`, () => {
      const resultado = validarComando({
        comando: 'reordenarEpica',
        proyecto: CLAVE,
        epicaId: 'PM-E1',
        aIndice,
      });
      expect(resultado.ok).toBe(false);
      if (resultado.ok) return;
      expect(resultado.problemas.map((p) => p.ruta)).toContain('aIndice');
    });
  }

  it('los tres comandos comparten el mismo validador de índice: -1 se rechaza en los tres', () => {
    const rechazos = [
      validarComando({ comando: 'reordenarEpica', proyecto: CLAVE, epicaId: 'PM-E1', aIndice: -1 }),
      validarComando({ comando: 'reordenarHistoria', epicaId: 'PM-E1', historiaId: 'PM-H1', aIndice: -1 }),
      validarComando({ comando: 'reordenarTarea', contenedorId: 'PM-H1', tareaId: 'PM-T1', aIndice: -1 }),
    ];
    expect(rechazos.map((r) => r.ok)).toEqual([false, false, false]);
  });

  it('un payload bien formado sí pasa el validador: el rechazo anterior no es del resto del objeto', () => {
    const resultado = validarComando({
      comando: 'reordenarEpica',
      proyecto: CLAVE,
      epicaId: 'PM-E1',
      aIndice: 0,
    });
    expect(resultado.ok).toBe(true);
  });

  it('el esquema es strict: un campo de más (un "deIndice" que nadie lee) se rechaza', () => {
    const resultado = validarComando({
      comando: 'reordenarEpica',
      proyecto: CLAVE,
      epicaId: 'PM-E1',
      aIndice: 0,
      deIndice: 3,
    });
    expect(resultado.ok).toBe(false);
  });

  it('el padre es obligatorio en el payload: sin él no hay afirmación que comprobar', () => {
    expect(validarComando({ comando: 'reordenarEpica', epicaId: 'PM-E1', aIndice: 0 }).ok).toBe(false);
    expect(validarComando({ comando: 'reordenarHistoria', historiaId: 'PM-H1', aIndice: 0 }).ok).toBe(false);
    expect(validarComando({ comando: 'reordenarTarea', tareaId: 'PM-T1', aIndice: 0 }).ok).toBe(false);
  });
});

// --- 3. soltar donde estaba --------------------------------------------------

describe('soltar donde ya estaba se rechaza: es el desenlace más común de un arrastre', () => {
  it('una épica a su propio índice da invalido y dice la posición en base 1', () => {
    const doc = epicasSueltas(3);
    const error = exigirError(
      reducirSinMutar(doc, { comando: 'reordenarEpica', proyecto: CLAVE, epicaId: 'PM-E2', aIndice: 1 }),
    );
    expect(error.codigo).toBe('invalido');
    expect(error.mensaje).toBe('PM-E2 ya está en la posición 2');
  });

  it('la última con un índice topado también cae en «ya está en la posición N»', () => {
    // 999 se topa a 2, que es donde ya está. El rechazo llega DESPUÉS del tope, no antes.
    const doc = epicasSueltas(3);
    const error = exigirError(
      reducirSinMutar(doc, { comando: 'reordenarEpica', proyecto: CLAVE, epicaId: 'PM-E3', aIndice: 999 }),
    );
    expect(error.mensaje).toBe('PM-E3 ya está en la posición 3');
  });

  it('una historia y una tarea en su sitio se rechazan igual', () => {
    const doc = arbol([[2, 0]]);
    expect(
      exigirError(
        reducirSinMutar(doc, {
          comando: 'reordenarHistoria',
          epicaId: 'PM-E1',
          historiaId: 'PM-H2',
          aIndice: 1,
        }),
      ).mensaje,
    ).toBe('PM-H2 ya está en la posición 2');
    expect(
      exigirError(
        reducirSinMutar(doc, {
          comando: 'reordenarTarea',
          contenedorId: 'PM-H1',
          tareaId: 'PM-T1',
          aIndice: 0,
        }),
      ).mensaje,
    ).toBe('PM-T1 ya está en la posición 1');
  });

  it('lista de un solo elemento: CUALQUIER índice cae en «ya está en la posición 1»', () => {
    const doc = arbol([[1]]);
    for (const aIndice of [0, 1, 7, 999]) {
      const error = exigirError(
        reducirSinMutar(doc, {
          comando: 'reordenarTarea',
          contenedorId: 'PM-H1',
          tareaId: 'PM-T1',
          aIndice,
        }),
      );
      expect(error.codigo, `aIndice ${aIndice}`).toBe('invalido');
      expect(error.mensaje, `aIndice ${aIndice}`).toBe('PM-T1 ya está en la posición 1');
    }
  });

  it('la única épica de un proyecto tampoco se puede «reordenar» a ningún lado', () => {
    const doc = arbol([[]]);
    for (const aIndice of [0, 1, 999]) {
      expect(
        exigirError(
          reducirSinMutar(doc, {
            comando: 'reordenarEpica',
            proyecto: CLAVE,
            epicaId: 'PM-E1',
            aIndice,
          }),
        ).mensaje,
      ).toBe('PM-E1 ya está en la posición 1');
    }
  });

  it('un rechazo no deja NADA aplicado ni un evento que apilar', () => {
    const doc = arbol([[2, 1]]);
    const resultado = reducirSinMutar(doc, {
      comando: 'reordenarHistoria',
      epicaId: 'PM-E1',
      historiaId: 'PM-H1',
      aIndice: 0,
    });
    expect(resultado.ok).toBe(false);
    // `reducirSinMutar` ya comprobó que el documento de entrada quedó intacto; aquí se
    // dice lo otro: el resultado no trae documento ni evento que el repositorio pudiera
    // apilar por descuido.
    expect('documento' in resultado).toBe(false);
    expect('evento' in resultado).toBe(false);
  });
});

// --- 4. el padre se exige, aunque sea redundante ----------------------------

describe('el padre es una afirmación, no un dato de conveniencia', () => {
  it('una épica de OTRO proyecto se rechaza en vez de reordenarse allá', () => {
    const uno = arbol([[], []], 'PM');
    const otro = arbol([[], []], 'OTRO');
    const doc: Documento = { ...uno, proyectos: [...uno.proyectos, ...otro.proyectos] };

    const error = exigirError(
      reducirSinMutar(doc, { comando: 'reordenarEpica', proyecto: 'PM', epicaId: 'OTRO-E2', aIndice: 0 }),
    );
    expect(error.codigo).toBe('invalido');
    expect(error.mensaje).toContain('no cuelga de "PM" sino de "OTRO"');
    expect(error.mensaje).toContain('no mueve nada entre padres');
  });

  it('y el proyecto ajeno queda con su orden intacto: no se reordenó «en el otro sitio»', () => {
    const uno = arbol([[], []], 'PM');
    const otro = arbol([[], []], 'OTRO');
    const doc: Documento = { ...uno, proyectos: [...uno.proyectos, ...otro.proyectos] };
    const antes = copiaProfunda(doc);

    const resultado = reducir(
      doc,
      { comando: 'reordenarEpica', proyecto: 'PM', epicaId: 'OTRO-E2', aIndice: 0 },
      AHORA,
    );
    expect(resultado.ok).toBe(false);
    expect(doc).toEqual(antes);
    expect(doc.proyectos[1]?.epicas.map((e) => e.id)).toEqual(['OTRO-E1', 'OTRO-E2']);
  });

  it('una historia de otra épica se rechaza: reordenar no mueve nada entre padres', () => {
    const doc = arbol([[0, 0], [0, 0]]);
    const error = exigirError(
      reducirSinMutar(doc, {
        comando: 'reordenarHistoria',
        epicaId: 'PM-E1',
        historiaId: 'PM-H3',
        aIndice: 0,
      }),
    );
    expect(error.codigo).toBe('invalido');
    expect(error.mensaje).toContain('no cuelga de "PM-E1" sino de "PM-E2"');
  });

  it('una tarea de otra historia se rechaza', () => {
    const doc = arbol([[2, 2]]);
    const error = exigirError(
      reducirSinMutar(doc, {
        comando: 'reordenarTarea',
        contenedorId: 'PM-H1',
        tareaId: 'PM-T3',
        aIndice: 0,
      }),
    );
    expect(error.codigo).toBe('invalido');
    expect(error.mensaje).toContain('no cuelga de "PM-H1" sino de "PM-H2"');
  });

  it('padre inexistente da no-encontrado, que es otro diagnóstico que «cuelga de otro»', () => {
    const doc = arbol([[1]]);
    expect(
      exigirError(
        reducirSinMutar(doc, { comando: 'reordenarEpica', proyecto: 'FANTASMA', epicaId: 'PM-E1', aIndice: 0 }),
      ).codigo,
    ).toBe('no-encontrado');
    expect(
      exigirError(
        reducirSinMutar(doc, { comando: 'reordenarHistoria', epicaId: 'PM-E9', historiaId: 'PM-H1', aIndice: 0 }),
      ).codigo,
    ).toBe('no-encontrado');
    expect(
      exigirError(
        reducirSinMutar(doc, { comando: 'reordenarTarea', contenedorId: 'PM-H9', tareaId: 'PM-T1', aIndice: 0 }),
      ).codigo,
    ).toBe('no-encontrado');
  });

  it('hijo inexistente bajo un padre que sí existe da no-encontrado, no «cuelga de otro»', () => {
    const doc = arbol([[1]]);
    const error = exigirError(
      reducirSinMutar(doc, { comando: 'reordenarEpica', proyecto: CLAVE, epicaId: 'PM-E9', aIndice: 0 }),
    );
    expect(error.codigo).toBe('no-encontrado');
    expect(error.mensaje).toContain('PM-E9');
    expect(error.mensaje).not.toContain('cuelga');
  });
});

// --- 5. la rama entera viaja con la épica -----------------------------------

describe('mover una épica se lleva TODA su rama, con los mismos ids (regla 10)', () => {
  it('la épica movida conserva sus historias y sus tareas, en su orden y con su identidad', () => {
    const doc = arbol([
      [2, 1],
      [1],
      [3],
    ]);
    const rama = copiaProfunda(doc.proyectos[0]?.epicas[0]);

    const { documento } = exigirOk(
      reducirSinMutar(doc, { comando: 'reordenarEpica', proyecto: CLAVE, epicaId: 'PM-E1', aIndice: 2 }),
    );

    expect(idsEpicas(documento)).toEqual(['PM-E2', 'PM-E3', 'PM-E1']);
    // No «tiene las mismas historias»: es el MISMO subárbol, campo por campo.
    expect(documento.proyectos[0]?.epicas[2]).toEqual(rama);
    expect(idsHistorias(documento, 2)).toEqual(['PM-H1', 'PM-H2']);
    expect(idsTareas(documento, 2, 0)).toEqual(['PM-T1', 'PM-T2']);
    expect(idsTareas(documento, 2, 1)).toEqual(['PM-T3']);
  });

  it('las ramas de las épicas que NO se movieron quedan igual que estaban', () => {
    const doc = arbol([
      [2],
      [1, 1],
      [1],
    ]);
    const quietas = [1, 2].map((i) => copiaProfunda(doc.proyectos[0]?.epicas[i]));

    const { documento } = exigirOk(
      reducirSinMutar(doc, { comando: 'reordenarEpica', proyecto: CLAVE, epicaId: 'PM-E1', aIndice: 2 }),
    );
    expect(documento.proyectos[0]?.epicas[0]).toEqual(quietas[0]);
    expect(documento.proyectos[0]?.epicas[1]).toEqual(quietas[1]);
  });

  it('mover una historia se lleva sus tareas', () => {
    const doc = arbol([[2, 1, 1]]);
    const historia = copiaProfunda(doc.proyectos[0]?.epicas[0]?.historias[0]);

    const { documento } = exigirOk(
      reducirSinMutar(doc, {
        comando: 'reordenarHistoria',
        epicaId: 'PM-E1',
        historiaId: 'PM-H1',
        aIndice: 2,
      }),
    );
    expect(idsHistorias(documento)).toEqual(['PM-H2', 'PM-H3', 'PM-H1']);
    expect(documento.proyectos[0]?.epicas[0]?.historias[2]).toEqual(historia);
  });

  it('los ids no son la posición: mover no renombra a nadie, ni al movido ni a los demás', () => {
    // Regla 15. Si algún día alguien derivara el id del índice, aquí saldría `PM-E1` en
    // la primera fila con otro título.
    const doc = arbol([[1], [1], [1]]);
    const { documento } = exigirOk(
      reducirSinMutar(doc, { comando: 'reordenarEpica', proyecto: CLAVE, epicaId: 'PM-E3', aIndice: 0 }),
    );
    const epicas = documento.proyectos[0]?.epicas ?? [];
    expect(epicas.map((e) => [e.id, e.titulo])).toEqual([
      ['PM-E3', 'Épica 3'],
      ['PM-E1', 'Épica 1'],
      ['PM-E2', 'Épica 2'],
    ]);
  });

  it('los contadores del proyecto no se mueven: reordenar no emite ni consume ids', () => {
    const doc = arbol([[2], [1]]);
    const antes = copiaProfunda(doc.proyectos[0]?.contadores);
    const { documento } = exigirOk(
      reducirSinMutar(doc, { comando: 'reordenarEpica', proyecto: CLAVE, epicaId: 'PM-E2', aIndice: 0 }),
    );
    expect(documento.proyectos[0]?.contadores).toEqual(antes);
  });
});

// --- 6. reordenar no toca NADA más ------------------------------------------

describe('reordenar no cambia ningún hecho: el documento entero, no un campo', () => {
  /**
   * Los reordenamientos de este bloque se piden en un instante DISTINTO del que construyó
   * el árbol. No es un detalle: los constructores por comandos sellan `creada_en` con
   * `AHORA`, así que un reductor que reescribiera esa marca con el instante recibido la
   * dejaría en el mismo valor y la comparación del documento entero saldría verde por
   * coincidencia. Con un mes de diferencia, cualquier marca reescrita salta.
   */
  const UN_MES_DESPUES = '2026-09-26T18:00:00-06:00';

  it('reordenarEpica deja el documento idéntico salvo el splice de proyecto.epicas', () => {
    // La épica que se mueve lleva rama —dos historias y tres tareas— a propósito: con una
    // épica vacía, un comando que escribiera algo DENTRO de la rama al moverla no tendría
    // dónde escribirlo y esta comparación saldría verde sin haber mirado nada.
    const doc = arbol([[2, 1], [1], [0]]);
    const { documento } = exigirOk(
      reducirSinMutar(
        doc,
        { comando: 'reordenarEpica', proyecto: CLAVE, epicaId: 'PM-E1', aIndice: 2 },
        UN_MES_DESPUES,
      ),
    );
    expect(documento).toEqual(soloReubicando(doc, (d) => d.proyectos[0]!.epicas, 0, 2));
  });

  it('reordenarHistoria deja el documento idéntico salvo el splice de epica.historias', () => {
    const doc = arbol([[2, 1, 3], [1]]);
    const { documento } = exigirOk(
      reducirSinMutar(
        doc,
        { comando: 'reordenarHistoria', epicaId: 'PM-E1', historiaId: 'PM-H3', aIndice: 0 },
        UN_MES_DESPUES,
      ),
    );
    expect(documento).toEqual(
      soloReubicando(doc, (d) => d.proyectos[0]!.epicas[0]!.historias, 2, 0),
    );
  });

  it('reordenarTarea deja el documento idéntico salvo el splice de historia.tareas', () => {
    const doc = arbol([[4, 2]]);
    const { documento } = exigirOk(
      reducirSinMutar(
        doc,
        { comando: 'reordenarTarea', contenedorId: 'PM-H1', tareaId: 'PM-T4', aIndice: 1 },
        UN_MES_DESPUES,
      ),
    );
    expect(documento).toEqual(
      soloReubicando(doc, (d) => d.proyectos[0]!.epicas[0]!.historias[0]!.tareas, 3, 1),
    );
  });

  it('con estados, responsables, bloqueos y fechas puestos, tampoco se mueve nada de eso', () => {
    // El caso anterior compara un árbol recién capturado, donde casi todo es `null` y un
    // campo que se perdiera podría pasar desapercibido por coincidencia. Aquí el árbol
    // lleva datos distintos en cada tarea.
    const base = arbol([[3, 1]]);
    const doc = aplicarTodos(base, [
      { comando: 'crearPersona', nombre: 'Ana García' },
      { comando: 'cambiarEstado', id: 'PM-T1', estado: 'hecha' },
      { comando: 'cambiarEstado', id: 'PM-T2', estado: 'en_curso' },
      { comando: 'cambiarEstado', id: 'PM-T3', estado: 'cancelada' },
      { comando: 'editarTarea', id: 'PM-T2', responsable: 'ana-garcia', fechaLimite: '2026-09-15' },
      { comando: 'bloquear', tareaId: 'PM-T2', tipo: 'dependencia', motivo: 'Falta el acceso' },
    ]);

    const { documento } = exigirOk(
      reducirSinMutar(
        doc,
        { comando: 'reordenarTarea', contenedorId: 'PM-H1', tareaId: 'PM-T3', aIndice: 0 },
        UN_MES_DESPUES,
      ),
    );
    expect(documento).toEqual(
      soloReubicando(doc, (d) => d.proyectos[0]!.epicas[0]!.historias[0]!.tareas, 2, 0),
    );
  });

  it('regla 14: los campos desconocidos que el usuario escribió a mano viajan con el nodo', () => {
    const base = arbol([[2, 0]]);
    const doc = copiaProfunda(base);
    // El usuario abrió el JSON y le puso una nota a la segunda tarea.
    Object.assign(doc.proyectos[0]!.epicas[0]!.historias[0]!.tareas[1]!, {
      nota_del_usuario: 'ojo con esto',
    });

    const { documento } = exigirOk(
      reducirSinMutar(
        doc,
        { comando: 'reordenarTarea', contenedorId: 'PM-H1', tareaId: 'PM-T2', aIndice: 0 },
        UN_MES_DESPUES,
      ),
    );
    const primera = documento.proyectos[0]?.epicas[0]?.historias[0]?.tareas[0] as
      | Record<string, unknown>
      | undefined;
    expect(primera?.id).toBe('PM-T2');
    expect(primera?.nota_del_usuario).toBe('ojo con esto');
  });
});

describe('reordenar y los sprints: son dos órdenes independientes', () => {
  /** Tres tareas de la misma historia comprometidas en un sprint activo, en otro orden. */
  function conSprintActivo(): Documento {
    const doc = arbol([[3]]);
    return {
      ...doc,
      sprints: [
        unSprint({
          id: 'S-34',
          estado: 'activo',
          items: [unItem('PM-T3'), unItem('PM-T1'), unItem('PM-T2')],
        }),
      ],
    };
  }

  it('reordenar en el árbol NO reordena sprint.items', () => {
    const doc = conSprintActivo();
    const { documento } = exigirOk(
      reducirSinMutar(doc, {
        comando: 'reordenarTarea',
        contenedorId: 'PM-H1',
        tareaId: 'PM-T1',
        aIndice: 2,
      }),
    );
    expect(idsTareas(documento)).toEqual(['PM-T2', 'PM-T3', 'PM-T1']);
    // El orden del sprint ES la prioridad del compromiso y no lo toca nadie más que
    // `moverAlSprint`. Si el árbol arrastrara al sprint, priorizar el backlog
    // reescribiría en silencio lo comprometido.
    expect(documento.sprints[0]?.items.map((i) => i.tarea_id)).toEqual(['PM-T3', 'PM-T1', 'PM-T2']);
    expect(documento.sprints).toEqual(doc.sprints);
  });

  it('mover la épica entera tampoco toca el sprint activo', () => {
    const doc = { ...conSprintActivo() };
    const conDos = aplicar(doc, { comando: 'crearEpica', proyecto: CLAVE, titulo: 'Otra' });
    const { documento } = exigirOk(
      reducirSinMutar(conDos, {
        comando: 'reordenarEpica',
        proyecto: CLAVE,
        epicaId: 'PM-E1',
        aIndice: 1,
      }),
    );
    expect(documento.sprints).toEqual(conDos.sprints);
  });

  it('un sprint CERRADO tampoco se toca: no hay guarda que saltarse porque no se le mira (regla 8)', () => {
    const doc = arbol([[3]]);
    const conCerrado: Documento = {
      ...doc,
      sprints: [
        unSprint({
          id: 'S-33',
          estado: 'cerrado',
          inicio: '2026-08-10',
          fin: '2026-08-21',
          items: [unItem('PM-T2', { desenlace: 'completada' }), unItem('PM-T1', { desenlace: 'arrastrada' })],
        }),
      ],
    };
    const { documento } = exigirOk(
      reducirSinMutar(conCerrado, {
        comando: 'reordenarTarea',
        contenedorId: 'PM-H1',
        tareaId: 'PM-T3',
        aIndice: 0,
      }),
    );
    expect(documento.sprints).toEqual(conCerrado.sprints);
    expect(idsTareas(documento)).toEqual(['PM-T3', 'PM-T1', 'PM-T2']);
  });
});

// --- 7. reordenar no cuenta como movimiento ---------------------------------

describe('reordenar no escribe marcas de tiempo, así que el proyecto sigue igual de quieto', () => {
  /** Un árbol capturado hace tiempo: `creada_en` es lo que mide el Panorama. */
  const HACE_TIEMPO = '2026-08-01T09:00:00-06:00';
  const HOY_LEJANO = '2026-08-26';

  function arbolViejo(): Documento {
    const comandos: Comando[] = [
      { comando: 'crearProyecto', clave: CLAVE, nombre: 'Proyecto PM' },
      { comando: 'crearEpica', proyecto: CLAVE, titulo: 'Épica 1' },
      { comando: 'crearEpica', proyecto: CLAVE, titulo: 'Épica 2' },
      { comando: 'crearHistoria', epicaId: 'PM-E1', titulo: 'Historia 1' },
      { comando: 'crearHistoria', epicaId: 'PM-E1', titulo: 'Historia 2' },
      { comando: 'crearTarea', contenedorId: 'PM-H1', titulo: 'Tarea 1' },
      { comando: 'crearTarea', contenedorId: 'PM-H1', titulo: 'Tarea 2' },
      { comando: 'crearTarea', contenedorId: 'PM-H2', titulo: 'Tarea 3' },
    ];
    return aplicarTodos(unDocumento(), comandos, HACE_TIEMPO);
  }

  it('diasSinMovimiento no cambia tras DIEZ reordenamientos de los tres tipos', () => {
    const doc = arbolViejo();
    const proyectoAntes = doc.proyectos[0]!;
    const quietoAntes = diasSinMovimiento(proyectoAntes, HOY_LEJANO);
    // La medición tiene que estar midiendo algo: 25 días desde el 1 de agosto.
    expect(quietoAntes).toBe(25);

    const barajado = aplicarTodos(
      doc,
      [
        { comando: 'reordenarEpica', proyecto: CLAVE, epicaId: 'PM-E1', aIndice: 1 },
        { comando: 'reordenarEpica', proyecto: CLAVE, epicaId: 'PM-E1', aIndice: 0 },
        { comando: 'reordenarEpica', proyecto: CLAVE, epicaId: 'PM-E2', aIndice: 0 },
        { comando: 'reordenarHistoria', epicaId: 'PM-E1', historiaId: 'PM-H1', aIndice: 1 },
        { comando: 'reordenarHistoria', epicaId: 'PM-E1', historiaId: 'PM-H1', aIndice: 0 },
        { comando: 'reordenarHistoria', epicaId: 'PM-E1', historiaId: 'PM-H2', aIndice: 0 },
        { comando: 'reordenarTarea', contenedorId: 'PM-H1', tareaId: 'PM-T1', aIndice: 1 },
        { comando: 'reordenarTarea', contenedorId: 'PM-H1', tareaId: 'PM-T1', aIndice: 0 },
        { comando: 'reordenarTarea', contenedorId: 'PM-H1', tareaId: 'PM-T2', aIndice: 0 },
        // La épica que cierra la ráfaga es PM-E1 y no la vacía PM-E2: si al mover una
        // rama se escribiera una marca de tiempo dentro, en una épica sin tareas no
        // tendría dónde aparecer y la medición saldría verde sin haber mirado nada.
        { comando: 'reordenarEpica', proyecto: CLAVE, epicaId: 'PM-E1', aIndice: 0 },
      ],
      // Un mes DESPUÉS. Si algún comando escribiera una marca de tiempo, el proyecto
      // pasaría a estar quieto 0 días y esta prueba se pondría roja.
      '2026-09-26T18:00:00-06:00',
    );

    expect(diasSinMovimiento(barajado.proyectos[0]!, HOY_LEJANO)).toBe(quietoAntes);
  });

  it('ninguna creada_en, hecha_en ni bloqueo cambia de valor al reordenar', () => {
    const doc = arbolViejo();
    const marcasAntes = marcas(doc);
    const barajado = aplicarTodos(
      doc,
      [
        { comando: 'reordenarTarea', contenedorId: 'PM-H1', tareaId: 'PM-T2', aIndice: 0 },
        // Se mueve PM-E1, que lleva dos historias y tres tareas. Mover la épica vacía no
        // demostraría que las marcas de las tareas no se tocan: no habría ninguna dentro.
        { comando: 'reordenarEpica', proyecto: CLAVE, epicaId: 'PM-E1', aIndice: 1 },
      ],
      '2026-12-31T23:59:00-06:00',
    );
    expect(marcas(barajado).sort()).toEqual(marcasAntes.sort());
  });

  it('el instante SÍ llega al evento del historial, que es donde debe estar', () => {
    // El contraste del caso anterior: reordenar no es invisible, solo no escribe en el
    // documento. La bitácora sí deja constancia con su hora.
    const doc = arbol([[], []]);
    const { evento } = exigirOk(
      reducir(
        doc,
        { comando: 'reordenarEpica', proyecto: CLAVE, epicaId: 'PM-E1', aIndice: 1 },
        '2026-09-26T18:00:00-06:00',
      ),
    );
    expect(evento.ts).toBe('2026-09-26T18:00:00-06:00');
  });

  it('los tres reordenar quedan FUERA del vaciado inmediato: priorizar es una ráfaga', () => {
    const ordenes: Comando[] = [
      { comando: 'reordenarEpica', proyecto: CLAVE, epicaId: 'PM-E1', aIndice: 1 },
      { comando: 'reordenarHistoria', epicaId: 'PM-E1', historiaId: 'PM-H1', aIndice: 1 },
      { comando: 'reordenarTarea', contenedorId: 'PM-H1', tareaId: 'PM-T1', aIndice: 1 },
    ];
    expect(ordenes.map(requiereFlushInmediato)).toEqual([false, false, false]);
    // Contraste, para que la prueba diga algo: crear sí lo exige.
    expect(requiereFlushInmediato({ comando: 'crearEpica', proyecto: CLAVE, titulo: 'X' })).toBe(true);
  });
});

/** Todas las marcas de tiempo del documento, sin su posición: solo importa el conjunto. */
function marcas(doc: Documento): string[] {
  const salida: string[] = [];
  for (const proyecto of doc.proyectos) {
    salida.push(`${proyecto.clave}:cerrado=${proyecto.cerrado_en}`);
    salida.push(`${proyecto.clave}:planeacion=${proyecto.planeacion_cerrada_en}`);
    for (const epica of proyecto.epicas) {
      for (const historia of epica.historias) {
        for (const tarea of historia.tareas) {
          salida.push(`${tarea.id}:creada=${tarea.creada_en}`);
          salida.push(`${tarea.id}:hecha=${tarea.hecha_en}`);
          for (const bloqueo of tarea.bloqueos) {
            salida.push(`${tarea.id}:bloq=${bloqueo.bloqueada_en}/${bloqueo.desbloqueada_en}`);
          }
        }
      }
    }
  }
  return salida;
}

// --- 8. proyectos cerrados y archivados -------------------------------------

describe('reordenar se permite en proyectos cerrados y archivados', () => {
  it('un proyecto CERRADO se sigue pudiendo reordenar: no se afirma ningún hecho nuevo', () => {
    const doc = aplicar(arbol([[1], [1], [1]]), { comando: 'cerrarProyecto', clave: CLAVE });
    expect(doc.proyectos[0]?.cerrado_en).not.toBeNull();
    expect(doc.proyectos[0]?.archivado).toBe(true);

    const { documento } = exigirOk(
      reducirSinMutar(doc, { comando: 'reordenarEpica', proyecto: CLAVE, epicaId: 'PM-E3', aIndice: 0 }),
    );
    expect(idsEpicas(documento)).toEqual(['PM-E3', 'PM-E1', 'PM-E2']);
    // Y no lo reabre de rebote.
    expect(documento.proyectos[0]?.cerrado_en).toBe(doc.proyectos[0]?.cerrado_en);
    expect(documento.proyectos[0]?.archivado).toBe(true);
  });

  it('un proyecto solo ARCHIVADO (pausado, sin cerrar) también', () => {
    const base = arbol([[2]]);
    const doc: Documento = {
      ...base,
      proyectos: [{ ...base.proyectos[0]!, archivado: true }],
    };
    const { documento } = exigirOk(
      reducirSinMutar(doc, {
        comando: 'reordenarTarea',
        contenedorId: 'PM-H1',
        tareaId: 'PM-T2',
        aIndice: 0,
      }),
    );
    expect(idsTareas(documento)).toEqual(['PM-T2', 'PM-T1']);
    expect(documento.proyectos[0]?.archivado).toBe(true);
  });

  it('los tres niveles se permiten en un proyecto cerrado, no solo el de arriba', () => {
    const doc = aplicar(arbol([[2, 2]]), { comando: 'cerrarProyecto', clave: CLAVE });
    const conHistoria = exigirOk(
      reducirSinMutar(doc, {
        comando: 'reordenarHistoria',
        epicaId: 'PM-E1',
        historiaId: 'PM-H2',
        aIndice: 0,
      }),
    ).documento;
    expect(idsHistorias(conHistoria)).toEqual(['PM-H2', 'PM-H1']);

    const conTarea = exigirOk(
      reducirSinMutar(doc, {
        comando: 'reordenarTarea',
        contenedorId: 'PM-H1',
        tareaId: 'PM-T2',
        aIndice: 0,
      }),
    ).documento;
    expect(idsTareas(conTarea)).toEqual(['PM-T2', 'PM-T1']);
  });
});

// --- 9. el evento de la bitácora --------------------------------------------

describe('el evento deja constancia de cuánto se movió y de dónde (regla 7)', () => {
  it('reordenarEpica anota desde, hasta, el tamaño de la rama y el orden resultante', () => {
    const doc = arbol([[2, 1], [1], []]);
    const { evento } = exigirOk(
      reducirSinMutar(doc, { comando: 'reordenarEpica', proyecto: CLAVE, epicaId: 'PM-E1', aIndice: 2 }),
    );
    expect(evento.comando).toBe('reordenarEpica');
    expect(evento.proyecto_id).toBe(CLAVE);
    expect(evento.detalle).toMatchObject({
      desde: 0,
      hasta: 2,
      historias: 2,
      tareas: 3,
      orden: ['PM-E2', 'PM-E3', 'PM-E1'],
    });
    expect(evento.resumen).toContain('posición 1 → 3 de 3');
  });

  it('el orden del detalle es el de DESPUÉS: es lo que permite reconstruir la lista', () => {
    const doc = arbol([[1, 1, 1]]);
    const { documento, evento } = exigirOk(
      reducirSinMutar(doc, {
        comando: 'reordenarHistoria',
        epicaId: 'PM-E1',
        historiaId: 'PM-H3',
        aIndice: 0,
      }),
    );
    expect(evento.detalle?.orden).toEqual(idsHistorias(documento));
  });

  it('reordenarTarea congela dónde vivía la tarea: proyecto, épica, historia y ruta legible', () => {
    const doc = arbol([[3]]);
    const { evento } = exigirOk(
      reducirSinMutar(doc, {
        comando: 'reordenarTarea',
        contenedorId: 'PM-H1',
        tareaId: 'PM-T3',
        aIndice: 0,
      }),
    );
    expect(evento.proyecto_id).toBe(CLAVE);
    expect(evento.epica_id).toBe('PM-E1');
    expect(evento.historia_id).toBe('PM-H1');
    expect(evento.item_id).toBe('PM-T3');
    expect(evento.origen).toContain('Épica 1');
  });
});
