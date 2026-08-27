/**
 * La banda de edición al pie del panel del árbol.
 *
 * Es donde se captura, donde se pone la nota de un bloqueo y —solo cuando el panel del
 * sprint no cabe— donde se llena el compromiso.
 *
 * ## Por qué al pie y no dentro de la fila
 *
 * El árbol es un `role="tree"` de filas planas: el único hijo válido de un `tree` es un
 * `treeitem`, y meterle un formulario dentro rompe el patrón para quien navega con
 * lector de pantalla y secuestra las flechas para quien navega con teclado. Al pie el
 * formulario tiene su propio orden de tabulación, no desplaza las filas mientras se
 * escribe, y —lo que de verdad decide— **sigue visible en ventana angosta**, que es donde
 * el panel del sprint desaparece.
 *
 * Capturar no cierra el formulario: se limpia el campo y se queda el foco dentro. Meter
 * las seis tareas de una historia son seis títulos y seis Enter, no seis aperturas.
 */

import { useEffect, useRef, useState } from 'react';

import type { Documento, Fecha, Proyecto, Sprint, TipoBloqueo } from '../../../compartido/modelo/tipos';
import { useAccionesInterfaz, useInterfaz, type ClaseNodo } from '../../estado/interfaz';
import { useMutar } from '../../estado/mutaciones';
import { buscarNodo, rutaDeNodo } from '../../util/nodos';
import { etiquetaBloqueo, TIPOS_BLOQUEO } from '../../util/presentacion';
import { FormularioCompromiso } from './FormularioCompromiso';

const NOMBRE_CLASE: Record<ClaseNodo, string> = {
  epica: 'épica',
  historia: 'historia',
  tarea: 'tarea',
};

/*
 * Las etiquetas y la lista de tipos de bloqueo viven en `util/presentacion.ts` desde E9:
 * este formulario y la vista global de Bloqueos tienen que llamar «Falta una decisión» a
 * lo mismo, y dos tablas en dos archivos divergen en cuanto alguien retoca una.
 */

export interface PropsPieEdicion {
  documento: Documento;
  proyecto: Proyecto;
  sprint: Sprint | undefined;
  hoy: Fecha;
  /** `false` cuando el panel del sprint está oculto: el compromiso se muda aquí. */
  dosPaneles: boolean;
}

export function PieEdicion({ documento, proyecto, sprint, hoy, dosPaneles }: PropsPieEdicion) {
  const { redaccion } = useInterfaz();
  const { redactar, irANodo, irASiguiente } = useAccionesInterfaz();

  if (redaccion === null) return null;

  if (redaccion.tipo === 'capturar') {
    return (
      <FormularioCaptura
        key={`${redaccion.clase}:${redaccion.padreId}`}
        proyecto={proyecto}
        clase={redaccion.clase}
        padreId={redaccion.padreId}
        cerrar={() => redactar(null)}
      />
    );
  }

  if (redaccion.tipo === 'bloqueo') {
    const nodo = buscarNodo(proyecto, redaccion.tareaId);
    if (nodo === null || nodo.clase !== 'tarea') return null;
    return (
      <FormularioBloqueo
        key={redaccion.tareaId}
        tareaId={nodo.tarea.id}
        titulo={nodo.tarea.titulo}
        cerrar={() => redactar(null)}
      />
    );
  }

  // El compromiso solo se muda aquí si su casa —la tarjeta del sprint— no se está
  // pintando. Con los dos paneles a la vista, el formulario vive donde dice el encargo.
  if (redaccion.tipo === 'compromiso' && !dosPaneles) {
    const nodo = buscarNodo(proyecto, redaccion.tareaId);
    if (nodo === null || nodo.clase !== 'tarea') return null;
    return (
      <div className="pie-edicion">
        <p className="pie-edicion__que">
          Compromiso de <b>{nodo.tarea.titulo}</b> <span className="clave">{nodo.tarea.id}</span>
        </p>
        <FormularioCompromiso
          key={nodo.tarea.id}
          tarea={nodo.tarea}
          item={sprint?.items.find((i) => i.tarea_id === nodo.tarea.id)}
          personas={documento.personas}
          finDeSprint={sprint?.fin ?? null}
          hoy={hoy}
          cerrar={(avanzar) => {
            redactar(null);
            if (avanzar) irASiguiente();
            else irANodo(nodo.tarea.id);
          }}
        />
      </div>
    );
  }

  return null;
}

// --- capturar ---------------------------------------------------------------

function FormularioCaptura({
  proyecto,
  clase,
  padreId,
  cerrar,
}: {
  proyecto: Proyecto;
  clase: ClaseNodo;
  padreId: string;
  cerrar: () => void;
}) {
  const mutar = useMutar();
  const { expandir, irANodo } = useAccionesInterfaz();
  const [titulo, setTitulo] = useState('');
  const [ultimo, setUltimo] = useState<string | null>(null);
  const campo = useRef<HTMLInputElement>(null);

  useEffect(() => {
    campo.current?.focus();
  }, []);

  const nodoPadre = clase === 'epica' ? null : buscarNodo(proyecto, padreId);
  const contexto =
    nodoPadre === null ? proyecto.clave : rutaDeNodo(proyecto, nodoPadre).join(' › ');

  const enviar = async () => {
    const limpio = titulo.trim();
    if (limpio === '') return;

    const comando =
      clase === 'epica'
        ? ({ comando: 'crearEpica', proyecto: proyecto.clave, titulo: limpio } as const)
        : clase === 'historia'
          ? ({ comando: 'crearHistoria', epicaId: padreId, titulo: limpio } as const)
          : ({ comando: 'crearTarea', historiaId: padreId, titulo: limpio } as const);

    const ok = await mutar(comando, `Capturar ${NOMBRE_CLASE[clase]}`);
    if (!ok) return; // el título sigue en el campo: no se descarta lo tecleado (regla 5)

    // Se abre el camino hasta lo recién capturado. Sin esto, capturar una tarea dentro de
    // una historia colapsada la manda a un sitio que el usuario no ve, y parece que no
    // pasó nada.
    if (nodoPadre !== null) {
      const ancestros =
        nodoPadre.clase === 'historia' ? [nodoPadre.epica.id, nodoPadre.historia.id] : [nodoPadre.epica.id];
      expandir(ancestros);
    }
    setUltimo(limpio);
    setTitulo('');
    campo.current?.focus();
  };

  return (
    <div className="pie-edicion">
      <p className="pie-edicion__que">
        Nueva {NOMBRE_CLASE[clase]} en <b>{contexto}</b>
      </p>
      <div className="pie-edicion__fila">
        <label className="campo campo--crece">
          <span className="solo-lectores">Título de la {NOMBRE_CLASE[clase]}</span>
          <input
            ref={campo}
            value={titulo}
            placeholder={`Título de la ${NOMBRE_CLASE[clase]}`}
            onChange={(e) => setTitulo(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void enviar();
              } else if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                cerrar();
                irANodo(padreId);
              }
            }}
          />
        </label>
        <button
          type="button"
          className="boton-solido"
          disabled={titulo.trim() === ''}
          onClick={() => void enviar()}
        >
          Capturar
        </button>
        <button type="button" className="boton-texto" onClick={cerrar}>
          Cerrar
        </button>
      </div>
      {/* E13 · solo la CONFIRMACIÓN de lo que acaba de pasar. La explicación de que Enter
          encadena y Esc cierra se fue: el primer Enter lo enseña mejor que la frase. */}
      {ultimo !== null && <p className="pie-edicion__pista">Capturada «{ultimo}».</p>}

    </div>
  );
}

// --- bloquear ---------------------------------------------------------------

/**
 * La única fricción intencional de la app: **sin nota no hay bandera**.
 *
 * No es celo de formulario. La vista de bloqueos de once proyectos existe para contestar
 * «¿qué está atorado y por qué?»; una lista de banderas rojas sin motivo contesta la
 * mitad y obliga a abrir once proyectos para contestar la otra. Por eso el botón está
 * deshabilitado mientras el motivo esté vacío, y por eso el reductor lo exige también
 * (`motivo: z.string().min(1)`), no solo esta pantalla.
 */
function FormularioBloqueo({
  tareaId,
  titulo,
  cerrar,
}: {
  tareaId: string;
  titulo: string;
  cerrar: () => void;
}) {
  const mutar = useMutar();
  const { irANodo } = useAccionesInterfaz();
  const [tipo, setTipo] = useState<TipoBloqueo>('dependencia');
  const [motivo, setMotivo] = useState('');
  const campo = useRef<HTMLInputElement>(null);

  useEffect(() => {
    campo.current?.focus();
  }, []);

  const enviar = async () => {
    const limpio = motivo.trim();
    if (limpio === '') return;
    const ok = await mutar(
      { comando: 'bloquear', tareaId, tipo, motivo: limpio },
      `Bloquear ${tareaId}`,
    );
    if (ok) {
      cerrar();
      irANodo(tareaId);
    }
  };

  const salir = () => {
    cerrar();
    irANodo(tareaId);
  };

  return (
    <div className="pie-edicion pie-edicion--bloqueo">
      <p className="pie-edicion__que">
        Bloquear <b>{titulo}</b> <span className="clave">{tareaId}</span>
      </p>
      <div className="pie-edicion__fila">
        <label className="campo">
          <span className="campo__etq">Qué la detiene</span>
          <select value={tipo} onChange={(e) => setTipo(e.target.value as TipoBloqueo)}>
            {TIPOS_BLOQUEO.map((opcion) => (
              <option key={opcion} value={opcion}>
                {etiquetaBloqueo(opcion)}
              </option>
            ))}
          </select>
        </label>
        <label className="campo campo--crece">
          <span className="campo__etq">Detalle (obligatorio)</span>
          <input
            ref={campo}
            value={motivo}
            placeholder="Sin esto, la vista de bloqueos no sirve para nada"
            onChange={(e) => setMotivo(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void enviar();
              } else if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                salir();
              }
            }}
          />
        </label>
        <button
          type="button"
          className="boton-solido"
          disabled={motivo.trim() === ''}
          title={motivo.trim() === '' ? 'Escribe qué la detiene' : undefined}
          onClick={() => void enviar()}
        >
          Bloquear
        </button>
        <button type="button" className="boton-texto" onClick={salir}>
          Cancelar
        </button>
      </div>
    </div>
  );
}
