import { app, BrowserWindow, session, shell, nativeTheme } from 'electron'
import path from 'node:path'
import { directorioDeDatos, rutasEn } from '../src/principal/almacen/rutas'
import { Repositorio } from '../src/principal/almacen/repositorio'
import { registrarManejadores } from '../src/principal/ipc/manejadores'

let repositorio: Repositorio | null = null
/** Se pone en true la primera vez que `before-quit` fuerza el vaciado de la cola. */
let cerrando = false

const urlDesarrollo = process.env.VITE_DEV_SERVER_URL
const enDesarrollo = !app.isPackaged

/**
 * CSP por cabecera, no por <meta>: la cabecera es la que de verdad manda.
 * `connect-src 'none'` es lo que garantiza que la app nunca habla con la red.
 * En desarrollo hay que relajarla para el recargado en caliente de Vite; la
 * prueba de empaquetado verifica que la estricta es la que llega al .app.
 */
function politicaDeContenido(): string {
  if (enDesarrollo) {
    return [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data:",
      "connect-src 'self' ws://localhost:5173 http://localhost:5173",
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

void app.whenReady().then(async () => {
  session.defaultSession.webRequest.onHeadersReceived((detalles, responder) => {
    responder({
      responseHeaders: {
        ...detalles.responseHeaders,
        'Content-Security-Policy': [politicaDeContenido()],
      },
    })
  })

  repositorio = new Repositorio(rutasEn(directorioDeDatos(app.getPath('userData'))))
  registrarManejadores({
    repositorio,
    ventanas: () => BrowserWindow.getAllWindows(),
  })
  // Abrir antes de la ventana: si el archivo está roto, la interfaz nace ya en modo
  // solo lectura en vez de parpadear entre estados.
  await repositorio.abrir()

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
