# PM-care

App de escritorio para macOS con la que sigues tus proyectos: el árbol de cada uno
(épica → historia → tarea), el sprint de la semana, lo que está bloqueado y quién trae
cuánta carga.

Es tuya y solo tuya: **no habla con la red, no tiene cuentas y no sincroniza con Jira**.
Todo vive en un archivo JSON en tu Mac. La red está bloqueada por la propia app, no por
buena voluntad: la política de contenido del paquete lleva `connect-src 'none'` y
cualquier intento de salir a internet se corta.

---

## Instalar

Necesitas un Mac con Apple Silicon y macOS 13 o posterior.

1. Genera la app:

   ```
   npm install          # solo la primera vez
   npm run empaquetar
   ```

   Tarda menos de un minuto y deja `empaquetado/mac-arm64/PM-care.app` (unos 300 MB: casi
   todo es el motor de Chromium que va dentro).

2. Arrastra `PM-care.app` a la carpeta **Aplicaciones**.

3. Doble clic. Abre.

## La primera vez que la abres

**Si la app la construiste en este mismo Mac** (el caso normal), no pasa nada especial:
doble clic y abre. macOS **no** te pide ningún permiso, porque los datos viven dentro de
tu Biblioteca y esa carpeta no está protegida.

**Si copiaste el `.app` desde otro Mac** —AirDrop, un ZIP, una descarga— macOS le pone una
marca de cuarentena y avisa antes de abrirla. PM-care lleva **firma ad hoc**: se firma a sí
misma, sin cuenta de desarrollador de Apple (cuesta 99 USD al año y no se ha pedido). Con
eso el sistema no puede decir *quién* la hizo, pero sí comprueba que **el paquete está
íntegro**, que es la diferencia entre que te la presente como «de un desarrollador no
identificado» y que te diga que **está dañada**.

Dos salidas, en orden:

1. **Clic derecho sobre la app → Abrir**, y confirmar. Es el camino normal para una app sin
   notarizar, y basta con hacerlo una vez.
2. Si aun así no abre, una línea de Terminal quita la marca:

```
xattr -dr com.apple.quarantine /Applications/PM-care.app
```

Verificado en esta máquina: la app construida aquí **abre con doble clic sin ningún
diálogo** —no lleva marca de cuarentena—, y una copia con la marca puesta pasa la
comprobación de integridad (`codesign --verify` en verde). Lo que macOS rechaza es su
procedencia, no el paquete.

## Dónde viven tus datos

Por omisión, aquí:

```
~/Library/Application Support/PM-care/
    datos.json         ← todo tu tablero
    historial.jsonl    ← una línea por cada cambio, en orden
    respaldos/         ← copias automáticas
```

Es una carpeta oculta a propósito: **macOS nunca te pide permiso para escribir ahí** y
iCloud no la toca. El primer arranque crea los tres solo, sin preguntar nada.

Para llegar a ella desde Finder: menú **Ir › Ir a la carpeta…** y pega la ruta. Desde la
app, cuando algo falla, el botón **Mostrar en Finder** te lleva directo.

### PM-care no toca ninguna otra carpeta tuya

**Decidido el 2026-08-27: la app es independiente de tus carpetas.** No escribe en
Documentos, ni en Escritorio, ni en Descargas; no sincroniza con nada; no abre diálogos de
guardar ni de importar. Todo lo que crea vive dentro de la carpeta de arriba, y por eso el
primer arranque no te pide un solo permiso de macOS.

Existe una variable `PMCARE_DIRECTORIO_DATOS` que apunta el almacén a otro directorio,
pero **no es una opción de uso diario**: está ahí para que las pruebas corran sobre una
carpeta temporal y para mover el almacén a mano si algún día hiciera falta. La interfaz no
la ofrece y no hay razón para tocarla. Si la usas, ten en cuenta dos cosas: `launchctl
setenv` se borra al reiniciar el Mac (la app volvería a mirar la carpeta por omisión y
verías un tablero vacío, aunque tus datos sigan donde los dejaste), y PM-care **no se
lleva nada consigo** — tendrías que copiar `datos.json`, `historial.jsonl` y `respaldos/`
tú mismo antes de abrirla.

Para respaldar, copia la carpeta entera; no hace falta mover nada de sitio.

## Respaldar

La app se respalda sola: guarda una copia **por sesión** y una **por día** en
`respaldos/`, siempre copiando un archivo que ya estaba completo, nunca uno a medias.
Eso te cubre de un error tuyo o de un cierre a destiempo — **no de perder el Mac**.

Para eso, copia la carpeta entera de vez en cuando:

```
cp -R ~/Library/Application\ Support/PM-care ~/Documentos/respaldo-pmcare-$(date +%F)
```

Un archivo de 11 proyectos pesa decenas de kilobytes: cabe en cualquier lado y se puede
versionar con git sin pensarlo.

## Si el archivo se rompe

PM-care **nunca repara el JSON sola y nunca escribe encima de un archivo que no entiende**.
En cuanto detecta algo raro entra en **modo solo lectura**, te dice qué falló y dónde, y te
deja cuatro salidas:

| Botón | Para qué |
|---|---|
| **Reintentar** | Relee el archivo. Es lo que pulsas después de arreglarlo a mano. |
| **Ver respaldos** | Lista las copias y te deja restaurar una. Antes de restaurar, guarda el archivo roto como `corrupto-*`: restaurar nunca destruye lo que querías salvar. |
| **Abrir en el editor** | Abre el `datos.json` para que lo veas. |
| **Mostrar en Finder** | Para copiarlo o mandárselo a alguien. |

Lo mismo pasa si editaste el archivo a mano con la app abierta: PM-care se da cuenta, deja
de escribir para no pisarte y te pregunta con qué versión te quedas. **Nunca mezcla las dos
solo.**

Y si le pusiste notas propias a mano dentro del JSON, se conservan: los campos que la app
no conoce se reescriben tal cual.

## Correr en desarrollo

```
npm run dev          # Vite (puerto 5190) + Electron, con recarga en caliente
npm test             # las pruebas
npm run tipos        # TypeScript sin emitir
npm run empaquetar   # genera el .app
```

Tres cosas que ahorran una tarde:

- **`ELECTRON_RUN_AS_NODE`.** Si tu shell exporta esa variable, Electron arranca como Node
  puro: **muere sin mensaje y con código de salida cero**. Los scripts la limpian con
  `env -u`; si invocas `electron` a mano, hazlo igual.
- **En desarrollo la app usa la misma carpeta de datos que la app instalada** (el disco no
  distingue mayúsculas, así que `pm-care` y `PM-care` son la misma). No corras `npm run dev`
  con la app abierta: son dos procesos escribiendo el mismo archivo y saltará el aviso de
  conflicto. Para trabajar sin riesgo, apunta el desarrollo a otro lado:
  `PMCARE_DIRECTORIO_DATOS=/tmp/pmcare-dev npm run dev`.
- El proceso principal se compila a **CommonJS**. El módulo `electron` no ofrece exports con
  nombre para ESM: con `import { app }` la app muere al arrancar.

Las reglas del proyecto —las que no se negocian— están en `CLAUDE.md`. El plan por etapas y
la bitácora, en `docs/PLAN.md`.
