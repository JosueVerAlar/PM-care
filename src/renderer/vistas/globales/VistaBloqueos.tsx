/**
 * E9 — Bloqueos, los de todos los proyectos juntos.
 *
 * ## Por qué agrupa por TIPO y no por proyecto
 *
 * Con once proyectos, agrupar por proyecto da seis grupos de una fila: mucha cabecera y
 * ninguna acción nueva. El tipo junta lo que se destraba con el MISMO movimiento —todo lo
 * que espera una decisión cabe en una reunión— y por eso la cabecera de cada grupo dice
 * cuál es esa salida. El agrupado por proyecto sigue ahí para cuando la pregunta sí sea
 * «¿qué tiene atorado SICOE?».
 *
 * ## Por qué la nota va en tinta plena
 *
 * Sin «qué lo detiene» esta vista es una lista de títulos que no sugiere nada. La nota es
 * su razón de existir, así que va a 12 px en `--tinta-1` con marca al costado, no en el
 * gris de metadato donde nadie la lee.
 *
 * Todo el cálculo —agrupar, ordenar, contar días— viene de
 * `compartido/dominio/bloqueos.ts`. Aquí no se resta una fecha.
 */

import { useMemo, useState } from 'react';

import {
  agruparBloqueos,
  filasDeBloqueos,
  resumenDeBloqueos,
  type CriterioBloqueos,
  type FilaBloqueo,
} from '../../../compartido/dominio/bloqueos';
import { nombreDePersona, nombresDePersonas } from '../../../compartido/dominio/carga';
import type { Documento, Fecha, PersonaId } from '../../../compartido/modelo/tipos';
import { ChipNuevo } from '../../componentes/Chips';
import { CuadroBloqueo, Glifo } from '../../componentes/iconos';
import { useMutar, useSoloLectura } from '../../estado/mutaciones';
import {
  dias,
  etiquetaBloqueo,
  etiquetaDeTarea,
  formaDeTarea,
  instanteCorto,
  salidaBloqueo,
  tareas as cuentaTareas,
} from '../../util/presentacion';
import {
  BotonIrATarea,
  GrupoPlegable,
  Lienzo,
  MigajaTarea,
  NotaPie,
  PanelGlobal,
  ReglaOrden,
  VacioGlobal,
} from './piezas';

export function VistaBloqueos({ documento, hoy }: { documento: Documento; hoy: Fecha }) {
  const [criterio, setCriterio] = useState<CriterioBloqueos>('tipo');
  // Solo las EXCEPCIONES: por omisión todos los grupos están abiertos, y plegar es lo que
  // se recuerda. Así un grupo nuevo nace visible en vez de nacer escondido.
  const [plegados, setPlegados] = useState<ReadonlySet<string>>(new Set());

  const nombres = useMemo(() => nombresDePersonas(documento), [documento]);
  const filas = useMemo(() => filasDeBloqueos(documento, hoy), [documento, hoy]);
  const resumen = useMemo(() => resumenDeBloqueos(filas), [filas]);
  const grupos = useMemo(
    () => agruparBloqueos(documento, hoy, criterio),
    [documento, hoy, criterio],
  );

  const alternar = (id: string) =>
    setPlegados((previos) => {
      const siguiente = new Set(previos);
      if (!siguiente.delete(id)) siguiente.add(id);
      return siguiente;
    });

  if (filas.length === 0) {
    return (
      <PanelGlobal etiqueta="Bloqueos">
        <header className="cab">
          <h2 className="cab__titulo">Bloqueos</h2>
        </header>
        <VacioGlobal
          titulo="Nada está detenido ahora mismo"
          queHacer={
            <>
              Cuando algo se atore, márcalo desde el árbol del proyecto con{' '}
              <b>Bloquear</b> (tecla <kbd>B</kbd> sobre la tarea) y escribe qué lo detiene. Esa
              nota es justo lo que esta pantalla muestra: sin ella, la lista no sugiere ninguna
              acción.
            </>
          }
        />
      </PanelGlobal>
    );
  }

  return (
    <PanelGlobal etiqueta="Bloqueos">
      <header className="cab">
        <h2 className="cab__titulo">
          {resumen.total === 1 ? '1 bloqueo abierto' : `${resumen.total} bloqueos abiertos`}
        </h2>
        <span className="crece" />
        <span className="cab__nota">Agrupar por</span>
        <div className="alternador" role="group" aria-label="Criterio de agrupación">
          <button
            type="button"
            aria-pressed={criterio === 'tipo'}
            onClick={() => setCriterio('tipo')}
          >
            Tipo de bloqueo
          </button>
          <button
            type="button"
            aria-pressed={criterio === 'proyecto'}
            onClick={() => setCriterio('proyecto')}
          >
            Proyecto
          </button>
        </div>
      </header>

      <ReglaOrden>
        Grupos y filas ordenados por <b>días detenido</b>, del más viejo al más nuevo. El más
        viejo lleva {dias(resumen.diasMaximo ?? 0)} · en{' '}
        {resumen.proyectos === 1 ? '1 proyecto' : `${resumen.proyectos} proyectos`} ·{' '}
        {resumen.enSprintActivo} de {resumen.total} están comprometidos en el sprint activo
      </ReglaOrden>

      <Lienzo>
        {grupos.map((grupo) => {
          const abierto = !plegados.has(grupo.id);
          return (
            <GrupoPlegable
              key={grupo.id}
              clase="grupo grupo--bloqueo"
              abierto={abierto}
              alternar={() => alternar(grupo.id)}
              cabecera={
                <>
                  <span className="grupo__titulo">
                    {grupo.tipo !== null ? etiquetaBloqueo(grupo.tipo) : grupo.nombre}
                  </span>
                  <span className="grupo__n tabular">{cuentaTareas(grupo.filas.length)}</span>
                  <span className="grupo__nota">
                    {grupo.tipo !== null
                      ? salidaBloqueo(grupo.tipo)
                      : `el más viejo lleva ${dias(grupo.diasMaximo)}`}
                  </span>
                  <span className="crece" />
                </>
              }
            >
              {grupo.filas.map((fila) => (
                <Fila key={fila.ubicacion.tarea.id} fila={fila} nombres={nombres} />
              ))}
            </GrupoPlegable>
          );
        })}
      </Lienzo>

      <NotaPie>
        «Bloqueada» es una bandera, no un estado: cada tarea conserva su glifo propio —
        pendiente o en curso — para saber a qué vuelve al desbloquearse. Los días se cuentan
        desde que se marcó el bloqueo, no desde que el problema empezó.
      </NotaPie>
    </PanelGlobal>
  );
}

function Fila({
  fila,
  nombres,
}: {
  fila: FilaBloqueo;
  nombres: ReadonlyMap<PersonaId, string>;
}) {
  const { ubicacion, bloqueo } = fila;
  const { tarea } = ubicacion;
  const responsable = nombreDePersona(nombres, tarea.responsable);
  const mutar = useMutar();
  const soloLectura = useSoloLectura();

  return (
    <div className={`fila-bloqueo${fila.nuevo ? ' fila-bloqueo--nuevo' : ''}`}>
      <p className="fila-bloqueo__dias">
        <span className="fila-bloqueo__cifra tabular">{fila.dias}</span>
        <span className="fila-bloqueo__unidad">{fila.dias === 1 ? 'DÍA' : 'DÍAS'}</span>
      </p>

      <div className="fila-bloqueo__cuerpo">
        <p className="fila-bloqueo__cab">
          {/* CANAL 1: el estado sigue siendo el suyo. El bloqueo no lo reemplaza. */}
          <Glifo forma={formaDeTarea(tarea.estado)} etiqueta={etiquetaDeTarea(tarea.estado)} />
          <span className="fila-bloqueo__titulo">{tarea.titulo}</span>
          {/* CANAL 2: procedencia, en su propio vehículo. */}
          {fila.nuevo && <ChipNuevo />}
          {fila.enSprintActivo && (
            <span className="chip chip--neutro" title="Comprometida en el sprint activo">
              En sprint
            </span>
          )}
          <span className="clave">{tarea.id}</span>
        </p>

        <MigajaTarea ubicacion={ubicacion} />

        {/* CANAL 3: el bloqueo, con la palabra y el motivo. El rojo nunca viaja solo. */}
        <p className="fila-bloqueo__nota">
          <CuadroBloqueo />
          <span>{bloqueo.motivo}</span>
        </p>

        <p className="fila-bloqueo__meta">
          {etiquetaBloqueo(bloqueo.tipo)} · desde el {instanteCorto(bloqueo.bloqueada_en)}
          {responsable !== null && ` · ${responsable}`}
        </p>

        <div className="fila-bloqueo__acciones">
          <button
            type="button"
            className="mini mini--fuerte"
            disabled={soloLectura}
            title={
              soloLectura
                ? 'La app está en solo lectura: no se escribe nada.'
                : 'Cierra el bloqueo conservando su historial. La tarea vuelve a su estado propio.'
            }
            onClick={() =>
              void mutar({ comando: 'desbloquear', tareaId: tarea.id }, `Desbloquear ${tarea.id}`)
            }
          >
            Desbloquear
          </button>
          <BotonIrATarea ubicacion={ubicacion} />
        </div>
      </div>
    </div>
  );
}
