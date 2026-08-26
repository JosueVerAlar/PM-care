/**
 * Capturar una tarea directamente en el sprint, sin pasar por el árbol.
 *
 * Es el gesto de «me acaban de pedir esto y va para esta quincena». Existe porque si la
 * única forma de meter algo al sprint fuera abrir el proyecto, bajar a la historia,
 * capturar y volver, el usuario acabaría anotándolo en otro sitio — y lo que no entra al
 * tablero no se cuenta a fin de mes.
 *
 * ## Dos comandos, un gesto
 *
 * `crearTarea` y después `moverAlSprint` (regla 9: comandos con nombre, nunca el
 * documento). Van en serie y no en paralelo porque el segundo necesita el id que emitió el
 * primero, y ese id lo decide el contador del proyecto: se lee del documento que devuelve
 * el comando en vez de adivinarlo.
 *
 * Si el segundo falla, la tarea queda creada en su historia y no se borra: revertirla
 * sería destruir lo que el usuario acaba de escribir por un fallo de guardado (regla 5).
 * Se avisa y queda a un arrastre de distancia.
 *
 * ## Lo capturado aquí nace «no planeado»
 *
 * Por definición: algo que entró al sprint sin pasar por el backlog no estaba
 * contemplado. La marca la pone el reductor según `planeacion_cerrada_en` del proyecto
 * (D4, regla 17), así que el formulario **lo dice antes de capturar** en vez de
 * sorprender después — incluido el caso en el que no va a poder marcarlo.
 */

import { useEffect, useMemo, useRef, useState } from 'react';

import {
  destinosDeCaptura,
  idsDeHistoria,
  tareaRecienCreada,
  type DestinoCaptura,
} from '../../../compartido/dominio/sprint';
import type { Documento, Fecha, Sprint } from '../../../compartido/modelo/tipos';
import { useAccionesInterfaz } from '../../estado/interfaz';
import { useAplicar } from '../../estado/mutaciones';
import { fechaCorta } from '../../util/presentacion';

export function CapturaEnSprint({
  documento,
  sprint,
  hoy,
  cerrar,
}: {
  documento: Documento;
  sprint: Sprint;
  hoy: Fecha;
  /** Se llama al terminar o al cancelar. `tareaId` no nulo = se creó y entró al sprint. */
  cerrar: (tareaId: string | null) => void;
}) {
  const aplicar = useAplicar();
  const { avisar } = useAccionesInterfaz();

  const destinos = useMemo(() => destinosDeCaptura(documento, hoy), [documento, hoy]);

  const [historiaId, setHistoriaId] = useState(() => destinos[0]?.historiaId ?? '');
  const [titulo, setTitulo] = useState('');
  const [enviando, setEnviando] = useState(false);

  const refTitulo = useRef<HTMLInputElement>(null);
  useEffect(() => {
    refTitulo.current?.focus();
  }, []);

  const destino: DestinoCaptura | undefined = destinos.find((d) => d.historiaId === historiaId);

  /** Los destinos agrupados por proyecto: el desplegable de once proyectos sin `optgroup`
   *  es una lista de doscientas líneas sin ninguna referencia de dónde está uno. */
  const porProyecto = useMemo(() => {
    const grupos = new Map<string, { clave: string; nombre: string; destinos: DestinoCaptura[] }>();
    for (const d of destinos) {
      const grupo = grupos.get(d.clave) ?? { clave: d.clave, nombre: d.proyecto, destinos: [] };
      grupo.destinos.push(d);
      grupos.set(d.clave, grupo);
    }
    return [...grupos.values()];
  }, [destinos]);

  const puedeEnviar = titulo.trim() !== '' && destino !== undefined && !enviando;

  const enviar = async () => {
    if (destino === undefined || titulo.trim() === '') return;
    setEnviando(true);
    try {
      const previos = idsDeHistoria(documento, destino.historiaId);
      const creado = await aplicar(
        { comando: 'crearTarea', historiaId: destino.historiaId, titulo: titulo.trim() },
        `Capturar «${titulo.trim()}» en ${destino.clave}`,
      );
      if (creado === null) return; // el aviso ya lo puso `aplicar`; el texto sigue aquí

      const tareaId = tareaRecienCreada(creado, destino.historiaId, previos);
      if (tareaId === null) {
        avisar(
          'La tarea se creó pero no se pudo localizar para meterla al sprint. Está en su historia; arrástrala al sprint.',
        );
        return;
      }

      const movido = await aplicar(
        { comando: 'moverAlSprint', tareaId, sprintId: sprint.id },
        `Mover ${tareaId} al sprint`,
      );
      // Aunque el movimiento falle, la tarea ya existe: no se revierte nada (regla 5).
      cerrar(movido === null ? null : tareaId);
    } finally {
      setEnviando(false);
    }
  };

  if (destinos.length === 0) {
    return (
      <div className="alta alta--sprint">
        <p className="alta__titulo">No hay dónde capturar</p>
        <p className="alta__pie">
          Una tarea siempre vive en una historia del árbol: el sprint solo guarda a cuáles te
          comprometiste. Crea una épica y una historia en algún proyecto activo y vuelve.
        </p>
        <div className="alta__fila">
          <button type="button" className="boton-texto" onClick={() => cerrar(null)}>
            Cerrar
          </button>
        </div>
      </div>
    );
  }

  return (
    <form
      className="alta alta--sprint"
      onSubmit={(evento) => {
        evento.preventDefault();
        void enviar();
      }}
      onKeyDown={(evento) => {
        if (evento.key === 'Escape') {
          evento.stopPropagation();
          cerrar(null);
        }
      }}
    >
      <p className="alta__titulo">Capturar en {sprint.nombre}</p>

      <div className="alta__fila">
        <label className="campo campo--crece">
          <span className="campo__etq">Qué hay que hacer</span>
          <input
            ref={refTitulo}
            type="text"
            value={titulo}
            autoComplete="off"
            placeholder="Revisar el respaldo del viernes"
            onChange={(evento) => setTitulo(evento.target.value)}
          />
        </label>

        <label className="campo campo--destino">
          <span className="campo__etq">¿Dónde vive?</span>
          <select value={historiaId} onChange={(evento) => setHistoriaId(evento.target.value)}>
            {porProyecto.map((grupo) => (
              <optgroup key={grupo.clave} label={`${grupo.clave} · ${grupo.nombre}`}>
                {grupo.destinos.map((d) => (
                  <option key={d.historiaId} value={d.historiaId}>
                    {d.epica} › {d.historia}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>

        <button type="submit" className="boton-solido" disabled={!puedeEnviar}>
          {enviando ? 'Capturando…' : 'Capturar en el sprint'}
        </button>
        <button type="button" className="boton-texto" onClick={() => cerrar(null)}>
          Cancelar
        </button>
      </div>

      {destino !== undefined && (
        <p className="alta__pie">
          {destino.naceNoPlaneada ? (
            <>
              Nace marcada como <b>no planeada</b>: la planeación de {destino.clave} se cerró el{' '}
              {fechaCorta(destino.planeacionCerradaEn ?? hoy)} y todo lo capturado después
              cuenta como trabajo que no estaba contemplado. Es una marca de procedencia, no
              un estado: la tarea nace pendiente igual que cualquier otra.
            </>
          ) : (
            <>
              {destino.clave} <b>no ha cerrado su planeación</b>, así que esta tarea va a nacer
              como planeada aunque entre directa al sprint. Para que lo capturado a media
              quincena se marque solo hace falta que el proyecto tenga fecha de cierre de
              planeación; hoy eso solo se pone editando el archivo de datos.
            </>
          )}
        </p>
      )}
      <p className="alta__pie">
        Quién lo hace y para cuándo se piden justo después, en la tarjeta.
      </p>
    </form>
  );
}
