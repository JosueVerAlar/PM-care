/**
 * Deshacer un cierre de sprint, sobre el almacén REAL.
 *
 * `cerrarSprint` es un solo comando justamente por esto: cerrar un sprint de diez tareas
 * y que deshacer revirtiera solo la última sería peor que no tener deshacer, porque el
 * usuario creería que volvió atrás. Esa promesa no la sostiene el reductor por su cuenta
 * —él solo promete no mutar su entrada—, sino la pila de instantáneas del repositorio y
 * lo que acaba escrito en disco.
 *
 * Por eso esta prueba no dobla nada: monta el repositorio sobre un directorio temporal
 * del sistema (nunca `datos/` del repositorio), ejecuta el cierre, deshace, y compara el
 * ARCHIVO con el de antes. `cerrarSprint` y `deshacer` fuerzan vaciado inmediato de la
 * cola, así que no hay que esperar al debounce ni dormir: si algo tardara, la prueba
 * fallaría en vez de quedarse verde por casualidad.
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
  unSprint,
  unaTarea,
  unItem,
} from '../apoyo/constructores';

const CLAVE = 'PM';

const temporales: string[] = [];

afterEach(async () => {
  for (const dir of temporales.splice(0)) {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

async function directorioTemporal(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'pmcare-cierre-'));
  temporales.push(dir);
  return dir;
}

/** Sprint activo con cuatro tareas: una hecha y tres abiertas para los tres destinos. */
function documentoDePartida(): Documento {
  const doc = unDocumento({
    proyectos: [
      unProyecto({
        clave: CLAVE,
        epicas: [
          unaEpica({
            clave: CLAVE,
            historias: [
              unaHistoria({
                clave: CLAVE,
                tareas: [
                  unaTarea({ id: 'PM-T1', clave: CLAVE, titulo: 'Terminada', estado: 'done' }),
                  unaTarea({ id: 'PM-T2', clave: CLAVE, titulo: 'Se arrastra', estado: 'iniciado' }),
                  unaTarea({ id: 'PM-T3', clave: CLAVE, titulo: 'Al backlog', estado: 'pendiente' }),
                  unaTarea({ id: 'PM-T4', clave: CLAVE, titulo: 'Se descarta', estado: 'pendiente' }),
                ],
              }),
            ],
          }),
        ],
      }),
    ],
    sprints: [
      unSprint({
        id: 'S-34',
        nombre: 'Sprint 34',
        estado: 'activo',
        inicio: '2026-08-24',
        fin: '2026-09-04',
        items: [unItem('PM-T1'), unItem('PM-T2'), unItem('PM-T3'), unItem('PM-T4')],
      }),
    ],
  });
  exigirValido(doc, 'documento de partida del almacén');
  return doc;
}

/** Deja el documento en disco tal cual lo serializa el almacén y abre el repositorio. */
async function almacenListo(): Promise<{
  repo: Repositorio;
  rutas: ReturnType<typeof rutasEn>;
  /** El mismo objeto que se escribió: los constructores numeran títulos con un contador
   *  de módulo, así que reconstruirlo daría otro documento y la comparación no valdría. */
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

describe('deshacer un cierre de sprint', () => {
  it('devuelve el archivo EXACTO de antes del cierre, byte por byte', async () => {
    const { repo, rutas } = await almacenListo();
    const antes = await leer(rutas.documento);

    const cerrado = await repo.ejecutar({
      comando: 'cerrarSprint',
      sprintId: 'S-34',
      decisiones: [
        { tareaId: 'PM-T2', destino: 'siguiente' },
        { tareaId: 'PM-T3', destino: 'backlog' },
        { tareaId: 'PM-T4', destino: 'descartar' },
      ],
    });
    expect(cerrado.ok, cerrado.ok ? '' : cerrado.mensaje).toBe(true);
    // El cierre de verdad pasó: si no, «volver atrás» no significaría nada.
    expect(await leer(rutas.documento)).not.toBe(antes);

    const deshecho = await repo.deshacer();
    expect(deshecho.ok, deshecho.ok ? '' : deshecho.mensaje).toBe(true);
    expect(await leer(rutas.documento)).toBe(antes);

    await repo.cerrar();
  });

  it('deshace las tres cosas que el cierre cambió, no solo el estado del sprint', async () => {
    const { repo, partida } = await almacenListo();

    const cerrado = await repo.ejecutar({
      comando: 'cerrarSprint',
      sprintId: 'S-34',
      decisiones: [
        { tareaId: 'PM-T2', destino: 'siguiente' },
        { tareaId: 'PM-T3', destino: 'backlog' },
        { tareaId: 'PM-T4', destino: 'descartar' },
      ],
    });
    if (!cerrado.ok) throw new Error(cerrado.mensaje);
    const despues = cerrado.instantanea.documento;
    expect(despues?.sprints.map((s) => s.id)).toEqual(['S-34', 'S-35']);
    expect(despues?.sprints[0]?.estado).toBe('cerrado');
    expect(tareaEn(despues, 'PM-T4')?.estado).toBe('cancelada');

    const deshecho = await repo.deshacer();
    if (!deshecho.ok) throw new Error(deshecho.mensaje);
    const vuelto = deshecho.instantanea.documento;

    // 1. El sprint creado desaparece. 2. El cerrado vuelve a activo y sin desenlaces.
    // 3. La tarea descartada vuelve a pendiente.
    expect(vuelto?.sprints.map((s) => s.id)).toEqual(['S-34']);
    expect(vuelto?.sprints[0]?.estado).toBe('activo');
    expect(vuelto?.sprints[0]?.items.map((i) => i.desenlace)).toEqual([null, null, null, null]);
    expect(tareaEn(vuelto, 'PM-T4')?.estado).toBe('pendiente');
    expect(vuelto).toEqual(partida);

    await repo.cerrar();
  });

  it('un cierre es UN paso de la pila: después de deshacerlo no queda nada que deshacer', async () => {
    // La razón de que la ceremonia sea un comando y no una secuencia de tres. Si el
    // cierre apilara un paso por decisión, este `deshacer` dejaría el sprint a medias.
    const { repo } = await almacenListo();
    expect((await repo.estado()).puedeDeshacer).toBe(false);

    const cerrado = await repo.ejecutar({ comando: 'cerrarSprint', sprintId: 'S-34' });
    if (!cerrado.ok) throw new Error(cerrado.mensaje);
    expect(cerrado.instantanea.puedeDeshacer).toBe(true);

    const deshecho = await repo.deshacer();
    if (!deshecho.ok) throw new Error(deshecho.mensaje);
    expect(deshecho.instantanea.puedeDeshacer).toBe(false);

    const otra = await repo.deshacer();
    expect(otra.ok).toBe(false);

    await repo.cerrar();
  });

  it('un cierre RECHAZADO no escribe nada ni deja un paso que deshacer', async () => {
    const { repo, rutas } = await almacenListo();
    const antes = await leer(rutas.documento);

    // PM-T1 está hecha: su desenlace se constata, no se decide.
    const rechazado = await repo.ejecutar({
      comando: 'cerrarSprint',
      sprintId: 'S-34',
      decisiones: [
        { tareaId: 'PM-T4', destino: 'descartar' },
        { tareaId: 'PM-T1', destino: 'backlog' },
      ],
    });
    expect(rechazado.ok).toBe(false);
    expect(await leer(rutas.documento)).toBe(antes);
    expect((await repo.estado()).puedeDeshacer).toBe(false);

    await repo.cerrar();
  });
});

function tareaEn(doc: Documento | null | undefined, id: string) {
  for (const proyecto of doc?.proyectos ?? []) {
    for (const epica of proyecto.epicas) {
      for (const historia of epica.historias) {
        const tarea = historia.tareas.find((t) => t.id === id);
        if (tarea !== undefined) return tarea;
      }
    }
  }
  return undefined;
}
