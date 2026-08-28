/**
 * Cerrar o eliminar un proyecto, desde donde sea que se pida.
 *
 * Estos dos flujos vivían dentro de la fila de `SeccionProyectos`, que era el único sitio
 * desde el que se podían llamar. Al mover el disparador al `⋯` de la lista lateral —donde
 * el proyecto ya se está mirando— la alternativa habría sido copiar la confirmación, y
 * **dos copias de un flujo destructivo es la peor cosa que se puede duplicar en esta app**:
 * el día que una gane una salvaguarda, la otra se queda sin ella y nadie lo nota hasta que
 * borra algo.
 *
 * Así que el flujo se sacó entero aquí y las dos entradas lo llaman. Ni una palabra del
 * texto cambió respecto a lo que ya estaba probado.
 *
 * ## Por qué dos ceremonias distintas
 *
 * **Cerrar es reversible y se dice**: conserva las tareas y el historial, solo saca el
 * proyecto de la vista diaria. Una frase y un botón.
 *
 * **Eliminar no lo es**, y la fricción es intencional: hay que escribir la clave a mano.
 * No es teatro — es la única mutación de toda la app que `⌘Z` no puede revertir una vez
 * escrita en disco, y el texto lo dice con esas palabras en vez de con un «¿estás seguro?»
 * que no responde nada.
 *
 * Se usa `<dialog>` nativo con `showModal()`: trae foco atrapado, `Escape` y el fondo
 * inerte sin una línea de JavaScript nuestra ni una librería de modales.
 */

import { useEffect, useRef, useState } from 'react';

import { contenidoDeProyecto } from '../../compartido/dominio/administracion';
import type { Documento, Proyecto } from '../../compartido/modelo/tipos';
import { cuenta, nombreSinClave } from '../util/presentacion';
import { useMutar } from '../estado/mutaciones';
import { Advertencia, Candado } from './iconos';

export type AccionProyecto = 'cerrar' | 'eliminar';

/**
 * Qué se pierde al eliminar, dicho en objetos y no en adjetivos.
 *
 * «Se borra todo» no deja calcular nada. «Se borran 4 épicas, 9 historias y 27 tareas» sí.
 */
function describirPerdida(proyecto: Proyecto, documento: Documento): string {
  const contenido = contenidoDeProyecto(documento, proyecto);
  if (contenido.tareas === 0 && contenido.epicas === 0 && contenido.historias === 0) {
    return 'un proyecto sin nada capturado';
  }
  const partes = [
    cuenta(contenido.epicas, 'épica', 'épicas'),
    cuenta(contenido.historias, 'historia', 'historias'),
    cuenta(contenido.tareas, 'tarea', 'tareas'),
  ].filter((parte) => !parte.startsWith('0 '));
  return partes.join(', ');
}

export function DialogoProyecto({
  documento,
  proyecto,
  accion,
  cerrar,
}: {
  documento: Documento;
  proyecto: Proyecto;
  accion: AccionProyecto;
  cerrar: () => void;
}) {
  const dialogo = useRef<HTMLDialogElement>(null);
  const cerrarRef = useRef(cerrar);
  cerrarRef.current = cerrar;
  const mutar = useMutar();

  const [escrito, setEscrito] = useState('');
  const contenido = contenidoDeProyecto(documento, proyecto);
  const nombreCorto = nombreSinClave(proyecto.clave, proyecto.nombre) ?? proyecto.nombre;

  useEffect(() => {
    const nodo = dialogo.current;
    if (nodo === null || nodo.open) return;
    nodo.showModal();
  }, []);

  /**
   * Cerrar es reversible: se cierra el diálogo y se manda, sin esperar respuesta.
   *
   * Eliminar NO: si el reductor lo rechaza —una tarea suya vive en un sprint cerrado— el
   * diálogo tiene que quedarse abierto con lo tecleado dentro. Cerrarlo dejaría al usuario
   * mirando una pantalla que no cambió, sin saber si borró o no.
   */
  const cerrarProyecto = () => {
    cerrar();
    void mutar({ comando: 'cerrarProyecto', clave: proyecto.clave }, `Cerrar ${proyecto.clave}`);
  };

  const eliminarProyecto = () => {
    // La confirmación viaja al comando: el reductor vuelve a comprobarla, porque es la
    // última capa antes del disco y un `eliminarProyecto` disparado por un bug de la vista
    // no puede llevarse un año de capturas.
    void mutar(
      {
        comando: 'eliminarProyecto',
        clave: proyecto.clave,
        confirmacion: escrito.trim().toUpperCase(),
      },
      `Eliminar ${proyecto.clave}`,
    ).then((ok) => {
      // Si lo rechazó, se queda abierto con lo tecleado (regla 5): no se revierte lo que el
      // usuario escribió, y el motivo del rechazo ya está en la franja de aviso.
      if (ok) cerrar();
    });
  };

  return (
    <dialog
      ref={dialogo}
      className="dialogo dialogo--proyecto"
      aria-labelledby="dialogo-proyecto-titulo"
      // `Escape` cierra el `<dialog>` por su cuenta; sin esto el estado de la app se
      // quedaría creyendo que la pregunta sigue abierta.
      onCancel={(evento) => {
        evento.preventDefault();
        cerrarRef.current();
      }}
    >
      {accion === 'cerrar' ? (
        <>
          <h2 className="dialogo__titulo" id="dialogo-proyecto-titulo">
            <Candado /> Cerrar {proyecto.clave}
          </h2>
          <p className="dialogo__detalle">
            Cerrar <b>{nombreCorto}</b> conserva sus{' '}
            {cuenta(contenido.tareas, 'tarea', 'tareas')} y su historial, y lo saca del
            Panorama y de la vista diaria. <b>Se puede reabrir cuando quieras.</b>
          </p>
          <div className="dialogo__pie">
            <span className="crece" />
            <button type="button" className="boton-texto" onClick={cerrar} autoFocus>
              Cancelar
            </button>
            <button
              type="button"
              className="boton-solido"
              onClick={cerrarProyecto}
            >
              Cerrar proyecto
            </button>
          </div>
        </>
      ) : (
        <>
          <h2 className="dialogo__titulo" id="dialogo-proyecto-titulo">
            <Advertencia /> Eliminar {proyecto.clave} para siempre
          </h2>
          <p className="dialogo__detalle">
            Se borra <b>{describirPerdida(proyecto, documento)}</b>. Cerrarlo lo habría
            guardado; esto no. <b>No hay deshacer desde la app</b> una vez escrito: solo se
            recupera restaurando un respaldo anterior a este momento.
            {contenido.sprintsCerrados > 0 && (
              <>
                {' '}
                Además,{' '}
                <b>
                  {cuenta(
                    contenido.tareasEnSprintsCerrados,
                    'de sus tareas está',
                    'de sus tareas están',
                  )}{' '}
                  en {cuenta(contenido.sprintsCerrados, 'sprint cerrado', 'sprints cerrados')}
                </b>
                : es muy probable que la app lo rechace para no reescribir lo que esos
                sprints dicen que pasó.
              </>
            )}
          </p>
          <label className="campo campo--clave">
            <span className="campo__etq">Escribe {proyecto.clave} para confirmar</span>
            <input
              type="text"
              value={escrito}
              autoComplete="off"
              spellCheck={false}
              autoFocus
              placeholder={proyecto.clave}
              onChange={(evento) => setEscrito(evento.target.value)}
            />
          </label>
          <div className="dialogo__pie">
            <span className="crece" />
            <button type="button" className="boton-texto" onClick={cerrar}>
              Cancelar
            </button>
            <button
              type="button"
              className="boton-peligro"
              disabled={escrito.trim().toUpperCase() !== proyecto.clave}
              onClick={eliminarProyecto}
            >
              Eliminar {proyecto.clave} para siempre
            </button>
          </div>
        </>
      )}
    </dialog>
  );
}
