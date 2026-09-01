import { useEffect, useRef, useState } from 'react';

export interface PropsDialogoEliminarCerrado {
  id: string;
  titulo: string;
  tareas: number;
  sprints: readonly { id: string; nombre: string }[];
  cancelar: () => void;
  confirmar: () => void;
}

/** La confirmación fuerte para borrar items que forman parte de un sprint cerrado. */
export function DialogoEliminarCerrado({
  id,
  titulo,
  tareas,
  sprints,
  cancelar,
  confirmar,
}: PropsDialogoEliminarCerrado) {
  const [escrito, setEscrito] = useState('');
  const dialogo = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const nodo = dialogo.current;
    if (nodo !== null && !nodo.open) nodo.showModal();
  }, []);

  return (
    <dialog
      ref={dialogo}
      className="dialogo"
      role="dialog"
      aria-modal="true"
      aria-labelledby="eliminar-cerrado-titulo"
      onCancel={(evento) => {
        evento.preventDefault();
        cancelar();
      }}
    >
      <h2 className="dialogo__titulo" id="eliminar-cerrado-titulo">
        Borrar {id} · {titulo}
      </h2>
      <p className="dialogo__detalle">
        {tareas > 1 ? `Se eliminarán ${tareas} tareas. ` : ''}
        {sprints.map((sprint) => `${id} forma parte del sprint cerrado ${sprint.nombre} (${sprint.id}). Su item se eliminará de ese sprint.`).join(' ')}
      </p>
      <label className="campo">
        <span className="campo__etq">Escribe confirmar para continuar</span>
        <input autoFocus value={escrito} onChange={(evento) => setEscrito(evento.target.value)} />
      </label>
      <div className="dialogo__pie">
        <span className="crece" />
        <button type="button" className="boton-texto" onClick={cancelar}>Cancelar</button>
        <button
          type="button"
          className="boton-peligro"
          disabled={escrito !== 'confirmar'}
          onClick={confirmar}
        >
          Borrar definitivamente
        </button>
      </div>
    </dialog>
  );
}
