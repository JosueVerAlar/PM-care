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
 *
 * ## E7 — este panel es la zona de soltar
 *
 * Soltar una tarea aquí ES el compromiso: entra al sprint en el acto y el formulario se
 * abre después, dentro de su propia tarjeta y con el foco puesto. Que el formulario
 * pudiera cancelar el movimiento convertiría diez tareas en diez negociaciones.
 *
 * El resaltado se controla con un contador de profundidad y no con un booleano:
 * `dragenter` y `dragleave` se disparan también al cruzar los hijos de la zona, y con un
 * booleano el panel parpadea cada vez que el cursor pasa por encima de una tarjeta.
 */

import { useMemo, useRef, useState } from 'react';

import {
  compromisoEfectivo,
  contarTareas,
  indexarTareas,
  rutaDe,
} from '../../../compartido/dominio/derivar';
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
import { useAccionesSprint } from '../../estado/acciones-sprint';
import { useAccionesInterfaz, useInterfaz } from '../../estado/interfaz';
import { chipDeArrastre, esArrastreDeTarea, TIPO_TAREA } from '../../util/arrastre';
import {
  etiquetaDeTarea,
  fechaCorta,
  formaDeTarea,
  instanteCorto,
  ordinal,
} from '../../util/presentacion';
import { FormularioCompromiso } from './FormularioCompromiso';

export interface PropsPanelSprint {
  documento: Documento;
  sprint: Sprint | undefined;
  /** Clave del proyecto que se está mirando. Filtra cuando el conmutador está en «solo». */
  clave: string;
  soloEsteProyecto: boolean;
  cambiarAlcance: (soloEsteProyecto: boolean) => void;
  hoy: Fecha;
  /** `false` en solo lectura: ni se suelta, ni se saca, ni se edita el compromiso. */
  editable: boolean;
  /**
   * `false` cuando este panel está oculto por el umbral de 1040 px. El formulario de
   * compromiso se muda entonces al pie del árbol: montarlo aquí además lo duplicaría, y
   * dos formularios sobre la misma tarea se pisan el foco y guardan dos veces.
   */
  dosPaneles: boolean;
}

export function PanelSprint({
  documento,
  sprint,
  clave,
  soloEsteProyecto,
  cambiarAlcance,
  hoy,
  editable,
  dosPaneles,
}: PropsPanelSprint) {
  const { arrastre, redaccion } = useInterfaz();
  const { arrastrar } = useAccionesInterfaz();
  const acciones = useAccionesSprint(sprint);

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

  const indice = useMemo(() => indexarTareas(documento), [documento]);

  const avance = useMemo(() => contarTareas(filas.map((f) => f.ubicacion.tarea)), [filas]);
  const bloqueadas = filas.filter((f) => estaBloqueada(f.ubicacion.tarea)).length;
  const noPlaneadas = filas.filter((f) => mostrarProcedencia(f.ubicacion.tarea)).length;

  // --- zona de soltar -------------------------------------------------------
  const [sobre, setSobre] = useState(false);
  const profundidad = useRef(0);

  /** Solo se acepta lo que viene del ÁRBOL. Una tarjeta arrastrada dentro del propio
   *  panel no tiene destino aquí: reordenar el sprint no es de esta etapa. */
  const aceptaSoltar =
    editable && sprint !== undefined && sprint.estado !== 'cerrado' && arrastre?.origen === 'arbol';

  const limpiarZona = () => {
    profundidad.current = 0;
    setSobre(false);
  };

  const zona = aceptaSoltar
    ? {
        onDragEnter: () => {
          profundidad.current += 1;
          setSobre(true);
        },
        onDragLeave: () => {
          profundidad.current -= 1;
          if (profundidad.current <= 0) limpiarZona();
        },
        onDragOver: (evento: React.DragEvent) => {
          if (!esArrastreDeTarea(evento.dataTransfer)) return;
          // Sin este `preventDefault` el navegador no dispara `drop`. Es el punto en el
          // que se atasca todo el que implementa arrastre nativo por primera vez.
          evento.preventDefault();
          evento.dataTransfer.dropEffect = 'move';
        },
        onDrop: (evento: React.DragEvent) => {
          evento.preventDefault();
          limpiarZona();
          arrastrar(null);
          const id = evento.dataTransfer.getData(TIPO_TAREA);
          const ubicacion = id === '' ? undefined : indice.get(id);
          if (ubicacion !== undefined) void acciones.mover(ubicacion.tarea);
        },
      }
    : {};

  const clasesPanel = ['panel', 'panel--sprint'];
  if (sobre) clasesPanel.push('panel--soltar');

  return (
    <section
      className={clasesPanel.join(' ')}
      aria-label="Sprint activo"
      {...zona}
    >
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
              ? 'Arrastra una tarea del árbol hasta aquí, o enfócala y pulsa S. Cambia a «Todo el sprint» para ver lo comprometido en los demás proyectos.'
              : 'Todavía no se comprometió ninguna tarea. Arrastra una del árbol, o enfócala y pulsa S.'}
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
                editable={editable}
                sprint={sprint}
                acciones={acciones}
                redactando={
                  dosPaneles &&
                  redaccion?.tipo === 'compromiso' &&
                  redaccion.tareaId === fila.item.tarea_id
                }
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
  editable: boolean;
  sprint: Sprint;
  acciones: ReturnType<typeof useAccionesSprint>;
  redactando: boolean;
}

function TarjetaSprint({
  fila,
  documento,
  nombres,
  hoy,
  mostrarProyecto,
  editable,
  sprint,
  acciones,
  redactando,
}: PropsTarjeta) {
  const { arrastre } = useInterfaz();
  const { arrastrar, redactar, irANodo, irASiguiente } = useAccionesInterfaz();
  const { nodoActivo } = useInterfaz();
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

  const clases = ['tarjeta'];
  if (nuevo) clases.push('tarjeta--nuevo');
  if (arrastre?.tareaId === tarea.id) clases.push('tarjeta--arrastrando');
  if (redactando) clases.push('tarjeta--redactando');

  return (
    <li
      className={clases.join(' ')}
      draggable={editable && sprint.estado !== 'cerrado'}
      onDragStart={(evento) => {
        evento.dataTransfer.setData(TIPO_TAREA, tarea.id);
        evento.dataTransfer.effectAllowed = 'move';
        chipDeArrastre(evento, tarea.titulo);
        arrastrar({ tareaId: tarea.id, origen: 'sprint' });
      }}
      onDragEnd={() => arrastrar(null)}
    >
      <div className="tarjeta__cab">
        <Glifo forma={formaDeTarea(tarea.estado)} etiqueta={etiquetaDeTarea(tarea.estado)} />
        <span className="tarjeta__titulo">{tarea.titulo}</span>
        {editable && (
          <div className="tarjeta__acciones">
            {!redactando && (
              <button
                type="button"
                className="mini"
                onClick={() => redactar({ tipo: 'compromiso', tareaId: tarea.id })}
              >
                {responsable === null && cuando === null ? 'Completar' : 'Editar'}
              </button>
            )}
            <button
              type="button"
              className="mini"
              title="Sacarla del sprint. Lo escrito se conserva en la tarea."
              onClick={() => void acciones.sacar(tarea.id)}
            >
              Sacar
            </button>
          </div>
        )}
        <span className="clave">{tarea.id}</span>
      </div>

      <p className="tarjeta__ruta" title={ruta.join(' › ')}>
        {migaja}
      </p>

      {redactando ? (
        <FormularioCompromiso
          tarea={tarea}
          item={item}
          personas={documento.personas}
          finDeSprint={sprint.fin}
          hoy={hoy}
          // Al cerrar, el foco vuelve a la fila del árbol de la que salió la tarea. Sin
          // esto se queda en el `body` y el siguiente `S` no tiene sobre qué actuar: la
          // cadena «↓ · S · Enter» se rompe justo en la segunda tarea.
          cerrar={(avanzar) => {
            redactar(null);
            // Solo se avanza si el compromiso salió de ESTA fila del árbol: si vino de un
            // arrastre con el ratón desde otro sitio, mover el foco del árbol sería
            // teletransportar al usuario a una fila que no estaba mirando.
            if (avanzar && nodoActivo === tarea.id) irASiguiente();
            else irANodo(tarea.id);
          }}
        />
      ) : (
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
      )}

      {bloqueo && (
        <TiraBloqueo diasBloqueada={diasBloqueada(tarea, hoy) ?? 0} motivo={bloqueo.motivo} />
      )}
    </li>
  );
}
