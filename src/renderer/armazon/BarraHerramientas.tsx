/**
 * La barra superior: colapsar la lateral, qué se está mirando y «Capturar».
 *
 * «Capturar», no «Agregar» (CLAUDE.md). En E6 la interfaz es de solo lectura, así que el
 * botón se muestra DESHABILITADO y con el motivo en su `title`, en vez de ocultarlo: la
 * pantalla del hito tiene que enseñar la forma final para que se pueda juzgar, y un
 * botón que existe y no hace nada al pulsarlo es peor que uno que se ve apagado y dice
 * por qué.
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

      <button
        type="button"
        className="tb-primario"
        disabled
        title="Capturar tareas llega en E7. Hasta entonces la interfaz no escribe nada."
      >
        Capturar
      </button>
    </header>
  );
}
