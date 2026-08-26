/**
 * Apoyo para las pruebas del reductor.
 *
 * Dos cosas y ninguna más: (a) desenvolver el `ResultadoReductor` sin que cada prueba
 * repita el `if (!resultado.ok) throw`, y (b) construir árboles **por comandos** en vez
 * de a mano, que es la única forma de que los ids y los contadores de una prueba sean
 * los que la app emitiría de verdad.
 *
 * Regla del archivo, igual que en `constructores.ts`: lo que sale de aquí es válido. Lo
 * roto se rompe a la vista, en la prueba que lo usa.
 */

import { expect } from 'vitest';

import { validarDocumento } from '../../src/compartido/modelo/esquema';
import type { Documento, Instante } from '../../src/compartido/modelo/tipos';
import type { ErrorComando, ResultadoReductor } from '../../src/principal/comandos/reductor';
import { reducir } from '../../src/principal/comandos/reductor';
import type { Comando } from '../../src/principal/comandos/tipos';
import type { EntradaHistorial } from '../../src/principal/historial/registrar';
import { unDocumento } from './constructores';

/**
 * El instante que entra al reductor en casi todas las pruebas. Fijo a propósito: el
 * reductor es puro justamente porque el reloj es un parámetro, y una prueba que usara
 * `new Date()` volvería a atar el resultado a cuándo se corrió.
 */
export const AHORA = '2026-08-26T11:20:00-06:00';
/** Su día de calendario. `fechaDe(AHORA)` debe dar exactamente esto. */
export const HOY = '2026-08-26';

export interface Aplicado {
  documento: Documento;
  evento: EntradaHistorial;
}

/** Desenvuelve un éxito. Si el comando falló, revienta con el mensaje real del reductor. */
export function exigirOk(resultado: ResultadoReductor): Aplicado {
  if (!resultado.ok) {
    throw new Error(
      `se esperaba que el comando pasara, pero falló con [${resultado.error.codigo}] ${resultado.error.mensaje}` +
        (resultado.error.detalles ? `\n  ${resultado.error.detalles.join('\n  ')}` : ''),
    );
  }
  return { documento: resultado.documento, evento: resultado.evento };
}

/** Desenvuelve un fallo. Si el comando pasó, revienta: un rechazo que no rechaza es el bug. */
export function exigirError(resultado: ResultadoReductor): ErrorComando {
  if (resultado.ok) {
    throw new Error(
      `se esperaba que el comando fuera rechazado, pero pasó: ${resultado.evento.resumen}`,
    );
  }
  return resultado.error;
}

/** Un comando que debe pasar. Devuelve solo el documento, que es lo que encadena. */
export function aplicar(doc: Documento, comando: Comando, ahora: Instante = AHORA): Documento {
  return exigirOk(reducir(doc, comando, ahora)).documento;
}

/** Una secuencia que debe pasar entera. El primer fallo detiene la prueba con su mensaje. */
export function aplicarTodos(
  doc: Documento,
  comandos: readonly Comando[],
  ahora: Instante = AHORA,
): Documento {
  return comandos.reduce((actual, comando) => aplicar(actual, comando, ahora), doc);
}

/**
 * Copia profunda para comparar el «antes» con el «después».
 *
 * `JSON.parse(JSON.stringify(...))` y no `structuredClone` a propósito: es exactamente lo
 * que se compara después con `toEqual`, y no comparte ni una referencia con el original —
 * que es justo lo que la prueba de pureza necesita demostrar.
 */
export function copiaProfunda<T>(valor: T): T {
  return JSON.parse(JSON.stringify(valor)) as T;
}

/**
 * Ejecuta un comando comprobando de paso que el documento de entrada no se tocó.
 *
 * Se usa en todas las pruebas del reductor y no solo en la que se llama «es puro»: la
 * invariante de la que depende la pila de deshacer no se protege con un caso, se protege
 * con que ninguna otra prueba pueda pasar sin ella.
 */
export function reducirSinMutar(
  doc: Documento,
  comando: Comando,
  ahora: Instante = AHORA,
): ResultadoReductor {
  const antes = copiaProfunda(doc);
  const resultado = reducir(doc, comando, ahora);
  expect(doc, `"${comando.comando}" mutó el documento de entrada`).toEqual(antes);
  return resultado;
}

// --- documentos de partida --------------------------------------------------

export interface Arbol {
  doc: Documento;
  clave: string;
  epicaId: string;
  historiaId: string;
}

/**
 * Un proyecto con una épica y una historia, todo emitido por el reductor.
 *
 * Los ids salen deterministas (`PM-E1`, `PM-H1`) porque el proyecto nace vacío y los
 * contadores arrancan en cero. Las tareas las crea cada prueba, así que la primera
 * siempre es `PM-T1`.
 */
export function arbolVacio(clave = 'PM'): Arbol {
  const doc = aplicarTodos(unDocumento(), [
    { comando: 'crearProyecto', clave, nombre: `Proyecto ${clave}` },
    { comando: 'crearEpica', proyecto: clave, titulo: 'Épica' },
    { comando: 'crearHistoria', epicaId: `${clave}-E1`, titulo: 'Historia' },
  ]);
  return { doc, clave, epicaId: `${clave}-E1`, historiaId: `${clave}-H1` };
}

/** `arbolVacio` más `cuantas` tareas: `PM-T1`… `PM-T{cuantas}`. */
export function arbolConTareas(cuantas: number, clave = 'PM'): Arbol {
  const base = arbolVacio(clave);
  const doc = aplicarTodos(
    base.doc,
    Array.from({ length: cuantas }, (_, i) => ({
      comando: 'crearTarea' as const,
      historiaId: base.historiaId,
      titulo: `Tarea ${i + 1}`,
    })),
  );
  return { ...base, doc };
}

/** Comprueba que un documento pasa el esquema completo, con las rutas si no. */
export function exigirValido(doc: Documento, contexto = ''): void {
  const resultado = validarDocumento(doc);
  if (!resultado.ok) {
    const detalle = resultado.problemas.map((p) => `${p.ruta}: ${p.mensaje}`).join('\n  ');
    throw new Error(`documento inválido${contexto ? ` (${contexto})` : ''}:\n  ${detalle}`);
  }
}
