import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const base = readFileSync(path.resolve(process.cwd(), 'src/renderer/estilos/base.css'), 'utf8');
const sprint = readFileSync(path.resolve(process.cwd(), 'src/renderer/estilos/sprint.css'), 'utf8');
const edicion = readFileSync(path.resolve(process.cwd(), 'src/renderer/estilos/edicion.css'), 'utf8');

function cuerpoDe(css: string, selector: string): string {
  const escapado = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regla = new RegExp(`${escapado}\\s*\\{([^}]*)\\}`).exec(css);
  expect(regla, `no se encontró la regla ${selector}`).toBeTruthy();
  return (regla as RegExpExecArray)[1] as string;
}

function pixeles(propiedad: string, cuerpo: string): number[] {
  const valor = new RegExp(`${propiedad}:\\s*([^;]+)`).exec(cuerpo)?.[1] ?? '';
  return [...valor.matchAll(/(\d+(?:\.\d+)?)px/g)].map((coincidencia) => Number(coincidencia[1]));
}

describe('E15 · el panel del sprint cabe en su suelo', () => {
  it('las pistas duras, su separación y el relleno no superan el suelo leído del panel', () => {
    const suelo = Number(/clamp\((\d+)px,\s*26%,\s*420px\)/.exec(base)?.[1]);
    const formulario = cuerpoDe(sprint, '.form-sprint');
    const fechas = cuerpoDe(sprint, '.form-sprint__fechas');
    const campoFecha = cuerpoDe(sprint, '.form-sprint__fechas .campo');
    const baseFecha = pixeles('flex', campoFecha)[0] ?? 0;
    const separacion = pixeles('gap', fechas)[0] ?? 0;
    const rellenos = pixeles('padding', formulario);
    const rellenoHorizontal = rellenos.length === 1 ? rellenos[0]! * 2 : (rellenos[1] ?? 0) * 2;

    expect(suelo).toBeGreaterThan(0);
    expect(baseFecha * 2 + separacion + rellenoHorizontal).toBeLessThanOrEqual(suelo);
    // No mide layout real ni el ancho intrínseco que Chromium asigne a un date: fija
    // únicamente que nuestras pistas duras no vuelvan a exceder el suelo declarado.
  });

  it.each([
    [sprint, '.form-sprint__fecha'],
    [sprint, '.form-sprint__acciones'],
    [sprint, '.resumen'],
    [sprint, '.tarjeta__pie'],
    [edicion, '.compromiso__pie'],
  ])('%s declara flex-wrap en %s', (css, selector) => {
    expect(cuerpoDe(css, selector)).toMatch(/flex-wrap:\s*wrap/);
  });

  it('el formulario puede crecer y la lista absorbe el alto con scroll', () => {
    const formulario = cuerpoDe(sprint, '.form-sprint');
    expect(formulario).not.toMatch(/(^|;)\s*height:/);
    expect(formulario).not.toMatch(/overflow:\s*hidden/);
    expect(cuerpoDe(sprint, '.lista-sprint')).toMatch(/overflow-y:\s*auto/);
  });

  it('las columnas flexibles del panel usan minmax(0, 1fr)', () => {
    const reglasDeProyecto = [...base.matchAll(/grid-template-columns:\s*([^;]+clamp\(340px[^;]+);/g)]
      .map((coincidencia) => coincidencia[1] as string);
    expect(reglasDeProyecto.length).toBeGreaterThan(0);
    for (const columnas of reglasDeProyecto) {
      expect(columnas).not.toMatch(/(^|\s)1fr(\s|$)/);
    }
  });

  it('el botón sólido crece si su etiqueta envuelve', () => {
    const boton = cuerpoDe(edicion, '.boton-solido');
    expect(boton).toMatch(/min-height:\s*28px/);
    expect(boton).not.toMatch(/(^|;)\s*height:/);
  });

  it('la migaja conserva el extremo específico al cortar', () => {
    expect(cuerpoDe(sprint, '.tarjeta__ruta')).toMatch(/direction:\s*rtl/);
    expect(cuerpoDe(sprint, '.tarjeta__ruta > *')).toMatch(/direction:\s*ltr/);
  });

  it('bajo 1040 el mismo formulario baja al pie en vez de ocultarse', () => {
    expect(base).toMatch(/\.panel--sprint\s*\{\s*display:\s*contents/);
    expect(base).toMatch(/\.panel--sprint\s*>\s*\.form-sprint\s*\{[^}]*grid-row:\s*2/s);
  });
});
