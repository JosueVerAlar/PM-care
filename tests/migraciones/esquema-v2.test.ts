import { readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { validarDocumento } from '../../src/compartido/modelo/esquema';
import { ESQUEMA_VERSION, estadoDeVersion } from '../../src/compartido/modelo/version';
import { MIGRACIONES, migrar } from '../../src/principal/migraciones';
import { unDocumento, unProyecto, unSprint, unaTarea } from '../apoyo/constructores';

const AHORA = '2026-08-28T12:00:00-06:00';
const RUTAS_V1 = [
  new URL('fixtures/datos-real-v1.json', import.meta.url),
  new URL('../../datos/ejemplo.json', import.meta.url),
];

function migrarArchivo(ruta: URL): Record<string, unknown> {
  const crudo = JSON.parse(readFileSync(ruta, 'utf8')) as Record<string, unknown>;
  // Los fixtures del repositorio ya quedan escritos en v2; volver a pasar su forma por la
  // entrada real comprueba que la transformación estructural conserva los sprints
  // transversales y no depende de que el archivo siga sin regenerar en el árbol de trabajo.
  if (crudo['esquema_version'] === 2) {
    return { ...MIGRACIONES[0]!.migrar(crudo, AHORA), esquema_version: 2 };
  }
  const resultado = migrar(crudo, AHORA);
  if (!resultado.ok) throw new Error(resultado.motivo);
  return resultado.crudo;
}

describe('primera migración 1→2', () => {
  it('la versión 2 tiene una sola migración y conserva la v1 como migrable', () => {
    expect(ESQUEMA_VERSION).toBe(2);
    expect(MIGRACIONES.map(({ desde, hasta }) => [desde, hasta])).toEqual([[1, 2]]);
    expect(estadoDeVersion(1)).toBe('migrable');
  });

  it.each(RUTAS_V1)('migra %s y el resultado valida contra el esquema v2', (ruta) => {
    const validacion = validarDocumento(migrarArchivo(ruta));
    expect(validacion.ok ? [] : validacion.problemas).toEqual([]);
  });

  it('conserva un campo desconocido dentro de una tarea', () => {
    const crudo = JSON.parse(readFileSync(RUTAS_V1[0]!, 'utf8')) as Record<string, any>;
    const tarea = crudo.proyectos.flatMap((p: any) => [
      ...(p.tareas ?? []),
      ...(p.epicas ?? []).flatMap((e: any) => [
        ...(e.tareas ?? []),
        ...(e.historias ?? []).flatMap((h: any) => h.tareas ?? []),
      ]),
    ])[0];
    tarea.nota_manual = 'no borrar';
    const resultado = migrar(crudo, AHORA);
    expect(resultado.ok).toBe(true);
    expect(JSON.stringify(resultado.ok ? resultado.crudo : null)).toContain('nota_manual');
  });

  it('regenera los fixtures solo al ejecutar explícitamente la migración real', () => {
    if (process.env.REGENERAR_FIXTURES_M2 !== '1') return;
    for (const nombre of ['ejemplo.json', 'semilla.json']) {
      const ruta = new URL(`../../datos/${nombre}`, import.meta.url);
      writeFileSync(ruta, `${JSON.stringify(migrarArchivo(ruta), null, 2)}\n`, 'utf8');
    }
  });
});

describe('invariantes nuevas del esquema', () => {
  it('rechaza dos tramos abiertos en una tarea', () => {
    const tarea = unaTarea({
      trabajo: [
        { desde: '2026-08-28T09:00:00-06:00', hasta: null, estado: 'iniciado' },
        { desde: '2026-08-28T10:00:00-06:00', hasta: null, estado: 'en_pruebas' },
      ],
    });
    expect(validarDocumento(unDocumento({ proyectos: [unProyecto({ tareas: [tarea] })] })).ok).toBe(false);
  });

  it('rechaza dos sprints activos del mismo proyecto', () => {
    const doc = unDocumento({
      proyectos: [unProyecto({ clave: 'UNO' })],
      sprints: [unSprint({ clave: 'UNO' }), unSprint({ clave: 'UNO' })],
    });
    expect(validarDocumento(doc).ok).toBe(false);
  });

  it('acepta dos sprints activos de proyectos distintos', () => {
    const doc = unDocumento({
      proyectos: [unProyecto({ clave: 'UNO' }), unProyecto({ clave: 'DOS' })],
      sprints: [unSprint({ clave: 'UNO' }), unSprint({ clave: 'DOS' })],
    });
    expect(validarDocumento(doc).ok).toBe(true);
  });
});
