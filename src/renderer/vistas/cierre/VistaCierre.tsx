/**
 * E8 — la pantalla de cierre de sprint. Una VISTA COMPLETA, no un modal.
 *
 * Cerrar catorce tareas en un cuadro de 400 px es tortura, y si cerrar cuesta, el usuario
 * deja de cerrar sprints: todo se acumula en el sprint uno y las demás vistas colapsan.
 * Así que ocupa el ancho de los dos paneles, se lee de arriba abajo y la consecuencia
 * vive anclada al pie.
 *
 * ## Los tres bloques (más el que solo informa)
 *
 * 1. **Terminadas** — con un botón por fila para corregir: «No, no terminó».
 * 2. **Sin terminar** — tres destinos, con el primero preseleccionado. No tocar nada y
 *    pulsar el botón hace lo que el usuario espera.
 * 3. **Bloqueadas** — bloque propio, con la nota ORIGINAL y los días, y la pregunta
 *    explícita de si sigue detenida. Sin esto una tarea se arrastra cuatro sprints con
 *    una nota de hace dos meses y nadie se entera.
 * 4. **Canceladas** — solo se informan. Su desenlace se constata, no se decide, y el
 *    reductor rechaza una decisión sobre ellas.
 *
 * ## Qué se guarda al instante y qué espera al botón
 *
 * Las CORRECCIONES de estado —«no, no terminó», «ya se destrabó», ponerle responsable a
 * la que pasa sin nadie— se aplican en el acto, cada una con su comando y su deshacer.
 * Son decisiones distintas del usuario y tiene sentido que se deshagan por separado.
 *
 * Los DESTINOS no se guardan: viven en un `useReducer` local hasta que se pulsa el botón,
 * y entonces salen todos dentro de un único `cerrarSprint`. Un comando, un deshacer.
 * Por eso el mapa de destinos es estado de interfaz y no toca el reductor de datos
 * (regla 3): mover un segmentado no debe despertar el ciclo de guardado.
 *
 * Nada de esto calcula: el reparto en bloques, los conteos, los arrastres, el sprint
 * destino y el resumen final salen de `compartido/dominio/cierre.ts` (regla 2).
 */

import { useMemo, useReducer, useState, type ReactNode } from 'react';

import {
  bloquesDeCierre,
  decisionesParaComando,
  destinoDe,
  resumirDecisiones,
  siguienteSprintPlaneado,
  type DestinoCierre,
  type FilaCierre,
  type MapaDestinos,
} from '../../../compartido/dominio/cierre';
import { rutaDe } from '../../../compartido/dominio/derivar';
import type { Documento, Fecha, Persona, Sprint } from '../../../compartido/modelo/tipos';
import { ChipNeutro, ChipNuevo } from '../../componentes/Chips';
import { CuadroBloqueo, Glifo } from '../../componentes/iconos';
import { useAccionesCierre } from '../../estado/acciones-cierre';
import { useAccionesInterfaz } from '../../estado/interfaz';
import { useSoloLectura } from '../../estado/mutaciones';
import { dias, etiquetaDeTarea, fechaCorta, formaDeTarea, ordinal } from '../../util/presentacion';
import { ResumenCierre } from './ResumenCierre';

/** Las etiquetas de pantalla de los tres destinos. El dominio solo conoce las claves. */
const ETIQUETA_DESTINO: Record<DestinoCierre, string> = {
  siguiente: 'Pasa al siguiente sprint',
  backlog: 'Vuelve al backlog',
  descartar: 'Ya no aplica',
};

/**
 * Lo que hace cada destino, en el `title` de su botón. «Ya no aplica» merece explicarse:
 * el reductor CANCELA la tarea, no solo la saca del sprint, porque si volviera al backlog
 * como pendiente seguiría contando en todos los denominadores y en la carga de alguien.
 */
const TITULO_DESTINO: Record<DestinoCierre, string> = {
  siguiente: 'Entra arriba del sprint siguiente: lo arrastrado es deuda y se ve primero.',
  backlog: 'Sale del ciclo y se queda en su historia, lista para replanearse.',
  descartar: 'Cancela la tarea: sale de todos los conteos. Se revive con un cambio de estado.',
};

const ORDEN_DESTINOS: readonly DestinoCierre[] = ['siguiente', 'backlog', 'descartar'];

/**
 * El mapa de destinos solo guarda las EXCEPCIONES: lo que no está vale `siguiente`. Así
 * «no cambié nada» y «lo marqué todo al siguiente sprint» son el mismo estado, y no hay
 * forma de que la pantalla y el comando discrepen sobre cuál era el valor por omisión.
 */
type AccionDestinos =
  | { tipo: 'marcar'; tareaId: string; destino: DestinoCierre }
  | { tipo: 'limpiar' };

function reducirDestinos(estado: MapaDestinos, accion: AccionDestinos): MapaDestinos {
  if (accion.tipo === 'limpiar') return new Map();
  const siguiente = new Map(estado);
  if (accion.destino === 'siguiente') siguiente.delete(accion.tareaId);
  else siguiente.set(accion.tareaId, accion.destino);
  return siguiente;
}

export function VistaCierre({
  documento,
  sprintId,
  hoy,
}: {
  documento: Documento;
  sprintId: string;
  hoy: Fecha;
}) {
  const sprint = documento.sprints.find((s: Sprint) => s.id === sprintId);

  if (sprint === undefined) {
    return (
      <section className="panel panel--cierre" aria-label="Cierre de sprint">
        <div className="vacio">
          <p className="vacio__titulo">Ese sprint ya no está en el archivo</p>
          <p className="vacio__nota">
            El id <code className="clave">{sprintId}</code> no existe en el documento. Puede que se
            haya editado el JSON por fuera. Elige un proyecto en la barra lateral para volver.
          </p>
        </div>
      </section>
    );
  }

  // Ya cerrado: se enseña el resumen de lo que pasó, leído del documento posterior al
  // cierre. Si el usuario deshace, el sprint deja de estar cerrado y esta misma pantalla
  // vuelve sola a las decisiones — sin un `useState` que se quede desincronizado.
  if (sprint.estado === 'cerrado') {
    return <ResumenCierre documento={documento} sprintId={sprintId} />;
  }

  return <Decisiones documento={documento} sprint={sprint} hoy={hoy} />;
}

function Decisiones({
  documento,
  sprint,
  hoy,
}: {
  documento: Documento;
  sprint: Sprint;
  hoy: Fecha;
}) {
  const { salirDelCierre } = useAccionesInterfaz();
  const soloLectura = useSoloLectura();
  const acciones = useAccionesCierre(sprint);

  const [destinos, despacharDestino] = useReducer(
    reducirDestinos,
    new Map<string, DestinoCierre>(),
  );
  /** Qué fila tiene abierto su selector de responsable. Una a la vez. */
  const [asignando, setAsignando] = useState<string | null>(null);
  /** Se bloquea el botón mientras el comando viaja: dos cierres serían dos deshaceres. */
  const [enviando, setEnviando] = useState(false);

  const bloques = useMemo(() => bloquesDeCierre(documento, sprint, hoy), [documento, sprint, hoy]);
  const resumen = useMemo(() => resumirDecisiones(bloques, destinos), [bloques, destinos]);
  const siguiente = useMemo(() => siguienteSprintPlaneado(documento, sprint), [documento, sprint]);

  const nombres = useMemo(
    () => new Map(documento.personas.map((p: Persona) => [p.id, p.nombre])),
    [documento.personas],
  );
  const activas = useMemo(
    () => documento.personas.filter((p: Persona) => p.activa),
    [documento.personas],
  );

  const nombreDestino = siguiente ? siguiente.nombre : 'un sprint nuevo';
  const editable = !soloLectura;

  const cerrar = () => {
    setEnviando(true);
    void (async () => {
      // El fallo NO revierte nada (regla 5): los destinos marcados siguen en pantalla y
      // el botón vuelve a estar disponible. El aviso de arriba dice qué pasó.
      await acciones.cerrar(decisionesParaComando(bloques, destinos), siguiente?.id);
      setEnviando(false);
    })();
  };

  const propiasDeFila = {
    nombres,
    activas,
    acciones,
    editable,
    asignando,
    setAsignando,
  };

  return (
    <section className="panel panel--cierre" aria-label={`Cerrar ${sprint.nombre}`}>
      <header className="cab">
        <h2 className="cab__titulo">
          Cerrar {sprint.nombre} · {fechaCorta(sprint.inicio)}–{fechaCorta(sprint.fin)}
        </h2>
        <span className="crece" />
        <button type="button" className="cab__accion" onClick={salirDelCierre}>
          Volver sin cerrar
        </button>
      </header>

      {/* Se queda porque dice cuándo se guarda, que es lo único que el usuario no puede
          deducir mirando la pantalla y lo que decide si se va tranquilo a medias. */}
      <p className="regla-orden">Los destinos no se guardan hasta que pulses el botón de abajo.</p>

      <div className="cierre">
        <BloqueCierre
          titulo="Terminadas"
          conteo={`${bloques.terminadas.length} de ${bloques.total}`}
          pregunta="¿Alguna no terminó de verdad?"
          glifo={<Glifo forma="hecha" etiqueta="Hecha" />}
          vacio="Ninguna de las comprometidas quedó hecha. No es un error de la pantalla: es el dato."
          filas={bloques.terminadas}
        >
          {(fila) => (
            <FilaTerminada key={fila.ubicacion.tarea.id} fila={fila} {...propiasDeFila} />
          )}
        </BloqueCierre>

        <BloqueCierre
          titulo="Sin terminar"
          conteo={`${bloques.sinTerminar.length}`}
          pregunta="La primera opción viene marcada"
          glifo={<Glifo forma="pendiente" etiqueta="Pendiente" />}
          vacio="Nada quedó a medias fuera de lo bloqueado."
          filas={bloques.sinTerminar}
        >
          {(fila) => (
            <FilaDecision
              key={fila.ubicacion.tarea.id}
              fila={fila}
              destino={destinoDe(fila, destinos)}
              marcar={(destino) =>
                despacharDestino({ tipo: 'marcar', tareaId: fila.ubicacion.tarea.id, destino })
              }
              {...propiasDeFila}
            />
          )}
        </BloqueCierre>

        <BloqueCierre
          titulo="Bloqueadas"
          conteo={`${bloques.bloqueadas.length}`}
          pregunta="¿Sigue detenida por lo mismo?"
          glifo={
            <span className="cierre__glifo-bloqueo" aria-hidden="true">
              <CuadroBloqueo />
            </span>
          }
          vacio="No hay nada atorado en este sprint."
          filas={bloques.bloqueadas}
        >
          {(fila) => (
            <FilaDecision
              key={fila.ubicacion.tarea.id}
              fila={fila}
              destino={destinoDe(fila, destinos)}
              marcar={(destino) =>
                despacharDestino({ tipo: 'marcar', tareaId: fila.ubicacion.tarea.id, destino })
              }
              {...propiasDeFila}
            />
          )}
        </BloqueCierre>

        {/* Cuarto bloque, y solo si hay algo: las canceladas no piden decisión. Se
            enseñan para que el usuario sepa que están y que no van a ningún sitio. */}
        {bloques.canceladas.length > 0 && (
          <BloqueCierre
            titulo="Canceladas"
            conteo={`${bloques.canceladas.length}`}
            pregunta="No van a ningún destino: su desenlace ya se decidió"
            glifo={<Glifo forma="cancelada" etiqueta="Cancelada" />}
            vacio=""
            filas={bloques.canceladas}
          >
            {(fila) => (
              <FilaTerminada
                key={fila.ubicacion.tarea.id}
                fila={fila}
                sinCorregir
                {...propiasDeFila}
              />
            )}
          </BloqueCierre>
        )}
      </div>

      <div className="barra-accion">
        <button
          type="button"
          className="boton-solido"
          disabled={!editable || enviando}
          onClick={cerrar}
          title={
            editable
              ? `Un solo comando y un solo deshacer. Las que pasan van a ${nombreDestino}.`
              : 'La app está en solo lectura: no se escribe nada hasta resolver el archivo.'
          }
        >
          {enviando
            ? 'Cerrando…'
            : resumen.siguiente === 0
              ? `Cerrar ${sprint.nombre} sin pasar nada`
              : `Cerrar ${sprint.nombre} y pasar ${resumen.siguiente} tarea${resumen.siguiente === 1 ? '' : 's'}`}
        </button>
        <button type="button" className="boton-texto" onClick={salirDelCierre}>
          Cancelar
        </button>

        {resumen.sinResponsable.length > 0 && (
          <AvisoSinResponsable
            filas={resumen.sinResponsable}
            pasan={resumen.siguiente}
            abrir={(tareaId) => {
              setAsignando(tareaId);
              document
                .getElementById(`cierre-${tareaId}`)
                ?.scrollIntoView({ block: 'center', behavior: 'smooth' });
            }}
          />
        )}

        <span className="crece" />

        {/* Conteos crudos, ni un porcentaje (regla 4). Aquí no hay proporción que dar:
            lo que importa es a cuántas cosas le pasa qué. */}
        <span className="barra-accion__cuenta tabular">
          {resumen.terminadas} terminadas · {resumen.siguiente} a {nombreDestino} ·{' '}
          {resumen.backlog} al backlog · {resumen.descartar} ya no aplican
          {resumen.canceladas > 0 && ` · ${resumen.canceladas} canceladas`}
        </span>
      </div>
    </section>
  );
}

// --- bloques ----------------------------------------------------------------

function BloqueCierre({
  titulo,
  conteo,
  pregunta,
  glifo,
  vacio,
  filas,
  children,
}: {
  titulo: string;
  conteo: string;
  pregunta: string;
  glifo: ReactNode;
  /** Qué se dice cuando el bloque está vacío. Un bloque vacío se explica, no se esconde. */
  vacio: string;
  filas: FilaCierre[];
  children: (fila: FilaCierre) => ReactNode;
}) {
  return (
    <section className="cierre__bloque" aria-label={titulo}>
      <header className="cierre__cab">
        {glifo}
        <h3 className="cierre__titulo">{titulo}</h3>
        <span className="cierre__n tabular">{conteo}</span>
        <span className="cierre__pregunta">{pregunta}</span>
      </header>
      {filas.length === 0 ? (
        <p className="cierre__vacio">{vacio}</p>
      ) : (
        filas.map((fila) => children(fila))
      )}
    </section>
  );
}

interface PropiasDeFila {
  nombres: Map<string, string>;
  activas: Persona[];
  acciones: ReturnType<typeof useAccionesCierre>;
  editable: boolean;
  asignando: string | null;
  setAsignando: (tareaId: string | null) => void;
}

/** Cabecera, migaja y pie: lo común a las cuatro clases de fila. */
function CuerpoFila({
  fila,
  nombres,
  activas,
  acciones,
  editable,
  asignando,
  setAsignando,
  avisaSinResponsable,
}: PropiasDeFila & { fila: FilaCierre; avisaSinResponsable: boolean }) {
  const { tarea } = fila.ubicacion;
  const ruta = rutaDe(fila.ubicacion);
  const responsable = fila.compromiso.responsable;
  const abierto = asignando === tarea.id;

  return (
    <>
      <div className="item-cierre__cab">
        <Glifo forma={formaDeTarea(tarea.estado)} etiqueta={etiquetaDeTarea(tarea.estado)} />
        <span className="item-cierre__titulo">{tarea.titulo}</span>
        {fila.nuevo && <ChipNuevo />}
        <span className="clave">{tarea.id}</span>
      </div>

      <p className="item-cierre__ruta" title={ruta.join(' › ')}>
        <b>{ruta[0]}</b>
        {ruta.length > 1 && ` › ${ruta.slice(1).join(' › ')}`}
      </p>

      {fila.bloqueo !== null && (
        <p className="tira-bloqueo" title={fila.bloqueo.motivo}>
          <CuadroBloqueo />
          <span>
            <b>Detenida {dias(fila.diasDetenida ?? 0)}</b> · {fila.bloqueo.motivo}
          </span>
        </p>
      )}

      <div className="item-cierre__pie">
        {responsable === null ? (
          <span className={avisaSinResponsable ? 'item-cierre__falta' : 'tarjeta__falta'}>
            sin responsable
          </span>
        ) : (
          <span>{nombres.get(responsable) ?? responsable}</span>
        )}
        {fila.compromiso.fechaLimite !== null && (
          <span className="tabular">vencía {fechaCorta(fila.compromiso.fechaLimite)}</span>
        )}
        {/* Arrastrada: se deriva de en cuántos sprints aparece, no de una marca a mano. */}
        {fila.pasos > 1 && (
          <ChipNeutro
            texto={`${ordinal(fila.pasos)} sprint`}
            titulo={`Es el ${ordinal(fila.pasos)} sprint por el que pasa esta tarea`}
          />
        )}
        {editable && responsable === null && !abierto && (
          <button type="button" className="mini" onClick={() => setAsignando(tarea.id)}>
            Asignar
          </button>
        )}
      </div>

      {abierto && (
        <div className="item-cierre__asignar">
          <label className="campo__etq" htmlFor={`resp-${tarea.id}`}>
            Quién se lleva {tarea.id}
          </label>
          <select
            id={`resp-${tarea.id}`}
            defaultValue={responsable ?? ''}
            autoFocus
            onChange={(evento) => {
              const valor = evento.target.value;
              setAsignando(null);
              void acciones.asignar(tarea.id, valor === '' ? null : valor);
            }}
          >
            <option value="">Sin responsable</option>
            {activas.map((persona) => (
              <option key={persona.id} value={persona.id}>
                {persona.nombre}
              </option>
            ))}
          </select>
          <button type="button" className="mini" onClick={() => setAsignando(null)}>
            Cancelar
          </button>
        </div>
      )}
    </>
  );
}

/** Una terminada (o una cancelada): sin destino, con el botón de corregir. */
function FilaTerminada({
  fila,
  sinCorregir = false,
  ...propias
}: PropiasDeFila & { fila: FilaCierre; sinCorregir?: boolean }) {
  const { tarea } = fila.ubicacion;
  return (
    <article className="item-cierre" id={`cierre-${tarea.id}`}>
      <CuerpoFila fila={fila} avisaSinResponsable={false} {...propias} />
      {propias.editable && !sinCorregir && (
        <div className="item-cierre__control">
          <button
            type="button"
            className="mini"
            title="La devuelve a «en curso». Es un cambio aparte, con su propio deshacer, y se guarda ya."
            onClick={() => void propias.acciones.corregir(tarea.id)}
          >
            No, no terminó
          </button>
        </div>
      )}
    </article>
  );
}

/** Una que pide destino. Si está bloqueada, primero la pregunta de si sigue detenida. */
function FilaDecision({
  fila,
  destino,
  marcar,
  ...propias
}: PropiasDeFila & {
  fila: FilaCierre;
  destino: DestinoCierre;
  marcar: (destino: DestinoCierre) => void;
}) {
  const { tarea } = fila.ubicacion;
  const bloqueada = fila.bloqueo !== null;

  return (
    <article className={`item-cierre${bloqueada ? ' item-cierre--bloqueada' : ''}`} id={`cierre-${tarea.id}`}>
      <CuerpoFila
        fila={fila}
        avisaSinResponsable={destino === 'siguiente'}
        {...propias}
      />
      <div className="item-cierre__control">
        {/* La pregunta del bloque, contestable en la propia fila. «Sigue detenida» es el
            estado vigente y por eso va deshabilitado: no hay nada que guardar si la
            respuesta es que nada cambió. La otra respuesta SÍ es un cambio, y sale como
            `desbloquear` en el acto, con su deshacer propio. */}
        {propias.editable && bloqueada && (
          <div className="alternador" role="group" aria-label={`¿Sigue detenida ${tarea.id}?`}>
            <button type="button" aria-pressed disabled title="Es lo que dice el bloqueo ahora mismo">
              Sigue detenida
            </button>
            <button
              type="button"
              aria-pressed={false}
              title="Cierra el bloqueo conservando su registro histórico. Se guarda ya."
              onClick={() => void propias.acciones.destrabar(tarea.id)}
            >
              Ya se destrabó
            </button>
          </div>
        )}
        {propias.editable ? (
          <div className="alternador" role="group" aria-label={`Destino de ${tarea.id}`}>
            {ORDEN_DESTINOS.map((opcion) => (
              <button
                key={opcion}
                type="button"
                aria-pressed={destino === opcion}
                title={TITULO_DESTINO[opcion]}
                onClick={() => marcar(opcion)}
              >
                {ETIQUETA_DESTINO[opcion]}
              </button>
            ))}
          </div>
        ) : (
          <span className="item-cierre__solo-lectura">{ETIQUETA_DESTINO[destino]}</span>
        )}
        {propias.editable && (
          <button
            type="button"
            className="mini"
            title="La marca hecha. Es un cambio aparte, con su propio deshacer, y se guarda ya."
            onClick={() => void propias.acciones.darPorHecha(tarea.id)}
          >
            Sí terminó
          </button>
        )}
      </div>
    </article>
  );
}

/**
 * El aviso del pie. No solo cuenta: lleva la acción para arreglarlo sin salir de aquí,
 * porque un aviso que solo señala el problema se aprende a ignorar en tres sprints.
 */
function AvisoSinResponsable({
  filas,
  pasan,
  abrir,
}: {
  filas: FilaCierre[];
  pasan: number;
  abrir: (tareaId: string) => void;
}) {
  const primera = filas[0];
  if (primera === undefined) return null;

  return (
    <span className="aviso-falta" role="status">
      <CuadroBloqueo />
      <span>
        {filas.length} de las {pasan} que pasan {filas.length === 1 ? 'no tiene' : 'no tienen'}{' '}
        responsable
      </span>
      <button
        type="button"
        className="aviso-falta__accion"
        onClick={() => abrir(primera.ubicacion.tarea.id)}
      >
        Asignar {primera.ubicacion.tarea.id}
      </button>
    </span>
  );
}
