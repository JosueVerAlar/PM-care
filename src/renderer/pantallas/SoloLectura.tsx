/**
 * Modo solo lectura (regla 13).
 *
 * La app no escribe NADA hasta que el usuario decida. Esta pantalla existe para que esa
 * decisión sea posible, y por eso lleva las cuatro salidas completas:
 *
 *   1. **Reintentar** — relee el archivo desde cero. Es lo que se pulsa después de
 *      arreglarlo a mano.
 *   2. **Restaurar un respaldo** — el proceso principal preserva antes lo que está en
 *      disco como `corrupto-*`, así que restaurar nunca puede ser la operación que
 *      destruya lo que se quería salvar.
 *   3. **Abrir en el editor** — para verlo y arreglarlo.
 *   4. **Mostrar en Finder** — para copiarlo, versionarlo o mandárselo a alguien.
 *
 * Las cuatro se ofrecen SIEMPRE y en el mismo orden, sea cual sea el fallo: una botonera
 * que cambia de tamaño según el error obliga a buscar el botón que ayer estaba ahí,
 * justo en el momento en que menos ganas hay de buscar. `diagnostico.acciones` solo
 * decide si la lista de respaldos se trae sola.
 *
 * Nunca se ofrece «reparar automáticamente». El usuario edita este JSON a mano y va a
 * dejar notas dentro; adivinar qué quiso decir es cómo se pierden.
 */

import { useCallback, useEffect, useState } from 'react';

import { useAccionesAlmacen } from '../estado/almacen';
import type { Diagnostico, Respaldo } from '../puente/api';
import { marcaRespaldo } from '../util/presentacion';

const ETIQUETA_CLASE: Record<Respaldo['clase'], string> = {
  sesion: 'de sesión',
  dia: 'del día',
  'pre-migracion': 'antes de migrar',
  corrupto: 'archivo roto preservado',
};

export function SoloLectura({
  diagnostico,
  ruta,
  /** `true` cuando el documento en memoria sigue siendo válido (conflicto externo). */
  compacta = false,
}: {
  diagnostico: Diagnostico;
  ruta: string;
  compacta?: boolean;
}) {
  const acciones = useAccionesAlmacen();
  const [respaldos, setRespaldos] = useState<Respaldo[] | null>(null);
  const [elegido, setElegido] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const pedirRespaldos = useCallback(async () => {
    setOcupado(true);
    setAviso(null);
    setRespaldos(await acciones.respaldos());
    setOcupado(false);
  }, [acciones]);

  // Si el fallo pide restaurar, la lista se trae sola: obligar a un clic extra para ver
  // si siquiera HAY respaldos es cruel justo en el momento en que más se necesita saberlo.
  useEffect(() => {
    if (diagnostico.acciones.includes('restaurar')) void pedirRespaldos();
  }, [diagnostico, pedirRespaldos]);

  const restaurar = async (nombre: string) => {
    setOcupado(true);
    const respuesta = await acciones.restaurar(nombre);
    setOcupado(false);
    if (!respuesta.ok) {
      setAviso(`${respuesta.mensaje}${respuesta.detalles ? ` — ${respuesta.detalles.join('; ')}` : ''}`);
    }
  };

  const abrir = async () => {
    const error = await acciones.abrirEnEditor();
    setAviso(error);
  };

  const revelar = async () => {
    const error = await acciones.revelar();
    setAviso(error);
  };

  return (
    <section className={`solo-lectura${compacta ? ' solo-lectura--compacta' : ''}`} aria-live="polite">
      <div className="solo-lectura__caja">
        <p className="solo-lectura__insignia">Modo solo lectura · no se está escribiendo nada</p>
        <h1 className="solo-lectura__titulo">{diagnostico.mensaje}</h1>

        {diagnostico.problemas.length > 0 && (
          <>
            <h2 className="solo-lectura__subtitulo">Dónde falla</h2>
            <ul className="solo-lectura__problemas">
              {diagnostico.problemas.map((problema, i) => (
                <li key={`${problema}-${i}`}>
                  <code>{problema}</code>
                </li>
              ))}
            </ul>
          </>
        )}

        <p className="solo-lectura__ruta">
          <span className="solo-lectura__etiqueta">Archivo</span>
          <code>{ruta}</code>
        </p>

        <div className="solo-lectura__acciones">
          <button type="button" className="boton boton--primario" onClick={() => void acciones.reintentar()} disabled={ocupado}>
            Reintentar
          </button>
          <button type="button" className="boton" onClick={() => void pedirRespaldos()} disabled={ocupado}>
            {respaldos === null ? 'Ver respaldos' : 'Actualizar respaldos'}
          </button>
          <button type="button" className="boton" onClick={() => void abrir()} disabled={ocupado}>
            Abrir en el editor
          </button>
          <button type="button" className="boton" onClick={() => void revelar()} disabled={ocupado}>
            Mostrar en Finder
          </button>
        </div>

        {aviso !== null && <p className="solo-lectura__aviso">{aviso}</p>}

        {respaldos !== null && (
          <div className="respaldos">
            <h2 className="solo-lectura__subtitulo">Respaldos disponibles</h2>
            {respaldos.length === 0 ? (
              <p className="solo-lectura__nota">
                No hay ningún respaldo todavía. Se crea uno por sesión y uno por día, siempre
                copiando un archivo que ya estaba completo.
              </p>
            ) : (
              <>
                <ul className="respaldos__lista">
                  {respaldos.map((respaldo) => (
                    <li key={respaldo.nombre}>
                      <label className="respaldos__fila">
                        <input
                          type="radio"
                          name="respaldo"
                          value={respaldo.nombre}
                          checked={elegido === respaldo.nombre}
                          onChange={() => setElegido(respaldo.nombre)}
                        />
                        <span className="respaldos__nombre">{respaldo.nombre}</span>
                        <span className="respaldos__clase">{ETIQUETA_CLASE[respaldo.clase]}</span>
                        <span className="respaldos__marca tabular">{marcaRespaldo(respaldo.marca)}</span>
                        <span className="respaldos__bytes tabular">
                          {(respaldo.bytes / 1024).toFixed(1)} KB
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
                {/* Dos pasos, no un diálogo: elegir y confirmar. Restaurar reemplaza el
                    archivo vivo, y un solo clic accidental no debería hacerlo. */}
                <button
                  type="button"
                  className="boton boton--primario"
                  disabled={elegido === null || ocupado}
                  onClick={() => elegido !== null && void restaurar(elegido)}
                >
                  {elegido === null ? 'Elige un respaldo para restaurar' : `Restaurar ${elegido}`}
                </button>
                <p className="solo-lectura__nota">
                  Antes de restaurar, el archivo que está en disco ahora se guarda aparte como
                  <code> corrupto-…</code>. Nada de lo que hay se pierde.
                </p>
              </>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
