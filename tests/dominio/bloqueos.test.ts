/**
 * Vista global de Bloqueos.
 *
 * Lo que el módulo promete y aquí se protege: solo llega lo que tiene bloqueo VIGENTE, el
 * orden de las filas es por días detenido, y el de los GRUPOS por su fila más vieja —no
 * por su tamaño—, que es justo lo que hace que la vista sea un hallazgo y no una lista.
 */

import { describe, expect, it } from 'vitest';

import {
  CRITERIO_POR_OMISION,
  agruparBloqueos,
  filasDeBloqueos,
  resumenDeBloqueos,
} from '../../src/compartido/dominio/bloqueos';
import { validarDocumento } from '../../src/compartido/modelo/esquema';
import type { Documento, Tarea } from '../../src/compartido/modelo/tipos';
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

const HOY = '2026-08-26';

/** Un proyecto de una épica y una historia: aquí lo que importa son las tareas. */
function proyectoCon(clave: string, nombre: string, tareas: Tarea[]) {
  return unProyecto({
    clave,
    nombre,
    epicas: [unaEpica({ clave, historias: [unaHistoria({ clave, tareas })] })],
  });
}

/**
 * Cuatro bloqueos de `dependencia` de dos días contra UNO de `decision` de veintiuno.
 *
 * La forma está elegida a propósito: agrupar por tamaño pondría `dependencia` arriba, y
 * agrupar por antigüedad pone `decision`. Es el caso que separa las dos reglas.
 */
function documentoBloqueos(): Documento {
  const vieja = unaTarea({
    id: 'ALFA-T1',
    clave: 'ALFA',
    titulo: 'Elegir proveedor de firma',
    estado: 'en_curso',
    bloqueos: [
      unBloqueo({
        tipo: 'decision',
        motivo: 'Falta que dirección decida',
        bloqueada_en: '2026-08-05T09:00:00-06:00',
      }),
    ],
  });
  const nueva = unaTarea({
    id: 'ALFA-T2',
    clave: 'ALFA',
    estado: 'pendiente',
    planeada: false,
    bloqueos: [unBloqueo({ bloqueada_en: '2026-08-24T09:00:00-06:00' })],
  });
  const otraAlfa = unaTarea({
    id: 'ALFA-T3',
    clave: 'ALFA',
    bloqueos: [unBloqueo({ bloqueada_en: '2026-08-24T09:00:00-06:00' })],
  });
  const libre = unaTarea({ id: 'ALFA-T4', clave: 'ALFA' });
  const yaDesbloqueada = unaTarea({
    id: 'ALFA-T5',
    clave: 'ALFA',
    bloqueos: [
      unBloqueo({
        bloqueada_en: '2026-07-01T09:00:00-06:00',
        desbloqueada_en: '2026-07-02T09:00:00-06:00',
      }),
    ],
  });
  const beta1 = unaTarea({
    id: 'BETA-T1',
    clave: 'BETA',
    bloqueos: [unBloqueo({ bloqueada_en: '2026-08-24T09:00:00-06:00' })],
  });
  const beta2 = unaTarea({
    id: 'BETA-T2',
    clave: 'BETA',
    bloqueos: [unBloqueo({ bloqueada_en: '2026-08-24T09:00:00-06:00' })],
  });

  return unDocumento({
    proyectos: [
      proyectoCon('ALFA', 'Alfa', [vieja, nueva, otraAlfa, libre, yaDesbloqueada]),
      proyectoCon('BETA', 'Beta', [beta1, beta2]),
    ],
    sprints: [
      unSprint({
        id: 'S-ACTIVO',
        nombre: 'Sprint en curso',
        estado: 'activo',
        items: [unItem('ALFA-T1'), unItem('ALFA-T4')],
      }),
    ],
  });
}

describe('el documento de prueba es válido: si no, las pruebas medirían un documento imposible', () => {
  it('valida contra el esquema', () => {
    const resultado = validarDocumento(documentoBloqueos());
    expect(resultado.ok ? [] : resultado.problemas).toEqual([]);
  });
});

describe('filasDeBloqueos', () => {
  it('un documento sin nada bloqueado da lista vacía, no una fila fantasma', () => {
    const doc = unDocumento({ proyectos: [proyectoCon('ALFA', 'Alfa', [unaTarea({ clave: 'ALFA' })])] });
    expect(filasDeBloqueos(doc, HOY)).toEqual([]);
  });

  it('un documento vacío no revienta', () => {
    expect(filasDeBloqueos(unDocumento(), HOY)).toEqual([]);
  });

  it('solo llega lo que tiene bloqueo vigente: lo ya desbloqueado es historia', () => {
    const ids = filasDeBloqueos(documentoBloqueos(), HOY).map((f) => f.ubicacion.tarea.id);
    expect(ids).not.toContain('ALFA-T5');
    expect(ids).not.toContain('ALFA-T4');
    expect(ids).toHaveLength(5);
  });

  it('ordena por días detenido descendente', () => {
    const filas = filasDeBloqueos(documentoBloqueos(), HOY);
    expect(filas.map((f) => f.dias)).toEqual([21, 2, 2, 2, 2]);
  });

  it('desempata por id: dos bloqueos del mismo día no se reordenan solos entre renders', () => {
    const doc = documentoBloqueos();
    const primera = filasDeBloqueos(doc, HOY).map((f) => f.ubicacion.tarea.id);
    const segunda = filasDeBloqueos(doc, HOY).map((f) => f.ubicacion.tarea.id);
    expect(primera).toEqual(['ALFA-T1', 'ALFA-T2', 'ALFA-T3', 'BETA-T1', 'BETA-T2']);
    expect(segunda).toEqual(primera);
  });

  it('el bloqueo de la fila es el ABIERTO, no el primero de la lista histórica', () => {
    const tarea = unaTarea({
      id: 'ALFA-T9',
      clave: 'ALFA',
      bloqueos: [
        unBloqueo({
          tipo: 'externo',
          motivo: 'viejo y resuelto',
          bloqueada_en: '2026-01-01T09:00:00-06:00',
          desbloqueada_en: '2026-01-05T09:00:00-06:00',
        }),
        unBloqueo({ tipo: 'informacion', motivo: 'el vigente', bloqueada_en: '2026-08-20T09:00:00-06:00' }),
      ],
    });
    const doc = unDocumento({ proyectos: [proyectoCon('ALFA', 'Alfa', [tarea])] });
    const filas = filasDeBloqueos(doc, HOY);
    expect(filas.map((f) => f.bloqueo.motivo)).toEqual(['el vigente']);
    expect(filas.map((f) => f.dias)).toEqual([6]);
  });

  it('marca cuáles están comprometidas en el sprint activo y cuáles no', () => {
    const filas = filasDeBloqueos(documentoBloqueos(), HOY);
    expect(filas.filter((f) => f.enSprintActivo).map((f) => f.ubicacion.tarea.id)).toEqual(['ALFA-T1']);
  });

  it('sin sprint activo nada queda marcado como comprometido', () => {
    const doc = unDocumento({ ...documentoBloqueos(), sprints: [] });
    expect(filasDeBloqueos(doc, HOY).some((f) => f.enSprintActivo)).toBe(false);
  });

  it('la procedencia es un canal aparte del bloqueo: solo la emergente abierta lo lleva', () => {
    const filas = filasDeBloqueos(documentoBloqueos(), HOY);
    expect(filas.filter((f) => f.nuevo).map((f) => f.ubicacion.tarea.id)).toEqual(['ALFA-T2']);
  });

  it('una tarea bloqueada el mismo día lleva 0 días, y 0 no es null', () => {
    const tarea = unaTarea({
      clave: 'ALFA',
      bloqueos: [unBloqueo({ bloqueada_en: `${HOY}T09:00:00-06:00` })],
    });
    const doc = unDocumento({ proyectos: [proyectoCon('ALFA', 'Alfa', [tarea])] });
    expect(filasDeBloqueos(doc, HOY).map((f) => f.dias)).toEqual([0]);
  });

  it('una tarea hecha con el bloqueo sin cerrar sigue apareciendo: el bloqueo es ortogonal al estado', () => {
    // Documentado, no celebrado: `paraVistaBloqueos` no mira el estado. Si algún día se
    // decide que una hecha no debe salir, esta prueba es la que lo dice.
    const tarea = unaTarea({
      clave: 'ALFA',
      estado: 'hecha',
      bloqueos: [unBloqueo({ bloqueada_en: '2026-08-20T09:00:00-06:00' })],
    });
    const doc = unDocumento({ proyectos: [proyectoCon('ALFA', 'Alfa', [tarea])] });
    expect(filasDeBloqueos(doc, HOY)).toHaveLength(1);
  });
});

describe('agruparBloqueos', () => {
  it('el criterio por omisión es por tipo', () => {
    expect(CRITERIO_POR_OMISION).toBe('tipo');
  });

  it('un grupo se ordena por su fila MÁS VIEJA, no por cuántas filas tiene', () => {
    // Cuatro dependencias de dos días contra una decisión de veintiuno: por tamaño
    // ganaría `dependencia`, y esconder los 21 días es exactamente lo que no debe pasar.
    const grupos = agruparBloqueos(documentoBloqueos(), HOY, 'tipo');
    expect(grupos.map((g) => [g.id, g.filas.length, g.diasMaximo])).toEqual([
      ['decision', 1, 21],
      ['dependencia', 4, 2],
    ]);
  });

  it('diasMaximo de cada grupo es el de su fila más vieja', () => {
    const grupos = agruparBloqueos(documentoBloqueos(), HOY, 'tipo');
    for (const grupo of grupos) {
      expect(grupo.diasMaximo, grupo.id).toBe(Math.max(...grupo.filas.map((f) => f.dias)));
    }
  });

  it('dentro del grupo se conserva el orden por días de la lista global', () => {
    const doc = documentoBloqueos();
    const conDosViejas = unDocumento({
      ...doc,
      proyectos: [
        proyectoCon('ALFA', 'Alfa', [
          unaTarea({
            id: 'ALFA-T1',
            clave: 'ALFA',
            bloqueos: [unBloqueo({ bloqueada_en: '2026-08-24T09:00:00-06:00' })],
          }),
          unaTarea({
            id: 'ALFA-T2',
            clave: 'ALFA',
            bloqueos: [unBloqueo({ bloqueada_en: '2026-08-06T09:00:00-06:00' })],
          }),
        ]),
      ],
      sprints: [],
    });
    const grupos = agruparBloqueos(conDosViejas, HOY, 'tipo');
    expect(grupos.map((g) => g.filas.map((f) => f.dias))).toEqual([[20, 2]]);
  });

  it('por tipo, el grupo lleva el tipo y deja clave y nombre en null: la etiqueta la pone la vista', () => {
    const grupos = agruparBloqueos(documentoBloqueos(), HOY, 'tipo');
    expect(grupos.map((g) => ({ tipo: g.tipo, clave: g.clave, nombre: g.nombre }))).toEqual([
      { tipo: 'decision', clave: null, nombre: null },
      { tipo: 'dependencia', clave: null, nombre: null },
    ]);
  });

  it('por proyecto, el grupo lleva clave y nombre y deja el tipo en null', () => {
    const grupos = agruparBloqueos(documentoBloqueos(), HOY, 'proyecto');
    expect(grupos.map((g) => ({ id: g.id, tipo: g.tipo, clave: g.clave, nombre: g.nombre }))).toEqual([
      { id: 'ALFA', tipo: null, clave: 'ALFA', nombre: 'Alfa' },
      { id: 'BETA', tipo: null, clave: 'BETA', nombre: 'Beta' },
    ]);
  });

  it('agrupar no pierde ni duplica filas, se agrupe como se agrupe', () => {
    const doc = documentoBloqueos();
    const total = filasDeBloqueos(doc, HOY).length;
    for (const criterio of ['tipo', 'proyecto'] as const) {
      const grupos = agruparBloqueos(doc, HOY, criterio);
      const ids = grupos.flatMap((g) => g.filas.map((f) => f.ubicacion.tarea.id));
      expect(ids, criterio).toHaveLength(total);
      expect(new Set(ids).size, criterio).toBe(total);
    }
  });

  it('sin bloqueos no hay grupos vacíos: hay cero grupos', () => {
    const doc = unDocumento({ proyectos: [proyectoCon('ALFA', 'Alfa', [unaTarea({ clave: 'ALFA' })])] });
    expect(agruparBloqueos(doc, HOY, 'tipo')).toEqual([]);
    expect(agruparBloqueos(doc, HOY, 'proyecto')).toEqual([]);
  });

  it('dos grupos con la misma antigüedad se desempatan por id y no bailan entre renders', () => {
    const doc = unDocumento({
      proyectos: [
        proyectoCon('ZETA', 'Zeta', [
          unaTarea({
            clave: 'ZETA',
            bloqueos: [unBloqueo({ tipo: 'externo', bloqueada_en: '2026-08-20T09:00:00-06:00' })],
          }),
        ]),
        proyectoCon('ALFA', 'Alfa', [
          unaTarea({
            clave: 'ALFA',
            bloqueos: [unBloqueo({ tipo: 'decision', bloqueada_en: '2026-08-20T09:00:00-06:00' })],
          }),
        ]),
      ],
    });
    expect(agruparBloqueos(doc, HOY, 'tipo').map((g) => g.id)).toEqual(['decision', 'externo']);
    expect(agruparBloqueos(doc, HOY, 'proyecto').map((g) => g.id)).toEqual(['ALFA', 'ZETA']);
  });
});

describe('resumenDeBloqueos', () => {
  it('sin filas, diasMaximo es null: no es que lleven 0 días, es que no hay nada que contar', () => {
    expect(resumenDeBloqueos([])).toEqual({
      total: 0,
      diasMaximo: null,
      proyectos: 0,
      enSprintActivo: 0,
    });
  });

  it('cuenta total, máximo, proyectos distintos y comprometidos', () => {
    const filas = filasDeBloqueos(documentoBloqueos(), HOY);
    expect(resumenDeBloqueos(filas)).toEqual({
      total: 5,
      diasMaximo: 21,
      proyectos: 2,
      enSprintActivo: 1,
    });
  });

  it('cinco bloqueos en un solo proyecto no se leen como cinco proyectos con problemas', () => {
    const doc = unDocumento({
      proyectos: [
        proyectoCon(
          'ALFA',
          'Alfa',
          [1, 2, 3].map((n) =>
            unaTarea({
              id: `ALFA-T${n}`,
              clave: 'ALFA',
              bloqueos: [unBloqueo({ bloqueada_en: '2026-08-20T09:00:00-06:00' })],
            }),
          ),
        ),
      ],
    });
    const resumen = resumenDeBloqueos(filasDeBloqueos(doc, HOY));
    expect(resumen.total).toBe(3);
    expect(resumen.proyectos).toBe(1);
  });

  it('el máximo del resumen coincide con el del primer grupo, que es el de la fila más vieja', () => {
    const doc = documentoBloqueos();
    const resumen = resumenDeBloqueos(filasDeBloqueos(doc, HOY));
    const grupos = agruparBloqueos(doc, HOY, 'tipo');
    expect(resumen.diasMaximo).toBe(grupos[0]?.diasMaximo);
  });
});

describe('lo que este módulo NO defiende', () => {
  it('un bloqueo fechado en el futuro produce días NEGATIVOS', () => {
    // Caracterización, no aprobación: `diasSinMovimiento` del Panorama topa en 0 con
    // `Math.max` y esto no. Con una fecha escrita a mano en el futuro la vista dice
    // «-5 días detenido» y el bloqueo se hunde al final del orden. Va al reporte.
    const tarea = unaTarea({
      clave: 'ALFA',
      bloqueos: [unBloqueo({ bloqueada_en: '2026-08-31T09:00:00-06:00' })],
    });
    const doc = unDocumento({ proyectos: [proyectoCon('ALFA', 'Alfa', [tarea])] });
    const filas = filasDeBloqueos(doc, HOY);
    expect(filas.map((f) => f.dias)).toEqual([-5]);
    expect(resumenDeBloqueos(filas).diasMaximo).toBe(-5);
  });
});
