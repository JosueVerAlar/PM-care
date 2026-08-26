# PM-care — instrucciones del repositorio

Léelo entero antes de tocar nada. Manda sobre `~/.claude/CLAUDE.md` donde se contradigan.

## Qué es

App de escritorio macOS para el **seguimiento personal** de ~11 proyectos de un líder
técnico. Un solo usuario, una máquina. **No** es la documentación oficial del equipo: esa
vive en el Jira de `cecyteinformatica`. PM-care no la reemplaza ni la sincroniza.

Sin red, sin base de datos, sin cuentas, sin multiusuario. Los datos son un JSON local.

**Stack:** Electron + Vite + React 19 + TypeScript. Única dependencia de runtime fuera de
eso: **Zod**.

## Vistas

- **Globales:** Panorama · Sprint (transversal a todos los proyectos) · Bloqueos ·
  Terminadas · Backlog del área · Carga por persona · Equipos.
- **De proyecto:** dos paneles. Izquierda, árbol épica → historia → tarea. Derecha, el
  sprint filtrado a ese proyecto. *Terminadas* es una pestaña dentro de la vista, **no** un
  tercer panel.

## Estructura de carpetas

```
electron/            proceso principal y preload (Node)
  principal.ts       ventana, CSP, ciclo de vida
  precarga.ts        API de dominio expuesta al renderer
  almacen/           lectura/escritura del JSON, respaldos, historial
  comandos/          una función por mutación con nombre
src/compartido/      código puro que ven main y renderer
  esquema.ts         esquemas Zod + tipos derivados con z.infer
  derivar.ts         cálculo de estados y avances (funciones puras)
  comandos.ts        nombres y payloads de los comandos
src/                 renderer (React)
  vistas/            una carpeta por vista
  componentes/       reutilizables entre vistas
  estado/            estado de cliente (useState/useReducer, nada más)
pruebas/             vitest; fixtures de oro
docs/                PLAN.md y notas de diseño
```

**Datos** (supuesto vigente, no confirmado por el usuario): `app.getPath('userData')/`
con `datos.json`, `historial.jsonl` y `respaldos/`. Se eligió fuera de `~/Documentos` para
no chocar con el TCC de macOS ni con iCloud Drive. Si el usuario decide otra ruta, se cambia
en un solo lugar.

## Reglas duras — verificables, no negociables

1. **La tarea es la única entidad con estado.** Épicas e historias no persisten `estado`
   ni `porcentaje`. *Verificable:* una prueba estructural falla si esos campos aparecen en
   el JSON de un contenedor.
2. **Contenedor sin tareas → `null`.** Se pinta «sin desglosar». Nunca `0%`, nunca `NaN`,
   nunca `"NaN"`. *Verificable:* `derivar()` sobre una épica vacía devuelve `null`.
3. **Ningún porcentaje se muestra sin su conteo crudo al lado** (`60% · 3 de 5`). Con menos
   de 5 tareas se omite el porcentaje y solo va el conteo. *Verificable:* revisión de vista;
   no hay `%` sin conteo hermano en el DOM.
4. **Verde solo si `estado === 'hecha'`.** Jamás porque el porcentaje redondee a 100.
   *Verificable:* fixture 199/200 en progreso → no verde.
5. **El porcentaje de un padre no es el promedio de sus hijos**: se calcula sobre el
   agregado de sus hojas. *Verificable:* tres historias de 1 tarea con 1 hecha suman 99%,
   no 100%.
6. **Escritura atómica y respaldos existen antes que la primera pantalla que escribe.**
   Temporal hermano + `fsync` + `rename`, respaldos rotativos. *Límite honesto:* Node no
   expone `F_FULLFSYNC`; prometemos «nunca queda a medias», no «sobrevive a un apagón».
7. **`historial.jsonl` append-only desde el día uno**, aunque nada lo grafique todavía.
   Cada evento lleva `proyecto_id` y `origen` **desnormalizados**: si el reporte depende del
   árbol vivo, la historia se reescribe sola al reorganizar algo.
8. **Los sprints cerrados son inmutables.** Ningún comando los modifica.
9. **Las mutaciones van por comandos con nombre** (`moverAlSprint`, `cerrarSprint`,
   `bloquear`, `capturar`). *Verificable:* el renderer nunca envía el documento completo por
   IPC; grep de `enviar(` no debe mostrar payloads del documento entero.
10. **Solo se arrastran tareas.** Nunca épicas ni historias.
11. **Seguridad de Electron:** `contextIsolation: true`, `nodeIntegration: false`,
    `sandbox: true`, **CSP por cabecera** (no solo `<meta>`) con `connect-src 'none'`. La CSP
    relajada solo bajo `!app.isPackaged`. *Verificable:* prueba que lee la cabecera en el
    `.app` empaquetado.
12. **API del preload de dominio, no de sistema de archivos.** `cargar/guardar/restaurar`,
    jamás `leerArchivo(ruta)`.
13. **JSON inválido → modo solo lectura.** La app no escribe nada hasta que el usuario
    decida: qué falló y dónde, restaurar respaldo, abrir en editor, reintentar. Nunca
    arrancar con documento vacío: la primera escritura se comería el archivo recuperable.
14. **Campos desconocidos: `passthrough`, y se conservan al reescribir.** El usuario edita a
    mano y va a poner notas; borrárselas en silencio es traición.
15. **Ids prefijados por proyecto con contador persistido** (`SICOE-T14`). Nunca `MAX+1`:
    recicla ids de cosas borradas y rompe referencias históricas. Mover una historia de
    épica no le cambia el id.
16. **Antes de cada escritura, `stat` del archivo** y comparar con lo último escrito; si
    difiere, no escribir y abrir conflicto. `fs.watch` sobre el **directorio**, no el
    archivo (el rename atómico rompe el watch atado al inodo). Sin merge automático.
17. **Emergente es procedencia, no estado.** Vive en un canal visual distinto (banda
    izquierda + chip), no en el enum de estado.

## Convenciones

- **Todo en español:** nombres de archivos, carpetas, funciones, variables, tipos,
  comentarios y mensajes de commit. Sin `snake_case` en TS; `camelCase` para valores y
  funciones, `PascalCase` para tipos y componentes, `kebab-case` para archivos.
- **Zod es la única fuente de verdad de los tipos.** Se define el esquema y se saca el tipo
  con `z.infer`. Nunca un `interface` mantenido en paralelo a un validador.
- **El mismo esquema valida el archivo y los payloads de IPC.**
- Zod vive en `src/compartido/` y `electron/`. El renderer no importa dependencias nuevas.
- `src/compartido/dominio/derivar.ts` es puro: sin `fs`, sin `ipc`, sin React. Se prueba solo.
- Estados de tarea: `pendiente` · `en_curso` · `hecha` · `cancelada`.
  **`bloqueada` NO es un estado**: es una bandera con historial (`bloqueos[]`) sobre la
  tarea, que conserva su estado propio. Las canceladas se excluyen de todo denominador.
  Estados derivados: `sin_desglosar` · `pendiente` · `en_movimiento` · `hecha`.
  Etiquetas en pantalla de ESTADO: Pendiente · En curso · Hecha · Cancelada ·
  Sin desglosar · En movimiento.
  «Bloqueada» es una etiqueta de BANDERA, no de estado: se muestra **junto** al glifo de
  estado (que sigue diciendo Pendiente o En curso), nunca en su lugar. Una tarea bloqueada
  conserva su avance propio; si el bloqueo reemplazara el estado, al desbloquear no se
  sabría a qué volver.
- Definición ejecutable de **en movimiento**:
  `hojas > 0 && (hechas + en_curso) > 0 && hechas < hojas`.
- Botón de captura: **«Capturar»**, no «Agregar».
- Mensajes de commit con la decisión dentro:
  `feat: E3 — escritura atómica con respaldos rotativos (regla 6)`.

## Prohibido

- **Persistir cualquier valor derivado.** Estado, porcentaje o conteo de un contenedor.
- **Mandar el documento completo por IPC** en cualquier dirección de escritura.
- **Añadir dependencias sin justificarlas por escrito** contra lo que ya existe. Nada de
  librerías de UI, de estado global, de rutas ni de gráficas. Única excepción admisible: una
  librería de arrastre accesible, y se decide con argumentos en su etapa (E7).
- **Inventar porcentajes**: `0%` para lo vacío, promediar hijos, o pintar verde por
  redondeo.
- **Reparar el JSON automáticamente** o descartar campos desconocidos.
- **Métricas de adorno:** índice de salud 0-100, burndown, velocidad o fecha estimada de
  término en v1. Sin estimaciones ni serie histórica, es inventar.
- Tocar archivos fuera del alcance de tu etapa. Hay agentes trabajando en paralelo.

## Cómo se corre

```
npm run dev        # Vite + Electron en desarrollo
npm test           # vitest
npm run empaquetar # genera el .app (E12)
```

Verifica siempre contra el `package.json` real: estos nombres son la convención acordada,
no una promesa de que ya existan. **Pide autorización explícita antes de instalar paquetes.**

El plan de trabajo y el estado de cada etapa están en `docs/PLAN.md`. No empieces una etapa
sin que su predecesora esté marcada como terminada.
