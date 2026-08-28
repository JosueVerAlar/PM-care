/**
 * Carga por persona, historial y dispersión.
 *
 * El módulo promete tres cosas y ninguna es "capacidad": cuánto se le comprometió, entre
 * cuántos proyectos está repartido y cuánto cerró antes. Las pruebas protegen justo eso
 * y, sobre todo, que ninguna cuenta se infle con lo que no debe entrar.
 */

import { describe, expect, it } from 'vitest';

import {
  MINIMO_SPRINTS_PARA_MEDIANA,
  cargaDe,
  cargaPorPersona,
  conformacionDeEquipos,
  dispersionDelSprint,
  equiposDe,
  historialDe,
} from '../../src/compartido/dominio/carga';
import { sprintActivo } from '../../src/compartido/dominio/derivar';
import { validarDocumento } from '../../src/compartido/modelo/esquema';
import type { Documento } from '../../src/compartido/modelo/tipos';
import {
  unBloqueo,
  unDocumento,
  unItem,
  unMiembro,
  unProyecto,
  unSprint,
  unaEpica,
  unaHistoria,
  unaPersona,
  unaTarea,
} from '../apoyo/constructores';

const HOY = '2026-08-26';

const ana = unaPersona({ id: 'ana', nombre: 'Ana García' });
const beto = unaPersona({ id: 'beto', nombre: 'Beto Ruiz' });
const caro = unaPersona({ id: 'caro', nombre: 'Caro Díaz', activa: false });

/** Documento base. Cada prueba lo ajusta con `conSprints` o construyendo el suyo. */
function documentoBase(): Documento {
  const t1 = unaTarea({ id: 'PRUEBA-T1', estado: 'iniciado', responsable: 'ana', fecha_limite: '2026-08-25' });
  const t2 = unaTarea({ id: 'PRUEBA-T2', estado: 'pendiente', responsable: 'ana', bloqueos: [unBloqueo()] });
  const t3 = unaTarea({ id: 'PRUEBA-T3', estado: 'done', responsable: 'ana' });
  const t4 = unaTarea({ id: 'PRUEBA-T4', estado: 'pendiente', responsable: 'ana' });
  const t5 = unaTarea({ id: 'PRUEBA-T5', estado: 'cancelada', responsable: 'ana' });
  const t6 = unaTarea({ id: 'PRUEBA-T6', estado: 'done', responsable: 'ana' });
  const o1 = unaTarea({ id: 'OTRO-T1', clave: 'OTRO', estado: 'pendiente', responsable: 'ana' });
  const o2 = unaTarea({ id: 'OTRO-T2', clave: 'OTRO', estado: 'pendiente', responsable: 'beto' });

  return unDocumento({
    personas: [ana, beto, caro],
    proyectos: [
      unProyecto({
        clave: 'PRUEBA',
        nombre: 'Proyecto de prueba',
        equipo: [unMiembro('ana', 'backend'), unMiembro('beto', null)],
        epicas: [
          unaEpica({
            id: 'PRUEBA-E1',
            historias: [unaHistoria({ id: 'PRUEBA-H1', tareas: [t1, t2, t3, t4, t5, t6] })],
          }),
        ],
      }),
      unProyecto({
        clave: 'OTRO',
        nombre: 'Otro proyecto',
        equipo: [unMiembro('ana', 'vistas')],
        epicas: [unaEpica({ id: 'OTRO-E1', historias: [unaHistoria({ id: 'OTRO-H1', tareas: [o1, o2] })] })],
      }),
    ],
    sprints: [
      unSprint({
        id: 'S-ACTIVO',
        estado: 'activo',
        inicio: '2026-08-24',
        fin: '2026-08-30',
        items: [unItem('PRUEBA-T1'), unItem('PRUEBA-T2'), unItem('PRUEBA-T3'), unItem('OTRO-T1')],
      }),
    ],
  });
}

describe('el documento de prueba es válido: si no, las pruebas medirían un documento imposible', () => {
  it('valida contra el esquema', () => {
    const resultado = validarDocumento(documentoBase());
    expect(resultado.ok ? [] : resultado.problemas).toEqual([]);
  });
});

// --- equipos ----------------------------------------------------------------

describe('equiposDe', () => {
  it('devuelve todos los proyectos en los que está, con su rol', () => {
    expect(equiposDe(documentoBase(), 'ana')).toEqual([
      { clave: 'PRUEBA', nombre: 'Proyecto de prueba', responsabilidades: ['backend'], capacidad: null },
      { clave: 'OTRO', nombre: 'Otro proyecto', responsabilidades: ['vistas'], capacidad: null },
    ]);
  });

  it('conserva el rol nulo en vez de inventarle uno', () => {
    expect(equiposDe(documentoBase(), 'beto')).toEqual([
      { clave: 'PRUEBA', nombre: 'Proyecto de prueba', responsabilidades: [], capacidad: null },
    ]);
  });

  it('quien no está en ningún equipo devuelve lista vacía', () => {
    expect(equiposDe(documentoBase(), 'caro')).toEqual([]);
  });

  it('una persona inexistente devuelve lista vacía, no revienta', () => {
    expect(equiposDe(documentoBase(), 'nadie')).toEqual([]);
  });
});

// --- carga en el sprint activo ----------------------------------------------

describe('cargaDe: qué se le comprometió en el sprint activo', () => {
  it('una persona que no existe devuelve null, no una carga en ceros', () => {
    expect(cargaDe(documentoBase(), 'nadie', HOY)).toBeNull();
  });

  it('cuenta total, abiertas, hechas, bloqueadas y vencidas por separado', () => {
    const carga = cargaDe(documentoBase(), 'ana', HOY);
    expect(carga?.enSprint).toMatchObject({
      total: 4,
      abiertas: 3,
      hechas: 1,
      bloqueadas: 1,
      vencidas: 1,
    });
  });

  it('sin sprint activo la carga del sprint queda en ceros y la cola sigue contando', () => {
    const doc = unDocumento({ ...documentoBase(), sprints: [] });
    const carga = cargaDe(doc, 'ana', HOY);
    expect(carga?.enSprint.total).toBe(0);
    expect(carga?.enSprint.proyectosDistintos).toBe(0);
    expect(carga?.abiertasFueraDelSprint).toBe(4);
  });

  it('la cola son las abiertas que NO están en el sprint activo', () => {
    // Ana tiene abiertas T1, T2, T4 y OTRO-T1; T1, T2 y OTRO-T1 están comprometidas.
    expect(cargaDe(documentoBase(), 'ana', HOY)?.abiertasFueraDelSprint).toBe(1);
  });

  it('las hechas y las canceladas no engordan la cola', () => {
    const doc = unDocumento({ ...documentoBase(), sprints: [] });
    const carga = cargaDe(doc, 'ana', HOY);
    // De las seis de PRUEBA más OTRO-T1: dos hechas y una cancelada quedan fuera.
    expect(carga?.abiertasFueraDelSprint).toBe(4);
  });

  it('el responsable del item manda: reasignar en el sprint mueve la carga', () => {
    const base = documentoBase();
    const doc = unDocumento({
      ...base,
      sprints: [unSprint({ ...base.sprints[0], items: [unItem('PRUEBA-T1', { responsable: 'beto' })] })],
    });
    expect(cargaDe(doc, 'beto', HOY)?.enSprint.total).toBe(1);
    expect(cargaDe(doc, 'ana', HOY)?.enSprint.total).toBe(0);
  });

  it('una tarea reasignada en el sprint no se le devuelve al dueño original por la cola', () => {
    const base = documentoBase();
    const doc = unDocumento({
      ...base,
      sprints: [unSprint({ ...base.sprints[0], items: [unItem('PRUEBA-T1', { responsable: 'beto' })] })],
    });
    const deAna = cargaDe(doc, 'ana', HOY);
    // T1 no está ni en su sprint ni en su cola: está comprometida y es de Beto.
    expect(deAna?.enSprint.total).toBe(0);
    expect(deAna?.abiertasFueraDelSprint).toBe(3);
  });

  it('un item que apunta a una tarea inexistente se ignora en vez de tumbar la vista', () => {
    const base = documentoBase();
    const doc = unDocumento({
      ...base,
      sprints: [
        unSprint({
          ...base.sprints[0],
          items: [unItem('PRUEBA-T1'), unItem('PRUEBA-T404', { responsable: 'ana' })],
        }),
      ],
    });
    expect(cargaDe(doc, 'ana', HOY)?.enSprint.total).toBe(1);
  });

  it('porProyecto se ordena por carga descendente', () => {
    const carga = cargaDe(documentoBase(), 'ana', HOY);
    expect(carga?.enSprint.porProyecto.map((f) => f.clave)).toEqual(['PRUEBA', 'OTRO']);
    expect(carga?.enSprint.porProyecto[0]).toMatchObject({ total: 3, abiertas: 2 });
  });

  it('la dispersión solo cuenta proyectos donde aún queda algo abierto', () => {
    const base = documentoBase();
    // En OTRO ya no queda nada abierto comprometido: solo una hecha.
    const doc = unDocumento({
      ...base,
      proyectos: base.proyectos.map((p) =>
        p.clave !== 'OTRO'
          ? p
          : unProyecto({
              ...p,
              epicas: [
                unaEpica({
                  id: 'OTRO-E1',
                  historias: [
                    unaHistoria({
                      id: 'OTRO-H1',
                      tareas: [unaTarea({ id: 'OTRO-T1', clave: 'OTRO', estado: 'done', responsable: 'ana' })],
                    }),
                  ],
                }),
              ],
            }),
      ),
    });
    expect(cargaDe(doc, 'ana', HOY)?.enSprint.proyectosDistintos).toBe(1);
    expect(cargaDe(doc, 'ana', HOY)?.enSprint.porProyecto).toHaveLength(2);
  });

  it('una cancelada comprometida engorda el total del sprint aunque no sea trabajo', () => {
    // Queda pinchado a propósito: `total` no es un denominador de porcentaje, pero es el
    // número que ordena los proyectos de la persona. Ver el reporte de E4.
    const base = documentoBase();
    const doc = unDocumento({
      ...base,
      sprints: [unSprint({ ...base.sprints[0], items: [unItem('PRUEBA-T5')] })],
    });
    const carga = cargaDe(doc, 'ana', HOY);
    expect(carga?.enSprint.total).toBe(1);
    expect(carga?.enSprint.abiertas).toBe(0);
    expect(carga?.enSprint.hechas).toBe(0);
  });

  it('la fecha límite comprometida en el sprint cuenta como vencida', () => {
    // El item manda sobre la tarea (`compromisoEfectivo`), y `cargaDe` ya lo respeta para
    // el responsable. Para la fecha no: lee `tarea.fecha_limite` directamente, así que un
    // compromiso vencido del sprint no aparece en la carga de nadie.
    const doc = unDocumento({
      personas: [ana],
      proyectos: [
        unProyecto({
          clave: 'PRUEBA',
          epicas: [
            unaEpica({
              historias: [
                unaHistoria({
                  tareas: [
                    unaTarea({ id: 'PRUEBA-T1', estado: 'iniciado', responsable: 'ana', fecha_limite: null }),
                  ],
                }),
              ],
            }),
          ],
        }),
      ],
      sprints: [
        unSprint({
          estado: 'activo',
          items: [unItem('PRUEBA-T1', { fecha_limite: '2026-08-20' })],
        }),
      ],
    });
    expect(cargaDe(doc, 'ana', HOY)?.enSprint.vencidas).toBe(1);
  });

  it('trae los equipos y el nombre de la persona, no solo su id', () => {
    const carga = cargaDe(documentoBase(), 'ana', HOY);
    expect(carga).toMatchObject({ personaId: 'ana', nombre: 'Ana García', activa: true });
    expect(carga?.equipos).toHaveLength(2);
  });
});

describe('cargaPorPersona', () => {
  it('respeta el orden en que están declaradas las personas', () => {
    expect(cargaPorPersona(documentoBase(), HOY).map((c) => c.personaId)).toEqual(['ana', 'beto', 'caro']);
  });

  it('incluye a las inactivas: siguen apareciendo en tareas históricas', () => {
    const inactiva = cargaPorPersona(documentoBase(), HOY).find((c) => c.personaId === 'caro');
    expect(inactiva?.activa).toBe(false);
    expect(inactiva?.enSprint.total).toBe(0);
  });

  it('un documento sin personas da lista vacía', () => {
    expect(cargaPorPersona(unDocumento(), HOY)).toEqual([]);
  });
});

// --- historial --------------------------------------------------------------

/** Sprints cerrados a la medida para el historial. */
function conCerrados(...definiciones: { id: string; inicio: string; items: [string, string | null, string | null][] }[]) {
  const t = (id: string) => unaTarea({ id, estado: 'done', responsable: 'ana' });
  const ids = new Set<string>();
  for (const d of definiciones) for (const [id] of d.items) ids.add(id);

  return unDocumento({
    personas: [ana, beto],
    proyectos: [
      unProyecto({
        clave: 'PRUEBA',
        epicas: [unaEpica({ historias: [unaHistoria({ tareas: [...ids].map(t) })] })],
      }),
    ],
    sprints: definiciones.map((d) =>
      unSprint({
        id: d.id,
        estado: 'cerrado',
        inicio: d.inicio,
        fin: d.inicio,
        items: d.items.map(([tareaId, desenlace, responsable]) =>
          unItem(tareaId, { desenlace: desenlace as never, responsable }),
        ),
      }),
    ),
  });
}

describe('historialDe', () => {
  it('el umbral de la mediana son 3 sprints', () => {
    expect(MINIMO_SPRINTS_PARA_MEDIANA).toBe(3);
  });

  it('sin sprints cerrados no hay historial ni mediana', () => {
    expect(historialDe(documentoBase(), 'ana')).toEqual({ porSprint: [], medianaCerradas: null });
  });

  it('cuenta solo los items con desenlace "completada"', () => {
    const doc = conCerrados({
      id: 'S-1',
      inicio: '2026-06-01',
      items: [
        ['PRUEBA-T1', 'completada', null],
        ['PRUEBA-T2', 'no_terminada', null],
        ['PRUEBA-T3', 'cancelada', null],
      ],
    });
    expect(historialDe(doc, 'ana').porSprint[0]?.cerradas).toBe(1);
  });

  it('un sprint cerrado sin ningún desenlace se descarta en vez de contarse como cero', () => {
    const doc = conCerrados(
      { id: 'S-SIN-DATOS', inicio: '2026-05-01', items: [['PRUEBA-T1', null, null]] },
      { id: 'S-CON-DATOS', inicio: '2026-06-01', items: [['PRUEBA-T2', 'completada', null]] },
    );
    expect(historialDe(doc, 'ana').porSprint.map((s) => s.sprintId)).toEqual(['S-CON-DATOS']);
  });

  it('el desenlace congelado manda sobre el estado de hoy: reabrir una tarea no reescribe marzo', () => {
    const doc = conCerrados({
      id: 'S-1',
      inicio: '2026-06-01',
      items: [['PRUEBA-T1', 'completada', null]],
    });
    // La tarea se reabre hoy; lo que cerró en aquel sprint no cambia.
    const conTareaReabierta = unDocumento({
      ...doc,
      proyectos: [
        unProyecto({
          clave: 'PRUEBA',
          epicas: [
            unaEpica({
              historias: [
                unaHistoria({ tareas: [unaTarea({ id: 'PRUEBA-T1', estado: 'iniciado', responsable: 'ana' })] }),
              ],
            }),
          ],
        }),
      ],
    });
    expect(historialDe(conTareaReabierta, 'ana').porSprint[0]?.cerradas).toBe(1);
  });

  it('el responsable del item manda sobre el de la tarea también en el historial', () => {
    const doc = conCerrados({
      id: 'S-1',
      inicio: '2026-06-01',
      items: [['PRUEBA-T1', 'completada', 'beto']],
    });
    expect(historialDe(doc, 'beto').porSprint[0]?.cerradas).toBe(1);
    expect(historialDe(doc, 'ana').porSprint[0]?.cerradas).toBe(0);
  });

  it('con dos sprints con datos la mediana sigue siendo null: dos puntos no son una serie', () => {
    const doc = conCerrados(
      { id: 'S-1', inicio: '2026-06-01', items: [['PRUEBA-T1', 'completada', null]] },
      { id: 'S-2', inicio: '2026-06-15', items: [['PRUEBA-T2', 'completada', null]] },
    );
    expect(historialDe(doc, 'ana').porSprint).toHaveLength(2);
    expect(historialDe(doc, 'ana').medianaCerradas).toBeNull();
  });

  it('con tres sprints con datos ya hay mediana', () => {
    const doc = conCerrados(
      { id: 'S-1', inicio: '2026-06-01', items: [['PRUEBA-T1', 'completada', null]] },
      {
        id: 'S-2',
        inicio: '2026-06-15',
        items: [
          ['PRUEBA-T2', 'completada', null],
          ['PRUEBA-T3', 'completada', null],
        ],
      },
      { id: 'S-3', inicio: '2026-07-01', items: [['PRUEBA-T4', 'no_terminada', null]] },
    );
    // Cerradas por sprint: 1, 2, 0 -> mediana 1.
    expect(historialDe(doc, 'ana').medianaCerradas).toBe(1);
  });

  it('los sprints salen del más viejo al más nuevo aunque el documento los tenga al revés', () => {
    const doc = conCerrados(
      { id: 'S-NUEVO', inicio: '2026-07-01', items: [['PRUEBA-T1', 'completada', null]] },
      { id: 'S-VIEJO', inicio: '2026-05-01', items: [['PRUEBA-T2', 'completada', null]] },
    );
    expect(historialDe(doc, 'ana').porSprint.map((s) => s.sprintId)).toEqual(['S-VIEJO', 'S-NUEVO']);
  });

  it('quien no cerró nada aparece con cero, no ausente: el cero es el dato', () => {
    const doc = conCerrados({
      id: 'S-1',
      inicio: '2026-06-01',
      items: [['PRUEBA-T1', 'completada', null]],
    });
    expect(historialDe(doc, 'beto').porSprint[0]?.cerradas).toBe(0);
  });
});

// --- dispersión del sprint --------------------------------------------------

describe('dispersionDelSprint', () => {
  it('sin sprint es 0', () => {
    expect(dispersionDelSprint(documentoBase(), undefined)).toBe(0);
  });

  it('un sprint sin items es 0', () => {
    expect(dispersionDelSprint(documentoBase(), unSprint({ items: [] }))).toBe(0);
  });

  it('cuenta proyectos distintos, no items', () => {
    const doc = documentoBase();
    expect(dispersionDelSprint(doc, sprintActivo(doc))).toBe(2);
  });

  it('tres tareas del mismo proyecto siguen siendo un solo proyecto', () => {
    const doc = documentoBase();
    const sprint = unSprint({ items: [unItem('PRUEBA-T1'), unItem('PRUEBA-T2'), unItem('PRUEBA-T3')] });
    expect(dispersionDelSprint(doc, sprint)).toBe(1);
  });

  it('los items que apuntan a tareas inexistentes no inventan proyectos', () => {
    const doc = documentoBase();
    expect(dispersionDelSprint(doc, unSprint({ items: [unItem('PRUEBA-T404')] }))).toBe(0);
  });
});

// --- conformación de equipos ------------------------------------------------

describe('conformacionDeEquipos', () => {
  it('resuelve el nombre de cada miembro y cuenta sus tareas abiertas en ese proyecto', () => {
    const equipos = conformacionDeEquipos(documentoBase());
    expect(equipos[0]?.miembros).toEqual([
      { personaId: 'ana', nombre: 'Ana García', responsabilidades: ['backend'], capacidad: null, abiertas: 3 },
      { personaId: 'beto', nombre: 'Beto Ruiz', responsabilidades: [], capacidad: null, abiertas: 0 },
    ]);
  });

  it('las hechas y las canceladas no cuentan como carga abierta del equipo', () => {
    // Ana tiene 6 tareas en PRUEBA: 3 abiertas, 2 hechas y 1 cancelada.
    expect(conformacionDeEquipos(documentoBase())[0]?.miembros[0]?.abiertas).toBe(3);
  });

  it('quien tiene trabajo abierto y no está en el equipo sale en sinRegistrar', () => {
    const base = documentoBase();
    const doc = unDocumento({
      ...base,
      proyectos: base.proyectos.map((p) =>
        p.clave !== 'OTRO' ? p : unProyecto({ ...p, equipo: [] }),
      ),
    });
    const otro = conformacionDeEquipos(doc).find((e) => e.clave === 'OTRO');
    expect(otro?.miembros).toEqual([]);
    expect(otro?.sinRegistrar).toEqual([
      { personaId: 'ana', nombre: 'Ana García', abiertas: 1 },
      { personaId: 'beto', nombre: 'Beto Ruiz', abiertas: 1 },
    ]);
  });

  it('un responsable que no está en personas cae a su id en vez de quedar en blanco', () => {
    const doc = unDocumento({
      personas: [],
      proyectos: [
        unProyecto({
          clave: 'PRUEBA',
          epicas: [
            unaEpica({ historias: [unaHistoria({ tareas: [unaTarea({ responsable: 'fantasma' })] })] }),
          ],
        }),
      ],
    });
    expect(conformacionDeEquipos(doc)[0]?.sinRegistrar).toEqual([
      { personaId: 'fantasma', nombre: 'fantasma', abiertas: 1 },
    ]);
  });

  it('las tareas sin responsable no generan una fila fantasma', () => {
    const doc = unDocumento({
      proyectos: [
        unProyecto({
          clave: 'PRUEBA',
          epicas: [unaEpica({ historias: [unaHistoria({ tareas: [unaTarea({ responsable: null })] })] })],
        }),
      ],
    });
    expect(conformacionDeEquipos(doc)[0]?.sinRegistrar).toEqual([]);
  });

  it('un proyecto sin equipo ni tareas sale con las dos listas vacías', () => {
    const doc = unDocumento({ proyectos: [unProyecto({ clave: 'VACIO' })] });
    expect(conformacionDeEquipos(doc)[0]).toMatchObject({ miembros: [], sinRegistrar: [] });
  });

  it('devuelve un renglón por proyecto, en el orden del documento', () => {
    expect(conformacionDeEquipos(documentoBase()).map((e) => e.clave)).toEqual(['PRUEBA', 'OTRO']);
  });
});
