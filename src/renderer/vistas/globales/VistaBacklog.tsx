/**
 * E10c — Backlog del área: todas las tareas de todos los proyectos.
 *
 * Es la única vista que puede pasar de mil filas, y eso manda en tres decisiones:
 *
 * 1. **Agrupar y plegar son la herramienta principal.** Los grupos plegados se DESMONTAN
 *    (ver `GrupoPlegable`), así que cerrar «SICOE» de verdad quita sus filas del DOM.
 * 2. **El filtro se escribe con `useDeferredValue`.** Sobre mil filas, filtrar en cada
 *    tecla congela el campo de texto y el usuario ve sus letras aparecer a destiempo.
 *    Diferir mantiene el campo instantáneo y deja que la lista llegue cuando pueda; es de
 *    React 19, no una dependencia nueva.
 * 3. **No hay virtualización, y el número que lo justifica está en la vista.** Con el
 *    documento real son 35 filas: virtualizar ahora sería complejidad contra un problema
 *    que todavía no existe. La cifra se muestra al pie para que la decisión se pueda
 *    revisar con un dato y no con una suposición.
 *
 * El alcance, la agrupación y el filtrado los resuelve `compartido/dominio/backlog.ts`.
 */

import { useDeferredValue, useId, useMemo, useState } from 'react';

import {
  agruparBacklog,
  filasDeBacklog,
  type AgrupacionBacklog,
  type AlcanceBacklog,
  type FilaBacklog,
} from '../../../compartido/dominio/backlog';
import type { Documento, Fecha } from '../../../compartido/modelo/tipos';
import { ChipBloqueo, ChipNuevo } from '../../componentes/Chips';
import { Glifo } from '../../componentes/iconos';
import {
  etiquetaDeTarea,
  fechaCorta,
  formaDeTarea,
  tareas as cuentaTareas,
} from '../../util/presentacion';
import {
  BotonIrATarea,
  GrupoPlegable,
  Lienzo,
  PanelGlobal,
  VacioGlobal,
} from './piezas';


export function VistaBacklog({ documento, hoy }: { documento: Documento; hoy: Fecha }) {
  const [alcance, setAlcance] = useState<AlcanceBacklog>('todas');
  const [agrupacion, setAgrupacion] = useState<AgrupacionBacklog>('proyecto');
  const [texto, setTexto] = useState('');
  const [plegados, setPlegados] = useState<ReadonlySet<string>>(new Set());
  const idBusqueda = useId();

  // El campo responde a cada tecla; la lista se recalcula cuando puede.
  const filtro = useDeferredValue(texto);

  const { filas, conteo } = useMemo(
    () => filasDeBacklog(documento, hoy, alcance, filtro),
    [documento, hoy, alcance, filtro],
  );
  const grupos = useMemo(() => agruparBacklog(filas, agrupacion), [filas, agrupacion]);

  const alternar = (id: string) =>
    setPlegados((previos) => {
      const siguiente = new Set(previos);
      if (!siguiente.delete(id)) siguiente.add(id);
      return siguiente;
    });

  return (
    <PanelGlobal etiqueta="Backlog del área">
      <header className="cab">
        <h2 className="cab__titulo">Backlog del área</h2>
        {/* El conteo que llevaba la franja del orden: cuántas filas se están viendo de
            cuántas, y cuánto hay capturado en total. */}
        <span className="cab__nota tabular">
          {conteo.visibles} de {conteo.enAlcance} filas
          {filtro.trim() !== '' && ' tras el filtro'} · {conteo.capturadas} capturadas
        </span>

        <span className="crece" />

        <label className="solo-lectores" htmlFor={idBusqueda}>
          Filtrar tareas por texto
        </label>
        <input
          id={idBusqueda}
          type="search"
          className="campo-filtro"
          value={texto}
          placeholder="Filtrar por título, id, proyecto o persona"
          onChange={(evento) => setTexto(evento.target.value)}
        />

        <div className="alternador" role="group" aria-label="Alcance">
          <button
            type="button"
            aria-pressed={alcance === 'todas'}
            onClick={() => setAlcance('todas')}
          >
            Todas
          </button>
          <button
            type="button"
            aria-pressed={alcance === 'sin-comprometer'}
            onClick={() => setAlcance('sin-comprometer')}
          >
            Sin comprometer
          </button>
        </div>

        <span className="cab__nota">Agrupar por</span>
        <div className="alternador" role="group" aria-label="Criterio de agrupación">
          {(
            [
              ['proyecto', 'Proyecto'],
              ['responsable', 'Responsable'],
              ['estado', 'Estado'],
            ] as const
          ).map(([id, etiqueta]) => (
            <button
              key={id}
              type="button"
              aria-pressed={agrupacion === id}
              onClick={() => setAgrupacion(id)}
            >
              {etiqueta}
            </button>
          ))}
        </div>
      </header>


      {filas.length === 0 ? (
        <VacioGlobal
          titulo={
            filtro.trim() === ''
              ? 'Nada que mostrar con este alcance'
              : `Ninguna tarea coincide con «${filtro.trim()}»`
          }
          queHacer={
            filtro.trim() === ''
              ? alcance === 'sin-comprometer'
                ? 'Todo lo abierto ya está comprometido en el sprint activo. Cambia el alcance a «Todas» para ver también lo hecho y lo cancelado.'
                : 'Todavía no hay tareas capturadas. Abre un proyecto y captura su primera épica con el botón «Capturar».'
              : 'El filtro busca en el título, el id, el proyecto, la épica, la historia y el nombre del responsable. Borra el texto para ver todo otra vez.'
          }
          {...(filtro.trim() === ''
            ? {}
            : { accion: { texto: 'Borrar el filtro', alPulsar: () => setTexto('') } })}
        />
      ) : (
        <Lienzo>
          {grupos.map((grupo) => {
            const abierto = !plegados.has(grupo.id);
            const titulo =
              grupo.estado !== null
                ? etiquetaDeTarea(grupo.estado)
                : (grupo.nombre ?? 'Sin asignar');
            return (
              <GrupoPlegable
                key={grupo.id}
                clase="grupo grupo--backlog"
                abierto={abierto}
                alternar={() => alternar(grupo.id)}
                cabecera={
                  <>
                    <span className="grupo__titulo">{titulo}</span>
                    <span className="grupo__n tabular">{cuentaTareas(grupo.filas.length)}</span>
                    {grupo.personaId === null && grupo.nombre === null && grupo.estado === null && (
                      <span className="grupo__nota">nadie las tiene asignadas</span>
                    )}
                    <span className="crece" />
                  </>
                }
              >
                {grupo.filas.map((fila) => (
                  <Fila key={fila.ubicacion.tarea.id} fila={fila} agrupacion={agrupacion} />
                ))}
              </GrupoPlegable>
            );
          })}
        </Lienzo>
      )}


    </PanelGlobal>
  );
}

function Fila({ fila, agrupacion }: { fila: FilaBacklog; agrupacion: AgrupacionBacklog }) {
  const { tarea, proyecto } = fila.ubicacion;

  return (
    <div className={`fila-backlog${fila.nuevo ? ' fila-backlog--nuevo' : ''}`}>
      {/* CANAL 1 · estado: la forma del glifo, en su columna fija. */}
      <Glifo forma={formaDeTarea(tarea.estado)} etiqueta={etiquetaDeTarea(tarea.estado)} />

      <span className="fila-backlog__titulo" title={tarea.titulo}>
        {tarea.titulo}
      </span>

      {/* CANAL 2 · procedencia. */}
      {fila.nuevo && <ChipNuevo />}
      {/* CANAL 3 · bloqueo: cuadrito + palabra + días. Nunca el color solo. */}
      {fila.bloqueo !== null && (
        <ChipBloqueo diasBloqueada={fila.diasDetenida ?? 0} motivo={fila.bloqueo.motivo} />
      )}
      {fila.enSprintActivo && (
        <span className="chip chip--neutro" title="Comprometida en el sprint activo">
          En sprint
        </span>
      )}

      {/* El dato del criterio por el que se agrupa ya está en la cabecera del grupo: se
          omite en la fila para no repetir la misma palabra cuarenta veces. */}
      {agrupacion !== 'proyecto' && <span className="fila-backlog__proy">{proyecto.clave}</span>}
      {agrupacion !== 'responsable' && (
        <span
          className={`fila-backlog__quien${fila.responsable === null ? ' fila-backlog__falta' : ''}`}
          // La columna es estrecha a propósito; el nombre completo tiene que seguir
          // alcanzable con el ratón cuando se recorta.
          title={fila.responsable ?? 'Sin responsable asignado'}
        >
          {fila.responsable ?? 'sin asignar'}
        </span>
      )}

      <span className={`fila-backlog__fecha tabular${fila.vencida ? ' fila-backlog__vencida' : ''}`}>
        {fila.fechaLimite === null
          ? ''
          : fila.vencida
            ? `venció ${fechaCorta(fila.fechaLimite)}`
            : fechaCorta(fila.fechaLimite)}
      </span>

      <span className="clave">{tarea.id}</span>
      <BotonIrATarea ubicacion={fila.ubicacion} clase="fila-backlog__ir" texto="Ir" />
    </div>
  );
}
