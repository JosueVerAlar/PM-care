/**
 * Chips y contadores de los tres canales visuales.
 *
 * Los canales no se pisan y cada uno tiene su vehículo (CLAUDE.md, reglas 17 y siguientes):
 *
 *   1. ESTADO      -> la forma del glifo, en su columna fija. No está aquí.
 *   2. PROCEDENCIA -> la banda de 3 px del borde izquierdo (clase `--nuevo` en la fila)
 *                     más el chip «Nuevo». Nunca ocupa el lugar del estado.
 *   3. BLOQUEO     -> `ChipBloqueo` con la palabra y los días, o `TiraBloqueo` con el
 *                     motivo. El cuadrito rojo jamás va solo: siempre con texto.
 *
 * Una tarea puede llevar los tres a la vez, y ese es el caso que la maqueta de E0 probó.
 */

import { CuadroBloqueo } from './iconos';
import { dias } from '../util/presentacion';

/** «Nuevo» — procedencia, no estado. Etiqueta larga: «No planeado» (decisión D5). */
export function ChipNuevo() {
  return (
    <span className="chip chip--nuevo" title="No planeado: se capturó después de cerrar la planeación">
      Nuevo
    </span>
  );
}

export function ChipNeutro({ texto, titulo }: { texto: string; titulo?: string }) {
  return (
    <span className="chip chip--neutro" title={titulo ?? texto}>
      {texto}
    </span>
  );
}

/**
 * Bandera de bloqueo para una fila del árbol. Lleva la palabra siempre; el motivo
 * completo va en el `title` porque en una fila de 26 px no cabe.
 */
export function ChipBloqueo({ diasBloqueada, motivo }: { diasBloqueada: number; motivo: string }) {
  const texto = `Bloqueada ${dias(diasBloqueada)}`;
  return (
    <span className="chip chip--bloqueo" title={`${texto} · ${motivo}`}>
      <CuadroBloqueo />
      {texto}
    </span>
  );
}

/** Tira de bloqueo para una tarjeta del sprint: ahí sí cabe el motivo. */
export function TiraBloqueo({ diasBloqueada, motivo }: { diasBloqueada: number; motivo: string }) {
  const texto = `Bloqueada ${dias(diasBloqueada)} · ${motivo}`;
  return (
    <p className="tira-bloqueo" title={texto}>
      <CuadroBloqueo />
      <span>{texto}</span>
    </p>
  );
}

/**
 * Contador de bloqueadas: cuadrito + número, nunca el color solo.
 *
 * Devuelve `null` en cero en vez de un «0»: una columna de ceros entrena a no mirar la
 * columna, y entonces el 3 tampoco se ve.
 */
export function ContadorBloqueos({ n }: { n: number }) {
  if (n <= 0) return null;
  const texto = n === 1 ? '1 tarea bloqueada' : `${n} tareas bloqueadas`;
  return (
    <span className="contador" title={texto}>
      <CuadroBloqueo />
      {n}
      <span className="solo-lectores">{texto}</span>
    </span>
  );
}
