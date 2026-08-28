/**
 * La retrospectiva acompaña al registro cerrado sin convertirse en parte del cierre.
 *
 * Se confirma con un botón o con ⌘Enter. No se guarda al perder el foco: además de que
 * un blur no expresa intención, el manejador puede cerrar sobre una versión anterior del
 * estado y perder en silencio el último cambio. La salida queda libre porque la reunión
 * real suele ocurrir después; abrir este editor nunca secuestra la navegación.
 */

import { useEffect, useState } from 'react';

import type { Sprint } from '../../compartido/modelo/tipos';
import { useMutar, useSoloLectura } from '../estado/mutaciones';

export function RetrospectivaSprint({
  sprint,
  abiertaInicialmente = false,
}: {
  sprint: Sprint;
  abiertaInicialmente?: boolean;
}) {
  const mutar = useMutar();
  const soloLectura = useSoloLectura();
  const [editando, setEditando] = useState(abiertaInicialmente);
  const [texto, setTexto] = useState(sprint.retrospectiva ?? '');

  // Una respuesta satisfactoria reemplaza el documento entero. Sin esta sincronización,
  // el editor histórico conservaría una copia vieja al cambiar de sprint sin desmontarse.
  useEffect(() => {
    setTexto(sprint.retrospectiva ?? '');
  }, [sprint.id, sprint.retrospectiva]);

  if (sprint.estado !== 'cerrado') return null;

  const guardar = async () => {
    const normalizado = texto.trim() === '' ? null : texto.trim();
    if (normalizado === sprint.retrospectiva) {
      setEditando(false);
      return;
    }
    const ok = await mutar(
      { comando: 'escribirRetrospectiva', sprintId: sprint.id, texto: normalizado },
      `Retrospectiva de ${sprint.nombre}`,
    );
    if (ok) setEditando(false);
  };

  if (!editando) {
    return (
      <section className="retrospectiva" aria-label={`Retrospectiva de ${sprint.nombre}`}>
        {sprint.retrospectiva === null ? (
          <p className="retrospectiva__vacia">
            <span>Anota qué conviene repetir o cambiar en el próximo sprint.</span>
            <button
              type="button"
              className="boton-texto"
              disabled={soloLectura}
              onClick={() => setEditando(true)}
            >
              Escribir retrospectiva
            </button>
          </p>
        ) : (
          <>
            <div className="retrospectiva__cabecera">
              <h3>Retrospectiva</h3>
              <button
                type="button"
                className="boton-texto"
                disabled={soloLectura}
                onClick={() => setEditando(true)}
              >
                Editar retrospectiva
              </button>
            </div>
            <p className="retrospectiva__texto">{sprint.retrospectiva}</p>
          </>
        )}
      </section>
    );
  }

  return (
    <section className="retrospectiva" aria-label={`Retrospectiva de ${sprint.nombre}`}>
      <label className="campo">
        <span className="campo__etq">Retrospectiva</span>
        <textarea
          rows={5}
          value={texto}
          disabled={soloLectura}
          placeholder="¿Qué funcionó, qué aprendiste y qué cambiarías en el próximo sprint?"
          onChange={(evento) => setTexto(evento.currentTarget.value)}
          onKeyDown={(evento) => {
            if (evento.key === 'Enter' && evento.metaKey) {
              evento.preventDefault();
              void guardar();
            }
          }}
        />
      </label>
      <div className="retrospectiva__acciones">
        <button type="button" className="boton-solido" disabled={soloLectura} onClick={() => void guardar()}>
          Guardar retrospectiva
        </button>
        <button
          type="button"
          className="boton-texto"
          onClick={() => {
            setTexto(sprint.retrospectiva ?? '');
            setEditando(false);
          }}
        >
          Ahora no
        </button>
        <span className="retrospectiva__atajo">⌘Enter para guardar · ⌘Z para deshacer</span>
      </div>
    </section>
  );
}
