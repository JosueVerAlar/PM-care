/**
 * La ÚNICA confirmación de toda la app: borrar un contenedor que se lleva hijos por
 * delante.
 *
 * Nada más pregunta. Cambiar un estado, sacar algo del sprint, renombrar, capturar de
 * más: todo eso lo deshace `⌘Z` en una tecla, y una app que pregunta por todo entrena a
 * pulsar «Aceptar» sin leer — que es exactamente lo que hace peligrosa la única pregunta
 * que sí importa.
 *
 * El texto lleva el CONTEO, no una advertencia genérica: «Borrar E3 y sus 12 tareas»
 * responde la pregunta que el usuario se está haciendo. «¿Estás seguro?» no responde
 * ninguna.
 *
 * Se usa `<dialog>` nativo con `showModal()`: trae atrapado de foco, `Escape` y el fondo
 * inerte sin una línea de JavaScript nuestra ni una librería de modales.
 */

import { useEffect, useRef } from 'react';

export interface PropsDialogoConfirmar {
  titulo: string;
  /** La frase con el conteo dentro. */
  detalle: string;
  /** Texto del botón que destruye. Lleva el verbo, nunca «Aceptar». */
  accion: string;
  confirmar: () => void;
  cancelar: () => void;
}

export function DialogoConfirmar({
  titulo,
  detalle,
  accion,
  confirmar,
  cancelar,
}: PropsDialogoConfirmar) {
  const dialogo = useRef<HTMLDialogElement>(null);
  const cancelarRef = useRef(cancelar);
  cancelarRef.current = cancelar;

  useEffect(() => {
    const nodo = dialogo.current;
    if (nodo === null || nodo.open) return;
    nodo.showModal();
  }, []);

  return (
    <dialog
      ref={dialogo}
      className="dialogo"
      aria-labelledby="dialogo-titulo"
      // `Escape` cierra el `<dialog>` por su cuenta; sin esto el estado de la app se
      // quedaría creyendo que la pregunta sigue abierta.
      onCancel={(evento) => {
        evento.preventDefault();
        cancelarRef.current();
      }}
    >
      <h2 className="dialogo__titulo" id="dialogo-titulo">
        {titulo}
      </h2>
      <p className="dialogo__detalle">{detalle}</p>
      <div className="dialogo__pie">
        <span className="crece" />
        <button type="button" className="boton-texto" onClick={cancelar} autoFocus>
          Cancelar
        </button>
        <button type="button" className="boton-peligro" onClick={confirmar}>
          {accion}
        </button>
      </div>
    </dialog>
  );
}
