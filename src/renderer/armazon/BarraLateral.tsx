/**
 * La barra lateral: cuatro grupos nombrados por lo que se hace en cada uno.
 *
 *     HOY        lo que pide una decisión ahora
 *     PROYECTOS  la lista, con su `＋` para dar de alta
 *     REGISTRO   lo que ya pasó
 *     GENTE      quién trae qué
 *
 * Antes eran «Vistas», «Proyectos» y «Administración». Las dos que se fueron nombraban la
 * CATEGORÍA de lo que había dentro, no lo que había dentro — y «Administración» dejó
 * además de ser cierta al fusionarse Equipos, que ahora se edita desde su propia pantalla.
 * Una etiqueta vaga no cuesta un clic: cuesta abrir dos grupos para recordar en cuál
 * estaba lo que se busca.
 *
 * Los contadores de bloqueadas se derivan del documento, nunca se guardan. Un contador
 * en cero no se pinta: una columna de ceros entrena a no mirar la columna.
 *
 * En rail de 48 px el texto desaparece y quedan el icono (vistas) o las tres primeras
 * letras de la clave (proyectos). El contador se convierte en una insignia sobre la
 * esquina. El `title` conserva el nombre completo en ambos modos.
 */

import { useMemo } from 'react';

import { paraVistaBloqueos, senalesDeProyecto } from '../../compartido/dominio/clasificar';
import { sprintsActivos } from '../../compartido/dominio/derivar';
import type { Documento, Fecha } from '../../compartido/modelo/tipos';
import { ContadorBloqueos } from '../componentes/Chips';
import { Icono } from '../componentes/iconos';
import { useAccionesInterfaz, type Vista } from '../estado/interfaz';
import { useSoloLectura } from '../estado/mutaciones';
import { SECCIONES_ADMIN } from '../vistas/administracion/VistaAdministracion';
import { GLOBALES, type EntradaGlobal, type GrupoLateral } from '../vistas/globales/registro';

export function BarraLateral({
  documento,
  vista,
  claveActiva,
  hoy,
}: {
  documento: Documento;
  vista: Vista | null;
  /**
   * El proyecto que se está pintando de verdad, ya resuelto contra el documento.
   * No se deduce de `vista`: al abrir la app nadie eligió nada todavía y la vista cae
   * al primer proyecto, que igual tiene que salir marcado en la lista.
   */
  claveActiva: string | null;
  hoy: Fecha;
}) {
  const { verProyecto, verGlobal, verAdmin, preguntarProyecto } = useAccionesInterfaz();
  const soloLectura = useSoloLectura();

  /** Las vistas de un grupo, en el orden en que están escritas en el registro. */
  const porGrupo = (grupo: GrupoLateral) => GLOBALES.filter((entrada) => entrada.grupo === grupo);

  const bloqueosTotales = useMemo(() => paraVistaBloqueos(documento).length, [documento]);
  /**
   * El ítem «Sprint» toma el nombre del sprint activo, pero solo si hay UNO. Con una
   * quincena abierta por proyecto, poner el nombre del primero convertía la lateral en un
   * cartel que decía «Sprint 2» mientras la vista enseñaba tres sprints distintos.
   */
  const activos = useMemo(() => sprintsActivos(documento), [documento]);
  const activo = activos.length === 1 ? activos[0] : undefined;

  /** Un solo recorrido por proyecto: `senalesDeProyecto` ya trae lo que la lista pinta. */
  const proyectos = useMemo(
    () =>
      documento.proyectos
        .filter((p) => !p.archivado)
        .map((p) => ({
          clave: p.clave,
          nombre: p.nombre,
          inicial: p.clave.replace(/-/g, '').slice(0, 3),
          bloqueadas: senalesDeProyecto(documento, p.clave, hoy)?.bloqueadas ?? 0,
        })),
    [documento, hoy],
  );

  return (
    <nav className="lateral" aria-label="Hoy, proyectos, registro y gente">
      <div className="lat-grupo">
        <h2 className="lat-titulo">Hoy</h2>
        {porGrupo('hoy').map((entrada) => (
          <ItemGlobal
            key={entrada.id}
            entrada={entrada}
            activa={vista?.tipo === 'global' && vista.id === entrada.id}
            alPulsar={() => verGlobal(entrada.id)}
            // Solo las de HOY llevan datos vivos en la etiqueta: el sprint se llama por su
            // nombre real y los bloqueos traen su contador. En REGISTRO y GENTE no hay
            // nada que contar que no sea abrir la vista.
            texto={entrada.id === 'sprint' && activo ? activo.nombre : entrada.texto}
            contador={entrada.id === 'bloqueos' ? bloqueosTotales : undefined}
          />
        ))}
      </div>

      <div className="lat-sep" />

      <div className="lat-grupo">
        <h2 className="lat-titulo">
          Proyectos
          <span className="crece" />
          {/* Dar de alta un proyecto se hacía entrando a «Administración · Proyectos», que
              es un sitio que hay que saber que existe. El `＋` está donde ya se mira la
              lista, que es donde uno se da cuenta de que falta uno. */}
          <button
            type="button"
            className="lat-mas"
            title="Dar de alta un proyecto"
            aria-label="Dar de alta un proyecto"
            onClick={() => verAdmin('proyectos')}
          >
            +
          </button>
        </h2>
        {proyectos.length === 0 && <p className="lat-vacio">No hay proyectos capturados.</p>}
        {proyectos.map((p) => (
          // El `⋯` no puede vivir DENTRO del botón que abre el proyecto: un control
          // anidado en otro no es marcado válido y el clic se lo comería el de fuera.
          <div className="lat-fila" key={p.clave}>
          <button
            type="button"
            className="lat-item"
            title={p.nombre}
            aria-label={`${p.clave} — ${p.nombre}`}
            // `!== 'global'` no basta desde E8: con la pantalla de cierre abierta ninguna
            // fila de proyecto es la actual, y marcar una anunciaría al lector de pantalla
            // un sitio donde el usuario no está.
            aria-current={
              (vista === null || vista.tipo === 'proyecto') && p.clave === claveActiva
            }
            onClick={() => verProyecto(p.clave)}
          >
            <span className="lat-inicial" aria-hidden="true">
              {p.inicial}
            </span>
            <span className="lat-item__texto">{p.clave}</span>
            <ContadorBloqueos n={p.bloqueadas} />
          </button>
          <MenuProyecto
            clave={p.clave}
            soloLectura={soloLectura}
            preguntar={(accion) => preguntarProyecto({ clave: p.clave, accion })}
          />
          </div>
        ))}
      </div>

      <div className="lat-sep" />

      <div className="lat-grupo">
        <h2 className="lat-titulo">Registro</h2>
        {porGrupo('registro').map((entrada) => (
          <ItemGlobal
            key={entrada.id}
            entrada={entrada}
            activa={vista?.tipo === 'global' && vista.id === entrada.id}
            alPulsar={() => verGlobal(entrada.id)}
          />
        ))}
      </div>

      <div className="lat-sep" />

      {/* GENTE junta las dos vistas de personas con la edición de equipos. Antes estaban
          repartidas entre «Vistas» y «Administración» con el mismo sustantivo en las dos,
          que era la causa de que «Equipos» apareciera dos veces en la misma barra. */}
      <div className="lat-grupo">
        <h2 className="lat-titulo">Gente</h2>
        {porGrupo('gente').map((entrada) => (
          <ItemGlobal
            key={entrada.id}
            entrada={entrada}
            activa={vista?.tipo === 'global' && vista.id === entrada.id}
            alPulsar={() => verGlobal(entrada.id)}
          />
        ))}
        {SECCIONES_ADMIN.filter((seccion) => seccion.id !== 'proyectos').map((seccion) => (
          <button
            key={seccion.id}
            type="button"
            className="lat-item"
            title={seccion.texto}
            aria-label={seccion.texto}
            aria-current={vista?.tipo === 'admin' && vista.seccion === seccion.id}
            onClick={() => verAdmin(seccion.id)}
          >
            <span className="lat-item__icono">
              <Icono nombre={seccion.icono} />
            </span>
            <span className="lat-item__texto">{seccion.texto}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}

/**
 * Una entrada de vista global en la lateral.
 *
 * Existe porque el mismo botón se pinta en tres grupos, y tres copias del marcado son tres
 * sitios donde el `aria-current` puede quedarse sin actualizar.
 */
function ItemGlobal({
  entrada,
  activa,
  alPulsar,
  texto,
  contador,
}: {
  entrada: EntradaGlobal;
  activa: boolean;
  alPulsar: () => void;
  /** Sustituye al del registro cuando la vista tiene un nombre vivo (el sprint activo). */
  texto?: string;
  contador?: number;
}) {
  return (
    <button
      type="button"
      className="lat-item"
      title={entrada.texto}
      // El nombre accesible es explícito porque en rail el texto se oculta con CSS: sin
      // esto, con la lateral colapsada el botón se anunciaría vacío.
      aria-label={entrada.texto}
      aria-current={activa}
      onClick={alPulsar}
    >
      <span className="lat-item__icono">
        <Icono nombre={entrada.icono} />
      </span>
      <span className="lat-item__texto">{texto ?? entrada.texto}</span>
      {contador !== undefined && <ContadorBloqueos n={contador} />}
    </button>
  );
}

/**
 * El `⋯` de un proyecto en la lista lateral.
 *
 * Cerrar vivía solo dentro de «Administración · Proyectos», una pantalla a la que hay que
 * saber ir. Aquí está donde el proyecto ya se está mirando, que es donde uno decide que
 * sobra. La ceremonia no cambia: la abre `DialogoProyecto`, la misma para las dos entradas.
 *
 * **Solo ofrece cerrar, y eso no es una omisión.** Esta lista muestra los proyectos
 * ACTIVOS —cerrar archiva, así que lo cerrado sale de aquí—, y eliminar exige que el
 * proyecto esté cerrado. Reabrir y eliminar viven en Administración, que es donde están
 * los cerrados. Ofrecerlos aquí sería pintar dos acciones que nunca podrían dispararse.
 *
 * Mismo `<select>` nativo que el `⋯` de las filas del árbol, y por lo mismo: sin submenús
 * no se justifican doscientas líneas de menú a mano, y el sistema trae teclado, `Escape` y
 * posicionamiento gratis. Nombre accesible específico, nunca «Más».
 */
function MenuProyecto({
  clave,
  soloLectura,
  preguntar,
}: {
  clave: string;
  soloLectura: boolean;
  preguntar: (accion: 'cerrar') => void;
}) {
  // En solo lectura no se ofrece: un menú de acciones que las rechaza todas enseña que la
  // app no responde, en vez de que el archivo está en conflicto.
  if (soloLectura) return null;

  return (
    <select
      className="lat-menu"
      tabIndex={-1}
      value=""
      aria-label={`Acciones de ${clave}`}
      title={`Acciones de ${clave}`}
      onChange={(evento) => {
        const accion = evento.target.value;
        evento.target.value = '';
        if (accion === 'cerrar') preguntar('cerrar');
      }}
    >
      <option value="">⋯</option>
      <option value="cerrar">Cerrar proyecto…</option>
    </select>
  );
}
