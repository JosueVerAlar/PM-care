/**
 * Las dos pantallas de borde: cargando y sin puente.
 *
 * «Cargando» no se anima ni cuenta un progreso falso: el almacén abre un archivo local y
 * eso tarda milisegundos. Lo que evita es el destello de una pantalla vacía que parezca
 * un documento sin proyectos.
 *
 * «Sin puente» es el caso de abrir `localhost:5173` en el navegador durante el
 * desarrollo. No es un error del usuario: es una confusión frecuente, y decirlo cuesta
 * menos que dejar una ventana en blanco con un fallo en la consola.
 */

import { useAccionesInterfaz } from '../estado/interfaz';


export function Cargando() {
  return (
    <div className="pantalla" role="status" aria-live="polite">
      <p className="pantalla__titulo">Abriendo el archivo de datos…</p>
    </div>
  );
}

export function SinPuente() {
  return (
    <div className="pantalla" role="alert">
      <p className="pantalla__titulo">Esta ventana no está conectada al proceso principal</p>
      <p className="pantalla__nota">
        PM-care lee y escribe un JSON local a través de Electron. Si abriste{' '}
        <code>localhost:5173</code> en un navegador, la interfaz carga pero no tiene de dónde
        sacar los datos. Usa <code>npm run dev</code> y trabaja en la ventana de la app.
      </p>
    </div>
  );
}

export function FalloDelPuente({ mensaje, reintentar }: { mensaje: string; reintentar: () => void }) {
  return (
    <div className="pantalla" role="alert">
      <p className="pantalla__titulo">No se pudo hablar con el proceso principal</p>
      <p className="pantalla__nota">{mensaje}</p>
      <button type="button" className="boton boton--primario" onClick={reintentar}>
        Reintentar
      </button>
    </div>
  );
}

/**
 * El documento cargó bien pero está vacío. Distinto de que el archivo esté roto.
 *
 * E13 — el texto decía «crear uno desde la app llega en E7; mientras tanto se puede editar
 * el JSON a mano». E7 se entregó hace cinco etapas: la app le estaba pidiendo al usuario
 * que editara un archivo a mano para algo que ya sabe hacer. Ahora dice el paso, y lo abre.
 */
export function SinProyectos({ ruta }: { ruta: string }) {
  const { verAdmin } = useAccionesInterfaz();
  return (
    <section className="panel" aria-label="Sin proyectos">
      <div className="vacio">
        <p className="vacio__titulo">Todavía no hay ningún proyecto</p>
        <p className="vacio__nota">Un proyecto se da de alta con su clave y su nombre.</p>
        <button type="button" className="boton" onClick={() => verAdmin('proyectos')}>
          Dar de alta un proyecto
        </button>
        <p className="vacio__dato">
          <code>{ruta}</code>
        </p>
      </div>
    </section>
  );
}

