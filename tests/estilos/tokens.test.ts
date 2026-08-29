/**
 * Contrato de los tokens de color (E13 · rediseño).
 *
 * Estas pruebas no miran cómo se ve la app: miran que la hoja de estilos siga siendo
 * COHERENTE consigo misma. Existen porque el punto 1.1 del rediseño sustituye la paleta
 * entera de `base.css` por la de `maqueta/tema.html`, y una sustitución de paleta falla
 * siempre de la misma forma: no revienta, se apaga.
 *
 * Los tres modos de apagarse, y cuál prueba los atrapa:
 *
 * 1. **Un `var(--x)` se queda sin dueño.** `tema.html` no trae nueve de los tokens que
 *    `base.css` sí define —entre ellos `--foco`, `--solido-fondo` y `--peligro-tinta`—.
 *    Si se pega la paleta nueva encima, `outline: 2px solid var(--foco)` queda inválido
 *    en tiempo de cálculo, la declaración entera se descarta y **la app se queda sin
 *    anillo de foco**, en una interfaz que se navega con el teclado. Sin excepción, sin
 *    error de compilación y sin una sola prueba en rojo. → `sin tokens colgantes`.
 *
 * 2. **La paleta oscura se queda a medias.** Todo token de COLOR se declara dos veces —en
 *    `:root` y en el bloque `prefers-color-scheme: dark`— y quien aplica una paleta nueva
 *    suele terminar el bloque claro y dejar el oscuro con la mitad. Como la app sigue al
 *    sistema, en un equipo en tema claro eso se entrega y nadie lo ve nunca.
 *    → `todo color se redefine en oscuro`.
 *
 * 3. **Un color se cuela fuera de `base.css`.** La cabecera de ese archivo promete que
 *    todo el color vive ahí y que la paleta está medida en WCAG; un hex suelto en otra
 *    hoja queda fuera de la medición y fuera de la sustitución. → `el color vive en un
 *    solo archivo`.
 *
 * Lo que estas pruebas NO prueban: que la paleta nueva tenga contraste suficiente. Eso se
 * mide, no se afirma, y la medición vive en la maqueta.
 */

import { readFileSync, readdirSync } from 'node:fs';
import * as path from 'node:path';

import { describe, expect, it } from 'vitest';

const DIRECTORIO = path.resolve(__dirname, '../../src/renderer/estilos');
const HOJAS = readdirSync(DIRECTORIO)
  .filter((nombre) => nombre.endsWith('.css'))
  .sort();

function leer(nombre: string): string {
  return readFileSync(path.join(DIRECTORIO, nombre), 'utf8');
}

/** `--x: valor;` — la declaración. */
function definidos(css: string): Set<string> {
  return new Set([...css.matchAll(/(--[a-z0-9-]+)\s*:/g)].map((m) => m[1] as string));
}

/**
 * `var(--x)` SIN respaldo. Los `var(--x, algo)` se excluyen a propósito: ahí el autor ya
 * dijo qué pasa si el token no existe, y eso es legítimo.
 */
function usadosSinRespaldo(css: string): string[] {
  return [...css.matchAll(/var\(\s*(--[a-z0-9-]+)\s*([,)])/g)]
    .filter((m) => m[2] === ')')
    .map((m) => m[1] as string);
}

/** El cuerpo de un bloque `@media`, contando llaves. Un `indexOf('}')` cortaría al primer token. */
function cuerpoDelBloque(css: string, cabecera: string): string {
  const inicio = css.indexOf(cabecera);
  if (inicio < 0) return '';
  const abre = css.indexOf('{', inicio);
  let profundidad = 0;
  for (let i = abre; i < css.length; i += 1) {
    if (css[i] === '{') profundidad += 1;
    else if (css[i] === '}') {
      profundidad -= 1;
      if (profundidad === 0) return css.slice(abre + 1, i);
    }
  }
  return '';
}

/** ¿El valor de este token es un color? Los de tamaño (`px`, `ch`) no se redefinen en oscuro. */
function esColor(valor: string): boolean {
  return /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(|\boklch\(|\bcolor-mix\(/.test(valor);
}

function tokensDeColor(css: string): Set<string> {
  const salida = new Set<string>();
  for (const m of css.matchAll(/(--[a-z0-9-]+)\s*:([^;]*);/g)) {
    if (esColor(m[2] as string)) salida.add(m[1] as string);
  }
  return salida;
}

// --- que el análisis esté vivo ----------------------------------------------

/**
 * Sin esto, el día que alguien renombre la carpeta o cambie la sintaxis de los tokens,
 * los conjuntos salen vacíos y TODAS las afirmaciones de abajo pasan sin haber mirado
 * nada. Una prueba estructural sin control de cobertura es una prueba que da permiso.
 */
describe('el análisis mira hojas de verdad', () => {
  it('encuentra las hojas y encuentra tokens en ellas', () => {
    expect(HOJAS.length).toBeGreaterThanOrEqual(8);
    expect(HOJAS).toContain('base.css');
    expect(definidos(leer('base.css')).size).toBeGreaterThan(30);
    const usos = HOJAS.flatMap((h) => usadosSinRespaldo(leer(h)));
    expect(usos.length).toBeGreaterThan(100);
  });
});

// --- 1 · ningún token colgante ----------------------------------------------

describe('sin tokens colgantes', () => {
  it('cada var(--x) sin respaldo tiene su declaración en alguna hoja', () => {
    const declarados = new Set<string>();
    for (const hoja of HOJAS) for (const t of definidos(leer(hoja))) declarados.add(t);

    const huerfanos: string[] = [];
    for (const hoja of HOJAS) {
      for (const token of usadosSinRespaldo(leer(hoja))) {
        if (!declarados.has(token)) huerfanos.push(`${hoja}: var(${token})`);
      }
    }
    expect(huerfanos).toEqual([]);
  });

  /**
   * El anillo de foco aparte, y por su nombre. La prueba de arriba no lo cubre: quien
   * borre a la vez el token y la regla que lo usa la deja verde y deja la app sin foco
   * visible. Aquí se afirma la CONSECUENCIA —existe un `:focus-visible` que pinta un
   * contorno de grosor no nulo— y eso sobrevive a cualquier renombre de token.
   */
  it('existe un anillo de foco visible en toda la app', () => {
    const base = leer('base.css');
    const regla = /:focus-visible\s*\{([^}]*)\}/.exec(base);
    expect(regla, 'base.css ya no declara ningún :focus-visible').not.toBeNull();
    const cuerpo = regla?.[1] ?? '';
    expect(cuerpo).toMatch(/outline\s*:/);
    expect(cuerpo).not.toMatch(/outline\s*:\s*(none|0)\s*[;}]/);
  });
});

// --- 2 · la paleta oscura completa ------------------------------------------

describe('todo color se redefine en oscuro', () => {
  it('el bloque prefers-color-scheme: dark no deja ningún color del claro sin pareja', () => {
    const base = leer('base.css');
    const oscuro = cuerpoDelBloque(base, '@media (prefers-color-scheme: dark)');
    expect(oscuro, 'base.css ya no trae bloque de tema oscuro').not.toBe('');

    const claro = tokensDeColor(base.slice(0, base.indexOf('@media (prefers-color-scheme: dark)')));
    const enOscuro = definidos(oscuro);
    expect(claro.size).toBeGreaterThan(20);

    const sinPareja = [...claro].filter((t) => !enOscuro.has(t)).sort();
    expect(sinPareja).toEqual([]);
  });

  it('el bloque oscuro no inventa tokens que el claro no tenga', () => {
    const base = leer('base.css');
    const oscuro = cuerpoDelBloque(base, '@media (prefers-color-scheme: dark)');
    const claro = definidos(base.slice(0, base.indexOf('@media (prefers-color-scheme: dark)')));
    const solosEnOscuro = [...definidos(oscuro)].filter((t) => !claro.has(t)).sort();
    // Un token que solo existe en oscuro es un token que en claro no resuelve a nada.
    expect(solosEnOscuro).toEqual([]);
  });
});

// --- 3 · el color en un solo archivo ----------------------------------------

describe('el color vive en un solo archivo', () => {
  it('ninguna hoja fuera de base.css trae un hex', () => {
    const culpables: string[] = [];
    for (const hoja of HOJAS) {
      if (hoja === 'base.css') continue;
      for (const m of leer(hoja).matchAll(/#[0-9a-fA-F]{3,8}\b/g)) {
        culpables.push(`${hoja}: ${m[0]}`);
      }
    }
    expect(culpables).toEqual([]);
  });
});

// --- 4 · el canal de estado no se colapsa (MB) -------------------------------

/**
 * Las dos de abajo cierran el defecto de MB, y son estructurales por la misma razón que
 * las tres de arriba: **el fallo no revienta, se apaga**.
 *
 * Hasta MB, `presentacion.ts` mandaba `iniciado`, `en_pruebas` y `terminado` a la misma
 * silueta `'curso'`. El dominio los distinguía, los tipos compilaban, la app funcionaba y
 * las tres tareas salían en pantalla con el mismo círculo medio relleno. No hay prueba de
 * interfaz que atrape eso: el DOM era correcto, solo era mentira.
 *
 * Se leen los fuentes en vez de importarlos porque lo que se afirma es una propiedad del
 * ARCHIVO —la tabla escrita a mano— y no del valor en tiempo de ejecución. Mismo criterio
 * que `tests/modelo/acceso-tareas.test.ts`.
 */
const RENDERER = path.resolve(__dirname, '../../src/renderer');

/** El cuerpo de un `Record<...> = { ... }` con ese nombre. */
function cuerpoDeTabla(fuente: string, nombre: string): string {
  const inicio = fuente.indexOf(`const ${nombre}`);
  if (inicio < 0) return '';
  const abre = fuente.indexOf('{', inicio);
  return fuente.slice(abre + 1, fuente.indexOf('};', abre));
}

describe('el canal de estado no se colapsa', () => {
  /**
   * Seis estados de tarea, seis siluetas DISTINTAS. Si alguna vez vuelven a compartir
   * forma, el porcentaje seguirá siendo honesto y la pantalla volverá a mentir.
   */
  it('ningún par de estados de tarea comparte forma', () => {
    const fuente = readFileSync(path.join(RENDERER, 'util/presentacion.ts'), 'utf8');
    const cuerpo = cuerpoDeTabla(fuente, 'FORMA_TAREA');
    const pares = [...cuerpo.matchAll(/(\w+)\s*:\s*'([a-z]+)'/g)].map((m) => [m[1], m[2]] as const);

    // Control de cobertura: sin esto, un renombre deja la lista vacía y la prueba pasa sola.
    expect(pares.map(([estado]) => estado)).toEqual([
      'pendiente',
      'iniciado',
      'en_pruebas',
      'terminado',
      'done',
      'cancelada',
    ]);

    const formas = pares.map(([, forma]) => forma);
    const repetidas = formas.filter((f, i) => formas.indexOf(f) !== i);
    expect(repetidas, `estados de tarea que comparten silueta: ${repetidas.join(', ')}`).toEqual([]);
  });

  /**
   * Y cada silueta con su regla de color. Una forma nueva sin `.glifo--x` no falla: hereda
   * el color del texto de la fila y se pinta igual que el título, que es otra manera de
   * desaparecer del canal sin avisar.
   */
  it('cada forma del glifo tiene su regla de color en las hojas', () => {
    const iconos = readFileSync(path.join(RENDERER, 'componentes/iconos.tsx'), 'utf8');
    const union = /export type FormaEstado\s*=([^;]+);/.exec(iconos)?.[1] ?? '';
    const formas = [...union.matchAll(/'([a-z]+)'/g)].map((m) => m[1] as string);
    expect(formas.length).toBe(7);

    const css = HOJAS.map((h) => leer(h)).join('\n');
    const sinRegla = formas.filter((f) => !new RegExp(`\\.glifo--${f}\\s*\\{`).test(css));
    expect(sinRegla, `siluetas sin color propio: ${sinRegla.join(', ')}`).toEqual([]);
  });
});
