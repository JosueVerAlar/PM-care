/**
 * E10a — Terminadas: el registro por sprint cerrado.
 *
 * ## Por qué no es una lista infinita
 *
 * «Todo lo que se ha terminado» solo crece y nadie la abre. La pregunta real llega a fin
 * de mes y tiene ventana: «¿qué cerramos en la quincena pasada?». Por eso la unidad es el
 * sprint cerrado, el más reciente arriba, y dentro de cada uno el corte es por proyecto,
 * que es como se reporta hacia arriba.
 *
 * ## «Copiar lista» es lo que convierte esto de cementerio en herramienta
 *
 * El texto sale del MISMO agrupado que la pantalla (`textoDeTerminadas` vive en el
 * dominio): si se escribiera aparte, el día que cambie el corte, lo copiado dejaría de
 * coincidir con lo que se ve, y eso se descubre al pegarlo en un correo.
 *
 * ## La serie de conteos es el «avance real»
 *
 * Va como cifra por sprint, no como curva. Sin estimaciones de esfuerzo, una gráfica de
 * velocidad prometería algo que la app no sabe (CLAUDE.md: métricas de adorno prohibidas).
 */

import { useMemo, useState } from 'react';

import {
  encabezadoDeSprint,
  registroDeTerminadas,
  terminadasFueraDeSprint,
  textoDeTerminadas,
  type ProyectoTerminadas,
} from '../../../compartido/dominio/terminadas';
import type { Documento } from '../../../compartido/modelo/tipos';
import { Glifo } from '../../componentes/iconos';
import { useAccionesInterfaz } from '../../estado/interfaz';
import { copiarTexto } from '../../util/portapapeles';
import { fechaCorta, instanteCorto, tareas as cuentaTareas } from '../../util/presentacion';
import {
  BotonIrATarea,
  GrupoPlegable,
  Lienzo,
  PanelGlobal,
  VacioGlobal,

} from './piezas';

export function VistaTerminadas({ documento }: { documento: Documento }) {
  const registro = useMemo(() => registroDeTerminadas(documento), [documento]);
  const fuera = useMemo(() => terminadasFueraDeSprint(documento), [documento]);
  const { verGlobal } = useAccionesInterfaz();

  // El más reciente nace abierto y el resto plegados: es el que se va a leer. Se guardan
  // las EXCEPCIONES a esa regla, no el estado de cada bloque.
  const [alternados, setAlternados] = useState<ReadonlySet<string>>(new Set());
  const [copiado, setCopiado] = useState<string | null>(null);

  const alternar = (id: string) =>
    setAlternados((previos) => {
      const siguiente = new Set(previos);
      if (!siguiente.delete(id)) siguiente.add(id);
      return siguiente;
    });

  const copiar = async (id: string, texto: string) => {
    const ok = await copiarTexto(texto);
    setCopiado(ok ? id : `error:${id}`);
    // Se limpia solo: un aviso permanente sobre una acción puntual acaba siendo ruido.
    window.setTimeout(() => setCopiado(null), 2400);
  };

  if (registro.length === 0 && fuera.total === 0) {
    return (
      <PanelGlobal etiqueta="Terminadas">
        <header className="cab">
          <h2 className="cab__titulo">Terminadas</h2>
        </header>
        <VacioGlobal
          titulo="Todavía no hay nada terminado que registrar"
          queHacer={
            <>
              El registro se llena al <b>cerrar un sprint</b>: lo que quede como completado
              entra aquí agrupado por proyecto. Mientras tanto, marca tareas como hechas en el
              árbol de su proyecto.
            </>
          }
          accion={{ texto: 'Ir al sprint', alPulsar: () => verGlobal('sprint') }}
        />
      </PanelGlobal>
    );
  }

  const totalRegistrado = registro.reduce((suma, s) => suma + s.total, 0);

  return (
    <PanelGlobal etiqueta="Terminadas">
      <header className="cab">
        <h2 className="cab__titulo">
          Terminadas · {cuentaTareas(totalRegistrado)} en{' '}
          {registro.length === 1 ? '1 sprint' : `${registro.length} sprints`}
        </h2>
        {/* La serie que llevaba la franja del orden: es el dato, no una explicación. */}
        {registro.length > 0 && (
          <span className="serie tabular">
            {registro
              .slice()
              .reverse()
              .map((s) => `${s.sprint.nombre.replace(/^Sprint\s+/i, '')}: ${s.total}`)
              .join(' · ')}
          </span>
        )}
        <span className="crece" />

        <span className="cab__nota" role="status">
          {copiado === null
            ? ''
            : copiado.startsWith('error:')
              ? 'No se pudo copiar'
              : 'Copiado al portapapeles'}
        </span>
      </header>


      <Lienzo>
        {registro.map((entrada, indice) => {
          const abierto = indice === 0 ? !alternados.has(entrada.sprint.id) : alternados.has(entrada.sprint.id);
          return (
            <GrupoPlegable
              key={entrada.sprint.id}
              clase="grupo grupo--sprint"
              abierto={abierto}
              alternar={() => alternar(entrada.sprint.id)}
              cabecera={
                <>
                  <span className="grupo__titulo">{entrada.sprint.nombre}</span>
                  <span className="grupo__nota tabular">
                    {fechaCorta(entrada.sprint.inicio)} – {fechaCorta(entrada.sprint.fin)}
                  </span>
                  <span className="crece" />
                  <span className="grupo__cifra tabular">
                    {entrada.total}
                    <small>{entrada.total === 1 ? 'terminada' : 'terminadas'}</small>
                  </span>
                  <span className="grupo__nota tabular">
                    de {entrada.total + entrada.noCompletadas} comprometidas
                  </span>
                </>
              }
            >
              <div className="grupo__barra">
                <button
                  type="button"
                  className="copiar"
                  disabled={entrada.total === 0}
                  title="Deja en el portapapeles el texto agrupado por proyecto, listo para pegar"
                  onClick={() =>
                    void copiar(
                      entrada.sprint.id,
                      textoDeTerminadas(encabezadoDeSprint(entrada), entrada.porProyecto, instanteCorto),
                    )
                  }
                >
                  Copiar lista
                </button>
                {entrada.noCompletadas > 0 && (
                  <span className="grupo__nota">
                    {entrada.noCompletadas === 1
                      ? '1 tarea comprometida no se completó'
                      : `${entrada.noCompletadas} tareas comprometidas no se completaron`}
                    ; su desenlace se decidió al cerrar el sprint.
                  </span>
                )}
              </div>
              {entrada.total === 0 ? (
                <p className="grupo__vacio">
                  Este sprint se cerró sin ninguna tarea completada. Aparece igual: esconderlo
                  dejaría un hueco sin explicación en la serie.
                </p>
              ) : (
                <ListaPorProyecto porProyecto={entrada.porProyecto} />
              )}
            </GrupoPlegable>
          );
        })}

        {/* La reconciliación: sin esto, «26 hechas» en Panorama y «11 terminadas» aquí
            parecen contradecirse, y el usuario deja de confiar en las dos cifras. */}
        {fuera.total > 0 && (
          <GrupoPlegable
            clase="grupo grupo--sprint grupo--aparte"
            abierto={alternados.has('fuera')}
            alternar={() => alternar('fuera')}
            cabecera={
              <>
                <span className="grupo__titulo grupo__titulo--tenue">
                  Terminadas sin pasar por un sprint
                </span>
                <span className="crece" />
                <span className="grupo__cifra grupo__cifra--tenue tabular">
                  {fuera.total}
                  <small>{fuera.total === 1 ? 'terminada' : 'terminadas'}</small>
                </span>
              </>
            }
          >
            <p className="grupo__vacio">
              Se capturaron ya hechas, o se cerraron sin sprint. Cuentan para el avance de su
              proyecto pero no para el registro por sprint, porque nunca hubo un sprint que las
              contuviera. Se dicen aquí para que las dos cifras no parezcan contradecirse.
            </p>
            <div className="grupo__barra">
              <button
                type="button"
                className="copiar"
                onClick={() =>
                  void copiar(
                    'fuera',
                    textoDeTerminadas(
                      `Terminadas sin pasar por un sprint · ${cuentaTareas(fuera.total)}`,
                      fuera.porProyecto,
                      instanteCorto,
                    ),
                  )
                }
              >
                Copiar lista
              </button>
            </div>
            <ListaPorProyecto porProyecto={fuera.porProyecto} />
          </GrupoPlegable>
        )}
      </Lienzo>


    </PanelGlobal>
  );
}

function ListaPorProyecto({ porProyecto }: { porProyecto: readonly ProyectoTerminadas[] }) {
  return (
    <>
      {/* `grupo`, no `proyecto`: agrupamiento de la vista, no un nodo del modelo. */}
      {porProyecto.map((grupo) => (
        <div className="subgrupo" key={grupo.clave}>
          <h3 className="subgrupo__titulo">
            {grupo.nombre}
            <span className="subgrupo__n tabular">{cuentaTareas(grupo.tareas.length)}</span>
          </h3>
          {grupo.tareas.map((terminada) => (
            <div className="fila-hecha" key={terminada.ubicacion.tarea.id}>
              <Glifo forma="hecha" etiqueta="Hecha" />
              <span className="fila-hecha__titulo" title={terminada.ubicacion.tarea.titulo}>
                {terminada.ubicacion.tarea.titulo}
              </span>
              {terminada.reabierta && (
                <span
                  className="chip chip--neutro"
                  title="El sprint la registró como completada y hoy la tarea ya no está hecha: alguien la reabrió después de cerrar. El registro no se reescribe."
                >
                  Reabierta
                </span>
              )}
              <span className="clave">{terminada.ubicacion.tarea.id}</span>
              <span className="fila-hecha__fecha tabular">
                {terminada.hechaEn === null ? 'sin fecha' : instanteCorto(terminada.hechaEn)}
              </span>
              <BotonIrATarea
                ubicacion={terminada.ubicacion}
                clase="fila-hecha__ir"
                texto="Ir"
              />
            </div>
          ))}
        </div>
      ))}
    </>
  );
}
