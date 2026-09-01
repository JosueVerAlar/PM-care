/**
 * Equipos — proyecto → equipos → miembros, la única pantalla donde eso se ve y se edita.
 *
 * ## El modelo, decidido por el usuario y cerrado (N11)
 *
 * **Un equipo es una entidad con identidad propia dentro de un proyecto.** Un proyecto
 * tiene varios —«Frontend», «Backend»—, cada uno con su id, su nombre y sus miembros. El
 * atajo «equipo ≡ proyecto» está muerto: era lo que hacía que `editarEquipo` escribiera
 * siempre sobre `equipos[0]` y que un proyecto no pudiera tener dos.
 *
 * - Las personas siguen siendo un **catálogo global** y los equipos se arman tomando de
 *   ahí: añadir a alguien es elegirlo, nunca volver a darlo de alta.
 * - La misma persona puede estar en dos equipos **del mismo proyecto**, y eso es legal:
 *   es justo el caso que obliga a que `tarea.equipo_id` sea explícito.
 * - Un proyecto recién creado **nace sin equipos**. No se le inventa un «General», igual
 *   que no se le inventa una épica (regla 18): crear el primero es un gesto del usuario.
 *
 * ## El id lo teclea el usuario, y por eso el campo dice su forma antes de fallar
 *
 * No hay contador que lo emita (S5) y es único en todo el documento. La forma de pedirlo
 * está en `id-equipo.ts`: se propone uno bien formado desde la clave y el nombre, y el
 * problema —forma inválida o id ocupado— se nombra mientras se escribe, con las mismas
 * palabras con las que el reductor lo rechazaría.
 *
 * ## Por qué se manda la lista completa de miembros
 *
 * `editarEquipo` reemplaza la lista de ESE equipo. Un equipo son cuatro personas: mandar
 * la lista es más simple y más fácil de deshacer que tres comandos de alta, baja y cambio
 * de responsabilidades — y sigue sin ser «mandar el documento» (regla 9), porque lo que
 * viaja es una intención con nombre sobre un equipo concreto. Recolocar a alguien es la
 * excepción: `moverMiembro` lo saca de uno y lo mete en otro **con su ficha entera**, y
 * eso es lo que permite partir el «General» de la migración sin perder ningún rol.
 *
 * ## Y por eso cada miembro dice en qué OTRO equipo está
 *
 * Repartida en tarjetas, la pertenencia múltiple queda disuelta en tres sitios y no se ve
 * nunca; y es justo el dato que decide si a esa persona se le puede pedir algo más.
 */

import { useMemo, useState } from 'react';

import {
  candidatosDeEquipo,
  equiposParaAdmin,
  miembrosDeEquipo,
  type FilaEquipoAdmin,
  type MiembroEditable,
  type ProyectoConEquipos,
} from '../../../compartido/dominio/administracion';
import { personasEnEquipos } from '../../../compartido/dominio/carga';
import type { Documento } from '../../../compartido/modelo/tipos';
import { Advertencia, Equis, Mas } from '../../componentes/iconos';
import { useAccionesInterfaz } from '../../estado/interfaz';
import { useMutar, useSoloLectura } from '../../estado/mutaciones';
import { cuenta, nombreSinClave, tareas as cuentaTareas } from '../../util/presentacion';
import { Lienzo } from '../globales/piezas';
import { FORMA_ID_EQUIPO, idEquipoSugerido, problemaDeIdEquipo } from './id-equipo';

/** Un equipo al que se puede mover a alguien, con su proyecto para poder agruparlo. */
interface Destino {
  clave: string;
  equipos: { id: string; nombre: string }[];
}

export function SeccionEquipos({ documento }: { documento: Documento }) {
  const soloLectura = useSoloLectura();

  // Toda la lectura sale del dominio: proyecto → equipos → miembros, con la capacidad ya
  // derivada y la señal de responsables fuera ya contada. Rehacerla aquí daría dos
  // verdades que divergen en cuanto una cambie.
  const todos = useMemo(() => equiposParaAdmin(documento), [documento]);
  const activas = useMemo(
    () =>
      new Set(
        documento.proyectos
          .filter((proyecto) => !proyecto.archivado && proyecto.cerrado_en === null)
          .map((proyecto) => proyecto.clave),
      ),
    [documento.proyectos],
  );
  const proyectos = useMemo(
    () => todos.filter((proyecto) => activas.has(proyecto.clave)),
    [todos, activas],
  );

  const personas = useMemo(() => personasEnEquipos(documento), [documento]);
  const enVarios = personas.filter((persona) => persona.equipos.length > 1);

  /**
   * Id de equipo → quién lo tiene. Se construye sobre TODOS los proyectos, también los
   * cerrados: el id es único en el documento entero, y un choque con el equipo de un
   * proyecto archivado es un choque igual.
   */
  const ocupados = useMemo(
    () =>
      new Map(
        todos.flatMap((proyecto) =>
          proyecto.equipos.map((equipo) => [equipo.id, `"${equipo.nombre}" de ${proyecto.clave}`] as const),
        ),
      ),
    [todos],
  );

  /** A dónde se puede mover a alguien. Solo proyectos en marcha: mover a uno cerrado
      sería meter trabajo nuevo en algo que ya no lo recibe. */
  const destinos = useMemo<Destino[]>(
    () =>
      proyectos
        .filter((proyecto) => proyecto.equipos.length > 0)
        .map((proyecto) => ({
          clave: proyecto.clave,
          equipos: proyecto.equipos.map((equipo) => ({ id: equipo.id, nombre: equipo.nombre })),
        })),
    [proyectos],
  );

  const totalEquipos = proyectos.reduce((suma, proyecto) => suma + proyecto.equipos.length, 0);

  return (
    <>
      <header className="cab">
        <h2 className="cab__titulo">
          Equipos · {cuenta(totalEquipos, 'equipo', 'equipos')} en{' '}
          {cuenta(proyectos.length, 'proyecto activo', 'proyectos activos')}
        </h2>
      </header>

      <Lienzo>
        <div className="adm">
          <div className="bloque bloque--ancho">
            {/* Un equipo se puede crear vacío, así que el catálogo vacío no bloquea la
                pantalla: solo se dice de dónde salen los miembros. */}
            {documento.personas.length === 0 && (
              <p className="bloque__nota">
                No hay personas en el catálogo. Los equipos se pueden crear igual y llenarlos
                después: sus miembros salen del catálogo global, que se edita en la sección
                Personas.
              </p>
            )}

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
                        {/* Una entrada por EQUIPO, no por proyecto: alguien en Frontend y
                            Backend del mismo proyecto está en dos sitios, y colapsarlos
                            escondería justo la pertenencia doble que esta fila enseña. */}
                        {persona.equipos.map((equipo) => (
                          <span
                            className="chip chip--neutro"
                            key={equipo.equipoId}
                            title={`${equipo.equipo} · ${equipo.nombre}`}
                          >
                            {equipo.clave} · {equipo.equipo}
                            {equipo.responsabilidades.length > 0 &&
                              ` · ${equipo.responsabilidades.join(', ')}`}
                          </span>
                        ))}
                      </span>
                      <span className="crece" />
                      <span className="cruce__carga tabular">
                        {cuentaTareas(persona.abiertas)} {persona.abiertas === 1 ? 'abierta' : 'abiertas'} en total
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {proyectos.length === 0 ? (
              <p className="bloque__nota">
                No hay proyectos activos. Da de alta uno en la sección Proyectos, o reabre alguno
                de los cerrados.
              </p>
            ) : (
              proyectos.map((proyecto) => (
                <BloqueProyecto
                  key={proyecto.clave}
                  documento={documento}
                  proyecto={proyecto}
                  soloLectura={soloLectura}
                  ocupados={ocupados}
                  destinos={destinos}
                />
              ))
            )}
          </div>
        </div>
      </Lienzo>
    </>
  );
}

function BloqueProyecto({
  documento,
  proyecto,
  soloLectura,
  ocupados,
  destinos,
}: {
  documento: Documento;
  proyecto: ProyectoConEquipos;
  soloLectura: boolean;
  ocupados: ReadonlyMap<string, string>;
  destinos: readonly Destino[];
}) {
  const nombre = nombreSinClave(proyecto.clave, proyecto.nombre);

  return (
    <section className="seccion">
      <h3 className="seccion__titulo">
        {proyecto.clave}{nombre === null ? '' : ` · ${nombre}`}
        <span className="seccion__n tabular">
          {cuenta(proyecto.equipos.length, 'equipo', 'equipos')}
        </span>
      </h3>

      {/* Las tareas sin equipo se dicen SIEMPRE, también cuando son cero: es el conteo que
          hace que un proyecto sin equipos diga algo en vez de parecer un error, y el que
          avisa de que clasificar el backlog quedó a medias. */}
      <p className="seccion__aclaracion">
        {proyecto.equipos.length === 0
          ? `Sin equipos todavía. Sus ${cuentaTareas(proyecto.sinEquipo)} están sin equipo.`
          : proyecto.sinEquipo === 0
            ? 'Todas sus tareas tienen equipo.'
            : `${cuentaTareas(proyecto.sinEquipo)} sin equipo.`}
      </p>

      <div className="rejilla rejilla--equipos">
        {proyecto.equipos.map((equipo) => (
          <TarjetaEquipo
            key={equipo.id}
            documento={documento}
            equipo={equipo}
            soloLectura={soloLectura}
            destinos={destinos}
          />
        ))}
        {!soloLectura && (
          <AltaEquipo
            clave={proyecto.clave}
            nombreProyecto={nombre ?? proyecto.clave}
            ocupados={ocupados}
          />
        )}
      </div>
    </section>
  );
}

/**
 * El alta de un equipo: nombre e id, y nada más. Nace vacío porque el comando lo exige —un
 * solo camino para la pertenencia—, así que aquí no hay selector de miembros.
 */
function AltaEquipo({
  clave,
  nombreProyecto,
  ocupados,
}: {
  clave: string;
  nombreProyecto: string;
  ocupados: ReadonlyMap<string, string>;
}) {
  const mutar = useMutar();
  const [abierto, setAbierto] = useState(false);
  const [nombre, setNombre] = useState('');
  const [id, setId] = useState('');
  /** Mientras nadie lo haya tocado, el id sigue al nombre. En cuanto se edita deja de
      seguirlo, o cada tecla del nombre pisaría lo que el usuario acaba de escribir. */
  const [idTocado, setIdTocado] = useState(false);

  const propuesto = idTocado ? id.trim() : idEquipoSugerido(clave, nombre);
  const problema = problemaDeIdEquipo(propuesto, ocupados);
  const puedeCrear = nombre.trim() !== '' && problema === null;

  const cerrar = () => {
    setAbierto(false);
    setNombre('');
    setId('');
    setIdTocado(false);
  };

  if (!abierto) {
    return (
      <button type="button" className="equipo equipo--alta" onClick={() => setAbierto(true)}>
        <Mas /> Crear equipo en {clave}
      </button>
    );
  }

  return (
    <form
      className="equipo equipo--alta equipo--alta-abierta"
      onSubmit={(evento) => {
        evento.preventDefault();
        if (!puedeCrear) return;
        void mutar(
          { comando: 'crearEquipo', proyecto: clave, id: propuesto, nombre: nombre.trim() },
          `Crear el equipo ${nombre.trim()} en ${clave}`,
        ).then((ok) => {
          if (ok) cerrar();
        });
      }}
    >
      <p className="alta__titulo">Crear un equipo en {nombreProyecto}</p>

      <label className="campo">
        <span className="campo__etq">Nombre</span>
        <input
          type="text"
          value={nombre}
          autoFocus
          autoComplete="off"
          placeholder="Frontend"
          onChange={(evento) => setNombre(evento.target.value)}
        />
      </label>

      <label className="campo">
        <span className="campo__etq">Id</span>
        <input
          type="text"
          value={idTocado ? id : propuesto}
          autoComplete="off"
          spellCheck={false}
          placeholder="pm-frontend"
          aria-describedby={`alta-equipo-${clave}`}
          aria-invalid={nombre.trim() !== '' && problema !== null}
          onChange={(evento) => {
            setIdTocado(true);
            setId(evento.target.value);
          }}
        />
      </label>

      {/* La forma se dice ANTES de fallar, y el problema concreto la sustituye en cuanto
          lo hay. Un campo que solo se explica al ser rechazado enseña la regla tarde. */}
      <p className="alta__pie" id={`alta-equipo-${clave}`}>
        {nombre.trim() !== '' && problema !== null ? (
          <b className="alta__error">{problema}</b>
        ) : (
          <>
            {FORMA_ID_EQUIPO} Es único en todo el documento y <b>no se puede cambiar</b>:
            queda copiado en el <code>equipo_id</code> de cada tarea que lo tenga asignado.
          </>
        )}
      </p>

      <div className="alta__fila">
        <button type="submit" className="boton-solido" disabled={!puedeCrear}>
          Crear equipo
        </button>
        <button type="button" className="boton-texto" onClick={cerrar}>
          Cancelar
        </button>
      </div>
    </form>
  );
}

function TarjetaEquipo({
  documento,
  equipo,
  soloLectura,
  destinos,
}: {
  documento: Documento;
  equipo: FilaEquipoAdmin;
  soloLectura: boolean;
  destinos: readonly Destino[];
}) {
  const mutar = useMutar();
  const { avisar } = useAccionesInterfaz();
  const [agregando, setAgregando] = useState(false);
  const [borrando, setBorrando] = useState(false);
  /** Lo que se está tecleando. Vive aquí, no en el reductor: es texto de formulario. */
  const [borrador, setBorrador] = useState<{ campo: string; texto: string } | null>(null);

  // La lista que se reenvía sale del documento, no de la que se pinta: se copian los
  // miembros ENTEROS. `EsquemaMiembroEquipo` es `passthrough` y el usuario edita el JSON
  // a mano (regla 14); reconstruir cada miembro con los campos que esta pantalla conoce
  // borraría sus notas en el primer cambio de responsabilidades, en silencio.
  const miembros = useMemo(() => miembrosDeEquipo(documento, equipo.id), [documento, equipo.id]);
  const candidatos = useMemo(
    () => candidatosDeEquipo(documento, equipo.id),
    [documento, equipo.id],
  );
  const otrosEquipos = destinos
    .map((destino) => ({
      ...destino,
      equipos: destino.equipos.filter((otro) => otro.id !== equipo.id),
    }))
    .filter((destino) => destino.equipos.length > 0);

  const guardar = (lista: MiembroEditable[], contexto: string) =>
    void mutar({ comando: 'editarEquipo', equipoId: equipo.id, miembros: lista }, contexto);

  /** Un miembro dado de baja bloquea CUALQUIER edición del equipo: el reductor rechaza la
      lista entera si alguien de ella no es asignable. Se anticipa para que el usuario no
      llegue al rechazo sin saber cuál de las cuatro filas lo provoca. */
  const inactivos = equipo.miembros.filter((miembro) => !miembro.activa);

  return (
    // Región con nombre: con varias tarjetas por proyecto, «Frontend» y «Backend» tienen
    // que ser dos destinos distinguibles al navegar por regiones, no dos cajas iguales.
    <section className="equipo" aria-label={`Equipo ${equipo.nombre}`}>
      <div className="equipo__cab">
        <div className="equipo__identidad">
          {soloLectura ? (
            <p className="equipo__nombre">{equipo.nombre}</p>
          ) : (
            <input
              className="equipo__campo"
              type="text"
              value={borrador?.campo === 'nombre' ? borrador.texto : equipo.nombre}
              aria-label={`Nombre del equipo ${equipo.nombre}`}
              onChange={(evento) => setBorrador({ campo: 'nombre', texto: evento.target.value })}
              onKeyDown={(evento) => {
                // Enter solo quita el foco; guardar es cosa del `blur`, o Enter mandaría
                // el comando dos veces.
                if (evento.key === 'Enter') evento.currentTarget.blur();
                if (evento.key === 'Escape') {
                  setBorrador(null);
                  evento.currentTarget.blur();
                }
              }}
              // Se lee del DOM y no del estado: `borrador` viene de la clausura del
              // render, y un blur que llega antes de que React repinte vería el valor
              // viejo y se tragaría el cambio en silencio.
              onBlur={(evento) => {
                const nuevo = evento.currentTarget.value.trim();
                setBorrador(null);
                if (nuevo === '' || nuevo === equipo.nombre) return;
                void mutar(
                  { comando: 'editarEquipo', equipoId: equipo.id, nombre: nuevo },
                  `Renombrar el equipo ${equipo.nombre}`,
                );
              }}
            />
          )}
          {/* El id se enseña porque es lo que el usuario va a leer en `tarea.equipo_id`
              dentro del JSON, y lo que nombran los mensajes de rechazo del reductor. */}
          <code className="equipo__id">{equipo.id}</code>
        </div>
        <p className="equipo__dedicado">
          {equipo.miembros.length === 0 ? (
            <span className="etiqueta etiqueta--vacio">Sin miembros</span>
          ) : (
            cuenta(equipo.miembros.length, 'persona', 'personas')
          )}
          {' · '}
          {/* Regla 2 y regla 3: la capacidad NUNCA sale sola. `null` cuando nadie tiene
              dato es «nadie lo ha escrito», no «no puede con nada», y el número va con
              cuántos miembros lo respaldan. Es derivada: no se persiste (prohibido). */}
          <span className="equipo__capacidad tabular">
            {equipo.capacidad.total === null
              ? 'sin capacidad declarada'
              : cuenta(equipo.capacidad.total, 'pt', 'pts')}
            {' · '}
            {equipo.capacidad.conDato} de {cuenta(equipo.capacidad.miembros, 'miembro', 'miembros')}
          </span>
          <span className="equipo__tareas tabular">
            {cuentaTareas(equipo.tareas)} · {equipo.abiertas}{' '}
            {equipo.abiertas === 1 ? 'abierta' : 'abiertas'}
          </span>
        </p>
      </div>

      <ul className="equipo__lista">
        {equipo.miembros.map((miembro) => {
          const editandoRol = borrador?.campo === `rol:${miembro.personaId}`;
          const editandoCap = borrador?.campo === `cap:${miembro.personaId}`;

          /** Cambia un solo campo del miembro y reenvía la lista COMPLETA del equipo. */
          const cambiar = (parche: Partial<MiembroEditable>, contexto: string) =>
            guardar(
              // Se conserva el miembro entero y solo se toca lo que cambia (regla 14).
              miembros.map((m) => (m.persona_id === miembro.personaId ? { ...m, ...parche } : m)),
              contexto,
            );

          return (
            <li className="miembro" key={miembro.personaId}>
              <span className="miembro__inicial" aria-hidden="true">
                {miembro.iniciales}
              </span>
              <span className="miembro__datos">
                <span className="miembro__nombre">
                  {miembro.nombre}
                  {!miembro.activa && (
                    <span className="etiqueta etiqueta--vacio"> Dada de baja</span>
                  )}
                </span>
                <span className="miembro__rol">
                  {soloLectura ? (
                    miembro.responsabilidades.join(', ') || 'sin responsabilidades'
                  ) : (
                    <input
                      className="miembro__campo"
                      type="text"
                      value={editandoRol ? borrador.texto : miembro.responsabilidades.join(', ')}
                      placeholder="sin responsabilidades"
                      aria-label={`Responsabilidades de ${miembro.nombre} en ${equipo.nombre}`}
                      onChange={(evento) =>
                        setBorrador({ campo: `rol:${miembro.personaId}`, texto: evento.target.value })
                      }
                      onKeyDown={(evento) => {
                        if (evento.key === 'Enter') evento.currentTarget.blur();
                        if (evento.key === 'Escape') {
                          setBorrador(null);
                          evento.currentTarget.blur();
                        }
                      }}
                      onBlur={(evento) => {
                        // Texto libre a propósito (S3): «backend», «vistas», «QA». Se
                        // parte por comas porque el modelo guarda una lista, y una lista
                        // de un solo elemento con comas dentro no se puede volver a leer.
                        const partes = evento.currentTarget.value
                          .split(',')
                          .map((parte) => parte.trim())
                          .filter(Boolean);
                        setBorrador(null);
                        if (partes.join(', ') === miembro.responsabilidades.join(', ')) return;
                        cambiar(
                          { responsabilidades: partes },
                          `Cambiar las responsabilidades de ${miembro.nombre} en ${equipo.nombre}`,
                        );
                      }}
                    />
                  )}
                  {miembro.otrosEquipos.length > 0 && (
                    <span
                      className="miembro__tambien"
                      title={`También en ${miembro.otrosEquipos
                        .map((otro) => `${otro.clave} · ${otro.equipo}`)
                        .join(', ')}`}
                    >
                      {' · también en '}
                      {miembro.otrosEquipos.length === 1
                        ? `${miembro.otrosEquipos[0]?.clave} · ${miembro.otrosEquipos[0]?.equipo}`
                        : `${miembro.otrosEquipos.length} equipos`}
                    </span>
                  )}
                </span>
              </span>

              {soloLectura ? (
                <span className="miembro__carga tabular">
                  {miembro.capacidad === null ? '—' : cuenta(miembro.capacidad, 'pt', 'pts')}
                </span>
              ) : (
                <input
                  className="miembro__cap tabular"
                  type="number"
                  min={0}
                  step={1}
                  inputMode="numeric"
                  value={
                    editandoCap
                      ? borrador.texto
                      : miembro.capacidad === null
                        ? ''
                        : String(miembro.capacidad)
                  }
                  placeholder="—"
                  title="Capacidad declarada. Vacío = sin dato, que no es lo mismo que cero."
                  aria-label={`Capacidad de ${miembro.nombre} en ${equipo.nombre}`}
                  onChange={(evento) =>
                    setBorrador({ campo: `cap:${miembro.personaId}`, texto: evento.target.value })
                  }
                  onKeyDown={(evento) => {
                    if (evento.key === 'Enter') evento.currentTarget.blur();
                    if (evento.key === 'Escape') {
                      setBorrador(null);
                      evento.currentTarget.blur();
                    }
                  }}
                  onBlur={(evento) => {
                    const texto = evento.currentTarget.value.trim();
                    setBorrador(null);
                    // Vacío es `null`, no `0`: «nadie ha escrito el dato» y «no puede con
                    // nada» son cosas distintas, y es la misma regla 2 del porcentaje.
                    const valor = texto === '' ? null : Number(texto);
                    if (valor !== null && (!Number.isFinite(valor) || valor < 0)) {
                      // No se traga en silencio: el campo vuelve a lo guardado y se dice
                      // por qué. El esquema exige un número no negativo.
                      avisar(
                        `Capacidad de ${miembro.nombre}: "${texto}" no es un número de cero para arriba. No se guardó nada.`,
                      );
                      return;
                    }
                    if (valor === miembro.capacidad) return;
                    cambiar(
                      { capacidad: valor },
                      `Cambiar la capacidad de ${miembro.nombre} en ${equipo.nombre}`,
                    );
                  }}
                />
              )}

              {!soloLectura && otrosEquipos.length > 0 && (
                <label className="miembro__mover">
                  <span className="solo-lectores">
                    Mover a {miembro.nombre} a otro equipo
                  </span>
                  <select
                    value=""
                    onChange={(evento) => {
                      const hacia = evento.target.value;
                      if (hacia === '') return;
                      // `moverMiembro` y no dos `editarEquipo`: se lleva la ficha entera
                      // —responsabilidades, capacidad y lo que el usuario haya escrito
                      // dentro— y es UN solo paso de deshacer.
                      void mutar(
                        {
                          comando: 'moverMiembro',
                          personaId: miembro.personaId,
                          desde: equipo.id,
                          hacia,
                        },
                        `Mover a ${miembro.nombre} fuera de ${equipo.nombre}`,
                      );
                    }}
                  >
                    <option value="">Mover a…</option>
                    {otrosEquipos.map((destino) => (
                      <optgroup key={destino.clave} label={destino.clave}>
                        {destino.equipos.map((otro) => (
                          <option key={otro.id} value={otro.id}>
                            {otro.nombre}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </label>
              )}

              {!soloLectura && (
                <button
                  type="button"
                  className="miembro__quitar"
                  title={`Quitar a ${miembro.nombre} de ${equipo.nombre}`}
                  aria-label={`Quitar a ${miembro.nombre} de ${equipo.nombre}`}
                  onClick={() =>
                    guardar(
                      miembros.filter((m) => m.persona_id !== miembro.personaId),
                      `Quitar a ${miembro.nombre} de ${equipo.nombre}`,
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

      {inactivos.length > 0 && (
        <p className="equipo__nota equipo__nota--alerta">
          <Advertencia />{' '}
          {inactivos.map((miembro) => miembro.nombre).join(', ')}{' '}
          {inactivos.length === 1 ? 'está dada de baja' : 'están dadas de baja'}: mientras
          siga en el equipo, ningún cambio de esta tarjeta se va a poder guardar. Quítala de
          aquí o reactívala en Personas.
        </p>
      )}

      {!soloLectura &&
        (agregando ? (
          <div className="equipo__agregar equipo__agregar--abierto">
            {candidatos.length === 0 ? (
              <span className="equipo__nota">
                Todas las personas activas ya están en este equipo. Da de alta a alguien nuevo en
                la sección Personas.
              </span>
            ) : (
              <label className="campo campo--crece">
                <span className="campo__etq">Del catálogo de personas</span>
                <select
                  autoFocus
                  defaultValue=""
                  onChange={(evento) => {
                    const id = evento.target.value;
                    if (id === '') return;
                    setAgregando(false);
                    const persona = candidatos.find((c) => c.id === id);
                    guardar(
                      [...miembros, { persona_id: id, responsabilidades: [], capacidad: null }],
                      `Meter a ${persona?.nombre ?? id} en ${equipo.nombre}`,
                    );
                  }}
                >
                  <option value="" disabled>
                    Elige a alguien…
                  </option>
                  {candidatos.map((persona) => (
                    <option key={persona.id} value={persona.id}>
                      {persona.nombre}
                    </option>
                  ))}
                </select>
              </label>
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

      {/* No es un error del documento: el responsable de una tarea vieja puede haberse
          cambiado de equipo, y eso es un hecho correcto. La señal INFORMA, no rechaza —no
          hay ninguna invariante que obligue a que el responsable esté en el equipo—, y
          esta pantalla existe para que se revise. */}
      {equipo.responsablesFuera.length > 0 && (
        <div className="equipo__aparte">
          <p className="equipo__aparte-titulo">
            {cuenta(equipo.responsablesFuera.length, 'responsable fuera del equipo', 'responsables fuera del equipo')}
          </p>
          <p className="equipo__aparte-fila">
            <span className="tabular">{equipo.responsablesFuera.join(', ')}</span>
          </p>
          <p className="equipo__nota">
            Son tareas de este equipo cuyo responsable no está en él. No es un error: se
            avisa para que se revise, no para que se corrija a la fuerza.
          </p>
        </div>
      )}

      {!soloLectura && (
        <div className="equipo__pie">
          <button
            type="button"
            className="mini mini--peligro"
            onClick={() => setBorrando(!borrando)}
          >
            Eliminar…
          </button>
        </div>
      )}

      {borrando && (
        <div className="peligro">
          <p className="peligro__titulo">
            <Advertencia /> Eliminar el equipo {equipo.nombre}
          </p>
          {/* Se ANTICIPA lo que el reductor va a contestar, no se duplica su decisión:
              quien rechaza es él y su mensaje —con el conteo y los ids— se muestra tal
              cual en la franja de aviso. Aquí solo se dice de antemano por qué. */}
          <p className="peligro__texto">
            {equipo.tareas > 0 ? (
              <>
                <b>{cuentaTareas(equipo.tareas)} lo tienen asignado.</b> La app va a rechazar
                el borrado para no dejarlas apuntando a un id que ya no existe. Reasígnalas
                antes —a otro equipo o a ninguno— desde el detalle de cada tarea.
              </>
            ) : equipo.miembros.length > 0 ? (
              <>
                Ninguna tarea lo tiene asignado. Se lleva a{' '}
                {cuenta(equipo.miembros.length, 'miembro', 'miembros')}: la pertenencia es
                estado del presente y queda anotada en el historial, así que <b>⌘Z lo
                devuelve entero</b>.
              </>
            ) : (
              <>
                Está vacío y ninguna tarea lo tiene asignado: no se pierde nada, y <b>⌘Z lo
                devuelve</b>.
              </>
            )}
          </p>
          <div className="peligro__fila">
            <button
              type="button"
              className="boton-peligro"
              onClick={() => {
                void mutar(
                  { comando: 'eliminarEquipo', equipoId: equipo.id },
                  `Eliminar el equipo ${equipo.nombre}`,
                ).then((ok) => {
                  if (ok) setBorrando(false);
                });
              }}
            >
              Eliminar {equipo.nombre}
            </button>
            <button type="button" className="boton-texto" onClick={() => setBorrando(false)}>
              Cancelar
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
