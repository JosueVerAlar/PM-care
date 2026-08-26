/**
 * El panel derecho: el sprint activo como tarjetas planas.
 *
 * Separadas por hairline, sin sombras ni tarjetas flotantes (maqueta E0). Cada tarjeta
 * son tres o cuatro líneas: título con su glifo de estado, la migaja de dónde vive la
 * tarea, el compromiso (quién y para cuándo) y, si aplica, la tira de bloqueo.
 *
 * El conmutador «Solo este proyecto / Todo el sprint» existe porque el sprint del
 * usuario cruza los 11 proyectos: mirando SICOE hace falta poder preguntar «¿y qué más
 * me comprometí esta quincena?» sin salir de la vista.
 *
 * Lo que se pinta sale entero de `clasificar.ts` y `derivar.ts`: `paraVistaSprint`,
 * `compromisoEfectivo`, `rutaDe`, `contarTareas`. Este archivo no cuenta nada por su
 * cuenta.
 */

import { useMemo } from 'react';

import { compromisoEfectivo, contarTareas, rutaDe } from '../../../compartido/dominio/derivar';
import {
  bloqueoAbierto,
  diasBloqueada,
  estaBloqueada,
  mostrarProcedencia,
  paraSprintDeProyecto,
  paraVistaSprint,
  sprintsQueLaTocaron,
  type FilaSprint,
} from '../../../compartido/dominio/clasificar';
import type { Documento, Fecha, Persona, Sprint } from '../../../compartido/modelo/tipos';
import { ChipNeutro, ChipNuevo, TiraBloqueo } from '../../componentes/Chips';
import { Glifo } from '../../componentes/iconos';
import { Medidor } from '../../componentes/Medidor';
import {
  etiquetaDeTarea,
  fechaCorta,
  formaDeTarea,
  instanteCorto,
  ordinal,
} from '../../util/presentacion';

export interface PropsPanelSprint {
  documento: Documento;
  sprint: Sprint | undefined;
  /** Clave del proyecto que se está mirando. Filtra cuando el conmutador está en «solo». */
  clave: string;
  soloEsteProyecto: boolean;
  cambiarAlcance: (soloEsteProyecto: boolean) => void;
  hoy: Fecha;
}

export function PanelSprint({
  documento,
  sprint,
  clave,
  soloEsteProyecto,
  cambiarAlcance,
  hoy,
}: PropsPanelSprint) {
  const filas = useMemo(
    () =>
      soloEsteProyecto
        ? paraSprintDeProyecto(documento, sprint, clave)
        : paraVistaSprint(documento, sprint),
    [documento, sprint, clave, soloEsteProyecto],
  );

  const nombres = useMemo(
    () => new Map(documento.personas.map((p: Persona) => [p.id, p.nombre])),
    [documento.personas],
  );

  const avance = useMemo(() => contarTareas(filas.map((f) => f.ubicacion.tarea)), [filas]);
  const bloqueadas = filas.filter((f) => estaBloqueada(f.ubicacion.tarea)).length;
  const noPlaneadas = filas.filter((f) => mostrarProcedencia(f.ubicacion.tarea)).length;

  return (
    <section className="panel panel--sprint" aria-label="Sprint activo">
      <header className="cab">
        <h2 className="cab__titulo">
          {sprint ? `${sprint.nombre} · ${fechaCorta(sprint.inicio)}–${fechaCorta(sprint.fin)}` : 'Sin sprint activo'}
        </h2>
        <span className="crece" />
        <div className="alternador" role="group" aria-label="Alcance del sprint">
          <button type="button" aria-pressed={soloEsteProyecto} onClick={() => cambiarAlcance(true)}>
            Solo {clave}
          </button>
          <button type="button" aria-pressed={!soloEsteProyecto} onClick={() => cambiarAlcance(false)}>
            Todo el sprint
          </button>
        </div>
      </header>

      {sprint === undefined ? (
        <div className="vacio">
          <p className="vacio__titulo">No hay ningún sprint activo</p>
          <p className="vacio__nota">
            Los sprints cerrados siguen guardados y son inmutables. Abrir uno nuevo llega en E8.
          </p>
        </div>
      ) : filas.length === 0 ? (
        <div className="vacio">
          <p className="vacio__titulo">
            {soloEsteProyecto ? `Nada de ${clave} en este sprint` : 'El sprint está vacío'}
          </p>
          <p className="vacio__nota">
            {soloEsteProyecto
              ? 'Cambia a «Todo el sprint» para ver lo comprometido en los demás proyectos.'
              : 'Todavía no se comprometió ninguna tarea.'}
          </p>
        </div>
      ) : (
        <>
          <div className="resumen">
            <Medidor avance={avance} />
            <span className="tabular">
              {avance.enCurso} en curso · {bloqueadas} bloqueada{bloqueadas === 1 ? '' : 's'} ·{' '}
              {noPlaneadas} no planeada{noPlaneadas === 1 ? '' : 's'}
            </span>
          </div>

          <ul className="lista-sprint">
            {filas.map((fila) => (
              <TarjetaSprint
                key={fila.item.tarea_id}
                fila={fila}
                documento={documento}
                nombres={nombres}
                hoy={hoy}
                mostrarProyecto={!soloEsteProyecto}
              />
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

interface PropsTarjeta {
  fila: FilaSprint;
  documento: Documento;
  nombres: Map<string, string>;
  hoy: Fecha;
  mostrarProyecto: boolean;
}

function TarjetaSprint({ fila, documento, nombres, hoy, mostrarProyecto }: PropsTarjeta) {
  const { item, ubicacion } = fila;
  const { tarea } = ubicacion;
  // El compromiso del item manda; en `null` hereda el de la tarea. Nunca se lee uno solo.
  const compromiso = compromisoEfectivo(item, tarea);
  const bloqueo = bloqueoAbierto(tarea);
  const nuevo = mostrarProcedencia(tarea);
  // Arrastrada = aparece en más de un sprint. Se deriva, no se marca a mano.
  const pasos = sprintsQueLaTocaron(documento, tarea.id).length;

  const ruta = rutaDe(ubicacion);
  const migaja = mostrarProyecto ? ruta.join(' › ') : ruta.slice(1).join(' › ');

  const responsable = compromiso.responsable
    ? (nombres.get(compromiso.responsable) ?? compromiso.responsable)
    : null;
  const cuando =
    tarea.estado === 'hecha' && tarea.hecha_en !== null
      ? `cerrada ${instanteCorto(tarea.hecha_en)}`
      : compromiso.fechaLimite !== null
        ? `vence ${fechaCorta(compromiso.fechaLimite)}`
        : null;
  const vencida =
    compromiso.fechaLimite !== null &&
    compromiso.fechaLimite < hoy &&
    (tarea.estado === 'pendiente' || tarea.estado === 'en_curso');

  return (
    <li className={`tarjeta${nuevo ? ' tarjeta--nuevo' : ''}`}>
      <div className="tarjeta__cab">
        <Glifo forma={formaDeTarea(tarea.estado)} etiqueta={etiquetaDeTarea(tarea.estado)} />
        <span className="tarjeta__titulo">{tarea.titulo}</span>
        <span className="clave">{tarea.id}</span>
      </div>

      <p className="tarjeta__ruta" title={ruta.join(' › ')}>
        {migaja}
      </p>

      <div className="tarjeta__pie">
        {/* Un compromiso a medias se dice, no se rellena con un guion que parece un dato. */}
        {responsable === null && cuando === null ? (
          <span className="tarjeta__falta">Falta quién y para cuándo</span>
        ) : (
          <>
            <span className="tarjeta__persona">{responsable ?? 'Sin responsable'}</span>
            <span className="tarjeta__sep">·</span>
            <span className={`tabular${vencida ? ' tarjeta__vencida' : ''}`}>
              {cuando ?? 'sin fecha'}
            </span>
          </>
        )}
        <span className="crece" />
        {pasos > 1 && (
          <ChipNeutro
            texto={ordinal(pasos)}
            titulo={`Arrastrada: es el ${ordinal(pasos)} sprint por el que pasa`}
          />
        )}
        {nuevo && <ChipNuevo />}
      </div>

      {bloqueo && (
        <TiraBloqueo diasBloqueada={diasBloqueada(tarea, hoy) ?? 0} motivo={bloqueo.motivo} />
      )}
    </li>
  );
}
