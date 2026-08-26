/**
 * Registro de los manejadores de IPC.
 *
 * Este archivo es la frontera de confianza. Todo lo que entra viene del renderer y se
 * trata como hostil aunque hoy el renderer sea nuestro: un bug de la interfaz no puede
 * convertirse en escritura arbitraria del disco.
 *
 * Tres reglas que se aplican aquí:
 *
 * - **Todo payload se valida con Zod antes de llegar al almacén** (`validarComando`). El
 *   mismo esquema que valida el archivo valida lo que entra por IPC.
 * - **Ningún canal recibe una ruta.** `abrirEnEditor` y `revelar` operan sobre la ruta
 *   que el almacén ya conoce; `restaurar` recibe un NOMBRE que el repositorio contrasta
 *   contra su propio listado. Si un canal aceptara rutas, la regla 12 estaría rota
 *   aunque el preload se llamara «de dominio».
 * - **Nada lanza hacia el renderer.** Un `throw` dentro de `ipcMain.handle` llega al otro
 *   lado como una excepción con el stack del proceso principal pegado. Se devuelve
 *   `{ ok: false, ... }` y se acabó.
 */

import { app, ipcMain, shell, type BrowserWindow } from 'electron';

import type { Repositorio, RespuestaComando } from '../almacen/repositorio';
import { validarComando } from '../comandos/tipos';
import { CANALES, EVENTOS } from './canales';

export interface OpcionesManejadores {
  repositorio: Repositorio;
  /** Ventanas a las que empujar los avisos. Se consulta en cada aviso, no se guarda. */
  ventanas: () => BrowserWindow[];
}

export function registrarManejadores({ repositorio, ventanas }: OpcionesManejadores): void {
  const responder = <T>(canal: string, manejador: (dato: unknown) => Promise<T> | T): void => {
    ipcMain.removeHandler(canal);
    ipcMain.handle(canal, async (_evento, dato: unknown) => {
      try {
        return await manejador(dato);
      } catch (error) {
        return {
          ok: false,
          codigo: 'error-interno',
          mensaje: error instanceof Error ? error.message : String(error),
        };
      }
    });
  };

  responder(CANALES.cargar, () => repositorio.estado());

  responder(CANALES.aplicar, async (dato): Promise<RespuestaComando> => {
    const validado = validarComando(dato);
    if (!validado.ok) {
      return {
        ok: false,
        codigo: 'payload-invalido',
        mensaje: 'El comando no tiene la forma esperada; no se escribió nada.',
        detalles: validado.problemas.map((p) => `${p.ruta}: ${p.mensaje}`),
      };
    }
    return repositorio.ejecutar(validado.comando, 'ui');
  });

  responder(CANALES.guardarAhora, () => repositorio.guardarPendiente());
  responder(CANALES.deshacer, () => repositorio.deshacer());
  responder(CANALES.respaldos, () => repositorio.respaldos());
  responder(CANALES.reintentar, () => repositorio.reintentar());

  responder(CANALES.restaurar, async (dato): Promise<RespuestaComando> => {
    if (typeof dato !== 'string' || dato === '') {
      return { ok: false, codigo: 'payload-invalido', mensaje: 'Falta el nombre del respaldo.' };
    }
    // El repositorio solo acepta nombres que aparecen en su propio listado: un `../` que
    // llegue de aquí no encuentra coincidencia y se rechaza.
    return repositorio.restaurar(dato);
  });

  responder(CANALES.abrirEnEditor, async () => {
    const error = await shell.openPath(repositorio.estado().ruta);
    return error === '' ? { ok: true } : { ok: false, codigo: 'shell', mensaje: error };
  });

  responder(CANALES.revelar, () => {
    shell.showItemInFolder(repositorio.estado().ruta);
    return { ok: true };
  });

  responder(CANALES.version, () => app.getVersion());

  // Avisos que el renderer no pidió: cambio externo, conflicto, guardado fallido.
  repositorio.alCambiar((instantanea) => {
    for (const ventana of ventanas()) {
      if (!ventana.isDestroyed()) ventana.webContents.send(EVENTOS.estado, instantanea);
    }
  });
}
