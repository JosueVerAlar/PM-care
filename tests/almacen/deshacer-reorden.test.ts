/**
 * Deshacer un reordenamiento, sobre el almacén REAL.
 *
 * La promesa que sostiene esta prueba no la puede sostener el reductor por su cuenta: él
 * solo devuelve un documento nuevo. Que arrastrar algo al sitio equivocado se pueda
 * revertir depende de la pila de instantáneas del repositorio y de lo que acaba escrito
 * en disco.
 *
 * Y hay una razón concreta para probarlo aquí y no con dobles: **los tres `reordenar`
 * quedan FUERA del vaciado inmediato** (priorizar es una ráfaga de arrastres). Así que la
 * ruta que recorre un reordenamiento hasta el archivo es distinta de la de un cierre de
 * sprint, y es la que hay que ver funcionar. `deshacer` sí fuerza el vaciado, así que no
 * hay que dormir ni esperar al debounce: si algo tardara, la prueba fallaría en vez de
 * quedarse verde por casualidad.
 *
 * Como en `deshacer-cierre.test.ts`, el repositorio se monta sobre un directorio temporal
 * del sistema — nunca sobre `datos/` del repositorio.
 */

import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import type { Documento } from '../../src/compartido/modelo/tipos';
import { Repositorio } from '../../src/principal/almacen/repositorio';
import { rutasEn } from '../../src/principal/almacen/rutas';
import { AHORA, exigirValido } from '../apoyo/comandos';
import {
  unDocumento,
  unaEpica,
  unaHistoria,
  unProyecto,
  unaTarea,
} from '../apoyo/constructores';

const CLAVE = 'PM';

const temporales: string[] = [];

afterEach(async () => {
  for (const dir of temporales.splice(0)) {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

async function directorioTemporal(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'pmcare-reorden-'));
  temporales.push(dir);
  return dir;
}

/** Tres épicas; la primera con dos historias y la primera de ellas con dos tareas. */
function documentoDePartida(): Documento {
  const doc = unDocumento({
    proyectos: [
      unProyecto({
        clave: CLAVE,
        contadores: { epicas: 3, historias: 2, tareas: 2 },
        epicas: [
          unaEpica({
            id: 'PM-E1',
            clave: CLAVE,
            titulo: 'Primera',
            historias: [
              unaHistoria({
                id: 'PM-H1',
                clave: CLAVE,
                titulo: 'Historia A',
                tareas: [
                  unaTarea({ id: 'PM-T1', clave: CLAVE, titulo: 'Tarea 1' }),
                  unaTarea({ id: 'PM-T2', clave: CLAVE, titulo: 'Tarea 2' }),
                ],
              }),
              unaHistoria({ id: 'PM-H2', clave: CLAVE, titulo: 'Historia B', tareas: [] }),
            ],
          }),
          unaEpica({ id: 'PM-E2', clave: CLAVE, titulo: 'Segunda', historias: [] }),
          unaEpica({ id: 'PM-E3', clave: CLAVE, titulo: 'Tercera', historias: [] }),
        ],
      }),
    ],
  });
  exigirValido(doc, 'documento de partida del almacén');
  return doc;
}

async function almacenListo(): Promise<{
  repo: Repositorio;
  rutas: ReturnType<typeof rutasEn>;
  partida: Documento;
}> {
  const dir = await directorioTemporal();
  const rutas = rutasEn(dir);
  const partida = documentoDePartida();
  await fs.mkdir(rutas.directorio, { recursive: true });
  await fs.writeFile(rutas.documento, `${JSON.stringify(partida, null, 2)}\n`, 'utf8');

  const repo = new Repositorio(rutas, { vigilar: false, reloj: () => AHORA });
  const abierto = await repo.abrir();
  expect(abierto.modo, JSON.stringify(abierto.diagnostico)).toBe('listo');
  return { repo, rutas, partida };
}

const leer = async (ruta: string): Promise<string> => fs.readFile(ruta, 'utf8');

const idsEpicas = (doc: Documento | null | undefined): string[] =>
  doc?.proyectos[0]?.epicas.map((e) => e.id) ?? [];

describe('deshacer un reordenamiento del árbol', () => {
  it('restaura el orden anterior de las épicas', async () => {
    const { repo, partida } = await almacenListo();
    expect(idsEpicas(partida)).toEqual(['PM-E1', 'PM-E2', 'PM-E3']);

    const movida = await repo.ejecutar({
      comando: 'reordenarEpica',
      proyecto: CLAVE,
      epicaId: 'PM-E1',
      aIndice: 2,
    });
    expect(movida.ok, movida.ok ? '' : movida.mensaje).toBe(true);
    if (!movida.ok) return;
    expect(idsEpicas(movida.instantanea.documento)).toEqual(['PM-E2', 'PM-E3', 'PM-E1']);

    const deshecho = await repo.deshacer();
    expect(deshecho.ok, deshecho.ok ? '' : deshecho.mensaje).toBe(true);
    if (!deshecho.ok) return;
    expect(idsEpicas(deshecho.instantanea.documento)).toEqual(['PM-E1', 'PM-E2', 'PM-E3']);
    // No «el orden vuelve»: el documento entero vuelve, con su rama y sus contadores.
    expect(deshecho.instantanea.documento).toEqual(partida);

    await repo.cerrar();
  });

  it('el ARCHIVO vuelve a ser el de antes, byte por byte', async () => {
    const { repo, rutas } = await almacenListo();
    const antes = await leer(rutas.documento);

    const movida = await repo.ejecutar({
      comando: 'reordenarTarea',
      contenedorId: 'PM-H1',
      tareaId: 'PM-T2',
      aIndice: 0,
    });
    expect(movida.ok, movida.ok ? '' : movida.mensaje).toBe(true);

    const deshecho = await repo.deshacer();
    expect(deshecho.ok, deshecho.ok ? '' : deshecho.mensaje).toBe(true);
    expect(await leer(rutas.documento)).toBe(antes);

    await repo.cerrar();
  });

  it('el reordenamiento SÍ llegó al disco antes de deshacerlo: el verde no es porque no pasara nada', async () => {
    // La contraprueba del caso anterior. `reordenar*` está fuera del vaciado inmediato,
    // así que si el debounce se tragara la escritura, «el archivo volvió a ser el de
    // antes» saldría verde sin que el arrastre hubiera llegado nunca al archivo.
    const { repo, rutas } = await almacenListo();
    const antes = await leer(rutas.documento);

    const movida = await repo.ejecutar({
      comando: 'reordenarEpica',
      proyecto: CLAVE,
      epicaId: 'PM-E3',
      aIndice: 0,
    });
    expect(movida.ok, movida.ok ? '' : movida.mensaje).toBe(true);

    // Se fuerza el vaciado cerrando el repositorio y se relee el archivo desde cero.
    await repo.cerrar();
    const despues = await leer(rutas.documento);
    expect(despues).not.toBe(antes);
    expect(idsEpicas(JSON.parse(despues) as Documento)).toEqual(['PM-E3', 'PM-E1', 'PM-E2']);
  });

  it('una ráfaga de cinco arrastres se deshace uno a uno, en orden inverso', async () => {
    // Es la forma real de usar esto: nadie arrastra una vez. Cada `reordenar` apila un
    // paso propio —al revés que el cierre de sprint, que apila uno solo— porque cada
    // arrastre es una decisión completa que el usuario puede querer revertir sola.
    const { repo, partida } = await almacenListo();

    const rafaga = [
      { epicaId: 'PM-E1', aIndice: 2 }, // E2 E3 E1
      { epicaId: 'PM-E3', aIndice: 0 }, // E3 E2 E1
      { epicaId: 'PM-E2', aIndice: 2 }, // E3 E1 E2
      { epicaId: 'PM-E1', aIndice: 0 }, // E1 E3 E2
      { epicaId: 'PM-E2', aIndice: 1 }, // E1 E2 E3
    ] as const;
    const ordenes: string[][] = [];
    for (const paso of rafaga) {
      const hecho = await repo.ejecutar({ comando: 'reordenarEpica', proyecto: CLAVE, ...paso });
      expect(hecho.ok, hecho.ok ? '' : hecho.mensaje).toBe(true);
      if (!hecho.ok) return;
      ordenes.push(idsEpicas(hecho.instantanea.documento));
    }
    expect(ordenes).toEqual([
      ['PM-E2', 'PM-E3', 'PM-E1'],
      ['PM-E3', 'PM-E2', 'PM-E1'],
      ['PM-E3', 'PM-E1', 'PM-E2'],
      ['PM-E1', 'PM-E3', 'PM-E2'],
      ['PM-E1', 'PM-E2', 'PM-E3'],
    ]);

    // Cinco deshaceres devuelven la lista por donde vino, hasta el orden original.
    const vuelta: string[][] = [];
    for (let i = 0; i < rafaga.length; i += 1) {
      const deshecho = await repo.deshacer();
      expect(deshecho.ok, deshecho.ok ? '' : deshecho.mensaje).toBe(true);
      if (!deshecho.ok) return;
      vuelta.push(idsEpicas(deshecho.instantanea.documento));
    }
    expect(vuelta).toEqual([
      ['PM-E1', 'PM-E3', 'PM-E2'],
      ['PM-E3', 'PM-E1', 'PM-E2'],
      ['PM-E3', 'PM-E2', 'PM-E1'],
      ['PM-E2', 'PM-E3', 'PM-E1'],
      ['PM-E1', 'PM-E2', 'PM-E3'],
    ]);
    expect((await repo.estado()).documento).toEqual(partida);
    expect((await repo.estado()).puedeDeshacer).toBe(false);

    await repo.cerrar();
  });

  it('deshacer un reordenamiento de historia devuelve la rama con sus tareas', async () => {
    const { repo, partida } = await almacenListo();

    const movida = await repo.ejecutar({
      comando: 'reordenarHistoria',
      epicaId: 'PM-E1',
      historiaId: 'PM-H2',
      aIndice: 0,
    });
    expect(movida.ok, movida.ok ? '' : movida.mensaje).toBe(true);
    if (!movida.ok) return;
    const historias = movida.instantanea.documento?.proyectos[0]?.epicas[0]?.historias;
    expect(historias?.map((h) => h.id)).toEqual(['PM-H2', 'PM-H1']);
    expect(historias?.[1]?.tareas.map((t) => t.id)).toEqual(['PM-T1', 'PM-T2']);

    const deshecho = await repo.deshacer();
    expect(deshecho.ok, deshecho.ok ? '' : deshecho.mensaje).toBe(true);
    if (!deshecho.ok) return;
    expect(deshecho.instantanea.documento).toEqual(partida);

    await repo.cerrar();
  });

  it('un reordenamiento RECHAZADO no escribe nada ni deja un paso que deshacer', async () => {
    // Soltar una épica donde ya estaba es el desenlace más común de un arrastre. Si eso
    // apilara un paso, el siguiente `deshacer` del usuario no haría nada visible y
    // parecería que se perdió.
    const { repo, rutas } = await almacenListo();
    const antes = await leer(rutas.documento);

    const rechazado = await repo.ejecutar({
      comando: 'reordenarEpica',
      proyecto: CLAVE,
      epicaId: 'PM-E1',
      aIndice: 0,
    });
    expect(rechazado.ok).toBe(false);
    if (!rechazado.ok) expect(rechazado.mensaje).toContain('ya está en la posición 1');

    expect(await leer(rutas.documento)).toBe(antes);
    expect((await repo.estado()).puedeDeshacer).toBe(false);

    await repo.cerrar();
  });

  it('reordenar con un padre ajeno tampoco apila nada', async () => {
    const { repo, rutas } = await almacenListo();
    const antes = await leer(rutas.documento);

    const rechazado = await repo.ejecutar({
      comando: 'reordenarHistoria',
      epicaId: 'PM-E2',
      historiaId: 'PM-H1',
      aIndice: 0,
    });
    expect(rechazado.ok).toBe(false);
    if (!rechazado.ok) expect(rechazado.mensaje).toContain('no cuelga de "PM-E2"');

    expect(await leer(rutas.documento)).toBe(antes);
    expect((await repo.estado()).puedeDeshacer).toBe(false);

    await repo.cerrar();
  });
});
