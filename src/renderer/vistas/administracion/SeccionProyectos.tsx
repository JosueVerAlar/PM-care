/**
 * Administración · Proyectos — alta, edición, cierre, reapertura y eliminación.
 *
 * ## La clave es inmutable, y se nota en el formulario
 *
 * Se propone desde el nombre y se puede corregir **mientras se está creando**. Después no
 * hay ningún campo que la cambie, ni aquí ni en el comando (`editarProyecto` no tiene
 * `clave` editable a propósito): la clave prefija todos los ids del proyecto (`SICOE-T14`)
 * y aparece en cada línea del historial, así que renombrarla dejaría cada referencia
 * apuntando a un proyecto que ya no se llama así.
 *
 * ## Cerrar ≠ eliminar, y se lee sin explicación
 *
 * La diferencia no se confía a un texto de advertencia: se resuelve separando los dos
 * gestos EN EL TIEMPO.
 *
 * - **«Cerrar» está en cada fila activa.** Botón neutro, confirmación en línea que dice,
 *   ahí mismo, que se puede reabrir.
 * - **«Eliminar» no existe en una fila activa.** Solo aparece dentro de la sección de
 *   cerrados. Para borrar un proyecto hay que cerrarlo antes: dos gestos separados, no dos
 *   botones vecinos que el pulgar confunde.
 * - **Y eliminar cobra su precio:** enumera lo que se lleva por delante y pide escribir la
 *   clave a mano, porque el comando exige `confirmacion` idéntica a `clave`.
 *
 * ## El rechazo del reductor se muestra tal cual
 *
 * El reductor rechaza eliminar un proyecto con tareas en sprints cerrados, y su mensaje
 * explica qué hacer en su lugar. No se sustituye por un genérico: se enseña entero, en la
 * franja de aviso de la app.
 */

import { useMemo, useState } from 'react';

import {
  claveSugerida,
  proyectosParaAdmin,
  type FilaProyectoAdmin,
} from '../../../compartido/dominio/administracion';
import type { Documento } from '../../../compartido/modelo/tipos';
import { useMutar, useSoloLectura } from '../../estado/mutaciones';
import { cuenta, fechaCorta, nombreSinClave } from '../../util/presentacion';
import { Advertencia, Candado } from '../../componentes/iconos';
import { Lienzo, NotaPie } from '../globales/piezas';

export function SeccionProyectos({ documento }: { documento: Documento }) {
  const mutar = useMutar();
  const soloLectura = useSoloLectura();

  const { activos, cerrados } = useMemo(() => proyectosParaAdmin(documento), [documento]);

  // El texto de un formulario vive en el componente que lo pinta, nunca en el reductor de
  // interfaz y menos en el de datos: si cada tecla despachara, cada tecla repintaría la app.
  const [nombre, setNombre] = useState('');
  const [clave, setClave] = useState('');
  const [claveTocada, setClaveTocada] = useState(false);
  /** Qué fila tiene abierta su confirmación de cierre, y cuál su zona de peligro. */
  const [cerrando, setCerrando] = useState<string | null>(null);
  const [eliminando, setEliminando] = useState<string | null>(null);
  const [textoBorrar, setTextoBorrar] = useState('');

  const clavePropuesta = claveTocada ? clave : claveSugerida(nombre);
  const claveFinal = clavePropuesta.trim().toUpperCase();
  const chocando = documento.proyectos.some((proyecto) => proyecto.clave === claveFinal);
  const puedeCrear = nombre.trim() !== '' && claveFinal !== '' && !chocando && !soloLectura;

  const crear = async () => {
    if (!puedeCrear) return;
    const ok = await mutar(
      { comando: 'crearProyecto', clave: claveFinal, nombre: nombre.trim() },
      `Dar de alta ${claveFinal}`,
    );
    if (!ok) return;
    setNombre('');
    setClave('');
    setClaveTocada(false);
  };

  const cerrarTodo = () => {
    setCerrando(null);
    setEliminando(null);
    setTextoBorrar('');
  };

  return (
    <>
      <header className="cab">
        <h2 className="cab__titulo">
          Proyectos · {activos.length} activos ·{' '}
          {cuenta(cerrados.length, 'cerrado', 'cerrados')}
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
              <p className="alta__titulo">Dar de alta un proyecto</p>
              <div className="alta__fila">
                <label className="campo campo--crece">
                  <span className="campo__etq">Nombre</span>
                  <input
                    type="text"
                    value={nombre}
                    autoComplete="off"
                    placeholder="Sistema de becas"
                    onChange={(evento) => setNombre(evento.target.value)}
                  />
                </label>
                <label className="campo campo--clave">
                  <span className="campo__etq">Clave</span>
                  <input
                    type="text"
                    value={clavePropuesta}
                    autoComplete="off"
                    spellCheck={false}
                    maxLength={8}
                    placeholder="SIBE"
                    aria-describedby="alta-proy-nota"
                    onChange={(evento) => {
                      setClaveTocada(true);
                      setClave(evento.target.value);
                    }}
                  />
                </label>
                <button type="submit" className="boton-solido" disabled={!puedeCrear}>
                  Dar de alta
                </button>
              </div>
              <p className="alta__pie" id="alta-proy-nota">
                {chocando ? (
                  <b className="alta__error">
                    Ya hay un proyecto con la clave {claveFinal}. Elige otra: dos proyectos con
                    la misma clave harían que {claveFinal}-T1 fuera dos tareas distintas.
                  </b>
                ) : (
                  <>
                    La clave prefija los ids de todas sus tareas (<b>SICOE-T14</b>) y{' '}
                    <b>no se puede cambiar después</b> sin romper las referencias del
                    historial. Se propone sola desde el nombre; corrígela ahora si no te gusta.
                    El nombre largo sí se edita cuando quieras.
                  </>
                )}
              </p>
            </form>

            <p className="bloque__titulo">
              Activos <span className="bloque__n tabular">{activos.length}</span>
            </p>
            {activos.length === 0 ? (
              <p className="bloque__nota">
                No hay ningún proyecto activo. Da de alta uno arriba, o reabre alguno de los
                cerrados.
              </p>
            ) : (
              activos.map((fila) => (
                <FilaProyecto
                  key={fila.clave}
                  fila={fila}
                  soloLectura={soloLectura}
                  cerrando={cerrando === fila.clave}
                  eliminando={false}
                  textoBorrar={textoBorrar}
                  alEscribirBorrar={setTextoBorrar}
                  alPedirCerrar={() => {
                    setEliminando(null);
                    setCerrando(fila.clave);
                  }}
                  alPedirEliminar={() => undefined}
                  alCancelar={cerrarTodo}
                  alConfirmarCerrar={() => {
                    cerrarTodo();
                    void mutar(
                      { comando: 'cerrarProyecto', clave: fila.clave },
                      `Cerrar ${fila.clave}`,
                    );
                  }}
                  alReabrir={() => undefined}
                  alConfirmarEliminar={() => undefined}
                />
              ))
            )}
          </div>

          <div className="bloque">
            <p className="bloque__titulo">
              Cerrados <span className="bloque__n tabular">{cerrados.length}</span>
            </p>
            <p className="bloque__nota">
              Conservan todas sus tareas y su historial, y dejan de aparecer en el Panorama, en
              el sprint y en la carga por persona. Se pueden reabrir en un clic.{' '}
              <b>Eliminar solo se ofrece aquí:</b> para borrar un proyecto hay que cerrarlo antes.
            </p>
            {cerrados.length === 0 ? (
              <p className="bloque__nota">Ningún proyecto cerrado todavía.</p>
            ) : (
              cerrados.map((fila) => (
                <FilaProyecto
                  key={fila.clave}
                  fila={fila}
                  soloLectura={soloLectura}
                  cerrando={false}
                  eliminando={eliminando === fila.clave}
                  textoBorrar={textoBorrar}
                  alEscribirBorrar={setTextoBorrar}
                  alPedirCerrar={() => undefined}
                  alPedirEliminar={() => {
                    setCerrando(null);
                    setTextoBorrar('');
                    setEliminando(fila.clave);
                  }}
                  alCancelar={cerrarTodo}
                  alConfirmarCerrar={() => undefined}
                  alReabrir={() => {
                    cerrarTodo();
                    void mutar(
                      { comando: 'reabrirProyecto', clave: fila.clave },
                      `Reabrir ${fila.clave}`,
                    );
                  }}
                  alConfirmarEliminar={() => {
                    // La confirmación viaja al comando: el reductor vuelve a comprobarla,
                    // porque es la última capa antes del disco y un `eliminarProyecto`
                    // disparado por un bug de la vista no puede llevarse un año de capturas.
                    void mutar(
                      {
                        comando: 'eliminarProyecto',
                        clave: fila.clave,
                        confirmacion: textoBorrar.trim().toUpperCase(),
                      },
                      `Eliminar ${fila.clave}`,
                    ).then((ok) => {
                      // Si el reductor lo rechazó, la zona de peligro se queda abierta con lo
                      // tecleado: no se revierte lo que el usuario escribió (regla 5), y el
                      // mensaje del rechazo ya está en la franja de aviso de arriba.
                      if (ok) cerrarTodo();
                    });
                  }}
                />
              ))
            )}
          </div>
        </div>
      </Lienzo>

      <NotaPie>
        Cerrar es reversible y conserva la historia. Eliminar no es ninguna de las dos cosas, y
        por eso vive en otra sección y pide escribir la clave a mano. No hay deshacer desde la
        app para un borrado ya escrito: se recupera restaurando un respaldo anterior.
      </NotaPie>
    </>
  );
}

interface PropsFila {
  fila: FilaProyectoAdmin;
  soloLectura: boolean;
  cerrando: boolean;
  eliminando: boolean;
  textoBorrar: string;
  alEscribirBorrar: (texto: string) => void;
  alPedirCerrar: () => void;
  alPedirEliminar: () => void;
  alCancelar: () => void;
  alConfirmarCerrar: () => void;
  alReabrir: () => void;
  alConfirmarEliminar: () => void;
}

function FilaProyecto({
  fila,
  soloLectura,
  cerrando,
  eliminando,
  textoBorrar,
  alEscribirBorrar,
  alPedirCerrar,
  alPedirEliminar,
  alCancelar,
  alConfirmarCerrar,
  alReabrir,
  alConfirmarEliminar,
}: PropsFila) {
  const cerrado = fila.cerradoEn !== null || fila.archivado;
  const { contenido } = fila;
  const nombreCorto = nombreSinClave(fila.clave, fila.nombre) ?? fila.nombre;

  return (
    <div className={`fila-proy${cerrado ? ' fila-proy--cerrado' : ''}`}>
      <span className="fila-proy__sigla" aria-hidden="true">
        {fila.sigla}
      </span>
      <span className="fila-proy__nombre">
        <b>{fila.clave}</b> · {nombreCorto}
        {cerrado && (
          <span className="etiqueta">
            <Candado />
            {fila.cerradoEn === null ? 'Archivado' : `Cerrado el ${fechaCorta(fila.cerradoEn)}`}
          </span>
        )}
      </span>
      <span className="fila-proy__meta">{describirContenido(fila)}</span>
      <span className="fila-proy__acciones">
        {soloLectura ? (
          <span className="fila-proy__nota">Solo lectura</span>
        ) : cerrado ? (
          <>
            <button type="button" className="mini" onClick={alReabrir}>
              Reabrir
            </button>
            <button type="button" className="mini mini--peligro" onClick={alPedirEliminar}>
              Eliminar…
            </button>
          </>
        ) : (
          <button type="button" className="mini" onClick={alPedirCerrar}>
            Cerrar proyecto
          </button>
        )}
      </span>

      {cerrando && (
        <div className="confirmar">
          <Candado />
          <span>
            Cerrar <b>{nombreCorto}</b> conserva sus{' '}
            {cuenta(contenido.tareas, 'tarea', 'tareas')} y su historial, y lo saca del Panorama
            y de la vista diaria. <b>Se puede reabrir cuando quieras.</b>
          </span>
          <span className="crece" />
          <button type="button" className="boton-solido" onClick={alConfirmarCerrar}>
            Cerrar proyecto
          </button>
          <button type="button" className="boton-texto" onClick={alCancelar}>
            Cancelar
          </button>
        </div>
      )}

      {eliminando && (
        <div className="peligro">
          <p className="peligro__titulo">
            <Advertencia /> Eliminar {fila.clave} para siempre
          </p>
          <p className="peligro__texto">
            Se borra <b>{describirPerdida(fila)}</b>. Cerrarlo lo habría guardado; esto no. <b>No hay deshacer desde la app</b> una vez escrito:
            solo se recupera restaurando un respaldo anterior a este momento.
            {contenido.sprintsCerrados > 0 && (
              <>
                {' '}
                Además,{' '}
                <b>
                  {cuenta(contenido.tareasEnSprintsCerrados, 'de sus tareas está', 'de sus tareas están')}{' '}
                  en {cuenta(contenido.sprintsCerrados, 'sprint cerrado', 'sprints cerrados')}
                </b>
                : es muy probable que la app lo rechace para no reescribir lo que esos sprints
                dicen que pasó.
              </>
            )}
          </p>
          <div className="peligro__fila">
            <label className="campo campo--clave">
              <span className="campo__etq">Escribe {fila.clave} para confirmar</span>
              <input
                type="text"
                value={textoBorrar}
                autoComplete="off"
                spellCheck={false}
                autoFocus
                placeholder={fila.clave}
                onChange={(evento) => alEscribirBorrar(evento.target.value)}
              />
            </label>
            <button
              type="button"
              className="boton-peligro"
              disabled={textoBorrar.trim().toUpperCase() !== fila.clave}
              onClick={alConfirmarEliminar}
            >
              Eliminar {fila.clave} para siempre
            </button>
            <button type="button" className="boton-texto" onClick={alCancelar}>
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Qué hay dentro, en una línea. Sin nada capturado se dice, no se pinta «0 tareas». */
function describirContenido(fila: FilaProyectoAdmin): string {
  const { contenido } = fila;
  if (contenido.tareas === 0 && contenido.epicas === 0) {
    return fila.equipo.length > 0 ? `Sin nada capturado · ${fila.equipo.join(', ')}` : 'Sin nada capturado';
  }
  const partes = [cuenta(contenido.tareas, 'tarea', 'tareas')];
  if (contenido.epicas > 0) partes.push(cuenta(contenido.epicas, 'épica', 'épicas'));
  if (contenido.historias > 0) partes.push(cuenta(contenido.historias, 'historia', 'historias'));
  if (contenido.sprints > 0) {
    partes.push(`${cuenta(contenido.sprints, 'sprint', 'sprints')} con historia`);
  }
  if (fila.equipo.length > 0) partes.push(fila.equipo.join(', '));
  return partes.join(' · ');
}

/** Lo que se lleva por delante un borrado. Enumerado, no resumido en «todo». */
function describirPerdida(fila: FilaProyectoAdmin): string {
  const { contenido } = fila;
  // Un proyecto vacío no se describe con tres ceros: «0 tareas, 0 épicas, 0 historias» es
  // exactamente el tipo de cifra inventada que esta app no pinta en ningún sitio.
  if (contenido.tareas === 0 && contenido.epicas === 0 && contenido.historias === 0) {
    return 'el proyecto y su clave, que no tiene nada capturado';
  }
  const partes = [
    cuenta(contenido.tareas, 'tarea', 'tareas'),
    cuenta(contenido.epicas, 'épica', 'épicas'),
    cuenta(contenido.historias, 'historia', 'historias'),
  ];
  if (contenido.sprints > 0) {
    partes.push(`su rastro en ${cuenta(contenido.sprints, 'sprint', 'sprints')}`);
  }
  return partes.join(', ');
}
