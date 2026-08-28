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
| E12 | Empaquetado | `infra` | E8–E11 | Mediano | ✅ |
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
**Estado:** ✅ terminada · **Agente:** `diseno` · **Depende de:** nada · **Tamaño:** pequeño

**Entrega:** una página HTML estática, sin React ni build, con la vista de proyecto a dos
paneles y ~60 filas usando los títulos reales de `docs/datos-reales-sicoe.md`. Paleta,
tipografía, densidad, glifos de estado y banda de procedencia, en tema claro y oscuro.

**Terminado cuando:** se abre en Safari en macOS en ambos temas; los títulos de 65
caracteres (el máximo real) no se truncan de forma ilegible; el contraste de cada par
texto/fondo pasa WCAG AA y los cuatro glifos de estado se distinguen en deuteranopía. Media
hora de trabajo que cambia decisiones de E6.

---

## E1 · Andamio + app de humo
**Estado:** ✅ terminada · **Agente:** `infra` · **Depende de:** nada · **Tamaño:** pequeño

**Entrega:** `package.json`, Vite, TypeScript, `electron/principal.ts`, `electron/precarga.ts`,
vitest configurado. Una ventana que dice «PM-care» y la versión.

**Terminado cuando:** `npm run dev` abre la ventana; `contextIsolation`, `nodeIntegration:false`
y `sandbox:true` están activos y la app **igual funciona**; la CSP se sirve por cabecera con
`connect-src 'none'`; `npm test` corre con al menos una prueba trivial verde.

**Por qué va primero:** si `sandbox: true` rompiera el preload, todo el diseño de E5 cambia.
Descubrirlo aquí cuesta una hora; descubrirlo en E5 cuesta una etapa.

---

## E2 · Modelo de datos
**Estado:** ✅ terminada · **Agente:** `arquitecto` + `backend` · **Depende de:** E1 · **Tamaño:** mediano

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
**Estado:** ✅ terminada · **Agente:** `backend` · **Depende de:** E2 · **Tamaño:** grande

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
**Estado:** ✅ terminada · **Agente:** `backend` + `qa` · **Depende de:** E2 · **Tamaño:** mediano

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
**Estado:** ✅ terminada · **Agente:** `infra` · **Depende de:** E8–E11 · **Tamaño:** mediano

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

**D2 · Ubicación del archivo de datos — CERRADA (2026-08-27, decisión del usuario).**
«No quiero sincronizar mis carpetas con esta app, todo debe ser independiente.»
**PM-care guarda todo dentro de su propia carpeta en la Biblioteca**
(`~/Library/Application Support/PM-care`): documento, `historial.jsonl` y respaldos. No
escribe en Documentos, Escritorio ni Descargas; no pide permisos de macOS; iCloud no la
toca. `PMCARE_DIRECTORIO_DATOS` sigue existiendo solo para las pruebas y para un respaldo
manual; **no se ofrece como configuración en la interfaz**.
*Lo que se pierde:* versionar el archivo con git desde su sitio. Se sustituye por copiar la
carpeta a mano (`README.md`, sección de respaldos).

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

**D8 · Importar desde Jira una sola vez — CERRADA (2026-08-27). Ver N8.**
Hay MCP de Atlassian conectado. Capturar 11 proyectos a mano es la barrera real de adopción.
*Recomendación:* **una importación única y manual, fuera de la app** — un JSON generado por un
agente, no código de red dentro de PM-care. La regla `connect-src 'none'` no se toca.

**D9 · Proyectos sin épicas («Infraestructura», «DGETI web») — CERRADA (2026-08-27). Ver N9.**
Si son trabajo continuo, el modelo de 3 niveles no les queda.
*Recomendación:* permitir tareas colgando directo del proyecto, sin épica. Es un caso del
esquema, no un modelo aparte. **Pregunta abierta: ¿cuántos de los 11 son así?**

---

## Decisiones del 2026-08-27 — cerradas por el usuario

No se reabren. Si una se contradice al construir, se para y se pregunta; no se decide por
cuenta propia.

**N1 · Orden de trabajo.** Primero la pila de deshacer (hecho). Después **D8**, importar
los 11 proyectos desde Jira. Después los tres cambios visibles del nivel 1.
*Por qué D8 antes que el rediseño:* las preguntas que quedan —¿estorba la clave?, ¿cansa
el recorrido?, ¿sirve el `＋`?— solo se contestan honestamente usando la app con los 11
proyectos de verdad. Sin datos reales, capturar a mano es la barrera de adopción.

**N2 · Nivel 1 del rediseño: solo los tres visibles.** `＋` en la fila (1.4), borrar el
texto explicativo (1.2) y la paleta (1.1). ~1.5 jornadas.
*Lo que se pierde:* 1.3, 1.5 y 1.6 no desaparecen — se re-priorizan con lo aprendido de
estos tres. El nivel 1 completo era una apuesta de 3.75 jornadas sin retroalimentación.

**N3 · Pruebas de renderer: autorizadas.** `jsdom` y `@testing-library/react` entran como
dependencias **de desarrollo**. No tocan el paquete ni el runtime, y la alternativa era
hacer 2.1 y 2.2 —los dos cambios de mayor riesgo— sobre 0 % de cobertura de interfaz.
**Condición única, no negociable:** las primeras pruebas se escriben sobre el
comportamiento ACTUAL del renderer, antes de tocarlo. Red, no decoración.

**N4 · El menú `⋯` por fila: lista nativa, no 200 líneas a mano.** El criterio es el
contenido del menú, no la estética: con ≤5 acciones, sin submenús, sin íconos por acción y
sin separadores, un botón que despliega una lista nativa es honesto y trae teclado, foco y
`Escape` gratis. Se migra a un menú propio **el día que el menú necesite su primera cosa
que un `<select>` no hace** — y ese día se escribe aquí.

**N5 · «No es fácil agregar items internos»: se observa, no se opina.** Entregar el `＋`
visible, usarlo una semana, y **solo si la fricción persiste** invertir en la captura en
la fila (2.1, 2 jornadas, riesgo alto). Si el problema era descubrir la tecla `N`, el `＋`
lo cura entero y 2.1 sobra.

**N6 · La clave (`SICOE-104`) sale del renglón.** Se copia, no se lee: nadie se orienta
escaneando claves, se orienta por el título. Vuelve visible al pasar el ratón o al
seleccionar la fila, con copiado en un clic. Los 88 px recuperados son para el `＋` y el `⋯`.

**N7 · Equipos sale de la barra lateral.** Uso mensual. *Regla general que aplica a toda
la lateral:* **la frecuencia de uso decide la jerarquía de navegación, no la importancia
organizacional.** Equipos vive bajo Administración o un menú secundario.

**N8 · D8 · Importación desde Jira: script externo, una sola vez.** Un JSON generado
fuera de la app con el MCP de Atlassian. No se construye integración permanente para un
problema de arranque. `connect-src 'none'` no se toca.

**N9 · D9 · La jerarquía es opcional por diseño.** Las tareas pueden colgar directo del
proyecto: `tarea.padre` es una épica **o** el proyecto. Obligar a Infraestructura y DGETI
web a una épica «General» artificial es mentirle a la estructura. La vista agrupa por
épica cuando existe y lista plano cuando no.

**N10 · Ícono propio sí, firma del `.app` todavía no.** El ícono es una hora y quita la
señal de «experimento» cada vez que se ve en el Dock. La firma ad hoc solo importa cuando
el `.app` viaje a otra máquina; el día que se comparta con alguien del equipo, ese día se
firma.

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

**2026-08-27 · N11 a N18 · las decisiones de la ronda de mejora.**

Todas del usuario, todas cerradas. El detalle y su costo están en `docs/PLAN-MEJORA.md`; aquí
queda lo que se decidió, que es lo que no se vuelve a discutir.

- **N11 · Equipo es una entidad de tres niveles**: proyecto → equipos → personas con
  responsabilidades. Un proyecto tiene varios equipos, cada uno dedicado a un área
  («Frontend», «Backend»). Muere el atajo «equipo ≡ proyecto». `proyecto.equipo[]` migra a un
  equipo «General» por proyecto: partirlo automáticamente por el rol sería una migración que
  adivina, y con 4 proyectos y 4 personas partirlo a mano son minutos.
  **`tarea.equipo_id` explícito**, no derivado del responsable: derivarlo falla justo en los
  dos casos que importan —una tarea sin responsable no tendría equipo, y una persona en dos
  equipos del mismo proyecto lo vuelve ambiguo—.
- **N12 · Cinco estados más `cancelada`**: `pendiente → iniciado → en_pruebas → terminado →
  done`. `testing` y `qa` son un solo paso. `terminado` y `done` los marcan **dos personas
  distintas** y no son sinónimos. **El avance se mide contra `done`.**
- **N13 · Un bug es TRABAJO** y nace como tarea; se distingue con un `tipo`. Un bloqueo NO es
  trabajo: es la bandera que ya existe, con su motivo. La columna «Bloqueada» del tablero se
  DERIVA de la bandera y el enum de estado no crece.
- **N14 · El reloj se pausa.** Tramos de trabajo en la tarea, no `fin − inicio`. Ver regla 21.
- **N15 · El sprint general es DERIVADO**, no una entidad: existe mientras haya al menos un
  sprint de proyecto activo o planeado, y desaparece cuando todos cierran. Sin fechas propias.
- **N16 · Se admite la SEGUNDA confirmación de la app**: sacar del sprint. Tiene una
  consecuencia invisible sobre datos que el usuario tecleó a mano.
- **N17 · Los sprints van en la raíz con `clave` de proyecto.** Cada proyecto gestiona el suyo;
  no todos arrancan a la vez.
- **N18 · Criterios de aceptación en texto libre.** Capacidad en puntos, con el conteo de
  tareas al lado y **siempre con su cobertura**: hoy 0 de 2 tareas están estimadas, y un «va
  al 120 % de su capacidad» sobre eso sería el número inventado que la regla 23 prohíbe.

**`CLAUDE.md` corregido en los cinco puntos donde contradecía al producto** (M0): los estados,
la regla 4 del verde, el techo del menú de la regla 19, la regla 21 entera, el contenido de la
vista de Equipos, y la afirmación de que solo había una confirmación.
*Por qué esto va antes que el código:* la bitácora ya registra que un `CLAUDE.md` con dos
reglas contradictorias hizo chocar a dos agentes antes de que nadie lo detectara. Un error en
el documento de reglas se propaga a todos a la vez.

**2026-08-27 · M1 · la evidencia congelada antes de tocar el esquema.**

Copia fechada de los datos reales del usuario en `~/respaldo-pmcare-2026-08-27/`: `datos.json`,
`historial.jsonl` y `respaldos/`, **fuera del repositorio y fuera de la carpeta de la app**.

**La restauración se PROBÓ, no se supuso.** Se copió el respaldo a un directorio limpio, se
abrió la app apuntada ahí con `PMCARE_DIRECTORIO_DATOS` y arrancó sin un error en el log,
sin reescribir el documento restaurado. Una reversión que nunca se corrió no es una reversión.

**Los conteos de hoy, que son la línea base de todo lo que viene:**

| | |
|---|---|
| Proyectos | 4 |
| Tareas | 2 |
| Sprints | 0 |
| Personas | 4 |
| Tareas estimadas | 0 |
| Tamaño | 5 010 bytes |

Es la razón por la que el cambio de esquema va primero y por la que el usuario **no debe
capturar los 11 proyectos todavía**: hoy la migración es casi gratis y encarece cada día.

`tests/modelo/oro-documento-real.test.ts` en verde antes de tocar nada.

**2026-08-27 · 3.4 cerrado y la app con ícono propio. El rediseño no deja pendientes.**

- **Cerrar y eliminar un proyecto se piden desde el `⋯` de la lista lateral**, donde el
  proyecto ya se está mirando. La ceremonia se sacó a `DialogoProyecto` y la llaman las dos
  entradas: copiarla habría sido lo peor que se puede duplicar en esta app — el día que una
  copia gane una salvaguarda, la otra se queda sin ella y nadie lo nota hasta que borra
  algo. Ni una palabra del texto cambió.
- **12 pruebas nuevas sobre la ruta destructiva**, la única mutación que `⌘Z` no revierte.
  Una de ellas lee el código fuente para que la ceremonia no se vuelva a duplicar: si
  alguien la reescribiera dentro de una vista, las otras once seguirían pasando sobre el
  componente compartido sin enterarse de la copia.
- El `⋯` de la lateral **solo ofrece cerrar**, y está razonado: esa lista muestra los
  activos —cerrar archiva— y eliminar exige que el proyecto esté cerrado. Las otras dos
  acciones nunca podrían dispararse desde ahí.
- **Ícono propio.** Generado sin instalar nada: `swift` y `iconutil` vienen con macOS.
  Verificado en el `.app` reconstruido — es el nuestro byte por byte y `electron.icns` ya no
  existe dentro del paquete. Legible a 32 px, que es el tamaño al que se ve de verdad.

1006 pruebas. La app corre con la semilla sin un error en el log.

**2026-08-27 · Niveles 2 y 3 del rediseño, casi completos.**

- **Menú `⋯` por fila.** Ocho teclas memorizadas pasan a ser ocho etiquetas con su tecla al
  lado. `<select>` nativo, por la decisión N4: con ocho ítems y sin submenús, el sistema da
  gratis foco, `Escape`, flechas y posicionamiento. **«Al sprint» dejó de esconderse tras el
  hover** — era la acción más frecuente de la app y solo aparecía al pasar el ratón.
- **Panel `?`** con las teclas y con «Cómo se lee». La leyenda encoge a su glosario: una
  lista de nueve teclas en un pie se lee una vez y nunca más.
- **Franja de deshacer tras borrar.** Es lo que permite que la app no pregunte «¿seguro?»
  en cada borrado. Tinta neutra: un borrado reversible no es un error.
- **Deshacer y capturar se anuncian** (`role="status"`). La etiqueta de lo deshecho se
  captura ANTES de deshacer, porque la instantánea que vuelve ya nombra el paso de abajo.
- **Lateral en cuatro grupos**: Hoy · Proyectos · Registro · Gente. Se fue la palabra
  «Administración», que nombraba una categoría en vez de un contenido — y que además dejó
  de ser cierta al fusionarse Equipos.
- **Equipos existe una sola vez** y esa pantalla muestra y edita (codex). La ficha de
  persona deja la adscripción en solo lectura: dos caminos para el mismo dato es la fuente
  de que se contradigan.

981 → 994 pruebas. La app corre con la semilla sin un solo error en el log.

**Lo que queda del 3.4, y por qué no se hizo:** el `＋` de dar de alta un proyecto sí está,
en la cabecera del grupo Proyectos. **Mover cerrar y eliminar al `⋯` de la fila lateral no
se hizo:** su flujo de confirmación —el que exige escribir la clave a mano— vive dentro de
`SeccionProyectos`, y sacarlo es un refactor sobre la ruta destructiva. El propio documento
de rediseño lo llama «el más caro y el menos urgente» y admite partirlo; se partió, y esta
mitad espera. Hacerlo la noche antes de que el usuario empiece a usar la app era el peor
momento posible.

**2026-08-27 · Lista para usarse. Empaquetada, corrida y revisada.**

- **Tres commits del trabajo del día** más este. La app se corrió por primera vez con
  todo lo nuevo: `npm run dev` arranca sin un solo error en el log y crea su almacén.
- **`.app` reconstruida**, 298 MB, arranca desde el binario sin salida de error. La CSP
  estricta está en el paquete (`default-src 'none'` · `connect-src 'none'`) y la de
  desarrollo sigue tras `!app.isPackaged`.
- **El documento REAL del usuario abre con el esquema nuevo**, comprobado validándolo:
  cuatro proyectos capturados a mano, cero problemas. Los cambios de N9 y del reloj eran
  aditivos y ahora está medido sobre sus datos, no solo sobre el fixture.
- **N6 y N7 implementados**: la clave sale del renglón y se copia con un clic; Equipos sale
  de la lateral y se llega desde Administración.

**Revisión externa (codex) sobre el código del día.** Reportó cinco cosas; cuatro eran
reales y están corregidas, una la rechacé con razón escrita en el commit. La grave:
`sprintDelCierre` atribuía a un sprint cualquier cierre posterior a su arranque, aunque
ocurriera semanas después de que terminara — veintitantos días de una tarea que nadie
estaba trabajando. Es exactamente el modo de fallo que el módulo dice evitar, y se me
había escapado.

**Lo que queda, y solo se responde usándola:** si el `＋` visible bastó o hace falta la
captura en la fila (N5), y el ícono propio, que el usuario bajó al último lugar.

**2026-08-27 · Esfuerzo por tarea y tiempo de resolución.**

Dos decisiones del usuario, implementadas tal cual: **esfuerzo en Fibonacci `1·2·3·5·8`** y
**el reloj corre desde que arranca el sprint hasta que él marca la tarea completada.**

- Campos nuevos, los dos aditivos: `tarea.esfuerzo` y `item.comprometida_en`. El segundo no
  cambia la regla del reloj, la protege: una tarea metida DÍAS después del arranque no puede
  cargar con los días en que ni existía el compromiso. El tope es **por día de calendario**,
  no por instante — comprometer algo a las nueve de la mañana del primer día no puede
  regalarle nueve horas al que capturó temprano.
- `compartido/dominio/duracion.ts`, puro: resolución por tarea, promedios por persona,
  equipo y proyecto, suma de esfuerzo y días por punto. 33 pruebas, 5 de ellas invariantes
  sobre los 300 árboles generados.
- **Vista global «Tiempos»**, la octava. Sin semáforos, sin pista de fondo en la barra y sin
  una sola proyección: no existe un «bien» ni un «mal» de días por tarea, y un promedio
  describe lo que pasó — convertirlo en pronóstico sería el índice de salud 0-100 que está
  fuera de alcance desde el primer día.

**Un fallo real, encontrado por una prueba que yo había escrito mal:** `sprint.inicio` es una
fecha suelta sin huso, y resolverla como `T00:00:00` la interpretaba en la zona de la
MÁQUINA. La misma tarea duraba seis horas distintas según dónde se abriera la app, sin
fallar y sin avisar. Ahora el huso sale del instante contra el que se resta.

**Los tres límites que la pantalla dice en voz alta, no en una nota al pie:**
cerrar algo fuera de un sprint no da duración (`null`, jamás `0`, y va a pasar seguido);
un promedio de menos de cinco tareas no se muestra; y lo cerrado antes de hoy no tiene
duración y no la va a tener nunca — esto no se reconstruye hacia atrás.

972 pruebas, `npm run tipos` y `npm run build` limpios.

**2026-08-27 · N2 · los tres visibles, cerrados.**

- **1.1 paleta.** `base.css` toma la de `maqueta/tema.html` entera, en claro y oscuro. Los
  seis tokens que la maqueta no trae —`--foco`, `--solido-*`, `--peligro-*`, `--medida`—
  no se inventaron: se derivan del canal de interacción que la maqueta ya fijó
  (`--foco: var(--acento)`). Contrastes MEDIDOS, no supuestos: foco 10.4:1 en claro y
  12.3:1 en oscuro; peligro 6.1:1 y 5.4:1. `tests/estilos/tokens.test.ts` sigue en verde,
  que era justo el que avisaba de que sustituir la paleta dejaba la app sin anillo de foco.
- **`data-derivado="hecha"` relleno.** Lavado de 1.09:1, sin borde ni bloque sólido: el
  verde RECULA. Cinco épicas cerradas no pueden gritar más que lo pendiente, que es lo
  único que se mira para decidir. La selección gana sobre el lavado. La guía de rama de la
  maqueta NO se portó y está dicho por qué: pide envolver la rama en un elemento, y el
  árbol es lista plana a propósito.
- **1.2 texto.** Los diez `NotaPie` ya no existían; se podó lo que quedaba con un criterio:
  se queda lo que dice un HECHO que hace falta ahora, se va lo que explica el modelo. Seis
  bloques recortados.
- **1.4 y 1.5 ya estaban hechos** en una sesión anterior: el `＋` de cada épica e historia
  y el `＋ Nueva épica` de la cabecera. Lo que faltaba de verdad era el estado vacío, que no
  ofrecía ninguna salida y decía «no tiene épicas capturadas» —falso desde N9—. Ahora
  ofrece las dos formas de empezar, épica o tarea suelta, y solo cuando se puede escribir.

**Dos defectos reales que salieron de aplicar esto, ninguno estético:**

- **Capturar en el sprint no tenía ningún destino en cinco de los once proyectos.**
  `destinosDeCaptura` solo listaba historias, así que con los datos reales el diálogo decía
  «no hay dónde capturar» sobre un Jira lleno de trabajo. Ahora ofrece los tres niveles, el
  más preciso primero.
- **El texto de esa pantalla afirmaba «una tarea siempre vive en una historia del árbol»**,
  que N9 dejó falso. La copia mentía sobre el modelo.

934 pruebas, `npm run tipos` limpio, `npm run build` pasa.

**2026-08-27 · El árbol pinta las tres formas. N9 cerrado de punta a punta.**

Las cinco tareas de la semilla se ven en pantalla, verificado montando el árbol en un DOM
con el documento real. Antes de esto Infraestructura enseñaba una épica vacía y PULSO
nada.

- **`construirFilas` salió de `Arbol.tsx` a `filas.ts`.** Es la lógica con más casos límite
  de la interfaz y ahora es pura: se prueba con datos, sin DOM ni proveedores. Doce pruebas
  la cubren, incluidas las que antes no existían para nada (qué se anuncia con
  `aria-posinset`, y que el índice de reordenar sale de la lista real y no de la filtrada).
- Una tarea va al **nivel 3** bajo una historia, al **2** bajo una épica y al **1** colgada
  del proyecto. Dentro de un contenedor va antes lo que agrupa y después lo suelto —la
  convención del Finder—, para que una tarea suelta no separe dos historias hermanas.
- **`crearTarea` y `reordenarTarea` reciben `contenedorId`**, no `historiaId`: una historia,
  una épica o la CLAVE del proyecto. Sin esto se podían LEER las tareas de un proyecto
  continuo pero no capturar ni reordenar ninguna, que es media función.
- Se cerró la deuda que `acceso-tareas.test.ts` declaraba: de las ocho excepciones a la
  regla 18 quedan cuatro, y las cuatro son correctas por definición.
- **Primeras pruebas de interfaz del proyecto** (`jsdom` + `@testing-library/react`,
  autorizadas). Ocho, y una de ellas vigila en PANTALLA la regla 2: una épica vacía dice
  «sin desglosar» y no aparece ni un `0%` ni un `NaN` en el DOM. Eso no lo miraba nadie.
- 908 → 928 pruebas. `npm run tipos` limpio en los tres tsconfig.

**Lo que queda antes de que sea agradable de usar:** los tres cambios visibles de N2 —el
`＋` en la fila, la poda del texto explicativo y la paleta—, y decidir si la épica sin
historias merece alguna señal de que ahí no falta un nivel, sino que no lo hay.

**2026-08-27 · Semilla con los 11 proyectos reales, y la confirmación de que N9 era obligatorio.**

Se leyó el Jira una vez (solo lectura, fuera de la app) y salió el hallazgo que cierra la
discusión de la jerarquía: **cinco de los once proyectos no tienen nivel de historia**
—IDCE, INDICA, PULSO, REDOC y SISEC usan «Flujo de trabajo» → «Tarea»— y las 12 tareas
abiertas de Infraestructura cuelgan directamente de la épica `IN-2`, sin una sola historia.
Inventar una historia «General» habría metido un nivel falso en más de un tercio del
tablero. Detalle en `docs/jira.md`.

Tres claves no eran las que se suponían: Infraestructura es `IN` (no `INFRA`), DGETI web es
`DW`, SIEST es `SIES`. Como la clave es inmutable y prefija todos los ids, equivocarlas hoy
costaba renombrar a mano cada id el día que se notara.

`datos/semilla.json`: los 11 proyectos, tres tarjetas importadas de verdad (`IN-3`, `IN-4`,
`IN-9`, colgadas de su épica sin historia) y dos simuladas en PULSO colgadas del proyecto,
distinguibles porque no traen `clave_externa`. Siete pruebas la vigilan. **No sustituye a
`datos/ejemplo.json`**, que sigue siendo el fixture congelado en el archivo de oro.

**Sigue pendiente lo mismo que ayer, y ahora se nota más:** el árbol del renderer no pinta
tareas colgadas de una épica ni de un proyecto, así que de las cinco tareas de la semilla
**el árbol no muestra ninguna**. Las siete vistas transversales sí las cuentan.

**2026-08-27 · N9 · la jerarquía deja de ser obligatoria (modelo, dominio y comandos).**

Se hizo ANTES de importar de Jira a propósito: el costo de un cambio de esquema se mide
contra los datos que ya existen, y hoy ese conjunto es cero. Importar primero habría
significado importar dos veces, la segunda con migración de datos vivos encima.

- **Camino elegido: tres listas con una puerta única, no una tarea con puntero al padre.**
  Aplanar las tareas a un arreglo con `padre_id` destruiría el anidamiento, que es la
  forma en que el archivo se lee y se edita a mano (regla 14) — el anidamiento *es* la
  relación de pertenencia, expresada de la única manera que resulta legible. Además no
  eran horas: 55 accesos en `src/`, 95 en pruebas, y todos los comandos del reductor. Lo
  que se compra con la decisión es el riesgo de que una función recuerde dos de las tres
  listas; lo que lo paga es `tareasDe(nodo)` y la prueba estructural que lo vigila.
- El campo se declara **una vez** (`CONTIENE_TAREAS` en `esquema.ts`) y se compone en
  proyecto, épica e historia: un solo comentario, una sola definición.
- **La regla de ids no cambió y ahora está escrita donde se emite:** el número sale
  siempre del proyecto raíz, nunca del padre inmediato. Mover una tarea de una historia al
  proyecto **no la renumera**, así que ninguna referencia del historial ni de un sprint
  cerrado se rompe. `maximosUsados` ya recorre las tres listas: sin eso, un `INFRA-T500`
  escrito a mano en la lista nueva no habría levantado la alarma y la app habría vuelto a
  emitir ese número.
- **Que no rompe nada está medido, no afirmado.** `tests/modelo/oro-documento-real.test.ts`
  congeló ANTES del cambio la salida completa del dominio sobre `datos/ejemplo.json` —1037
  líneas: avance y estado de cada nodo, la ruta de cada tarea, las cuatro vistas
  transversales y la carga por persona— y sigue pasando idéntica.
- El generador de árboles aleatorios ahora produce las tres formas, así que las 300
  semillas de las invariantes ejercitan N9 de verdad. 895 → 901 pruebas.
- **Lo que queda fuera y hay que decir en voz alta:** el árbol del renderer todavía no
  pinta las tareas colgadas de una épica ni del proyecto, y `crearTarea` sigue exigiendo
  una historia. El modelo las sostiene y todas las vistas transversales las cuentan, pero
  **si se importara Infraestructura hoy, la vista de proyecto se vería vacía.** Va con el
  `＋` de la fila (N2 · punto 1.4), después de las pruebas de renderer (N3).

<!-- Una línea por cambio de estado. Entradas nuevas arriba. Formato: FECHA · etapa · qué pasó -->

- 2026-08-26 · Plan creado. Ninguna etapa iniciada.

---

## Bitácora

**2026-08-27 · E12 empaquetado, verificada sobre el `.app` y no sobre el build.**

- El `.app` pesa **299 MB** y abre por doble clic desde una sesión limpia; carga
  `datos/ejemplo.json` copiado a un directorio temporal, pinta el árbol y un cambio
  hecho dentro **sobrevive a cerrar y reabrir** (documento, `historial.jsonl` y dos
  respaldos en disco).
- **La CSP estricta llega al paquete.** Leída en ejecución desde el `.app`, no del
  código: `default-src 'none'; … connect-src 'none'; …`. Un `fetch` a internet dentro de
  la app empaquetada muere con violación de `connect-src`.
- **La CSP de desarrollo apuntaba al puerto equivocado** (5173, heredado del valor por
  omisión de Vite; el servidor corre en 5190). Ahora el origen sale de la URL real, así
  que no puede volver a divergir.
- **Un fallo al preparar la carpeta de datos dejaba la app sin ventana y sin mensaje.**
  `abrir()` no atrapaba `EACCES`/`EPERM`, la promesa se rompía sin dueño y el usuario
  veía la app rebotar en el Dock y desaparecer. Ahora sale un diálogo que nombra la
  carpeta, explica cómo dar el permiso y ofrece abrir el panel de Privacidad. Verificado
  contra un directorio sin permiso de escritura: el proceso queda esperando en
  `-[NSAlert runModal]`, sin ventana en blanco.
- **Gatekeeper.** Sin cuenta de Apple, el paquete queda sin firmar (`skipped macOS
  application code signing`) y su sello de recursos no valida (`spctl`: rechazado). Da
  igual mientras el `.app` se construya en el mismo Mac: no lleva marca de cuarentena y
  abre con doble clic. Si se copia desde otro Mac, macOS lo bloquea; lo que sí desbloquea
  —probado— es `xattr -dr com.apple.quarantine`.
- **El primer arranque no pide ningún permiso de macOS** con la ruta por omisión: la
  carpeta vive en la Biblioteca, que no está bajo TCC. El permiso solo aparece si
  `PMCARE_DIRECTORIO_DATOS` apunta a Documentos, Escritorio o Descargas.
- **D2 quedó cerrada el 2026-08-27**: el usuario pidió que la app fuera independiente de
  sus carpetas. El comportamiento por omisión ya era ese, así que no hubo cambio de código.
- Pendiente deliberado: **ícono propio** (va el de Electron por omisión) y decidir si el
  paquete se firma **ad hoc** — sin cuenta de Apple ni certificado — para que, copiada a
  otro Mac, macOS diga «no se pudo verificar el desarrollador» en vez de tratarla como
  dañada.

**2026-08-26 · E0 a E4 terminadas y verificadas.**

- **E0** maqueta con datos reales de SICOE, tema claro y oscuro. 52 KB, autocontenida.
  Contraste medido: 30 pares evaluados, los 2 que fallaban corregidos.
- **E1** andamio. El proceso principal va en **CommonJS**: el módulo `electron` no ofrece
  exports con nombre para ESM. Los scripts limpian `ELECTRON_RUN_AS_NODE`, que algunos
  entornos exportan y hace arrancar Electron como Node puro — muere sin mensaje y con
  código de salida cero.
- **E2** modelo, tipos y cálculo derivado. Zod valida `datos/ejemplo.json`; 25 nodos
  evaluados sin un solo `NaN`.
- **E3** almacén. Verificado ejecutando: 50 muertes del proceso a media escritura →
  50/50 archivos legibles; 5 formas de corrupción → todas en solo lectura sin
  sobrescribir; temporales huérfanos barridos al arrancar; respaldos = uno por sesión y
  uno por día, no uno por escritura.
- **E4** 258 pruebas en verde. Verificación por mutación: 11 mutaciones, 11 muertas.
  Se corrigieron los 2 bugs que `qa` encontró y ancló:
  la banda de "no planeada" seguía pintándose en tareas canceladas, y la carga por
  persona leía la fecha de la tarea en vez de la comprometida en el sprint.

**Hallazgo de proceso que conviene no repetir:** el `CLAUDE.md` inicial contradecía dos
decisiones ya cerradas (el estado `bloqueada` y la ruta de `src/compartido/`), y dos
agentes distintos chocaron con lo mismo antes de que se detectara. Un error en el
documento de reglas se propaga a todos a la vez: revisarlo con más cuidado que el código.

**Siguiente:** E5 (puente IPC ya escrito y conectado; falta la interfaz que lo consuma)
y E6, el hito donde el árbol y el sprint se ven con datos reales.
