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
import { useAccionesInterfaz } from '../../estado/interfaz';
import { useMutar, useSoloLectura } from '../../estado/mutaciones';
import { cuenta, fechaCorta, nombreSinClave } from '../../util/presentacion';
import { Advertencia, Candado } from '../../componentes/iconos';
import { Lienzo } from '../globales/piezas';


export function SeccionProyectos({ documento }: { documento: Documento }) {
  const mutar = useMutar();
  const soloLectura = useSoloLectura();
  // La ceremonia de cerrar y de eliminar vive en `DialogoProyecto`, que App pinta: se pide
  // también desde el `⋯` de la lateral y no puede haber dos copias de un flujo destructivo.
  const { preguntarProyecto } = useAccionesInterfaz();

  const { activos, cerrados } = useMemo(() => proyectosParaAdmin(documento), [documento]);

  // El texto de un formulario vive en el componente que lo pinta, nunca en el reductor de
  // interfaz y menos en el de datos: si cada tecla despachara, cada tecla repintaría la app.
  const [nombre, setNombre] = useState('');
  const [clave, setClave] = useState('');
  const [claveTocada, setClaveTocada] = useState(false);

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
                  alPedirCerrar={() => preguntarProyecto({ clave: fila.clave, accion: 'cerrar' })}
                  alPedirEliminar={() => undefined}
                  alReabrir={() => undefined}
                />
              ))
            )}
          </div>

          <div className="bloque">
            <p className="bloque__titulo">
              Cerrados <span className="bloque__n tabular">{cerrados.length}</span>
            </p>

            {cerrados.length === 0 ? (
              <p className="bloque__nota">Ningún proyecto cerrado todavía.</p>
            ) : (
              cerrados.map((fila) => (
                <FilaProyecto
                  key={fila.clave}
                  fila={fila}
                  soloLectura={soloLectura}
                  alPedirCerrar={() => undefined}
                  alPedirEliminar={() => preguntarProyecto({ clave: fila.clave, accion: 'eliminar' })}
                  alReabrir={() =>
                    void mutar({ comando: 'reabrirProyecto', clave: fila.clave }, `Reabrir ${fila.clave}`)
                  }
                />
              ))
            )}
          </div>
        </div>
      </Lienzo>


    </>
  );
}

/**
 * La fila solo DISPARA: la ceremonia la pinta `DialogoProyecto` desde App.
 *
 * Antes esta fila llevaba ocho props porque cargaba con las dos confirmaciones dentro —el
 * texto tecleado de la clave incluido—. Al mudarse el flujo, se queda con lo suyo: pintar
 * qué hay en el proyecto y ofrecer las tres puertas.
 */
interface PropsFila {
  fila: FilaProyectoAdmin;
  soloLectura: boolean;
  alPedirCerrar: () => void;
  alPedirEliminar: () => void;
  alReabrir: () => void;
}

function FilaProyecto({
  fila,
  soloLectura,
  alPedirCerrar,
  alPedirEliminar,
  alReabrir,
}: PropsFila) {
  const cerrado = fila.cerradoEn !== null || fila.archivado;
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
