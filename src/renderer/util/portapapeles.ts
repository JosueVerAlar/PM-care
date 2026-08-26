/**
 * Copiar texto al portapapeles, con la caída que hace falta de verdad.
 *
 * `navigator.clipboard` exige contexto seguro. En desarrollo la app vive en
 * `http://localhost`, que sí lo es, y empaquetada vive en `file://`, que en Chromium
 * también lo es — pero el permiso puede negarse igual, y una promesa rechazada que nadie
 * atrapa deja el botón diciendo «Copiado» sobre un portapapeles vacío. Por eso hay una
 * segunda vía (`execCommand('copy')`, obsoleta pero viva en Chromium) y por eso la función
 * devuelve si funcionó en vez de tragarse el fallo.
 *
 * No toca la red: `connect-src 'none'` (regla 11) sigue intacto.
 */

export async function copiarTexto(texto: string): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      await navigator.clipboard.writeText(texto);
      return true;
    }
  } catch {
    // Cae a la segunda vía. El motivo no se muestra: al usuario le sirve saber si se
    // copió o no, no el nombre del error del navegador.
  }
  return copiarConSeleccion(texto);
}

/**
 * La vía vieja: un `textarea` fuera de pantalla, seleccionar y `execCommand`.
 *
 * Se posiciona con `fixed` y opacidad cero en vez de `display: none` porque un elemento no
 * pintado no se puede seleccionar, y sin selección no hay nada que copiar.
 */
function copiarConSeleccion(texto: string): boolean {
  if (typeof document === 'undefined') return false;
  const campo = document.createElement('textarea');
  campo.value = texto;
  campo.setAttribute('readonly', '');
  campo.setAttribute('aria-hidden', 'true');
  campo.style.position = 'fixed';
  campo.style.top = '0';
  campo.style.left = '0';
  campo.style.opacity = '0';
  document.body.appendChild(campo);
  try {
    campo.select();
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    document.body.removeChild(campo);
  }
}
