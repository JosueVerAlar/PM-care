# PM-care — plan de etapas

Tablero de seguimiento. **Se edita conforme avanzamos:** cambia la casilla de estado y añade
una línea en Bitácora. No borres etapas terminadas.

Estados: `⬜ pendiente` · `🟡 en curso` · `✅ terminada`

**Objetivo del proyecto:** que el usuario abra una app propia y vea, sin capturar nada dos
veces, a cuál de sus ~11 proyectos le tiene que meter mano hoy.

---

## Resumen

| # | Etapa | Agente | Depende de | Tamaño | Estado |
|---|---|---|---|---|---|
| E0 | Maqueta estática | `diseno` | — | Pequeño | ⬜ |
| E1 | Andamio + app de humo | `infra` | — | Pequeño | ⬜ |
| E2 | Modelo de datos | `arquitecto` + `backend` | E1 | Mediano | ⬜ |
| E3 | Almacén e integridad | `backend` | E2 | Grande | ⬜ |
| E4 | Cálculo derivado | `backend` + `qa` | E2 | Mediano | ⬜ |
| E5 | Puente IPC | `backend` + `seguridad` | E3, E4 | Mediano | ⬜ |
| E6 | **Árbol y sprint en solo lectura (HITO)** | `frontend` | E5, E0 | Grande | ⬜ |
| E7 | Arrastre, captura y edición | `frontend` | E6 | Grande | ⬜ |
| E8 | Cierre de sprint | `backend` + `frontend` | E7 | Mediano | ⬜ |
| E9 | Bloqueos | `backend` + `frontend` | E7 | Mediano | ⬜ |
| E10 | Terminadas, Panorama y Backlog del área | `frontend` + `data` | E7 | Grande | ⬜ |
| E11 | Carga por persona y Equipos | `frontend` + `data` | E7 | Mediano | ⬜ |
| E12 | Empaquetado | `infra` | E8–E11 | Mediano | ⬜ |
| E13 | Uso real | usuario + `pm` | E12 | — | ⬜ |

**Camino crítico:** E1 → E2 → E3 → E5 → E6 → E7 → E8 → E12 → E13.
Todo retraso ahí retrasa el proyecto. E2 es el cuello de botella: cinco etapas la esperan.

**Corre en paralelo:**
- E0 con E1 y E2 (no depende de código, solo de los datos reales de SICOE).
- E4 con E3, en cuanto E2 cierre. Es pura, no toca disco.
- E9, E10 y E11 entre sí, en cuanto E7 cierre. Tres frentes independientes.
- E12 puede prepararse (firma, íconos, `electron-builder`) durante E9–E11; solo su
  verificación final espera.

**Por qué este orden y no otro:** primero lo que puede invalidar el diseño entero (que la
CSP estricta y el `sandbox: true` dejen funcionar la app, E1) y lo que es irreversible
(perder datos del usuario, E3). El árbol bonito es lo último que puede tumbar el proyecto,
por eso no va primero aunque sea lo que más se ve.

---

## E0 · Maqueta estática
**Estado:** ⬜ pendiente · **Agente:** `diseno` · **Depende de:** nada · **Tamaño:** pequeño

**Entrega:** una página HTML estática, sin React ni build, con la vista de proyecto a dos
paneles y ~60 filas usando los títulos reales de `docs/datos-reales-sicoe.md`. Paleta,
tipografía, densidad, glifos de estado y banda de procedencia, en tema claro y oscuro.

**Terminado cuando:** se abre en Safari en macOS en ambos temas; los títulos de 65
caracteres (el máximo real) no se truncan de forma ilegible; el contraste de cada par
texto/fondo pasa WCAG AA y los cuatro glifos de estado se distinguen en deuteranopía. Media
hora de trabajo que cambia decisiones de E6.

---

## E1 · Andamio + app de humo
**Estado:** ⬜ pendiente · **Agente:** `infra` · **Depende de:** nada · **Tamaño:** pequeño

**Entrega:** `package.json`, Vite, TypeScript, `electron/principal.ts`, `electron/precarga.ts`,
vitest configurado. Una ventana que dice «PM-care» y la versión.

**Terminado cuando:** `npm run dev` abre la ventana; `contextIsolation`, `nodeIntegration:false`
y `sandbox:true` están activos y la app **igual funciona**; la CSP se sirve por cabecera con
`connect-src 'none'`; `npm test` corre con al menos una prueba trivial verde.

**Por qué va primero:** si `sandbox: true` rompiera el preload, todo el diseño de E5 cambia.
Descubrirlo aquí cuesta una hora; descubrirlo en E5 cuesta una etapa.

---

## E2 · Modelo de datos
**Estado:** ⬜ pendiente · **Agente:** `arquitecto` + `backend` · **Depende de:** E1 · **Tamaño:** mediano

**Entrega:** `compartido/esquema.ts` con los esquemas Zod de proyecto, épica, historia, tarea,
sprint, bloqueo, persona/equipo y el documento raíz; tipos vía `z.infer`; contadores de id por
proyecto; `passthrough` en todos los objetos. Más el fixture de oro: los 14 casos de `qa` con
su resultado esperado.

**Terminado cuando:** ninguna entidad contenedora tiene campo `estado` ni `porcentaje` (prueba
estructural que falla si aparecen); el esquema valida un documento sembrado con los datos
reales de SICOE; un documento con un campo desconocido pasa la validación y lo conserva.

**Cuello de botella.** E3, E4 y E5 la esperan. Es la etapa donde vale la pena que
`arquitecto` revise antes de que nadie construya encima.

---

## E3 · Almacén e integridad
**Estado:** ⬜ pendiente · **Agente:** `backend` · **Depende de:** E2 · **Tamaño:** grande

**Entrega:** `electron/almacen/` — carga con validación, escritura atómica (temporal hermano +
`fsync` + `rename`), respaldos rotativos, `historial.jsonl` append-only con `proyecto_id` y
`origen` desnormalizados, `stat` de guarda antes de cada escritura, `fs.watch` sobre el
directorio con supresión de eventos propios, y el modo solo lectura ante JSON inválido.

**Terminado cuando:** matar el proceso a mitad de una escritura deja el archivo anterior
íntegro; un JSON con BOM o con claves duplicadas abre el modo solo lectura en vez de reventar
o de comerse datos en silencio; modificar el archivo desde fuera dispara conflicto y **no** se
sobrescribe; el `historial.jsonl` tiene una línea por mutación.

**Es la única etapa cuyo fallo es irreversible.** No se avanza a E6 sin esto verde.

---

## E4 · Cálculo derivado
**Estado:** ⬜ pendiente · **Agente:** `backend` + `qa` · **Depende de:** E2 · **Tamaño:** mediano

**Entrega:** `compartido/derivar.ts`, puro: estado y avance de historias y épicas contando
tareas, más las métricas de Panorama (días sin movimiento, razón de no planeado contra la
mediana de los 11, dispersión del sprint, WIP).

**Terminado cuando:** pasa el fixture de oro completo, incluidos los límites — épica sin
historias, historia sin tareas, 199/200 en progreso (no verde), tres historias de 1 tarea con
1 hecha = 99% y no 100%. Y una prueba de propiedad (`fast-check`) sobre árboles generados:
el resultado nunca es `NaN`, nunca `0` para un contenedor vacío, y las hechas nunca superan
las hojas.

**Corre en paralelo con E3.** No toca disco.

---

## E5 · Puente IPC
**Estado:** ⬜ pendiente · **Agente:** `backend` + `seguridad` · **Depende de:** E3, E4 · **Tamaño:** mediano

**Entrega:** `electron/comandos/` con una función por mutación (`capturar`, `moverAlSprint`,
`cerrarSprint`, `bloquear`, `desbloquear`, `cambiarEstado`, `mover`…) y el preload exponiendo
una API de dominio. Cada comando valida su payload con el mismo esquema Zod, escribe por el
almacén y anota en la bitácora.

**Terminado cuando:** el renderer no tiene forma de enviar el documento completo (revisado por
`seguridad`); un payload inválido se rechaza con mensaje útil y sin escribir; el preload no
expone ninguna operación de sistema de archivos; cada comando deja su línea de historial.

---

## E6 · Árbol y sprint en solo lectura — **HITO**
**Estado:** ⬜ pendiente · **Agente:** `frontend` · **Depende de:** E5, E0 · **Tamaño:** grande

**Entrega:** la vista de proyecto con sus dos paneles y datos reales en pantalla. Un solo
componente `Arbol` con predicado por panel, nunca tres árboles copiados. Selector de proyecto.
Cero escritura.

**Terminado cuando:** se puede abrir la app, elegir SICOE, ver las 4 épicas con sus tareas
reales, los estados derivados correctos, cada porcentaje con su conteo al lado, y las épicas
sin desglosar diciendo «sin desglosar». Es la primera etapa que el usuario puede juzgar de
verdad — **aquí se para y se revisa antes de seguir.**

---

## E7 · Arrastre, captura y edición
**Estado:** ⬜ pendiente · **Agente:** `frontend` · **Depende de:** E6 · **Tamaño:** grande

**Entrega:** mover tareas al sprint y fuera con arrastre, capturar tareas nuevas, cambiar
estado, editar título. Solo tareas se arrastran.

**Terminado cuando:** arrastrar una tarea al sprint la persiste y sobrevive al reinicio;
intentar arrastrar una épica no hace nada; capturar después de «cerrar planeación inicial»
marca la tarea como no planeada sin que el usuario haga nada; el teclado hace todo lo que hace
el ratón.

**Aquí se decide la librería de arrastre.** Ver decisión D3.

---

## E8 · Cierre de sprint
**Estado:** ⬜ pendiente · **Agente:** `backend` + `frontend` · **Depende de:** E7 · **Tamaño:** mediano

**Entrega:** abrir sprint, cerrarlo, arrastrar lo no terminado al siguiente. La tarea guarda
`sprints: []` (array), no un sprint único.

**Terminado cuando:** un sprint cerrado no se puede modificar por ningún comando (prueba que lo
intenta y falla); una tarea que pasó por dos sprints los conserva ambos; el cierre queda en la
bitácora.

---

## E9 · Bloqueos
**Estado:** ⬜ pendiente · **Agente:** `backend` + `frontend` · **Depende de:** E7 · **Tamaño:** mediano

**Entrega:** lista `bloqueos[]` en la tarea con tipo, motivo, `bloqueada_en`, `desbloqueada_en`.
Vista global de Bloqueos.

**Terminado cuando:** una tarea bloqueada conserva su estado propio (`en_curso` bloqueada sigue
siendo `en_curso`); desbloquear no borra el bloqueo anterior, lo cierra; la vista ordena por
días bloqueada descendente.

---

## E10 · Terminadas, Panorama y Backlog del área
**Estado:** ⬜ pendiente · **Agente:** `frontend` + `data` · **Depende de:** E7 · **Tamaño:** grande

**Entrega:** pestaña Terminadas en la vista de proyecto, vista global Terminadas, Panorama con
los 11 proyectos ordenados por atención, y Backlog del área.

**Terminado cuando:** Panorama ordena los 11 de forma que el orden **sea** el hallazgo; ningún
proyecto con menos de 5 tareas muestra porcentaje; la pantalla dice explícitamente qué no
sostiene («esto muestra qué está quieto, no qué es importante»). Sin gráficas: no hay librería
para eso y no la va a haber.

---

## E11 · Carga por persona y Equipos
**Estado:** ⬜ pendiente · **Agente:** `frontend` + `data` · **Depende de:** E7 · **Tamaño:** mediano

**Entrega:** vistas de Carga por persona y Equipos, con las personas reales del Jira.

**Terminado cuando:** las cuatro personas de los datos reales aparecen con su conteo por
estado; una tarea sin responsable no desaparece, cae en «sin asignar».

---

## E12 · Empaquetado
**Estado:** ⬜ pendiente · **Agente:** `infra` · **Depende de:** E8–E11 · **Tamaño:** mediano

**Entrega:** `.app` para arm64, ícono, primer arranque limpio.

**Terminado cuando:** el `.app` abre desde Aplicaciones en una sesión limpia; una prueba
verifica que la cabecera CSP del empaquetado es la **estricta** (que la CSP de desarrollo se
filtre a producción es el fallo típico); el primer arranque crea sus datos sin stack traces y
explica cualquier permiso que macOS pida.

---

## E13 · Uso real
**Estado:** ⬜ pendiente · **Agente:** usuario + `pm` · **Depende de:** E12 · **Tamaño:** —

**Entrega:** dos semanas usándola de verdad, con los 11 proyectos capturados.

**Terminado cuando:** el usuario llega a un lunes y abre PM-care antes que Jira. Si no pasa,
el hallazgo es más valioso que cualquier etapa nueva: se revisa qué vista sobra y cuál falta.

---

## Decisiones pendientes

**D1 · Undo/redo — YA DECIDIDO, no reabrir.**
Sí entra en la v1, acotado: pila de snapshots del documento **en el proceso principal**,
tope **20**, solo para mutaciones de datos (no filtros, no selección, no colapsar). Un
cambio externo del archivo **vacía la pila**. Única confirmación de toda la app: borrar un
contenedor que tiene hijos, con el conteo en el texto ("Borrar E3 y sus 12 tareas").
*Por qué no se pospone:* el diseño de interacción se apoya en no confirmar nada, y añadirlo
después obliga a reescribir el reductor entero para que sea puro y serializable. Hacerlo en
E7 cuesta poco; hacerlo en la v2 cuesta el reductor completo.

**D2 · Ubicación del archivo de datos — decidir antes de E3.**
Opciones: `userData` (sin permisos de macOS, invisible para el usuario) · `~/Documentos/PM-care`
(versionable con git, pero pide autorización TCC y puede estar en iCloud).
*Recomendación:* **`userData` por defecto, con ruta configurable**. El usuario es técnico y va
a querer versionar; que lo pueda apuntar a donde quiera, pero que el primer arranque no le pida
permisos del sistema. **Pregunta abierta: ¿tienes iCloud sincronizando Documentos?**

**D3 · Librería de arrastre — decidir en E7.**
Única excepción admitida a la regla de cero dependencias. HTML5 nativo es gratis pero
inaccesible por teclado y feo en macOS; `dnd-kit` son ~30KB y resuelve teclado y lectores.
*Recomendación:* **empezar nativo**; si el arrastre por teclado no sale en un día, `dnd-kit`
con la justificación escrita en el commit.

**D4 · Botón «Cerrar planeación inicial» — decidir antes de E7.**
Es la única forma de que lo no planeado se marque solo: antes de esa fecha lo capturado es
planeado, después no. Si nunca se pulsa, nada es amarillo y el color no aparece — degrada
seguro. La alternativa es marcarlo a mano cada vez, y se va a olvidar.
*Recomendación:* **sí**, exactamente como lo propuso `ux`.

**D5 · «Emergente» o «No planeado» — decidir antes de E0.**
*Recomendación:* **«No planeado»** en etiqueta larga, chip **«Nuevo»**. La pregunta de fin de
mes es «cuánto de lo que hice no estaba planeado», no «cuánto fue emergente».

**D6 · Prioridad y fecha objetivo manuales — decidir antes de E10.**
No son calculables. Sin ellas, «abandonado» y «de baja prioridad» se ven idénticos, y no
existe «atrasado», solo «quieto».
*Recomendación:* **prioridad manual sí** (tres niveles, un clic), **fecha objetivo no** en v1.

**D7 · Archivar proyectos — decidir antes de E10.**
Sin archivar, la rejilla de Panorama crece para siempre.
*Recomendación:* un campo `archivado` desde E2 (cuesta una línea) y el filtro en E10.

**D8 · Importar desde Jira una sola vez — decidir antes de E13.**
Hay MCP de Atlassian conectado. Capturar 11 proyectos a mano es la barrera real de adopción.
*Recomendación:* **una importación única y manual, fuera de la app** — un JSON generado por un
agente, no código de red dentro de PM-care. La regla `connect-src 'none'` no se toca.

**D9 · Proyectos sin épicas («Infraestructura», «DGETI web») — decidir antes de E2.**
Si son trabajo continuo, el modelo de 3 niveles no les queda.
*Recomendación:* permitir tareas colgando directo del proyecto, sin épica. Es un caso del
esquema, no un modelo aparte. **Pregunta abierta: ¿cuántos de los 11 son así?**

---

## Riesgos

| Riesgo | Señal temprana | Qué hacer |
|---|---|---|
| E2 se estira y bloquea cinco etapas | La discusión del esquema pasa de un día | Congelar lo mínimo del fixture de oro y marcar el resto como campos futuros |
| `sandbox: true` rompe el preload | E1 no abre ventana con la CSP estricta | Es exactamente por eso que E1 va primero; si pasa, se rediseña E5 antes de escribirla |
| Adopción: capturar 11 proyectos a mano no sucede | E13 arranca con 2 proyectos capturados | D8, importación desde Jira, adelantada antes de E13 |
| El árbol de 3 niveles no cabe en 14" | E0 lo muestra antes de escribir componentes | Colapsar a un panel bajo 1040px de ventana |
| Alcance que crece por las vistas globales | E10 y E11 empiezan a pedir gráficas | Las gráficas están fuera de alcance por regla; el orden de una lista ya es el hallazgo |
| El historial nace incompleto | Una mutación de E7 no deja línea en `historial.jsonl` | E5 obliga a que el comando escriba la bitácora; no hay ruta de escritura que la salte |

## Fuera de alcance (deliberadamente)

Sincronización con Jira en vivo · multiusuario, cuentas y red · burndown, velocidad, fecha
estimada de término e índice de salud 0-100 · gráficas de cualquier tipo en v1 · merge
automático ante cambio externo · undo/redo ilimitado o por operación inversa · Windows y Linux · estimaciones en
puntos u horas · adjuntos y comentarios en las tareas.

---

## Bitácora

<!-- Una línea por cambio de estado. Entradas nuevas arriba. Formato: FECHA · etapa · qué pasó -->

- 2026-08-26 · Plan creado. Ninguna etapa iniciada.
