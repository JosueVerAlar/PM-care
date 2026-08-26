/**
 * Lo que se le añadió a `carga.ts` para las vistas de Carga y Equipos: `RepartoAbierto`,
 * `cargaSinAsignar`, `ordenarCargas`, `cargaMaxima`, `personasEnEquipos` y los nombres.
 *
 * Las pruebas de `carga.test.ts` cubren el sprint y el historial; aquí va la cola entera y
 * lo que se pinta a partir de ella. Dos cosas se vigilan por encima del resto:
 *
 *  1. El COMPROMISO vigente manda: una tarea reasignada dentro del sprint no puede seguir
 *     contando en la barra de quien ya no la tiene.
 *  2. Lo que no tiene responsable no desaparece: la suma de las personas más la fila sin
 *     asignar tiene que dar el total del documento y el total del sprint.
 */

import { describe, expect, it } from 'vitest';

import {
  cargaDe,
  cargaMaxima,
  cargaPorPersona,
  cargaSinAsignar,
  nombreDePersona,
  nombresDePersonas,
  ordenarCargas,
  personasEnEquipos,
  type CargaPersona,
} from '../../src/compartido/dominio/carga';
import { estaAbierta, todasLasTareas } from '../../src/compartido/dominio/clasificar';
import { validarDocumento } from '../../src/compartido/modelo/esquema';
import type { Documento, Tarea } from '../../src/compartido/modelo/tipos';
import {
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
const dora = unaPersona({ id: 'dora', nombre: 'Dora Luna' });

function proyectoCon(clave: string, nombre: string, tareas: Tarea[], equipo: string[] = []) {
  return unProyecto({
    clave,
    nombre,
    equipo: equipo.map((id) => unMiembro(id)),
    epicas: [unaEpica({ clave, historias: [unaHistoria({ clave, tareas })] })],
  });
}

/**
 * Ana carga 4 repartidas en dos proyectos; Beto 5 concentradas en uno. Es la forma que
 * separa el orden por total del orden por dispersión: si los dos criterios dieran la
 * misma lista, la prueba no distinguiría uno del otro.
 *
 * `BETA-T2` está en el sprint reasignada de Beto a Ana: es el caso del compromiso.
 */
function documentoCarga(): Documento {
  const alfa: Tarea[] = [
    unaTarea({ id: 'ALFA-T1', clave: 'ALFA', estado: 'pendiente', responsable: 'ana' }),
    unaTarea({ id: 'ALFA-T2', clave: 'ALFA', estado: 'en_curso', responsable: 'ana' }),
    unaTarea({ id: 'ALFA-T3', clave: 'ALFA', estado: 'hecha', responsable: 'ana' }),
    unaTarea({ id: 'ALFA-T4', clave: 'ALFA', estado: 'pendiente', responsable: null }),
    unaTarea({ id: 'ALFA-T5', clave: 'ALFA', estado: 'cancelada', responsable: 'ana' }),
  ];
  const beta: Tarea[] = [
    unaTarea({ id: 'BETA-T1', clave: 'BETA', estado: 'pendiente', responsable: 'ana' }),
    unaTarea({ id: 'BETA-T2', clave: 'BETA', estado: 'pendiente', responsable: 'beto' }),
    unaTarea({ id: 'BETA-T3', clave: 'BETA', estado: 'pendiente', responsable: null }),
  ];
  const gama: Tarea[] = [
    unaTarea({ id: 'GAMA-T1', clave: 'GAMA', estado: 'en_curso', responsable: 'caro' }),
    ...[2, 3, 4, 5, 6].map((n) =>
      unaTarea({ id: `GAMA-T${n}`, clave: 'GAMA', estado: 'pendiente', responsable: 'beto' }),
    ),
  ];

  return unDocumento({
    personas: [ana, beto, caro, dora],
    proyectos: [
      proyectoCon('ALFA', 'Alfa', alfa, ['ana', 'beto']),
      proyectoCon('BETA', 'Beta', beta, ['ana']),
      proyectoCon('GAMA', 'Gama', gama, ['beto', 'caro']),
    ],
    sprints: [
      unSprint({
        id: 'S-ACT',
        nombre: 'Sprint en curso',
        estado: 'activo',
        items: [
          unItem('ALFA-T1'),
          unItem('BETA-T2', { responsable: 'ana' }),
          unItem('ALFA-T4'),
          unItem('GAMA-T1'),
        ],
      }),
    ],
  });
}

function cargaDeQuien(doc: Documento, id: string) {
  const carga = cargaDe(doc, id, HOY);
  if (!carga) throw new Error(`el fixture debería traer a ${id}`);
  return carga;
}

describe('el documento de prueba es válido: si no, las pruebas medirían un documento imposible', () => {
  it('valida contra el esquema', () => {
    const resultado = validarDocumento(documentoCarga());
    expect(resultado.ok ? [] : resultado.problemas).toEqual([]);
  });
});

describe('RepartoAbierto: la cola entera, dentro y fuera del sprint', () => {
  it('cuenta todo lo abierto de la persona, esté o no comprometido', () => {
    const doc = documentoCarga();
    expect(cargaDeQuien(doc, 'ana').abiertas.total).toBe(4);
    expect(cargaDeQuien(doc, 'ana').enSprint.total).toBe(2);
    expect(cargaDeQuien(doc, 'ana').abiertasFueraDelSprint).toBe(2);
  });

  it('las hechas y las canceladas no engordan la cola', () => {
    const abiertas = cargaDeQuien(documentoCarga(), 'ana').abiertas;
    const ids = abiertas.porProyecto.map((p) => p.clave);
    expect(abiertas.total).toBe(4);
    expect(ids).toEqual(['ALFA', 'BETA']);
  });

  it('una tarea reasignada dentro del sprint deja de contar en la barra de quien ya no la tiene', () => {
    // BETA-T2 es de Beto en el árbol y el item la comprometió con Ana. Si el reparto
    // leyera `tarea.responsable`, Beto seguiría cargando una tarea que no es suya.
    const doc = documentoCarga();
    const deBeto = cargaDeQuien(doc, 'beto').abiertas;
    expect(deBeto.total).toBe(5);
    expect(deBeto.porProyecto.map((p) => p.clave)).toEqual(['GAMA']);
    expect(deBeto.proyectosDistintos).toBe(1);
  });

  it('y sí cuenta en la del nuevo responsable, con su proyecto', () => {
    const deAna = cargaDeQuien(documentoCarga(), 'ana').abiertas;
    expect(deAna.porProyecto).toEqual([
      { clave: 'ALFA', nombre: 'Alfa', abiertas: 2 },
      { clave: 'BETA', nombre: 'Beta', abiertas: 2 },
    ]);
  });

  it('un item sin responsable propio hereda el de la tarea: no la deja huérfana', () => {
    const doc = documentoCarga();
    // ALFA-T1 va en el sprint sin responsable en el item y sigue siendo de Ana.
    const ids = cargaDeQuien(doc, 'ana').abiertas.porProyecto;
    expect(ids.find((p) => p.clave === 'ALFA')?.abiertas).toBe(2);
    expect(cargaSinAsignar(doc, HOY).abiertas.porProyecto.find((p) => p.clave === 'ALFA')?.abiertas).toBe(1);
  });

  it('porProyecto va de mayor a menor y desempata por clave para no bailar entre renders', () => {
    const doc = documentoCarga();
    const primera = cargaDeQuien(doc, 'ana').abiertas.porProyecto.map((p) => p.clave);
    const segunda = cargaDeQuien(doc, 'ana').abiertas.porProyecto.map((p) => p.clave);
    expect(primera).toEqual(['ALFA', 'BETA']);
    expect(segunda).toEqual(primera);
  });

  it('quien no tiene nada abierto tiene total 0, lista vacía y dispersión 0, nunca NaN', () => {
    const vacia = cargaDeQuien(documentoCarga(), 'dora').abiertas;
    expect(vacia).toEqual({ total: 0, porProyecto: [], proyectosDistintos: 0 });
  });

  it('la dispersión es cuántos proyectos distintos tocan sus tareas abiertas', () => {
    const doc = documentoCarga();
    expect(cargaDeQuien(doc, 'ana').abiertas.proyectosDistintos).toBe(2);
    expect(cargaDeQuien(doc, 'caro').abiertas.proyectosDistintos).toBe(1);
  });

  it('el total del reparto es la suma de sus proyectos, siempre', () => {
    const doc = documentoCarga();
    for (const carga of cargaPorPersona(doc, HOY)) {
      const suma = carga.abiertas.porProyecto.reduce((acc, p) => acc + p.abiertas, 0);
      expect(suma, carga.personaId).toBe(carga.abiertas.total);
      expect(carga.abiertas.proyectosDistintos, carga.personaId).toBe(carga.abiertas.porProyecto.length);
    }
  });

  it('sin sprint activo la cola sigue completa: el sprint solo era su parte comprometida', () => {
    const base = documentoCarga();
    const doc = unDocumento({ ...base, sprints: [] });
    expect(cargaDeQuien(doc, 'ana').abiertas.total).toBe(3);
    expect(cargaDeQuien(doc, 'beto').abiertas.total).toBe(6);
    expect(cargaDeQuien(doc, 'ana').enSprint.total).toBe(0);
  });
});

describe('cargaSinAsignar: lo que no tiene dueño no desaparece', () => {
  it('junta las abiertas sin responsable de todo el documento', () => {
    const sin = cargaSinAsignar(documentoCarga(), HOY);
    expect(sin.abiertas.total).toBe(2);
    expect(sin.abiertas.porProyecto).toEqual([
      { clave: 'ALFA', nombre: 'Alfa', abiertas: 1 },
      { clave: 'BETA', nombre: 'Beta', abiertas: 1 },
    ]);
  });

  it('cuenta también su parte del sprint', () => {
    const sin = cargaSinAsignar(documentoCarga(), HOY);
    expect(sin.enSprint.total).toBe(1);
    expect(sin.enSprint.abiertas).toBe(1);
  });

  it('la suma de las personas más la fila sin asignar da TODAS las abiertas del documento', () => {
    const doc = documentoCarga();
    const abiertasDelDocumento = todasLasTareas(doc).filter((u) => estaAbierta(u.tarea)).length;
    const dePersonas = cargaPorPersona(doc, HOY).reduce((acc, c) => acc + c.abiertas.total, 0);
    expect(dePersonas + cargaSinAsignar(doc, HOY).abiertas.total).toBe(abiertasDelDocumento);
  });

  it('la suma de las personas más la fila sin asignar da TODOS los items del sprint', () => {
    const doc = documentoCarga();
    const items = doc.sprints.find((s) => s.estado === 'activo')?.items.length ?? 0;
    const dePersonas = cargaPorPersona(doc, HOY).reduce((acc, c) => acc + c.enSprint.total, 0);
    expect(dePersonas + cargaSinAsignar(doc, HOY).enSprint.total).toBe(items);
  });

  it('una tarea del sprint cuyo item no dice responsable pero la tarea sí, NO cae en sin asignar', () => {
    const sin = cargaSinAsignar(documentoCarga(), HOY);
    expect(sin.abiertas.porProyecto.find((p) => p.clave === 'ALFA')?.abiertas).toBe(1);
    expect(sin.abiertas.total).toBe(2);
  });

  it('sin nada suelto queda todo en ceros y sin NaN', () => {
    const doc = unDocumento({
      personas: [ana],
      proyectos: [
        proyectoCon('ALFA', 'Alfa', [
          unaTarea({ id: 'ALFA-T1', clave: 'ALFA', estado: 'pendiente', responsable: 'ana' }),
        ]),
      ],
    });
    expect(cargaSinAsignar(doc, HOY)).toEqual({
      abiertas: { total: 0, porProyecto: [], proyectosDistintos: 0 },
      enSprint: {
        total: 0,
        abiertas: 0,
        hechas: 0,
        bloqueadas: 0,
        vencidas: 0,
        porProyecto: [],
        proyectosDistintos: 0,
      },
    });
  });

  it('un documento vacío no revienta', () => {
    expect(cargaSinAsignar(unDocumento(), HOY).abiertas.total).toBe(0);
  });
});

describe('ordenarCargas', () => {
  const cargas = () => cargaPorPersona(documentoCarga(), HOY);

  it('por total pone arriba a quien más carga, aunque toque menos proyectos', () => {
    expect(ordenarCargas(cargas(), 'total').map((c) => c.personaId)).toEqual([
      'beto',
      'ana',
      'dora',
      'caro',
    ]);
  });

  it('por dispersión pone arriba a quien está más repartido, aunque cargue menos', () => {
    expect(ordenarCargas(cargas(), 'dispersion').map((c) => c.personaId)).toEqual([
      'ana',
      'beto',
      'dora',
      'caro',
    ]);
  });

  it('las inactivas caen al final aunque arrastren trabajo abierto', () => {
    const orden = ordenarCargas(cargas(), 'total');
    expect(orden.at(-1)?.personaId).toBe('caro');
    expect(orden.at(-1)?.abiertas.total).toBeGreaterThan(0);
  });

  it('no filtra a quien está en cero: «está libre» también es información', () => {
    expect(ordenarCargas(cargas(), 'total').map((c) => c.personaId)).toContain('dora');
  });

  it('no muta la lista que recibe', () => {
    const original = cargas();
    const antes = original.map((c) => c.personaId);
    ordenarCargas(original, 'total');
    expect(original.map((c) => c.personaId)).toEqual(antes);
  });

  it('dos personas empatadas se desempatan por nombre en español', () => {
    const doc = unDocumento({
      personas: [
        unaPersona({ id: 'zoe', nombre: 'Zoe' }),
        unaPersona({ id: 'alv', nombre: 'Álvaro' }),
        unaPersona({ id: 'ben', nombre: 'Ben' }),
      ],
    });
    expect(ordenarCargas(cargaPorPersona(doc, HOY), 'total').map((c) => c.nombre)).toEqual([
      'Álvaro',
      'Ben',
      'Zoe',
    ]);
  });

  it('una lista vacía sigue siendo una lista vacía', () => {
    expect(ordenarCargas([], 'total')).toEqual([]);
    expect(ordenarCargas([], 'dispersion')).toEqual([]);
  });
});

describe('cargaMaxima: el único referente de la barra', () => {
  it('es la carga abierta más alta de la lista', () => {
    expect(cargaMaxima(cargaPorPersona(documentoCarga(), HOY))).toBe(5);
  });

  it('con nadie cargando nada devuelve null: no hay proporción que dibujar', () => {
    const doc = unDocumento({ personas: [ana, beto] });
    expect(cargaMaxima(cargaPorPersona(doc, HOY))).toBeNull();
  });

  it('una lista vacía devuelve null, no 0', () => {
    expect(cargaMaxima([])).toBeNull();
  });

  it('mide la cola entera, no solo lo comprometido en el sprint', () => {
    const cargas = cargaPorPersona(documentoCarga(), HOY);
    const maximoEnSprint = Math.max(...cargas.map((c) => c.enSprint.total));
    expect(cargaMaxima(cargas)).toBeGreaterThan(maximoEnSprint);
  });

  it('cuenta también la fila sin asignar si se le pasa junto a las personas', () => {
    const doc = documentoCarga();
    // El mismo documento con todo sin responsable: las personas quedan en cero y toda la
    // carga vive en la fila sin asignar. Si la barra se midiera solo contra las personas,
    // el máximo sería null y no habría contra qué dibujar la única fila que tiene trabajo.
    const soloSueltas: Documento = {
      ...doc,
      proyectos: doc.proyectos.map((p) => ({
        ...p,
        epicas: p.epicas.map((e) => ({
          ...e,
          historias: e.historias.map((h) => ({
            ...h,
            tareas: h.tareas.map((t) => ({ ...t, responsable: null })),
          })),
        })),
      })),
      sprints: [],
    };
    const cargas: { abiertas: CargaPersona['abiertas'] }[] = [
      ...cargaPorPersona(soloSueltas, HOY),
      cargaSinAsignar(soloSueltas, HOY),
    ];
    expect(cargaMaxima(cargaPorPersona(soloSueltas, HOY))).toBeNull();
    expect(cargaMaxima(cargas)).toBe(12);
  });
});

describe('personasEnEquipos: la misma relación leída desde la persona', () => {
  it('trae los equipos de cada quien con su rol', () => {
    const doc = unDocumento({
      personas: [ana],
      proyectos: [
        unProyecto({ clave: 'ALFA', nombre: 'Alfa', equipo: [unMiembro('ana', 'backend')] }),
        unProyecto({ clave: 'BETA', nombre: 'Beta', equipo: [unMiembro('ana', null)] }),
      ],
    });
    expect(personasEnEquipos(doc)[0]?.equipos).toEqual([
      { clave: 'ALFA', nombre: 'Alfa', rol: 'backend' },
      { clave: 'BETA', nombre: 'Beta', rol: null },
    ]);
  });

  it('ordena por activas, luego por número de equipos, luego por carga y luego por nombre', () => {
    // Ana y Beto están en dos equipos cada uno; desempata la carga abierta (Beto, 5).
    expect(personasEnEquipos(documentoCarga()).map((p) => p.personaId)).toEqual([
      'beto',
      'ana',
      'dora',
      'caro',
    ]);
  });

  it('la carga que enseña es la del compromiso vigente, igual que la barra', () => {
    const porPersona = new Map(personasEnEquipos(documentoCarga()).map((p) => [p.personaId, p.abiertas]));
    expect(porPersona.get('ana')).toBe(4);
    expect(porPersona.get('beto')).toBe(5);
    expect(porPersona.get('dora')).toBe(0);
  });

  it('quien no está en ningún equipo aparece igual, con la lista vacía', () => {
    const suelta = personasEnEquipos(documentoCarga()).find((p) => p.personaId === 'dora');
    expect(suelta?.equipos).toEqual([]);
    expect(suelta?.activa).toBe(true);
  });

  it('las inactivas van al final aunque estén en más equipos', () => {
    const orden = personasEnEquipos(documentoCarga());
    expect(orden.at(-1)?.personaId).toBe('caro');
    expect(orden.at(-1)?.activa).toBe(false);
  });

  it('un documento sin personas da lista vacía', () => {
    expect(personasEnEquipos(unDocumento())).toEqual([]);
  });

  it('devuelve un renglón por persona, ni uno más', () => {
    const doc = documentoCarga();
    expect(personasEnEquipos(doc)).toHaveLength(doc.personas.length);
  });
});

describe('nombresDePersonas y nombreDePersona', () => {
  it('indexa id -> nombre', () => {
    const nombres = nombresDePersonas(documentoCarga());
    expect(nombres.get('ana')).toBe('Ana García');
    expect(nombres.size).toBe(4);
  });

  it('sin responsable devuelve null, no una raya ni una cadena vacía', () => {
    expect(nombreDePersona(nombresDePersonas(documentoCarga()), null)).toBeNull();
  });

  it('un id que no está en el catálogo se devuelve tal cual: esconderlo escondería la fila', () => {
    expect(nombreDePersona(nombresDePersonas(documentoCarga()), 'quien-se-fue')).toBe('quien-se-fue');
  });

  it('un documento sin personas da un índice vacío, no null', () => {
    expect(nombresDePersonas(unDocumento()).size).toBe(0);
  });
});
