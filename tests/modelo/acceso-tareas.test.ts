/**
 * Regla 18, vigilada por una prueba y no por la disciplina de quien edite mañana.
 *
 * N9 dejó que una tarea cuelgue de tres sitios distintos. El modo de fallar que eso
 * introduce no es una excepción ni un tipo mal puesto: es una función que recorre dos de
 * las tres listas, no falla, no avisa, y simplemente **cuenta de menos**. Un proyecto de
 * trabajo continuo aparecería vacío en el Panorama y nadie lo notaría hasta echarlo de
 * menos.
 *
 * Por eso el acceso está centralizado en `tareasDe(nodo)` y esta prueba lee el código
 * fuente para comprobar que sigue siéndolo. Es fea a propósito: la alternativa es
 * confiar en que nadie escriba `historia.tareas` en seis meses.
 *
 * **Alcance: todo `src/`.** La deuda del renderer que este archivo declaraba se cerró: el
 * árbol pinta ya las tres formas. La única excepción que queda del lado de la interfaz es
 * el botón de lote de una historia, que por definición trabaja sobre UNA historia.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import * as path from 'node:path';

import { describe, expect, it } from 'vitest';

const RAIZ = path.resolve(__dirname, '..', '..', 'src');

/**
 * Quién puede tocar `.tareas` a mano, y por qué. No es una lista de perdón: es la lista
 * de sitios donde el acceso directo ES la implementación correcta.
 */
const PERMITIDOS = new Map<string, string>([
  ['compartido/modelo/esquema.ts', 'define el campo'],
  ['compartido/modelo/ids.ts', 'no importa nada: recorre la forma estructural mínima'],
  ['compartido/dominio/derivar.ts', 'es la puerta: aquí vive tareasDe'],
  ['principal/comandos/reductor.ts', 'el único que MUTA las listas (push/splice)'],

  ['renderer/estado/acciones-sprint.ts', 'manda al sprint las tareas de UNA historia'],
]);

/** Todo `.ts`/`.tsx` bajo `src/`, con su ruta relativa en formato POSIX. */
function fuentes(dir = RAIZ, acc: string[] = []): string[] {
  for (const entrada of readdirSync(dir)) {
    const completa = path.join(dir, entrada);
    if (statSync(completa).isDirectory()) fuentes(completa, acc);
    else if (/\.tsx?$/.test(entrada)) acc.push(path.relative(RAIZ, completa).split(path.sep).join('/'));
  }
  return acc;
}

/**
 * Accesos a la lista de tareas de un NODO DEL MODELO.
 *
 * Se descartan los de vistas que tienen su propio campo `tareas` —un grupo de la vista de
 * Terminadas, el conteo de un diálogo—, que no son el arreglo del documento. El filtro es
 * por el nombre del receptor, que es lo único que se puede leer sin un analizador: si
 * mañana alguien llama `historia` a otra cosa, esta prueba dará un falso positivo, y un
 * falso positivo aquí cuesta un minuto mientras un falso negativo cuesta un proyecto
 * entero desaparecido de la vista.
 */
const RECEPTORES = /\b(historia|epica|épica|proyecto|nodo|contenedor|sitio\.\w+)\.tareas\b/;

describe('regla 18 · el acceso a las tareas pasa por tareasDe', () => {
  it('ningún archivo fuera de la lista toca `.tareas` del modelo', () => {
    const infractores: string[] = [];
    for (const archivo of fuentes()) {
      if (PERMITIDOS.has(archivo)) continue;
      const lineas = readFileSync(path.join(RAIZ, archivo), 'utf8').split('\n');
      lineas.forEach((linea, i) => {
        if (linea.trimStart().startsWith('*') || linea.trimStart().startsWith('//')) return;
        if (RECEPTORES.test(linea)) infractores.push(`${archivo}:${i + 1}  ${linea.trim()}`);
      });
    }
    expect(infractores, 'usa tareasDe(nodo) o añade el archivo a PERMITIDOS con su motivo').toEqual(
      [],
    );
  });

  /**
   * La lista de permitidos también se pudre: un archivo que se borra o se renombra la
   * deja mintiendo, y una excepción a una regla que ya no aplica es peor que no tenerla.
   */
  it('todos los archivos de la lista de permitidos existen todavía', () => {
    const existentes = new Set(fuentes());
    const fantasmas = [...PERMITIDOS.keys()].filter((archivo) => !existentes.has(archivo));
    expect(fantasmas, 'quita de PERMITIDOS lo que ya no existe').toEqual([]);
  });
});
