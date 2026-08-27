import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  session,
  shell,
  nativeTheme,
  type MenuItemConstructorOptions,
} from 'electron'
import path from 'node:path'

import { directorioDeDatos, rutasEn } from '../src/principal/almacen/rutas'
import { Repositorio } from '../src/principal/almacen/repositorio'
import { registrarManejadores } from '../src/principal/ipc/manejadores'

let repositorio: Repositorio | null = null
/** Se pone en true la primera vez que `before-quit` fuerza el vaciado de la cola. */
let cerrando = false

/**
 * Estado del ítem Edición ▸ Deshacer, tal y como lo publica el renderer.
 *
 * Los canales se escriben a mano aquí y en el preload por la misma razón que los del
 * almacén: con `sandbox: true` el preload no puede importar un módulo de constantes.
 */
const CANAL_ESTADO_DESHACER = 'menu:estado-deshacer'
const CANAL_DESHACER = 'menu:deshacer'

let deshacerVivo = false
let deshacerEtiqueta: string | null = null

const urlDesarrollo
 = process.env.VITE_DEV_SERVER_URL
const enDesarrollo = !app.isPackaged

/**
 * CSP por cabecera, no por <meta>: la cabecera es la que de verdad manda.
 * `connect-src 'none'` es lo que garantiza que la app nunca habla con la red.
 * En desarrollo hay que relajarla para el recargado en caliente de Vite; la
 * prueba de empaquetado verifica que la estricta es la que llega al .app.
 */
function politicaDeContenido(): string {
  if (enDesarrollo) {
    // El origen sale de la URL real del servidor de Vite (5190 en este proyecto, no el
    // 5173 por omisión). Escrito a mano, el día que cambia el puerto la CSP bloquea el
    // recargado en caliente y parece un bug del código.
    const origen = urlDesarrollo ? new URL(urlDesarrollo).origin : 'http://localhost:5190'
    const socket = origen.replace(/^http/, 'ws')
    return [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data:",
      `connect-src 'self' ${origen} ${socket}`,
    ].join('; ')
  }
  return [
    "default-src 'none'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'none'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join('; ')
}

/**
 * EL MENÚ DE APLICACIÓN (E13).
 *
 * Hasta ahora no se llamaba a `Menu.setApplicationMenu` en ninguna parte, así que Electron
 * montaba su menú por omisión, cuyo **Edición ▸ Deshacer** es un `role: 'undo'`: el
 * deshacer del campo de texto enfocado, no el comando de dominio. Había dos «Deshacer» y
 * el que ocupaba el sitio canónico de macOS hacía otra cosa.
 *
 * Tres decisiones dentro:
 *
 * 1. **El acelerador se PINTA pero no se REGISTRA** (`registerAccelerator: false`). Si el
 *    menú se quedara con `⌘Z`, la tecla dejaría de llegar al renderer y se perdería la
 *    excepción que ya está resuelta en `atajos.ts`: dentro de un campo de texto, `⌘Z` es
 *    el deshacer de lo que se está tecleando y tiene que seguir siéndolo. Así el menú
 *    enseña el atajo —que es lo que pide la guía de interfaz humana— y la tecla la sigue
 *    atendiendo quien sabe distinguir los dos casos.
 * 2. **Se deshabilita, no se esconde.** Un ítem en gris enseña que la función existe; uno
 *    que desaparece no enseña nada.
 * 3. **Cortar/Copiar/Pegar se quedan** con sus roles nativos: los campos de texto de la
 *    app los necesitan, y son justo lo que se perdería al dejar de usar el menú por
 *    omisión.
 */
function construirMenu(): void {
  const edicion: MenuItemConstructorOptions[] = [
    {
      // El nombre de lo que se va a revertir, no «Deshacer» a secas: sin objeto, el ítem
      // no deja predecir qué va a pasar. La etiqueta la publica el renderer.
      label: deshacerEtiqueta === null ? 'Deshacer' : `Deshacer ${deshacerEtiqueta}`,
      accelerator: 'CmdOrCtrl+Z',
      registerAccelerator: false,
      enabled: deshacerVivo,
      click: () => {
        // `BrowserWindow`, no la ventana que llega al `click`: esa está tipada como
        // `BaseWindow` y no tiene `webContents`.
        const destino = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
        if (destino && !destino.isDestroyed()) destino.webContents.send(CANAL_DESHACER)
      },

    },
    { type: 'separator' },
    { role: 'cut', label: 'Cortar' },
    { role: 'copy', label: 'Copiar' },
    { role: 'paste', label: 'Pegar' },
    { role: 'selectAll', label: 'Seleccionar todo' },
  ]

  const plantilla: MenuItemConstructorOptions[] = [
    { role: 'appMenu' },
    { label: 'Edición', submenu: edicion },
    // Las herramientas de desarrollo no viajan al `.app`: ahí Ver es solo el zoom y la
    // pantalla completa.
    enDesarrollo
      ? { role: 'viewMenu' }
      : {
          label: 'Ver',
          submenu: [
            { role: 'resetZoom', label: 'Tamaño real' },
            { role: 'zoomIn', label: 'Acercar' },
            { role: 'zoomOut', label: 'Alejar' },
            { type: 'separator' },
            { role: 'togglefullscreen', label: 'Pantalla completa' },
          ],
        },
    { role: 'windowMenu' },
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(plantilla))
}

function crearVentana(): void {

  const ventana = new BrowserWindow({
    width: 1512,
    height: 950,
    minWidth: 900,
    minHeight: 600,
    title: 'PM-care',
    // Sin esto hay un destello blanco al abrir en tema oscuro.
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#0E1216' : '#F4F6F8',
    titleBarStyle: 'hiddenInset',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  })

  ventana.once('ready-to-show', () => ventana.show())

  if (urlDesarrollo) {
    void ventana.loadURL(urlDesarrollo)
  } else {
    void ventana.loadFile(path.join(__dirname, '../renderer/index.html'))
  }

  // Un enlace pegado en el título de una tarea no puede navegar la ventana.
  ventana.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https:') || url.startsWith('mailto:')) void shell.openExternal(url)
    return { action: 'deny' }
  })
  ventana.webContents.on('will-navigate', (evento, url) => {
    if (url !== ventana.webContents.getURL()) evento.preventDefault()
  })
}

/** Códigos de `fs` que significan «no te dejo», incluido el «denegar» del diálogo de macOS. */
function esFalloDePermiso(error: unknown): boolean {
  const codigo = (error as { code?: string } | null)?.code
  return codigo === 'EPERM' || codigo === 'EACCES' || codigo === 'EROFS'
}

/**
 * El único mensaje de error que el usuario puede ver antes de que exista una ventana.
 * Va en cristiano y con los pasos exactos: aquí no hay interfaz donde reintentar, así
 * que si el texto no basta, el usuario se queda sin app y sin saber por qué.
 */
function explicarFalloDeCarpeta(directorio: string, error: unknown): void {
  const detalleTecnico = error instanceof Error ? error.message : String(error)
  const porVariable = process.env.PMCARE_DIRECTORIO_DATOS?.trim()
    ? `Esa carpeta viene de la variable PMCARE_DIRECTORIO_DATOS. Si la quitas, PM-care vuelve a usar su carpeta propia dentro de tu Biblioteca, que no pide permisos.`
    : `Esa es la carpeta propia de PM-care dentro de tu Biblioteca.`

  const permiso = esFalloDePermiso(error)

  const detalle = permiso
    ? [
        `macOS no le dio permiso a PM-care para escribir en:`,
        directorio,
        ``,
        `Sin esa carpeta la app no puede guardar nada. Preferimos no abrir a abrir y perder lo que escribas.`,
        ``,
        `Cómo darle permiso:`,
        `1. Abre Ajustes del Sistema › Privacidad y seguridad › Archivos y carpetas.`,
        `2. Busca PM-care en la lista y activa la carpeta de arriba.`,
        `3. Vuelve a abrir PM-care.`,
        ``,
        porVariable,
        ``,
        `Detalle técnico: ${detalleTecnico}`,
      ].join('\n')
    : [
        `PM-care no pudo preparar su carpeta de datos:`,
        directorio,
        ``,
        `Qué suele ser: la ruta apunta a un disco que no está conectado, a una carpeta de iCloud que aún no se ha descargado, o el disco está lleno.`,
        ``,
        porVariable,
        ``,
        `Detalle técnico: ${detalleTecnico}`,
      ].join('\n')

  const botones = permiso ? ['Abrir Ajustes de Privacidad', 'Salir'] : ['Salir']
  // Sin ventana propia, el diálogo puede nacer detrás de lo que el usuario tenga abierto:
  // un error que no se ve es un arranque que no pasó nada.
  app.focus({ steal: true })
  const elegido = dialog.showMessageBoxSync({
    type: 'error',
    title: 'PM-care no pudo abrir su carpeta de datos',
    message: 'PM-care no pudo abrir su carpeta de datos',
    detail: detalle,
    buttons: botones,
    defaultId: 0,
    cancelId: botones.length - 1,
  })

  if (permiso && elegido === 0) {
    // Enlace local del sistema, no red: abre el panel exacto, no los Ajustes a secas.
    void shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_FilesAndFolders')
  }
}

void app.whenReady().then(async () => {
  session.defaultSession.webRequest.onHeadersReceived((detalles, responder) => {
    responder({
      responseHeaders: {
        ...detalles.responseHeaders,
        'Content-Security-Policy': [politicaDeContenido()],
      },
    })
  })

  // El renderer es el único que sabe si queda algo que deshacer y cómo se llamaba. El
  // menú se reconstruye solo cuando alguno de los dos cambia: rehacerlo en cada tecla
  // haría parpadear la barra de menús de macOS.
  ipcMain.on(CANAL_ESTADO_DESHACER, (_evento, dato: unknown) => {
    const estado = dato as { puede?: unknown; etiqueta?: unknown } | null
    const puede = estado?.puede === true
    const etiqueta = typeof estado?.etiqueta === 'string' && estado.etiqueta !== '' ? estado.etiqueta : null
    if (puede === deshacerVivo && etiqueta === deshacerEtiqueta) return
    deshacerVivo = puede
    deshacerEtiqueta = etiqueta
    construirMenu()
  })

  construirMenu()

  const directorio = directorioDeDatos(app.getPath('userData'))

  repositorio = new Repositorio(rutasEn(directorio))
  registrarManejadores({
    repositorio,
    ventanas: () => BrowserWindow.getAllWindows(),
  })
  // Abrir antes de la ventana: si el archivo está roto, la interfaz nace ya en modo
  // solo lectura en vez de parpadear entre estados.
  //
  // Un archivo ilegible NO llega aquí como excepción: el repositorio lo convierte en
  // diagnóstico y la app abre en solo lectura. Lo que sí revienta es no poder ni crear
  // la carpeta —macOS niega el acceso, el disco de la variable de entorno no está
  // montado—, y eso hay que atajarlo: sin este `catch` la promesa se rompe sin dueño, la
  // ventana nunca se crea y el usuario ve la app rebotar en el Dock y desaparecer sin un
  // solo mensaje. Es el primer minuto de uso; ahí se decide si la vuelve a abrir.
  try {
    await repositorio.abrir()
  } catch (error) {
    explicarFalloDeCarpeta(directorio, error)
    app.exit(1)
    return
  }

  crearVentana()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) crearVentana()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

/**
 * Aquí es donde de verdad se pierden datos: macOS mata el proceso con la escritura en
 * vuelo. Se frena la salida hasta vaciar la cola, y solo entonces se sale.
 */
app.on('before-quit', (evento) => {
  if (cerrando || !repositorio) return
  evento.preventDefault()
  cerrando = true
  void repositorio.cerrar().finally(() => app.exit(0))
})
