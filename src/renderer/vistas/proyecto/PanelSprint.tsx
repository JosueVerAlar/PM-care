/**
 * El panel derecho: el sprint activo como tarjetas planas.
 *
 * Separadas por hairline, sin sombras ni tarjetas flotantes (maqueta E0). Cada tarjeta
 * son tres o cuatro líneas: título con su glifo de estado, la migaja de dónde vive la
 * tarea, el compromiso (quién y para cuándo) y, si aplica, la tira de bloqueo.
 *
 * Lo que se pinta sale entero de `dominio/sprint.ts`: la fila llega con el compromiso
 * efectivo, el nombre del responsable, los días de bloqueo, si venció y por cuántos
 * sprints ha pasado la tarea. Este archivo no cuenta nada por su cuenta, y la tarjeta es
 * la MISMA que usa la vista global.
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

import { primerSprintPlaneado } from '../../../compartido/dominio/cierre';
import { indexarTareas } from '../../../compartido/dominio/derivar';
import { filasDeSprint, resumirSprint } from '../../../compartido/dominio/sprint';
import type { Documento, Fecha, Sprint } from '../../../compartido/modelo/tipos';
import { Medidor } from '../../componentes/Medidor';
import { TarjetaSprint } from '../../componentes/TarjetaSprint';
import { useAccionesSprint } from '../../estado/acciones-sprint';
import { useAccionesInterfaz, useInterfaz } from '../../estado/interfaz';
import { useMutar } from '../../estado/mutaciones';
import { chipDeArrastre, esArrastreDeTarea, TIPO_TAREA } from '../../util/arrastre';
import { cuenta, fechaCorta } from '../../util/presentacion';
import { FormularioCompromiso } from './FormularioCompromiso';
import { FormularioSprint } from './FormularioSprint';

export interface PropsPanelSprint {
  documento: Documento;
  sprint: Sprint | undefined;
  /** Clave del proyecto que se está mirando. */
  clave: string;
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
  hoy,
  editable,
  dosPaneles,
}: PropsPanelSprint) {
  const { arrastre, redaccion, nodoActivo } = useInterfaz();
  const { arrastrar, verCierre, verDetalle, redactar, irANodo, irASiguiente } = useAccionesInterfaz();
  const acciones = useAccionesSprint(sprint);
  const mutar = useMutar();
  const [formularioSprint, setFormularioSprint] = useState<'crear' | 'editar' | null>(null);
  const [menuAbierto, setMenuAbierto] = useState(false);

  /**
   * Con qué sprint se puede empezar cuando no hay ninguno activo. Es el estado en el que
   * queda la app justo después de cerrar, y sin esta salida el usuario se quedaría sin
   * sprint y sin ningún sitio desde donde activar el siguiente: la pantalla de resumen ya
   * no se puede volver a abrir, porque la entrada al cierre solo existe para el activo.
   */
  const planeado = useMemo(
    () => (sprint === undefined ? primerSprintPlaneado(documento, undefined, clave) : undefined),
    [documento, sprint, clave],
  );
  const sprintsDelProyecto = useMemo(
    () => documento.sprints.filter((s) => s.clave === clave),
    [documento.sprints, clave],
  );
  const ultimoCerrado = useMemo(
    () => [...sprintsDelProyecto].filter((s) => s.estado === 'cerrado').sort((a, b) => b.fin.localeCompare(a.fin))[0],
    [sprintsDelProyecto],
  );
  const enEspera = ultimoCerrado?.items.filter((item) => item.desenlace === 'arrastrada').length ?? 0;

  const todas = useMemo(() => filasDeSprint(documento, sprint, hoy), [documento, sprint, hoy]);
  const resumen = useMemo(() => resumirSprint(todas), [todas]);

  const indice = useMemo(() => indexarTareas(documento), [documento]);

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
    <section className={clasesPanel.join(' ')} aria-label="Sprint activo" {...zona}>
      <header className="cab cab--doble">
        <div className="cab__linea">
          <h2 className="cab__titulo">
            {sprint
              ? `${sprint.nombre} · ${fechaCorta(sprint.inicio)}–${fechaCorta(sprint.fin)}`
              : 'Sin sprint activo'}
          </h2>
        </div>
        <div className="cab__linea cab__linea--controles">
        {/* La entrada al cierre vive donde el usuario mira el sprint. No confirma nada
            aquí: abre la pantalla de decisiones, que es donde está la consecuencia. */}
        {sprint !== undefined && sprint.estado !== 'cerrado' && editable && (
          <button type="button" className="cab__accion" onClick={() => verCierre(sprint.id)}>
            Cerrar sprint
          </button>
        )}
        {editable && (sprint === undefined || sprint.estado !== 'cerrado') && (
          <div className="menu-sprint">
            <button type="button" className="cab__accion" aria-label={`Acciones de sprint de ${clave}`} aria-expanded={menuAbierto} onClick={() => setMenuAbierto((v) => !v)}>⋯</button>
            {menuAbierto && <div className="menu-sprint__lista">
              {sprint !== undefined && <button type="button" onClick={() => { setFormularioSprint('editar'); setMenuAbierto(false); }}>Editar sprint…</button>}
              <button type="button" onClick={() => { setFormularioSprint('crear'); setMenuAbierto(false); }}>Crear el siguiente…</button>
            </div>}
          </div>
        )}
        </div>
      </header>

      {formularioSprint !== null && (
        <FormularioSprint documento={documento} clave={clave} hoy={hoy}
          {...(formularioSprint === 'editar' && sprint !== undefined ? { sprint } : {})}
          cerrar={() => setFormularioSprint(null)} />
      )}

      {sprint === undefined ? (
        <div className="vacio">
          <p className="vacio__titulo">{planeado ? `${planeado.nombre} está planeado` : ultimoCerrado ? `El último sprint de ${clave} cerró el ${fechaCorta(ultimoCerrado.fin)}` : `${clave} no tiene ningún sprint todavía`}</p>
          <p className="vacio__nota">{planeado
            ? `${cuenta(planeado.items.length, 'tarea', 'tareas')} esperan el inicio de esta quincena.`
            : ultimoCerrado
              ? `${cuenta(enEspera, 'tarea', 'tareas')} pasaron al siguiente sprint y están esperando planeación.`
              : `Un sprint es una quincena de compromisos de ${clave}: qué tareas se harán, quién las toma y para cuándo.`}</p>
          {/* Activar es un acto aparte de cerrar, y por eso está aquí y no encadenado al
              cierre. El botón dice a cuál y con cuánto dentro. */}
          {formularioSprint === null && planeado !== undefined && editable && (
            <button
              type="button"
              className="boton-solido"
              onClick={() =>
                void mutar(
                  { comando: 'activarSprint', sprintId: planeado.id },
                  `Activar ${planeado.nombre}`,
                )
              }
            >
              Activar {planeado.nombre}
            </button>
          )}
          {formularioSprint === null && planeado === undefined && editable && (
            <button type="button" className="boton-solido" onClick={() => setFormularioSprint('crear')}>
              {ultimoCerrado ? 'Crear el siguiente sprint' : `Crear el primer sprint de ${clave}`}
            </button>
          )}
        </div>
      ) : todas.length === 0 ? (
        <div className="vacio">
          <p className="vacio__titulo">El sprint está vacío</p>
          <p className="vacio__nota">
            Todavía no se comprometió ninguna tarea. Arrastra una del árbol, o enfócala y pulsa S.
          </p>
        </div>
      ) : (
        <>
          <div className="resumen">
            <Medidor avance={resumen.avance} />
            <span className="tabular">
              {resumen.avance.enCurso} en curso ·{' '}
              {cuenta(resumen.bloqueadas, 'bloqueada', 'bloqueadas')} ·{' '}
              {cuenta(resumen.noPlaneadas, 'no planeada', 'no planeadas')}
            </span>
          </div>

          <ul className="lista-sprint">
            {todas.map((fila) => {
              const { tarea } = fila.ubicacion;
              const redactando =
                dosPaneles && redaccion?.tipo === 'compromiso' && redaccion.tareaId === tarea.id;
              return (
                <TarjetaSprint
                  key={fila.item.tarea_id}
                  fila={fila}
                  mostrarProyecto={false}
                  arrastrando={arrastre?.tareaId === tarea.id}
                  abrirDetalle={() => verDetalle({ id: tarea.id, clase: 'tarea' })}
                  acciones={
                    editable && sprint.estado !== 'cerrado'
                      ? {
                          editar: () => redactar({ tipo: 'compromiso', tareaId: tarea.id }),
                          sacar: () => void acciones.sacar(tarea.id),
                          alIniciarArrastre: (evento) => {
                            evento.dataTransfer.setData(TIPO_TAREA, tarea.id);
                            evento.dataTransfer.effectAllowed = 'move';
                            chipDeArrastre(evento, tarea.titulo);
                            arrastrar({ tareaId: tarea.id, origen: 'sprint' });
                          },
                          alTerminarArrastre: () => arrastrar(null),
                        }
                      : null
                  }
                  formulario={
                    redactando ? (
                      <FormularioCompromiso
                        tarea={tarea}
                        item={fila.item}
                        personas={documento.personas}
                        finDeSprint={sprint.fin}
                        hoy={hoy}
                        // Al cerrar, el foco vuelve a la fila del árbol de la que salió la
                        // tarea. Sin esto se queda en el `body` y el siguiente `S` no tiene
                        // sobre qué actuar: la cadena «↓ · S · Enter» se rompe en la segunda.
                        cerrar={(avanzar) => {
                          redactar(null);
                          // Solo se avanza si el compromiso salió de ESTA fila del árbol: si
                          // vino de un arrastre con el ratón desde otro sitio, mover el foco
                          // sería teletransportar al usuario a una fila que no miraba.
                          if (avanzar && nodoActivo === tarea.id) irASiguiente();
                          else irANodo(tarea.id);
                        }}
                      />
                    ) : null
                  }
                />
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}
