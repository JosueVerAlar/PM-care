/**
 * Tiempos — cuánto se trabaja de verdad en una tarea.
 *
 * El reloj es el de la regla 21: **la SUMA de los tramos de trabajo**, nunca `fin −
 * inicio` y nunca anclado a un sprint. Hasta M5 esta pantalla medía calendario desde el
 * arranque del sprint y lo llamaba tiempo de trabajo; de ese cambio salen las tres cosas
 * que esta versión enseña y la anterior no podía: la suma, el desglose desarrollo/pruebas
 * y lo trabajado contra lo de calendario.
 *
 * ## Lo que esta pantalla se niega a hacer
 *
 * - **No promete nada.** No hay «a este ritmo terminas el 14 de octubre». Un promedio
 *   describe lo que pasó; convertirlo en pronóstico es exactamente el índice de salud
 *   0-100 que el plan puso fuera de alcance.
 * - **No enseña un promedio de menos de cinco tareas.** Ahí solo va el conteo crudo.
 *   «14 días» calculado sobre una tarea se lee igual de firme que uno calculado sobre
 *   cuarenta, y esa es la forma más fácil de mentir con un número que sí es real.
 * - **No esconde lo que no pudo medir.** Cada fila dice cuántas tareas aceptadas quedaron
 *   fuera del cálculo. Con el archivo del usuario ese número es casi todo al principio
 *   —los tramos empiezan a existir con esta etapa y el pasado no se inventa—, y ocultarlo
 *   haría que el promedio pareciera hablar de todo su trabajo cuando habla de una parte.
 * - **No suma el tramo abierto.** Una tarea olvidada en `iniciado` tres meses diría «tres
 *   meses de trabajo», que es la misma mentira de calendario que este reloj existe para
 *   evitar. Los relojes corriendo van en su propia lista, dicen desde hace cuánto y no
 *   entran en ningún promedio.
 * - **Ni un semáforo.** No existe un «bien» ni un «mal» de días por tarea: depende del
 *   tipo de trabajo, y pintarlo de rojo sería inventar un umbral.
 *
 * La mediana va al lado del promedio a propósito: una tarea que se retomó diez veces
 * dispara el promedio y deja la mediana intacta, y la diferencia entre los dos números es
 * la señal de que hay una cola larga.
 */

import { useMemo, useState } from 'react';

import {
  MINIMO_TAREAS_PARA_PROMEDIO,
  UMBRAL_TRAMO_OLVIDADO,
  cerradasSinMedirEnTodo,
  desglosar,
  diasPorPunto,
  promediar,
  relojesCorriendo,
  resoluciones,
  tiempoPorEquipo,
  tiempoPorPersona,
  tiempoPorProyecto,
  trabajadoContraCalendario,
  type Corriendo as RelojDeTarea,
  type Desglose,
  type DiasPorPunto,
  type FilaTiempo,
  type Promedio,
  type Resolucion,
  type TrabajadoContraCalendario,
} from '../../../compartido/dominio/duracion';
import type { Documento, Fecha } from '../../../compartido/modelo/tipos';
import { useAccionesInterfaz } from '../../estado/interfaz';
import { cuenta } from '../../util/presentacion';
import { Lienzo, PanelGlobal, VacioGlobal } from './piezas';

type Corte = 'persona' | 'equipo' | 'proyecto';

const CORTES: readonly { id: Corte; texto: string }[] = [
  { id: 'persona', texto: 'Por persona' },
  { id: 'equipo', texto: 'Por equipo' },
  { id: 'proyecto', texto: 'Por proyecto' },
];

/** `4.7` → «4.7 d». Un decimal: media jornada importa, media hora no. */
function dias(n: number): string {
  return `${n.toFixed(1)} d`;
}

export function VistaTiempos({ documento, hoy }: { documento: Documento; hoy: Fecha }) {
  const [corte, setCorte] = useState<Corte>('persona');
  const { verGlobal } = useAccionesInterfaz();

  const medidas = useMemo(() => resoluciones(documento), [documento]);
  // El conteo de lo aceptado que NO se pudo medir no es opcional: sin él, «promedio sobre
  // 5 tareas» parece hablar de todo el trabajo cuando puede estar hablando de un tercio.
  const sinMedir = useMemo(() => cerradasSinMedirEnTodo(documento), [documento]);
  const total = useMemo(() => promediar(medidas, sinMedir), [medidas, sinMedir]);
  const porPunto = useMemo(() => diasPorPunto(medidas), [medidas]);
  const reparto = useMemo(() => desglosar(medidas), [medidas]);
  const transcurso = useMemo(() => trabajadoContraCalendario(medidas), [medidas]);
  const corriendo = useMemo(() => relojesCorriendo(documento, hoy), [documento, hoy]);

  const filas = useMemo<FilaTiempo[]>(() => {
    if (corte === 'persona') return tiempoPorPersona(documento);
    if (corte === 'equipo') return tiempoPorEquipo(documento);
    return tiempoPorProyecto(documento);
  }, [corte, documento]);

  if (medidas.length === 0) {
    return (
      <Lienzo>
        <PanelGlobal etiqueta="Tiempos">
          <VacioGlobal
            titulo="Todavía no hay ningún tiempo que medir"
            queHacer={
              <>
                El reloj corre mientras la tarea está iniciada o en pruebas, y se detiene al
                terminarla: la duración es la suma de esos tramos.{' '}
                {sinMedir > 0 ? (
                  // Decir «no hay nada» cuando SÍ hay tareas aceptadas es la diferencia
                  // entre «todavía no empiezas» y «lo que cerraste es anterior al reloj»,
                  // que es un diagnóstico distinto y accionable.
                  <>
                    Hay {cuenta(sinMedir, 'tarea aceptada', 'tareas aceptadas')} sin un solo
                    tramo: se cerraron antes de que el reloj existiera y ese pasado no se
                    inventa.
                  </>
                ) : (
                  <>Hace falta al menos una tarea aceptada que haya pasado por desarrollo.</>
                )}
              </>
            }
            accion={{ texto: 'Ver el sprint', alPulsar: () => verGlobal('sprint') }}
          />
          {corriendo.length > 0 && <RelojesCorriendo relojes={corriendo} />}
        </PanelGlobal>
      </Lienzo>
    );
  }

  return (
    <Lienzo>
      <PanelGlobal etiqueta="Tiempos">
        <Resumen
          total={total}
          porPunto={porPunto}
          reparto={reparto}
          transcurso={transcurso}
          medidas={medidas}
        />

        <div className="alternador" role="group" aria-label="Cómo agrupar los tiempos">
          {CORTES.map((c) => (
            <button
              key={c.id}
              type="button"
              aria-pressed={corte === c.id}
              onClick={() => setCorte(c.id)}
            >
              {c.texto}
            </button>
          ))}
        </div>

        {filas.length === 0 ? (
          <p className="seccion__aclaracion">
            {corte === 'equipo'
              ? 'Ningún proyecto con equipo capturado tiene tareas medibles todavía.'
              : 'Nada medible con este corte todavía.'}
          </p>
        ) : (
          <Tabla filas={filas} corte={corte} />
        )}

        {corriendo.length > 0 && <RelojesCorriendo relojes={corriendo} />}
      </PanelGlobal>
    </Lienzo>
  );
}

/** La cifra de arriba: el conjunto entero, antes de cortarlo por nadie. */
function Resumen({
  total,
  porPunto,
  reparto,
  transcurso,
  medidas,
}: {
  total: Promedio;
  porPunto: DiasPorPunto;
  reparto: Desglose;
  transcurso: TrabajadoContraCalendario;
  medidas: readonly Resolucion[];
}) {
  const arrastradas = medidas.filter((m) => m.sprintsAtravesados > 1).length;
  const retomadas = medidas.filter((m) => m.tramos > 1).length;

  return (
    <div className="tiempos-resumen">
      <div className="tiempos-cifra">
        <span className="tiempos-cifra__n tabular">
          {total.promedio === null ? '—' : dias(total.promedio)}
        </span>
        <span className="tiempos-cifra__etq">Promedio trabajado</span>
      </div>
      <div className="tiempos-cifra">
        <span className="tiempos-cifra__n tabular">
          {total.mediana === null ? '—' : dias(total.mediana)}
        </span>
        <span className="tiempos-cifra__etq">Mediana</span>
      </div>
      <div className="tiempos-cifra">
        <span className="tiempos-cifra__n tabular">{total.cuentan}</span>
        <span className="tiempos-cifra__etq">{cuenta(total.cuentan, 'tarea medida', 'tareas medidas')}</span>
      </div>
      {/* Trabajado contra calendario: lo que sobra del segundo es espera, no trabajo. El
          cociente se calla por debajo del mínimo, igual que el promedio. */}
      {transcurso.proporcion !== null && (
        <div className="tiempos-cifra">
          <span className="tiempos-cifra__n tabular">{Math.round(transcurso.proporcion * 100)}%</span>
          <span className="tiempos-cifra__etq">
            del calendario fue trabajo · sobre {cuenta(transcurso.sobre, 'tarea', 'tareas')}
          </span>
        </div>
      )}
      {porPunto.dias !== null && (
        <div className="tiempos-cifra">
          <span className="tiempos-cifra__n tabular">{porPunto.dias.toFixed(1)}</span>
          <span className="tiempos-cifra__etq">
            días por punto · sobre {cuenta(porPunto.sobre, 'tarea estimada', 'tareas estimadas')}
          </span>
        </div>
      )}

      {/* La letra chica va aquí y no en un `title`: es lo que decide si el número de
          arriba habla de todo el trabajo o de una rebanada de él. */}
      <p className="tiempos-resumen__nota">
        {total.promedio === null &&
          `Con menos de ${MINIMO_TAREAS_PARA_PROMEDIO} tareas medidas no se promedia: el número diría más de la casualidad que del trabajo. `}
        {total.sinMedir > 0 &&
          `${cuenta(total.sinMedir, 'tarea aceptada', 'tareas aceptadas')} sin medir: se cerraron sin ningún tramo de trabajo. `}
        {/* El desglose sale del `estado` que cada tramo guarda. Cada mitad va con cuántas
            tareas la componen: sin eso no se distingue «se prueba poco» de «casi nada
            pasó por pruebas». */}
        {reparto.desarrollo !== null &&
          `Desarrollo ${dias(reparto.desarrollo)} sobre ${cuenta(reparto.conDesarrollo, 'tarea', 'tareas')}. `}
        {reparto.pruebas === null
          ? 'Ninguna tarea medida pasó por pruebas. '
          : `Pruebas ${dias(reparto.pruebas)} sobre ${cuenta(reparto.conPruebas, 'tarea', 'tareas')}. `}
        {retomadas > 0 &&
          `${cuenta(retomadas, 'se retomó', 'se retomaron')} después de darse por terminada; su duración es la suma de sus tramos. `}
        {arrastradas > 0 &&
          `${cuenta(arrastradas, 'pasó', 'pasaron')} por más de un sprint; el arrastre se cuenta en sprints y no está dentro de los días.`}
      </p>
    </div>
  );
}

/**
 * Los relojes que siguen corriendo, lo más viejo primero.
 *
 * Ninguno entra en ningún promedio —no hay tramo cerrado que sumar— y por eso van en su
 * propia lista: si no se enseñaran, una tarea olvidada tres meses en `iniciado` sería
 * invisible en la única pantalla que habla de tiempo. Nada de rojos ni de alarmas: el
 * número de días es el hecho, y basta.
 */
function RelojesCorriendo({ relojes }: { relojes: readonly RelojDeTarea[] }) {
  const olvidados = relojes.filter((r) => r.olvidado).length;

  return (
    <table className="tabla-tiempos">
      <caption className="tiempos-resumen__nota">
        {cuenta(relojes.length, 'reloj corriendo', 'relojes corriendo')}. No entran en
        ningún promedio: un tramo abierto no ha terminado, y sumarlo haría crecer para
        siempre una tarea olvidada.
        {olvidados > 0 &&
          ` ${cuenta(olvidados, 'lleva', 'llevan')} más de ${UMBRAL_TRAMO_OLVIDADO} días sin moverse.`}
      </caption>
      <thead>
        <tr>
          <th scope="col">Tarea</th>
          <th scope="col" className="tabular">Corriendo desde hace</th>
        </tr>
      </thead>
      <tbody>
        {relojes.map((reloj) => (
          <tr key={reloj.tarea.id}>
            <th scope="row">
              {reloj.tarea.id}
              <span className="tabla-tiempos__aparte"> · {reloj.tarea.titulo}</span>
            </th>
            <td className="tabular">
              {cuenta(reloj.dias, 'día', 'días')}
              {reloj.olvidado && (
                <span className="tabla-tiempos__aparte" title={`Más de ${UMBRAL_TRAMO_OLVIDADO} días con el reloj abierto`}>
                  {' '}
                  · sin moverse
                </span>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Tabla({ filas, corte }: { filas: readonly FilaTiempo[]; corte: Corte }) {
  const encabezado = corte === 'persona' ? 'Persona' : corte === 'equipo' ? 'Equipo' : 'Proyecto';
  // El largo de la barra compara ENTRE filas, nunca contra un máximo inventado: la app no
  // sabe cuántos días «debería» tardar una tarea, y una pista de fondo prometería eso.
  const tope = filas.reduce((max, f) => Math.max(max, f.tiempo.mediana ?? f.tiempo.promedio ?? 0), 0);

  return (
    <table className="tabla-tiempos">
      <thead>
        <tr>
          <th scope="col">{encabezado}</th>
          <th scope="col" className="tabular">Promedio</th>
          <th scope="col" className="tabular">Mediana</th>
          <th scope="col" className="tabular">Medidas</th>
          <th scope="col">La más lenta</th>
        </tr>
      </thead>
      <tbody>
        {filas.map((fila) => {
          const { tiempo } = fila;
          const largo = tope === 0 ? 0 : ((tiempo.mediana ?? 0) / tope) * 100;
          return (
            <tr key={fila.id}>
              <th scope="row">
                {fila.nombre}
                {tiempo.sinMedir > 0 && (
                  <span className="tabla-tiempos__aparte">
                    {' '}
                    · {tiempo.sinMedir} sin medir
                  </span>
                )}
              </th>
              <td className="tabular">
                {tiempo.promedio === null ? (
                  <span
                    className="tabla-tiempos__pocas"
                    title={`Menos de ${MINIMO_TAREAS_PARA_PROMEDIO} tareas medidas: el promedio no significaría nada`}
                  >
                    —
                  </span>
                ) : (
                  dias(tiempo.promedio)
                )}
              </td>
              <td className="tabular">
                {tiempo.mediana === null ? '—' : dias(tiempo.mediana)}
                {tiempo.mediana !== null && (
                  <span className="barra-tiempo" aria-hidden="true">
                    <span className="barra-tiempo__relleno" style={{ width: `${largo}%` }} />
                  </span>
                )}
              </td>
              <td className="tabular">{tiempo.cuentan}</td>
              <td className="tabla-tiempos__lenta">
                {tiempo.masLenta === null ? (
                  '—'
                ) : (
                  <>
                    <span className="tabular">{dias(tiempo.masLenta.dias)}</span>{' '}
                    <span title={tiempo.masLenta.tarea.titulo}>
                      {tiempo.masLenta.tarea.id}
                    </span>
                  </>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
