/**
 * Quién sabe CÓMO SE LLAMABA el paso que `⌘Z` va a revertir (E13 · punto 1.6).
 *
 * El menú Edición de macOS no dice «Deshacer» a secas: dice «Deshacer capturar SICOE-T14».
 * La pila real vive aquí y guarda **documentos**, no nombres, así que el nombre hay que
 * sacarlo de algún sitio. La implementación en curso lo apunta en una SEGUNDA pila, del
 * lado del renderer, alimentada desde `useAplicar`.
 *
 * Estas pruebas existen para medir si esas dos pilas pueden separarse. Miden el
 * comportamiento del repositorio, no el de la interfaz, así que siguen valiendo se
 * implemente el menú como se implemente — y contestan la pregunta de diseño con un hecho
 * en vez de con una opinión.
 *
 * **Lo que encuentran:** el repositorio apila el documento anterior ANTES de intentar
 * guardar, y un fallo de escritura devuelve `ok: false` sin desapilar. Quien esté del otro
 * lado del IPC ve un fracaso y no apunta ninguna etiqueta; la pila de aquí, en cambio,
 * creció. A partir de ese instante las dos pilas van corridas un paso y el menú ofrece
 * revertir una cosa mientras `deshacer()` revierte otra — sin error, sin aviso y sin
 * forma de recuperarse, porque nada vuelve a sincronizarlas.
 *
 * No es un fallo del repositorio: apilar antes de escribir es correcto (el documento en
 * memoria YA cambió, y la regla 5 dice que un fallo de guardado no revierte nada). Es la
 * prueba de que la etiqueta tiene que salir de la misma pila que la produce.
 */

import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { Repositorio } from '../../src/principal/almacen/repositorio';
import { rutasEn } from '../../src/principal/almacen/rutas';
import { AHORA } from '../apoyo/comandos';
import { unDocumento, unaEpica, unaHistoria, unProyecto } from '../apoyo/constructores';

const CLAVE = 'PM';

const temporales: string[] = [];

afterEach(async () => {
  for (const dir of temporales.splice(0)) {
    // Devolver el permiso de escritura antes de borrar: alguna prueba lo quita a propósito.
    await fs.chmod(dir, 0o755).catch(() => undefined);
    await fs.rm(dir, { recursive: true, force: true });
  }
});

async function directorioTemporal(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'pmcare-etiqueta-'));
  temporales.push(dir);
  return dir;
}

/** Un proyecto con una historia donde colgar tareas. */
function documentoDePartida() {
  const historia = unaHistoria({ clave: CLAVE, tareas: [] });
  return {
    doc: unDocumento({
      proyectos: [
        unProyecto({ clave: CLAVE, epicas: [unaEpica({ clave: CLAVE, historias: [historia] })] }),
      ],
    }),
    historiaId: historia.id,
  };
}

async function repositorioListo() {
  const dir = await directorioTemporal();
  const rutas = rutasEn(dir);
  const { doc, historiaId } = documentoDePartida();
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(rutas.documento, JSON.stringify(doc, null, 2), 'utf8');
  const repo = new Repositorio(rutas, { vigilar: false, reloj: () => AHORA });
  await repo.abrir();
  return { dir, repo, historiaId };
}

// --- el control positivo ----------------------------------------------------

describe('la pila de deshacer del repositorio', () => {
  it('un comando que se guarda bien deja exactamente un paso más', async () => {
    const { repo, historiaId } = await repositorioListo();
    expect(repo.estado().puedeDeshacer).toBe(false);

    const ok = await repo.ejecutar({ comando: 'crearTarea', historiaId, titulo: 'Uno' });
    expect(ok.ok).toBe(true);
    expect(repo.estado().puedeDeshacer).toBe(true);

    const deshecho = await repo.deshacer();
    expect(deshecho.ok).toBe(true);
    expect(repo.estado().puedeDeshacer).toBe(false);
  });

  /**
   * El caso negativo, y la razón de este archivo.
   *
   * `crearTarea` fuerza vaciado inmediato de la cola, así que el fallo de escritura llega
   * DENTRO de la respuesta del comando. Se afirman las dos mitades (regla R3 de mis
   * aprendizajes): qué contestó y cómo quedó el estado. Un `ok: false` a secas no
   * distingue «no pasó nada» de «pasó y me dijo que no».
   */
  it('un comando cuyo guardado falla contesta ok:false y APILA IGUAL', async () => {
    const { dir, repo, historiaId } = await repositorioListo();

    // Sin permiso de escritura en el directorio no se puede respaldar ni renombrar el
    // temporal: es el fallo de disco real, no un doble.
    await fs.chmod(dir, 0o555);
    const fallo = await repo.ejecutar({ comando: 'crearTarea', historiaId, titulo: 'Dos' });
    await fs.chmod(dir, 0o755);

    expect(fallo.ok, 'el guardado tenía que fallar; si pasa, la prueba no midió nada').toBe(false);
    if (!fallo.ok) expect(fallo.codigo).toBe('error-escritura');

    // Y sin embargo: el documento en memoria cambió y el paso quedó apilado. Quien solo
    // mire la respuesta del IPC no se entera de ninguna de las dos cosas.
    expect(repo.estado().puedeDeshacer).toBe(true);
    expect(repo.estado().documento?.proyectos[0]?.epicas[0]?.historias[0]?.tareas).toHaveLength(1);
  });

  /**
   * La consecuencia, dicha como invariante: **la única fuente fiable de cuántos pasos hay
   * es esta pila**, y por tanto también debe serlo la de cómo se llaman. Cualquier espejo
   * que se alimente de las respuestas de `ejecutar` cuenta uno menos.
   */
  it('tras el fallo, deshacer revierte el paso que el IPC dio por fracasado', async () => {
    const { dir, repo, historiaId } = await repositorioListo();

    await fs.chmod(dir, 0o555);
    await repo.ejecutar({ comando: 'crearTarea', historiaId, titulo: 'Dos' });
    await fs.chmod(dir, 0o755);

    const deshecho = await repo.deshacer();
    expect(deshecho.ok).toBe(true);
    // Vuelve a cero tareas: lo que se deshizo fue el comando «fallido».
    expect(repo.estado().documento?.proyectos[0]?.epicas[0]?.historias[0]?.tareas).toHaveLength(0);
    expect(repo.estado().puedeDeshacer).toBe(false);
  });
});
