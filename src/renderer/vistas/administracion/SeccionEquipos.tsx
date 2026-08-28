/**
 * Administración · Equipos — quién está en cada proyecto y con qué rol, ya editable.
 *
 * ## El modelo, decidido por el usuario y cerrado
 *
 * **Las personas son un catálogo global; los equipos se arman por proyecto tomando de
 * ahí.** No hay entidad «equipo» con identidad propia: un equipo ES la lista de miembros
 * de un proyecto (`proyecto.equipo`). Por eso:
 *
 * - Añadir a alguien a un proyecto es **elegirlo del catálogo**, nunca volver a darlo de
 *   alta. El desplegable de «Agregar» solo ofrece a quien ya existe y está activo.
 * - La misma persona está en varios proyectos **con rol distinto en cada uno**, y eso no
 *   es un error que haya que resolver: es el caso normal.
 * - Crear un equipo no es un comando: es mandar `editarEquipo` sobre un proyecto que
 *   todavía no tenía ninguno.
 *
 * ## Por qué se manda la lista completa
 *
 * `editarEquipo` reemplaza la lista entera del proyecto. Un equipo son cuatro personas:
 * mandar la lista es más simple y más fácil de deshacer que tres comandos de alta, baja y
 * cambio de rol — y sigue sin ser «mandar el documento» (regla 9), porque lo que viaja es
 * una intención con nombre sobre un proyecto concreto.
 *
 * ## Y por eso cada tarjeta dice en qué OTRO equipo está cada quien
 *
 * Repartida en tarjetas por proyecto, la pertenencia múltiple queda disuelta en tres
 * sitios y no se ve nunca; y es justo el dato que decide si a esa persona se le puede
 * pedir algo más.
 */

import { useMemo, useState } from 'react';

import {
  disponiblesParaEquipo,
  equipoDe,
  iniciales,
  type MiembroEditable,
} from '../../../compartido/dominio/administracion';
import { conformacionDeEquipos } from '../../../compartido/dominio/carga';
import type { Documento } from '../../../compartido/modelo/tipos';
import { Equis, Mas } from '../../componentes/iconos';
import { useAccionesInterfaz } from '../../estado/interfaz';
import { useMutar, useSoloLectura } from '../../estado/mutaciones';
import { cuenta, nombreSinClave } from '../../util/presentacion';
import { Lienzo } from '../globales/piezas';


export function SeccionEquipos({ documento }: { documento: Documento }) {
  const soloLectura = useSoloLectura();
  const { verGlobal } = useAccionesInterfaz();

  const activos = useMemo(
    () =>
      documento.proyectos.filter(
        (proyecto) => !proyecto.archivado && proyecto.cerrado_en === null,
      ),
    [documento.proyectos],
  );
  const conformacion = useMemo(() => conformacionDeEquipos(documento), [documento]);
  /** La misma relación leída desde la persona: en cuántos equipos está cada quien. */
  const equiposPorPersona = useMemo(() => {
    const mapa = new Map<string, string[]>();
    for (const proyecto of activos) {
      for (const miembro of proyecto.equipo) {
        mapa.set(miembro.persona_id, [...(mapa.get(miembro.persona_id) ?? []), proyecto.clave]);
      }
    }
    return mapa;
  }, [activos]);

  const conEquipo = activos.filter((proyecto) => proyecto.equipo.length > 0);

  if (documento.personas.length === 0) {
    return (
      <>
        <header className="cab">
          <h2 className="cab__titulo">Equipos</h2>
        </header>
        <Lienzo>
          <div className="vacio">
            <p className="vacio__titulo">No hay personas en el catálogo</p>
            <p className="vacio__nota">
              Un equipo es la lista de miembros de un proyecto, y sus miembros salen del
              catálogo global de personas. Da de alta a alguien en la sección Personas y vuelve.
            </p>
          </div>
        </Lienzo>
      </>
    );
  }

  return (
    <>
      <header className="cab">
        <h2 className="cab__titulo">
          Equipos · {cuenta(conEquipo.length, 'proyecto con equipo', 'proyectos con equipo')} de{' '}
          {activos.length}
        </h2>
        <span className="crece" />
        {/* La vista transversal salió de la lateral (N7) porque se abre una vez al mes.
            Sigue existiendo y se llega desde aquí, que es donde uno ya está pensando en
            equipos: quitarle su sitio en el mapa no es esconderla. */}
        <button type="button" className="cab__accion" onClick={() => verGlobal('equipos')}>
          Ver los once de un vistazo
        </button>
      </header>

      <Lienzo>
        <div className="adm">
          <div className="bloque bloque--ancho">

            {activos.length === 0 ? (
              <p className="bloque__nota">
                No hay proyectos activos. Da de alta uno en la sección Proyectos, o reabre alguno
                de los cerrados.
              </p>
            ) : (
              <div className="rejilla rejilla--equipos">
                {activos.map((proyecto) => (
                  <TarjetaEquipo
                    key={proyecto.clave}
                    documento={documento}
                    clave={proyecto.clave}
                    nombre={nombreSinClave(proyecto.clave, proyecto.nombre) ?? proyecto.nombre}
                    soloLectura={soloLectura}
                    equiposPorPersona={equiposPorPersona}
                    sinRegistrar={
                      conformacion.find((equipo) => equipo.clave === proyecto.clave)
                        ?.sinRegistrar ?? []
                    }
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </Lienzo>


    </>
  );
}

function TarjetaEquipo({
  documento,
  clave,
  nombre,
  soloLectura,
  equiposPorPersona,
  sinRegistrar,
}: {
  documento: Documento;
  clave: string;
  nombre: string;
  soloLectura: boolean;
  equiposPorPersona: ReadonlyMap<string, string[]>;
  sinRegistrar: readonly { personaId: string; nombre: string; abiertas: number }[];
}) {
  const mutar = useMutar();
  const [agregando, setAgregando] = useState(false);
  /** El rol que se está tecleando. Vive aquí, no en el reductor: es texto de formulario. */
  const [rolBorrador, setRolBorrador] = useState<{ id: string; texto: string } | null>(null);

  const miembros = useMemo(() => equipoDe(documento, clave), [documento, clave]);
  const disponibles = useMemo(() => disponiblesParaEquipo(documento, clave), [documento, clave]);
  const nombres = useMemo(
    () => new Map(documento.personas.map((persona) => [persona.id, persona.nombre])),
    [documento.personas],
  );

  /** Todo cambio del equipo es la lista COMPLETA: es lo que el comando reemplaza. */
  const guardar = (lista: MiembroEditable[], contexto: string) =>
    void mutar({ comando: 'editarEquipo', proyecto: clave, miembros: lista }, contexto);

  return (
    <div className="equipo">
      <div className="equipo__cab">
        <p className="equipo__nombre">
          <b>{clave}</b> · {nombre}
        </p>
        <p className="equipo__dedicado">
          {miembros.length === 0 ? (
            <span className="etiqueta etiqueta--vacio">Sin equipo capturado</span>
          ) : (
            cuenta(miembros.length, 'persona', 'personas')
          )}
        </p>
      </div>

      <ul className="equipo__lista">
        {miembros.map((miembro) => {
          const otros = (equiposPorPersona.get(miembro.persona_id) ?? []).filter(
            (otra) => otra !== clave,
          );
          const nombrePersona = nombres.get(miembro.persona_id) ?? miembro.persona_id;
          const editandoRol = rolBorrador?.id === miembro.persona_id;

          return (
            <li className="miembro" key={miembro.persona_id}>
              <span className="miembro__inicial" aria-hidden="true">
                {iniciales(nombrePersona)}
              </span>
              <span className="miembro__datos">
                <span className="miembro__nombre">{nombrePersona}</span>
                <span className="miembro__rol">
                  {soloLectura ? (
                    (miembro.rol ?? 'sin rol')
                  ) : (
                    <input
                      className="miembro__campo"
                      type="text"
                      value={editandoRol ? rolBorrador.texto : (miembro.rol ?? '')}
                      placeholder="sin rol"
                      aria-label={`Rol de ${nombrePersona} en ${clave}`}
                      onChange={(evento) =>
                        setRolBorrador({ id: miembro.persona_id, texto: evento.target.value })
                      }
                      onKeyDown={(evento) => {
                        // Enter solo quita el foco; guardar es cosa del `blur`, para que
                        // Enter no mande el comando dos veces.
                        if (evento.key === 'Enter') evento.currentTarget.blur();
                        if (evento.key === 'Escape') {
                          setRolBorrador(null);
                          evento.currentTarget.blur();
                        }
                      }}
                      // Se lee del DOM y no del estado: `rolBorrador` viene de la
                      // clausura del render, y un blur que llega antes de que React
                      // repinte vería el valor viejo y se tragaría el cambio en silencio.
                      // El campo es la fuente de lo que el usuario acaba de teclear.
                      onBlur={(evento) => {
                        const rol = evento.currentTarget.value.trim();
                        setRolBorrador(null);
                        // Texto libre a propósito: «backend», «vistas», «QA». Vacío = sin
                        // rol, y se guarda como `null`, no como cadena vacía.
                        if ((miembro.rol ?? '') === rol) return;
                        guardar(
                          // Se conserva el miembro entero y solo se cambia `rol`: los
                          // campos que el usuario haya escrito a mano siguen ahí (regla 14).
                          miembros.map((m) =>
                            m.persona_id === miembro.persona_id
                              ? { ...m, rol: rol === '' ? null : rol }
                              : m,
                          ),
                          `Cambiar el rol de ${nombrePersona} en ${clave}`,
                        );
                      }}
                    />
                  )}
                  {otros.length > 0 && (
                    <span className="miembro__tambien" title={`También en ${otros.join(', ')}`}>
                      {' · también en '}
                      {otros.length === 1 ? otros[0] : `${otros.length} equipos`}
                    </span>
                  )}
                </span>
              </span>
              {!soloLectura && (
                <button
                  type="button"
                  className="miembro__quitar"
                  title={`Quitar a ${nombrePersona} del equipo de ${clave}`}
                  aria-label={`Quitar a ${nombrePersona} del equipo de ${clave}`}
                  onClick={() =>
                    guardar(
                      miembros.filter((m) => m.persona_id !== miembro.persona_id),
                      `Quitar a ${nombrePersona} de ${clave}`,
                    )
                  }
                >
                  <Equis />
                </button>
              )}
            </li>
          );
        })}
      </ul>

      {!soloLectura &&
        (agregando ? (
          <div className="equipo__agregar equipo__agregar--abierto">
            {disponibles.length === 0 ? (
              <span className="equipo__nota">
                Todas las personas activas ya están en este equipo. Da de alta a alguien nuevo en
                la sección Personas.
              </span>
            ) : (
              <>
                <label className="campo campo--crece">
                  <span className="campo__etq">Del catálogo de personas</span>
                  <select
                    autoFocus
                    defaultValue=""
                    onChange={(evento) => {
                      const id = evento.target.value;
                      if (id === '') return;
                      setAgregando(false);
                      guardar(
                        [...miembros, { persona_id: id, rol: null }],
                        `Meter a ${nombres.get(id) ?? id} en ${clave}`,
                      );
                    }}
                  >
                    <option value="" disabled>
                      Elige a alguien…
                    </option>
                    {disponibles.map((persona) => (
                      <option key={persona.id} value={persona.id}>
                        {persona.nombre}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            )}
            <button type="button" className="boton-texto" onClick={() => setAgregando(false)}>
              Cancelar
            </button>
          </div>
        ) : (
          <button type="button" className="equipo__agregar" onClick={() => setAgregando(true)}>
            <Mas /> Agregar a alguien
          </button>
        ))}

      {/* No es un error del documento: el responsable de una tarea vieja puede haber salido
          del equipo. Pero es justo lo que esta pantalla existe para que se revise, y ahora
          además se puede arreglar sin salir de aquí. */}
      {sinRegistrar.length > 0 && (
        <div className="equipo__aparte">
          <p className="equipo__aparte-titulo">
            Con tareas abiertas aquí, sin estar en el equipo
          </p>
          {sinRegistrar.map((persona) => (
            <p className="equipo__aparte-fila" key={persona.personaId}>
              <span>{persona.nombre}</span>
              <span className="crece" />
              <span className="tabular">{persona.abiertas} ab.</span>
              {!soloLectura && disponibles.some((d) => d.id === persona.personaId) && (
                <button
                  type="button"
                  className="mini"
                  onClick={() =>
                    guardar(
                      [...miembros, { persona_id: persona.personaId, rol: null }],
                      `Meter a ${persona.nombre} en ${clave}`,
                    )
                  }
                >
                  Meter al equipo
                </button>
              )}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
