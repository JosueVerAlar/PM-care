# PM-care — plan de mejora

Las ocho decisiones están cerradas. **Este documento ya no propone: reparte.**
Cada etapa lleva su criterio de terminado verificable y los archivos que toca, para que se
puedan ejecutar una por una sin que dos agentes se pisen.

Complementa `docs/PLAN.md`, no lo sustituye. Las decisiones N1–N10 y D1–D9 siguen cerradas;
las de esta ronda se numeran **N11–N18** y hay que trasladarlas allí (etapa M0).

Fecha: 2026-08-27. Base: 1006 pruebas en verde, `esquema_version: 1`, app empaquetada.

> **Puesto al día el 2026-08-28.** Este documento nació sin casilla de estado: quince etapas
> y ninguna forma de saber cuál estaba hecha. Cuatro lo estaban. Ahora la tabla de la
> sección 3 lleva **estado y evidencia** —archivo:línea o commit—, y una etapa sin evidencia
> dice «sin verificar», nunca «pendiente». Misma marca de texto superado que `docs/PLAN.md`:
> `**[SUPERADO — …]**`, se marca y no se borra.

---

## Lo primero, porque manda sobre todo el orden

Medí tu documento real (`~/Library/Application Support/PM-care/datos.json`), no lo supuse:

| Dato | Valor |
|---|---|
| `esquema_version` | 1 |
| Proyectos capturados | **4** |
| Tareas totales | **2** |
| Tareas con `esfuerzo` estimado | **0** |
| Sprints | **0** |
| Personas | 4 |

Y `src/principal/migraciones/index.ts` tiene `MIGRACIONES = []`: **nunca ha corrido una
migración en este proyecto**. El andamio existe y jamás se ha ejercitado.

**[SUPERADO — M2 cerró el 2026-08-27]** las dos afirmaciones de arriba son de la foto del
2026-08-27 y hoy son falsas. `src/compartido/modelo/version.ts:10` declara
`ESQUEMA_VERSION = 2`, y `src/principal/migraciones/index.ts:34-60` contiene la migración
1→2 —«Añade sprints por proyecto, reloj por tramos, equipos y el flujo de seis estados»—,
que además convierte `proyecto.equipo` en `proyecto.equipos` con un equipo «General» por
proyecto (`${clave}-general`), `responsabilidades: [rol]` y `capacidad: null`. El andamio
ya se ejercitó. Los conteos de la tabla siguen sirviendo como línea base de la migración.

**Consecuencia operativa, y es la acción tuya de mayor impacto en todo el plan:
no captures los 11 proyectos hasta que M2 esté cerrada.** Hoy la migración mueve dos
tareas. En dos semanas movería cientos, y esa es la diferencia entre un `map` y un riesgo.

**[SUPERADO — el bloqueo se levantó el 2026-08-28]** M2 está cerrada, así que **capturar los
11 proyectos ya no es prematuro por esta razón**. Queda un aviso distinto y menor: hasta que
cierre M4, una tarea en `en_pruebas` o en `terminado` se cae del denominador del avance
(`derivar.ts:98-114`). Capturar sí; usar esos dos estados todavía no.

---

## Las ocho decisiones, y qué implica cada una

**Numeración renumerada el 2026-08-28 para que coincida con `docs/PLAN.md`, que es el
canónico** (lo exige M0). Este documento arrastraba la numeración vieja: su N12 era el N17
de allí y su N13 el N12, y por eso M11 citaba «criterios de aceptación (N17)» apuntando al
número equivocado. «Un bug es TRABAJO» no tenía número aquí y es **N13**.

| | Decisión | Consecuencia real |
|---|---|---|
| **N11** | **Equipo es una entidad de tres niveles**: proyecto → equipos → personas con responsabilidades | Sustituye `proyecto.equipo[]`. Desbloquea backlog, sprint general y capacidad por equipo |
| **N12** | Cinco estados: `pendiente → iniciado → en_pruebas → terminado → done`, más `cancelada` | Seis valores. El verde exige `done` |
| **N13** | **Un bug es TRABAJO** y nace como tarea, distinguido por `tipo` | Un bloqueo NO es trabajo: sigue siendo la bandera. El enum de estado no crece |
| **N14** | **El reloj se pausa y se reanuda** | `duracion.ts` se reescribe entero y **la regla 21 cambia** |
| **N15** | El sprint general es una **vista derivada**, no una entidad | No se guarda, no tiene fechas propias, nace y muere sola |
| **N16** | Sacar del sprint **pide confirmación** | **Modifica la regla de `DialogoConfirmar`**: deja de haber una sola |
| **N17** | **Sprints en la raíz con `clave` de proyecto** | Uno activo **por proyecto**, no por documento |
| **N18** | Criterios de aceptación en **texto** libre, y capacidad en **puntos y tareas** con su cobertura | Casillas serían sub-tareas con estado propio (regla 1). Por debajo del umbral no hay porcentaje, solo conteo |

---

## 1 · Los dos diseños que hay que resolver antes de escribir esquema

### N11 · Equipos: tres niveles

Tu frase fija la forma: *«un solo proyecto puede tener varios equipos»*, *«cada equipo está
dedicado a un área en particular de un proyecto»*, *«dentro de cada equipo una persona puede
tener una o varias responsabilidades»*.

```
proyecto
└── equipos[]            "Frontend", "Backend"
    └── miembros[]       persona_id + responsabilidades[] + capacidad
```

**Forma propuesta**

| Campo | Tipo | Por qué |
|---|---|---|
| `Equipo.id` | `"sicoe-frontend"` — minúsculas y guiones, único en el documento | **No lleva contador.** `EsquemaPersona` ya usa ids legibles a mano por la misma razón: son pocos, los nombras tú y no se generan solos. Añadir un cuarto contador a `EsquemaContadores` sería mantener maquinaria para diez filas |
| `Equipo.nombre` | texto | «Frontend» |
| `Equipo.miembros[]` | `{ persona_id, responsabilidades: string[], capacidad: number \| null }` | |
| `Miembro.responsabilidades` | **texto libre**, lista | El `rol` de hoy ya es texto libre *a propósito* («no es un enum que mantener»), y tus ejemplos —«maquetas y diseños», «construcción»— no son roles estándar. Un catálogo estaría mal el primer día. **Se promueve a catálogo el día que la app necesite ramificar según el valor**, y ese día se escribe aquí, igual que N4 dejó agendada la migración del `<select>` |
| `Miembro.capacidad` | `number \| null`, `null` es lo normal | Dijiste «se estime según cada integrante y a partir de ahí se calcule» |
| **`Equipo.capacidad`** | **no existe como campo** | Es la suma de sus miembros, y **persistir un valor derivado está prohibido** por la primera línea de la sección Prohibido. La regla lo decide, no yo |

**Y falta una pieza que nadie nombró: ¿cómo sabe una tarea de qué equipo es?**

Sin eso, «el backlog muestra cada equipo y las tareas asignadas a cada equipo» no se puede
pintar. Dos formas:

- **Derivarlo del responsable.** Falla en los dos casos que más importan: una tarea *sin
  responsable* no tendría equipo —y ésas son justo las que hay que repartir—, y una persona
  que esté en Frontend y en Backend del mismo proyecto vuelve la asignación ambigua.
- **`tarea.equipo_id: string | null`, explícito.** Permite «esto es de Backend, aún no sé de
  quién», que es el flujo real de repartir trabajo.

**Recomendación: explícito.** Y **sin invariante que obligue** a que el responsable
pertenezca al equipo: el comentario que ya está en el esquema tiene razón —una tarea vieja
puede apuntar a alguien que ya salió—. En su lugar, una **señal** en el tablero
(«responsable fuera del equipo»), que informa sin rechazar el documento.

**Qué pasa con lo que ya existe**

`proyecto.equipo: MiembroEquipo[]` tiene datos en tus 4 proyectos, con `rol` de texto libre.
La migración crea **un equipo «General» por proyecto** con todos los miembros actuales y
`responsabilidades: [rol]` (o `[]` si el rol era nulo). Cero pérdida, cero adivinación.

*Por qué no partirlos automáticamente por el `rol`:* una migración que adivina es una
migración que miente, y partir «backend» / «vistas» / «QA» en equipos es un juicio tuyo. Con
4 proyectos y 4 personas, partirlos a mano son minutos — con la app abierta y viendo lo que
haces.

**La vista de Equipos** —la que codex acaba de fusionar— **sigue existiendo una sola vez y
sigue mostrando y editando**, tal como quedó. Lo que cambia es su contenido: pasa de «los
miembros de cada proyecto» a «los equipos de cada proyecto, y dentro sus miembros con
responsabilidades y capacidad». Gana crear equipo, renombrar, mover una persona de un equipo
a otro y declarar capacidad. La ficha de persona **conserva la adscripción en solo lectura**:
dos caminos para el mismo dato es la fuente de que se contradigan.

---

### N14 · El reloj se pausa — evaluación de tu propuesta, y tres mejoras

Tu propuesta —`trabajo: { desde, hasta | null }[]`, mismo patrón que `bloqueos[]`— **es la
correcta**, y por la razón que diste: el patrón ya está probado en este repo, es legible a
mano y auditable. La adopto. Tres cambios:

**Mejora 1 · El tramo guarda también el estado: `{ desde, hasta | null, estado }`.**

Tu frase dice «el tiempo corre mientras la tarea está en desarrollo». Leída al pie de la
letra, correría solo en `iniciado`, y entonces **el tiempo en pruebas no se mide** — que es
justo uno de los números que vas a querer. Leída en sentido amplio, corre en `iniciado` y en
`en_pruebas`, y entonces «tiempo trabajado» mezcla desarrollo y pruebas en un solo número.

Con el estado dentro del tramo **no hay que elegir**: se guarda el detalle y las dos
lecturas se derivan. Un campo, y mata una migración futura — que es exactamente el criterio
con el que está ordenado todo este plan.

*Supuesto que aplico mientras no digas otra cosa:* el reloj corre en `iniciado` **y** en
`en_pruebas`, y se para en `terminado`, `done` y `cancelada`. Es un predicado de una línea
(`esTrabajo(estado)`); cambiarlo después no cuesta migración.

**Mejora 2 · `terminada_en` no hace falta como campo.** Es el `hasta` del último tramo
cerrado. Un campo menos que mantener sincronizado, y uno menos que pueda contradecir a los
tramos. `hecha_en` **sí** sobrevive, renombrado a **`aceptada_en`**: cuándo entró en `done`
es un hecho propio que `VistaTerminadas` ya muestra.

**Mejora 3 · El riesgo que la propuesta no cubre, y su guarda.**
Un tramo abierto que nadie cierra crece para siempre. Si dejas una tarea en `iniciado` tres
meses, «tiempo trabajado» dice tres meses — que es la misma mentira de calendario que este
diseño existe para evitar. La app no puede saber que te fuiste a casa a las seis.

Dos consecuencias, y las dos van escritas en pantalla:
- El número se llama **«tiempo en desarrollo, sin las pausas de revisión»**, nunca «horas
  trabajadas». Y la unidad sigue siendo **días con un decimal**, como hoy: pasar a horas
  invitaría a leerlo como esfuerzo.
- Un tramo abierto por encima de un umbral **no se suma en silencio a ningún promedio**: se
  muestra como «corriendo desde hace 12 días». Mismo criterio que
  `MINIMO_TAREAS_PARA_PROMEDIO`, que ya existe.

#### Lo que se gana, y es más de lo que parece

**La duración deja de depender del sprint.** Hoy `resolucionDe` ancla en `sprint.inicio`, y
de ahí salieron tres defectos ya documentados: el huso que se resolvía con la zona de la
máquina, `sprintDelCierre` atribuyendo un cierre a un sprint que ya había terminado, y el
`comprometida_en` que se reescribe al sacar y volver a meter. **Los tres desaparecen**,
porque los tramos son instantes completos y viven en la tarea, no en el item del sprint.

Y con ellos desaparece la limitación más molesta de la regla 21: hoy **una tarea cerrada
fuera de todo sprint no tiene duración** («`null`, jamás `0`, y va a pasar seguido»). Con
tramos, sí la tiene. Se mide el trabajo, exista sprint o no.

**El dato nuevo que antes no se podía calcular:** tiempo **trabajado** contra tiempo de
**calendario** (del primer `desde` al último `hasta`). «Tardó 11 días en cerrarse y 2.5 de
trabajo» dice dónde está el cuello sin acusar a nadie.

#### Lo que se pierde, y hay que decirlo en pantalla

Nada de lo ya cerrado tiene tramos, y **no se reconstruye hacia atrás**. `trabajo` nace
vacío y la duración de lo histórico es `null` para siempre — la misma honestidad que ya se
aplicó cuando se introdujo el reloj. La medición empieza el día del cambio.

#### La regla 21 se reescribe

De *«el reloj corre desde que arranca el sprint hasta `hecha_en`»* a
**«el reloj mide tiempo en desarrollo: la suma de los tramos en que la tarea estuvo en un
estado de trabajo»**. Se conservan sin cambio: `null` jamás `0`, ningún promedio de menos de
cinco tareas, y todo promedio dice sobre cuántas se calculó y cuántas quedaron sin medir.
Desaparecen: el tope por día de calendario, `comprometida_en` como ancla, y la resolución del
huso desde `sprint.inicio` (los instantes ya traen el suyo).

**Validaciones nuevas en el `superRefine` de la tarea**, calcadas de las de `bloqueos[]`:
como mucho un tramo abierto; `hasta >= desde`; tramos en orden y sin solaparse.

**Y los tramos los abre y los cierra el reductor en `cambiarEstado`, nunca la interfaz.**
Un solo sitio, como el resto de las mutaciones.

---

## 2 · Lo demás que hay que resolver, ya decidido

### N15 · El sprint general es derivado

Existe mientras **al menos un sprint de proyecto esté `activo` o `planeado`**; muere cuando
todos cierran; vuelve solo. **No se guarda nada**: ni entidad, ni fechas, ni id.

La ventana la dan sus componentes. Si coinciden —el caso normal, dos semanas— se lee como
una sola. Si están desalineados, la vista **lo dice** («del 1 al 21 de sep · 4 sprints, 2
empiezan el lunes») en vez de inventar un rango. Esto cierra el choque de la ventana sin
decisión adicional.

**El estado vacío es información, no una pared.** Cuando no hay ningún sprint abierto, la
pantalla dice qué pasó y ofrece tres salidas concretas:

1. **Los proyectos que tienen backlog y no tienen sprint**, con su conteo, y el botón de
   planear uno en cada uno — que es la acción que sigue.
2. **Ir al backlog del área** a elegir qué entra.
3. **Lo último que cerró**: qué se completó y qué quedó arrastrado, que es de donde sale el
   sprint siguiente.

### N16 · La segunda confirmación de la app, y por qué se admite

`DialogoConfirmar.tsx` dice hoy que es *«la ÚNICA confirmación de toda la app»* y nombra
**literalmente** «sacar algo del sprint» como ejemplo de lo que no se pregunta. Esa regla
cambia, y el motivo tiene que quedar escrito donde estaba la regla vieja:

> Sacar del sprint tiene una consecuencia **invisible** sobre datos que el usuario tecleó.
> `reductor.ts:1000-1034` vuelca a la tarea el responsable, la fecha y la prioridad, pero
> el compromiso del item desaparece, y nada en pantalla dice que eso pasó. El criterio de la
> app no era «solo lo destructivo pregunta»: era «lo que `⌘Z` no puede devolver, o lo que se
> pierde sin que se vea, pregunta». Sacar del sprint cae en la segunda mitad.

Y el defecto se arregla igual: el compromiso completo se vuelca. Con los tramos de N14, el
reloj ya no vive en el item, así que sacar deja de poder reiniciarlo.

### N18 · Criterios en texto, y capacidad con sus dos lecturas y su cobertura

**Puntos y tareas, lado a lado**, nunca uno solo:

    Frontend · 34 de 40 pts · 12 de 18 tareas estimadas · 18 tareas comprometidas

La capacidad del equipo es la **suma de la de sus miembros** (derivada, no persistida).

**El umbral de cobertura no es una manía, es un sesgo medido de antemano:** las tareas sin
estimar no son una muestra aleatoria — son sistemáticamente las que nadie ha mirado, y ésas
son las grandes. Una suma con cobertura baja no está solo mal: está **sesgada hacia abajo**,
que es la dirección peligrosa. Por eso, por debajo del umbral **no se muestra ni la barra ni
el porcentaje**; se muestra «12 de 18 estimadas · faltan 6».

Propongo `MINIMO_COBERTURA_PARA_PUNTOS = 0.8`, hermano de `MINIMO_TAREAS_PARA_PCT = 5` y
`MINIMO_SPRINTS_PARA_MEDIANA = 3`, y **revisable después de dos sprints** con datos.

**Una persona en dos equipos tiene dos capacidades y un solo cuerpo.** La ficha de persona
muestra «declarado 8 + 5 = 13 pts entre 2 equipos» para que una sobre-declaración se vea. La
app no lo impide: lo enseña.

Y sigue prohibido: porcentaje de ocupación como número único, «le da tiempo», fecha estimada,
burndown, velocidad, índice 0-100.

---

## 3 · Las etapas

Tamaños: **P** ≈ media jornada · **M** ≈ 1-2 · **G** ≈ 3+.

**Estado al 2026-08-28**, y cada casilla con la línea de código o el commit que la sostiene.
Estas etapas nunca tuvieron estado escrito en ningún sitio: **el código es la única fuente**,
así que se grepeó una por una. Cuatro estaban cerradas sin que nadie moviera nada.

| # | Entrega | Depende de | Tam. | Agente | Estado | Evidencia (verificada 2026-08-28) |
|---|---|---|---|---|---|---|
| **M0** | Reglas y decisiones al día antes de que nadie construya | — | P | `docs` | ✅ | Commit `84cc125`; bitácora de `PLAN.md` del 2026-08-27, «`CLAUDE.md` corregido en los cinco puntos» |
| **M1** | La evidencia congelada | — | P | `qa` | ✅ | Commit `84cc125`; bitácora de `PLAN.md`, restauración **probada** y los conteos escritos |
| **MA** | El compromiso se ve en el backlog (tu arrastre) | — | P | `frontend` | ✅ | Commit `e272933` «MA — el compromiso se ve en el backlog, y el reloj deja de reiniciarse». Fue antes de M2, como el plan pedía |
| **M2** | Esquema v2 y la primera migración | M0, M1 | G | `dba`+`backend`, revisa `arquitecto` | ✅ | Commit `509630b`; `version.ts:10` (`ESQUEMA_VERSION = 2`); `migraciones/index.ts:34-60` (una sola entrada 1→2); `tests/migraciones/esquema-v2.test.ts` cubre campo desconocido, dos tramos abiertos y dos sprints activos |
| **MB** | Glifos y paleta de los seis valores, medidos | M0 | M | `diseno` | ⬜ | **No empezada.** `util/presentacion.ts:17-24` mapea `iniciado`, `en_pruebas` y `terminado` a la **misma** forma `'curso'`: tres estados, un glifo. Faltan cuatro de las siete formas |
| **M3** | El dominio deja de creer en un solo sprint | M2 | G | `backend` | 🟡 | **Casi entera.** Commits `9d6e8f8` y `e35fd43`; `derivar.ts:330` ya es `sprintActivo(doc, clave)`; `tests/comandos/sprints-por-proyecto.test.ts:32,39` es la prueba que M3 pedía. **Queda:** `paraSprintDeProyecto` (`clasificar.ts:210`) y `filasDeProyecto` (`sprint.ts:153`) siguen vivos |
| **M4** | El dominio entiende cinco estados | M3 | G | `backend`+`qa` | ⬜ | **No empezada, y es lo más urgente.** `derivar.ts:98-111` tiene el `switch` de cuatro casos; `clasificar.ts:61-63` `estaAbierta` ignora `en_pruebas` y `terminado`; `backlog.ts:54` `ORDEN_ESTADO` lista cuatro. El enum de seis ya está en el modelo: el defecto es alcanzable hoy |
| **M5** | El reloj de tramos | M4 | G | `backend`+`qa` | ⬜ | **No empezada.** El campo existe y nadie lo escribe: las dos únicas escrituras de `tarea.trabajo` en todo `src/` son `[]` (`reductor.ts:831`, `migraciones/index.ts:104`), y `cambiarEstado` (`reductor.ts:946-972`) no abre ni cierra tramos |
| **M6** | Equipos: entidad, comandos y vista | M2 | M | `backend`+`frontend` | 🟡 | **Modelo sí, comandos y vista no.** `esquema.ts:140-154` ya tiene `Equipo` con `responsabilidades` y `capacidad`, y `:344` `proyecto.equipos`. Pero el único comando es `editarEquipo` (`tipos.ts:548-554`) y escribe **solo sobre `equipos[0]`** (`reductor.ts:1436-1443`): un proyecto no puede tener dos equipos. Faltan `crearEquipo`, `eliminarEquipo`, `moverMiembro`, `asignarEquipo` |
| **M7** | Cada proyecto gestiona su sprint — **primer entregable visible del bloque** | M3 | M | `frontend` | 🟡 | Crear, activar y cerrar por proyecto ya están (commit `9d6e8f8`). **Queda** el conmutador «Solo este proyecto / Todo el sprint», vivo en `PanelSprint.tsx:107`, que esta etapa dice que debe desaparecer. **Bloqueada además por la decisión G1** |
| **M8** | Sprint general derivado, con su estado vacío | M3, M6 | G | `frontend`+`data` | 🟡 | `VistaSprintGlobal.tsx:67` ya agrega `sprintsActivos(documento)` en vez de tomar `[0]` — corregido el 2026-08-28 por otro agente. **Falta** la agregación por persona y equipo y el estado vacío con sus tres salidas |
| **M9** | Capacidad, con su cobertura | M6, M8 | M | `data`+`frontend` | ⬜ | **No empezada.** `MINIMO_COBERTURA_PARA_PUNTOS` no existe en `src/`; `dominio/carga.ts` no calcula cobertura |
| **M10** | Tablero por equipo: pipeline, bloqueo y errores | M4, MB, M6 | G | `frontend`+`ux` | ⬜ | **No empezada.** No existe `VistaTablero.tsx` ni entrada de tablero en `vistas/globales/registro.ts` |
| **M11** | Detalle de tarea: criterios, estado y bloqueo | M4, M5 | M | `frontend` | 🟡 | **En curso y sin commitear.** `vistas/proyecto/HojaDetalle.tsx` es un archivo nuevo del árbol de trabajo: lee criterios, equipo, bloqueo y el reloj. Su propio encabezado (`:24`) dice que `criterios`, `tipo` y `equipo_id` **solo se leen**, no se editan. Y el reloj no puede mostrar nada mientras M5 no produzca tramos |
| **M12** | Panorama: avances, espera, cobertura y errores | M5, M9, M10 | M | `frontend`+`data` | ⬜ | **No empezada.** `dominio/panorama.ts` no tiene espera de aceptación, ni cobertura de estimación, ni sprint vencido |

**Lo que esta tabla deja a la vista, y es la razón de que exista:** el carril 1 se ejecutó
salteado. M2 entró entero, M3 casi entero, y **M4 y M5 se saltaron** — pero M7 y M11, que
van después, ya empezaron. El resultado es un modelo de seis estados con un dominio de
cuatro, que es el defecto de la bitácora del 2026-08-28.

### Cómo repartirlas sin que se pisen

**El cuello es `src/principal/comandos/reductor.ts`.** Lo tocan M3, M4, M5 y M6, y por eso
esas cuatro **van en serie**, en ese orden. No es una preferencia: dos agentes editando ese
archivo a la vez producen un conflicto que ninguna prueba detecta, porque las dos mitades
compilan.

Tres carriles, y solo tres:

- **Carril 1 — dominio y comandos, estrictamente en serie:** M2 → M3 → M4 → M5 → M6.
- **Carril 2 — presentación pura, en paralelo con todo el carril 1:** MB. Solo toca hojas de
  estilo, glifos y la maqueta. Tiene que estar cerrado antes de M10.
- **Carril 3 — antes de que arranque nada:** M0, M1 y **MA**.

**MA va primero y sola.** No toca el esquema, no se encarece esperando, y es lo que más se
nota. Si va después, choca con M3 en `clasificar.ts` y con MB en `arbol.css`. Hecha ahora,
está integrada antes de que ninguno de los dos empiece.

Cuando el carril 1 cierra, las vistas sí se reparten: **M7 con M8**, y luego **M9, M10 y
M11 a la vez**. M12 va al final porque lee de las tres.

---

### M0 · Reglas y decisiones al día
**Estado:** ✅ terminada (commit `84cc125`) · **Agente:** `docs` · **Tamaño:** P · **Depende de:** nada

Trasladar N11–N18 a `docs/PLAN.md` y **corregir `CLAUDE.md`**, que a partir de las decisiones
de hoy contradice al producto en cinco puntos: los cuatro estados de la sección Convenciones,
la regla 21 entera, el techo del menú de la regla 19, la línea de que Equipos muestra los
miembros del proyecto, y la afirmación de que solo hay una confirmación.

*Va primero por un antecedente propio:* la bitácora ya registra que un `CLAUDE.md` con dos
reglas contradictorias hizo chocar a dos agentes distintos antes de que nadie lo detectara.
Un error en el documento de reglas se propaga a todos a la vez.

**Terminado cuando:** `grep -n "en_curso\|'hecha'" CLAUDE.md` no devuelve ninguna definición
de estado vigente; la regla 21 describe tramos y no menciona `sprint.inicio`; la regla 19
dice cómo se cambia el estado ahora que son cinco; la sección Prohibido conserva intactas las
métricas de adorno; N11–N18 están en `docs/PLAN.md` con fecha.

**Archivos:** `CLAUDE.md`, `docs/PLAN.md`, `docs/PLAN-MEJORA.md`. **Ninguno de `src/`.**

---

### M1 · La evidencia congelada
**Estado:** ✅ terminada (commit `84cc125`) · **Agente:** `qa` · **Tamaño:** P · **Depende de:** nada

Una copia fechada de `datos.json`, `historial.jsonl` y `respaldos/` **fuera** de la carpeta de
la app, y los conteos de hoy escritos.

**Terminado cuando:** la copia existe **y se ha ejecutado una restauración de prueba** — no
«el archivo está ahí»: una reversión que nunca se corrió no es una reversión;
`tests/modelo/oro-documento-real.test.ts` corre en verde **hoy**, antes de tocar nada; los
conteos (4 proyectos, 2 tareas, 0 sprints, 0 estimadas) quedan en `docs/PLAN.md`.

**Archivos:** `docs/PLAN.md`. Ninguno de `src/`. La copia va fuera del repositorio.

---

### MA · El compromiso se ve en el backlog
**Estado:** ✅ terminada (commit `e272933`) · **Agente:** `frontend` · **Tamaño:** P · **Depende de:** nada

*Sobre «va ya, antes que M2»: se cumplió. `e272933` es anterior a `509630b`, que es M2.*

El alcance por omisión del backlog pasa a `todas`; la fila comprometida **destaca** en vez de
atenuarse; sacar del sprint confirma (N16) y el compromiso se vuelca entero.

Sobre el color: `--estado-curso` es el único azul saturado del sistema, y `ux` recomienda no
usarlo — *«el pedido real no es azul, es que se note»*. Hoy la fila comprometida se atenúa
(`color: var(--tinta-2)`, glifo a `opacity: .65`): **ése es el defecto**. Se invierte —tinta
plena, glifo a opacidad 1, chip con contorno—. Si aun así quieres azul, va como **fondo tenue
de la fila**, jamás como tinta del texto ni del glifo: superficie y tinta son canales
distintos y no colisionan.

**Terminado cuando:** arrastras una tarea del backlog al sprint y **sigue en el backlog**,
marcada; la sacas, confirma, y vuelve a neutro; `⌘Z` revierte las dos; el compromiso completo
—incluido `comprometida_en`— se vuelca a la tarea al sacar, verificado por una prueba de
comandos; una prueba de interfaz comprueba la marca en el DOM.

**Archivos:** `src/compartido/dominio/clasificar.ts` (el predicado del backlog),
`src/compartido/dominio/backlog.ts` (alcance por omisión),
`src/principal/comandos/reductor.ts` (`sacarDelSprint`, volcado completo),
`src/renderer/estilos/arbol.css`, `src/renderer/vistas/globales/VistaBacklog.tsx`,
`src/renderer/vistas/proyecto/VistaProyecto.tsx`, `src/renderer/componentes/DialogoConfirmar.tsx`,
`tests/comandos/sprint.test.ts`, `tests/interfaz/`.

---

### M2 · Esquema v2 y la primera migración
**Estado:** ✅ terminada (commit `509630b`) · **Agente:** `dba` + `backend`, revisa `arquitecto` · **Tamaño:** G · **Depende de:** M0, M1

**Todo lo estructural en un solo salto.** Cada etapa posterior que cambie el esquema cuesta
otra migración, y para entonces los datos ya serán tuyos.

| Cambio | Forma |
|---|---|
| Sprint por proyecto | `sprint.clave: string \| null`; invariante «a lo sumo un activo **por clave**» |
| Estados | `EsquemaEstadoTarea` = `pendiente \| iniciado \| en_pruebas \| terminado \| done \| cancelada` |
| Reloj | `tarea.trabajo: { desde, hasta \| null, estado }[]`, con su `superRefine` |
| Cierre | `tarea.hecha_en` → `tarea.aceptada_en` |
| Tipo | `tarea.tipo: 'trabajo' \| 'error'`, por omisión `'trabajo'` |
| Equipo | `proyecto.equipos: Equipo[]` **sustituye** a `proyecto.equipo: MiembroEquipo[]` |
| Asignación | `tarea.equipo_id: string \| null` |
| Criterios | `tarea.criterios: string \| null` |

**Migración 1→2, y es la primera de la cadena.** `VERSION_MINIMA_SOPORTADA` **se queda en 1**
para que tu archivo de hoy siga siendo migrable y no obsoleto.

- Estados: `en_curso` → `iniciado`; `hecha` → **`done`** (lo que estaba cerrado estaba
  aceptado, no pendiente de aceptar).
- `trabajo` nace **vacío** en todo lo existente. No se reconstruye hacia atrás.
- Equipos: un equipo **«General»** por proyecto con los miembros actuales y
  `responsabilidades: [rol]`. Sin adivinar.
- **Sprints transversales de los fixtures.** `datos/ejemplo.json` tiene un sprint **cerrado**
  (`S-2026-33`, SICOE+INFRA) y uno activo (`S-2026-34`, INFRA+PED+SICOE) que cruzan
  proyectos. Partirlos sería modificar un sprint cerrado (regla 8) y dejar `historial.jsonl`
  apuntando a ids inexistentes en un archivo append-only (regla 7). Por eso `clave` es
  **anulable**: se pone cuando el sprint toca un solo proyecto y se deja `null` cuando cruza,
  con el significado «sprint transversal, anterior al cambio». Todo sprint nuevo nace con su
  clave.

**Terminado cuando:** `ESQUEMA_VERSION === 2` y `MIGRACIONES` tiene **una** entrada 1→2 (no
cinco); una prueba migra una **copia de tu `datos.json` real** y `datos/ejemplo.json` y las
dos validan contra el esquema nuevo; un documento v1 sin migrar entra en modo **migrable**,
no en solo lectura; **un campo desconocido escrito a mano dentro de una tarea sigue ahí
después de migrar** (regla 14); un documento con dos tramos abiertos en la misma tarea se
rechaza; un documento con dos sprints activos **del mismo proyecto** se rechaza y con dos de
proyectos distintos **se acepta**; `npm run tipos` limpio en los tres tsconfig.

**Archivos:** `src/compartido/modelo/esquema.ts`, `tipos.ts`, `version.ts`,
`src/principal/migraciones/index.ts` + el archivo nuevo de la migración,
`tests/modelo/esquema.test.ts`, `tests/migraciones/` (nuevo), `datos/ejemplo.json` y
`datos/semilla.json` **solo a través de la migración**, nunca editados a mano.

---

### MB · Glifos y paleta de los seis valores
**Estado:** ⬜ pendiente · **Agente:** `diseno` · **Tamaño:** M · **Depende de:** M0 · **En paralelo con todo el carril 1**

*Hoy `presentacion.ts:17-24` da la misma forma `'curso'` a `iniciado`, `en_pruebas` y `terminado`: en pantalla los tres son el mismo glifo.*

Cinco estados del pipeline + `cancelada` + `sindesglosar` = **siete formas** que tienen que
distinguirse a 14 px y en escala de grises.

Consultado con `ux`: un anillo de relleno progresivo aguanta **cinco niveles** distinguibles
sin comparar filas lado a lado (vacío, ¼, ½, ¾, lleno); en sextos cada paso son ~4 px de arco
y dos contiguos solo se separan si las filas están pegadas, que en un árbol no lo están.
Encaja justo: cinco niveles para el pipeline, `cancelada` con su diagonal, `sindesglosar`
punteado. **El `aria-label` con el nombre del estado pasa de deseable a obligatorio:** la
forma deja de ser autoexplicativa.

**Terminado cuando:** las siete formas se distinguen a 14 px en escala de grises y en
deuteranopía, **con la medición escrita** como se hizo en E0 (pares evaluados y su ratio, no
«se ve bien»); `tests/estilos/tokens.test.ts` en verde con cada token nuevo declarado en
claro **y** en oscuro; ningún hex fuera de `base.css`.

**Si no cierra en dos intentos**, la salida está prevista: `terminado` y `done` comparten
forma y se separan con un chip. No se amplía el número de siluetas.

**Archivos:** `src/renderer/componentes/iconos.tsx`, `src/renderer/estilos/base.css`,
`src/renderer/estilos/arbol.css`, `src/renderer/util/presentacion.ts`,
`tests/estilos/tokens.test.ts`, `maqueta/`.

---

### M3 · El dominio deja de creer en un solo sprint
**Estado:** 🟡 casi entera · **Agente:** `backend` · **Tamaño:** G → **P**, ver el recorte de abajo · **Depende de:** M2

**[SUPERADO — alcance recortado el 2026-08-28. Lo que sigue describe un mundo que ya no
existe; se conserva porque explica el defecto que se estaba persiguiendo.]**

> Renombrar `sprintActivo(doc): Sprint | undefined` a `sprintsActivos(doc): Sprint[]` y añadir
> `sprintDeProyecto(doc, clave)`. **El compilador hace el inventario**: no hay que buscar los
> sitios a mano.
>
> Y acotar al proyecto lo que hoy es global: `activarSprint` (rechaza si hay otro activo *en
> todo el documento*), `resolverSprintSiguiente` y `primerSprintPlaneado` (arrastran lo no
> terminado de SICOE al sprint planeado de PED), `sprintDelCierre` y `sprintsAtravesados`.
> Desaparecen `paraSprintDeProyecto` y `filasDeProyecto`: filtraban el sprint global por
> proyecto, y ya no hay sprint global.
>
> **Terminado cuando:** `grep -rn "sprintActivo(" src/` da **cero**; `npm run tipos` limpio
> **sin un solo `as` ni `!` añadido**; las 1006 pruebas en verde tras actualizar
> `tests/apoyo/constructores.ts`; y **una prueba nueva que hoy es imposible**: dos proyectos con
> sprint activo a la vez, con fechas distintas, y cada uno cierra sin tocar al otro.

**Lo que ya está hecho** (commits `9d6e8f8` y `e35fd43`), y no hay que volver a hacerlo:

- `sprintsActivos(doc)` existe y se usa en once sitios. `sprintActivo` sobrevive con
  **otra firma** —`sprintActivo(doc: Documento, clave: string | null)`,
  `derivar.ts:330`—, y esa firma ya es por proyecto. **El criterio «`grep sprintActivo(` da
  cero» quedó obsoleto: medía el nombre, no el defecto**, y el defecto está corregido.
- `activarSprint` rechaza por clave, no por documento (`reductor.ts:1236`).
- El arrastre entre proyectos ya no ocurre: `resolverSprintSiguiente` filtra por
  `s.clave === cerrando.clave` (`reductor.ts:1913`) y rechaza un id explícito de otra clave
  (`:1903`); `primerSprintPlaneado` recibe la clave (`cierre.ts:226`) y filtra por ella
  (`cierre.ts:243`); `moverAlSprint` rechaza una tarea de otra clave (`reductor.ts:981`).
- **La prueba «que hoy es imposible» ya existe**: `tests/comandos/sprints-por-proyecto.test.ts`
  cubre «activar el segundo proyecto no apaga ni bloquea el primero» (`:32`) y «cerrar UNO
  no arrastra su tarea al planeado de DOS» (`:39`).

**Lo que queda de M3, y es todo. Tamaño: P.**

1. **`paraSprintDeProyecto`** sigue vivo en `clasificar.ts:210`, usado solo por
   `tests/dominio/clasificar.test.ts:381,386`. O se borra con su prueba, o se declara por
   escrito para qué sirve todavía.
2. **`filasDeProyecto`** sigue vivo en `sprint.ts:153`, con un solo consumidor:
   `PanelSprint.tsx:107`, el conmutador «Solo este proyecto». **Se va con M7**, no antes:
   borrarlo aquí rompería el panel.
3. **`sprintDeProyecto(doc, clave)` no existe** y nadie lo ha echado en falta, porque
   `sprintActivo(doc, clave)` hace ese papel. Decidir en una línea: se crea como alias o se
   declara innecesario. *Recomendación:* **innecesario**; dos nombres para lo mismo es cómo
   empieza que se contradigan.

**Terminado cuando:** `grep -rn "paraSprintDeProyecto\|filasDeProyecto" src/` da cero (el
segundo, después de M7); `npm run tipos` limpio sin un solo `as` ni `!` añadido; la suite en
verde.

**Archivos:** `src/compartido/dominio/` — `derivar.ts`, `clasificar.ts`, `sprint.ts`,
`cierre.ts`, `backlog.ts`, `bloqueos.ts`, `carga.ts`, `terminadas.ts`, `administracion.ts`,
`panorama.ts`; `src/principal/comandos/reductor.ts` (sección de sprints y sus ayudantes);
`tests/apoyo/constructores.ts`, `tests/apoyo/generador.ts`, y las suites de `tests/dominio/`
y `tests/comandos/`.

---

### M4 · El dominio entiende cinco estados
**Estado:** ⬜ pendiente — **la más urgente del plan** · **Agente:** `backend` + `qa` · **Tamaño:** G · **Depende de:** M3 (mismos archivos, en serie)

> **Ya no es preventiva, es un defecto en curso.** M2 metió `en_pruebas` y `terminado` en el
> modelo y `cambiarEstado` los acepta, pero `contarTareas` (`derivar.ts:98-111`) sigue con
> cuatro casos y `hojas = hechas + enCurso + pendientes` (`:114`): esas tareas **se caen del
> denominador**. Medido contra el dominio real: cuatro tareas —una de cada— devuelven
> `hojas: 2` y `pct: 50`, cuando lo honesto es 1 de 4. Es el `0%` de la regla 2 con otra
> ropa. Mientras M4 no cierre, esos dos estados no se deben usar.

**Lo primero de la etapa es volver exhaustivo el `switch` de `contarTareas`.** Hoy tiene
cuatro casos, sin `default` y sin chequeo: un estado nuevo **no da error de tipos**, cae
fuera de `hojas = hechas + enCurso + pendientes` y **la tarea desaparece del porcentaje sin
fallar y sin avisar**. Es el mismo modo de fallo que el `0%` que persigue la regla 2. Con el
chequeo, el compilador nombra cada sitio; sin él, lo hacen los datos, tarde.

Después: `estaAbierta` incluye `iniciado`, `en_pruebas` y `terminado`; `estaHecha` es
`done`; el verde y el 100% exigen `done`; `ORDEN_ESTADO` del backlog pasa a seis.

**El menú de fila y la regla 19.** El `⋯` tiene techo duro de ocho ítems y hoy tiene
exactamente ocho. Cinco estados lo llevarían a doce. Se resuelve así: la fila conserva **un**
ítem de estado, `Avanzar` (Espacio, sin ciclo, se detiene en `done`), más `Cancelar`, que ya
está. **El pipeline completo se pone arrastrando en el tablero (M10) o desde el detalle
(M11)** — que además le da al tablero su razón de ser.

**Terminado cuando:** añadir un séptimo estado al enum **rompe la compilación** en vez de
desaparecer del porcentaje; una tarea en `terminado` no es verde ni sube el porcentaje; una
en `en_pruebas` cuenta como abierta en la carga y aparece en el backlog; el menú de fila
sigue teniendo **ocho ítems o menos**, verificado por una prueba; el archivo de oro
regenerado **con su diff leído y explicado línea por línea** — regenerarlo sin leerlo
destruye la única red que detecta un conteo que cambió en silencio.

**Archivos:** `src/compartido/dominio/derivar.ts`, `clasificar.ts`, `cierre.ts`, `backlog.ts`,
`carga.ts`, `terminadas.ts`, `panorama.ts`; `src/principal/comandos/reductor.ts` y `tipos.ts`;
`src/renderer/util/presentacion.ts`, `src/renderer/vistas/proyecto/Arbol.tsx` (el menú y el
ciclo); `tests/modelo/oro-documento-real.test.ts` y las suites de dominio y comandos.

---

### M5 · El reloj de tramos
**Estado:** ⬜ pendiente · **Agente:** `backend` + `qa` · **Tamaño:** G · **Depende de:** M4 (mismos archivos, en serie)

> **Lo que se verificó el 2026-08-28, y confirma que M5 no ha empezado.** El reloj de tramos
> está construido **entero del lado lector y vacío del lado escritor**. Existen el modelo
> (`esquema.ts:166-181`, `EsquemaTramoTrabajo`), la validación (`esquema.ts:239-245`), el
> cálculo (`duracion.ts:88-108`) y la pantalla (`HojaDetalle.tsx:385-400`). Lo que **no**
> existe es nadie que escriba un tramo: las dos únicas escrituras de `tarea.trabajo` en todo
> `src/` lo inicializan a `[]` —`reductor.ts:831` en `crearTarea` y
> `migraciones/index.ts:104` en la migración— y `cambiarEstado` (`reductor.ts:946-972`) solo
> toca `estado` y `aceptada_en`: no abre ni cierra un tramo con ningún estado.
> **Consecuencia medida:** `tiempoEnDesarrollo` devuelve `{dias: null, tramos: 0}` para todo
> el documento y la vista Tiempos dice «Sin tramos cerrados» a perpetuidad. Comprobado
> también sobre el archivo real del usuario —tres tareas en `iniciado`, las tres con
> `trabajo: []`— y sobre `datos/ejemplo.json` y `datos/semilla.json`.
> **Esto es exactamente el alcance de esta etapa**, y el productor de tramos es su primera
> línea de código, no la última.

`duracion.ts` se reescribe entero. Mueren `arranqueDelSprint`, `arranqueEfectivo` y
`sprintDelCierre`, y con ellos los tres defectos que ese anclaje produjo. Nacen: suma de
tramos, desglose desarrollo/pruebas, y tiempo trabajado contra tiempo de calendario.
El reductor abre y cierra tramos en `cambiarEstado`, en un solo sitio, con un predicado
`esTrabajo(estado)` de una línea.

**Terminado cuando:** una tarea que va `iniciado → terminado → iniciado → terminado` suma
**dos tramos** y su duración es la suma, no `fin − inicio`; una tarea cerrada **fuera de todo
sprint** ahora **sí** tiene duración; un documento con dos tramos abiertos se rechaza; una
tarea sin tramos da `null`, **jamás `0`**; ningún promedio de menos de cinco tareas se
muestra y todos dicen sobre cuántas se calcularon; un tramo abierto por encima del umbral se
presenta como «corriendo desde hace N días» y **no entra en ningún promedio**;
`tests/dominio/duracion.test.ts` rehecho, incluidas invariantes sobre los árboles generados.

**Archivos:** `src/compartido/dominio/duracion.ts` (reescritura),
`src/principal/comandos/reductor.ts` (`cambiarEstado`),
`src/renderer/vistas/globales/VistaTiempos.tsx`, `tests/dominio/duracion.test.ts`,
`tests/apoyo/generador.ts`.

---

### M6 · Equipos: entidad, comandos y vista
**Estado:** 🟡 modelo sí, comandos y vista no · **Agente:** `backend` + `frontend` · **Tamaño:** M · **Depende de:** M2 (en serie tras M5 por `reductor.ts`)

*La migración de M2 ya dejó `proyecto.equipos` con un equipo «General» por proyecto,
`responsabilidades` y `capacidad`. Lo que falta es todo lo que hace de esto una entidad de
tres niveles: `editarEquipo` escribe solo sobre `equipos[0]` (`reductor.ts:1436-1443`), y
`SeccionEquipos.tsx:6-8` todavía declara que «no hay entidad equipo con identidad propia».*

Comandos nuevos: `crearEquipo`, `editarEquipo`, `eliminarEquipo`, `moverMiembro`,
`asignarEquipo` (a una tarea). La vista de Equipos —la única que hay, y sigue siendo única—
pasa a mostrar proyecto → equipos → miembros con responsabilidades y capacidad.

**Terminado cuando:** un proyecto puede tener dos equipos y cada uno sus miembros; la misma
persona está en equipos de dos proyectos distintos y aparece **una sola vez** en su ficha,
con las dos adscripciones; la ficha de persona conserva la adscripción **en solo lectura**;
eliminar un equipo con tareas asignadas avisa con el conteo y no las deja apuntando a un id
inexistente; la migración «General» se ve en pantalla y se puede partir a mano sin perder
ningún `rol`; `⌘Z` revierte cada comando nuevo.

**Archivos:** `src/principal/comandos/reductor.ts` y `tipos.ts`,
`src/compartido/dominio/carga.ts` (`equiposDe`), `administracion.ts`,
`src/renderer/vistas/administracion/SeccionEquipos.tsx`, `SeccionPersonas.tsx`,
`src/renderer/estado/`, `tests/comandos/personas.test.ts` y una suite nueva de equipos.

---

### M7 · Cada proyecto gestiona su sprint
**Estado:** 🟡 el fondo sí, el conmutador no · **Agente:** `frontend` · **Tamaño:** M · **Depende de:** M3 **y de la decisión G1** · **Paralelo con M8**

`PanelSprint` pierde el conmutador «Solo este proyecto / Todo el sprint» —existía porque el
sprint cruzaba once proyectos— y gana planear, activar y cerrar el sprint **de su** proyecto.

**Estado real:** planear, activar y cerrar por proyecto **ya están** (commit `9d6e8f8`). Lo
que queda de esta etapa es el conmutador, vivo en `PanelSprint.tsx:107` a través de
`filasDeProyecto`, y con él se cierra el punto 2 del recorte de M3.

**Antes de tocarla hay que decidir G1** —la ceremonia de once cierres, sección 4 punto 1—,
porque es lo que decide si esta pantalla gana un botón de cierre o lo pierde en favor de una
pantalla de cierre en lote. **Y aquí es donde encaja la retrospectiva** si se toma la
recomendación del punto 3 de la sección 4: el comando y la pantalla ya existen y solo les
falta ficha.

**Terminado cuando:** abres SICOE y SIES, activas un sprint en cada uno **con fechas
distintas**, arrastras una tarea a cada uno, cierras la app, la reabres y los dos siguen ahí;
el panel de SICOE no muestra ni una tarea de SIES; cerrar el de SICOE no toca el de SIES ni
le arrastra nada.

**Archivos:** `src/renderer/vistas/proyecto/PanelSprint.tsx`, `VistaProyecto.tsx`,
`FormularioCompromiso.tsx`, `src/renderer/estado/acciones-sprint.ts`, `acciones-cierre.ts`,
`src/renderer/vistas/cierre/`.

---

### M8 · Sprint general derivado
**Estado:** 🟡 empezada · **Agente:** `frontend` + `data` · **Tamaño:** G · **Depende de:** M3, M6 · **Paralelo con M7**

`VistaSprintGlobal` deja de leer «el sprint activo» y pasa a agregar los sprints activos y
planeados **por persona y por equipo**, diciendo su ventana en voz alta y muriendo cuando
todos cierran.

**Terminado cuando:** con tres sprints de fechas distintas la vista dice el rango real y
cuántos agrega; con tres sprints alineados lo lee como una sola ventana; una persona que está
en dos proyectos aparece **una** vez con su total y su desglose; al cerrar el último sprint
la vista **no queda en blanco**: ofrece las tres salidas (proyectos con backlog y sin sprint,
ir al backlog del área, y lo último que cerró con lo que quedó arrastrado); en cuanto hay un
sprint **planeado**, la vista vuelve sola sin que nadie pulse nada.

**Archivos:** `src/renderer/vistas/globales/VistaSprintGlobal.tsx`,
`src/compartido/dominio/sprint.ts` (la agregación), `src/renderer/vistas/globales/piezas.tsx`,
`tests/dominio/vistas-globales.test.ts`.

---

### M9 · Capacidad
**Estado:** ⬜ pendiente · **Agente:** `data` + `frontend` · **Tamaño:** M · **Depende de:** M6, M8 · **Paralelo con M10, M11**

**Terminado cuando:** un equipo con 3 de 8 tareas estimadas **no** muestra barra ni
porcentaje, muestra «3 de 8 estimadas · faltan 5»; con 8 de 8 muestra «21 de 30 pts · 8 de 8
tareas»; la capacidad del equipo es **la suma de sus miembros y no está persistida en ningún
sitio** —una prueba estructural falla si aparece en el JSON—; una persona en dos equipos
muestra su capacidad declarada en cada uno y el total; lo que está en `terminado` se presenta
en su propia línea («8 abiertas · 3 esperando aceptación») y **no sumado en silencio**;
ninguna pantalla dice porcentaje de ocupación, «le da tiempo» ni una fecha; a partir de tres
sprints cerrados aparece la mediana real al lado de la capacidad declarada.

**Archivos:** `src/compartido/dominio/carga.ts`, `src/renderer/vistas/globales/VistaCarga.tsx`,
`src/renderer/componentes/Medidor.tsx`, `tests/dominio/carga.test.ts`, `carga-vistas.test.ts`.

---

### M10 · El tablero por equipo
**Estado:** ⬜ pendiente · **Agente:** `frontend` + `ux` · **Tamaño:** G · **Depende de:** M4, MB, M6 · **Paralelo con M9, M11**

Columnas del pipeline, tarjeta de equipo con su avance agregado, tarjetas de tarea dentro,
bloqueo y captura de errores.

**Dos cosas que el modelo impone y no son negociables:**
- **Una tarea no tiene progreso** (regla 1): su avance *es* su estado, un glifo, no una
  barra. El progreso agregado va en la **cabecera del equipo** («6 de 14 · 3 en pruebas · 2
  bloqueadas»), con su conteo crudo al lado (regla 3).
- **`bloqueada` no entra al enum.** Ya es un valor derivado
  (`estaBloqueada = estaAbierta && bloqueoAbierto !== null`). La tarjeta **se queda en su
  columna** con banda de bloqueo, y «bloqueadas» es un contador con filtro en la cabecera. Si
  se moviera a una columna propia, las columnas dejarían de sumar el total y una tarea
  bloqueada perdería su fase en pantalla — la misma clase de mentira que un denominador mal
  puesto.

**Terminado cuando:** arrastrar una tarjeta entre columnas cambia el estado y `⌘Z` lo
revierte; **las columnas suman el total del grupo**; bloquear desde el tablero usa el
**mismo** comando `bloquear` que la tecla `B`, verificado por una prueba que lee el código
—como la que ya vigila la ceremonia de borrar proyecto—; capturar un error deja
`tipo: 'error'` y se puede contar «cuántas de las de este sprint eran errores»; una tarea con
responsable fuera de su equipo se señala **sin** rechazar nada; la vista sigue usable con un
documento sembrado de **mil** filas y el número está publicado al pie, como ya hace
`VistaBacklog`.

**Archivos:** `src/renderer/vistas/globales/VistaTablero.tsx` (nuevo) y sus piezas,
`src/compartido/dominio/backlog.ts` (agrupación por equipo),
`src/renderer/vistas/globales/VistaBacklog.tsx`, `tests/dominio/backlog.test.ts`,
`tests/interfaz/`.

---

### M11 · Detalle de tarea
**Estado:** 🟡 en curso, sin commitear · **Agente:** `frontend` · **Tamaño:** M · **Depende de:** M4, M5 · **Paralelo con M9, M10**

*Empezó antes que sus dos dependencias, contra el orden del carril 1. Se nota: la hoja de
detalle pinta el reloj y solo puede decir «Sin tramos cerrados», porque M5 no existe.*

Descripción, **criterios de aceptación como texto** (**N18**: casillas serían sub-tareas con
estado propio, contra la regla 1), estado, equipo, esfuerzo y bloqueo con su motivo.

**Terminado cuando:** abres una tarea, ves y editas todo lo anterior, y sobrevive al
reinicio; un campo desconocido escrito a mano en esa tarea **sigue ahí** después de editarla;
el estado se cambia por **el mismo camino** que el tablero y la tecla, no por uno paralelo
—prueba que lee el código—; el panel muestra los tramos del reloj en lenguaje llano
(«2.5 días en desarrollo · 11 de calendario»), y dice «corriendo» si hay uno abierto.

**Archivos:** `src/renderer/componentes/DetalleTarea.tsx` (nuevo),
`src/renderer/vistas/proyecto/Arbol.tsx` (la entrada), `src/renderer/estado/mutaciones.ts`,
`tests/interfaz/`.

---

### M12 · Panorama
**Estado:** ⬜ pendiente · **Agente:** `frontend` + `data` · **Tamaño:** M · **Depende de:** M5, M9, M10

**Terminado cuando:** por proyecto se ve avance con su conteo crudo, **sprint vencido y
todavía abierto** si lo hay («SIES · terminó hace 6 días y sigue abierto»), **cuántas esperan
aceptación y desde cuándo** («7 esperando, la más vieja hace 9 días»), cobertura de
estimación («SICOE · 4 de 19 estimadas») y errores abiertos; **cero gráficas**, cero índices
0-100, cero fechas estimadas; y la pantalla sigue diciendo en voz alta qué no sostiene.

**Archivos:** `src/compartido/dominio/panorama.ts`,
`src/renderer/vistas/globales/VistaPanorama.tsx`, `tests/dominio/panorama.test.ts`.

---

## 4 · Lo que no pediste y hace falta

Cuatro —la tercera se añadió el 2026-08-28—, cada una justificada contra lo que la app ya
hace. Las otras dos de la ronda anterior se disolvieron: la ventana del sprint general la
resolvió N15, y la espera de aceptación ya está dentro de M12.

1. **Un sprint por proyecto multiplica por once la ceremonia de abrir y cerrar.**
   Cerrar un sprint hoy es una pantalla entera con una decisión por tarea. Hacerlo once veces
   cada dos semanas es, con diferencia, **la razón número uno por la que dejarías de usar la
   app**. Hace falta una de dos: cierre en lote desde una sola pantalla, o cadencia por
   proyecto (duración y día de inicio) que cree el siguiente solo. **No está en ninguna
   etapa: decídelo antes de M7**, porque es donde encaja sin rehacer nada.

   **Sigue sin decidir y sin etapa al 2026-08-28, y ahora bloquea de verdad:** M7 ya está
   empezada. La disyuntiva, en una línea cada una:
   **(a) cierre en lote** — una pantalla que cierra los once de un tirón: más trabajo de
   interfaz, cero campos nuevos, una sola ceremonia y tú decides cada vez;
   **(b) cadencia por proyecto** — duración y día de inicio guardados por proyecto y el
   siguiente sprint nace solo: menos interfaz, pero un campo nuevo en el esquema (otra
   migración, ya no gratis) y un automatismo que tiene que poder apagarse.
   *No la decido yo.* Lo que sí digo es el costo: (b) era barata cuando M2 estaba abierta y
   ahora cuesta una migración propia.

2. **La cobertura de estimación tiene que verse fuera de la vista de capacidad.**
   Vas a mirar «34 pts» y no «12 de 18». Por eso está en M12 como señal por proyecto: es la
   única forma de saber si la capacidad de esta semana significa algo. Sin ella, la capacidad
   se convierte en el índice de salud 0-100 que está prohibido desde el día uno.

3. **La retrospectiva ya está construida y ningún plan la registra.** No es un hueco de
   producto: es un hueco de tablero. `escribirRetrospectiva` existe como comando aparte de
   `editarSprint`, tal como manda la regla 8 (`tipos.ts:513`, `reductor.ts:1318`); se ofrece
   al cerrar (`vistas/cierre/ResumenCierre.tsx:130`), se lee en Terminadas
   (`VistaTerminadas.tsx:176`) y tiene pruebas propias
   (`tests/interfaz/retrospectiva.test.tsx`, `tests/comandos/sprints-por-proyecto.test.ts:127-190`).
   Commits `2176c4f` y `6c21435`. **Lo único que falta decidir es dónde queda registrada:**
   ficha propia con efecto retroactivo, anexo a M7, o entrega fuera de plan anotada solo en
   bitácora. *Recomendación:* **anexo a M7** — cerrar un sprint y escribir su retro son la
   misma pantalla, y M7 es la etapa del cierre por proyecto.

4. **El archivo de oro se regenera una vez y se lee entero.**
   `tests/modelo/oro-documento-real.test.ts` congela 1037 líneas y es el mecanismo que probó
   que N9 no rompía nada. Con sprints por proyecto, seis estados y tramos, **cambia porque
   debe cambiar** — y ahí está el peligro: borrarlo y regenerarlo sin leerlo destruye la única
   red que detecta un conteo que se movió en silencio. Está escrito como criterio de M4.

---

## 5 · Qué NO hacer

1. ~~**No captures los 11 proyectos hasta que M2 esté cerrada.**~~ **[CUMPLIDA — M2 cerró
   el 2026-08-27]** Ya puedes capturar. El aviso que la sustituye es más chico: no uses
   `en_pruebas` ni `terminado` hasta que cierre M4, porque hoy esas tareas se caen del
   denominador del avance.
2. **No hagas M3, M4 y M5 en la misma etapa ni en paralelo.** Tocan los mismos archivos y las
   mismas suites; juntos, ninguna prueba roja dice cuál de los tres cambios la rompió.
3. **No metas `bloqueado` en el enum de estado.** Obliga a guardar el estado anterior en otro
   campo para saber a qué volver: es reinventar la bandera con otro nombre y con un glifo más
   que validar.
4. **No persistas la capacidad del equipo.** Es la suma de sus miembros, y persistir un valor
   derivado está prohibido por la primera línea de la sección Prohibido.
5. **No conviertas la capacidad en pronóstico ni en porcentaje de ocupación.**
6. **No adivines los equipos en la migración** partiendo el `rol`. Una migración que adivina
   es una migración que miente: «General» y los partes tú con la app abierta.
7. **No reconstruyas tramos hacia atrás.** Lo cerrado antes del cambio no tiene tiempo
   trabajado y no lo va a tener nunca. Inventarlo sería peor que la casilla vacía.
8. **No llames «horas trabajadas» al reloj.** Mide tiempo en desarrollo sin las pausas de
   revisión, en días con un decimal. La app no sabe a qué hora te fuiste a casa.
9. **No construyas un segundo camino para bloquear ni para cambiar de estado.** Tablero,
   detalle y teclado llaman al mismo comando, con una prueba que lo vigile leyendo el código.
10. **No añadas más confirmaciones que la de N16.** Con dos, cada nueva devalúa a las dos.
11. **No le añadas al error severidad, componentes, versiones ni comentarios.** Solo el tipo.
12. **No virtualices el backlog «por si acaso».** El documento real tiene 35 filas y la vista
    publica ese número al pie precisamente para revisar la decisión con un dato.
13. **No toques `connect-src 'none'` ni metas una librería de gráficas.**

---

## 6 · Lo que sigue abierto

Ya no son decisiones de diseño: son supuestos míos que cuestan poco corregir ahora y caro
después.

| | Supuesto | Cuándo caduca |
|---|---|---|
| **S1** | El reloj corre en `iniciado` **y** en `en_pruebas`, y se para en `terminado`. Con el estado dentro del tramo, cambiarlo es una línea y **no cuesta migración** | Antes de M5 |
| **S2** | `terminado` lo marca quien ejecuta y `done` quien acepta; tú escribes los dos porque la app sigue siendo de un solo escritor | Antes de M4 |
| **S3** | Las responsabilidades son texto libre. Se promueven a catálogo el día que la app necesite ramificar según el valor, y ese día se escribe en `docs/PLAN.md` | Antes de M6 |
| **S4** | `MINIMO_COBERTURA_PARA_PUNTOS = 0.8`, revisable con datos tras dos sprints | Antes de M9 |
| **S5** | El id de equipo es legible a mano (`sicoe-frontend`), sin contador, como el de persona | Antes de M2 |
| **S6** | La cadencia de sprint por proyecto (punto 1 de la sección 4) se decide antes de M7 | Antes de M7 — **vencido: M7 ya empezó y sigue sin decidirse** |

---

## Riesgos

| Riesgo | Señal temprana | Qué hacer |
|---|---|---|
| La ceremonia de once sprints te hace abandonar la app | El segundo lunes cierras 3 de 11 y dejas el resto abiertos | Cierre en lote o cadencia automática, decidido **antes de M7** |
| Un tramo abierto para siempre convierte el reloj en calendario | Un promedio salta a decenas de días de un sprint al siguiente | La guarda de M5: el tramo abierto por encima del umbral no entra en ningún promedio |
| El tablero se llena de `terminado` y el avance no sube | Más de cinco esperando aceptación con más de una semana | La señal de M12, y mirarla los lunes. El cuello serías tú, no el equipo |
| Los siete glifos no se distinguen | MB no cierra en dos intentos | `terminado` y `done` comparten forma y se separan con un chip. No se amplían las siluetas |
| El cambio de esquema se estira y para todo | La discusión de M2 pasa de un día | Congelar sprints, estados y tramos; dejar equipos para una v3 **aceptando una segunda migración** — y solo entonces |
| La migración se lleva algo en silencio | El diff del archivo de oro tiene líneas que nadie sabe explicar | M1 congela la evidencia; M4 exige leer el diff entero |
| Dos agentes se pisan en `reductor.ts` | Un conflicto que compila y no rompe ninguna prueba | Los tres carriles de la sección 3. El carril 1 es estrictamente en serie |

## Fuera de esta ronda, deliberadamente

Consultas tipo JQL (`docs/IDEAS.md` sigue siendo la nota buena) · gráficas de cualquier tipo ·
burndown, velocidad y fecha estimada · sincronización con Jira · severidad, componentes y
comentarios en los errores · sub-tareas con estado propio · multiusuario para que otro marque
`done` · catálogo cerrado de responsabilidades · virtualización del backlog · firmar el `.app`
(N10 sigue vigente).
