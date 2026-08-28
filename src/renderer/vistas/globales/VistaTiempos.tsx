/**
 * Tiempos — cuánto se tarda en cerrar una tarea.
 *
 * El reloj es el que pidió el usuario: **desde que arranca el sprint hasta que él marca la
 * tarea como completada.** Ni desde que se creó ni desde que pasó a «en curso».
 *
 * ## Lo que esta pantalla se niega a hacer
 *
 * - **No promete nada.** No hay «a este ritmo terminas el 14 de octubre». Un promedio
 *   describe lo que pasó; convertirlo en pronóstico es exactamente el índice de salud 0-100
 *   que el plan puso fuera de alcance.
 * - **No enseña un promedio de menos de cinco tareas.** Ahí solo va el conteo crudo.
 *   «14 días» calculado sobre una tarea se lee igual de firme que uno calculado sobre
 *   cuarenta, y esa es la forma más fácil de mentir con un número que sí es real.
 * - **No esconde lo que no pudo medir.** Cada fila dice cuántas tareas cerradas quedaron
 *   fuera del cálculo. Con la forma de trabajar del usuario —cerrar cosas que nunca
 *   entraron a un sprint— ese número va a ser grande, y ocultarlo haría que el promedio
 *   pareciera hablar de todo su trabajo cuando habla de una parte.
 * - **Ni un semáforo.** No existe un «bien» ni un «mal» de días por tarea: depende del
 *   tipo de trabajo, y pintarlo de rojo sería inventar un umbral.
 *
 * La mediana va al lado del promedio a propósito: una tarea que se quedó abierta medio año
 * dispara el promedio y deja la mediana intacta, y la diferencia entre los dos números es
 * la señal de que hay una cola larga.
 */

import { useMemo, useState } from 'react';

import {
  MINIMO_TAREAS_PARA_PROMEDIO,
  diasPorPunto,
  promediar,
  resoluciones,
  tiempoPorEquipo,
  tiempoPorPersona,
  tiempoPorProyecto,
  type FilaTiempo,
  type Promedio,
  type Resolucion,
} from '../../../compartido/dominio/duracion';
import type { Documento } from '../../../compartido/modelo/tipos';
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

export function VistaTiempos({ documento }: { documento: Documento }) {
  const [corte, setCorte] = useState<Corte>('persona');
  const { verGlobal } = useAccionesInterfaz();

  const medidas = useMemo(() => resoluciones(documento), [documento]);
  const total = useMemo(() => promediar(medidas), [medidas]);
  const porPunto = useMemo(() => diasPorPunto(medidas), [medidas]);

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
                El reloj corre desde que arranca un sprint hasta que marcas la tarea como
                hecha. Hace falta al menos una tarea cerrada dentro de un sprint.
              </>
            }
            accion={{ texto: 'Ver el sprint', alPulsar: () => verGlobal('sprint') }}
          />
        </PanelGlobal>
      </Lienzo>
    );
  }

  return (
    <Lienzo>
      <PanelGlobal etiqueta="Tiempos">
        <Resumen total={total} porPunto={porPunto} medidas={medidas} />

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
      </PanelGlobal>
    </Lienzo>
  );
}

/** La cifra de arriba: el conjunto entero, antes de cortarlo por nadie. */
function Resumen({
  total,
  porPunto,
  medidas,
}: {
  total: Promedio;
  porPunto: number | null;
  medidas: readonly Resolucion[];
}) {
  const arrastradas = medidas.filter((m) => m.sprintsAtravesados > 1).length;

  return (
    <div className="tiempos-resumen">
      <div className="tiempos-cifra">
        <span className="tiempos-cifra__n tabular">
          {total.promedio === null ? '—' : dias(total.promedio)}
        </span>
        <span className="tiempos-cifra__etq">Promedio</span>
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
      {porPunto !== null && (
        <div className="tiempos-cifra">
          <span className="tiempos-cifra__n tabular">{porPunto.toFixed(1)}</span>
          <span className="tiempos-cifra__etq">días por punto de esfuerzo</span>
        </div>
      )}

      {/* La letra chica va aquí y no en un `title`: es lo que decide si el número de
          arriba habla de todo el trabajo o de una rebanada de él. */}
      <p className="tiempos-resumen__nota">
        {total.promedio === null &&
          `Con menos de ${MINIMO_TAREAS_PARA_PROMEDIO} tareas medidas no se promedia: el número diría más de la casualidad que del trabajo. `}
        {total.sinMedir > 0 &&
          `${cuenta(total.sinMedir, 'tarea cerrada', 'tareas cerradas')} sin medir: se cerraron fuera de un sprint. `}
        {arrastradas > 0 &&
          `${cuenta(arrastradas, 'pasó', 'pasaron')} por más de un sprint; se miden contra aquel en que cerraron.`}
      </p>
    </div>
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
