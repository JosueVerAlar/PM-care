/**
 * Administración · Personas — alta, edición, desactivación, reactivación y eliminación.
 *
 * ## Alta sin ceremonia
 *
 * El nombre y un proyecto inicial opcional. Nada más. **El identificador se deriva solo** del
 * nombre (`Ana García` → `ana-garcia`) y lo emite el reductor: no se le pregunta al
 * usuario por un dato que no le importa y que además no va a poder cambiar nunca —el id
 * está copiado en cada `tarea.responsable` y en cada item de sprint, incluidos los
 * cerrados, así que renombrarlo reescribiría de quién fue el trabajo del mes pasado.
 *
 * ## Desactivar es el camino normal; eliminar es la excepción
 *
 * Y la pantalla lo refleja en la jerarquía, no en un texto de advertencia: **«Dar de
 * baja» está en cada fila activa; «Eliminar» solo existe abajo, en la lista de
 * inactivas.** Es la misma forma que separa cerrar de eliminar en Proyectos: hay que dar
 * de baja antes de poder borrar, dos gestos separados en el tiempo.
 *
 * El reductor rechaza eliminar a alguien con historia y su mensaje dice qué hacer en su
 * lugar. Se muestra tal cual en la franja de aviso; aquí solo se ANTICIPA con qué está
 * atada, para que el usuario no llegue al rechazo sin saber por qué.
 *
 * ## Los equipos se editan desde un solo lugar
 *
 * La ficha solo lee en qué proyectos está una persona. La conformación y el rol se cambian
 * en Equipos, donde la relación se ve completa y no puede quedar a medio editar.
 */

import { useEffect, useMemo, useState } from 'react';

import {
  idSugerido,
  personasParaAdmin,
  type FilaPersonaAdmin,
} from '../../../compartido/dominio/administracion';
import type { Documento } from '../../../compartido/modelo/tipos';
import { Advertencia } from '../../componentes/iconos';
import { useMutar, useSoloLectura } from '../../estado/mutaciones';
import { cuenta, nombreSinClave, tareas as cuentaTareas } from '../../util/presentacion';
import { Lienzo } from '../globales/piezas';

export function SeccionPersonas({ documento }: { documento: Documento }) {
  const mutar = useMutar();
  const soloLectura = useSoloLectura();

  const personas = useMemo(() => personasParaAdmin(documento), [documento]);
  const activas = personas.filter((persona) => persona.activa);
  const inactivas = personas.filter((persona) => !persona.activa);

  /** Los proyectos a los que se puede adscribir a alguien: los que están en marcha. */
  const proyectos = useMemo(
    () =>
      documento.proyectos
        .filter((proyecto) => !proyecto.archivado && proyecto.cerrado_en === null)
        .map((proyecto) => ({
          clave: proyecto.clave,
          nombre: nombreSinClave(proyecto.clave, proyecto.nombre) ?? proyecto.nombre,
        })),
    [documento.proyectos],
  );

  const [nombre, setNombre] = useState('');
  const [proyectoInicial, setProyectoInicial] = useState('');
  const [editando, setEditando] = useState<string | null>(null);
  const [borrando, setBorrando] = useState<string | null>(null);

  const existentes = useMemo(
    () => new Set(documento.personas.map((persona) => persona.id)),
    [documento.personas],
  );
  const idPropuesto = nombre.trim() === '' ? '' : idSugerido(nombre, existentes);
  const puedeCrear = nombre.trim() !== '' && !soloLectura;

  const crear = async () => {
    if (!puedeCrear) return;
    const ok = await mutar(
      {
        comando: 'crearPersona',
        nombre: nombre.trim(),
        equipos: proyectoInicial === '' ? [] : [proyectoInicial],
      },
      `Dar de alta a ${nombre.trim()}`,
    );
    if (!ok) return;
    setNombre('');
    setProyectoInicial('');
  };

  return (
    <>
      <header className="cab">
        <h2 className="cab__titulo">
          Personas · {cuenta(activas.length, 'activa', 'activas')}
          {inactivas.length > 0 && ` · ${cuenta(inactivas.length, 'inactiva', 'inactivas')}`}
        </h2>
      </header>

      <Lienzo>
        <div className="adm">
          <div className="bloque">
            <form
              className="alta"
              onSubmit={(evento) => {
                evento.preventDefault();
                void crear();
              }}
            >
              <p className="alta__titulo">Dar de alta a alguien</p>
              <div className="alta__fila">
                <label className="campo campo--crece">
                  <span className="campo__etq">Nombre</span>
                  <input
                    type="text"
                    value={nombre}
                    autoComplete="off"
                    placeholder="Nombre y apellidos"
                    onChange={(evento) => setNombre(evento.target.value)}
                  />
                </label>
                <button type="submit" className="boton-solido" disabled={!puedeCrear}>
                  Dar de alta
                </button>
              </div>

              <label className="campo">
                <span className="campo__etq">Proyecto inicial (opcional)</span>
                {proyectos.length === 0 ? (
                  <p className="bloque__nota">
                    No hay proyectos activos a los que adscribirla. Se puede dar de alta igual y
                    meterla a un equipo después.
                  </p>
                ) : (
                  <select
                    value={proyectoInicial}
                    onChange={(evento) => setProyectoInicial(evento.target.value)}
                  >
                    <option value="">Sin proyecto inicial</option>
                    {proyectos.map((proyecto) => (
                      <option key={proyecto.clave} value={proyecto.clave}>
                        {proyecto.clave} · {proyecto.nombre}
                      </option>
                    ))}
                  </select>
                )}
              </label>

              <p className="alta__pie">
                El proyecto inicial es opcional. El rol dentro del equipo se pone después,
                desde Equipos; se puede dejar en blanco todo el tiempo que haga falta.
                {idPropuesto !== '' && (
                  <>
                    {' '}
                    Su identificador va a ser <b>{idPropuesto}</b>: se deriva del nombre y{' '}
                    <b>no se puede cambiar</b>, porque es la referencia que guardan las tareas y
                    los sprints ya cerrados. Corregir el nombre después no lo regenera.
                  </>
                )}
              </p>
            </form>

            <div className="marco">
              <div className="tabla-cab">
                <span />
                <span>Persona</span>
                <span>
                  Equipos{' '}
                  <span className="tabla-cab__nota">— una persona puede estar en varios</span>
                </span>
                <span className="tabla-cab__der">Carga abierta</span>
                <span />
              </div>

              {activas.length === 0 ? (
                <p className="bloque__nota bloque__nota--dentro">
                  No hay ninguna persona activa. Da de alta a alguien arriba, o reactiva a
                  alguna de las de abajo.
                </p>
              ) : (
                activas.map((persona) => (
                  <FilaPersona
                    key={persona.id}
                    persona={persona}
                    soloLectura={soloLectura}
                    editando={editando === persona.id}
                    alEditar={() => setEditando(editando === persona.id ? null : persona.id)}
                    alRenombrar={(nuevo) => {
                      setEditando(null);
                      if (nuevo.trim() === '' || nuevo.trim() === persona.nombre) return;
                      void mutar(
                        { comando: 'editarPersona', id: persona.id, nombre: nuevo.trim() },
                        `Renombrar a ${persona.nombre}`,
                      );
                    }}
                    alDesactivar={() =>
                      void mutar(
                        { comando: 'desactivarPersona', id: persona.id },
                        `Dar de baja a ${persona.nombre}`,
                      )
                    }
                  />
                ))
              )}
            </div>
          </div>

          <div className="bloque">
            <p className="bloque__titulo">
              Dadas de baja <span className="bloque__n tabular">{inactivas.length}</span>
            </p>

            {inactivas.length === 0 ? (
              <p className="bloque__nota">Nadie dado de baja.</p>
            ) : (
              <div className="marco">
                {inactivas.map((persona) => (
                  <div className="fila-persona fila-persona--inactiva" key={persona.id}>
                    <span className="fila-persona__inicial" aria-hidden="true">
                      {persona.iniciales}
                    </span>
                    <span className="fila-persona__nombre">{persona.nombre}</span>
                    <span className="fila-persona__equipos">
                      <span className="etiqueta etiqueta--vacio">Sin equipo</span>
                    </span>
                    <span className="fila-persona__carga tabular">
                      {describirAtaduras(persona)}
                    </span>
                    <span className="fila-persona__acciones">
                      {!soloLectura && (
                        <>
                          <button
                            type="button"
                            className="mini"
                            onClick={() =>
                              void mutar(
                                { comando: 'reactivarPersona', id: persona.id },
                                `Reactivar a ${persona.nombre}`,
                              )
                            }
                          >
                            Reactivar
                          </button>
                          <button
                            type="button"
                            className="mini mini--peligro"
                            onClick={() =>
                              setBorrando(borrando === persona.id ? null : persona.id)
                            }
                          >
                            Eliminar…
                          </button>
                        </>
                      )}
                    </span>

                    {borrando === persona.id && (
                      <div className="peligro">
                        <p className="peligro__titulo">
                          <Advertencia /> Eliminar a {persona.nombre} del catálogo
                        </p>
                        <p className="peligro__texto">
                          {persona.sinHistoria ? (
                            <>
                              Nada la nombra: ni una tarea ni un sprint. Se puede borrar sin
                              perder historia. Si vuelve, se da de alta otra vez y recibirá un
                              identificador nuevo.
                            </>
                          ) : (
                            <>
                              <b>Es responsable de {describirAtaduras(persona)}.</b> La app va a
                              rechazar el borrado para no reescribir de quién fue ese trabajo —
                              y con razón: dada de baja ya no recibe nada nuevo y su historia se
                              conserva, que es justo lo que hace falta.
                            </>
                          )}
                        </p>
                        <div className="peligro__fila">
                          <button
                            type="button"
                            className="boton-peligro"
                            onClick={() => {
                              void mutar(
                                { comando: 'eliminarPersona', id: persona.id },
                                `Eliminar a ${persona.nombre}`,
                              ).then((ok) => {
                                if (ok) setBorrando(null);
                              });
                            }}
                          >
                            Eliminar a {persona.nombre}
                          </button>
                          <button
                            type="button"
                            className="boton-texto"
                            onClick={() => setBorrando(null)}
                          >
                            Cancelar
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </Lienzo>


    </>
  );
}

function FilaPersona({
  persona,
  soloLectura,
  editando,
  alEditar,
  alRenombrar,
  alDesactivar,
}: {
  persona: FilaPersonaAdmin;
  soloLectura: boolean;
  editando: boolean;
  alEditar: () => void;
  alRenombrar: (nombre: string) => void;
  alDesactivar: () => void;
}) {
  const [borrador, setBorrador] = useState(persona.nombre);
  // Al abrir la edición se parte del nombre VIGENTE, no del que había la primera vez que
  // se montó la fila: si se renombró y se vuelve a abrir, el campo tiene que traer lo que
  // dice el documento y no un valor que se quedó atrás.
  useEffect(() => {
    if (editando) setBorrador(persona.nombre);
  }, [editando, persona.nombre]);

  const claves = persona.equipos.map((equipo) => equipo.clave);

  return (
    <div className="fila-persona">
      <span className="fila-persona__inicial" aria-hidden="true">
        {persona.iniciales}
      </span>

      <span className="fila-persona__nombre">
        {editando ? (
          <input
            className="fila-persona__campo"
            type="text"
            value={borrador}
            autoFocus
            aria-label={`Nombre de ${persona.nombre}`}
            onChange={(evento) => setBorrador(evento.target.value)}
            onKeyDown={(evento) => {
              // Enter no guarda directamente: quita el foco, y el guardado ocurre en el
              // `blur`. Si hiciera las dos cosas, Enter mandaría el comando dos veces.
              if (evento.key === 'Enter') evento.currentTarget.blur();
              // Esc descarta: lo tecleado aquí todavía no se mandó a ningún sitio, y el
              // valor de la persona sigue intacto en el documento.
              if (evento.key === 'Escape') {
                setBorrador(persona.nombre);
                alEditar();
              }
            }}
            // El valor sale del DOM, no del estado: un blur que llega antes de que
            // React repinte leería el borrador viejo y perdería lo tecleado.
            onBlur={(evento) => alRenombrar(evento.currentTarget.value)}
          />
        ) : (
          persona.nombre
        )}
      </span>

      <span className="fila-persona__equipos">
        {claves.length === 0 ? (
          <span className="etiqueta etiqueta--vacio">Sin equipo</span>
        ) : (
          persona.equipos.map((equipo) => (
            <span className="etiqueta" key={equipo.clave} title={equipo.nombre}>
              {equipo.clave}
            </span>
          ))
        )}
        {claves.length > 1 && <span className="multi">en {claves.length} equipos</span>}
      </span>

      <span className="fila-persona__carga tabular" title="Tareas abiertas de las que es responsable">
        {cuentaTareas(persona.abiertas)}
      </span>

      <span className="fila-persona__acciones">
        {!soloLectura && (
          <>
            <button type="button" className="mini" onClick={alEditar}>
              {editando ? 'Listo' : 'Renombrar'}
            </button>
            <button
              type="button"
              className="mini"
              title="Deja de recibir trabajo nuevo y sale de los equipos. Su historia se conserva."
              onClick={alDesactivar}
            >
              Dar de baja
            </button>
          </>
        )}
      </span>
    </div>
  );
}

/** Con qué está atada. Es lo que explica por qué eliminar se va a rechazar. */
function describirAtaduras(persona: FilaPersonaAdmin): string {
  const { tareas, sprints, sprintsCerrados } = persona.ataduras;
  if (tareas === 0 && sprints === 0) return 'sin historia';
  const partes: string[] = [];
  if (tareas > 0) partes.push(cuenta(tareas, 'tarea', 'tareas'));
  if (sprintsCerrados > 0) {
    partes.push(`${cuenta(sprintsCerrados, 'sprint cerrado', 'sprints cerrados')}`);
  } else if (sprints > 0) {
    partes.push(cuenta(sprints, 'sprint', 'sprints'));
  }
  return partes.join(' y ');
}
