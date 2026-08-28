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

- **Globales**, en cuatro grupos de la lateral nombrados por lo que se hace en ellos:
  **Hoy** (Panorama · Sprint · Bloqueos) · **Proyectos** (la lista, con su `＋`) ·
  **Registro** (Terminadas · Backlog del área · Tiempos) · **Gente** (Carga por persona ·
  Equipos · Personas). No existe un grupo «Administración»: nombraba una categoría, no un
  contenido. **Equipos existe UNA vez** y esa única pantalla muestra y edita.
- **De proyecto:** dos paneles. Izquierda, árbol épica → historia → tarea, con los niveles
  que el proyecto tenga (ver regla 18). Derecha, el sprint filtrado a ese proyecto.
  *Terminadas* es una pestaña dentro de la vista, **no** un tercer panel.

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
   **Y lo que no está desglosado tampoco se declara terminado:** un contenedor con un
   descendiente sin desglosar nunca es `hecha`, aunque todas sus tareas lo estén. Es la
   misma mentira que el `0%`: una historia sin tareas no dice que no haya trabajo, dice que
   nadie lo ha desglosado todavía, y el verde esconde justo lo que falta planear. `Avance`
   lleva `contenedoresSinDesglosar` (historias sin tareas; para un proyecto, además épicas
   sin historias) y la vista lo escribe al lado: «6/6 · 1 sin desglosar». Negar el verde sin
   decir por qué sería peor que el defecto. Una historia cuyas tareas están todas canceladas
   sí se desglosó —se descartó el trabajo— y no cuenta. *Verificable:* una épica con 6 de 6
   hechas y una historia vacía da `en_movimiento` y `contenedoresSinDesglosar === 1`.
3. **Ningún porcentaje se muestra sin su conteo crudo al lado** (`60% · 3 de 5`). Con menos
   de 5 tareas se omite el porcentaje y solo va el conteo. *Verificable:* revisión de vista;
   no hay `%` sin conteo hermano en el DOM.
4. **Verde solo si `estado === 'done'`.** Jamás porque el porcentaje redondee a 100, y
   jamás con `terminado`: eso es «entregado, sin aceptar todavía».
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
10. **Dos arrastres distintos, y no se mezclan.**
    - **Al sprint solo se arrastran tareas.** Nunca épicas ni historias: los tres campos del
      compromiso (quién, para cuándo, qué) solo tienen sentido en algo ejecutable. Para
      mandar una historia entera hay un botón que envía sus tareas en lote.
    - **Dentro del árbol se reordenan épicas, historias y tareas**, cada una entre sus
      hermanas. Mover una épica se lleva **toda su rama** por construcción: es un elemento
      del arreglo y sus historias cuelgan de ella. Esa garantía es lo que el usuario pidió y
      no puede romperse por ninguna optimización que aplane el árbol.
    - Reordenar **no cambia ningún hecho**: ni ids, ni estados, ni items de sprint, ni marcas
      de tiempo. Por eso no cuenta como movimiento del proyecto.
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
18. **La jerarquía es opcional (N9).** Una tarea cuelga de una historia, de una épica **o
    del proyecto**. Épica e historia organizan; no son requisitos. Prohibido inventar una
    épica «General» para que un proyecto de trabajo continuo quepa en tres niveles.
    - **Toda LECTURA de las tareas de un nodo pasa por `tareasDe(nodo)`**
      (`compartido/dominio/derivar.ts`). Son tres listas, y una función que recuerde dos de
      las tres deja de contar en silencio, sin fallar y sin avisar: un proyecto de trabajo
      continuo se vería vacío. El único que **muta** los arreglos es el reductor, que para
      eso localiza el `contenedor` de la tarea. *Verificable:*
      `tests/modelo/acceso-tareas.test.ts` lee el código fuente y falla si aparece un
      acceso directo fuera de su lista de excepciones, cada una con su motivo escrito.
    - El árbol pinta las tres formas: la tarea va al nivel 3 bajo una historia, al 2 bajo
      una épica y al 1 colgada del proyecto. **Dentro de un contenedor va antes lo que
      agrupa y después lo suelto**, como carpetas antes que archivos.
    - `crearTarea` y `reordenarTarea` reciben `contenedorId`, que puede ser el id de una
      historia, el de una épica o la CLAVE del proyecto. No existe un `historiaId`.
    - `UbicacionTarea.epica` y `.historia` son `Epica | null`. La migaja omite los niveles
      que no existen; nunca los rellena con «—».
    - **El id sale siempre del proyecto raíz, nunca del padre inmediato.** Por eso mover
      una tarea de una historia al proyecto no la renumera y ninguna referencia del
      historial se rompe. *Verificable:* `siguienteId` recibe la clave del proyecto y sus
      contadores; no existe una variante por padre.

19. **Cada acción de una fila vive en su menú `⋯`, con su tecla al lado.** Techo duro de
    OCHO ítems: el noveno significa que se añadió una función que nadie pidió. **Con cinco
    estados el pipeline ya no cabe en la fila**: el menú conserva un solo `Avanzar`
    (Espacio, sin ciclo), y elegir un estado concreto vive en el tablero por equipo y en el
    detalle de la tarea — que es justamente lo que le da al tablero su razón de ser. Su nombre
    accesible es específico («Acciones de SICOE-104», nunca «Más»), lo destructivo va al
    fondo y en su propio grupo, y los verbos nombran lo que va a pasar («Marcar en curso»,
    no «Cambiar estado»). **El menú y el teclado comparten implementación**: no hay dos
    caminos que hagan «lo mismo» por rutas distintas.
20. **Ningún control que ejecuta una acción se esconde tras el hover.** El menú puede estar
    cerrado; su puerta, no. Lo que sí puede aparecer al pasar el ratón es lo que solo se
    LEE (la clave de la fila), porque no hay nada que descubrir.
21. **El reloj de resolución son TRAMOS de trabajo, no `fin − inicio`.** La tarea guarda
    `trabajo: { desde, hasta | null, estado }[]`, mismo patrón que `bloqueos[]`. Corre
    mientras la tarea está en marcha, **se detiene al llegar a `terminado`**, y **se reanuda
    si vuelve a desarrollo** — puede pasar varias veces. La duración es la SUMA de los
    tramos, nunca la resta de dos fechas.
    - **El tramo guarda su estado** para no tener que decidir hoy si el reloj corre en
      `en_pruebas`: con el dato dentro, las dos lecturas se derivan y no hace falta migrar
      el día que se decida.
    - **Un tramo abierto que nadie cierra crece para siempre.** Una tarea olvidada en
      `iniciado` tres meses diría «tres meses de trabajo», que es la misma mentira de
      calendario que todo esto existe para evitar. Por encima del umbral no entra a ningún
      promedio: se muestra «corriendo desde hace 12 días».
    - Se llama **«tiempo en desarrollo»**, nunca «horas trabajadas». En días con un decimal.
    - **La duración ya NO depende del sprint.** Con eso mueren los tres defectos que ese
      anclaje produjo, y una tarea cerrada fuera de todo sprint **sí** tiene duración.
    - **Ningún promedio de menos de 5 tareas se muestra** (`MINIMO_TAREAS_PARA_PROMEDIO`).
      Ahí va el conteo crudo y nada más.
    - `aceptada_en` marca el `done`. `terminada_en` NO existe como campo: es el `hasta` del
      último tramo cerrado, y un campo que puede contradecir a los tramos es un campo que
      algún día los contradice.
22. **Hay DOS confirmaciones en la app, y solo dos.** Borrar un contenedor con hijos, y
    **sacar una tarea del sprint**. La segunda se admite porque tiene una consecuencia
    invisible sobre datos que el usuario tecleó a mano —responsable, fecha, descripción— y
    porque el propio usuario la pidió. Una tercera exige la misma discusión que costó esta.
23. **`esfuerzo` es Fibonacci `1·2·3·5·8` o `null`, y `null` es lo NORMAL.** Ninguna suma
    de esfuerzo se muestra sin cuántas tareas la componen y cuántas no están estimadas:
    «34 pts · 12 de 18 tareas», nunca «34 pts». Es la misma mentira que el `0%`.
    Prohibido convertir esto en pronóstico: describe lo que pasó, no promete fechas.

## Convenciones

- **Todo en español:** nombres de archivos, carpetas, funciones, variables, tipos,
  comentarios y mensajes de commit. Sin `snake_case` en TS; `camelCase` para valores y
  funciones, `PascalCase` para tipos y componentes, `kebab-case` para archivos.
- **Zod es la única fuente de verdad de los tipos.** Se define el esquema y se saca el tipo
  con `z.infer`. Nunca un `interface` mantenido en paralelo a un validador.
- **El mismo esquema valida el archivo y los payloads de IPC.**
- Zod vive en `src/compartido/` y `electron/`. El renderer no importa dependencias nuevas.
- `src/compartido/dominio/derivar.ts` es puro: sin `fs`, sin `ipc`, sin React. Se prueba solo.
- Estados de tarea: `pendiente` · `iniciado` · `en_pruebas` · `terminado` · `done` ·
  `cancelada`. **Cinco del flujo más `cancelada`, que no es un paso sino salirse de él.**
  `terminado` y `done` NO son sinónimos: los marcan dos personas distintas — `terminado` es
  «lo entregué», `done` es «lo revisé y lo acepto». **El avance se mide contra `done`**: un
  porcentaje que sube cuando el ejecutor dice que acabó, y no cuando quien acepta lo acepta,
  es el número inflado que esta app existe para no dar.
  **`bloqueada` NO es un estado**: es una bandera con historial (`bloqueos[]`) sobre la
  tarea, que conserva su estado propio. Las canceladas se excluyen de todo denominador.
  Estados derivados de un CONTENEDOR: `sin_desglosar` · `pendiente` · `en_movimiento` ·
  `hecha`. Son cuatro y siguen siendo cuatro: describen una épica o una historia, no el
  pipeline de una tarea.
  Etiquetas en pantalla de ESTADO: Pendiente · Iniciado · En pruebas · Terminado · Done ·
  Cancelada · Sin desglosar · En movimiento.
  «Bloqueada» es una etiqueta de BANDERA, no de estado: se muestra **junto** al glifo de
  estado (que sigue diciendo el suyo), nunca en su lugar. En el tablero por equipo la
  columna «Bloqueada» se DERIVA de la bandera; el enum de estado no crece por ella. Una tarea bloqueada
  conserva su avance propio; si el bloqueo reemplazara el estado, al desbloquear no se
  sabría a qué volver.
- Definición ejecutable de **en movimiento**:
  `hojas > 0 && enMarcha > 0 && (aceptadas < hojas || contenedoresSinDesglosar > 0)`, donde
  `enMarcha` es todo lo que salió de `pendiente` sin cancelarse. El segundo término es la
  regla 2: 6 de 6 aceptadas con una historia sin abrir sigue en movimiento. Los cuatro
  estados derivados no cambian — no hay un quinto para «terminada hasta donde está
  planeada», porque el conteo lo dice mejor que un color.
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
npm run tipos      # los tres tsconfig
npm run empaquetar # genera el .app (E12)
```

Las pruebas de interfaz viven en `tests/interfaz/` y piden su DOM archivo por archivo con
`// @vitest-environment jsdom` en la primera línea. **No se configura globalmente:** las
~900 de dominio corren en Node en dos segundos y levantarles un DOM las haría lentas sin
ganar nada. Dependencias de desarrollo autorizadas para esto: `jsdom` y
`@testing-library/react`; no tocan el paquete ni el runtime.

Verifica siempre contra el `package.json` real: estos nombres son la convención acordada,
no una promesa de que ya existan. **Pide autorización explícita antes de instalar paquetes.**

El plan de trabajo y el estado de cada etapa están en `docs/PLAN.md`. No empieces una etapa
sin que su predecesora esté marcada como terminada.
