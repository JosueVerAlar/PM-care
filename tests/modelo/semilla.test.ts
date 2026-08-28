/**
 * `datos/semilla.json` — el arranque real: los 11 proyectos del Jira del usuario.
 *
 * No es un fixture de pruebas (ese es `datos/ejemplo.json`, congelado en el archivo de
 * oro). Es el documento con el que la app arranca de verdad, y por eso lo que se verifica
 * aquí es lo que dolería si estuviera mal: que **valide**, que las claves sean las de Jira
 * y no unas parecidas, y que las tres formas de colgar una tarea (N9) estén representadas
 * —porque justo esas son las que ningún caso escrito a mano cubría.
 */

import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { validarDocumento } from '../../src/compartido/modelo/esquema';
import { indexarTareas, tareasDe } from '../../src/compartido/dominio/derivar';
import {
  resoluciones,
  sumarEsfuerzo,
  tiempoPorPersona,
} from '../../src/compartido/dominio/duracion';

const crudo: unknown = JSON.parse(
  readFileSync(new URL('../../datos/semilla.json', import.meta.url), 'utf8'),
);

/** Las claves tal como están en `cecyteinformatica.atlassian.net`, leídas de la API. */
const CLAVES_JIRA = [
  'SICOE', 'SIES', 'PED', 'DW', 'IN', 'IDCE', 'INDICA', 'PULSO', 'REDOC', 'RENAC', 'SISEC',
];

describe('datos/semilla.json', () => {
  it('valida contra el esquema', () => {
    const resultado = validarDocumento(crudo);
    expect(resultado.ok ? [] : resultado.problemas).toEqual([]);
  });

  const doc = (() => {
    const resultado = validarDocumento(crudo);
    if (!resultado.ok) throw new Error('la semilla no valida');
    return resultado.documento;
  })();

  /**
   * La clave es inmutable y es el prefijo de todos los ids del proyecto: equivocarla hoy
   * significa renombrar a mano cada id el día que se note. `Infraestructura` es `IN` y no
   * `INFRA`; `DGETI web` es `DW`; `SIEST` es `SIES`.
   */
  it('trae los 11 proyectos con la clave exacta de Jira', () => {
    expect(doc.proyectos.map((p) => p.clave)).toEqual(CLAVES_JIRA);
  });

  it('las tres tareas importadas conservan su clave de Jira', () => {
    const infra = doc.proyectos.find((p) => p.clave === 'IN');
    const importadas = tareasDe(infra!.epicas[0]!).map((t) => t.clave_externa);
    expect(importadas).toEqual(['IN-3', 'IN-4', 'IN-9']);
  });

  /**
   * N9 con datos reales: en Jira, Infraestructura usa Epic → Tarea, sin nivel de historia.
   * Meter una historia «General» para que quepan sería inventar estructura.
   */
  it('las importadas cuelgan de la épica, sin historia de por medio', () => {
    const infra = doc.proyectos.find((p) => p.clave === 'IN')!;
    expect(infra.epicas[0]?.historias).toEqual([]);
    expect(tareasDe(infra.epicas[0]!)).toHaveLength(3);
  });

  it('las dos simuladas cuelgan del proyecto, sin épica, y se distinguen por no traer clave', () => {
    const pulso = doc.proyectos.find((p) => p.clave === 'PULSO')!;
    expect(pulso.epicas).toEqual([]);
    expect(tareasDe(pulso)).toHaveLength(2);
    expect(tareasDe(pulso).every((t) => t.clave_externa === null)).toBe(true);
  });

  it('las cinco tareas están indexadas: ninguna se pierde para las vistas transversales', () => {
    expect([...indexarTareas(doc).keys()].sort()).toEqual([
      'IN-T1', 'IN-T2', 'IN-T3', 'PULSO-T1', 'PULSO-T2',
    ]);
  });

  it('el sprint activo solo compromete tareas que existen', () => {
    const indice = indexarTareas(doc);
    const activo = doc.sprints.find((s) => s.estado === 'activo');
    expect(activo?.items.map((i) => i.tarea_id).filter((id) => !indice.has(id))).toEqual([]);
  });
});

/**
 * Los campos del reloj, estrenados con datos reales. Sin al menos una tarea medible, la
 * vista de Tiempos nace vacía y no se puede juzgar si sirve.
 */
describe('la semilla estrena esfuerzo y reloj', () => {
  const doc = (() => {
    const resultado = validarDocumento(crudo);
    if (!resultado.ok) throw new Error('la semilla no valida');
    return resultado.documento;
  })();

  it('no inventa resoluciones anteriores a la migración', () => {
    const medidas = resoluciones(doc);
    expect(medidas).toEqual([]);
  });

  /** Una sola medida no da promedio: el conteo crudo y nada más. */
  it('sin tramos tampoco inventa un promedio', () => {
    expect(tiempoPorPersona(doc)).toEqual([]);
  });

  it('las estimaciones se suman con su letra chica', () => {
    const infra = doc.proyectos.find((p) => p.clave === 'IN')!;
    expect(sumarEsfuerzo(tareasDe(infra.epicas[0]!))).toEqual({
      puntos: 10,
      estimadas: 3,
      total: 3,
    });
  });
});
