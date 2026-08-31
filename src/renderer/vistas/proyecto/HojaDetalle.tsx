/**
 * La hoja de detalle: lo que hay DENTRO de una épica, una historia o una tarea.
 *
 * Hasta aquí el árbol solo sabía decir el título y el avance. La descripción, los
 * criterios, el historial de bloqueos y el reloj de resolución existían en el esquema y no
 * tenían dónde verse: la única puerta a la descripción de una tarea era el formulario de
 * compromiso, y ese solo abre para las que ya están en el sprint.
 *
 * ## Por qué era una hoja encima del sprint y no un tercer panel
 *
 * `CLAUDE.md` es explícito: bajo 1040 px el panel del sprint ya no cabe y un tercero no
 * cabría nunca. Así que la hoja OCUPA la celda del sprint en la misma rejilla —columna 3
 * en dos paneles, columna 2 cuando el umbral colapsa el sprint— y se apila encima. No es
 * un modal: no atrapa el foco ni apaga el resto de la pantalla, porque leer el detalle de
 * una tarea mientras se mira el árbol es exactamente lo que uno quiere hacer.
 *
 * **[SUPERADO — 2026-08-31, decisión del usuario: la hoja pasa a modal centrada para tener
 * ancho de trabajo. La razón original —mirar el árbol mientras se lee— la cubre ahora la
 * columna de completadas, que no tapa nada.]**
 *
 * Ahora el detalle es un diálogo modal centrado: ofrece ancho estable, atrapa el foco y
 * apaga temporalmente el tablero hasta cerrar la tarea en curso.
 *
 * Se cierra con `Escape`, con su botón, al cambiar de vista y al empezar un arrastre.
 * Esto último lo decide el reductor: un modal abierto impide interactuar con el fondo.
 *
 * ## Qué escribe y qué solo enseña
 *
 * Escribe título y descripción, con `editarEpica`, `editarHistoria` y `editarTarea`, que
 * ya aceptan los dos campos. Todo lo demás se LEE: `criterios`, `tipo` y `equipo_id` no
 * tienen comando que los toque, y un campo editable que al guardar no guarda nada es peor
 * que un campo que se ve en gris.
 */

import { useEffect, useRef, useState } from 'react';

import {
  bloqueoAbierto,
  diasBloqueada,
  diasEntre,
  estaEnSprint,
  fechaDe,
  sprintsQueLaTocaron,
} from '../../../compartido/dominio/clasificar';
import {
  avanceDeEpica,
  avanceDeHistoria,
  estadoDerivado,
  rutaDe,
  tareasDe,
  type UbicacionTarea,
} from '../../../compartido/dominio/derivar';
import { resolucionDe, tiempoEnDesarrollo } from '../../../compartido/dominio/duracion';
import type {
  Documento,
  Epica,
  EstadoTarea,
  Fecha,
  Historia,
  Proyecto,
  Sprint,
  Tarea,
} from '../../../compartido/modelo/tipos';
import { ChipNeutro } from '../../componentes/Chips';
import { Glifo } from '../../componentes/iconos';
import { Medidor } from '../../componentes/Medidor';
import type { Detalle } from '../../estado/interfaz';
import { useMutar } from '../../estado/mutaciones';
import {
  cuenta,
  dias,
  etiquetaBloqueo,
  etiquetaDerivada,
  etiquetaDeTarea,
  fechaCorta,
  formaDerivada,
  formaDeTarea,
  instanteCorto,
} from '../../util/presentacion';

/**
 * Los cinco del flujo más `cancelada`, en su orden. La regla 19 manda: «elegir un estado
 * concreto vive en el tablero por equipo y en el detalle de la tarea» — la fila solo sabe
 * avanzar, y aquí es donde se puede ir a uno en concreto o volver atrás.
 *
 * `cancelada` va al final y separada: no es un paso del flujo, es salirse de él.
 */
const PIPELINE: readonly EstadoTarea[] = ['pendiente', 'iniciado', 'en_pruebas', 'terminado', 'done'];

/** El nodo ya resuelto contra el documento vigente. */
type Nodo =
  | { clase: 'epica'; epica: Epica }
  | { clase: 'historia'; epica: Epica; historia: Historia }
  | { clase: 'tarea'; ubicacion: UbicacionTarea };

/**
 * Del id a la cosa. Devuelve `null` si el nodo ya no existe —lo borraron con la hoja
 * abierta—, y entonces no se pinta nada: inventar un hueco con el id dentro sería peor.
 */
function localizar(
  proyecto: Proyecto,
  detalle: Detalle,
  indice: ReadonlyMap<string, UbicacionTarea>,
): Nodo | null {
  if (detalle.clase === 'tarea') {
    const ubicacion = indice.get(detalle.id);
    return ubicacion === undefined ? null : { clase: 'tarea', ubicacion };
  }
  for (const epica of proyecto.epicas) {
    if (detalle.clase === 'epica') {
      if (epica.id === detalle.id) return { clase: 'epica', epica };
      continue;
    }
    const historia = epica.historias.find((h) => h.id === detalle.id);
    if (historia !== undefined) return { clase: 'historia', epica, historia };
  }
  return null;
}

export interface PropsHojaDetalle {
  documento: Documento;
  proyecto: Proyecto;
  /** El sprint activo del proyecto, para decir si la tarea está comprometida. */
  sprint: Sprint | undefined;
  hoy: Fecha;
  detalle: Detalle;
  indice: ReadonlyMap<string, UbicacionTarea>;
  /** `false` en solo lectura: se lee todo, no se escribe nada. */
  editable: boolean;
  cerrar: () => void;
}

export function HojaDetalle({
  documento,
  proyecto,
  sprint,
  hoy,
  detalle,
  indice,
  editable,
  cerrar,
}: PropsHojaDetalle) {
  const nodo = localizar(proyecto, detalle, indice);
  const caja = useRef<HTMLDivElement>(null);

  /**
   * `Escape` cierra. Se escucha en la ventana y no en la hoja porque el foco del teclado
   * casi nunca está dentro: se abre desde el árbol y la mano sigue ahí. Y se calla dentro
   * de un campo de texto, donde `Escape` significa «cancela esta edición».
   */
  useEffect(() => {
    const escucha = (evento: KeyboardEvent) => {
      if (evento.key === 'Tab' && caja.current !== null) {
        const enfocables = [...caja.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
        )];
        if (enfocables.length === 0) {
          evento.preventDefault();
          caja.current.focus();
          return;
        }
        const primero = enfocables[0]!;
        const ultimo = enfocables.at(-1)!;
        if (evento.shiftKey && document.activeElement === primero) {
          evento.preventDefault();
          ultimo.focus();
        } else if (!evento.shiftKey && document.activeElement === ultimo) {
          evento.preventDefault();
          primero.focus();
        }
        return;
      }
      if (evento.key !== 'Escape') return;
      const destino = evento.target;
      if (destino instanceof HTMLElement) {
        const etiqueta = destino.tagName;
        if (etiqueta === 'INPUT' || etiqueta === 'TEXTAREA' || destino.isContentEditable) return;
      }
      cerrar();
    };
    window.addEventListener('keydown', escucha);
    return () => window.removeEventListener('keydown', escucha);
  }, [cerrar]);

  useEffect(() => {
    const primero = caja.current?.querySelector<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled])',
    );
    (primero ?? caja.current)?.focus();
  }, []);

  if (nodo === null) return null;

  const id = detalle.id;

  return (
    <div className="panel--detalle" onMouseDown={(evento) => {
      if (evento.target === evento.currentTarget) cerrar();
    }}>
      <div
        ref={caja}
        className="panel panel--detalle-caja"
        role="dialog"
        aria-label={`Detalle de ${id}`}
        aria-modal="true"
        aria-labelledby={`detalle-titular-${id}`}
        tabIndex={-1}
      >
      <header className="cab">
        <h2 className="cab__titulo">
          {nodo.clase === 'epica' ? 'Épica' : nodo.clase === 'historia' ? 'Historia' : 'Tarea'} ·{' '}
          {id}
        </h2>
        <span className="crece" />
        <button type="button" className="cab__accion" onClick={cerrar}>
          Cerrar · Esc
        </button>
      </header>

      <div className="lienzo detalle">
        {nodo.clase === 'tarea' ? (
          <DetalleTarea
            documento={documento}
            ubicacion={nodo.ubicacion}
            sprint={sprint}
            hoy={hoy}
            editable={editable}
            idTitular={`detalle-titular-${id}`}
          />
        ) : (
          <DetalleContenedor nodo={nodo} sprint={sprint} editable={editable} idTitular={`detalle-titular-${id}`} />
        )}
      </div>
      </div>
    </div>
  );
}

// --- épica e historia -------------------------------------------------------

/**
 * Una épica o una historia. Se pintan con el MISMO componente porque la única diferencia
 * es que la épica tiene un nivel más de hijos; duplicarlo habría dejado dos sitios donde
 * arreglar el día que cambie el formato de la descripción.
 */
function DetalleContenedor({
  nodo,
  sprint,
  editable,
  idTitular,
}: {
  nodo: Extract<Nodo, { clase: 'epica' | 'historia' }>;
  sprint: Sprint | undefined;
  editable: boolean;
  idTitular: string;
}) {
  const esEpica = nodo.clase === 'epica';
  const contenedor = esEpica ? nodo.epica : nodo.historia;
  const avance = esEpica ? avanceDeEpica(nodo.epica) : avanceDeHistoria(nodo.historia);
  const derivado = estadoDerivado(avance);
  const sueltas = tareasDe(contenedor);

  return (
    <>
      <Titular
        glifo={<Glifo forma={formaDerivada(derivado)} etiqueta={etiquetaDerivada(derivado)} />}
        titulo={contenedor.titulo}
        ruta={esEpica ? [] : [nodo.epica.titulo]}
        clase={nodo.clase}
        id={contenedor.id}
        editable={editable}
        idTitular={idTitular}
      />

      <div className="detalle__avance">
        <Medidor avance={avance} />
        <span className="tabular">{etiquetaDerivada(derivado)}</span>
      </div>

      <Descripcion
        valor={contenedor.descripcion}
        clase={nodo.clase}
        id={contenedor.id}
        editable={editable}
      />

      {esEpica && (
        <Seccion titulo={`Historias · ${nodo.epica.historias.length}`}>
          {nodo.epica.historias.length === 0 ? (
            <p className="detalle__nada">Sin historias. Puede tener tareas colgadas directamente.</p>
          ) : (
            <ul className="detalle__hijos">
              {nodo.epica.historias.map((historia) => {
                const suyo = estadoDerivado(avanceDeHistoria(historia));
                return (
                  <li key={historia.id}>
                    <Glifo forma={formaDerivada(suyo)} etiqueta={etiquetaDerivada(suyo)} />
                    <span className="detalle__hijo-texto">{historia.titulo}</span>
                    <Medidor avance={avanceDeHistoria(historia)} conBarra={false} />
                    <span className="clave tabular">{historia.id}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </Seccion>
      )}

      <Seccion
        titulo={`${esEpica ? 'Tareas sueltas' : 'Tareas'} · ${sueltas.length}`}
      >
        {sueltas.length === 0 ? (
          <p className="detalle__nada">
            {esEpica
              ? 'Ninguna tarea cuelga de la épica sin historia de por medio.'
              : 'Sin desglosar: la historia existe pero nadie ha escrito sus tareas.'}
          </p>
        ) : (
          <ListaTareas tareas={sueltas} sprint={sprint} />
        )}
      </Seccion>
    </>
  );
}

/** Las tareas de un contenedor, con su glifo, su clave y si están comprometidas. */
function ListaTareas({ tareas, sprint }: { tareas: readonly Tarea[]; sprint: Sprint | undefined }) {
  return (
    <ul className="detalle__hijos">
      {tareas.map((tarea) => (
        <li key={tarea.id}>
          <Glifo forma={formaDeTarea(tarea.estado)} etiqueta={etiquetaDeTarea(tarea.estado)} />
          <span className="detalle__hijo-texto">{tarea.titulo}</span>
          {estaEnSprint(tarea.id, sprint) && (
            <ChipNeutro texto="en el sprint" titulo="Comprometida en el sprint activo" />
          )}
          <span className="clave tabular">{tarea.id}</span>
        </li>
      ))}
    </ul>
  );
}

// --- tarea ------------------------------------------------------------------

function DetalleTarea({
  documento,
  ubicacion,
  sprint,
  hoy,
  editable,
  idTitular,
}: {
  documento: Documento;
  ubicacion: UbicacionTarea;
  sprint: Sprint | undefined;
  hoy: Fecha;
  editable: boolean;
  idTitular: string;
}) {
  const { tarea } = ubicacion;
  const bloqueo = bloqueoAbierto(tarea);
  const resolucion = resolucionDe(documento, ubicacion);
  const reloj = tiempoEnDesarrollo(tarea);
  const pasados = sprintsQueLaTocaron(documento, tarea.id);
  const persona = documento.personas.find((p) => p.id === tarea.responsable);
  // Los equipos viven en el PROYECTO, no en la raíz: son la lista de miembros de ese
  // proyecto, no un catálogo global.
  const equipo = ubicacion.proyecto.equipos.find((e) => e.id === tarea.equipo_id);

  return (
    <>
      <Titular
        glifo={<Glifo forma={formaDeTarea(tarea.estado)} etiqueta={etiquetaDeTarea(tarea.estado)} />}
        titulo={tarea.titulo}
        // La migaja omite los niveles que no existen (regla 18): se le quita la clave del
        // proyecto, que ya está en la barra superior y en el propio id.
        ruta={rutaDe(ubicacion).slice(1)}
        clase="tarea"
        id={tarea.id}
        editable={editable}
        idTitular={idTitular}
      />

      <div className="detalle__avance">
        <span className="detalle__estado">{etiquetaDeTarea(tarea.estado)}</span>
        {estaEnSprint(tarea.id, sprint) && (
          <ChipNeutro texto="en el sprint" titulo="Comprometida en el sprint activo" />
        )}
        {tarea.tipo === 'error' && <ChipNeutro texto="error" />}
        {!tarea.planeada && <ChipNeutro texto="no planeada" titulo="Entró después de cerrar la planeación" />}
      </div>

      {editable && <SelectorEstado tarea={tarea} />}

      {/* El bloqueo es una BANDERA, no un estado (CLAUDE.md): va junto al estado y nunca
          en su lugar. Aquí cabe el motivo entero, que en la fila del árbol no cabía. */}
      {bloqueo !== null && (
        <p className="detalle__bloqueo">
          <strong>Bloqueada {dias(diasBloqueada(tarea, hoy) ?? 0)}</strong> ·{' '}
          {etiquetaBloqueo(bloqueo.tipo)} · {bloqueo.motivo}
        </p>
      )}

      <Descripcion valor={tarea.descripcion} clase="tarea" id={tarea.id} editable={editable} />

      {tarea.criterios !== null && (
        <Seccion titulo="Criterios de aceptación">
          <p className="detalle__parrafo">{tarea.criterios}</p>
        </Seccion>
      )}

      <Seccion titulo="Compromiso">
        <dl className="detalle__campos">
          <Campo etiqueta="Responsable" valor={persona?.nombre ?? null} />
          <Campo
            etiqueta="Fecha límite"
            valor={tarea.fecha_limite === null ? null : fechaCorta(tarea.fecha_limite)}
          />
          <Campo etiqueta="Prioridad" valor={tarea.prioridad} />
          {/* Sin estimar es lo NORMAL (regla 23), y por eso se dice con palabras y no con
              un guion que se lee como un dato que falta. */}
          <Campo
            etiqueta="Esfuerzo"
            valor={tarea.esfuerzo === null ? null : `${tarea.esfuerzo} pts`}
            ausente="sin estimar"
          />
          <Campo etiqueta="Equipo" valor={equipo?.nombre ?? null} />
        </dl>
      </Seccion>

      <Seccion titulo="Tiempo en desarrollo">
        {/* El reloj es la SUMA de los tramos, nunca `fin − inicio`, y no depende del
            sprint (regla 21). El total va con cuántos tramos lo componen, y el tramo
            abierto va aparte: sumarlo haría crecer para siempre una tarea olvidada. */}
        {reloj.dias === null ? (
          <p className="detalle__nada">
            Sin tramos cerrados. No significa cero trabajo: significa que nadie lo midió.
          </p>
        ) : (
          <p className="detalle__parrafo tabular">
            {dias(reloj.dias)} · {cuenta(reloj.tramos, 'tramo', 'tramos')}
          </p>
        )}
        {/* El desglose sale del `estado` que cada tramo guarda, no de un campo aparte.
            Cada mitad es `null` —no cero— cuando la tarea no pasó por ese estado: no
            probó durante cero días, es que no se midió nada ahí. */}
        {(reloj.desarrollo !== null || reloj.pruebas !== null) && (
          <p className="detalle__parrafo tabular">
            {reloj.desarrollo === null ? 'Sin desarrollo medido' : `Desarrollo ${dias(reloj.desarrollo)}`}
            {' · '}
            {reloj.pruebas === null ? 'sin pruebas medidas' : `pruebas ${dias(reloj.pruebas)}`}
          </p>
        )}
        {reloj.corriendoDesde !== null && (
          <p className="detalle__parrafo tabular">
            Corriendo desde hace {dias(diasEntre(fechaDe(reloj.corriendoDesde), hoy))}. No entra
            en el total.
          </p>
        )}
        {tarea.trabajo.length > 0 && (
          <ul className="detalle__tramos">
            {tarea.trabajo.map((tramo, i) => (
              <li key={`${tramo.desde}-${i}`}>
                <span className="tabular">
                  {instanteCorto(tramo.desde)} –{' '}
                  {tramo.hasta === null ? 'corriendo' : instanteCorto(tramo.hasta)}
                </span>
                <span className="detalle__tramo-estado">{etiquetaDeTarea(tramo.estado)}</span>
              </li>
            ))}
          </ul>
        )}
      </Seccion>

      {/* Otra medida y por eso otra sección: lo que COSTÓ contra lo que TARDÓ. Lo que
          sobra del calendario es espera —cola, bloqueo, revisión ajena—, y el reloj que
          murió en M5 la contaba como trabajo porque calendario era lo único que sabía
          medir. Ya no se nombra ningún sprint aquí: la duración no depende de uno. */}
      {resolucion !== null && (
        <Seccion titulo="Resolución">
          <p className="detalle__parrafo tabular">
            {dias(resolucion.dias)} trabajados
            {resolucion.calendario !== null && ` · ${dias(resolucion.calendario)} de calendario`}
          </p>
          {resolucion.sprintsAtravesados > 0 && (
            <p className="detalle__parrafo tabular">
              Pasó por {cuenta(resolucion.sprintsAtravesados, 'sprint', 'sprints')}. El
              arrastre se cuenta en sprints y no está dentro de los días de arriba.
            </p>
          )}
        </Seccion>
      )}

      {tarea.bloqueos.length > 0 && (
        <Seccion titulo={`Bloqueos · ${tarea.bloqueos.length}`}>
          <ul className="detalle__tramos">
            {tarea.bloqueos.map((registro, i) => (
              <li key={`${registro.bloqueada_en}-${i}`}>
                <span className="tabular">
                  {instanteCorto(registro.bloqueada_en)} –{' '}
                  {registro.desbloqueada_en === null
                    ? 'abierto'
                    : instanteCorto(registro.desbloqueada_en)}
                </span>
                <span className="detalle__tramo-estado">
                  {etiquetaBloqueo(registro.tipo)} · {registro.motivo}
                </span>
              </li>
            ))}
          </ul>
        </Seccion>
      )}

      {pasados.length > 0 && (
        <Seccion titulo={`Sprints por los que pasó · ${pasados.length}`}>
          <ul className="detalle__tramos">
            {pasados.map((s) => (
              <li key={s.id}>
                <span className="tabular">{s.nombre}</span>
                <span className="detalle__tramo-estado">
                  {fechaCorta(s.inicio)}–{fechaCorta(s.fin)} · {s.estado}
                </span>
              </li>
            ))}
          </ul>
        </Seccion>
      )}
    </>
  );
}

/**
 * Ir a un estado CONCRETO, que es lo que la fila del árbol no puede ofrecer.
 *
 * Con cinco estados el pipeline no cabe en una fila y por eso allá solo hay `Avanzar`
 * (Espacio, sin ciclo). La regla 19 dice dónde vive lo demás, y es aquí. El estado
 * vigente va marcado con `aria-pressed`, no solo con un color: el color no lo oye nadie.
 */
function SelectorEstado({ tarea }: { tarea: Tarea }) {
  const mutar = useMutar();
  const ir = (estado: EstadoTarea) => {
    if (estado === tarea.estado) return;
    void mutar(
      { comando: 'cambiarEstado', id: tarea.id, estado },
      `${etiquetaDeTarea(estado)} · ${tarea.id}`,
    );
  };

  return (
    <div className="detalle__estados" role="group" aria-label={`Estado de ${tarea.id}`}>
      {PIPELINE.map((estado) => (
        <button
          key={estado}
          type="button"
          aria-pressed={tarea.estado === estado}
          onClick={() => ir(estado)}
        >
          {etiquetaDeTarea(estado)}
        </button>
      ))}
      <span className="detalle__estados-sep" aria-hidden="true" />
      <button
        type="button"
        aria-pressed={tarea.estado === 'cancelada'}
        onClick={() => ir(tarea.estado === 'cancelada' ? 'pendiente' : 'cancelada')}
      >
        {tarea.estado === 'cancelada' ? 'Revivir' : 'Cancelar'}
      </button>
    </div>
  );
}

// --- piezas -----------------------------------------------------------------

/** Migaja, glifo y título. El título se renombra aquí mismo, sin volver al árbol. */
function Titular({
  glifo,
  titulo,
  ruta,
  clase,
  id,
  editable,
  idTitular,
}: {
  glifo: React.ReactNode;
  titulo: string;
  ruta: readonly string[];
  clase: 'epica' | 'historia' | 'tarea';
  id: string;
  editable: boolean;
  idTitular: string;
}) {
  const mutar = useMutar();
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState(titulo);

  const guardar = async () => {
    const limpio = texto.trim();
    // Un título vacío no es un cambio, es un borrado accidental: el comando lo rechaza
    // igual, pero pedirlo y que falle deja un aviso donde debería haber nada.
    if (limpio === '' || limpio === titulo) {
      setEditando(false);
      setTexto(titulo);
      return;
    }
    const ok = await mutar(comandoEditar(clase, id, { titulo: limpio }), `Renombrar ${id}`);
    if (ok) setEditando(false);
  };

  return (
    <div className="detalle__titular">
      {ruta.length > 0 && <p className="detalle__ruta">{ruta.join(' › ')}</p>}
      <div className="detalle__titulo">
        {glifo}
        {editando ? (
          <input
            autoFocus
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void guardar();
              if (e.key === 'Escape') {
                setTexto(titulo);
                setEditando(false);
              }
            }}
            onBlur={() => void guardar()}
          />
        ) : (
          <h3 id={idTitular}>{titulo}</h3>
        )}
        <span className="crece" />
        {editable && !editando && (
          <button
            type="button"
            className="cab__accion"
            onClick={() => {
              setTexto(titulo);
              setEditando(true);
            }}
          >
            Renombrar
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * La descripción, que es lo que el usuario vino a leer.
 *
 * El texto vive en un `useState` local y no en el estado de interfaz, por la misma razón
 * que el resto de los formularios: una tecla que despacha al reductor vuelve a renderizar
 * la app entera.
 */
function Descripcion({
  valor,
  clase,
  id,
  editable,
}: {
  valor: string | null;
  clase: 'epica' | 'historia' | 'tarea';
  id: string;
  editable: boolean;
}) {
  const mutar = useMutar();
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState(valor ?? '');

  const guardar = async () => {
    const limpio = texto.trim() === '' ? null : texto.trim();
    if (limpio === valor) {
      setEditando(false);
      return;
    }
    const ok = await mutar(
      comandoEditar(clase, id, { descripcion: limpio }),
      `Describir ${id}`,
    );
    if (ok) setEditando(false);
  };

  return (
    <Seccion titulo="Descripción">
      {editando ? (
        <div className="detalle__editor">
          <label className="campo">
            <span className="solo-lectores">Descripción de {id}</span>
            <textarea
              autoFocus
              rows={5}
              value={texto}
              placeholder="Qué es esto y qué hay que dejar listo."
              onChange={(e) => setTexto(e.target.value)}
              // El escucha global de la hoja se calla dentro de un campo de texto porque
              // ahí `Escape` significa «cancela ESTA edición». Que lo signifique de verdad
              // es cosa de esta línea: sin ella la tecla no hacía nada.
              onKeyDown={(e) => {
                if (e.key !== 'Escape') return;
                e.stopPropagation();
                setTexto(valor ?? '');
                setEditando(false);
              }}
            />
          </label>
          <div className="detalle__acciones">
            <button type="button" className="boton-solido" onClick={() => void guardar()}>
              Guardar
            </button>
            <button
              type="button"
              className="boton-texto"
              onClick={() => {
                setTexto(valor ?? '');
                setEditando(false);
              }}
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <>
          {valor === null ? (
            <p className="detalle__nada">Sin descripción.</p>
          ) : (
            <p className="detalle__parrafo">{valor}</p>
          )}
          {editable && (
            <button
              type="button"
              className="cab__accion"
              onClick={() => {
                setTexto(valor ?? '');
                setEditando(true);
              }}
            >
              {valor === null ? 'Escribir…' : 'Editar…'}
            </button>
          )}
        </>
      )}
    </Seccion>
  );
}

/**
 * El comando de edición que le toca a cada clase. Existe para que las dos piezas que
 * escriben —título y descripción— no repitan el mismo `switch` con la mitad de los casos.
 */
function comandoEditar(
  clase: 'epica' | 'historia' | 'tarea',
  id: string,
  campos: { titulo?: string; descripcion?: string | null },
) {
  if (clase === 'epica') return { comando: 'editarEpica' as const, id, ...campos };
  if (clase === 'historia') return { comando: 'editarHistoria' as const, id, ...campos };
  return { comando: 'editarTarea' as const, id, ...campos };
}

function Seccion({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="detalle__seccion">
      <h4 className="detalle__seccion-titulo">{titulo}</h4>
      {children}
    </section>
  );
}

/** Un campo con su etiqueta. Lo ausente se NOMBRA; nunca se rellena con un guion. */
function Campo({
  etiqueta,
  valor,
  ausente = 'sin definir',
}: {
  etiqueta: string;
  valor: string | null;
  ausente?: string;
}) {
  return (
    <>
      <dt>{etiqueta}</dt>
      <dd className={valor === null ? 'detalle__nada' : undefined}>{valor ?? ausente}</dd>
    </>
  );
}
