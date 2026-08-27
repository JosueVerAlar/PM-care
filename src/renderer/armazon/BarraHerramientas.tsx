/**
 * La barra superior: colapsar la lateral y qué se está mirando. **Sin verbos.**
 *
 * E13 — aquí ya no vive ninguna acción. «Capturar» se mudó al `＋` de cada fila y al
 * «＋ Nueva épica» de la cabecera del árbol, que es donde está la cosa que se va a
 * llenar; «Deshacer» se mudó al menú Edición de la aplicación, que es donde un usuario de
 * macOS lo busca y donde `⌘Z` aparece escrito al lado. La barra solo dice DÓNDE estás:
 * lateral, título, subtítulo y la insignia de solo lectura.
 *
 * La franja de arrastre de la ventana (`titleBarStyle: 'hiddenInset'`) se resuelve en el
 * CSS: la barra entera es arrastrable menos sus controles.
 */

import { IconoLateralColapsar } from '../componentes/iconos';

export function BarraHerramientas({
  titulo,
  subtitulo,
  lateralColapsada,
  alternarLateral,
  soloLectura,
}: {
  titulo: string;
  subtitulo: string | null;
  lateralColapsada: boolean;
  alternarLateral: () => void;
  soloLectura: boolean;
}) {

  return (
    <header className="toolbar">
      <button
        type="button"
        className="tb-boton"
        onClick={alternarLateral}
        aria-pressed={lateralColapsada}
        title={lateralColapsada ? 'Mostrar la barra lateral' : 'Colapsar la barra lateral'}
      >
        <IconoLateralColapsar />
        <span className="solo-lectores">
          {lateralColapsada ? 'Mostrar la barra lateral' : 'Colapsar la barra lateral'}
        </span>
      </button>

      <h1 className="proyecto-actual" title={subtitulo ?? titulo}>
        {titulo}
        {subtitulo !== null && <span className="proyecto-actual__nombre">{subtitulo}</span>}
      </h1>

      <span className="crece" />

      {soloLectura && (
        <span className="insignia-lectura" title="El archivo está en conflicto o no se pudo validar">
          Solo lectura
        </span>
      )}
    </header>

  );
}
