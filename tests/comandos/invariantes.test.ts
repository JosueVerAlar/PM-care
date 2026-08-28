/**
 * Invariantes del reductor: lo que tiene que ser cierto para CUALQUIER comando.
 *
 * Los archivos hermanos prueban qué hace cada comando. Este prueba lo que ninguno puede
 * dejar de cumplir, que es donde de verdad se esconden los bugs:
 *
 * 1. **Es puro.** Aplicar un comando no muta el documento de entrada. De esta invariante
 *    depende la pila de deshacer entera: si se rompe, deshacer devuelve basura y nada
 *    falla mientras tanto.
 * 2. **Nunca produce un documento que el esquema rechace.** El reductor tiene una red de
 *    seguridad que devuelve `documento-invalido` si lo hiciera; ver ese código aparecer
 *    en una secuencia generada es encontrar el bug, no una prueba superada.
 * 3. **Los ids no se reciclan nunca**, ni tras miles de altas y bajas.
 * 4. **Los sprints cerrados no cambian** por ningún camino (regla 8).
 * 5. **Los campos que el usuario escribió a mano se conservan** (regla 14).
 *
 * Las secuencias se generan con el PRNG con semilla de `apoyo/generador`: cada corrida es
 * reproducible y el contraejemplo se reconstruye idéntico con `prng(semilla)`.
 */

import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { validarDocumento } from '../../src/compartido/modelo/esquema';
import type { Documento } from '../../src/compartido/modelo/tipos';
import { reducir } from '../../src/principal/comandos/reductor';
import type { Comando, NombreComando } from '../../src/principal/comandos/tipos';
import { EsquemaComando, validarComando } from '../../src/principal/comandos/tipos';
import { unDocumento, unItem, unSprint } from '../apoyo/constructores';
import {
  AHORA,
  aplicar,
  aplicarTodos,
  arbolConTareas,
  arbolVacio,
  copiaProfunda,
  exigirOk,
  exigirValido,
  reducirSinMutar,
} from '../apoyo/comandos';
import { type Aleatorio, elegir, entero, prng } from '../apoyo/generador';

// --- 1. pureza --------------------------------------------------------------

/**
 * Un caso por cada uno de los 33 comandos: el payload, y si se espera que pase o falle.
 *
 * La tabla se comprueba completa contra la unión discriminada: si `backend` añade el
 * comando 31 y no lo pone aquí, la prueba de cobertura se pone en rojo. Eso es lo que
 * evita que la próxima capa de comandos vuelva a nacer sin red.
 */
function casosPorComando(): { comando: Comando; doc: Documento }[] {
  const { doc: arbol } = arbolConTareas(2);
  const conTodo = aplicarTodos(arbol, [
    { comando: 'crearPersona', nombre: 'Ana' },
    { comando: 'crearPersona', nombre: 'Beto' },
    { comando: 'bloquear', tareaId: 'PM-T2', tipo: 'externo', motivo: 'proveedor' },
  ]);
  const conSprints: Documento = {
    ...conTodo,
    sprints: [
      unSprint({ id: 'S-1', estado: 'activo', items: [unItem('PM-T1')] }),
      unSprint({ id: 'S-2', estado: 'planeado', inicio: '2026-09-01', fin: '2026-09-14' }),
    ],
  };
  const cerrado = aplicar(conSprints, { comando: 'cerrarProyecto', clave: 'PM' });
  const planeacionCerrada = aplicar(conSprints, { comando: 'cerrarPlaneacion', proyecto: 'PM' });
  const sinAna = aplicar(conSprints, { comando: 'desactivarPersona', id: 'ana' });
  /** Dos épicas y dos historias en la primera: sin hermanos no hay orden que cambiar. */
  const dosEpicas = aplicarTodos(conSprints, [
    { comando: 'crearEpica', proyecto: 'PM', titulo: 'Segunda épica' },
    { comando: 'crearHistoria', epicaId: 'PM-E1', titulo: 'Segunda historia' },
  ]);

  return [
    { comando: { comando: 'crearProyecto', clave: 'OTRO', nombre: 'Otro' }, doc: conSprints },
    { comando: { comando: 'editarProyecto', clave: 'PM', nombre: 'Renombrado' }, doc: conSprints },
    { comando: { comando: 'cerrarProyecto', clave: 'PM' }, doc: conSprints },
    { comando: { comando: 'reabrirProyecto', clave: 'PM' }, doc: cerrado },
    { comando: { comando: 'eliminarProyecto', clave: 'PM', confirmacion: 'PM' }, doc: conSprints },
    { comando: { comando: 'cerrarPlaneacion', proyecto: 'PM' }, doc: conSprints },
    // Reabrir exige que esté cerrada; sobre `conSprints` solo mediría el rechazo.
    { comando: { comando: 'reabrirPlaneacion', proyecto: 'PM' }, doc: planeacionCerrada },
    { comando: { comando: 'crearPersona', nombre: 'Carla' }, doc: conSprints },
    { comando: { comando: 'editarPersona', id: 'ana', nombre: 'Ana María' }, doc: conSprints },
    { comando: { comando: 'desactivarPersona', id: 'ana' }, doc: conSprints },
    { comando: { comando: 'reactivarPersona', id: 'ana' }, doc: sinAna },
    { comando: { comando: 'eliminarPersona', id: 'beto' }, doc: conSprints },
    { comando: { comando: 'fijarUsuario', id: 'ana' }, doc: conSprints },
    { comando: { comando: 'crearEpica', proyecto: 'PM', titulo: 'Otra' }, doc: conSprints },
    { comando: { comando: 'editarEpica', id: 'PM-E1', titulo: 'Otra' }, doc: conSprints },
    { comando: { comando: 'eliminarEpica', id: 'PM-E1' }, doc: conSprints },
    // Con una sola épica el único destino posible es la posición en la que ya está, así
    // que el caso se arma sobre `dosEpicas`: un reordenamiento que no reordena nada no
    // ejercita ni el `splice` ni la pureza de lo que se movió.
    { comando: { comando: 'reordenarEpica', proyecto: 'PM', epicaId: 'PM-E2', aIndice: 0 }, doc: dosEpicas },
    { comando: { comando: 'crearHistoria', epicaId: 'PM-E1', titulo: 'Otra' }, doc: conSprints },
    { comando: { comando: 'editarHistoria', id: 'PM-H1', titulo: 'Otra' }, doc: conSprints },
    { comando: { comando: 'eliminarHistoria', id: 'PM-H1' }, doc: conSprints },
    { comando: { comando: 'reordenarHistoria', epicaId: 'PM-E1', historiaId: 'PM-H2', aIndice: 0 }, doc: dosEpicas },
    { comando: { comando: 'crearTarea', contenedorId: 'PM-H1', titulo: 'Otra' }, doc: conSprints },
    { comando: { comando: 'editarTarea', id: 'PM-T1', titulo: 'Otra' }, doc: conSprints },
    { comando: { comando: 'eliminarTarea', id: 'PM-T2' }, doc: conSprints },
    { comando: { comando: 'reordenarTarea', contenedorId: 'PM-H1', tareaId: 'PM-T2', aIndice: 0 }, doc: conSprints },
    { comando: { comando: 'cambiarEstado', id: 'PM-T1', estado: 'hecha' }, doc: conSprints },
    { comando: { comando: 'moverAlSprint', tareaId: 'PM-T2', sprintId: 'S-1' }, doc: conSprints },
    { comando: { comando: 'sacarDelSprint', tareaId: 'PM-T1', sprintId: 'S-1' }, doc: conSprints },
    { comando: { comando: 'cerrarSprint', sprintId: 'S-1' }, doc: conSprints },
    { comando: { comando: 'activarSprint', sprintId: 'S-2' }, doc: conTodo },
    {
      comando: { comando: 'bloquear', tareaId: 'PM-T1', tipo: 'decision', motivo: 'x' },
      doc: conSprints,
    },
    { comando: { comando: 'desbloquear', tareaId: 'PM-T2' }, doc: conSprints },
    {
      comando: { comando: 'editarEquipo', proyecto: 'PM', miembros: [{ persona_id: 'ana', rol: null }] },
      doc: conSprints,
    },
  ];
}

describe('la tabla de casos cubre los 33 comandos', () => {
  it('no falta ninguno de la unión discriminada: un comando nuevo sin caso pone esto en rojo', () => {
    const conCaso = new Set(casosPorComando().map((c) => c.comando.comando));
    const declarados = EsquemaComando.options.map(
      (opcion) => opcion.shape.comando.value as NombreComando,
    );
    expect(declarados).toHaveLength(33);
    expect([...declarados].filter((n) => !conCaso.has(n))).toEqual([]);
  });
});

describe('el reductor es puro', () => {
  it('ningún comando muta el documento de entrada — comprobado con copia profunda', () => {
    for (const { comando, doc } of casosPorComando()) {
      const antes = copiaProfunda(doc);
      reducir(doc, comando, AHORA);
      expect(doc, `"${comando.comando}" mutó el documento de entrada`).toEqual(antes);
    }
  });

  it('un comando RECHAZADO tampoco lo muta: el rechazo no puede dejar medio cambio aplicado', () => {
    const { doc } = arbolConTareas(1);
    const antes = copiaProfunda(doc);
    for (const comando of [
      { comando: 'crearTarea', contenedorId: 'PM-H1', titulo: 'X', responsable: 'fantasma' },
      { comando: 'editarTarea', id: 'PM-T1', responsable: 'fantasma' },
      { comando: 'cambiarEstado', id: 'PM-T1', estado: 'pendiente' },
      { comando: 'eliminarProyecto', clave: 'PM', confirmacion: 'mal' },
      { comando: 'crearHistoria', epicaId: 'NO-E1', titulo: 'X' },
    ] as const) {
      expect(reducir(doc, comando, AHORA).ok).toBe(false);
      expect(doc, `el rechazo de "${comando.comando}" mutó el documento`).toEqual(antes);
    }
  });

  it('el documento devuelto no comparte ni una referencia con el de entrada', () => {
    // Sin esto, «no mutó» sería cierto solo hasta que alguien tocara el resultado: la
    // pila de deshacer guarda los dos y una referencia compartida los contamina a la vez.
    const { doc } = arbolConTareas(2);
    const { documento } = exigirOk(reducir(doc, { comando: 'editarTarea', id: 'PM-T1', titulo: 'X' }, AHORA));
    const antes = copiaProfunda(doc);

    const tarea = documento.proyectos[0]?.epicas[0]?.historias[0]?.tareas[1];
    if (tarea === undefined) throw new Error('resultado sin tarea');
    tarea.titulo = 'contaminado';
    documento.proyectos[0]?.epicas[0]?.historias.push({
      id: 'PM-H9',
      titulo: 'colada',
      descripcion: null,
      planeada: true,
      clave_externa: null,
      tareas: [],
    });

    expect(doc).toEqual(antes);
  });

  it('el mismo comando sobre el mismo documento da siempre el mismo resultado', () => {
    const { doc } = arbolConTareas(2);
    const uno = exigirOk(reducir(doc, { comando: 'crearTarea', contenedorId: 'PM-H1', titulo: 'X' }, AHORA));
    const dos = exigirOk(reducir(doc, { comando: 'crearTarea', contenedorId: 'PM-H1', titulo: 'X' }, AHORA));
    expect(uno.documento).toEqual(dos.documento);
    expect(uno.evento).toEqual(dos.evento);
  });

  it('no consulta el reloj: dos instantes distintos dan documentos distintos, y el instante manda', () => {
    const { doc } = arbolConTareas(1);
    const temprano = exigirOk(reducir(doc, { comando: 'cambiarEstado', id: 'PM-T1', estado: 'hecha' }, '2020-01-01T00:00:00-06:00'));
    expect(temprano.documento.proyectos[0]?.epicas[0]?.historias[0]?.tareas[0]?.hecha_en).toBe(
      '2020-01-01T00:00:00-06:00',
    );
    expect(temprano.evento.ts).toBe('2020-01-01T00:00:00-06:00');
  });
});

// --- 5. campos escritos a mano (regla 14) -----------------------------------

describe('regla 14: los campos desconocidos del usuario sobreviven a cualquier comando', () => {
  it('una nota escrita a mano en una tarea sigue ahí después de editarla', () => {
    const { doc } = arbolConTareas(1);
    const conNota = copiaProfunda(doc);
    const tarea = conNota.proyectos[0]?.epicas[0]?.historias[0]?.tareas[0];
    if (tarea === undefined) throw new Error('fixture sin tarea');
    tarea.mi_nota = 'preguntar a Jesús el lunes';

    const { documento } = exigirOk(
      reducirSinMutar(conNota, { comando: 'editarTarea', id: 'PM-T1', titulo: 'Otro' }),
    );
    expect(documento.proyectos[0]?.epicas[0]?.historias[0]?.tareas[0]?.mi_nota).toBe(
      'preguntar a Jesús el lunes',
    );
  });

  it('sobreviven en la raíz, en el proyecto, en la persona y en el sprint a la vez', () => {
    const { doc } = arbolConTareas(1);
    const conNotas = copiaProfunda({
      ...aplicar(doc, { comando: 'crearPersona', nombre: 'Ana' }),
      sprints: [unSprint({ id: 'S-1', estado: 'activo' })],
    });
    // La raíz del documento es `passthrough` igual que el resto, pero su tipo inferido no
    // lleva la firma de índice (el `superRefine` de la validación cruzada la pierde), así
    // que aquí hace falta escribirla por el índice.
    (conNotas as Record<string, unknown>).notas_generales = 'mías';
    const proyecto = conNotas.proyectos[0];
    const persona = conNotas.personas[0];
    const sprint = conNotas.sprints[0];
    if (proyecto === undefined || persona === undefined || sprint === undefined) {
      throw new Error('fixture incompleto');
    }
    proyecto.mi_campo = 1;
    persona.mi_campo = 2;
    sprint.mi_campo = 3;

    const { documento } = exigirOk(
      reducirSinMutar(conNotas, { comando: 'moverAlSprint', tareaId: 'PM-T1', sprintId: 'S-1' }),
    );
    expect((documento as Record<string, unknown>).notas_generales).toBe('mías');
    expect(documento.proyectos[0]?.mi_campo).toBe(1);
    expect(documento.personas[0]?.mi_campo).toBe(2);
    expect(documento.sprints[0]?.mi_campo).toBe(3);
  });

  it('un campo desconocido en el PAYLOAD sí se rechaza: eso no lo escribió el usuario, es un bug', () => {
    // La asimetría es deliberada: `passthrough` en el documento, `strict` en el comando.
    expect(validarComando({ comando: 'cambiarEstado', id: 'PM-T1', estado: 'hecha', extra: 1 }).ok).toBe(
      false,
    );
  });
});

// --- máquina de estados sobre comandos generados ----------------------------

/** Todo lo que hay que saber del documento para proponer comandos plausibles. */
interface Inventario {
  proyectos: string[];
  epicas: string[];
  historias: string[];
  tareas: string[];
  personas: string[];
  sprints: { id: string; estado: string }[];
  /**
   * De cada épica, historia y tarea, el id de su padre. Lo necesitan los `reordenar*`:
   * exigen nombrar el padre y rechazan el que no coincide, así que sin esto el generador
   * nombraría casi siempre el equivocado y la máquina volvería a medir solo rechazos.
   */
  padre: Map<string, string>;
}

function inventariar(doc: Documento): Inventario {
  const inv: Inventario = {
    proyectos: [],
    epicas: [],
    historias: [],
    tareas: [],
    personas: doc.personas.map((p) => p.id),
    sprints: doc.sprints.map((s) => ({ id: s.id, estado: s.estado })),
    padre: new Map(),
  };
  for (const proyecto of doc.proyectos) {
    inv.proyectos.push(proyecto.clave);
    for (const epica of proyecto.epicas) {
      inv.epicas.push(epica.id);
      inv.padre.set(epica.id, proyecto.clave);
      for (const historia of epica.historias) {
        inv.historias.push(historia.id);
        inv.padre.set(historia.id, epica.id);
        for (const tarea of historia.tareas) {
          inv.tareas.push(tarea.id);
          inv.padre.set(tarea.id, historia.id);
        }
      }
    }
  }
  return inv;
}

/** Una tarea que ya está comprometida en ese sprint, o `null` si no hay ninguna. */
function comprometidaEn(doc: Documento, sprintId: string): string | null {
  const sprint = doc.sprints.find((s) => s.id === sprintId);
  return sprint?.items[0]?.tarea_id ?? null;
}

const ESTADOS = ['pendiente', 'en_curso', 'hecha', 'cancelada'] as const;
const TIPOS_BLOQUEO = ['dependencia', 'externo', 'decision', 'informacion', 'otro'] as const;
const PRIORIDADES = ['alta', 'media', 'baja'] as const;
/** Con acentos, repetidos y sin letras latinas: el desempate del id también se ejercita. */
const NOMBRES = ['Ana García', 'Ana García', 'Jesús Castillo', '李四', 'María-José Núñez', '???'];

/**
 * Propone un comando cualquiera contra el documento actual.
 *
 * Muchos serán rechazados (ids inventados, estados repetidos, sprints cerrados) y eso es
 * parte del ejercicio: un rechazo también tiene que dejar el documento intacto. Lo que
 * NUNCA debe pasar es que el reductor conteste `documento-invalido`.
 */
function proponerComando(rng: Aleatorio, doc: Documento, nuevaClave: () => string): Comando {
  const inv = inventariar(doc);
  const unId = (lista: readonly string[], inventado: string): string =>
    lista.length > 0 && rng() < 0.85 ? elegir(rng, lista) : inventado;
  const proyecto = unId(inv.proyectos, 'FANTASMA');
  const tarea = unId(inv.tareas, 'FANTASMA-T1');
  const sprint = inv.sprints.length > 0 && rng() < 0.9 ? elegir(rng, inv.sprints).id : 'S-FANTASMA';
  const persona = unId(inv.personas, 'fantasma');
  // Sesgos deliberados hacia lo que SÍ puede prosperar. Sin ellos `sacarDelSprint` casi
  // siempre nombra una tarea que no está en ese sprint y `activarSprint` uno ya activo:
  // la secuencia seguiría verde midiendo solo rechazos, que es la peor clase de verde.
  const comprometida = comprometidaEn(doc, sprint);
  const tareaDelSprint = comprometida !== null && rng() < 0.8 ? comprometida : tarea;
  const planeado = inv.sprints.filter((s) => s.estado === 'planeado');
  const sprintActivable = planeado.length > 0 && rng() < 0.8 ? elegir(rng, planeado).id : sprint;
  const talVez = <T>(valor: T): T | undefined => (rng() < 0.5 ? valor : undefined);
  // El padre de verdad casi siempre, y uno equivocado de vez en cuando: así se ejercitan
  // los dos lados de `reordenar*`, el que mueve y el que rechaza «no cuelga de ahí».
  const padreDe = (id: string, inventado: string): string =>
    (rng() < 0.85 ? inv.padre.get(id) : undefined) ?? inventado;

  const opciones: (() => Comando)[] = [
    () => ({ comando: 'crearProyecto', clave: nuevaClave(), nombre: 'Generado' }),
    () => ({ comando: 'editarProyecto', clave: proyecto, nombre: `N${entero(rng, 1, 99)}` }),
    () => ({ comando: 'cerrarProyecto', clave: proyecto }),
    () => ({ comando: 'reabrirProyecto', clave: proyecto }),
    () => ({ comando: 'eliminarProyecto', clave: proyecto, confirmacion: proyecto }),
    () => ({ comando: 'cerrarPlaneacion', proyecto }),
    () => ({ comando: 'reabrirPlaneacion', proyecto }),
    // `null` de vez en cuando: soltar el usuario es una rama propia y tiene que
    // sobrevivir a la máquina igual que fijarlo.
    () => ({ comando: 'fijarUsuario', id: rng() < 0.2 ? null : persona }),
    () => ({
      comando: 'crearPersona',
      nombre: elegir(rng, NOMBRES),
      equipos: talVez(inv.proyectos.filter(() => rng() < 0.5)),
    }),
    () => ({
      comando: 'editarPersona',
      id: persona,
      nombre: talVez(`P${entero(rng, 1, 99)}`),
      equipos: talVez(inv.proyectos.filter(() => rng() < 0.5)),
    }),
    () => ({ comando: 'desactivarPersona', id: persona }),
    () => ({ comando: 'reactivarPersona', id: persona }),
    () => ({ comando: 'eliminarPersona', id: persona }),
    () => ({ comando: 'crearEpica', proyecto, titulo: `Épica ${entero(rng, 1, 99)}` }),
    () => ({ comando: 'editarEpica', id: unId(inv.epicas, 'FANTASMA-E1'), titulo: 'Editada' }),
    () => ({ comando: 'eliminarEpica', id: unId(inv.epicas, 'FANTASMA-E1') }),
    () => {
      const epicaId = unId(inv.epicas, 'FANTASMA-E1');
      // El índice se pide a veces más allá del final a propósito: topar en vez de
      // rechazar (decisión 1) tiene que sobrevivir a la máquina, no solo a un caso.
      return { comando: 'reordenarEpica', proyecto: padreDe(epicaId, proyecto), epicaId, aIndice: entero(rng, 0, 6) };
    },
    () => ({
      comando: 'crearHistoria',
      epicaId: unId(inv.epicas, 'FANTASMA-E1'),
      titulo: `Historia ${entero(rng, 1, 99)}`,
    }),
    () => ({ comando: 'editarHistoria', id: unId(inv.historias, 'FANTASMA-H1'), titulo: 'Editada' }),
    () => ({ comando: 'eliminarHistoria', id: unId(inv.historias, 'FANTASMA-H1') }),
    () => {
      const historiaId = unId(inv.historias, 'FANTASMA-H1');
      return {
        comando: 'reordenarHistoria',
        epicaId: padreDe(historiaId, 'FANTASMA-E1'),
        historiaId,
        aIndice: entero(rng, 0, 6),
      };
    },
    () => ({
      comando: 'crearTarea',
      contenedorId: unId(inv.historias, 'FANTASMA-H1'),
      titulo: `Tarea ${entero(rng, 1, 99)}`,
      responsable: talVez(rng() < 0.2 ? null : persona),
      prioridad: talVez(elegir(rng, PRIORIDADES)),
      fechaLimite: talVez(`2026-1${entero(rng, 0, 2)}-0${entero(rng, 1, 9)}`),
    }),
    () => ({
      comando: 'editarTarea',
      id: tarea,
      titulo: talVez('Editada'),
      responsable: talVez(rng() < 0.3 ? null : persona),
      prioridad: talVez(rng() < 0.3 ? null : elegir(rng, PRIORIDADES)),
    }),
    () => ({ comando: 'eliminarTarea', id: tarea }),
    () => ({
      comando: 'reordenarTarea',
      contenedorId: padreDe(tarea, 'FANTASMA-H1'),
      tareaId: tarea,
      aIndice: entero(rng, 0, 6),
    }),
    () => ({ comando: 'cambiarEstado', id: tarea, estado: elegir(rng, ESTADOS) }),
    () => ({
      comando: 'moverAlSprint',
      tareaId: tarea,
      sprintId: sprint,
      posicion: talVez(entero(rng, 0, 5)),
    }),
    () => ({ comando: 'sacarDelSprint', tareaId: tareaDelSprint, sprintId: sprint }),
    () => ({ comando: 'cerrarSprint', sprintId: sprint }),
    () => ({ comando: 'activarSprint', sprintId: sprintActivable }),
    () => ({
      comando: 'bloquear',
      tareaId: tarea,
      tipo: elegir(rng, TIPOS_BLOQUEO),
      motivo: 'generado',
    }),
    () => ({ comando: 'desbloquear', tareaId: tarea }),
    () => ({
      comando: 'editarEquipo',
      proyecto,
      miembros: inv.personas.filter(() => rng() < 0.4).map((id) => ({ persona_id: id, rol: null })),
    }),
  ];
  return elegir(rng, opciones)();
}

/** Documento de partida de las secuencias: dos proyectos con árbol y tres sprints. */
function puntoDePartida(): Documento {
  const uno = arbolConTareas(3, 'UNO');
  const dos = arbolVacio('DOS');
  return {
    ...unDocumento(),
    proyectos: [...uno.doc.proyectos, ...dos.doc.proyectos],
    sprints: [
      unSprint({
        id: 'S-viejo',
        estado: 'cerrado',
        inicio: '2026-06-01',
        fin: '2026-06-14',
        items: [unItem('UNO-T1', { desenlace: 'completada' })],
      }),
      unSprint({ id: 'S-hoy', estado: 'activo' }),
      unSprint({ id: 'S-luego', estado: 'planeado', inicio: '2026-09-01', fin: '2026-09-14' }),
    ],
  };
}

/** Todos los ids de item que hay ahora mismo, agrupados por proyecto vivo. */
function idsPorProyecto(doc: Documento): Map<string, Set<string>> {
  const mapa = new Map<string, Set<string>>();
  for (const proyecto of doc.proyectos) {
    const ids = new Set<string>();
    for (const epica of proyecto.epicas) {
      ids.add(epica.id);
      for (const historia of epica.historias) {
        ids.add(historia.id);
        for (const tarea of historia.tareas) ids.add(tarea.id);
      }
    }
    mapa.set(proyecto.clave, ids);
  }
  return mapa;
}

/** Semillas fijas: la corrida tarda lo mismo hoy que mañana y el conjunto no cambia solo. */
const SEMILLAS_COMANDOS: readonly number[] = Array.from({ length: 120 }, (_, i) => i + 1);
const PASOS = 60;

describe('secuencias largas de comandos generados', () => {
  it('el reductor NUNCA contesta "documento-invalido": ese código significa un bug suyo', () => {
    for (const semilla of SEMILLAS_COMANDOS) {
      const rng = prng(semilla);
      let clave = 0;
      const nuevaClave = () => `NUE${(clave += 1)}`;
      let doc = puntoDePartida();

      for (let paso = 0; paso < PASOS; paso += 1) {
        const comando = proponerComando(rng, doc, nuevaClave);
        const resultado = reducir(doc, comando, AHORA);
        if (!resultado.ok && resultado.error.codigo === 'documento-invalido') {
          throw new Error(
            `semilla ${semilla}, paso ${paso}: "${comando.comando}" dejó el documento inválido\n` +
              `  comando: ${JSON.stringify(comando)}\n` +
              `  ${(resultado.error.detalles ?? []).join('\n  ')}`,
          );
        }
        if (resultado.ok) doc = resultado.documento;
      }
      exigirValido(doc, `semilla ${semilla}`);
    }
  });

  it('el documento de entrada nunca se muta, paso a paso, en toda la secuencia', () => {
    for (const semilla of SEMILLAS_COMANDOS.slice(0, 40)) {
      const rng = prng(semilla);
      let clave = 0;
      const nuevaClave = () => `NUE${(clave += 1)}`;
      let doc = puntoDePartida();

      for (let paso = 0; paso < PASOS; paso += 1) {
        const comando = proponerComando(rng, doc, nuevaClave);
        const antes = copiaProfunda(doc);
        const resultado = reducir(doc, comando, AHORA);
        expect(doc, `semilla ${semilla}, paso ${paso}: "${comando.comando}" mutó la entrada`).toEqual(
          antes,
        );
        if (resultado.ok) doc = resultado.documento;
      }
    }
  });

  it('regla 15: ningún id de item se repite en toda la vida de la secuencia', () => {
    // El registro se lleva por proyecto y se olvida cuando el proyecto se elimina: ahí el
    // reciclado sería legítimo. Las claves generadas nunca se reutilizan, así que un id
    // repetido solo puede venir de un contador que bajó.
    for (const semilla of SEMILLAS_COMANDOS.slice(0, 60)) {
      const rng = prng(semilla);
      let clave = 0;
      const nuevaClave = () => `NUE${(clave += 1)}`;
      let doc = puntoDePartida();
      const usados = new Map<string, Set<string>>();
      for (const [proyecto, ids] of idsPorProyecto(doc)) usados.set(proyecto, new Set(ids));

      for (let paso = 0; paso < PASOS; paso += 1) {
        const comando = proponerComando(rng, doc, nuevaClave);
        const resultado = reducir(doc, comando, AHORA);
        if (!resultado.ok) continue;
        const antes = idsPorProyecto(doc);
        doc = resultado.documento;

        for (const [proyecto, ids] of idsPorProyecto(doc)) {
          const historicos = usados.get(proyecto) ?? new Set<string>();
          for (const id of ids) {
            const esNuevo = !(antes.get(proyecto)?.has(id) ?? false);
            if (esNuevo && historicos.has(id)) {
              throw new Error(
                `semilla ${semilla}, paso ${paso}: "${comando.comando}" recicló el id ${id}`,
              );
            }
            historicos.add(id);
          }
          usados.set(proyecto, historicos);
        }
        // Un proyecto eliminado se olvida: su clave no vuelve a emitirse en la corrida.
        for (const proyecto of [...usados.keys()]) {
          if (!doc.proyectos.some((p) => p.clave === proyecto)) usados.delete(proyecto);
        }
      }
    }
  });

  it('regla 15: los contadores de un proyecto vivo nunca decrecen', () => {
    for (const semilla of SEMILLAS_COMANDOS.slice(0, 60)) {
      const rng = prng(semilla);
      let clave = 0;
      const nuevaClave = () => `NUE${(clave += 1)}`;
      let doc = puntoDePartida();

      for (let paso = 0; paso < PASOS; paso += 1) {
        const comando = proponerComando(rng, doc, nuevaClave);
        const resultado = reducir(doc, comando, AHORA);
        if (!resultado.ok) continue;
        const antes = new Map(doc.proyectos.map((p) => [p.clave, p.contadores]));
        doc = resultado.documento;
        for (const proyecto of doc.proyectos) {
          const previo = antes.get(proyecto.clave);
          if (previo === undefined) continue;
          for (const campo of ['epicas', 'historias', 'tareas'] as const) {
            expect(
              proyecto.contadores[campo],
              `semilla ${semilla}, paso ${paso}: "${comando.comando}" bajó contadores.${campo} de ${proyecto.clave}`,
            ).toBeGreaterThanOrEqual(previo[campo]);
          }
        }
      }
    }
  });

  it('regla 8: el sprint cerrado de partida sale igual que entró tras 60 comandos', () => {
    for (const semilla of SEMILLAS_COMANDOS.slice(0, 60)) {
      const rng = prng(semilla);
      let clave = 0;
      const nuevaClave = () => `NUE${(clave += 1)}`;
      let doc = puntoDePartida();
      const original = copiaProfunda(doc.sprints[0]);

      for (let paso = 0; paso < PASOS; paso += 1) {
        const resultado = reducir(doc, proponerComando(rng, doc, nuevaClave), AHORA);
        if (resultado.ok) doc = resultado.documento;
      }
      const viejo = doc.sprints.find((s) => s.id === 'S-viejo');
      expect(viejo, `semilla ${semilla}: el sprint cerrado desapareció`).toBeDefined();
      expect(viejo, `semilla ${semilla}: el sprint cerrado cambió`).toEqual(original);
    }
  });

  it('un sprint YA cerrado durante la secuencia tampoco vuelve a cambiar', () => {
    for (const semilla of SEMILLAS_COMANDOS.slice(0, 60)) {
      const rng = prng(semilla);
      let clave = 0;
      const nuevaClave = () => `NUE${(clave += 1)}`;
      let doc = puntoDePartida();
      const congelados = new Map<string, string>();

      for (let paso = 0; paso < PASOS; paso += 1) {
        const comando = proponerComando(rng, doc, nuevaClave);
        const resultado = reducir(doc, comando, AHORA);
        if (!resultado.ok) continue;
        doc = resultado.documento;
        for (const sprint of doc.sprints) {
          if (sprint.estado !== 'cerrado') continue;
          const ahora = JSON.stringify(sprint);
          const antes = congelados.get(sprint.id);
          if (antes !== undefined && antes !== ahora) {
            throw new Error(
              `semilla ${semilla}, paso ${paso}: "${comando.comando}" modificó el sprint cerrado ${sprint.id}`,
            );
          }
          congelados.set(sprint.id, ahora);
        }
      }
    }
  });

  it('todo éxito trae un evento con el instante y el nombre del comando que lo produjo', () => {
    for (const semilla of SEMILLAS_COMANDOS.slice(0, 20)) {
      const rng = prng(semilla);
      let clave = 0;
      const nuevaClave = () => `NUE${(clave += 1)}`;
      let doc = puntoDePartida();

      for (let paso = 0; paso < PASOS; paso += 1) {
        const comando = proponerComando(rng, doc, nuevaClave);
        const resultado = reducir(doc, comando, AHORA);
        if (!resultado.ok) continue;
        expect(resultado.evento.comando).toBe(comando.comando);
        expect(resultado.evento.ts).toBe(AHORA);
        expect(resultado.evento.resumen.length).toBeGreaterThan(0);
        doc = resultado.documento;
      }
    }
  });

  it('todo comando generado es un payload válido: la secuencia ejercita el reductor, no a Zod', () => {
    const rng = prng(7);
    let clave = 0;
    const nuevaClave = () => `NUE${(clave += 1)}`;
    let doc = puntoDePartida();
    for (let paso = 0; paso < 300; paso += 1) {
      const comando = proponerComando(rng, doc, nuevaClave);
      const validado = validarComando(comando);
      if (!validado.ok) {
        throw new Error(
          `el generador produjo un payload inválido: ${JSON.stringify(comando)}\n  ` +
            validado.problemas.map((p) => `${p.ruta}: ${p.mensaje}`).join('\n  '),
        );
      }
      const resultado = reducir(doc, comando, AHORA);
      if (resultado.ok) doc = resultado.documento;
    }
  });
});

describe('la red de seguridad del reductor', () => {
  it('si el documento de entrada YA es inválido, el comando falla y no se escribe nada', () => {
    // El caso real: el usuario metió a mano una referencia rota. El reductor no repara
    // (está prohibido) y tampoco persiste encima; devuelve el detalle con la ruta.
    const { doc } = arbolConTareas(1);
    const roto = copiaProfunda(doc);
    const tarea = roto.proyectos[0]?.epicas[0]?.historias[0]?.tareas[0];
    if (tarea === undefined) throw new Error('fixture sin tarea');
    tarea.responsable = 'nadie-de-este-mundo';

    expect(validarDocumento(roto).ok).toBe(false);
    const resultado = reducir(roto, { comando: 'editarTarea', id: 'PM-T1', titulo: 'X' }, AHORA);
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) {
      expect(resultado.error.codigo).toBe('documento-invalido');
      expect(resultado.error.detalles?.join(' ')).toContain('nadie-de-este-mundo');
    }
  });

  it('el documento que sale de un comando exitoso siempre pasa el esquema completo', () => {
    const { doc } = arbolConTareas(2);
    const final = aplicarTodos(doc, [
      { comando: 'crearPersona', nombre: 'Ana' },
      { comando: 'editarTarea', id: 'PM-T1', responsable: 'ana' },
      { comando: 'cambiarEstado', id: 'PM-T1', estado: 'hecha' },
      { comando: 'crearEpica', proyecto: 'PM', titulo: 'Otra' },
    ]);
    exigirValido(final);
  });
});

describe('la secuencia generada de verdad llega a algún sitio', () => {
  it('los 30 comandos se aplican con ÉXITO al menos una vez: sin esto la máquina mediría solo rechazos', () => {
    // La trampa que esta prueba cierra: un generador que propone comandos imposibles deja
    // las invariantes de arriba en verde sin haber ejecutado nunca el cuerpo de un `case`.
    const exitos = new Set<string>();
    for (const semilla of SEMILLAS_COMANDOS) {
      const rng = prng(semilla);
      let clave = 0;
      const nuevaClave = () => `NUE${(clave += 1)}`;
      let doc = puntoDePartida();
      for (let paso = 0; paso < PASOS; paso += 1) {
        const comando = proponerComando(rng, doc, nuevaClave);
        const resultado = reducir(doc, comando, AHORA);
        if (resultado.ok) {
          exitos.add(comando.comando);
          doc = resultado.documento;
        }
      }
    }
    const declarados = EsquemaComando.options.map(
      (opcion) => opcion.shape.comando.value as NombreComando,
    );
    expect([...declarados].filter((nombre) => !exitos.has(nombre))).toEqual([]);
  });

  it('y también llega a los rechazos que importan: sprint cerrado en las cuatro rutas de borrado', () => {
    const vistos = new Set<string>();
    for (const semilla of SEMILLAS_COMANDOS) {
      const rng = prng(semilla);
      let clave = 0;
      const nuevaClave = () => `NUE${(clave += 1)}`;
      let doc = puntoDePartida();
      for (let paso = 0; paso < PASOS; paso += 1) {
        const comando = proponerComando(rng, doc, nuevaClave);
        const resultado = reducir(doc, comando, AHORA);
        if (resultado.ok) doc = resultado.documento;
        else if (resultado.error.codigo === 'sprint-cerrado') vistos.add(comando.comando);
      }
    }
    for (const nombre of [
      'eliminarTarea',
      'eliminarHistoria',
      'eliminarEpica',
      'eliminarProyecto',
    ]) {
      expect(vistos.has(nombre), `la secuencia nunca intentó ${nombre} contra un sprint cerrado`).toBe(
        true,
      );
    }
  });
});

// --- el eslabón entre las dos capas -----------------------------------------

describe('la protección de los campos inmutables es la CADENA validar → reducir', () => {
  /**
   * Por qué esta prueba existe: romper el reductor para que aplicara una `claveNueva`
   * no ponía en rojo ninguna prueba. No es que la protección falte — es que vive una
   * capa más arriba, en el `.strict()` del payload, y las pruebas del reductor lo llaman
   * con objetos ya tipados que nunca podrían traer ese campo. La defensa real es que
   * NADIE llegue al reductor sin pasar por `validarComando`, y eso es lo que se ata aquí.
   */
  function comoElManejador(doc: Documento, crudo: unknown): { aplicado: boolean; doc: Documento } {
    const validado = validarComando(crudo);
    if (!validado.ok) return { aplicado: false, doc };
    const resultado = reducir(doc, validado.comando, AHORA);
    return resultado.ok ? { aplicado: true, doc: resultado.documento } : { aplicado: false, doc };
  }

  it('un payload que intenta renombrar la clave del proyecto no llega al reductor', () => {
    const { doc } = arbolConTareas(1);
    const salida = comoElManejador(doc, {
      comando: 'editarProyecto',
      clave: 'PM',
      nombre: 'Otro',
      claveNueva: 'PM2',
    });
    expect(salida.aplicado).toBe(false);
    expect(salida.doc.proyectos[0]?.clave).toBe('PM');
    expect(salida.doc.proyectos[0]?.nombre).toBe('Proyecto PM');
  });

  it('un payload que intenta renombrar el id de una persona tampoco llega', () => {
    const doc = aplicar(unDocumento(), { comando: 'crearPersona', nombre: 'Ana García' });
    const salida = comoElManejador(doc, {
      comando: 'editarPersona',
      id: 'ana-garcia',
      nombre: 'Ana G.',
      idNuevo: 'ana-g',
    });
    expect(salida.aplicado).toBe(false);
    expect(salida.doc.personas[0]).toEqual({
      id: 'ana-garcia',
      nombre: 'Ana García',
      activa: true,
      clave_externa: null,
    });
  });

  it('el mismo payload sin el campo de más sí pasa: el rechazo mide el campo, no la ruta', () => {
    const { doc } = arbolConTareas(1);
    const salida = comoElManejador(doc, { comando: 'editarProyecto', clave: 'PM', nombre: 'Otro' });
    expect(salida.aplicado).toBe(true);
    expect(salida.doc.proyectos[0]?.nombre).toBe('Otro');
  });

  it('el manejador de IPC valida ANTES de ejecutar: si alguien quita ese paso, esto se pone en rojo', () => {
    // Auditoría por texto y no por ejecución: registrar los manejadores exige `ipcMain`,
    // que solo existe dentro de Electron. Es frágil ante un refactor del archivo y aun
    // así vale la pena: sin este eslabón, el `.strict()` de los payloads no protege nada.
    const fuente = readFileSync(
      new URL('../../src/principal/ipc/manejadores.ts', import.meta.url),
      'utf8',
    );
    const aplicar = fuente.slice(fuente.indexOf('CANALES.aplicar'));
    const validacion = aplicar.indexOf('validarComando(');
    const ejecucion = aplicar.indexOf('repositorio.ejecutar(');
    expect(validacion, 'el manejador de aplicar ya no valida el payload').toBeGreaterThanOrEqual(0);
    expect(ejecucion, 'el manejador de aplicar ya no ejecuta el comando').toBeGreaterThan(validacion);
  });
});
