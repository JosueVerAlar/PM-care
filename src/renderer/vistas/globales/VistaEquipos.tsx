/**
 * E11b — Equipos: quién está en cada proyecto y con qué rol.
 *
 * ## El modelo, ya decidido por el usuario
 *
 * Las personas son un **catálogo global** y los equipos se arman **por proyecto** tomando
 * de ahí. No hay entidad «equipo» con identidad propia: un equipo ES la lista de miembros
 * de un proyecto. Por eso una misma persona aparece en varios proyectos, y con rol
 * distinto en cada uno.
 *
 * ## Y por eso la pantalla tiene dos mitades
 *
 * La rejilla por proyecto contesta «¿quién está en SICOE?». Pero repartida en tarjetas,
 * que alguien esté en tres equipos con tres roles queda disuelto en tres sitios y no se ve
 * nunca — y es justo el dato que decide si a esa persona se le puede pedir algo más. La
 * primera sección lee la MISMA relación desde la persona. No se duplica ningún dato: las
 * dos salen de `proyecto.equipo`.
 *
 * ## Solo consulta
 *
 * Dar de alta, quitar del equipo o cambiar un rol es E12. Esta pantalla no trae botones
 * que no hagan nada: un control desactivado sin explicación es peor que la ausencia del
 * control.
 */

import { useMemo } from 'react';

import {
  conformacionDeEquipos,
  personasEnEquipos,
} from '../../../compartido/dominio/carga';
import type { Documento } from '../../../compartido/modelo/tipos';
import { useAccionesInterfaz } from '../../estado/interfaz';
import { cuenta, nombreSinClave, tareas as cuentaTareas } from '../../util/presentacion';
import { Lienzo, NotaPie, PanelGlobal, ReglaOrden, VacioGlobal } from './piezas';

export function VistaEquipos({ documento }: { documento: Documento }) {
  const { verProyecto } = useAccionesInterfaz();

  const conformacion = useMemo(() => conformacionDeEquipos(documento), [documento]);
  const personas = useMemo(() => personasEnEquipos(documento), [documento]);

  const conEquipo = conformacion.filter((equipo) => equipo.miembros.length > 0);
  const sinEquipo = conformacion.filter((equipo) => equipo.miembros.length === 0);
  const enVarios = personas.filter((persona) => persona.equipos.length > 1);

  if (documento.personas.length === 0) {
    return (
      <PanelGlobal etiqueta="Equipos">
        <header className="cab">
          <h2 className="cab__titulo">Equipos</h2>
        </header>
        <VacioGlobal
          titulo="No hay personas en el catálogo"
          queHacer={
            <>
              Un equipo es la lista de miembros de un proyecto, y sus miembros salen del
              catálogo global de personas. Da de alta a las personas en el archivo de datos —la
              administración llega en E12— y después arma el equipo de cada proyecto.
            </>
          }
        />
      </PanelGlobal>
    );
  }

  return (
    <PanelGlobal etiqueta="Equipos">
      <header className="cab">
        <h2 className="cab__titulo">
          Equipos · {cuenta(documento.personas.length, 'persona', 'personas')} en{' '}
          {cuenta(conEquipo.length, 'proyecto', 'proyectos')}
        </h2>
      </header>

      <ReglaOrden>
        Una persona puede estar en varios proyectos, con rol distinto en cada uno. La cifra de
        la derecha es su carga abierta <b>en ese proyecto</b>.
      </ReglaOrden>

      <Lienzo>
        {enVarios.length > 0 && (
          <section className="seccion">
            <h3 className="seccion__titulo">
              Personas en más de un equipo
              <span className="seccion__n tabular">
                {enVarios.length} de {personas.length}
              </span>
            </h3>
            <ul className="cruce">
              {enVarios.map((persona) => (
                <li className="cruce__fila" key={persona.personaId}>
                  <span className="cruce__nombre">{persona.nombre}</span>
                  <span className="cruce__equipos">
                    {persona.equipos.map((equipo) => (
                      <span className="chip chip--neutro" key={equipo.clave} title={equipo.nombre}>
                        {equipo.clave}
                        {equipo.rol !== null && ` · ${equipo.rol}`}
                      </span>
                    ))}
                  </span>
                  <span className="crece" />
                  <span className="cruce__carga tabular">
                    {cuentaTareas(persona.abiertas)} abiertas en total
                  </span>
                </li>
              ))}
            </ul>
            <p className="seccion__aclaracion">
              Estar en varios equipos no es un problema por sí mismo; es el contexto que
              explica por qué su carga se ve repartida en la vista de Carga por persona.
            </p>
          </section>
        )}

        <section className="seccion">
          <h3 className="seccion__titulo">
            Equipos por proyecto
            <span className="seccion__n tabular">{conEquipo.length}</span>
          </h3>

          {conEquipo.length === 0 ? (
            <p className="seccion__aclaracion">
              Ningún proyecto tiene equipo capturado todavía. Mientras no lo tengan, la
              pregunta «¿quién está en esto?» solo se puede contestar mirando quién es
              responsable de cada tarea.
            </p>
          ) : (
            <div className="rejilla rejilla--equipos">
              {conEquipo.map((equipo) => (
                <div className="equipo" key={equipo.clave}>
                  <div className="equipo__cab">
                    <button
                      type="button"
                      className="equipo__nombre"
                      title={`Abrir ${equipo.nombre}`}
                      onClick={() => verProyecto(equipo.clave)}
                    >
                      {nombreSinClave(equipo.clave, equipo.nombre) ?? equipo.nombre}
                    </button>
                    <span className="equipo__n tabular">
                      {cuenta(equipo.miembros.length, 'persona', 'personas')}
                    </span>
                  </div>

                  <ul className="equipo__lista">
                    {equipo.miembros.map((miembro) => (
                      <li className="miembro" key={miembro.personaId}>
                        <span className="miembro__inicial" aria-hidden="true">
                          {iniciales(miembro.nombre)}
                        </span>
                        <span className="miembro__datos">
                          <span className="miembro__nombre">{miembro.nombre}</span>
                          <span className="miembro__rol">
                            {miembro.rol ?? 'sin rol anotado'}
                          </span>
                        </span>
                        <span
                          className="miembro__carga tabular"
                          title={`${cuentaTareas(miembro.abiertas)} abiertas en ${equipo.clave}`}
                        >
                          {miembro.abiertas} ab.
                        </span>
                      </li>
                    ))}
                  </ul>

                  {/* No es un error del documento: el responsable de una tarea vieja puede
                      haber salido del equipo. Pero es justo lo que esta pantalla existe
                      para que se revise. */}
                  {equipo.sinRegistrar.length > 0 && (
                    <div className="equipo__aparte">
                      <p className="equipo__aparte-titulo">
                        Con tareas abiertas aquí, sin estar en el equipo
                      </p>
                      {equipo.sinRegistrar.map((persona) => (
                        <p className="equipo__aparte-fila" key={persona.personaId}>
                          <span>{persona.nombre}</span>
                          <span className="crece" />
                          <span className="tabular">{persona.abiertas} ab.</span>
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        {sinEquipo.length > 0 && (
          <section className="seccion">
            <h3 className="seccion__titulo">
              Sin equipo capturado
              <span className="seccion__n tabular">{sinEquipo.length}</span>
            </h3>
            <div className="fichas">
              {sinEquipo.map((equipo) => (
                <button
                  type="button"
                  className="ficha"
                  key={equipo.clave}
                  title={`Abrir ${equipo.nombre}`}
                  onClick={() => verProyecto(equipo.clave)}
                >
                  <span className="ficha__clave">{equipo.clave}</span>
                  {nombreSinClave(equipo.clave, equipo.nombre) ?? equipo.nombre}
                </button>
              ))}
            </div>
          </section>
        )}
      </Lienzo>

      <NotaPie>
        Esta vista es de <b>consulta</b>. Dar de alta personas, armar equipos, cambiar roles y
        cerrar proyectos llegan en E12; hasta entonces se editan en el archivo de datos. El
        equipo no restringe quién puede ser responsable de una tarea: una tarea vieja puede
        apuntar a alguien que ya salió, y eso es correcto.
      </NotaPie>
    </PanelGlobal>
  );
}

/** Dos iniciales para el cuadrito. Es decoración: va con `aria-hidden` y el nombre al lado. */
function iniciales(nombre: string): string {
  return nombre
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((parte) => parte[0] ?? '')
    .join('')
    .toUpperCase();
}
