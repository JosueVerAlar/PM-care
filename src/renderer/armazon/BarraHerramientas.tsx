/**
 * La barra superior: colapsar la lateral, qué se está mirando, deshacer y «Capturar».
 *
 * «Capturar», no «Agregar» (CLAUDE.md). Desde E7 el botón ESCRIBE, y es contextual: abre
 * la captura dentro de lo que esté seleccionado en el árbol —épica seleccionada, historia
 * nueva; historia o tarea, tarea nueva— y en la raíz del proyecto si no hay nada
 * seleccionado. Es el mismo destino que calcula la tecla `N`, resuelto en un solo sitio
 * (`App.tsx`) para que las dos rutas no puedan divergir.
 *
 * «Deshacer» se muestra aunque exista `⌘Z` porque la pila vive en el proceso principal y
 * se vacía ante un cambio externo del archivo: el botón deshabilitado es lo único que
 * dice «ya no hay nada que deshacer» antes de que el usuario pulse y no pase nada.
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
  puedeDeshacer,
  deshacer,
  capturar,
  queSeCaptura,
}: {
  titulo: string;
  subtitulo: string | null;
  lateralColapsada: boolean;
  alternarLateral: () => void;
  soloLectura: boolean;
  puedeDeshacer: boolean;
  deshacer: () => void;
  /** `null` cuando no hay dónde capturar (una vista global, o solo lectura). */
  capturar: (() => void) | null;
  /** Qué se crearía: «épica en SICOE», «tarea en Grupos de regularización». */
  queSeCaptura: string | null;
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
        className="tb-boton"
        onClick={deshacer}
        disabled={!puedeDeshacer}
        title={
          puedeDeshacer
            ? 'Deshacer el último cambio (⌘Z)'
            : 'No hay nada que deshacer. La pila se vacía si el archivo cambia por fuera.'
        }
      >
        Deshacer
      </button>

      <button
        type="button"
        className="tb-primario"
        disabled={capturar === null}
        onClick={() => capturar?.()}
        title={
          capturar === null
            ? soloLectura
              ? 'La app está en solo lectura: no se escribe nada hasta resolver el archivo.'
              : 'Abre un proyecto para capturar.'
            : `Capturar ${queSeCaptura ?? ''} (N sobre la fila enfocada)`
        }
      >
        Capturar
      </button>
    </header>
  );
}
