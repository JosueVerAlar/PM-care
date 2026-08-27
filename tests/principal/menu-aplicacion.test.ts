/**
 * Contrato del menú de aplicación (E13 · punto 1.6 del rediseño).
 *
 * ## Por qué esto se prueba leyendo el archivo y no ejecutándolo
 *
 * Un menú de macOS **no existe en el DOM**. No lo ve `@testing-library`, no lo ve jsdom,
 * no lo vería una prueba de renderer aunque la hubiera: vive en el proceso principal y lo
 * pinta el sistema operativo. Levantar Electron entero para inspeccionarlo cuesta un
 * arranque real de la app por prueba. Así que aquí se auditan por texto las dos
 * decisiones que, si se olvidan, no fallan: silencian teclas.
 *
 * Es evidencia DÉBIL y hay que decirlo: comprueba que la decisión está escrita, no que
 * funcione. La verificación fuerte son dos gestos de treinta segundos en la app corriendo,
 * anotados abajo en cada prueba.
 *
 * ## Las dos trampas
 *
 * **1 · El acelerador se traga el `⌘Z` de los campos de texto.** Un `MenuItem` con
 * `accelerator: 'CmdOrCtrl+Z'` lo registra de verdad por omisión
 * (`registerAccelerator: true`), y entonces el sistema atiende la tecla ANTES que la
 * página: el `keydown` no llega al renderer. Eso deja sin efecto la guarda que ya existe
 * en `src/renderer/util/atajos.ts` —«dentro de un campo de texto, ⌘Z es el deshacer del
 * propio campo y tiene que seguir siéndolo»— y convierte un intento de corregir una letra
 * mientras se escribe un título en la reversión de la última mutación del documento. Es
 * exactamente el desastre que el comentario de `App.tsx` dice que no puede pasar.
 * La salida es `registerAccelerator: false`: el menú DIBUJA ⌘Z y no lo secuestra, y la
 * tecla sigue llegando al escucha del renderer, que ya sabe distinguir dónde está el foco.
 *
 * **2 · Poner un menú propio apaga el que Electron daba gratis.** El menú por omisión trae
 * el submenú Edición completo, y en macOS **Cortar, Copiar, Pegar y Seleccionar todo son
 * ítems de menú**: sin ellos declarados, `⌘C`/`⌘V`/`⌘X`/`⌘A` dejan de funcionar en todos
 * los campos de la app. Lo mismo con `⌘Q`. No hay error: las teclas simplemente no hacen
 * nada, y en esta app se copian claves (`SICOE-104`) para pegarlas en Jira.
 *
 * Mientras `main.ts` no monte menú propio, estas pruebas pasan sin afirmar nada: el menú
 * por omisión ya cumple las dos cosas. Son una puerta que se cierra sola en cuanto 1.6
 * llegue.
 */

import { readFileSync } from 'node:fs';
import * as path from 'node:path';

import { describe, expect, it } from 'vitest';

const RUTA = path.resolve(__dirname, '../../electron/main.ts');
const FUENTE = readFileSync(RUTA, 'utf8');

/** ¿`main.ts` sustituye el menú por omisión de Electron? */
const MONTA_MENU = /Menu\.setApplicationMenu\s*\(/.test(FUENTE);

describe('el análisis lee el archivo correcto', () => {
  it('main.ts es el proceso principal y se leyó entero', () => {
    expect(FUENTE).toContain('new BrowserWindow');
    expect(FUENTE.length).toBeGreaterThan(2000);
  });
});

/**
 * `skipIf` y no un `return` temprano: mientras no haya menú propio estas pruebas tienen
 * que REPORTARSE COMO SALTADAS, no como verdes. Un verde que no afirmó nada es permiso
 * para no mirar, y estas tres existen precisamente para que alguien mire.
 */
describe.skipIf(!MONTA_MENU)('menú de aplicación', () => {
  it('no le roba ⌘Z a los campos de texto', () => {
    // Todo acelerador de Z declarado en el archivo tiene que venir acompañado de
    // `registerAccelerator: false` dentro del mismo objeto de ítem.
    const aceleradores = [...FUENTE.matchAll(/accelerator\s*:\s*['"`]([^'"`]*[Zz])['"`]/g)];
    expect(
      aceleradores.length,
      'monta menú pero no declara ningún acelerador de deshacer',
    ).toBeGreaterThan(0);

    for (const acelerador of aceleradores) {
      // La ventana de texto alrededor del acelerador: el objeto del ítem donde vive.
      const desde = Math.max(0, (acelerador.index ?? 0) - 600);
      const item = FUENTE.slice(desde, (acelerador.index ?? 0) + 600);
      expect(
        /registerAccelerator\s*:\s*false/.test(item),
        `El ítem con accelerator '${acelerador[1]}' no lleva registerAccelerator: false, así que ` +
          `el sistema atenderá la tecla antes que la página y ⌘Z dejará de ser el deshacer ` +
          `del campo de texto que tenga el foco (ver util/atajos.ts). ` +
          `COMPROBACIÓN MANUAL: renombrar una tarea, teclear, pulsar ⌘Z — debe revertirse ` +
          `la LETRA, no la última mutación del documento.`,
      ).toBe(true);
    }
  });

  it('conserva cortar/copiar/pegar/seleccionar todo', () => {
    // Dos formas válidas: el rol compuesto `editMenu`, o los cuatro sueltos.
    const compuesto = /role\s*:\s*['"`]editMenu['"`]/.test(FUENTE);
    const sueltos = ['cut', 'copy', 'paste', 'selectAll'].filter((rol) =>
      new RegExp(`role\\s*:\\s*['"\`]${rol}['"\`]`).test(FUENTE),
    );
    expect(
      compuesto || sueltos.length === 4,
      `Falta el submenú Edición estándar (role 'editMenu', o los cuatro roles sueltos; ` +
        `encontrados: ${sueltos.join(', ') || 'ninguno'}). Sin ellos, ⌘C/⌘V/⌘X/⌘A dejan de ` +
        `funcionar en TODOS los campos de la app, sin ningún error. ` +
        `COMPROBACIÓN MANUAL: abrir el motivo de un bloqueo, escribir, ⌘A y ⌘C.`,
    ).toBe(true);
  });

  it('deja una salida por ⌘Q', () => {
    const tieneSalida =
      /role\s*:\s*['"`](quit|appMenu)['"`]/.test(FUENTE) ||
      /accelerator\s*:\s*['"`][^'"`]*Q['"`]/.test(FUENTE);
    expect(
      tieneSalida,
      `Sin un ítem de salir, ⌘Q deja de cerrar la app — y ⌘Q es el camino que dispara ` +
        `'before-quit', que es donde se vacía la cola de escritura antes de morir (regla 6).`,
    ).toBe(true);
  });
});
