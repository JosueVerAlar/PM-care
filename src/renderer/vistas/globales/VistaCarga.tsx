/**
 * E11a — Carga por persona.
 *
 * La pregunta que la motivó fue literal: «¿le da tiempo de hacer todo eso en el sprint, o
 * hay riesgo de que deje un proyecto de lado?».
 *
 * **PM-care no puede contestar la primera mitad, y eso es una decisión de diseño de esta
 * pantalla, no una nota al pie.** Sin estimaciones de esfuerzo, «va al 120 % de su
 * capacidad» es un número inventado con cara de dato — y los números con cara de dato son
 * justo los que se acaban usando para decidir. Así que:
 *
 * - **La barra no lleva pista de fondo.** Una pista es un techo, y un techo promete una
 *   capacidad que la app no conoce. Sin pista, la barra solo puede leerse como lo que es:
 *   un largo comparado con el de al lado.
 * - **El largo compara entre personas**, contra quien más carga tiene, nunca contra un
 *   máximo inventado.
 * - **Los tramos son el reparto por proyecto** y la dispersión se lee como número de
 *   trozos — que es la segunda mitad de la pregunta, y esa sí se puede contestar contando.
 * - **Cero semáforos.** Los únicos colores son los que ya significan algo en la app: el
 *   rojo del bloqueo y el de lo vencido. No hay verde de «va bien» ni ámbar de «ojo».
 *
 * Lo que sí se muestra: carga total, reparto entre proyectos, bloqueadas, vencidas y
 * cuántas cerró en los sprints anteriores. Con esos cuatro datos la conclusión la pone el
 * usuario, que es quien sí sabe cuánto pesa cada tarea.
 */

import { useMemo, useState } from 'react';

import {
  cargaMaxima,
  cargaPorPersona,
  cargaSinAsignar,
  ordenarCargas,
  type CargaPersona,
  type OrdenCarga,
  type RepartoAbierto,
} from '../../../compartido/dominio/carga';
import { sprintsActivos } from '../../../compartido/dominio/derivar';
import type { Documento, Fecha } from '../../../compartido/modelo/tipos';
import { CuadroBloqueo } from '../../componentes/iconos';
import { useAccionesInterfaz } from '../../estado/interfaz';
import { cuenta, tareas as cuentaTareas } from '../../util/presentacion';
import { Lienzo, PanelGlobal, VacioGlobal } from './piezas';


export function VistaCarga({ documento, hoy }: { documento: Documento; hoy: Fecha }) {
  const [orden, setOrden] = useState<OrdenCarga>('total');
  const { verAdmin } = useAccionesInterfaz();

  const sprint = useMemo(() => sprintsActivos(documento)[0], [documento]);
  const cargas = useMemo(() => cargaPorPersona(documento, hoy), [documento, hoy]);
  const sinAsignar = useMemo(() => cargaSinAsignar(documento, hoy), [documento, hoy]);
  const ordenadas = useMemo(() => ordenarCargas(cargas, orden), [cargas, orden]);

  // El referente de la barra incluye el bloque «sin asignar»: si un montón de tareas sin
  // dueño fuera el pico y no contara, todas las barras se estirarían y la vista diría que
  // el equipo va más cargado de lo que va.
  const maximo = useMemo(
    () => cargaMaxima([...cargas, { abiertas: sinAsignar.abiertas }]),
    [cargas, sinAsignar],
  );

  if (cargas.length === 0) {
    return (
      <PanelGlobal etiqueta="Carga por persona">
        <header className="cab">
          <h2 className="cab__titulo">Carga por persona</h2>
        </header>
        <VacioGlobal
          titulo="No hay nadie en el catálogo de personas"
          queHacer={
            <>
              Las personas son un catálogo global y los equipos se arman por proyecto tomando
              de ahí. Sin personas no hay a quién asignarle nada: dalas de alta en{' '}
              <b>Administración · Personas</b> y después asigna responsables desde el sprint.
            </>
          }
          accion={{ texto: 'Dar de alta personas', alPulsar: () => verAdmin('personas') }}
        />
      </PanelGlobal>
    );
  }

  const sprintNombre = sprint?.nombre ?? 'el sprint activo';

  return (
    <PanelGlobal etiqueta="Carga por persona">
      <header className="cab">
        <h2 className="cab__titulo">
          Carga por persona · {cuenta(cargas.length, 'persona', 'personas')}
        </h2>
        <span className="crece" />
        <span className="cab__nota">Ordenar por</span>
        <div className="alternador" role="group" aria-label="Criterio de orden">
          <button type="button" aria-pressed={orden === 'total'} onClick={() => setOrden('total')}>
            Carga total
          </button>
          <button
            type="button"
            aria-pressed={orden === 'dispersion'}
            onClick={() => setOrden('dispersion')}
          >
            Dispersión
          </button>
        </div>
      </header>

      <Lienzo>
        <div className="aviso-honestidad">
          <span className="aviso-honestidad__marca" aria-hidden="true" />
          <p className="aviso-honestidad__texto">
            <b>
              PM-care no estima esfuerzo, así que esta vista no puede decirte si a alguien le da
              tiempo.
            </b>{' '}
            Lo que sí sabe: cuántas tareas abiertas trae, entre cuántos proyectos están
            repartidas, cuántas están detenidas, cuántas vencieron y cuántas cerró en los
            sprints pasados. Por eso no hay barra de capacidad ni semáforo: la conclusión la
            pones tú, con estos cinco datos.
          </p>
        </div>

        <div className="carga-cab">
          <span>Persona</span>
          <span>
            Reparto por proyecto
            <span className="carga-cab__nota">
              {' '}
              — el largo compara entre personas{maximo !== null && ` (el más largo son ${maximo})`},
              no contra una capacidad
            </span>
          </span>
        </div>

        {ordenadas.map((carga) => (
          <FilaPersona
            key={carga.personaId}
            carga={carga}
            maximo={maximo}
            sprintNombre={sprintNombre}
          />
        ))}

        {sinAsignar.abiertas.total > 0 && (
          <div className="persona persona--hueco">
            <div>
              <p className="persona__cab">
                <span className="persona__nombre">Sin asignar</span>
                <span className="chip chip--neutro">no es una persona</span>
              </p>
              <p className="persona__total">
                <span className="persona__cifra tabular">{sinAsignar.abiertas.total}</span>
                <span className="persona__unidad">tareas abiertas sin responsable</span>
                <span className="persona__disp">
                  · en {cuenta(sinAsignar.abiertas.proyectosDistintos, 'proyecto', 'proyectos')}
                </span>
              </p>
              <p className="persona__marcas">
                <span className="marca">
                  {sinAsignar.enSprint.total} de ellas comprometidas en {sprintNombre}
                </span>
              </p>
            </div>
            <Reparto reparto={sinAsignar.abiertas} maximo={maximo} />
          </div>
        )}
      </Lienzo>


    </PanelGlobal>
  );
}

function FilaPersona({
  carga,
  maximo,
  sprintNombre,
}: {
  carga: CargaPersona;
  maximo: number | null;
  sprintNombre: string;
}) {
  const cerradas = carga.historial.porSprint.reduce((suma, s) => suma + s.cerradas, 0);
  const sprints = carga.historial.porSprint.length;

  return (
    <div className="persona">
      <div>
        <p className="persona__cab">
          <span className="persona__nombre" title={carga.nombre}>
            {carga.nombre}
          </span>
          {!carga.activa && (
            <span
              className="chip chip--neutro"
              title="Fuera del equipo actual. Aparece porque todavía tiene tareas abiertas."
            >
              Inactiva
            </span>
          )}
          {carga.equipos.length > 1 && (
            <span
              className="persona__equipos"
              title={carga.equipos.map((e) => `${e.clave}${e.responsabilidades.length === 0 ? '' : ` — ${e.responsabilidades.join(', ')}`}`).join(' · ')}
            >
              en {carga.equipos.length} equipos
            </span>
          )}
        </p>

        <p className="persona__total">
          <span className="persona__cifra tabular">{carga.abiertas.total}</span>
          <span className="persona__unidad">tareas abiertas</span>
          {/* Con la cola vacía, «en 0 proyectos» es ruido: no hay dispersión que leer. */}
          {carga.abiertas.total > 0 && (
            <span className="persona__disp">
              · en {cuenta(carga.abiertas.proyectosDistintos, 'proyecto', 'proyectos')}
            </span>
          )}
        </p>

        <p className="persona__marcas">
          <span className="marca">
            {carga.enSprint.abiertas} de ellas comprometidas en {sprintNombre}
          </span>
          {carga.enSprint.bloqueadas > 0 ? (
            <span className="marca marca--bloq">
              <CuadroBloqueo />
              {cuenta(carga.enSprint.bloqueadas, 'tarea bloqueada', 'tareas bloqueadas')}
            </span>
          ) : (
            <span className="marca marca--cero">sin bloqueadas</span>
          )}
          <span className={`marca${carga.enSprint.vencidas === 0 ? ' marca--cero' : ''}`}>
            {cuenta(carga.enSprint.vencidas, 'vencida', 'vencidas')} en el sprint
          </span>
          <span className={`marca${cerradas === 0 ? ' marca--cero' : ''}`}>
            {sprints === 0
              ? 'sin sprints cerrados con los que comparar'
              : `${cuenta(cerradas, 'cerrada', 'cerradas')} en ${cuenta(sprints, 'sprint cerrado', 'sprints cerrados')}`}
            {carga.historial.medianaCerradas !== null &&
              ` · mediana ${carga.historial.medianaCerradas} por sprint`}
          </span>
        </p>
      </div>

      <Reparto reparto={carga.abiertas} maximo={maximo} />
    </div>
  );
}

/**
 * La barra sin pista.
 *
 * El `width` es la proporción contra la carga más alta de la lista; los tramos se reparten
 * ese ancho con `flex` proporcional al conteo de cada proyecto. Con `maximo === null` no
 * hay nada abierto en todo el equipo y no se dibuja barra: una barra de ancho cero se lee
 * como un fallo de pintado, no como un cero.
 */
function Reparto({ reparto, maximo }: { reparto: RepartoAbierto; maximo: number | null }) {
  if (maximo === null || reparto.total === 0) {
    return (
      <div className="reparto">
        <p className="reparto__vacio">Sin tareas abiertas ahora mismo.</p>
      </div>
    );
  }

  const ancho = (reparto.total / maximo) * 100;

  return (
    <div className="reparto">
      <div
        className="reparto__barra"
        style={{ width: `${ancho.toFixed(1)}%` }}
        title={`${cuentaTareas(reparto.total)} abiertas, repartidas en ${cuenta(reparto.proyectosDistintos, 'proyecto', 'proyectos')}`}
      >
        {reparto.porProyecto.map((proyecto) => (
          <span
            key={proyecto.clave}
            className="reparto__tramo"
            style={{ flex: proyecto.abiertas }}
            aria-hidden="true"
          />
        ))}
      </div>
      <p className="reparto__etiquetas">
        {reparto.porProyecto.map((proyecto) => (
          <span className="reparto__etq" key={proyecto.clave} title={proyecto.nombre}>
            {proyecto.clave} <span className="reparto__n tabular">{proyecto.abiertas}</span>
          </span>
        ))}
      </p>
    </div>
  );
}
