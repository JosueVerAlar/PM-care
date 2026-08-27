/**
 * E10b — Panorama: los proyectos ordenados por atención requerida.
 *
 * ## El orden es el hallazgo, y por eso se explica
 *
 * Bloqueos primero (por los días del bloqueo más viejo), después el resto por días sin
 * movimiento. Alfabético tiraría la respuesta a la pregunta que la pantalla existe para
 * contestar. Y la regla se escribe arriba: un orden que nadie explica se lee como un
 * error, porque el usuario supone alfabético.
 *
 * ## La franja de bloqueos aparece SOLO si hay bloqueos
 *
 * Nada de estados vacíos celebratorios ocupando el mejor espacio de la pantalla. Un «¡todo
 * despejado!» permanente entrena a saltarse esa zona, y el día que sí hay algo, tampoco se
 * mira.
 *
 * ## Los proyectos sin nada capturado van como fichas
 *
 * Una tarjeta con barra vacía diría «este proyecto está al 0 %», que es una afirmación que
 * la app no puede sostener: lo que pasa es que PM-care no sabe nada de él. Ficha, y se
 * dice con todas sus letras.
 */

import { useMemo, useState } from 'react';

import { filasDeBloqueos } from '../../../compartido/dominio/bloqueos';
import {
  panorama,
  type OrdenPanorama,
  type TarjetaPanorama,
} from '../../../compartido/dominio/panorama';
import type { Documento, Fecha } from '../../../compartido/modelo/tipos';
import { ContadorBloqueos } from '../../componentes/Chips';
import { CuadroBloqueo, Chevron } from '../../componentes/iconos';
import { Medidor } from '../../componentes/Medidor';
import { useAccionesInterfaz } from '../../estado/interfaz';
import { dias, etiquetaBloqueo, nombreSinClave, tareas as cuentaTareas } from '../../util/presentacion';
import { Lienzo, NotaPie, PanelGlobal, ReglaOrden, VacioGlobal } from './piezas';

/** Cuántos bloqueos caben en la franja antes de que deje de ser una franja. */
const EN_LA_FRANJA = 3;

export function VistaPanorama({ documento, hoy }: { documento: Documento; hoy: Fecha }) {
  const [orden, setOrden] = useState<OrdenPanorama>('atencion');
  const { verProyecto, verGlobal, verAdmin } = useAccionesInterfaz();

  const vista = useMemo(() => panorama(documento, hoy, orden), [documento, hoy, orden]);
  const bloqueos = useMemo(() => filasDeBloqueos(documento, hoy), [documento, hoy]);

  if (vista.total === 0) {
    return (
      <PanelGlobal etiqueta="Panorama">
        <header className="cab">
          <h2 className="cab__titulo">Panorama</h2>
        </header>
        <VacioGlobal
          titulo="No hay ningún proyecto que mirar"
          queHacer={
            <>
              Todos los proyectos están archivados, o todavía no hay ninguno. Se dan de alta
              en <b>Administración · Proyectos</b>, que es también donde se reabre uno cerrado;
              después, captura sus épicas y tareas desde el árbol.
            </>
          }
          accion={{ texto: 'Ir a Administración · Proyectos', alPulsar: () => verAdmin('proyectos') }}
        />
      </PanelGlobal>
    );
  }

  const proyectosConBloqueo = new Set(bloqueos.map((b) => b.ubicacion.proyecto.clave)).size;

  return (
    <PanelGlobal etiqueta="Panorama">
      <header className="cab">
        <h2 className="cab__titulo">
          Panorama · {vista.total === 1 ? '1 proyecto' : `${vista.total} proyectos`}
        </h2>
        <span className="crece" />
        <span className="cab__nota">Orden</span>
        <div className="alternador" role="group" aria-label="Criterio de orden">
          {(
            [
              ['atencion', 'Atención requerida'],
              ['quieto', 'Días sin movimiento'],
              ['nombre', 'Nombre'],
            ] as const
          ).map(([id, texto]) => (
            <button key={id} type="button" aria-pressed={orden === id} onClick={() => setOrden(id)}>
              {texto}
            </button>
          ))}
        </div>
      </header>

      {/* Solo si hay algo. Si no, no se pinta NADA aquí. */}
      {bloqueos.length > 0 && (
        <div className="franja">
          <p className="franja__cab">
            <CuadroBloqueo />
            <span className="franja__titulo">
              {bloqueos.length === 1 ? '1 bloqueo abierto' : `${bloqueos.length} bloqueos abiertos`}
            </span>
            <span className="franja__detalle">
              el más viejo lleva {dias(bloqueos[0]?.dias ?? 0)} · en{' '}
              {proyectosConBloqueo === 1 ? '1 proyecto' : `${proyectosConBloqueo} proyectos`}
            </span>
          </p>
          <div className="franja__rejilla">
            {bloqueos.slice(0, EN_LA_FRANJA).map((bloqueo) => (
              <button
                type="button"
                className="franja__item"
                key={bloqueo.ubicacion.tarea.id}
                title={bloqueo.bloqueo.motivo}
                onClick={() => verGlobal('bloqueos')}
              >
                <span className="franja__dias tabular">
                  {bloqueo.dias}
                  <small>d</small>
                </span>
                <span className="franja__texto">
                  <span className="franja__tarea">{bloqueo.ubicacion.tarea.titulo}</span>
                  <span className="franja__proy">
                    {bloqueo.ubicacion.proyecto.clave} ·{' '}
                    {etiquetaBloqueo(bloqueo.bloqueo.tipo).toLowerCase()}
                  </span>
                </span>
              </button>
            ))}
            {bloqueos.length > EN_LA_FRANJA && (
              <button type="button" className="franja__mas" onClick={() => verGlobal('bloqueos')}>
                Ver los {bloqueos.length} bloqueos
                <Chevron abierto={false} vacio={false} />
              </button>
            )}
          </div>
        </div>
      )}

      <ReglaOrden>
        {orden === 'atencion' &&
          'Primero lo que tiene bloqueos abiertos, por los días del bloqueo más viejo; después el resto, por días sin movimiento.'}
        {orden === 'quieto' && 'Del que lleva más tiempo sin ninguna marca de movimiento al que menos.'}
        {orden === 'nombre' && 'Alfabético. El orden ya no dice nada: es solo para encontrar uno concreto.'}
      </ReglaOrden>

      <Lienzo>
        {vista.unicaLista !== null ? (
          <Seccion titulo="Proyectos capturados" n={vista.unicaLista.length}>
            <Rejilla tarjetas={vista.unicaLista} abrir={verProyecto} />
          </Seccion>
        ) : (
          <>
            {vista.conBloqueos.length > 0 && (
              <Seccion
                titulo="Con bloqueos abiertos"
                n={vista.conBloqueos.length}
                pie="ordenados por los días del bloqueo más viejo"
              >
                <Rejilla tarjetas={vista.conBloqueos} abrir={verProyecto} />
              </Seccion>
            )}
            {vista.sinBloqueos.length > 0 && (
              <Seccion
                titulo="Sin bloqueos abiertos"
                n={vista.sinBloqueos.length}
                pie="ordenados por días sin movimiento"
              >
                <Rejilla tarjetas={vista.sinBloqueos} abrir={verProyecto} />
              </Seccion>
            )}
          </>
        )}

        {vista.sinCapturar.length > 0 && (
          <Seccion titulo="Sin nada capturado en PM-care" n={vista.sinCapturar.length}>
            <div className="fichas">
              {vista.sinCapturar.map((tarjeta) => (
                <button
                  type="button"
                  className="ficha"
                  key={tarjeta.clave}
                  title={`Abrir ${tarjeta.nombre} y capturar su primera épica`}
                  onClick={() => verProyecto(tarjeta.clave)}
                >
                  <span className="ficha__clave">{tarjeta.clave}</span>
                  {nombreSinClave(tarjeta.clave, tarjeta.nombre) ?? tarjeta.nombre}
                </button>
              ))}
            </div>
            <p className="seccion__aclaracion">
              No es que no pase nada en ellos: es que PM-care no sabe. No se pinta 0 % ni barra
              vacía, porque sería afirmar algo que la app no puede afirmar.
            </p>
          </Seccion>
        )}
      </Lienzo>

      <NotaPie>
        Esto muestra qué está <b>quieto</b>, no qué es <b>importante</b>: la prioridad se
        captura a mano y la app no la deduce. «Sin movimiento» se cuenta sobre las marcas que
        el documento guarda —capturar, dar por hecha, bloquear y desbloquear—; editar un
        título no cuenta como movimiento.
      </NotaPie>
    </PanelGlobal>
  );
}

function Seccion({
  titulo,
  n,
  pie,
  children,
}: {
  titulo: string;
  n: number;
  pie?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="seccion">
      <h3 className="seccion__titulo">
        {titulo}
        <span className="seccion__n tabular">
          {n}
          {pie !== undefined && ` · ${pie}`}
        </span>
      </h3>
      {children}
    </section>
  );
}

function Rejilla({
  tarjetas,
  abrir,
}: {
  tarjetas: readonly TarjetaPanorama[];
  abrir: (clave: string) => void;
}) {
  return (
    <div className="rejilla">
      {tarjetas.map((tarjeta) => (
        <TarjetaProyecto key={tarjeta.clave} tarjeta={tarjeta} abrir={abrir} />
      ))}
    </div>
  );
}

/** Un proyecto quieto más de dos semanas sube de tinta: es lo que manda en el orden. */
const QUIETO_LARGO = 14;

function TarjetaProyecto({
  tarjeta,
  abrir,
}: {
  tarjeta: TarjetaPanorama;
  abrir: (clave: string) => void;
}) {
  const nombre = nombreSinClave(tarjeta.clave, tarjeta.nombre) ?? tarjeta.nombre;
  const quietoLargo = tarjeta.quieto !== null && tarjeta.quieto >= QUIETO_LARGO;

  return (
    <button
      type="button"
      className="tarjeta-proy"
      title={tarjeta.nombre}
      onClick={() => abrir(tarjeta.clave)}
    >
      <span className="tarjeta-proy__cab">
        <span className="tarjeta-proy__clave">{tarjeta.clave}</span>
        <span className="tarjeta-proy__nombre">{nombre}</span>
        <ContadorBloqueos n={tarjeta.bloqueadas} />
      </span>

      <span className="tarjeta-proy__avance">
        {/* El medidor es quien cumple las reglas 2 y 3: nunca un % sin su conteo, nunca
            0 % para un contenedor vacío. Esta tarjeta no calcula nada. */}
        <Medidor avance={tarjeta.avance} />
        {/* Con coletilla, las abiertas bajan a su propio renglón y pierden el `·`.
            La condición sale del DATO y no del ancho, así que la tarjeta se ve igual en
            cualquier tamaño de rejilla: o una línea con punto, o dos sin él. Dejando el
            `·` suelto entre los dos, el punto se quedaba solo al final del primer
            renglón y «12 tareas abiertas» se partía por la mitad. */}
        <span
          className={
            tarjeta.avance.contenedoresSinDesglosar > 0
              ? 'tarjeta-proy__abiertas tarjeta-proy__abiertas--renglon'
              : 'tarjeta-proy__abiertas'
          }
        >
          {tarjeta.avance.contenedoresSinDesglosar > 0 ? null : (
            <span className="tarjeta-proy__sep">· </span>
          )}
          {cuentaTareas(tarjeta.abiertas)} abiertas
        </span>
      </span>

      <span className="tarjeta-proy__pie">
        <span
          className={`tabular${quietoLargo ? ' tarjeta-proy__quieto--largo' : ''}`}
          title="Días desde la última tarea capturada, dada por hecha, bloqueada o desbloqueada"
        >
          {tarjeta.quieto === null
            ? 'sin marcas de movimiento'
            : `${dias(tarjeta.quieto)} sin movimiento`}
        </span>
        {tarjeta.bloqueadas > 0 && tarjeta.bloqueoMasViejo !== null && (
          <span className="tarjeta-proy__bloqueo tabular">
            {tarjeta.bloqueadas === 1 ? '1 bloqueo' : `${tarjeta.bloqueadas} bloqueos`}, el más
            viejo lleva {dias(tarjeta.bloqueoMasViejo)}
          </span>
        )}
        <span className="tabular">
          {tarjeta.enSprintActivo === 0
            ? 'nada en el sprint activo'
            : `${cuentaTareas(tarjeta.enSprintActivo)} en el sprint activo`}
          {tarjeta.vencidas > 0 && ` · ${tarjeta.vencidas} vencidas`}
          {tarjeta.noPlaneadasAbiertas > 0 &&
            ` · ${tarjeta.noPlaneadasAbiertas} sin planear`}
        </span>
        {tarjeta.avance.canceladas > 0 && (
          <span className="tabular tarjeta-proy__tenue">
            {tarjeta.avance.canceladas === 1
              ? '1 cancelada, fuera del conteo'
              : `${tarjeta.avance.canceladas} canceladas, fuera del conteo`}
          </span>
        )}
      </span>
    </button>
  );
}
