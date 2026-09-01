import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const raiz = path.resolve(process.cwd(), 'src/renderer');
const globales = readFileSync(path.join(raiz, 'estilos/globales.css'), 'utf8');
const administracion = readFileSync(path.join(raiz, 'estilos/administracion.css'), 'utf8');
const pantallas = readFileSync(path.join(raiz, 'estilos/pantallas.css'), 'utf8');
const soloLectura = readFileSync(path.join(raiz, 'pantallas/SoloLectura.tsx'), 'utf8');
const avisos = readFileSync(path.join(raiz, 'pantallas/Avisos.tsx'), 'utf8');

/** jsdom no maqueta flex: estas pruebas fijan las declaraciones que evitan la regresión. */
describe('E18 · la tarjeta de equipo conserva ancho legible', () => {
  it('la identidad parte de todo el ancho y la cabecera puede envolver', () => {
    expect(globales).toMatch(/\.equipo__cab\s*\{[^}]*flex-wrap:\s*wrap/s);
    const identidad = administracion.match(/\.equipo__identidad\s*\{([^}]*)\}/s)?.[1] ?? '';
    expect(identidad).toMatch(/flex:\s*1\s+1\s+100%/);
    expect(identidad).not.toMatch(/flex(?:-basis)?\s*:\s*0(?:%|\b)/);
  });

  it('el id del equipo anula el corte letra a letra', () => {
    expect(administracion).toMatch(
      /\.equipo__id\s*\{[^}]*word-break:\s*normal[^}]*overflow-wrap:\s*anywhere/s,
    );
    expect(pantallas.match(/code\s*\{([^}]*)\}/s)?.[1]).not.toMatch(/break-all/);
  });

  it('solo las rutas conservan break-all', () => {
    expect(pantallas).toMatch(/\.solo-lectura code,\s*\.vacio__dato code\s*\{[^}]*word-break:\s*break-all/s);
    expect(soloLectura).toMatch(/className="solo-lectura__[^"]*"[\s\S]*<code>\{ruta\}<\/code>/);
    expect(avisos).toMatch(/className="vacio__dato"[\s\S]*<code>\{ruta\}<\/code>/);
  });
});
