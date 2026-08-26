/**
 * E12a — el Sprint global: el sprint activo entero, con los once proyectos mezclados.
 *
 * Es la vista que faltaba. El sprint de este usuario es transversal por diseño —una sola
 * quincena que cruza todos los proyectos—, así que verlo únicamente filtrado dentro de
 * cada proyecto es exactamente lo contrario de lo que el sprint significa.
 *
 * ## El conmutador «Solo lo mío», activo por omisión
 *
 * No es una preferencia: es la contención de un riesgo concreto. Si el sprint junta
 * tareas de once proyectos y de cinco personas, abrirlo sin filtro deja de contestar «qué
 * me toca a mí esta semana» y pasa a contestar «qué le toca al área» — que es una
 * pregunta legítima, pero es la de la vista de Carga, no la de esta. El conmutador lleva
 * el CONTEO en la etiqueta para que un filtro que deja la vista vacía se vea antes de
 * pulsarlo, y cuando esconde tareas lo dice con un corte al final de la lista en vez de
 * dejar que el usuario crea que el sprint es más pequeño de lo que es.
 *
 * **Quién es «yo»** no está en el esquema, así que se deduce (`personaPorOmision`) y se
 * puede corregir ahí mismo, en la línea del resumen. Una suposición que se puede cambiar
 * en un clic es honesta; una suposición escondida no.
 *
 * ## Lo que no calcula
 *
 * Nada. Las filas llegan de `dominio/sprint.ts` con el compromiso efectivo resuelto, el
 * bloqueo, los arrastres y si venció; la tarjeta es la misma pieza que usa el panel del
 * proyecto.
 */

import { useMemo } from 'react';

import { primerSprintPlaneado } from '../../../compartido/dominio/cierre';
import { sprintActivo } from '../../../compartido/dominio/derivar';
import {
  filasDePersona,
  filasDeSprint,
  personaPorOmision,
  progresoDelSprint,
  resumirSprint,
} from '../../../compartido/dominio/sprint';
import type { Documento, Fecha } from '../../../compartido/modelo/tipos';
import { Medidor } from '../../componentes/Medidor';
import { TarjetaSprint } from '../../componentes/TarjetaSprint';
import { useAccionesSprint } from '../../estado/acciones-sprint';
import { useAccionesInterfaz, useInterfaz } from '../../estado/interfaz';
import { useMutar, useSoloLectura } from '../../estado/mutaciones';
import { cuenta, fechaCorta } from '../../util/presentacion';
import { FormularioCompromiso } from '../proyecto/FormularioCompromiso';
import { CapturaEnSprint } from './CapturaEnSprint';
import { Lienzo, NotaPie, PanelGlobal, VacioGlobal } from './piezas';

export function VistaSprintGlobal({ documento, hoy }: { documento: Documento; hoy: Fecha }) {
  const { soloMio, yo, redaccion } = useInterfaz();
  const { cambiarAlcanceMio, elegirYo, redactar, verCierre } = useAccionesInterfaz();
  const soloLectura = useSoloLectura();
  const mutar = useMutar();

  const sprint = useMemo(() => sprintActivo(documento), [documento]);
  const acciones = useAccionesSprint(sprint);

  const todas = useMemo(() => filasDeSprint(documento, sprint, hoy), [documento, sprint, hoy]);

  // Quién soy: lo que el usuario eligió, y si no eligió nada, lo que se deduce del
  // documento vigente. Mismo criterio que el proyecto seleccionado.
  const deducida = useMemo(() => personaPorOmision(documento), [documento]);
  const yoEfectivo = yo ?? deducida;
  const nombreYo =
    documento.personas.find((persona) => persona.id === yoEfectivo)?.nombre ?? null;

  const mias = useMemo(() => filasDePersona(todas, yoEfectivo), [todas, yoEfectivo]);
  // Sin nadie a quien llamar «yo» el filtro no puede significar nada, y se apaga: mejor
  // enseñar el sprint entero que una pantalla vacía por una suposición que no se pudo hacer.
  const filtrando = soloMio && yoEfectivo !== null;
  const filas = filtrando ? mias : todas;
  const resumen = useMemo(() => resumirSprint(filas), [filas]);
  const progreso = useMemo(() => (sprint ? progresoDelSprint(sprint, hoy) : null), [sprint, hoy]);

  const editable = !soloLectura && sprint !== undefined && sprint.estado !== 'cerrado';
  const capturando = redaccion?.tipo === 'capturaSprint';

  const planeado = useMemo(
    () => (sprint === undefined ? primerSprintPlaneado(documento) : undefined),
    [documento, sprint],
  );

  if (sprint === undefined) {
    return (
      <PanelGlobal etiqueta="Sprint">
        <header className="cab">
          <h2 className="cab__titulo">Sin sprint activo</h2>
        </header>
        <VacioGlobal
          titulo="No hay ningún sprint activo"
          queHacer={
            planeado !== undefined ? (
              <>
                {planeado.nombre} está planeado con {cuenta(planeado.items.length, 'tarea', 'tareas')}{' '}
                dentro. Actívalo para volver a comprometer; los sprints cerrados siguen
                guardados y son inmutables.
              </>
            ) : (
              <>
                Los sprints cerrados siguen guardados y son inmutables. No hay ninguno
                planeado todavía: se crea solo al cerrar el activo, con lo que quede
                pendiente.
              </>
            )
          }
          {...(planeado !== undefined && !soloLectura
            ? {
                accion: {
                  texto: `Activar ${planeado.nombre}`,
                  alPulsar: () =>
                    void mutar(
                      { comando: 'activarSprint', sprintId: planeado.id },
                      `Activar ${planeado.nombre}`,
                    ),
                },
              }
            : {})}
        />
      </PanelGlobal>
    );
  }

  return (
    <PanelGlobal etiqueta="Sprint">
      <header className="cab">
        <h2 className="cab__titulo">
          {sprint.nombre} · {fechaCorta(sprint.inicio)}–{fechaCorta(sprint.fin)}
          {progreso !== null && (
            <span className="cab__nota tabular">
              {' '}
              · día {progreso.dia} de {progreso.dias}
              {progreso.vencido && ' (pasado de fecha)'}
            </span>
          )}
        </h2>
        <span className="crece" />

        <div className="alternador" role="group" aria-label="Alcance del sprint">
          <button
            type="button"
            aria-pressed={filtrando}
            disabled={yoEfectivo === null}
            title={
              yoEfectivo === null
                ? 'Nadie está en el equipo de ningún proyecto, así que no se puede deducir quién eres.'
                : `Solo las tareas de ${nombreYo ?? yoEfectivo}`
            }
            onClick={() => cambiarAlcanceMio(true)}
          >
            Solo lo mío <span className="alternador__n">{mias.length}</span>
          </button>
          <button type="button" aria-pressed={!filtrando} onClick={() => cambiarAlcanceMio(false)}>
            Todo el sprint <span className="alternador__n">{todas.length}</span>
          </button>
        </div>

        {editable && (
          <button
            type="button"
            className="cab__accion"
            aria-expanded={capturando}
            onClick={() => redactar(capturando ? null : { tipo: 'capturaSprint' })}
          >
            Capturar en el sprint
          </button>
        )}
        {editable && (
          <button type="button" className="cab__accion" onClick={() => verCierre(sprint.id)}>
            Cerrar sprint
          </button>
        )}
      </header>

      {todas.length > 0 && (
        <div className="resumen">
          {/* El resumen describe lo que SE VE. Con el filtro puesto y nada que enseñar,
              una fila de ceros con su medidor «sin desglosar» parecería un fallo de la
              app en vez de lo que es: que a esta persona no le tocó nada. */}
          {filas.length === 0 ? (
            <span className="tabular">
              Ninguna de las {cuenta(todas.length, 'tarea', 'tareas')} de {sprint.nombre} es de
              esta persona.
            </span>
          ) : (
            <>
              <Medidor avance={resumen.avance} />
              <span className="tabular">
                {resumen.avance.enCurso} en curso ·{' '}
                {cuenta(resumen.bloqueadas, 'bloqueada', 'bloqueadas')} ·{' '}
                {cuenta(resumen.noPlaneadas, 'no planeada', 'no planeadas')}
                {resumen.vencidas > 0 && (
                  <>
                    {' · '}
                    <span className="resumen__alerta">
                      {cuenta(resumen.vencidas, 'vencida', 'vencidas')}
                    </span>
                  </>
                )}
              </span>
            </>
          )}
          <span className="crece" />
          {/* Quién es «yo» se corrige aquí, junto al filtro que lo usa, y no en una
              pantalla de ajustes: es el único sitio donde el dato significa algo. */}
          {filtrando && (
            <label className="quien-soy">
              <span className="quien-soy__etq">Filtrado a</span>
              <select
                value={yoEfectivo ?? ''}
                onChange={(evento) => elegirYo(evento.target.value)}
                aria-label="De quién son las tareas que se muestran"
              >
                {documento.personas
                  .filter((persona) => persona.activa || persona.id === yoEfectivo)
                  .map((persona) => (
                    <option key={persona.id} value={persona.id}>
                      {persona.nombre}
                      {persona.activa ? '' : ' (inactiva)'}
                    </option>
                  ))}
              </select>
            </label>
          )}
        </div>
      )}

      {capturando && (
        <CapturaEnSprint
          documento={documento}
          sprint={sprint}
          hoy={hoy}
          cerrar={(tareaId) => {
            // Al terminar se abre el compromiso de la tarea recién creada: capturar y
            // decir quién y para cuándo son un mismo movimiento, igual que al soltar una
            // tarea en el panel del proyecto.
            if (tareaId === null) redactar(null);
            else redactar({ tipo: 'compromiso', tareaId });
          }}
        />
      )}

      <Lienzo>
        {todas.length === 0 ? (
          <VacioGlobal
            titulo={`${sprint.nombre} está vacío`}
            queHacer={
              <>
                Todavía no hay nada comprometido esta quincena. Arrastra tareas al sprint desde
                el árbol de cualquier proyecto, o captura aquí mismo lo que acabe de llegar.
              </>
            }
            {...(editable
              ? {
                  accion: {
                    texto: 'Capturar en el sprint',
                    alPulsar: () => redactar({ tipo: 'capturaSprint' }),
                  },
                }
              : {})}
          />
        ) : filas.length === 0 ? (
          <VacioGlobal
            titulo={`Nada tuyo en ${sprint.nombre}`}
            queHacer={
              <>
                {nombreYo ?? 'La persona seleccionada'} no es responsable de ninguna de las{' '}
                {cuenta(todas.length, 'tarea comprometida', 'tareas comprometidas')} esta quincena.
                No es un error de la app: es el dato. Cambia de persona ahí arriba si te
                equivocaste de quién eres, o mira el sprint entero.
              </>
            }
            accion={{ texto: 'Ver todo el sprint', alPulsar: () => cambiarAlcanceMio(false) }}
          />
        ) : (
          <>
            <ul className="lista-sprint">
              {filas.map((fila) => {
                const { tarea } = fila.ubicacion;
                const redactando =
                  redaccion?.tipo === 'compromiso' && redaccion.tareaId === tarea.id;
                return (
                  <TarjetaSprint
                    key={fila.item.tarea_id}
                    fila={fila}
                    mostrarProyecto
                    arrastrando={false}
                    acciones={
                      editable
                        ? {
                            editar: () => redactar({ tipo: 'compromiso', tareaId: tarea.id }),
                            sacar: () => void acciones.sacar(tarea.id),
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
                          // Aquí no hay árbol al que devolver el foco: esta vista no lo
                          // tiene montado. Cerrar solo cierra.
                          cerrar={() => redactar(null)}
                        />
                      ) : null
                    }
                  />
                );
              })}
            </ul>

            {/* El corte dice lo que el filtro esconde. Sin él, «Solo lo mío» haría creer
                que el sprint es más pequeño de lo que es, y esa es justo la lectura que
                lleva a comprometer de más. */}
            {filtrando && todas.length > mias.length && (
              <button type="button" className="corte" onClick={() => cambiarAlcanceMio(false)}>
                <b>
                  {cuenta(todas.length - mias.length, 'tarea más', 'tareas más')} en{' '}
                  {sprint.nombre}
                </b>
                , de otras personas
                <span className="crece" />
                Ver todo el sprint
              </button>
            )}
          </>
        )}
      </Lienzo>

      <NotaPie>
        La migaja empieza por el proyecto porque aquí las tareas vienen mezcladas: saber de
        dónde es cada una va antes que saber de qué épica cuelga. Lo capturado directamente en
        el sprint nace marcado como no planeado en los proyectos que ya cerraron su planeación.
      </NotaPie>
    </PanelGlobal>
  );
}
