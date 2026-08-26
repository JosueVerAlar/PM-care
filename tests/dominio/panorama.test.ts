/**
 * Panorama: las tarjetas de los once proyectos y los tres órdenes.
 *
 * Lo que se protege: que «no sé desde cuándo» nunca se convierta en «se movió hoy»
 * (`null`, jamás 0), que el orden sea un total —dos proyectos empatados no se intercambian
 * entre renders— y que nada se invente para un proyecto sin capturar.
 */

import { describe, expect, it } from 'vitest';

import {
  ORDEN_POR_OMISION,
  diasSinMovimiento,
  panorama,
  tarjetaDeProyecto,
  ultimoMovimiento,
  type OrdenPanorama,
} from '../../src/compartido/dominio/panorama';
import { validarDocumento } from '../../src/compartido/modelo/esquema';
import type { Documento, Proyecto, Tarea } from '../../src/compartido/modelo/tipos';
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

function proyectoCon(clave: string, nombre: string, tareas: Tarea[], over: Partial<Proyecto> = {}) {
  return unProyecto({
    clave,
    nombre,
    epicas: [unaEpica({ clave, historias: [unaHistoria({ clave, tareas })] })],
    ...over,
  });
}

/**
 * Cinco proyectos con formas distintas a propósito: uno atorado, uno quieto, uno fresco,
 * uno sin marcas de tiempo y uno sin capturar. Es el reparto que el orden tiene que
 * distinguir.
 */
function documentoPanorama(): Documento {
  const atorada = unaTarea({
    id: 'TRAB-T1',
    clave: 'TRAB',
    estado: 'en_curso',
    creada_en: '2026-08-01T09:00:00-06:00',
    bloqueos: [unBloqueo({ bloqueada_en: '2026-08-06T09:00:00-06:00' })],
  });
  const otraTrab = unaTarea({
    id: 'TRAB-T2',
    clave: 'TRAB',
    estado: 'pendiente',
    creada_en: '2026-08-02T09:00:00-06:00',
    fecha_limite: '2026-08-10',
    planeada: false,
  });
  const quieta = unaTarea({
    id: 'QUIE-T1',
    clave: 'QUIE',
    estado: 'pendiente',
    creada_en: '2026-06-01T09:00:00-06:00',
  });
  const fresca = unaTarea({
    id: 'FRES-T1',
    clave: 'FRES',
    estado: 'hecha',
    creada_en: '2026-08-01T09:00:00-06:00',
    hecha_en: '2026-08-25T18:00:00-06:00',
  });
  const muda = unaTarea({ id: 'MUDO-T1', clave: 'MUDO', estado: 'pendiente' });

  return unDocumento({
    proyectos: [
      proyectoCon('TRAB', 'Trabado', [atorada, otraTrab]),
      proyectoCon('QUIE', 'Quieto', [quieta]),
      proyectoCon('FRES', 'Fresco', [fresca]),
      proyectoCon('MUDO', 'Mudo', [muda]),
      unProyecto({ clave: 'VACI', nombre: 'Sin capturar', epicas: [] }),
      proyectoCon('ARCH', 'Archivado', [unaTarea({ id: 'ARCH-T1', clave: 'ARCH' })], { archivado: true }),
    ],
    sprints: [unSprint({ id: 'S-ACT', nombre: 'Sprint en curso', estado: 'activo', items: [unItem('TRAB-T1')] })],
  });
}

function proyectoDe(doc: Documento, clave: string): Proyecto {
  const proyecto = doc.proyectos.find((p) => p.clave === clave);
  if (!proyecto) throw new Error(`el fixture debería traer ${clave}`);
  return proyecto;
}

describe('el documento de prueba es válido: si no, las pruebas medirían un documento imposible', () => {
  it('valida contra el esquema', () => {
    const resultado = validarDocumento(documentoPanorama());
    expect(resultado.ok ? [] : resultado.problemas).toEqual([]);
  });
});

describe('ultimoMovimiento', () => {
  it('sin ninguna marca devuelve null, NUNCA 0: «no sé» y «se movió hoy» no son lo mismo', () => {
    const doc = documentoPanorama();
    const marca = ultimoMovimiento(proyectoDe(doc, 'MUDO'));
    expect(marca).toBeNull();
    expect(marca).not.toBe(0);
    expect(marca).not.toBe('');
  });

  it('un proyecto sin épicas tampoco inventa una marca', () => {
    expect(ultimoMovimiento(proyectoDe(documentoPanorama(), 'VACI'))).toBeNull();
  });

  it('toma la marca más reciente de todas las tareas, no la de la primera', () => {
    expect(ultimoMovimiento(proyectoDe(documentoPanorama(), 'TRAB'))).toBe('2026-08-06T09:00:00-06:00');
  });

  it('mira las cuatro clases de marca: creada, hecha, bloqueada y desbloqueada', () => {
    const base = { clave: 'UNO', estado: 'pendiente' as const };
    const casos: [string, Tarea, string][] = [
      ['creada', unaTarea({ ...base, creada_en: '2026-05-01T09:00:00-06:00' }), '2026-05-01T09:00:00-06:00'],
      [
        'hecha',
        unaTarea({ ...base, estado: 'hecha', creada_en: '2026-05-01T09:00:00-06:00', hecha_en: '2026-05-02T09:00:00-06:00' }),
        '2026-05-02T09:00:00-06:00',
      ],
      [
        'bloqueada',
        unaTarea({
          ...base,
          creada_en: '2026-05-01T09:00:00-06:00',
          bloqueos: [unBloqueo({ bloqueada_en: '2026-05-03T09:00:00-06:00' })],
        }),
        '2026-05-03T09:00:00-06:00',
      ],
      [
        'desbloqueada',
        unaTarea({
          ...base,
          creada_en: '2026-05-01T09:00:00-06:00',
          bloqueos: [
            unBloqueo({ bloqueada_en: '2026-05-03T09:00:00-06:00', desbloqueada_en: '2026-05-04T09:00:00-06:00' }),
          ],
        }),
        '2026-05-04T09:00:00-06:00',
      ],
    ];
    for (const [donde, tarea, esperado] of casos) {
      expect(ultimoMovimiento(proyectoCon('UNO', 'Uno', [tarea])), donde).toBe(esperado);
    }
  });
});

describe('diasSinMovimiento', () => {
  it('sin marcas devuelve null, no 0', () => {
    const dias = diasSinMovimiento(proyectoDe(documentoPanorama(), 'MUDO'), HOY);
    expect(dias).toBeNull();
    expect(dias).not.toBe(0);
  });

  it('cuenta los días desde la marca más reciente', () => {
    expect(diasSinMovimiento(proyectoDe(documentoPanorama(), 'QUIE'), HOY)).toBe(86);
    expect(diasSinMovimiento(proyectoDe(documentoPanorama(), 'FRES'), HOY)).toBe(1);
  });

  it('una marca de hoy da 0, que aquí sí significa «se movió hoy»', () => {
    const tarea = unaTarea({ clave: 'UNO', creada_en: `${HOY}T09:00:00-06:00` });
    expect(diasSinMovimiento(proyectoCon('UNO', 'Uno', [tarea]), HOY)).toBe(0);
  });

  it('una marca en el futuro se topa en 0 en vez de dar días negativos', () => {
    const tarea = unaTarea({ clave: 'UNO', creada_en: '2026-09-30T09:00:00-06:00' });
    expect(diasSinMovimiento(proyectoCon('UNO', 'Uno', [tarea]), HOY)).toBe(0);
  });
});

describe('tarjetaDeProyecto', () => {
  it('un proyecto sin épicas es «no sé nada de él», no un proyecto al 0 %', () => {
    const doc = documentoPanorama();
    const tarjeta = tarjetaDeProyecto(doc, proyectoDe(doc, 'VACI'), HOY);
    expect(tarjeta.capturado).toBe(false);
    expect(tarjeta.avance.pct).toBeNull();
    expect(tarjeta.avance.hojas).toBe(0);
    expect(tarjeta.quieto).toBeNull();
    expect(tarjeta.bloqueoMasViejo).toBeNull();
  });

  it('cuenta abiertas, bloqueadas, vencidas, emergentes y comprometidas por separado', () => {
    const doc = documentoPanorama();
    expect(tarjetaDeProyecto(doc, proyectoDe(doc, 'TRAB'), HOY)).toMatchObject({
      clave: 'TRAB',
      nombre: 'Trabado',
      abiertas: 2,
      bloqueadas: 1,
      vencidas: 1,
      noPlaneadasAbiertas: 1,
      enSprintActivo: 1,
      bloqueoMasViejo: 20,
      capturado: true,
    });
  });

  it('las canceladas no cuentan como abiertas', () => {
    const proyecto = proyectoCon('UNO', 'Uno', [
      unaTarea({ clave: 'UNO', estado: 'cancelada' }),
      unaTarea({ clave: 'UNO', estado: 'hecha' }),
    ]);
    const doc = unDocumento({ proyectos: [proyecto] });
    expect(tarjetaDeProyecto(doc, proyecto, HOY).abiertas).toBe(0);
  });

  it('bloqueoMasViejo es el máximo, no el del primer bloqueo que se encuentra', () => {
    const proyecto = proyectoCon('UNO', 'Uno', [
      unaTarea({ clave: 'UNO', bloqueos: [unBloqueo({ bloqueada_en: '2026-08-24T09:00:00-06:00' })] }),
      unaTarea({ clave: 'UNO', bloqueos: [unBloqueo({ bloqueada_en: '2026-08-01T09:00:00-06:00' })] }),
      unaTarea({ clave: 'UNO', bloqueos: [unBloqueo({ bloqueada_en: '2026-08-20T09:00:00-06:00' })] }),
    ]);
    const doc = unDocumento({ proyectos: [proyecto] });
    expect(tarjetaDeProyecto(doc, proyecto, HOY).bloqueoMasViejo).toBe(25);
  });

  it('sin bloqueos abiertos, bloqueoMasViejo es null y no 0', () => {
    const doc = documentoPanorama();
    const tarjeta = tarjetaDeProyecto(doc, proyectoDe(doc, 'QUIE'), HOY);
    expect(tarjeta.bloqueoMasViejo).toBeNull();
    expect(tarjeta.bloqueadas).toBe(0);
  });
});

describe('panorama: las tres formas de ordenar', () => {
  it('el orden por omisión es por atención requerida', () => {
    expect(ORDEN_POR_OMISION).toBe('atencion');
  });

  it('los archivados quedan fuera de todas las secciones y del total', () => {
    const p = panorama(documentoPanorama(), HOY, 'atencion');
    const todas = [...p.conBloqueos, ...p.sinBloqueos, ...p.sinCapturar];
    expect(todas.map((t) => t.clave)).not.toContain('ARCH');
    expect(p.total).toBe(5);
  });

  it('los proyectos sin capturar van a su propia sección, con cualquier orden', () => {
    for (const orden of ['atencion', 'quieto', 'nombre'] as OrdenPanorama[]) {
      const p = panorama(documentoPanorama(), HOY, orden);
      expect(p.sinCapturar.map((t) => t.clave), orden).toEqual(['VACI']);
      const listadas = [...p.conBloqueos, ...p.sinBloqueos, ...(p.unicaLista ?? [])];
      expect(listadas.map((t) => t.clave), orden).not.toContain('VACI');
    }
  });

  it('cada tarjeta aparece exactamente una vez, con cualquier orden', () => {
    for (const orden of ['atencion', 'quieto', 'nombre'] as OrdenPanorama[]) {
      const p = panorama(documentoPanorama(), HOY, orden);
      const claves = [...p.conBloqueos, ...p.sinBloqueos, ...(p.unicaLista ?? []), ...p.sinCapturar].map(
        (t) => t.clave,
      );
      expect(claves.length, orden).toBe(p.total);
      expect(new Set(claves).size, orden).toBe(p.total);
    }
  });

  it('por atención: primero lo bloqueado, y dentro por el bloqueo más viejo', () => {
    const p = panorama(documentoPanorama(), HOY, 'atencion');
    expect(p.conBloqueos.map((t) => t.clave)).toEqual(['TRAB']);
    expect(p.unicaLista).toBeNull();
  });

  it('por atención, lo no bloqueado va por días sin movimiento descendente', () => {
    const p = panorama(documentoPanorama(), HOY, 'atencion');
    expect(p.sinBloqueos.map((t) => t.clave)).toEqual(['QUIE', 'FRES', 'MUDO']);
  });

  it('quien no tiene marcas va al final del grupo: ni abandonado ni fresco, desconocido', () => {
    const p = panorama(documentoPanorama(), HOY, 'quieto');
    expect(p.unicaLista?.map((t) => t.clave)).toEqual(['QUIE', 'TRAB', 'FRES', 'MUDO']);
    expect(p.unicaLista?.at(-1)?.quieto).toBeNull();
  });

  it('con orden distinto de «atención» las dos secciones van vacías y todo viaja en unicaLista', () => {
    for (const orden of ['quieto', 'nombre'] as OrdenPanorama[]) {
      const p = panorama(documentoPanorama(), HOY, orden);
      expect(p.conBloqueos, orden).toEqual([]);
      expect(p.sinBloqueos, orden).toEqual([]);
      expect(p.unicaLista, orden).not.toBeNull();
    }
  });

  it('por nombre ordena en español, no por código de carácter', () => {
    const doc = unDocumento({
      proyectos: [
        proyectoCon('C', 'Zacatecas', [unaTarea({ clave: 'C' })]),
        proyectoCon('A', 'Ácatlán', [unaTarea({ clave: 'A' })]),
        proyectoCon('B', 'Bachillerato', [unaTarea({ clave: 'B' })]),
      ],
    });
    expect(panorama(doc, HOY, 'nombre').unicaLista?.map((t) => t.nombre)).toEqual([
      'Ácatlán',
      'Bachillerato',
      'Zacatecas',
    ]);
  });

  it('un documento sin proyectos no revienta y no inventa secciones', () => {
    expect(panorama(unDocumento(), HOY, 'atencion')).toEqual({
      conBloqueos: [],
      sinBloqueos: [],
      unicaLista: null,
      sinCapturar: [],
      total: 0,
    });
  });
});

describe('lo que este módulo NO defiende', () => {
  it('un proyecto TERMINADO con un bloqueo sin cerrar se queda en «atención requerida» para siempre', () => {
    // Caracterización, no aprobación. `estaBloqueada` no mira el estado de la tarea, así
    // que la tarjeta queda con «0 abiertas · 1 bloqueada» y el proyecto encabeza la vista
    // sin que quede nada que hacer en él. Va al reporte para que se decida.
    const proyecto = proyectoCon('FIN', 'Terminado', [
      unaTarea({
        clave: 'FIN',
        estado: 'hecha',
        hecha_en: '2026-08-25T18:00:00-06:00',
        bloqueos: [unBloqueo({ bloqueada_en: '2026-05-01T09:00:00-06:00' })],
      }),
    ]);
    const doc = unDocumento({ proyectos: [proyecto] });
    const tarjeta = tarjetaDeProyecto(doc, proyecto, HOY);
    expect(tarjeta.abiertas).toBe(0);
    expect(tarjeta.bloqueadas).toBe(1);
    expect(tarjeta.bloqueoMasViejo).toBe(117);
    expect(panorama(doc, HOY, 'atencion').conBloqueos.map((t) => t.clave)).toEqual(['FIN']);
  });
});

describe('los tres órdenes son estables: dos proyectos empatados no se intercambian entre renders', () => {
  /** Dos proyectos idénticos en todo lo que el orden mira, incluido el nombre. */
  function documentoEmpatado(): Documento {
    const marca = '2026-08-10T09:00:00-06:00';
    const gemelo = (clave: string) =>
      proyectoCon(clave, 'Mismo nombre', [
        unaTarea({ clave, estado: 'pendiente', creada_en: marca }),
      ]);
    return unDocumento({ proyectos: [gemelo('AAA'), gemelo('BBB'), gemelo('CCC')] });
  }

  it('llamar tres veces con el mismo documento da exactamente el mismo orden', () => {
    const doc = documentoEmpatado();
    for (const orden of ['atencion', 'quieto', 'nombre'] as OrdenPanorama[]) {
      const salidas = [1, 2, 3].map(() => {
        const p = panorama(doc, HOY, orden);
        return [...p.conBloqueos, ...p.sinBloqueos, ...(p.unicaLista ?? [])].map((t) => t.clave);
      });
      expect(salidas[1], orden).toEqual(salidas[0]);
      expect(salidas[2], orden).toEqual(salidas[0]);
    }
  });

  it('por quieto y por atención el orden no depende de cómo estén guardados: es un orden total', () => {
    const doc = documentoEmpatado();
    const alReves = unDocumento({ ...doc, proyectos: doc.proyectos.slice().reverse() });
    for (const orden of ['atencion', 'quieto'] as OrdenPanorama[]) {
      const claves = (d: Documento) => {
        const p = panorama(d, HOY, orden);
        return [...p.conBloqueos, ...p.sinBloqueos, ...(p.unicaLista ?? [])].map((t) => t.clave);
      };
      expect(claves(doc), orden).toEqual(['AAA', 'BBB', 'CCC']);
      expect(claves(alReves), orden).toEqual(['AAA', 'BBB', 'CCC']);
    }
  });

  it('por nombre, dos nombres iguales conservan el orden del documento (sort estable)', () => {
    // Es el único de los tres órdenes sin desempate propio: al empatar el nombre manda el
    // orden del archivo. Estable entre renders, pero no un orden total como los otros dos.
    const doc = documentoEmpatado();
    expect(panorama(doc, HOY, 'nombre').unicaLista?.map((t) => t.clave)).toEqual(['AAA', 'BBB', 'CCC']);
    const alReves = unDocumento({ ...doc, proyectos: doc.proyectos.slice().reverse() });
    expect(panorama(alReves, HOY, 'nombre').unicaLista?.map((t) => t.clave)).toEqual(['CCC', 'BBB', 'AAA']);
  });

  it('dos proyectos con el mismo bloqueo más viejo se desempatan por quieto y luego por clave', () => {
    const bloqueo = unBloqueo({ bloqueada_en: '2026-08-10T09:00:00-06:00' });
    const gemelo = (clave: string) =>
      proyectoCon(clave, 'Igual', [unaTarea({ clave, estado: 'en_curso', bloqueos: [bloqueo] })]);
    const doc = unDocumento({ proyectos: [gemelo('ZZZ'), gemelo('AAA')] });
    expect(panorama(doc, HOY, 'atencion').conBloqueos.map((t) => t.clave)).toEqual(['AAA', 'ZZZ']);
  });
});
