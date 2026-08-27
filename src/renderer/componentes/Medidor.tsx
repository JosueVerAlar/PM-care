/**
 * El medidor de avance. Es el componente donde se cumplen o se rompen las reglas 2 y 3.
 *
 *   - Contenedor sin tareas contables -> «sin desglosar». Nunca `0 %`, nunca `NaN`.
 *   - Ningún porcentaje sin su conteo crudo al lado. La barra ES la representación del
 *     porcentaje, y siempre lleva el `hechas/hojas` pegado a la derecha.
 *   - Sin barra por debajo del mínimo de tareas: lo decide `mostrarPct`, no esta vista.
 *   - Y lo que queda por desglosar se dice: «5/5 · 1 sin desglosar» (regla 2).
 *
 * Todo el cálculo llega ya hecho en un `Avance` de `compartido/dominio/derivar.ts`. Este
 * archivo no suma, no divide y no redondea.
 */

import { mostrarPct, type Avance } from '../../compartido/dominio/derivar';

function descripcion(avance: Avance): string {
  const base = `${avance.hechas} de ${avance.hojas} tareas hechas`;
  const pct = avance.pct === null ? '' : ` (${avance.pct} %)`;
  const canceladas =
    avance.canceladas > 0
      ? ` · ${avance.canceladas} cancelada${avance.canceladas === 1 ? '' : 's'}, fuera del conteo`
      : '';
  return base + pct + canceladas + explicacionSinDesglosar(avance);
}

/**
 * La frase larga del `title`, que es donde cabe el porqué.
 *
 * El texto visible dice el número; aquí se dice qué significa, porque «1 sin desglosar»
 * a secas todavía se puede leer como un defecto de la app. No se nombra el nivel
 * (historia o épica) a propósito: el medidor no sabe sobre qué contenedor lo están
 * pintando, y en un proyecto el número mezcla los dos —épicas sin historias e historias
 * sin tareas—, así que cualquier sustantivo concreto sería falso en alguna pantalla.
 */
function explicacionSinDesglosar(avance: Avance): string {
  const cuantos = avance.contenedoresSinDesglosar;
  if (cuantos === 0) return '';
  return cuantos === 1
    ? ' · queda 1 sin desglosar: nadie la ha abierto, así que no se sabe cuánto trabajo falta'
    : ` · quedan ${cuantos} sin desglosar: nadie las ha abierto, así que no se sabe cuánto trabajo falta`;
}

/**
 * «· 1 sin desglosar», la mitad que faltaba del arreglo del cálculo.
 *
 * `estadoDerivado` niega el `hecha` a un contenedor con 5 de 5 tareas cerradas si algún
 * descendiente sigue sin abrir; sin esta frase la pantalla dice «En movimiento» junto a
 * un `5/5` y eso se lee como un error de la app, no como información. El número es
 * exactamente lo que hay que abrir: `contenedoresSinDesglosar` ya viene contado del
 * dominio y aquí no se deduce ni se ajusta nada.
 *
 * `null` cuando `hojas === 0`: ahí el propio medidor ya dice «sin desglosar» (o «3
 * canceladas») del contenedor que se está pintando, y añadirle el conteo de sus
 * descendientes duplicaría la misma palabra con dos significados en cuatro centímetros.
 * Ese caso además no niega ningún verde —cae en `sin_desglosar`, no en `en_movimiento`—,
 * que es lo que esta frase existe para explicar.
 */
function textoSinDesglosar(avance: Avance): string | null {
  if (avance.hojas === 0 || avance.contenedoresSinDesglosar === 0) return null;
  return `${avance.contenedoresSinDesglosar} sin desglosar`;
}

/**
 * Texto del caso vacío. Se distingue «nunca se desglosó» de «todo lo que había se
 * canceló»: `derivar` da `hojas === 0` en ambos, pero decirle «sin desglosar» a una
 * historia cuyas tres tareas se cancelaron es mentira.
 */
function textoVacio(avance: Avance): string {
  if (avance.canceladas === 0) return 'sin desglosar';
  return avance.canceladas === 1 ? '1 cancelada' : `${avance.canceladas} canceladas`;
}

export interface PropsMedidor {
  avance: Avance;
  /**
   * `false` en las historias: su columna solo lleva el conteo. La barra se reserva para
   * el nivel de épica y los resúmenes, donde el agregado es grande y significa algo.
   */
  conBarra?: boolean;
}

export function Medidor({ avance, conBarra = true }: PropsMedidor) {
  if (avance.hojas === 0) {
    return (
      <span className="sin-desglosar" title={`Sin tareas contables. ${descripcion(avance)}`}>
        {textoVacio(avance)}
      </span>
    );
  }

  const conteo = `${avance.hechas}/${avance.hojas}`;
  const falta = textoSinDesglosar(avance);

  // La coletilla va SIEMPRE pegada al conteo crudo, en las dos variantes: es la que
  // explica el estado, y separarla del número la convertiría en un adorno suelto.
  // Cuando aparece, la caja deja de medir los 84 px de la columna y crece con su texto;
  // en el árbol solo le pasa a las contadas filas que están en este caso, y la columna
  // de claves —que va después y también es fija— no se mueve.
  const coletilla = falta === null ? null : <span className="medidor__falta"> · {falta}</span>;

  if (!conBarra || !mostrarPct(avance)) {
    return (
      <span
        className={falta === null ? 'conteo-solo' : 'conteo-solo conteo-solo--falta'}
        title={descripcion(avance)}
      >
        {conteo}
        {coletilla}
      </span>
    );
  }

  return (
    <span
      className={falta === null ? 'medidor' : 'medidor medidor--falta'}
      title={descripcion(avance)}
    >
      <span className="medidor__pista">
        {/* La barra llega al 100 % con `hechas === hojas` aunque el estado siga siendo
            «en movimiento»: es verdad sobre las tareas que existen. Lo que faltaba no es
            un hueco en la barra —inventaría un denominador que nadie ha desglosado—,
            sino la coletilla de al lado. Y el relleno es NEUTRO, así que un 100 % aquí
            nunca se lee como el verde de «hecha» (regla 4). */}
        <span className="medidor__relleno" style={{ width: `${avance.pct ?? 0}%` }} />
      </span>
      <span className="medidor__conteo">{conteo}</span>
      {coletilla}
    </span>
  );
}
