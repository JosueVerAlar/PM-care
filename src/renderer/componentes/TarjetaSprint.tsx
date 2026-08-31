/**
 * La tarjeta de una tarea comprometida en el sprint. **Una sola**, para los dos sitios
 * que la pintan.
 *
 * El sprint se ve en el panel derecho de un proyecto (filtrado a ese proyecto) y en la
 * vista global (mezclando los once). Antes de E12 cada uno tenía su propia tarjeta, y dos
 * tarjetas son dos sitios donde arreglar el mismo detalle: que «vencida» se mida contra
 * el compromiso efectivo y no contra la fecha de la tarea, que el contador de arrastres se
 * derive, que la banda de procedencia no se pinte sobre una cancelada.
 *
 * No calcula nada: recibe una `FilaSprintVista` con todo resuelto por
 * `compartido/dominio/sprint.ts` y solo decide marcas y clases. Lo único que hace aquí es
 * FORMATO —«vence 28 ago», «cerrada 12 ago»—, que es presentación y no cálculo.
 */

import type { ReactNode } from 'react';

import type { FilaSprintVista } from '../../compartido/dominio/sprint';
import { ChipNeutro, ChipNuevo, TiraBloqueo } from './Chips';
import { Glifo } from './iconos';
import { MenuFila, type ItemMenuFila } from './menu-fila';
import {
  etiquetaDeTarea,
  fechaCorta,
  formaDeTarea,
  instanteCorto,
  ordinal,
} from '../util/presentacion';

/** Lo que se puede hacer con la tarjeta. `null` en solo lectura o en un sprint cerrado. */
export interface AccionesTarjeta {
  /** Abrir el formulario de compromiso sobre esta tarjeta. */
  editar: () => void;
  /** Sacarla del sprint. Lo escrito vive en la tarea, así que no se pierde. */
  sacar: () => void;
  alIniciarArrastre?: (evento: React.DragEvent) => void;
  alTerminarArrastre?: () => void;
}

export interface PropsTarjetaSprint {
  fila: FilaSprintVista;
  /**
   * Con tareas de varios proyectos mezcladas, la migaja empieza por el proyecto: saber de
   * dónde es cada tarea va antes que saber de qué épica cuelga. Dentro de un proyecto ese
   * primer tramo sería la misma palabra en todas las filas, así que se recorta.
   */
  mostrarProyecto: boolean;
  acciones: AccionesTarjeta | null;
  arrastrando: boolean;
  /**
   * El formulario de compromiso, si toca. Lo monta quien sabe dónde va —el panel del
   * sprint o el pie del árbol, según el ancho— porque montarlo en los dos duplicaría el
   * foco y guardaría dos veces.
   */
  formulario: ReactNode | null;
}

export function TarjetaSprint({
  fila,
  mostrarProyecto,
  acciones,
  arrastrando,
  formulario,
}: PropsTarjetaSprint) {
  const { ubicacion, compromiso, responsable, bloqueo, dias, noPlaneada, vencida, pasos, ruta } =
    fila;
  const { tarea } = ubicacion;

  // La ruta llega como `[proyecto, épica, historia]`. Dentro de un proyecto el primer
  // tramo sería la misma palabra en todas las filas; en la vista global es lo primero.
  const resto = ruta.slice(1).join(' › ');

  const cuando =
    tarea.estado === 'done' && tarea.aceptada_en !== null
      ? `cerrada ${instanteCorto(tarea.aceptada_en)}`
      : compromiso.fechaLimite !== null
        ? `${vencida ? 'venció el' : 'vence'} ${fechaCorta(compromiso.fechaLimite)}`
        : null;

  type AccionTarjeta = 'editar' | 'sacar';
  /**
   * UNA acción, con el verbo que corresponde al estado del compromiso: «Completar» cuando
   * está vacío, «Editar» cuando ya hay algo. Es lo que hacía el botón que este menú
   * reemplaza. Dos ítems —uno «Editar» y otro «Completar»— que abren lo mismo obligan a
   * elegir entre dos nombres de la misma cosa.
   *
   * Sin `tecla`: la tarjeta del sprint no tiene manejador de teclado, y la regla 19 pide
   * la tecla al lado porque el menú y el teclado comparten implementación — no para
   * escribir un atajo que no responde.
   */
  const items: ItemMenuFila<AccionTarjeta>[] = [
    {
      accion: 'editar',
      texto: responsable === null && cuando === null ? 'Completar compromiso' : 'Editar compromiso',
      grupo: 'hacer',
    },
    { accion: 'sacar', texto: 'Sacar del sprint', grupo: 'quitar' },
  ];

  const clases = ['tarjeta'];
  if (noPlaneada) clases.push('tarjeta--nuevo');
  if (arrastrando) clases.push('tarjeta--arrastrando');
  if (formulario !== null) clases.push('tarjeta--redactando');

  return (
    <li
      className={clases.join(' ')}
      draggable={acciones?.alIniciarArrastre !== undefined}
      onDragStart={acciones?.alIniciarArrastre}
      onDragEnd={acciones?.alTerminarArrastre}
    >
      <div className="tarjeta__cab">
        <Glifo forma={formaDeTarea(tarea.estado)} etiqueta={etiquetaDeTarea(tarea.estado)} />
        <span className="tarjeta__titulo">{tarea.titulo}</span>
        {acciones !== null && formulario === null && (
          <MenuFila
            identificador={tarea.id}
            items={items}
            clase="tarjeta__menu"
            ejecutar={(accion) => accion === 'sacar' ? acciones.sacar() : acciones.editar()}
          />
        )}
        <span className="clave">{tarea.id}</span>
      </div>

      <p className="tarjeta__ruta" title={`${ubicacion.proyecto.nombre} › ${resto}`}>
        <span>{mostrarProyecto && (
            <>
              <span className="tarjeta__proy">{ubicacion.proyecto.clave}</span>
              {' › '}
            </>
          )}
          {resto}</span>
      </p>

      {formulario ?? (
        <div className="tarjeta__pie">
          {/* Un compromiso a medias se dice, no se rellena con un guion que parece dato. */}
          {responsable === null && cuando === null ? (
            <span className="tarjeta__falta">Falta quién y para cuándo</span>
          ) : (
            <>
              <span className="tarjeta__persona">{responsable?.nombre ?? 'Sin responsable'}</span>
              <span className="tarjeta__sep">·</span>
              <span className={`tabular${vencida ? ' tarjeta__vencida' : ''}`}>
                {cuando ?? 'sin fecha límite'}
              </span>
            </>
          )}
          <span className="crece" />
          {/* Arrastrada: la tarea aparece en más de un sprint. Se deriva, no se marca. */}
          {pasos > 1 && (
            <ChipNeutro
              texto={ordinal(pasos)}
              titulo={`Arrastrada: es el ${ordinal(pasos)} sprint por el que pasa`}
            />
          )}
          {noPlaneada && <ChipNuevo />}
        </div>
      )}

      {bloqueo && <TiraBloqueo diasBloqueada={dias} motivo={bloqueo.motivo} />}
    </li>
  );
}
