/**
 * E12a — el Sprint global: TODO lo comprometido ahora mismo, con los proyectos mezclados.
 *
 * Es la vista que faltaba. El sprint de este usuario es transversal por diseño —una sola
 * quincena que cruza todos los proyectos—, así que verlo únicamente filtrado dentro de
 * cada proyecto es exactamente lo contrario de lo que el sprint significa.
 *
 * ## Son VARIOS sprints, y la vista lo dice
 *
 * Desde «sprints por proyecto» cada proyecto abre y cierra su propia quincena. Esta vista
 * tomaba `sprintsActivos(doc)[0]` y pintaba solo ese: con sprint abierto en SICOE,
 * EVENTOS y ENCUESTA, el usuario veía únicamente SICOE y lo demás no parecía «sin
 * comprometer», parecía inexistente. Ahora se agregan todos, y las cosas que solo tienen
 * sentido sobre UNO —el día X de Y, cerrar el sprint— solo aparecen cuando hay uno.
 *
 * Cada fila sabe de qué sprint sale (`fila.sprint`), y eso es lo que permite sacar una
 * tarjeta de EVENTOS sin mandarle el id del sprint de SICOE.
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

import { sprintsActivos } from '../../../compartido/dominio/derivar';
import {
  filasDePersona,
  filasDeSprints,
  personaPorOmision,
  progresoDelSprint,
  resumirSprint,
} from '../../../compartido/dominio/sprint';
import type { Documento, Fecha } from '../../../compartido/modelo/tipos';
import { Medidor } from '../../componentes/Medidor';
import { TarjetaSprint } from '../../componentes/TarjetaSprint';
import { useAccionesSprint } from '../../estado/acciones-sprint';
import { useAccionesInterfaz, useInterfaz } from '../../estado/interfaz';
import { useSoloLectura } from '../../estado/mutaciones';
import { cuenta, fechaCorta } from '../../util/presentacion';
import { FormularioCompromiso } from '../proyecto/FormularioCompromiso';
import { CapturaEnSprint } from './CapturaEnSprint';
import { Lienzo, PanelGlobal, VacioGlobal } from './piezas';


export function VistaSprintGlobal({ documento, hoy }: { documento: Documento; hoy: Fecha }) {
  const { soloMio, yo, redaccion } = useInterfaz();
  const { cambiarAlcanceMio, elegirYo, redactar, verCierre } = useAccionesInterfaz();
  const soloLectura = useSoloLectura();

  const sprints = useMemo(() => sprintsActivos(documento), [documento]);
  /**
   * El sprint, cuando hay UNO y solo uno. Es lo que hace falta para las cosas que no
   * tienen sentido sobre varios: el nombre en la cabecera, el «día 4 de 14» y el botón de
   * cerrar. Con tres quincenas abiertas no existe «el» sprint, y fingir que sí —tomando
   * el primero— es justo el defecto que esta vista tenía.
   */
  const unico = sprints.length === 1 ? sprints[0] : undefined;
  // Solo se usa `sacarDe`, que no depende de ningún sprint concreto: cada tarjeta pasa el
  // suyo. Por eso el hook recibe `undefined` y no un sprint elegido al azar.
  const acciones = useAccionesSprint(undefined);

  const todas = useMemo(() => filasDeSprints(documento, sprints, hoy), [documento, sprints, hoy]);

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
  const progreso = useMemo(() => (unico ? progresoDelSprint(unico, hoy) : null), [unico, hoy]);

  const editable = !soloLectura && sprints.length > 0;
  const capturando = redaccion?.tipo === 'capturaSprint';

  /** El rango que cubren todas las quincenas abiertas. Con una, es la suya. */
  const rango = useMemo(() => {
    if (sprints.length === 0) return null;
    const inicio = sprints.reduce((min, s) => (s.inicio < min ? s.inicio : min), sprints[0]!.inicio);
    const fin = sprints.reduce((max, s) => (s.fin > max ? s.fin : max), sprints[0]!.fin);
    return { inicio, fin };
  }, [sprints]);

  if (sprints.length === 0) {
    return (
      <PanelGlobal etiqueta="Sprint">
        <header className="cab">
          <h2 className="cab__titulo">Sin sprint activo</h2>
        </header>
        <VacioGlobal
          titulo="No hay ningún sprint activo"
          queHacer={
            <>
              Los sprints cerrados siguen guardados y son inmutables. Cada proyecto abre
              el suyo desde su propio panel.
            </>
          }
        />
      </PanelGlobal>
    );
  }

  return (
    <PanelGlobal etiqueta="Sprint">
      <header className="cab">
        <h2 className="cab__titulo">
          {unico
            ? `${unico.nombre} · ${fechaCorta(unico.inicio)}–${fechaCorta(unico.fin)}`
            : `${cuenta(sprints.length, 'sprint activo', 'sprints activos')} · ${fechaCorta(rango!.inicio)}–${fechaCorta(rango!.fin)}`}
          {progreso !== null && (
            <span className="cab__nota tabular">
              {' '}
              · día {progreso.dia} de {progreso.dias}
              {progreso.vencido && ' (pasado de fecha)'}
            </span>
          )}
        </h2>
        {/* Con varias quincenas abiertas se nombran, o «3 sprints activos» no dice de qué
            proyectos. Cada una lleva su clave porque el sprint es de un proyecto. */}
        {unico === undefined && (
          <span className="cab__nota" title={sprints.map((s) => s.nombre).join(' · ')}>
            {sprints.map((s) => s.clave ?? s.nombre).join(' · ')}
          </span>
        )}
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
        {/* Cerrar solo cuando hay uno: con tres abiertos, «Cerrar sprint» tendría que
            elegir por el usuario. Cada proyecto cierra el suyo desde su propio panel, que
            es donde se ve lo que ese cierre se lleva por delante. */}
        {editable && unico !== undefined && (
          <button type="button" className="cab__accion" onClick={() => verCierre(unico.id)}>
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
              Ninguna de las {cuenta(todas.length, 'tarea comprometida', 'tareas comprometidas')} es
              de esta persona.
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
          sprints={sprints}
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
            titulo={
              unico ? `${unico.nombre} está vacío` : 'Ningún sprint activo tiene nada dentro'
            }
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
            titulo="Nada tuyo en los sprints abiertos"
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
                    // La clave lleva el sprint: la misma tarea puede estar en dos sprints
                    // activos si alguien la comprometió en dos proyectos distintos, y con
                    // `tarea_id` a secas React vería dos hijos con la misma clave.
                    key={`${fila.sprint.id}·${fila.item.tarea_id}`}
                    fila={fila}
                    mostrarProyecto
                    arrastrando={false}
                    acciones={
                      editable
                        ? {
                            editar: () => redactar({ tipo: 'compromiso', tareaId: tarea.id }),
                            // El sprint sale de la FILA, no de la vista: sacar una tarjeta
                            // de EVENTOS con el id del sprint de SICOE fallaba en el
                            // reductor, y en silencio para quien miraba.
                            sacar: () => void acciones.sacarDe(tarea.id, fila.sprint.id),
                          }
                        : null
                    }
                    formulario={
                      redactando ? (
                        <FormularioCompromiso
                          tarea={tarea}
                          item={fila.item}
                          personas={documento.personas}
                          finDeSprint={fila.sprint.fin}
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
                <b>{cuenta(todas.length - mias.length, 'tarea más', 'tareas más')} comprometidas</b>
                , de otras personas
                <span className="crece" />
                Ver todo el sprint
              </button>
            )}
          </>
        )}
      </Lienzo>


    </PanelGlobal>
  );
}
