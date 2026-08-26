import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'

/**
 * La superficie expuesta al renderer es de DOMINIO, no de sistema de archivos.
 * Nunca `leerArchivo`/`escribirArchivo` ni el `ipcRenderer` crudo: cualquier bug de la
 * interfaz se convertiría en lectura arbitraria del disco.
 *
 * Regla dura: el renderer manda COMANDOS con nombre, jamás el documento completo.
 *
 * Los literales de canal se repiten aquí a propósito. Con `sandbox: true` el `require`
 * del preload solo resuelve unos pocos módulos de Electron, así que no se puede importar
 * `ipc/canales.ts` en tiempo de ejecución. Ver la nota de ese archivo.
 */
const api = {
  cargar: () => ipcRenderer.invoke('almacen:cargar'),
  aplicar: (comando: unknown) => ipcRenderer.invoke('almacen:aplicar', comando),
  guardarAhora: () => ipcRenderer.invoke('almacen:guardar-ahora'),
  deshacer: () => ipcRenderer.invoke('almacen:deshacer'),
  respaldos: () => ipcRenderer.invoke('almacen:respaldos'),
  /** Recibe el NOMBRE de un respaldo del listado, nunca una ruta. */
  restaurar: (nombre: string) => ipcRenderer.invoke('almacen:restaurar', nombre),
  reintentar: () => ipcRenderer.invoke('almacen:reintentar'),
  abrirEnEditor: () => ipcRenderer.invoke('almacen:abrir-en-editor'),
  revelar: () => ipcRenderer.invoke('almacen:revelar'),
  version: (): Promise<string> => ipcRenderer.invoke('app:version'),

  /** Avisos que el proceso principal empuja solo. Devuelve la función para desuscribir. */
  alCambiarEstado: (escucha: (instantanea: unknown) => void) => {
    const envoltorio = (_evento: IpcRendererEvent, instantanea: unknown) => escucha(instantanea)
    ipcRenderer.on('almacen:estado', envoltorio)
    return () => ipcRenderer.removeListener('almacen:estado', envoltorio)
  },
}

contextBridge.exposeInMainWorld('pmcare', api)

export type ApiPmCare = typeof api
